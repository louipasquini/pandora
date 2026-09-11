import { Injectable } from '@nestjs/common';
import { AditivoRotulo, Classificacao, Prisma, StatusContratoCanonico } from '@prisma/client';
import { Dinheiro, EntidadeId, agoraUtc } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AditivoFold, ResultadoFold, TransacaoParaFold } from '../domain';

export interface TransacaoParaProjetar {
  id: string;
  pessoaId: string | null;
  ofertaId: string | null;
  contratoId: string | null;
  classificacao: Classificacao;
}

export interface OfertaParaProjetar {
  produtoId: string;
  tempoAcessoDias: number | null;
}

export interface ListaContratosFiltros {
  produtoCodigo?: string;
  pessoaId?: string;
  turma?: string;
  status?: StatusContratoCanonico;
  pagina: number;
  tamanho: number;
}

export interface ContratoListaLinha {
  id: string;
  pessoaId: string;
  pessoaNome: string;
  produtoId: string;
  produtoCodigo: string;
  fimAcesso: Date | null;
  ticketTotal: unknown;
  valorRecebido: unknown;
  ajusteManualStatus: StatusContratoCanonico | null;
  toleranciaAtrasoDias: number;
}

function dinheiro(int: bigint | null, moeda: string | null): Dinheiro | null {
  if (int == null || moeda == null) return null;
  return Dinheiro.deInteiroEscalado(int, moeda.trim());
}

/** `Record<moeda, bigint>` → `Record<moeda, string>` (forma que a coluna `Json` guarda). */
function serializarDict(dict: Record<string, bigint>): Record<string, string> {
  return Object.fromEntries(Object.entries(dict).map(([moeda, v]) => [moeda, v.toString()]));
}

/**
 * Acesso a dados de `contrato`/`aditivo` (spec 025). Lê/escreve `transacao`/
 * `oferta`/`oferta_catalogo` — tabelas "de" `financeiro`/`catalogo` — direto via
 * `PrismaService`, mesmo precedente já aceito pela spec 023
 * (`ResolverOfertaEtapaService`): a fronteira do Princípio VI é sobre import de
 * módulo TypeScript, não sobre o schema Prisma (ver `plan.md` §Complexity Tracking).
 */
