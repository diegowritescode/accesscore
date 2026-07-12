import { z } from 'zod';

export const refreshSchema = z.object({
  refresh_token: z.string().min(1).max(1024),
});

export type RefreshDto = z.infer<typeof refreshSchema>;
