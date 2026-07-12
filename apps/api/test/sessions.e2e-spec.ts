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

const sidOf = (accessToken: string): string => {
  const payload = accessToken.split('.')[1];
  return (JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as { sid: string })
    .sid;
};

describe('Sessions & devices (e2e)', () => {
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

  const server = () => app.getHttpServer();

  const newUser = async (): Promise<{ email: string; password: string }> => {
    counter += 1;
    const credentials = {
      email: `sessions-${counter}@example.com`,
      password: 'correct horse staple',
    };
    await request(server()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
    return credentials;
  };

  const login = async (credentials: { email: string; password: string }): Promise<TokenPair> =>
    (await request(server()).post('/auth/login').send(credentials).expect(200)).body as TokenPair;

  it('lists the caller active sessions, scoped to the caller, flagging the current one', async () => {
    const alice = await newUser();
    const first = await login(alice);
    const second = await login(alice);
    await login(await newUser()); // bob — must not appear in alice's list

    const response = await request(server())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${first.access_token}`)
      .expect(200);

    const sessions = response.body.sessions as { id: string; current: boolean }[];
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((session) => session.id).sort();
    expect(ids).toEqual([sidOf(first.access_token), sidOf(second.access_token)].sort());
    expect(sessions.find((session) => session.id === sidOf(first.access_token))?.current).toBe(
      true,
    );
  });

  it('revokes one of the caller own sessions', async () => {
    const alice = await newUser();
    const keep = await login(alice);
    const drop = await login(alice);

    await request(server())
      .delete(`/auth/sessions/${sidOf(drop.access_token)}`)
      .set('Authorization', `Bearer ${keep.access_token}`)
      .expect(204);

    await request(server())
      .post('/auth/refresh')
      .send({ refresh_token: drop.refresh_token })
      .expect(401);

    const remaining = await request(server())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${keep.access_token}`)
      .expect(200);
    expect(remaining.body.sessions).toHaveLength(1);
  });

  it('returns 404 when revoking a session owned by another user', async () => {
    const alice = await login(await newUser());
    const bob = await login(await newUser());

    await request(server())
      .delete(`/auth/sessions/${sidOf(bob.access_token)}`)
      .set('Authorization', `Bearer ${alice.access_token}`)
      .expect(404);

    // bob's session is untouched
    await request(server())
      .post('/auth/refresh')
      .send({ refresh_token: bob.refresh_token })
      .expect(200);
  });
});
