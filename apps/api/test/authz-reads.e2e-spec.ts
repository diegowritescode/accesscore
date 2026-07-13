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

describe('Authorization read API — batch-check & expand (e2e)', () => {
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
    const credentials = { email: `reads-${counter}@example.com`, password: 'correct horse staple' };
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

  const defineDocument = async (token: string): Promise<void> => {
    await request(server())
      .put('/authz/namespaces/document')
      .set('Authorization', `Bearer ${token}`)
      .send({ relations: ['viewer'], actions: { read: ['viewer'] } })
      .expect(200);
  };

  const grantViewer = async (token: string, docId: string, subjectId: string): Promise<void> => {
    await request(server())
      .post('/authz/tuples')
      .set('Authorization', `Bearer ${token}`)
      .send({
        object: { type: 'document', id: docId },
        relation: 'viewer',
        subject: { type: 'user', id: subjectId },
      })
      .expect(200);
  };

  it('resolves a mixed batch in one request: permit for a granted doc, deny for another', async () => {
    const { userId, token } = await provisionOwner();
    await defineDocument(token);
    await grantViewer(token, 'doc-1', userId.value);

    const response = await request(server())
      .post('/authz/batch-check')
      .set('Authorization', `Bearer ${token}`)
      .send({
        checks: [
          { action: 'document.read', resource: { type: 'document', id: 'doc-1' } },
          { action: 'document.read', resource: { type: 'document', id: 'doc-2' } },
        ],
      })
      .expect(200);

    expect(response.body.results.map((r: { effect: string }) => r.effect)).toEqual([
      'permit',
      'deny',
    ]);
  });

  it('rejects a batch with no checks as 400', async () => {
    const { token } = await provisionOwner();
    await request(server())
      .post('/authz/batch-check')
      .set('Authorization', `Bearer ${token}`)
      .send({ checks: [] })
      .expect(400);
  });

  it('rejects an unauthenticated batch-check with 401', async () => {
    await request(server())
      .post('/authz/batch-check')
      .send({ checks: [{ action: 'document.read', resource: { type: 'document', id: 'doc-1' } }] })
      .expect(401);
  });

  it('lets an owner expand who holds a relation on a resource', async () => {
    const { userId, token } = await provisionOwner();
    await defineDocument(token);
    await grantViewer(token, 'doc-1', userId.value);
    await grantViewer(token, 'doc-1', 'teammate');

    const response = await request(server())
      .post('/authz/expand')
      .set('Authorization', `Bearer ${token}`)
      .send({ resource: { type: 'document', id: 'doc-1' }, relation: 'viewer' })
      .expect(200);

    const ids = response.body.subjects.map((s: { id: string }) => s.id).sort();
    expect(ids).toEqual([userId.value, 'teammate'].sort());
  });

  it('forbids (403) a non-owner member from expanding', async () => {
    const owner = await provisionOwner();
    const member = await registerActive();
    await pool.query(
      "INSERT INTO memberships (id, user_id, org_id, status, role, joined_at) VALUES ($1, $2, $3, 'active', 'member', now())",
      [randomUUID(), member.value, owner.orgId.value],
    );
    const memberToken = await login(member);

    await request(server())
      .post('/authz/expand')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ resource: { type: 'document', id: 'doc-1' }, relation: 'viewer' })
      .expect(403);
  });

  it('rejects an unauthenticated expand with 401', async () => {
    await request(server())
      .post('/authz/expand')
      .send({ resource: { type: 'document', id: 'doc-1' }, relation: 'viewer' })
      .expect(401);
  });
});
