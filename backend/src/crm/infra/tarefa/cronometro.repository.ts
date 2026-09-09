import { Injectable } from '@nestjs/common';
import type { TarefaCronometroPeriodo } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CronometroRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(tarefaId: string): Promise<TarefaCronometroPeriodo[]> {
    return this.prisma.tarefaCronometroPeriodo.findMany({
      where: { tarefaId },
      orderBy: { inicio: 'asc' },
    });
  }

  periodoAberto(tarefaId: string): Promise<TarefaCronometroPeriodo | null> {
    return this.prisma.tarefaCronometroPeriodo.findFirst({ where: { tarefaId, fim: null } });
  }

  async abrir(tarefaId: string, inicio: Date): Promise<TarefaCronometroPeriodo> {
    return this.prisma.tarefaCronometroPeriodo.create({
      data: { id: EntidadeId.novo().value, tarefaId, inicio },
    });
  }

  async fechar(id: string, fim: Date): Promise<TarefaCronometroPeriodo> {
    return this.prisma.tarefaCronometroPeriodo.update({ where: { id }, data: { fim } });
  }
}
