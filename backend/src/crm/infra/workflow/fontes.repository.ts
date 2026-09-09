import { Injectable } from '@nestjs/common';
import { FluxoGatilhoTipo } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PosicaoCursor } from './cursor.repository';

/** Uma linha já normalizada de uma trilha-fonte append-only (D-02). */
export interface LinhaFonte {
  id: string;
  criadoEm: Date;
  /** id do lead ou da oportunidade afetado — nunca da própria linha-fonte. */
  registroId: string;
}

function apos(cursor: PosicaoCursor | null): { OR?: object[] } {
  if (!cursor) return {};
  return {
    OR: [
      { criadoEm: { gt: cursor.ultimoCriadoEm } },
      { criadoEm: cursor.ultimoCriadoEm, id: { gt: cursor.ultimoId } },
    ],
  };
}

/**
 * Leitura das 5 trilhas-fonte já append-only do próprio `crm` (D-02) — nunca
 * de outro bounded context. `FONTES_REAIS` é a lista varrida pelo worker;
 * `EVENTO_EXTERNO` nunca aparece aqui (D-R8).
 */
export const FONTES_REAIS = [
  'LEAD_CRIADO',
  'LEAD_ESTAGIO_MUDOU',
  'OPORTUNIDADE_ETAPA_MUDOU',
  'INTERACAO_REGISTRADA',
  'TAG_APLICADA',
] as const satisfies readonly Exclude<FluxoGatilhoTipo, 'EVENTO_EXTERNO'>[];

@Injectable()
export class FontesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async linhasDesde(
    fonte: (typeof FONTES_REAIS)[number],
    cursor: PosicaoCursor | null,
    limite: number,
  ): Promise<LinhaFonte[]> {
    switch (fonte) {
      case 'LEAD_CRIADO':
        return this.linhasAuditoriaLead('criado', cursor, limite);
      case 'LEAD_ESTAGIO_MUDOU':
        return this.linhasAuditoriaLead('estagio', cursor, limite);
      case 'OPORTUNIDADE_ETAPA_MUDOU':
        return this.linhasMovimentacaoOportunidade(cursor, limite);
      case 'INTERACAO_REGISTRADA':
        return this.linhasInteracao(cursor, limite);
      case 'TAG_APLICADA':
        return this.linhasTagAssociacao(cursor, limite);
    }
  }

  private async linhasAuditoriaLead(
    campo: 'criado' | 'estagio',
    cursor: PosicaoCursor | null,
    limite: number,
  ): Promise<LinhaFonte[]> {
    const rows = await this.prisma.crmLeadAudit.findMany({
      where: { entidade: 'lead', campo, ...apos(cursor) },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      take: limite,
      select: { id: true, criadoEm: true, entidadeId: true },
    });
    return rows.map((r) => ({ id: r.id, criadoEm: r.criadoEm, registroId: r.entidadeId }));
  }

  private async linhasMovimentacaoOportunidade(
    cursor: PosicaoCursor | null,
    limite: number,
  ): Promise<LinhaFonte[]> {
    const rows = await this.prisma.oportunidadeMovimentacao.findMany({
      where: { ...apos(cursor) },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      take: limite,
      select: { id: true, criadoEm: true, oportunidadeId: true },
    });
    return rows.map((r) => ({ id: r.id, criadoEm: r.criadoEm, registroId: r.oportunidadeId }));
  }

  private async linhasInteracao(
    cursor: PosicaoCursor | null,
    limite: number,
  ): Promise<LinhaFonte[]> {
    const rows = await this.prisma.interacao.findMany({
      where: { leadId: { not: null }, ...apos(cursor) },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      take: limite,
      select: { id: true, criadoEm: true, leadId: true },
    });
    return rows
      .filter((r): r is typeof r & { leadId: string } => r.leadId != null)
      .map((r) => ({ id: r.id, criadoEm: r.criadoEm, registroId: r.leadId }));
  }

  private async linhasTagAssociacao(
    cursor: PosicaoCursor | null,
    limite: number,
  ): Promise<LinhaFonte[]> {
    const rows = await this.prisma.tagAssociacao.findMany({
      where: { leadId: { not: null }, ...apos(cursor) },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      take: limite,
      select: { id: true, criadoEm: true, leadId: true },
    });
    return rows
      .filter((r): r is typeof r & { leadId: string } => r.leadId != null)
      .map((r) => ({ id: r.id, criadoEm: r.criadoEm, registroId: r.leadId }));
  }
}
