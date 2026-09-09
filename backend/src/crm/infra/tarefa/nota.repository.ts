import { Injectable } from '@nestjs/common';
import type { TarefaNota } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class NotaTarefaRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(tarefaId: string): Promise<TarefaNota[]> {
    return this.prisma.tarefaNota.findMany({ where: { tarefaId }, orderBy: { criadoEm: 'asc' } });
  }

  async criar(tarefaId: string, autorId: string | null, conteudo: string): Promise<TarefaNota> {
    return this.prisma.tarefaNota.create({
      data: { id: EntidadeId.novo().value, tarefaId, autorId, conteudo },
    });
  }
}
