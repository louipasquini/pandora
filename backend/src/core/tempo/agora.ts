/**
 * Fonte única do "instante agora" em UTC.
 *
 * Existe para dar **um** ponto de origem a todo carimbo de tempo do sistema
 * (`criadoEm` / `atualizadoEm` de entidades, `RegistroAuditoria.quando`, etc.) —
 * mesma motivação do wrapper `uuidv7()` da spec 001. Concentrar a chamada aqui
 * também torna o tempo trivial de _fakear_ em teste (`jest.useFakeTimers()`).
 *
 * Um `Date` do runtime já é um instante absoluto (armazena epoch ms em UTC).
 * O Padrão Transversal de Tempo é respeitado desde que ninguém trate esse
 * `Date` como "hora local" — use sempre os métodos `*UTC*` / `toISOString()`.
 */
export function agoraUtc(): Date {
  return new Date();
}
