import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { EntidadeId } from '../../../core/core.module';
import { construirWhere, validarFiltro } from '../../domain/segmento/filtro-segmento';
import type { AtualizarSegmentoDto } from '../../dto/atualizar-segmento.schema';
import type { CriarSegmentoDto } from '../../dto/criar-segmento.schema';
import { SegmentoRepository, type SegmentoRow } from '../../infra/segmento/segmento.repository';
import { LeadRepository } from '../../infra/lead/lead.repository';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { LeadConsultaService } from '../lead/lead-consulta.service';
import { CrmInteracaoAuditService } from '../interacao/crm-interacao-audit.service';

function projetar(s: SegmentoRow) {
  return {
    id: s.id,
    nome: s.nome,
    descricao: s.descricao,
    alvo: s.alvo,
    filtro: s.filtro,
    ativo: s.ativo,
    criadoPor: s.criadoPor,
    criadoEm: s.criadoEm,
    atualizadoEm: s.atualizadoEm,
  };
}

function snapshot(s: SegmentoRow) {
  return { nome: s.nome, descricao: s.descricao, filtro: s.filtro, ativo: s.ativo };
}

/**
 * `segmento` (spec 009, CL-03 — query salva declarativa). Membros são
 * **sempre derivados** na leitura (regra 8.2.2): `listarMembros` combina o
 * `where` do filtro (domínio puro) com o `where` de escopo de visão do
 * sujeito — o segmento nunca amplia o que o sujeito já pode ver.
 */
@Injectable()
export class SegmentoService {
  constructor(
    private readonly repo: SegmentoRepository,
    private readonly rbac: SujeitoRbacService,
    private readonly leadConsulta: LeadConsultaService,
    private readonly audit: CrmInteracaoAuditService,
    private readonly leads: LeadRepository,
  ) {}

  /**
   * `criadoPor` é FK para `Usuario` — o `sub` do JWT pode ser a credencial de
   * serviço (não é linha de `usuario`), então só grava quando corresponde a um
   * `Usuario` real; caso contrário `null` (mesmo tratamento de
   * `interacao.autorId`/`tag_associacao.criadoPor`). O `autor` da auditoria
   * (texto livre) segue sendo o `sub` bruto, sem essa restrição.
   */
  private async resolverCriadoPor(autor: string): Promise<string | null> {
    if (!EntidadeId.isValido(autor)) return null;
    return (await this.leads.usuarioExiste(autor)) ? autor : null;
  }

  async listar(opts: { pagina: number; tamanho: number }) {
    const { itens, total } = await this.repo.listar(opts);
    return { itens: itens.map(projetar), pagina: opts.pagina, tamanho: opts.tamanho, total };
  }

  async obter(id: string) {
    const s = await this.repo.porId(id);
    if (!s) throw new NotFoundException('segmento não encontrado');
    return projetar(s);
  }

  async criar(dto: CriarSegmentoDto, autor: string) {
    const validado = validarFiltro(dto.alvo, dto.filtro);
    if (!validado.ok) throw new UnprocessableEntityException(validado.erro);

    const s = await this.repo.criar({
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      alvo: dto.alvo,
      filtro: validado.valor.filtro as never,
      criadoPor: await this.resolverCriadoPor(autor),
    });
    await this.audit.registrar({
      autor,
      entidade: 'segmento',
      entidadeId: s.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: snapshot(s),
      motivo: 'segmento_criado',
    });
    return projetar(s);
  }

  async atualizar(id: string, dto: AtualizarSegmentoDto, autor: string) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('segmento não encontrado');

    const data: Prisma.SegmentoUncheckedUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.descricao !== undefined) data.descricao = dto.descricao ?? null;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.filtro !== undefined) {
      const validado = validarFiltro(antes.alvo, dto.filtro);
      if (!validado.ok) {
        throw new UnprocessableEntityException(validado.erro);
      }
      data.filtro = validado.valor.filtro as never;
    }

    const atualizado = Object.keys(data).length > 0 ? await this.repo.atualizar(id, data) : antes;
    await this.audit.registrar({
      autor,
      entidade: 'segmento',
      entidadeId: id,
      campo: 'segmento',
      valorAnterior: snapshot(antes),
      valorNovo: snapshot(atualizado),
      motivo: 'segmento_editado',
    });
    return projetar(atualizado);
  }

  async remover(id: string, autor: string) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('segmento não encontrado');
    await this.repo.remover(id);
    await this.audit.registrar({
      autor,
      entidade: 'segmento',
      entidadeId: id,
      campo: 'removido',
      valorAnterior: snapshot(antes),
      valorNovo: null,
      motivo: 'segmento_removido',
    });
  }

  async listarMembros(id: string, req: Request, paginacao: { pagina: number; tamanho: number }) {
    const s = await this.repo.porId(id);
    if (!s) throw new NotFoundException('segmento não encontrado');

    const validado = validarFiltro(s.alvo, s.filtro);
    const whereFiltro = validado.ok ? construirWhere(validado.valor) : {};

    if (s.alvo === 'LEAD') {
      const whereEscopo = await this.leadConsulta.escopoDe(req);
      const where = { AND: [whereFiltro, whereEscopo] } as Prisma.LeadWhereInput;
      const { itens, total } = await this.repo.membrosLead(where, paginacao);
      return { itens, pagina: paginacao.pagina, tamanho: paginacao.tamanho, total };
    }

    const perms = await this.rbac.permissoesDe(req);
    if (!perms.has('pessoa:ver')) throw new ForbiddenException('permissão insuficiente');
    const { itens, total } = await this.repo.membrosPessoa(
      whereFiltro as Prisma.PessoaWhereInput,
      paginacao,
    );
    return { itens, pagina: paginacao.pagina, tamanho: paginacao.tamanho, total };
  }
}
