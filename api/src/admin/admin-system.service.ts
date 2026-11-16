import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailTokenPurpose } from '@prisma/client';
import { TOKEN_TTL_MS } from '../auth/email-tokens.service';
import { errorStats } from '../common/utils/error-stats';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';

/**
 * Operational facts the process can observe about itself right now. No
 * uptime percentages or response-time charts: those need a monitoring system
 * that records history, and this platform does not have one yet.
 */
@Injectable()
export class AdminSystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async health() {
    const checkedAt = new Date();
    const database = await this.databaseHealth();
    const mem = process.memoryUsage();
    const mailProvider = this.config.get('MAIL_PROVIDER', { infer: true });

    return {
      checkedAt: checkedAt.toISOString(),
      api: {
        status: 'up' as const,
        environment: this.config.get('NODE_ENV', { infer: true }),
        nodeVersion: process.version,
        processUptimeSeconds: Math.round(process.uptime()),
        memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, heapTotalBytes: mem.heapTotal },
      },
      database,
      errors: {
        ...errorStats.snapshot(),
        scope: 'This API process since it last started',
        externalMonitoring: null,
      },
      mail: {
        provider: mailProvider,
        // Configured is not the same as delivering. Delivery is only known
        // from the provider's own dashboard or bounce handling.
        configured: mailProvider === 'smtp' ? Boolean(this.config.get('SMTP_HOST', { infer: true })) : false,
        note:
          mailProvider === 'smtp'
            ? 'SMTP is configured. Delivery is not tracked here; check the provider.'
            : `Emails are not sent: the "${mailProvider}" provider only ${mailProvider === 'console' ? 'prints them to the server log' : 'keeps them in memory for tests'}.`,
      },
      backgroundJobs: null,
      storage: null,
    };
  }

  private async databaseHealth() {
    const started = process.hrtime.bigint();
    try {
      await this.prisma.ping();
      const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
      const [info] = await this.prisma.$queryRaw<
        { version: string; size: bigint; connections: bigint }[]
      >`
        SELECT current_setting('server_version') AS version,
               pg_database_size(current_database()) AS size,
               (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections
      `;
      const migrations = await this.prisma.$queryRaw<{ applied: bigint; latest: string | null; pending: bigint }[]>`
        SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
               max(migration_name) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS latest,
               count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS pending
        FROM _prisma_migrations
      `;
      const m = migrations[0];
      return {
        status: 'up' as const,
        latencyMs: Math.round(latencyMs * 10) / 10,
        serverVersion: info?.version ?? null,
        sizeBytes: info ? Number(info.size) : null,
        connections: info ? Number(info.connections) : null,
        migrations: m
          ? { applied: Number(m.applied), latest: m.latest, unfinished: Number(m.pending) }
          : null,
      };
    } catch {
      return { status: 'down' as const, latencyMs: null, serverVersion: null, sizeBytes: null, connections: null, migrations: null };
    }
  }

  /**
   * The effective, non-secret configuration. Secrets are reported only as
   * "set" or "not set" — their values never leave the server. Read-only:
   * configuration comes from the environment and changes with a redeploy,
   * so an edit form here would be a form that does nothing.
   */
  settings() {
    const c = <K extends keyof Env>(key: K) => this.config.get(key, { infer: true });
    return {
      general: {
        environment: c('NODE_ENV'),
        appUrl: c('APP_URL'),
        apiPrefix: c('API_PREFIX'),
        corsOrigins: c('CORS_ORIGINS').split(',').map((o) => o.trim()).filter(Boolean),
        logLevel: c('LOG_LEVEL'),
      },
      authentication: {
        accessTokenTtl: c('JWT_ACCESS_TTL'),
        refreshTokenTtlDays: c('REFRESH_TOKEN_TTL_DAYS'),
        jwtSecret: 'set',
        passwordHashing: 'argon2id',
        passwordResetLinkMinutes: TOKEN_TTL_MS[EmailTokenPurpose.PASSWORD_RESET] / 60_000,
        emailVerificationLinkHours: TOKEN_TTL_MS[EmailTokenPurpose.EMAIL_VERIFICATION] / 3_600_000,
        rateLimit: {
          enabled: c('THROTTLE_ENABLED'),
          windowSeconds: c('THROTTLE_TTL_SECONDS'),
          requestsPerWindow: c('THROTTLE_LIMIT'),
        },
      },
      email: {
        provider: c('MAIL_PROVIDER'),
        from: c('MAIL_FROM'),
        smtpHost: c('SMTP_HOST') ?? null,
        smtpPort: c('SMTP_PORT'),
        smtpSecure: c('SMTP_SECURE'),
        smtpUser: c('SMTP_USER') ? 'set' : 'not set',
        smtpPassword: c('SMTP_PASSWORD') ? 'set' : 'not set',
      },
    };
  }
}
