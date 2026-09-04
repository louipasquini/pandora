import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type ValorCampoRow = Prisma.ValorCampoOportunidadeGetPayload<{
  include: { definicao: true };
}>;

@Injectable()
export class ValorCampoOportunidadeRepository {
  constructor(private readonly prisma: PrismaService) {}

  porOportunidade(oportunidadeId: string): Promise<ValorCampoRow[]> {
    return this.prisma.valorCampoOportunidade.findMany({
      where: { oportunidadeId },
      include: { definicao: true },
    });
  }

  /** Aplica um diff calculado pelo serviço, numa transação. */
  async aplicar(
    oportunidadeId: string,
    upserts: { definicaoId: string; valor: string }[],
    remover: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const u of upserts) {
        await tx.valorCampoOportunidade.upsert({
          where: {
            oportunidadeId_definicaoId: { oportunidadeId, definicaoId: u.definicaoId },
          },
          create: {
            id: EntidadeId.novo().value,
            oportunidadeId,
            definicaoId: u.definicaoId,
            valor: u.valor,
          },
          update: { valor: u.valor },
        });
      }
      if (remover.length > 0) {
        await tx.valorCampoOportunidade.deleteMany({
          where: { oportunidadeId, definicaoId: { in: remover } },
        });
      }
    });
  }
}
