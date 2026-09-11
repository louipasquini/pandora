import { Classificacao } from '@prisma/client';
import { StatusTransacaoCanonico } from '../../../core/core.module';
import { pagoDeFatoTransacao } from './receita';

describe('pagoDeFatoTransacao', () => {
  it('PAGO + VENDA_PROPRIA conta como receita', () => {
    expect(
      pagoDeFatoTransacao(StatusTransacaoCanonico.PAGO, Classificacao.VENDA_PROPRIA),
    ).toBe(true);
  });

  it('PAGO + COBRANCA_TERCEIRIZADA não conta (a Guru já contou)', () => {
    expect(
      pagoDeFatoTransacao(StatusTransacaoCanonico.PAGO, Classificacao.COBRANCA_TERCEIRIZADA),
    ).toBe(false);
  });

  it('PENDENTE + VENDA_PROPRIA não conta (status já não conta hoje)', () => {
    expect(
      pagoDeFatoTransacao(StatusTransacaoCanonico.PENDENTE, Classificacao.VENDA_PROPRIA),
    ).toBe(false);
  });

  it('RECORRENCIA paga conta normalmente (não é terceirizada)', () => {
    expect(
      pagoDeFatoTransacao(StatusTransacaoCanonico.PAGO, Classificacao.RECORRENCIA),
    ).toBe(true);
  });
});
