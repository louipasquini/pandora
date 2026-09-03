import { Dinheiro } from './dinheiro';

describe('Dinheiro', () => {
  describe('deDecimal', () => {
    it('converte string decimal para inteiro na escala ×10000', () => {
      expect(Dinheiro.deDecimal('1234.5678', 'BRL').valorInt).toBe(12345678n);
      expect(Dinheiro.deDecimal('10', 'BRL').valorInt).toBe(100000n);
      expect(Dinheiro.deDecimal('0.5', 'BRL').valorInt).toBe(5000n);
      expect(Dinheiro.deDecimal('-50.25', 'BRL').valorInt).toBe(-502500n);
    });

    it('guarda a moeda normalizada', () => {
      expect(Dinheiro.deDecimal('1', 'brl').moeda).toBe('BRL');
    });

    it('rejeita mais de 4 casas decimais com RangeError (sem truncar)', () => {
      expect(() => Dinheiro.deDecimal('10.12345', 'BRL')).toThrow(RangeError);
      expect(() => Dinheiro.deDecimal('10.12345', 'BRL')).toThrow(/4 casas/);
    });

    it('rejeita formatos não canônicos', () => {
      expect(() => Dinheiro.deDecimal('1,50', 'BRL')).toThrow(RangeError);
      expect(() => Dinheiro.deDecimal('1.234,56', 'BRL')).toThrow(RangeError);
      expect(() => Dinheiro.deDecimal('1_000', 'BRL')).toThrow(RangeError);
      expect(() => Dinheiro.deDecimal('10.', 'BRL')).toThrow(RangeError);
      expect(() => Dinheiro.deDecimal(' 10 ', 'BRL')).toThrow(RangeError);
      expect(() => Dinheiro.deDecimal('abc', 'BRL')).toThrow(RangeError);
    });

    it('rejeita moeda inválida', () => {
      expect(() => Dinheiro.deDecimal('10.00', 'XXX')).toThrow(RangeError);
    });
  });

  describe('deInteiroEscalado', () => {
    it('aceita bigint e number inteiro', () => {
      expect(Dinheiro.deInteiroEscalado(12345678n, 'BRL').valorInt).toBe(12345678n);
      expect(Dinheiro.deInteiroEscalado(100000, 'BRL').valorInt).toBe(100000n);
    });

    it('rejeita number não inteiro com TypeError', () => {
      expect(() => Dinheiro.deInteiroEscalado(1.5, 'BRL')).toThrow(TypeError);
    });
  });

  describe('somar / subtrair / negar (imutáveis, mesma moeda)', () => {
    it('soma entre a mesma moeda e não muta os operandos', () => {
      const a = Dinheiro.deDecimal('10.0000', 'BRL');
      const b = Dinheiro.deDecimal('2.5000', 'BRL');
      const s = a.somar(b);

      expect(s.valorInt).toBe(125000n);
      expect(a.valorInt).toBe(100000n); // inalterado
      expect(b.valorInt).toBe(25000n); // inalterado
    });

    it('subtrai e nega', () => {
      const a = Dinheiro.deDecimal('10', 'BRL');
      expect(a.subtrair(Dinheiro.deDecimal('3', 'BRL')).valorInt).toBe(70000n);
      expect(a.negar().valorInt).toBe(-100000n);
    });

    it('somar/subtrair moedas diferentes lança erro nomeando as duas', () => {
      const brl = Dinheiro.deDecimal('10', 'BRL');
      const usd = Dinheiro.deDecimal('10', 'USD');
      expect(() => brl.somar(usd)).toThrow(/BRL.*USD|USD.*BRL/);
      expect(() => brl.subtrair(usd)).toThrow(/BRL/);
      expect(() => brl.subtrair(usd)).toThrow(/USD/);
    });
  });

  describe('multiplicarPorEscalar', () => {
    it('multiplica por inteiro (bigint ou number)', () => {
      const a = Dinheiro.deDecimal('1.2500', 'BRL');
      expect(a.multiplicarPorEscalar(3).valorInt).toBe(37500n);
      expect(a.multiplicarPorEscalar(3n).valorInt).toBe(37500n);
      expect(a.multiplicarPorEscalar(0).valorInt).toBe(0n);
      expect(a.multiplicarPorEscalar(-2).valorInt).toBe(-25000n);
    });

    it('rejeita fator não inteiro, NaN e Infinity com TypeError', () => {
      const a = Dinheiro.deDecimal('10', 'BRL');
      expect(() => a.multiplicarPorEscalar(0.5)).toThrow(TypeError);
      expect(() => a.multiplicarPorEscalar(Number.NaN)).toThrow(TypeError);
      expect(() => a.multiplicarPorEscalar(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    });
  });

  describe('comparações', () => {
    it('equals exige valor E moeda; nunca lança', () => {
      const a = Dinheiro.deDecimal('10.0000', 'BRL');
      expect(a.equals(Dinheiro.deDecimal('10', 'BRL'))).toBe(true);
      expect(a.equals(Dinheiro.deDecimal('10', 'USD'))).toBe(false);
      expect(a.equals(Dinheiro.deDecimal('9.9999', 'BRL'))).toBe(false);
      expect(a.equals(null)).toBe(false);
      expect(a.equals(undefined)).toBe(false);
    });

    it('ordem entre a mesma moeda', () => {
      const a = Dinheiro.deDecimal('10', 'BRL');
      const b = Dinheiro.deDecimal('20', 'BRL');
      expect(a.menorQue(b)).toBe(true);
      expect(b.maiorQue(a)).toBe(true);
      expect(a.maiorOuIgual(Dinheiro.deDecimal('10', 'BRL'))).toBe(true);
      expect(a.compararCom(b)).toBe(-1);
    });

    it('ordem entre moedas diferentes lança Error; operando inválido lança TypeError', () => {
      const brl = Dinheiro.deDecimal('10', 'BRL');
      expect(() => brl.compararCom(Dinheiro.deDecimal('10', 'USD'))).toThrow(Error);
      expect(() => brl.compararCom(null as unknown as Dinheiro)).toThrow(TypeError);
    });

    it('zero carrega moeda', () => {
      expect(Dinheiro.zero('BRL').ehZero()).toBe(true);
      expect(Dinheiro.zero('BRL').equals(Dinheiro.zero('USD'))).toBe(false);
    });
  });

  describe('serialização (round-trip exato)', () => {
    const casos: Array<[string, string]> = [
      ['inteiro', '4200.0000'],
      ['1 casa', '0.5000'],
      ['4 casas', '1234.5678'],
      ['negativo', '-98.7600'],
      ['zero', '0.0000'],
    ];

    it.each(casos)('%s: deSerializado(d.toJSON()) === d', (_nome, decimal) => {
      const d = Dinheiro.deDecimal(decimal, 'BRL');
      const round = Dinheiro.deSerializado(d.toJSON());
      expect(round.equals(d)).toBe(true);
      expect(d.toJSON().valorInt).toBe(d.valorInt.toString());
      expect(typeof d.toJSON().valorInt).toBe('string');
    });

    it('preserva valores acima do alcance seguro de ponto flutuante', () => {
      const grande = 9_007_199_254_740_993n * 1000n; // > Number.MAX_SAFE_INTEGER
      const d = Dinheiro.deInteiroEscalado(grande, 'BRL');
      const round = Dinheiro.deSerializado(d.toJSON());
      expect(round.valorInt).toBe(grande);
      expect(round.equals(d)).toBe(true);
    });

    it('deSerializado rejeita valorInt não inteiro-string e moeda inválida', () => {
      expect(() => Dinheiro.deSerializado({ valorInt: '1.5', moeda: 'BRL' })).toThrow(RangeError);
      expect(() => Dinheiro.deSerializado({ valorInt: '10', moeda: 'ZZZ' })).toThrow(RangeError);
    });
  });

  describe('toString (humano, não persistência)', () => {
    it('formata com 4 casas e a moeda', () => {
      expect(Dinheiro.deDecimal('1234.5678', 'BRL').toString()).toBe('1234.5678 BRL');
      expect(Dinheiro.deDecimal('0.5', 'BRL').toString()).toBe('0.5000 BRL');
      expect(Dinheiro.zero('BRL').toString()).toBe('0.0000 BRL');
      expect(Dinheiro.deDecimal('-7.5', 'USD').toString()).toBe('-7.5000 USD');
    });
  });
});
