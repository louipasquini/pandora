import { Dinheiro } from '../../core/core.module';
import type { SnapshotTransacao } from './dados-transacao';

/** Ordem estável dos campos comparáveis de `SnapshotTransacao`. */
const CAMPOS: readonly (keyof SnapshotTransacao)[] = [
  'statusCanonico',
  'classificacao',
  'ocorridoEm',
  'pessoaId',
  'ehAfiliada',
  'valorBruto',
  'valorLiquido',
  'taxas',
  'reembolso',
  'quantidade',
  'ehRecorrencia',
  'assinaturaCiclo',
  'numeroCiclo',
  'ofertaCodigoOrigem',
  'ofertaNomeOrigem',
];

function iguais(a: unknown, b: unknown): boolean {
  if (a instanceof Dinheiro && b instanceof Dinheiro) {
    return a.valorInt === b.valorInt && a.moeda === b.moeda;
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;
  return a === b;
}

/** `true` = o valor "conta" como preenchido (para a lista de criação). */
function preenchido(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  return true;
}

/**
 * `campos_alterados` (Princípio IV — resultado explícito). Puro.
 * - `anterior == null` (criação): lista dos campos preenchidos do `novo`.
 * - senão: só os campos cujo valor mudou (`Dinheiro` compara `valorInt`+`moeda`,
 *   `Date` compara instante).
 */
export function camposAlterados(
  anterior: SnapshotTransacao | null,
  novo: SnapshotTransacao,
): string[] {
  if (anterior == null) {
    return CAMPOS.filter((c) => preenchido(novo[c]));
  }
  return CAMPOS.filter((c) => !iguais(anterior[c], novo[c]));
}
