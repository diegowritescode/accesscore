import { z } from 'zod';

const DEV_VAULT_TOKEN = 'accesscore-dev-token';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SIGNER_DRIVER: z.enum(['vault', 'software']).default('vault'),
  VAULT_ADDR: z.string().url().default('http://localhost:8200'),
  VAULT_TOKEN: z.string().min(1).default(DEV_VAULT_TOKEN),
  VAULT_TRANSIT_KEY: z.string().min(1).default('accesscore-signing'),
  VAULT_TRANSIT_MFA_KEY: z.string().min(1).default('accesscore-mfa'),
  JWT_ISSUER: z.string().min(1).default('https://auth.accesscore.dev'),
  JWT_AUDIENCE: z.string().min(1).default('accesscore'),
  JWT_CLOCK_SKEW: z.coerce.number().int().nonnegative().default(30),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(1209600),
  REFRESH_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(10),
  JWKS_CACHE_MAX_AGE: z.coerce.number().int().nonnegative().default(300),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
  LOCKOUT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  LOCKOUT_IP_THRESHOLD: z.coerce.number().int().positive().default(50),
  DECISION_CACHE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DECISION_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  DECISION_LOG_ASYNC: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DECISION_LOG_BUFFER_SIZE: z.coerce.number().int().positive().default(10000),
  DECISION_LOG_FLUSH_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  DECISION_LOG_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WATCH_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  WATCH_PAGE_SIZE: z.coerce.number().int().positive().max(1000).default(200),
  WATCH_HEARTBEAT_SECONDS: z.coerce.number().int().positive().default(15),
  WATCH_MAX_STREAM_SECONDS: z.coerce.number().int().positive().default(300),
  MEMBERSHIP_INDEX_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  MEMBERSHIP_INDEX_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  MEMBERSHIP_INDEX_CHANGE_PAGE_SIZE: z.coerce.number().int().positive().max(5000).default(500),
  MEMBERSHIP_INDEX_MAX_TUPLES_PER_ORG: z.coerce.number().int().positive().default(50000),
});

export type Env = z.infer<typeof envSchema>;

const validatedSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  if (env.SIGNER_DRIVER !== 'vault') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SIGNER_DRIVER'],
      message: 'must be "vault" in production (the software signer is dev/test only)',
    });
  }
  if (env.VAULT_TOKEN === DEV_VAULT_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['VAULT_TOKEN'],
      message: 'must not be the dev default token in production',
    });
  }
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = validatedSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
