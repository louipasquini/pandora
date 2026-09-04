import { validarCamposPorTipo } from './validar-campos-tipo';

describe('validarCamposPorTipo', () => {
  it.each(['WHATSAPP', 'EMAIL', 'LIGACAO', 'TICKET'] as const)(
    '%s exige direcao',
    (tipo) => {
      expect(validarCamposPorTipo({ tipo })).toEqual({
        ok: false,
        erro: `direcao é obrigatória para ${tipo}`,
      });
      expect(validarCamposPorTipo({ tipo, direcao: 'SAIDA' })).toEqual({ ok: true });
    },
  );

  it.each(['WHATSAPP', 'EMAIL', 'LIGACAO', 'TICKET'] as const)(
    '%s rejeita notaNps',
    (tipo) => {
      expect(validarCamposPorTipo({ tipo, direcao: 'SAIDA', notaNps: 5 })).toEqual({
        ok: false,
        erro: 'notaNps só se aplica a NPS',
      });
    },
  );

  it('NOTA rejeita direcao e notaNps', () => {
    expect(validarCamposPorTipo({ tipo: 'NOTA', direcao: 'SAIDA' })).toEqual({
      ok: false,
      erro: 'direcao não se aplica a NOTA',
    });
    expect(validarCamposPorTipo({ tipo: 'NOTA', notaNps: 5 })).toEqual({
      ok: false,
      erro: 'notaNps não se aplica a NOTA',
    });
    expect(validarCamposPorTipo({ tipo: 'NOTA' })).toEqual({ ok: true });
  });

  it('NPS exige notaNps 0..10 inteiro; direcao é opcional', () => {
    expect(validarCamposPorTipo({ tipo: 'NPS' })).toEqual({
      ok: false,
      erro: 'notaNps é obrigatório para NPS',
    });
    expect(validarCamposPorTipo({ tipo: 'NPS', notaNps: 11 })).toEqual({
      ok: false,
      erro: 'notaNps deve ser um inteiro entre 0 e 10',
    });
    expect(validarCamposPorTipo({ tipo: 'NPS', notaNps: -1 })).toEqual({
      ok: false,
      erro: 'notaNps deve ser um inteiro entre 0 e 10',
    });
    expect(validarCamposPorTipo({ tipo: 'NPS', notaNps: 5.5 })).toEqual({
      ok: false,
      erro: 'notaNps deve ser um inteiro entre 0 e 10',
    });
    expect(validarCamposPorTipo({ tipo: 'NPS', notaNps: 0 })).toEqual({ ok: true });
    expect(validarCamposPorTipo({ tipo: 'NPS', notaNps: 10 })).toEqual({ ok: true });
    expect(validarCamposPorTipo({ tipo: 'NPS', notaNps: 7, direcao: 'ENTRADA' })).toEqual({
      ok: true,
    });
  });
});
