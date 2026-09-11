import { decodificarTag } from './decodificar-tag';

describe('decodificarTag', () => {
  it('decodifica turma numérica', () => {
    const r = decodificarTag('PCS48XAV');
    expect(r).toEqual({
      codigoProduto: 'PCS',
      turma: { tipo: 'NUMERO', numero: 48, bruto: '48' },
      subprodutoCodigo: 'X',
      modeloCobrancaCodigo: 'A',
      modeloTransacaoCodigo: 'V',
    });
  });

  it('decodifica evergreen (X0)', () => {
    const r = decodificarTag('PCSX0LAV');
    expect(r?.turma).toEqual({ tipo: 'EVERGREEN', numero: null, bruto: 'X0' });
  });

  it('decodifica perpétuo (00)', () => {
    const r = decodificarTag('PCS00LAV');
    expect(r?.turma).toEqual({ tipo: 'PERPETUO', numero: null, bruto: '00' });
  });

  it('turma desconhecida preserva o bruto', () => {
    const r = decodificarTag('PCSZZLAV');
    expect(r?.turma).toEqual({ tipo: 'DESCONHECIDO', numero: null, bruto: 'ZZ' });
  });

  it.each(['PCS48XA', 'PCS48XAVV', 'pcs48xav', 'PC348XAV', ''])(
    'formato inválido "%s" -> null',
    (tag) => {
      expect(decodificarTag(tag)).toBeNull();
    },
  );

  it('não lança para entrada não-string', () => {
    expect(decodificarTag(undefined as unknown as string)).toBeNull();
    expect(decodificarTag(null as unknown as string)).toBeNull();
  });
});
