import { Classificacao } from '@prisma/client';
import { classificar } from './classificar';
import type { EventoCanonico } from './evento-canonico';

const c = (over: Partial<EventoCanonico> = {}): EventoCanonico => ({
  plataformaOrigem: 'GURU_PRD',
  idOrigem: 'txn_1',
  tipoOrigem: 'webhook_venda',
  statusOrigem: 'approved',
  ocorridoEm: '2026-09-03T12:00:00Z',
  ...over,
});

describe('classificar (spec 006, etapa 1)', () => {
  it('sem EventoCanonico → DESCONHECIDO + revisar', () => {
    const r = classificar(null, 'webhook_venda');
    expect(r).toMatchObject({ classificacao: Classificacao.DESCONHECIDO, revisar: true });
    expect(r.motivo).toMatch(/EventoCanonico/);
  });

  it('estorno por statusOrigem → REEMBOLSO', () => {
    expect(classificar(c({ statusOrigem: 'refunded' }), 'webhook_venda').classificacao).toBe(
      Classificacao.REEMBOLSO,
    );
  });

  it('estorno por tipoOrigem → REEMBOLSO', () => {
    expect(classificar(c(), 'webhook_reembolso').classificacao).toBe(Classificacao.REEMBOLSO);
  });

  it('referência externa a outra plataforma → DESCONHECIDO + revisar (spec 024)', () => {
    const r = classificar(
      c({ referenciaExterna: { plataforma: 'ASAAS_PRD', idOrigem: 'pay_9' } }),
      'webhook_pagamento',
    );
    expect(r.classificacao).toBe(Classificacao.DESCONHECIDO);
    expect(r.revisar).toBe(true);
    expect(r.motivo).toMatch(/024/);
  });

  it('ehAfiliada → VENDA_AFILIADA', () => {
    expect(classificar(c({ ehAfiliada: true }), 'webhook_venda').classificacao).toBe(
      Classificacao.VENDA_AFILIADA,
    );
  });

  it('assinatura recorrente → RECORRENCIA', () => {
    expect(
      classificar(c({ assinatura: { ehRecorrencia: true } }), 'webhook_venda').classificacao,
    ).toBe(Classificacao.RECORRENCIA);
    expect(
      classificar(c({ assinatura: { numeroCiclo: 3 } }), 'webhook_venda').classificacao,
    ).toBe(Classificacao.RECORRENCIA);
  });

  it('caso base → VENDA_PROPRIA sem revisar', () => {
    expect(classificar(c(), 'webhook_venda')).toEqual({
      classificacao: Classificacao.VENDA_PROPRIA,
      revisar: false,
    });
  });

  it('é determinística', () => {
    const ev = c({ assinatura: { ehRecorrencia: true } });
    const primeiro = JSON.stringify(classificar(ev, 'x'));
    for (let i = 0; i < 20; i += 1) {
      expect(JSON.stringify(classificar(ev, 'x'))).toBe(primeiro);
    }
  });
});
