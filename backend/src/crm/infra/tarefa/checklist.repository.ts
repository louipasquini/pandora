import { Injectable } from '@nestjs/common';
import { Prisma, type TarefaChecklistItem } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ChecklistRepository {
  constructor(private readonly prisma: PrismaService) {}

  async proximaOrdem(tarefaId: string): Promise<number> {
    const ultimo = await this.prisma.tarefaChecklistItem.findFirst({
      where: { tarefaId },
      orderBy: { ordem: 'desc' },
    });
    return (ultimo?.ordem ?? -1) + 1;
  }

  async criar(tarefaId: string, texto: string, ordem: number): Promise<TarefaChecklistItem> {
    return this.prisma.tarefaChecklistItem.create({
      data: { id: EntidadeId.novo().value, tarefaId, texto, ordem },
    });
  }

  porId(id: string): Promise<TarefaChecklistItem | null> {
    return this.prisma.tarefaChecklistItem.findUnique({ where: { id } });
  }

  async atualizar(
    id: string,
    data: Prisma.TarefaChecklistItemUncheckedUpdateInput,
  ): Promise<TarefaChecklistItem> {
    return this.prisma.tarefaChecklistItem.update({ where: { id }, data });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.tarefaChecklistItem.delete({ where: { id } });
  }
}
