import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type InteracaoRow = Prisma.InteracaoGetPayload<Record<string, never>>;

export interface PaginacaoOpts {
  pagina: number;
  tamanho: number;
  tipo?: string;
  desde?: Date;
  ate?: Date;
  incluirRemovidas?: boolean;
}

function whereComum(opts: PaginacaoOpts): Prisma.InteracaoWhereInput {
  const and: Prisma.InteracaoWhereInput[] = [];
  if (opts.tipo) and.push({ tipo: opts.tipo as never });
  if (opts.desde) and.push({ ocorridoEm: { gte: opts.desde } });
  if (opts.ate) and.push({ ocorridoEm: { lte: opts.ate } });
  if (!opts.incluirRemovidas) and.push({ removidoEm: null });
  return and.length ? { AND: and } : {};
}

@Injectable()
export class InteracaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  porId(id: string): Promise<InteracaoRow | null> {
    return this.prisma.interacao.findUnique({ where: { id } });
  }

  porChaveOrigem(canalOrigem: string, idExterno: string): Promise<InteracaoRow | null> {
    return this.prisma.interacao.findFirst({ where: { canalOrigem, idExterno } });
  }

  async pessoaExiste(id: string): Promise<boolean> {
    const p = await this.prisma.pessoa.findUnique({ where: { id }, select: { id: true } });
    return p != null;
  }

  async criar(
    data: Omit<Prisma.InteracaoUncheckedCreateInput, 'id'>,
  ): Promise<InteracaoRow> {
    return this.prisma.interacao.create({ data: { id: EntidadeId.novo().value, ...data } });
  }

  editarNota(id: string, conteudo: string, editadoEm: Date): Promise<InteracaoRow> {
    return this.prisma.interacao.update({ where: { id }, data: { conteudo, editadoEm } });
  }

  removerNota(id: string, removidoEm: Date): Promise<InteracaoRow> {
    return this.prisma.interacao.update({ where: { id }, data: { removidoEm } });
  }

  /** Timeline unida da pessoa (CL-01): próprias ∪ das de todo lead convertido nela. */
  async listarPorPessoa(
    pessoaId: string,
    opts: PaginacaoOpts,
  ): Promise<{ itens: InteracaoRow[]; total: number }> {
    const where: Prisma.InteracaoWhereInput = {
      AND: [
        { OR: [{ pessoaId }, { lead: { pessoaId } }] },
        whereComum(opts),
      ],
    };
    return this.listar(where, opts);
  }

  async listarPorLead(
    leadId: string,
    opts: PaginacaoOpts,
  ): Promise<{ itens: InteracaoRow[]; total: number }> {
    const where: Prisma.InteracaoWhereInput = { AND: [{ leadId }, whereComum(opts)] };
    return this.listar(where, opts);
  }

  private async listar(
    where: Prisma.InteracaoWhereInput,
    opts: PaginacaoOpts,
  ): Promise<{ itens: InteracaoRow[]; total: number }> {
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.interacao.findMany({
        where,
        orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }],
        skip: (opts.pagina - 1) * opts.tamanho,
        take: opts.tamanho,
      }),
      this.prisma.interacao.count({ where }),
    ]);
    return { itens, total };
  }
}
