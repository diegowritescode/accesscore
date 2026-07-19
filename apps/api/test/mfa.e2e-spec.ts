import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
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

describe('MFA enrollment (e2e)', () => {
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

  const authenticate = async (): Promise<string> => {
    counter += 1;
    const credentials = { email: `mfa-${counter}@example.com`, password: 'correct horse staple' };
    await request(server()).post('/auth/register').send(credentials).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [credentials.email],
    );
    const login = await request(server()).post('/auth/login').send(credentials).expect(200);
    return (login.body as { access_token: string }).access_token;
  };

  const bearer = (token: string): string => `Bearer ${token}`;

  it('enrolls, activates with a real TOTP code, reports status, and disables', async () => {
    const token = await authenticate();

    const enroll = await request(server())
      .post('/auth/mfa/enroll')
      .set('Authorization', bearer(token))
      .expect(200);
    const otpauthUri = (enroll.body as { otpauthUri: string }).otpauthUri;
    const secret = new URL(otpauthUri).searchParams.get('secret');
    expect(secret).not.toBeNull();

    await request(server())
      .get('/auth/mfa/status')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect({ enabled: false });

    await request(server())
      .post('/auth/mfa/activate')
      .set('Authorization', bearer(token))
      .send({ code: totpCode(secret ?? '', new Date()) })
      .expect(200)
      .expect({ status: 'active' });

    await request(server())
      .get('/auth/mfa/status')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect({ enabled: true });

    await request(server())
      .post('/auth/mfa/disable')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect({ status: 'disabled' });

    await request(server())
      .get('/auth/mfa/status')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect({ enabled: false });
  });

  it('rejects activation with a wrong code', async () => {
    const token = await authenticate();
    await request(server())
      .post('/auth/mfa/enroll')
      .set('Authorization', bearer(token))
      .expect(200);
    await request(server())
      .post('/auth/mfa/activate')
      .set('Authorization', bearer(token))
      .send({ code: '000000' })
      .expect(400);
  });

  it('requires authentication', async () => {
    await request(server()).post('/auth/mfa/enroll').expect(401);
  });
});
