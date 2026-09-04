import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validarDefinicao } from '../../domain/lead/validar-valor-campo';
import {
  CampoPersonalizadoRepository,
  type CampoDefRow,
} from '../../infra/lead/campo-personalizado.repository';
import { CrmAdminAuditService } from '../crm-admin-audit.service';
import type { CriarCampoDefDto, PatchCampoDefDto } from '../../dto/campo-personalizado.schema';

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
 * CRUD das **definições** de campo personalizado de lead (spec 008, US5 — CL-03).
 * Sob `crm_admin:gerir_campos_lead`. Auditado em `crm_admin_audit` (tabela da
 * 007). `chave`/`tipo` são imutáveis. `DELETE` de definição em uso → 409.
 */
@Injectable()
export class CampoPersonalizadoService {
  constructor(
    private readonly repo: CampoPersonalizadoRepository,
    private readonly audit: CrmAdminAuditService,
  ) {}

  listar(ativo?: boolean) {
    return this.repo.listar(ativo).then((rows) => rows.map(projetar));
  }

  async detalhe(id: string) {
    const d = await this.repo.porId(id);
    if (!d) throw new NotFoundException('definição não encontrada');
    return projetar(d);
  }

  async criar(dto: CriarCampoDefDto, autor: string) {
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
      entidade: 'campo_personalizado_lead',
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
      motivo: 'campo personalizado de lead criado',
    });
    return projetar(d);
  }

  async atualizar(id: string, dto: PatchCampoDefDto, autor: string) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('definição não encontrada');

    const opcoes = dto.opcoes ?? antes.opcoes;
    const check = validarDefinicao({ tipo: antes.tipo, opcoes });
    if (!check.ok) throw new UnprocessableEntityException(check.erro);

    const data: Prisma.CampoPersonalizadoLeadUncheckedUpdateInput = {};
    if (dto.rotulo !== undefined) data.rotulo = dto.rotulo;
    if (dto.opcoes !== undefined) data.opcoes = dto.opcoes;
    if (dto.obrigatorio !== undefined) data.obrigatorio = dto.obrigatorio;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const depois =
      Object.keys(data).length > 0 ? await this.repo.atualizar(id, data) : antes;

    await this.audit.registrar({
      autor,
      entidade: 'campo_personalizado_lead',
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
      motivo: 'campo personalizado de lead editado',
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
      entidade: 'campo_personalizado_lead',
      entidadeId: id,
      campo: 'removido',
      valorAnterior: { chave: antes.chave, tipo: antes.tipo },
      valorNovo: null,
      motivo: 'campo personalizado de lead removido',
    });
  }
}
