import { describe, expect, it } from 'vitest';
import { montarCsv } from './exportar-csv';

describe('montarCsv', () => {
  it('cabeçalho + linhas com CRLF', () => {
    expect(montarCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  it('escapa vírgula/aspas/quebra', () => {
    expect(montarCsv(['x'], [['a,b'], ['a"b']])).toBe('x\r\n"a,b"\r\n"a""b"\r\n');
  });

  it('só cabeçalho sem linhas', () => {
    expect(montarCsv(['x', 'y'], [])).toBe('x,y\r\n');
  });
});
