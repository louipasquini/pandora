import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { PipelineRepository, type EtapaRow, type PipelineRow } from '../../infra/pipeline';
import { CrmPipelineAuditService } from './crm-pipeline-audit.service';
import type {
  CriarEtapaDto,
  CriarPipelineDto,
  ListarPipelinesDto,
  PatchEtapaDto,
  PatchPipelineDto,
} from '../../dto/pipeline.schema';

export function precisaEquipe(
  modoAtribuicao: string,
  atribuicaoFallback: string | null,
): boolean {
  return modoAtribuicao === 'RODIZIO' || atribuicaoFallback === 'RODIZIO';
}

function projetarPipeline(p: PipelineRow) {
  return {
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    equipeId: p.equipeId,
    modoAtribuicao: p.modoAtribuicao,
    atribuicaoFallback: p.atribuicaoFallback,
    diasEsfriando: p.diasEsfriando,
    ativo: p.ativo,
    criadoEm: p.criadoEm,
    atualizadoEm: p.atualizadoEm,
  };
}

function projetarEtapa(e: EtapaRow) {
  return {
    id: e.id,
    pipelineId: e.pipelineId,
    nome: e.nome,
    ordem: e.ordem,
    tipo: e.tipo,
    slaHoras: e.slaHoras,
    criadoEm: e.criadoEm,
    atualizadoEm: e.atualizadoEm,
  };
}

/**
 * CRUD de `pipeline`/`etapa_pipeline` (spec 010, US1) — sob
 * `crm_admin:gerir_pipelines`. Sem `DELETE` de pipeline (só `ativo=false`);
 * `DELETE` de etapa é físico mas recusado se em uso (FR-004).
 */
@Injectable()
export class PipelineService {
  constructor(
    private readonly repo: PipelineRepository,
    private readonly audit: CrmPipelineAuditService,
    private readonly rbac: SujeitoRbacService,
  ) {}

  /** Leitura de config exige alguma visão de oportunidade — OR, não AND (US1). */
  async exigirLeitura(req: Request): Promise<void> {
    const perms = await this.rbac.permissoesDe(req);
    if (!perms.has('oportunidade:ver_todas') && !perms.has('oportunidade:ver_proprias')) {
      throw new ForbiddenException('permissão insuficiente');
    }
  }

  async listar(q: ListarPipelinesDto, req: Request) {
    await this.exigirLeitura(req);
    const itens = await this.repo.listar(q.ativo);
    return { itens: itens.map(projetarPipeline) };
  }

  async detalhe(id: string, req: Request) {
    await this.exigirLeitura(req);
    return this.montarDetalhe(id);
  }

  /** Sem checagem de leitura — usado pelos próprios fluxos de escrita (admin). */
  private async montarDetalhe(id: string) {
    const p = await this.repo.porId(id);
    if (!p) throw new NotFoundException('pipeline não encontrado');
    const etapas = await this.repo.etapasDoPipeline(id);
    return { ...projetarPipeline(p), etapas: etapas.map(projetarEtapa) };
  }

  async criar(dto: CriarPipelineDto, autor: string) {
    const modoAtribuicao = dto.modoAtribuicao ?? 'MANUAL';
    const atribuicaoFallback = dto.atribuicaoFallback ?? null;
    if (precisaEquipe(modoAtribuicao, atribuicaoFallback) && !dto.equipeId) {
      throw new UnprocessableEntityException({ erro: 'equipe_obrigatoria_para_rodizio' });
    }
    if (dto.equipeId && !(await this.repo.equipeExiste(dto.equipeId))) {
      throw new UnprocessableEntityException({ erro: 'equipe_nao_encontrada' });
    }
    const p = await this.repo.criar({
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      equipeId: dto.equipeId ?? null,
      modoAtribuicao,
      atribuicaoFallback,
      diasEsfriando: dto.diasEsfriando ?? null,
    });
    await this.audit.registrar({
      autor,
      entidade: 'pipeline',
      entidadeId: p.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: projetarPipeline(p),
      motivo: 'pipeline criado via POST /crm/pipelines',
    });
    return this.montarDetalhe(p.id);
  }

  async patch(id: string, dto: PatchPipelineDto, autor: string) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('pipeline não encontrado');

    const modoAtribuicao = dto.modoAtribuicao ?? antes.modoAtribuicao;
    const atribuicaoFallback =
      dto.atribuicaoFallback === undefined ? antes.atribuicaoFallback : dto.atribuicaoFallback;
    const equipeId = dto.equipeId === undefined ? antes.equipeId : dto.equipeId;
    if (precisaEquipe(modoAtribuicao, atribuicaoFallback) && !equipeId) {
      throw new UnprocessableEntityException({ erro: 'equipe_obrigatoria_para_rodizio' });
    }
    if (dto.equipeId && !(await this.repo.equipeExiste(dto.equipeId))) {
      throw new UnprocessableEntityException({ erro: 'equipe_nao_encontrada' });
    }

