import { estaDentroDaJanela24h } from './janela-24h';

describe('estaDentroDaJanela24h', () => {
  const agora = new Date('2026-09-04T12:00:00Z');

  it('nunca recebeu mensagem (null) → false', () => {
    expect(estaDentroDaJanela24h(null, agora)).toBe(false);
  });

  it('recebida há menos de 24h → true', () => {
    const ultima = new Date('2026-09-04T00:00:01Z');
    expect(estaDentroDaJanela24h(ultima, agora)).toBe(true);
  });

  it('recebida exatamente há 24h → false (limite exclusivo)', () => {
    const ultima = new Date('2026-09-03T12:00:00Z');
    expect(estaDentroDaJanela24h(ultima, agora)).toBe(false);
  });

  it('recebida há mais de 24h → false', () => {
    const ultima = new Date('2026-09-03T00:00:00Z');
    expect(estaDentroDaJanela24h(ultima, agora)).toBe(false);
  });

  it('recebida agora mesmo (0ms) → true', () => {
    expect(estaDentroDaJanela24h(agora, agora)).toBe(true);
  });
});
