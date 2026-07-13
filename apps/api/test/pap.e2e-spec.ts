import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { OrgId } from '../src/shared/kernel/org-id';
import { UserId } from '../src/shared/kernel/user-id';
import { TENANCY_SERVICE, type TenancyService } from '../src/tenancy/application/tenancy-service';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

interface TokenPair {
  access_token: string;
  refresh_token: string;
}

describe('PAP write API (e2e)', () => {
  let app: INestApplication;
  let tenancy: TenancyService;
  const pool = new Pool({ connectionString: DATABASE_URL });
  let counter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= DATABASE_URL;
    process.env.SIGNER_DRIVER = 'software';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tenancy = app.get<TenancyService>(TENANCY_SERVICE, { strict: false });
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

  const registerActive = async (): Promise<UserId> => {
    counter += 1;
    const credentials = { email: `pap-${counter}@example.com`, password: 'correct horse staple' };
    await request(server()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
    const rows = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      credentials.email,
    ]);
    return UserId.fromString(rows.rows[0]?.id ?? '');
  };

  const login = async (id: UserId): Promise<string> => {
    const rows = await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [
      id.value,
    ]);
    const tokens = (
      await request(server())
        .post('/auth/login')
        .send({ email: rows.rows[0]?.email, password: 'correct horse staple' })
        .expect(200)
    ).body as TokenPair;
    return tokens.access_token;
  };

  const provisionOwner = async (): Promise<{ userId: UserId; orgId: OrgId; token: string }> => {
    const userId = await registerActive();
    const orgId = await tenancy.provisionPersonalOrganization(userId);
    return { userId, orgId, token: await login(userId) };
  };

  it('lets an owner define a namespace, write a tuple, and then check() returns permit', async () => {
    const { userId, token } = await provisionOwner();

    await request(server())
      .put('/authz/namespaces/document')
      .set('Authorization', `Bearer ${token}`)
      .send({ relations: ['viewer'], actions: { read: ['viewer'] } })
      .expect(200);

    const write = await request(server())
      .post('/authz/tuples')
      .set('Authorization', `Bearer ${token}`)
      .send({
        object: { type: 'document', id: 'doc-1' },
        relation: 'viewer',
        subject: { type: 'user', id: userId.value },
      })
      .expect(200);
    expect(typeof write.body.consistency_token).toBe('string');

    const check = await request(server())
      .post('/authz/check')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'document.read',
        resource: { type: 'document', id: 'doc-1' },
        consistency_token: write.body.consistency_token,
      })
      .expect(200);
    expect(check.body.effect).toBe('permit');
  });

  it('lets an owner revoke a tuple, flipping a later check back to deny', async () => {
    const { userId, token } = await provisionOwner();
    await request(server())
      .put('/authz/namespaces/document')
      .set('Authorization', `Bearer ${token}`)
      .send({ relations: ['viewer'], actions: { read: ['viewer'] } })
      .expect(200);
    const tuple = {
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: { type: 'user', id: userId.value },
    };
    await request(server())
      .post('/authz/tuples')
      .set('Authorization', `Bearer ${token}`)
      .send(tuple)
      .expect(200);

    const revoke = await request(server())
      .delete('/authz/tuples')
      .set('Authorization', `Bearer ${token}`)
      .send(tuple)
      .expect(200);

    const check = await request(server())
      .post('/authz/check')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'document.read',
        resource: { type: 'document', id: 'doc-1' },
        consistency_token: revoke.body.consistency_token,
      })
      .expect(200);
    expect(check.body.effect).toBe('deny');
  });

  it('forbids (403) a non-owner member from writing', async () => {
    const owner = await provisionOwner();
    const member = await registerActive();
    await pool.query(
      "INSERT INTO memberships (id, user_id, org_id, status, role, joined_at) VALUES ($1, $2, $3, 'active', 'member', now())",
      [randomUUID(), member.value, owner.orgId.value],
    );
    const memberToken = await login(member);

    await request(server())
      .put('/authz/namespaces/document')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ relations: ['viewer'], actions: { read: ['viewer'] } })
      .expect(403);
  });

  it('rejects an unauthenticated write with 401', async () => {
    await request(server())
      .post('/authz/tuples')
      .send({
        object: { type: 'document', id: 'doc-1' },
        relation: 'viewer',
        subject: { type: 'user', id: 'u1' },
      })
      .expect(401);
  });

  it('rejects a tuple whose id smuggles a delimiter with 400 (M1)', async () => {
    const { token } = await provisionOwner();
    await request(server())
      .post('/authz/tuples')
      .set('Authorization', `Bearer ${token}`)
      .send({
        object: { type: 'document', id: 'doc#1' },
        relation: 'viewer',
        subject: { type: 'user', id: 'alice' },
      })
      .expect(400);
  });

  it('rejects a namespace config that binds an unknown relation with 400', async () => {
    const { token } = await provisionOwner();
    await request(server())
      .put('/authz/namespaces/document')
      .set('Authorization', `Bearer ${token}`)
      .send({ relations: ['viewer'], actions: { read: ['editor'] } })
      .expect(400);
  });

  it('rejects a malformed namespace body with 400', async () => {
    const { token } = await provisionOwner();
    await request(server())
      .put('/authz/namespaces/document')
      .set('Authorization', `Bearer ${token}`)
      .send({ actions: { read: ['viewer'] } })
      .expect(400);
  });
});
