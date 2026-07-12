import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SIGNER_DRIVER: z.enum(['vault', 'software']).default('vault'),
  VAULT_ADDR: z.string().url().default('http://localhost:8200'),
  VAULT_TOKEN: z.string().min(1).default('accesscore-dev-token'),
  VAULT_TRANSIT_KEY: z.string().min(1).default('accesscore-signing'),
  JWT_ISSUER: z.string().min(1).default('https://auth.accesscore.dev'),
  JWT_AUDIENCE: z.string().min(1).default('accesscore'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(1209600),
  REFRESH_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(10),
  JWKS_CACHE_MAX_AGE: z.coerce.number().int().nonnegative().default(300),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
