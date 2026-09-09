import { TarefaStatus } from './tipos';

export interface ResultadoTransicao {
  ok: boolean;
  erro?: string;
}

/**
 * Transições válidas de `TarefaStatus` (data-model.md) — conjunto fechado:
 * `PENDENTE ⇄ EM_ANDAMENTO`; `PENDENTE|EM_ANDAMENTO → CONCLUIDA|CANCELADA`;
 * `CONCLUIDA → PENDENTE` (reabrir, único caminho de saída de um terminal);
 * `CANCELADA` é terminal sem reabertura. Mesmo estado → estado é sempre 409
 * (não é transição, é no-op indevido — o chamador decide se trata como erro).
 */
const TRANSICOES: Record<TarefaStatus, readonly TarefaStatus[]> = {
  PENDENTE: ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'],
  EM_ANDAMENTO: ['PENDENTE', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: ['PENDENTE'],
  CANCELADA: [],
};

export function validarTransicao(
  atual: TarefaStatus,
  destino: TarefaStatus,
): ResultadoTransicao {
  if (atual === destino) {
    return { ok: false, erro: `tarefa já está em ${destino}` };
  }
  if (!TRANSICOES[atual].includes(destino)) {
    return { ok: false, erro: `transição inválida: ${atual} -> ${destino}` };
  }
  return { ok: true };
}

/** Uma tarefa está em estado terminal para edição de título/descrição/checklist/etc. */
export function ehTerminal(status: TarefaStatus): boolean {
  return status === 'CONCLUIDA' || status === 'CANCELADA';
}
