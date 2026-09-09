import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calcularPontosTarefa } from '../../domain/tarefa';
import { TarefaRepository } from '../../infra/tarefa/tarefa.repository';

export interface EntradaRanking {
  responsavelId: string;
  pontos: number;
  tarefasConcluidas: number;
}

/**
 * Ranking de pontos (spec 016, CL-01) — **derivado**, nunca lido de contador
 * persistido (Princípio V). Soma `calcularPontosTarefa` sobre as tarefas
 * `CONCLUIDA` do período, agrupado por `responsavelId`.
 */
@Injectable()
export class RankingService {
  constructor(private readonly repo: TarefaRepository) {}

  async ranking(desde: Date | null, ate: Date | null): Promise<EntradaRanking[]> {
    const where: Prisma.TarefaWhereInput = { status: 'CONCLUIDA' };
    if (desde || ate) {
      where.concluidoEm = {
        ...(desde ? { gte: desde } : {}),
        ...(ate ? { lte: ate } : {}),
      };
    }

    const tarefas = await this.repo.listarTodas(where);
    const porResponsavel = new Map<string, EntradaRanking>();

    for (const t of tarefas) {
      if (!t.responsavelId) continue; // tarefa "geral" não pontua para ninguém
      const pontos = calcularPontosTarefa({
        concluida: t.status === 'CONCLUIDA',
        dataVencimento: t.dataVencimento,
        concluidoEm: t.concluidoEm,
        totalChecklist: t.checklist.length,
        checklistConcluidos: t.checklist.filter((i) => i.concluido).length,
      });
      const atual = porResponsavel.get(t.responsavelId) ?? {
        responsavelId: t.responsavelId,
        pontos: 0,
        tarefasConcluidas: 0,
      };
      atual.pontos += pontos;
      atual.tarefasConcluidas += 1;
      porResponsavel.set(t.responsavelId, atual);
    }

    return [...porResponsavel.values()].sort((a, b) => b.pontos - a.pontos);
  }
}
