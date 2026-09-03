import { Injectable } from '@nestjs/common';
import {
  Classificacao,
  EtapaIngestao,
  EventoEtapaStatus,
  EventoOrigemStatus,
  Prisma,
} from '@prisma/client';
import { EntidadeId, agoraUtc } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ETAPAS } from '../domain';
import type { EtapaSnapshot, Tx } from '../domain';

export interface EventoParaWorker {
  id: string;
  tipoOrigem: string;
  eventoCanonico: Prisma.JsonValue | null;
}

export interface ListaFiltros {
  status?: EventoOrigemStatus[];
  plataformaOrigem?: string;
  tipoOrigem?: string;
  classificacao?: Classificacao;
  recebidoDe?: Date;
  recebidoAte?: Date;
  pagina: number;
  tamanho: number;
}

export interface EventoListaItem {
  id: string;
  plataformaOrigem: string;
  tipoOrigem: string;
  idOrigem: string;
  status: string;
  classificacao: string | null;
  erroDetalhe: string | null;
  recebidoEm: Date;
  reentregas: number;
}

@Injectable()
export class EventoRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- etapa 0

  /**
   * Etapa 0 (REGISTRAR): upsert idempotente pela chave natural
   * `(plataforma_origem, id_origem, hash)`. Novo → cria o evento + 7
   * `evento_etapa` (`REGISTRAR = ok`, demais `pendente`). Reentrega → só
   * incrementa `reentregas` / `ultimo_recebido_em`.
   */
  async upsertPorChave(dados: {
    plataformaOrigem: string;
    idOrigem: string;
    tipoOrigem: string;
    payloadBruto: unknown;
    eventoCanonico?: unknown;
    hash: string;
  }): Promise<{ eventoId: string; criado: boolean }> {
    const agora = agoraUtc();
    try {
      const eventoId = EntidadeId.novo().value;
      await this.prisma.$transaction(async (tx) => {
        await tx.eventoOrigem.create({
          data: {
            id: eventoId,
            plataformaOrigem: dados.plataformaOrigem as never,
            idOrigem: dados.idOrigem,
            tipoOrigem: dados.tipoOrigem,
            payloadBruto: (dados.payloadBruto ?? null) as never,
            eventoCanonico: (dados.eventoCanonico ?? null) as never,
            hash: dados.hash,
            recebidoEm: agora,
            ultimoRecebidoEm: agora,
            status: EventoOrigemStatus.pendente,
          },
        });
        await tx.eventoEtapa.createMany({
          data: ETAPAS.map((e) => ({
            id: EntidadeId.novo().value,
            eventoOrigemId: eventoId,
            etapa: e.nome,
            status:
              e.nome === EtapaIngestao.REGISTRAR
                ? EventoEtapaStatus.ok
                : EventoEtapaStatus.pendente,
            executadoEm: e.nome === EtapaIngestao.REGISTRAR ? agora : null,
          })),
        });
      });
      return { eventoId, criado: true };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existente = await this.prisma.eventoOrigem.update({
          where: {
            evento_origem_chave_natural: {
              plataformaOrigem: dados.plataformaOrigem as never,
              idOrigem: dados.idOrigem,
              hash: dados.hash,
            },
          },
          data: { reentregas: { increment: 1 }, ultimoRecebidoEm: agora },
          select: { id: true },
        });
        return { eventoId: existente.id, criado: false };
      }
      throw err;
    }
  }

  // ------------------------------------------------------------- worker

  /**
   * Ids de eventos com trabalho **acionável**: uma etapa `pendente` ou uma `erro`
   * com tentativas restantes. `bloqueada` sozinha **não** torna o evento elegível
   * — quem o traz de volta é o blocker (`erro` sub-teto); esgotado o blocker, o
   * evento fica terminal até um reprocesso manual.
   */
  async selecionarElegiveisIds(max: number, lote: number): Promise<string[]> {
    const linhas = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT e.id
      FROM evento_origem e
      WHERE EXISTS (
        SELECT 1 FROM evento_etapa et
        WHERE et.evento_origem_id = e.id
          AND (
            et.status::text = 'pendente'
            OR (et.status::text = 'erro' AND et.tentativas < ${max})
          )
      )
      ORDER BY e.recebido_em ASC, e.id ASC
      LIMIT ${lote}
    `);
    return linhas.map((l) => l.id);
  }

  /** Trava a linha do evento para esta transação; `false` se outro worker já a tem. */
  async bloquear(tx: Tx, eventoId: string): Promise<boolean> {
    const linhas = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM evento_origem WHERE id = ${eventoId}::uuid FOR UPDATE SKIP LOCKED
    `);
    return linhas.length > 0;
  }

  async carregarParaWorker(tx: Tx, eventoId: string): Promise<EventoParaWorker | null> {
    const e = await tx.eventoOrigem.findUnique({
      where: { id: eventoId },
      select: { id: true, tipoOrigem: true, eventoCanonico: true },
    });
    return e ?? null;
  }

  async snapshotEtapas(tx: Tx, eventoId: string): Promise<EtapaSnapshot[]> {
    const rows = await tx.eventoEtapa.findMany({
      where: { eventoOrigemId: eventoId },
      select: { etapa: true, status: true, tentativas: true, resultado: true },
    });
    return rows.map((r) => ({
      etapa: r.etapa,
      status: r.status,
      tentativas: r.tentativas,
      revisar:
        r.resultado != null &&
        typeof r.resultado === 'object' &&
        (r.resultado as Record<string, unknown>).revisar === true,
    }));
  }

  async atualizarEtapa(
    tx: Tx,
    eventoId: string,
    etapa: EtapaIngestao,
    patch: {
      status: EventoEtapaStatus;
      resultado?: unknown;
      erroDetalhe?: string | null;
      incrementarTentativa?: boolean;
    },
  ): Promise<void> {
    await tx.eventoEtapa.update({
      where: { eventoOrigemId_etapa: { eventoOrigemId: eventoId, etapa } },
      data: {
        status: patch.status,
        resultado: (patch.resultado ?? null) as never,
        erroDetalhe: patch.erroDetalhe ?? null,
        executadoEm: agoraUtc(),
        ...(patch.incrementarTentativa ? { tentativas: { increment: 1 } } : {}),
      },
    });
  }

  async atualizarEventoDerivado(
    tx: Tx,
    eventoId: string,
    patch: {
      status: EventoOrigemStatus;
      classificacao?: Classificacao | null;
      erroDetalhe?: string | null;
    },
  ): Promise<void> {
    await tx.eventoOrigem.update({
      where: { id: eventoId },
      data: {
        status: patch.status,
        ...(patch.classificacao !== undefined
          ? { classificacao: patch.classificacao }
          : {}),
        erroDetalhe: patch.erroDetalhe ?? null,
      },
    });
  }

  // --------------------------------------------------------- reprocessar

  async temEtapaProcessando(eventoId: string): Promise<boolean> {
    const n = await this.prisma.eventoEtapa.count({
      where: { eventoOrigemId: eventoId, status: EventoEtapaStatus.processando },
    });
    return n > 0;
  }

  /**
   * Devolve as etapas não-`ok` a `pendente` (zera `tentativas`). `forcar` também
   * reenfileira `CLASSIFICAR`..`PROJETAR_CONTRATO` mesmo se `ok` (a `REGISTRAR` é
   * imutável). Retorna as etapas efetivamente reenfileiradas.
   */
  async reenfileirar(
    eventoId: string,
    forcar: boolean,
  ): Promise<EtapaIngestao[]> {
    return this.prisma.$transaction(async (tx) => {
      const etapas = await tx.eventoEtapa.findMany({
        where: { eventoOrigemId: eventoId },
        select: { etapa: true, status: true, resultado: true },
      });
      const alvo = etapas
        .filter((e) => {
          if (e.etapa === EtapaIngestao.REGISTRAR) return false;
          if (forcar) return true;
          if (
            e.status === EventoEtapaStatus.erro ||
            e.status === EventoEtapaStatus.bloqueada ||
            e.status === EventoEtapaStatus.pendente
          ) {
            return true;
          }
          // etapa que ficou `ok` mas sinalizou revisão → reprocessar re-executa
          return (
            e.resultado != null &&
            typeof e.resultado === 'object' &&
            (e.resultado as Record<string, unknown>).revisar === true
          );
        })
        .map((e) => e.etapa);

      if (alvo.length > 0) {
        await tx.eventoEtapa.updateMany({
          where: { eventoOrigemId: eventoId, etapa: { in: alvo } },
          data: {
            status: EventoEtapaStatus.pendente,
            tentativas: 0,
            resultado: Prisma.DbNull,
            erroDetalhe: null,
            executadoEm: null,
          },
        });
        await tx.eventoOrigem.update({
          where: { id: eventoId },
          data: { status: EventoOrigemStatus.pendente, erroDetalhe: null },
        });
      }
      return alvo;
    });
  }

  // --------------------------------------------------------------- painel

  async listar(f: ListaFiltros): Promise<{ itens: EventoListaItem[]; total: number }> {
    const where: Prisma.EventoOrigemWhereInput = {
      ...(f.status && f.status.length > 0 ? { status: { in: f.status } } : {}),
      ...(f.plataformaOrigem ? { plataformaOrigem: f.plataformaOrigem as never } : {}),
      ...(f.tipoOrigem ? { tipoOrigem: f.tipoOrigem } : {}),
      ...(f.classificacao ? { classificacao: f.classificacao } : {}),
      ...(f.recebidoDe || f.recebidoAte
        ? {
            recebidoEm: {
              ...(f.recebidoDe ? { gte: f.recebidoDe } : {}),
              ...(f.recebidoAte ? { lte: f.recebidoAte } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.eventoOrigem.findMany({
        where,
        orderBy: [{ recebidoEm: 'desc' }, { id: 'desc' }],
        skip: (f.pagina - 1) * f.tamanho,
        take: f.tamanho,
        select: {
          id: true,
          plataformaOrigem: true,
          tipoOrigem: true,
          idOrigem: true,
          status: true,
          classificacao: true,
          erroDetalhe: true,
          recebidoEm: true,
          reentregas: true,
        },
      }),
      this.prisma.eventoOrigem.count({ where }),
    ]);
    return { itens: rows, total };
  }

  async detalhe(id: string) {
    return this.prisma.eventoOrigem.findUnique({
      where: { id },
      select: {
        id: true,
        plataformaOrigem: true,
        tipoOrigem: true,
        idOrigem: true,
        hash: true,
        status: true,
        classificacao: true,
        erroDetalhe: true,
        recebidoEm: true,
        ultimoRecebidoEm: true,
        reentregas: true,
        payloadBruto: true,
        eventoCanonico: true,
        etapas: {
          orderBy: { etapa: 'asc' },
          select: {
            etapa: true,
            status: true,
            resultado: true,
            erroDetalhe: true,
            tentativas: true,
            executadoEm: true,
          },
        },
      },
    });
  }
}
