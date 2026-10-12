import type { INestApplication } from '@nestjs/common';
import {
  InstitutionCategory,
  InstitutionStatus,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import type { PrismaService } from '../src/database/prisma.service';
import { api, createTestApp, registerAndLogin, resetDatabase } from './helpers';

/**
 * THE MOST IMPORTANT TEST IN THIS CODEBASE.
 *
 * EduHub is multi-tenant SaaS. A member of Institution A must never reach
 * Institution B's data by any route: guessing an id, injecting a body field,
 * or exploiting a missing WHERE clause. Every test below is a breach if it
 * fails, not a bug.
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let alphaId: string;
  let betaId: string;
  let alice: { userId: string; accessToken: string }; // admin of Alpha
  let bob: { userId: string; accessToken: string }; // admin of Beta
  let carol: { userId: string; accessToken: string }; // student at Alpha
  let outsider: { userId: string; accessToken: string }; // no memberships
  let alphaMembershipId: string;
  let betaMembershipId: string;

  const institution = (name: string, slug: string) => ({
    id: uuidv7(),
    name,
    slug,
    category: InstitutionCategory.SCHOOL,
    countryCode: 'GB',
    status: InstitutionStatus.PUBLISHED,
  });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);

    const alpha = institution('Alpha Academy', 'alpha-academy');
    const beta = institution('Beta Institute', 'beta-institute');
    await prisma.institution.createMany({ data: [alpha, beta] });
    alphaId = alpha.id;
    betaId = beta.id;

    alice = await registerAndLogin(app, 'alice@tenant.test', 'Alice');
    bob = await registerAndLogin(app, 'bob@tenant.test', 'Bob');
    carol = await registerAndLogin(app, 'carol@tenant.test', 'Carol');
    outsider = await registerAndLogin(app, 'outsider@tenant.test', 'Outsider');

    const [aliceM, bobM] = await Promise.all([
      prisma.institutionMembership.create({
        data: {
          id: uuidv7(),
          userId: alice.userId,
          institutionId: alphaId,
          role: MembershipRole.INSTITUTION_ADMIN,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      }),
      prisma.institutionMembership.create({
        data: {
          id: uuidv7(),
          userId: bob.userId,
          institutionId: betaId,
          role: MembershipRole.INSTITUTION_ADMIN,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      }),
    ]);
    alphaMembershipId = aliceM.id;
    betaMembershipId = bobM.id;

    await prisma.institutionMembership.create({
      data: {
        id: uuidv7(),
        userId: carol.userId,
        institutionId: alphaId,
        role: MembershipRole.STUDENT,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('read isolation', () => {
    it('lets an admin list their own institution members', async () => {
      const res = await api(app)
        .get(`/api/v1/institutions/${alphaId}/memberships`)
        .set(bearer(alice.accessToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((m: { institutionId: string }) => m.institutionId);
      expect(new Set(ids)).toEqual(new Set([alphaId]));
    });

    it('BREACH IF FAILING: denies Alice access to Beta members', () =>
      api(app)
        .get(`/api/v1/institutions/${betaId}/memberships`)
        .set(bearer(alice.accessToken))
        .expect(404));

    it('BREACH IF FAILING: denies Bob access to Alpha members', () =>
      api(app)
        .get(`/api/v1/institutions/${alphaId}/memberships`)
        .set(bearer(bob.accessToken))
        .expect(404));

    it('returns 404 rather than 403, so tenant existence is not disclosed', async () => {
      const foreign = await api(app)
        .get(`/api/v1/institutions/${betaId}/memberships`)
        .set(bearer(alice.accessToken));
      const nonExistent = await api(app)
        .get(`/api/v1/institutions/${uuidv7()}/memberships`)
        .set(bearer(alice.accessToken));

      // Identical responses: an attacker cannot distinguish "exists but
      // forbidden" from "does not exist".
      expect(foreign.status).toBe(404);
      expect(nonExistent.status).toBe(404);
      expect(foreign.body.error.message).toEqual(nonExistent.body.error.message);
    });

    it('BREACH IF FAILING: a known membership id is not readable through another tenant path', () =>
      api(app)
        .get(`/api/v1/institutions/${betaId}/memberships/${alphaMembershipId}`)
        .set(bearer(bob.accessToken))
        .expect(404));

    it('BREACH IF FAILING: an admin cannot read a foreign membership id via their own tenant path', () =>
      api(app)
        .get(`/api/v1/institutions/${alphaId}/memberships/${betaMembershipId}`)
        .set(bearer(alice.accessToken))
        .expect(404));

    it('denies a user with no membership anywhere', () =>
      api(app)
        .get(`/api/v1/institutions/${alphaId}/memberships`)
        .set(bearer(outsider.accessToken))
        .expect(404));

    it('denies an authenticated STUDENT the admin-only member list', () =>
      api(app)
        .get(`/api/v1/institutions/${alphaId}/memberships`)
        .set(bearer(carol.accessToken))
        .expect(404));

    it('denies unauthenticated access', () =>
      api(app).get(`/api/v1/institutions/${alphaId}/memberships`).expect(401));
  });

  describe('write isolation', () => {
    it('BREACH IF FAILING: rejects institutionId injected into the request body', async () => {
      const res = await api(app)
        .post(`/api/v1/institutions/${alphaId}/memberships`)
        .set(bearer(alice.accessToken))
        .send({ userId: outsider.userId, role: 'STUDENT', institutionId: betaId })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      // The write must not have landed in EITHER tenant.
      const leaked = await prisma.institutionMembership.count({
        where: { userId: outsider.userId },
      });
      expect(leaked).toBe(0);
    });

    it('BREACH IF FAILING: Bob cannot create a membership inside Alpha', () =>
      api(app)
        .post(`/api/v1/institutions/${alphaId}/memberships`)
        .set(bearer(bob.accessToken))
        .send({ userId: outsider.userId, role: 'STUDENT' })
        .expect(404));

    it('writes are scoped to the tenant from the verified membership', async () => {
      const res = await api(app)
        .post(`/api/v1/institutions/${alphaId}/memberships`)
        .set(bearer(alice.accessToken))
        .send({ userId: outsider.userId, role: 'STUDENT' })
        .expect(201);

      expect(res.body.data.institutionId).toBe(alphaId);
    });

    it('denies a STUDENT the admin-only create operation', () =>
      api(app)
        .post(`/api/v1/institutions/${alphaId}/memberships`)
        .set(bearer(carol.accessToken))
        .send({ userId: bob.userId, role: 'STUDENT' })
        .expect(404));
  });

  describe('platform-role escalation', () => {
    it('BREACH IF FAILING: a tenant admin cannot create institutions platform-wide', () =>
      api(app)
        .post('/api/v1/institutions')
        .set(bearer(alice.accessToken))
        .send({ name: 'Rogue School', category: 'SCHOOL', countryCode: 'GB' })
        .expect(403));

    it('grants a platform admin explicit cross-tenant access', async () => {
      await prisma.user.update({
        where: { id: outsider.userId },
        data: { platformRole: PlatformRole.PLATFORM_ADMIN },
      });

      // Re-login: the platform role is read from the database on every
      // request, so the change must take effect immediately.
      const login = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'outsider@tenant.test', password: 'ValidPass123' })
        .expect(200);

      await api(app)
        .get(`/api/v1/institutions/${betaId}/memberships`)
        .set(bearer(login.body.data.accessToken))
        .expect(200);
    });
  });
});
