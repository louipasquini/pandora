import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { agoraUtc } from '../../../core/core.module';
import { agregarMetricas } from '../../domain/pipeline';
import { PipelineRepository } from '../../infra/pipeline';
import { OportunidadeRepository } from '../../infra/pipeline/oportunidade.repository';
import { OportunidadeConsultaService } from './oportunidade-consulta.service';

/**
 * `GET /crm/pipelines/:id/metricas` (spec 010, US6, D-04/FR-021). Sempre
 * derivado — `groupBy` do Prisma por `[etapaId, moeda]`, nunca contador
 * persistido. Respeita o escopo de visão do sujeito (`ver_proprias` agrega
 * só as próprias oportunidades — FR-022).
 */
@Injectable()
export class MetricasService {
  constructor(
    private readonly pipelines: PipelineRepository,
    private readonly oportunidades: OportunidadeRepository,
    private readonly consulta: OportunidadeConsultaService,
  ) {}

  async metricas(pipelineId: string, req: Request) {
    if (!(await this.pipelines.porId(pipelineId))) {
      throw new NotFoundException('pipeline não encontrado');
    }
    const escopo = await this.consulta.escopoDe(req);
    const where: Prisma.OportunidadeWhereInput = { AND: [escopo, { pipelineId }] };

    const etapas = await this.pipelines.etapasDoPipeline(pipelineId);
    const linhas = await this.oportunidades.agruparPorEtapaEMoeda(where);
    const abertas = await this.oportunidades.entradasEmEtapasAbertas(where);

    const agora = agoraUtc();
    const somaPorEtapa = new Map<string, { totalHoras: number; quantidade: number }>();
    for (const a of abertas) {
      const horas = (agora.getTime() - a.entrouEtapaEm.getTime()) / (1000 * 60 * 60);
      const atual = somaPorEtapa.get(a.etapaId) ?? { totalHoras: 0, quantidade: 0 };
      atual.totalHoras += horas;
      atual.quantidade += 1;
      somaPorEtapa.set(a.etapaId, atual);
    }
    const tempoMedioPorEtapa = [...somaPorEtapa.entries()].map(([etapaId, v]) => ({
      etapaId,
      horas: v.totalHoras / v.quantidade,
    }));

    return agregarMetricas(
      etapas.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo })),
      linhas,
      tempoMedioPorEtapa,
    );
  }
}
