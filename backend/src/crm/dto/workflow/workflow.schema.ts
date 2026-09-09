import { z } from 'zod';
import { acoesFluxoSchema, condicaoNoSchema, FLUXO_GATILHO_TIPOS } from '../../domain/workflow';

const gatilhoTipoSchema = z.enum(FLUXO_GATILHO_TIPOS);

export const criarFluxoSchema = z
  .object({
    nome: z.string().trim().min(1).max(200),
    descricao: z.string().trim().max(2000).optional(),
    gatilhoTipo: gatilhoTipoSchema,
  })
  .strict();
export type CriarFluxoDto = z.infer<typeof criarFluxoSchema>;

export const atualizarMetadadoFluxoSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    descricao: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type AtualizarMetadadoFluxoDto = z.infer<typeof atualizarMetadadoFluxoSchema>;

export const substituirRascunhoSchema = z
  .object({
    gatilhoTipo: gatilhoTipoSchema,
    condicoes: condicaoNoSchema,
    acoes: acoesFluxoSchema,
  })
  .strict();
export type SubstituirRascunhoDto = z.infer<typeof substituirRascunhoSchema>;

export const listarFluxosSchema = z
  .object({
    gatilhoTipo: gatilhoTipoSchema.optional(),
  })
  .strict();
export type ListarFluxosDto = z.infer<typeof listarFluxosSchema>;

export const simularSchema = z
  .object({
    versaoId: z.string().uuid().optional(),
    registroTipo: z.enum(['LEAD', 'OPORTUNIDADE']),
    registroId: z.string().uuid(),
  })
  .strict();
export type SimularDto = z.infer<typeof simularSchema>;

export const usarComoBaseSchema = z
  .object({
    nome: z.string().trim().min(1).max(200),
    descricao: z.string().trim().max(2000).optional(),
  })
  .strict();
export type UsarComoBaseDto = z.infer<typeof usarComoBaseSchema>;

export const listarExecucoesSchema = z
  .object({
    resultado: z.enum(['EXECUTADA', 'CONDICAO_NAO_SATISFEITA', 'FALHOU']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().uuid().optional(),
  })
  .strict();
export type ListarExecucoesDto = z.infer<typeof listarExecucoesSchema>;
