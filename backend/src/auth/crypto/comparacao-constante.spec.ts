import { comparacaoConstante } from './comparacao-constante';

describe('comparacaoConstante', () => {
  it('true para strings iguais (inclui vazia)', () => {
    expect(comparacaoConstante('segredo-abc-123', 'segredo-abc-123')).toBe(true);
    expect(comparacaoConstante('', '')).toBe(true);
  });

  it('false para strings diferentes de mesmo comprimento', () => {
    expect(comparacaoConstante('segredo-abc-123', 'segredo-abc-124')).toBe(false);
  });

  it('false para comprimentos diferentes, sem lançar', () => {
    expect(() => comparacaoConstante('curto', 'bem-mais-comprido')).not.toThrow();
    expect(comparacaoConstante('curto', 'bem-mais-comprido')).toBe(false);
    expect(comparacaoConstante('x', '')).toBe(false);
  });

  it('lida com UTF-8 multibyte pelo número de bytes', () => {
    expect(comparacaoConstante('café', 'café')).toBe(true);
    // 'café' tem 5 bytes UTF-8; 'cafe!' tem 5 bytes mas conteúdo diferente
    expect(comparacaoConstante('café', 'cafe!')).toBe(false);
  });
});
