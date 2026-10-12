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

    it('BREACH IF FAILING: rejects a replayed refresh token and revokes the family', async () => {
      const original = await login();
      await api(app).post('/api/v1/auth/refresh').set('Cookie', original).expect(200);

      // Replay of the consumed token — the signal that it was stolen.
      await api(app).post('/api/v1/auth/refresh').set('Cookie', original).expect(401);

      const active = await prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(active).toBe(0); // whole family revoked
    });

    it('revokes the token on logout', async () => {
      const cookie = await login();
      await api(app).post('/api/v1/auth/logout').set('Cookie', cookie).expect(200);
      await api(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('rejects a refresh request with no cookie', () =>
      api(app).post('/api/v1/auth/refresh').expect(401));
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
});
