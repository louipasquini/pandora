import { agruparEmBuckets, rotuloBucket, type PontoDatado } from './serie-temporal';

describe('agruparEmBuckets', () => {
  const pontos: PontoDatado[] = [
    { quando: new Date('2026-08-01T12:00:00Z'), valor: 2 },
    { quando: new Date('2026-08-01T20:00:00Z'), valor: 3 },
    { quando: new Date('2026-08-02T09:00:00Z'), valor: 1 },
  ];

  it('soma por dia local e ordena', () => {
    expect(agruparEmBuckets(pontos, 'dia')).toEqual([
      { rotulo: '2026-08-01', valor: 5 },
      { rotulo: '2026-08-02', valor: 1 },
    ]);
  });

  it('agrupa por semana (segunda-feira)', () => {
    const r = agruparEmBuckets(pontos, 'semana');
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe(6);
  });

  it('agrupa por mês', () => {
    const mais: PontoDatado[] = [
      ...pontos,
      { quando: new Date('2026-09-15T12:00:00Z'), valor: 10 },
    ];
    expect(agruparEmBuckets(mais, 'mes')).toEqual([
      { rotulo: '2026-08', valor: 6 },
      { rotulo: '2026-09', valor: 10 },
    ]);
  });

  it('lista vazia → []', () => {
    expect(agruparEmBuckets([], 'dia')).toEqual([]);
  });

  it('rotuloBucket respeita o fuso America/Sao_Paulo (UTC-3)', () => {
    // 2026-08-02T02:00:00Z = 2026-08-01 23:00 em São Paulo
    expect(rotuloBucket(new Date('2026-08-02T02:00:00Z'), 'dia')).toBe('2026-08-01');
  });
});