    const data: Prisma.PipelineUncheckedUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.equipeId !== undefined) data.equipeId = dto.equipeId;
    if (dto.modoAtribuicao !== undefined) data.modoAtribuicao = dto.modoAtribuicao;
    if (dto.atribuicaoFallback !== undefined) data.atribuicaoFallback = dto.atribuicaoFallback;
    if (dto.diasEsfriando !== undefined) data.diasEsfriando = dto.diasEsfriando;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (Object.keys(data).length > 0) await this.repo.atualizar(id, data);

    await this.audit.registrar({
      autor,
      entidade: 'pipeline',
      entidadeId: id,
      campo: 'editado',
      valorAnterior: projetarPipeline(antes),
      valorNovo: projetarPipeline((await this.repo.porId(id)) as PipelineRow),
      motivo: 'pipeline editado via PATCH /crm/pipelines/{id}',
    });
    return this.montarDetalhe(id);
  }

  // --- etapas ---------------------------------------------------------------

  async criarEtapa(pipelineId: string, dto: CriarEtapaDto, autor: string) {
    if (!(await this.repo.porId(pipelineId))) {
      throw new NotFoundException('pipeline não encontrado');
    }
    let etapa: EtapaRow;
    try {
      etapa = await this.repo.criarEtapa({
        pipelineId,
        nome: dto.nome,
        ordem: dto.ordem,
        tipo: dto.tipo,
        slaHoras: dto.slaHoras ?? null,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new UnprocessableEntityException({ erro: 'ordem_em_uso', ordem: dto.ordem });
      }
      throw e;
    }
    await this.audit.registrar({
      autor,
      entidade: 'etapa_pipeline',
      entidadeId: etapa.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: projetarEtapa(etapa),
      motivo: 'etapa criada via POST /crm/pipelines/{id}/etapas',
    });
    return projetarEtapa(etapa);
  }

  async listarEtapas(pipelineId: string, req: Request) {
    await this.exigirLeitura(req);
    if (!(await this.repo.porId(pipelineId))) {
      throw new NotFoundException('pipeline não encontrado');
    }
    const etapas = await this.repo.etapasDoPipeline(pipelineId);
    return { itens: etapas.map(projetarEtapa) };
  }

  async patchEtapa(
    pipelineId: string,
    etapaId: string,
    dto: PatchEtapaDto,
    autor: string,
  ) {
    const antes = await this.repo.etapaPorId(etapaId);
    if (!antes || antes.pipelineId !== pipelineId) {
      throw new NotFoundException('etapa não encontrada');
    }
    if (dto.tipo !== undefined && dto.tipo !== antes.tipo && (await this.repo.etapaEmUso(etapaId))) {
      throw new UnprocessableEntityException({ erro: 'tipo_imutavel_em_uso' });
    }

    const data: Prisma.EtapaPipelineUncheckedUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.slaHoras !== undefined) data.slaHoras = dto.slaHoras;

    let depois: EtapaRow;
    try {
      depois =
        Object.keys(data).length > 0 ? await this.repo.atualizarEtapa(etapaId, data) : antes;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new UnprocessableEntityException({ erro: 'ordem_em_uso', ordem: dto.ordem });
      }
      throw e;
    }

    await this.audit.registrar({
      autor,
      entidade: 'etapa_pipeline',
      entidadeId: etapaId,
      campo: 'editado',
      valorAnterior: projetarEtapa(antes),
      valorNovo: projetarEtapa(depois),
      motivo: 'etapa editada via PATCH /crm/pipelines/{id}/etapas/{etapaId}',
    });
    return projetarEtapa(depois);
  }

  async removerEtapa(pipelineId: string, etapaId: string, autor: string) {
    const etapa = await this.repo.etapaPorId(etapaId);
    if (!etapa || etapa.pipelineId !== pipelineId) {
      throw new NotFoundException('etapa não encontrada');
    }
    if (await this.repo.etapaEmUso(etapaId)) {
      throw new ConflictException({ erro: 'etapa_em_uso' });
    }
    await this.repo.removerEtapa(etapaId);
    await this.audit.registrar({
      autor,
      entidade: 'etapa_pipeline',
      entidadeId: etapaId,
      campo: 'removido',
      valorAnterior: projetarEtapa(etapa),
      valorNovo: null,
      motivo: 'etapa removida via DELETE /crm/pipelines/{id}/etapas/{etapaId}',
    });
  }
}
