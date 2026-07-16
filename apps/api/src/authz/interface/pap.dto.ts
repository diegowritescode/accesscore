import { z } from 'zod';
import { isIdentifier } from '../domain/identifier';
import { type Condition } from '../domain/policy/condition';
import { type Userset } from '../domain/userset';

const identifier = z
  .string()
  .min(1)
  .max(64)
  .refine(isIdentifier, 'must be an identifier ([A-Za-z][A-Za-z0-9_-]*)');

const entityId = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[:#@]/.test(value), 'must not contain ":", "#", or "@"');

const subjectSchema = z.object({
  type: identifier,
  id: entityId,
  relation: identifier.optional(),
});

export const writeTupleSchema = z.object({
  object: z.object({ type: identifier, id: entityId }),
  relation: identifier,
  subject: subjectSchema,
});

const usersetSchema: z.ZodType<Userset> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('this') }),
    z.object({ kind: z.literal('computedUserset'), relation: identifier }),
    z.object({
      kind: z.literal('tupleToUserset'),
      tupleset: identifier,
      computedUserset: identifier,
    }),
    z.object({ kind: z.literal('union'), children: z.array(usersetSchema).min(1) }),
    z.object({ kind: z.literal('intersection'), children: z.array(usersetSchema).min(1) }),
    z.object({ kind: z.literal('exclusion'), base: usersetSchema, subtract: usersetSchema }),
  ]),
);

export const defineNamespaceSchema = z.object({
  relations: z.array(z.string()).min(1),
  actions: z.record(z.string(), z.array(z.string())),
  rewrites: z.record(z.string(), usersetSchema).optional(),
});

const actionOrWildcard = z.union([identifier, z.literal('*')]);

const termSchema = z.union([
  z.object({ kind: z.literal('attr'), path: z.enum(['principal.aal', 'env.ip', 'env.now']) }),
  z.object({ kind: z.literal('lit'), value: z.union([z.boolean(), z.number(), z.string()]) }),
]);

const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ kind: z.enum(['and', 'or']), children: z.array(conditionSchema).min(1) }),
    z.object({ kind: z.literal('not'), child: conditionSchema }),
    z.object({
      kind: z.literal('cmp'),
      op: z.enum(['eq', 'ne', 'lt', 'le', 'gt', 'ge']),
      left: termSchema,
      right: termSchema,
    }),
    z.object({
      kind: z.literal('in'),
      needle: termSchema,
      set: z.array(z.union([z.string(), z.number()])).min(1),
    }),
    z.object({ kind: z.literal('ipInCidr'), ip: termSchema, cidrs: z.array(z.string()).min(1) }),
  ]),
);

export const writePolicySchema = z.object({
  effect: z.enum(['permit', 'forbid']),
  resourceType: identifier,
  action: actionOrWildcard,
  condition: conditionSchema,
});

export type WriteTupleDto = z.infer<typeof writeTupleSchema>;
export type DefineNamespaceDto = z.infer<typeof defineNamespaceSchema>;
export type WritePolicyDto = z.infer<typeof writePolicySchema>;
