import type { EstadoPrazoResultado, EstadoPrazoTarefa } from './tipos';
import { ehTerminal } from './transicao-status';

/**
 * `calcularEstadoPrazo` (spec 016, research.md D-R3) — pura, determinística,
 * livre de locale: compara o **dia civil** em America/Sao_Paulo de
 * `dataVencimento` e de `agora` via `Intl` nativo (0 dependência, mesmo padrão
 * de `estaEmExpediente`, spec 007). Tarefa sem prazo, ou em estado terminal,
 * nunca é `atrasada`/`vencendoHoje`.
 */
const FUSO = 'America/Sao_Paulo';

const FMT_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function diaLocal(instante: Date): string {
  return FMT_DIA.format(instante);
}

export function calcularEstadoPrazo(
  estado: EstadoPrazoTarefa,
  agora: Date,
): EstadoPrazoResultado {
  if (!estado.dataVencimento || ehTerminal(estado.status)) {
    return { vencendoHoje: false, atrasada: false };
  }
  const diaVencimento = diaLocal(estado.dataVencimento);
  const diaAgora = diaLocal(agora);
  return {
    vencendoHoje: diaVencimento === diaAgora,
    atrasada: diaVencimento < diaAgora,
  };
}
