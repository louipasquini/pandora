/**
 * As 7 contas de origem, em 4 plataformas. Dimensão de primeira classe em toda
 * query e índice do sistema (Padrões Transversais da constituição).
 *
 * Sem uso nesta spec (001) — existe para fixar a grafia canônica desde o início.
 * As specs de ingestão/financeiro (Fase 2) passam a consumir.
 */
export enum PlataformaOrigem {
  TMB = 'TMB',
  ASAAS_PRD = 'ASAAS_PRD',
  ASAAS_SVC = 'ASAAS_SVC',
  GURU_PRD = 'GURU_PRD',
  GURU_SVC = 'GURU_SVC',
  HOTMART_PRD = 'HOTMART_PRD',
  HOTMART_SVC = 'HOTMART_SVC',
}

/** Todos os valores, na ordem canônica. */
export const PLATAFORMAS_ORIGEM: readonly PlataformaOrigem[] = Object.freeze([
  PlataformaOrigem.TMB,
  PlataformaOrigem.ASAAS_PRD,
  PlataformaOrigem.ASAAS_SVC,
  PlataformaOrigem.GURU_PRD,
  PlataformaOrigem.GURU_SVC,
  PlataformaOrigem.HOTMART_PRD,
  PlataformaOrigem.HOTMART_SVC,
]);

/** Nome legível de cada conta (para UI e logs). */
export const PLATAFORMA_ORIGEM_LABEL: Record<PlataformaOrigem, string> = {
  [PlataformaOrigem.TMB]: 'TMB',
  [PlataformaOrigem.ASAAS_PRD]: 'Asaas PRD',
  [PlataformaOrigem.ASAAS_SVC]: 'Asaas SVC',
  [PlataformaOrigem.GURU_PRD]: 'Guru PRD',
  [PlataformaOrigem.GURU_SVC]: 'Guru SVC',
  [PlataformaOrigem.HOTMART_PRD]: 'Hotmart PRD',
  [PlataformaOrigem.HOTMART_SVC]: 'Hotmart SVC',
};
