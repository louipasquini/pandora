import { calcularEsfriando } from './esfriando';

describe('calcularEsfriando (spec 010)', () => {
  const ref = new Date('2026-09-01T00:00:00.000Z');

  it('sem diasEsfriando nunca esfria', () => {
    expect(calcularEsfriando(null, ref, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });

  it('referência recente não esfria', () => {
    const agora = new Date(ref.getTime() + 60 * 1000);
    expect(calcularEsfriando(7, ref, agora)).toBe(false);
  });

  it('além do limiar esfria', () => {
    const agora = new Date(ref.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(calcularEsfriando(7, ref, agora)).toBe(true);
  });

  it('no limite exato ainda não esfriou', () => {
    const agora = new Date(ref.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(calcularEsfriando(7, ref, agora)).toBe(false);
  });
});
