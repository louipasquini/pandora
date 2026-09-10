import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { agoraUtc } from '../../../core/core.module';
import {
  agregarMetricas,
  type TipoEtapa,
  type LinhaGroupBy,
} from '../../domain/pipeline';
import { calcularPontosTarefa } from '../../domain/tarefa';
import {
  agruparEmBuckets,
  calcularDelta,
  combinarRankingComercial,
  type Delta,
  type GanhasPorResponsavel,
  type PeriodoResolvido,
  type PontoDatado,
} from '../../domain/dashboard';
import { DashboardMetricaRepository } from '../../infra/dashboard';
import { LeadConsultaService } from '../lead/lead-consulta.service';
import { OportunidadeConsultaService } from '../pipeline/oportunidade-consulta.service';
import { TarefaConsultaService } from '../tarefa/tarefa-consulta.service';
import { AtendimentoConsultaService } from '../atendimento/atendimento-consulta.service';

export interface FiltrosDashboard {
  equipeId?: string;
  responsavelId?: string;
  pipelineId?: string;
}

interface EscoposResolvidos {
  lead: Prisma.LeadWhereInput;
  oportunidade: Prisma.OportunidadeWhereInput;
  tarefa: Prisma.TarefaWhereInput;
  atendimento: Prisma.AtendimentoWhereInput;
}

const MS_MIN = 60_000;

/**
 * Um método por painel (spec 017, US1–US3 / FR-005..FR-009 / D-02/D-03). Cada
 * método resolve o `where` de escopo pelo `*ConsultaService` do recurso que
 * agrega — o dashboard **nunca amplia** o que o sujeito já vê — combina com o
 * filtro de período/equipe/responsável/pipeline e chama o
 * `DashboardMetricaRepository`. Toda métrica é `f(estado) -> valor` na hora da
 * leitura (Princípio V) — nenhum contador persistido.
 */
@Injectable()
export class PaineisService {
  constructor(
    private readonly repo: DashboardMetricaRepository,
    private readonly leadConsulta: LeadConsultaService,
    private readonly oportunidadeConsulta: OportunidadeConsultaService,
    private readonly tarefaConsulta: TarefaConsultaService,
    private readonly atendimentoConsulta: AtendimentoConsultaService,
  ) {}

  // ------------------------------------------------------------- escopos
  async resolverEscopos(req: Request, filtros: FiltrosDashboard): Promise<EscoposResolvidos> {
    // Um sujeito só com `dashboard:ver` não tem escopo em lead/oportunidade/
    // tarefa/atendimento — `escopoDe` lança `Forbidden`. Aqui isso vira "não
    // enxerga nada" (`criadoEm < epoch`), não 500: a "visão geral" dele fica
    // zerada em vez de quebrar (FR-006/D-03).
    const NADA = { criadoEm: { lt: new Date(0) } } as const;
    const semEscopo = <T>(): Promise<T> => Promise.resolve(NADA as T);
    const [leadBase, oportunidadeBase, tarefaBase, atendimentoBase] = await Promise.all([
      this.leadConsulta.escopoDe(req).catch(() => semEscopo<Prisma.LeadWhereInput>()),
      this.oportunidadeConsulta
        .escopoDe(req)
        .catch(() => semEscopo<Prisma.OportunidadeWhereInput>()),
      this.tarefaConsulta.escopoDe(req).catch(() => semEscopo<Prisma.TarefaWhereInput>()),
      this.atendimentoConsulta
        .escopoDe(req)
        .catch(() => semEscopo<Prisma.AtendimentoWhereInput>()),
    ]);

    // `equipeId` → ids de usuário membros ativos; filtra por responsável nesse conjunto.
    let membros: string[] | null = null;
    if (filtros.equipeId) membros = await this.repo.membrosDaEquipe(filtros.equipeId);

    const responsavelIn = (col: 'responsavelId' | 'atendenteAtualId') => {
      const and: Record<string, unknown>[] = [];
      if (filtros.responsavelId) and.push({ [col]: filtros.responsavelId });
      if (membros) and.push({ [col]: { in: membros.length ? membros : ['__nenhum__'] } });
      return and;
    };

    return {
      lead: { AND: [leadBase, ...responsavelIn('responsavelId')] },
      oportunidade: { AND: [oportunidadeBase, ...responsavelIn('responsavelId')] },
      tarefa: { AND: [tarefaBase, ...responsavelIn('responsavelId')] },
      atendimento: {
        AND: [
          atendimentoBase,
          ...(filtros.equipeId ? [{ equipeId: filtros.equipeId }] : []),
          ...(filtros.responsavelId ? [{ atendenteAtualId: filtros.responsavelId }] : []),
        ],
      },
    };
  }

