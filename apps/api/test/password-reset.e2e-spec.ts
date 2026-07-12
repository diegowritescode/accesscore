import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const OLD_HASH = '$argon2id$placeholder-old';

describe('Password reset (e2e)', () => {
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
      'TRUNCATE TABLE password_reset_tokens, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const seedActiveUserWithResetToken = async (rawToken: string): Promise<string> => {
    const userId = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await pool.query(
      "INSERT INTO users (id, email, password_hash, status, email_verified_at, created_at, updated_at) VALUES ($1, $2, $3, 'active', now(), now(), now())",
      [userId, `${userId}@example.com`, OLD_HASH],
    );
    await pool.query(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, now() + interval '1 hour', now())",
      [randomUUID(), userId, tokenHash],
    );
    return userId;
  };

  it('forgot-password always returns a generic 202', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'anyone@example.com' })
      .expect(202)
      .expect({ status: 'accepted' });
  });

  it('reset-password with a valid token re-hashes the password and consumes the token (200)', async () => {
    const rawToken = 'valid-reset-token';
    const userId = await seedActiveUserWithResetToken(rawToken);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'a-brand-new-password' })
      .expect(200)
      .expect({ status: 'reset' });

    const user = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    expect(user.rows[0]?.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(user.rows[0]?.password_hash).not.toBe(OLD_HASH);

    const token = await pool.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM password_reset_tokens WHERE user_id = $1',
      [userId],
    );
    expect(token.rows[0]?.consumed_at).not.toBeNull();
  });

  it('reset-password with an invalid token returns 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'does-not-exist', password: 'a-brand-new-password' })
      .expect(400)
      .expect('content-type', /application\/problem\+json/);
  });

  it('reset-password with a weak password returns 422', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'whatever', password: 'short' })
      .expect(422);
  });
});
