import {
  PAINEIS_DASHBOARD,
  assertCatalogoPaineisCoerente,
  ehPainelConhecido,
  painelEhTabular,
  painelVisivel,
  paineisVisiveis,
  type PainelDef,
} from './paineis';

describe('PAINEIS_DASHBOARD — catálogo fechado', () => {
  it('tem ids únicos e no formato snake_case', () => {
    const ids = PAINEIS_DASHBOARD.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('assertCatalogoPaineisCoerente passa com o catálogo real', () => {
    expect(() => assertCatalogoPaineisCoerente()).not.toThrow();
  });

  it('aborta com id duplicado', () => {
    const dup = [PAINEIS_DASHBOARD[0], PAINEIS_DASHBOARD[0]] as unknown as PainelDef[];
    expect(() => assertCatalogoPaineisCoerente(dup)).toThrow(/duplicado/);
  });

  it('aborta com permissão fora do catálogo RBAC', () => {
    const ruim: PainelDef[] = [
      { id: 'x', titulo: 'X', formato: 'numero', permissoesAlternativas: ['nao:existe'] },
    ];
    expect(() => assertCatalogoPaineisCoerente(ruim)).toThrow(/fora do catálogo RBAC/);
  });

  it('visao_geral não exige permissão específica', () => {
    const vg = PAINEIS_DASHBOARD.find((p) => p.id === 'visao_geral')!;
    expect(vg.permissoesAlternativas).toEqual([]);
  });

  it('só tabela/ranking são tabulares (aceitam ?formato=csv)', () => {
    for (const p of PAINEIS_DASHBOARD) {
      expect(painelEhTabular(p)).toBe(p.formato === 'tabela' || p.formato === 'ranking');
    }
  });

  it('ehPainelConhecido', () => {
    expect(ehPainelConhecido('funil_pipeline')).toBe(true);
    expect(ehPainelConhecido('nao_existe')).toBe(false);
  });
});

describe('painelVisivel / paineisVisiveis', () => {
  it('sem dashboard:ver nada é visível', () => {
    const perms = new Set(['oportunidade:ver_todas']);
    expect(paineisVisiveis(perms)).toEqual([]);
  });

  it('só dashboard:ver → só os painéis de visão geral', () => {
    const perms = new Set(['dashboard:ver']);
    const vis = paineisVisiveis(perms).map((p) => p.id);
    expect(vis).toContain('visao_geral');
    expect(vis).not.toContain('ranking_comercial');
    expect(vis).not.toContain('funil_pipeline');
  });

  it('ver_proprias libera funil mas não ranking (que exige ver_todas)', () => {
    const perms = new Set(['dashboard:ver', 'oportunidade:ver_proprias']);
    const vis = paineisVisiveis(perms).map((p) => p.id);
    expect(vis).toContain('funil_pipeline');
    expect(vis).toContain('serie_oportunidades');
    expect(vis).not.toContain('ranking_comercial');
  });

  it('ver_todas libera ranking', () => {
    const perms = new Set(['dashboard:ver', 'oportunidade:ver_todas']);
    expect(paineisVisiveis(perms).map((p) => p.id)).toContain('ranking_comercial');
  });

  it('painelVisivel para atendimento com ver_proprios', () => {
    const qa = PAINEIS_DASHBOARD.find((p) => p.id === 'qualidade_atendimento')!;
    expect(painelVisivel(qa, new Set(['dashboard:ver', 'atendimento:ver_proprios']))).toBe(true);
    expect(painelVisivel(qa, new Set(['dashboard:ver']))).toBe(false);
  });
});
