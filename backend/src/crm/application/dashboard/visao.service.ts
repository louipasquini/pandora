import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { EntidadeId } from '../../../core/core.module';
import { ehPainelConhecido } from '../../domain/dashboard';
import type {
  AtualizarVisaoDto,
  CriarVisaoDto,
} from '../../dto/dashboard/dashboard.schema';
import {
  DashboardVisaoRepository,
  type DashboardVisaoRow,
} from '../../infra/dashboard';
import { CrmDashboardAuditService } from './crm-dashboard-audit.service';

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

/**
 * Visões salvas do dashboard (spec 017, US5 / FR-013 / D-07). Preferência de
 * leitura — não é fonte de métrica. Só o dono edita/exclui; visão compartilhada
 * com um perfil é somente-leitura + clonável para os demais daquele perfil.
 */
@Injectable()
export class DashboardVisaoService {
  constructor(
    private readonly repo: DashboardVisaoRepository,
    private readonly audit: CrmDashboardAuditService,
  ) {}

  private async donoReal(req: Request): Promise<string> {
    const s = sub(req);
    if (!s || !EntidadeId.isValido(s) || !(await this.repo.usuarioExiste(s))) {
      throw new BadRequestException(
        'apenas um usuário real pode salvar visões (a credencial de serviço não pode)',
      );
    }
    return s;
  }

  private projetar(v: DashboardVisaoRow, dono: boolean) {
    return {
      id: v.id,
      nome: v.nome,
      filtros: v.filtros,
      paineis: (Array.isArray(v.paineis) ? (v.paineis as unknown[]) : []).filter(
        (id): id is string => typeof id === 'string' && ehPainelConhecido(id),
      ),
      dono,
      somenteLeitura: !dono,
      perfilCompartilhadoId: v.perfilCompartilhadoId,
    };
  }

  async listar(req: Request) {
    const s = sub(req);
    if (!s || !EntidadeId.isValido(s)) return { itens: [] };

    const [proprias, perfis] = await Promise.all([
      this.repo.listarDoDono(s),
      this.repo.perfisDoUsuario(s),
    ]);
    const compartilhadas = (await this.repo.listarCompartilhadasComPerfis(perfis)).filter(
      (v) => v.donoUsuarioId !== s,
    );

    return {
      itens: [
        ...proprias.map((v) => this.projetar(v, true)),
        ...compartilhadas.map((v) => this.projetar(v, false)),
      ],
    };
  }

  async criar(dto: CriarVisaoDto, req: Request) {
    const dono = await this.donoReal(req);
    const desconhecido = dto.paineis.find((id) => !ehPainelConhecido(id));
    if (desconhecido) {
      throw new UnprocessableEntityException(`painel desconhecido: ${desconhecido}`);
    }
    if (dto.perfilCompartilhadoId && !(await this.repo.perfilExiste(dto.perfilCompartilhadoId))) {
      throw new UnprocessableEntityException('perfil não encontrado');
    }

    const criada = await this.repo.criar({
      nome: dto.nome,
      filtros: dto.filtros as never,
      paineis: dto.paineis as never,
      donoUsuarioId: dono,
      perfilCompartilhadoId: dto.perfilCompartilhadoId ?? null,
    });

    await this.audit.registrar({
      autor: dono,
      entidade: 'dashboard_visao',
      entidadeId: criada.id,
      campo: '*',
      valorAnterior: null,
      valorNovo: { nome: criada.nome, paineis: dto.paineis },
      motivo: 'criar',
    });
    return this.projetar(criada, true);
  }

  async atualizar(id: string, dto: AtualizarVisaoDto, req: Request) {
    const s = sub(req);
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('visão não encontrada');
    if (!s || antes.donoUsuarioId !== s) {
      throw new ForbiddenException('apenas o dono pode editar a visão');
    }
    const desconhecido = dto.paineis?.find((id) => !ehPainelConhecido(id));
    if (desconhecido) {
      throw new UnprocessableEntityException(`painel desconhecido: ${desconhecido}`);
    }
    if (
      dto.perfilCompartilhadoId &&
      !(await this.repo.perfilExiste(dto.perfilCompartilhadoId))
    ) {
      throw new UnprocessableEntityException('perfil não encontrado');
    }

    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.filtros !== undefined) data.filtros = dto.filtros;
    if (dto.paineis !== undefined) data.paineis = dto.paineis;
    if (dto.perfilCompartilhadoId !== undefined) {
      data.perfilCompartilhadoId = dto.perfilCompartilhadoId ?? null;
    }

    const depois = await this.repo.atualizarCampos(id, data as never);

    for (const campo of ['nome', 'filtros', 'paineis', 'perfilCompartilhadoId'] as const) {
      await this.audit.registrar({
        autor: s,
        entidade: 'dashboard_visao',
        entidadeId: id,
        campo,
        valorAnterior: (antes as Record<string, unknown>)[campo] ?? null,
        valorNovo: (depois as Record<string, unknown>)[campo] ?? null,
        motivo: 'atualizar',
      });
    }
    return this.projetar(depois, true);
  }

  async remover(id: string, req: Request) {
    const s = sub(req);
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('visão não encontrada');
    if (!s || antes.donoUsuarioId !== s) {
      throw new ForbiddenException('apenas o dono pode excluir a visão');
    }
    await this.repo.remover(id);
    await this.audit.registrar({
      autor: s,
      entidade: 'dashboard_visao',
      entidadeId: id,
      campo: '*',
      valorAnterior: { nome: antes.nome },
      valorNovo: null,
      motivo: 'remover',
    });
  }

  async clonar(id: string, req: Request) {
    const dono = await this.donoReal(req);
    const original = await this.repo.porId(id);
    if (!original) throw new NotFoundException('visão não encontrada');

    if (original.donoUsuarioId !== dono) {
      const perfis = new Set(await this.repo.perfisDoUsuario(dono));
      if (!original.perfilCompartilhadoId || !perfis.has(original.perfilCompartilhadoId)) {
        throw new NotFoundException('visão não encontrada');
      }
    }

    const copia = await this.repo.criar({
      nome: `${original.nome} (cópia)`,
      filtros: original.filtros as never,
      paineis: original.paineis as never,
      donoUsuarioId: dono,
      perfilCompartilhadoId: null,
    });
    await this.audit.registrar({
      autor: dono,
      entidade: 'dashboard_visao',
      entidadeId: copia.id,
      campo: '*',
      valorAnterior: null,
      valorNovo: { nome: copia.nome, clonadaDe: id },
      motivo: 'criar',
    });
    return this.projetar(copia, true);
  }
}
