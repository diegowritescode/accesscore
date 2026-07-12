import { z } from 'zod';

const DEV_VAULT_TOKEN = 'accesscore-dev-token';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SIGNER_DRIVER: z.enum(['vault', 'software']).default('vault'),
  VAULT_ADDR: z.string().url().default('http://localhost:8200'),
  VAULT_TOKEN: z.string().min(1).default(DEV_VAULT_TOKEN),
  VAULT_TRANSIT_KEY: z.string().min(1).default('accesscore-signing'),
  JWT_ISSUER: z.string().min(1).default('https://auth.accesscore.dev'),
  JWT_AUDIENCE: z.string().min(1).default('accesscore'),
  JWT_CLOCK_SKEW: z.coerce.number().int().nonnegative().default(30),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(1209600),
  REFRESH_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(10),
  JWKS_CACHE_MAX_AGE: z.coerce.number().int().nonnegative().default(300),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
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
