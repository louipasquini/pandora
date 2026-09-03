/**
 * Diff entre dois conjuntos de strings (permissões de um perfil, ou perfis de um
 * usuário). Retorna `null` quando não houve mudança — o chamador então **não**
 * grava auditoria (FR-026: só _delta_ real).
 */
export interface Delta {
  adicionadas: string[];
  removidas: string[];
}

export function calcularDelta(antes: string[], depois: string[]): Delta | null {
  const setAntes = new Set(antes);
  const setDepois = new Set(depois);
  const adicionadas = [...setDepois].filter((x) => !setAntes.has(x)).sort();
  const removidas = [...setAntes].filter((x) => !setDepois.has(x)).sort();
  if (adicionadas.length === 0 && removidas.length === 0) return null;
  return { adicionadas, removidas };
}
