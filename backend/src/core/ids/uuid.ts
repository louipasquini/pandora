import { v7 as uuidV7Impl } from 'uuid';

/**
 * Gera um UUID v7 (time-ordered) canônico em minúsculas.
 *
 * Ponto único de troca da fonte de UUID v7. Toda geração de ID de entidade
 * passa por aqui (via `EntidadeId.novo()`).
 */
export function uuidv7(): string {
  return uuidV7Impl();
}
