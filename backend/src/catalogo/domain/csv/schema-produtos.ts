import type { ColunaSchema } from './schema-colunas';

/** Colunas esperadas de `produtos.csv` do catálogo Hotmart (spec 023, D-11/D-12). */
export const SCHEMA_PRODUTOS_CSV: readonly ColunaSchema[] = [
  { canonica: 'codigo', aliases: ['codigo', 'código', 'code'], obrigatoria: true },
  { canonica: 'nome', aliases: ['nome', 'nome_produto'], obrigatoria: false },
  {
    canonica: 'assinatura',
    aliases: ['assinatura', 'é_assinatura', 'e_assinatura', 'is_subscription'],
    obrigatoria: false,
  },
];

const VERDADEIROS = new Set(['sim', 'true', '1', 'yes']);
const FALSOS = new Set(['nao', 'não', 'false', '0', 'no']);

/** `undefined` quando o texto não representa nenhum booleano reconhecido. */
export function paraBooleano(texto: string | undefined): boolean | undefined {
  if (texto === undefined) return undefined;
  const t = texto.trim().toLowerCase();
  if (VERDADEIROS.has(t)) return true;
  if (FALSOS.has(t)) return false;
  return undefined;
}
