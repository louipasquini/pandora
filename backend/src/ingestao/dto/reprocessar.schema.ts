import { z } from 'zod';

/** Corpo (opcional) de `POST /ingestao/eventos/{id}/reprocessar`. */
export const reprocessarSchema = z
  .object({ forcar: z.boolean().default(false) })
  .strict();

export type ReprocessarDto = z.infer<typeof reprocessarSchema>;
