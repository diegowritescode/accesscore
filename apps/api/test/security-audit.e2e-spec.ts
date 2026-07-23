import { createHmac } from 'node:crypto';
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

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secretBase32: string, at: Date): string {
  const secret = base32Decode(secretBase32);
  const step = Math.floor(at.getTime() / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 1_000_000).toString().padStart(6, '0');
}

interface ChainVerification {
  ok: boolean;
  length: number;
  brokenAt: number | null;
}

describe('Tamper-evident security audit (e2e)', () => {
  let app: INestApplication;
  let tenancy: TenancyService;
  const pool = new Pool({ connectionString: DATABASE_URL });
  let counter = 0;

  const PASSWORD = 'correct horse staple';

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
      'TRUNCATE TABLE security_audit, mfa_credentials, recovery_codes, decision_log, relation_tuples, namespace_definitions, policies, memberships, organizations, refresh_tokens, token_families, sessions, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const server = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();
  const bearer = (token: string): string => `Bearer ${token}`;

  const provisionOwner = async (): Promise<{ token: string; orgId: OrgId }> => {
    counter += 1;
    const email = `audit-${counter}@example.com`;
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

  const verify = async (token: string): Promise<ChainVerification> =>
    (
      await request(server())
        .get('/authz/audit/verify')
        .set('Authorization', bearer(token))
        .expect(200)
    ).body as ChainVerification;

  it('records security events on a hash chain that verify() can validate and tamper detection breaks', async () => {
    const { token } = await provisionOwner();

    const enroll = await request(server())
      .post('/auth/mfa/enroll')
      .set('Authorization', bearer(token))
      .expect(200);
    const secret = new URL((enroll.body as { otpauthUri: string }).otpauthUri).searchParams.get(
      'secret',
    );
    await request(server())
      .post('/auth/mfa/activate')
      .set('Authorization', bearer(token))
      .send({ code: totpCode(secret ?? '', new Date()) })
      .expect(200);

    expect(await verify(token)).toEqual({ ok: true, length: 1, brokenAt: null });

    const stepUp = await request(server())
      .post('/auth/mfa/step-up')
      .set('Authorization', bearer(token))
      .send({ code: totpCode(secret ?? '', new Date(Date.now() + 30_000)) })
      .expect(200);
    const stepped = (stepUp.body as { access_token: string }).access_token;

    await request(server())
      .post('/auth/mfa/disable')
      .set('Authorization', bearer(stepped))
      .expect(200);

    // activated + step_up + disabled
    expect(await verify(token)).toEqual({ ok: true, length: 3, brokenAt: null });

    await pool.query(
      `UPDATE security_audit SET subject = 'user:mallory' WHERE seq = (SELECT min(seq) FROM security_audit)`,
    );

    expect(await verify(token)).toEqual({ ok: false, length: 3, brokenAt: 0 });
  });

  it('requires an authenticated owner to read the verifier', async () => {
    await request(server()).get('/authz/audit/verify').expect(401);
  });
});
