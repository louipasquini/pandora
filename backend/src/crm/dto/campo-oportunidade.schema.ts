import { z } from 'zod';
import { campoTipoSchema } from './campo-personalizado.schema';

const chave = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, 'slug inválido (^[a-z][a-z0-9_]{1,39}$)');

export const criarCampoOportunidadeSchema = z
  .object({
    chave,
    rotulo: z.string().trim().min(1).max(120),
    tipo: campoTipoSchema,
    opcoes: z.array(z.string().trim().min(1).max(120)).max(50).optional().default([]),
    obrigatorio: z.boolean().optional().default(false),
  })
  .strict();
export type CriarCampoOportunidadeDto = z.infer<typeof criarCampoOportunidadeSchema>;

export const patchCampoOportunidadeSchema = z
  .object({
    rotulo: z.string().trim().min(1).max(120).optional(),
    opcoes: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    obrigatorio: z.boolean().optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchCampoOportunidadeDto = z.infer<typeof patchCampoOportunidadeSchema>;

export const listarCamposOportunidadeSchema = z
  .object({
    ativo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export type ListarCamposOportunidadeDto = z.infer<typeof listarCamposOportunidadeSchema>;

/** `PUT /crm/oportunidades/:id/campos-personalizados` — substituição total. */
export const valoresCamposOportunidadeSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type ValoresCamposOportunidadeDto = z.infer<typeof valoresCamposOportunidadeSchema>;
