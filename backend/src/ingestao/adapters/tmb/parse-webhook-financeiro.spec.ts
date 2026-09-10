import parcelas from './fixtures/webhook-financeiro-parcelas.json';
import { parseWebhookFinanceiro } from './parse-webhook-financeiro';

describe('parseWebhookFinanceiro (spec 019 — fixture real)', () => {
  it('array [{dados}] → 1 EventoCanonico por item, nível de pedido, sem valores', () => {
    const rs = parseWebhookFinanceiro(parcelas);
    expect(rs).toHaveLength(5);
    for (const r of rs) {
      expect(r.tipoOrigem).toBe('tmb.webhook-financeiro');
      expect(r.erros).toEqual([]);
      expect(r.eventoCanonico?.valores).toBeUndefined();
    }
    // 3 parcelas do pedido 483921 + 2 do 483925 (mesma identidade colapsa — D-02)
    expect(rs.slice(0, 3).every((r) => r.idOrigem === '483921')).toBe(true);
    expect(rs.slice(3).every((r) => r.idOrigem === '483925')).toBe(true);
    expect(rs.map((r) => r.eventoCanonico?.statusOrigem)).toEqual([
      'Recebido',
      'Aguardando pagamento',
      'Estornado',
      'Vencido',
      'DELETED',
    ]);
    // data_pagamento presente → usada; ausente → cai em vencimento_parcela
    expect(rs[0].eventoCanonico?.ocorridoEm).toBe('2026-04-09T18:22:31');
    expect(rs[1].eventoCanonico?.ocorridoEm).toBe('2026-05-10T00:00:00');
  });

  it('objeto único {dados} → [1]; achatado → [1]; array vazio → []', () => {
    expect(parseWebhookFinanceiro({ dados: { pedido_id: 9, status_pagamento: 'Recebido' } })).toHaveLength(1);
    expect(parseWebhookFinanceiro({ pedido_id: 9, status_pagamento: 'Recebido' })).toHaveLength(1);
    expect(parseWebhookFinanceiro([])).toEqual([]);
  });

  it('item sem pedido_id → eventoCanonico ausente + erro (não aborta os demais)', () => {
    const rs = parseWebhookFinanceiro([
      { dados: { status_pagamento: 'Recebido' } },
      { dados: { pedido_id: 7, status_pagamento: 'Vencido' } },
    ]);
    expect(rs[0].eventoCanonico).toBeUndefined();
    expect(rs[1].eventoCanonico?.idOrigem).toBe('7');
  });
});
