import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type TagRow = Prisma.TagGetPayload<Record<string, never>>;

export interface TagComUsos extends TagRow {
  usos: { lead: number; pessoa: number; interacao: number };
}

@Injectable()
export class TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  porId(id: string): Promise<TagRow | null> {
    return this.prisma.tag.findUnique({ where: { id } });
  }

  porSlug(slug: string): Promise<TagRow | null> {
    return this.prisma.tag.findUnique({ where: { slug } });
  }

  async criar(data: { slug: string; rotulo: string; cor?: string | null }): Promise<TagRow> {
    return this.prisma.tag.create({
      data: { id: EntidadeId.novo().value, slug: data.slug, rotulo: data.rotulo, cor: data.cor ?? null },
    });
  }

  atualizar(id: string, data: Prisma.TagUncheckedUpdateInput): Promise<TagRow> {
    return this.prisma.tag.update({ where: { id }, data });
  }

  /** Catálogo completo com contagem de uso por tipo de âncora — sempre derivado. */
  async listarCatalogo(): Promise<TagComUsos[]> {
    const [tags, porLead, porPessoa, porInteracao] = await Promise.all([
      this.prisma.tag.findMany({ orderBy: [{ rotulo: 'asc' }] }),
      this.prisma.tagAssociacao.groupBy({
        by: ['tagId'],
        where: { leadId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.tagAssociacao.groupBy({
        by: ['tagId'],
        where: { pessoaId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.tagAssociacao.groupBy({
        by: ['tagId'],
        where: { interacaoId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const mapa = (rows: { tagId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.tagId, r._count._all]));
    const lead = mapa(porLead);
    const pessoa = mapa(porPessoa);
    const interacao = mapa(porInteracao);
    return tags.map((t) => ({
      ...t,
      usos: {
        lead: lead.get(t.id) ?? 0,
        pessoa: pessoa.get(t.id) ?? 0,
        interacao: interacao.get(t.id) ?? 0,
      },
    }));
  }
}
