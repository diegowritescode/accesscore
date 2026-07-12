import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const claimsOf = (accessToken: string): Record<string, unknown> => {
  const payload = accessToken.split('.')[1];
  return JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
};

describe('Org claim (e2e)', () => {
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
      'TRUNCATE TABLE memberships, organizations, refresh_tokens, token_families, sessions, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const registerActiveUser = async (): Promise<string> => {
    counter += 1;
    const credentials = { email: `org-${counter}@example.com`, password: 'correct horse staple' };
    await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
    const rows = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      credentials.email,
    ]);
    return rows.rows[0]!.id;
  };

  const login = () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `org-${counter}@example.com`, password: 'correct horse staple' });

  const seedMembership = async (userId: string): Promise<string> => {
    const orgId = randomUUID();
    await pool.query(
      "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, 'Acme', $2, now(), now())",
      [orgId, `acme-${counter}`],
    );
    await pool.query(
      "INSERT INTO memberships (id, user_id, org_id, status, joined_at) VALUES ($1, $2, $3, 'active', now())",
      [randomUUID(), userId, orgId],
    );
    return orgId;
  };

  it('mints a verified org claim and persists org/aal/auth_time on the session', async () => {
    const userId = await registerActiveUser();
    const orgId = await seedMembership(userId);

    const response = await login().expect(200);
    const claims = claimsOf(response.body.access_token as string);

    expect(claims.org).toBe(orgId);
    expect(claims.sub).toBe(userId);
    expect(typeof claims.aal).toBe('number');

    const session = await pool.query<{ org_id: string; aal: number; auth_time: Date }>(
      'SELECT org_id, aal, auth_time FROM sessions WHERE user_id = $1',
      [userId],
    );
    expect(session.rows[0]?.org_id).toBe(orgId);
    expect(session.rows[0]?.aal).toBe(1);
    expect(session.rows[0]?.auth_time).not.toBeNull();
  });

  it('preserves the org claim across refresh', async () => {
    const userId = await registerActiveUser();
    const orgId = await seedMembership(userId);
    const pair = (await login().expect(200)).body as { refresh_token: string };

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: pair.refresh_token })
      .expect(200);

    expect(claimsOf(refreshed.body.access_token as string).org).toBe(orgId);
  });

  it('omits the org claim for a user with no membership', async () => {
    const userId = await registerActiveUser();

    const response = await login().expect(200);

    expect(claimsOf(response.body.access_token as string).org).toBeUndefined();
    const session = await pool.query<{ org_id: string | null }>(
      'SELECT org_id FROM sessions WHERE user_id = $1',
      [userId],
    );
    expect(session.rows[0]?.org_id).toBeNull();
  });
});
