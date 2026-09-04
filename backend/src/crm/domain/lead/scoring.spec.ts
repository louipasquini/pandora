import { calcularScore, PESOS_SCORE_LEAD } from './scoring';
import type { EstadoScoreLead } from './tipos';

const AGORA = '2026-09-04T12:00:00.000Z';

function base(over: Partial<EstadoScoreLead> = {}): EstadoScoreLead {
  return {
    temEmail: false,
    temTelefone: false,
    temDocumento: false,
    temUtm: false,
    origem: null,
    estagio: 'NOVO',
    criadoEm: AGORA,
    qtdInteracoes: 0,
    ultimaInteracaoEm: null,
    qtdTags: 0,
    ...over,
  };
}

describe('calcularScore', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(AGORA));
  });
  afterEach(() => jest.useRealTimers());

  it('é determinístico: mesma entrada → mesmo inteiro', () => {
    const e = base({ temEmail: true, origem: 'formulario_lp', estagio: 'QUALIFICADO' });
    const primeiro = calcularScore(e);
    for (let i = 0; i < 500; i++) expect(calcularScore(e)).toBe(primeiro);
  });

  it('lead novo com só e-mail e origem = base 31', () => {
    // 12 (email) + 4 (origem sem utm) + 0 (NOVO) + 0 (engaj) + 15 (recência ≤3d) + 0
    expect(calcularScore(base({ temEmail: true, origem: 'formulario_lp' }))).toBe(31);
  });

  it('completar um contato aumenta o score', () => {
    const so = base({ temEmail: true, origem: 'x' });
    const mais = base({ temEmail: true, temTelefone: true, origem: 'x' });
    expect(calcularScore(mais)).toBeGreaterThan(calcularScore(so));
    expect(calcularScore(mais)).toBe(calcularScore(so) + PESOS_SCORE_LEAD.contato.telefone);
  });

  it('clampeia em 0 (lead frio e velho)', () => {
    const e = base({
      estagio: 'DESQUALIFICADO',
      criadoEm: '2026-06-01T00:00:00.000Z',
      ultimaInteracaoEm: null,
      qtdInteracoes: 0,
    });
    expect(calcularScore(e)).toBe(0);
  });

  it('clampeia em 100 (lead quente e completo)', () => {
    const e = base({
      temEmail: true,
      temTelefone: true,
      temDocumento: true,
      temUtm: true,
      origem: 'meta',
      estagio: 'QUALIFICADO',
      qtdInteracoes: 5,
      qtdTags: 3,
      ultimaInteracaoEm: AGORA,
    });
    expect(calcularScore(e)).toBe(100);
  });

  it('sempre devolve inteiro finito, nunca NaN/null', () => {
    const r = calcularScore(base());
    expect(Number.isInteger(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
  });

  it('livre de locale: idade de 10 dias dá o mesmo score em qualquer TZ do processo', () => {
    // O teste roda sob a matriz TZ da CI (UTC / America/Sao_Paulo / Asia/Tokyo).
    const e = base({ temEmail: true, criadoEm: '2026-08-25T12:00:00.000Z' });
    expect(calcularScore(e)).toBe(calcularScore({ ...e }));
    // recência > 3d e ≤ 14d → 8; sem decaimento (idade 10 ≤ 30)
    expect(calcularScore(e)).toBe(12 + 8);
  });
});
