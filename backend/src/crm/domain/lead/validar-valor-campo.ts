/**
 * Validação pura de um valor de campo personalizado contra a sua definição
 * (spec 008, US5 — CL-03). Sem I/O. Devolve o valor **canônico** a persistir
 * (sempre string) ou um erro. Valor "vazio" de `TEXTO` sinaliza remoção.
 */
import type { CampoPersonalizadoTipo } from './tipos';

export type ResultadoValor =
  | { ok: true; valor: string }
  | { ok: true; remover: true }
  | { ok: false; erro: string };

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validarValorCampo(
  tipo: CampoPersonalizadoTipo,
  opcoes: readonly string[],
  bruto: unknown,
): ResultadoValor {
  if (bruto === null || bruto === undefined) return { ok: true, remover: true };

  switch (tipo) {
    case 'TEXTO': {
      const v = String(bruto).trim();
      return v === '' ? { ok: true, remover: true } : { ok: true, valor: v };
    }
    case 'NUMERO': {
      const n = Number(bruto);
      if (typeof bruto === 'boolean' || String(bruto).trim() === '' || !Number.isFinite(n)) {
        return { ok: false, erro: 'valor não é um número' };
      }
      return { ok: true, valor: String(n) };
    }
    case 'BOOLEANO': {
      if (bruto === true || bruto === 'true') return { ok: true, valor: 'true' };
      if (bruto === false || bruto === 'false') return { ok: true, valor: 'false' };
      return { ok: false, erro: 'valor não é booleano (true|false)' };
    }
    case 'DATA': {
      const v = String(bruto).trim();
      if (!DATA_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
        return { ok: false, erro: 'data inválida (esperado YYYY-MM-DD)' };
      }
      return { ok: true, valor: v };
    }
    case 'SELECAO': {
      const v = String(bruto);
      if (!opcoes.includes(v)) {
        return { ok: false, erro: `valor fora de opcoes: ${opcoes.join(', ')}` };
      }
      return { ok: true, valor: v };
    }
    default:
      return { ok: false, erro: 'tipo desconhecido' };
  }
}

/** Regra de coerência de uma **definição** (chave/opções por tipo). */
export function validarDefinicao(d: {
  tipo: CampoPersonalizadoTipo;
  opcoes: readonly string[];
}): { ok: true } | { ok: false; erro: string } {
  const temOpcoes = d.opcoes.length > 0;
  if (d.tipo === 'SELECAO' && !temOpcoes) {
    return { ok: false, erro: 'tipo SELECAO exige opcoes não-vazio' };
  }
  if (d.tipo !== 'SELECAO' && temOpcoes) {
    return { ok: false, erro: `tipo ${d.tipo} não aceita opcoes` };
  }
  return { ok: true };
}
