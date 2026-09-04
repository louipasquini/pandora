/**
 * Regra de campos por `tipo` de interação (spec 009, FR-001/FR-002). Puro.
 *
 * - `direcao`: obrigatória para `WHATSAPP|EMAIL|LIGACAO|TICKET`; opcional em
 *   `NPS`; proibida em `NOTA`.
 * - `notaNps`: obrigatória (inteiro 0–10) sse `tipo = NPS`; proibida caso
 *   contrário.
 */
import type { InteracaoDirecao, InteracaoTipo } from './tipos';

const TIPOS_COM_DIRECAO_OBRIGATORIA: readonly InteracaoTipo[] = [
  'WHATSAPP',
  'EMAIL',
  'LIGACAO',
  'TICKET',
];

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string };

export function validarCamposPorTipo(entrada: {
  tipo: InteracaoTipo;
  direcao?: InteracaoDirecao | null;
  notaNps?: number | null;
}): ResultadoValidacao {
  const temDirecao = entrada.direcao != null;
  const temNotaNps = entrada.notaNps != null;

  if (entrada.tipo === 'NOTA') {
    if (temDirecao) return { ok: false, erro: 'direcao não se aplica a NOTA' };
    if (temNotaNps) return { ok: false, erro: 'notaNps não se aplica a NOTA' };
    return { ok: true };
  }

  if (entrada.tipo === 'NPS') {
    if (!temNotaNps) return { ok: false, erro: 'notaNps é obrigatório para NPS' };
    if (
      !Number.isInteger(entrada.notaNps) ||
      (entrada.notaNps as number) < 0 ||
      (entrada.notaNps as number) > 10
    ) {
      return { ok: false, erro: 'notaNps deve ser um inteiro entre 0 e 10' };
    }
    return { ok: true };
  }

  // WHATSAPP | EMAIL | LIGACAO | TICKET
  if (temNotaNps) return { ok: false, erro: 'notaNps só se aplica a NPS' };
  if (TIPOS_COM_DIRECAO_OBRIGATORIA.includes(entrada.tipo) && !temDirecao) {
    return { ok: false, erro: `direcao é obrigatória para ${entrada.tipo}` };
  }
  return { ok: true };
}
