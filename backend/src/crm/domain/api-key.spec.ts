import { API_KEY_PREFIXO, gerarApiKey, hashSegredo } from './api-key';

describe('api-key', () => {
  it('gerarApiKey → prefixo crm_ + 40 hex', () => {
    const { valor } = gerarApiKey();
    expect(valor.startsWith(API_KEY_PREFIXO)).toBe(true);
    expect(valor.slice(API_KEY_PREFIXO.length)).toMatch(/^[0-9a-f]{40}$/);
  });

  it('hash bate com hashSegredo(valor)', () => {
    const { valor, hash } = gerarApiKey();
    expect(hash).toBe(hashSegredo(valor));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashSegredo é determinístico', () => {
    expect(hashSegredo('abc')).toBe(hashSegredo('abc'));
    expect(hashSegredo('abc')).not.toBe(hashSegredo('abd'));
  });

  it('1000 chaves — sem colisão de valor nem de hash', () => {
    const valores = new Set<string>();
    const hashes = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const { valor, hash } = gerarApiKey();
      valores.add(valor);
      hashes.add(hash);
    }
    expect(valores.size).toBe(1000);
    expect(hashes.size).toBe(1000);
  });
});
