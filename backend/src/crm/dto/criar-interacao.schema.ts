import { z } from 'zod';

export const interacaoTipoSchema = z.enum([
  'WHATSAPP',
  'EMAIL',
  'LIGACAO',
  'TICKET',
  'NOTA',
  'NPS',
]);
export const interacaoDirecaoSchema = z.enum(['ENTRADA', 'SAIDA']);

/** `POST /crm/interacoes`. A regra de âncora XOR e de campos por tipo é do domínio. */
export const criarInteracaoSchema = z
  .object({
    pessoaId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    tipo: interacaoTipoSchema,
    direcao: interacaoDirecaoSchema.optional(),
    conteudo: z.string().trim().min(1).max(10_000),
    // Faixa 0-10 é checada no domínio (`validarCamposPorTipo`), não aqui — fora de
    // faixa deve responder 422 (semântico), não 400 (estrutural). Só valida "é inteiro".
    notaNps: z.number().int().optional(),
    ocorridoEm: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    canalOrigem: z.string().trim().max(60).optional(),
    idExterno: z.string().trim().max(200).optional(),
  })
  .strict();
export type CriarInteracaoDto = z.infer<typeof criarInteracaoSchema>;

/** Query de listagem da timeline (por pessoa OU por lead). */
export const listarInteracoesSchema = z
  .object({
    tipo: interacaoTipoSchema.optional(),
    desde: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    ate: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    incluirRemovidas: z
      .union([z.literal('true'), z.literal('false')])
      .transform((v) => v === 'true')
      .optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarInteracoesDto = z.infer<typeof listarInteracoesSchema>;
