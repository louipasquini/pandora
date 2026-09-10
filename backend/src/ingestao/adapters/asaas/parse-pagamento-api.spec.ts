import pagina from './fixtures/api-payments-pagina.json';
import { parsePagamentoApi } from './parse-pagamento-api';

describe('parsePagamentoApi (spec 020 — fixture real)', () => {
  const itens = (pagina as { data: unknown[] }).data;

  it('item RECEIVED → EventoCanonico ASAAS_PRD / asaas.api', () => {
    const r = parsePagamentoApi(itens[0], 'ASAAS_PRD');
    expect(r.erros).toEqual([]);
    expect(r.tipoOrigem).toBe('asaas.api');
    const ec = r.eventoCanonico!;
    expect(ec.plataformaOrigem).toBe('ASAAS_PRD');
    expect(ec.idOrigem).toBe('pay_a1000000000000000001');
    expect(ec.statusOrigem).toBe('RECEIVED');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 42000000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toEqual({ valorInteiro: 40530000n, moeda: 'BRL' });
  });

  it('item CONFIRMED com subscription + externalReference', () => {
    const r = parsePagamentoApi(itens[1], 'ASAAS_SVC');
    const ec = r.eventoCanonico!;
    expect(ec.plataformaOrigem).toBe('ASAAS_SVC');
    expect(ec.assinatura).toEqual({ ehRecorrencia: true });
    expect(ec.referenciaExterna).toEqual({ idOrigem: 'guru-tx-def456' });
  });

  it('item PENDING só com value (sem netValue) → só bruto', () => {
    const r = parsePagamentoApi(itens[2], 'ASAAS_PRD');
    const ec = r.eventoCanonico!;
    expect(ec.statusOrigem).toBe('PENDING');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 3500000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toBeUndefined();
    expect(ec.valores?.taxas).toBeUndefined();
    expect(ec.ocorridoEm).toBe('2026-03-07'); // sem paymentDate → dateCreated
  });

  it('não-objeto → sem eventoCanonico, sem lançar', () => {
    const r = parsePagamentoApi(null, 'ASAAS_PRD');
    expect(r.eventoCanonico).toBeUndefined();
    expect(r.erros.join(' ')).toMatch(/não é objeto/);
  });
});
