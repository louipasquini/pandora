/**
 * Alerta de "lead esfriando" (spec 010, D-06/FR-018) — puro, derivado na
 * leitura. `diasEsfriando` nulo desativa o alerta para o pipeline. A
 * referência é a última `interacao` da âncora (spec 009); quando não há
 * nenhuma, o chamador passa `oportunidade.criadoEm` como referência.
 */
export function calcularEsfriando(
  diasEsfriando: number | null,
  ultimaReferencia: Date,
  agora: Date,
): boolean {
  if (diasEsfriando == null) return false;
  const limiteMs = diasEsfriando * 24 * 60 * 60 * 1000;
  const decorridoMs = agora.getTime() - ultimaReferencia.getTime();
  return decorridoMs > limiteMs;
}
