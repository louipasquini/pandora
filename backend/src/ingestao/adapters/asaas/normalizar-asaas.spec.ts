import {
  dinheiroDeValorAsaas,
  soDigitos,
  taxasDe,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-asaas';

describe('normalizar-asaas (spec 020 — helpers puros)', () => {
  describe('textoOuUndefined', () => {
    it('vazio/espaços/null → undefined; senão trim', () => {
      expect(textoOuUndefined('  ')).toBeUndefined();
      expect(textoOuUndefined(null)).toBeUndefined();
      expect(textoOuUndefined('  pay_1 ')).toBe('pay_1');
    });
  });

  describe('soDigitos', () => {
    it('mantém só dígitos', () => {
      expect(soDigitos('111.444.777-35')).toBe('11144477735');
      expect(soDigitos('11.222.333/0001-81')).toBe('11222333000181');
      expect(soDigitos(null)).toBe('');
    });
  });

  describe('telefonesDeString', () => {
    it('divide por vírgula/;/espaço, remove vazios, deduplica', () => {
      expect(telefonesDeString('+5511911112222, +5511911112222')).toEqual([
        '+5511911112222',
      ]);
      expect(telefonesDeString('', null, undefined)).toEqual([]);
    });
  });

  describe('dinheiroDeValorAsaas', () => {
    it('número/string decimal → { valorInteiro ×10000, moeda }', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorAsaas(197, erros, 'v')).toEqual({
        valorInteiro: 1970000n,
        moeda: 'BRL',
      });
      expect(dinheiroDeValorAsaas('250.00', erros, 'v')).toEqual({
        valorInteiro: 2500000n,
        moeda: 'BRL',
      });
      expect(dinheiroDeValorAsaas(89.9, erros, 'v')).toEqual({
        valorInteiro: 899000n,
        moeda: 'BRL',
      });
      expect(erros).toHaveLength(0);
    });

    it('trunca >4 casas por string (sem parseFloat)', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorAsaas('10.123456', erros, 'v')).toEqual({
        valorInteiro: 101234n,
        moeda: 'BRL',
      });
    });

    it('null/vazio → undefined sem erro; NaN/negativo/científico/formato ruim → undefined + erro', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorAsaas(null, erros, 'v')).toBeUndefined();
      expect(dinheiroDeValorAsaas('', erros, 'v')).toBeUndefined();
      expect(erros).toHaveLength(0);

      expect(dinheiroDeValorAsaas(Number.NaN, erros, 'a')).toBeUndefined();
      expect(dinheiroDeValorAsaas(-5, erros, 'b')).toBeUndefined();
      expect(dinheiroDeValorAsaas('1e3', erros, 'c')).toBeUndefined();
      expect(dinheiroDeValorAsaas('1.234,56', erros, 'd')).toBeUndefined();
      expect(erros).toHaveLength(4);
    });
  });

  describe('taxasDe', () => {
    it('bruto − liquido quando 0 < resultado < bruto', () => {
      expect(
        taxasDe(
          { valorInteiro: 1970000n, moeda: 'BRL' },
          { valorInteiro: 1901300n, moeda: 'BRL' },
        ),
      ).toEqual({ valorInteiro: 68700n, moeda: 'BRL' });
    });
    it('liquido ≥ bruto, moeda diferente ou ausência → undefined', () => {
      expect(
        taxasDe(
          { valorInteiro: 100n, moeda: 'BRL' },
          { valorInteiro: 100n, moeda: 'BRL' },
        ),
      ).toBeUndefined();
      expect(taxasDe(undefined, { valorInteiro: 1n, moeda: 'BRL' })).toBeUndefined();
      expect(
        taxasDe(
          { valorInteiro: 10n, moeda: 'BRL' },
          { valorInteiro: 1n, moeda: 'USD' },
        ),
      ).toBeUndefined();
    });
  });
});
