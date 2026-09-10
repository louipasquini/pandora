import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import {
  PAINEIS_DASHBOARD,
  painelEhTabular,
  painelPorId,
  painelVisivel,
  paineisVisiveis,
  resolverPeriodo,
  type PainelDef,
  type PeriodoResolvido,
} from '../../domain/dashboard';
import type { FiltrosDashboardDto } from '../../dto/dashboard/dashboard.schema';
import { serializarCsv } from './csv';
import { PaineisService, type FiltrosDashboard } from './paineis.service';

function filtros(dto: FiltrosDashboardDto): FiltrosDashboard {
  return {
    equipeId: dto.equipeId,
    responsavelId: dto.responsavelId,
    pipelineId: dto.pipelineId,
  };
}

function periodoOu400(dto: FiltrosDashboardDto): PeriodoResolvido {
  try {
    return resolverPeriodo(dto.de, dto.ate);
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}

/**
 * Orquestra o dashboard (spec 017, US1 / FR-006). Monta só os painéis que o
 * sujeito pode ver; nunca 403 na página inteira.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly paineis: PaineisService,
    private readonly rbac: SujeitoRbacService,
  ) {}

  private async resolverPainel(id: string, req: Request, periodo: PeriodoResolvido, f: FiltrosDashboard) {
    switch (id) {
      case 'visao_geral':
        return this.paineis.visaoGeral(req, periodo, f);
      case 'funil_pipeline':
        return this.paineis.funilPipeline(req, periodo, f);
      case 'ranking_comercial':
        return this.paineis.rankingComercial(req, periodo, f);
      case 'qualidade_atendimento':
        return this.paineis.qualidadeAtendimento(req, periodo, f);
      case 'leads_por_origem':
        return this.paineis.leadsPorOrigem(req, periodo, f);
      case 'serie_oportunidades':
        return this.paineis.serieOportunidades(req, periodo, f);
      default:
        return null;
    }
  }

  async montar(req: Request, dto: FiltrosDashboardDto) {
    const periodo = periodoOu400(dto);
    const perms = await this.rbac.permissoesDe(req);
    const visiveis = paineisVisiveis(perms);
    const f = filtros(dto);

    const paineis = await Promise.all(
      visiveis.map(async (p) => ({
        id: p.id,
        titulo: p.titulo,
        formato: p.formato,
        dados: await this.resolverPainel(p.id, req, periodo, f),
      })),
    );

    return { periodo: serializarPeriodo(periodo), paineis };
  }

  async painel(req: Request, id: string, dto: FiltrosDashboardDto) {
    const def = painelPorId(id);
    if (!def) throw new NotFoundException('painel não encontrado');

    const perms = await this.rbac.permissoesDe(req);
    if (!painelVisivel(def, perms)) {
      throw new ForbiddenException('permissão insuficiente para este painel');
    }

    const periodo = periodoOu400(dto);
    const dados = await this.resolverPainel(id, req, periodo, filtros(dto));

    if (dto.formato === 'csv') {
      if (!painelEhTabular(def)) {
        throw new BadRequestException('formato=csv só é válido para painéis tabulares');
      }
      return { csv: paraCsv(def, dados) };
    }
    return { id: def.id, titulo: def.titulo, formato: def.formato, periodo: serializarPeriodo(periodo), dados };
  }

  async catalogo(req: Request) {
    const perms = await this.rbac.permissoesDe(req);
    return {
      paineis: PAINEIS_DASHBOARD.map((p) => ({
        id: p.id,
        titulo: p.titulo,
        formato: p.formato,
        permissoes: p.permissoesAlternativas,
        visivel: painelVisivel(p, perms),
      })),
    };
  }
}

function serializarPeriodo(p: PeriodoResolvido) {
  return {
    de: p.de.toISOString(),
    ate: p.ate.toISOString(),
    anteriorDe: p.anteriorDe.toISOString(),
    anteriorAte: p.anteriorAte.toISOString(),
    duracaoDias: p.duracaoDias,
    bucket: p.bucket,
  };
}

function paraCsv(def: PainelDef, dados: unknown): string {
  if (def.formato === 'tabela') {
    const d = dados as { colunas: string[]; linhas: (string | number)[][] };
    return serializarCsv(d.colunas, d.linhas);
  }
  // ranking
  const d = dados as {
    itens: {
      nome: string | null;
      responsavelId: string;
      oportunidadesGanhas: number;
      valorGanho: { moeda: string; valorInt: string }[];
      taxaConversao: number | null;
      pontosTarefa: number;
    }[];
  };
  const colunas = ['responsavel', 'oportunidadesGanhas', 'valorGanho', 'taxaConversao', 'pontosTarefa'];
  const linhas = d.itens.map((i) => [
    i.nome ?? i.responsavelId,
    i.oportunidadesGanhas,
    i.valorGanho.map((v) => `${v.moeda} ${v.valorInt}`).join(' | '),
    i.taxaConversao ?? '',
    i.pontosTarefa,
  ]);
  return serializarCsv(colunas, linhas);
}
