import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

describe('JWKS (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= DATABASE_URL;
    process.env.SIGNER_DRIVER = 'software';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('publishes the active public key with kid and alg, cacheable', async () => {
    const response = await request(app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200)
      .expect('cache-control', /max-age=\d+/);

    expect(Array.isArray(response.body.keys)).toBe(true);
    expect(response.body.keys.length).toBeGreaterThanOrEqual(1);
    expect(response.body.keys[0]).toMatchObject({
      kty: 'OKP',
      crv: 'Ed25519',
      alg: 'EdDSA',
      use: 'sig',
    });
    expect(typeof response.body.keys[0].kid).toBe('string');
    expect(typeof response.body.keys[0].x).toBe('string');
  });
});
