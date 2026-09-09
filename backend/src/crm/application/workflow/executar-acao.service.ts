import { Injectable } from '@nestjs/common';
import type { LeadEstagio } from '@prisma/client';
import type { AcaoFluxo } from '../../domain/workflow';
import { validarMovimento } from '../../domain/pipeline';
import { LeadRepository } from '../../infra/lead/lead.repository';
import { OportunidadeRepository } from '../../infra/pipeline/oportunidade.repository';
import { PipelineRepository } from '../../infra/pipeline/pipeline.repository';
import { MovimentacaoRepository } from '../../infra/pipeline/movimentacao.repository';
import { CrmLeadAuditService } from '../lead/crm-lead-audit.service';
import { LeadScoreService } from '../lead/lead-score.service';
import { TagService } from '../tag/tag.service';
import { RegistrarInteracaoService } from '../interacao/registrar-interacao.service';

/** Ator do sistema para toda ação disparada pelo Workflow (D-05 do plan.md). */
export const ATOR_WORKFLOW = 'sistema:workflow';

/**
 * Dispatch por `AcaoFluxo.tipo` (T018) — cada executor chama **exatamente**
 * o mesmo serviço já existente que uma ação manual equivalente usaria
 * (008/009/010), nunca um caminho de escrita paralelo. Lança em caso de
 * falha; o chamador (`WorkerService`) captura e marca a ação como `falhou`,
 * sem derrubar o restante da passada (research.md D-R6).
 */
@Injectable()
export class ExecutarAcaoService {
  constructor(
    private readonly leads: LeadRepository,
    private readonly leadAudit: CrmLeadAuditService,
    private readonly leadScore: LeadScoreService,
    private readonly tags: TagService,
    private readonly interacoes: RegistrarInteracaoService,
    private readonly oportunidades: OportunidadeRepository,
    private readonly pipelines: PipelineRepository,
    private readonly movimentacoes: MovimentacaoRepository,
  ) {}

  async executar(acao: AcaoFluxo, registroId: string, fluxoVersaoId: string): Promise<void> {
    switch (acao.tipo) {
      case 'MOVER_LEAD_ESTAGIO':
        return this.moverLeadEstagio(registroId, acao.estagioDestino);
      case 'APLICAR_TAG':
        await this.tags.associar({ tipo: 'lead', id: registroId }, acao.tag, null, ATOR_WORKFLOW);
        return;
      case 'REMOVER_TAG':
        await this.tags.desassociar({ tipo: 'lead', id: registroId }, acao.tag, ATOR_WORKFLOW);
        return;
      case 'REGISTRAR_NOTA':
        await this.interacoes.registrar(
          { leadId: registroId, tipo: 'NOTA', conteudo: acao.conteudo, autorId: null },
          { canalOrigem: `workflow:${fluxoVersaoId}`, idExterno: registroId },
        );
        return;
      case 'MOVER_OPORTUNIDADE_ETAPA':
        return this.moverOportunidadeEtapa(registroId, acao.etapaDestinoId, acao.motivo ?? null);
    }
  }

  private async moverLeadEstagio(leadId: string, estagioDestino: LeadEstagio): Promise<void> {
    const lead = await this.leads.porId(leadId);
    if (!lead) throw new Error(`lead ${leadId} não encontrado`);
    if (lead.estagio === estagioDestino) return; // no-op idempotente

    const antes = { estagio: lead.estagio };
    const atualizado = await this.leads.atualizar(leadId, { estagio: estagioDestino });
    await this.leadAudit.registrar({
      autor: ATOR_WORKFLOW,
      entidade: 'lead',
      entidadeId: leadId,
      campo: 'estagio',
      valorAnterior: antes,
      valorNovo: { estagio: estagioDestino },
      motivo: 'estagio',
    });
    await this.leadScore.recalcular(atualizado, ATOR_WORKFLOW);
  }

  private async moverOportunidadeEtapa(
    oportunidadeId: string,
    etapaDestinoId: string,
    motivo: string | null,
  ): Promise<void> {
    const oportunidade = await this.oportunidades.porId(oportunidadeId);
    if (!oportunidade) throw new Error(`oportunidade ${oportunidadeId} não encontrada`);
    const destino = await this.pipelines.etapaPorId(etapaDestinoId);
    if (!destino) throw new Error(`etapa destino ${etapaDestinoId} não encontrada`);

    const resultado = validarMovimento({
      etapaAtual: {
        id: oportunidade.etapaId,
        pipelineId: oportunidade.pipelineId,
        tipo: oportunidade.etapa.tipo,
      },
      etapaDestino: { id: destino.id, pipelineId: destino.pipelineId, tipo: destino.tipo },
      motivo,
    });
    if (!resultado.ok) throw new Error(`movimento inválido: ${resultado.erro}`);
    if (resultado.noop) return; // já está na etapa destino

    await this.movimentacoes.mover({
      oportunidadeId,
      etapaAnteriorId: oportunidade.etapaId,
      etapaNovaId: destino.id,
      movidoPorId: null,
      motivo,
    });
  }
}
