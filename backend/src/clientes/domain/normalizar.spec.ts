import {
  normalizarChaves,
  normalizarDocumento,
  normalizarEmail,
  normalizarTelefone,
} from './normalizar';

describe('normalizar (spec 005)', () => {
  describe('normalizarEmail', () => {
    it('trim + lowercase', () => {
      expect(normalizarEmail('  Maria@Exemplo.COM ')).toEqual({
        valor: 'maria@exemplo.com',
      });
    });
    it('mantém +tag e pontos (sem heurística de provedor — research D2)', () => {
      expect(normalizarEmail('a+x@gmail.com')).toEqual({ valor: 'a+x@gmail.com' });
      expect(normalizarEmail('a.b@gmail.com')).toEqual({ valor: 'a.b@gmail.com' });
    });
    it('forma inválida → descartada', () => {
      expect(normalizarEmail('sem-arroba').descartada).toBeDefined();
      expect(normalizarEmail('a@b').descartada).toBeDefined();
      expect(normalizarEmail('').descartada).toBe('vazio');
    });
  });

  describe('normalizarTelefone', () => {
    it('sem DDI com 11 dígitos → assume +55', () => {
      expect(normalizarTelefone('11 98888-0000')).toEqual({
        valor: '+5511988880000',
      });
    });
    it('sem DDI com 10 dígitos → assume +55', () => {
      expect(normalizarTelefone('(11) 3333-4444')).toEqual({
        valor: '+551133334444',
      });
    });
    it('já com +55 formatado', () => {
      expect(normalizarTelefone('+55 (11) 98888-0000')).toEqual({
        valor: '+5511988880000',
      });
    });
    it('lixo / comprimento implausível → descartada', () => {
      expect(normalizarTelefone('abc').descartada).toBeDefined();
      expect(normalizarTelefone('123').descartada).toBeDefined();
      expect(normalizarTelefone('').descartada).toBe('vazio');
    });
  });

  describe('normalizarDocumento', () => {
    it('CPF com máscara → só dígitos + tipo', () => {
      expect(normalizarDocumento('529.982.247-25')).toEqual({
        valor: { tipo: 'CPF', valor: '52998224725' },
      });
    });
    it('CNPJ', () => {
      expect(normalizarDocumento('11.222.333/0001-81')).toEqual({
        valor: { tipo: 'CNPJ', valor: '11222333000181' },
      });
    });
    it('DV inválido → descartada', () => {
      expect(normalizarDocumento('111.111.111-11').descartada).toBeDefined();
    });
  });

  describe('normalizarChaves', () => {
    it('separa CPF de CNPJ e ignora chave inválida com motivo', () => {
      const r = normalizarChaves({
        documento: '529.982.247-25',
        email: 'X@Y',
        telefone: '11 98888-0000',
      });
      expect(r.documento).toBe('52998224725');
      expect(r.cnpj).toBeUndefined();
      expect(r.email).toBeUndefined();
      expect(r.telefone).toBe('+5511988880000');
      expect(r.descartadas).toEqual([
        { campo: 'email', motivo: expect.any(String) },
      ]);
    });

    it('CNPJ vai para o campo cnpj', () => {
      const r = normalizarChaves({ documento: '11222333000181' });
      expect(r.cnpj).toBe('11222333000181');
      expect(r.documento).toBeUndefined();
    });
  });
});
