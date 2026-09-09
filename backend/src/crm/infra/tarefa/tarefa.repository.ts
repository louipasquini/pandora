import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type TarefaRow = Prisma.TarefaGetPayload<{
  include: { checklist: true; periodos: true };
}>;

export interface PaginacaoOpts {
  pagina: number;
  tamanho: number;
}

const INCLUDE = { checklist: true, periodos: true } as const;

@Injectable()
export class TarefaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async pessoaExiste(id: string): Promise<boolean> {
    return (await this.prisma.pessoa.count({ where: { id } })) > 0;
  }

  async leadExiste(id: string): Promise<boolean> {
    return (await this.prisma.lead.count({ where: { id } })) > 0;
  }

  async oportunidadeExiste(id: string): Promise<boolean> {
    return (await this.prisma.oportunidade.count({ where: { id } })) > 0;
  }

  async usuarioExiste(id: string): Promise<boolean> {
    return (await this.prisma.usuario.count({ where: { id } })) > 0;
  }

  porId(id: string): Promise<TarefaRow | null> {
    return this.prisma.tarefa.findUnique({ where: { id }, include: INCLUDE });
  }

  async criar(data: Omit<Prisma.TarefaUncheckedCreateInput, 'id'>): Promise<TarefaRow> {
    const row = await this.prisma.tarefa.create({
      data: { id: EntidadeId.novo().value, ...data },
      include: INCLUDE,
    });
    return row;
  }

  async atualizarCampos(
    id: string,
    data: Prisma.TarefaUncheckedUpdateInput,
  ): Promise<TarefaRow> {
    return this.prisma.tarefa.update({ where: { id }, data, include: INCLUDE });
  }

  async listar(
    where: Prisma.TarefaWhereInput,
    opts: PaginacaoOpts,
  ): Promise<{ itens: TarefaRow[]; total: number }> {
    const [itens, total] = await Promise.all([
      this.prisma.tarefa.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ dataVencimento: 'asc' }, { criadoEm: 'desc' }],
        skip: (opts.pagina - 1) * opts.tamanho,
        take: opts.tamanho,
      }),
      this.prisma.tarefa.count({ where }),
    ]);
    return { itens, total };
  }

  /** Sem paginação — usado pelo ranking (research.md D-R4), volume baixo assumido. */
  listarTodas(where: Prisma.TarefaWhereInput): Promise<TarefaRow[]> {
    return this.prisma.tarefa.findMany({ where, include: INCLUDE });
  }

  listarPorPessoa(pessoaId: string): Promise<TarefaRow[]> {
    return this.prisma.tarefa.findMany({
      where: { pessoaId },
      include: INCLUDE,
      orderBy: { criadoEm: 'desc' },
    });
  }
}
