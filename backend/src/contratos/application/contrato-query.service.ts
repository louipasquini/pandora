import { Injectable, NotFoundException } from '@nestjs/common';
import { agoraUtc } from '../../core/core.module';
import { statusDoContrato } from '../domain';
import { ContratoRepository, type ListaContratosFiltros } from '../infra/contrato.repository';
import type { ListarContratosDto } from '../dto/listar-contratos.schema';

function dictParaView(v: unknown): Record<string, string> {
  return v && typeof v === 'object' ? (v as Record<string, string>) : {};
}

/** Leitura do painel de Contratos (spec 025). Só compõe — nunca escreve. */
@Injectable()
export class ContratoQueryService {
  constructor(private readonly repo: ContratoRepository) {}

  async listar(q: ListarContratosDto) {
    const filtros: ListaContratosFiltros = {
      produtoCodigo: q.produtoCodigo,
      pessoaId: q.pessoaId,
      turma: q.turma,
      status: q.status,
      pagina: q.pagina,
      tamanho: q.tamanho,
    };
    const { rows, total } = await this.repo.listar(filtros);
    const agora = agoraUtc();

    return {
      itens: rows.map((r) => {
        const derivado = statusDoContrato({
          fimAcesso: r.fimAcesso,
          toleranciaAtrasoDias: r.toleranciaAtrasoDias,
          ajusteManual: r.ajusteManualStatus ? { status: r.ajusteManualStatus } : null,
          agora,
        });
        return {
          id: r.id,
          pessoa: { id: r.pessoaId, nome: r.pessoaNome },
          produto: { id: r.produtoId, codigo: r.produtoCodigo },
          statusCanonico: derivado.statusCanonico,
          acessoLiberado: derivado.acessoLiberado,
          fimAcesso: r.fimAcesso?.toISOString() ?? null,
          ticketTotal: dictParaView(r.ticketTotal),
          valorRecebido: dictParaView(r.valorRecebido),
          ajusteManualStatus: r.ajusteManualStatus,
        };
      }),
      pagina: q.pagina,
      tamanho: q.tamanho,
      total,
    };
  }

  async detalhe(id: string) {
    const c = await this.repo.porId(id);
    if (!c) throw new NotFoundException('contrato não encontrado');

    const agora = agoraUtc();
    const derivado = statusDoContrato({
      fimAcesso: c.fimAcesso,
      toleranciaAtrasoDias: c.toleranciaAtrasoDias,
      ajusteManual: c.ajusteManualStatus ? { status: c.ajusteManualStatus } : null,
      agora,
    });

    return {
      id: c.id,
      pessoa: { id: c.pessoa.id, nome: c.pessoa.nome },
      produto: { id: c.produto.id, codigo: c.produto.codigo },
      statusCanonico: derivado.statusCanonico,
      acessoLiberado: derivado.acessoLiberado,
      fimAcesso: c.fimAcesso?.toISOString() ?? null,
      ticketTotal: dictParaView(c.ticketTotal),
      valorRecebido: dictParaView(c.valorRecebido),
      toleranciaAtrasoDias: c.toleranciaAtrasoDias,
      contratoAssinado: c.contratoAssinado,
      ajusteManualStatus: c.ajusteManualStatus,
      ajusteManualEm: c.ajusteManualEm?.toISOString() ?? null,
      ajusteManualAutor: c.ajusteManualAutor,
      ajusteManualMotivo: c.ajusteManualMotivo,
      criadoEm: c.criadoEm.toISOString(),
      atualizadoEm: c.atualizadoEm.toISOString(),
      aditivos: c.aditivos.map((a) => ({
        id: a.id,
        transacaoId: a.transacaoId,
        rotulo: a.rotulo,
        ocorridoEm: a.transacao.ocorridoEm?.toISOString() ?? null,
        fimAcessoResultante: a.fimAcessoResultante?.toISOString() ?? null,
        statusCanonicoTransacao: a.transacao.statusCanonico,
        valorBruto:
          a.transacao.valorBrutoInt != null && a.transacao.valorBrutoMoeda != null
            ? { valorInt: a.transacao.valorBrutoInt.toString(), moeda: a.transacao.valorBrutoMoeda.trim() }
            : null,
        precisaRevisao: a.precisaRevisao,
        motivoRevisao: a.motivoRevisao,
      })),
    };
  }
}
