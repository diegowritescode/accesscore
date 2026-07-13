import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { ConsistencyToken } from '../src/authz/domain/consistency-token';
import { Revision } from '../src/shared/kernel/revision';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

interface TokenPair {
  access_token: string;
  refresh_token: string;
}

describe('Authorization check endpoint (e2e)', () => {
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
      'TRUNCATE TABLE decision_log, relation_tuples, namespace_definitions, memberships, organizations, refresh_tokens, token_families, sessions, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const server = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();

  const newUser = async (): Promise<{ email: string; password: string }> => {
    counter += 1;
    const credentials = { email: `authz-${counter}@example.com`, password: 'correct horse staple' };
    await request(server()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
    return credentials;
  };

  const login = async (credentials: { email: string; password: string }): Promise<TokenPair> =>
    (await request(server()).post('/auth/login').send(credentials).expect(200)).body as TokenPair;

  it('rejects an unauthenticated check', async () => {
    await request(server())
      .post('/authz/check')
      .send({ action: 'document.read', resource: { type: 'document', id: '1' } })
      .expect(401);
  });

  it('returns a deny for an authenticated caller with no grants and logs the decision', async () => {
    const { access_token } = await login(await newUser());

    const response = await request(server())
      .post('/authz/check')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ action: 'document.read', resource: { type: 'document', id: '1' } })
      .expect(200);

    expect(response.body.effect).toBe('deny');

    const logged = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM decision_log');
    expect(logged.rows[0]?.n).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed authorization query', async () => {
    const { access_token } = await login(await newUser());

    await request(server())
      .post('/authz/check')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ action: 'not-an-action', resource: { type: 'document', id: '1' } })
      .expect(400);
  });

  it('rejects a query with a missing resource', async () => {
    const { access_token } = await login(await newUser());

    await request(server())
      .post('/authz/check')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ action: 'document.read' })
      .expect(400);
  });

  it('accepts a valid consistency token', async () => {
    const { access_token } = await login(await newUser());
    const zookie = ConsistencyToken.fromRevision(Revision.fromValue(0)).encode();

    const response = await request(server())
      .post('/authz/check')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        action: 'document.read',
        resource: { type: 'document', id: '1' },
        consistency_token: zookie,
      })
      .expect(200);

    expect(response.body.effect).toBe('deny');
  });

  it('rejects a malformed consistency token', async () => {
    const { access_token } = await login(await newUser());

    await request(server())
      .post('/authz/check')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        action: 'document.read',
        resource: { type: 'document', id: '1' },
        consistency_token: 'not-a-valid-token',
      })
      .expect(400);
  });
});
