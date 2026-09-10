import efetivado from './fixtures/webhook-vendas-efetivado.json';
import cancelado from './fixtures/webhook-vendas-cancelado.json';
import { parseWebhookVendas } from './parse-webhook-vendas';

describe('parseWebhookVendas (spec 019 — fixture real)', () => {
  it('"Efetivado" → EventoCanonico TMB / tmb.webhook-vendas com comprador e valores', () => {
    const r = parseWebhookVendas(efetivado);
    expect(r.erros).toEqual([]);
    expect(r.idOrigem).toBe('483921');
    expect(r.tipoOrigem).toBe('tmb.webhook-vendas');
    expect(r.payloadBruto).toBe(efetivado);

    const ec = r.eventoCanonico!;
    expect(ec.plataformaOrigem).toBe('TMB');
    expect(ec.idOrigem).toBe('483921');
    expect(ec.statusOrigem).toBe('Efetivado');
    expect(ec.ocorridoEm).toBe('2026-03-02T10:41:55.882145-03:00');
    expect(ec.comprador?.nome).toBe('Mariana Ferreira Lopes');
    expect(ec.comprador?.emails).toEqual(['mariana.lopes@example.invalid']);
    expect(ec.comprador?.telefones).toEqual(['+5511988887777', '+5511977776666']);
    expect(ec.comprador?.documentos).toEqual(['52998224725']);
    expect(ec.comprador?.endereco).toMatchObject({
      logradouro: 'Rua das Acácias',
      numero: '1200',
      bairro: 'Tatuapé',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '03310-000',
      pais: 'BR',
    });
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 42000000n, moeda: 'BRL' });
    expect(ec.valores?.taxas).toEqual({ valorInteiro: 2100000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toEqual({ valorInteiro: 39900000n, moeda: 'BRL' });
    expect(ec.oferta?.nomeOrigem).toBe('PCN - Turma 48');
    // TMB não tem assinatura nem afiliada
    expect(ec.assinatura).toBeUndefined();
    expect(ec.ehAfiliada).toBeUndefined();
  });

  it('"Cancelado" com data_efetivado null → cai em criado_em', () => {
    const r = parseWebhookVendas(cancelado);
    expect(r.erros).toEqual([]);
    expect(r.eventoCanonico?.statusOrigem).toBe('Cancelado');
    expect(r.eventoCanonico?.ocorridoEm).toBe('2026-03-03T09:02:11.004512-03:00');
    expect(r.eventoCanonico?.comprador?.documentos).toEqual(['39053344705']);
  });

  it('chave inédita no payload é ignorada (não lança, não vira erro)', () => {
    const r = parseWebhookVendas({ ...efetivado, campo_novo_2028: { x: 1 } });
    expect(r.erros).toEqual([]);
    expect(r.eventoCanonico).toBeDefined();
  });

  it('sem pedido → eventoCanonico ausente + erro, payloadBruto preservado', () => {
    const { pedido: _omit, ...semPedido } = efetivado as Record<string, unknown>;
    const r = parseWebhookVendas(semPedido);
    expect(r.eventoCanonico).toBeUndefined();
    expect(r.erros.join(' ')).toMatch(/sem identificador de pedido/);
    expect(r.payloadBruto).toBe(semPedido);
  });

  it('payload não-objeto → erro sem lançar', () => {
    expect(() => parseWebhookVendas('lixo')).not.toThrow();
    expect(parseWebhookVendas('lixo').eventoCanonico).toBeUndefined();
  });
});
