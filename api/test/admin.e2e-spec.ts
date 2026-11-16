import type { INestApplication } from '@nestjs/common';
import { InstitutionCategory, InstitutionStatus, PlatformRole, UserStatus } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import type { PrismaService } from '../src/database/prisma.service';
import { api, createTestApp, registerAndLogin, resetDatabase } from './helpers';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Covers the two administration surfaces the super-admin UI is built on:
 * the institution publication lifecycle and platform user moderation.
 */
describe('Platform administration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const PASSWORD = 'ValidPass123';

  /** Registers, promotes to `role`, then re-logs in so the token is current. */
  async function staffToken(
    email: string,
    role: PlatformRole,
  ): Promise<{ userId: string; accessToken: string }> {
    const { userId } = await registerAndLogin(app, email, 'Staff', PASSWORD);
    await prisma.user.update({ where: { id: userId }, data: { platformRole: role } });
    const relogin = await api(app)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { userId, accessToken: relogin.body.data.accessToken };
  }

  function makeInstitution(status: InstitutionStatus) {
    const id = uuidv7();
    return prisma.institution.create({
      data: {
        id,
        name: `Lifecycle ${id.slice(0, 8)}`,
        slug: `lifecycle-${id.slice(0, 8)}`,
        category: InstitutionCategory.SCHOOL,
        countryCode: 'GB',
        status,
      },
    });
  }

  describe('PATCH /institutions/:id/status', () => {
    let adminToken: string;
    let userToken: string;

    beforeEach(async () => {
      await resetDatabase(prisma);
      adminToken = (await staffToken('lifecycle.admin@adm.test', PlatformRole.PLATFORM_ADMIN))
        .accessToken;
      userToken = (await registerAndLogin(app, 'lifecycle.user@adm.test', 'User', PASSWORD))
        .accessToken;
    });

    it('BREACH IF FAILING: an ordinary user cannot publish anything', async () => {
      const inst = await makeInstitution(InstitutionStatus.DRAFT);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(userToken))
        .send({ status: 'PUBLISHED' })
        .expect(403);

      const after = await prisma.institution.findFirstOrThrow({ where: { id: inst.id } });
      expect(after.status).toBe(InstitutionStatus.DRAFT);
    });

    it('rejects an anonymous caller', async () => {
      const inst = await makeInstitution(InstitutionStatus.DRAFT);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .send({ status: 'PUBLISHED' })
        .expect(401);
    });

    it('publishes a draft and stamps verifiedAt', async () => {
      const inst = await makeInstitution(InstitutionStatus.DRAFT);
      expect(inst.verifiedAt).toBeNull();

      const res = await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(adminToken))
        .send({ status: 'published' }) // lower case is normalised
        .expect(200);

      expect(res.body.data.status).toBe(InstitutionStatus.PUBLISHED);
      expect(res.body.data.verifiedAt).not.toBeNull();
    });

    it('makes a published institution visible to anonymous callers', async () => {
      const inst = await makeInstitution(InstitutionStatus.DRAFT);

      await api(app).get(`/api/v1/institutions/${inst.slug}`).expect(404);

      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(adminToken))
        .send({ status: 'PUBLISHED' })
        .expect(200);

      await api(app).get(`/api/v1/institutions/${inst.slug}`).expect(200);
    });

    it('does not re-stamp verifiedAt when re-published', async () => {
      const inst = await makeInstitution(InstitutionStatus.PUBLISHED);
      const stamped = new Date('2026-01-01T00:00:00Z');
      await prisma.institution.update({
        where: { id: inst.id },
        data: { verifiedAt: stamped },
      });

      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED' })
        .expect(200);
      const res = await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(adminToken))
        .send({ status: 'PUBLISHED' })
        .expect(200);

      // Approval is a historical fact, not a current state.
      expect(new Date(res.body.data.verifiedAt as string)).toEqual(stamped);
    });

    it('rejects a transition that is not on the allow-list', async () => {
      const inst = await makeInstitution(InstitutionStatus.DRAFT);
      const res = await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED' })
        .expect(400);

      expect(res.body.error.message).toContain('Cannot go from DRAFT to SUSPENDED');
    });

    it('rejects a no-op transition', async () => {
      const inst = await makeInstitution(InstitutionStatus.PUBLISHED);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(adminToken))
        .send({ status: 'PUBLISHED' })
        .expect(400);
    });

    it('points ARCHIVED at the delete endpoint instead', async () => {
      const inst = await makeInstitution(InstitutionStatus.PUBLISHED);
      const res = await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(adminToken))
        .send({ status: 'ARCHIVED' })
        .expect(400);

      expect(res.body.error.message).toContain('DELETE /institutions/:id');
      // Must not have half-applied: ARCHIVED without deletedAt would keep the
      // slug reserved and leave the row in staff listings.
      const after = await prisma.institution.findFirstOrThrow({ where: { id: inst.id } });
      expect(after.status).toBe(InstitutionStatus.PUBLISHED);
      expect(after.deletedAt).toBeNull();
    });

    it('rejects an unknown status value', async () => {
      const inst = await makeInstitution(InstitutionStatus.DRAFT);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(adminToken))
        .send({ status: 'LIVE' })
        .expect(400);
    });

    it('404s for an institution that does not exist', () =>
      api(app)
        .patch(`/api/v1/institutions/${uuidv7()}/status`)
        .set(bearer(adminToken))
        .send({ status: 'PUBLISHED' })
        .expect(404));

    it('still refuses status on the general PATCH route', async () => {
      const inst = await makeInstitution(InstitutionStatus.DRAFT);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}`)
        .set(bearer(adminToken))
        .send({ status: 'PUBLISHED' })
        .expect(400);
    });
  });

  describe('GET /users', () => {
    let adminToken: string;
    let userToken: string;

    beforeEach(async () => {
      await resetDatabase(prisma);
      adminToken = (await staffToken('list.admin@adm.test', PlatformRole.PLATFORM_ADMIN)).accessToken;
      userToken = (await registerAndLogin(app, 'list.user@adm.test', 'Ada Lovelace', PASSWORD))
        .accessToken;
      await registerAndLogin(app, 'list.other@adm.test', 'Grace Hopper', PASSWORD);
    });

    it('BREACH IF FAILING: an ordinary user cannot list the user base', () =>
      api(app).get('/api/v1/users').set(bearer(userToken)).expect(403));

    it('rejects an anonymous caller', () => api(app).get('/api/v1/users').expect(401));

    it('never returns credential material', async () => {
      const res = await api(app).get('/api/v1/users').set(bearer(adminToken)).expect(200);

      expect(res.body.data.length).toBe(3);
      expect(JSON.stringify(res.body)).not.toContain('argon2');
      for (const user of res.body.data) {
        expect(user.passwordHash).toBeUndefined();
        expect(user.tokenVersion).toBeUndefined();
      }
    });

    it('searches on email and full name', async () => {
      const byName = await api(app)
        .get('/api/v1/users?search=grace')
        .set(bearer(adminToken))
        .expect(200);
      expect(byName.body.data.map((u: { email: string }) => u.email)).toEqual([
        'list.other@adm.test',
      ]);

      const byEmail = await api(app)
        .get('/api/v1/users?search=list.admin')
        .set(bearer(adminToken))
        .expect(200);
      expect(byEmail.body.data).toHaveLength(1);
    });

    it('filters by platform role and paginates', async () => {
      const res = await api(app)
        .get('/api/v1/users?platformRole=platform_admin')
        .set(bearer(adminToken))
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].platformRole).toBe('PLATFORM_ADMIN');
      expect(res.body.meta.pagination.total).toBe(1);
    });

    it('reports platform-wide stats', async () => {
      const res = await api(app).get('/api/v1/users/stats').set(bearer(adminToken)).expect(200);
      expect(res.body.data).toEqual({ total: 3, active: 3, suspended: 0, staff: 1 });
    });
  });

  describe('PATCH /users/:id/status', () => {
    let superToken: string;
    let superId: string;
    let adminToken: string;
    let adminId: string;
    let victimId: string;
    let victimToken: string;
    let victimCookie: string;

    beforeEach(async () => {
      await resetDatabase(prisma);

      const sup = await staffToken('mod.super@adm.test', PlatformRole.SUPER_ADMIN);
      superToken = sup.accessToken;
      superId = sup.userId;

      const adm = await staffToken('mod.admin@adm.test', PlatformRole.PLATFORM_ADMIN);
      adminToken = adm.accessToken;
      adminId = adm.userId;

      const victim = await registerAndLogin(app, 'mod.victim@adm.test', 'Victim', PASSWORD);
      victimId = victim.userId;
      victimToken = victim.accessToken;

      const login = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'mod.victim@adm.test', password: PASSWORD })
        .expect(200);
      victimCookie = (login.headers['set-cookie'] as unknown as string[]).join(';');
    });

    it('BREACH IF FAILING: suspension ends the account’s access immediately', async () => {
      await api(app).get('/api/v1/auth/me').set(bearer(victimToken)).expect(200);

      await api(app)
        .patch(`/api/v1/users/${victimId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED' })
        .expect(200);

      // Not "when the 15-minute token expires" — now.
      await api(app).get('/api/v1/auth/me').set(bearer(victimToken)).expect(401);
      // And no new access token can be minted from the refresh cookie.
      await api(app).post('/api/v1/auth/refresh').set('Cookie', victimCookie).expect(401);
      // Nor by signing in again.
      await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'mod.victim@adm.test', password: PASSWORD })
        .expect(401);
    });

    it('reinstates a suspended account', async () => {
      await api(app)
        .patch(`/api/v1/users/${victimId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const res = await api(app)
        .patch(`/api/v1/users/${victimId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'ACTIVE' })
        .expect(200);

      expect(res.body.data.status).toBe(UserStatus.ACTIVE);
      await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'mod.victim@adm.test', password: PASSWORD })
        .expect(200);
    });

    it('refuses to let an admin suspend themselves', async () => {
      const res = await api(app)
        .patch(`/api/v1/users/${adminId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED' })
        .expect(400);

      expect(res.body.error.message).toContain('your own account');
    });

    it('BREACH IF FAILING: a platform admin cannot suspend a super admin', async () => {
      await api(app)
        .patch(`/api/v1/users/${superId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED' })
        .expect(403);

      const after = await prisma.user.findFirstOrThrow({ where: { id: superId } });
      expect(after.status).toBe(UserStatus.ACTIVE);
    });

    it('lets a super admin suspend a platform admin', () =>
      api(app)
        .patch(`/api/v1/users/${adminId}/status`)
        .set(bearer(superToken))
        .send({ status: 'SUSPENDED' })
        .expect(200));

    it('BREACH IF FAILING: rejects any attempt to grant a platform role', async () => {
      // There is no role-granting endpoint; these are the shapes someone would
      // try. forbidNonWhitelisted turns each into a 400.
      for (const body of [
        { status: 'ACTIVE', platformRole: 'SUPER_ADMIN' },
        { platformRole: 'SUPER_ADMIN' },
        { status: 'ACTIVE', role: 'SUPER_ADMIN' },
      ]) {
        await api(app)
          .patch(`/api/v1/users/${victimId}/status`)
          .set(bearer(adminToken))
          .send(body)
          .expect(400);
      }

      const after = await prisma.user.findFirstOrThrow({ where: { id: victimId } });
      expect(after.platformRole).toBe(PlatformRole.USER);
    });

    it('rejects a status an administrator may not assign', async () => {
      for (const status of ['DEACTIVATED', 'PENDING_VERIFICATION', 'NONSENSE']) {
        await api(app)
          .patch(`/api/v1/users/${victimId}/status`)
          .set(bearer(adminToken))
          .send({ status })
          .expect(400);
      }
    });

    it('rejects a no-op change', () =>
      api(app)
        .patch(`/api/v1/users/${victimId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'ACTIVE' })
        .expect(400));

    it('404s for a user that does not exist', () =>
      api(app)
        .patch(`/api/v1/users/${uuidv7()}/status`)
        .set(bearer(adminToken))
        .send({ status: 'SUSPENDED' })
        .expect(404));
  });
});
