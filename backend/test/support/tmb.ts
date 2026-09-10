import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type {
  PaginaPedidos,
  ParametrosListarPedidos,
  TmbApiClient,
} from '../../src/ingestao/adapters/tmb';
import { TmbApiIndisponivelError } from '../../src/ingestao/adapters/tmb';
import { authHeader } from './auth';

const FIX = join(__dirname, '../../src/ingestao/adapters/tmb/fixtures');

export function fixture<T = unknown>(nome: string): T {
  return JSON.parse(readFileSync(join(FIX, nome), 'utf8')) as T;
}
export function fixtureCsv(nome: string): string {
  return readFileSync(join(FIX, nome), 'utf8');
}

/** Token de webhook do `.env` de teste (`TMB_WEBHOOK_TOKEN`, default `placeholder`). */
export const TMB_WEBHOOK_TOKEN = process.env.TMB_WEBHOOK_TOKEN ?? 'placeholder';

/** Dublê do `TmbApiClient` — devolve páginas pré-configuradas. */
export class TmbApiClientFake implements TmbApiClient {
  chamadas: ParametrosListarPedidos[] = [];
  constructor(private readonly paginas: unknown[][]) {}
  async listarPedidos(p: ParametrosListarPedidos): Promise<PaginaPedidos> {
    this.chamadas.push(p);
    const itens = this.paginas[p.pageNumber - 1] ?? [];
    return { itens, temProximaPagina: p.pageNumber < this.paginas.length };
  }
}

/** Dublê que simula conta TMB sem API configurada. */
export class TmbApiClientIndisponivel implements TmbApiClient {
  async listarPedidos(): Promise<PaginaPedidos> {
    throw new TmbApiIndisponivelError();
  }
}

export function tmbHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  return {
    postVendas(body: unknown, token: string | null = TMB_WEBHOOK_TOKEN) {
      const req = http().post('/webhooks/tmb/vendas');
      if (token !== null) req.set('x-tmb-webhook-token', token);
      return req.send(body as object);
    },
    postFinanceiro(body: unknown, token: string | null = TMB_WEBHOOK_TOKEN) {
      const req = http().post('/webhooks/tmb/financeiro');
      if (token !== null) req.set('x-tmb-webhook-token', token);
      return req.send(body as object);
    },
    sincronizar(dto: Record<string, unknown> = {}) {
      return http().post('/ingestao/tmb/sincronizar').set(authHeader()).send(dto);
    },
    importarCsv(conteudo: string) {
      return http()
        .post('/ingestao/tmb/importar-csv')
        .set(authHeader())
        .send({ conteudo });
    },
    processar() {
      return http().post('/ingestao/eventos/processar').set(authHeader());
    },
    transacoesTmb() {
      return http()
        .get('/financeiro/transacoes?plataformaOrigem=TMB&tamanho=100')
        .set(authHeader());
    },
  };
}
