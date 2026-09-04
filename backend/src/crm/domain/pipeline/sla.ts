/**
 * SLA por etapa (spec 010, FR-017) — puro, derivado na leitura (Princípio V).
 * `slaHoras` nulo desativa o alerta para a etapa; caso contrário, estourado
 * quando o tempo decorrido desde `entrouEtapaEm` é **maior** que o limite
 * (exatamente no limite ainda não estourou).
 */
export function calcularSlaEstourado(
  slaHoras: number | null,
  entrouEtapaEm: Date,
  agora: Date,
): boolean {
  if (slaHoras == null) return false;
  const limiteMs = slaHoras * 60 * 60 * 1000;
  const decorridoMs = agora.getTime() - entrouEtapaEm.getTime();
  return decorridoMs > limiteMs;
}
