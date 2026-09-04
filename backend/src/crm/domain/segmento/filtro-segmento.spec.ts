import { construirWhere, validarFiltro } from './filtro-segmento';

describe('validarFiltro — alvo LEAD', () => {
  it('aceita objeto vazio', () => {
    expect(validarFiltro('LEAD', {})).toEqual({
      ok: true,
      valor: { alvo: 'LEAD', filtro: {} },
    });
  });

  it('aceita os campos do esquema fechado', () => {
    const bruto = {
      estagio: ['QUALIFICADO', 'NUTRICAO'],
      status: ['ATIVO'],
      origem: ['formulario_lp'],
      tags: ['webinar-out'],
      responsavelId: ['550e8400-e29b-41d4-a716-446655440000'],
      campoPersonalizado: [{ chave: 'nicho', valor: 'esportiva' }],
      criadoDe: '2026-09-01T00:00:00Z',
      criadoAte: '2026-09-30T23:59:59Z',
    };
    const r = validarFiltro('LEAD', bruto);
    expect(r.ok).toBe(true);
  });

  it('rejeita chave fora do esquema', () => {
    const r = validarFiltro('LEAD', { valorEstimado: 100 });
    expect(r.ok).toBe(false);
  });

  it('rejeita tipo errado (estagio deveria ser array)', () => {
    const r = validarFiltro('LEAD', { estagio: 'QUALIFICADO' });
    expect(r.ok).toBe(false);
  });
});

describe('validarFiltro — alvo PESSOA', () => {
  it('aceita só tags/criadoDe/criadoAte', () => {
    const r = validarFiltro('PESSOA', { tags: ['cliente-vip'] });
    expect(r.ok).toBe(true);
  });

  it('rejeita campo de LEAD (estagio) em alvo PESSOA', () => {
    const r = validarFiltro('PESSOA', { estagio: ['QUALIFICADO'] });
    expect(r.ok).toBe(false);
  });
});

describe('construirWhere', () => {
  it('filtro vazio → {}', () => {
    const v = validarFiltro('LEAD', {});
    if (!v.ok) throw new Error('esperava ok');
    expect(construirWhere(v.valor)).toEqual({});
  });

  it('monta AND com cada campo presente (LEAD)', () => {
    const v = validarFiltro('LEAD', {
      estagio: ['QUALIFICADO'],
      tags: ['webinar-out'],
    });
    if (!v.ok) throw new Error('esperava ok');
    expect(construirWhere(v.valor)).toEqual({
      AND: [
        { estagio: { in: ['QUALIFICADO'] } },
        { tagAssociacoes: { some: { tag: { slug: { in: ['webinar-out'] } } } } },
      ],
    });
  });

  it('campoPersonalizado vira `some` sobre valores/definicao', () => {
    const v = validarFiltro('LEAD', {
      campoPersonalizado: [{ chave: 'nicho', valor: 'esportiva' }],
    });
    if (!v.ok) throw new Error('esperava ok');
    expect(construirWhere(v.valor)).toEqual({
      AND: [{ valores: { some: { definicao: { chave: 'nicho' }, valor: 'esportiva' } } }],
    });
  });

  it('criadoDe/criadoAte viram gte/lte de Date (PESSOA)', () => {
    const v = validarFiltro('PESSOA', {
      criadoDe: '2026-09-01T00:00:00Z',
      criadoAte: '2026-09-30T00:00:00Z',
    });
    if (!v.ok) throw new Error('esperava ok');
    expect(construirWhere(v.valor)).toEqual({
      AND: [
        { criadoEm: { gte: new Date('2026-09-01T00:00:00Z') } },
        { criadoEm: { lte: new Date('2026-09-30T00:00:00Z') } },
      ],
    });
  });
});
