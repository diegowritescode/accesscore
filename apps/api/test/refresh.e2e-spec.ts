import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

interface TokenPair {
  access_token: string;
  refresh_token: string;
}

describe('Refresh (e2e)', () => {
  let app: INestApplication;
  const pool = new Pool({ connectionString: DATABASE_URL });
  let counter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= DATABASE_URL;
    process.env.SIGNER_DRIVER = 'software';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE refresh_tokens, token_families, sessions, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const login = async (): Promise<TokenPair> => {
    counter += 1;
    const credentials = {
      email: `refresh-${counter}@example.com`,
      password: 'correct horse staple',
    };
    await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    return response.body as TokenPair;
  };

  const refresh = (token: string) =>
    request(app.getHttpServer()).post('/auth/refresh').send({ refresh_token: token });

  it('issues a new pair, invalidates the presented token, and preserves the family', async () => {
    const first = await login();

    const response = await refresh(first.refresh_token).expect(200);
    const next = response.body as TokenPair;

    expect(next.refresh_token).not.toBe(first.refresh_token);
    expect(typeof next.access_token).toBe('string');

    const tokens = await pool.query<{ generation: number; status: string }>(
      'SELECT generation, status FROM refresh_tokens ORDER BY generation',
    );
    expect(tokens.rows).toEqual([
      { generation: 1, status: 'rotated' },
      { generation: 2, status: 'active' },
    ]);
  });

  it('returns the same pair for a benign replay within the grace window', async () => {
    const first = await login();

    const one = (await refresh(first.refresh_token).expect(200)).body as TokenPair;
    const two = (await refresh(first.refresh_token).expect(200)).body as TokenPair;

    expect(two).toEqual(one);
    const family = await pool.query<{ status: string }>('SELECT status FROM token_families');
    expect(family.rows[0]?.status).toBe('active');
  });

  it('detects reuse of a superseded token: revokes the family and emits an event', async () => {
    const first = await login();
    const second = (await refresh(first.refresh_token).expect(200)).body as TokenPair;
    await refresh(second.refresh_token).expect(200);

    await refresh(first.refresh_token)
      .expect(401)
      .expect('content-type', /application\/problem\+json/);

    const family = await pool.query<{ status: string; revoked_reason: string }>(
      'SELECT status, revoked_reason FROM token_families',
    );
    expect(family.rows[0]?.status).toBe('revoked');
    expect(family.rows[0]?.revoked_reason).toBe('reuse_detected');

    const event = await pool.query('SELECT type FROM outbox WHERE type = $1', [
      'authn.refresh_token_reused',
    ]);
    expect(event.rowCount).toBe(1);

    await refresh(second.refresh_token).expect(401);
  });
});
