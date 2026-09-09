import { atribuirVariante } from './atribuir-variante';

describe('atribuirVariante', () => {
  it('sem percentualB → null (sem teste A/B)', () => {
    expect(atribuirVariante('+5511999990000', null)).toBeNull();
    expect(atribuirVariante('+5511999990000', undefined)).toBeNull();
  });

  it('é determinístico para o mesmo telefone', () => {
    const a = atribuirVariante('+5511999990000', 50);
    const b = atribuirVariante('+5511999990000', 50);
    expect(a).toBe(b);
  });

  it('percentualB=0 → sempre A; percentualB=100 → sempre B', () => {
    for (let i = 0; i < 20; i++) {
      const tel = `+551199999${String(i).padStart(4, '0')}`;
      expect(atribuirVariante(tel, 0)).toBe('A');
      expect(atribuirVariante(tel, 100)).toBe('B');
    }
  });

  it('distribui aproximadamente o percentual configurado numa amostra grande', () => {
    const amostra = 2000;
    let emB = 0;
    for (let i = 0; i < amostra; i++) {
      const tel = `+55119${String(i).padStart(8, '0')}`;
      if (atribuirVariante(tel, 30) === 'B') emB++;
    }
    const proporcao = emB / amostra;
    expect(proporcao).toBeGreaterThan(0.24);
    expect(proporcao).toBeLessThan(0.36);
  });
});
