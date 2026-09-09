import { z } from 'zod';

export const campoPessoaTipoSchema = z.enum(['TEXTO', 'NUMERO', 'BOOLEANO', 'DATA', 'SELECAO']);

const chave = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, 'slug inválido (^[a-z][a-z0-9_]{1,39}$)');

export const criarCampoPessoaDefSchema = z
  .object({
    chave,
    rotulo: z.string().trim().min(1).max(120),
    tipo: campoPessoaTipoSchema,
    opcoes: z.array(z.string().trim().min(1).max(120)).max(50).optional().default([]),
    obrigatorio: z.boolean().optional().default(false),
  })
  .strict();
export type CriarCampoPessoaDefDto = z.infer<typeof criarCampoPessoaDefSchema>;

/** `chave` e `tipo` são imutáveis — `.strict()` os rejeita. */
export const patchCampoPessoaDefSchema = z
  .object({
    rotulo: z.string().trim().min(1).max(120).optional(),
    opcoes: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    obrigatorio: z.boolean().optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchCampoPessoaDefDto = z.infer<typeof patchCampoPessoaDefSchema>;

export const listarCamposPessoaDefSchema = z
  .object({
    ativo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export type ListarCamposPessoaDefDto = z.infer<typeof listarCamposPessoaDefSchema>;

/** `PUT /pessoas/:id/campos-personalizados` — substituição total. */
export const valoresCamposPessoaSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type ValoresCamposPessoaDto = z.infer<typeof valoresCamposPessoaSchema>;
