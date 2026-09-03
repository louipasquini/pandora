import { z } from 'zod';

export const equipeTipoSchema = z.enum(['COMERCIAL', 'ATENDIMENTO', 'CS']);

export const criarEquipeSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    descricao: z.string().trim().max(500).nullish(),
    tipo: equipeTipoSchema,
  })
  .strict();
export type CriarEquipeDto = z.infer<typeof criarEquipeSchema>;

export const patchEquipeSchema = z
  .object({
    nome: z.string().trim().min(1).max(120).optional(),
    descricao: z.string().trim().max(500).nullable().optional(),
    tipo: equipeTipoSchema.optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchEquipeDto = z.infer<typeof patchEquipeSchema>;

export const listarEquipesSchema = z
  .object({
    ativo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    tipo: equipeTipoSchema.optional(),
    usuarioId: z.string().uuid().optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarEquipesDto = z.infer<typeof listarEquipesSchema>;
