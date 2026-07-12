import { z } from 'zod';

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(1024),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;
