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
import { MembershipsService } from '../src/memberships/memberships.service';
import {
  api,
  createTestApp,
  mailbox,
  registerAndLogin,
  registerVerifiedAndLogin,
  resetDatabase,
} from './helpers';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

type Session = { userId: string; accessToken: string };

/**
 * The school dashboard and membership management.
 *
 * Cast, all at Alpha unless stated:
 *   alice   INSTITUTION_ADMIN      sam   STAFF        tom   TEACHER
 *   sue     STUDENT                bob   INSTITUTION_ADMIN at Beta
 *   multi   STUDENT at Alpha, STAFF at Beta  (one account, two tenants)
 *   cara    verified, no memberships (the person being enrolled)
 *   una     registered, NOT verified
 *   priya   PLATFORM_ADMIN, no memberships
 */
describe('School dashboard and membership management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let alphaId: string;
  let betaId: string;
  let alice: Session, sam: Session, tom: Session, sue: Session, bob: Session;
  let multi: Session, cara: Session, una: Session, priya: Session;
  let samMembershipId: string;
  let sueMembershipId: string;
  let aliceMembershipId: string;

  const base = (id: string) => `/api/v1/institutions/${id}`;
  const as = (s: Session) => bearer(s.accessToken);

  const enrol = async (userId: string, institutionId: string, role: MembershipRole, memberId?: string) => {
    const row = await prisma.institutionMembership.create({
      data: {
        id: uuidv7(),
        userId,
        institutionId,
        role,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date('2025-09-01'),
        institutionMemberId: memberId,
      },
    });
    return row.id;
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    mailbox(app).clear();

    const mk = (name: string, slug: string) => ({
      id: uuidv7(),
      name,
      slug,
      category: InstitutionCategory.SCHOOL,
      countryCode: 'IN',
      status: InstitutionStatus.PUBLISHED,
    });
    const alpha = mk('Alpha School', 'alpha-school');
    const beta = mk('Beta College', 'beta-college');
    await prisma.institution.createMany({ data: [alpha, beta] });
    alphaId = alpha.id;
    betaId = beta.id;

    alice = await registerVerifiedAndLogin(app, 'alice@school.test', 'Alice Admin');
    sam = await registerVerifiedAndLogin(app, 'sam@school.test', 'Sam Staff');
    tom = await registerVerifiedAndLogin(app, 'tom@school.test', 'Tom Teacher');
    sue = await registerVerifiedAndLogin(app, 'sue@school.test', 'Sue Student');
    bob = await registerVerifiedAndLogin(app, 'bob@school.test', 'Bob Beta');
    multi = await registerVerifiedAndLogin(app, 'multi@school.test', 'Mo Multi');
    cara = await registerVerifiedAndLogin(app, 'cara@school.test', 'Cara Candidate');
    una = await registerAndLogin(app, 'una@school.test', 'Una Unverified');
    priya = await registerVerifiedAndLogin(app, 'priya@school.test', 'Priya Platform');
    await prisma.user.update({ where: { id: priya.userId }, data: { platformRole: PlatformRole.PLATFORM_ADMIN } });

    aliceMembershipId = await enrol(alice.userId, alphaId, MembershipRole.INSTITUTION_ADMIN);
    samMembershipId = await enrol(sam.userId, alphaId, MembershipRole.STAFF);
    await enrol(tom.userId, alphaId, MembershipRole.TEACHER);
    sueMembershipId = await enrol(sue.userId, alphaId, MembershipRole.STUDENT, 'AL-001');
    await enrol(multi.userId, alphaId, MembershipRole.STUDENT, 'AL-002');
    await enrol(bob.userId, betaId, MembershipRole.INSTITUTION_ADMIN);
    await enrol(multi.userId, betaId, MembershipRole.STAFF);
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  describe('dashboard overview — who may see it', () => {
    it('an institution admin sees real counts for their institution', async () => {
      const res = await api(app).get(`${base(alphaId)}/overview`).set(as(alice)).expect(200);
      expect(res.body.data.institution).toMatchObject({ id: alphaId, name: 'Alpha School', status: 'PUBLISHED' });
      expect(res.body.data.members.active).toEqual({
        students: 2, // sue + multi
        teachers: 1,
        staff: 1,
        administrators: 1,
        total: 5,
      });
      expect(res.body.data.viewer).toMatchObject({ role: 'INSTITUTION_ADMIN', canManage: true, platformOverride: false });
    });

    it('staff may view the dashboard but are told they cannot manage', async () => {
      const res = await api(app).get(`${base(alphaId)}/overview`).set(as(sam)).expect(200);
      expect(res.body.data.viewer).toMatchObject({ role: 'STAFF', canManage: false });
    });

    it.each([
      ['a teacher', () => tom],
      ['a student', () => sue],
      ['a verified user with no membership', () => cara],
    ])('BREACH IF FAILING: %s gets 404 — a membership is not a key to the office', async (_l, who) => {
      await api(app).get(`${base(alphaId)}/overview`).set(as(who())).expect(404);
    });

    it("BREACH IF FAILING: another institution's admin gets 404, not 403", async () => {
      const res = await api(app).get(`${base(alphaId)}/overview`).set(as(bob)).expect(404);
      expect(res.body.error.message).toBe('Institution not found');
    });

    it('requires authentication', () => api(app).get(`${base(alphaId)}/overview`).expect(401));

    it('platform staff can open any institution, flagged as an override', async () => {
      const res = await api(app).get(`${base(alphaId)}/overview`).set(as(priya)).expect(200);
      expect(res.body.data.viewer).toMatchObject({ platformOverride: true, membership: null });
    });

    it('an unknown or malformed institution id is 404', async () => {
      await api(app).get(`${base(uuidv7())}/overview`).set(as(alice)).expect(404);
      await api(app).get(`${base('alpha-school')}/overview`).set(as(alice)).expect(404);
    });
  });

  // =========================================================================
  describe('multi-institution users', () => {
    it('/auth/me lists every active membership, so the UI can offer a choice', async () => {
      const res = await api(app).get('/api/v1/auth/me').set(as(multi)).expect(200);
      const links = (res.body.data.memberships as Array<{ slug: string; role: string }>)
        .map((m) => `${m.slug}:${m.role}`)
        .sort();
      expect(links).toEqual(['alpha-school:STUDENT', 'beta-college:STAFF']);
    });

    it('authority is per institution: staff at Beta, but only a student at Alpha', async () => {
      await api(app).get(`${base(betaId)}/overview`).set(as(multi)).expect(200);
      await api(app).get(`${base(alphaId)}/overview`).set(as(multi)).expect(404);
      await api(app).get(`${base(alphaId)}/memberships`).set(as(multi)).expect(404);
    });
  });

  // =========================================================================
  describe('member list', () => {
    it('filters by role', async () => {
      const res = await api(app).get(`${base(alphaId)}/memberships?role=student`).set(as(alice)).expect(200);
      expect(res.body.data.map((m: { user: { email: string } }) => m.user.email).sort()).toEqual([
        'multi@school.test',
        'sue@school.test',
      ]);
    });

    it('searches name, email and member id', async () => {
      const byId = await api(app).get(`${base(alphaId)}/memberships?search=AL-001`).set(as(sam)).expect(200);
      expect(byId.body.data).toHaveLength(1);
      expect(byId.body.data[0].user.fullName).toBe('Sue Student');
    });

    it('rejects an unknown filter value', () =>
      api(app).get(`${base(alphaId)}/memberships?status=EXPELLED`).set(as(alice)).expect(400));

    it("BREACH IF FAILING: Beta's members never appear in Alpha's list", async () => {
      const res = await api(app).get(`${base(alphaId)}/memberships?limit=100`).set(as(alice)).expect(200);
      const institutions = new Set(res.body.data.map((m: { institutionId: string }) => m.institutionId));
      expect([...institutions]).toEqual([alphaId]);
    });
  });

  // =========================================================================
  describe('finding a person to add', () => {
    const lookup = (who: Session, institutionId: string, email: string) =>
      api(app).get(`${base(institutionId)}/memberships/lookup`).query({ email }).set(as(who));

    it('finds a registered account by its exact address', async () => {
      const res = await lookup(alice, alphaId, '  CARA@school.test ').expect(200);
      expect(res.body.data).toMatchObject({
        id: cara.userId,
        fullName: 'Cara Candidate',
        emailVerified: true,
        accountActive: true,
        currentMemberships: [],
      });
    });

    it('PRIVACY: is not a search — a partial address is rejected', async () => {
      await lookup(alice, alphaId, 'cara').expect(400);
      await lookup(alice, alphaId, '@school.test').expect(400);
    });

    it('PRIVACY: never reveals memberships at other institutions', async () => {
      const res = await lookup(alice, alphaId, 'multi@school.test').expect(200);
      expect(res.body.data.currentMemberships).toEqual([
        expect.objectContaining({ role: 'STUDENT', status: 'ACTIVE' }),
      ]);
      expect(JSON.stringify(res.body)).not.toContain(betaId);
    });

    it('reports an unknown address as 404', () => lookup(alice, alphaId, 'ghost@school.test').expect(404));

    it.each([
      ['staff', () => sam],
      ['a teacher', () => tom],
      ['a student', () => sue],
    ])('is denied to %s', async (_l, who) => {
      await lookup(who(), alphaId, 'cara@school.test').expect(404);
    });

    it('BREACH IF FAILING: an admin of Beta cannot look up through Alpha', () =>
      lookup(bob, alphaId, 'cara@school.test').expect(404));
  });

  // =========================================================================
  describe('adding members', () => {
    const add = (who: Session, institutionId: string, body: Record<string, unknown>) =>
      api(app).post(`${base(institutionId)}/memberships`).set(as(who)).send(body);

    it('SECURITY: refuses an account whose email is not verified', async () => {
      const res = await add(alice, alphaId, { userId: una.userId, role: 'STUDENT' }).expect(400);
      expect(res.body.error.message).toMatch(/not verified/i);
      expect(await prisma.institutionMembership.count({ where: { userId: una.userId } })).toBe(0);
    });

    it('adds a verified account and records who added them', async () => {
      const res = await add(alice, alphaId, { userId: cara.userId, role: 'STUDENT', institutionMemberId: 'AL-003' }).expect(201);
      expect(res.body.data).toMatchObject({
        institutionId: alphaId,
        role: 'STUDENT',
        status: 'ACTIVE',
        createdBy: { id: alice.userId, fullName: 'Alice Admin' },
      });
      expect(res.body.data.joinedAt).toBeTruthy();
    });

    it('the dashboard count moves with the data — nothing is hardcoded', async () => {
      const res = await api(app).get(`${base(alphaId)}/overview`).set(as(alice)).expect(200);
      expect(res.body.data.members.active.students).toBe(3);
    });

    it('the new member sees it in their education history', async () => {
      const res = await api(app).get('/api/v1/profiles/me').set(as(cara)).expect(200);
      expect(res.body.data.education).toEqual([
        expect.objectContaining({ role: 'STUDENT', current: true, institution: expect.objectContaining({ name: 'Alpha School' }) }),
      ]);
    });

    it('refuses the same role twice', () =>
      add(alice, alphaId, { userId: cara.userId, role: 'STUDENT' }).expect(409));

    it('allows a second, different role for the same person', () =>
      add(alice, alphaId, { userId: cara.userId, role: 'TEACHER' }).expect(201));

    it('refuses a member ID already used by another active member', () =>
      add(alice, alphaId, { userId: tom.userId, role: 'STUDENT', institutionMemberId: 'AL-001' }).expect(409));

    it('ESCALATION: making someone a school admin never touches their platform role', async () => {
      await add(alice, alphaId, { userId: cara.userId, role: 'INSTITUTION_ADMIN' }).expect(201);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: cara.userId } });
      expect(user.platformRole).toBe(PlatformRole.USER);
      // And it grants nothing platform-wide.
      await api(app).get('/api/v1/users').set(as(cara)).expect(403);
    });

    it.each([
      [{ platformRole: 'SUPER_ADMIN' }],
      [{ institutionId: 'x' }],
      [{ status: 'ACTIVE' }],
    ])('ESCALATION: rejects the extra field %j', async (extra) => {
      await add(alice, alphaId, { userId: tom.userId, role: 'STAFF', ...extra }).expect(400);
    });

    it('staff cannot add members', () =>
      add(sam, alphaId, { userId: tom.userId, role: 'STAFF' }).expect(404));

    it('platform staff can add members anywhere (support override)', () =>
      add(priya, betaId, { userId: cara.userId, role: 'STUDENT' }).expect(201));
  });

  // =========================================================================
  describe('changing a membership', () => {
    it('an admin corrects a role', async () => {
      const res = await api(app)
        .patch(`${base(alphaId)}/memberships/${sueMembershipId}`)
        .set(as(alice))
        .send({ role: 'TEACHER' })
        .expect(200);
      expect(res.body.data.role).toBe('TEACHER');
    });

    it('cannot change into a role the person already holds there', async () => {
      // cara already holds both STUDENT and TEACHER at Alpha.
      const caraStudent = await prisma.institutionMembership.findFirstOrThrow({
        where: { userId: cara.userId, institutionId: alphaId, role: MembershipRole.STUDENT },
      });
      await api(app)
        .patch(`${base(alphaId)}/memberships/${caraStudent.id}`)
        .set(as(alice))
        .send({ role: 'TEACHER' })
        .expect(409);
    });

    it('an empty change is rejected', () =>
      api(app).patch(`${base(alphaId)}/memberships/${sueMembershipId}`).set(as(alice)).send({}).expect(400));

    it('staff cannot change memberships', () =>
      api(app)
        .patch(`${base(alphaId)}/memberships/${sueMembershipId}`)
        .set(as(sam))
        .send({ role: 'STUDENT' })
        .expect(404));

    it("BREACH IF FAILING: Beta's admin cannot change Alpha's membership through Beta's URL", async () => {
      await api(app)
        .patch(`${base(betaId)}/memberships/${sueMembershipId}`)
        .set(as(bob))
        .send({ role: 'STUDENT' })
        .expect(404);
      const sueRow = await prisma.institutionMembership.findUniqueOrThrow({ where: { id: sueMembershipId } });
      expect(sueRow.role).toBe(MembershipRole.TEACHER); // untouched
    });

    it("BREACH IF FAILING: Beta's admin cannot end Alpha's membership through Beta's URL", async () => {
      await api(app)
        .patch(`${base(betaId)}/memberships/${sueMembershipId}/status`)
        .set(as(bob))
        .send({ status: 'LEFT' })
        .expect(404);
    });
  });

  // =========================================================================
  describe('suspending and ending', () => {
    const setStatus = (who: Session, membershipId: string, status: string) =>
      api(app).patch(`${base(alphaId)}/memberships/${membershipId}/status`).set(as(who)).send({ status });

    it('suspending staff removes their access immediately; reinstating restores it', async () => {
      await setStatus(alice, samMembershipId, 'SUSPENDED').expect(200);
      await api(app).get(`${base(alphaId)}/overview`).set(as(sam)).expect(404);

      await setStatus(alice, samMembershipId, 'ACTIVE').expect(200);
      await api(app).get(`${base(alphaId)}/overview`).set(as(sam)).expect(200);
    });

    it('rejects statuses an admin does not decide', async () => {
      await setStatus(alice, samMembershipId, 'PENDING').expect(400);
      await setStatus(alice, samMembershipId, 'REJECTED').expect(400);
    });

    it('ending a membership keeps it as history, with the end date', async () => {
      const res = await setStatus(alice, sueMembershipId, 'LEFT').expect(200);
      expect(res.body.data.status).toBe('LEFT');
      expect(res.body.data.leftAt).toBeTruthy();

      // Not deleted...
      expect(await prisma.institutionMembership.count({ where: { id: sueMembershipId } })).toBe(1);
      // ...and still in Sue's education history, as a past entry.
      const profile = await api(app).get('/api/v1/profiles/me').set(as(sue)).expect(200);
      expect(profile.body.data.education).toEqual([
        expect.objectContaining({ status: 'LEFT', current: false }),
      ]);
    });

    it('an ended membership is final; re-enrolment creates a new one', async () => {
      await setStatus(alice, sueMembershipId, 'ACTIVE').expect(409);
      await api(app)
        .post(`${base(alphaId)}/memberships`)
        .set(as(alice))
        .send({ userId: sue.userId, role: 'STUDENT' })
        .expect(201);

      const profile = await api(app).get('/api/v1/profiles/me').set(as(sue)).expect(200);
      expect(profile.body.data.education.map((e: { current: boolean }) => e.current)).toEqual([true, false]);
    });
  });

  // =========================================================================
  describe('an institution always keeps an administrator', () => {
    it('the only admin cannot end, suspend or demote themselves', async () => {
      // Remove cara's admin role first so alice is the only admin at Alpha.
      const caraAdmin = await prisma.institutionMembership.findFirstOrThrow({
        where: { userId: cara.userId, institutionId: alphaId, role: MembershipRole.INSTITUTION_ADMIN },
      });
      await api(app)
        .patch(`${base(alphaId)}/memberships/${caraAdmin.id}/status`)
        .set(as(alice))
        .send({ status: 'LEFT' })
        .expect(200);

      for (const status of ['LEFT', 'SUSPENDED']) {
        const res = await api(app)
          .patch(`${base(alphaId)}/memberships/${aliceMembershipId}/status`)
          .set(as(alice))
          .send({ status })
          .expect(409);
        expect(res.body.error.message).toMatch(/only active administrator/i);
      }
      await api(app)
        .patch(`${base(alphaId)}/memberships/${aliceMembershipId}`)
        .set(as(alice))
        .send({ role: 'STAFF' })
        .expect(409);
    });

    it('with a second admin in place, the first may step down', async () => {
      const second = await api(app)
        .post(`${base(alphaId)}/memberships`)
        .set(as(alice))
        .send({ userId: tom.userId, role: 'INSTITUTION_ADMIN' })
        .expect(201);
      expect(second.body.data.role).toBe('INSTITUTION_ADMIN');

      await api(app)
        .patch(`${base(alphaId)}/memberships/${aliceMembershipId}`)
        .set(as(alice))
        .send({ role: 'STAFF' })
        .expect(200);

      // Alice is now staff: she can still view, but no longer manage.
      const view = await api(app).get(`${base(alphaId)}/overview`).set(as(alice)).expect(200);
      expect(view.body.data.viewer.canManage).toBe(false);
    });

    it('RACE: two admins removing each other at the same moment never leaves zero admins', async () => {
      // Called on the service directly, 20 rounds in parallel pairs: going
      // through HTTP adds enough per-request latency that the two
      // transactions rarely overlap, and a race test that never races
      // proves nothing.
      const service = app.get(MembershipsService);
      let rejected = 0;

      for (let round = 0; round < 20; round += 1) {
        const inst = await prisma.institution.create({
          data: {
            id: uuidv7(),
            name: `Race ${round}`,
            slug: `race-${round}-${uuidv7().slice(-6)}`,
            category: InstitutionCategory.SCHOOL,
            countryCode: 'IN',
          },
        });
        const [a, b] = await Promise.all(
          [bob.userId, cara.userId].map((userId) =>
            prisma.institutionMembership.create({
              data: {
                id: uuidv7(),
                userId,
                institutionId: inst.id,
                role: MembershipRole.INSTITUTION_ADMIN,
                status: MembershipStatus.ACTIVE,
                joinedAt: new Date(),
              },
            }),
          ),
        );
        const ctx = (membershipId: string) => ({
          institutionId: inst.id,
          membershipId,
          membershipRole: MembershipRole.INSTITUTION_ADMIN,
        });

        const outcomes = await Promise.allSettled([
          service.changeStatus(ctx(a!.id), b!.id, { status: MembershipStatus.SUSPENDED }, {
            id: bob.userId,
            platformRole: PlatformRole.USER,
          }),
          service.changeStatus(ctx(b!.id), a!.id, { status: MembershipStatus.SUSPENDED }, {
            id: cara.userId,
            platformRole: PlatformRole.USER,
          }),
        ]);
        rejected += outcomes.filter((o) => o.status === 'rejected').length;

        const remaining = await prisma.institutionMembership.count({
          where: {
            institutionId: inst.id,
            role: MembershipRole.INSTITUTION_ADMIN,
            status: MembershipStatus.ACTIVE,
          },
        });
        expect(remaining).toBe(1);
      }

      // Exactly one of each pair must have been refused.
      expect(rejected).toBe(20);
    });
  });
});
