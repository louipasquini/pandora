/**
 * Máscara do segredo de `integracao` (spec 007). A leitura **nunca** decifra
 * nem devolve o valor — guardamos `segredo_ultimos4` em claro (4 chars não são
 * segredo) e a máscara é derivada dele.
 */
export function ultimos4De(valor: string): string {
  return valor.slice(-4);
}

export function mascararSegredo(ultimos4: string | null | undefined): string | null {
  if (ultimos4 == null || ultimos4 === '') return null;
  return `••••••${ultimos4}`;
}
