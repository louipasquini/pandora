import { Injectable } from '@nestjs/common';
import { Classificacao } from '@prisma/client';
import type {
  EntradaEtapaExterna,
  ExecutorEtapaExterno,
  SaidaEtapaExterna,
} from '../../core/core.module';
import { foldContrato } from '../domain';
import { ContratoRepository } from '../infra/contrato.repository';

const CLASSIFICACOES_QUALIFICADAS: readonly Classificacao[] = [
  Classificacao.VENDA_PROPRIA,
  Classificacao.RECORRENCIA,
  Classificacao.REEMBOLSO,
];

/**
 * Etapa 6 do pipeline canônico (visão 5.3) — `PROJETAR_CONTRATO` (spec 025).
 * `ExecutorEtapaExterno` do `core` (contrato já existente desde a 018) —
 * **nenhuma mudança em `WorkerService`/`etapas.ts`**.
 *
 * Só `VENDA_PROPRIA`/`RECORRENCIA`/`REEMBOLSO` chegam a virar aditivo (CL-02 do
 * spec) — `VENDA_AFILIADA` nunca gera Contrato (Regra nº 8), `COBRANCA_TERCEIRIZADA`
 * também não (a venda Guru já é o aditivo de registro). Recalcula o fold do
 * contrato inteiro a cada chamada (Princípio V) — nunca um delta.
 */
@Injectable()
export class ProjetarContratoEtapaService implements ExecutorEtapaExterno {
  readonly etapa = 'PROJETAR_CONTRATO';

  constructor(private readonly repo: ContratoRepository) {}

  async executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna> {
    const transacaoId = (
      entrada.resultados.UPSERT_TRANSACAO as { transacaoId?: string } | undefined
    )?.transacaoId;
    if (!transacaoId) {
      return {
        status: 'erro',
        erroDetalhe: 'PROJETAR_CONTRATO: transacaoId ausente em resultados.UPSERT_TRANSACAO',
      };
    }

    const transacao = await this.repo.transacaoParaProjetar(transacaoId);
    if (!transacao) {
      return { status: 'erro', erroDetalhe: `PROJETAR_CONTRATO: transação ${transacaoId} não encontrada` };
    }

    if (!CLASSIFICACOES_QUALIFICADAS.includes(transacao.classificacao)) {
      return { status: 'pulada', resultado: { motivo: 'classificação não gera aditivo' } };
    }

    if (!transacao.pessoaId) {
      // `pessoaId: null` já é um resultado válido e não-revisar da etapa 2
      // (`ResolverPessoaEtapaService`: "não cria (sem nome) só porque a venda
      // é própria") — esta etapa espelha a mesma leniência, sem acrescentar um
      // motivo de revisão novo. Reprocessável a qualquer hora, quando/se a
      // pessoa vier a se resolver por um re-sync com mais dados.
      return {
        status: 'ok',
        revisar: false,
        resultado: { contratoId: null, motivo: 'pessoa não resolvida — aditivo pendente' },
      };
    }
    if (!transacao.ofertaId) {
      // `ofertaId: null` só ocorre quando `RESOLVER_OFERTA` (023) já marcou o
      // evento para revisão por conta própria — não é um motivo de revisão
      // novo, só a consequência de não haver produto para ancorar o contrato.
      return {
        status: 'ok',
        revisar: false,
        resultado: {
          contratoId: null,
          motivo: 'oferta não resolvida — produto do contrato desconhecido',
        },
      };
    }

    const oferta = await this.repo.ofertaParaProjetar(transacao.ofertaId);
    if (!oferta) {
      return {
        status: 'ok',
        revisar: true,
        resultado: { contratoId: null, motivo: 'oferta referenciada não encontrada' },
      };
    }

    const contrato = await this.repo.getOrCreateContrato(transacao.pessoaId, oferta.produtoId);
    if (transacao.contratoId !== contrato.id) {
      await this.repo.vincularTransacao(transacaoId, contrato.id);
    }

    const transacoes = await this.repo.transacoesDoContrato(contrato.id);
    const resultado = foldContrato(transacoes);
    await this.repo.upsertAditivos(contrato.id, resultado.aditivos);
    await this.repo.atualizarFold(contrato.id, resultado);

    const aditivoDesta = resultado.aditivos.find((a) => a.transacaoId === transacaoId);

    return {
      status: 'ok',
      revisar: aditivoDesta?.precisaRevisao ?? false,
      resultado: {
        contratoId: contrato.id,
        fimAcesso: resultado.fimAcesso?.toISOString() ?? null,
        rotulo: aditivoDesta?.rotulo ?? null,
        motivoRevisao: aditivoDesta?.motivoRevisao ?? null,
      },
    };
  }
}
