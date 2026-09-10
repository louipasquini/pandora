import { z } from 'zod';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB de texto CSV

/** Corpo de `POST /ingestao/guru/importar-csv`. CSV como texto (0 dep de upload binário). */
export const importarCsvGuruSchema = z
  .object({
    conta: z.enum(['GURU_PRD', 'GURU_SVC']),
    conteudo: z
      .string()
      .min(1)
      .refine((s) => Buffer.byteLength(s, 'utf8') <= MAX_BYTES, {
        message: 'conteudo acima de 5 MiB',
      }),
    fonte: z.literal('guru.csv').optional(),
  })
  .strict();

export type ImportarCsvGuruDto = z.infer<typeof importarCsvGuruSchema>;
