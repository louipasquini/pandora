import { Injectable } from '@nestjs/common';
import type {
  IntegracaoAlvo,
  IntegracaoTipo,
  Prisma,
} from '@prisma/client';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntegracaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dados: {
    nome: string;
    tipo: IntegracaoTipo;
    alvo: IntegracaoAlvo;
    config: Prisma.InputJsonValue;
    ativo?: boolean;
    segredoCifrado?: string | null;
    segredoHash?: string | null;
    segredoUltimos4?: string | null;
  }): Promise<{ id: string }> {
    return this.prisma.integracao.create({
      data: {
        id: EntidadeId.novo().value,
        nome: dados.nome,
        tipo: dados.tipo,
        alvo: dados.alvo,
        config: dados.config,
        ...(dados.ativo === undefined ? {} : { ativo: dados.ativo }),
        segredoCifrado: dados.segredoCifrado ?? null,
        segredoHash: dados.segredoHash ?? null,
        segredoUltimos4: dados.segredoUltimos4 ?? null,
      },
      select: { id: true },
    });
  }

  obter(id: string) {
    return this.prisma.integracao.findUnique({ where: { id } });
  }

  async atualizar(
    id: string,
    dados: Prisma.IntegracaoUpdateInput,
  ): Promise<void> {
    await this.prisma.integracao.update({ where: { id }, data: dados });
  }

  async listar(filtro: {
    tipo?: IntegracaoTipo;
    alvo?: IntegracaoAlvo;
    ativo?: boolean;
    pagina: number;
    tamanho: number;
  }) {
    const where: Prisma.IntegracaoWhereInput = {
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      ...(filtro.alvo ? { alvo: filtro.alvo } : {}),
      ...(filtro.ativo === undefined ? {} : { ativo: filtro.ativo }),
    };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.integracao.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.tamanho,
        take: filtro.tamanho,
      }),
      this.prisma.integracao.count({ where }),
    ]);
    return { itens, total };
  }
}
