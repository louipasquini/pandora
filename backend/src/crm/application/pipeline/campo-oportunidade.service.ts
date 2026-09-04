import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validarDefinicao } from '../../domain/lead/validar-valor-campo';
import {
  CampoOportunidadeRepository,
  type CampoDefRow,
} from '../../infra/pipeline/campo-oportunidade.repository';
import { CrmPipelineAuditService } from './crm-pipeline-audit.service';
import type {
  CriarCampoOportunidadeDto,
  PatchCampoOportunidadeDto,
} from '../../dto/campo-oportunidade.schema';

function projetar(d: CampoDefRow) {
  return {
    id: d.id,
    chave: d.chave,
    rotulo: d.rotulo,
    tipo: d.tipo,
    opcoes: d.opcoes,
    obrigatorio: d.obrigatorio,
    ativo: d.ativo,
    criadoEm: d.criadoEm,
    atualizadoEm: d.atualizadoEm,
  };
}

/**
 * CRUD das **definições** de campo personalizado de oportunidade (spec 010,
 * US6). Sob `crm_admin:gerir_pipelines`. Auditado em `crm_pipeline_audit`.
 * `chave`/`tipo` são imutáveis. `DELETE` de definição em uso → 409. Mesmo
 * padrão de `CampoPersonalizadoService` (008), reusando a validação pura de
 * `crm/domain/lead/validar-valor-campo` (esquema idêntico, sem duplicar).
 */
@Injectable()
export class CampoOportunidadeService {
  constructor(
    private readonly repo: CampoOportunidadeRepository,
    private readonly audit: CrmPipelineAuditService,
  ) {}

  listar(ativo?: boolean) {
    return this.repo.listar(ativo).then((rows) => rows.map(projetar));
  }

  async detalhe(id: string) {
    const d = await this.repo.porId(id);
    if (!d) throw new NotFoundException('definição não encontrada');
    return projetar(d);
  }

  async criar(dto: CriarCampoOportunidadeDto, autor: string) {
    const check = validarDefinicao({ tipo: dto.tipo, opcoes: dto.opcoes });
    if (!check.ok) throw new UnprocessableEntityException(check.erro);
    if (await this.repo.porChave(dto.chave)) {
      throw new ConflictException({ erro: 'chave_em_uso', chave: dto.chave });
    }
    const d = await this.repo.criar({
      chave: dto.chave,
      rotulo: dto.rotulo,
      tipo: dto.tipo,
      opcoes: dto.opcoes ?? [],
      obrigatorio: dto.obrigatorio ?? false,
    });
    await this.audit.registrar({
      autor,
      entidade: 'campo_personalizado_oportunidade',
      entidadeId: d.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: {
        chave: d.chave,
        rotulo: d.rotulo,
        tipo: d.tipo,
        opcoes: d.opcoes,
        obrigatorio: d.obrigatorio,
      },
      motivo: 'campo personalizado de oportunidade criado',
    });
    return projetar(d);
  }

  async atualizar(id: string, dto: PatchCampoOportunidadeDto, autor: string) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('definição não encontrada');

    const opcoes = dto.opcoes ?? antes.opcoes;
    const check = validarDefinicao({ tipo: antes.tipo, opcoes });
    if (!check.ok) throw new UnprocessableEntityException(check.erro);

    const data: Prisma.CampoPersonalizadoOportunidadeUncheckedUpdateInput = {};
    if (dto.rotulo !== undefined) data.rotulo = dto.rotulo;
    if (dto.opcoes !== undefined) data.opcoes = dto.opcoes;
    if (dto.obrigatorio !== undefined) data.obrigatorio = dto.obrigatorio;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const depois =
      Object.keys(data).length > 0 ? await this.repo.atualizar(id, data) : antes;

    await this.audit.registrar({
      autor,
      entidade: 'campo_personalizado_oportunidade',
      entidadeId: id,
      campo: 'editado',
      valorAnterior: {
        rotulo: antes.rotulo,
        opcoes: antes.opcoes,
        obrigatorio: antes.obrigatorio,
        ativo: antes.ativo,
      },
      valorNovo: {
        rotulo: depois.rotulo,
        opcoes: depois.opcoes,
        obrigatorio: depois.obrigatorio,
        ativo: depois.ativo,
      },
      motivo: 'campo personalizado de oportunidade editado',
    });
    return projetar(depois);
  }

  async remover(id: string, autor: string) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('definição não encontrada');
    if ((await this.repo.contarValores(id)) > 0) {
      throw new ConflictException({
        erro: 'campo_em_uso',
        sugestao: 'PATCH { ativo: false }',
      });
    }
    await this.repo.remover(id);
    await this.audit.registrar({
      autor,
      entidade: 'campo_personalizado_oportunidade',
      entidadeId: id,
      campo: 'removido',
      valorAnterior: { chave: antes.chave, tipo: antes.tipo },
      valorNovo: null,
      motivo: 'campo personalizado de oportunidade removido',
    });
  }
}