  // ---------------------------------------------------------- visao_geral
  async visaoGeral(req: Request, periodo: PeriodoResolvido, filtros: FiltrosDashboard) {
    const e = await this.resolverEscopos(req, filtros);
    const { de, ate, anteriorDe, anteriorAte } = periodo;

    const [
      leadsAtual,
      leadsAnt,
      oppCriadasAtual,
      oppCriadasAnt,
      ganhasAtual,
      ganhasAnt,
      perdidasAtual,
      perdidasAnt,
      valorEmAberto,
      tarefasAtual,
      tarefasAnt,
    ] = await Promise.all([
      this.repo.contarLeads(e.lead, de, ate),
      this.repo.contarLeads(e.lead, anteriorDe, anteriorAte),
      this.repo.contarOportunidadesCriadas(e.oportunidade, de, ate),
      this.repo.contarOportunidadesCriadas(e.oportunidade, anteriorDe, anteriorAte),
      this.oportunidadesDistintasEmTipo(e.oportunidade, 'GANHA', de, ate),
      this.oportunidadesDistintasEmTipo(e.oportunidade, 'GANHA', anteriorDe, anteriorAte),
      this.oportunidadesDistintasEmTipo(e.oportunidade, 'PERDIDA', de, ate),
      this.oportunidadesDistintasEmTipo(e.oportunidade, 'PERDIDA', anteriorDe, anteriorAte),
      this.repo.valorEmAbertoPorMoeda(e.oportunidade),
      this.repo.tarefasConcluidas(e.tarefa, de, ate),
      this.repo.tarefasConcluidas(e.tarefa, anteriorDe, anteriorAte),
    ]);

    const noPrazo = (rows: { dataVencimento: Date | null; concluidoEm: Date | null }[]) =>
      rows.filter(
        (r) =>
          r.dataVencimento &&
          r.concluidoEm &&
          r.concluidoEm.getTime() <= r.dataVencimento.getTime(),
      ).length;

    const denom = ganhasAtual.size + perdidasAtual.size;

    return {
      leadsNovos: calcularDelta(leadsAtual, leadsAnt),
      oportunidadesCriadas: calcularDelta(oppCriadasAtual, oppCriadasAnt),
      oportunidadesGanhas: calcularDelta(ganhasAtual.size, ganhasAnt.size),
      oportunidadesPerdidas: calcularDelta(perdidasAtual.size, perdidasAnt.size),
      valorEmAberto: valorEmAberto.map((v) => ({
        moeda: v.moeda,
        valorInt: v.valorInt.toString(),
      })),
      taxaConversao: denom === 0 ? null : ganhasAtual.size / denom,
      tarefasConcluidasNoPrazo: calcularDelta(noPrazo(tarefasAtual), noPrazo(tarefasAnt)),
    };
  }

  private async oportunidadesDistintasEmTipo(
    where: Prisma.OportunidadeWhereInput,
    tipo: 'GANHA' | 'PERDIDA',
    de: Date,
    ate: Date,
  ): Promise<Set<string>> {
    const rows = await this.repo.movimentacoesParaTipo(where, tipo, de, ate);
    return new Set(rows.map((r) => r.oportunidadeId));
  }

