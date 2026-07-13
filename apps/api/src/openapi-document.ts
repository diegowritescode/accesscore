import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('AccessCore API')
    .setDescription(
      'A self-hostable IAM platform with a hybrid ReBAC + RBAC + ABAC authorization engine. ' +
        'The policy decision point exposes check / expand / batch-check with explainable, ' +
        'consistency-gated decisions; the policy administration point manages namespaces and ' +
        'relationship tuples.',
    )
    .setVersion('0.1.0')
    .addServer('http://localhost:3000', 'Local')
    .addServer('https://auth.deviego.xyz', 'Live demo')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('authz', 'Policy decision point — check, expand, batch-check')
    .addTag('pap', 'Policy administration — namespaces and relationship tuples')
    .addTag('auth', 'Identity, sessions, and tokens')
    .addTag('jwks', 'Token verification keys')
    .addTag('health', 'Liveness and readiness')
    .build();
  return SwaggerModule.createDocument(app, config);
}
