import { Injectable } from '@nestjs/common';
import { Prisma, type PlataformaOrigem } from '@prisma/client';
import {
  Dinheiro,
  EntidadeId,
  STATUS_TRANSACAO_CANONICO,
  agoraUtc,
  contaComoReceita,
} from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { SnapshotTransacao } from '../domain';

/** Status canônicos que contam como "dinheiro que entrou de fato" (hoje só `PAGO`). */
const STATUS_PAGO_DE_FATO: readonly string[] = STATUS_TRANSACAO_CANONICO.filter(
  contaComoReceita,
);

/** Campos que o executor da etapa 3 passa para o upsert. */
export interface DadosUpsertTransacao {
  plataformaOrigem: string;
  idOrigem: string;
  tipoOrigem: string;
  statusOrigem: string;
  statusCanonico: string;
  classificacao: string;
  ocorridoEm: Date | null;
  pessoaId: string | null;
  ehAfiliada: boolean;
  ehRecorrencia: boolean;
  assinaturaCiclo: string | null;
  numeroCiclo: number | null;
  quantidade: number | null;
  ofertaCodigoOrigem: string | null;
  ofertaNomeOrigem: string | null;
  valorBruto: Dinheiro | null;
  valorLiquido: Dinheiro | null;
  taxas: Dinheiro | null;
  reembolso: Dinheiro | null;
  precisaRevisao: boolean;
  motivoRevisao: string | null;
  eventoOrigemId: string;
}

export interface ListaFiltros {
  plataformaOrigem?: string;
  statusCanonico?: string[];
  classificacao?: string[];
  pagoDeFato?: boolean;
  pessoaId?: string;
  precisaRevisao?: boolean;
  ocorridoDe?: Date;
  ocorridoAte?: Date;
  q?: string;
  pagina: number;
  tamanho: number;
}

function dinheiro(int: bigint | null, moeda: string | null): Dinheiro | null {
  if (int == null || moeda == null) return null;
  return Dinheiro.deInteiroEscalado(int, moeda.trim());
}

function parPersistencia(d: Dinheiro | null): {
  int: bigint | null;
  moeda: string | null;
} {
  return d ? { int: d.valorInt, moeda: d.moeda } : { int: null, moeda: null };
}

