import type { PeriodoCronometro } from './tipos';

/**
 * Tempo total de uma tarefa (spec 016, D-04) — soma dos períodos fechados +
 * o período aberto (se houver) até `agora`. Pura, sem I/O.
 */
export function tempoTotalSegundos(periodos: readonly PeriodoCronometro[], agora: Date): number {
  let total = 0;
  for (const p of periodos) {
    const fim = p.fim ?? agora;
    const ms = fim.getTime() - p.inicio.getTime();
    if (ms > 0) total += ms;
  }
  return Math.floor(total / 1000);
}

export function haPeriodoAberto(periodos: readonly PeriodoCronometro[]): boolean {
  return periodos.some((p) => p.fim === null);
}
