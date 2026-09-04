import {
  idMidiaDaMensagem,
  payloadWebhookSchema,
  phoneNumberIdsDoPayload,
} from './payload-webhook.schema';

function envelope(value: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: '1029384756', changes: [{ field: 'messages', value }] }],
  };
}

describe('payloadWebhookSchema', () => {
  it('parseia mensagem de texto', () => {
    const payload = envelope({
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: '1122334455' },
      contacts: [{ wa_id: '5511999998888', profile: { name: 'Maria Teste' } }],
      messages: [
        {
          from: '5511999998888',
          id: 'wamid.TESTE1',
          timestamp: '1735900000',
          type: 'text',
          text: { body: 'Oi, quero saber sobre o curso' },
        },
      ],
    });
    const parsed = payloadWebhookSchema.parse(payload);
    expect(parsed.entry[0].changes[0].value.messages?.[0].text?.body).toBe(
      'Oi, quero saber sobre o curso',
    );
  });

  it('parseia mensagem de mídia (imagem) e extrai o id de mídia', () => {
    const payload = envelope({
      metadata: { phone_number_id: '1122334455' },
      messages: [
        {
          from: '5511999998888',
          id: 'wamid.TESTE2',
          timestamp: '1735900000',
          type: 'image',
          image: { id: 'MIDIA123', mime_type: 'image/jpeg' },
        },
      ],
    });
    const parsed = payloadWebhookSchema.parse(payload);
    const msg = parsed.entry[0].changes[0].value.messages![0];
    expect(idMidiaDaMensagem(msg)).toBe('MIDIA123');
  });

  it('parseia callback de status', () => {
    const payload = envelope({
      metadata: { phone_number_id: '1122334455' },
      statuses: [
        {
          id: 'wamid.ENVIADA1',
          status: 'delivered',
          timestamp: '1735900100',
          recipient_id: '5511999998888',
        },
      ],
    });
    const parsed = payloadWebhookSchema.parse(payload);
    expect(parsed.entry[0].changes[0].value.statuses?.[0].status).toBe('delivered');
  });

  it('tolera campos extras não usados (.passthrough)', () => {
    const payload = envelope({
      metadata: { phone_number_id: '1122334455', extra_field_da_meta: 'x' },
      pricing: { billable: true },
    });
    expect(() => payloadWebhookSchema.parse(payload)).not.toThrow();
  });

  it('payload sem entry/changes → erro de parse tratável', () => {
    expect(() => payloadWebhookSchema.parse({ object: 'whatsapp_business_account' })).toThrow();
  });

  it('phoneNumberIdsDoPayload extrai ids únicos', () => {
    const payload = envelope({ metadata: { phone_number_id: '1122334455' } });
    expect(phoneNumberIdsDoPayload(payloadWebhookSchema.parse(payload))).toEqual([
      '1122334455',
    ]);
  });
});
