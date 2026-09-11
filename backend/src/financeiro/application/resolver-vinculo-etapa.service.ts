import { Injectable } from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import type {
  EntradaEtapaExterna,
  ExecutorEtapaExterno,
  SaidaEtapaExterna,
} from '../../core/core.module';
import { TentarVincularService } from './tentar-vincular.service';

const CONTAS_ASAAS: readonly string[] = [PlataformaOrigem.ASAAS_PRD, PlataformaOrigem.ASAAS_SVC];
const CONTAS_GURU: readonly string[] = [PlataformaOrigem.GURU_PRD, PlataformaOrigem.GURU_SVC];

/**
 * Etapa 4 do pipeline canônico (visão 5.3) — `RESOLVER_VINCULO` (spec 024).
 * `ExecutorEtapaExterno` do `core` (contrato já existente desde a 018) —
 * **nenhuma mudança em `WorkerService`/`etapas.ts`**. Ver
 * `contracts/pipeline-executor-vinculo.md`.
 *
 * Resolve nos **2 sentidos de chegada** (CL-02), dentro da mesma passada do
 * worker de ingestão: ramo Asaas procura a Guru já persistida; ramo Guru
 * resolve as Asaas pendentes que apontam para ela. Reusa `TentarVincularService`
 * — a mesma lógica que os 2 endpoints de retry manual usam.
 */
@Injectable()
export class ResolverVinculoEtapaService implements ExecutorEtapaExterno {
  readonly etapa = 'RESOLVER_VINCULO';

  constructor(private readonly tentarVincular: TentarVincularService) {}

  async executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna> {
    const transacaoId = (
      entrada.resultados.UPSERT_TRANSACAO as { transacaoId?: string } | undefined
    )?.transacaoId;
    if (!transacaoId) {
      return {
        status: 'erro',
        erroDetalhe: 'RESOLVER_VINCULO: transacaoId ausente em resultados.UPSERT_TRANSACAO',
      };
    }

    if (!CONTAS_ASAAS.includes(entrada.plataformaOrigem) && !CONTAS_GURU.includes(entrada.plataformaOrigem)) {
      return { status: 'pulada' };
    }

    const r = await this.tentarVincular.tentar(transacaoId);
    return { status: 'ok', resultado: r };
  }
}
