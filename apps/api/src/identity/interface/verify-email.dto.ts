import { z } from 'zod';

export const verifyEmailSchema = z.object({
  token: z.string(),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;
