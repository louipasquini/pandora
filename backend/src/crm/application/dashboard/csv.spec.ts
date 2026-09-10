import { serializarCsv } from './csv';

describe('serializarCsv', () => {
  it('cabeçalho + linhas', () => {
    expect(serializarCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  it('só cabeçalho quando não há linhas', () => {
    expect(serializarCsv(['a', 'b'], [])).toBe('a,b\r\n');
  });

  it('escapa vírgula, aspas e quebra de linha', () => {
    expect(serializarCsv(['x'], [['a,b'], ['a"b'], ['a\nb']])).toBe(
      'x\r\n"a,b"\r\n"a""b"\r\n"a\nb"\r\n',
    );
  });

  it('null/undefined viram vazio', () => {
    expect(serializarCsv(['x', 'y'], [[null, undefined]])).toBe('x,y\r\n,\r\n');
  });
});
