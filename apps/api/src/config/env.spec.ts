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
});
