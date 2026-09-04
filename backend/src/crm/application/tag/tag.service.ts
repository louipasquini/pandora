import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { normalizarTag } from '../../domain/tag/normalizar-tag';
import type { CriarTagDto, AtualizarTagDto } from '../../dto/tag.schema';
import {
  TagAssociacaoRepository,
  type AncoraTag,
} from '../../infra/tag/tag-associacao.repository';
import { TagRepository, type TagComUsos } from '../../infra/tag/tag.repository';
import { InteracaoRepository } from '../../infra/interacao/interacao.repository';
import { LeadRepository } from '../../infra/lead/lead.repository';
import { CrmAdminAuditService } from '../crm-admin-audit.service';
import { CrmLeadAuditService } from '../lead/crm-lead-audit.service';
import { CrmInteracaoAuditService } from '../interacao/crm-interacao-audit.service';

function auditServicoDe(ancora: AncoraTag) {
  return ancora.tipo === 'lead' ? ('lead' as const) : ('interacao' as const);
}

/**
 * Catálogo de `tag` compartilhado por lead\|pessoa\|interacao (spec 009,
 * CL-04 — promove o `lead.tags: String[]` da 008 a entidade de 1ª classe).
 * Associar por **texto** faz _upsert_ por slug (reaproveita se já existe);
 * associar/desassociar é **idempotente** (FR-016). Tag `ativo=false` não
 * aceita **novo** uso (422), mas associações existentes permanecem.
 *
 * Roteamento de auditoria: tag em `lead` → `crm_lead_audit` (contrato 008
 * preservado); tag em `pessoa`/`interacao` → `crm_interacao_audit` (nova);
 * catálogo (criar/renomear/desativar) → `crm_admin_audit` (007).
 */
@Injectable()
export class TagService {
  constructor(
    private readonly tags: TagRepository,
    private readonly associacoes: TagAssociacaoRepository,
    private readonly adminAudit: CrmAdminAuditService,
    private readonly leadAudit: CrmLeadAuditService,
    private readonly interacaoAudit: CrmInteracaoAuditService,
    private readonly leads: LeadRepository,
    private readonly interacoes: InteracaoRepository,
  ) {}

  async listarCatalogo(): Promise<TagComUsos[]> {
    return this.tags.listarCatalogo();
  }

  private async ancoraExiste(ancora: AncoraTag): Promise<boolean> {
    if (ancora.tipo === 'lead') return (await this.leads.porId(ancora.id)) != null;
    if (ancora.tipo === 'pessoa') return this.interacoes.pessoaExiste(ancora.id);
    return (await this.interacoes.porId(ancora.id)) != null;
  }

  /**
   * Igual a `associar`, mas **sem** gravar auditoria própria — para quando o
   * chamador (ex.: `LeadService.criar`) vai embutir o resultado num único
   * registro de auditoria maior (ex.: "lead criado com tags X, Y").
   */
  async resolverEAssociarSemAuditoria(
    ancora: AncoraTag,
    textoBruto: string,
    criadoPor: string | null,
  ) {
    const tag = await this.resolverOuCriar(textoBruto);
    await this.associacoes.associar(tag.id, ancora, criadoPor);
    return tag;
  }

  /** _Upsert_ por slug; tag inativa resolvida por texto → 422 (não aceita novo uso). */
  private async resolverOuCriar(textoBruto: string) {
    const n = normalizarTag(textoBruto);
    if (n.erro !== undefined) throw new UnprocessableEntityException(`tag: ${n.erro}`);
    const existente = await this.tags.porSlug(n.valor);
    if (existente) {
      if (!existente.ativo) {
        throw new UnprocessableEntityException(`tag "${n.valor}" está inativa`);
      }
      return existente;
    }
    return this.tags.criar({ slug: n.valor, rotulo: textoBruto.trim() || n.valor });
  }

