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
import { api, createTestApp, registerAndLogin, resetDatabase } from './helpers';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The shape of an education entry as it arrives over HTTP (dates as strings). */
interface Entry {
  role: string;
  status: string;
  current: boolean;
  leftAt: string | null;
  institutionMemberId?: string | null;
  institution: { name: string; slug: string | null };
}

describe('Profiles and education history (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let owner: { userId: string; accessToken: string };
  let other: { userId: string; accessToken: string };
  let staff: { userId: string; accessToken: string };

  let publishedId: string;
  let draftId: string;
  let secondPublishedId: string;

  const institution = (name: string, slug: string, status: InstitutionStatus) => ({
    id: uuidv7(),
    name,
    slug,
    category: InstitutionCategory.SCHOOL,
    countryCode: 'GB',
    city: 'Leeds',
    status,
  });

  const membership = (
    userId: string,
    institutionId: string,
    role: MembershipRole,
    status: MembershipStatus,
    extra: { joinedAt?: Date; leftAt?: Date; institutionMemberId?: string } = {},
  ) => ({ id: uuidv7(), userId, institutionId, role, status, ...extra });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);

    const published = institution('Hillcrest School', 'hillcrest-school', InstitutionStatus.PUBLISHED);
    const draft = institution('Secret Draft College', 'secret-draft', InstitutionStatus.DRAFT);
    const second = institution('Valley College', 'valley-college', InstitutionStatus.PUBLISHED);
    await prisma.institution.createMany({ data: [published, draft, second] });
    publishedId = published.id;
    draftId = draft.id;
    secondPublishedId = second.id;

    owner = await registerAndLogin(app, 'owner@profiles.test', 'Olive Owner');
    other = await registerAndLogin(app, 'other@profiles.test', 'Oscar Other');
    staff = await registerAndLogin(app, 'staff@profiles.test', 'Stella Staff');
    await prisma.user.update({
      where: { id: staff.userId },
      data: { platformRole: PlatformRole.PLATFORM_ADMIN },
    });

    await prisma.institutionMembership.createMany({
      data: [
        // Current, at a published school — the headline entry.
        membership(owner.userId, publishedId, MembershipRole.STUDENT, MembershipStatus.ACTIVE, {
          joinedAt: new Date('2024-09-01'),
          institutionMemberId: 'HC-2024-77',
        }),
        // Ended: history that must survive.
        membership(owner.userId, secondPublishedId, MembershipRole.STUDENT, MembershipStatus.LEFT, {
          joinedAt: new Date('2019-09-01'),
          leftAt: new Date('2024-06-30'),
        }),
        // At a draft institution: never shown publicly.
        membership(owner.userId, draftId, MembershipRole.TEACHER, MembershipStatus.ACTIVE, {
          joinedAt: new Date('2025-01-01'),
        }),
        // Pending and rejected requests.
        membership(owner.userId, publishedId, MembershipRole.TEACHER, MembershipStatus.PENDING),
        membership(owner.userId, secondPublishedId, MembershipRole.STAFF, MembershipStatus.REJECTED),
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  describe('my profile', () => {
    it('requires authentication', () => api(app).get('/api/v1/profiles/me').expect(401));

    it('returns an empty PRIVATE profile for a user who never created one', async () => {
      const res = await api(app).get('/api/v1/profiles/me').set(bearer(other.accessToken)).expect(200);
      expect(res.body.data.profile).toMatchObject({
        headline: null,
        bio: null,
        location: null,
        visibility: 'PRIVATE',
      });
      expect(res.body.data.user.email).toBe('other@profiles.test');
    });

    it('never returns credential material', async () => {
      const res = await api(app).get('/api/v1/profiles/me').set(bearer(owner.accessToken)).expect(200);
      const json = JSON.stringify(res.body);
      expect(json).not.toMatch(/passwordHash|tokenVersion|password_hash/);
    });

    it('creates the profile on first update and returns it', async () => {
      const res = await api(app)
        .patch('/api/v1/profiles/me')
        .set(bearer(owner.accessToken))
        .send({ headline: '  Physics student  ', bio: 'I like optics.', location: 'Leeds, UK' })
        .expect(200);

      expect(res.body.data.profile).toMatchObject({
        headline: 'Physics student', // trimmed
        bio: 'I like optics.',
        location: 'Leeds, UK',
        visibility: 'PRIVATE', // saving content never publishes
      });
      expect(res.body.data.profile.createdAt).toBeTruthy();
    });

    it('updates fullName on the account', async () => {
      await api(app)
        .patch('/api/v1/profiles/me')
        .set(bearer(owner.accessToken))
        .send({ fullName: 'Olive O. Owner' })
        .expect(200);
      const me = await api(app).get('/api/v1/auth/me').set(bearer(owner.accessToken)).expect(200);
      expect(me.body.data.user.fullName).toBe('Olive O. Owner');
    });

    it('clears a field with null or a blank string, and leaves omitted fields alone', async () => {
      const res = await api(app)
        .patch('/api/v1/profiles/me')
        .set(bearer(owner.accessToken))
        .send({ location: '   ' })
        .expect(200);
      expect(res.body.data.profile.location).toBeNull();
      expect(res.body.data.profile.headline).toBe('Physics student');

      const cleared = await api(app)
        .patch('/api/v1/profiles/me')
        .set(bearer(owner.accessToken))
        .send({ location: null })
        .expect(200);
      expect(cleared.body.data.profile.location).toBeNull();
    });

    it.each([
      ['headline over 160 chars', { headline: 'x'.repeat(161) }, /headline/],
      ['bio over 2000 chars', { bio: 'x'.repeat(2001) }, /bio/],
      ['location over 120 chars', { location: 'x'.repeat(121) }, /location/],
      ['one-letter fullName', { fullName: 'A' }, /fullName/],
      ['null fullName', { fullName: null }, /fullName/],
      ['numeric headline', { headline: 42 }, /headline/],
    ])('rejects invalid input: %s', async (_label, body, field) => {
      const res = await api(app)
        .patch('/api/v1/profiles/me')
        .set(bearer(owner.accessToken))
        .send(body)
        .expect(400);
      expect(res.body.error.details.join(' ')).toMatch(field);
    });

    it.each([
      [{ email: 'stolen@profiles.test' }],
      [{ platformRole: 'SUPER_ADMIN' }],
      [{ status: 'ACTIVE' }],
      [{ visibility: 'PUBLIC' }],
      [{ userId: '00000000-0000-7000-8000-000000000000' }],
    ])('ESCALATION: rejects non-profile field %j', async (body) => {
      await api(app).patch('/api/v1/profiles/me').set(bearer(owner.accessToken)).send(body).expect(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('education history (owner view)', () => {
    let education: Entry[];

    beforeAll(async () => {
      const res = await api(app).get('/api/v1/profiles/me').set(bearer(owner.accessToken)).expect(200);
      education = res.body.data.education;
    });

    it('lists every institution the owner is linked to, except rejected requests', () => {
      expect(education).toHaveLength(4);
      expect(education.find((e) => e.status === 'REJECTED')).toBeUndefined();
    });

    it('keeps ended memberships as history, with their dates', () => {
      const ended = education.find((e) => e.status === 'LEFT');
      expect(ended).toMatchObject({
        current: false,
        institution: { name: 'Valley College', slug: 'valley-college' },
      });
      expect(ended!.leftAt).toBe(new Date('2024-06-30').toISOString());
    });

    it('marks current memberships and lists them first', () => {
      expect(education[0]!.current).toBe(true);
      const firstEnded = education.findIndex((e) => !e.current);
      expect(education.slice(firstEnded).every((e) => !e.current)).toBe(true);
    });

    it('shows the owner their institution member id', () => {
      const current = education.find((e) => e.institution.name === 'Hillcrest School' && e.role === 'STUDENT');
      expect(current!.institutionMemberId).toBe('HC-2024-77');
    });

    it('shows the draft institution to the owner but without a public link', () => {
      const draft = education.find((e) => e.institution.name === 'Secret Draft College');
      expect(draft!.institution.slug).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('visibility', () => {
    const setVisibility = (visibility: string) =>
      api(app)
        .patch('/api/v1/profiles/me/visibility')
        .set(bearer(owner.accessToken))
        .send({ visibility })
        .expect(200);

    const view = (token?: string) => {
      const req = api(app).get(`/api/v1/profiles/${owner.userId}`);
      return token ? req.set(bearer(token)) : req;
    };

    it('PRIVATE (the default): hidden from anonymous visitors and other users, as 404', async () => {
      await setVisibility('PRIVATE');
      await view().expect(404);
      await view(other.accessToken).expect(404);
    });

    it('PRIVATE: the owner and platform staff can still see it', async () => {
      await setVisibility('PRIVATE');
      const mine = await view(owner.accessToken).expect(200);
      expect(mine.body.data.isOwner).toBe(true);
      await view(staff.accessToken).expect(200);
    });

    it('MEMBERS: visible to signed-in users only', async () => {
      await setVisibility('MEMBERS');
      await view().expect(404);
      await view(other.accessToken).expect(200);
    });

    it('PUBLIC: visible to everyone', async () => {
      await setVisibility('PUBLIC');
      const res = await view().expect(200);
      expect(res.body.data).toMatchObject({ fullName: 'Olive O. Owner', headline: 'Physics student' });
    });

    it('rejects an unknown visibility value', () =>
      api(app)
        .patch('/api/v1/profiles/me/visibility')
        .set(bearer(owner.accessToken))
        .send({ visibility: 'EVERYONE' })
        .expect(400));

    it('a private profile and a non-existent user are indistinguishable', async () => {
      await setVisibility('PRIVATE');
      const hidden = await view().expect(404);
      const missing = await api(app).get(`/api/v1/profiles/${uuidv7()}`).expect(404);
      expect(hidden.body.error.message).toBe(missing.body.error.message);
    });
  });

  // -------------------------------------------------------------------------
  describe('public profile content', () => {
    let body: { email?: string; education: Entry[] };

    beforeAll(async () => {
      await api(app)
        .patch('/api/v1/profiles/me/visibility')
        .set(bearer(owner.accessToken))
        .send({ visibility: 'PUBLIC' })
        .expect(200);
      body = (await api(app).get(`/api/v1/profiles/${owner.userId}`).expect(200)).body.data;
    });

    it('PRIVACY: never exposes the email address', () => {
      expect(JSON.stringify(body)).not.toContain('owner@profiles.test');
      expect(body.email).toBeUndefined();
    });

    it('PRIVACY: never exposes institution member ids', () => {
      expect(JSON.stringify(body)).not.toContain('HC-2024-77');
    });

    it('shows only settled history at published institutions', () => {
      const names = body.education.map(
        (e) => `${e.institution.name}:${e.status}`,
      );
      expect(names.sort()).toEqual(['Hillcrest School:ACTIVE', 'Valley College:LEFT']);
    });

    it('hides a suspended account from everyone but platform staff', async () => {
      await prisma.user.update({ where: { id: owner.userId }, data: { status: UserStatus.SUSPENDED } });
      try {
        await api(app).get(`/api/v1/profiles/${owner.userId}`).expect(404);
        await api(app).get(`/api/v1/profiles/${owner.userId}`).set(bearer(staff.accessToken)).expect(200);
      } finally {
        await prisma.user.update({ where: { id: owner.userId }, data: { status: UserStatus.ACTIVE } });
      }
    });

    it('rejects a malformed id', () => api(app).get('/api/v1/profiles/not-a-uuid').expect(400));
  });

  // -------------------------------------------------------------------------
  describe('multi-institution users', () => {
    it('one account carries memberships at several institutions, in different roles', async () => {
      const res = await api(app).get('/api/v1/profiles/me').set(bearer(owner.accessToken)).expect(200);
      const institutions = new Set(
        (res.body.data.education as Entry[]).map((e) => e.institution.name),
      );
      const roles = new Set((res.body.data.education as Entry[]).map((e) => e.role));
      expect(institutions.size).toBe(3);
      expect(roles.has('STUDENT') && roles.has('TEACHER')).toBe(true);
    });
  });
});
