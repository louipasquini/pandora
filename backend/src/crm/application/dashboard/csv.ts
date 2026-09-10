/**
 * Serialização de CSV (spec 017, FR-014 / CL-03 / research.md D-R9) — puro,
 * sem dependência. Mesmo escape mínimo já usado no export de Disparos (015):
 * campo que contém `,` `"` ou quebra de linha vai entre aspas, com `"` dobrado.
 * Fim de linha `\r\n` (compatível com Excel).
 */

function celula(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function serializarCsv(
  colunas: readonly string[],
  linhas: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const cabecalho = colunas.map(celula).join(',');
  const corpo = linhas.map((l) => l.map(celula).join(',')).join('\r\n');
  return corpo ? `${cabecalho}\r\n${corpo}\r\n` : `${cabecalho}\r\n`;
}
