import { Injectable } from '@nestjs/common';
import type { TarefaDelegacao } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DelegacaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(tarefaId: string): Promise<TarefaDelegacao[]> {
    return this.prisma.tarefaDelegacao.findMany({
      where: { tarefaId },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async registrar(entrada: {
    tarefaId: string;
    deResponsavelId: string | null;
    paraResponsavelId: string | null;
    autorId: string | null;
    motivo: string | null;
  }): Promise<TarefaDelegacao> {
    return this.prisma.tarefaDelegacao.create({
      data: { id: EntidadeId.novo().value, ...entrada },
    });
  }
}
