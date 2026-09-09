import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ehTerminal } from '../../domain/tarefa';
import { ChecklistRepository } from '../../infra/tarefa/checklist.repository';
import { TarefaRepository } from '../../infra/tarefa/tarefa.repository';

/** Checklist de uma tarefa (spec 016, US1) — bloqueado se a tarefa é terminal. */
@Injectable()
export class ChecklistService {
  constructor(
    private readonly repo: ChecklistRepository,
    private readonly tarefas: TarefaRepository,
  ) {}

  private async exigirTarefaEditavel(tarefaId: string) {
    const tarefa = await this.tarefas.porId(tarefaId);
    if (!tarefa) throw new NotFoundException('tarefa não encontrada');
    if (ehTerminal(tarefa.status)) {
      throw new ConflictException('tarefa em estado terminal não pode ter o checklist alterado');
    }
    return tarefa;
  }

  async criar(tarefaId: string, texto: string) {
    await this.exigirTarefaEditavel(tarefaId);
    const ordem = await this.repo.proximaOrdem(tarefaId);
    return this.repo.criar(tarefaId, texto, ordem);
  }

  async atualizar(
    tarefaId: string,
    itemId: string,
    data: { texto?: string; concluido?: boolean; ordem?: number },
  ) {
    await this.exigirTarefaEditavel(tarefaId);
    const item = await this.repo.porId(itemId);
    if (!item || item.tarefaId !== tarefaId) {
      throw new NotFoundException('item de checklist não encontrado');
    }
    return this.repo.atualizar(itemId, data);
  }

  async remover(tarefaId: string, itemId: string): Promise<void> {
    await this.exigirTarefaEditavel(tarefaId);
    const item = await this.repo.porId(itemId);
    if (!item || item.tarefaId !== tarefaId) {
      throw new NotFoundException('item de checklist não encontrado');
    }
    await this.repo.remover(itemId);
  }
}
