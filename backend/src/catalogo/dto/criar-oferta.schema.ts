import { OfertaOrigemRefTipo, PlataformaOrigem, TurmaTipo } from '@prisma/client';
import { z } from 'zod';

const codigo1Char = z.string().trim().length(1).toUpperCase();

export const origemRefSchema = z
  .object({
    plataformaOrigem: z.nativeEnum(PlataformaOrigem),
    tipoRef: z.nativeEnum(OfertaOrigemRefTipo),
    valorRef: z.string().trim().min(1),
  })
  .strict();

export const criarOfertaSchema = z
  .object({
    produtoId: z.string().uuid(),
    turmaTipo: z.nativeEnum(TurmaTipo).optional(),
    turmaNumero: z.number().int().nullable().optional(),
    subprodutoCodigo: codigo1Char.optional(),
    modeloCobrancaCodigo: codigo1Char.optional(),
    modeloTransacaoCodigo: codigo1Char.optional(),
    origemRef: origemRefSchema.optional(),
  })
  .strict();

export type CriarOfertaSchemaDto = z.infer<typeof criarOfertaSchema>;

export const listarOfertasSchema = z
  .object({
    produtoId: z.string().uuid().optional(),
    produtoCodigo: z.string().trim().length(3).optional(),
    plataformaOrigem: z.nativeEnum(PlataformaOrigem).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strip();

export type ListarOfertasSchemaDto = z.infer<typeof listarOfertasSchema>;
