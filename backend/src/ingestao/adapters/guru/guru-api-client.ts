import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../core/config';
import {
  GuruApiIndisponivelError,
  type PaginaTransacoes,
  type ParametrosListarTransacoes,
  type GuruApiClient,
} from './guru-api-client.port';

const TIMEOUT_MS = 15_000;
const BASE_PADRAO = 'https://digitalmanager.guru/api/v2';

/**
 * Cliente real da API da Guru (`GET /api/v2/transactions`) — **`fetch` nativo do
 * Node 24**, 0 dependência nova (mesmo padrão de `TmbApiClient`/019,
 * `AsaasApiClient`/020). A Guru usa **paginação por cursor** (`next_cursor`
 * enquanto `has_more_pages`) e autentica por `Authorization: Bearer <Account
 * Token>`. Lê `GURU_<conta>_API_BASE_URL`/`GURU_<conta>_API_KEY` só pelo
 * `ConfigService` (leitura destipada — as chaves `GURU_*` entram no schema por
 * spread `ZodRawShape`, igual ao `WebhookAuthenticator` da 003).
 */
@Injectable()
export class GuruApiClientHttp implements GuruApiClient {
  private readonly logger = new Logger(GuruApiClientHttp.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async listarTransacoes(p: ParametrosListarTransacoes): Promise<PaginaTransacoes> {
    const cfg = this.config as unknown as ConfigService;
    const apiKey = cfg.get<string>(`${p.conta}_API_KEY`);
    if (!apiKey) {
      throw new GuruApiIndisponivelError(p.conta);
    }
    const base = cfg.get<string>(`${p.conta}_API_BASE_URL`) || BASE_PADRAO;

    const url = new URL(`${base.replace(/\/$/, '')}/transactions`);
    url.searchParams.set(`${p.campoData}_ini`, p.dataInicio);
    url.searchParams.set(`${p.campoData}_end`, p.dataFinal);
    if (p.cursor) url.searchParams.set('cursor', p.cursor);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        'user-agent': 'pandora-ingestao',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Guru /api/v2/transactions HTTP ${res.status}`);
    }
    const corpo: unknown = await res.json();
    const { itens, proximoCursor } = this.extrair(corpo);
    this.logger.debug(
      `guru.api conta=${p.conta} cursor=${p.cursor ?? '(inicio)'} itens=${itens.length} proximo=${proximoCursor ?? '(fim)'}`,
    );
    return { itens, proximoCursor };
  }

  /**
   * A resposta real é `{ data: [...], has_more_pages, next_cursor }`. `has_more_pages`
   * pode vir como número (`1`/`0`) ou booleano. Aceitamos também um array direto.
   */
  private extrair(corpo: unknown): { itens: unknown[]; proximoCursor?: string } {
    if (Array.isArray(corpo)) return { itens: corpo };
    if (corpo && typeof corpo === 'object') {
      const rec = corpo as Record<string, unknown>;
      const itens = Array.isArray(rec.data)
        ? rec.data
        : Array.isArray(rec.itens)
          ? rec.itens
          : [];
      const temMais = rec.has_more_pages === true || rec.has_more_pages === 1;
      const cursor =
        typeof rec.next_cursor === 'string' && rec.next_cursor.length > 0
          ? rec.next_cursor
          : undefined;
      return { itens, proximoCursor: temMais ? cursor : undefined };
    }
    return { itens: [] };
  }
}
