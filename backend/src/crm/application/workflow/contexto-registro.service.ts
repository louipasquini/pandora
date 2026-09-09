import { Injectable } from '@nestjs/common';
import type { FluxoRegistroTipo } from '@prisma/client';
import { LeadRepository } from '../../infra/lead/lead.repository';
import { OportunidadeRepository } from '../../infra/pipeline/oportunidade.repository';

/**
 * Monta o contexto de avaliação de condição a partir do estado **atual** do
 * registro (research.md D-R2) — reaproveitado tanto pelo worker (execução
 * real) quanto pela simulação (T016), para as duas nunca divergirem no que
 * uma condição "vê". Catálogo de campos fechado por gatilho — ver
 * `crm/domain/workflow/catalogo-gatilho.ts`.
 */
@Injectable()
export class ContextoRegistroService {
  constructor(
    private readonly leads: LeadRepository,
    private readonly oportunidades: OportunidadeRepository,
  ) {}

  async montar(
    registroTipo: FluxoRegistroTipo,
    registroId: string,
  ): Promise<Record<string, unknown> | null> {
    if (registroTipo === 'LEAD') {
      const lead = await this.leads.porId(registroId);
      if (!lead) return null;
      return {
        estagio: lead.estagio,
        status: lead.status,
        origem: lead.origem,
        temResponsavel: lead.responsavelId != null,
        tags: lead.tagAssociacoes.map((a) => a.tag.slug),
        score: lead.score,
      };
    }

    const oportunidade = await this.oportunidades.porId(registroId);
    if (!oportunidade) return null;
    return {
      etapaTipo: oportunidade.etapa.tipo,
      pipelineId: oportunidade.pipelineId,
      valorEstimadoMoeda: oportunidade.valorEstimadoMoeda,
      temResponsavel: oportunidade.responsavelId != null,
    };
  }
}
