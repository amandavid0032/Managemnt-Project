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
  })
  .superRefine((env, ctx) => {
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
