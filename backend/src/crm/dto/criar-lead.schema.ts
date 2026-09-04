import { z } from 'zod';

export const leadEstagioSchema = z.enum([
  'NOVO',
  'CONTATO_FEITO',
  'QUALIFICADO',
  'NUTRICAO',
  'DESQUALIFICADO',
]);

const utm = z.string().trim().max(200).nullish();

/** `POST /crm/leads`. Rejeita campos de sistema (`score`, `pessoaId`, `status`). */
export const criarLeadSchema = z
  .object({
    nome: z.string().trim().min(1).max(160),
    email: z.string().trim().max(320).nullish(),
    telefone: z.string().trim().max(40).nullish(),
    documento: z.string().trim().max(32).nullish(),
    origem: z.string().trim().max(80).nullish(),
    idExterno: z.string().trim().max(200).nullish(),
    utmSource: utm,
    utmMedium: utm,
    utmCampaign: utm,
    utmTerm: utm,
    utmContent: utm,
    estagio: leadEstagioSchema.optional(),
    responsavelId: z.string().uuid().nullish(),
    tags: z.array(z.string()).max(50).optional(),
  })
  .strict();
// A exigência "email OU telefone" é validada no `LeadService` (→ 422, não 400).
export type CriarLeadDto = z.infer<typeof criarLeadSchema>;
