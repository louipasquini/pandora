import { calcularDelta } from './calcular-delta';

describe('calcularDelta (spec 004)', () => {
  it('detecta adições', () => {
    expect(calcularDelta(['a'], ['a', 'b'])).toEqual({
      adicionadas: ['b'],
      removidas: [],
    });
  });

  it('detecta remoções', () => {
    expect(calcularDelta(['a', 'b'], ['a'])).toEqual({
      adicionadas: [],
      removidas: ['b'],
    });
  });

  it('detecta adição e remoção juntas', () => {
    expect(calcularDelta(['a', 'b'], ['b', 'c'])).toEqual({
      adicionadas: ['c'],
      removidas: ['a'],
    });
  });

  it('no-op (mesmo conjunto, ordem diferente) → null', () => {
    expect(calcularDelta(['a', 'b'], ['b', 'a'])).toBeNull();
    expect(calcularDelta([], [])).toBeNull();
  });
});
