import {
  dinheiroDeValorHotmart,
  enderecoDeHotmart,
  moedaDeHotmart,
  soDigitos,
  somarDinheiro,
  taxasDe,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-hotmart';

describe('normalizar-hotmart (spec 022 — puro, sem banco)', () => {
  describe('dinheiroDeValorHotmart', () => {
    it('inteiro → ×10000', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorHotmart(134, erros, 'x')).toEqual({
        valorInteiro: 1340000n,
        moeda: 'BRL',
      });
      expect(erros).toEqual([]);
    });

    it('decimal → ×10000 sem float', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorHotmart(150.6, erros, 'x')).toEqual({
        valorInteiro: 1506000n,
        moeda: 'BRL',
      });
    });

    it('moeda parametrizada é respeitada', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorHotmart('60', erros, 'x', 'USD')).toEqual({
        valorInteiro: 600000n,
        moeda: 'USD',
      });
    });

    it('não-numérico / NaN / negativo / científico → undefined + erro', () => {
      for (const v of ['abc', Number.NaN, -5, '1e3', {}]) {
        const erros: string[] = [];
        expect(dinheiroDeValorHotmart(v as unknown, erros, 'campo')).toBeUndefined();
        expect(erros.length).toBe(1);
      }
    });

    it('null / "" → undefined sem erro', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorHotmart(null, erros, 'x')).toBeUndefined();
      expect(dinheiroDeValorHotmart('', erros, 'x')).toBeUndefined();
      expect(erros).toEqual([]);
    });
  });

  describe('moedaDeHotmart', () => {
    it('normaliza para ISO 4217 maiúsculo', () => {
      expect(moedaDeHotmart('brl')).toBe('BRL');
      expect(moedaDeHotmart('  usd ')).toBe('USD');
    });
    it('inválida / vazia → undefined', () => {
      expect(moedaDeHotmart('reais')).toBeUndefined();
      expect(moedaDeHotmart('')).toBeUndefined();
      expect(moedaDeHotmart(null)).toBeUndefined();
    });
  });

  describe('taxasDe', () => {
    const bruto = { valorInteiro: 1506000n, moeda: 'BRL' };
    it('taxa explícita sã (0 < taxa < bruto, mesma moeda)', () => {
      expect(taxasDe(bruto, undefined, { valorInteiro: 149000n, moeda: 'BRL' })).toEqual({
        valorInteiro: 149000n,
        moeda: 'BRL',
      });
    });
    it('taxa em moeda divergente → cai para bruto − liquido; senão omite', () => {
      expect(
        taxasDe(bruto, undefined, { valorInteiro: 10n, moeda: 'USD' }),
      ).toBeUndefined();
      expect(
        taxasDe(bruto, { valorInteiro: 1357000n, moeda: 'BRL' }, { valorInteiro: 10n, moeda: 'USD' }),
      ).toEqual({ valorInteiro: 149000n, moeda: 'BRL' });
    });
    it('taxa >= bruto → descartada', () => {
      expect(taxasDe(bruto, undefined, { valorInteiro: 2000000n, moeda: 'BRL' })).toBeUndefined();
    });
  });

  describe('somarDinheiro', () => {
    it('soma mesma moeda', () => {
      expect(
        somarDinheiro({ valorInteiro: 100n, moeda: 'BRL' }, { valorInteiro: 50n, moeda: 'BRL' }),
      ).toEqual({ valorInteiro: 150n, moeda: 'BRL' });
    });
    it('moeda divergente → devolve o 1º não-nulo', () => {
      expect(
        somarDinheiro({ valorInteiro: 100n, moeda: 'BRL' }, { valorInteiro: 50n, moeda: 'USD' }),
      ).toEqual({ valorInteiro: 100n, moeda: 'BRL' });
    });
  });

  it('soDigitos / telefonesDeString / enderecoDeHotmart', () => {
    expect(soDigitos('390.533.447-05')).toBe('39053344705');
    expect(telefonesDeString('11', '991234567')).toEqual(['11', '991234567']);
    expect(telefonesDeString(undefined, '')).toEqual([]);
    expect(enderecoDeHotmart({ cidade: 'São Paulo', uf: 'SP', complemento: '' })).toEqual({
      cidade: 'São Paulo',
      uf: 'SP',
    });
    expect(enderecoDeHotmart({})).toBeUndefined();
    expect(textoOuUndefined('  ')).toBeUndefined();
  });
});
