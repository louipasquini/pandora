import { Injectable } from '@nestjs/common';
import { Prisma, FluxoExecucaoResultado, FluxoGatilhoTipo, FluxoRegistroTipo } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AcaoAplicadaResultado } from '../../domain/workflow';

export type ExecucaoFluxoRow = Prisma.ExecucaoFluxoGetPayload<Record<string, never>>;

export interface ChaveExecucao {
  fluxoVersaoId: string;
  fonte: FluxoGatilhoTipo;
  fonteRegistroId: string;
}

@Injectable()
export class ExecucaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async existe(chave: ChaveExecucao): Promise<boolean> {
    const r = await this.prisma.execucaoFluxo.findUnique({
      where: {
        fluxoVersaoId_fonte_fonteRegistroId: {
          fluxoVersaoId: chave.fluxoVersaoId,
          fonte: chave.fonte,
          fonteRegistroId: chave.fonteRegistroId,
        },
      },
      select: { id: true },
    });
    return r != null;
  }

  /**
   * Idempotente por construção (D-06): uma 2ª tentativa da mesma chave é
   * simplesmente ignorada (`skipDuplicates`) em vez de lançar — o chamador
   * (`WorkerService`) já checa `existe()` antes de rodar as ações, então uma
   * corrida aqui só pode acontecer entre `existe()` e `registrar()` dentro do
   * mesmo processo, que o mutex de passada única do worker já evita.
   */
  async registrar(dados: {
    fluxoVersaoId: string;
    fonte: FluxoGatilhoTipo;
    fonteRegistroId: string;
    registroTipo: FluxoRegistroTipo;
    registroId: string;
    resultado: FluxoExecucaoResultado;
    acoesAplicadas: AcaoAplicadaResultado[];
    erroDetalhe: string | null;
    ocorridoEm: Date;
  }): Promise<void> {
    await this.prisma.execucaoFluxo.createMany({
      data: [
        {
          id: EntidadeId.novo().value,
          fluxoVersaoId: dados.fluxoVersaoId,
          fonte: dados.fonte,
          fonteRegistroId: dados.fonteRegistroId,
          registroTipo: dados.registroTipo,
          registroId: dados.registroId,
          resultado: dados.resultado,
          acoesAplicadas: dados.acoesAplicadas as unknown as Prisma.InputJsonValue,
          erroDetalhe: dados.erroDetalhe,
          ocorridoEm: dados.ocorridoEm,
        },
      ],
      skipDuplicates: true,
    });
  }

  async listarPorFluxo(
    fluxoVersaoIds: string[],
    opts: { resultado?: FluxoExecucaoResultado; limit: number; cursor?: string },
  ): Promise<ExecucaoFluxoRow[]> {
    return this.prisma.execucaoFluxo.findMany({
      where: {
        fluxoVersaoId: { in: fluxoVersaoIds },
        resultado: opts.resultado,
      },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: opts.limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
  }

  obterPorId(id: string): Promise<ExecucaoFluxoRow | null> {
    return this.prisma.execucaoFluxo.findUnique({ where: { id } });
  }
}