  // -------------------------------------------------------- funil_pipeline
  async funilPipeline(
    req: Request,
    periodo: PeriodoResolvido,
    filtros: FiltrosDashboard,
  ) {
    const e = await this.resolverEscopos(req, filtros);
    const pipelineId = filtros.pipelineId ?? (await this.repo.pipelinePadrao());
    if (!pipelineId) {
      return { pipelineId: null, porEtapa: [], taxaConversao: null };
    }

    const { etapas, grupos, abertas } = await this.repo.funil(e.oportunidade, pipelineId);

    const somaPorEtapa = new Map<string, { totalHoras: number; quantidade: number }>();
    const agora = agoraUtc();
    for (const a of abertas) {
      const horas = (agora.getTime() - a.entrouEtapaEm.getTime()) / (1000 * 60 * 60);
      const atual = somaPorEtapa.get(a.etapaId) ?? { totalHoras: 0, quantidade: 0 };
      atual.totalHoras += horas;
      atual.quantidade += 1;
      somaPorEtapa.set(a.etapaId, atual);
    }
    const tempoMedio = [...somaPorEtapa.entries()].map(([etapaId, v]) => ({
      etapaId,
      horas: v.totalHoras / v.quantidade,
    }));

    const linhas: LinhaGroupBy[] = grupos.map((g) => ({
      etapaId: g.etapaId,
      moeda: g.moeda,
      quantidade: g.quantidade,
      somaValorInt: g.somaValorInt,
    }));

    const metricas = agregarMetricas(
      etapas.map((x) => ({ id: x.id, nome: x.nome, tipo: x.tipo as TipoEtapa })),
      linhas,
      tempoMedio,
    );
    return { pipelineId, ...metricas };
  }

  // ---------------------------------------------------- ranking_comercial
  async rankingComercial(
    req: Request,
    periodo: PeriodoResolvido,
    filtros: FiltrosDashboard,
  ) {
    const e = await this.resolverEscopos(req, filtros);
    const { de, ate } = periodo;

    const [ganhasRows, perdidasRows, tarefas] = await Promise.all([
      this.repo.movimentacoesParaTipo(e.oportunidade, 'GANHA', de, ate),
      this.repo.movimentacoesParaTipo(e.oportunidade, 'PERDIDA', de, ate),
      this.repo.tarefasConcluidas(e.tarefa, de, ate),
    ]);

    const ganhasPorResp = new Map<string, GanhasPorResponsavel>();
    const vistas = new Set<string>();
    for (const r of ganhasRows) {
      if (vistas.has(r.oportunidadeId) || !r.responsavelId) continue;
      vistas.add(r.oportunidadeId);
      const g = ganhasPorResp.get(r.responsavelId) ?? {
        responsavelId: r.responsavelId,
        ganhas: 0,
        perdidas: 0,
        valorGanho: [],
      };
      g.ganhas += 1;
      const moeda = g.valorGanho.find((v) => v.moeda === r.valorEstimadoMoeda);
      if (moeda) {
        moeda.valorInt = (BigInt(moeda.valorInt) + r.valorEstimadoInt).toString();
      } else {
        g.valorGanho.push({
          moeda: r.valorEstimadoMoeda,
          valorInt: r.valorEstimadoInt.toString(),
        });
      }
      ganhasPorResp.set(r.responsavelId, g);
    }

    const perdidasVistas = new Set<string>();
    for (const r of perdidasRows) {
      if (perdidasVistas.has(r.oportunidadeId) || !r.responsavelId) continue;
      perdidasVistas.add(r.oportunidadeId);
      const g = ganhasPorResp.get(r.responsavelId) ?? {
        responsavelId: r.responsavelId,
        ganhas: 0,
        perdidas: 0,
        valorGanho: [],
      };
      g.perdidas += 1;
      ganhasPorResp.set(r.responsavelId, g);
    }

    const pontos = new Map<string, number>();
    for (const t of tarefas) {
      if (!t.responsavelId) continue;
      pontos.set(
        t.responsavelId,
        (pontos.get(t.responsavelId) ?? 0) +
          calcularPontosTarefa({
            concluida: true,
            dataVencimento: t.dataVencimento,
            concluidoEm: t.concluidoEm,
            totalChecklist: t.totalChecklist,
            checklistConcluidos: t.checklistConcluidos,
          }),
      );
    }

    const ids = [...new Set([...ganhasPorResp.keys(), ...pontos.keys()])];
    const nomes = await this.repo.nomesDeUsuarios(ids);

    return { itens: combinarRankingComercial([...ganhasPorResp.values()], pontos, nomes) };
  }

