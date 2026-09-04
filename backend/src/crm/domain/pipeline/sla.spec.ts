import { calcularSlaEstourado } from './sla';

describe('calcularSlaEstourado (spec 010)', () => {
  const entrou = new Date('2026-09-01T00:00:00.000Z');

  it('sem slaHoras nunca estoura', () => {
    expect(calcularSlaEstourado(null, entrou, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });

  it('no limite exato ainda não estourou', () => {
    const agora = new Date(entrou.getTime() + 48 * 60 * 60 * 1000);
    expect(calcularSlaEstourado(48, entrou, agora)).toBe(false);
  });

  it('um segundo além do limite estourou', () => {
    const agora = new Date(entrou.getTime() + 48 * 60 * 60 * 1000 + 1000);
    expect(calcularSlaEstourado(48, entrou, agora)).toBe(true);
  });

  it('antes do limite não estourou', () => {
    const agora = new Date(entrou.getTime() + 1000);
    expect(calcularSlaEstourado(48, entrou, agora)).toBe(false);
  });
});
