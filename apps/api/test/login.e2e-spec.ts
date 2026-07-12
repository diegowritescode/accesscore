import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const credentials = { email: 'login@example.com', password: 'correct horse battery staple' };

const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const segment = token.split('.')[1];
  return JSON.parse(Buffer.from(segment ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
};

describe('Login (e2e)', () => {
  let app: INestApplication;
  const pool = new Pool({ connectionString: DATABASE_URL });

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

  const registerUser = async (activate: boolean): Promise<string> => {
    await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(202);
    const rows = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      credentials.email,
    ]);
    const id = rows.rows[0]!.id;
    if (activate) {
      await pool.query(
        "UPDATE users SET status = 'active', email_verified_at = now() WHERE id = $1",
        [id],
      );
    }
    return id;
  };

  it('issues access + refresh tokens and creates a session for valid credentials', async () => {
    const userId = await registerUser(true);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);

    expect(response.body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
    expect(typeof response.body.access_token).toBe('string');
    expect(typeof response.body.refresh_token).toBe('string');

    const payload = decodeJwtPayload(response.body.access_token as string);
    expect(payload).toMatchObject({
      sub: userId,
      iss: 'https://auth.accesscore.dev',
      aud: 'accesscore',
      aal: 1,
    });
    expect(typeof payload.sid).toBe('string');
    expect(typeof payload.auth_time).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.nbf).toBe('number');

    const sessions = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1',
      [userId],
    );
    expect(sessions.rows[0]?.n).toBe(1);

    const families = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM token_families WHERE user_id = $1',
      [userId],
    );
    expect(families.rows[0]?.n).toBe(1);

    const refresh = await pool.query<{ n: number; generation: number }>(
      'SELECT count(*)::int AS n, max(generation) AS generation FROM refresh_tokens',
    );
    expect(refresh.rows[0]?.n).toBe(1);
    expect(refresh.rows[0]?.generation).toBe(1);
  });

  it('rejects a wrong password with a generic 401', async () => {
    await registerUser(true);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: 'nope nope nope' })
      .expect(401)
      .expect('content-type', /application\/problem\+json/);
  });

  it('does not issue tokens for an unverified user', async () => {
    await registerUser(false);

    await request(app.getHttpServer()).post('/auth/login').send(credentials).expect(401);

    const sessions = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM sessions');
    expect(sessions.rows[0]?.n).toBe(0);
  });

  it('rejects an unknown user with a generic 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ghost@example.com', password: 'whatever password here' })
      .expect(401);
  });
});
