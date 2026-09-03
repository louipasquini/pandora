import { z } from 'zod';

const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use "YYYY-MM-DD"')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'data inválida');

export const criarFeriadoSchema = z
  .object({
    equipeId: z.string().uuid().nullable().optional(),
    data: dataIso,
    descricao: z.string().trim().min(1).max(200),
    recorrenteAnual: z.boolean().default(false),
  })
  .strict();
export type CriarFeriadoDto = z.infer<typeof criarFeriadoSchema>;

export const patchFeriadoSchema = z
  .object({
    equipeId: z.string().uuid().nullable().optional(),
    data: dataIso.optional(),
    descricao: z.string().trim().min(1).max(200).optional(),
    recorrenteAnual: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type PatchFeriadoDto = z.infer<typeof patchFeriadoSchema>;

export const listarFeriadosSchema = z
  .object({
    equipeId: z.string().uuid().optional(),
    incluirGlobais: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    ano: z.coerce.number().int().min(1970).max(9999).optional(),
  })
  .strict();
export type ListarFeriadosDto = z.infer<typeof listarFeriadosSchema>;
