import type { TemplateWhatsappCategoria } from '@prisma/client';

/** Token de injeção (spec 011) — implementação padrão: `MetaGraphApiClient`. */
export const GRAPH_API_CLIENT = 'GRAPH_API_CLIENT';

export class GraphApiError extends Error {
  constructor(
    message: string,
    public readonly detalhe?: unknown,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
}

export type CorpoMensagemGraphApi =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'template'; nomeMeta: string; idioma: string; parametros: string[] };

export interface EnviarMensagemParams {
  phoneNumberId: string;
  accessToken: string;
  /** Telefone do destinatário em E.164, com ou sem `+` (normalizado na borda). */
  para: string;
  corpo: CorpoMensagemGraphApi;
}

export interface EnviarMensagemResultado {
  waMessageId: string;
}

export interface TemplateMeta {
  nomeMeta: string;
  idioma: string;
  categoria: TemplateWhatsappCategoria;
  corpo: string;
  statusAprovacao: string;
  motivoRejeicao: string | null;
}

export interface QualityRatingResultado {
  qualityRating: string;
  statusExibicao: string | null;
}

/**
 * Porta para a Graph API da Meta (spec 011) — injetada por DI para permitir um
 * dublê nos testes (0 chamada de rede real). Implementação padrão via `fetch`
 * nativo do Node 24 (`MetaGraphApiClient`, 0 dependência nova — ver research.md).
 */
export interface GraphApiClient {
  enviarMensagem(params: EnviarMensagemParams): Promise<EnviarMensagemResultado>;
  buscarTemplates(params: { wabaId: string; accessToken: string }): Promise<TemplateMeta[]>;
  /**
   * Quality rating vigente do número (spec 015, FR-009) — sempre uma chamada
   * síncrona sob demanda, nunca persistida (Princípio VIII).
   */
  consultarQualityRating(params: {
    phoneNumberId: string;
    accessToken: string;
  }): Promise<QualityRatingResultado>;
}
