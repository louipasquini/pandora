import { randomBytes } from 'node:crypto';
import { cifrar, decifrar } from './cifra';

const chave = randomBytes(32);

describe('cifra (AES-256-GCM)', () => {
  it('round-trip: decifrar(cifrar(x)) === x', () => {
    const claro = 'token-super-secreto-123';
    expect(decifrar(cifrar(claro, chave), chave)).toBe(claro);
  });

  it('dois cifrar do mesmo texto → blobs distintos (IV aleatório)', () => {
    const a = cifrar('igual', chave);
    const b = cifrar('igual', chave);
    expect(a).not.toBe(b);
    expect(decifrar(a, chave)).toBe('igual');
    expect(decifrar(b, chave)).toBe('igual');
  });

  it('authTag adulterado → lança', () => {
    const blob = Buffer.from(cifrar('x', chave), 'base64');
    blob[13] ^= 0xff; // corrompe um byte da tag
    expect(() => decifrar(blob.toString('base64'), chave)).toThrow();
  });

  it('chave errada → lança', () => {
    const blob = cifrar('x', chave);
    expect(() => decifrar(blob, randomBytes(32))).toThrow();
  });

  it('chave com tamanho errado → lança', () => {
    expect(() => cifrar('x', randomBytes(16))).toThrow(/32 bytes/);
    expect(() => decifrar('AAAA', randomBytes(16))).toThrow(/32 bytes/);
  });

  it('blob malformado → lança', () => {
    expect(() => decifrar('AA', chave)).toThrow(/malformado/);
  });
});
