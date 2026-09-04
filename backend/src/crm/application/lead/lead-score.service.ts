import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { agoraUtc } from '../../../core/core.module';
import { calcularScore } from '../../domain/lead/scoring';
import type { EstadoScoreLead } from '../../domain/lead/tipos';
import { INCLUDE_TAGS, LeadRepository, type LeadRow } from '../../infra/lead/lead.repository';
import { CrmLeadAuditService } from './crm-lead-audit.service';

export function montarEstadoScore(l: LeadRow): EstadoScoreLead {
  return {
    temEmail: !!l.email,
    temTelefone: !!l.telefone,
    temDocumento: !!l.documento,
    temUtm: !!(l.utmSource || l.utmMedium || l.utmCampaign || l.utmTerm || l.utmContent),
    origem: l.origem,
    estagio: l.estagio,
    criadoEm: l.criadoEm.toISOString(),
    qtdInteracoes: 0, // TODO: ligar à contagem real de `interacao` (spec 010+)
    ultimaInteracaoEm: null,
    qtdTags: l.tagAssociacoes.length,
  };
}

@Injectable()
export class LeadScoreService {
  constructor(
    private readonly repo: LeadRepository,
    private readonly audit: CrmLeadAuditService,
  ) {}

  /**
   * Recalcula o `score` de um lead a partir do estado. Idempotente: se o valor
   * não muda, não escreve nem audita. Aceita um `tx` para recálculo inline pós
   * escrita (mesma transação).
   */
  async recalcular(
    lead: LeadRow,
    autor: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const novo = calcularScore(montarEstadoScore(lead));
    if (novo === lead.score) return lead.score;
    await this.repo.atualizar(
      lead.id,
      { score: novo, scoreAtualizadoEm: agoraUtc() },
      tx,
    );
    await this.audit.registrar({
      autor,
      entidade: 'lead',
      entidadeId: lead.id,
      campo: 'score',
      valorAnterior: lead.score,
      valorNovo: novo,
      motivo: 'recalculo',
    });
    return novo;
  }

  async recalcularPorId(id: string, autor: string): Promise<{ score: number }> {
    const lead = await this.repo.porId(id);
    if (!lead) return { score: 0 };
    return { score: await this.recalcular(lead, autor) };
  }

  /**
   * Recálculo em lote, paginado por `id` asc, cada página numa iteração. Devolve
   * o cursor para retomar e quantos scores mudaram. Idempotente (2ª passada → 0).
   */
  async recalcularLote(
    cursor: string | undefined,
    tamanho: number,
    autor: string,
  ): Promise<{ processados: number; alterados: number; proximoCursor: string | null }> {
    const rows = await this.repo.client.lead.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: 'asc' },
      take: tamanho,
      include: INCLUDE_TAGS,
    });
    let alterados = 0;
    for (const lead of rows) {
      const antes = lead.score;
      const depois = await this.recalcular(lead, autor);
      if (depois !== antes) alterados++;
    }
    return {
      processados: rows.length,
      alterados,
      proximoCursor: rows.length === tamanho ? rows[rows.length - 1].id : null,
    };
  }
}
