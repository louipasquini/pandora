import { z } from 'zod';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB de texto CSV

/** Corpo de `POST /ingestao/asaas/importar-csv`. CSV como texto (0 dep de upload binário). */
export const importarCsvAsaasSchema = z
  .object({
    conta: z.enum(['ASAAS_PRD', 'ASAAS_SVC']),
    conteudo: z
      .string()
      .min(1)
      .refine((s) => Buffer.byteLength(s, 'utf8') <= MAX_BYTES, {
        message: 'conteudo acima de 5 MiB',
      }),
    fonte: z.literal('asaas.csv').optional(),
  })
  .strict();

export type ImportarCsvAsaasDto = z.infer<typeof importarCsvAsaasSchema>;
