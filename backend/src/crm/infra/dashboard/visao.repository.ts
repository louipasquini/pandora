import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type DashboardVisaoRow = Prisma.DashboardVisaoGetPayload<Record<string, never>>;

@Injectable()
export class DashboardVisaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  porId(id: string): Promise<DashboardVisaoRow | null> {
    return this.prisma.dashboardVisao.findUnique({ where: { id } });
  }

  listarDoDono(donoUsuarioId: string): Promise<DashboardVisaoRow[]> {
    return this.prisma.dashboardVisao.findMany({
      where: { donoUsuarioId },
      orderBy: { criadoEm: 'asc' },
    });
  }

  listarCompartilhadasComPerfis(perfilIds: string[]): Promise<DashboardVisaoRow[]> {
    if (perfilIds.length === 0) return Promise.resolve([]);
    return this.prisma.dashboardVisao.findMany({
      where: { perfilCompartilhadoId: { in: perfilIds } },
      orderBy: { criadoEm: 'asc' },
    });
  }

  criar(
    data: Omit<Prisma.DashboardVisaoUncheckedCreateInput, 'id'>,
  ): Promise<DashboardVisaoRow> {
    return this.prisma.dashboardVisao.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  atualizarCampos(
    id: string,
    data: Prisma.DashboardVisaoUncheckedUpdateInput,
  ): Promise<DashboardVisaoRow> {
    return this.prisma.dashboardVisao.update({ where: { id }, data });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.dashboardVisao.delete({ where: { id } });
  }

  async perfilExiste(id: string): Promise<boolean> {
    return (await this.prisma.perfil.count({ where: { id } })) > 0;
  }

  /** Ids dos perfis do usuário — para resolver visões compartilhadas (D-07). */
  async perfisDoUsuario(usuarioId: string): Promise<string[]> {
    const rows = await this.prisma.usuarioPerfil.findMany({
      where: { usuarioId },
      select: { perfilId: true },
    });
    return rows.map((r) => r.perfilId);
  }

  async usuarioExiste(id: string): Promise<boolean> {
    return (await this.prisma.usuario.count({ where: { id } })) > 0;
  }
}
