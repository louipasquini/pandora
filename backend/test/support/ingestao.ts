import { INestApplication } from '@nestjs/common';
import { EtapaIngestao } from '@prisma/client';
import request from 'supertest';
import type { Executor } from '../../src/ingestao/domain';
import { WorkerService } from '../../src/ingestao/application/worker.service';
import { authHeader } from './auth';

export interface EntradaEvento {
  plataformaOrigem?: string;
  tipoOrigem?: string;
  idOrigem?: string;
  payloadBruto?: unknown;
  comCanonico?: boolean;
  eventoCanonico?: Record<string, unknown>;
}

export function montarEventoCanonico(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    plataformaOrigem: 'GURU_PRD',
    idOrigem: over.idOrigem ?? 'txn_default',
    tipoOrigem: 'webhook_venda',
    statusOrigem: 'approved',
    ocorridoEm: '2026-09-03T12:00:00Z',
    ...over,
  };
}

export function ingestaoHelpers(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const worker = app.get(WorkerService);
  const originais = new Map<EtapaIngestao, Executor | undefined>();

  return {
    /** Ingere um evento via `POST /ingestao/eventos`. Retorna a resposta supertest. */
    async ingerir(e: EntradaEvento = {}) {
      const idOrigem = e.idOrigem ?? `txn_${Math.random().toString(36).slice(2, 10)}`;
      const body: Record<string, unknown> = {
        plataformaOrigem: e.plataformaOrigem ?? 'GURU_PRD',
        tipoOrigem: e.tipoOrigem ?? 'webhook_venda',
        idOrigem,
        payloadBruto: e.payloadBruto ?? { id: idOrigem, status: 'approved' },
      };
      if (e.eventoCanonico) body.eventoCanonico = e.eventoCanonico;
      else if (e.comCanonico !== false)
        body.eventoCanonico = montarEventoCanonico({ idOrigem });
      return http().post('/ingestao/eventos').set(authHeader()).send(body);
    },

    /** Roda uma passada síncrona do worker; retorna o `ResumoPassada`. */
    async processar() {
      const res = await http().post('/ingestao/eventos/processar').set(authHeader());
      return res.body as {
        selecionados: number;
        ok: number;
        revisar: number;
        erro: number;
        bloqueadas: number;
      };
    },

    async detalhe(id: string) {
      const res = await http().get(`/ingestao/eventos/${id}`).set(authHeader());
      return res;
    },

    /** Substitui o executor de uma etapa por um _fake_ de teste. */
    plugarEtapaFake(nome: EtapaIngestao, exec: Executor) {
      if (!originais.has(nome)) originais.set(nome, worker.executorAtual(nome));
      worker.definirExecutor(nome, exec);
    },

    /** Desfaz todos os `plugarEtapaFake`. Chamar no `afterEach`. */
    restaurarEtapas() {
      for (const [nome, exec] of originais) {
        if (exec) worker.definirExecutor(nome, exec);
      }
      originais.clear();
    },

    /** Um executor _fake_ que falha `quantas` vezes e depois resolve `ok`. */
    etapaQueFalha(quantas: number): Executor {
      let n = 0;
      return async () => {
        n += 1;
        if (n <= quantas) throw new Error(`falha simulada ${n}`);
        return { status: 'ok', resultado: { fake: true } };
      };
    },
  };
}
