import type { EstadoPontosTarefa } from './tipos';

/**
 * Pontos de gamificação (spec 016, CL-01 + research.md D-R4) — **derivado**,
 * nunca contador incremental (Princípio V). Tabela de pesos congelada no
 * código (mesmo padrão de `PESOS_SCORE_LEAD`, spec 008); ajuste = PR
 * revisável.
 */
export const PESOS_PONTOS_TAREFA = Object.freeze({
  base: 10,
  bonusNoPrazo: 5,
  bonusChecklistCompleto: 5,
});

/**
 * `f(estado) -> inteiro >= 0`. Só tarefas concluídas pontuam; o bônus de
 * prazo exige `dataVencimento` definida e `concluidoEm <= dataVencimento`; o
 * bônus de checklist exige ao menos 1 item e todos concluídos.
 */
export function calcularPontosTarefa(estado: EstadoPontosTarefa): number {
  if (!estado.concluida) return 0;

  const P = PESOS_PONTOS_TAREFA;
  let pontos = P.base;

  if (
    estado.dataVencimento &&
    estado.concluidoEm &&
    estado.concluidoEm.getTime() <= estado.dataVencimento.getTime()
  ) {
    pontos += P.bonusNoPrazo;
  }

  if (estado.totalChecklist > 0 && estado.checklistConcluidos === estado.totalChecklist) {
    pontos += P.bonusChecklistCompleto;
  }

  return pontos;
}
