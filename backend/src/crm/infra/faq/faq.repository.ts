import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type FaqItemRow = Prisma.FaqItemGetPayload<Record<string, never>>;

@Injectable()
export class FaqRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(ativo?: boolean): Promise<FaqItemRow[]> {
    return this.prisma.faqItem.findMany({
      where: ativo === undefined ? {} : { ativo },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }

  listarAtivos(): Promise<FaqItemRow[]> {
    return this.prisma.faqItem.findMany({ where: { ativo: true } });
  }

  porId(id: string): Promise<FaqItemRow | null> {
    return this.prisma.faqItem.findUnique({ where: { id } });
  }

  criar(data: { pergunta: string; resposta: string }): Promise<FaqItemRow> {
    return this.prisma.faqItem.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  atualizar(id: string, data: Prisma.FaqItemUncheckedUpdateInput): Promise<FaqItemRow> {
    return this.prisma.faqItem.update({ where: { id }, data });
  }
}
