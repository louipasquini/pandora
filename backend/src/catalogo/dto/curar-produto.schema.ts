import { z } from 'zod';

export const curarProdutoSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    assinatura: z.boolean().optional(),
  })
  .strict();

export type CurarProdutoSchemaDto = z.infer<typeof curarProdutoSchema>;

export const listarProdutosSchema = z
  .object({
    q: z.string().trim().min(1).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strip();

export type ListarProdutosSchemaDto = z.infer<typeof listarProdutosSchema>;
