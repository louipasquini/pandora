import { Dinheiro } from './dinheiro';
import { ratear, ratearPorPesos } from './ratear';

const soma = (partes: Dinheiro[]): Dinheiro =>
  partes.reduce((acc, p) => acc.somar(p), Dinheiro.zero(partes[0].moeda));

describe('ratear', () => {
  it('divide igual quando dá exato', () => {
    const partes = ratear(Dinheiro.deDecimal('9.0000', 'BRL'), 3);
    expect(partes.map((p) => p.toString())).toEqual([
      '3.0000 BRL',
      '3.0000 BRL',
      '3.0000 BRL',
    ]);
  });

  it('distribui o resto nas primeiras parcelas e a soma fecha exatamente', () => {
    const total = Dinheiro.deDecimal('10.0000', 'BRL'); // 100000 / 3 => 33333 + resto 1
    const partes = ratear(total, 3);
    expect(partes.map((p) => p.valorInt)).toEqual([33334n, 33333n, 33333n]);
    expect(soma(partes).equals(total)).toBe(true);
  });

  it('funciona com total negativo (resto distribuído com sinal)', () => {
    const total = Dinheiro.deDecimal('-10.0000', 'BRL');
    const partes = ratear(total, 3);
    expect(partes.map((p) => p.valorInt)).toEqual([-33334n, -33333n, -33333n]);
    expect(soma(partes).equals(total)).toBe(true);
  });

  it('rejeita n não inteiro ou <= 0', () => {
    const total = Dinheiro.deDecimal('10', 'BRL');
    expect(() => ratear(total, 0)).toThrow(RangeError);
    expect(() => ratear(total, -1)).toThrow(RangeError);
    expect(() => ratear(total, 2.5)).toThrow(RangeError);
  });
});

describe('ratearPorPesos', () => {
  it('proporcional exato', () => {
    const total = Dinheiro.deDecimal('100.0000', 'BRL');
    const partes = ratearPorPesos(total, [1, 1, 2]); // 25 / 25 / 50
    expect(partes.map((p) => p.toString())).toEqual([
      '25.0000 BRL',
      '25.0000 BRL',
      '50.0000 BRL',
    ]);
    expect(soma(partes).equals(total)).toBe(true);
  });

  it('resto vai para a maior fração residual; soma fecha', () => {
    const total = Dinheiro.deDecimal('10.0000', 'BRL'); // 100000 em [1,1,1]
    const partes = ratearPorPesos(total, [1, 1, 1]);
    expect(soma(partes).equals(total)).toBe(true);
    expect(partes.map((p) => p.valorInt).reduce((a, b) => a + b, 0n)).toBe(100000n);
    // uma parcela fica com a unidade extra
    expect(partes.map((p) => p.valorInt).sort()).toEqual([33333n, 33333n, 33334n]);
  });

  it('peso 0 não recebe valor', () => {
    const total = Dinheiro.deDecimal('90.0000', 'BRL');
    const partes = ratearPorPesos(total, [0, 1, 2]);
    expect(partes[0].ehZero()).toBe(true);
    expect(soma(partes).equals(total)).toBe(true);
  });

  it('rejeita pesos inválidos', () => {
    const total = Dinheiro.deDecimal('10', 'BRL');
    expect(() => ratearPorPesos(total, [])).toThrow(RangeError);
    expect(() => ratearPorPesos(total, [0, 0])).toThrow(RangeError);
    expect(() => ratearPorPesos(total, [1, -1])).toThrow(RangeError);
    expect(() => ratearPorPesos(total, [1.5, 1])).toThrow(RangeError);
  });
});
