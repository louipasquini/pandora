/**
 * Atribuição automática de responsável (spec 010, D-03/FR-013..FR-016) — puro.
 * `escolherProximoRodizio` é o round robin determinístico (research.md:
 * cursor persistido em `pipeline.ultimoAtribuidoUsuarioId`); `avaliarRegras`
 * é a avaliação simples de `regra_atribuicao_pipeline` em ordem.
 */

export interface MembroAtivo {
  usuarioId: string;
  entrouEm: Date;
}

/**
 * Devolve o próximo usuário da rotação, ou `null` se não há membro ativo.
 * `membrosAtivos` já deve vir ordenado por `entrouEm` (o repositório entrega
 * assim, mesma convenção de `EquipeRepository.membrosAtivos`). Se o cursor
 * atual não está mais entre os ativos (saiu da equipe), reinicia no 1º.
 */
export function escolherProximoRodizio(
  membrosAtivos: readonly MembroAtivo[],
  cursorAtual: string | null,
): string | null {
  if (membrosAtivos.length === 0) return null;
  if (cursorAtual == null) return membrosAtivos[0].usuarioId;
  const posicaoAtual = membrosAtivos.findIndex((m) => m.usuarioId === cursorAtual);
  if (posicaoAtual === -1) return membrosAtivos[0].usuarioId;
  const proxima = (posicaoAtual + 1) % membrosAtivos.length;
  return membrosAtivos[proxima].usuarioId;
}

export type RegraAtribuicaoCampo = 'ORIGEM' | 'VALOR_ESTIMADO_MINIMO';

export interface RegraAtribuicao {
  ordem: number;
  campo: RegraAtribuicaoCampo;
  valor: { igual?: string; minimoInt?: string; moeda?: string };
  responsavelId: string;
}

export interface ContextoAtribuicao {
  origem: string | null;
  valorEstimado: { valorInt: bigint; moeda: string };
}

function casaRegra(regra: RegraAtribuicao, contexto: ContextoAtribuicao): boolean {
  if (regra.campo === 'ORIGEM') {
    return regra.valor.igual != null && regra.valor.igual === contexto.origem;
  }
  // VALOR_ESTIMADO_MINIMO — moeda diferente nunca casa (regra de Moeda do core).
  if (regra.valor.minimoInt == null || regra.valor.moeda == null) return false;
  if (regra.valor.moeda !== contexto.valorEstimado.moeda) return false;
  return contexto.valorEstimado.valorInt >= BigInt(regra.valor.minimoInt);
}

/** 1ª regra (em ordem crescente de `ordem`) que casa vence; sem match, `null`. */
export function avaliarRegras(
  regrasOrdenadas: readonly RegraAtribuicao[],
  contexto: ContextoAtribuicao,
): string | null {
  const ordenadas = [...regrasOrdenadas].sort((a, b) => a.ordem - b.ordem);
  const casada = ordenadas.find((r) => casaRegra(r, contexto));
  return casada?.responsavelId ?? null;
}
