import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId, agoraUtc } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';
import type { OportunidadeRow } from './oportunidade.repository';

export type MovimentacaoRow = Prisma.OportunidadeMovimentacaoGetPayload<Record<string, never>>;

@Injectable()
export class MovimentacaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Grava a movimentação e atualiza `etapaId`/`entrouEtapaEm`, na mesma transação. */
  async mover(dados: {
    oportunidadeId: string;
    etapaAnteriorId: string | null;
    etapaNovaId: string;
    movidoPorId: string | null;
    motivo: string | null;
  }): Promise<OportunidadeRow> {
    const agora = agoraUtc();
    await this.prisma.$transaction([
      this.prisma.oportunidadeMovimentacao.create({
        data: {
          id: EntidadeId.novo().value,
          oportunidadeId: dados.oportunidadeId,
          etapaAnteriorId: dados.etapaAnteriorId,
          etapaNovaId: dados.etapaNovaId,
          movidoPorId: dados.movidoPorId,
          motivo: dados.motivo,
        },
      }),
      this.prisma.oportunidade.update({
        where: { id: dados.oportunidadeId },
        data: { etapaId: dados.etapaNovaId, entrouEtapaEm: agora },
      }),
    ]);
    return this.prisma.oportunidade.findUniqueOrThrow({
      where: { id: dados.oportunidadeId },
      include: { etapa: true, pipeline: true },
    });
  }

  /** Só a linha de histórico — usado na criação, quando `etapaId`/`entrouEtapaEm`
   * já foram gravados na própria criação da `oportunidade` (evita 2 `agoraUtc()`
   * levemente divergentes para o mesmo instante). */
  async registrarInicial(dados: {
    oportunidadeId: string;
    etapaNovaId: string;
  }): Promise<void> {
    await this.prisma.oportunidadeMovimentacao.create({
      data: {
        id: EntidadeId.novo().value,
        oportunidadeId: dados.oportunidadeId,
        etapaAnteriorId: null,
        etapaNovaId: dados.etapaNovaId,
        movidoPorId: null,
        motivo: null,
      },
    });
  }

  listarPorOportunidade(oportunidadeId: string): Promise<MovimentacaoRow[]> {
    return this.prisma.oportunidadeMovimentacao.findMany({
      where: { oportunidadeId },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }
}
