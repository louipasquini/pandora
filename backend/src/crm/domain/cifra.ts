import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

/**
 * Cifra em repouso do segredo de `integracao` (spec 007) — **AES-256-GCM**,
 * `node:crypto`, 0 dependência. Confidencialidade + integridade (authTag).
 *
 * Formato do blob: `base64( iv[12] | authTag[16] | ciphertext )`.
 * A chave (`Buffer` de 32 bytes) vem de `CRM_INTEGRACAO_CIFRA_KEY` via
 * `cifraIntegracaoKey(cfg)` do `core` — nunca hard-coded, boot aborta sem ela.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function cifrar(texto: string, chave: Buffer): string {
  if (chave.length !== 32) {
    throw new Error('chave de cifra deve ter 32 bytes (AES-256)');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', chave, iv);
  const ct = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decifrar(blob: string, chave: Buffer): string {
  if (chave.length !== 32) {
    throw new Error('chave de cifra deve ter 32 bytes (AES-256)');
  }
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('blob cifrado malformado');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', chave, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
