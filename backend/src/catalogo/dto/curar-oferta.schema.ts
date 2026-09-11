import { TurmaTipo } from '@prisma/client';
import { z } from 'zod';

const codigo1Char = z.string().trim().length(1).toUpperCase();

const dinheiroEntradaSchema = z
  .object({
    valorInt: z.union([z.string().regex(/^-?\d+$/), z.number().int()]),
    moeda: z.string().trim().length(3).toUpperCase(),
  })
  .strict();

export const curarOfertaCatalogoSchema = z
  .object({
    ticket: dinheiroEntradaSchema.nullable().optional(),
    precoTabela: dinheiroEntradaSchema.nullable().optional(),
    tempoAcessoDias: z.number().int().min(0).nullable().optional(),
    combo: z.boolean().optional(),
    lancamento: z.boolean().optional(),
    bonus: z.array(z.string().trim().min(1)).optional(),
    produtosDoComboIds: z.array(z.string().uuid()).optional(),
  })
  .strict();

export const curarOfertaSchema = z
  .object({
    turmaTipo: z.nativeEnum(TurmaTipo).optional(),
    turmaNumero: z.number().int().nullable().optional(),
    subprodutoCodigo: codigo1Char.optional(),
    modeloCobrancaCodigo: codigo1Char.optional(),
    modeloTransacaoCodigo: codigo1Char.optional(),
    catalogo: curarOfertaCatalogoSchema.optional(),
  })
  .strict();

export type CurarOfertaSchemaDto = z.infer<typeof curarOfertaSchema>;
