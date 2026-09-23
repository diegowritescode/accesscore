import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const DEMO = { email: 'demo-e2e@example.com', password: 'correct horse staple' };
const VISITOR = { email: 'visitor-e2e@example.com', password: 'correct horse staple' };

describe('Shared demo account restrictions (e2e)', () => {
  let app: INestApplication;
  const pool = new Pool({ connectionString: DATABASE_URL });

  const server = () => app.getHttpServer();

  const registerActive = async (credentials: { email: string; password: string }) => {
    await request(server()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
  };

  const tokenFor = async (credentials: { email: string; password: string }): Promise<string> => {
    const response = await request(server()).post('/auth/login').send(credentials).expect(200);
    return (response.body as { access_token: string }).access_token;
  };

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
    await registerActive(DEMO);
    await registerActive(VISITOR);
  });

  afterAll(async () => {
    delete process.env.DEMO_ACCOUNT_EMAIL;
    await app?.close();
    await pool.end();
  });

  it('blocks account-wide mutations and session enumeration for the demo account', async () => {
    const token = await tokenFor(DEMO);
    const auth = { Authorization: `Bearer ${token}` };

    const blocked = [
      request(server()).post('/auth/mfa/enroll').set(auth).send({}),
      request(server()).post('/auth/mfa/activate').set(auth).send({ code: '000000' }),
      request(server()).post('/auth/logout-all').set(auth),
      request(server()).get('/auth/sessions').set(auth),
      request(server()).delete('/auth/sessions/any').set(auth),
    ];
    for (const response of await Promise.all(blocked)) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ detail: 'demo_account_restricted' });
    }
  });

  it('still lets the demo account read its MFA status and log out its own session', async () => {
    const token = await tokenFor(DEMO);
    const auth = { Authorization: `Bearer ${token}` };

    await request(server()).get('/auth/mfa/status').set(auth).expect(200);
    await request(server()).post('/auth/logout').set(auth).expect(204);
  });

  it('leaves every other account unrestricted', async () => {
    const token = await tokenFor(VISITOR);
    const auth = { Authorization: `Bearer ${token}` };

    await request(server()).get('/auth/sessions').set(auth).expect(200);
    await request(server()).post('/auth/mfa/enroll').set(auth).send({}).expect(200);
  });
});
