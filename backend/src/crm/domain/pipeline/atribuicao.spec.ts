import { avaliarRegras, escolherProximoRodizio } from './atribuicao';

describe('escolherProximoRodizio (spec 010)', () => {
  const m = (usuarioId: string, dia: number) => ({
    usuarioId,
    entrouEm: new Date(`2026-09-0${dia}T00:00:00Z`),
  });

  it('sem membro ativo devolve null', () => {
    expect(escolherProximoRodizio([], null)).toBeNull();
  });

  it('sem cursor devolve o 1º', () => {
    const membros = [m('a', 1), m('b', 2), m('c', 3)];
    expect(escolherProximoRodizio(membros, null)).toBe('a');
  });

  it('roda em ordem e volta ao início', () => {
    const membros = [m('a', 1), m('b', 2), m('c', 3)];
    expect(escolherProximoRodizio(membros, 'a')).toBe('b');
    expect(escolherProximoRodizio(membros, 'b')).toBe('c');
    expect(escolherProximoRodizio(membros, 'c')).toBe('a');
  });

  it('cursor que saiu da equipe reinicia no 1º', () => {
    const membros = [m('a', 1), m('c', 3)]; // 'b' saiu
    expect(escolherProximoRodizio(membros, 'b')).toBe('a');
  });
});

describe('avaliarRegras (spec 010)', () => {
  const contextoOrigem = (origem: string | null) => ({
    origem,
    valorEstimado: { valorInt: 0n, moeda: 'BRL' },
  });
  const contextoValor = (valorInt: bigint, moeda = 'BRL') => ({
    origem: null,
    valorEstimado: { valorInt, moeda },
  });

  it('sem regras devolve null', () => {
    expect(avaliarRegras([], contextoOrigem('instagram'))).toBeNull();
  });

  it('1ª regra que casa vence, respeitando ordem', () => {
    const regras = [
      { ordem: 1, campo: 'ORIGEM' as const, valor: { igual: 'instagram' }, responsavelId: 'y' },
      { ordem: 0, campo: 'ORIGEM' as const, valor: { igual: 'instagram' }, responsavelId: 'x' },
    ];
    expect(avaliarRegras(regras, contextoOrigem('instagram'))).toBe('x');
  });

  it('sem match nenhuma regra devolve null', () => {
    const regras = [
      { ordem: 0, campo: 'ORIGEM' as const, valor: { igual: 'instagram' }, responsavelId: 'x' },
    ];
    expect(avaliarRegras(regras, contextoOrigem('google'))).toBeNull();
  });

  it('VALOR_ESTIMADO_MINIMO casa por moeda igual e valor >= mínimo', () => {
    const regras = [
      {
        ordem: 0,
        campo: 'VALOR_ESTIMADO_MINIMO' as const,
        valor: { minimoInt: '500000000', moeda: 'BRL' },
        responsavelId: 'x',
      },
    ];
    expect(avaliarRegras(regras, contextoValor(500000000n))).toBe('x');
    expect(avaliarRegras(regras, contextoValor(499999999n))).toBeNull();
  });

  it('VALOR_ESTIMADO_MINIMO nunca casa em moeda diferente', () => {
    const regras = [
      {
        ordem: 0,
        campo: 'VALOR_ESTIMADO_MINIMO' as const,
        valor: { minimoInt: '1', moeda: 'BRL' },
        responsavelId: 'x',
      },
    ];
    expect(avaliarRegras(regras, contextoValor(999999999n, 'USD'))).toBeNull();
  });
});
