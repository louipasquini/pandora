/**
 * Mutabilidade de `interacao` (spec 009, CL-05 — híbrido). Puro.
 *
 * Só `tipo = NOTA` aceita `PATCH`/`DELETE`, e só se ainda não removida; o
 * sujeito precisa ser o autor **ou** ter `interacao:gerir`. Qualquer outro
 * `tipo` (canal) é sempre append-only — mesmo com `interacao:gerir`.
 */

import type { InteracaoTipo } from './tipos';

export interface InteracaoParaMutabilidade {
  tipo: InteracaoTipo;
  autorId: string | null;
  removidoEm: string | Date | null;
}

export interface SujeitoMutabilidade {
  id: string | undefined;
  temInteracaoGerir: boolean;
}

export type ResultadoMutabilidade =
  | { ok: true }
  | { ok: false; erro: 'tipo_nao_editavel' | 'ja_removida' | 'sem_permissao' };

export function podeEditar(
  interacao: InteracaoParaMutabilidade,
  sujeito: SujeitoMutabilidade,
): ResultadoMutabilidade {
  if (interacao.tipo !== 'NOTA') return { ok: false, erro: 'tipo_nao_editavel' };
  if (interacao.removidoEm != null) return { ok: false, erro: 'ja_removida' };
  if (sujeito.temInteracaoGerir) return { ok: true };
  if (sujeito.id != null && sujeito.id === interacao.autorId) return { ok: true };
  return { ok: false, erro: 'sem_permissao' };
}
