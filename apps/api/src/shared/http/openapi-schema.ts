import { type SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const toOpenApi = zodToJsonSchema as unknown as (
  schema: ZodTypeAny,
  options: { target: 'openApi3'; $refStrategy: 'none' },
) => unknown;

export function openApiSchema(schema: ZodTypeAny): SchemaObject {
  return toOpenApi(schema, { target: 'openApi3', $refStrategy: 'none' }) as SchemaObject;
}

const usersetNodeSchema: SchemaObject = {
  type: 'object',
  description:
    'A userset rewrite node (recursive): kind is this | computedUserset | tupleToUserset | union. ' +
    'See ADR-015 for the full grammar and the README demo for a worked example.',
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['this', 'computedUserset', 'tupleToUserset', 'union'] },
    relation: { type: 'string' },
    tupleset: { type: 'string' },
    computedUserset: { type: 'string' },
    children: { type: 'array', items: { type: 'object' } },
  },
};

export const namespaceDefinitionSchema: SchemaObject = {
  type: 'object',
  required: ['relations', 'actions'],
  properties: {
    relations: { type: 'array', items: { type: 'string' } },
    actions: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
    rewrites: { type: 'object', additionalProperties: usersetNodeSchema },
  },
};
