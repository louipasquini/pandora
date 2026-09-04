import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type AncoraTag =
  | { tipo: 'lead'; id: string }
  | { tipo: 'pessoa'; id: string }
  | { tipo: 'interacao'; id: string };

export type TagAssociacaoRow = Prisma.TagAssociacaoGetPayload<{ include: { tag: true } }>;

function whereAncora(ancora: AncoraTag): Prisma.TagAssociacaoWhereInput {
  if (ancora.tipo === 'lead') return { leadId: ancora.id };
  if (ancora.tipo === 'pessoa') return { pessoaId: ancora.id };
  return { interacaoId: ancora.id };
}

function dataAncora(ancora: AncoraTag): Pick<
  Prisma.TagAssociacaoUncheckedCreateInput,
  'leadId' | 'pessoaId' | 'interacaoId'
> {
  return {
    leadId: ancora.tipo === 'lead' ? ancora.id : null,
    pessoaId: ancora.tipo === 'pessoa' ? ancora.id : null,
    interacaoId: ancora.tipo === 'interacao' ? ancora.id : null,
  };
}

@Injectable()
export class TagAssociacaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  buscar(tagId: string, ancora: AncoraTag): Promise<TagAssociacaoRow | null> {
    return this.prisma.tagAssociacao.findFirst({
      where: { tagId, ...whereAncora(ancora) },
      include: { tag: true },
    });
  }

  listarPorAncora(ancora: AncoraTag): Promise<TagAssociacaoRow[]> {
    return this.prisma.tagAssociacao.findMany({
      where: whereAncora(ancora),
      include: { tag: true },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }

  /** Idempotente: se já existe, devolve a existente sem criar de novo (FR-016). */
  async associar(
    tagId: string,
    ancora: AncoraTag,
    criadoPor: string | null,
  ): Promise<{ criada: boolean; associacao: TagAssociacaoRow }> {
    const existente = await this.buscar(tagId, ancora);
    if (existente) return { criada: false, associacao: existente };
    const associacao = await this.prisma.tagAssociacao.create({
      data: {
        id: EntidadeId.novo().value,
        tagId,
        criadoPor,
        ...dataAncora(ancora),
      },
      include: { tag: true },
    });
    return { criada: true, associacao };
  }

  /** Idempotente: remover o que não existe é no-op. */
  async desassociar(tagId: string, ancora: AncoraTag): Promise<boolean> {
    const existente = await this.buscar(tagId, ancora);
    if (!existente) return false;
    await this.prisma.tagAssociacao.delete({ where: { id: existente.id } });
    return true;
  }
}
