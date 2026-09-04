import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type OptOutWhatsappRow = Prisma.OptOutWhatsappGetPayload<Record<string, never>>;

@Injectable()
export class OptOutWhatsappRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Linha mais recente por telefone (histórico — pode haver várias). */
  maisRecentePorTelefone(telefone: string): Promise<OptOutWhatsappRow | null> {
    return this.prisma.optOutWhatsapp.findFirst({
      where: { telefone },
      orderBy: [{ optadoEm: 'desc' }],
    });
  }

  async criar(
    data: Omit<Prisma.OptOutWhatsappUncheckedCreateInput, 'id'>,
  ): Promise<OptOutWhatsappRow> {
    return this.prisma.optOutWhatsapp.create({ data: { id: EntidadeId.novo().value, ...data } });
  }

  async reverter(id: string, revertidoEm: Date): Promise<OptOutWhatsappRow> {
    return this.prisma.optOutWhatsapp.update({ where: { id }, data: { revertidoEm } });
  }
}
