import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/openapi-document';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

describe('OpenAPI document (e2e)', () => {
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

  it('documents the authorization surface with bearer security', () => {
    const document = buildOpenApiDocument(app);

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/authz/check',
        '/authz/expand',
        '/authz/batch-check',
        '/authz/tuples',
        '/auth/login',
      ]),
    );
    expect(document.paths['/authz/check']?.post?.requestBody).toBeDefined();
    expect(document.paths['/authz/check']?.post?.security).toContainEqual({ 'access-token': [] });
    expect(document.components?.securitySchemes?.['access-token']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });
});
