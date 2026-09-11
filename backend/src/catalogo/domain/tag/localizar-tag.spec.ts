import { localizarTag } from './localizar-tag';

describe('localizarTag', () => {
  it('ancorada: codigoOrigem inteiro casa o formato exato (Guru)', () => {
    expect(localizarTag({ codigoOrigem: 'PCS48XAV' })).toBe('PCS48XAV');
  });

  it('ancorada é case-insensitive na entrada, mas devolve maiúsculo', () => {
    expect(localizarTag({ codigoOrigem: 'pcs48xav' })).toBe('PCS48XAV');
  });

  it('texto livre em nomeOrigem (Asaas/TMB)', () => {
    expect(
      localizarTag({ nomeOrigem: 'Mensalidade Programa Consultório - #PCS00LAV' }),
    ).toBe('PCS00LAV');
  });

  it('texto livre em codigoOrigem quando não é âncora exata', () => {
    expect(localizarTag({ codigoOrigem: 'ref-interna [#PCS48XAV]' })).toBe('PCS48XAV');
  });

  it('prioriza codigoOrigem sobre nomeOrigem quando ambos têm texto livre', () => {
    expect(
      localizarTag({
        codigoOrigem: '[#AAA11BBB]',
        nomeOrigem: '[#PCS48XAV]',
      }),
    ).toBe('AAA11BBB');
  });

  it('nada encontrado -> null', () => {
    expect(localizarTag({ codigoOrigem: 'sem tag aqui', nomeOrigem: 'nem aqui' })).toBeNull();
    expect(localizarTag({})).toBeNull();
  });

  it('hashtag mal-formada (7 chars) não é um falso-positivo', () => {
    expect(localizarTag({ nomeOrigem: 'promoção #PCS48XA especial' })).toBeNull();
  });
});
