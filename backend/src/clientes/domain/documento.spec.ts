import {
  apenasDigitos,
  classificarDocumento,
  validarCnpj,
  validarCpf,
} from './documento';

describe('documento — DV de CPF/CNPJ (spec 005)', () => {
  it('apenasDigitos remove máscara', () => {
    expect(apenasDigitos('529.982.247-25')).toBe('52998224725');
    expect(apenasDigitos('11.222.333/0001-81')).toBe('11222333000181');
  });

  describe('validarCpf', () => {
    it('aceita CPF com DV correto', () => {
      expect(validarCpf('52998224725')).toBe(true);
      expect(validarCpf('11144477735')).toBe(true);
    });
    it('rejeita DV incorreto', () => {
      expect(validarCpf('52998224724')).toBe(false);
      expect(validarCpf('12345678901')).toBe(false);
    });
    it('rejeita sequência repetida', () => {
      expect(validarCpf('11111111111')).toBe(false);
      expect(validarCpf('00000000000')).toBe(false);
    });
    it('rejeita comprimento errado', () => {
      expect(validarCpf('5299822472')).toBe(false);
      expect(validarCpf('529982247251')).toBe(false);
    });
  });

  describe('validarCnpj', () => {
    it('aceita CNPJ com DV correto', () => {
      expect(validarCnpj('11222333000181')).toBe(true);
    });
    it('rejeita DV incorreto', () => {
      expect(validarCnpj('11222333000182')).toBe(false);
    });
    it('rejeita sequência repetida e comprimento errado', () => {
      expect(validarCnpj('11111111111111')).toBe(false);
      expect(validarCnpj('112223330001')).toBe(false);
    });
  });

  describe('classificarDocumento', () => {
    it('11 dígitos válidos → CPF', () => {
      expect(classificarDocumento('529.982.247-25')).toEqual({
        tipo: 'CPF',
        digitos: '52998224725',
      });
    });
    it('14 dígitos válidos → CNPJ', () => {
      expect(classificarDocumento('11.222.333/0001-81')).toEqual({
        tipo: 'CNPJ',
        digitos: '11222333000181',
      });
    });
    it('DV inválido → null', () => {
      expect(classificarDocumento('529.982.247-24')).toBeNull();
    });
    it('comprimento inesperado → null', () => {
      expect(classificarDocumento('12345')).toBeNull();
      expect(classificarDocumento('')).toBeNull();
    });
  });
});
