import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type CampoDefRow = Prisma.CampoPersonalizadoOportunidadeGetPayload<
  Record<string, never>
>;

@Injectable()
export class CampoOportunidadeRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(ativo?: boolean): Promise<CampoDefRow[]> {
    return this.prisma.campoPersonalizadoOportunidade.findMany({
      where: ativo === undefined ? {} : { ativo },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }

  listarAtivas(): Promise<CampoDefRow[]> {
    return this.prisma.campoPersonalizadoOportunidade.findMany({ where: { ativo: true } });
  }

  porId(id: string): Promise<CampoDefRow | null> {
    return this.prisma.campoPersonalizadoOportunidade.findUnique({ where: { id } });
  }

  porChave(chave: string): Promise<CampoDefRow | null> {
    return this.prisma.campoPersonalizadoOportunidade.findUnique({ where: { chave } });
  }

  async criar(data: {
    chave: string;
    rotulo: string;
    tipo: Prisma.CampoPersonalizadoOportunidadeCreateInput['tipo'];
    opcoes: string[];
    obrigatorio: boolean;
  }): Promise<CampoDefRow> {
    return this.prisma.campoPersonalizadoOportunidade.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  atualizar(
    id: string,
    data: Prisma.CampoPersonalizadoOportunidadeUncheckedUpdateInput,
  ): Promise<CampoDefRow> {
    return this.prisma.campoPersonalizadoOportunidade.update({ where: { id }, data });
  }

  async contarValores(definicaoId: string): Promise<number> {
    return this.prisma.valorCampoOportunidade.count({ where: { definicaoId } });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.campoPersonalizadoOportunidade.delete({ where: { id } });
  }
}
