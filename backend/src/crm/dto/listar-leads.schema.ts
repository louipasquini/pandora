import { z } from 'zod';
import { leadEstagioSchema } from './criar-lead.schema';

/**
 * `GET /crm/leads`. Filtros combinam com `AND` sobre o `where` de escopo de
 * visão — nunca ampliam (research §5). `campo:<chave>=<valor>` chega como chaves
 * dinâmicas do query-string e é extraído à parte pelo controller.
 */
export const listarLeadsSchema = z
  .object({
    estagio: leadEstagioSchema.optional(),
    status: z.enum(['ATIVO', 'DESCARTADO', 'CONVERTIDO']).optional(),
    origem: z.string().trim().max(80).optional(),
    responsavelId: z.string().uuid().optional(),
    semResponsavel: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    q: z.string().trim().max(160).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
    ordenarPor: z.enum(['score', 'criadoEm']).default('score'),
  })
  .passthrough();
export type ListarLeadsDto = z.infer<typeof listarLeadsSchema>;
