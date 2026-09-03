import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { FeriadoAplic, JanelaAplic } from '../domain';

@Injectable()
export class ExpedienteRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- janelas ----

  async criarJanela(dados: {
    equipeId: string | null;
    diaSemana: number;
    horaInicio: number;
    horaFim: number;
    ativo?: boolean;
  }): Promise<{ id: string }> {
    return this.prisma.janelaAtendimento.create({
      data: {
        id: EntidadeId.novo().value,
        equipeId: dados.equipeId,
        diaSemana: dados.diaSemana,
        horaInicio: dados.horaInicio,
        horaFim: dados.horaFim,
        ...(dados.ativo === undefined ? {} : { ativo: dados.ativo }),
      },
      select: { id: true },
    });
  }

  obterJanela(id: string) {
    return this.prisma.janelaAtendimento.findUnique({ where: { id } });
  }

  async atualizarJanela(
    id: string,
    dados: Prisma.JanelaAtendimentoUpdateInput,
  ): Promise<void> {
    await this.prisma.janelaAtendimento.update({ where: { id }, data: dados });
  }

  async removerJanela(id: string): Promise<void> {
    await this.prisma.janelaAtendimento.delete({ where: { id } });
  }

  listarJanelas(filtro: {
    equipeId?: string;
    incluirGlobais: boolean;
    ativo?: boolean;
  }) {
    const escopo: Prisma.JanelaAtendimentoWhereInput[] = [];
    if (filtro.incluirGlobais) escopo.push({ equipeId: null });
    if (filtro.equipeId) escopo.push({ equipeId: filtro.equipeId });
    return this.prisma.janelaAtendimento.findMany({
      where: {
        ...(escopo.length ? { OR: escopo } : {}),
        ...(filtro.ativo === undefined ? {} : { ativo: filtro.ativo }),
      },
      orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    });
  }

  // ---- feriados ----

  async criarFeriado(dados: {
    equipeId: string | null;
    data: string; // YYYY-MM-DD
    descricao: string;
    recorrenteAnual: boolean;
  }): Promise<{ id: string }> {
    return this.prisma.feriado.create({
      data: {
        id: EntidadeId.novo().value,
        equipeId: dados.equipeId,
        data: new Date(`${dados.data}T00:00:00Z`),
        descricao: dados.descricao,
        recorrenteAnual: dados.recorrenteAnual,
      },
      select: { id: true },
    });
  }

  obterFeriado(id: string) {
    return this.prisma.feriado.findUnique({ where: { id } });
  }

  async atualizarFeriado(
    id: string,
    dados: Prisma.FeriadoUpdateInput,
  ): Promise<void> {
    await this.prisma.feriado.update({ where: { id }, data: dados });
  }

  async removerFeriado(id: string): Promise<void> {
    await this.prisma.feriado.delete({ where: { id } });
  }

  listarFeriados(filtro: { equipeId?: string; incluirGlobais: boolean }) {
    const escopo: Prisma.FeriadoWhereInput[] = [];
    if (filtro.incluirGlobais) escopo.push({ equipeId: null });
    if (filtro.equipeId) escopo.push({ equipeId: filtro.equipeId });
    return this.prisma.feriado.findMany({
      where: escopo.length ? { OR: escopo } : {},
      orderBy: [{ data: 'asc' }],
    });
  }

  async equipeExiste(equipeId: string): Promise<boolean> {
    return (await this.prisma.equipe.count({ where: { id: equipeId } })) > 0;
  }

  // ---- avaliação ----

  /** Materializa janelas/feriados aplicáveis (globais + da equipe) + o `ativo` da equipe. */
  async carregarAplicaveis(equipeId?: string): Promise<{
    janelas: JanelaAplic[];
    feriados: FeriadoAplic[];
    equipe: { id: string; ativo: boolean } | null;
  }> {
    const escopo: Prisma.JanelaAtendimentoWhereInput = equipeId
      ? { OR: [{ equipeId: null }, { equipeId }] }
      : { equipeId: null };

    const [janelasRows, feriadosRows, equipe] = await Promise.all([
      this.prisma.janelaAtendimento.findMany({ where: escopo }),
      this.prisma.feriado.findMany({
        where: escopo as Prisma.FeriadoWhereInput,
      }),
      equipeId
        ? this.prisma.equipe.findUnique({
            where: { id: equipeId },
            select: { id: true, ativo: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      janelas: janelasRows.map((j) => ({
        equipeId: j.equipeId,
        diaSemana: j.diaSemana,
        inicioMin: j.horaInicio,
        fimMin: j.horaFim,
        ativo: j.ativo,
      })),
      feriados: feriadosRows.map((f) => {
        const d = f.data;
        return {
          equipeId: f.equipeId,
          mes: d.getUTCMonth() + 1,
          dia: d.getUTCDate(),
          ano: f.recorrenteAnual ? null : d.getUTCFullYear(),
          recorrenteAnual: f.recorrenteAnual,
        };
      }),
      equipe: equipe ?? null,
    };
  }
}
