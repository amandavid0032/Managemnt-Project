import { z } from 'zod';

/**
 * Environment contract. Validated once at boot — the process refuses to start
 * on a bad or missing value rather than failing later at request time.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().default('api'),

    DATABASE_URL: z.string().url(),

    // Minimum 32 chars: a short secret makes HS256 brute-forceable.
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    CORS_ORIGINS: z.string().default('http://localhost:3000'),

    // Escape hatch for the test suite only. The refinement below makes it
    // impossible to disable rate limiting in production.
    THROTTLE_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),

    // --- Email -------------------------------------------------------------
    // Public URL of the web app. Links in emails point here, so it must be
    // the address a person's browser can reach — never the API's.
    APP_URL: z.string().url().default('http://localhost:3000'),

    //   console — prints each email (including its link) to the log. Dev only.
    //   memory  — keeps emails in-process for the test suite to read. Test only.
    //   smtp    — real delivery. Any transactional provider that offers SMTP
    //             relay (SES, SendGrid, Postmark, Resend, Mailgun) works.
    MAIL_PROVIDER: z.enum(['console', 'memory', 'smtp']).default('console'),
    MAIL_FROM: z.string().min(3).default('EduHub <no-reply@eduhub.local>'),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    // true = TLS from the first byte (port 465). false = STARTTLS upgrade
    // (port 587), which nodemailer requires the server to offer.
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_PROVIDER === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when MAIL_PROVIDER=smtp',
      });
    }
    // The console provider writes live reset links into the log stream —
    // in production that turns log access into account takeover. The memory
    // provider silently drops mail. Neither may run there.
    if (env.NODE_ENV === 'production' && env.MAIL_PROVIDER !== 'smtp') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_PROVIDER'],
        message: 'MAIL_PROVIDER must be smtp in production',
      });
    }
    if (env.MAIL_PROVIDER === 'memory' && env.NODE_ENV !== 'test') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_PROVIDER'],
        message: 'MAIL_PROVIDER=memory is only allowed when NODE_ENV=test',
      });
    }

    // A development placeholder secret must never reach production.
    if (env.NODE_ENV === 'production' && !env.THROTTLE_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['THROTTLE_ENABLED'],
        message: 'Rate limiting cannot be disabled in production',
      });
    }
    if (env.NODE_ENV === 'production' && env.JWT_ACCESS_SECRET.includes('dev-only')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'Development placeholder secret cannot be used in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Values are never echoed — only the failing keys.
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }
  return parsed.data;
};
