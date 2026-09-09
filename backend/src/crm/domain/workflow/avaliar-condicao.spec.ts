import { avaliarCondicao } from './avaliar-condicao';
import type { CondicaoNo } from './tipos';

describe('avaliarCondicao', () => {
  it('grupo vazio avalia sempre true', () => {
    expect(avaliarCondicao({ tipo: 'grupo', operador: 'E', itens: [] }, {})).toBe(true);
    expect(avaliarCondicao({ tipo: 'grupo', operador: 'OU', itens: [] }, {})).toBe(true);
  });

  it.each([
    ['igual', 'site', 'site', true],
    ['igual', 'site', 'ads', false],
    ['diferente', 'site', 'ads', true],
    ['diferente', 'site', 'site', false],
    ['maior_que', 10, 5, true],
    ['maior_que', 10, 20, false],
    ['menor_que', 5, 10, true],
    ['menor_que', 10, 5, false],
  ] as const)('folha %s(%p, %p) -> %p', (operador, contextoValor, condicaoValor, esperado) => {
    const no: CondicaoNo = { tipo: 'folha', campo: 'x', operador, valor: condicaoValor };
    expect(avaliarCondicao(no, { x: contextoValor })).toBe(esperado);
  });

  it('contem/nao_contem operam sobre listas', () => {
    const contexto = { tags: ['site', 'vip'] };
    expect(
      avaliarCondicao({ tipo: 'folha', campo: 'tags', operador: 'contem', valor: 'vip' }, contexto),
    ).toBe(true);
    expect(
      avaliarCondicao(
        { tipo: 'folha', campo: 'tags', operador: 'contem', valor: 'ads' },
        contexto,
      ),
    ).toBe(false);
    expect(
      avaliarCondicao(
        { tipo: 'folha', campo: 'tags', operador: 'nao_contem', valor: 'ads' },
        contexto,
      ),
    ).toBe(true);
  });

  it('definido/nao_definido decidem mesmo com campo ausente', () => {
    expect(avaliarCondicao({ tipo: 'folha', campo: 'x', operador: 'definido' }, {})).toBe(false);
    expect(avaliarCondicao({ tipo: 'folha', campo: 'x', operador: 'nao_definido' }, {})).toBe(
      true,
    );
    expect(
      avaliarCondicao({ tipo: 'folha', campo: 'x', operador: 'definido' }, { x: 'y' }),
    ).toBe(true);
    expect(
      avaliarCondicao({ tipo: 'folha', campo: 'x', operador: 'definido' }, { x: null }),
    ).toBe(false);
  });

  it('campo ausente com outro operador não lança, avalia como não satisfeito', () => {
    expect(avaliarCondicao({ tipo: 'folha', campo: 'x', operador: 'igual', valor: 1 }, {})).toBe(
      false,
    );
    expect(
      avaliarCondicao({ tipo: 'folha', campo: 'x', operador: 'maior_que', valor: 1 }, {}),
    ).toBe(false);
  });

  it('grupo E: todas verdadeiras -> true, uma falsa -> false', () => {
    const no: CondicaoNo = {
      tipo: 'grupo',
      operador: 'E',
      itens: [
        { tipo: 'folha', campo: 'a', operador: 'igual', valor: 1 },
        { tipo: 'folha', campo: 'b', operador: 'igual', valor: 2 },
      ],
    };
    expect(avaliarCondicao(no, { a: 1, b: 2 })).toBe(true);
    expect(avaliarCondicao(no, { a: 1, b: 3 })).toBe(false);
  });

  it('grupo OU: uma verdadeira -> true, todas falsas -> false', () => {
    const no: CondicaoNo = {
      tipo: 'grupo',
      operador: 'OU',
      itens: [
        { tipo: 'folha', campo: 'a', operador: 'igual', valor: 1 },
        { tipo: 'folha', campo: 'b', operador: 'igual', valor: 2 },
      ],
    };
    expect(avaliarCondicao(no, { a: 1, b: 3 })).toBe(true);
    expect(avaliarCondicao(no, { a: 0, b: 3 })).toBe(false);
  });

  it('grupos aninhados', () => {
    const no: CondicaoNo = {
      tipo: 'grupo',
      operador: 'E',
      itens: [
        { tipo: 'folha', campo: 'a', operador: 'igual', valor: 1 },
        {
          tipo: 'grupo',
          operador: 'OU',
          itens: [
            { tipo: 'folha', campo: 'b', operador: 'igual', valor: 2 },
            { tipo: 'folha', campo: 'c', operador: 'igual', valor: 3 },
          ],
        },
      ],
    };
    expect(avaliarCondicao(no, { a: 1, b: 0, c: 3 })).toBe(true);
    expect(avaliarCondicao(no, { a: 1, b: 0, c: 0 })).toBe(false);
    expect(avaliarCondicao(no, { a: 0, b: 2, c: 3 })).toBe(false);
  });
});
