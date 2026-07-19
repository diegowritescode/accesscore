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

  const PASSWORD = 'correct horse staple';

  interface LoginBody {
    access_token: string;
    mfa_required?: boolean;
  }

  const login = async (email: string): Promise<LoginBody> =>
    (await request(server()).post('/auth/login').send({ email, password: PASSWORD }).expect(200))
      .body as LoginBody;

  const authenticate = async (): Promise<{ token: string; email: string }> => {
    counter += 1;
    const email = `mfa-${counter}@example.com`;
    await request(server()).post('/auth/register').send({ email, password: PASSWORD }).expect(202);
    await pool.query(
      "UPDATE users SET status = 'active', email_verified_at = now() WHERE email = $1",
      [email],
    );
    return { token: (await login(email)).access_token, email };
  };

  const bearer = (token: string): string => `Bearer ${token}`;

  const aalOf = (token: string): number => {
    const payload = token.split('.')[1] ?? '';
    return (JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { aal: number }).aal;
  };

  it('enrolls, activates, issues recovery codes, regenerates them, and disables', async () => {
    const { token } = await authenticate();

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
      .expect({ enabled: false, recoveryCodesRemaining: 0 });

    const activate = await request(server())
      .post('/auth/mfa/activate')
      .set('Authorization', bearer(token))
      .send({ code: totpCode(secret ?? '', new Date()) })
      .expect(200);
    const firstCodes = (activate.body as { status: string; recoveryCodes: string[] }).recoveryCodes;
    expect(activate.body).toMatchObject({ status: 'active' });
    expect(firstCodes).toHaveLength(10);

    await request(server())
      .get('/auth/mfa/status')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect({ enabled: true, recoveryCodesRemaining: 10 });

    const regenerate = await request(server())
      .post('/auth/mfa/recovery-codes')
      .set('Authorization', bearer(token))
      .expect(200);
    const newCodes = (regenerate.body as { recoveryCodes: string[] }).recoveryCodes;
    expect(newCodes).toHaveLength(10);
    expect(newCodes).not.toEqual(firstCodes);

    await request(server())
      .get('/auth/mfa/status')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect({ enabled: true, recoveryCodesRemaining: 10 });

    await request(server())
      .post('/auth/mfa/disable')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect({ status: 'disabled' });

    await request(server())
      .get('/auth/mfa/status')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect({ enabled: false, recoveryCodesRemaining: 0 });
  });

  it('rejects activation with a wrong code', async () => {
    const { token } = await authenticate();
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

  it('elevates aal to 2 via step-up with a TOTP and a recovery code', async () => {
    const { token, email } = await authenticate();

    const enroll = await request(server())
      .post('/auth/mfa/enroll')
      .set('Authorization', bearer(token))
      .expect(200);
    const secret = new URL((enroll.body as { otpauthUri: string }).otpauthUri).searchParams.get(
      'secret',
    );
    const activate = await request(server())
      .post('/auth/mfa/activate')
      .set('Authorization', bearer(token))
      .send({ code: totpCode(secret ?? '', new Date()) })
      .expect(200);
    const recoveryCodes = (activate.body as { recoveryCodes: string[] }).recoveryCodes;

    const fresh = await login(email);
    expect(fresh.mfa_required).toBe(true);
    expect(aalOf(fresh.access_token)).toBe(1);

    const nextStep = new Date(Date.now() + 30_000);
    const totpStepUp = await request(server())
      .post('/auth/mfa/step-up')
      .set('Authorization', bearer(fresh.access_token))
      .send({ code: totpCode(secret ?? '', nextStep) })
      .expect(200);
    expect(aalOf((totpStepUp.body as { access_token: string }).access_token)).toBe(2);

    const recoveryStepUp = await request(server())
      .post('/auth/mfa/step-up')
      .set('Authorization', bearer(fresh.access_token))
      .send({ code: recoveryCodes[0] })
      .expect(200);
    expect(aalOf((recoveryStepUp.body as { access_token: string }).access_token)).toBe(2);

    await request(server())
      .post('/auth/mfa/step-up')
      .set('Authorization', bearer(fresh.access_token))
      .send({ code: '999999' })
      .expect(401);
  });
});
