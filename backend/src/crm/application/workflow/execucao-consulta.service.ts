import { Injectable, NotFoundException } from '@nestjs/common';
import type { FluxoExecucaoResultado } from '@prisma/client';
import { FluxoRepository } from '../../infra/workflow/fluxo.repository';
import { ExecucaoRepository } from '../../infra/workflow/execucao.repository';

/** Histórico de execuções (spec 014, US5) — sempre append-only, nunca editado. */
@Injectable()
export class ExecucaoConsultaService {
  constructor(
    private readonly fluxos: FluxoRepository,
    private readonly execucoes: ExecucaoRepository,
  ) {}

  async listarPorFluxo(
    fluxoId: string,
    opts: { resultado?: FluxoExecucaoResultado; limit: number; cursor?: string },
  ) {
    const fluxo = await this.fluxos.fluxoPorId(fluxoId);
    if (!fluxo) throw new NotFoundException('fluxo não encontrado');
    const versoes = await this.fluxos.listarVersoes(fluxoId);
    return this.execucoes.listarPorFluxo(
      versoes.map((v) => v.id),
      opts,
    );
  }

  async obterPorId(id: string) {
    const execucao = await this.execucoes.obterPorId(id);
    if (!execucao) throw new NotFoundException('execução não encontrada');
    return execucao;
  }
}
