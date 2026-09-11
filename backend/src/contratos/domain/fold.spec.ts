import { AditivoRotulo, Classificacao, StatusTransacaoCanonico } from '@prisma/client';
import { Dinheiro } from '../../core/core.module';
import { foldContrato, type TransacaoParaFold } from './fold';

function tx(over: Partial<TransacaoParaFold> & { transacaoId: string }): TransacaoParaFold {
  return {
    classificacao: Classificacao.VENDA_PROPRIA,
    statusCanonico: StatusTransacaoCanonico.PAGO,
    ocorridoEm: new Date('2026-01-01T00:00:00Z'),
    valorBruto: Dinheiro.deDecimal('100.00', 'BRL'),
    valorLiquido: Dinheiro.deDecimal('95.00', 'BRL'),
    tempoAcessoDias: 30,
    ...over,
  };
}

describe('foldContrato', () => {
  it('1ª compra vira COMPRA_INICIAL e fimAcesso = data + tempoAcesso', () => {
    const r = foldContrato([tx({ transacaoId: 'a', ocorridoEm: new Date('2026-01-01T00:00:00Z') })]);
    expect(r.aditivos[0].rotulo).toBe(AditivoRotulo.COMPRA_INICIAL);
    expect(r.fimAcesso?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('compra dentro do acesso ainda ativo vira PRORROGACAO e soma o tempo restante', () => {
    const r = foldContrato([
      tx({ transacaoId: 'a', ocorridoEm: new Date('2026-01-01T00:00:00Z') }),
      tx({ transacaoId: 'b', ocorridoEm: new Date('2026-01-10T00:00:00Z') }),
    ]);
    expect(r.aditivos[1].rotulo).toBe(AditivoRotulo.PRORROGACAO);
    // baseline (31/01) > data da 2ª compra (10/01) -> soma a partir do baseline
    expect(r.fimAcesso?.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  it('compra depois do acesso expirado vira RENOVACAO e conta a partir da nova data', () => {
    const r = foldContrato([
      tx({ transacaoId: 'a', ocorridoEm: new Date('2026-01-01T00:00:00Z') }),
      tx({ transacaoId: 'b', ocorridoEm: new Date('2026-03-01T00:00:00Z') }),
    ]);
    expect(r.aditivos[1].rotulo).toBe(AditivoRotulo.RENOVACAO);
    expect(r.fimAcesso?.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('classificação REEMBOLSO nunca estende fim_acesso e não conta como valor_recebido', () => {
    // `transacao` é upsertada por chave natural (Regra nº 1) — um reembolso
    // atualiza a MESMA linha (mesmo `transacaoId`), nunca cria uma 2ª. O fold
    // sempre vê o estado ATUAL, nunca as 2 fases separadas.
    const r = foldContrato([
      tx({
        transacaoId: 'a',
        classificacao: Classificacao.REEMBOLSO,
        statusCanonico: StatusTransacaoCanonico.ESTORNADO,
        ocorridoEm: new Date('2026-01-05T00:00:00Z'),
      }),
    ]);
    expect(r.aditivos[0].rotulo).toBe(AditivoRotulo.REEMBOLSO);
    expect(r.fimAcesso).toBeNull();
    expect(r.valorRecebido.BRL).toBeUndefined();
    expect(r.ticketTotal.BRL).toBeUndefined();
  });

  it('status que não libera acesso (RECUSADO) vira SEM_EFEITO, sem revisão', () => {
    const r = foldContrato([
      tx({
        transacaoId: 'a',
        statusCanonico: StatusTransacaoCanonico.RECUSADO,
      }),
    ]);
    expect(r.aditivos[0].rotulo).toBe(AditivoRotulo.SEM_EFEITO);
    expect(r.aditivos[0].precisaRevisao).toBe(false);
    expect(r.fimAcesso).toBeNull();
  });

  it('tempoAcessoDias ausente marca revisão e não estende o acesso', () => {
    const r = foldContrato([tx({ transacaoId: 'a', tempoAcessoDias: null })]);
    expect(r.aditivos[0].rotulo).toBe(AditivoRotulo.SEM_EFEITO);
    expect(r.aditivos[0].precisaRevisao).toBe(true);
    expect(r.fimAcesso).toBeNull();
  });

  it('data ausente marca revisão e não participa da ordenação por valor', () => {
    const r = foldContrato([tx({ transacaoId: 'a', ocorridoEm: null })]);
    expect(r.aditivos[0].rotulo).toBe(AditivoRotulo.SEM_EFEITO);
    expect(r.aditivos[0].precisaRevisao).toBe(true);
  });

  it('RECORRENCIA soma ticketTotal e pode estender o acesso como as vendas próprias', () => {
    const r = foldContrato([
      tx({ transacaoId: 'a', classificacao: Classificacao.RECORRENCIA }),
    ]);
    expect(r.ticketTotal.BRL).toBe(1_000_000n);
    expect(r.aditivos[0].rotulo).toBe(AditivoRotulo.COMPRA_INICIAL);
  });

  it('nunca soma moedas diferentes — 2 chaves distintas no dict', () => {
    const r = foldContrato([
      tx({ transacaoId: 'a', ocorridoEm: new Date('2026-01-01T00:00:00Z') }),
      tx({
        transacaoId: 'b',
        ocorridoEm: new Date('2026-02-01T00:00:00Z'),
        valorBruto: Dinheiro.deDecimal('50.00', 'USD'),
        valorLiquido: Dinheiro.deDecimal('48.00', 'USD'),
      }),
    ]);
    expect(Object.keys(r.ticketTotal).sort()).toEqual(['BRL', 'USD']);
    expect(Object.keys(r.valorRecebido).sort()).toEqual(['BRL', 'USD']);
  });

  it('determinístico: mesma entrada em ordem de array diferente produz o mesmo resultado', () => {
    const t1 = tx({ transacaoId: 'a', ocorridoEm: new Date('2026-01-01T00:00:00Z') });
    const t2 = tx({ transacaoId: 'b', ocorridoEm: new Date('2026-02-01T00:00:00Z') });
    const r1 = foldContrato([t1, t2]);
    const r2 = foldContrato([t2, t1]);
    expect(r1.fimAcesso?.toISOString()).toBe(r2.fimAcesso?.toISOString());
    expect(r1.aditivos.map((a) => a.transacaoId)).toEqual(r2.aditivos.map((a) => a.transacaoId));
  });
});
