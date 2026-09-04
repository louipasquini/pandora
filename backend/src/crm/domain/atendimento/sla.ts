/**
 * SLA de 1ª resposta (spec 012, FR-010/D-R3) — puro, sempre `f(estado atual,
 * agora) -> resultado`, nunca uma coluna persistida. Diferença de instantes,
 * sem conversão de fuso horário (diferente de `estaEmExpediente`, spec 007) —
 * livre de `TZ` do processo por construção.
 */

export type AtendimentoStatusSla = 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'ENCERRADO';

export interface AtendimentoSlaEntrada {
  status: AtendimentoStatusSla;
  abertoEm: Date;
  primeiraRespostaEm: Date | null;
  slaMinutos: number;
}

export interface AtendimentoSlaResultado {
  estourado: boolean;
  minutosDecorridos: number;
  /** `null` quando já estourado, já respondido ou encerrado. */
  minutosRestantes: number | null;
}

export function calcularSlaAtendimento(
  entrada: AtendimentoSlaEntrada,
  agora: Date,
): AtendimentoSlaResultado {
  const minutosDecorridos = Math.max(
    0,
    Math.floor((agora.getTime() - entrada.abertoEm.getTime()) / 60000),
  );

  if (entrada.primeiraRespostaEm != null || entrada.status === 'ENCERRADO') {
    return { estourado: false, minutosDecorridos, minutosRestantes: null };
  }

  const estourado = minutosDecorridos > entrada.slaMinutos;
  return {
    estourado,
    minutosDecorridos,
    minutosRestantes: estourado ? null : entrada.slaMinutos - minutosDecorridos,
  };
}
