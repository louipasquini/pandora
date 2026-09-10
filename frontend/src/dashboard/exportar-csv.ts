/**
 * Export CSV 100% client-side (spec 017, CL-03 / D-R9) — `Blob` no navegador,
 * sem link direto ao backend, sem dependência nova. Mesmo padrão do export de
 * Disparos (015).
 */
function celula(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function montarCsv(colunas: string[], linhas: unknown[][]): string {
  const cab = colunas.map(celula).join(',');
  const corpo = linhas.map((l) => l.map(celula).join(',')).join('\r\n');
  return corpo ? `${cab}\r\n${corpo}\r\n` : `${cab}\r\n`;
}

export function baixarCsv(nome: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