  // ------------------------------------------------ qualidade_atendimento
  async qualidadeAtendimento(
    req: Request,
    periodo: PeriodoResolvido,
    filtros: FiltrosDashboard,
  ) {
    const e = await this.resolverEscopos(req, filtros);
    const { de, ate, anteriorDe, anteriorAte } = periodo;

    const [atual, anterior, notas, datas] = await Promise.all([
      this.repo.atendimentosComPrimeiraResposta(e.atendimento, de, ate),
      this.repo.atendimentosComPrimeiraResposta(e.atendimento, anteriorDe, anteriorAte),
      this.repo.notasCsat(e.atendimento, de, ate),
      this.repo.atendimentosDatas(e.atendimento, de, ate),
    ]);

    const [totalAbertos, totalEncerrados] = await Promise.all([
      this.repo.contarAtendimentos(e.atendimento, 'abertoEm', de, ate),
      this.repo.contarAtendimentos(e.atendimento, 'encerradoEm', de, ate),
    ]);

    const minutosResposta = (
      rows: { abertoEm: Date; primeiraRespostaEm: Date }[],
    ): number[] =>
      rows.map((r) => (r.primeiraRespostaEm.getTime() - r.abertoEm.getTime()) / MS_MIN);

    const media = (xs: number[]): number | null =>
      xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

    const mAtual = minutosResposta(atual);
    const mAnt = minutosResposta(anterior);

    const dentroSla = atual.filter(
      (r) => r.primeiraRespostaEm.getTime() - r.abertoEm.getTime() <= r.slaMinutos * MS_MIN,
    ).length;

    const distribuicao: Record<string, number> = {};
    for (let n = 0; n <= 10; n++) distribuicao[String(n)] = 0;
    for (const n of notas) {
      if (n >= 0 && n <= 10) distribuicao[String(n)] += 1;
    }

    // por atendente
    const porAtendente = new Map<string, { atendimentos: number; minutos: number[] }>();
    for (const r of atual) {
      const key = r.atendenteAtualId ?? '(sem atendente)';
      const cur = porAtendente.get(key) ?? { atendimentos: 0, minutos: [] };
      cur.atendimentos += 1;
      cur.minutos.push((r.primeiraRespostaEm.getTime() - r.abertoEm.getTime()) / MS_MIN);
      porAtendente.set(key, cur);
    }
    const nomes = await this.repo.nomesDeUsuarios(
      [...porAtendente.keys()].filter((k) => k !== '(sem atendente)'),
    );

    const abertosPorDia = agruparEmBuckets(
      datas.abertos.map((d): PontoDatado => ({ quando: d, valor: 1 })),
      'dia',
    );
    const encerradosPorDia = new Map(
      agruparEmBuckets(
        datas.encerrados.map((d): PontoDatado => ({ quando: d, valor: 1 })),
        'dia',
      ).map((p) => [p.rotulo, p.valor]),
    );

    return {
      tempoMedioPrimeiraRespostaMinutos: calcularDelta(media(mAtual) ?? 0, media(mAnt) ?? 0),
      percentualDentroSla: atual.length === 0 ? null : dentroSla / atual.length,
      csatMedio: media(notas),
      distribuicaoCsat: distribuicao,
      taxaResolucao: totalAbertos === 0 ? null : totalEncerrados / totalAbertos,
      atendimentosAbertos: totalAbertos,
      atendimentosEncerrados: totalEncerrados,
      porAtendente: [...porAtendente.entries()].map(([id, v]) => ({
        atendenteId: id === '(sem atendente)' ? null : id,
        nome: nomes.get(id) ?? null,
        atendimentos: v.atendimentos,
        tempoMedioRespostaMinutos: media(v.minutos),
      })),
      porDia: abertosPorDia.map((p) => ({
        rotulo: p.rotulo,
        abertos: p.valor,
        encerrados: encerradosPorDia.get(p.rotulo) ?? 0,
      })),
    };
  }

