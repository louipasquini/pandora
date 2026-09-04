/**
 * CSAT (spec 012, FR-014..FR-016/D-R5) — puro. Reaproveita `interacao` tipo
 * `NPS` (spec 009) — nenhuma entidade nova. `csatElegivel` decide se um
 * atendimento pode receber nota; `interpretarRespostaCsat` decide se um texto
 * livre (ex.: resposta de WhatsApp) deve ser tratado como nota, em vez de
 * mensagem comum.
 */

export type AtendimentoStatusCsat = 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'ENCERRADO';

export function csatElegivel(
  atendimento: { status: AtendimentoStatusCsat; csatSolicitadoEm: Date | null },
  jaTemResposta: boolean,
): boolean {
  return (
    atendimento.status === 'ENCERRADO' &&
    atendimento.csatSolicitadoEm != null &&
    !jaTemResposta
  );
}

/**
 * Aceita só um inteiro 0–10, isolado ou cercado por espaços/pontuação
 * trivial (ex.: "9", " 10 ", "8.", "nota 7" **não** casa — precisa ser só o
 * número). Qualquer outra coisa devolve `null` (a mensagem segue o fluxo
 * normal de interação comum).
 */
export function interpretarRespostaCsat(texto: string): number | null {
  const limpo = texto.trim().replace(/[.!\s]+$/, '');
  if (!/^\d{1,2}$/.test(limpo)) return null;

  const nota = Number.parseInt(limpo, 10);
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) return null;
  return nota;
}
