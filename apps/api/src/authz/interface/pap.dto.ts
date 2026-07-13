import { z } from 'zod';
import { isIdentifier } from '../domain/identifier';
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
  ]),
);

export const defineNamespaceSchema = z.object({
  relations: z.array(z.string()).min(1),
  actions: z.record(z.string(), z.array(z.string())),
  rewrites: z.record(z.string(), usersetSchema).optional(),
});

export type WriteTupleDto = z.infer<typeof writeTupleSchema>;
export type DefineNamespaceDto = z.infer<typeof defineNamespaceSchema>;
