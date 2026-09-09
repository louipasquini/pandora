import { Injectable, NotFoundException } from '@nestjs/common';
import type { FluxoRegistroTipo } from '@prisma/client';
import { avaliarCondicao, registroTipoDoGatilho, type AcaoFluxo, type CondicaoNo } from '../../domain/workflow';
import { FluxoRepository } from '../../infra/workflow/fluxo.repository';
import { ContextoRegistroService } from './contexto-registro.service';

export interface ResultadoSimulacao {
  gatilhoCompativel: boolean;
  condicaoSatisfeita: boolean;
  acoesQueSeriamDisparadas: AcaoFluxo[];
}

/**
 * Simulação (spec 014, US2, D-03) — nunca escreve. Resolve a versão (rascunho
 * atual, ou publicada se não houver rascunho), monta o mesmo contexto que o
 * worker usaria (`ContextoRegistroService`, reaproveitado) e avalia — sem
 * executar nenhuma ação de fato.
 */
@Injectable()
export class SimulacaoService {
  constructor(
    private readonly fluxos: FluxoRepository,
    private readonly contexto: ContextoRegistroService,
  ) {}

  async simular(
    fluxoId: string,
    dto: { versaoId?: string; registroTipo: FluxoRegistroTipo; registroId: string },
  ): Promise<ResultadoSimulacao> {
    const fluxo = await this.fluxos.fluxoPorId(fluxoId);
    if (!fluxo) throw new NotFoundException('fluxo não encontrado');

    const versao = dto.versaoId
      ? await this.fluxos.versaoPorId(dto.versaoId)
      : (await this.fluxos.rascunhoAtual(fluxoId)) ?? (await this.fluxos.publicadaAtual(fluxoId));
    if (!versao || versao.fluxoId !== fluxoId) {
      throw new NotFoundException('versão não encontrada para este fluxo');
    }

    const registroTipoEsperado = registroTipoDoGatilho(versao.gatilhoTipo);
    if (registroTipoEsperado !== dto.registroTipo) {
      return { gatilhoCompativel: false, condicaoSatisfeita: false, acoesQueSeriamDisparadas: [] };
    }

    const dadosContexto = await this.contexto.montar(dto.registroTipo, dto.registroId);
    if (!dadosContexto) throw new NotFoundException('registro não encontrado');

    const condicaoSatisfeita = avaliarCondicao(
      versao.condicoes as unknown as CondicaoNo,
      dadosContexto,
    );
    const acoes = versao.acoes as unknown as AcaoFluxo[];
    return {
      gatilhoCompativel: true,
      condicaoSatisfeita,
      acoesQueSeriamDisparadas: condicaoSatisfeita ? acoes : [],
    };
  }
}
