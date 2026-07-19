import { z } from 'zod';

export const activateMfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export type ActivateMfaDto = z.infer<typeof activateMfaSchema>;
