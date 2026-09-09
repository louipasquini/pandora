import { Injectable, NotFoundException } from '@nestjs/common';
import { NotaTarefaRepository } from '../../infra/tarefa/nota.repository';
import { TarefaRepository } from '../../infra/tarefa/tarefa.repository';
import { resolverUsuarioIdOuNulo } from './resolver-usuario';

/**
 * Comentários de acompanhamento de uma tarefa (spec 016, D-02) — append-only,
 * distintos da `interacao` de timeline (spec 009).
 */
@Injectable()
export class NotaTarefaService {
  constructor(
    private readonly repo: NotaTarefaRepository,
    private readonly tarefas: TarefaRepository,
  ) {}

  async registrar(tarefaId: string, autorId: string | null, conteudo: string) {
    if (!(await this.tarefas.porId(tarefaId))) throw new NotFoundException('tarefa não encontrada');
    const autor = await resolverUsuarioIdOuNulo(this.tarefas, autorId);
    return this.repo.criar(tarefaId, autor, conteudo);
  }

  async listar(tarefaId: string) {
    if (!(await this.tarefas.porId(tarefaId))) throw new NotFoundException('tarefa não encontrada');
    return this.repo.listar(tarefaId);
  }
}
