import { createHmac, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';
const PASSWORD = 'correct horse staple';
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

function totpCode(secretBase32: string): string {
  const secret = base32Decode(secretBase32);
  const step = Math.floor(Date.now() / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

describe('Authentication lockout (e2e)', () => {
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
      'TRUNCATE TABLE mfa_credentials, recovery_codes, refresh_tokens, token_families, sessions, email_verification_tokens, outbox, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const server = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();

  const registerActive = async (): Promise<string> => {
    counter += 1;
    const email = `lock-${counter}-${randomUUID().slice(0, 8)}@example.com`;
    await request(server()).post('/auth/register').send({ email, password: PASSWORD }).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [email],
    );
    return email;
  };

  it('locks the account after five failed logins', async () => {
    const email = await registerActive();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(server()).post('/auth/login').send({ email, password: 'wrong' }).expect(401);
    }

    await request(server()).post('/auth/login').send({ email, password: 'wrong' }).expect(429);
    await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(429);
  });

  it('locks step-up after five failed second factors', async () => {
    const email = await registerActive();
    const first = (
      await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(200)
    ).body as { access_token: string };
    const auth = `Bearer ${first.access_token}`;

    const enroll = await request(server())
      .post('/auth/mfa/enroll')
      .set('Authorization', auth)
      .expect(200);
    const secret = new URL((enroll.body as { otpauthUri: string }).otpauthUri).searchParams.get(
      'secret',
    );
    await request(server())
      .post('/auth/mfa/activate')
      .set('Authorization', auth)
      .send({ code: totpCode(secret ?? '') })
      .expect(200);

    const fresh = (
      await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(200)
    ).body as { access_token: string };
    const freshAuth = `Bearer ${fresh.access_token}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(server())
        .post('/auth/mfa/step-up')
        .set('Authorization', freshAuth)
        .send({ code: '000000' })
        .expect(401);
    }

    await request(server())
      .post('/auth/mfa/step-up')
      .set('Authorization', freshAuth)
      .send({ code: '000000' })
      .expect(429);
  });
});
