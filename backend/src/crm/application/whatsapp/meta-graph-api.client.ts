import { Injectable } from '@nestjs/common';
import type { TemplateWhatsappCategoria } from '@prisma/client';
import {
  GraphApiError,
  type EnviarMensagemParams,
  type EnviarMensagemResultado,
  type GraphApiClient,
  type TemplateMeta,
} from './graph-api-client';

const GRAPH_API_BASE = 'https://graph.facebook.com';
const GRAPH_API_VERSAO = 'v21.0';

const CATEGORIAS_VALIDAS: readonly TemplateWhatsappCategoria[] = [
  'MARKETING',
  'UTILITY',
  'AUTHENTICATION',
];

function comoCategoria(bruto: string): TemplateWhatsappCategoria {
  const v = bruto?.toUpperCase();
  return (CATEGORIAS_VALIDAS as readonly string[]).includes(v)
    ? (v as TemplateWhatsappCategoria)
    : 'UTILITY';
}

function corpoDoTemplate(componentes: unknown): string {
  if (!Array.isArray(componentes)) return '';
  const bloco = (componentes as Record<string, unknown>[]).find((c) => c.type === 'BODY');
  return typeof bloco?.text === 'string' ? bloco.text : '';
}

/** Implementação real de `GraphApiClient` via `fetch` nativo (0 dep — spec 011). */
@Injectable()
export class MetaGraphApiClient implements GraphApiClient {
  async enviarMensagem(params: EnviarMensagemParams): Promise<EnviarMensagemResultado> {
    const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSAO}/${params.phoneNumberId}/messages`;
    const body =
      params.corpo.tipo === 'texto'
        ? {
            messaging_product: 'whatsapp',
            to: params.para,
            type: 'text',
            text: { body: params.corpo.texto },
          }
        : {
            messaging_product: 'whatsapp',
            to: params.para,
            type: 'template',
            template: {
              name: params.corpo.nomeMeta,
              language: { code: params.corpo.idioma },
              ...(params.corpo.parametros.length
                ? {
                    components: [
                      {
                        type: 'body',
                        parameters: params.corpo.parametros.map((texto) => ({
                          type: 'text',
                          text: texto,
                        })),
                      },
                    ],
                  }
                : {}),
            },
          };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new GraphApiError('falha de rede ao chamar a Graph API', err);
    }

    const json: unknown = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new GraphApiError(`Graph API respondeu ${resp.status}`, json);
    }
    const waMessageId = (json as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
    if (!waMessageId) {
      throw new GraphApiError('resposta da Graph API sem id de mensagem', json);
    }
    return { waMessageId };
  }

  async buscarTemplates(params: {
    wabaId: string;
    accessToken: string;
  }): Promise<TemplateMeta[]> {
    const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSAO}/${params.wabaId}/message_templates?limit=250`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: { Authorization: `Bearer ${params.accessToken}` },
      });
    } catch (err) {
      throw new GraphApiError('falha de rede ao chamar a Graph API', err);
    }

    const json: unknown = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new GraphApiError(`Graph API respondeu ${resp.status}`, json);
    }
    const dados = Array.isArray((json as { data?: unknown[] } | null)?.data)
      ? ((json as { data: unknown[] }).data as Record<string, unknown>[])
      : [];
    return dados.map((t) => ({
      nomeMeta: String(t.name ?? ''),
      idioma: String(t.language ?? ''),
      categoria: comoCategoria(String(t.category ?? '')),
      corpo: corpoDoTemplate(t.components),
      statusAprovacao: String(t.status ?? ''),
      motivoRejeicao: t.rejected_reason != null ? String(t.rejected_reason) : null,
    }));
  }
}
