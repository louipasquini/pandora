import { z } from 'zod';

const ancoraSchema = z
  .object({
    pessoaId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    canalId: z.string().uuid(),
  })
  .strict();

export const enviarMensagemWhatsappSchema = z.discriminatedUnion('modo', [
  ancoraSchema.extend({
    modo: z.literal('LIVRE'),
    texto: z.string().trim().min(1).max(4096),
  }),
  ancoraSchema.extend({
    modo: z.literal('TEMPLATE'),
    templateId: z.string().uuid(),
    parametros: z.array(z.string().max(1024)).max(20).default([]),
  }),
]);
export type EnviarMensagemWhatsappDto = z.infer<typeof enviarMensagemWhatsappSchema>;

export const janelaWhatsappQuerySchema = z
  .object({
    pessoaId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
  })
  .strict();
export type JanelaWhatsappQueryDto = z.infer<typeof janelaWhatsappQuerySchema>;
