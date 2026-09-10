/**
 * `calcularDelta` (spec 017, FR-004 / research.md D-R4) — comparação
 * período-a-período. `deltaPercentual` é `null` quando o período anterior é 0
 * (nunca divisão por zero — edge case do spec).
 */

export interface Delta {
  valor: number;
  periodoAnterior: number;
  delta: number;
  deltaPercentual: number | null;
}

export function calcularDelta(valor: number, periodoAnterior: number): Delta {
  const delta = valor - periodoAnterior;
  return {
    valor,
    periodoAnterior,
    delta,
    deltaPercentual: periodoAnterior === 0 ? null : delta / periodoAnterior,
  };
}
