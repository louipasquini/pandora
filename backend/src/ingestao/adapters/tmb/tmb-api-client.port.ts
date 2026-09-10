/** Token DI do cliente da API da TMB. Dublê nos testes. */
export const TMB_API_CLIENT = Symbol('TMB_API_CLIENT');

export interface ParametrosListarPedidos {
  /** `YYYY-MM-DD` */
  dataInicio?: string;
  dataFinal?: string;
  produtoId?: number;
  /** 1-based. */
  pageNumber: number;
  pageSize: number;
}

export interface PaginaPedidos {
  itens: unknown[];
  temProximaPagina: boolean;
}

export interface TmbApiClient {
  listarPedidos(p: ParametrosListarPedidos): Promise<PaginaPedidos>;
}

/**
 * A conta TMB não tem `TMB_API_BASE_URL`/`TMB_API_KEY` configurados — o
 * `TmbSyncService` converte para **422** (nunca 500).
 */
export class TmbApiIndisponivelError extends Error {
  constructor() {
    super('conta TMB sem API configurada');
    this.name = 'TmbApiIndisponivelError';
  }
}
