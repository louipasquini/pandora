import { z } from 'zod';

const uuid = z.string().uuid();

/** Filtros comuns dos endpoints de painel (spec 017, FR-003). */
export const filtrosDashboardSchema = z.object({
  de: z.string().min(1),
  ate: z.string().min(1),
  equipeId: uuid.optional(),
  responsavelId: uuid.optional(),
  pipelineId: uuid.optional(),
  formato: z.enum(['json', 'csv']).optional(),
});
export type FiltrosDashboardDto = z.infer<typeof filtrosDashboardSchema>;

// ---------------------------------------------------------------- metas
const periodoMeta = z.enum(['MES', 'TRIMESTRE']);

const alvoSchema = z.union([
  z.object({ valor: z.number().finite().nonnegative() }),
  z.object({
    valorInt: z.string().regex(/^\d+$/, 'valorInt deve ser um inteiro não-negativo'),
    moeda: z.string().length(3).toUpperCase(),
  }),
]);

export const criarMetaSchema = z.object({
  // Validação de pertinência ao catálogo é do serviço → 422 (não 400), conforme o contrato.
  metrica: z.string().min(1),
  periodo: periodoMeta,
  referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'referencia deve ser YYYY-MM-DD'),
  alvo: alvoSchema,
  equipeId: uuid.nullish(),
  responsavelId: uuid.nullish(),
  descricao: z.string().max(500).nullish(),
});
export type CriarMetaDto = z.infer<typeof criarMetaSchema>;

export const atualizarMetaSchema = z
  .object({
    alvo: alvoSchema.optional(),
    equipeId: uuid.nullish(),
    responsavelId: uuid.nullish(),
    descricao: z.string().max(500).nullish(),
  })
  .refine((o) => Object.keys(o).length > 0, 'nada para atualizar');
export type AtualizarMetaDto = z.infer<typeof atualizarMetaSchema>;

export const listarMetasSchema = z.object({
  periodo: periodoMeta.optional(),
  referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ListarMetasDto = z.infer<typeof listarMetasSchema>;

// --------------------------------------------------------------- visões
const filtrosVisaoSchema = z.object({
  periodo: z.union([
    z.object({ tipo: z.literal('relativo'), dias: z.number().int().positive().max(3650) }),
    z.object({
      tipo: z.literal('absoluto'),
      de: z.string().min(1),
      ate: z.string().min(1),
    }),
  ]),
  equipeId: uuid.optional(),
  responsavelId: uuid.optional(),
  pipelineId: uuid.optional(),
});

// Pertinência de cada id ao catálogo é validada no serviço → 422 (não 400).
const paineisSchema = z.array(z.string()).max(20);

export const criarVisaoSchema = z.object({
  nome: z.string().min(1).max(120),
  filtros: filtrosVisaoSchema,
  paineis: paineisSchema,
  perfilCompartilhadoId: uuid.nullish(),
});
export type CriarVisaoDto = z.infer<typeof criarVisaoSchema>;

export const atualizarVisaoSchema = z
  .object({
    nome: z.string().min(1).max(120).optional(),
    filtros: filtrosVisaoSchema.optional(),
    paineis: paineisSchema.optional(),
    perfilCompartilhadoId: uuid.nullish(),
  })
  .refine((o) => Object.keys(o).length > 0, 'nada para atualizar');
export type AtualizarVisaoDto = z.infer<typeof atualizarVisaoSchema>;
