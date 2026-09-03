import { EtapaIngestao } from '@prisma/client';
import type { Executor } from '../../domain';

/**
 * Etapas 2–6 do pipeline canônico — **_no-op_ plugáveis** (spec 006).
 *
 * Cada uma resolve `pulada` com o número da spec que a implementa de verdade
 * (18 = `financeiro-transacao-ledger`, 23 = `catalogo`, 24 = `vinculo-asaas-guru`,
 * 25 = `contratos`). Nenhuma toca `pessoa`/`transacao`/`oferta`/`contrato` — a
 * spec dona substitui o executor via `WorkerService.definirExecutor(...)` **sem**
 * alterar o worker (US5 / SC-012).
 */
function noop(implementadaNa: number): Executor {
  return async () => ({ status: 'pulada', resultado: { implementadaNa } });
}

export const EXECUTORES_NOOP: ReadonlyMap<EtapaIngestao, Executor> = new Map([
  [EtapaIngestao.RESOLVER_PESSOA, noop(18)],
  [EtapaIngestao.UPSERT_TRANSACAO, noop(18)],
  [EtapaIngestao.RESOLVER_VINCULO, noop(24)],
  [EtapaIngestao.RESOLVER_OFERTA, noop(23)],
  [EtapaIngestao.PROJETAR_CONTRATO, noop(25)],
]);
