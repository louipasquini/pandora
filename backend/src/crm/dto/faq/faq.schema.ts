import { z } from 'zod';

export const criarFaqItemSchema = z
  .object({
    pergunta: z.string().trim().min(1).max(500),
    resposta: z.string().trim().min(1).max(4000),
  })
  .strict();
export type CriarFaqItemDto = z.infer<typeof criarFaqItemSchema>;

export const atualizarFaqItemSchema = z
  .object({
    pergunta: z.string().trim().min(1).max(500).optional(),
    resposta: z.string().trim().min(1).max(4000).optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'corpo vazio' });
export type AtualizarFaqItemDto = z.infer<typeof atualizarFaqItemSchema>;

export const listarFaqSchema = z
  .object({
    ativo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export type ListarFaqDto = z.infer<typeof listarFaqSchema>;
