import { z } from 'zod';
import { isIdentifier } from '../domain/identifier';

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

export const defineNamespaceSchema = z.object({
  relations: z.array(z.string()).min(1),
  actions: z.record(z.string(), z.array(z.string())),
});

export type WriteTupleDto = z.infer<typeof writeTupleSchema>;
export type DefineNamespaceDto = z.infer<typeof defineNamespaceSchema>;
