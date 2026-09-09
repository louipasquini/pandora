import { Injectable, NotFoundException } from '@nestjs/common';
import type { AcaoFluxo, CondicaoNo } from '../../domain/workflow';
import { ModeloRepository } from '../../infra/workflow/modelo.repository';
import { FluxoRepository } from '../../infra/workflow/fluxo.repository';
import { projetarVersao } from './fluxo.service';

/** Biblioteca de automações prontas (CL-02, US4) — clonar nunca afeta o modelo original. */
@Injectable()
export class ModeloService {
  constructor(
    private readonly modelos: ModeloRepository,
    private readonly fluxos: FluxoRepository,
  ) {}

  async listar() {
    return this.modelos.listar();
  }

  async usarComoBase(modeloId: string, dto: { nome: string; descricao?: string }, autor: string) {
    const modelo = await this.modelos.porId(modeloId);
    if (!modelo) throw new NotFoundException('modelo não encontrado');

    const { fluxo, versao } = await this.fluxos.criarComRascunho({
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      criadoPor: autor,
      gatilhoTipo: modelo.gatilhoTipo,
      condicoes: modelo.condicoes as unknown as CondicaoNo,
      acoes: modelo.acoes as unknown as AcaoFluxo[],
    });
    return {
      id: fluxo.id,
      nome: fluxo.nome,
      descricao: fluxo.descricao,
      criadoEm: fluxo.criadoEm,
      versaoRascunho: projetarVersao(versao),
    };
  }
}
