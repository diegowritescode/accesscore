import { z } from 'zod';

export const checkSchema = z.object({
  action: z.string().min(1).max(128),
  resource: z.object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
  }),
  consistency_token: z.string().min(1).max(512).optional(),
});

export type CheckDto = z.infer<typeof checkSchema>;