@Injectable()
export class TransacaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Estado comparável da linha atual — `null` se ainda não existe. */
  async carregarAnterior(
    plataformaOrigem: string,
    idOrigem: string,
  ): Promise<SnapshotTransacao | null> {
    const r = await this.prisma.transacao.findUnique({
      where: {
        transacao_chave_natural: {
          plataformaOrigem: plataformaOrigem as PlataformaOrigem,
          idOrigem,
        },
      },
    });
    if (!r) return null;
    return {
      statusCanonico: r.statusCanonico,
      classificacao: r.classificacao,
      ocorridoEm: r.ocorridoEm,
      pessoaId: r.pessoaId,
      ehAfiliada: r.ehAfiliada,
      ehRecorrencia: r.ehRecorrencia,
      assinaturaCiclo: r.assinaturaCiclo,
      numeroCiclo: r.numeroCiclo,
      quantidade: r.quantidade,
      ofertaCodigoOrigem: r.ofertaCodigoOrigem,
      ofertaNomeOrigem: r.ofertaNomeOrigem,
      valorBruto: dinheiro(r.valorBrutoInt, r.valorBrutoMoeda),
      valorLiquido: dinheiro(r.valorLiquidoInt, r.valorLiquidoMoeda),
      taxas: dinheiro(r.taxasInt, r.taxasMoeda),
      reembolso: dinheiro(r.reembolsoInt, r.reembolsoMoeda),
    };
  }

  /** Upsert pela chave natural. `criar` vem do `carregarAnterior` do executor. */
  async upsert(
    d: DadosUpsertTransacao,
    criar: boolean,
  ): Promise<{ transacaoId: string; foiCriada: boolean }> {
    const bruto = parPersistencia(d.valorBruto);
    const liquido = parPersistencia(d.valorLiquido);
    const taxas = parPersistencia(d.taxas);
    const reembolso = parPersistencia(d.reembolso);

    const comum = {
      tipoOrigem: d.tipoOrigem,
      statusOrigem: d.statusOrigem,
      statusCanonico: d.statusCanonico as never,
      classificacao: d.classificacao as never,
      ocorridoEm: d.ocorridoEm,
      pessoaId: d.pessoaId,
      ehAfiliada: d.ehAfiliada,
      ehRecorrencia: d.ehRecorrencia,
      assinaturaCiclo: d.assinaturaCiclo,
      numeroCiclo: d.numeroCiclo,
      quantidade: d.quantidade,
      ofertaCodigoOrigem: d.ofertaCodigoOrigem,
      ofertaNomeOrigem: d.ofertaNomeOrigem,
      valorBrutoInt: bruto.int,
      valorBrutoMoeda: bruto.moeda,
      valorLiquidoInt: liquido.int,
      valorLiquidoMoeda: liquido.moeda,
      taxasInt: taxas.int,
      taxasMoeda: taxas.moeda,
      reembolsoInt: reembolso.int,
      reembolsoMoeda: reembolso.moeda,
      precisaRevisao: d.precisaRevisao,
      motivoRevisao: d.motivoRevisao,
      eventoOrigemId: d.eventoOrigemId,
    };

    if (criar) {
      try {
        const criada = await this.prisma.transacao.create({
          data: {
            id: EntidadeId.novo().value,
            plataformaOrigem: d.plataformaOrigem as never,
            idOrigem: d.idOrigem,
            ...comum,
          },
          select: { id: true },
        });
        return { transacaoId: criada.id, foiCriada: true };
      } catch (err) {
        // corrida com outro evento da mesma chave → cai para update
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== 'P2002'
        ) {
          throw err;
        }
      }
    }

    const atualizada = await this.prisma.transacao.update({
      where: {
        transacao_chave_natural: {
          plataformaOrigem: d.plataformaOrigem as PlataformaOrigem,
          idOrigem: d.idOrigem,
        },
      },
      data: { ...comum, atualizadoEm: agoraUtc() },
      select: { id: true },
    });
    return { transacaoId: atualizada.id, foiCriada: false };
  }

  private where(f: ListaFiltros): Prisma.TransacaoWhereInput {
    const and: Prisma.TransacaoWhereInput[] = [];
    if (f.statusCanonico && f.statusCanonico.length > 0) {
      and.push({ statusCanonico: { in: f.statusCanonico as never[] } });
    }
    if (f.pagoDeFato !== undefined) {
      and.push({
        statusCanonico: f.pagoDeFato
          ? { in: STATUS_PAGO_DE_FATO as never[] }
          : { notIn: STATUS_PAGO_DE_FATO as never[] },
      });
    }
    return {
      ...(and.length > 0 ? { AND: and } : {}),
      ...(f.plataformaOrigem
        ? { plataformaOrigem: f.plataformaOrigem as PlataformaOrigem }
        : {}),
      ...(f.classificacao && f.classificacao.length > 0
        ? { classificacao: { in: f.classificacao as never[] } }
        : {}),
      ...(f.pessoaId ? { pessoaId: f.pessoaId } : {}),
      ...(f.precisaRevisao !== undefined ? { precisaRevisao: f.precisaRevisao } : {}),
      ...(f.ocorridoDe || f.ocorridoAte
        ? {
            ocorridoEm: {
              ...(f.ocorridoDe ? { gte: f.ocorridoDe } : {}),
              ...(f.ocorridoAte ? { lte: f.ocorridoAte } : {}),
            },
          }
        : {}),
      ...(f.q ? { idOrigem: { contains: f.q, mode: 'insensitive' } } : {}),
    };
  }

  async listar(f: ListaFiltros) {
    const where = this.where(f);
    const [rows, total] = await Promise.all([
      this.prisma.transacao.findMany({
        where,
        orderBy: [{ ocorridoEm: { sort: 'desc', nulls: 'last' } }, { criadoEm: 'desc' }],
        skip: (f.pagina - 1) * f.tamanho,
        take: f.tamanho,
      }),
      this.prisma.transacao.count({ where }),
    ]);
    return { rows, total };
  }

  async detalhe(id: string) {
    return this.prisma.transacao.findUnique({
      where: { id },
      include: { pessoa: { select: { id: true, nome: true } } },
    });
  }
}
