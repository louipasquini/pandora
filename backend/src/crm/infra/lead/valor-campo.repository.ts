import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type ValorCampoRow = Prisma.ValorCampoLeadGetPayload<{
  include: { definicao: true };
}>;

@Injectable()
export class ValorCampoRepository {
  constructor(private readonly prisma: PrismaService) {}

  porLead(leadId: string): Promise<ValorCampoRow[]> {
    return this.prisma.valorCampoLead.findMany({
      where: { leadId },
      include: { definicao: true },
    });
  }

  /** Aplica um diff calculado pelo serviço, numa transação. */
  async aplicar(
    leadId: string,
    upserts: { definicaoId: string; valor: string }[],
    remover: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const u of upserts) {
        await tx.valorCampoLead.upsert({
          where: { leadId_definicaoId: { leadId, definicaoId: u.definicaoId } },
          create: {
            id: EntidadeId.novo().value,
            leadId,
            definicaoId: u.definicaoId,
            valor: u.valor,
          },
          update: { valor: u.valor },
        });
      }
      if (remover.length > 0) {
        await tx.valorCampoLead.deleteMany({
          where: { leadId, definicaoId: { in: remover } },
        });
      }
    });
  }

  /** leads que têm o par (chave da definição, valor) — para o filtro `campo:*`. */
  async leadIdsComCampo(chave: string, valor: string): Promise<string[]> {
    const rows = await this.prisma.valorCampoLead.findMany({
      where: { definicao: { chave }, valor },
      select: { leadId: true },
    });
    return rows.map((r) => r.leadId);
  }
}
