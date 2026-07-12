import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(200),
});

export type LoginDto = z.infer<typeof loginSchema>;
