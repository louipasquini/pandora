/**
 * `duracaoParaSegundos` — converte uma duração compacta (`<n>[s|m|h|d]`) em
 * segundos inteiros. Livre de locale, sem dependência.
 *
 * Usada por `env.schema` (`SERVICE_JWT_TTL` → segundos, com teto verificável) e
 * disponível para qualquer contexto que precise ler uma janela de tempo de
 * configuração. É o par simétrico das primitivas de tempo do `core` (spec 002).
 *
 * - `s` segundos, `m` minutos, `h` horas, `d` dias.
 * - Só aceita a forma exata `^\d+[smhd]$` (um número inteiro não-negativo + uma
 *   unidade). Qualquer outra coisa → `RangeError` nomeando a entrada.
 */
const DURACAO_RE = /^(\d+)([smhd])$/;

const FATOR: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function duracaoParaSegundos(entrada: string): number {
  const m = DURACAO_RE.exec(entrada.trim());
  if (!m) {
    throw new RangeError(
      `duração inválida: ${JSON.stringify(entrada)} — use <n>[s|m|h|d], ex.: "12h"`,
    );
  }
  return Number(m[1]) * FATOR[m[2]];
}
