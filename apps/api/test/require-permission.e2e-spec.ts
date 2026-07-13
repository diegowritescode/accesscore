import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import {
  NAMESPACE_CONFIG_WRITER,
  type NamespaceConfigWriter,
} from '../src/authz/application/namespace-config-writer';
import {
  RELATION_TUPLE_WRITER,
  type RelationTupleWriter,
} from '../src/authz/application/relation-tuple-writer';
import { OrgId } from '../src/shared/kernel/org-id';
import { UserId } from '../src/shared/kernel/user-id';
import { TENANCY_SERVICE, type TenancyService } from '../src/tenancy/application/tenancy-service';
import { AppModule } from '../src/app.module';
import { ProtectedResourceFixtureModule } from './support/protected-resource.fixture';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

interface TokenPair {
  access_token: string;
  refresh_token: string;
}

describe('@RequirePermission PEP (e2e)', () => {
  let app: INestApplication;
  let tenancy: TenancyService;
  let configWriter: NamespaceConfigWriter;
  let tupleWriter: RelationTupleWriter;
  const pool = new Pool({ connectionString: DATABASE_URL });
  let counter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= DATABASE_URL;
    process.env.SIGNER_DRIVER = 'software';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProtectedResourceFixtureModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tenancy = app.get<TenancyService>(TENANCY_SERVICE, { strict: false });
    configWriter = app.get<NamespaceConfigWriter>(NAMESPACE_CONFIG_WRITER, { strict: false });
    tupleWriter = app.get<RelationTupleWriter>(RELATION_TUPLE_WRITER, { strict: false });
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

  const provisionAndLogin = async (): Promise<{ userId: UserId; orgId: OrgId; token: string }> => {
    counter += 1;
    const credentials = { email: `pep-${counter}@example.com`, password: 'correct horse staple' };
    await request(server()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
    const rows = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      credentials.email,
    ]);
    const userId = UserId.fromString(rows.rows[0]?.id ?? '');
    const orgId = await tenancy.provisionPersonalOrganization(userId);
    const tokens = (await request(server()).post('/auth/login').send(credentials).expect(200))
      .body as TokenPair;
    return { userId, orgId, token: tokens.access_token };
  };

  const defineDocumentNamespace = async (orgId: OrgId): Promise<void> => {
    const result = await configWriter.define({
      orgId,
      namespace: 'document',
      config: { relations: ['viewer'], actions: { read: ['viewer'] } },
    });
    if (!result.ok) {
      throw new Error(`failed to define namespace: ${result.error}`);
    }
  };

  it('rejects an unauthenticated request with 401', async () => {
    await request(server()).get('/example/documents/doc-1').expect(401);
  });

  it('forbids (403) a caller lacking the required relation and logs the decision', async () => {
    const { orgId, token } = await provisionAndLogin();
    await defineDocumentNamespace(orgId);

    await request(server())
      .get('/example/documents/doc-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    const logged = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM decision_log');
    expect(logged.rows[0]?.n).toBeGreaterThanOrEqual(1);
  });

  it('allows (200) a caller holding the required relation', async () => {
    const { userId, orgId, token } = await provisionAndLogin();
    await defineDocumentNamespace(orgId);
    await tupleWriter.write({
      orgId,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: { kind: 'subject', ref: { type: 'user', id: userId.value } },
    });

    const response = await request(server())
      .get('/example/documents/doc-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ document: { id: 'doc-1' } });
  });
});
