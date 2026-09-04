import { podeConverter, montarDadosIdentidade } from './plano-conversao';

describe('plano-conversao', () => {
  it('podeConverter: só ATIVO', () => {
    expect(podeConverter({ status: 'ATIVO' })).toEqual({ ok: true });
    expect(podeConverter({ status: 'DESCARTADO' })).toEqual({
      ok: false,
      erro: 'lead_descartado',
    });
    expect(podeConverter({ status: 'CONVERTIDO' })).toEqual({
      ok: false,
      erro: 'ja_convertido',
    });
  });

  it('montarDadosIdentidade mapeia contato + documento', () => {
    expect(
      montarDadosIdentidade({
        nome: 'Ana',
        email: 'ana@ex.com',
        telefone: '+5511998887777',
        documento: '39053344705',
      }),
    ).toEqual({
      nome: 'Ana',
      email: 'ana@ex.com',
      telefone: '+5511998887777',
      documento: '39053344705',
    });
  });
});
