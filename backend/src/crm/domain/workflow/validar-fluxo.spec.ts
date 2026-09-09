import { condicaoVaziaPadrao } from './tipos';
import { validarAcoes, validarCondicoes, validarParaPublicar } from './validar-fluxo';

describe('validarCondicoes', () => {
  it('condição vazia é sempre válida', () => {
    expect(validarCondicoes('LEAD_CRIADO', condicaoVaziaPadrao())).toEqual({ ok: true });
  });

  it('campo do catálogo do gatilho é válido', () => {
    expect(
      validarCondicoes('LEAD_CRIADO', {
        tipo: 'folha',
        campo: 'origem',
        operador: 'igual',
        valor: 'site',
      }),
    ).toEqual({ ok: true });
  });

  it('campo fora do catálogo do gatilho é inválido', () => {
    const r = validarCondicoes('OPORTUNIDADE_ETAPA_MUDOU', {
      tipo: 'folha',
      campo: 'estagio',
      operador: 'igual',
      valor: 'NOVO',
    });
    expect(r).toEqual({ ok: false, erro: { erro: 'campo_condicao_invalido', campo: 'estagio' } });
  });
});

describe('validarAcoes', () => {
  it('ação compatível com o gatilho é válida', () => {
    expect(validarAcoes('LEAD_CRIADO', [{ tipo: 'APLICAR_TAG', tag: 'x' }])).toEqual({
      ok: true,
    });
  });

  it('ação incompatível com o gatilho é inválida', () => {
    const r = validarAcoes('LEAD_CRIADO', [
      { tipo: 'MOVER_OPORTUNIDADE_ETAPA', etapaDestinoId: 'x' },
    ]);
    expect(r).toEqual({
      ok: false,
      erro: { erro: 'acao_incompativel_com_gatilho', acaoTipo: 'MOVER_OPORTUNIDADE_ETAPA' },
    });
  });
});

describe('validarParaPublicar', () => {
  it('fluxo válido -> ok', () => {
    expect(
      validarParaPublicar({
        gatilhoTipo: 'LEAD_CRIADO',
        condicoes: { tipo: 'folha', campo: 'origem', operador: 'igual', valor: 'site' },
        acoes: [{ tipo: 'APLICAR_TAG', tag: 'site' }],
      }),
    ).toEqual({ ok: true });
  });

  it('condição inválida bloqueia antes de checar ações', () => {
    const r = validarParaPublicar({
      gatilhoTipo: 'OPORTUNIDADE_ETAPA_MUDOU',
      condicoes: { tipo: 'folha', campo: 'estagio', operador: 'igual', valor: 'x' },
      acoes: [{ tipo: 'MOVER_OPORTUNIDADE_ETAPA', etapaDestinoId: 'x' }],
    });
    expect(r.ok).toBe(false);
  });
});
