import { Injectable } from '@nestjs/common';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSOES, PERMISSAO_IDS } from './catalogo';
import type { PerfilResolucao } from './resolver-permissoes';

/** Ordem canônica das permissões (índice no catálogo) para ordenação estável. */
const ORDEM_PERMISSAO = new Map<string, number>(
  PERMISSOES.map((p, i) => [p.id, i]),
);
function ordenarPorCatalogo(ids: string[]): string[] {
  return [...ids].sort(
    (a, b) => (ORDEM_PERMISSAO.get(a) ?? 999) - (ORDEM_PERMISSAO.get(b) ?? 999),
  );
}

export interface PerfilDetalhe {
  id: string;
  nome: string;
  deSistema: boolean;
  permissoes: string[];
  permissoesDesconhecidas: string[];
  totalUsuarios: number;
}

export interface UsuarioDetalhe {
  id: string;
  nome: string;
  email: string;
  perfis: { id: string; nome: string }[];
  criadoEm: Date;
}

/**
 * Acesso Prisma do RBAC (spec 004). Sem regra de negócio — só leitura/escrita.
 * `rbac_audit` é escrito pelo `RbacAuditService`; aqui nunca há UPDATE/DELETE nela.
 */
@Injectable()
export class RbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- resolução ---

  async perfisDoUsuario(usuarioId: string): Promise<PerfilResolucao[]> {
    const vinculos = await this.prisma.usuarioPerfil.findMany({
      where: { usuarioId },
      select: { perfil: { select: { id: true, permissoes: { select: { permissao: true } } } } },
    });
    return vinculos.map((v) => ({
      id: v.perfil.id,
      permissoes: v.perfil.permissoes.map((p) => p.permissao),
    }));
  }

  // --- perfis ---

  async listarPerfis(): Promise<PerfilDetalhe[]> {
    const perfis = await this.prisma.perfil.findMany({
      orderBy: { nomeNormalizado: 'asc' },
      select: {
        id: true,
        nome: true,
        deSistema: true,
        permissoes: { select: { permissao: true } },
        _count: { select: { usuarios: true } },
      },
    });
    return perfis.map((p) => {
      const todas = p.permissoes.map((x) => x.permissao);
      return {
        id: p.id,
        nome: p.nome,
        deSistema: p.deSistema,
        permissoes: ordenarPorCatalogo(todas.filter((x) => PERMISSAO_IDS.has(x))),
        permissoesDesconhecidas: todas.filter((x) => !PERMISSAO_IDS.has(x)).sort(),
        totalUsuarios: p._count.usuarios,
      };
    });
  }

  async perfilDetalhe(id: string): Promise<PerfilDetalhe | null> {
    const p = await this.prisma.perfil.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        deSistema: true,
        permissoes: { select: { permissao: true } },
        _count: { select: { usuarios: true } },
      },
    });
    if (!p) return null;
    const todas = p.permissoes.map((x) => x.permissao);
    return {
      id: p.id,
      nome: p.nome,
      deSistema: p.deSistema,
      permissoes: ordenarPorCatalogo(todas.filter((x) => PERMISSAO_IDS.has(x))),
      permissoesDesconhecidas: todas.filter((x) => !PERMISSAO_IDS.has(x)).sort(),
      totalUsuarios: p._count.usuarios,
    };
  }

  perfilPorNomeNormalizado(nomeNormalizado: string) {
    return this.prisma.perfil.findUnique({ where: { nomeNormalizado } });
  }

  async criarPerfil(dados: {
    nome: string;
    nomeNormalizado: string;
    permissoes: string[];
  }): Promise<PerfilDetalhe> {
    const id = EntidadeId.novo().value;
    await this.prisma.perfil.create({
      data: {
        id,
        nome: dados.nome,
        nomeNormalizado: dados.nomeNormalizado,
        deSistema: false,
        permissoes: { create: dados.permissoes.map((permissao) => ({ permissao })) },
      },
    });
    return (await this.perfilDetalhe(id))!;
  }

  async renomearPerfil(id: string, nome: string, nomeNormalizado: string): Promise<void> {
    await this.prisma.perfil.update({
      where: { id },
      data: { nome, nomeNormalizado },
    });
  }

  async setPermissoesPerfil(id: string, permissoes: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.perfilPermissao.deleteMany({ where: { perfilId: id } }),
      this.prisma.perfilPermissao.createMany({
        data: permissoes.map((permissao) => ({ perfilId: id, permissao })),
      }),
    ]);
  }

  async apagarPerfil(id: string): Promise<void> {
    await this.prisma.perfil.delete({ where: { id } });
  }

  // --- usuários ---

  async listarUsuarios(): Promise<UsuarioDetalhe[]> {
    const usuarios = await this.prisma.usuario.findMany({
      orderBy: { criadoEm: 'asc' },
      select: {
        id: true,
        nome: true,
        email: true,
        criadoEm: true,
        perfis: {
          select: { perfil: { select: { id: true, nome: true } } },
          orderBy: { perfil: { nomeNormalizado: 'asc' } },
        },
      },
    });
    return usuarios.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      criadoEm: u.criadoEm,
      perfis: u.perfis.map((v) => ({ id: v.perfil.id, nome: v.perfil.nome })),
    }));
  }

  usuarioPorId(id: string) {
    return this.prisma.usuario.findUnique({ where: { id } });
  }

  usuarioPorEmailNormalizado(emailNormalizado: string) {
    return this.prisma.usuario.findUnique({ where: { emailNormalizado } });
  }

  async criarUsuario(dados: {
    nome: string;
    email: string;
    emailNormalizado: string;
  }): Promise<UsuarioDetalhe> {
    const id = EntidadeId.novo().value;
    const u = await this.prisma.usuario.create({
      data: { id, nome: dados.nome, email: dados.email, emailNormalizado: dados.emailNormalizado },
    });
    return { id: u.id, nome: u.nome, email: u.email, criadoEm: u.criadoEm, perfis: [] };
  }

  async perfisDoUsuarioComNome(
    usuarioId: string,
  ): Promise<{ id: string; nome: string }[]> {
    const vinculos = await this.prisma.usuarioPerfil.findMany({
      where: { usuarioId },
      select: { perfil: { select: { id: true, nome: true, nomeNormalizado: true } } },
      orderBy: { perfil: { nomeNormalizado: 'asc' } },
    });
    return vinculos.map((v) => ({ id: v.perfil.id, nome: v.perfil.nome }));
  }

  async perfisDoUsuarioIds(usuarioId: string): Promise<string[]> {
    const vinculos = await this.prisma.usuarioPerfil.findMany({
      where: { usuarioId },
      select: { perfilId: true },
    });
    return vinculos.map((v) => v.perfilId);
  }

  /** Dos ids pedidos, quais existem de fato. */
  async perfilIdsExistentes(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const achados = await this.prisma.perfil.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(achados.map((p) => p.id));
  }

  /** Substitui o conjunto de perfis do usuário (diff em transação). */
  async setPerfisDoUsuario(usuarioId: string, perfilIds: string[]): Promise<void> {
    const atuais = new Set(await this.perfisDoUsuarioIds(usuarioId));
    const novos = new Set(perfilIds);
    const remover = [...atuais].filter((id) => !novos.has(id));
    const adicionar = [...novos].filter((id) => !atuais.has(id));
    await this.prisma.$transaction([
      this.prisma.usuarioPerfil.deleteMany({
        where: { usuarioId, perfilId: { in: remover } },
      }),
      this.prisma.usuarioPerfil.createMany({
        data: adicionar.map((perfilId) => ({ usuarioId, perfilId })),
      }),
    ]);
  }

  // --- anti-lockout / diagnóstico ---

  /** `true` se algum perfil (fora o `administrador`) concede `perfil:administrar`. */
  async algumPerfilConcedeAdministrar(): Promise<boolean> {
    const n = await this.prisma.perfilPermissao.count({
      where: { permissao: 'perfil:administrar' },
    });
    return n > 0;
  }
}
