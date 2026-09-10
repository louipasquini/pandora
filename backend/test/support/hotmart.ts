import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type {
  ContaHotmart,
  HotmartApiClient,
  PaginaHotmart,
  ParametrosListarHotmart,
} from '../../src/ingestao/adapters/hotmart';
import { HotmartApiIndisponivelError } from '../../src/ingestao/adapters/hotmart';
import { authHeader } from './auth';

const FIX = join(__dirname, '../../src/ingestao/adapters/hotmart/fixtures');

export function fixture<T = Record<string, unknown>>(nome: string): T {
  return JSON.parse(readFileSync(join(FIX, nome), 'utf8')) as T;
}
export function fixtureCsv(nome: string): string {
  return readFileSync(join(FIX, nome), 'utf8');
}

/**
 * Tokens `hottok` do webhook Hotmart por conta. `setup-db.ts` (globalSetup)
 * garante os dois no ambiente. Só são exercidos quando um teste liga
 * `HOTMART_WEBHOOK_ENABLED=true` (a rota é stub — 503 — por padrão).
 */
export const HOTMART_TOKENS: Record<ContaHotmart, string> = {
  HOTMART_PRD: process.env.HOTMART_PRD_WEBHOOK_TOKEN ?? 'hotmart-prd-webhook-token-e2e',
  HOTMART_SVC: process.env.HOTMART_SVC_WEBHOOK_TOKEN ?? 'hotmart-svc-webhook-token-e2e',
};

/**
 * Dublê do `HotmartApiClient` — `listarVendas` e `listarDetalhesPreco` servem
 * cada uma sua lista de páginas, encadeadas por cursor sintético (`p<n>`).
 */
export class HotmartApiClientFake implements HotmartApiClient {
  chamadas: ParametrosListarHotmart[] = [];
  chamadasDetalhe: ParametrosListarHotmart[] = [];
  constructor(
    private readonly paginasVendas: unknown[][],
    private readonly paginasDetalhe: unknown[][] = [[]],
  ) {}

  listarVendas(p: ParametrosListarHotmart): Promise<PaginaHotmart> {
    this.chamadas.push(p);
    return Promise.resolve(this.servir(p, this.paginasVendas));
  }

  listarDetalhesPreco(p: ParametrosListarHotmart): Promise<PaginaHotmart> {
    this.chamadasDetalhe.push(p);
    return Promise.resolve(this.servir(p, this.paginasDetalhe));
  }

  private servir(p: ParametrosListarHotmart, paginas: unknown[][]): PaginaHotmart {
    const idx = p.cursor ? Number(p.cursor.replace('p', '')) : 0;
    const itens = paginas[idx] ?? [];
    const temMais = idx < paginas.length - 1;
    return { itens, proximoCursor: temMais ? `p${idx + 1}` : undefined };
  }
}

/** Dublê que simula conta Hotmart sem credenciais OAuth. */
export class HotmartApiClientIndisponivel implements HotmartApiClient {
  listarVendas(p: ParametrosListarHotmart): Promise<PaginaHotmart> {
    return Promise.reject(new HotmartApiIndisponivelError(p.conta));
  }
  listarDetalhesPreco(p: ParametrosListarHotmart): Promise<PaginaHotmart> {
    return Promise.reject(new HotmartApiIndisponivelError(p.conta));
  }
}

export function hotmartHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const rota: Record<ContaHotmart, string> = {
    HOTMART_PRD: '/webhooks/hotmart/prd',
    HOTMART_SVC: '/webhooks/hotmart/svc',
  };
  return {
    /** `hottok: null` → sem header. */
    postWebhook(
      conta: ContaHotmart,
      body: Record<string, unknown>,
      hottok: string | null = HOTMART_TOKENS[conta],
    ) {
      const req = http().post(rota[conta]);
      if (hottok !== null) req.set('x-hotmart-hottok', hottok);
      return req.send(body);
    },
    sincronizar(dto: Record<string, unknown>) {
      return http().post('/ingestao/hotmart/sincronizar').set(authHeader()).send(dto);
    },
    importarCsv(conta: ContaHotmart, conteudo: string) {
      return http()
        .post('/ingestao/hotmart/importar-csv')
        .set(authHeader())
        .send({ conta, conteudo });
    },
    processar() {
      return http().post('/ingestao/eventos/processar').set(authHeader());
    },
  };
}
