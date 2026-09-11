/**
 * Precedência **curado > derivado > null** (spec 023, D-07 / Princípio VII da
 * constituição). Implementada com colunas distintas por campo curável — nunca
 * sobrescrita destrutiva de uma pela outra. Estes 2 helpers puros substituem o
 * `marcar_editado`/`aplicar_se_nao_editado` da v1, sem a gambiarra 4.6/4.8 de
 * string sentinela: aqui o "trava" é uma lista explícita de nomes de campo.
 */

/** Adiciona `campo` a `camposEditados` (idempotente — nunca duplica). */
export function marcarEditado(camposEditados: readonly string[], campo: string): string[] {
  if (camposEditados.includes(campo)) return [...camposEditados];
  return [...camposEditados, campo];
}

/**
 * Executa `aplicar()` só quando `campo` **não** está em `camposEditados` — ou
 * seja, só quando não há curadoria manual travando aquele campo. Quando o
 * campo está travado, é um no-op (o valor derivado é descartado silenciosamente,
 * nunca sobrescreve o curado).
 */
export function aplicarSeNaoEditado(
  camposEditados: readonly string[],
  campo: string,
  aplicar: () => void,
): void {
  if (camposEditados.includes(campo)) return;
  aplicar();
}

/** Valor efetivo de leitura de um campo curável: curado se não-nulo, senão derivado, senão `null`. */
export function valorEfetivo<T>(curado: T | null | undefined, derivado: T | null | undefined): T | null {
  return curado ?? derivado ?? null;
}
