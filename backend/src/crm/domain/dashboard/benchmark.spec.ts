import { calcularDelta } from './benchmark';

describe('calcularDelta', () => {
  it('delta absoluto e percentual', () => {
    expect(calcularDelta(42, 30)).toEqual({
      valor: 42,
      periodoAnterior: 30,
      delta: 12,
      deltaPercentual: 0.4,
    });
  });

  it('queda', () => {
    const d = calcularDelta(18, 20);
    expect(d.delta).toBe(-2);
    expect(d.deltaPercentual).toBeCloseTo(-0.1);
  });

  it('período anterior 0 → deltaPercentual null (sem divisão por zero)', () => {
    expect(calcularDelta(5, 0)).toEqual({
      valor: 5,
      periodoAnterior: 0,
      delta: 5,
      deltaPercentual: null,
    });
  });

  it('ambos 0', () => {
    expect(calcularDelta(0, 0)).toEqual({
      valor: 0,
      periodoAnterior: 0,
      delta: 0,
      deltaPercentual: null,
    });
  });
});
