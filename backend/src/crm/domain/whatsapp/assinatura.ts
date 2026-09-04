import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificação da assinatura `X-Hub-Signature-256` do webhook da Meta (spec
 * 011). HMAC-SHA256 sobre os **bytes exatos** do corpo bruto, com o
 * `appSecret` do canal resolvido. Comparação em tempo constante — pequena
 * duplicação deliberada de `comparacaoConstante` (auth/crypto), que é
 * escopado a `PlataformaOrigem` (ver research.md da 011); aqui é HMAC de
 * payload, não bearer token fixo.
 */
export function verificarAssinatura(
  corpoBruto: Buffer,
  headerAssinatura: string | undefined,
  appSecret: string,
): boolean {
  if (!headerAssinatura) return false;
  const prefixo = 'sha256=';
  if (!headerAssinatura.startsWith(prefixo)) return false;
  const recebidoHex = headerAssinatura.slice(prefixo.length).trim();
  if (!/^[0-9a-f]+$/i.test(recebidoHex)) return false;

  const esperadoHex = createHmac('sha256', appSecret).update(corpoBruto).digest('hex');

  const recebido = Buffer.from(recebidoHex, 'hex');
  const esperado = Buffer.from(esperadoHex, 'hex');
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}

/** Comparação em tempo constante de duas strings curtas (verify_token do handshake). */
export function compararTokenConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
