import { paraStatusTransacaoCanonico } from './resolver-status';
import { STATUS_TRANSACAO_CANONICO, StatusTransacaoCanonico } from './status-transacao';

describe('paraStatusTransacaoCanonico', () => {
  it('passa por valores canônicos exatos sem marcar revisão', () => {
    for (const s of STATUS_TRANSACAO_CANONICO) {
      expect(paraStatusTransacaoCanonico(s)).toEqual({ status: s, revisar: false });
    }
  });

  it.each([
    ['string minúscula', 'pago'],
    ['sinônimo de origem', 'aprovado'],
    ['string vazia', ''],
    ['espaços em volta', ' PAGO '],
    ['null', null],
    ['undefined', undefined],
    ['número', 42],
    ['objeto', {}],
  ])('%s → DESCONHECIDO + revisar', (_nome, bruto) => {
    expect(paraStatusTransacaoCanonico(bruto)).toEqual({
      status: StatusTransacaoCanonico.DESCONHECIDO,
      revisar: true,
    });
  });

  it('DESCONHECIDO canônico não pede revisão (já é o estado explícito)', () => {
    expect(paraStatusTransacaoCanonico('DESCONHECIDO')).toEqual({
      status: StatusTransacaoCanonico.DESCONHECIDO,
      revisar: false,
    });
  });
});
