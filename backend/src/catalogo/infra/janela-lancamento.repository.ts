import { Injectable } from '@nestjs/common';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { JanelaLancamentoResumo } from '../domain';

@Injectable()
export class JanelaLancamentoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert por `(produtoId, rotulo)` — reimportar o mesmo lançamento não duplica. */
  async upsert(dados: {
    produtoId: string;
    rotulo: string;
    inicio: Date;
    fim: Date;
  }): Promise<{ criada: boolean }> {
    const existente = await this.prisma.janelaLancamento.findUnique({
      where: {
        janela_lancamento_produto_rotulo: { produtoId: dados.produtoId, rotulo: dados.rotulo },
      },
    });
    if (existente) {
      await this.prisma.janelaLancamento.update({
        where: { id: existente.id },
        data: { inicio: dados.inicio, fim: dados.fim },
      });
      return { criada: false };
    }
    await this.prisma.janelaLancamento.create({
      data: {
        id: EntidadeId.novo().value,
        produtoId: dados.produtoId,
        rotulo: dados.rotulo,
        inicio: dados.inicio,
        fim: dados.fim,
      },
    });
    return { criada: true };
  }

  async listarPorProduto(produtoId: string): Promise<JanelaLancamentoResumo[]> {
    const linhas = await this.prisma.janelaLancamento.findMany({ where: { produtoId } });
    return linhas.map((l) => ({ rotulo: l.rotulo, inicio: l.inicio, fim: l.fim }));
  }
}
