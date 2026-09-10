import {
  dinheiroDeValorGuru,
  enderecoDeGuru,
  moedaDeGuru,
  soDigitos,
  taxasDe,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-guru';

describe('normalizar-guru (spec 021 — puro)', () => {
  describe('dinheiroDeValorGuru', () => {
    it('número inteiro → bigint ×10000, BRL default', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorGuru(497, erros, 'x')).toEqual({
        valorInteiro: 4970000n,
        moeda: 'BRL',
      });
      expect(erros).toEqual([]);
    });

    it('decimal com 2 casas', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorGuru(19.9, erros, 'x')).toEqual({
        valorInteiro: 199000n,
        moeda: 'BRL',
      });
      expect(dinheiroDeValorGuru('468.10', erros, 'x')).toEqual({
        valorInteiro: 4681000n,
        moeda: 'BRL',
      });
    });

    it('moeda parametrizada é respeitada', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorGuru(60, erros, 'x', 'USD')).toEqual({
        valorInteiro: 600000n,
        moeda: 'USD',
      });
    });

    it('não-numérico / NaN / negativo / notação científica → undefined + erro', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorGuru('abc', erros, 'a')).toBeUndefined();
      expect(dinheiroDeValorGuru(NaN, erros, 'b')).toBeUndefined();
      expect(dinheiroDeValorGuru(-5, erros, 'c')).toBeUndefined();
      expect(dinheiroDeValorGuru('1e3', erros, 'd')).toBeUndefined();
      expect(erros).toHaveLength(4);
    });

    it('null / "" → undefined sem erro', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorGuru(null, erros, 'x')).toBeUndefined();
      expect(dinheiroDeValorGuru('', erros, 'x')).toBeUndefined();
      expect(erros).toEqual([]);
    });
  });

  describe('moedaDeGuru', () => {
    it('código ISO válido → maiúsculo', () => {
      expect(moedaDeGuru('brl')).toBe('BRL');
      expect(moedaDeGuru('USD')).toBe('USD');
    });
    it('inválida / vazia → undefined', () => {
      expect(moedaDeGuru('xx')).toBeUndefined();
      expect(moedaDeGuru('')).toBeUndefined();
      expect(moedaDeGuru(undefined)).toBeUndefined();
    });
  });

  describe('taxasDe', () => {
    it('usa a taxa explícita quando 0 < taxa < bruto', () => {
      const bruto = { valorInteiro: 4970000n, moeda: 'BRL' };
      const taxa = { valorInteiro: 289000n, moeda: 'BRL' };
      expect(taxasDe(bruto, undefined, taxa)).toEqual(taxa);
    });
    it('deriva de bruto − liquido quando não há taxa explícita', () => {
      const bruto = { valorInteiro: 4970000n, moeda: 'BRL' };
      const liquido = { valorInteiro: 4681000n, moeda: 'BRL' };
      expect(taxasDe(bruto, liquido, undefined)).toEqual({
        valorInteiro: 289000n,
        moeda: 'BRL',
      });
    });
    it('taxa >= bruto ou <= 0 → undefined', () => {
      const bruto = { valorInteiro: 100n, moeda: 'BRL' };
      expect(taxasDe(bruto, { valorInteiro: 0n, moeda: 'BRL' }, undefined)).toBeUndefined();
      expect(taxasDe(bruto, undefined, { valorInteiro: 100n, moeda: 'BRL' })).toBeUndefined();
    });
  });

  describe('helpers de string', () => {
    it('telefonesDeString junta código local + número e deduplica', () => {
      expect(telefonesDeString('55', '11991234567')).toEqual(['55', '11991234567']);
      expect(telefonesDeString('11 99999-0000', '11 99999-0000')).toEqual([
        '11',
        '99999-0000',
      ]);
    });
    it('soDigitos', () => {
      expect(soDigitos('390.533.447-05')).toBe('39053344705');
      expect(soDigitos(null)).toBe('');
    });
    it('textoOuUndefined', () => {
      expect(textoOuUndefined('  x ')).toBe('x');
      expect(textoOuUndefined('   ')).toBeUndefined();
      expect(textoOuUndefined(null)).toBeUndefined();
    });
    it('enderecoDeGuru só com chaves não-vazias; tudo vazio → undefined', () => {
      expect(
        enderecoDeGuru({ logradouro: 'Rua A', numero: '10', cidade: '  ' }),
      ).toEqual({ logradouro: 'Rua A', numero: '10' });
      expect(enderecoDeGuru({})).toBeUndefined();
    });
  });
});
