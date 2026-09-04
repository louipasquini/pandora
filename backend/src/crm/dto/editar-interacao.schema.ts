import { z } from 'zod';

/** `PATCH /crm/interacoes/:id` — só `NOTA` aceita, único campo editável é `conteudo`. */
export const editarInteracaoSchema = z
  .object({ conteudo: z.string().trim().min(1).max(10_000) })
  .strict();
export type EditarInteracaoDto = z.infer<typeof editarInteracaoSchema>;
