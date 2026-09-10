import received from './fixtures/webhook-payment-received.json';
import overdue from './fixtures/webhook-payment-overdue.json';
import refunded from './fixtures/webhook-payment-refunded.json';
import deleted from './fixtures/webhook-payment-deleted.json';
import confirmedGuru from './fixtures/webhook-payment-confirmed-guru.json';
import { parseWebhookAsaas } from './parse-webhook';

describe('parseWebhookAsaas (spec 020 — fixture real)', () => {
  it('PAYMENT_RECEIVED → EventoCanonico ASAAS_PRD / asaas.webhook com valores; sem comprador', () => {
    const [r] = parseWebhookAsaas(received, 'ASAAS_PRD');
    expect(r.erros).toEqual([]);
    expect(r.idOrigem).toBe('pay_9f8e7d6c5b4a30291817');
    expect(r.tipoOrigem).toBe('asaas.webhook');
    expect(r.payloadBruto).toBe(received); // envelope { event, payment } inteiro

    const ec = r.eventoCanonico!;
    expect(ec.plataformaOrigem).toBe('ASAAS_PRD');
    expect(ec.idOrigem).toBe('pay_9f8e7d6c5b4a30291817');
    expect(ec.statusOrigem).toBe('RECEIVED');
    expect(ec.ocorridoEm).toBe('2026-03-09'); // paymentDate
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 1970000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toEqual({ valorInteiro: 1901300n, moeda: 'BRL' });
    expect(ec.valores?.taxas).toEqual({ valorInteiro: 68700n, moeda: 'BRL' });
    expect(ec.oferta?.nomeOrigem).toBe('Pos em Nutricao Clinica - matricula');
    expect(ec.comprador).toBeUndefined(); // A / D-R11
    expect(ec.referenciaExterna).toBeUndefined(); // externalReference === ''
    expect(ec.assinatura).toBeUndefined();
    expect(ec.ehAfiliada).toBeUndefined();
    expect(ec.classificacao).toBeUndefined();
  });

  it('conta é o parâmetro, nunca o payload', () => {
    const [r] = parseWebhookAsaas(received, 'ASAAS_SVC');
    expect(r.eventoCanonico?.plataformaOrigem).toBe('ASAAS_SVC');
  });

  it('PAYMENT_OVERDUE sem paymentDate → ocorridoEm cai em dateCreated; sem netValue → só bruto', () => {
    const [r] = parseWebhookAsaas(overdue, 'ASAAS_PRD');
    const ec = r.eventoCanonico!;
    expect(ec.statusOrigem).toBe('OVERDUE');
    expect(ec.ocorridoEm).toBe('2026-03-01');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 3500000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toBeUndefined();
    expect(ec.valores?.taxas).toBeUndefined();
  });

  it('PAYMENT_DELETED (deleted:true) → statusOrigem sintético "DELETED"', () => {
    const [r] = parseWebhookAsaas(deleted, 'ASAAS_PRD');
    expect(r.eventoCanonico?.statusOrigem).toBe('DELETED');
  });

  it('PAYMENT_REFUNDED → statusOrigem "REFUNDED" (refunds[] só no payload_bruto)', () => {
    const [r] = parseWebhookAsaas(refunded, 'ASAAS_PRD');
    expect(r.eventoCanonico?.statusOrigem).toBe('REFUNDED');
    expect(r.eventoCanonico).not.toHaveProperty('classificacao');
  });

  it('PAYMENT_CONFIRMED com externalReference + subscription → referenciaExterna (sem plataforma) + assinatura', () => {
    const [r] = parseWebhookAsaas(confirmedGuru, 'ASAAS_PRD');
    const ec = r.eventoCanonico!;
    expect(ec.statusOrigem).toBe('CONFIRMED');
    expect(ec.referenciaExterna).toEqual({ idOrigem: 'guru-tx-abc123' });
    expect(ec.referenciaExterna).not.toHaveProperty('plataforma');
    expect(ec.assinatura).toEqual({ ehRecorrencia: true });
  });

  it('ignora chave inédita no payload (a Asaas evolui o schema)', () => {
    const [r] = parseWebhookAsaas(received, 'ASAAS_PRD');
    expect(r.eventoCanonico).toBeDefined();
    expect(r.erros).toEqual([]);
  });

  it('array de 1 envelope → 1 resultado', () => {
    const rs = parseWebhookAsaas([received], 'ASAAS_PRD');
    expect(rs).toHaveLength(1);
    expect(rs[0].idOrigem).toBe('pay_9f8e7d6c5b4a30291817');
  });

  it('corpo sem payment → sem eventoCanonico, sem lançar', () => {
    const rs = parseWebhookAsaas({ event: 'TRANSFER_CREATED', transfer: { id: 'x' } }, 'ASAAS_PRD');
    expect(rs).toHaveLength(1);
    expect(rs[0].eventoCanonico).toBeUndefined();
    expect(rs[0].idOrigem).toBeUndefined();
    expect(rs[0].erros.join(' ')).toMatch(/sem objeto payment/);
  });

  it('payment sem id → sem eventoCanonico + erro descritivo', () => {
    const rs = parseWebhookAsaas({ event: 'PAYMENT_CREATED', payment: { status: 'PENDING' } }, 'ASAAS_PRD');
    expect(rs[0].eventoCanonico).toBeUndefined();
    expect(rs[0].erros.join(' ')).toMatch(/sem identificador de cobrança/);
  });
});
