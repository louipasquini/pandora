import { combinarRankingComercial, type GanhasPorResponsavel } from './ranking';

describe('combinarRankingComercial', () => {
  const ganhas: GanhasPorResponsavel[] = [
    {
      responsavelId: 'u-ana',
      ganhas: 4,
      perdidas: 1,
      valorGanho: [{ moeda: 'BRL', valorInt: '3000000000' }],
    },
    {
      responsavelId: 'u-bob',
      ganhas: 2,
      perdidas: 2,
      valorGanho: [{ moeda: 'BRL', valorInt: '1000000000' }],
    },
  ];
  const pontos = new Map([
    ['u-ana', 120],
    ['u-bob', 200],
    ['u-cid', 50], // só tem pontos de tarefa, nenhuma oportunidade
  ]);
  const nomes = new Map([
    ['u-ana', 'Ana'],
    ['u-bob', 'Bob'],
  ]);

  it('ordena por valor ganho e traz pontos de tarefa', () => {
    const r = combinarRankingComercial(ganhas, pontos, nomes);
    expect(r.map((x) => x.responsavelId)).toEqual(['u-ana', 'u-bob', 'u-cid']);
    expect(r[0]).toMatchObject({
      nome: 'Ana',
      oportunidadesGanhas: 4,
      pontosTarefa: 120,
      taxaConversao: 0.8,
    });
    expect(r[2]).toMatchObject({
      responsavelId: 'u-cid',
      nome: null,
      oportunidadesGanhas: 0,
      valorGanho: [],
      taxaConversao: null,
      pontosTarefa: 50,
    });
  });

  it('nunca soma moedas diferentes', () => {
    const multi: GanhasPorResponsavel[] = [
      {
        responsavelId: 'u-x',
        ganhas: 1,
        perdidas: 0,
        valorGanho: [
          { moeda: 'BRL', valorInt: '100' },
          { moeda: 'USD', valorInt: '999' },
        ],
      },
    ];
    const r = combinarRankingComercial(multi, new Map(), new Map());
    expect(r[0].valorGanho).toHaveLength(2);
  });
});
