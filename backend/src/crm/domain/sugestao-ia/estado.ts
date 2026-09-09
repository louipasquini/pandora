/**
 * Transições de estado de `SugestaoIa` (spec 013) — puro. `SUBSTITUIDA` é uma
 * decisão do sistema (D-05), não humana — por isso nunca é decidível de novo
 * nem avaliável.
 */

export type SugestaoIaStatus = 'PENDENTE' | 'ACEITA' | 'REJEITADA' | 'SUBSTITUIDA';

/** Só uma sugestão `PENDENTE` pode ser aceita ou rejeitada. */
export function podeDecidir(status: SugestaoIaStatus): boolean {
  return status === 'PENDENTE';
}

/** Feedback de utilidade só faz sentido depois de uma decisão humana. */
export function podeAvaliarUtilidade(status: SugestaoIaStatus): boolean {
  return status === 'ACEITA' || status === 'REJEITADA';
}
