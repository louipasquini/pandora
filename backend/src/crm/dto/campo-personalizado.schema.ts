import { z } from 'zod';

export const campoTipoSchema = z.enum([
  'TEXTO',
  'NUMERO',
  'BOOLEANO',
  'DATA',
  'SELECAO',
]);

const chave = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, 'slug inválido (^[a-z][a-z0-9_]{1,39}$)');

export const criarCampoDefSchema = z
  .object({
    chave,
    rotulo: z.string().trim().min(1).max(120),
    tipo: campoTipoSchema,
    opcoes: z.array(z.string().trim().min(1).max(120)).max(50).optional().default([]),
    obrigatorio: z.boolean().optional().default(false),
  })
  .strict();
export type CriarCampoDefDto = z.infer<typeof criarCampoDefSchema>;

/** `chave` e `tipo` são imutáveis — `.strict()` os rejeita. */
export const patchCampoDefSchema = z
  .object({
    rotulo: z.string().trim().min(1).max(120).optional(),
    opcoes: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    obrigatorio: z.boolean().optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchCampoDefDto = z.infer<typeof patchCampoDefSchema>;

export const listarCamposDefSchema = z
  .object({
    ativo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export type ListarCamposDefDto = z.infer<typeof listarCamposDefSchema>;

/** `PUT /crm/leads/:id/campos-personalizados` — substituição total. */
export const valoresCamposSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type ValoresCamposDto = z.infer<typeof valoresCamposSchema>;
