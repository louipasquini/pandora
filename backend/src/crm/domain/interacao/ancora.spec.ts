import { validarAncora } from './ancora';

describe('validarAncora', () => {
  it('só pessoaId → ok tipo pessoa', () => {
    expect(validarAncora({ pessoaId: 'p1' })).toEqual({ ok: true, tipo: 'pessoa', id: 'p1' });
  });

  it('só leadId → ok tipo lead', () => {
    expect(validarAncora({ leadId: 'l1' })).toEqual({ ok: true, tipo: 'lead', id: 'l1' });
  });

  it('ambos preenchidos → erro "ambos"', () => {
    expect(validarAncora({ pessoaId: 'p1', leadId: 'l1' })).toEqual({
      ok: false,
      erro: 'ambos',
    });
  });

  it('nenhum preenchido → erro "nenhum"', () => {
    expect(validarAncora({})).toEqual({ ok: false, erro: 'nenhum' });
    expect(validarAncora({ pessoaId: null, leadId: null })).toEqual({
      ok: false,
      erro: 'nenhum',
    });
    expect(validarAncora({ pessoaId: '', leadId: '' })).toEqual({ ok: false, erro: 'nenhum' });
  });
});
