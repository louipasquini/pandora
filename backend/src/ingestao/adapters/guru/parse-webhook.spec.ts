import approved from './fixtures/webhook-venda-approved.json';
import waiting from './fixtures/webhook-venda-waiting-payment.json';
import refunded from './fixtures/webhook-venda-refunded.json';
import chargeback from './fixtures/webhook-venda-chargeback.json';
import afiliada from './fixtures/webhook-venda-afiliada.json';
import assinatura from './fixtures/webhook-venda-assinatura-ciclo.json';
import planoNegado from './fixtures/webhook-venda-plano-negado.json';
import { parseWebhookGuru } from './parse-webhook';

describe('parseWebhookGuru (spec 021 — fixture real)', () => {
  it('venda approved → EventoCanonico GURU_PRD / guru.webhook completo', () => {
    const [r] = parseWebhookGuru(approved, 'GURU_PRD');
    expect(r.erros).toEqual([]);
    expect(r.idOrigem).toBe('9081534a-7512-4dab-9172-218c1dc10001');
    expect(r.tipoOrigem).toBe('guru.webhook');

    const ec = r.eventoCanonico!;
    expect(ec.plataformaOrigem).toBe('GURU_PRD');
    expect(ec.statusOrigem).toBe('approved');
    expect(ec.ocorridoEm).toBe('2026-03-08T11:35:57Z'); // confirmed_at
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 4970000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toEqual({ valorInteiro: 4681000n, moeda: 'BRL' });
    expect(ec.valores?.taxas).toEqual({ valorInteiro: 289000n, moeda: 'BRL' }); // tax.value
    expect(ec.oferta).toEqual({
      codigoOrigem: 'of_nmx_anual',
      nomeOrigem: 'NMX — Oferta Anual',
      quantidade: 1,
    });
    expect(ec.comprador?.nome).toBe('Marta Nogueira');
    expect(ec.comprador?.emails).toEqual(['marta.nogueira@example.com']);
    expect(ec.comprador?.documentos).toEqual(['39053344705']);
    expect(ec.comprador?.telefones).toEqual(['55', '11991234567']);
    expect(ec.comprador?.endereco?.cidade).toBe('São Paulo');
    expect(ec.assinatura).toBeUndefined();
    expect(ec.ehAfiliada).toBeUndefined();
    expect(ec.referenciaExterna).toBeUndefined(); // a Guru é a origem — G-02
    expect(ec.classificacao).toBeUndefined();
  });

  it('payload_bruto NÃO carrega api_token (segredo — G-14) e ignora chave inédita', () => {
    const [r] = parseWebhookGuru(approved, 'GURU_PRD');
    expect(JSON.stringify(r.payloadBruto)).not.toContain('api_token');
    expect(JSON.stringify(r.payloadBruto)).not.toContain('GURU-TOKEN-FIXTURE');
    // chave inédita preservada no payload_bruto, ignorada pelo parser
    expect(JSON.stringify(r.payloadBruto)).toContain('campo_novo_2027');
    expect(r.erros).toEqual([]);
  });

  it('conta é o parâmetro, nunca o payload', () => {
    const [r] = parseWebhookGuru(approved, 'GURU_SVC');
    expect(r.eventoCanonico?.plataformaOrigem).toBe('GURU_SVC');
  });

  it('waiting_payment sem confirmed_at → ocorridoEm cai em ordered_at; sem net → só bruto', () => {
    const [r] = parseWebhookGuru(waiting, 'GURU_PRD');
    const ec = r.eventoCanonico!;
    expect(ec.statusOrigem).toBe('waiting_payment');
    expect(ec.ocorridoEm).toBe('2026-03-09T08:00:10Z');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 1970000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toBeUndefined();
    expect(ec.valores?.taxas).toBeUndefined();
  });

  it('refunded → mesmo idOrigem da venda original (colapsa numa transação)', () => {
    const [r] = parseWebhookGuru(refunded, 'GURU_PRD');
    expect(r.idOrigem).toBe('9081534a-7512-4dab-9172-218c1dc10001');
    expect(r.eventoCanonico?.statusOrigem).toBe('refunded');
  });

  it('chargeback → status cru transportado', () => {
    const [r] = parseWebhookGuru(chargeback, 'GURU_PRD');
    expect(r.eventoCanonico?.statusOrigem).toBe('chargeback');
  });

  it('type: "affiliate" → ehAfiliada true', () => {
    const [r] = parseWebhookGuru(afiliada, 'GURU_PRD');
    expect(r.eventoCanonico?.ehAfiliada).toBe(true);
  });

  it('plano com subscription preenchido + invoice.cycle → assinatura { ehRecorrencia, numeroCiclo }', () => {
    const [r] = parseWebhookGuru(assinatura, 'GURU_PRD');
    expect(r.eventoCanonico?.assinatura).toEqual({
      ehRecorrencia: true,
      numeroCiclo: 3,
    });
  });

  it('plano negado com subscription vazio → sem bloco assinatura', () => {
    const [r] = parseWebhookGuru(planoNegado, 'GURU_PRD');
    expect(r.eventoCanonico?.statusOrigem).toBe('rejected');
    expect(r.eventoCanonico?.assinatura).toBeUndefined();
  });

  it('payment.currency propaga para os Dinheiro (USD)', () => {
    const [r] = parseWebhookGuru(
      { ...approved, payment: { ...approved.payment, currency: 'USD' } },
      'GURU_PRD',
    );
    expect(r.eventoCanonico?.valores?.bruto?.moeda).toBe('USD');
  });

  it('sem id → sem eventoCanonico, erro descritivo, não lança', () => {
    const [r] = parseWebhookGuru({ status: 'approved' }, 'GURU_PRD');
    expect(r.eventoCanonico).toBeUndefined();
    expect(r.erros).toContain('sem identificador de transação');
  });

  it('aceita array de 1 item', () => {
    const rs = parseWebhookGuru([approved], 'GURU_PRD');
    expect(rs).toHaveLength(1);
    expect(rs[0].idOrigem).toBe('9081534a-7512-4dab-9172-218c1dc10001');
  });

  it('payload não-objeto → erro sem lançar', () => {
    const [r] = parseWebhookGuru('lixo', 'GURU_PRD');
    expect(r.eventoCanonico).toBeUndefined();
    expect(r.erros).toContain('payload não é objeto');
  });
});