@Injectable()
export class ContratoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transacaoParaProjetar(transacaoId: string): Promise<TransacaoParaProjetar | null> {
    return this.prisma.transacao.findUnique({
      where: { id: transacaoId },
      select: { id: true, pessoaId: true, ofertaId: true, contratoId: true, classificacao: true },
    });
  }

  async ofertaParaProjetar(ofertaId: string): Promise<OfertaParaProjetar | null> {
    const oferta = await this.prisma.oferta.findUnique({
      where: { id: ofertaId },
      select: { produtoId: true, catalogo: { select: { tempoAcessoDias: true } } },
    });
    if (!oferta) return null;
    return { produtoId: oferta.produtoId, tempoAcessoDias: oferta.catalogo?.tempoAcessoDias ?? null };
  }

  /**
   * Get-or-create por `(pessoaId, produtoId)` — Regra Inviolável nº 3 (nunca 2
   * contratos para a mesma dupla). Corrida concorrente tratada em `P2002`
   * (mesmo padrão de `VinculoRepository.criarVinculo`/024).
   */
  async getOrCreateContrato(pessoaId: string, produtoId: string): Promise<{ id: string }> {
    const existente = await this.prisma.contrato.findUnique({
      where: { contrato_pessoa_produto: { pessoaId, produtoId } },
      select: { id: true },
    });
    if (existente) return existente;

    try {
      const criado = await this.prisma.contrato.create({
        data: { id: EntidadeId.novo().value, pessoaId, produtoId },
        select: { id: true },
      });
      return criado;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const jaExiste = await this.prisma.contrato.findUnique({
          where: { contrato_pessoa_produto: { pessoaId, produtoId } },
          select: { id: true },
        });
        if (jaExiste) return jaExiste;
      }
      throw err;
    }
  }

  async vincularTransacao(transacaoId: string, contratoId: string): Promise<void> {
    await this.prisma.transacao.update({
      where: { id: transacaoId },
      data: { contratoId },
    });
  }

  /** Todas as transações já ligadas a este contrato — insumo fresco do fold (nunca cache). */
  async transacoesDoContrato(contratoId: string): Promise<TransacaoParaFold[]> {
    const rows = await this.prisma.transacao.findMany({
      where: { contratoId },
      select: {
        id: true,
        classificacao: true,
        statusCanonico: true,
        ocorridoEm: true,
        valorBrutoInt: true,
        valorBrutoMoeda: true,
        valorLiquidoInt: true,
        valorLiquidoMoeda: true,
        oferta: { select: { catalogo: { select: { tempoAcessoDias: true } } } },
      },
    });
    return rows.map((r) => ({
      transacaoId: r.id,
      classificacao: r.classificacao,
      statusCanonico: r.statusCanonico,
      ocorridoEm: r.ocorridoEm,
      valorBruto: dinheiro(r.valorBrutoInt, r.valorBrutoMoeda),
      valorLiquido: dinheiro(r.valorLiquidoInt, r.valorLiquidoMoeda),
      tempoAcessoDias: r.oferta?.catalogo?.tempoAcessoDias ?? null,
    }));
  }

  /** Upsert de cada aditivo por `transacaoId` (1:1, nunca duplica linha). */
  async upsertAditivos(contratoId: string, aditivos: readonly AditivoFold[]): Promise<void> {
    for (const a of aditivos) {
      await this.prisma.aditivo.upsert({
        where: { transacaoId: a.transacaoId },
        create: {
          id: EntidadeId.novo().value,
          contratoId,
          transacaoId: a.transacaoId,
          rotulo: a.rotulo as AditivoRotulo,
          fimAcessoResultante: a.fimAcessoResultante,
          precisaRevisao: a.precisaRevisao,
          motivoRevisao: a.motivoRevisao,
        },
        update: {
          rotulo: a.rotulo as AditivoRotulo,
          fimAcessoResultante: a.fimAcessoResultante,
          precisaRevisao: a.precisaRevisao,
          motivoRevisao: a.motivoRevisao,
        },
      });
    }
  }

  /**
   * Grava o resultado do fold e **limpa incondicionalmente** o ajuste manual de
   * status (Regra Inviolável nº 13 / CL-01) — a marca de auditoria já foi
   * gravada em `contrato_audit` no momento do `PATCH`, não aqui.
   */
  async atualizarFold(contratoId: string, resultado: ResultadoFold): Promise<void> {
    await this.prisma.contrato.update({
      where: { id: contratoId },
      data: {
        fimAcesso: resultado.fimAcesso,
        ticketTotal: serializarDict(resultado.ticketTotal),
        valorRecebido: serializarDict(resultado.valorRecebido),
        ajusteManualStatus: null,
        ajusteManualEm: null,
        ajusteManualAutor: null,
        ajusteManualMotivo: null,
      },
    });
  }

  async porId(id: string) {
    return this.prisma.contrato.findUnique({
      where: { id },
      include: {
        pessoa: { select: { id: true, nome: true } },
        produto: { select: { id: true, codigo: true } },
        aditivos: {
          orderBy: { criadoEm: 'asc' },
          include: {
            transacao: {
              select: {
                id: true,
                ocorridoEm: true,
                statusCanonico: true,
                valorBrutoInt: true,
                valorBrutoMoeda: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Listagem paginada com `status` derivado computado em SQL (`CASE` — mesma
   * lógica de `contratos/domain/status-contrato.ts`, coberta por teste de
   * paridade) para poder filtrar/paginar sem carregar tudo em memória.
   */
  async listar(f: ListaContratosFiltros): Promise<{ rows: ContratoListaLinha[]; total: number }> {
    const condicoes: Prisma.Sql[] = [];
    if (f.produtoCodigo) {
      condicoes.push(Prisma.sql`prod.codigo = ${f.produtoCodigo}`);
    }
    if (f.pessoaId) {
      condicoes.push(Prisma.sql`c.pessoa_id = ${f.pessoaId}::uuid`);
    }
    if (f.turma) {
      condicoes.push(Prisma.sql`EXISTS (
        SELECT 1 FROM aditivo ad
        JOIN transacao tx ON tx.id = ad.transacao_id
        JOIN oferta of2 ON of2.id = tx.oferta_id
        WHERE ad.contrato_id = c.id
          AND COALESCE(of2.turma_numero_curado, of2.turma_numero_derivado)::text = ${f.turma}
      )`);
    }
    if (f.status) {
      condicoes.push(this.condicaoStatus(f.status));
    }

    const where = condicoes.length > 0 ? Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}` : Prisma.empty;
    const offset = (f.pagina - 1) * f.tamanho;

    const rows = await this.prisma.$queryRaw<ContratoListaLinha[]>(Prisma.sql`
      SELECT
        c.id, c.pessoa_id AS "pessoaId", p.nome AS "pessoaNome",
        c.produto_id AS "produtoId", prod.codigo AS "produtoCodigo",
        c.fim_acesso AS "fimAcesso", c.ticket_total AS "ticketTotal",
        c.valor_recebido AS "valorRecebido",
        c.ajuste_manual_status AS "ajusteManualStatus",
        c.tolerancia_atraso_dias AS "toleranciaAtrasoDias"
      FROM contrato c
      JOIN pessoa p ON p.id = c.pessoa_id
      JOIN produto prod ON prod.id = c.produto_id
      ${where}
      ORDER BY c.atualizado_em DESC
      LIMIT ${f.tamanho} OFFSET ${offset}
    `);

    const totalRows = await this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM contrato c
      JOIN pessoa p ON p.id = c.pessoa_id
      JOIN produto prod ON prod.id = c.produto_id
      ${where}
    `);

    return { rows, total: Number(totalRows[0]?.total ?? 0n) };
  }

  /** Mesma regra de `contratos/domain/status-contrato.ts`, em SQL — paridade travada por teste. */
  private condicaoStatus(status: StatusContratoCanonico): Prisma.Sql {
    const limite = Prisma.sql`c.fim_acesso + (c.tolerancia_atraso_dias || ' days')::interval`;
    switch (status) {
      case StatusContratoCanonico.ATIVO:
        return Prisma.sql`(
          (c.ajuste_manual_status IS NULL AND c.fim_acesso IS NOT NULL AND now() <= ${limite})
          OR c.ajuste_manual_status = 'ATIVO'
        )`;
      case StatusContratoCanonico.EXPIRADO:
        return Prisma.sql`(
          c.ajuste_manual_status IS NULL AND c.fim_acesso IS NOT NULL AND now() > ${limite}
        )`;
      case StatusContratoCanonico.CANCELADO:
        return Prisma.sql`c.ajuste_manual_status = 'CANCELADO'`;
      case StatusContratoCanonico.DESCONHECIDO:
        return Prisma.sql`(c.ajuste_manual_status IS NULL AND c.fim_acesso IS NULL)`;
      default: {
        const _exaustivo: never = status;
        return _exaustivo;
      }
    }
  }

  async aplicarAjusteManual(
    contratoId: string,
    dados: {
      toleranciaAtrasoDias?: number;
      contratoAssinado?: boolean;
      ajusteManualStatus?: StatusContratoCanonico | null;
      autor?: string;
      motivo?: string;
    },
  ) {
    return this.prisma.contrato.update({
      where: { id: contratoId },
      data: {
        ...(dados.toleranciaAtrasoDias !== undefined
          ? { toleranciaAtrasoDias: dados.toleranciaAtrasoDias }
          : {}),
        ...(dados.contratoAssinado !== undefined ? { contratoAssinado: dados.contratoAssinado } : {}),
        ...(dados.ajusteManualStatus !== undefined
          ? {
              ajusteManualStatus: dados.ajusteManualStatus,
              ajusteManualEm: dados.ajusteManualStatus == null ? null : agoraUtc(),
              ajusteManualAutor: dados.ajusteManualStatus == null ? null : dados.autor ?? null,
              ajusteManualMotivo: dados.ajusteManualStatus == null ? null : dados.motivo ?? null,
            }
          : {}),
      },
    });
  }
}
