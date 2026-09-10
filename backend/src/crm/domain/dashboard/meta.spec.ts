import {
  METRICAS_META,
  metricaMetaPorId,
  normalizarReferencia,
  periodoDaMeta,
  statusMeta,
} from './meta';

describe('METRICAS_META — catálogo fechado', () => {
  it('ids únicos', () => {
    const ids = METRICAS_META.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('valor_ganho é monetária, o resto não', () => {
    expect(metricaMetaPorId('valor_ganho')?.monetaria).toBe(true);
    expect(metricaMetaPorId('leads_novos')?.monetaria).toBe(false);
    expect(metricaMetaPorId('nao_existe')).toBeUndefined();
  });
});

describe('normalizarReferencia', () => {
  it('MES → 1º dia do mês', () => {
    expect(normalizarReferencia('MES', new Date('2026-08-15')).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });
  it('TRIMESTRE → 1º dia do trimestre', () => {
    expect(normalizarReferencia('TRIMESTRE', new Date('2026-08-15')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
    expect(normalizarReferencia('TRIMESTRE', new Date('2026-02-10')).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
});

describe('periodoDaMeta', () => {
  it('MES agosto/2026 (America/Sao_Paulo, UTC-3)', () => {
    const { inicio, fim } = periodoDaMeta('MES', new Date('2026-08-01'));
    expect(inicio.toISOString()).toBe('2026-08-01T03:00:00.000Z'); // 00:00 local
    expect(fim.toISOString()).toBe('2026-09-01T02:59:59.999Z');
  });
  it('TRIMESTRE Q3/2026', () => {
    const { inicio, fim } = periodoDaMeta('TRIMESTRE', new Date('2026-07-01'));
    expect(inicio.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });
});

describe('statusMeta', () => {
  const intervalo = periodoDaMeta('MES', new Date('2026-08-01'));

  it('realizado >= alvo → batida', () => {
    const r = statusMeta(55, 50, intervalo, new Date('2026-08-20T12:00:00Z'));
    expect(r.status).toBe('batida');
    expect(r.noRitmo).toBe(true);
    expect(r.percentual).toBeCloseTo(1.1);
  });

  it('ritmo abaixo do decorrido → em_risco', () => {
    // ~80% do mês decorrido, só 60% do alvo
    const r = statusMeta(30, 50, intervalo, new Date('2026-08-26T00:00:00Z'));
    expect(r.status).toBe('em_risco');
    expect(r.noRitmo).toBe(false);
  });

  it('ritmo compatível → no_caminho', () => {
    // ~35% do mês decorrido, 40% do alvo
    const r = statusMeta(20, 50, intervalo, new Date('2026-08-11T12:00:00Z'));
    expect(r.status).toBe('no_caminho');
    expect(r.noRitmo).toBe(true);
  });

  it('período encerrado sem bater → em_risco (veredito final)', () => {
    const r = statusMeta(40, 50, intervalo, new Date('2026-09-05T00:00:00Z'));
    expect(r.status).toBe('em_risco');
    expect(r.noRitmo).toBe(false);
  });

  it('alvo 0 → percentual null, nunca divisão por zero', () => {
    const r = statusMeta(3, 0, intervalo, new Date('2026-08-10T00:00:00Z'));
    expect(r.percentual).toBeNull();
  });
});
