/**
 * "Turma efetiva" de uma oferta evergreen numa data (spec 023, D-10/D-16) — só
 * para exibição, nunca grava em `transacao`/`oferta` (Princípio V — agregado
 * derivado, sempre uma função de leitura). Espelha o comportamento da v1
 * ("reatribui turma, só exibição") sem o valor sentinela mágico.
 */
export interface JanelaLancamentoResumo {
  rotulo: string;
  inicio: Date;
  fim: Date;
}

/**
 * Casa `data` contra as janelas do produto. Duas janelas sobrepostas (erro de
 * import) → a de `inicio` mais recente que ainda contém a data vence
 * (determinístico, documentado — spec 023 Edge Cases). Sem janela aplicável →
 * `null`.
 */
export function turmaEfetiva(data: Date, janelas: readonly JanelaLancamentoResumo[]): string | null {
  const aplicaveis = janelas.filter((j) => data >= j.inicio && data <= j.fim);
  if (aplicaveis.length === 0) return null;
  const maisRecente = aplicaveis.reduce((melhor, atual) =>
    atual.inicio > melhor.inicio ? atual : melhor,
  );
  return maisRecente.rotulo;
}
