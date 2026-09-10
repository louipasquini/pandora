import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StatusTransacaoCanonico } from '../../../core/core.module';
import { mapearStatus, MAPAS_STATUS } from './index';
import { HOTMART } from './hotmart';

describe('status-map/hotmart (spec 022)', () => {
  it('registrado em MAPAS_STATUS para as duas contas, apontando para o mesmo objeto', () => {
    expect(MAPAS_STATUS.HOTMART_PRD).toBe(HOTMART);
    expect(MAPAS_STATUS.HOTMART_SVC).toBe(HOTMART);
  });

  const S = StatusTransacaoCanonico;
  const casos: Array<[string, string, string, StatusTransacaoCanonico]> = [
    ['HOTMART_PRD', 'hotmart.api', 'APPROVED', S.PAGO],
    ['HOTMART_PRD', 'hotmart.api', 'COMPLETE', S.PAGO],
    ['HOTMART_PRD', 'hotmart.api', 'PRINTED_BILLET', S.PENDENTE],
    ['HOTMART_PRD', 'hotmart.api', 'WAITING_PAYMENT', S.PENDENTE],
    ['HOTMART_PRD', 'hotmart.api', 'UNDER_ANALISYS', S.PENDENTE],
    ['HOTMART_PRD', 'hotmart.api', 'PROCESSING_TRANSACTION', S.PENDENTE],
    ['HOTMART_PRD', 'hotmart.api', 'OVERDUE', S.EM_ATRASO],
    ['HOTMART_PRD', 'hotmart.api', 'NO_FUNDS', S.EM_ATRASO],
    ['HOTMART_PRD', 'hotmart.api', 'REFUNDED', S.ESTORNADO],
    ['HOTMART_PRD', 'hotmart.api', 'PARTIALLY_REFUNDED', S.ESTORNADO],
    ['HOTMART_PRD', 'hotmart.api', 'DISPUTE', S.ESTORNADO],
    ['HOTMART_PRD', 'hotmart.api', 'CHARGEBACK', S.CHARGEBACK],
    ['HOTMART_PRD', 'hotmart.api', 'PROTESTED', S.CHARGEBACK],
    ['HOTMART_PRD', 'hotmart.api', 'CANCELLED', S.CANCELADO],
    ['HOTMART_PRD', 'hotmart.api', 'EXPIRED', S.CANCELADO],
    ['HOTMART_PRD', 'hotmart.api', 'BLOCKED', S.RECUSADO],
    ['HOTMART_SVC', 'hotmart.webhook', 'REFUNDED', S.ESTORNADO],
    ['HOTMART_SVC', 'hotmart.csv', 'APPROVED', S.PAGO],
  ];

  it.each(casos)(
    'mapearStatus(%s, %s, %s) → %s sem revisão',
    (plataforma, fonte, bruto, esperado) => {
      const r = mapearStatus(plataforma, fonte, bruto);
      expect(r.status).toBe(esperado);
      expect(r.revisar).toBe(false);
    },
  );

  it('bruto fora do mapa (STARTED) → DESCONHECIDO + revisar', () => {
    const r = mapearStatus('HOTMART_PRD', 'hotmart.api', 'STARTED');
    expect(r.status).toBe(StatusTransacaoCanonico.DESCONHECIDO);
    expect(r.revisar).toBe(true);
  });

  it('não normaliza caixa (Regra nº 15 / gambiarra 4.4)', () => {
    expect(mapearStatus('HOTMART_PRD', 'hotmart.api', 'approved').revisar).toBe(true);
  });

  it('todo status do mapa aparece em alguma fixture real dos parsers', () => {
    const dir = join(__dirname, '../../../ingestao/adapters/hotmart/fixtures');
    const blob = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    const declarados = new Set(Object.values(HOTMART).flatMap((m) => Object.keys(m)));
    for (const bruto of declarados) {
      expect(blob).toContain(`"${bruto}"`);
    }
  });
});
