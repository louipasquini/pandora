import { duracaoParaSegundos } from './duracao';

describe('duracaoParaSegundos', () => {
  it.each([
    ['45s', 45],
    ['90m', 5400],
    ['12h', 43200],
    ['1d', 86400],
    ['0s', 0],
    [' 12h ', 43200],
  ])('%s → %i s', (entrada, esperado) => {
    expect(duracaoParaSegundos(entrada)).toBe(esperado);
  });

  it.each(['12', 'h', '12x', '1.5h', '12 h', '-3h', '', 'PT12H'])(
    'rejeita %j com RangeError nomeando a entrada',
    (entrada) => {
      expect(() => duracaoParaSegundos(entrada)).toThrow(RangeError);
      expect(() => duracaoParaSegundos(entrada)).toThrow(JSON.stringify(entrada.trim()));
    },
  );
});
