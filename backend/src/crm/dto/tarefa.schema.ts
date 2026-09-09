import { z } from 'zod';

const TAREFA_STATUS = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as const;

export const criarTarefaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    descricao: z.string().trim().min(1).max(5000).optional(),
    dataVencimento: z.string().datetime().optional(),
    responsavelId: z.string().uuid().optional(),
    pessoaId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    oportunidadeId: z.string().uuid().optional(),
    checklist: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  })
  .strict();
export type CriarTarefaDto = z.infer<typeof criarTarefaSchema>;

export const atualizarTarefaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200).optional(),
    descricao: z.string().trim().min(1).max(5000).nullable().optional(),
    dataVencimento: z.string().datetime().nullable().optional(),
    pessoaId: z.string().uuid().nullable().optional(),
    leadId: z.string().uuid().nullable().optional(),
    oportunidadeId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type AtualizarTarefaDto = z.infer<typeof atualizarTarefaSchema>;

export const mudarStatusTarefaSchema = z
  .object({ status: z.enum(TAREFA_STATUS) })
  .strict();
export type MudarStatusTarefaDto = z.infer<typeof mudarStatusTarefaSchema>;

export const delegarTarefaSchema = z
  .object({
    responsavelId: z.string().uuid().nullable().optional(),
    motivo: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type DelegarTarefaDto = z.infer<typeof delegarTarefaSchema>;

export const listarTarefasSchema = z
  .object({
    status: z.enum(TAREFA_STATUS).optional(),
    responsavelId: z.string().uuid().optional(),
    pessoaId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    oportunidadeId: z.string().uuid().optional(),
    vencimentoDe: z.string().datetime().optional(),
    vencimentoAte: z.string().datetime().optional(),
    vencendoHoje: z
      .union([z.literal('true'), z.literal('false')])
      .transform((v) => v === 'true')
      .optional(),
    atrasada: z
      .union([z.literal('true'), z.literal('false')])
      .transform((v) => v === 'true')
      .optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarTarefasDto = z.infer<typeof listarTarefasSchema>;

export const criarChecklistItemSchema = z
  .object({ texto: z.string().trim().min(1).max(500) })
  .strict();
export type CriarChecklistItemDto = z.infer<typeof criarChecklistItemSchema>;

export const atualizarChecklistItemSchema = z
  .object({
    texto: z.string().trim().min(1).max(500).optional(),
    concluido: z.boolean().optional(),
    ordem: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type AtualizarChecklistItemDto = z.infer<typeof atualizarChecklistItemSchema>;

export const criarNotaTarefaSchema = z
  .object({ conteudo: z.string().trim().min(1).max(5000) })
  .strict();
export type CriarNotaTarefaDto = z.infer<typeof criarNotaTarefaSchema>;

export const criarDependenciaSchema = z
  .object({ dependeDeId: z.string().uuid() })
  .strict();
export type CriarDependenciaDto = z.infer<typeof criarDependenciaSchema>;

export const rankingTarefasSchema = z
  .object({
    desde: z.string().datetime().optional(),
    ate: z.string().datetime().optional(),
  })
  .strict();
export type RankingTarefasDto = z.infer<typeof rankingTarefasSchema>;
