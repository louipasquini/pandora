import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../core/config';
import {
  TmbApiIndisponivelError,
  type PaginaPedidos,
  type ParametrosListarPedidos,
  type TmbApiClient,
} from './tmb-api-client.port';

const TIMEOUT_MS = 15_000;

/**
 * Cliente real da API da TMB (`GET /api/pedidos`) — **`fetch` nativo do Node 24**,
 * 0 dependência nova (mesmo padrão de `GraphApiClient`/011, `SugestaoIaClient`/013).
 * Lê `TMB_API_BASE_URL`/`TMB_API_KEY` só pelo contrato tipado do `core`.
 */
@Injectable()
export class TmbApiClientHttp implements TmbApiClient {
  private readonly logger = new Logger(TmbApiClientHttp.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async listarPedidos(p: ParametrosListarPedidos): Promise<PaginaPedidos> {
    // As chaves `TMB_*` entram no schema por spread tipado como `ZodRawShape`,
    // então não aparecem no tipo estático de `AppConfig` — leitura destipada e
    // deliberada, igual ao `WebhookAuthenticator` da spec 003.
    const cfg = this.config as unknown as ConfigService;
    const apiBaseUrl = cfg.get<string>('TMB_API_BASE_URL');
    const apiKey = cfg.get<string>('TMB_API_KEY');
    if (!apiBaseUrl || !apiKey) {
      throw new TmbApiIndisponivelError();
    }

    const url = new URL('/api/pedidos', apiBaseUrl);
    url.searchParams.set('pageNumber', String(p.pageNumber));
    url.searchParams.set('pageSize', String(p.pageSize));
    if (p.dataInicio) url.searchParams.set('data_inicio', p.dataInicio);
    if (p.dataFinal) url.searchParams.set('data_final', p.dataFinal);
    if (p.produtoId != null) url.searchParams.set('produto_id', String(p.produtoId));

    const res = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`TMB /api/pedidos HTTP ${res.status}`);
    }
    const corpo: unknown = await res.json();
    const itens = this.extrairItens(corpo);
    this.logger.debug(
      `tmb.api pagina=${p.pageNumber} itens=${itens.length} pageSize=${p.pageSize}`,
    );
    return { itens, temProximaPagina: itens.length >= p.pageSize };
  }

  /** A doc mostra o retorno como objeto único, mas descreve "lista paginada" — aceitamos as duas formas. */
  private extrairItens(corpo: unknown): unknown[] {
    if (Array.isArray(corpo)) return corpo;
    if (corpo && typeof corpo === 'object') {
      const rec = corpo as Record<string, unknown>;
      if (Array.isArray(rec.itens)) return rec.itens;
      if (Array.isArray(rec.data)) return rec.data;
      if (Array.isArray(rec.pedidos)) return rec.pedidos;
      if (rec.pedido_id != null || rec.pedido != null) return [corpo];
    }
    return [];
  }
}
