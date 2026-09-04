import {
  PERMISSOES,
  PERMISSAO_IDS,
  agruparPorRecurso,
  assertCatalogoCoerente,
  ehPermissaoConhecida,
  type PermissaoDef,
} from './catalogo';

describe('catálogo de permissões (spec 004)', () => {
  it('tem ids únicos e no formato recurso:acao', () => {
    expect(() => assertCatalogoCoerente()).not.toThrow();
    const ids = PERMISSOES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PERMISSOES) {
      expect(p.id).toMatch(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/);
      expect(p.id.startsWith(`${p.recurso}:`)).toBe(true);
    }
  });

  it('inclui o vocabulário exigido pela spec (perfil:administrar + lead:*)', () => {
    for (const id of [
      'perfil:administrar',
      'lead:criar',
      'lead:editar',
      'lead:ver_todos',
      'lead:ver_proprios',
    ]) {
      expect(PERMISSAO_IDS.has(id)).toBe(true);
    }
  });

  it('inclui os recursos pessoa e conta (spec 005)', () => {
    for (const id of [
      'pessoa:ver',
      'pessoa:editar',
      'pessoa:merge',
      'conta:ver',
      'conta:editar',
      'conta:merge',
    ]) {
      expect(PERMISSAO_IDS.has(id)).toBe(true);
    }
    // recurso == prefixo do id para os novos
    for (const p of PERMISSOES.filter(
      (x) => x.recurso === 'pessoa' || x.recurso === 'conta',
    )) {
      expect(p.id.startsWith(`${p.recurso}:`)).toBe(true);
    }
  });

  it('inclui o recurso evento (spec 006)', () => {
    for (const id of ['evento:ver', 'evento:reprocessar', 'evento:ingerir']) {
      expect(PERMISSAO_IDS.has(id)).toBe(true);
    }
    for (const p of PERMISSOES.filter((x) => x.recurso === 'evento')) {
      expect(p.id.startsWith('evento:')).toBe(true);
    }
  });

  it('inclui o recurso crm_admin (spec 007 + 008)', () => {
    for (const id of [
      'crm_admin:ver',
      'crm_admin:gerir_equipes',
      'crm_admin:gerir_expediente',
      'crm_admin:gerir_integracoes',
      'crm_admin:gerir_campos_lead',
    ]) {
      expect(PERMISSAO_IDS.has(id)).toBe(true);
    }
    for (const p of PERMISSOES.filter((x) => x.recurso === 'crm_admin')) {
      expect(p.id.startsWith('crm_admin:')).toBe(true);
    }
  });

  it('ehPermissaoConhecida distingue catálogo de lixo', () => {
    expect(ehPermissaoConhecida('lead:criar')).toBe(true);
    expect(ehPermissaoConhecida('lead:inventada')).toBe(false);
  });

  it('assertCatalogoCoerente aborta em id duplicado', () => {
    const ruim: PermissaoDef[] = [
      { id: 'x:a', recurso: 'x', rotulo: 'A' },
      { id: 'x:a', recurso: 'x', rotulo: 'A de novo' },
    ];
    expect(() => assertCatalogoCoerente(ruim)).toThrow(/duplicado/);
  });

  it('assertCatalogoCoerente aborta em formato inválido', () => {
    expect(() =>
      assertCatalogoCoerente([{ id: 'SemDoisPontos', recurso: 'x', rotulo: 'X' }]),
    ).toThrow(/formato/);
  });

  it('assertCatalogoCoerente aborta quando recurso não bate com o prefixo do id', () => {
    expect(() =>
      assertCatalogoCoerente([{ id: 'a:b', recurso: 'z', rotulo: 'B' }]),
    ).toThrow(/não bate/);
  });

  it('inclui os recursos interacao e segmento (spec 009)', () => {
    for (const id of [
      'interacao:registrar',
      'interacao:gerir',
      'segmento:ver',
      'segmento:gerir',
      'crm_admin:gerir_tags',
    ]) {
      expect(PERMISSAO_IDS.has(id)).toBe(true);
    }
    for (const p of PERMISSOES.filter(
      (x) => x.recurso === 'interacao' || x.recurso === 'segmento',
    )) {
      expect(p.id.startsWith(`${p.recurso}:`)).toBe(true);
    }
  });

  it('agruparPorRecurso preserva a ordem de 1ª aparição', () => {
    const grupos = agruparPorRecurso();
    expect(grupos.map((g) => g.recurso)).toEqual([
      'perfil',
      'lead',
      'pessoa',
      'conta',
      'evento',
      'crm_admin',
      'interacao',
      'segmento',
    ]);
    expect(grupos[5].permissoes.map((p) => p.id)).toEqual([
      'crm_admin:ver',
      'crm_admin:gerir_equipes',
      'crm_admin:gerir_expediente',
      'crm_admin:gerir_integracoes',
      'crm_admin:gerir_campos_lead',
      'crm_admin:gerir_tags',
    ]);
    expect(grupos[1].permissoes.map((p) => p.id)).toEqual([
      'lead:criar',
      'lead:editar',
      'lead:ver_todos',
      'lead:ver_proprios',
    ]);
    expect(grupos[2].permissoes.map((p) => p.id)).toEqual([
      'pessoa:ver',
      'pessoa:editar',
      'pessoa:merge',
    ]);
    expect(grupos[3].permissoes.map((p) => p.id)).toEqual([
      'conta:ver',
      'conta:editar',
      'conta:merge',
    ]);
  });
});
