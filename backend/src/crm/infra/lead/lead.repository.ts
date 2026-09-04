import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type LeadRow = Prisma.LeadGetPayload<Record<string, never>>;

@Injectable()
export class LeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma;
  }

  porId(id: string): Promise<LeadRow | null> {
    return this.prisma.lead.findUnique({ where: { id } });
  }

  /** Aplica o `where` de escopo já montado (nunca ampliado por filtros). */
  async listar(
    where: Prisma.LeadWhereInput,
    opts: { pagina: number; tamanho: number; ordenarPor: 'score' | 'criadoEm' },
  ): Promise<{ itens: LeadRow[]; total: number }> {
    const orderBy: Prisma.LeadOrderByWithRelationInput[] =
      opts.ordenarPor === 'criadoEm'
        ? [{ criadoEm: 'desc' }, { id: 'desc' }]
        : [{ score: 'desc' }, { criadoEm: 'desc' }, { id: 'desc' }];
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy,
        skip: (opts.pagina - 1) * opts.tamanho,
        take: opts.tamanho,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { itens, total };
  }

  obterNoEscopo(id: string, escopo: Prisma.LeadWhereInput): Promise<LeadRow | null> {
    return this.prisma.lead.findFirst({ where: { AND: [{ id }, escopo] } });
  }

  async semelhantesAtivos(
    email: string | null,
    telefone: string | null,
    excetoId?: string,
  ): Promise<string[]> {
    const ors: Prisma.LeadWhereInput[] = [];
    if (email) ors.push({ email });
    if (telefone) ors.push({ telefone });
    if (ors.length === 0) return [];
    const rows = await this.prisma.lead.findMany({
      where: {
        status: 'ATIVO',
        OR: ors,
        ...(excetoId ? { id: { not: excetoId } } : {}),
      },
      select: { id: true },
      take: 20,
    });
    return rows.map((r) => r.id);
  }

  async usuarioExiste(id: string): Promise<boolean> {
    const u = await this.prisma.usuario.findUnique({ where: { id }, select: { id: true } });
    return u != null;
  }

  async criar(
    data: Omit<Prisma.LeadUncheckedCreateInput, 'id'>,
    tx?: Prisma.TransactionClient,
  ): Promise<LeadRow> {
    return (tx ?? this.prisma).lead.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  async atualizar(
    id: string,
    data: Prisma.LeadUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<LeadRow> {
    return (tx ?? this.prisma).lead.update({ where: { id }, data });
  }

  porOrigemExterna(origem: string, idExterno: string): Promise<LeadRow | null> {
    return this.prisma.lead.findFirst({ where: { origem, idExterno } });
  }
}
