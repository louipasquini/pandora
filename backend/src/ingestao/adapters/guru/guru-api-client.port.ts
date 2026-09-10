import type { ContaGuru } from './tipos';

/** Token DI do cliente da API da Guru. Dublê nos testes. */
export const GURU_API_CLIENT = Symbol('GURU_API_CLIENT');

/** Campo de data pelo qual a API da Guru filtra a janela (`_ini` + `_end`). */
export type CampoDataGuru = 'ordered_at' | 'confirmed_at' | 'cancelled_at';

export interface ParametrosListarTransacoes {
  conta: ContaGuru;
  /** `YYYY-MM-DD` → `<campoData>_ini` */
  dataInicio: string;
  /** `YYYY-MM-DD` → `<campoData>_end` */
  dataFinal: string;
  campoData: CampoDataGuru;
  /** `undefined` na 1ª página; `body.next_cursor` nas seguintes. */
  cursor?: string;
}

export interface PaginaTransacoes {
  itens: unknown[];
  /** `body.next_cursor` quando há mais páginas; `undefined` encerra a paginação. */
  proximoCursor?: string;
}

export interface GuruApiClient {
  listarTransacoes(p: ParametrosListarTransacoes): Promise<PaginaTransacoes>;
}

/**
 * A conta Guru indicada não tem `GURU_<conta>_API_KEY` configurada — o
 * `GuruSyncService` converte para **422** (nunca 500).
 */
export class GuruApiIndisponivelError extends Error {
  constructor(conta: string) {
    super(`conta ${conta} sem API configurada`);
    this.name = 'GuruApiIndisponivelError';
  }
}
