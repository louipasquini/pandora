import pagina from './fixtures/api-sales-history-pagina.json';
import assinaturaFix from './fixtures/api-sales-history-assinatura.json';
import refundFix from './fixtures/api-sales-history-refund.json';
import precoFix from './fixtures/api-sales-price-details-pagina.json';
import { parseVendaApi } from './parse-venda-api';

const [aprovada, pendente, afiliada] = pagina.items;
const detalhe1 = precoFix.items[0]; // transaction HP12455690120001

describe('parseVendaApi (spec 022 — fixture real de sales/history)', () => {
  it('compra APPROVED → EventoCanonico HOTMART_PRD / hotmart.api completo', () => {
    const r = parseVendaApi(aprovada, 'HOTMART_PRD');
    expect(r.erros).toEqual([]);
    expect(r.idOrigem).toBe('HP12455690120001');
    expect(r.tipoOrigem).toBe('hotmart.api');

    const ec = r.eventoCanonico!;
    expect(ec.plataformaOrigem).toBe('HOTMART_PRD');
    expect(ec.statusOrigem).toBe('APPROVED');
    expect(ec.ocorridoEm).toBe('1717203600000'); // approved_date (epoch ms como string)
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 1506000n, moeda: 'BRL' });
    expect(ec.valores?.taxas).toEqual({ valorInteiro: 149000n, moeda: 'BRL' }); // hotmart_fee.total
    expect(ec.valores?.liquido).toEqual({ valorInteiro: 1357000n, moeda: 'BRL' });
    expect(ec.oferta).toEqual({
      codigoOrigem: 'k2pasun0',
      nomeOrigem: 'Curso Nutrição Clínica Sistêmica',
    });
    expect(ec.comprador?.nome).toBe('Ian Victor Baptista');
    expect(ec.comprador?.emails).toEqual(['ian.baptista@example.com']);
    expect(ec.assinatura).toBeUndefined();
    expect(ec.ehAfiliada).toBeUndefined();
    expect(ec.referenciaExterna).toBeUndefined(); // a Hotmart não terceiriza cobrança
  });

  it('ignora chave inédita; conta é o parâmetro', () => {
    const r = parseVendaApi(aprovada, 'HOTMART_SVC');
    expect(r.eventoCanonico?.plataformaOrigem).toBe('HOTMART_SVC');
    expect(JSON.stringify(r.payloadBruto)).toContain('campo_novo_2027');
  });

  it('WAITING_PAYMENT sem approved_date/hotmart_fee → ocorridoEm de order_date, só bruto', () => {
    const r = parseVendaApi(pendente, 'HOTMART_PRD');
    const ec = r.eventoCanonico!;
    expect(ec.statusOrigem).toBe('WAITING_PAYMENT');
    expect(ec.ocorridoEm).toBe('1717286400000');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 470000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toBeUndefined();
    expect(ec.valores?.taxas).toBeUndefined();
  });

  it('commission_as AFFILIATE → ehAfiliada true; moeda USD propaga', () => {
    const r = parseVendaApi(afiliada, 'HOTMART_PRD');
    expect(r.eventoCanonico?.ehAfiliada).toBe(true);
    expect(r.eventoCanonico?.valores?.bruto?.moeda).toBe('USD');
  });

  it('is_subscription + recurrency_number 3 → assinatura { ehRecorrencia, numeroCiclo }', () => {
    const r = parseVendaApi(assinaturaFix.items[0], 'HOTMART_PRD');
    expect(r.eventoCanonico?.assinatura).toEqual({ ehRecorrencia: true, numeroCiclo: 3 });
  });

  it('APPROVED e PARTIALLY_REFUNDED → mesmo idOrigem (colapsa numa transação)', () => {
    const [ap, ref] = refundFix.items;
    expect(parseVendaApi(ap, 'HOTMART_PRD').idOrigem).toBe('HP12455690120090');
    const rRef = parseVendaApi(ref, 'HOTMART_PRD');
    expect(rRef.idOrigem).toBe('HP12455690120090');
    expect(rRef.eventoCanonico?.statusOrigem).toBe('PARTIALLY_REFUNDED');
  });

  it('detalhePreco casado → anexado ao payload_bruto sob price_details; sem detalhe → sem erro', () => {
    const comDetalhe = parseVendaApi(aprovada, 'HOTMART_PRD', detalhe1);
    expect(JSON.stringify(comDetalhe.payloadBruto)).toContain('price_details');
    expect(JSON.stringify(comDetalhe.payloadBruto)).toContain('ABC10'); // coupon.code
    expect(comDetalhe.erros).toEqual([]);

    const semDetalhe = parseVendaApi(pendente, 'HOTMART_PRD', undefined);
    expect(semDetalhe.erros).toEqual([]);
    expect(JSON.stringify(semDetalhe.payloadBruto)).not.toContain('price_details');
  });

  it('price.currency_code inválida → BRL cravado + erro não-fatal', () => {
    const item = JSON.parse(JSON.stringify(aprovada));
    item.purchase.price.currency_code = 'reais';
    const r = parseVendaApi(item, 'HOTMART_PRD');
    expect(r.eventoCanonico?.valores?.bruto?.moeda).toBe('BRL');
    expect(r.erros.some((e) => e.includes('currency_code'))).toBe(true);
  });

  it('sem purchase.transaction → sem eventoCanonico, erro descritivo, não lança', () => {
    const item = JSON.parse(JSON.stringify(aprovada));
    delete item.purchase.transaction;
    const r = parseVendaApi(item, 'HOTMART_PRD');
    expect(r.eventoCanonico).toBeUndefined();
    expect(r.erros).toContain('sem identificador de transação');
  });

  it('item não-objeto → erro sem lançar', () => {
    const r = parseVendaApi('lixo', 'HOTMART_PRD');
    expect(r.eventoCanonico).toBeUndefined();
    expect(r.erros).toContain('item não é objeto');
  });
});
