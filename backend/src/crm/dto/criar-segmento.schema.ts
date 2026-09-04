import { z } from 'zod';

export const segmentoAlvoSchema = z.enum(['LEAD', 'PESSOA']);

/** `POST /crm/segmentos`. `filtro` é validado à parte pelo domínio (esquema fechado por `alvo`). */
export const criarSegmentoSchema = z
  .object({
    nome: z.string().trim().min(1).max(160),
    descricao: z.string().trim().max(500).nullish(),
    alvo: segmentoAlvoSchema,
    filtro: z.record(z.unknown()).default({}),
  })
  .strict();
export type CriarSegmentoDto = z.infer<typeof criarSegmentoSchema>;

export const listarSegmentosSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarSegmentosDto = z.infer<typeof listarSegmentosSchema>;

export const membrosSegmentoSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type MembrosSegmentoDto = z.infer<typeof membrosSegmentoSchema>;
