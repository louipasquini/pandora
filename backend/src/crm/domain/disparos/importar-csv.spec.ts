import { parseCsvContatos } from './importar-csv';

describe('parseCsvContatos', () => {
  it('aceita cabeçalho telefone+nome separado por vírgula', () => {
    const r = parseCsvContatos('telefone,nome\n11999990000,Fulano\n11999990001,Beltrano\n');
    expect(r.invalidos).toEqual([]);
    expect(r.validos).toHaveLength(2);
    expect(r.validos[0]).toEqual({ linha: 2, telefone: '+5511999990000', nome: 'Fulano' });
    expect(r.validos[1].nome).toBe('Beltrano');
  });

  it('aceita separador ;', () => {
    const r = parseCsvContatos('telefone;nome\n11999990000;Fulano\n');
    expect(r.validos).toHaveLength(1);
    expect(r.validos[0].telefone).toBe('+5511999990000');
  });

  it('funciona sem coluna nome', () => {
    const r = parseCsvContatos('telefone\n11999990000\n');
    expect(r.validos).toEqual([{ linha: 2, telefone: '+5511999990000', nome: null }]);
  });

  it('linha sem telefone ou telefone inválido vira invalido sem derrubar as demais', () => {
    const r = parseCsvContatos('telefone,nome\n,Fulano\nabc,Beltrano\n11999990000,Ciclano\n');
    expect(r.invalidos).toEqual([
      { linha: 2, motivo: 'telefone_ausente' },
      { linha: 3, motivo: 'telefone_invalido' },
    ]);
    expect(r.validos).toHaveLength(1);
    expect(r.validos[0].nome).toBe('Ciclano');
  });

  it('suporta aspas com o separador dentro do campo', () => {
    const r = parseCsvContatos('telefone,nome\n11999990000,"Sobrenome, Nome"\n');
    expect(r.validos[0].nome).toBe('Sobrenome, Nome');
  });

  it('sem coluna telefone → 1 inválido explicando o motivo', () => {
    const r = parseCsvContatos('nome\nFulano\n');
    expect(r.validos).toEqual([]);
    expect(r.invalidos).toEqual([{ linha: 1, motivo: 'coluna_telefone_ausente' }]);
  });

  it('conteúdo vazio → listas vazias', () => {
    expect(parseCsvContatos('')).toEqual({ validos: [], invalidos: [] });
  });
});
