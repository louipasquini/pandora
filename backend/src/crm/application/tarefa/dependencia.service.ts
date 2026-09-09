import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { detectarCiclo } from '../../domain/tarefa';
import { DependenciaRepository } from '../../infra/tarefa/dependencia.repository';
import { TarefaRepository } from '../../infra/tarefa/tarefa.repository';

/** Dependência entre tarefas (spec 016, US3, D-05) — sem ciclos, sem auto-dependência. */
@Injectable()
export class DependenciaService {
  constructor(
    private readonly repo: DependenciaRepository,
    private readonly tarefas: TarefaRepository,
  ) {}

  async adicionar(tarefaId: string, dependeDeId: string) {
    if (!(await this.tarefas.porId(tarefaId))) throw new NotFoundException('tarefa não encontrada');
    if (!(await this.tarefas.porId(dependeDeId))) {
      throw new NotFoundException('tarefa da dependência não encontrada');
    }
    if (tarefaId === dependeDeId) {
      throw new UnprocessableEntityException('uma tarefa não pode depender de si mesma');
    }
    if (await this.repo.existe(tarefaId, dependeDeId)) {
      throw new ConflictException('dependência já existe');
    }

    const arestas = await this.repo.todasAsArestas();
    if (detectarCiclo(arestas, { tarefaId, dependeDeId })) {
      throw new UnprocessableEntityException('dependência criaria um ciclo');
    }

    return this.repo.adicionar(tarefaId, dependeDeId);
  }

  async remover(tarefaId: string, dependeDeId: string): Promise<void> {
    if (!(await this.tarefas.porId(tarefaId))) throw new NotFoundException('tarefa não encontrada');
    await this.repo.remover(tarefaId, dependeDeId);
  }

  async listar(tarefaId: string) {
    if (!(await this.tarefas.porId(tarefaId))) throw new NotFoundException('tarefa não encontrada');
    return this.repo.listar(tarefaId);
  }
}
