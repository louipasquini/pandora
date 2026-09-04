import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type RespostaAtendimentoRow = Prisma.RespostaAtendimentoGetPayload<Record<string, never>>;

@Injectable()
export class RespostaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criar(
    dados: Omit<Prisma.RespostaAtendimentoUncheckedCreateInput, 'id'>,
  ): Promise<RespostaAtendimentoRow> {
    return this.prisma.respostaAtendimento.create({
      data: { id: EntidadeId.novo().value, ...dados },
    });
  }

  listarPorAtendimento(atendimentoId: string): Promise<RespostaAtendimentoRow[]> {
    return this.prisma.respostaAtendimento.findMany({
      where: { atendimentoId },
      orderBy: { criadoEm: 'asc' },
    });
  }
}
