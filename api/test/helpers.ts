import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

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
