import { aplicarSeNaoEditado, marcarEditado, valorEfetivo } from './precedencia';

describe('marcarEditado', () => {
  it('adiciona um campo novo', () => {
    expect(marcarEditado([], 'nome')).toEqual(['nome']);
    expect(marcarEditado(['nome'], 'assinatura')).toEqual(['nome', 'assinatura']);
  });

  it('idempotente — não duplica', () => {
    expect(marcarEditado(['nome'], 'nome')).toEqual(['nome']);
  });

  it('não muta o array recebido', () => {
    const original = ['nome'];
    marcarEditado(original, 'assinatura');
    expect(original).toEqual(['nome']);
  });
});

describe('aplicarSeNaoEditado', () => {
  it('aplica quando o campo não está travado', () => {
    const aplicar = jest.fn();
    aplicarSeNaoEditado([], 'turma', aplicar);
    expect(aplicar).toHaveBeenCalledTimes(1);
  });

  it('não aplica quando o campo já foi curado manualmente', () => {
    const aplicar = jest.fn();
    aplicarSeNaoEditado(['turma'], 'turma', aplicar);
    expect(aplicar).not.toHaveBeenCalled();
  });
});

describe('valorEfetivo', () => {
  it('curado vence quando presente', () => {
    expect(valorEfetivo('Curado', 'Derivado')).toBe('Curado');
  });

  it('cai para derivado quando curado é null/undefined', () => {
    expect(valorEfetivo(null, 'Derivado')).toBe('Derivado');
    expect(valorEfetivo(undefined, 'Derivado')).toBe('Derivado');
  });

  it('null quando nenhum dos dois existe', () => {
    expect(valorEfetivo(null, null)).toBeNull();
    expect(valorEfetivo(undefined, undefined)).toBeNull();
  });
});
