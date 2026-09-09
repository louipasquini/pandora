import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { TarefaRepository, type TarefaRow } from '../../infra/tarefa/tarefa.repository';
import { projetarTarefa, type TarefaProjetada } from './projetar-tarefa';
import type { ListarTarefasDto } from '../../dto/tarefa.schema';

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

/**
 * Escopo de visão de `tarefa` (spec 016, D-08) — mesmo padrão "OU" + filtro no
 * `where` de `OportunidadeConsultaService` (010), com a nuance de D-08:
 * `ver_proprias` inclui as tarefas **sem** responsável (tarefa "geral",
 * D-07 — é de todo mundo, por definição).
 */
@Injectable()
export class TarefaConsultaService {
  constructor(
    private readonly repo: TarefaRepository,
    private readonly rbac: SujeitoRbacService,
  ) {}

  async escopoDe(req: Request): Promise<Prisma.TarefaWhereInput> {
    const perms = await this.rbac.permissoesDe(req);
    if (perms.has('tarefa:ver_todas')) return {};
    if (perms.has('tarefa:ver_proprias')) {
      const sujeito = sub(req) ?? '__sem_sujeito__';
      return { OR: [{ responsavelId: sujeito }, { responsavelId: null }] };
    }
    throw new ForbiddenException('permissão insuficiente');
  }

  async listar(dto: ListarTarefasDto, req: Request) {
    const escopo = await this.escopoDe(req);
    const and: Prisma.TarefaWhereInput[] = [escopo];
    if (dto.status) and.push({ status: dto.status });
    if (dto.responsavelId) and.push({ responsavelId: dto.responsavelId });
    if (dto.pessoaId) and.push({ pessoaId: dto.pessoaId });
    if (dto.leadId) and.push({ leadId: dto.leadId });
    if (dto.oportunidadeId) and.push({ oportunidadeId: dto.oportunidadeId });
    if (dto.vencimentoDe) and.push({ dataVencimento: { gte: new Date(dto.vencimentoDe) } });
    if (dto.vencimentoAte) and.push({ dataVencimento: { lte: new Date(dto.vencimentoAte) } });

    const { itens, total } = await this.repo.listar(
      { AND: and },
      { pagina: dto.pagina, tamanho: dto.tamanho },
    );
    let projetados = itens.map(projetarTarefa);
    if (dto.vencendoHoje !== undefined) {
      projetados = projetados.filter((t) => t.vencendoHoje === dto.vencendoHoje);
    }
    if (dto.atrasada !== undefined) {
      projetados = projetados.filter((t) => t.atrasada === dto.atrasada);
    }
    return { itens: projetados, pagina: dto.pagina, tamanho: dto.tamanho, total };
  }

  async obter(id: string, req: Request): Promise<TarefaProjetada> {
    const row = await this.exigirNoEscopo(id, req);
    return projetarTarefa(row);
  }

  /** Usado pelos serviços de escrita: garante que o sujeito enxerga a tarefa. */
  async exigirNoEscopo(id: string, req: Request): Promise<TarefaRow> {
    const escopo = await this.escopoDe(req);
    const row = await this.repo.listar({ AND: [escopo, { id }] }, { pagina: 1, tamanho: 1 });
    if (row.itens.length === 0) throw new NotFoundException('tarefa não encontrada');
    return row.itens[0];
  }

  async listarPorPessoa(pessoaId: string, req: Request) {
    const perms = await this.rbac.permissoesDe(req);
    if (!perms.has('pessoa:ver')) throw new ForbiddenException('permissão insuficiente');
    const escopo = await this.escopoDe(req);
    const { itens } = await this.repo.listar(
      { AND: [escopo, { pessoaId }] },
      { pagina: 1, tamanho: 100 },
    );
    return { itens: itens.map(projetarTarefa) };
  }
}
