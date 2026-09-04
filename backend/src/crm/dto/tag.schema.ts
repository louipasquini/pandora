import { z } from 'zod';

/** `POST /crm/{leads|pessoas|interacoes}/:id/tags` — associação por texto (upsert por slug). */
export const associarTagSchema = z.object({ tag: z.string().trim().min(1).max(60) }).strict();
export type AssociarTagDto = z.infer<typeof associarTagSchema>;

/** `POST /crm/admin/tags` — criação explícita do catálogo. */
export const criarTagSchema = z
  .object({
    tag: z.string().trim().min(1).max(60),
    cor: z.string().trim().max(20).nullish(),
  })
  .strict();
export type CriarTagDto = z.infer<typeof criarTagSchema>;

/** `PATCH /crm/admin/tags/:id` — `slug` é imutável. */
export const atualizarTagSchema = z
  .object({
    rotulo: z.string().trim().min(1).max(80).optional(),
    cor: z.string().trim().max(20).nullish(),
    ativo: z.boolean().optional(),
  })
  .strict();
export type AtualizarTagDto = z.infer<typeof atualizarTagSchema>;
