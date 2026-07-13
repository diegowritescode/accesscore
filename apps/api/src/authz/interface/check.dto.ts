import { z } from 'zod';

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

export type CheckDto = z.infer<typeof checkSchema>;
export type BatchCheckDto = z.infer<typeof batchCheckSchema>;
export type ExpandDto = z.infer<typeof expandSchema>;
