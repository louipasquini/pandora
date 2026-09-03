import { createHash, randomBytes } from 'node:crypto';

/**
 * API key interna de `integracao` (spec 007). O sistema gera o valor pleno,
 * guarda **só o hash** (SHA-256 hex, irreversível) e revela o valor **uma única
 * vez** na criação/rotação. Prefixo `crm_` + 40 hex (20 bytes de entropia).
 */
export const API_KEY_PREFIXO = 'crm_';

export function hashSegredo(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

export function gerarApiKey(): { valor: string; hash: string } {
  const valor = API_KEY_PREFIXO + randomBytes(20).toString('hex');
  return { valor, hash: hashSegredo(valor) };
}
