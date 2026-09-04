/**
 * Endereçamento por carga/disponibilidade (spec 012, CL-01) — puro. O pool de
 * candidatos (membros ativos de equipe `tipo = ATENDIMENTO` em expediente,
 * `estaEmExpediente` da spec 007) e a carga atual (contagem AO VIVO de
 * `Atendimento WHERE atendenteAtualId = X AND status = EM_ATENDIMENTO`) são
 * montados pelo chamador — esta função só decide, nunca faz I/O (Princípio V:
 * sempre `f(estado atual) -> resultado`, nunca contador/cursor persistido).
 */

export interface CandidatoRoteamento {
  usuarioId: string;
  cargaAtual: number;
}

/**
 * Devolve o `usuarioId` de menor `cargaAtual`. Empate é resolvido pelo menor
 * `usuarioId` (ordem lexicográfica) — desempate arbitrário mas determinístico
 * (research.md D-R2), não round robin nem aleatório (CL-01 exclui ambos
 * explicitamente). `candidatos` vazio → `null` (fica em `AGUARDANDO`).
 */
export function escolherAtendentePorCarga(
  candidatos: readonly CandidatoRoteamento[],
): string | null {
  if (candidatos.length === 0) return null;

  const menorCarga = Math.min(...candidatos.map((c) => c.cargaAtual));
  const empatados = candidatos.filter((c) => c.cargaAtual === menorCarga);

  return [...empatados].sort((a, b) => (a.usuarioId < b.usuarioId ? -1 : a.usuarioId > b.usuarioId ? 1 : 0))[0]
    .usuarioId;
}
