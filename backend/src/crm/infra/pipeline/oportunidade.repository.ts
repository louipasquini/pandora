import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type OportunidadeRow = Prisma.OportunidadeGetPayload<{
  include: { etapa: true; pipeline: true };
}>;

export interface PaginacaoOpts {
  pagina: number;
  tamanho: number;
}

@Injectable()
export class OportunidadeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async pessoaExiste(id: string): Promise<boolean> {
    return (await this.prisma.pessoa.count({ where: { id } })) > 0;
  }

  async leadExiste(id: string): Promise<boolean> {
    return (await this.prisma.lead.count({ where: { id } })) > 0;
  }

  /** `origem` do lead (para a regra de atribuição `ORIGEM`, FR-015) — `null` se não houver. */
  async origemDoLead(id: string): Promise<string | null> {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { origem: true } });
    return lead?.origem ?? null;
  }

  porId(id: string): Promise<OportunidadeRow | null> {
    return this.prisma.oportunidade.findUnique({
      where: { id },
      include: { etapa: true, pipeline: true },
    });
  }

  async criar(
    data: Omit<Prisma.OportunidadeUncheckedCreateInput, 'id'>,
  ): Promise<OportunidadeRow> {
    const row = await this.prisma.oportunidade.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
    return this.porId(row.id) as Promise<OportunidadeRow>;
  }

  async atualizarCampos(
    id: string,
    data: Prisma.OportunidadeUncheckedUpdateInput,
  ): Promise<OportunidadeRow> {
    await this.prisma.oportunidade.update({ where: { id }, data });
    return this.porId(id) as Promise<OportunidadeRow>;
  }

  async listar(
    where: Prisma.OportunidadeWhereInput,
    opts: PaginacaoOpts,
  ): Promise<{ itens: OportunidadeRow[]; total: number }> {
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.oportunidade.findMany({
        where,
        include: { etapa: true, pipeline: true },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (opts.pagina - 1) * opts.tamanho,
        take: opts.tamanho,
      }),
      this.prisma.oportunidade.count({ where }),
    ]);
    return { itens, total };
  }

  /** Oportunidades de uma pessoa: diretas ∪ das de todo lead convertido nela (D-01). */
  listarPorPessoa(pessoaId: string): Promise<OportunidadeRow[]> {
    return this.prisma.oportunidade.findMany({
      where: { OR: [{ pessoaId }, { lead: { pessoaId } }] },
      include: { etapa: true, pipeline: true },
      orderBy: [{ criadoEm: 'desc' }],
    });
  }

  listarPorLead(leadId: string): Promise<OportunidadeRow[]> {
    return this.prisma.oportunidade.findMany({
      where: { leadId },
      include: { etapa: true, pipeline: true },
      orderBy: [{ criadoEm: 'desc' }],
    });
  }

  /** Última `interacao.ocorridoEm` por pessoa (batch — evita N+1). */
  async ultimaInteracaoPorPessoas(pessoaIds: string[]): Promise<Map<string, Date>> {
    if (pessoaIds.length === 0) return new Map();
    const rows = await this.prisma.interacao.groupBy({
      by: ['pessoaId'],
      where: { pessoaId: { in: pessoaIds } },
      _max: { ocorridoEm: true },
    });
    return new Map(
      rows
        .filter((r) => r.pessoaId && r._max.ocorridoEm)
        .map((r) => [r.pessoaId as string, r._max.ocorridoEm as Date]),
    );
  }

  /** Última `interacao.ocorridoEm` por lead (batch). */
  async ultimaInteracaoPorLeads(leadIds: string[]): Promise<Map<string, Date>> {
    if (leadIds.length === 0) return new Map();
    const rows = await this.prisma.interacao.groupBy({
      by: ['leadId'],
      where: { leadId: { in: leadIds } },
      _max: { ocorridoEm: true },
    });
    return new Map(
      rows
        .filter((r) => r.leadId && r._max.ocorridoEm)
        .map((r) => [r.leadId as string, r._max.ocorridoEm as Date]),
    );
  }

  /** Métricas: agregação por [etapaId, moeda], respeitando o escopo já resolvido. */
  async agruparPorEtapaEMoeda(
    where: Prisma.OportunidadeWhereInput,
  ): Promise<{ etapaId: string; moeda: string; quantidade: number; somaValorInt: bigint }[]> {
    const rows = await this.prisma.oportunidade.groupBy({
      by: ['etapaId', 'valorEstimadoMoeda'],
      where,
      _count: { _all: true },
      _sum: { valorEstimadoInt: true },
    });
    return rows.map((r) => ({
      etapaId: r.etapaId,
      moeda: r.valorEstimadoMoeda,
      quantidade: r._count._all,
      somaValorInt: r._sum.valorEstimadoInt ?? 0n,
    }));
  }

  /** `entrouEtapaEm` de toda oportunidade ainda em etapa ABERTA, no escopo dado. */
  async entradasEmEtapasAbertas(
    where: Prisma.OportunidadeWhereInput,
  ): Promise<{ etapaId: string; entrouEtapaEm: Date }[]> {
    const rows = await this.prisma.oportunidade.findMany({
      where: { AND: [where, { etapa: { tipo: 'ABERTA' } }] },
      select: { etapaId: true, entrouEtapaEm: true },
    });
    return rows;
  }

  /** Todas as oportunidades ABERTA diretamente ancoradas na pessoa (porta de pagamento). */
  oportunidadesAbertasDaPessoa(pessoaId: string) {
    return this.prisma.oportunidade.findMany({
      where: { pessoaId, etapa: { tipo: 'ABERTA' } },
      include: { etapa: true, pipeline: { include: { etapas: true } } },
    });
  }
}
