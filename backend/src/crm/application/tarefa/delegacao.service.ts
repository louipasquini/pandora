import { Injectable, NotFoundException } from '@nestjs/common';
import { DelegacaoRepository } from '../../infra/tarefa/delegacao.repository';
import { TarefaRepository } from '../../infra/tarefa/tarefa.repository';
import { projetarTarefa, type TarefaProjetada } from './projetar-tarefa';
import { resolverUsuarioIdOuNulo } from './resolver-usuario';

/** Delegação/reatribuição de tarefa (spec 016, US3, D-06) — histórico de 1ª classe. */
@Injectable()
export class DelegacaoService {
  constructor(
    private readonly repo: DelegacaoRepository,
    private readonly tarefas: TarefaRepository,
  ) {}

  async delegar(
    tarefaId: string,
    novoResponsavelId: string | null,
    autorId: string | null,
    motivo: string | null,
  ): Promise<TarefaProjetada> {
    const atual = await this.tarefas.porId(tarefaId);
    if (!atual) throw new NotFoundException('tarefa não encontrada');

    if (atual.responsavelId === novoResponsavelId) {
      return projetarTarefa(atual); // no-op (D-06)
    }

    const autor = await resolverUsuarioIdOuNulo(this.tarefas, autorId);
    await this.repo.registrar({
      tarefaId,
      deResponsavelId: atual.responsavelId,
      paraResponsavelId: novoResponsavelId,
      autorId: autor,
      motivo,
    });
    const atualizado = await this.tarefas.atualizarCampos(tarefaId, { responsavelId: novoResponsavelId });
    return projetarTarefa(atualizado);
  }

  async listar(tarefaId: string) {
    if (!(await this.tarefas.porId(tarefaId))) throw new NotFoundException('tarefa não encontrada');
    return this.repo.listar(tarefaId);
  }
}
