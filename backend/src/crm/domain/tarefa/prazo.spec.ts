import { calcularEstadoPrazo } from './prazo';

describe('calcularEstadoPrazo (spec 016, research.md D-R3)', () => {
  it('sem dataVencimento nunca é vencendoHoje/atrasada', () => {
    const r = calcularEstadoPrazo(
      { dataVencimento: null, status: 'PENDENTE' },
      new Date('2026-09-09T12:00:00Z'),
    );
    expect(r).toEqual({ vencendoHoje: false, atrasada: false });
  });

  it('vence no mesmo dia civil em America/Sao_Paulo (UTC-3)', () => {
    // 2026-09-09T02:00:00Z = 2026-09-08 23:00 em São Paulo (mesmo dia civil que 08/09).
    const agora = new Date('2026-09-09T02:00:00Z');
    const r = calcularEstadoPrazo(
      { dataVencimento: new Date('2026-09-08T23:30:00Z'), status: 'PENDENTE' }, // 20:30 SP em 08/09
      agora,
    );
    expect(r).toEqual({ vencendoHoje: true, atrasada: false });
  });

  it('data no passado (dia civil anterior) é atrasada', () => {
    const agora = new Date('2026-09-09T15:00:00Z'); // 12:00 SP em 09/09
    const r = calcularEstadoPrazo(
      { dataVencimento: new Date('2026-09-08T15:00:00Z'), status: 'PENDENTE' }, // 09/09 seria diferente
      agora,
    );
    expect(r.atrasada).toBe(true);
    expect(r.vencendoHoje).toBe(false);
  });

  it('data no futuro não é atrasada nem vencendoHoje', () => {
    const agora = new Date('2026-09-09T15:00:00Z');
    const r = calcularEstadoPrazo(
      { dataVencimento: new Date('2026-09-15T15:00:00Z'), status: 'PENDENTE' },
      agora,
    );
    expect(r).toEqual({ vencendoHoje: false, atrasada: false });
  });

  it('tarefa CONCLUIDA nunca é atrasada/vencendoHoje mesmo com prazo estourado', () => {
    const agora = new Date('2026-09-09T15:00:00Z');
    const r = calcularEstadoPrazo(
      { dataVencimento: new Date('2026-01-01T00:00:00Z'), status: 'CONCLUIDA' },
      agora,
    );
    expect(r).toEqual({ vencendoHoje: false, atrasada: false });
  });

  it('tarefa CANCELADA nunca é atrasada/vencendoHoje', () => {
    const agora = new Date('2026-09-09T15:00:00Z');
    const r = calcularEstadoPrazo(
      { dataVencimento: new Date('2026-01-01T00:00:00Z'), status: 'CANCELADA' },
      agora,
    );
    expect(r).toEqual({ vencendoHoje: false, atrasada: false });
  });
});
