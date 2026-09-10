import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StatusTransacaoCanonico } from '../../../core/core.module';
import { mapearStatus, MAPAS_STATUS } from './index';
import { TMB } from './tmb';

describe('status-map/tmb (spec 019)', () => {
  it('registrado em MAPAS_STATUS.TMB', () => {
    expect(MAPAS_STATUS.TMB).toBe(TMB);
  });

  const casos: Array<[string, string, StatusTransacaoCanonico]> = [
    ['tmb.webhook-vendas', 'Efetivado', StatusTransacaoCanonico.PAGO],
    ['tmb.webhook-vendas', 'Cancelado', StatusTransacaoCanonico.CANCELADO],
    ['tmb.api', 'Efetivado', StatusTransacaoCanonico.PAGO],
    ['tmb.api', 'Cancelado', StatusTransacaoCanonico.CANCELADO],
    ['tmb.webhook-financeiro', 'Recebido', StatusTransacaoCanonico.PAGO],
    ['tmb.webhook-financeiro', 'Aguardando pagamento', StatusTransacaoCanonico.PENDENTE],
    ['tmb.webhook-financeiro', 'Vencido', StatusTransacaoCanonico.EM_ATRASO],
    ['tmb.webhook-financeiro', 'Estornado', StatusTransacaoCanonico.ESTORNADO],
    ['tmb.webhook-financeiro', 'DELETED', StatusTransacaoCanonico.CANCELADO],
    ['tmb.csv', 'Efetivado', StatusTransacaoCanonico.PAGO],
    ['tmb.csv', 'Cancelado', StatusTransacaoCanonico.CANCELADO],
  ];

  it.each(casos)('mapearStatus(TMB, %s, %s) → %s sem revisão', (fonte, bruto, esperado) => {
    const r = mapearStatus('TMB', fonte, bruto);
    expect(r.status).toBe(esperado);
    expect(r.revisar).toBe(false);
  });

  it('bruto fora do mapa → DESCONHECIDO + revisar (comportamento da 018)', () => {
    const r = mapearStatus('TMB', 'tmb.webhook-financeiro', 'Coisa Nova');
    expect(r.status).toBe(StatusTransacaoCanonico.DESCONHECIDO);
    expect(r.revisar).toBe(true);
  });

  it('não normaliza caixa (Regra nº 15 / gambiarra 4.4)', () => {
    expect(mapearStatus('TMB', 'tmb.webhook-vendas', 'efetivado').revisar).toBe(true);
  });

  it('todo statusBruto do mapa aparece em alguma fixture real dos parsers', () => {
    const dir = join(__dirname, '../../../ingestao/adapters/tmb/fixtures');
    const blob = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    const declarados = new Set(Object.values(TMB).flatMap((m) => Object.keys(m)));
    for (const bruto of declarados) {
      expect(blob).toContain(bruto);
    }
  });
});
