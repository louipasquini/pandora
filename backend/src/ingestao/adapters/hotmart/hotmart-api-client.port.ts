import type { ContaHotmart } from './tipos';

/** Token DI do cliente da API da Hotmart. Dublê nos testes. */
export const HOTMART_API_CLIENT = Symbol('HOTMART_API_CLIENT');

export interface ParametrosListarHotmart {
  conta: ContaHotmart;
  /** `YYYY-MM-DD` → `start_date` em epoch ms na impl real. */
  dataInicio: string;
  /** `YYYY-MM-DD` → `end_date` em epoch ms na impl real. */
  dataFinal: string;
  /**
   * CSV de status da Hotmart (`APPROVED,REFUNDED,...`). Sem ele, a API só devolve
   * `APPROVED`/`COMPLETE` — repassado como `transaction_status` (repetido por valor).
   */
  transactionStatus?: string;
  /** `undefined` na 1ª página; `page_info.next_page_token` nas seguintes. */
  cursor?: string;
}

export interface PaginaHotmart {
  itens: unknown[];
  /** `page_info.next_page_token` quando há mais páginas; `undefined` encerra. */
  proximoCursor?: string;
}

export interface HotmartApiClient {
  /** `GET /payments/api/v1/sales/history` — 1 página. */
  listarVendas(p: ParametrosListarHotmart): Promise<PaginaHotmart>;
  /** `GET /payments/api/v1/sales/price/details` — 1 página. */
  listarDetalhesPreco(p: ParametrosListarHotmart): Promise<PaginaHotmart>;
}

/**
 * A conta Hotmart indicada não tem as credenciais OAuth2
 * (`HOTMART_<conta>_CLIENT_ID` / `_CLIENT_SECRET` / `_API_KEY`) configuradas — o
 * `HotmartSyncService` converte para **422** (nunca 500).
 */
export class HotmartApiIndisponivelError extends Error {
  constructor(conta: string) {
    super(`conta ${conta} sem API configurada`);
    this.name = 'HotmartApiIndisponivelError';
  }
}
