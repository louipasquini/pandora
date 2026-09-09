import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export type CampoPessoaDefRow = Prisma.CampoPersonalizadoPessoaGetPayload<Record<string, never>>;

/**
 * Definições de campo personalizado de `pessoa` (spec 013, CL-02). Espelha
 * `crm/infra/lead/campo-personalizado.repository.ts` (spec 008).
 */
@Injectable()
export class CampoPersonalizadoPessoaRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(ativo?: boolean): Promise<CampoPessoaDefRow[]> {
    return this.prisma.campoPersonalizadoPessoa.findMany({
      where: ativo === undefined ? {} : { ativo },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }

  listarAtivas(): Promise<CampoPessoaDefRow[]> {
    return this.prisma.campoPersonalizadoPessoa.findMany({ where: { ativo: true } });
  }

  porId(id: string): Promise<CampoPessoaDefRow | null> {
    return this.prisma.campoPersonalizadoPessoa.findUnique({ where: { id } });
  }

  porChave(chave: string): Promise<CampoPessoaDefRow | null> {
    return this.prisma.campoPersonalizadoPessoa.findUnique({ where: { chave } });
  }

  async criar(data: {
    chave: string;
    rotulo: string;
    tipo: Prisma.CampoPersonalizadoPessoaCreateInput['tipo'];
    opcoes: string[];
    obrigatorio: boolean;
  }): Promise<CampoPessoaDefRow> {
    return this.prisma.campoPersonalizadoPessoa.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  atualizar(
    id: string,
    data: Prisma.CampoPersonalizadoPessoaUncheckedUpdateInput,
  ): Promise<CampoPessoaDefRow> {
    return this.prisma.campoPersonalizadoPessoa.update({ where: { id }, data });
  }

  async contarValores(definicaoId: string): Promise<number> {
    return this.prisma.valorCampoPessoa.count({ where: { definicaoId } });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.campoPersonalizadoPessoa.delete({ where: { id } });
  }
}
