import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type {
  ContaAsaas,
  PaginaPagamentos,
  ParametrosListarPagamentos,
  AsaasApiClient,
} from '../../src/ingestao/adapters/asaas';
import { AsaasApiIndisponivelError } from '../../src/ingestao/adapters/asaas';
import { authHeader } from './auth';

const FIX = join(__dirname, '../../src/ingestao/adapters/asaas/fixtures');

export function fixture<T = unknown>(nome: string): T {
  return JSON.parse(readFileSync(join(FIX, nome), 'utf8')) as T;
}
export function fixtureCsv(nome: string): string {
  return readFileSync(join(FIX, nome), 'utf8');
}

/**
 * Tokens de webhook Asaas por conta. `setup-db.ts` (globalSetup) garante os dois
 * no ambiente (fixtures quando o `.env`/CI não define).
 */
export const ASAAS_TOKENS: Record<ContaAsaas, string> = {
  ASAAS_PRD: process.env.ASAAS_PRD_WEBHOOK_TOKEN ?? 'asaas-prd-webhook-token-e2e',
  ASAAS_SVC: process.env.ASAAS_SVC_WEBHOOK_TOKEN ?? 'asaas-svc-webhook-token-e2e',
};

/** Dublê do `AsaasApiClient` — devolve páginas pré-configuradas. */
export class AsaasApiClientFake implements AsaasApiClient {
  chamadas: ParametrosListarPagamentos[] = [];
  constructor(private readonly paginas: unknown[][]) {}
  async listarPagamentos(p: ParametrosListarPagamentos): Promise<PaginaPagamentos> {
    this.chamadas.push(p);
    const idx = p.limit > 0 ? Math.floor(p.offset / p.limit) : 0;
    const itens = this.paginas[idx] ?? [];
    return { itens, temProximaPagina: idx < this.paginas.length - 1 };
  }
}

/** Dublê que simula conta Asaas sem API configurada. */
export class AsaasApiClientIndisponivel implements AsaasApiClient {
  async listarPagamentos(p: ParametrosListarPagamentos): Promise<PaginaPagamentos> {
    throw new AsaasApiIndisponivelError(p.conta);
  }
}

export function asaasHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const rota: Record<ContaAsaas, string> = {
    ASAAS_PRD: '/webhooks/asaas/prd',
    ASAAS_SVC: '/webhooks/asaas/svc',
  };
  return {
    postWebhook(
      conta: ContaAsaas,
      body: unknown,
      token: string | null = ASAAS_TOKENS[conta],
    ) {
      const req = http().post(rota[conta]);
      if (token !== null) req.set('asaas-access-token', token);
      return req.send(body as object);
    },
    sincronizar(dto: Record<string, unknown>) {
      return http().post('/ingestao/asaas/sincronizar').set(authHeader()).send(dto);
    },
    importarCsv(conta: ContaAsaas, conteudo: string) {
      return http()
        .post('/ingestao/asaas/importar-csv')
        .set(authHeader())
        .send({ conta, conteudo });
    },
    processar() {
      return http().post('/ingestao/eventos/processar').set(authHeader());
    },
  };
}
