import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type MetaComercialRow = Prisma.MetaComercialGetPayload<Record<string, never>>;

@Injectable()
export class MetaComercialRepository {
  constructor(private readonly prisma: PrismaService) {}

  porId(id: string): Promise<MetaComercialRow | null> {
    return this.prisma.metaComercial.findUnique({ where: { id } });
  }

  listar(where: Prisma.MetaComercialWhereInput): Promise<MetaComercialRow[]> {
    return this.prisma.metaComercial.findMany({
      where,
      orderBy: [{ referencia: 'desc' }, { criadoEm: 'desc' }],
    });
  }

  criar(
    data: Omit<Prisma.MetaComercialUncheckedCreateInput, 'id'>,
  ): Promise<MetaComercialRow> {
    return this.prisma.metaComercial.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  atualizarCampos(
    id: string,
    data: Prisma.MetaComercialUncheckedUpdateInput,
  ): Promise<MetaComercialRow> {
    return this.prisma.metaComercial.update({ where: { id }, data });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.metaComercial.delete({ where: { id } });
  }
}
