import { PERFIL_ADMIN_ID } from '../auth.constants';
import { PERMISSOES } from './catalogo';
import { resolverPermissoesEfetivas } from './resolver-permissoes';

describe('resolverPermissoesEfetivas (spec 004)', () => {
  it('faz a união das permissões dos perfis, sem duplicata', () => {
    const set = resolverPermissoesEfetivas([
      { id: 'p1', permissoes: ['lead:criar', 'lead:editar'] },
      { id: 'p2', permissoes: ['lead:editar', 'lead:ver_todos'] },
    ]);
    expect([...set].sort()).toEqual([
      'lead:criar',
      'lead:editar',
      'lead:ver_todos',
    ]);
  });

  it('descarta permissão fora do catálogo', () => {
    const set = resolverPermissoesEfetivas([
      { id: 'p1', permissoes: ['lead:criar', 'lead:fantasma'] },
    ]);
    expect([...set]).toEqual(['lead:criar']);
  });

  it('lista vazia / perfis sem permissão → conjunto vazio', () => {
    expect(resolverPermissoesEfetivas([]).size).toBe(0);
    expect(
      resolverPermissoesEfetivas([{ id: 'p1', permissoes: [] }]).size,
    ).toBe(0);
  });

  it('perfil administrador → catálogo inteiro (ignora a lista de permissões dele)', () => {
    const set = resolverPermissoesEfetivas([
      { id: PERFIL_ADMIN_ID, permissoes: [] },
    ]);
    expect(set.size).toBe(PERMISSOES.length);
    expect(set.has('perfil:administrar')).toBe(true);
  });
});
