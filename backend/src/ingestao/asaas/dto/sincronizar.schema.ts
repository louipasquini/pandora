import { z } from 'zod';

const contaSchema = z.enum(['ASAAS_PRD', 'ASAAS_SVC']);

/** Corpo de `POST /ingestao/asaas/sincronizar`. */
export const sincronizarAsaasSchema = z
  .object({
    conta: contaSchema,
    dataInicio: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
      .optional(),
    dataFinal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
      .optional(),
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict();

export type SincronizarAsaasDto = z.infer<typeof sincronizarAsaasSchema>;
