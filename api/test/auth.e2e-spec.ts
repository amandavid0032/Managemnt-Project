import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/database/prisma.service';
import { api, createTestApp, resetDatabase } from './helpers';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(() => resetDatabase(prisma));
  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const valid = {
    email: 'user@auth.test',
    password: 'ValidPass123',
    fullName: 'Auth User',
  };

  describe('privilege escalation — the flaw in the previous backend', () => {
    /**
     * The old Express handler did `User.create({ name, email, password, role })`
     * with role straight from req.body, so any client could register as
     * super_admin. These tests exist to keep that from ever returning.
     */
    it.each([
      ['role', { role: 'super_admin' }],
      ['platformRole', { platformRole: 'SUPER_ADMIN' }],
      ['status', { status: 'ACTIVE' }],
      ['tokenVersion', { tokenVersion: 99 }],
      ['id', { id: '00000000-0000-7000-8000-000000000000' }],
    ])('rejects a registration carrying %s', async (_label, extra) => {
      const res = await api(app)
        .post('/api/v1/auth/register')
        .send({ ...valid, ...extra })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.user.count()).toBe(0);
    });

    it('always assigns the USER platform role', async () => {
      await api(app).post('/api/v1/auth/register').send(valid).expect(201);
      const user = await prisma.user.findFirstOrThrow({ where: { email: valid.email } });
      expect(user.platformRole).toBe('USER');
    });

    it('never returns the password hash', async () => {
      const res = await api(app).post('/api/v1/auth/register').send(valid).expect(201);
      expect(JSON.stringify(res.body)).not.toContain('argon2');
      expect(res.body.data.passwordHash).toBeUndefined();
    });
  });

  describe('validation', () => {
    it.each([
      ['too short', 'Short1'],
      ['no uppercase', 'alllowercase123'],
      ['no lowercase', 'ALLUPPERCASE123'],
      ['no digit', 'NoDigitsInHere'],
    ])('rejects a password that is %s', (_l, password) =>
      api(app).post('/api/v1/auth/register').send({ ...valid, password }).expect(400),
    );

    it('rejects a malformed email', () =>
      api(app).post('/api/v1/auth/register').send({ ...valid, email: 'nope' }).expect(400));

    it('stores the email lowercased', async () => {
      await api(app)
        .post('/api/v1/auth/register')
        .send({ ...valid, email: 'MiXeD@Auth.Test' })
        .expect(201);
      const user = await prisma.user.findFirstOrThrow({});
      expect(user.email).toBe('mixed@auth.test');
    });

    it('treats a case-variant email as a duplicate', async () => {
      await api(app).post('/api/v1/auth/register').send(valid).expect(201);
      await api(app)
        .post('/api/v1/auth/register')
        .send({ ...valid, email: 'USER@AUTH.TEST' })
        .expect(409);
    });
  });

  describe('login', () => {
    beforeEach(() => api(app).post('/api/v1/auth/register').send(valid).expect(201));

    it('issues an access token and a refresh cookie', async () => {
      const res = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: valid.password })
        .expect(200);

      expect(res.body.data.accessToken).toEqual(expect.any(String));

      const cookies = res.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith('eduhub_refresh='));
      expect(refresh).toBeDefined();
      // Not readable by JavaScript, so XSS cannot exfiltrate it.
      expect(refresh).toContain('HttpOnly');
      expect(refresh).toMatch(/SameSite=Lax/i);
    });

    it('does not disclose whether an email is registered', async () => {
      const wrongPassword = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: 'WrongPass123' });
      const unknownEmail = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@auth.test', password: 'WrongPass123' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    });

    it('stores the refresh token hashed, never in plaintext', async () => {
      const res = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: valid.password })
        .expect(200);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      const raw = /eduhub_refresh=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '';
      const stored = await prisma.refreshToken.findFirstOrThrow({});

      expect(raw.length).toBeGreaterThan(0);
      expect(stored.tokenHash).not.toBe(raw);
      expect(stored.tokenHash).toHaveLength(64);
    });
  });

  describe('refresh rotation and reuse detection', () => {
    const login = async () => {
      await api(app).post('/api/v1/auth/register').send(valid).expect(201);
      const res = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: valid.password })
        .expect(200);
      return (res.headers['set-cookie'] as unknown as string[]).join(';');
    };

    it('rotates the refresh token', async () => {
      const first = await login();
      const res = await api(app).post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
      const rotated = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(rotated).not.toBe(first);
    });

    it('revokes the token on logout', async () => {
      const cookie = await login();
      await api(app).post('/api/v1/auth/logout').set('Cookie', cookie).expect(200);
      await api(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('rejects a refresh request with no cookie', () =>
      api(app).post('/api/v1/auth/refresh').expect(401));

    const refreshCookie = (res: { headers: Record<string, unknown> }) =>
      ((res.headers['set-cookie'] as string[] | undefined) ?? []).join(';');

    it('BREACH IF FAILING: only one of several simultaneous refreshes with the same token succeeds', async () => {
      const cookie = await login();

      const results = await Promise.all(
        Array.from({ length: 5 }, () => api(app).post('/api/v1/auth/refresh').set('Cookie', cookie)),
      );

      const winners = results.filter((r) => r.status === 200);
      expect(winners).toHaveLength(1);
      expect(results.filter((r) => r.status === 401)).toHaveLength(4);

      // Exactly one live token: the winner's. A second live token would be a
      // second session the reuse detector does not know about.
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);

      // The race must not log the legitimate user out: the winner keeps working.
      await api(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(winners[0]!)).expect(200);
    });

    it('links a rotated token to its replacement', async () => {
      const cookie = await login();
      const res = await api(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);

      const tokens = await prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
      expect(tokens).toHaveLength(2);
      const [old, current] = tokens as [(typeof tokens)[number], (typeof tokens)[number]];
      expect(old.revokedAt).not.toBeNull();
      expect(old.replacedById).toBe(current.id);
      expect(current.revokedAt).toBeNull();
      expect(current.familyId).toBe(old.familyId);

      // The rotated token keeps rotating normally.
      await api(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(res)).expect(200);
    });

    it('treats a replay seconds after rotation as a lost race, not theft', async () => {
      // Two tabs share one cookie and refresh at nearly the same moment. The
      // loser must be refused WITHOUT revoking the family, or every multi-tab
      // user would be signed out at random.
      const original = await login();
      const res = await api(app).post('/api/v1/auth/refresh').set('Cookie', original).expect(200);

      await api(app).post('/api/v1/auth/refresh').set('Cookie', original).expect(401);

      await api(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(res)).expect(200);
    });

    it('BREACH IF FAILING: rejects a replayed refresh token and revokes the family', async () => {
      const original = await login();
      const res = await api(app).post('/api/v1/auth/refresh').set('Cookie', original).expect(200);

      // Age the rotation past the grace window instead of sleeping.
      await prisma.refreshToken.updateMany({
        where: { revokedAt: { not: null } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      await api(app).post('/api/v1/auth/refresh').set('Cookie', original).expect(401);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
      await api(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(res)).expect(401);
    });
  });

  describe('protected routes', () => {
    it('rejects /auth/me without a token', () => api(app).get('/api/v1/auth/me').expect(401));

    it('rejects a forged token', () =>
      api(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.token').expect(401));

    it('BREACH IF FAILING: revokes access when tokenVersion is bumped', async () => {
      await api(app).post('/api/v1/auth/register').send(valid).expect(201);
      const login = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: valid.password })
        .expect(200);
      const token = login.body.data.accessToken;

      await api(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

      await prisma.user.updateMany({ data: { tokenVersion: { increment: 1 } } });

      // Immediate, without waiting for the 15-minute expiry.
      await api(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    });

    it('BREACH IF FAILING: revokes access when the account is suspended', async () => {
      await api(app).post('/api/v1/auth/register').send(valid).expect(201);
      const login = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: valid.password })
        .expect(200);

      await prisma.user.updateMany({ data: { status: 'SUSPENDED' } });

      await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .expect(401);
    });
  });

  describe('/auth/me', () => {
    /** Registers, logs in, and returns both credentials. */
    const signIn = async () => {
      await api(app).post('/api/v1/auth/register').send(valid).expect(201);
      const res = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: valid.password })
        .expect(200);
      return {
        accessToken: res.body.data.accessToken as string,
        cookie: (res.headers['set-cookie'] as unknown as string[]).join(';'),
      };
    };

    it('returns the user with their memberships', async () => {
      const { accessToken } = await signIn();

      const res = await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.user.email).toBe(valid.email);
      expect(res.body.data.user.platformRole).toBe('USER');
      expect(res.body.data.memberships).toEqual([]);
      // The credential must never ride along in the profile payload.
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('reports an ACTIVE membership but not a PENDING one', async () => {
      const { accessToken } = await signIn();
      const user = await prisma.user.findFirstOrThrow({ where: { email: valid.email } });

      const makeInstitution = (suffix: string) =>
        prisma.institution.create({
          data: {
            id: `00000000-0000-7000-8000-00000000000${suffix}`,
            slug: `me-test-${suffix}`,
            name: `Me Test ${suffix}`,
            category: 'SCHOOL',
            countryCode: 'GB',
            status: 'PUBLISHED',
          },
        });

      const active = await makeInstitution('1');
      const pending = await makeInstitution('2');

      await prisma.institutionMembership.createMany({
        data: [
          {
            id: '00000000-0000-7000-8000-0000000000a1',
            userId: user.id,
            institutionId: active.id,
            role: 'INSTITUTION_ADMIN',
            status: 'ACTIVE',
          },
          {
            id: '00000000-0000-7000-8000-0000000000a2',
            userId: user.id,
            institutionId: pending.id,
            role: 'STUDENT',
            status: 'PENDING',
          },
        ],
      });

      const res = await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // A PENDING request is not access. Returning it would make the UI offer
      // a dashboard that every API call behind it answers with 404.
      expect(res.body.data.memberships).toEqual([
        {
          institutionId: active.id,
          slug: 'me-test-1',
          name: 'Me Test 1',
          role: 'INSTITUTION_ADMIN',
        },
      ]);
    });
  });

  describe('/auth/logout-all', () => {
    const signInTwice = async () => {
      await api(app).post('/api/v1/auth/register').send(valid).expect(201);
      const first = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: valid.password })
        .expect(200);
      const second = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: valid.email, password: valid.password })
        .expect(200);
      return { first, second };
    };

    it('requires authentication', () =>
      api(app).post('/api/v1/auth/logout-all').expect(401));

    it('BREACH IF FAILING: kills every session on every device', async () => {
      const { first, second } = await signInTwice();
      const firstCookie = (first.headers['set-cookie'] as unknown as string[]).join(';');
      const secondCookie = (second.headers['set-cookie'] as unknown as string[]).join(';');

      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(2);

      const res = await api(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${first.body.data.accessToken}`)
        .expect(200);

      expect(res.body.data.sessionsRevoked).toBe(2);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);

      // Access tokens die immediately via tokenVersion — including the OTHER
      // device's, which never sent a request.
      await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${first.body.data.accessToken}`)
        .expect(401);
      await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${second.body.data.accessToken}`)
        .expect(401);

      // ...and neither device can mint a new one.
      await api(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie).expect(401);
      await api(app).post('/api/v1/auth/refresh').set('Cookie', secondCookie).expect(401);
    });

    it('leaves other users untouched', async () => {
      const { first } = await signInTwice();

      const other = { email: 'other@auth.test', password: 'ValidPass123', fullName: 'Other' };
      await api(app).post('/api/v1/auth/register').send(other).expect(201);
      const otherLogin = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: other.email, password: other.password })
        .expect(200);

      await api(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${first.body.data.accessToken}`)
        .expect(200);

      await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${otherLogin.body.data.accessToken}`)
        .expect(200);
    });
  });
});
