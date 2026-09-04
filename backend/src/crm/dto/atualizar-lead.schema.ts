import { z } from 'zod';
import { leadEstagioSchema } from './criar-lead.schema';

const utm = z.string().trim().max(200).nullable().optional();

/**
 * `PATCH /crm/leads/:id`. `status` só aceita ATIVO|DESCARTADO (CONVERTIDO é
 * terminal e só via `/converter`). `score`/`pessoaId`/`convertidoEm` são de
 * sistema — `.strict()` os rejeita com 400.
 */
export const atualizarLeadSchema = z
  .object({
    nome: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().max(320).nullable().optional(),
    telefone: z.string().trim().max(40).nullable().optional(),
    documento: z.string().trim().max(32).nullable().optional(),
    origem: z.string().trim().max(80).nullable().optional(),
    utmSource: utm,
    utmMedium: utm,
    utmCampaign: utm,
    utmTerm: utm,
    utmContent: utm,
    estagio: leadEstagioSchema.optional(),
    status: z.enum(['ATIVO', 'DESCARTADO']).optional(),
    responsavelId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type AtualizarLeadDto = z.infer<typeof atualizarLeadSchema>;

export const tagSchema = z.object({ tag: z.string().min(1).max(80) }).strict();
export type TagDto = z.infer<typeof tagSchema>;

export const recalcularLoteSchema = z
  .object({
    cursor: z.string().uuid().optional(),
    tamanho: z.coerce.number().int().min(1).max(1000).default(200),
  })
  .strict();
export type RecalcularLoteDto = z.infer<typeof recalcularLoteSchema>;
