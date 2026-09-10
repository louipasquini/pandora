import type { ContaAsaas } from './tipos';

/** Token DI do cliente da API da Asaas. Dublê nos testes. */
export const ASAAS_API_CLIENT = Symbol('ASAAS_API_CLIENT');

export interface ParametrosListarPagamentos {
  conta: ContaAsaas;
  /** `YYYY-MM-DD` → `dateCreated[ge]` */
  dataInicio?: string;
  /** `YYYY-MM-DD` → `dateCreated[le]` */
  dataFinal?: string;
  /** 0-based. */
  offset: number;
  /** teto 100 na Asaas. */
  limit: number;
}

export interface PaginaPagamentos {
  itens: unknown[];
  /** `body.hasMore` da resposta da Asaas. */
  temProximaPagina: boolean;
}

export interface AsaasApiClient {
  listarPagamentos(p: ParametrosListarPagamentos): Promise<PaginaPagamentos>;
}

/**
 * A conta Asaas indicada não tem `ASAAS_<conta>_API_KEY` configurada — o
 * `AsaasSyncService` converte para **422** (nunca 500).
 */
export class AsaasApiIndisponivelError extends Error {
  constructor(conta: string) {
    super(`conta ${conta} sem API configurada`);
    this.name = 'AsaasApiIndisponivelError';
  }
}
