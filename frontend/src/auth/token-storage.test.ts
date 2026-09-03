import { afterEach, beforeEach, vi } from 'vitest';
import { clearToken, readToken, storageDisponivel, writeToken } from './token-storage';

describe('token-storage', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('round-trip por localStorage', () => {
    writeToken('abc.def.ghi');
    expect(readToken()).toBe('abc.def.ghi');
    clearToken();
    expect(readToken()).toBeNull();
  });

  it('degrada para memória quando localStorage.setItem lança, sem propagar', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota');
    });

    expect(() => writeToken('t0ken')).not.toThrow();
    expect(storageDisponivel()).toBe(false);
    // leitura via memória continua funcionando
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado');
    });
    expect(readToken()).toBe('t0ken');
  });
});
