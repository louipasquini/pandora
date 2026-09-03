import { Injectable } from '@nestjs/common';
import type { EquipeTipo, PapelEquipe, Prisma } from '@prisma/client';
import { EntidadeId, agoraUtc } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export interface EquipeResumo {
  id: string;
  nome: string;
  tipo: EquipeTipo;
  ativo: boolean;
  totalMembrosAtivos: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

@Injectable()
export class EquipeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dados: {
    nome: string;
    descricao?: string;
    tipo: EquipeTipo;
  }): Promise<{ id: string }> {
    const row = await this.prisma.equipe.create({
      data: {
        id: EntidadeId.novo().value,
        nome: dados.nome,
        descricao: dados.descricao ?? null,
        tipo: dados.tipo,
      },
      select: { id: true },
    });
    return row;
  }

  async atualizar(
    id: string,
    dados: Prisma.EquipeUpdateInput,
  ): Promise<void> {
    await this.prisma.equipe.update({ where: { id }, data: dados });
  }

  obter(id: string) {
    return this.prisma.equipe.findUnique({ where: { id } });
  }

  async listar(filtro: {
    ativo?: boolean;
    tipo?: EquipeTipo;
    usuarioId?: string;
    pagina: number;
    tamanho: number;
  }): Promise<{ itens: EquipeResumo[]; total: number }> {
    const where: Prisma.EquipeWhereInput = {
      ...(filtro.ativo === undefined ? {} : { ativo: filtro.ativo }),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      ...(filtro.usuarioId
        ? { membros: { some: { usuarioId: filtro.usuarioId, saiuEm: null } } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.equipe.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.tamanho,
        take: filtro.tamanho,
        include: { _count: { select: { membros: { where: { saiuEm: null } } } } },
      }),
      this.prisma.equipe.count({ where }),
    ]);
    return {
      total,
      itens: rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        tipo: r.tipo,
        ativo: r.ativo,
        totalMembrosAtivos: r._count.membros,
        criadoEm: r.criadoEm,
        atualizadoEm: r.atualizadoEm,
      })),
    };
  }

  membrosAtivos(equipeId: string) {
    return this.prisma.equipeMembro.findMany({
      where: { equipeId, saiuEm: null },
      orderBy: { entrouEm: 'asc' },
      include: { usuario: { select: { nome: true, email: true } } },
    });
  }

  historicoMembros(equipeId: string) {
    return this.prisma.equipeMembro.findMany({
      where: { equipeId },
      orderBy: [{ entrouEm: 'asc' }],
    });
  }

  vinculoAtivo(equipeId: string, usuarioId: string) {
    return this.prisma.equipeMembro.findFirst({
      where: { equipeId, usuarioId, saiuEm: null },
    });
  }

  async usuarioExiste(usuarioId: string): Promise<boolean> {
    return (
      (await this.prisma.usuario.count({ where: { id: usuarioId } })) > 0
    );
  }

  async adicionarMembro(dados: {
    equipeId: string;
    usuarioId: string;
    papel: PapelEquipe;
  }): Promise<{ id: string; entrouEm: Date }> {
    const entrouEm = agoraUtc();
    const row = await this.prisma.equipeMembro.create({
      data: {
        id: EntidadeId.novo().value,
        equipeId: dados.equipeId,
        usuarioId: dados.usuarioId,
        papel: dados.papel,
        entrouEm,
      },
      select: { id: true, entrouEm: true },
    });
    return row;
  }

  async trocarPapel(vinculoId: string, papel: PapelEquipe): Promise<void> {
    await this.prisma.equipeMembro.update({
      where: { id: vinculoId },
      data: { papel },
    });
  }

  async marcarSaida(vinculoId: string): Promise<void> {
    await this.prisma.equipeMembro.update({
      where: { id: vinculoId },
      data: { saiuEm: agoraUtc() },
    });
  }
}
