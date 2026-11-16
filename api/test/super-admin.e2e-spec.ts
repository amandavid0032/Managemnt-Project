import type { INestApplication } from '@nestjs/common';
import {
  InstitutionCategory,
  InstitutionStatus,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  UserStatus,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import type { PrismaService } from '../src/database/prisma.service';
import {
  api,
  createTestApp,
  registerAndLogin,
  registerVerifiedAndLogin,
  resetDatabase,
} from './helpers';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PASSWORD = 'ValidPass123';

/**
 * The Super Admin dashboard's backend: figures, audit trail, review
 * decisions, platform roles, system health and settings.
 *
 * Figures are asserted against rows this suite creates itself, so a number
 * that is merely plausible fails.
 */
describe('Super Admin dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  async function staff(email: string, role: PlatformRole) {
    const { userId } = await registerVerifiedAndLogin(app, email, `Staff ${role}`, PASSWORD);
    await prisma.user.update({ where: { id: userId }, data: { platformRole: role } });
    const relogin = await api(app).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    return { userId, token: relogin.body.data.accessToken as string };
  }

  function institution(
    status: InstitutionStatus,
    extra: Partial<{ category: InstitutionCategory; countryCode: string; createdAt: Date; deletedAt: Date; verifiedAt: Date }> = {},
  ) {
    const id = uuidv7();
    return prisma.institution.create({
      data: {
        id,
        name: `Inst ${id.slice(-8)}`,
        slug: `inst-${id.slice(-8)}`,
        category: extra.category ?? InstitutionCategory.SCHOOL,
        countryCode: extra.countryCode ?? 'GB',
        status,
        ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
        ...(extra.deletedAt ? { deletedAt: extra.deletedAt } : {}),
        ...(extra.verifiedAt ? { verifiedAt: extra.verifiedAt } : {}),
      },
    });
  }

  // -------------------------------------------------------------------------
  describe('access control', () => {
    let superToken: string;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
      await resetDatabase(prisma);
      superToken = (await staff('owner@sa.test', PlatformRole.SUPER_ADMIN)).token;
      adminToken = (await staff('admin@sa.test', PlatformRole.PLATFORM_ADMIN)).token;
      userToken = (await registerAndLogin(app, 'user@sa.test', 'User', PASSWORD)).accessToken;
    });

    const STAFF_READS = [
      '/api/v1/admin/overview',
      '/api/v1/admin/activity',
      '/api/v1/admin/approvals',
      '/api/v1/admin/analytics/distribution',
      '/api/v1/admin/analytics/registrations',
      '/api/v1/admin/system/health',
      '/api/v1/admin/audit-logs',
    ];

    it.each(STAFF_READS)('%s: 401 anonymous, 403 ordinary user, 200 platform admin', async (path) => {
      await api(app).get(path).expect(401);
      await api(app).get(path).set(bearer(userToken)).expect(403);
      await api(app).get(path).set(bearer(adminToken)).expect(200);
      await api(app).get(path).set(bearer(superToken)).expect(200);
    });

    it('settings are super-admin only', async () => {
      await api(app).get('/api/v1/admin/settings').expect(401);
      await api(app).get('/api/v1/admin/settings').set(bearer(userToken)).expect(403);
      await api(app).get('/api/v1/admin/settings').set(bearer(adminToken)).expect(403);
      await api(app).get('/api/v1/admin/settings').set(bearer(superToken)).expect(200);
    });

    it('BREACH IF FAILING: settings never contain a secret value', async () => {
      const res = await api(app).get('/api/v1/admin/settings').set(bearer(superToken)).expect(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(process.env.JWT_ACCESS_SECRET);
      expect(body).not.toContain(process.env.DATABASE_URL);
      expect(res.body.data.authentication.jwtSecret).toBe('set');
      expect(['set', 'not set']).toContain(res.body.data.email.smtpPassword);
    });

    it('BREACH IF FAILING: there is no route that edits or deletes audit entries', async () => {
      const id = uuidv7();
      await api(app).patch(`/api/v1/admin/audit-logs/${id}`).set(bearer(superToken)).send({}).expect(404);
      await api(app).delete(`/api/v1/admin/audit-logs/${id}`).set(bearer(superToken)).expect(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /admin/overview', () => {
    it('counts exactly the live rows, and offers a trend only where history exists', async () => {
      await resetDatabase(prisma);
      const { token, userId: ownerId } = await staff('owner@ov.test', PlatformRole.SUPER_ADMIN);
      await staff('admin@ov.test', PlatformRole.PLATFORM_ADMIN);
      const s1 = await registerAndLogin(app, 's1@ov.test', 'Sam One', PASSWORD);
      const s2 = await registerAndLogin(app, 's2@ov.test', 'Sam Two', PASSWORD);
      const t1 = await registerAndLogin(app, 't1@ov.test', 'Tia One', PASSWORD);
      const gone = await registerAndLogin(app, 'gone@ov.test', 'Gone', PASSWORD);
      const old = await registerAndLogin(app, 'old@ov.test', 'Old', PASSWORD);
      await prisma.user.update({ where: { id: s2.userId }, data: { status: UserStatus.SUSPENDED } });
      await prisma.user.update({ where: { id: gone.userId }, data: { deletedAt: new Date() } });
      // Registered 45 days ago: in the previous 30-day window, not this one.
      await prisma.user.update({
        where: { id: old.userId },
        data: { createdAt: new Date(Date.now() - 45 * 86_400_000) },
      });

      const pub = await institution(InstitutionStatus.PUBLISHED);
      await institution(InstitutionStatus.PUBLISHED);
      await institution(InstitutionStatus.PENDING_REVIEW);
      await institution(InstitutionStatus.PENDING_REVIEW);
      await institution(InstitutionStatus.PENDING_REVIEW);
      await institution(InstitutionStatus.DRAFT, { createdAt: new Date(Date.now() - 40 * 86_400_000) });
      const archived = await institution(InstitutionStatus.ARCHIVED, { deletedAt: new Date() });

      const member = (userId: string, institutionId: string, role: MembershipRole, status: MembershipStatus = MembershipStatus.ACTIVE, leftAt?: Date) =>
        prisma.institutionMembership.create({
          data: { id: uuidv7(), userId, institutionId, role, status, leftAt: leftAt ?? null, joinedAt: new Date() },
        });
      await member(s1.userId, pub.id, MembershipRole.STUDENT);
      await member(s2.userId, pub.id, MembershipRole.STUDENT); // suspended account, still an active membership row
      await member(t1.userId, pub.id, MembershipRole.TEACHER);
      await member(t1.userId, pub.id, MembershipRole.STUDENT, MembershipStatus.LEFT, new Date()); // former: excluded
      await member(old.userId, archived.id, MembershipRole.TEACHER); // archived institution: excluded
      await member(ownerId, pub.id, MembershipRole.STAFF);

      const res = await api(app).get('/api/v1/admin/overview').set(bearer(token)).expect(200);
      const k = res.body.data.kpis;

      // owner, admin, s1, s2, t1, old  (gone is soft-deleted)
      expect(k.totalUsers.value).toBe(6);
      expect(k.totalUsers.newRegistrations).toEqual({ windowDays: 30, current: 5, previous: 1 });
      expect(k.totalInstitutions.value).toBe(6);
      expect(k.totalInstitutions.newRegistrations).toEqual({ windowDays: 30, current: 5, previous: 1 });
      expect(k.publishedInstitutions).toEqual({ value: 2 });
      expect(k.pendingApprovals).toEqual({ value: 3 });
      expect(k.activeStudents).toEqual({ value: 2 });
      expect(k.activeTeachers).toEqual({ value: 1 });
      expect(k.platformAdmins).toEqual({ value: 2 });
      expect(k.suspendedAccounts).toEqual({ value: 1 });
      // No invented trend on status-based figures.
      expect(k.publishedInstitutions.newRegistrations).toBeUndefined();

      // Each card links to a list filtered the same way, and they agree.
      const students = await api(app).get('/api/v1/users?membershipRole=student').set(bearer(token)).expect(200);
      expect(students.body.meta.pagination.total).toBe(k.activeStudents.value);
      const teachers = await api(app).get('/api/v1/users?membershipRole=TEACHER').set(bearer(token)).expect(200);
      expect(teachers.body.data.map((u: { email: string }) => u.email)).toEqual(['t1@ov.test']);
      const suspendedList = await api(app).get('/api/v1/users?status=SUSPENDED').set(bearer(token)).expect(200);
      expect(suspendedList.body.meta.pagination.total).toBe(k.suspendedAccounts.value);
      await api(app).get('/api/v1/users?membershipRole=PRINCIPAL').set(bearer(token)).expect(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /admin/analytics/registrations', () => {
    let token: string;
    beforeAll(async () => {
      await resetDatabase(prisma);
      token = (await staff('owner@reg.test', PlatformRole.SUPER_ADMIN)).token;
      const a = await registerAndLogin(app, 'a@reg.test', 'Ann', PASSWORD);
      const b = await registerAndLogin(app, 'b@reg.test', 'Ben', PASSWORD);
      await prisma.user.update({ where: { id: a.userId }, data: { createdAt: new Date('2026-03-02T10:00:00Z') } });
      await prisma.user.update({ where: { id: b.userId }, data: { createdAt: new Date('2026-03-04T23:30:00Z') } });
      await institution(InstitutionStatus.DRAFT, { createdAt: new Date('2026-03-04T01:00:00Z') });
      // Archived later — still a registration that happened.
      await institution(InstitutionStatus.ARCHIVED, { createdAt: new Date('2026-03-04T02:00:00Z'), deletedAt: new Date() });
    });

    it('returns a zero-filled daily series in UTC', async () => {
      const res = await api(app)
        .get('/api/v1/admin/analytics/registrations?granularity=day&from=2026-03-01T00:00:00Z&to=2026-03-05T00:00:00Z')
        .set(bearer(token))
        .expect(200);
      const d = res.body.data;
      expect(d.timezone).toBe('UTC');
      expect(d.series.map((r: { bucket: string }) => r.bucket.slice(0, 10))).toEqual([
        '2026-03-01',
        '2026-03-02',
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
      ]);
      expect(d.series.map((r: { users: number }) => r.users)).toEqual([0, 1, 0, 1, 0]);
      expect(d.series.map((r: { institutions: number }) => r.institutions)).toEqual([0, 0, 0, 2, 0]);
      expect(d.totals).toEqual({ users: 2, institutions: 2 });
    });

    it('groups by month', async () => {
      const res = await api(app)
        .get('/api/v1/admin/analytics/registrations?granularity=month&from=2026-02-01T00:00:00Z&to=2026-04-01T00:00:00Z')
        .set(bearer(token))
        .expect(200);
      expect(res.body.data.series).toEqual([
        { bucket: '2026-02-01T00:00:00.000Z', users: 0, institutions: 0 },
        { bucket: '2026-03-01T00:00:00.000Z', users: 2, institutions: 2 },
        { bucket: '2026-04-01T00:00:00.000Z', users: 0, institutions: 0 },
      ]);
    });

    it.each([
      ['granularity=hour', 400],
      ['from=2026-05-01T00:00:00Z&to=2026-03-01T00:00:00Z', 400],
      ['granularity=day&from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z', 400],
      ['from=yesterday', 400],
    ])('rejects %s', async (qs, code) => {
      await api(app).get(`/api/v1/admin/analytics/registrations?${qs}`).set(bearer(token)).expect(code);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /admin/analytics/distribution', () => {
    it('breaks institutions down by category, status and country, and admits users have no country', async () => {
      await resetDatabase(prisma);
      const { token } = await staff('owner@dist.test', PlatformRole.SUPER_ADMIN);
      await institution(InstitutionStatus.PUBLISHED, { category: InstitutionCategory.UNIVERSITY, countryCode: 'IN' });
      await institution(InstitutionStatus.DRAFT, { category: InstitutionCategory.UNIVERSITY, countryCode: 'IN' });
      await institution(InstitutionStatus.PUBLISHED, { category: InstitutionCategory.SCHOOL, countryCode: 'DE' });
      await institution(InstitutionStatus.ARCHIVED, { category: InstitutionCategory.SCHOOL, countryCode: 'FR', deletedAt: new Date() });

      const res = await api(app).get('/api/v1/admin/analytics/distribution').set(bearer(token)).expect(200);
      const inst = res.body.data.institutions;
      expect(inst.byStatus).toEqual({ DRAFT: 1, PENDING_REVIEW: 0, PUBLISHED: 2, SUSPENDED: 0 });
      expect(inst.byCategory).toEqual([
        { category: 'UNIVERSITY', total: 2, byStatus: { PUBLISHED: 1, DRAFT: 1 } },
        { category: 'SCHOOL', total: 1, byStatus: { PUBLISHED: 1 } },
      ]);
      expect(inst.byCountry).toEqual([
        { countryCode: 'IN', total: 2, published: 1 },
        { countryCode: 'DE', total: 1, published: 1 },
      ]);
      expect(res.body.data.users.byCountry).toBeNull();
      expect(res.body.data.users.byCountryUnavailableReason).toMatch(/do not record a country/);
    });
  });

  // -------------------------------------------------------------------------
  describe('audit log and review decisions', () => {
    let admin: { userId: string; token: string };

    beforeEach(async () => {
      await resetDatabase(prisma);
      admin = await staff('admin@audit.test', PlatformRole.PLATFORM_ADMIN);
    });

    const logs = (targetId: string) =>
      prisma.auditLog.findMany({ where: { targetId }, orderBy: { createdAt: 'asc' } });

    it('records a publish with actor, role, IP and from/to — in the same transaction', async () => {
      const inst = await institution(InstitutionStatus.DRAFT);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(admin.token))
        .set('User-Agent', 'audit-test-agent')
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const [entry, ...rest] = await logs(inst.id);
      expect(rest).toHaveLength(0);
      expect(entry).toMatchObject({
        actorUserId: admin.userId,
        actorRole: 'PLATFORM_ADMIN',
        action: 'institution.status_changed',
        targetType: 'institution',
        targetId: inst.id,
        userAgent: 'audit-test-agent',
        metadata: { from: 'DRAFT', to: 'PUBLISHED' },
      });
      expect(entry!.ipAddress).toBeTruthy();
    });

    it('a refused transition leaves no audit row', async () => {
      const inst = await institution(InstitutionStatus.DRAFT);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'SUSPENDED' })
        .expect(400);
      expect(await logs(inst.id)).toHaveLength(0);
    });

    it('a forbidden caller leaves no audit row', async () => {
      const inst = await institution(InstitutionStatus.DRAFT);
      const user = await registerAndLogin(app, 'nobody@audit.test', 'Nobody', PASSWORD);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(user.accessToken))
        .send({ status: 'PUBLISHED' })
        .expect(403);
      expect(await logs(inst.id)).toHaveLength(0);
    });

    it('rejecting a submission requires a reason, and records it as REJECTED', async () => {
      const inst = await institution(InstitutionStatus.PENDING_REVIEW);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'DRAFT' })
        .expect(400);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'DRAFT', reason: '  ' })
        .expect(400);
      expect((await prisma.institution.findUniqueOrThrow({ where: { id: inst.id } })).status).toBe('PENDING_REVIEW');

      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'DRAFT', reason: 'Website does not match the registered name' })
        .expect(200);
      const [entry] = await logs(inst.id);
      expect(entry!.metadata).toEqual({
        from: 'PENDING_REVIEW',
        to: 'DRAFT',
        decision: 'REJECTED',
        reason: 'Website does not match the registered name',
      });
    });

    it('approving a submission is recorded as APPROVED and stamps verifiedAt', async () => {
      const inst = await institution(InstitutionStatus.PENDING_REVIEW);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'PUBLISHED' })
        .expect(200);
      const [entry] = await logs(inst.id);
      expect(entry!.metadata).toMatchObject({ decision: 'APPROVED', from: 'PENDING_REVIEW', to: 'PUBLISHED' });
      expect((await prisma.institution.findUniqueOrThrow({ where: { id: inst.id } })).verifiedAt).not.toBeNull();
    });

    it('records which fields an edit changed, without copying long text', async () => {
      const inst = await institution(InstitutionStatus.DRAFT);
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}`)
        .set(bearer(admin.token))
        .send({ phone: '+44 20 7946 0000', description: 'A long description.' })
        .expect(200);
      const [entry] = await logs(inst.id);
      expect(entry!.action).toBe('institution.updated');
      expect(entry!.metadata).toEqual({
        changes: { phone: { from: null, to: '+44 20 7946 0000' }, description: { changed: true } },
      });

      // Saving identical values is not an action.
      await api(app)
        .patch(`/api/v1/institutions/${inst.id}`)
        .set(bearer(admin.token))
        .send({ phone: '+44 20 7946 0000' })
        .expect(200);
      expect(await logs(inst.id)).toHaveLength(1);
    });

    it('records create and archive', async () => {
      const created = await api(app)
        .post('/api/v1/institutions')
        .set(bearer(admin.token))
        .send({ name: 'Audit Academy', category: 'SCHOOL', countryCode: 'NZ' })
        .expect(201);
      const id = created.body.data.id as string;
      await api(app).delete(`/api/v1/institutions/${id}`).set(bearer(admin.token)).expect(200);
      expect((await logs(id)).map((e) => e.action)).toEqual(['institution.created', 'institution.archived']);
    });

    it('records account suspension and reinstatement', async () => {
      const target = await registerAndLogin(app, 'target@audit.test', 'Target', PASSWORD);
      await api(app).patch(`/api/v1/users/${target.userId}/status`).set(bearer(admin.token)).send({ status: 'SUSPENDED' }).expect(200);
      await api(app).patch(`/api/v1/users/${target.userId}/status`).set(bearer(admin.token)).send({ status: 'ACTIVE' }).expect(200);
      expect((await logs(target.userId)).map((e) => e.metadata)).toEqual([
        { from: 'ACTIVE', to: 'SUSPENDED' },
        { from: 'SUSPENDED', to: 'ACTIVE' },
      ]);
    });

    it('records membership changes made by platform staff as an override, scoped to the institution', async () => {
      const inst = await institution(InstitutionStatus.PUBLISHED);
      const person = await registerVerifiedAndLogin(app, 'student@audit.test', 'Student', PASSWORD);
      const res = await api(app)
        .post(`/api/v1/institutions/${inst.id}/memberships`)
        .set(bearer(admin.token))
        .send({ userId: person.userId, role: 'STUDENT' })
        .expect(201);
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { targetId: res.body.data.id } });
      expect(entry).toMatchObject({
        action: 'membership.created',
        institutionId: inst.id,
        actorUserId: admin.userId,
        metadata: { userId: person.userId, role: 'STUDENT', actingAs: 'PLATFORM_OVERRIDE' },
      });
    });

    it('BREACH IF FAILING: the database refuses UPDATE and DELETE on audit rows', async () => {
      const inst = await institution(InstitutionStatus.DRAFT);
      await api(app).patch(`/api/v1/institutions/${inst.id}/status`).set(bearer(admin.token)).send({ status: 'PUBLISHED' }).expect(200);
      const [entry] = await logs(inst.id);

      await expect(
        prisma.auditLog.update({ where: { id: entry!.id }, data: { action: 'institution.updated' } }),
      ).rejects.toThrow(/append-only/);
      await expect(prisma.auditLog.delete({ where: { id: entry!.id } })).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
      expect(await logs(inst.id)).toHaveLength(1);
    });

    it('GET /admin/audit-logs filters, paginates and names the actor and target', async () => {
      const a = await institution(InstitutionStatus.DRAFT);
      const b = await institution(InstitutionStatus.DRAFT);
      for (const inst of [a, b]) {
        await api(app).patch(`/api/v1/institutions/${inst.id}/status`).set(bearer(admin.token)).send({ status: 'PENDING_REVIEW' }).expect(200);
      }
      await api(app).patch(`/api/v1/institutions/${a.id}/status`).set(bearer(admin.token)).send({ status: 'PUBLISHED' }).expect(200);

      const byTarget = await api(app).get(`/api/v1/admin/audit-logs?targetId=${a.id}`).set(bearer(admin.token)).expect(200);
      expect(byTarget.body.meta.pagination.total).toBe(2);
      expect(byTarget.body.data[0]).toMatchObject({
        targetLabel: a.name,
        actor: { id: admin.userId, email: 'admin@audit.test' },
        metadata: { to: 'PUBLISHED' },
      });

      const page = await api(app).get('/api/v1/admin/audit-logs?limit=2&page=2').set(bearer(admin.token)).expect(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta.pagination).toMatchObject({ total: 3, page: 2, hasNext: false });

      await api(app).get('/api/v1/admin/audit-logs?action=institution.deleted').set(bearer(admin.token)).expect(400);
      await api(app).get('/api/v1/admin/audit-logs?targetId=not-a-uuid').set(bearer(admin.token)).expect(400);
    });

    it('pending approvals report when each record was submitted, or null when unknown', async () => {
      const seeded = await institution(InstitutionStatus.PENDING_REVIEW);
      const submitted = await institution(InstitutionStatus.DRAFT);
      await api(app).patch(`/api/v1/institutions/${submitted.id}/status`).set(bearer(admin.token)).send({ status: 'PENDING_REVIEW' }).expect(200);

      const res = await api(app).get('/api/v1/admin/approvals').set(bearer(admin.token)).expect(200);
      expect(res.body.data.total).toBe(2);
      const byId = Object.fromEntries(res.body.data.rows.map((r: { id: string }) => [r.id, r]));
      expect(byId[seeded.id].submittedAt).toBeNull();
      expect(typeof byId[submitted.id].submittedAt).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  describe('PATCH /users/:id/platform-role', () => {
    let owner: { userId: string; token: string };
    let admin: { userId: string; token: string };

    beforeEach(async () => {
      await resetDatabase(prisma);
      owner = await staff('owner@role.test', PlatformRole.SUPER_ADMIN);
      admin = await staff('admin@role.test', PlatformRole.PLATFORM_ADMIN);
    });

    const setRole = (token: string, id: string, platformRole: string) =>
      api(app).patch(`/api/v1/users/${id}/platform-role`).set(bearer(token)).send({ platformRole });

    it('BREACH IF FAILING: a platform admin cannot grant roles', async () => {
      const user = await registerVerifiedAndLogin(app, 'u@role.test', 'Una', PASSWORD);
      await setRole(admin.token, user.userId, 'PLATFORM_ADMIN').expect(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).platformRole).toBe('USER');
    });

    it('BREACH IF FAILING: an ordinary user cannot promote themselves', async () => {
      const user = await registerVerifiedAndLogin(app, 'u@role.test', 'Una', PASSWORD);
      await setRole(user.accessToken, user.userId, 'PLATFORM_ADMIN').expect(403);
    });

    it('BREACH IF FAILING: SUPER_ADMIN cannot be granted through the API', async () => {
      const user = await registerVerifiedAndLogin(app, 'u@role.test', 'Una', PASSWORD);
      await setRole(owner.token, user.userId, 'SUPER_ADMIN').expect(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).platformRole).toBe('USER');
    });

    it('BREACH IF FAILING: a super admin cannot be demoted, so the last owner cannot be removed', async () => {
      const second = await staff('owner2@role.test', PlatformRole.SUPER_ADMIN);
      await setRole(owner.token, second.userId, 'USER').expect(403);
      await setRole(owner.token, owner.userId, 'USER').expect(400); // self
      expect(await prisma.user.count({ where: { platformRole: 'SUPER_ADMIN' } })).toBe(2);
    });

    it('promotes a verified active user, ends their sessions and records it', async () => {
      const user = await registerVerifiedAndLogin(app, 'u@role.test', 'Una', PASSWORD);
      const res = await setRole(owner.token, user.userId, 'platform_admin').expect(200);
      expect(res.body.data.platformRole).toBe('PLATFORM_ADMIN');
      expect(res.body.data.passwordHash).toBeUndefined();

      // Old token is dead; a fresh login carries the new role.
      await api(app).get('/api/v1/auth/me').set(bearer(user.accessToken)).expect(401);
      const relogin = await api(app).post('/api/v1/auth/login').send({ email: 'u@role.test', password: PASSWORD }).expect(200);
      await api(app).get('/api/v1/admin/overview').set(bearer(relogin.body.data.accessToken)).expect(200);

      const entry = await prisma.auditLog.findFirstOrThrow({ where: { targetId: user.userId } });
      expect(entry).toMatchObject({
        action: 'user.platform_role_changed',
        actorUserId: owner.userId,
        actorRole: 'SUPER_ADMIN',
        metadata: { from: 'USER', to: 'PLATFORM_ADMIN' },
      });
    });

    it('revokes platform admin', async () => {
      await setRole(owner.token, admin.userId, 'USER').expect(200);
      await api(app).get('/api/v1/admin/overview').set(bearer(admin.token)).expect(401);
    });

    it('refuses to promote an unverified or suspended account', async () => {
      const unverified = await registerAndLogin(app, 'unv@role.test', 'Unverified', PASSWORD);
      await setRole(owner.token, unverified.userId, 'PLATFORM_ADMIN').expect(400);

      const suspended = await registerVerifiedAndLogin(app, 'sus@role.test', 'Suspended', PASSWORD);
      await prisma.user.update({ where: { id: suspended.userId }, data: { status: UserStatus.SUSPENDED } });
      await setRole(owner.token, suspended.userId, 'PLATFORM_ADMIN').expect(400);
    });

    it('rejects extra fields and unknown users', async () => {
      const user = await registerVerifiedAndLogin(app, 'u@role.test', 'Una', PASSWORD);
      await api(app)
        .patch(`/api/v1/users/${user.userId}/platform-role`)
        .set(bearer(owner.token))
        .send({ platformRole: 'PLATFORM_ADMIN', status: 'SUSPENDED' })
        .expect(400);
      await setRole(owner.token, uuidv7(), 'PLATFORM_ADMIN').expect(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('list filters added for the dashboard', () => {
    it('users can be filtered by email verification', async () => {
      await resetDatabase(prisma);
      const { token } = await staff('owner@flt.test', PlatformRole.SUPER_ADMIN);
      await registerAndLogin(app, 'unverified@flt.test', 'Unverified', PASSWORD);
      const verified = await api(app).get('/api/v1/users?emailVerified=true').set(bearer(token)).expect(200);
      const unverified = await api(app).get('/api/v1/users?emailVerified=false').set(bearer(token)).expect(200);
      expect(verified.body.data.map((u: { email: string }) => u.email)).toEqual(['owner@flt.test']);
      expect(unverified.body.data.map((u: { email: string }) => u.email)).toEqual(['unverified@flt.test']);
      await api(app).get('/api/v1/users?emailVerified=maybe').set(bearer(token)).expect(400);
    });

    it('institutions can be filtered by verification — by staff only', async () => {
      await resetDatabase(prisma);
      const { token } = await staff('owner@flt.test', PlatformRole.SUPER_ADMIN);
      const approved = await institution(InstitutionStatus.PUBLISHED, { verifiedAt: new Date() });
      const never = await institution(InstitutionStatus.PUBLISHED);

      const staffView = await api(app).get('/api/v1/institutions?verified=false').set(bearer(token)).expect(200);
      expect(staffView.body.data.map((i: { id: string }) => i.id)).toEqual([never.id]);
      const verifiedView = await api(app).get('/api/v1/institutions?verified=true').set(bearer(token)).expect(200);
      expect(verifiedView.body.data.map((i: { id: string }) => i.id)).toEqual([approved.id]);

      // The public cannot use it to learn which listings were never reviewed.
      const publicView = await api(app).get('/api/v1/institutions?verified=false').expect(200);
      expect(publicView.body.data).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /admin/system/health', () => {
    it('reports real process and database facts, and nothing it cannot know', async () => {
      await resetDatabase(prisma);
      const { token } = await staff('owner@sys.test', PlatformRole.SUPER_ADMIN);
      const res = await api(app).get('/api/v1/admin/system/health').set(bearer(token)).expect(200);
      const d = res.body.data;
      expect(d.api.status).toBe('up');
      expect(d.api.nodeVersion).toBe(process.version);
      expect(d.database.status).toBe('up');
      expect(typeof d.database.latencyMs).toBe('number');
      expect(d.database.migrations.latest).toMatch(/admin_audit_log$/);
      expect(d.database.migrations.unfinished).toBe(0);
      expect(d.mail).toMatchObject({ provider: 'memory', configured: false });
      expect(d.errors.externalMonitoring).toBeNull();
      expect(d.backgroundJobs).toBeNull();
      expect(d.storage).toBeNull();
      expect(JSON.stringify(d)).not.toContain(process.env.DATABASE_URL);
    });
  });
});
