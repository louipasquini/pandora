import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../core/config';
import {
  AsaasApiIndisponivelError,
  type PaginaPagamentos,
  type ParametrosListarPagamentos,
  type AsaasApiClient,
} from './asaas-api-client.port';

const TIMEOUT_MS = 15_000;
const BASE_PADRAO = 'https://api.asaas.com/v3';

/**
 * Cliente real da API da Asaas (`GET /v3/payments`) — **`fetch` nativo do Node
 * 24**, 0 dependência nova (mesmo padrão de `TmbApiClient`/019, `GraphApiClient`/
 * 011). A Asaas autentica pelo header **`access_token`** (não `Bearer`) e exige
 * `User-Agent`. Lê `ASAAS_<conta>_API_BASE_URL`/`ASAAS_<conta>_API_KEY` só pelo
 * `ConfigService` (leitura destipada — as chaves `ASAAS_*` entram no schema por
 * spread `ZodRawShape`, igual ao `WebhookAuthenticator` da 003).
 */
@Injectable()
export class AsaasApiClientHttp implements AsaasApiClient {
  private readonly logger = new Logger(AsaasApiClientHttp.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async listarPagamentos(p: ParametrosListarPagamentos): Promise<PaginaPagamentos> {
    const cfg = this.config as unknown as ConfigService;
    const apiKey = cfg.get<string>(`${p.conta}_API_KEY`);
    if (!apiKey) {
      throw new AsaasApiIndisponivelError(p.conta);
    }
    const base = cfg.get<string>(`${p.conta}_API_BASE_URL`) || BASE_PADRAO;

    const url = new URL(`${base.replace(/\/$/, '')}/payments`);
    url.searchParams.set('offset', String(p.offset));
    url.searchParams.set('limit', String(p.limit));
    if (p.dataInicio) url.searchParams.set('dateCreated[ge]', p.dataInicio);
    if (p.dataFinal) url.searchParams.set('dateCreated[le]', p.dataFinal);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        access_token: apiKey,
        accept: 'application/json',
        'user-agent': 'pandora-ingestao',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Asaas /v3/payments HTTP ${res.status}`);
    }
    const corpo: unknown = await res.json();
    const { itens, hasMore } = this.extrair(corpo);
    this.logger.debug(
      `asaas.api conta=${p.conta} offset=${p.offset} itens=${itens.length} hasMore=${hasMore}`,
    );
    return { itens, temProximaPagina: hasMore };
  }

  /** A resposta real é `{ hasMore, data: [...] }`; aceitamos formas alternativas. */
  private extrair(corpo: unknown): { itens: unknown[]; hasMore: boolean } {
    if (Array.isArray(corpo)) return { itens: corpo, hasMore: false };
    if (corpo && typeof corpo === 'object') {
      const rec = corpo as Record<string, unknown>;
      const itens = Array.isArray(rec.data)
        ? rec.data
        : Array.isArray(rec.itens)
          ? rec.itens
          : [];
      return { itens, hasMore: rec.hasMore === true };
    }
    return { itens: [], hasMore: false };
  }
}
