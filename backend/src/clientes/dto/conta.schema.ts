import { z } from 'zod';

export const criarContaSchema = z
  .object({
    tipo: z.enum(['HOUSEHOLD', 'EMPRESA']),
    nome: z.string().trim().min(1).max(160),
  })
  .strict();
export type CriarContaDto = z.infer<typeof criarContaSchema>;

export const patchContaSchema = z
  .object({
    nome: z.string().trim().min(1).max(160).optional(),
    tipo: z.enum(['HOUSEHOLD', 'EMPRESA']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'informe ao menos um campo para editar',
  });
export type PatchContaDto = z.infer<typeof patchContaSchema>;

export const associarPessoaSchema = z
  .object({ pessoaId: z.string().uuid() })
  .strict();
export type AssociarPessoaDto = z.infer<typeof associarPessoaSchema>;

export const contaMergeBodySchema = z
  .object({ absorvidaId: z.string().uuid() })
  .strict();
export type ContaMergeBodyDto = z.infer<typeof contaMergeBodySchema>;
