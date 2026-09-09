import { createHash } from 'node:crypto';

/**
 * Split determinístico de teste A/B (spec 015, FR-013) — o mesmo telefone
 * sempre cai na mesma variante (reprocessar a materialização nunca troca
 * alguém de grupo), sem precisar persistir um sorteio. `percentualB` ausente
 * → sem teste A/B, todo mundo variante única (`null`).
 */
export type DisparoVariante = 'A' | 'B';

export function atribuirVariante(
  telefone: string,
  percentualB: number | null | undefined,
): DisparoVariante | null {
  if (percentualB == null) return null;
  const hash = createHash('sha256').update(telefone).digest();
  // 4 primeiros bytes → inteiro sem sinal, módulo 100 → percentil estável.
  const percentil = hash.readUInt32BE(0) % 100;
  return percentil < percentualB ? 'B' : 'A';
}
