import { z } from 'zod';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB de texto CSV

/** Corpo de `POST /ingestao/tmb/importar-csv`. CSV como texto (0 dep de upload binário). */
export const importarCsvTmbSchema = z
  .object({
    conteudo: z
      .string()
      .min(1)
      .refine((s) => Buffer.byteLength(s, 'utf8') <= MAX_BYTES, {
        message: 'conteudo acima de 5 MiB',
      }),
    fonte: z.literal('tmb.csv').optional(),
  })
  .strict();

export type ImportarCsvTmbDto = z.infer<typeof importarCsvTmbSchema>;
