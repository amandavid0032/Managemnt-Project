import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { MAIL_PROVIDER } from '../src/mail/mail.types';
import type { MemoryMailProvider } from '../src/mail/providers';

/**
 * Boots the real application graph — global guards, pipes and filters
 * included. Testing through a partially-wired app would prove nothing about
 * the security controls, since those ARE the global providers.
 */
export async function createTestApp(
  options: { enableThrottling?: boolean } = {},
): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  // Rate limiting is a real control, but coupling every business-logic test
  // to a 5-per-minute budget makes the suite slow and flaky. It is switched
  // off here and covered explicitly by throttling.e2e-spec.ts.
  // Must be set BEFORE the module compiles.
  process.env.THROTTLE_ENABLED = options.enableThrottling ? 'true' : 'false';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Order matters: children before parents, so FKs never block the truncate. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs",
      "email_tokens",
      "user_profiles",
      "institution_memberships",
      "institution_external_ids",
      "refresh_tokens",
      "institutions",
      "users"
    RESTART IDENTITY CASCADE
  `);
}

export const api = (app: INestApplication) => request(app.getHttpServer());

export async function registerAndLogin(
  app: INestApplication,
  email: string,
  fullName = 'Test User',
  password = 'ValidPass123',
): Promise<{ userId: string; accessToken: string }> {
  const reg = await api(app)
    .post('/api/v1/auth/register')
    .send({ email, password, fullName })
    .expect(201);

  const login = await api(app)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  return { userId: reg.body.data.id, accessToken: login.body.data.accessToken };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------


export const mailbox = (app: INestApplication): MemoryMailProvider =>
  app.get<MemoryMailProvider>(MAIL_PROVIDER);

/**
 * The token from the most recent email to `to` whose link points at `path`.
 * Read out of the message body — the same place a person gets it from.
 */
export function tokenFromEmail(app: INestApplication, to: string, path: string): string {
  const messages = mailbox(app).outbox.filter((m) => m.to === to && m.text.includes(path));
  const last = messages[messages.length - 1];
  if (!last) throw new Error(`No email to ${to} containing ${path}`);
  const match = new RegExp(`${path}#token=([A-Za-z0-9_\\-%]+)`).exec(last.text);
  if (!match?.[1]) throw new Error(`Email to ${to} has no ${path} token`);
  return decodeURIComponent(match[1]);
}

/** Registers, logs in and verifies the address through the real email link. */
export async function registerVerifiedAndLogin(
  app: INestApplication,
  email: string,
  fullName = 'Test User',
  password = 'ValidPass123',
): Promise<{ userId: string; accessToken: string }> {
  const session = await registerAndLogin(app, email, fullName, password);
  await api(app)
    .post('/api/v1/auth/email/verify')
    .send({ token: tokenFromEmail(app, email, '/verify-email') })
    .expect(200);
  return session;
}
