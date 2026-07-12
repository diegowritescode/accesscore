import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().min(1).max(320),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(1024),
  password: z.string().min(1).max(200),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
