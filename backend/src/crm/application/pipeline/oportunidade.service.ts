import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Dinheiro, agoraUtc } from '../../../core/core.module';
import { validarAncora } from '../../domain/pipeline';
import { PipelineRepository, type OportunidadeRow } from '../../infra/pipeline';
import { OportunidadeRepository } from '../../infra/pipeline/oportunidade.repository';
import { MovimentacaoRepository } from '../../infra/pipeline/movimentacao.repository';
import { AtribuicaoService } from './atribuicao.service';
import { CrmPipelineAuditService } from './crm-pipeline-audit.service';
import { projetarOportunidade } from './projetar-oportunidade';
import type {
  AtualizarOportunidadeDto,
  CriarOportunidadeDto,
} from '../../dto/oportunidade.schema';

function paraDinheiro(v: { valorInt: string; moeda: string }): Dinheiro {
  try {
    return Dinheiro.deInteiroEscalado(BigInt(v.valorInt), v.moeda);
  } catch {
    throw new UnprocessableEntityException({ erro: 'valor_estimado_invalido' });
  }
}

/**
 * `criar`/`atualizar`/`obterRaw` de `oportunidade` (spec 010, US1). `criar`
 * valida a âncora (D-01), que o pipeline tem etapa `ABERTA` (FR-005), e
 * resolve o responsável via `AtribuicaoService` quando não informado
 * explicitamente (FR-007/FR-016). `atualizar` nunca aceita `etapaId`/
 * `pipelineId` (FR-009) — isso é `MoverOportunidadeService`.
 */
@Injectable()
export class OportunidadeService {
  constructor(
    private readonly repo: OportunidadeRepository,
    private readonly pipelines: PipelineRepository,
    private readonly movimentacoes: MovimentacaoRepository,
    private readonly atribuicao: AtribuicaoService,
    private readonly audit: CrmPipelineAuditService,
  ) {}

  async criar(dto: CriarOportunidadeDto, autor: string) {
    const ancora = validarAncora({ pessoaId: dto.pessoaId, leadId: dto.leadId });
    if (!ancora.ok) {
      throw new UnprocessableEntityException(
        ancora.erro === 'ambos'
          ? 'informe pessoaId OU leadId, nunca os dois'
          : 'informe pessoaId ou leadId',
      );
    }
    if (ancora.tipo === 'pessoa') {
      if (!(await this.repo.pessoaExiste(ancora.id))) {
        throw new NotFoundException('pessoa não encontrada');
      }
    } else {
      if (!(await this.repo.leadExiste(ancora.id))) {
        throw new NotFoundException('lead não encontrado');
      }
    }

    const pipeline = await this.pipelines.porId(dto.pipelineId);
    if (!pipeline) throw new NotFoundException('pipeline não encontrado');
    const primeiraAberta = await this.pipelines.primeiraEtapa(dto.pipelineId, 'ABERTA');
    if (!primeiraAberta) {
      throw new UnprocessableEntityException({ erro: 'pipeline_sem_etapa_aberta' });
    }

    const dinheiro = paraDinheiro(dto.valorEstimado);
    const origem = ancora.tipo === 'lead' ? await this.repo.origemDoLead(ancora.id) : null;
    const responsavelId = await this.atribuicao.resolverResponsavel(
      pipeline,
      {
        origem,
        valorEstimado: { valorInt: dinheiro.valorInt, moeda: dinheiro.moeda },
      },
      dto.responsavelId ?? null,
    );

    const agora = agoraUtc();
    const row = await this.repo.criar({
      pipelineId: dto.pipelineId,
      etapaId: primeiraAberta.id,
      pessoaId: ancora.tipo === 'pessoa' ? ancora.id : null,
      leadId: ancora.tipo === 'lead' ? ancora.id : null,
      titulo: dto.titulo,
      valorEstimadoInt: dinheiro.valorInt,
      valorEstimadoMoeda: dinheiro.moeda,
      responsavelId,
      dataPrevistaFechamento: dto.dataPrevistaFechamento
        ? new Date(`${dto.dataPrevistaFechamento}T00:00:00Z`)
        : null,
      entrouEtapaEm: agora,
    });
    await this.movimentacoes.registrarInicial({
      oportunidadeId: row.id,
      etapaNovaId: primeiraAberta.id,
    });
    await this.audit.registrar({
      autor,
      entidade: 'oportunidade',
      entidadeId: row.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: projetarOportunidade(row),
      motivo: 'oportunidade criada via POST /crm/oportunidades',
    });
    return projetarOportunidade(row);
  }

  async obterRaw(id: string): Promise<OportunidadeRow> {
    const row = await this.repo.porId(id);
    if (!row) throw new NotFoundException('oportunidade não encontrada');
    return row;
  }

  async atualizar(id: string, dto: AtualizarOportunidadeDto, autor: string) {
    const antes = await this.obterRaw(id);
    const data: Prisma.OportunidadeUncheckedUpdateInput = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.valorEstimado !== undefined) {
      const dinheiro = paraDinheiro(dto.valorEstimado);
      data.valorEstimadoInt = dinheiro.valorInt;
      data.valorEstimadoMoeda = dinheiro.moeda;
    }
    if (dto.responsavelId !== undefined) data.responsavelId = dto.responsavelId;
    if (dto.dataPrevistaFechamento !== undefined) {
      data.dataPrevistaFechamento = dto.dataPrevistaFechamento
        ? new Date(`${dto.dataPrevistaFechamento}T00:00:00Z`)
        : null;
    }
    const depois =
      Object.keys(data).length > 0 ? await this.repo.atualizarCampos(id, data) : antes;

    await this.audit.registrar({
      autor,
      entidade: 'oportunidade',
      entidadeId: id,
      campo: 'editado',
      valorAnterior: projetarOportunidade(antes),
      valorNovo: projetarOportunidade(depois),
      motivo: 'oportunidade editada via PATCH /crm/oportunidades/{id}',
    });
    return projetarOportunidade(depois);
  }
}
