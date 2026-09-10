import {
  dinheiroDeValorTmb,
  enderecoDeTmb,
  liquidoDe,
  soDigitos,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-tmb';

describe('normalizar-tmb (spec 019 — helpers puros)', () => {
  describe('textoOuUndefined', () => {
    it('vazio/espaços/null → undefined; senão trim', () => {
      expect(textoOuUndefined('  ')).toBeUndefined();
      expect(textoOuUndefined('')).toBeUndefined();
      expect(textoOuUndefined(null)).toBeUndefined();
      expect(textoOuUndefined(undefined)).toBeUndefined();
      expect(textoOuUndefined('  x ')).toBe('x');
      expect(textoOuUndefined(483921)).toBe('483921');
    });
  });

  describe('soDigitos', () => {
    it('mantém só dígitos', () => {
      expect(soDigitos('529.982.247-25')).toBe('52998224725');
      expect(soDigitos('abc')).toBe('');
      expect(soDigitos(null)).toBe('');
    });
  });

  describe('telefonesDeString', () => {
    it('divide por vírgula/;/espaço, remove vazios, deduplica preservando ordem', () => {
      expect(
        telefonesDeString('+5511988887777, +5511977776666', '+5511988887777'),
      ).toEqual(['+5511988887777', '+5511977776666']);
      expect(telefonesDeString('', null, undefined)).toEqual([]);
      expect(telefonesDeString('11 1; 22')).toEqual(['11', '1', '22']);
    });
  });

  describe('dinheiroDeValorTmb', () => {
    it('número/string decimal → { valorInteiro ×10000, moeda }', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorTmb(299.99, erros, 'v')).toEqual({
        valorInteiro: 2999900n,
        moeda: 'BRL',
      });
      expect(dinheiroDeValorTmb('1250', erros, 'v')).toEqual({
        valorInteiro: 12500000n,
        moeda: 'BRL',
      });
      expect(dinheiroDeValorTmb(1250.0, erros, 'v')).toEqual({
        valorInteiro: 12500000n,
        moeda: 'BRL',
      });
      expect(erros).toHaveLength(0);
    });

    it('trunca >4 casas por string (sem parseFloat)', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorTmb('10.123456', erros, 'v')).toEqual({
        valorInteiro: 101234n,
        moeda: 'BRL',
      });
    });

    it('null/vazio → undefined sem erro; NaN/negativo/formato ruim → undefined + erro', () => {
      const erros: string[] = [];
      expect(dinheiroDeValorTmb(null, erros, 'v')).toBeUndefined();
      expect(dinheiroDeValorTmb('', erros, 'v')).toBeUndefined();
      expect(erros).toHaveLength(0);

      expect(dinheiroDeValorTmb(Number.NaN, erros, 'a')).toBeUndefined();
      expect(dinheiroDeValorTmb(-5, erros, 'b')).toBeUndefined();
      expect(dinheiroDeValorTmb('1.234,56', erros, 'c')).toBeUndefined();
      expect(dinheiroDeValorTmb('1e3', erros, 'd')).toBeUndefined();
      expect(dinheiroDeValorTmb({}, erros, 'e')).toBeUndefined();
      expect(erros).toHaveLength(5);
    });
  });

  describe('enderecoDeTmb', () => {
    it('só chaves não-vazias; tudo vazio → undefined', () => {
      expect(
        enderecoDeTmb({ logradouro: 'Rua X', numero: ' ', cidade: 'SP', cep: '' }),
      ).toEqual({ logradouro: 'Rua X', cidade: 'SP' });
      expect(enderecoDeTmb({ logradouro: '', cidade: undefined })).toBeUndefined();
    });
  });

  describe('liquidoDe', () => {
    it('bruto − taxas quando 0 < resultado < bruto', () => {
      expect(
        liquidoDe({ valorInteiro: 4200_0000n, moeda: 'BRL' }, { valorInteiro: 210_0000n, moeda: 'BRL' }),
      ).toEqual({ valorInteiro: 3990_0000n, moeda: 'BRL' });
    });
    it('taxa ≥ bruto, moeda diferente ou ausência → undefined', () => {
      expect(
        liquidoDe({ valorInteiro: 100n, moeda: 'BRL' }, { valorInteiro: 100n, moeda: 'BRL' }),
      ).toBeUndefined();
      expect(liquidoDe(undefined, { valorInteiro: 1n, moeda: 'BRL' })).toBeUndefined();
      expect(
        liquidoDe({ valorInteiro: 10n, moeda: 'BRL' }, { valorInteiro: 1n, moeda: 'USD' }),
      ).toBeUndefined();
    });
  });
});
