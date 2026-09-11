import { z } from 'zod';

export const importarCsvSchema = z
  .object({
    csv: z.string().min(1),
  })
  .strict();

export type ImportarCsvSchemaDto = z.infer<typeof importarCsvSchema>;

export const importarOfertasCsvSchema = z
  .object({
    csv: z.string().min(1),
    conta: z.enum(['HOTMART_PRD', 'HOTMART_SVC']),
  })
  .strict();

export type ImportarOfertasCsvSchemaDto = z.infer<typeof importarOfertasCsvSchema>;
