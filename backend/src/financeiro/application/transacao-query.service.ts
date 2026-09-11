import { Injectable, NotFoundException } from '@nestjs/common';
import { TransacaoRepository, type ListaFiltros } from '../infra/transacao.repository';
import type { ListarTransacoesDto } from '../dto/listar-transacoes.schema';

function par(
  int: bigint | null,
  moeda: string | null,
): { valorInt: string; moeda: string } | null {
  if (int == null || moeda == null) return null;
  return { valorInt: int.toString(), moeda: moeda.trim() };
}

/** Leitura do painel de transações (spec 018). Só compõe — nunca escreve. */
@Injectable()
export class TransacaoQueryService {
  constructor(private readonly repo: TransacaoRepository) {}

  async listar(q: ListarTransacoesDto) {
    const filtros: ListaFiltros = {
      plataformaOrigem: q.plataformaOrigem,
      statusCanonico: q.statusCanonico,
      classificacao: q.classificacao,
      pagoDeFato: q.pagoDeFato,
      pessoaId: q.pessoaId,
      precisaRevisao: q.precisaRevisao,
      vinculoPendente: q.vinculoPendente,
      ocorridoDe: q.ocorridoDe,
      ocorridoAte: q.ocorridoAte,
      q: q.q,
      pagina: q.pagina,
      tamanho: q.tamanho,
    };
    const { rows, total } = await this.repo.listar(filtros);
    return {
      itens: rows.map((r) => ({
        id: r.id,
        plataformaOrigem: r.plataformaOrigem,
        idOrigem: r.idOrigem,
        tipoOrigem: r.tipoOrigem,
        statusOrigem: r.statusOrigem,
        statusCanonico: r.statusCanonico,
        classificacao: r.classificacao,
        ocorridoEm: r.ocorridoEm?.toISOString() ?? null,
        pessoaId: r.pessoaId,
        ehAfiliada: r.ehAfiliada,
        precisaRevisao: r.precisaRevisao,
        valorBruto: par(r.valorBrutoInt, r.valorBrutoMoeda),
        valorLiquido: par(r.valorLiquidoInt, r.valorLiquidoMoeda),
        eventoOrigemId: r.eventoOrigemId,
        transacaoVinculadaId: r.transacaoVinculadaId,
        vinculoPendente:
          (r.plataformaOrigem === 'ASAAS_PRD' || r.plataformaOrigem === 'ASAAS_SVC') &&
          r.referenciaExternaIdOrigem != null &&
          r.transacaoVinculadaId == null,
      })),
      pagina: q.pagina,
      tamanho: q.tamanho,
      total,
    };
  }

  async detalhe(id: string) {
    const r = await this.repo.detalhe(id);
    if (!r) throw new NotFoundException('transação não encontrada');
    return {
      id: r.id,
      plataformaOrigem: r.plataformaOrigem,
      idOrigem: r.idOrigem,
      tipoOrigem: r.tipoOrigem,
      statusOrigem: r.statusOrigem,
      statusCanonico: r.statusCanonico,
      classificacao: r.classificacao,
      ocorridoEm: r.ocorridoEm?.toISOString() ?? null,
      pessoa: r.pessoa ? { id: r.pessoa.id, nome: r.pessoa.nome } : null,
      ofertaId: r.ofertaId,
      contratoId: r.contratoId,
      transacaoVinculadaId: r.transacaoVinculadaId,
      vinculoPendente:
        (r.plataformaOrigem === 'ASAAS_PRD' || r.plataformaOrigem === 'ASAAS_SVC') &&
        r.referenciaExternaIdOrigem != null &&
        r.transacaoVinculadaId == null,
      vinculo: r.vinculoComoAsaas
        ? {
            transacaoVinculadaId: r.vinculoComoAsaas.transacaoGuruId,
            origemRef: r.vinculoComoAsaas.origemRef,
            resolvidoEm: r.vinculoComoAsaas.resolvidoEm.toISOString(),
          }
        : null,
      valorBruto: par(r.valorBrutoInt, r.valorBrutoMoeda),
      valorLiquido: par(r.valorLiquidoInt, r.valorLiquidoMoeda),
      taxas: par(r.taxasInt, r.taxasMoeda),
      reembolso: par(r.reembolsoInt, r.reembolsoMoeda),
      quantidade: r.quantidade,
      ehAfiliada: r.ehAfiliada,
      ehRecorrencia: r.ehRecorrencia,
      assinaturaCiclo: r.assinaturaCiclo,
      numeroCiclo: r.numeroCiclo,
      ofertaCodigoOrigem: r.ofertaCodigoOrigem,
      ofertaNomeOrigem: r.ofertaNomeOrigem,
      precisaRevisao: r.precisaRevisao,
      motivoRevisao: r.motivoRevisao,
      eventoOrigemId: r.eventoOrigemId,
      criadoEm: r.criadoEm.toISOString(),
      atualizadoEm: r.atualizadoEm.toISOString(),
    };
  }
}
