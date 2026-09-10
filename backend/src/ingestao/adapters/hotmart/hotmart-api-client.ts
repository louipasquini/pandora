import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../core/config';
import {
  HotmartApiIndisponivelError,
  type PaginaHotmart,
  type ParametrosListarHotmart,
  type HotmartApiClient,
} from './hotmart-api-client.port';
import type { ContaHotmart } from './tipos';

const TIMEOUT_MS = 15_000;
const OAUTH_BASE = 'https://api-sec-vlc.hotmart.com';
const BASE_PADRAO = 'https://developers.hotmart.com/payments/api/v1';
const FOLGA_TOKEN_MS = 60_000;
const MAX_RESULTS = 500;

interface TokenCache {
  token: string;
  expiraEm: number;
}

/**
 * Cliente real da API da Hotmart (`GET /sales/history` + `GET /sales/price/details`)
 * — **`fetch` nativo do Node 24**, 0 dependência nova (mesmo padrão de
 * `TmbApiClient`/019, `AsaasApiClient`/020, `GuruApiClient`/021).
 *
 * A Hotmart é a única das 4 plataformas com **OAuth2 `client_credentials`**: troca
 * `client_id` + `client_secret` + token **Basic** por um `access_token` de vida
 * curta, cacheado em memória **por conta** até `expires_in − 60s`. Paginação **por
 * cursor** (`page_info.next_page_token`). Lê `HOTMART_<conta>_*` só pelo
 * `ConfigService` (leitura destipada — as chaves entram no schema por spread /
 * como `.optional()`).
 */
@Injectable()
export class HotmartApiClientHttp implements HotmartApiClient {
  private readonly logger = new Logger(HotmartApiClientHttp.name);
  private readonly tokens = new Map<ContaHotmart, TokenCache>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  listarVendas(p: ParametrosListarHotmart): Promise<PaginaHotmart> {
    return this.buscarPagina('sales/history', p);
  }

  listarDetalhesPreco(p: ParametrosListarHotmart): Promise<PaginaHotmart> {
    return this.buscarPagina('sales/price/details', p);
  }

  private async buscarPagina(
    recurso: string,
    p: ParametrosListarHotmart,
  ): Promise<PaginaHotmart> {
    const cfg = this.config as unknown as ConfigService;
    const base = cfg.get<string>(`${p.conta}_API_BASE_URL`) || BASE_PADRAO;
    const token = await this.garantirToken(p.conta);

    const url = new URL(`${base.replace(/\/$/, '')}/${recurso}`);
    url.searchParams.set('start_date', String(Date.parse(`${p.dataInicio}T00:00:00Z`)));
    url.searchParams.set('end_date', String(Date.parse(`${p.dataFinal}T23:59:59Z`)));
    url.searchParams.set('max_results', String(MAX_RESULTS));
    if (p.transactionStatus) {
      for (const s of p.transactionStatus.split(',').map((x) => x.trim()).filter(Boolean)) {
        url.searchParams.append('transaction_status', s);
      }
    }
    if (p.cursor) url.searchParams.set('page_token', p.cursor);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'user-agent': 'pandora-ingestao',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Hotmart /${recurso} HTTP ${res.status}`);
    }
    const corpo: unknown = await res.json();
    const { itens, proximoCursor } = this.extrair(corpo);
    this.logger.debug(
      `hotmart.api ${recurso} conta=${p.conta} cursor=${p.cursor ?? '(inicio)'} itens=${itens.length} proximo=${proximoCursor ?? '(fim)'}`,
    );
    return { itens, proximoCursor };
  }

  /**
   * OAuth2 `client_credentials`. Renova quando não há cache ou faltam < 60s para
   * expirar. `POST {OAUTH_BASE}/security/oauth/token?grant_type=client_credentials
   * &client_id=…&client_secret=…` com header `Authorization: Basic <API_KEY>`.
   */
  private async garantirToken(conta: ContaHotmart): Promise<string> {
    const cache = this.tokens.get(conta);
    if (cache && Date.now() < cache.expiraEm - FOLGA_TOKEN_MS) {
      return cache.token;
    }
    const cfg = this.config as unknown as ConfigService;
    const clientId = cfg.get<string>(`${conta}_CLIENT_ID`);
    const clientSecret = cfg.get<string>(`${conta}_CLIENT_SECRET`);
    const basic = cfg.get<string>(`${conta}_API_KEY`);
    if (!clientId || !clientSecret || !basic) {
      throw new HotmartApiIndisponivelError(conta);
    }

    const url = new URL(`${OAUTH_BASE}/security/oauth/token`);
    url.searchParams.set('grant_type', 'client_credentials');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('client_secret', clientSecret);

    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Hotmart OAuth token HTTP ${res.status}`);
    }
    const corpo = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!corpo.access_token) {
      throw new Error('Hotmart OAuth token sem access_token');
    }
    const expiraEm = Date.now() + (corpo.expires_in ?? 3600) * 1000;
    this.tokens.set(conta, { token: corpo.access_token, expiraEm });
    return corpo.access_token;
  }

  /** Resposta real: `{ items: [...], page_info: { next_page_token? } }`. Aceita array direto. */
  private extrair(corpo: unknown): { itens: unknown[]; proximoCursor?: string } {
    if (Array.isArray(corpo)) return { itens: corpo };
    if (corpo && typeof corpo === 'object') {
      const rec = corpo as Record<string, unknown>;
      const itens = Array.isArray(rec.items)
        ? rec.items
        : Array.isArray(rec.itens)
          ? rec.itens
          : [];
      const pageInfo =
        rec.page_info && typeof rec.page_info === 'object'
          ? (rec.page_info as Record<string, unknown>)
          : {};
      const cursor =
        typeof pageInfo.next_page_token === 'string' && pageInfo.next_page_token.length > 0
          ? pageInfo.next_page_token
          : undefined;
      return { itens, proximoCursor: cursor };
    }
    return { itens: [] };
  }
}
