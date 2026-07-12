import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(200),
});

export type RegisterDto = z.infer<typeof registerSchema>;
