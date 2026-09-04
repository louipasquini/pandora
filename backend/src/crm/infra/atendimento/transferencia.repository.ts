import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type TransferenciaRow = Prisma.TransferenciaAtendimentoGetPayload<Record<string, never>>;

@Injectable()
export class TransferenciaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criar(
    dados: Omit<Prisma.TransferenciaAtendimentoUncheckedCreateInput, 'id'>,
  ): Promise<TransferenciaRow> {
    return this.prisma.transferenciaAtendimento.create({
      data: { id: EntidadeId.novo().value, ...dados },
    });
  }

  listarPorAtendimento(atendimentoId: string): Promise<TransferenciaRow[]> {
    return this.prisma.transferenciaAtendimento.findMany({
      where: { atendimentoId },
      orderBy: { criadoEm: 'asc' },
    });
  }
}
