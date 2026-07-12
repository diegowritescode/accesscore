import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export type RegisterDto = z.infer<typeof registerSchema>;
