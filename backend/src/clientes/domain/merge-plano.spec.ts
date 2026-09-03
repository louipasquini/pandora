import {
  planoDeMerge,
  planoDeReversao,
  type LinhaProvenienciada,
  type SnapshotMergePessoa,
} from './merge-plano';

function snapPessoa(id: string, over: Partial<SnapshotMergePessoa['absorvida']> = {}) {
  return {
    id,
    nome: id,
    tipo: 'FISICA',
    contaId: null,
    emails: [],
    telefones: [],
    documentos: [],
    enderecos: [],
    origemRefs: [],
    ...over,
  };
}

describe('planoDeMerge', () => {
  it('contatos movidos entram como secundário', () => {
    expect(planoDeMerge().contatosComoSecundario).toBe(true);
  });
});

describe('planoDeReversao (spec 005, US4)', () => {
  const snapshot: SnapshotMergePessoa = {
    sobrevivente: snapPessoa('A', { emails: [{ valor: 'a@x.com', primario: true, curado: false, rebaixadoEm: null }] }),
    absorvida: snapPessoa('B', {
      emails: [{ valor: 'b@x.com', primario: true, curado: false, rebaixadoEm: null }],
      documentos: [{ tipo: 'CPF', valor: '52998224725', curado: false }],
    }),
  };

  it('reversão limpa: linhas não curadas voltam para a absorvida', () => {
    const linhas: LinhaProvenienciada[] = [
      { id: 'e1', tabela: 'email', chave: 'b@x.com', curado: false, primario: false },
      { id: 'd1', tabela: 'documento', chave: 'CPF:52998224725', curado: false, primario: false },
    ];
    const plano = planoDeReversao(snapshot, linhas);
    expect(plano.moverParaAbsorvida.sort()).toEqual(['d1', 'e1']);
    expect(plano.divergencias).toEqual([]);
    expect(plano.recriarNaAbsorvida.emails).toEqual([]);
  });

  it('item curado depois do merge → fica na sobrevivente + divergência', () => {
    const linhas: LinhaProvenienciada[] = [
      { id: 'e1', tabela: 'email', chave: 'b@x.com', curado: true, primario: false },
      { id: 'd1', tabela: 'documento', chave: 'CPF:52998224725', curado: false, primario: false },
    ];
    const plano = planoDeReversao(snapshot, linhas);
    expect(plano.moverParaAbsorvida).toEqual(['d1']);
    expect(plano.divergencias).toHaveLength(1);
    expect(plano.divergencias[0].motivo).toBe('divergiu_pos_merge');
    expect(plano.divergencias[0].campo).toBe('email:b@x.com');
  });

  it('linha re-movida por merge posterior (outra proveniência) → não aparece nas linhas; recria na absorvida', () => {
    // `linhas` só traz o que tem origemMergeId === ESTE merge; o e-mail de B foi
    // movido de novo por outro merge, então some daqui.
    const linhas: LinhaProvenienciada[] = [
      { id: 'd1', tabela: 'documento', chave: 'CPF:52998224725', curado: false, primario: false },
    ];
    const plano = planoDeReversao(snapshot, linhas);
    expect(plano.moverParaAbsorvida).toEqual(['d1']);
    expect(plano.recriarNaAbsorvida.emails).toEqual([
      { valor: 'b@x.com', primario: true, curado: false, rebaixadoEm: null },
    ]);
  });

  it('reversão fora de ordem: desfazer merge A não toca linhas do merge B', () => {
    // Só passamos as linhas de A; as de B nem entram — a função por construção
    // ignora o que não é deste merge.
    const linhasDeA: LinhaProvenienciada[] = [
      { id: 'eA', tabela: 'email', chave: 'b@x.com', curado: false, primario: false },
    ];
    const plano = planoDeReversao(snapshot, linhasDeA);
    expect(plano.moverParaAbsorvida).toEqual(['eA']);
    expect(plano.divergencias).toEqual([]);
  });
});
