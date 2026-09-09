import type { ArestaDependencia } from './tipos';

/**
 * `detectarCiclo` (spec 016, research.md D-R5) — recebe as arestas
 * `tarefa -> depende_de` já persistidas e a aresta proposta; faz uma busca em
 * profundidade a partir do destino da nova aresta procurando um caminho de
 * volta à origem. Pura, sem I/O (o chamador busca as arestas existentes).
 */
export function detectarCiclo(
  arestasExistentes: readonly ArestaDependencia[],
  novaAresta: ArestaDependencia,
): boolean {
  if (novaAresta.tarefaId === novaAresta.dependeDeId) return true;

  const adjacencia = new Map<string, string[]>();
  for (const a of arestasExistentes) {
    const lista = adjacencia.get(a.tarefaId) ?? [];
    lista.push(a.dependeDeId);
    adjacencia.set(a.tarefaId, lista);
  }
  // A nova aresta entraria no grafo — inclui para a busca.
  const lista = adjacencia.get(novaAresta.tarefaId) ?? [];
  lista.push(novaAresta.dependeDeId);
  adjacencia.set(novaAresta.tarefaId, lista);

  const visitados = new Set<string>();
  const pilha = [novaAresta.dependeDeId];
  while (pilha.length > 0) {
    const atual = pilha.pop() as string;
    if (atual === novaAresta.tarefaId) return true;
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    for (const vizinho of adjacencia.get(atual) ?? []) {
      pilha.push(vizinho);
    }
  }
  return false;
}
