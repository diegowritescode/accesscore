import { z } from 'zod';
import { writePolicySchema } from './pap.dto';

export const checkSchema = z.object({
  action: z.string().min(1).max(128),
  resource: z.object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
  }),
  consistency_token: z.string().min(1).max(512).optional(),
});

export const batchCheckSchema = z.object({
  checks: z.array(checkSchema).min(1).max(50),
});

export const expandSchema = z.object({
  resource: z.object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
  }),
  relation: z.string().min(1).max(64),
});

export const simulateSchema = z.object({
  action: z.string().min(1).max(128),
  resource: z.object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
  }),
  consistency_token: z.string().min(1).max(512).optional(),
  policies: z
    .array(writePolicySchema.extend({ id: z.string().min(1).max(128).optional() }))
    .max(50)
    .optional(),
});

export const checkAsSchema = z.object({
  subject: z.object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
  }),
  action: z.string().min(1).max(128),
  resource: z.object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
  }),
  aal: z.number().int().min(0).max(4).optional(),
  consistency_token: z.string().min(1).max(512).optional(),
});

export const tupleQuerySchema = z
  .object({
    namespace: z.string().min(1).max(64).optional(),
    objectId: z.string().min(1).max(256).optional(),
    relation: z.string().min(1).max(64).optional(),
    subjectType: z.string().min(1).max(64).optional(),
    subjectId: z.string().min(1).max(256).optional(),
    subjectRelation: z.string().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((query) => (query.subjectType === undefined) === (query.subjectId === undefined), {
    message: 'subjectType and subjectId must be provided together',
  });

export type CheckDto = z.infer<typeof checkSchema>;
export type BatchCheckDto = z.infer<typeof batchCheckSchema>;
export type ExpandDto = z.infer<typeof expandSchema>;
export type SimulateDto = z.infer<typeof simulateSchema>;
export type CheckAsDto = z.infer<typeof checkAsSchema>;
export type TupleQueryDto = z.infer<typeof tupleQuerySchema>;
