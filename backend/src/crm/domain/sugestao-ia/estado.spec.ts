import { podeAvaliarUtilidade, podeDecidir } from './estado';

describe('podeDecidir', () => {
  it('só PENDENTE pode ser decidida', () => {
    expect(podeDecidir('PENDENTE')).toBe(true);
    expect(podeDecidir('ACEITA')).toBe(false);
    expect(podeDecidir('REJEITADA')).toBe(false);
    expect(podeDecidir('SUBSTITUIDA')).toBe(false);
  });
});

describe('podeAvaliarUtilidade', () => {
  it('só ACEITA ou REJEITADA podem receber feedback', () => {
    expect(podeAvaliarUtilidade('ACEITA')).toBe(true);
    expect(podeAvaliarUtilidade('REJEITADA')).toBe(true);
    expect(podeAvaliarUtilidade('PENDENTE')).toBe(false);
    expect(podeAvaliarUtilidade('SUBSTITUIDA')).toBe(false);
  });
});
