import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Consultas agregadas do dashboard (spec 017, D-02 / research.md D-R3) — cada
 * método é um `count`/`groupBy`/`findMany`+agregação sobre o estado atual das
 * entidades do `crm`, a cada request. **Nenhum estado, nenhum cache, nenhuma
 * tabela de rollup** (Princípio V). O `where` de escopo já vem resolvido pelo
 * `*ConsultaService` do recurso (010/012/008/016) e é só combinado aqui.
 */
@Injectable()
export class DashboardMetricaRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- leads
  contarLeads(where: Prisma.LeadWhereInput, de: Date, ate: Date): Promise<number> {
    return this.prisma.lead.count({
      where: { AND: [where, { criadoEm: { gte: de, lte: ate } }] },
    });
  }

  async leadsPorOrigem(
    where: Prisma.LeadWhereInput,
    de: Date,
    ate: Date,
  ): Promise<{ origem: string; leads: number; convertidos: number }[]> {
    const rows = await this.prisma.lead.findMany({
      where: { AND: [where, { criadoEm: { gte: de, lte: ate } }] },
      select: { origem: true, status: true, convertidoEm: true },
    });
    const mapa = new Map<string, { leads: number; convertidos: number }>();
    for (const r of rows) {
      const origem = r.origem ?? '(sem origem)';
      const atual = mapa.get(origem) ?? { leads: 0, convertidos: 0 };
      atual.leads += 1;
      if (r.status === 'CONVERTIDO' || r.convertidoEm) atual.convertidos += 1;
      mapa.set(origem, atual);
    }
    return [...mapa.entries()]
      .map(([origem, v]) => ({ origem, ...v }))
      .sort((a, b) => b.leads - a.leads);
  }

  async leadsCriadosDatas(
    where: Prisma.LeadWhereInput,
    de: Date,
    ate: Date,
  ): Promise<Date[]> {
    const rows = await this.prisma.lead.findMany({
      where: { AND: [where, { criadoEm: { gte: de, lte: ate } }] },
      select: { criadoEm: true },
    });
    return rows.map((r) => r.criadoEm);
  }

  // -------------------------------------------------------- oportunidades
  contarOportunidadesCriadas(
    where: Prisma.OportunidadeWhereInput,
    de: Date,
    ate: Date,
  ): Promise<number> {
    return this.prisma.oportunidade.count({
      where: { AND: [where, { criadoEm: { gte: de, lte: ate } }] },
    });
  }

  async oportunidadesCriadasDatas(
    where: Prisma.OportunidadeWhereInput,
    de: Date,
    ate: Date,
  ): Promise<Date[]> {
    const rows = await this.prisma.oportunidade.findMany({
      where: { AND: [where, { criadoEm: { gte: de, lte: ate } }] },
      select: { criadoEm: true },
    });
    return rows.map((r) => r.criadoEm);
  }

  /**
   * Movimentações que **entraram** numa etapa do tipo dado, no período, dentro
   * do escopo de oportunidades. Uma linha por movimentação (o chamador dedupe
   * por `oportunidadeId` quando quer "quantas oportunidades").
   */
  async movimentacoesParaTipo(
    where: Prisma.OportunidadeWhereInput,
    tipo: 'GANHA' | 'PERDIDA',
    de: Date,
    ate: Date,
  ): Promise<
    {
      oportunidadeId: string;
      responsavelId: string | null;
      valorEstimadoInt: bigint;
      valorEstimadoMoeda: string;
      criadoEm: Date;
    }[]
  > {
    const rows = await this.prisma.oportunidadeMovimentacao.findMany({
      where: {
        AND: [
          { etapaNova: { tipo } },
          { criadoEm: { gte: de, lte: ate } },
          { oportunidade: where },
        ],
      },
      select: {
        oportunidadeId: true,
        criadoEm: true,
        oportunidade: {
          select: { responsavelId: true, valorEstimadoInt: true, valorEstimadoMoeda: true },
        },
      },
      orderBy: { criadoEm: 'asc' },
    });
    return rows.map((r) => ({
      oportunidadeId: r.oportunidadeId,
      responsavelId: r.oportunidade.responsavelId,
      valorEstimadoInt: r.oportunidade.valorEstimadoInt,
      valorEstimadoMoeda: r.oportunidade.valorEstimadoMoeda,
      criadoEm: r.criadoEm,
    }));
  }

  /** Valor em aberto (etapa `ABERTA`) por moeda — nunca soma moedas. */
  async valorEmAbertoPorMoeda(
    where: Prisma.OportunidadeWhereInput,
  ): Promise<{ moeda: string; valorInt: bigint }[]> {
    const rows = await this.prisma.oportunidade.groupBy({
      by: ['valorEstimadoMoeda'],
      where: { AND: [where, { etapa: { tipo: 'ABERTA' } }] },
      _sum: { valorEstimadoInt: true },
    });
    return rows.map((r) => ({
      moeda: r.valorEstimadoMoeda,
      valorInt: r._sum.valorEstimadoInt ?? 0n,
    }));
  }

  /** Funil: etapas do pipeline + agregação por [etapa, moeda] + tempo médio nas abertas. */
  async funil(where: Prisma.OportunidadeWhereInput, pipelineId: string) {
    const etapas = await this.prisma.etapaPipeline.findMany({
      where: { pipelineId },
      orderBy: { ordem: 'asc' },
      select: { id: true, nome: true, tipo: true },
    });
    const escopo: Prisma.OportunidadeWhereInput = { AND: [where, { pipelineId }] };
    const grupos = await this.prisma.oportunidade.groupBy({
      by: ['etapaId', 'valorEstimadoMoeda'],
      where: escopo,
      _count: { _all: true },
      _sum: { valorEstimadoInt: true },
    });
    const abertas = await this.prisma.oportunidade.findMany({
      where: { AND: [escopo, { etapa: { tipo: 'ABERTA' } }] },
      select: { etapaId: true, entrouEtapaEm: true },
    });
    return {
      etapas,
      grupos: grupos.map((g) => ({
        etapaId: g.etapaId,
        moeda: g.valorEstimadoMoeda,
        quantidade: g._count._all,
        somaValorInt: g._sum.valorEstimadoInt ?? 0n,
      })),
      abertas,
    };
  }

  async pipelinePadrao(): Promise<string | null> {
    const p = await this.prisma.pipeline.findFirst({
      orderBy: { criadoEm: 'asc' },
      select: { id: true },
    });
    return p?.id ?? null;
  }

  async pipelineExiste(id: string): Promise<boolean> {
    return (await this.prisma.pipeline.count({ where: { id } })) > 0;
  }

  // --------------------------------------------------------------- tarefas
  async tarefasConcluidas(
    where: Prisma.TarefaWhereInput,
    de: Date,
    ate: Date,
  ): Promise<
    {
      responsavelId: string | null;
      dataVencimento: Date | null;
      concluidoEm: Date | null;
      totalChecklist: number;
      checklistConcluidos: number;
    }[]
  > {
    const rows = await this.prisma.tarefa.findMany({
      where: {
        AND: [where, { status: 'CONCLUIDA' }, { concluidoEm: { gte: de, lte: ate } }],
      },
      select: {
        responsavelId: true,
        dataVencimento: true,
        concluidoEm: true,
        checklist: { select: { concluido: true } },
      },
    });
    return rows.map((r) => ({
      responsavelId: r.responsavelId,
      dataVencimento: r.dataVencimento,
      concluidoEm: r.concluidoEm,
      totalChecklist: r.checklist.length,
      checklistConcluidos: r.checklist.filter((c) => c.concluido).length,
    }));
  }

  // ------------------------------------------------------------ atendimento
  async atendimentosComPrimeiraResposta(
    where: Prisma.AtendimentoWhereInput,
    de: Date,
    ate: Date,
  ): Promise<
    {
      abertoEm: Date;
      primeiraRespostaEm: Date;
      slaMinutos: number;
      atendenteAtualId: string | null;
    }[]
  > {
    const rows = await this.prisma.atendimento.findMany({
      where: { AND: [where, { primeiraRespostaEm: { gte: de, lte: ate } }] },
      select: {
        abertoEm: true,
        primeiraRespostaEm: true,
        slaMinutos: true,
        atendenteAtualId: true,
      },
    });
    return rows
      .filter((r): r is typeof r & { primeiraRespostaEm: Date } => r.primeiraRespostaEm != null)
      .map((r) => ({
        abertoEm: r.abertoEm,
        primeiraRespostaEm: r.primeiraRespostaEm,
        slaMinutos: r.slaMinutos,
        atendenteAtualId: r.atendenteAtualId,
      }));
  }

  contarAtendimentos(
    where: Prisma.AtendimentoWhereInput,
    campo: 'abertoEm' | 'encerradoEm',
    de: Date,
    ate: Date,
  ): Promise<number> {
    return this.prisma.atendimento.count({
      where: { AND: [where, { [campo]: { gte: de, lte: ate } }] },
    });
  }

  async atendimentosDatas(
    where: Prisma.AtendimentoWhereInput,
    de: Date,
    ate: Date,
  ): Promise<{ abertos: Date[]; encerrados: Date[] }> {
    const [abertos, encerrados] = await Promise.all([
      this.prisma.atendimento.findMany({
        where: { AND: [where, { abertoEm: { gte: de, lte: ate } }] },
        select: { abertoEm: true },
      }),
      this.prisma.atendimento.findMany({
        where: { AND: [where, { encerradoEm: { gte: de, lte: ate } }] },
        select: { encerradoEm: true },
      }),
    ]);
    return {
      abertos: abertos.map((r) => r.abertoEm),
      encerrados: encerrados.map((r) => r.encerradoEm as Date),
    };
  }

  /** Notas de CSAT: `interacao` tipo `NPS` ligada a um atendimento no escopo. */
  async notasCsat(
    where: Prisma.AtendimentoWhereInput,
    de: Date,
    ate: Date,
  ): Promise<number[]> {
    const rows = await this.prisma.interacao.findMany({
      where: {
        tipo: 'NPS',
        notaNps: { not: null },
        ocorridoEm: { gte: de, lte: ate },
        atendimento: { is: where },
      },
      select: { notaNps: true },
    });
    return rows.map((r) => r.notaNps as number);
  }

  // ----------------------------------------------------------------- nomes
  async nomesDeUsuarios(ids: string[]): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (unicos.length === 0) return new Map();
    const rows = await this.prisma.usuario.findMany({
      where: { id: { in: unicos } },
      select: { id: true, nome: true },
    });
    return new Map(rows.map((r) => [r.id, r.nome]));
  }

  // ------------------------------------------------------ existência de escopo
  async equipeExiste(id: string): Promise<boolean> {
    return (await this.prisma.equipe.count({ where: { id } })) > 0;
  }

  async usuarioExiste(id: string): Promise<boolean> {
    return (await this.prisma.usuario.count({ where: { id } })) > 0;
  }

  /** Ids das equipes ativas em que `usuarioId` é membro ativo. */
  async equipesDoUsuario(usuarioId: string): Promise<string[]> {
    const rows = await this.prisma.equipeMembro.findMany({
      where: { usuarioId, saiuEm: null },
      select: { equipeId: true },
    });
    return rows.map((r) => r.equipeId);
  }

  /** Ids dos usuários que são membros ativos da equipe (filtro `equipeId` do dashboard). */
  async membrosDaEquipe(equipeId: string): Promise<string[]> {
    const rows = await this.prisma.equipeMembro.findMany({
      where: { equipeId, saiuEm: null },
      select: { usuarioId: true },
    });
    return [...new Set(rows.map((r) => r.usuarioId))];
  }
}
