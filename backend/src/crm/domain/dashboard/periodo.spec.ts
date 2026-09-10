import { resolverPeriodo } from './periodo';

describe('resolverPeriodo', () => {
  it('resolve um mês e o período anterior de igual duração', () => {
    const p = resolverPeriodo('2026-08-01', '2026-08-31');
    expect(p.de.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(p.ate.toISOString()).toBe('2026-08-31T23:59:59.999Z');
    // 31 dias imediatamente antes de `de`
    expect(p.anteriorAte.toISOString()).toBe('2026-07-31T23:59:59.999Z');
    expect(p.anteriorDe.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(p.duracaoDias).toBe(31);
    expect(p.bucket).toBe('dia');
  });

  it('bucket semana entre ~2 meses e ~1 ano', () => {
    expect(resolverPeriodo('2026-01-01', '2026-06-30').bucket).toBe('semana');
  });

  it('bucket mês acima de ~1 ano', () => {
    expect(resolverPeriodo('2024-01-01', '2026-01-01').bucket).toBe('mes');
  });

  it('aceita ISO com hora', () => {
    const p = resolverPeriodo('2026-08-01T10:00:00.000Z', '2026-08-01T12:00:00.000Z');
    expect(p.de.toISOString()).toBe('2026-08-01T10:00:00.000Z');
    expect(p.ate.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('de > ate → throw', () => {
    expect(() => resolverPeriodo('2026-08-31', '2026-08-01')).toThrow(/de.*ate/i);
  });

  it('data inválida → throw', () => {
    expect(() => resolverPeriodo('ontem', '2026-08-01')).toThrow(/inválida/i);
    expect(() => resolverPeriodo('2026-08-01', '')).toThrow();
  });
});
