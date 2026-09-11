import { Injectable } from '@nestjs/common';
import {
  parseInstante,
  type EntradaEtapaExterna,
  type ExecutorEtapaExterno,
  type SaidaEtapaExterna,
} from '../../core/core.module';
import {
  camposAlterados,
  extrairCanonicos,
  mapearStatus,
  type SnapshotTransacao,
} from '../domain';
import { TransacaoRepository } from '../infra/transacao.repository';

/**
 * Etapa 3 do pipeline canônico (visão 5.3) — `UPSERT_TRANSACAO`. Executor externo
 * que grava/atualiza `transacao` por `(plataforma_origem, id_origem)` (Regra
 * Inviolável nº 1) e devolve `ResultadoIngestao{transacao, foi_criada,
 * campos_alterados}` (Princípio IV — resultado explícito, nunca `_houve_mudanca`
 * no ORM). Idempotente: reprocessar → mesma linha, `campos_alterados: []`.
 *
 * Depende de `RESOLVER_PESSOA` estar `ok` (grafo de `etapas.ts`, spec 006).
 */
@Injectable()
export class UpsertTransacaoEtapaService implements ExecutorEtapaExterno {
  readonly etapa = 'UPSERT_TRANSACAO';

  constructor(private readonly repo: TransacaoRepository) {}

  async executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna> {
    const classificacao =
      (entrada.resultados.CLASSIFICAR as { classificacao?: string } | undefined)
        ?.classificacao ?? 'DESCONHECIDO';
    const pessoaId =
      (entrada.resultados.RESOLVER_PESSOA as { pessoaId?: string | null } | undefined)
        ?.pessoaId ?? null;

    const bruto = entrada.canonico?.statusOrigem ?? null;
    const status = mapearStatus(entrada.plataformaOrigem, entrada.tipoOrigem, bruto);
    const ocorrido = parseInstante(entrada.canonico?.ocorridoEm ?? '');

    const canonicos = extrairCanonicos(entrada.canonico);
    const novo: SnapshotTransacao = {
      ...canonicos,
      statusCanonico: status.status,
      classificacao,
      ocorridoEm: ocorrido.valor,
      pessoaId,
      ehAfiliada: classificacao === 'VENDA_AFILIADA',
    };

    const anterior = await this.repo.carregarAnterior(
      entrada.plataformaOrigem,
      entrada.idOrigem,
    );
    const campos = camposAlterados(anterior, novo);

    const precisaRevisao = status.revisar || ocorrido.valor == null;
    const motivo =
      [
        status.revisar ? status.motivo : null,
        ocorrido.valor == null
          ? `data não parseável: ${ocorrido.motivo ?? JSON.stringify(entrada.canonico?.ocorridoEm)}`
          : null,
      ]
        .filter(Boolean)
        .join('; ') || null;

    const { transacaoId, foiCriada } = await this.repo.upsert(
      {
        plataformaOrigem: entrada.plataformaOrigem,
        idOrigem: entrada.idOrigem,
        tipoOrigem: entrada.tipoOrigem,
        statusOrigem: typeof bruto === 'string' ? bruto : '',
        statusCanonico: status.status,
        classificacao,
        ocorridoEm: ocorrido.valor,
        pessoaId,
        ehAfiliada: novo.ehAfiliada,
        ehRecorrencia: canonicos.ehRecorrencia,
        assinaturaCiclo: canonicos.assinaturaCiclo,
        numeroCiclo: canonicos.numeroCiclo,
        quantidade: canonicos.quantidade,
        ofertaCodigoOrigem: canonicos.ofertaCodigoOrigem,
        ofertaNomeOrigem: canonicos.ofertaNomeOrigem,
        valorBruto: canonicos.valorBruto,
        valorLiquido: canonicos.valorLiquido,
        taxas: canonicos.taxas,
        reembolso: canonicos.reembolso,
        precisaRevisao,
        motivoRevisao: motivo,
        eventoOrigemId: entrada.eventoId,
        referenciaExternaIdOrigem: entrada.canonico?.referenciaExterna?.idOrigem ?? null,
      },
      anterior == null,
    );

    return {
      status: 'ok',
      resultado: {
        transacaoId,
        foi_criada: foiCriada,
        campos_alterados: campos,
      },
      revisar: precisaRevisao,
    };
  }
}
