import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type {
  EnviarMensagemParams,
  EnviarMensagemResultado,
  GraphApiClient,
  TemplateMeta,
} from '../../src/crm/application/whatsapp';
import { authHeader } from './auth';

/** Dublê controlável de `GraphApiClient` — 0 chamada de rede real nos testes. */
export interface GraphApiDublê extends GraphApiClient {
  proximoWaMessageId: string;
  proximosTemplates: TemplateMeta[];
  falharProximoEnvio: unknown | null;
  falharProximaBusca: unknown | null;
  chamadasEnviar: EnviarMensagemParams[];
}

export function criarGraphApiDublê(): GraphApiDublê {
  let contador = 0;
  const dublê: GraphApiDublê = {
    proximoWaMessageId: '',
    proximosTemplates: [],
    falharProximoEnvio: null,
    falharProximaBusca: null,
    chamadasEnviar: [],
    async enviarMensagem(params: EnviarMensagemParams): Promise<EnviarMensagemResultado> {
      dublê.chamadasEnviar.push(params);
      if (dublê.falharProximoEnvio) {
        const erro = dublê.falharProximoEnvio;
        dublê.falharProximoEnvio = null;
        throw erro;
      }
      contador += 1;
      const waMessageId = dublê.proximoWaMessageId || `wamid.DUBLE-${contador}`;
      dublê.proximoWaMessageId = '';
      return { waMessageId };
    },
    async buscarTemplates(): Promise<TemplateMeta[]> {
      if (dublê.falharProximaBusca) {
        const erro = dublê.falharProximaBusca;
        dublê.falharProximaBusca = null;
        throw erro;
      }
      return dublê.proximosTemplates;
    },
  };
  return dublê;
}

export function assinarPayload(corpoBruto: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(corpoBruto, 'utf8').digest('hex')}`;
}

function tag(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let contadorTelefone = 0;
/** Telefone único por chamada (E.164, 13 dígitos) — evita colisão entre testes. */
export function numeroUnico(): string {
  contadorTelefone += 1;
  const sufixo = String(contadorTelefone).padStart(8, '0');
  return `+55119${sufixo}`;
}

/** Mesmo número, no formato `wa_id` da Meta (dígitos, sem `+`) — para popular `from`/`to`. */
export function waIdDe(telefoneE164: string): string {
  return telefoneE164.replace('+', '');
}

export function crmWhatsappHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader();

  async function criarCanal(
    overrides: Partial<{
      nome: string;
      numeroTelefone: string;
      wabaId: string;
      phoneNumberId: string;
      accessToken: string;
      appSecret: string;
      webhookVerifyToken: string;
    }> = {},
  ) {
    const t = tag();
    const body = {
      nome: overrides.nome ?? `Canal ${t}`,
      numeroTelefone: overrides.numeroTelefone ?? '+5511900000000',
      wabaId: overrides.wabaId ?? `waba-${t}`,
      phoneNumberId: overrides.phoneNumberId ?? `phone-${t}`,
      accessToken: overrides.accessToken ?? `access-token-${t}`,
      appSecret: overrides.appSecret ?? `app-secret-${t}`,
      webhookVerifyToken: overrides.webhookVerifyToken ?? `verify-token-${t}`,
    };
    const res = await http().post('/crm/admin/whatsapp/canais').set(ADMIN).send(body);
    if (res.status !== 201) {
      throw new Error(`criarCanal falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return { id: res.body.id as string, ...body };
  }

  async function criarPessoaComTelefone(telefone: string, nome = 'Pessoa WhatsApp') {
    const t = tag();
    const res = await http()
      .post('/pessoas')
      .set(ADMIN)
      .send({ nome, telefones: [telefone], emails: [`p+${t}@x.com`] });
    if (res.status !== 201) {
      throw new Error(`criarPessoa falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  async function criarLeadComTelefone(telefone: string, nome = 'Lead WhatsApp') {
    const t = tag();
    const res = await http()
      .post('/crm/leads')
      .set(ADMIN)
      .send({ nome: `${nome} ${t}`, telefone });
    if (res.status !== 201) {
      throw new Error(`criarLead falhou ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.id as string;
  }

  function payloadMensagemTexto(opts: {
    phoneNumberId: string;
    wabaId?: string;
    de: string;
    idMensagem: string;
    texto: string;
    nomeContato?: string;
    timestamp?: number;
  }) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: opts.wabaId ?? 'waba-generico',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: opts.phoneNumberId },
                contacts: opts.nomeContato
                  ? [{ wa_id: opts.de, profile: { name: opts.nomeContato } }]
                  : [],
                messages: [
                  {
                    from: opts.de,
                    id: opts.idMensagem,
                    timestamp: String(opts.timestamp ?? Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: opts.texto },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  function payloadMensagemMidia(opts: {
    phoneNumberId: string;
    de: string;
    idMensagem: string;
    tipo: 'image' | 'audio' | 'document' | 'video';
    idMidia: string;
  }) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-generico',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: opts.phoneNumberId },
                messages: [
                  {
                    from: opts.de,
                    id: opts.idMensagem,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: opts.tipo,
                    [opts.tipo]: { id: opts.idMidia, mime_type: 'application/octet-stream' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  function payloadStatus(opts: {
    phoneNumberId: string;
    waMessageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    erroTitulo?: string;
  }) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-generico',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: opts.phoneNumberId },
                statuses: [
                  {
                    id: opts.waMessageId,
                    status: opts.status,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    ...(opts.erroTitulo ? { errors: [{ title: opts.erroTitulo }] } : {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  async function postWebhook(payload: unknown, appSecret: string) {
    const corpo = JSON.stringify(payload);
    return http()
      .post('/webhooks/whatsapp')
      .set('X-Hub-Signature-256', assinarPayload(corpo, appSecret))
      .set('Content-Type', 'application/json')
      .send(corpo);
  }

  return {
    http,
    ADMIN,
    criarCanal,
    criarPessoaComTelefone,
    criarLeadComTelefone,
    payloadMensagemTexto,
    payloadMensagemMidia,
    payloadStatus,
    postWebhook,
  };
}
