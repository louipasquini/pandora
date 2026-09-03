import { expirado, lerExp } from './decode-jwt';
import { fakeJwt } from '../test/auth-helpers';

describe('decode-jwt', () => {
  it('lerExp devolve o exp do payload', () => {
    const agora = Math.floor(Date.now() / 1000);
    expect(lerExp(fakeJwt(3600))).toBeGreaterThanOrEqual(agora + 3590);
  });

  it('lerExp devolve null para token quebrado', () => {
    expect(lerExp('não-é-um-jwt')).toBeNull();
    expect(lerExp('a.b')).toBeNull();
    expect(lerExp('a.@@@.c')).toBeNull();
  });

  it('expirado: futuro → false, passado → true', () => {
    expect(expirado(fakeJwt(3600))).toBe(false);
    expect(expirado(fakeJwt(-10))).toBe(true);
  });

  it('expirado: token sem exp legível → true (trata como deslogado)', () => {
    expect(expirado('lixo')).toBe(true);
  });
});
