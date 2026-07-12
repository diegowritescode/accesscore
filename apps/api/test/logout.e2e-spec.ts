import { createHash } from 'node:crypto';
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

describe('Logout & revocation (e2e)', () => {
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
      'TRUNCATE TABLE refresh_tokens, token_families, sessions, password_reset_tokens, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const server = () => app.getHttpServer();

  const register = async (): Promise<{ email: string; password: string }> => {
    counter += 1;
    const credentials = {
      email: `logout-${counter}@example.com`,
      password: 'correct horse staple',
    };
    await request(server()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
    return credentials;
  };

  const authenticate = async (credentials: {
    email: string;
    password: string;
  }): Promise<TokenPair> => {
    const response = await request(server()).post('/auth/login').send(credentials).expect(200);
    return response.body as TokenPair;
  };

  const refresh = (token: string) =>
    request(server()).post('/auth/refresh').send({ refresh_token: token });

  it('logs out a session: family revoked, refresh rejected, blocklisted sid rejected', async () => {
    const pair = await authenticate(await register());

    await request(server())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${pair.access_token}`)
      .expect(204);

    await refresh(pair.refresh_token).expect(401);

    // AC3: the blocklisted sid is rejected even though the JWT is still cryptographically valid
    await request(server())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${pair.access_token}`)
      .expect(401);

    const family = await pool.query<{ status: string }>('SELECT status FROM token_families');
    expect(family.rows[0]?.status).toBe('revoked');
  });

  it('logs out all sessions of a user', async () => {
    const credentials = await register();
    const first = await authenticate(credentials);
    const second = await authenticate(credentials);

    await request(server())
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${first.access_token}`)
      .expect(204);

    await refresh(first.refresh_token).expect(401);
    await refresh(second.refresh_token).expect(401);

    const active = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM token_families WHERE status = 'active'",
    );
    expect(active.rows[0]?.n).toBe(0);
  });

  it('rejects unauthenticated logout requests', async () => {
    await request(server()).post('/auth/logout').expect(401);
    await request(server())
      .post('/auth/logout')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it("password reset revokes the user's sessions (SessionRevoker)", async () => {
    const credentials = await register();
    const pair = await authenticate(credentials);

    const rawToken = `reset-${counter}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const user = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      credentials.email,
    ]);
    await pool.query(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (gen_random_uuid(), $1, $2, now() + interval '1 hour', now())",
      [user.rows[0]!.id, tokenHash],
    );

    await request(server())
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'a brand new password' })
      .expect(200);

    await refresh(pair.refresh_token).expect(401);

    const active = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM token_families WHERE status = 'active'",
    );
    expect(active.rows[0]?.n).toBe(0);
  });
});
