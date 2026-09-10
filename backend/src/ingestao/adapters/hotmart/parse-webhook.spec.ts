import approved from './fixtures/webhook-purchase-approved.json';
import refunded from './fixtures/webhook-purchase-refunded.json';
import affiliate from './fixtures/webhook-purchase-affiliate.json';
import subscription from './fixtures/webhook-purchase-subscription.json';
import { parseWebhookHotmart } from './parse-webhook';

describe('parseWebhookHotmart (spec 022 — stub, fixture real de PURCHASE_*)', () => {
  it('PURCHASE_APPROVED → EventoCanonico HOTMART_PRD / hotmart.webhook, comprador rico', () => {
    const [r] = parseWebhookHotmart(approved, 'HOTMART_PRD');
    expect(r.erros).toEqual([]);
    expect(r.idOrigem).toBe('HP12455690120001');
    expect(r.tipoOrigem).toBe('hotmart.webhook');

    const ec = r.eventoCanonico!;
    expect(ec.plataformaOrigem).toBe('HOTMART_PRD');
    expect(ec.statusOrigem).toBe('APPROVED'); // data.purchase.status, NÃO o event
    expect(ec.ocorridoEm).toBe('1717203600000');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 1506000n, moeda: 'BRL' });
    expect(ec.oferta?.codigoOrigem).toBe('k2pasun0');
    expect(ec.comprador?.nome).toBe('Marta Nogueira');
    expect(ec.comprador?.documentos).toEqual(['39053344705']);
    expect(ec.comprador?.telefones).toEqual(['11', '991234567']);
    expect(ec.comprador?.endereco?.cidade).toBe('São Paulo');
    expect(ec.comprador?.endereco?.logradouro).toBe('Avenida Paulista');
    expect(ec.assinatura).toBeUndefined();
    expect(ec.ehAfiliada).toBeUndefined();
  });

  it('payload_bruto NÃO carrega hottok (defesa — H-08); ignora chave inédita', () => {
    const [r] = parseWebhookHotmart(approved, 'HOTMART_PRD');
    expect(JSON.stringify(r.payloadBruto)).not.toContain('hottok');
    expect(JSON.stringify(r.payloadBruto)).not.toContain('HOTTOK-FIXTURE');
    expect(JSON.stringify(r.payloadBruto)).toContain('campo_novo_2027');
  });

  it('PURCHASE_REFUNDED → status REFUNDED, mesmo idOrigem da venda', () => {
    const [r] = parseWebhookHotmart(refunded, 'HOTMART_PRD');
    expect(r.idOrigem).toBe('HP12455690120001');
    expect(r.eventoCanonico?.statusOrigem).toBe('REFUNDED');
  });

  it('commission_as AFFILIATE → ehAfiliada true; moeda USD', () => {
    const [r] = parseWebhookHotmart(affiliate, 'HOTMART_PRD');
    expect(r.eventoCanonico?.ehAfiliada).toBe(true);
    expect(r.eventoCanonico?.valores?.bruto?.moeda).toBe('USD');
  });

  it('data.subscription presente + recurrence_number 3 → assinatura { ehRecorrencia, numeroCiclo }', () => {
    const [r] = parseWebhookHotmart(subscription, 'HOTMART_PRD');
    expect(r.eventoCanonico?.assinatura).toEqual({ ehRecorrencia: true, numeroCiclo: 3 });
  });

  it('aceita array; sem transaction → erro sem lançar; não-objeto → erro', () => {
    expect(parseWebhookHotmart([approved], 'HOTMART_PRD')).toHaveLength(1);
    const [semTx] = parseWebhookHotmart({ event: 'PURCHASE_APPROVED', data: { purchase: {} } }, 'HOTMART_PRD');
    expect(semTx.eventoCanonico).toBeUndefined();
    expect(semTx.erros).toContain('sem identificador de transação');
    const [lixo] = parseWebhookHotmart('lixo', 'HOTMART_PRD');
    expect(lixo.erros).toContain('payload não é objeto');
  });
});
