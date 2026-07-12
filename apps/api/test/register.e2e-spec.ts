import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

describe('Register (e2e)', () => {
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

  it('registers a new user (202), persisting it as pending with an outbox event and token', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'correct horse battery' })
      .expect(202)
      .expect({ status: 'accepted' });

    const users = await pool.query<{ status: string }>(
      'SELECT status FROM users WHERE email = $1',
      ['alice@example.com'],
    );
    expect(users.rowCount).toBe(1);
    expect(users.rows[0]?.status).toBe('pending_verification');

    const events = await pool.query(
      "SELECT type FROM outbox WHERE type = 'identity.user_registered'",
    );
    expect(events.rowCount).toBe(1);

    const tokens = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM email_verification_tokens',
    );
    expect(tokens.rows[0]?.n).toBe(1);
  });

  it('does not reveal existence for a duplicate email (still 202, no duplicate row)', async () => {
    const body = { email: 'dup@example.com', password: 'correct horse battery' };
    await request(app.getHttpServer()).post('/auth/register').send(body).expect(202);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(202)
      .expect({ status: 'accepted' });

    const users = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users WHERE email = $1',
      ['dup@example.com'],
    );
    expect(users.rows[0]?.n).toBe(1);
  });

  it('rejects invalid input with 422 problem+json', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(422)
      .expect('content-type', /application\/problem\+json/);
  });
});
