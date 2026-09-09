import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { TarefaRepository } from '../../infra/tarefa/tarefa.repository';
import { projetarTarefa } from './projetar-tarefa';
import { resolverUsuarioIdOuNulo } from './resolver-usuario';

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

/**
 * "Minhas notificações" (spec 016, CL-02) — só in-app: tarefas do sujeito
 * autenticado vencendo hoje ou atrasadas. Sem envio externo, sem worker.
 * A credencial de serviço (não é um `Usuario` real, spec 003) nunca tem
 * tarefa própria — devolve lista vazia em vez de tentar filtrar por um
 * `responsavelId` que não é UUID.
 */
@Injectable()
export class NotificacaoService {
  constructor(private readonly repo: TarefaRepository) {}

  async minhasNotificacoes(req: Request) {
    const sujeito = await resolverUsuarioIdOuNulo(this.repo, sub(req));
    if (!sujeito) return { itens: [] };

    const { itens } = await this.repo.listar(
      { responsavelId: sujeito, status: { in: ['PENDENTE', 'EM_ANDAMENTO'] } },
      { pagina: 1, tamanho: 200 },
    );
    const projetados = itens.map(projetarTarefa).filter((t) => t.vencendoHoje || t.atrasada);
    return { itens: projetados };
  }
}
