import { Injectable } from '@nestjs/common';
import type { Tarefa, TarefaDependencia } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type DependenciaRow = TarefaDependencia & { dependeDe: Tarefa };

@Injectable()
export class DependenciaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas as arestas `tarefa -> depende_de` do banco (grafo inteiro — volume baixo assumido). */
  todasAsArestas(): Promise<{ tarefaId: string; dependeDeId: string }[]> {
    return this.prisma.tarefaDependencia.findMany({
      select: { tarefaId: true, dependeDeId: true },
    });
  }

  listar(tarefaId: string): Promise<DependenciaRow[]> {
    return this.prisma.tarefaDependencia.findMany({
      where: { tarefaId },
      include: { dependeDe: true },
      orderBy: { criadoEm: 'asc' },
    });
  }

  /** Dependências pendentes (a tarefa da qual se depende ainda não está CONCLUIDA). */
  pendentes(tarefaId: string): Promise<DependenciaRow[]> {
    return this.prisma.tarefaDependencia.findMany({
      where: { tarefaId, dependeDe: { status: { not: 'CONCLUIDA' } } },
      include: { dependeDe: true },
    });
  }

  async existe(tarefaId: string, dependeDeId: string): Promise<boolean> {
    return (
      (await this.prisma.tarefaDependencia.count({ where: { tarefaId, dependeDeId } })) > 0
    );
  }

  async adicionar(tarefaId: string, dependeDeId: string): Promise<TarefaDependencia> {
    return this.prisma.tarefaDependencia.create({
      data: { id: EntidadeId.novo().value, tarefaId, dependeDeId },
    });
  }

  async remover(tarefaId: string, dependeDeId: string): Promise<void> {
    await this.prisma.tarefaDependencia.deleteMany({ where: { tarefaId, dependeDeId } });
  }
}
