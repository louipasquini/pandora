import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type CampoDefRow = Prisma.CampoPersonalizadoLeadGetPayload<Record<string, never>>;

@Injectable()
export class CampoPersonalizadoRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(ativo?: boolean): Promise<CampoDefRow[]> {
    return this.prisma.campoPersonalizadoLead.findMany({
      where: ativo === undefined ? {} : { ativo },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }

  listarAtivas(): Promise<CampoDefRow[]> {
    return this.prisma.campoPersonalizadoLead.findMany({ where: { ativo: true } });
  }

  porId(id: string): Promise<CampoDefRow | null> {
    return this.prisma.campoPersonalizadoLead.findUnique({ where: { id } });
  }

  porChave(chave: string): Promise<CampoDefRow | null> {
    return this.prisma.campoPersonalizadoLead.findUnique({ where: { chave } });
  }

  async criar(data: {
    chave: string;
    rotulo: string;
    tipo: Prisma.CampoPersonalizadoLeadCreateInput['tipo'];
    opcoes: string[];
    obrigatorio: boolean;
  }): Promise<CampoDefRow> {
    return this.prisma.campoPersonalizadoLead.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  atualizar(
    id: string,
    data: Prisma.CampoPersonalizadoLeadUncheckedUpdateInput,
  ): Promise<CampoDefRow> {
    return this.prisma.campoPersonalizadoLead.update({ where: { id }, data });
  }

  async contarValores(definicaoId: string): Promise<number> {
    return this.prisma.valorCampoLead.count({ where: { definicaoId } });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.campoPersonalizadoLead.delete({ where: { id } });
  }
}
