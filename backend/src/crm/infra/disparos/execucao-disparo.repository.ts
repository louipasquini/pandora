import { Injectable } from '@nestjs/common';
import { Prisma, type ExecucaoDisparoStatus } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type ExecucaoDisparoRow = Prisma.ExecucaoDisparoGetPayload<Record<string, never>>;

export interface ContagemPorStatus {
  status: string;
  total: number;
}

export interface ContagemPorVariante {
  variante: string | null;
  status: string;
  total: number;
}

@Injectable()
export class ExecucaoDisparoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criar(
    data: Omit<Prisma.ExecucaoDisparoUncheckedCreateInput, 'id'>,
  ): Promise<ExecucaoDisparoRow> {
    return this.prisma.execucaoDisparo.create({ data: { id: EntidadeId.novo().value, ...data } });
  }

  porId(id: string): Promise<ExecucaoDisparoRow | null> {
    return this.prisma.execucaoDisparo.findUnique({ where: { id } });
  }

  atualizar(
    id: string,
    data: Prisma.ExecucaoDisparoUncheckedUpdateInput,
  ): Promise<ExecucaoDisparoRow> {
    return this.prisma.execucaoDisparo.update({ where: { id }, data });
  }

  async listar(opts: {
    pagina: number;
    tamanho: number;
    status?: ExecucaoDisparoStatus;
    criadoDe?: Date;
    criadoAte?: Date;
  }): Promise<{ itens: ExecucaoDisparoRow[]; total: number }> {
    const where: Prisma.ExecucaoDisparoWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.criadoDe || opts.criadoAte
        ? {
            criadoEm: {
              ...(opts.criadoDe ? { gte: opts.criadoDe } : {}),
              ...(opts.criadoAte ? { lte: opts.criadoAte } : {}),
            },
          }
        : {}),
    };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.execucaoDisparo.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (opts.pagina - 1) * opts.tamanho,
        take: opts.tamanho,
      }),
      this.prisma.execucaoDisparo.count({ where }),
    ]);
    return { itens, total };
  }

  /** Contagens agregadas por status (Princípio V — sempre derivado, nunca contador). */
  async contarPorStatus(execucaoDisparoId: string): Promise<ContagemPorStatus[]> {
    const r = await this.prisma.mensagemDisparo.groupBy({
      by: ['status'],
      where: { execucaoDisparoId },
      _count: { _all: true },
    });
    return r.map((x) => ({ status: x.status, total: x._count._all }));
  }

  async contarPorVariante(execucaoDisparoId: string): Promise<ContagemPorVariante[]> {
    const r = await this.prisma.mensagemDisparo.groupBy({
      by: ['variante', 'status'],
      where: { execucaoDisparoId },
      _count: { _all: true },
    });
    return r.map((x) => ({ variante: x.variante, status: x.status, total: x._count._all }));
  }

  /** Execuções `AGENDADO` cujo horário já chegou (worker, spec 015). */
  agendadosProntos(agora: Date, limite: number): Promise<ExecucaoDisparoRow[]> {
    return this.prisma.execucaoDisparo.findMany({
      where: { status: 'AGENDADO', agendadoPara: { lte: agora } },
      orderBy: [{ agendadoPara: 'asc' }],
      take: limite,
    });
  }

  emAndamento(limite: number): Promise<ExecucaoDisparoRow[]> {
    return this.prisma.execucaoDisparo.findMany({
      where: { status: 'EM_ANDAMENTO' },
      orderBy: [{ iniciadoEm: 'asc' }],
      take: limite,
    });
  }
}
