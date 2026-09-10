import { z } from 'zod';

/** Corpo de `POST /ingestao/tmb/sincronizar`. */
export const sincronizarTmbSchema = z
  .object({
    dataInicio: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
      .optional(),
    dataFinal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
      .optional(),
    produtoId: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export type SincronizarTmbDto = z.infer<typeof sincronizarTmbSchema>;
