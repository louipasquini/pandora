import { z } from 'zod';

/**
 * Envelope do webhook da Meta Cloud API (spec 011). **Tolerante**
 * (`.passthrough()`) — a Meta envia muito mais campos do que usamos (preço,
 * erros de conta, etc.); capturamos só o necessário para resolver o canal,
 * criar a interação e atualizar o status de entrega.
 */
export const mensagemWebhookSchema = z
  .object({
    from: z.string().min(1),
    id: z.string().min(1),
    timestamp: z.string().min(1),
    type: z.string().min(1),
    text: z.object({ body: z.string() }).passthrough().optional(),
  })
  .passthrough();

export const statusWebhookSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    timestamp: z.string().min(1),
    recipient_id: z.string().optional(),
    errors: z
      .array(z.object({ title: z.string().optional(), code: z.number().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

export const contatoWebhookSchema = z
  .object({
    wa_id: z.string().min(1),
    profile: z.object({ name: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export const valorWebhookSchema = z
  .object({
    messaging_product: z.string().optional(),
    metadata: z
      .object({
        phone_number_id: z.string().min(1),
        display_phone_number: z.string().optional(),
      })
      .passthrough(),
    contacts: z.array(contatoWebhookSchema).optional(),
    messages: z.array(mensagemWebhookSchema).optional(),
    statuses: z.array(statusWebhookSchema).optional(),
  })
  .passthrough();

export const payloadWebhookSchema = z
  .object({
    object: z.string().min(1),
    entry: z
      .array(
        z
          .object({
            id: z.string().optional(),
            changes: z
              .array(
                z
                  .object({
                    field: z.string().optional(),
                    value: valorWebhookSchema,
                  })
                  .passthrough(),
              )
              .min(1),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export type PayloadWebhook = z.infer<typeof payloadWebhookSchema>;
export type ValorWebhook = z.infer<typeof valorWebhookSchema>;
export type MensagemWebhook = z.infer<typeof mensagemWebhookSchema>;
export type StatusWebhook = z.infer<typeof statusWebhookSchema>;

/** Tipo Meta (`messages[].type`) → tipo de conteúdo canônico da spec. */
export const TIPOS_CONTEUDO_MIDIA = ['image', 'audio', 'document', 'video'] as const;

/** Extrai o `id` de mídia (Meta) do campo correspondente ao `type` da mensagem. */
export function idMidiaDaMensagem(mensagem: MensagemWebhook): string | null {
  const bloco = (mensagem as Record<string, unknown>)[mensagem.type];
  if (bloco && typeof bloco === 'object' && 'id' in bloco) {
    const id = (bloco as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/** Todo `phone_number_id` distinto presente no payload (canal(is) alvo). */
export function phoneNumberIdsDoPayload(payload: PayloadWebhook): string[] {
  const ids = new Set<string>();
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      ids.add(change.value.metadata.phone_number_id);
    }
  }
  return [...ids];
}
