import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type SegmentoRow = Prisma.SegmentoGetPayload<Record<string, never>>;

@Injectable()
export class SegmentoRepository {
  constructor(private readonly prisma: PrismaService) {}

  porId(id: string): Promise<SegmentoRow | null> {
    return this.prisma.segmento.findUnique({ where: { id } });
  }

  listar(opts: { pagina: number; tamanho: number }): Promise<{
    itens: SegmentoRow[];
    total: number;
  }> {
    return this.prisma
      .$transaction([
        this.prisma.segmento.findMany({
          orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
          skip: (opts.pagina - 1) * opts.tamanho,
          take: opts.tamanho,
        }),
        this.prisma.segmento.count(),
      ])
      .then(([itens, total]) => ({ itens, total }));
  }

  async criar(
    data: Omit<Prisma.SegmentoUncheckedCreateInput, 'id'>,
  ): Promise<SegmentoRow> {
    return this.prisma.segmento.create({ data: { id: EntidadeId.novo().value, ...data } });
  }

  atualizar(id: string, data: Prisma.SegmentoUncheckedUpdateInput): Promise<SegmentoRow> {
    return this.prisma.segmento.update({ where: { id }, data });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.segmento.delete({ where: { id } });
  }

  /** `where` já combina o filtro do segmento **e** o escopo de visão do sujeito. */
  async membrosLead(
    where: Prisma.LeadWhereInput,
    opts: { pagina: number; tamanho: number },
  ): Promise<{ itens: unknown[]; total: number }> {
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (opts.pagina - 1) * opts.tamanho,
        take: opts.tamanho,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { itens, total };
  }

  async membrosPessoa(
    where: Prisma.PessoaWhereInput,
    opts: { pagina: number; tamanho: number },
  ): Promise<{ itens: unknown[]; total: number }> {
    const select = { id: true, nome: true, tipo: true, criadoEm: true } as const;
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.pessoa.findMany({
        where,
        select,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (opts.pagina - 1) * opts.tamanho,
        take: opts.tamanho,
      }),
      this.prisma.pessoa.count({ where }),
    ]);
    return { itens, total };
  }
}
