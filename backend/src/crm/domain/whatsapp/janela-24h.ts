/**
 * Janela de 24h de atendimento livre da API do WhatsApp (spec 011, FR-007).
 * Pura, determinística, livre de locale — recebe `agora` explícito (nunca lê
 * relógio direto, mesmo padrão de `estaEmExpediente` da 007).
 */
const JANELA_MS = 24 * 60 * 60 * 1000;

export function estaDentroDaJanela24h(
  ultimaMensagemRecebidaEm: Date | null,
  agora: Date,
): boolean {
  if (ultimaMensagemRecebidaEm == null) return false;
  const decorrido = agora.getTime() - ultimaMensagemRecebidaEm.getTime();
  return decorrido >= 0 && decorrido < JANELA_MS;
}
