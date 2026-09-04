import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type RegraRow = Prisma.RegraAtribuicaoPipelineGetPayload<Record<string, never>>;

@Injectable()
export class RegraAtribuicaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(pipelineId: string): Promise<RegraRow[]> {
    return this.prisma.regraAtribuicaoPipeline.findMany({
      where: { pipelineId },
      orderBy: [{ ordem: 'asc' }],
    });
  }

  /** Substitui a lista completa numa transação (apaga + recria — D-03/FR-013). */
  async substituir(
    pipelineId: string,
    regras: {
      ordem: number;
      campo: Prisma.RegraAtribuicaoPipelineCreateInput['campo'];
      valor: Prisma.InputJsonValue;
      responsavelId: string;
    }[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.regraAtribuicaoPipeline.deleteMany({ where: { pipelineId } }),
      this.prisma.regraAtribuicaoPipeline.createMany({
        data: regras.map((r) => ({
          id: EntidadeId.novo().value,
          pipelineId,
          ordem: r.ordem,
          campo: r.campo,
          valor: r.valor,
          responsavelId: r.responsavelId,
        })),
      }),
    ]);
  }

  async usuarioExiste(id: string): Promise<boolean> {
    return (await this.prisma.usuario.count({ where: { id } })) > 0;
  }
}
