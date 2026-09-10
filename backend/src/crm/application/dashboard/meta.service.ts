import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { EntidadeId, agoraUtc } from '../../../core/core.module';
import {
  metricaMetaPorId,
  normalizarReferencia,
  periodoDaMeta,
  statusMeta,
} from '../../domain/dashboard';
import type {
  AtualizarMetaDto,
  CriarMetaDto,
  ListarMetasDto,
} from '../../dto/dashboard/dashboard.schema';
import {
  DashboardMetricaRepository,
  MetaComercialRepository,
  type MetaComercialRow,
} from '../../infra/dashboard';
import { CrmDashboardAuditService } from './crm-dashboard-audit.service';
import { PaineisService } from './paineis.service';

function sub(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

@Injectable()
export class MetaComercialService {
  constructor(
    private readonly repo: MetaComercialRepository,
    private readonly metricas: DashboardMetricaRepository,
    private readonly paineis: PaineisService,
    private readonly audit: CrmDashboardAuditService,
  ) {}

  // ------------------------------------------------------------- leitura
  async listar(dto: ListarMetasDto) {
    const where: Prisma.MetaComercialWhereInput = {};
    if (dto.periodo) where.periodo = dto.periodo;
    if (dto.referencia) where.referencia = new Date(dto.referencia);
    const linhas = dto.periodo || dto.referencia
      ? await this.repo.listar(where)
      : await this.metasDoPeriodoCorrente();
    return { itens: await Promise.all(linhas.map((m) => this.projetar(m))) };
  }

  /** Metas cujo período (mês/trimestre corrente) contém "agora". */
  async metasDoPeriodoCorrente(): Promise<MetaComercialRow[]> {
    const todas = await this.repo.listar({});
    const agora = agoraUtc().getTime();
    return todas.filter((m) => {
      const { inicio, fim } = periodoDaMeta(m.periodo, m.referencia);
      return agora >= inicio.getTime() && agora <= fim.getTime();
    });
  }

  async projetar(m: MetaComercialRow) {
    const def = metricaMetaPorId(m.metrica);
    const { inicio, fim } = periodoDaMeta(m.periodo, m.referencia);
    const where = await this.whereDoEscopo(m.equipeId, m.responsavelId);
    const alvo = Number(m.alvoInt);
    const realizado = await this.paineis.realizadoMetrica(
      m.metrica,
      where,
      inicio,
      fim,
      def?.monetaria ? m.alvoMoeda : null,
    );
    const at = statusMeta(realizado, alvo, { inicio, fim }, agoraUtc());

    const valorSerializado = (n: number) =>
      def?.monetaria
        ? { valorInt: String(Math.round(n)), moeda: m.alvoMoeda }
        : { valor: n };

    return {
      id: m.id,
      metrica: m.metrica,
      periodo: m.periodo,
      referencia: m.referencia.toISOString().slice(0, 10),
      alvo: valorSerializado(alvo),
      escopo: { equipeId: m.equipeId, responsavelId: m.responsavelId },
      descricao: m.descricao,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      realizado: valorSerializado(realizado),
      percentual: at.percentual,
      status: at.status,
      noRitmo: at.noRitmo,
    };
  }

  private async whereDoEscopo(equipeId: string | null, responsavelId: string | null) {
    let responsavelWhere: Record<string, unknown> = {};
    if (responsavelId) {
      responsavelWhere = { responsavelId };
    } else if (equipeId) {
      const membros = await this.metricas.membrosDaEquipe(equipeId);
      responsavelWhere = { responsavelId: { in: membros.length ? membros : ['__nenhum__'] } };
    }
    return {
      lead: responsavelWhere as Prisma.LeadWhereInput,
      oportunidade: responsavelWhere as Prisma.OportunidadeWhereInput,
      tarefa: responsavelWhere as Prisma.TarefaWhereInput,
      atendimento: (responsavelId
        ? { atendenteAtualId: responsavelId }
        : equipeId
          ? { equipeId }
          : {}) as Prisma.AtendimentoWhereInput,
    };
  }

  // ------------------------------------------------------------- escrita
  async criar(dto: CriarMetaDto, req: Request) {
    const def = metricaMetaPorId(dto.metrica);
    if (!def) throw new UnprocessableEntityException('métrica fora do catálogo');

    const { alvoInt, alvoMoeda } = this.normalizarAlvo(def.monetaria, dto.alvo);
    await this.validarEscopo(dto.equipeId ?? null, dto.responsavelId ?? null);

    const referencia = normalizarReferencia(dto.periodo, new Date(dto.referencia));
    const criadoPorId = await this.resolverUsuario(sub(req));

    const criada = await this.repo.criar({
      metrica: dto.metrica,
      periodo: dto.periodo,
      referencia,
      alvoInt,
      alvoMoeda,
      equipeId: dto.equipeId ?? null,
      responsavelId: dto.responsavelId ?? null,
      descricao: dto.descricao ?? null,
      criadoPorId,
    });

    await this.audit.registrar({
      autor: sub(req),
      entidade: 'meta_comercial',
      entidadeId: criada.id,
      campo: '*',
      valorAnterior: null,
      valorNovo: snapshot(criada),
      motivo: 'criar',
    });

    return this.projetar(criada);
  }

  async atualizar(id: string, dto: AtualizarMetaDto, req: Request) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('meta não encontrada');

    const def = metricaMetaPorId(antes.metrica);
    const data: Prisma.MetaComercialUncheckedUpdateInput = {};

    if (dto.alvo !== undefined) {
      const { alvoInt, alvoMoeda } = this.normalizarAlvo(!!def?.monetaria, dto.alvo);
      data.alvoInt = alvoInt;
      data.alvoMoeda = alvoMoeda;
    }
    if (dto.equipeId !== undefined) data.equipeId = dto.equipeId ?? null;
    if (dto.responsavelId !== undefined) data.responsavelId = dto.responsavelId ?? null;
    if (dto.descricao !== undefined) data.descricao = dto.descricao ?? null;

    await this.validarEscopo(
      (data.equipeId as string | null | undefined) ?? antes.equipeId,
      (data.responsavelId as string | null | undefined) ?? antes.responsavelId,
    );

    const depois = await this.repo.atualizarCampos(id, data);

    for (const campo of ['alvoInt', 'alvoMoeda', 'equipeId', 'responsavelId', 'descricao'] as const) {
      await this.audit.registrar({
        autor: sub(req),
        entidade: 'meta_comercial',
        entidadeId: id,
        campo,
        valorAnterior: serializarCampo(antes[campo]),
        valorNovo: serializarCampo(depois[campo]),
        motivo: 'atualizar',
      });
    }

    return this.projetar(depois);
  }

  async remover(id: string, req: Request) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('meta não encontrada');
    await this.repo.remover(id);
    await this.audit.registrar({
      autor: sub(req),
      entidade: 'meta_comercial',
      entidadeId: id,
      campo: '*',
      valorAnterior: snapshot(antes),
      valorNovo: null,
      motivo: 'remover',
    });
  }

  // ------------------------------------------------------------ helpers
  private normalizarAlvo(
    monetaria: boolean,
    alvo: CriarMetaDto['alvo'],
  ): { alvoInt: bigint; alvoMoeda: string | null } {
    const temMoeda = 'valorInt' in alvo;
    if (monetaria && !temMoeda) {
      throw new UnprocessableEntityException('métrica monetária exige alvo { valorInt, moeda }');
    }
    if (!monetaria && temMoeda) {
      throw new UnprocessableEntityException('métrica de contagem exige alvo { valor }');
    }
    return temMoeda
      ? { alvoInt: BigInt(alvo.valorInt), alvoMoeda: alvo.moeda }
      : { alvoInt: BigInt(Math.round(alvo.valor)), alvoMoeda: null };
  }

  private async validarEscopo(equipeId: string | null, responsavelId: string | null) {
    if (equipeId && !(await this.metricas.equipeExiste(equipeId))) {
      throw new UnprocessableEntityException('equipe não encontrada');
    }
    if (responsavelId && !(await this.metricas.usuarioExiste(responsavelId))) {
      throw new UnprocessableEntityException('responsável não encontrado');
    }
  }

  private async resolverUsuario(s: string): Promise<string | null> {
    if (!EntidadeId.isValido(s)) return null;
    return (await this.metricas.usuarioExiste(s)) ? s : null;
  }
}

function serializarCampo(v: unknown): unknown {
  return typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v;
}

function snapshot(m: MetaComercialRow) {
  return {
    metrica: m.metrica,
    periodo: m.periodo,
    referencia: m.referencia.toISOString().slice(0, 10),
    alvoInt: m.alvoInt.toString(),
    alvoMoeda: m.alvoMoeda,
    equipeId: m.equipeId,
    responsavelId: m.responsavelId,
    descricao: m.descricao,
  };
}
