import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const DEMO = { email: 'demo-lockout-e2e@example.com', password: 'correct horse staple' };

describe('Shared demo account lockout (e2e)', () => {
  let app: INestApplication;
  const pool = new Pool({ connectionString: DATABASE_URL });

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    process.env.DATABASE_URL ??= DATABASE_URL;
    process.env.SIGNER_DRIVER = 'software';
    process.env.DEMO_ACCOUNT_EMAIL = DEMO.email;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await pool.query(
      'TRUNCATE TABLE refresh_tokens, token_families, sessions, password_reset_tokens, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
    await request(server()).post('/auth/register').send(DEMO).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [DEMO.email],
    );
  });

  afterAll(async () => {
    delete process.env.DEMO_ACCOUNT_EMAIL;
    await app?.close();
    await pool.end();
  });

  it('cannot be locked by wrong passwords, because its password is published', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await request(server())
        .post('/auth/login')
        .send({ email: DEMO.email, password: 'wrong' })
        .expect(401);
    }

    await request(server()).post('/auth/login').send(DEMO).expect(200);
  });
});
