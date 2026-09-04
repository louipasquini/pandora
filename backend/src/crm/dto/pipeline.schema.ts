import { z } from 'zod';

export const modoAtribuicaoSchema = z.enum(['MANUAL', 'RODIZIO', 'REGRA']);
export const etapaTipoSchema = z.enum(['ABERTA', 'GANHA', 'PERDIDA']);

export const criarPipelineSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    descricao: z.string().trim().max(2000).optional(),
    equipeId: z.string().uuid().optional(),
    modoAtribuicao: modoAtribuicaoSchema.optional().default('MANUAL'),
    atribuicaoFallback: z.enum(['RODIZIO']).nullable().optional(),
    diasEsfriando: z.number().int().positive().optional(),
  })
  .strict();
export type CriarPipelineDto = z.infer<typeof criarPipelineSchema>;

export const patchPipelineSchema = z
  .object({
    nome: z.string().trim().min(1).max(120).optional(),
    descricao: z.string().trim().max(2000).nullable().optional(),
    equipeId: z.string().uuid().nullable().optional(),
    modoAtribuicao: modoAtribuicaoSchema.optional(),
    atribuicaoFallback: z.enum(['RODIZIO']).nullable().optional(),
    diasEsfriando: z.number().int().positive().nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchPipelineDto = z.infer<typeof patchPipelineSchema>;

export const listarPipelinesSchema = z
  .object({
    ativo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export type ListarPipelinesDto = z.infer<typeof listarPipelinesSchema>;

export const criarEtapaSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    ordem: z.number().int().min(0),
    tipo: etapaTipoSchema,
    slaHoras: z.number().int().positive().optional(),
  })
  .strict();
export type CriarEtapaDto = z.infer<typeof criarEtapaSchema>;

export const patchEtapaSchema = z
  .object({
    nome: z.string().trim().min(1).max(120).optional(),
    ordem: z.number().int().min(0).optional(),
    tipo: etapaTipoSchema.optional(),
    slaHoras: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchEtapaDto = z.infer<typeof patchEtapaSchema>;

const regraAtribuicaoValorSchema = z.union([
  z.object({ igual: z.string().trim().min(1) }).strict(),
  z
    .object({ minimoInt: z.string().regex(/^-?\d+$/), moeda: z.string().length(3) })
    .strict(),
]);

export const atribuicaoPipelineSchema = z
  .object({
    modoAtribuicao: modoAtribuicaoSchema,
    atribuicaoFallback: z.enum(['RODIZIO']).nullable(),
    regras: z
      .array(
        z
          .object({
            ordem: z.number().int().min(0),
            campo: z.enum(['ORIGEM', 'VALOR_ESTIMADO_MINIMO']),
            valor: regraAtribuicaoValorSchema,
            responsavelId: z.string().uuid(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type AtribuicaoPipelineDto = z.infer<typeof atribuicaoPipelineSchema>;
