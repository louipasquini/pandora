import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validarDefinicao } from '../domain/validar-valor-campo';
import {
  CampoPersonalizadoPessoaRepository,
  type CampoPessoaDefRow,
} from '../infra/campo-personalizado-pessoa.repository';
import { ClientesAuditService } from './clientes-audit.service';
import type {
  CriarCampoPessoaDefDto,
  PatchCampoPessoaDefDto,
} from '../dto/campo-personalizado-pessoa.schema';

function projetar(d: CampoPessoaDefRow) {
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
 * CRUD das **definições** de campo personalizado de `pessoa` (spec 013,
 * CL-02) — espelha `crm/application/lead/campo-personalizado.service.ts`
 * (spec 008). Sob `pessoa:gerir_campos_personalizados`. Auditado em
 * `clientes_audit`. `chave`/`tipo` são imutáveis. `DELETE` de definição em
 * uso → 409.
 */
@Injectable()
export class CampoPersonalizadoPessoaService {
  constructor(
    private readonly repo: CampoPersonalizadoPessoaRepository,
    private readonly audit: ClientesAuditService,
  ) {}

  listar(ativo?: boolean) {
    return this.repo.listar(ativo).then((rows) => rows.map(projetar));
  }

  listarAtivas() {
    return this.repo.listarAtivas().then((rows) => rows.map(projetar));
  }

  async detalhe(id: string) {
    const d = await this.repo.porId(id);
    if (!d) throw new NotFoundException('definição não encontrada');
    return projetar(d);
  }

  async criar(dto: CriarCampoPessoaDefDto, autor: string) {
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
      entidade: 'campo_personalizado_pessoa',
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
      motivo: 'campo personalizado de pessoa criado',
    });
    return projetar(d);
  }

  async atualizar(id: string, dto: PatchCampoPessoaDefDto, autor: string) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('definição não encontrada');

    const opcoes = dto.opcoes ?? antes.opcoes;
    const check = validarDefinicao({ tipo: antes.tipo, opcoes });
    if (!check.ok) throw new UnprocessableEntityException(check.erro);

    const data: Prisma.CampoPersonalizadoPessoaUncheckedUpdateInput = {};
    if (dto.rotulo !== undefined) data.rotulo = dto.rotulo;
    if (dto.opcoes !== undefined) data.opcoes = dto.opcoes;
    if (dto.obrigatorio !== undefined) data.obrigatorio = dto.obrigatorio;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const depois =
      Object.keys(data).length > 0 ? await this.repo.atualizar(id, data) : antes;

    await this.audit.registrar({
      autor,
      entidade: 'campo_personalizado_pessoa',
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
      motivo: 'campo personalizado de pessoa editado',
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
      entidade: 'campo_personalizado_pessoa',
      entidadeId: id,
      campo: 'removido',
      valorAnterior: { chave: antes.chave, tipo: antes.tipo },
      valorNovo: null,
      motivo: 'campo personalizado de pessoa removido',
    });
  }
}
