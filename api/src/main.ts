import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  app.use(cookieParser());

  // Trust the first proxy hop so rate limiting and audit logs see the real
  // client IP rather than the load balancer's.
  app.set('trust proxy', 1);

  app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strips properties with no decorator...
      whitelist: true,
      // ...and rejects the request outright if any are present. This is what
      // turns `{"role":"super_admin"}` into a 400 instead of a silent no-op.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true, // required for the httpOnly refresh cookie
  });

  // Runs onModuleDestroy hooks so Prisma disconnects cleanly on SIGTERM.
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
