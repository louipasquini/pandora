import { z } from 'zod';

/** `PATCH /crm/segmentos/:id`. `alvo` é imutável após criado — não entra aqui. */
export const atualizarSegmentoSchema = z
  .object({
    nome: z.string().trim().min(1).max(160).optional(),
    descricao: z.string().trim().max(500).nullish(),
    filtro: z.record(z.unknown()).optional(),
    ativo: z.boolean().optional(),
  })
  .strict();
export type AtualizarSegmentoDto = z.infer<typeof atualizarSegmentoSchema>;
