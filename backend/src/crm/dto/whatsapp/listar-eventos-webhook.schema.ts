import { z } from 'zod';

export const listarEventosWebhookSchema = z
  .object({
    status: z.enum(['PENDENTE', 'PROCESSADO', 'ERRO']).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarEventosWebhookDto = z.infer<typeof listarEventosWebhookSchema>;
