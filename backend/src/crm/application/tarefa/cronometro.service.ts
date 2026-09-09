import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { agoraUtc } from '../../../core/core.module';
import { tempoTotalSegundos } from '../../domain/tarefa';
import { CronometroRepository } from '../../infra/tarefa/cronometro.repository';
import { TarefaRepository } from '../../infra/tarefa/tarefa.repository';

/** Cronômetro por tarefa (spec 016, US2, D-04) — no máximo 1 período aberto por vez. */
@Injectable()
export class CronometroService {
  constructor(
    private readonly repo: CronometroRepository,
    private readonly tarefas: TarefaRepository,
  ) {}

  private async exigirTarefa(tarefaId: string) {
    const tarefa = await this.tarefas.porId(tarefaId);
    if (!tarefa) throw new NotFoundException('tarefa não encontrada');
    return tarefa;
  }

  async iniciar(tarefaId: string) {
    await this.exigirTarefa(tarefaId);
    const aberto = await this.repo.periodoAberto(tarefaId);
    if (aberto) throw new ConflictException('já há um período de cronômetro aberto');
    return this.repo.abrir(tarefaId, agoraUtc());
  }

  async parar(tarefaId: string) {
    await this.exigirTarefa(tarefaId);
    const aberto = await this.repo.periodoAberto(tarefaId);
    if (!aberto) throw new ConflictException('não há período de cronômetro aberto');
    return this.repo.fechar(aberto.id, agoraUtc());
  }

  async obter(tarefaId: string) {
    await this.exigirTarefa(tarefaId);
    const periodos = await this.repo.listar(tarefaId);
    return { periodos, tempoTotalSegundos: tempoTotalSegundos(periodos, agoraUtc()) };
  }
}
