import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type {
  ContaGuru,
  PaginaTransacoes,
  ParametrosListarTransacoes,
  GuruApiClient,
} from '../../src/ingestao/adapters/guru';
import { GuruApiIndisponivelError } from '../../src/ingestao/adapters/guru';
import { authHeader } from './auth';

const FIX = join(__dirname, '../../src/ingestao/adapters/guru/fixtures');

export function fixture<T = Record<string, unknown>>(nome: string): T {
  return JSON.parse(readFileSync(join(FIX, nome), 'utf8')) as T;
}
export function fixtureCsv(nome: string): string {
  return readFileSync(join(FIX, nome), 'utf8');
}

/**
 * Tokens de webhook Guru por conta. `setup-db.ts` (globalSetup) garante os dois
 * no ambiente (fixtures quando o `.env`/CI não define). A Guru envia o token no
 * campo `api_token` do corpo.
 */
export const GURU_TOKENS: Record<ContaGuru, string> = {
  GURU_PRD: process.env.GURU_PRD_WEBHOOK_TOKEN ?? 'guru-prd-webhook-token-e2e',
  GURU_SVC: process.env.GURU_SVC_WEBHOOK_TOKEN ?? 'guru-svc-webhook-token-e2e',
};

/**
 * Dublê do `GuruApiClient` — devolve páginas pré-configuradas, encadeadas por
 * cursor sintético (`p<n>`).
 */
export class GuruApiClientFake implements GuruApiClient {
  chamadas: ParametrosListarTransacoes[] = [];
  constructor(private readonly paginas: unknown[][]) {}
  async listarTransacoes(p: ParametrosListarTransacoes): Promise<PaginaTransacoes> {
    this.chamadas.push(p);
    const idx = p.cursor ? Number(p.cursor.replace('p', '')) : 0;
    const itens = this.paginas[idx] ?? [];
    const temMais = idx < this.paginas.length - 1;
    return { itens, proximoCursor: temMais ? `p${idx + 1}` : undefined };
  }
}

/** Dublê que simula conta Guru sem API configurada. */
export class GuruApiClientIndisponivel implements GuruApiClient {
  async listarTransacoes(p: ParametrosListarTransacoes): Promise<PaginaTransacoes> {
    throw new GuruApiIndisponivelError(p.conta);
  }
}

export function guruHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const rota: Record<ContaGuru, string> = {
    GURU_PRD: '/webhooks/guru/prd',
    GURU_SVC: '/webhooks/guru/svc',
  };
  return {
    /**
     * Injeta `api_token` no corpo (é assim que a Guru autentica). `token: null`
     * → sem `api_token` no corpo.
     */
    postWebhook(
      conta: ContaGuru,
      body: Record<string, unknown>,
      token: string | null = GURU_TOKENS[conta],
    ) {
      const corpo = token === null ? body : { ...body, api_token: token };
      return http().post(rota[conta]).send(corpo);
    },
    sincronizar(dto: Record<string, unknown>) {
      return http().post('/ingestao/guru/sincronizar').set(authHeader()).send(dto);
    },
    importarCsv(conta: ContaGuru, conteudo: string) {
      return http()
        .post('/ingestao/guru/importar-csv')
        .set(authHeader())
        .send({ conta, conteudo });
    },
    processar() {
      return http().post('/ingestao/eventos/processar').set(authHeader());
    },
  };
}