  private async listarSlugs(ancora: AncoraTag): Promise<string[]> {
    const rows = await this.associacoes.listarPorAncora(ancora);
    return rows.map((r) => r.tag.slug);
  }

  async associar(ancora: AncoraTag, textoBruto: string, criadoPor: string | null, autor: string) {
    if (!(await this.ancoraExiste(ancora))) {
      throw new NotFoundException(`${ancora.tipo} não encontrado(a)`);
    }
    const tag = await this.resolverOuCriar(textoBruto);
    const antes = await this.listarSlugs(ancora);
    const { criada } = await this.associacoes.associar(tag.id, ancora, criadoPor);
    if (!criada) return { tag, associada: false, tags: antes };

    const depois = [...antes, tag.slug];
    await this.auditar(ancora, autor, antes, depois);
    return { tag, associada: true, tags: depois };
  }

  async desassociar(ancora: AncoraTag, textoBruto: string, autor: string) {
    if (!(await this.ancoraExiste(ancora))) {
      throw new NotFoundException(`${ancora.tipo} não encontrado(a)`);
    }
    const n = normalizarTag(textoBruto);
    if (n.erro !== undefined) throw new UnprocessableEntityException(`tag: ${n.erro}`);
    const tag = await this.tags.porSlug(n.valor);
    const antes = await this.listarSlugs(ancora);
    if (!tag) return { removida: false, tags: antes };

    const removida = await this.associacoes.desassociar(tag.id, ancora);
    if (!removida) return { removida: false, tags: antes };

    const depois = antes.filter((s) => s !== n.valor);
    await this.auditar(ancora, autor, antes, depois);
    return { removida: true, tags: depois };
  }

  private async auditar(ancora: AncoraTag, autor: string, antes: string[], depois: string[]) {
    if (auditServicoDe(ancora) === 'lead') {
      await this.leadAudit.registrar({
        autor,
        entidade: 'lead',
        entidadeId: ancora.id,
        campo: 'tags',
        valorAnterior: antes,
        valorNovo: depois,
        motivo: 'tag',
      });
    } else {
      await this.interacaoAudit.registrar({
        autor,
        entidade: 'tag_associacao',
        entidadeId: ancora.id,
        campo: 'tags',
        valorAnterior: antes,
        valorNovo: depois,
        motivo: 'tag',
      });
    }
  }

  // ------------------------------------------------------- catálogo (admin)

  async criarExplicita(dto: CriarTagDto, autor: string) {
    const n = normalizarTag(dto.tag);
    if (n.erro !== undefined) throw new UnprocessableEntityException(`tag: ${n.erro}`);
    const existente = await this.tags.porSlug(n.valor);
    if (existente) return existente;

    const tag = await this.tags.criar({ slug: n.valor, rotulo: dto.tag.trim(), cor: dto.cor });
    await this.adminAudit.registrar({
      autor,
      entidade: 'tag',
      entidadeId: tag.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: { slug: tag.slug, rotulo: tag.rotulo, cor: tag.cor },
      motivo: 'criar',
    });
    return tag;
  }

  async atualizar(id: string, dto: AtualizarTagDto, autor: string) {
    const antes = await this.tags.porId(id);
    if (!antes) throw new NotFoundException('tag não encontrada');

    const data: Record<string, unknown> = {};
    if (dto.rotulo !== undefined) data.rotulo = dto.rotulo;
    if (dto.cor !== undefined) data.cor = dto.cor;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const atualizado = Object.keys(data).length > 0 ? await this.tags.atualizar(id, data) : antes;
    await this.adminAudit.registrar({
      autor,
      entidade: 'tag',
      entidadeId: id,
      campo: 'tag',
      valorAnterior: { rotulo: antes.rotulo, cor: antes.cor, ativo: antes.ativo },
      valorNovo: { rotulo: atualizado.rotulo, cor: atualizado.cor, ativo: atualizado.ativo },
      motivo: 'atualizar',
    });
    return atualizado;
  }
}
