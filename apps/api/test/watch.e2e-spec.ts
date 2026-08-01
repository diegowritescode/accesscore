import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { ConsistencyToken } from '../src/authz/domain/consistency-token';
import { OrgId } from '../src/shared/kernel/org-id';
import { Revision } from '../src/shared/kernel/revision';
import { UserId } from '../src/shared/kernel/user-id';
import { TENANCY_SERVICE, type TenancyService } from '../src/tenancy/application/tenancy-service';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

interface TokenPair {
  access_token: string;
  refresh_token: string;
}

interface StreamEvent {
  readonly id?: string;
  readonly event?: string;
  readonly data?: Record<string, unknown>;
}

const parseStream = (body: string): StreamEvent[] =>
  body
    .split('\n\n')
    .filter((frame) => frame.trim() !== '')
    .map((frame) => {
      const event: { id?: string; event?: string; data?: Record<string, unknown> } = {};
      for (const line of frame.split('\n')) {
        if (line.startsWith('id: ')) {
          event.id = line.slice(4);
        } else if (line.startsWith('event: ')) {
          event.event = line.slice(7);
        } else if (line.startsWith('data: ')) {
          event.data = JSON.parse(line.slice(6)) as Record<string, unknown>;
        }
      }
      return event;
    });

const fromStart = ConsistencyToken.fromRevision(Revision.fromValue(0)).encode();

describe('Watch API (e2e)', () => {
  let app: INestApplication;
  let tenancy: TenancyService;
  const pool = new Pool({ connectionString: DATABASE_URL });
  let counter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= DATABASE_URL;
    process.env.SIGNER_DRIVER = 'software';
    process.env.WATCH_MAX_STREAM_SECONDS = '1';
    process.env.WATCH_POLL_INTERVAL_MS = '50';
    process.env.WATCH_HEARTBEAT_SECONDS = '30';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tenancy = app.get<TenancyService>(TENANCY_SERVICE, { strict: false });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE relation_tuple_changelog, decision_log, relation_tuples, namespace_definitions, policies, memberships, organizations, refresh_tokens, token_families, sessions, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const server = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();

  const registerActive = async (): Promise<UserId> => {
    counter += 1;
    const credentials = { email: `watch-${counter}@example.com`, password: 'correct horse staple' };
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

  const writeTuple = async (token: string, id: string, subject: string): Promise<string> => {
    const response = await request(server())
      .post('/authz/tuples')
      .set('Authorization', `Bearer ${token}`)
      .send({
        object: { type: 'document', id },
        relation: 'viewer',
        subject: { type: 'user', id: subject },
      })
      .expect(200);
    return response.body.consistency_token as string;
  };

  it('rejects an unauthenticated stream', async () => {
    await request(server()).get('/authz/watch').expect(401);
  });

  it('streams a tuple write as a change event whose id is a usable consistency token', async () => {
    const { userId, token } = await provisionOwner();
    const zookie = await writeTuple(token, 'doc-1', userId.value);

    const response = await request(server())
      .get('/authz/watch')
      .query({ since: fromStart })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    const changes = parseStream(response.text).filter((event) => event.event === 'change');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.id).toBe(zookie);
    expect(changes[0]?.data).toMatchObject({
      op: 'upsert',
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: { type: 'user', id: userId.value },
      consistency_token: zookie,
    });
  });

  it('streams a revoke as a delete change', async () => {
    const { userId, token } = await provisionOwner();
    await writeTuple(token, 'doc-1', userId.value);
    await request(server())
      .delete('/authz/tuples')
      .set('Authorization', `Bearer ${token}`)
      .send({
        object: { type: 'document', id: 'doc-1' },
        relation: 'viewer',
        subject: { type: 'user', id: userId.value },
      })
      .expect(200);

    const response = await request(server())
      .get('/authz/watch')
      .query({ since: fromStart })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ops = parseStream(response.text)
      .filter((event) => event.event === 'change')
      .map((event) => event.data?.op);
    expect(ops).toEqual(['upsert', 'delete']);
  });

  it('resumes strictly after Last-Event-ID, which wins over ?since', async () => {
    const { userId, token } = await provisionOwner();
    const first = await writeTuple(token, 'doc-1', userId.value);
    await writeTuple(token, 'doc-2', userId.value);

    const response = await request(server())
      .get('/authz/watch')
      .query({ since: fromStart })
      .set('Authorization', `Bearer ${token}`)
      .set('Last-Event-ID', first)
      .expect(200);

    const changes = parseStream(response.text).filter((event) => event.event === 'change');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.data).toMatchObject({ object: { type: 'document', id: 'doc-2' } });
  });

  it('forbids (403) a non-owner member from watching the organization', async () => {
    const owner = await provisionOwner();
    const member = await registerActive();
    await pool.query(
      "INSERT INTO memberships (id, user_id, org_id, status, role, joined_at) VALUES ($1, $2, $3, 'active', 'member', now())",
      [randomUUID(), member.value, owner.orgId.value],
    );
    const memberToken = await login(member);

    await request(server())
      .get('/authz/watch')
      .query({ since: fromStart })
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  it('carries the userset relation when the changed subject is a group', async () => {
    const { token } = await provisionOwner();
    await request(server())
      .post('/authz/tuples')
      .set('Authorization', `Bearer ${token}`)
      .send({
        object: { type: 'document', id: 'doc-1' },
        relation: 'viewer',
        subject: { type: 'group', id: 'engineering', relation: 'member' },
      })
      .expect(200);

    const response = await request(server())
      .get('/authz/watch')
      .query({ since: fromStart })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const changes = parseStream(response.text).filter((event) => event.event === 'change');
    expect(changes[0]?.data).toMatchObject({
      subject: { type: 'group', id: 'engineering', relation: 'member' },
    });
  });

  it('tails from the current revision when the resume cursor is empty', async () => {
    const { userId, token } = await provisionOwner();
    await writeTuple(token, 'doc-1', userId.value);

    const response = await request(server())
      .get('/authz/watch')
      .set('Authorization', `Bearer ${token}`)
      .set('Last-Event-ID', '')
      .expect(200);

    expect(parseStream(response.text).filter((event) => event.event === 'change')).toHaveLength(0);
  });

  it('rejects a cursor longer than the accepted bound', async () => {
    const { token } = await provisionOwner();

    await request(server())
      .get('/authz/watch')
      .query({ since: 'a'.repeat(513) })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('rejects a malformed cursor', async () => {
    const { token } = await provisionOwner();

    await request(server())
      .get('/authz/watch')
      .query({ since: 'not-a-consistency-token' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('never leaks another tenant changes', async () => {
    const first = await provisionOwner();
    const second = await provisionOwner();
    await writeTuple(first.token, 'doc-1', first.userId.value);

    const response = await request(server())
      .get('/authz/watch')
      .query({ since: fromStart })
      .set('Authorization', `Bearer ${second.token}`)
      .expect(200);

    expect(parseStream(response.text).filter((event) => event.event === 'change')).toHaveLength(0);
  });
});
