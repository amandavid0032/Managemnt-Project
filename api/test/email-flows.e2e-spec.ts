import type { INestApplication } from '@nestjs/common';
import { EmailTokenPurpose, UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../src/database/prisma.service';
import {
  api,
  createTestApp,
  mailbox,
  registerAndLogin,
  resetDatabase,
  tokenFromEmail,
} from './helpers';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

/**
 * Password reset and email verification.
 *
 * Every token used below is read out of the captured email, the same way a
 * person gets it. Reaching into the database for it would skip the part of
 * the flow most likely to break — the link itself.
 */
describe('Email flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    mailbox(app).clear();
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  describe('email verification', () => {
    it('sends a verification email on registration, with the token in the URL fragment', async () => {
      await registerAndLogin(app, 'new@flows.test');

      const mail = mailbox(app).outbox.find((m) => m.to === 'new@flows.test');
      expect(mail?.subject).toMatch(/confirm/i);
      // Fragment, not query string: it never reaches a server log or a Referer.
      expect(mail?.text).toMatch(/\/verify-email#token=/);
      expect(mail?.text).not.toMatch(/\?token=/);
    });

    it('stores only a SHA-256 of the token, never the raw value', async () => {
      await registerAndLogin(app, 'hash@flows.test');
      const raw = tokenFromEmail(app, 'hash@flows.test', '/verify-email');

      const rows = await prisma.emailToken.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.tokenHash).toBe(sha256(raw));
      expect(JSON.stringify(rows)).not.toContain(raw);
    });

    it('a new account is unverified, and /auth/me says so', async () => {
      const { accessToken } = await registerAndLogin(app, 'me@flows.test');
      const me = await api(app).get('/api/v1/auth/me').set(bearer(accessToken)).expect(200);
      expect(me.body.data.user.emailVerifiedAt).toBeNull();
    });

    it('verifies the address with the emailed token', async () => {
      const { accessToken } = await registerAndLogin(app, 'v@flows.test');
      const token = tokenFromEmail(app, 'v@flows.test', '/verify-email');

      await api(app).post('/api/v1/auth/email/verify').send({ token }).expect(200);

      const me = await api(app).get('/api/v1/auth/me').set(bearer(accessToken)).expect(200);
      expect(me.body.data.user.emailVerifiedAt).not.toBeNull();
    });

    it('a verification token works exactly once', async () => {
      await registerAndLogin(app, 'once@flows.test');
      const token = tokenFromEmail(app, 'once@flows.test', '/verify-email');

      await api(app).post('/api/v1/auth/email/verify').send({ token }).expect(200);
      const replay = await api(app).post('/api/v1/auth/email/verify').send({ token }).expect(400);
      expect(replay.body.error.message).toBe('This link is invalid or has expired');
    });

    it('rejects an unknown token with the same message as a used one', async () => {
      const res = await api(app)
        .post('/api/v1/auth/email/verify')
        .send({ token: 'x'.repeat(43) })
        .expect(400);
      expect(res.body.error.message).toBe('This link is invalid or has expired');
    });

    it('rejects an expired token', async () => {
      await registerAndLogin(app, 'old@flows.test');
      const token = tokenFromEmail(app, 'old@flows.test', '/verify-email');
      await prisma.emailToken.updateMany({
        data: { createdAt: new Date(Date.now() - 3 * 86_400_000), expiresAt: new Date(Date.now() - 1000) },
      });

      await api(app).post('/api/v1/auth/email/verify').send({ token }).expect(400);
    });

    it('rejects a token issued for a different address than the account now has', async () => {
      const { userId } = await registerAndLogin(app, 'moved@flows.test');
      const token = tokenFromEmail(app, 'moved@flows.test', '/verify-email');
      await prisma.user.update({ where: { id: userId }, data: { email: 'elsewhere@flows.test' } });

      await api(app).post('/api/v1/auth/email/verify').send({ token }).expect(400);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.emailVerifiedAt).toBeNull();
    });

    it('a password-reset token cannot be used to verify an email', async () => {
      await registerAndLogin(app, 'cross@flows.test');
      await api(app).post('/api/v1/auth/password/forgot').send({ email: 'cross@flows.test' }).expect(200);
      const resetToken = tokenFromEmail(app, 'cross@flows.test', '/reset-password');

      await api(app).post('/api/v1/auth/email/verify').send({ token: resetToken }).expect(400);
    });

    it('resend issues a new link and kills the previous one', async () => {
      const { accessToken } = await registerAndLogin(app, 'resend@flows.test');
      const first = tokenFromEmail(app, 'resend@flows.test', '/verify-email');

      await api(app).post('/api/v1/auth/email/resend').set(bearer(accessToken)).expect(200);
      const second = tokenFromEmail(app, 'resend@flows.test', '/verify-email');
      expect(second).not.toBe(first);

      await api(app).post('/api/v1/auth/email/verify').send({ token: first }).expect(400);
      await api(app).post('/api/v1/auth/email/verify').send({ token: second }).expect(200);
    });

    it('resend requires authentication', () =>
      api(app).post('/api/v1/auth/email/resend').expect(401));

    it('resend refuses an already verified address', async () => {
      const { accessToken } = await registerAndLogin(app, 'done@flows.test');
      await api(app)
        .post('/api/v1/auth/email/verify')
        .send({ token: tokenFromEmail(app, 'done@flows.test', '/verify-email') })
        .expect(200);

      await api(app).post('/api/v1/auth/email/resend').set(bearer(accessToken)).expect(400);
    });

    it('caps verification emails per account (registration + 2 resends, then 429)', async () => {
      const { accessToken } = await registerAndLogin(app, 'flood@flows.test');
      await api(app).post('/api/v1/auth/email/resend').set(bearer(accessToken)).expect(200);
      await api(app).post('/api/v1/auth/email/resend').set(bearer(accessToken)).expect(200);
      await api(app).post('/api/v1/auth/email/resend').set(bearer(accessToken)).expect(429);

      expect(mailbox(app).outbox.filter((m) => m.to === 'flood@flows.test')).toHaveLength(3);
    });

    it('verification lifts PENDING_VERIFICATION but never un-suspends', async () => {
      const pending = await registerAndLogin(app, 'pending@flows.test');
      const pendingToken = tokenFromEmail(app, 'pending@flows.test', '/verify-email');
      await prisma.user.update({
        where: { id: pending.userId },
        data: { status: UserStatus.PENDING_VERIFICATION },
      });
      await api(app).post('/api/v1/auth/email/verify').send({ token: pendingToken }).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } })).status).toBe(
        UserStatus.ACTIVE,
      );

      const banned = await registerAndLogin(app, 'banned@flows.test');
      const bannedToken = tokenFromEmail(app, 'banned@flows.test', '/verify-email');
      await prisma.user.update({ where: { id: banned.userId }, data: { status: UserStatus.SUSPENDED } });
      await api(app).post('/api/v1/auth/email/verify').send({ token: bannedToken }).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: banned.userId } })).status).toBe(
        UserStatus.SUSPENDED,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('password reset', () => {
    const forgot = (email: string) =>
      api(app).post('/api/v1/auth/password/forgot').send({ email }).expect(200);

    it('answers identically for registered and unregistered addresses', async () => {
      await registerAndLogin(app, 'real@flows.test');
      mailbox(app).clear();

      const known = await forgot('real@flows.test');
      const unknown = await forgot('nobody@flows.test');

      expect(known.body.data).toEqual({ requested: true });
      expect(unknown.body.data).toEqual(known.body.data);
      // ...but only the real account actually gets mail.
      expect(mailbox(app).outbox.map((m) => m.to)).toEqual(['real@flows.test']);
    });

    it('resets the password with the emailed token; old password stops working', async () => {
      await registerAndLogin(app, 'reset@flows.test', 'Reset', 'OldPassword123');
      await forgot('reset@flows.test');
      const token = tokenFromEmail(app, 'reset@flows.test', '/reset-password');

      await api(app)
        .post('/api/v1/auth/password/reset')
        .send({ token, password: 'BrandNewPass456' })
        .expect(200);

      await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'reset@flows.test', password: 'OldPassword123' })
        .expect(401);
      await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'reset@flows.test', password: 'BrandNewPass456' })
        .expect(200);
    });

    it('stores the new password as an Argon2id hash', async () => {
      const { userId } = await registerAndLogin(app, 'argon@flows.test');
      await forgot('argon@flows.test');
      await api(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: tokenFromEmail(app, 'argon@flows.test', '/reset-password'), password: 'BrandNewPass456' })
        .expect(200);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('SESSION REVOCATION: a reset kills existing access AND refresh tokens', async () => {
      await registerAndLogin(app, 'evict@flows.test', 'Evict', 'OldPassword123');
      // A second device, e.g. the attacker's.
      const device = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'evict@flows.test', password: 'OldPassword123' })
        .expect(200);
      const accessToken = device.body.data.accessToken as string;
      const cookie = device.headers['set-cookie'] as unknown as string[];

      await forgot('evict@flows.test');
      await api(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: tokenFromEmail(app, 'evict@flows.test', '/reset-password'), password: 'BrandNewPass456' })
        .expect(200);

      await api(app).get('/api/v1/auth/me').set(bearer(accessToken)).expect(401);
      await api(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('a reset token works exactly once', async () => {
      await registerAndLogin(app, 'reuse@flows.test');
      await forgot('reuse@flows.test');
      const token = tokenFromEmail(app, 'reuse@flows.test', '/reset-password');

      await api(app).post('/api/v1/auth/password/reset').send({ token, password: 'FirstNewPass123' }).expect(200);
      await api(app).post('/api/v1/auth/password/reset').send({ token, password: 'SecondNewPass123' }).expect(400);
    });

    it('requesting a new link invalidates the previous one', async () => {
      await registerAndLogin(app, 'twice@flows.test');
      await forgot('twice@flows.test');
      const first = tokenFromEmail(app, 'twice@flows.test', '/reset-password');
      await forgot('twice@flows.test');
      const second = tokenFromEmail(app, 'twice@flows.test', '/reset-password');

      await api(app).post('/api/v1/auth/password/reset').send({ token: first, password: 'NewPassword123' }).expect(400);
      await api(app).post('/api/v1/auth/password/reset').send({ token: second, password: 'NewPassword123' }).expect(200);
    });

    it('rejects an expired reset token', async () => {
      await registerAndLogin(app, 'late@flows.test');
      await forgot('late@flows.test');
      const token = tokenFromEmail(app, 'late@flows.test', '/reset-password');
      await prisma.emailToken.updateMany({
        where: { purpose: EmailTokenPurpose.PASSWORD_RESET },
        data: { createdAt: new Date(Date.now() - 3_600_000), expiresAt: new Date(Date.now() - 1000) },
      });

      await api(app).post('/api/v1/auth/password/reset').send({ token, password: 'NewPassword123' }).expect(400);
    });

    it('applies the registration password rules to the new password', async () => {
      await registerAndLogin(app, 'weak@flows.test');
      await forgot('weak@flows.test');
      const token = tokenFromEmail(app, 'weak@flows.test', '/reset-password');

      const res = await api(app).post('/api/v1/auth/password/reset').send({ token, password: 'short' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      // A rejected attempt must not burn the token.
      await api(app).post('/api/v1/auth/password/reset').send({ token, password: 'GoodPassword123' }).expect(200);
    });

    it('a verification token cannot be used to reset a password', async () => {
      await registerAndLogin(app, 'swap@flows.test');
      const verifyToken = tokenFromEmail(app, 'swap@flows.test', '/verify-email');

      await api(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: verifyToken, password: 'NewPassword123' })
        .expect(400);
    });

    it('a completed reset also proves ownership of the address', async () => {
      const { userId } = await registerAndLogin(app, 'proof@flows.test');
      await forgot('proof@flows.test');
      await api(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: tokenFromEmail(app, 'proof@flows.test', '/reset-password'), password: 'NewPassword123' })
        .expect(200);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.emailVerifiedAt).not.toBeNull();
    });

    it('notifies the owner after the password changes', async () => {
      await registerAndLogin(app, 'notify@flows.test');
      await forgot('notify@flows.test');
      await api(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: tokenFromEmail(app, 'notify@flows.test', '/reset-password'), password: 'NewPassword123' })
        .expect(200);

      const last = mailbox(app).outbox.at(-1);
      expect(last?.to).toBe('notify@flows.test');
      expect(last?.subject).toMatch(/password was changed/i);
    });

    it('caps reset emails per account, silently (no 429 that would reveal the account)', async () => {
      await registerAndLogin(app, 'cap@flows.test');
      mailbox(app).clear();
      for (let i = 0; i < 5; i += 1) await forgot('cap@flows.test');

      expect(mailbox(app).outbox.filter((m) => m.to === 'cap@flows.test')).toHaveLength(3);
    });

    it('rejects unknown fields (e.g. trying to pick the user id)', async () => {
      const res = await api(app)
        .post('/api/v1/auth/password/reset')
        .send({ token: 'x'.repeat(43), password: 'NewPassword123', userId: 'someone' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('escapes a hostile display name in the HTML email', async () => {
      await registerAndLogin(app, 'xss@flows.test', '<script>alert(1)</script>');
      const mail = mailbox(app).outbox.find((m) => m.to === 'xss@flows.test');
      expect(mail?.html).not.toContain('<script>alert(1)</script>');
      expect(mail?.html).toContain('&lt;script&gt;');
    });
  });
});
