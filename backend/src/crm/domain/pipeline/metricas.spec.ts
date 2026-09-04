import { agregarMetricas, type EtapaInfo, type LinhaGroupBy } from './metricas';

describe('agregarMetricas (spec 010)', () => {
  const etapas: EtapaInfo[] = [
    { id: 'novo', nome: 'Novo contato', tipo: 'ABERTA' },
    { id: 'ganho', nome: 'Ganho', tipo: 'GANHA' },
    { id: 'perdido', nome: 'Perdido', tipo: 'PERDIDA' },
  ];

  it('pipeline vazio: tudo zerado, taxaConversao null', () => {
    const r = agregarMetricas(etapas, [], []);
    expect(r.taxaConversao).toBeNull();
    for (const e of r.porEtapa) {
      expect(e.quantidade).toBe(0);
      expect(e.valorEstimado).toEqual([]);
    }
  });

  it('soma por moeda sem misturar', () => {
    const linhas: LinhaGroupBy[] = [
      { etapaId: 'novo', moeda: 'BRL', quantidade: 2, somaValorInt: 1000n },
      { etapaId: 'novo', moeda: 'USD', quantidade: 1, somaValorInt: 500n },
    ];
    const r = agregarMetricas(etapas, linhas, []);
    const novo = r.porEtapa.find((e) => e.etapaId === 'novo')!;
    expect(novo.quantidade).toBe(3);
    expect(novo.valorEstimado).toEqual(
      expect.arrayContaining([
        { valorInt: '1000', moeda: 'BRL' },
        { valorInt: '500', moeda: 'USD' },
      ]),
    );
  });

  it('taxaConversao = ganhas / (ganhas + perdidas)', () => {
    const linhas: LinhaGroupBy[] = [
      { etapaId: 'ganho', moeda: 'BRL', quantidade: 3, somaValorInt: 300n },
      { etapaId: 'perdido', moeda: 'BRL', quantidade: 1, somaValorInt: 100n },
    ];
    const r = agregarMetricas(etapas, linhas, []);
    expect(r.taxaConversao).toBeCloseTo(0.75);
  });

  it('tempoMedioHoras só se aplica a etapas ABERTA', () => {
    const r = agregarMetricas(etapas, [], [
      { etapaId: 'novo', horas: 18.5 },
      { etapaId: 'ganho', horas: 999 }, // deve ser ignorado — GANHA não tem tempo médio
    ]);
    expect(r.porEtapa.find((e) => e.etapaId === 'novo')!.tempoMedioHoras).toBe(18.5);
    expect(r.porEtapa.find((e) => e.etapaId === 'ganho')!.tempoMedioHoras).toBeNull();
  });
});
