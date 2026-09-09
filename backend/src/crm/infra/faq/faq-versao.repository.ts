import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type FaqItemVersaoRow = Prisma.FaqItemVersaoGetPayload<Record<string, never>>;

/** Histórico append-only de `FaqItem` (spec 013, research.md D-R1). */
@Injectable()
export class FaqVersaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  criar(data: {
    faqItemId: string;
    pergunta: string;
    resposta: string;
    autor: string | null;
  }): Promise<FaqItemVersaoRow> {
    return this.prisma.faqItemVersao.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  listarPorItem(faqItemId: string): Promise<FaqItemVersaoRow[]> {
    return this.prisma.faqItemVersao.findMany({
      where: { faqItemId },
      orderBy: [{ criadoEm: 'desc' }],
    });
  }
}
