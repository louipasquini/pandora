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

  it('agruparPorRecurso preserva a ordem de 1ª aparição', () => {
    const grupos = agruparPorRecurso();
    expect(grupos.map((g) => g.recurso)).toEqual(['perfil', 'lead']);
    expect(grupos[1].permissoes.map((p) => p.id)).toEqual([
      'lead:criar',
      'lead:editar',
      'lead:ver_todos',
      'lead:ver_proprios',
    ]);
  });
});
