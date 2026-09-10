import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StatusTransacaoCanonico } from '../../../core/core.module';
import { mapearStatus, MAPAS_STATUS } from './index';
import { ASAAS } from './asaas';

describe('status-map/asaas (spec 020)', () => {
  it('registrado em MAPAS_STATUS para as duas contas, apontando para o mesmo objeto', () => {
    expect(MAPAS_STATUS.ASAAS_PRD).toBe(ASAAS);
    expect(MAPAS_STATUS.ASAAS_SVC).toBe(ASAAS);
  });

  const S = StatusTransacaoCanonico;
  const casos: Array<[string, string, string, StatusTransacaoCanonico]> = [
    ['ASAAS_PRD', 'asaas.webhook', 'RECEIVED', S.PAGO],
    ['ASAAS_PRD', 'asaas.webhook', 'CONFIRMED', S.PAGO],
    ['ASAAS_PRD', 'asaas.webhook', 'RECEIVED_IN_CASH', S.PAGO],
    ['ASAAS_PRD', 'asaas.webhook', 'DUNNING_RECEIVED', S.PAGO],
    ['ASAAS_PRD', 'asaas.webhook', 'PENDING', S.PENDENTE],
    ['ASAAS_PRD', 'asaas.webhook', 'AWAITING_RISK_ANALYSIS', S.PENDENTE],
    ['ASAAS_PRD', 'asaas.webhook', 'OVERDUE', S.EM_ATRASO],
    ['ASAAS_PRD', 'asaas.webhook', 'DUNNING_REQUESTED', S.EM_ATRASO],
    ['ASAAS_PRD', 'asaas.webhook', 'REFUNDED', S.ESTORNADO],
    ['ASAAS_PRD', 'asaas.webhook', 'REFUND_REQUESTED', S.ESTORNADO],
    ['ASAAS_PRD', 'asaas.webhook', 'REFUND_IN_PROGRESS', S.ESTORNADO],
    ['ASAAS_PRD', 'asaas.webhook', 'CHARGEBACK_REQUESTED', S.CHARGEBACK],
    ['ASAAS_PRD', 'asaas.webhook', 'CHARGEBACK_DISPUTE', S.CHARGEBACK],
    ['ASAAS_PRD', 'asaas.webhook', 'AWAITING_CHARGEBACK_REVERSAL', S.CHARGEBACK],
    ['ASAAS_PRD', 'asaas.webhook', 'DELETED', S.CANCELADO],
    ['ASAAS_SVC', 'asaas.api', 'RECEIVED', S.PAGO],
    ['ASAAS_SVC', 'asaas.api', 'REFUNDED', S.ESTORNADO],
    ['ASAAS_SVC', 'asaas.csv', 'PENDING', S.PENDENTE],
    ['ASAAS_SVC', 'asaas.csv', 'DELETED', S.CANCELADO],
  ];

  it.each(casos)(
    'mapearStatus(%s, %s, %s) → %s sem revisão',
    (plataforma, fonte, bruto, esperado) => {
      const r = mapearStatus(plataforma, fonte, bruto);
      expect(r.status).toBe(esperado);
      expect(r.revisar).toBe(false);
    },
  );

  it('bruto fora do mapa → DESCONHECIDO + revisar (comportamento da 018)', () => {
    const r = mapearStatus('ASAAS_PRD', 'asaas.webhook', 'AUTHORIZED');
    expect(r.status).toBe(StatusTransacaoCanonico.DESCONHECIDO);
    expect(r.revisar).toBe(true);
  });

  it('não normaliza caixa (Regra nº 15 / gambiarra 4.4)', () => {
    expect(mapearStatus('ASAAS_PRD', 'asaas.webhook', 'received').revisar).toBe(true);
  });

  it('todo statusBruto do mapa aparece em alguma fixture real dos parsers', () => {
    const dir = join(__dirname, '../../../ingestao/adapters/asaas/fixtures');
    const blob = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    const declarados = new Set(Object.values(ASAAS).flatMap((m) => Object.keys(m)));
    for (const bruto of declarados) {
      if (bruto === 'DELETED') {
        // sintético — justificado por uma fixture com `"deleted": true`
        expect(blob).toMatch(/"deleted"\s*:\s*true/);
        continue;
      }
      expect(blob).toContain(bruto);
    }
  });
});
