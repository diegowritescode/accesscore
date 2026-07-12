import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

describe('Verify email (e2e)', () => {
  let app: INestApplication;
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    process.env.DATABASE_URL ??= DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const seedPendingUserWithToken = async (rawToken: string): Promise<string> => {
    const userId = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await pool.query(
      "INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ($1, $2, $3, 'pending_verification', now(), now())",
      [userId, `${userId}@example.com`, '$argon2id$placeholder'],
    );
    await pool.query(
      "INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, now() + interval '1 hour', now())",
      [randomUUID(), userId, tokenHash],
    );
    return userId;
  };

  it('verifies a valid token: activates the user and consumes the token (200)', async () => {
    const rawToken = 'valid-raw-token';
    const userId = await seedPendingUserWithToken(rawToken);

    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: rawToken })
      .expect(200)
      .expect({ status: 'verified' });

    const user = await pool.query<{ status: string; email_verified_at: Date | null }>(
      'SELECT status, email_verified_at FROM users WHERE id = $1',
      [userId],
    );
    expect(user.rows[0]?.status).toBe('active');
    expect(user.rows[0]?.email_verified_at).not.toBeNull();

    const token = await pool.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM email_verification_tokens WHERE user_id = $1',
      [userId],
    );
    expect(token.rows[0]?.consumed_at).not.toBeNull();
  });

  it('rejects an invalid token with 400 problem+json', async () => {
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: 'does-not-exist' })
      .expect(400)
      .expect('content-type', /application\/problem\+json/);
  });
});
