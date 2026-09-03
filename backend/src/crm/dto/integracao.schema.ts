import { z } from 'zod';

export const integracaoTipoSchema = z.enum([
  'API_KEY',
  'WEBHOOK',
  'CONEXAO_INTERNA',
]);
export const integracaoAlvoSchema = z.enum([
  'FINANCEIRO',
  'MARKETING',
  'CENTRAL',
  'EXTERNO',
]);

const CHAVE_SUSPEITA = /^(token|secret|api[_-]?key|password|senha|pwd)$/i;

/** `config` é jsonb livre por tipo, mas NUNCA carrega segredo (FR-023). */
const configSchema = z
  .record(z.unknown())
  .refine(
    (c) => !Object.keys(c).some((k) => CHAVE_SUSPEITA.test(k)),
    { message: 'config não pode conter segredo (token/secret/apiKey/password)' },
  );

export const criarIntegracaoSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    tipo: integracaoTipoSchema,
    alvo: integracaoAlvoSchema,
    config: configSchema.default({}),
    segredo: z.string().min(1).max(4096).optional(),
    ativo: z.boolean().optional(),
  })
  .strict();
export type CriarIntegracaoDto = z.infer<typeof criarIntegracaoSchema>;

export const patchIntegracaoSchema = z
  .object({
    nome: z.string().trim().min(1).max(120).optional(),
    alvo: integracaoAlvoSchema.optional(),
    config: configSchema.optional(),
    segredo: z.string().min(1).max(4096).optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchIntegracaoDto = z.infer<typeof patchIntegracaoSchema>;

export const rotacionarSchema = z
  .object({ segredo: z.string().min(1).max(4096).optional() })
  .strict();
export type RotacionarDto = z.infer<typeof rotacionarSchema>;

export const listarIntegracoesSchema = z
  .object({
    tipo: integracaoTipoSchema.optional(),
    alvo: integracaoAlvoSchema.optional(),
    ativo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarIntegracoesDto = z.infer<typeof listarIntegracoesSchema>;
