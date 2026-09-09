import { tempoTotalSegundos, haPeriodoAberto } from './cronometro';

describe('cronometro (spec 016)', () => {
  it('soma períodos fechados', () => {
    const periodos = [
      { inicio: new Date('2026-09-09T10:00:00Z'), fim: new Date('2026-09-09T10:00:10Z') },
      { inicio: new Date('2026-09-09T11:00:00Z'), fim: new Date('2026-09-09T11:00:05Z') },
    ];
    expect(tempoTotalSegundos(periodos, new Date('2026-09-09T12:00:00Z'))).toBe(15);
  });

  it('soma o período aberto até "agora"', () => {
    const periodos = [{ inicio: new Date('2026-09-09T10:00:00Z'), fim: null }];
    expect(tempoTotalSegundos(periodos, new Date('2026-09-09T10:00:20Z'))).toBe(20);
  });

  it('sem períodos é 0', () => {
    expect(tempoTotalSegundos([], new Date())).toBe(0);
  });

  it('haPeriodoAberto detecta período com fim null', () => {
    expect(haPeriodoAberto([{ inicio: new Date(), fim: null }])).toBe(true);
    expect(haPeriodoAberto([{ inicio: new Date(), fim: new Date() }])).toBe(false);
    expect(haPeriodoAberto([])).toBe(false);
  });
});
