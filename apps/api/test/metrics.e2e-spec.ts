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

const PASSWORD = 'correct horse staple';

describe('Metrics (e2e)', () => {
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
      'TRUNCATE TABLE decision_log, relation_tuples, namespace_definitions, policies, memberships, organizations, refresh_tokens, token_families, sessions, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const server = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();

  const provisionOwner = async (): Promise<{ token: string; orgId: OrgId }> => {
    counter += 1;
    const email = `metrics-${counter}@example.com`;
    await request(server()).post('/auth/register').send({ email, password: PASSWORD }).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [email],
    );
    const rows = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    const userId = UserId.fromString(rows.rows[0]?.id ?? '');
    const orgId = await tenancy.provisionPersonalOrganization(userId);
    const token = (
      await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(200)
    ).body.access_token as string;
    return { token, orgId };
  };

  it('exposes Prometheus metrics in text format after HTTP traffic', async () => {
    await request(server()).get('/health').expect(200);

    const response = await request(server()).get('/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('http_request_duration_seconds');
    expect(response.text).toContain('nodejs_');
    expect(response.text).toContain('service="accesscore"');
  });

  it('records authorization decisions as a domain metric', async () => {
    const { token } = await provisionOwner();

    await request(server())
      .post('/authz/check')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'document.read', resource: { type: 'document', id: 'missing' } })
      .expect(200);

    const response = await request(server()).get('/metrics').expect(200);
    expect(response.text).toMatch(/authz_decisions_total\{[^}]*effect="deny"[^}]*\}/);
    expect(response.text).toContain('authz_decision_duration_seconds');
  });
});
