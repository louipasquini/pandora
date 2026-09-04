import { z } from 'zod';

const dinheiroSchema = z
  .object({
    valorInt: z.string().regex(/^-?\d+$/, 'valorInt deve ser um inteiro em string'),
    moeda: z.string().length(3),
  })
  .strict();

export const criarOportunidadeSchema = z
  .object({
    pipelineId: z.string().uuid(),
    pessoaId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    titulo: z.string().trim().min(1).max(200),
    valorEstimado: dinheiroSchema,
    responsavelId: z.string().uuid().optional(),
    dataPrevistaFechamento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
export type CriarOportunidadeDto = z.infer<typeof criarOportunidadeSchema>;

export const atualizarOportunidadeSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200).optional(),
    valorEstimado: dinheiroSchema.optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    dataPrevistaFechamento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type AtualizarOportunidadeDto = z.infer<typeof atualizarOportunidadeSchema>;

export const moverOportunidadeSchema = z
  .object({
    etapaId: z.string().uuid(),
    motivo: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type MoverOportunidadeDto = z.infer<typeof moverOportunidadeSchema>;

export const listarOportunidadesSchema = z
  .object({
    pipelineId: z.string().uuid().optional(),
    etapaId: z.string().uuid().optional(),
    responsavelId: z.string().uuid().optional(),
    slaEstourado: z
      .union([z.literal('true'), z.literal('false')])
      .transform((v) => v === 'true')
      .optional(),
    esfriando: z
      .union([z.literal('true'), z.literal('false')])
      .transform((v) => v === 'true')
      .optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarOportunidadesDto = z.infer<typeof listarOportunidadesSchema>;
