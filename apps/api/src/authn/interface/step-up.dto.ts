import { z } from 'zod';

export const stepUpSchema = z.object({
  code: z.string().min(6).max(24),
});

export type StepUpDto = z.infer<typeof stepUpSchema>;
