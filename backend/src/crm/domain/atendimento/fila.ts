/**
 * Priorização da fila (spec 012, FR-003/D-06) — puro. Prioridade decrescente,
 * FIFO (ordem de chegada) dentro da mesma prioridade.
 */

export type AtendimentoPrioridade = 'NORMAL' | 'ALTA' | 'URGENTE';

const PESO: Record<AtendimentoPrioridade, number> = {
  URGENTE: 2,
  ALTA: 1,
  NORMAL: 0,
};

export function ordenarFila<T extends { prioridade: AtendimentoPrioridade; abertoEm: Date }>(
  itens: readonly T[],
): T[] {
  return [...itens].sort((a, b) => {
    const porPrioridade = PESO[b.prioridade] - PESO[a.prioridade];
    if (porPrioridade !== 0) return porPrioridade;
    return a.abertoEm.getTime() - b.abertoEm.getTime();
  });
}
