import { assertMoeda, criarMoeda, ehMoeda, ISO_4217, ISO_4217_SET } from './moeda';

describe('Moeda (ISO 4217)', () => {
  describe('ehMoeda', () => {
    it('aceita códigos ISO 4217 conhecidos', () => {
      expect(ehMoeda('BRL')).toBe(true);
      expect(ehMoeda('USD')).toBe(true);
      expect(ehMoeda('EUR')).toBe(true);
      expect(ehMoeda('GBP')).toBe(true);
    });

    it('é indiferente à caixa na verificação', () => {
      expect(ehMoeda('brl')).toBe(true);
      expect(ehMoeda('Brl')).toBe(true);
    });

    it('rejeita código não-ISO, comprimento errado e não-string', () => {
      expect(ehMoeda('XXX')).toBe(false); // código de "sem moeda", fora da lista de propósito
      expect(ehMoeda('XAU')).toBe(false); // metal precioso, fora de propósito
      expect(ehMoeda('BR')).toBe(false);
      expect(ehMoeda('REAIS')).toBe(false);
      expect(ehMoeda('')).toBe(false);
      expect(ehMoeda(123)).toBe(false);
      expect(ehMoeda(null)).toBe(false);
      expect(ehMoeda(undefined)).toBe(false);
    });
  });

  describe('assertMoeda', () => {
    it('não lança para código válido', () => {
      expect(() => assertMoeda('BRL')).not.toThrow();
      expect(() => assertMoeda('usd')).not.toThrow();
    });

    it('lança RangeError nomeando o valor para código inválido', () => {
      expect(() => assertMoeda('XXX')).toThrow(RangeError);
      expect(() => assertMoeda('XXX')).toThrow(/XXX/);
      expect(() => assertMoeda(42 as unknown)).toThrow(RangeError);
    });
  });

  describe('criarMoeda', () => {
    it('normaliza para caixa alta', () => {
      expect(criarMoeda('brl')).toBe('BRL');
      expect(criarMoeda('Eur')).toBe('EUR');
    });

    it('lança para inválido', () => {
      expect(() => criarMoeda('reais')).toThrow(RangeError);
    });
  });

  describe('lista', () => {
    it('ISO_4217 é imutável e não vazia; BRL/USD/EUR presentes', () => {
      expect(ISO_4217.length).toBeGreaterThan(100);
      expect(Object.isFrozen(ISO_4217)).toBe(true);
      expect(ISO_4217_SET.has('BRL')).toBe(true);
      expect(() => (ISO_4217 as string[]).push('ZZZ')).toThrow();
    });
  });
});
