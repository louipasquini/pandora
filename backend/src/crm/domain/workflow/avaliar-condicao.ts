import type { CondicaoNo } from './tipos';

/**
 * `avaliarCondicao(no, contexto)` — pura, determinística (spec 014, US1).
 * Grupo vazio (`{tipo:'grupo', itens:[]}`) avalia sempre `true` (fluxo sem
 * condição sempre dispara). Campo ausente no contexto: `definido`/
 * `nao_definido` decidem normalmente; qualquer outro operador trata como
 * "não satisfeito" (`false`), sem lançar.
 */
export function avaliarCondicao(no: CondicaoNo, contexto: Record<string, unknown>): boolean {
  if (no.tipo === 'grupo') {
    if (no.itens.length === 0) return true;
    return no.operador === 'E'
      ? no.itens.every((item) => avaliarCondicao(item, contexto))
      : no.itens.some((item) => avaliarCondicao(item, contexto));
  }

  const presente = Object.prototype.hasOwnProperty.call(contexto, no.campo);
  const atual = contexto[no.campo];

  switch (no.operador) {
    case 'definido':
      return presente && atual != null;
    case 'nao_definido':
      return !presente || atual == null;
    case 'igual':
      return presente && atual === no.valor;
    case 'diferente':
      return presente && atual !== no.valor;
    case 'contem':
      return presente && Array.isArray(atual) && atual.includes(no.valor);
    case 'nao_contem':
      return !presente || !Array.isArray(atual) || !atual.includes(no.valor);
    case 'maior_que':
      return (
        presente &&
        typeof atual === 'number' &&
        typeof no.valor === 'number' &&
        atual > no.valor
      );
    case 'menor_que':
      return (
        presente &&
        typeof atual === 'number' &&
        typeof no.valor === 'number' &&
        atual < no.valor
      );
    default:
      return false;
  }
}