  // ---------------------------------------------------- leads_por_origem
  async leadsPorOrigem(
    req: Request,
    periodo: PeriodoResolvido,
    filtros: FiltrosDashboard,
  ) {
    const e = await this.resolverEscopos(req, filtros);
    const rows = await this.repo.leadsPorOrigem(e.lead, periodo.de, periodo.ate);
    return {
      colunas: ['origem', 'leads', 'convertidos', 'taxaConversao'],
      linhas: rows.map((r) => [
        r.origem,
        r.leads,
        r.convertidos,
        r.leads === 0 ? 0 : Number((r.convertidos / r.leads).toFixed(4)),
      ]),
    };
  }

  // ------------------------------------------------- serie_oportunidades
  async serieOportunidades(
    req: Request,
    periodo: PeriodoResolvido,
    filtros: FiltrosDashboard,
  ) {
    const e = await this.resolverEscopos(req, filtros);
    const { de, ate, bucket } = periodo;

    const [criadas, ganhasRows] = await Promise.all([
      this.repo.oportunidadesCriadasDatas(e.oportunidade, de, ate),
      this.repo.movimentacoesParaTipo(e.oportunidade, 'GANHA', de, ate),
    ]);

    const ganhasDatas = [
      ...new Map(ganhasRows.map((r) => [r.oportunidadeId, r.criadoEm])).values(),
    ];

    return {
      bucket,
      series: [
        {
          nome: 'criadas',
          pontos: agruparEmBuckets(
            criadas.map((d): PontoDatado => ({ quando: d, valor: 1 })),
            bucket,
          ),
        },
        {
          nome: 'ganhas',
          pontos: agruparEmBuckets(
            ganhasDatas.map((d): PontoDatado => ({ quando: d, valor: 1 })),
            bucket,
          ),
        },
      ],
    };
  }

  // --------------------------------------------------- utilitário p/ metas
  /** Realizado de uma métrica de meta, no intervalo, restrito ao escopo dado. */
  async realizadoMetrica(
    metrica: string,
    where: {
      lead: Prisma.LeadWhereInput;
      oportunidade: Prisma.OportunidadeWhereInput;
      tarefa: Prisma.TarefaWhereInput;
      atendimento: Prisma.AtendimentoWhereInput;
    },
    de: Date,
    ate: Date,
    moeda: string | null,
  ): Promise<number> {
    switch (metrica) {
      case 'leads_novos':
        return this.repo.contarLeads(where.lead, de, ate);
      case 'oportunidades_ganhas': {
        const rows = await this.repo.movimentacoesParaTipo(where.oportunidade, 'GANHA', de, ate);
        return new Set(rows.map((r) => r.oportunidadeId)).size;
      }
      case 'valor_ganho': {
        const rows = await this.repo.movimentacoesParaTipo(where.oportunidade, 'GANHA', de, ate);
        const vistas = new Set<string>();
        let soma = 0n;
        for (const r of rows) {
          if (vistas.has(r.oportunidadeId)) continue;
          vistas.add(r.oportunidadeId);
          if (moeda && r.valorEstimadoMoeda !== moeda) continue;
          soma += r.valorEstimadoInt;
        }
        return Number(soma);
      }
      case 'tarefas_concluidas':
        return (await this.repo.tarefasConcluidas(where.tarefa, de, ate)).length;
      case 'atendimentos_encerrados':
        return this.repo.contarAtendimentos(where.atendimento, 'encerradoEm', de, ate);
      default:
        return 0;
    }
  }
}

export type { Delta };
