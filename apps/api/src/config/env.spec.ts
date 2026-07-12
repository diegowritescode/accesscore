import { loadEnv } from './env';

describe('loadEnv', () => {
  it('parses and coerces a valid environment', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    } as NodeJS.ProcessEnv);

    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(4000);
  });

  it('throws with actionable detail on invalid configuration (fail-fast)', () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/Invalid environment configuration/);
  });

  const productionBase = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://u:p@db:5432/accesscore',
    SIGNER_DRIVER: 'vault',
    VAULT_TOKEN: 'a-real-production-token',
  };

  it('rejects the software signer in production', () => {
    expect(() =>
      loadEnv({ ...productionBase, SIGNER_DRIVER: 'software' } as NodeJS.ProcessEnv),
    ).toThrow(/SIGNER_DRIVER/);
  });

  it('rejects the dev default Vault token in production', () => {
    expect(() =>
      loadEnv({ ...productionBase, VAULT_TOKEN: 'accesscore-dev-token' } as NodeJS.ProcessEnv),
    ).toThrow(/VAULT_TOKEN/);
  });

  it('accepts a hardened production configuration', () => {
    const env = loadEnv(productionBase as NodeJS.ProcessEnv);

    expect(env.NODE_ENV).toBe('production');
    expect(env.SIGNER_DRIVER).toBe('vault');
  });
});
