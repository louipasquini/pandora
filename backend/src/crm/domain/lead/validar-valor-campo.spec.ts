import { validarValorCampo, validarDefinicao } from './validar-valor-campo';

describe('validarValorCampo', () => {
  it('TEXTO: string; vazio → remover', () => {
    expect(validarValorCampo('TEXTO', [], ' clinica ')).toEqual({ ok: true, valor: 'clinica' });
    expect(validarValorCampo('TEXTO', [], '   ')).toEqual({ ok: true, remover: true });
    expect(validarValorCampo('TEXTO', [], null)).toEqual({ ok: true, remover: true });
  });

  it('NUMERO: finito', () => {
    expect(validarValorCampo('NUMERO', [], '12.5')).toEqual({ ok: true, valor: '12.5' });
    expect(validarValorCampo('NUMERO', [], 'abc').ok).toBe(false);
    expect(validarValorCampo('NUMERO', [], '').ok).toBe(false);
  });

  it('BOOLEANO: true|false', () => {
    expect(validarValorCampo('BOOLEANO', [], 'true')).toEqual({ ok: true, valor: 'true' });
    expect(validarValorCampo('BOOLEANO', [], false)).toEqual({ ok: true, valor: 'false' });
    expect(validarValorCampo('BOOLEANO', [], 'sim').ok).toBe(false);
  });

  it('DATA: YYYY-MM-DD', () => {
    expect(validarValorCampo('DATA', [], '2026-09-04')).toEqual({ ok: true, valor: '2026-09-04' });
    expect(validarValorCampo('DATA', [], '04/09/2026').ok).toBe(false);
    expect(validarValorCampo('DATA', [], '2026-13-40').ok).toBe(false);
  });

  it('SELECAO: ∈ opcoes', () => {
    expect(validarValorCampo('SELECAO', ['a', 'b'], 'a')).toEqual({ ok: true, valor: 'a' });
    expect(validarValorCampo('SELECAO', ['a', 'b'], 'c').ok).toBe(false);
  });
});

describe('validarDefinicao', () => {
  it('SELECAO exige opcoes; outros tipos rejeitam opcoes', () => {
    expect(validarDefinicao({ tipo: 'SELECAO', opcoes: [] }).ok).toBe(false);
    expect(validarDefinicao({ tipo: 'SELECAO', opcoes: ['x'] }).ok).toBe(true);
    expect(validarDefinicao({ tipo: 'TEXTO', opcoes: ['x'] }).ok).toBe(false);
    expect(validarDefinicao({ tipo: 'TEXTO', opcoes: [] }).ok).toBe(true);
  });
});
