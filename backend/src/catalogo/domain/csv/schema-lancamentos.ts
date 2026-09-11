import type { ColunaSchema } from './schema-colunas';

/** Colunas esperadas de `lancamentos.csv` do catálogo Hotmart (spec 023, D-10). */
export const SCHEMA_LANCAMENTOS_CSV: readonly ColunaSchema[] = [
  {
    canonica: 'produto_codigo',
    aliases: ['produto_codigo', 'produto', 'codigo_produto', 'código_produto'],
    obrigatoria: true,
  },
  { canonica: 'rotulo', aliases: ['rotulo', 'rótulo', 'turma', 'label'], obrigatoria: true },
  {
    canonica: 'inicio',
    aliases: ['inicio', 'início', 'data_inicio', 'data_início'],
    obrigatoria: true,
  },
  { canonica: 'fim', aliases: ['fim', 'data_fim', 'termino', 'término'], obrigatoria: true },
];

/** `YYYY-MM-DD` → `Date` (meia-noite UTC). `null` se não parseável. */
export function parseDataCivil(texto: string | undefined): Date | null {
  if (!texto) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const [, ano, mes, dia] = m;
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
