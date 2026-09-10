import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StatusTransacaoCanonico } from '../../../core/core.module';
import { mapearStatus, MAPAS_STATUS } from './index';
import { GURU } from './guru';

describe('status-map/guru (spec 021)', () => {
  it('registrado em MAPAS_STATUS para as duas contas, apontando para o mesmo objeto', () => {
    expect(MAPAS_STATUS.GURU_PRD).toBe(GURU);
    expect(MAPAS_STATUS.GURU_SVC).toBe(GURU);
  });

  const S = StatusTransacaoCanonico;
  const casos: Array<[string, string, string, StatusTransacaoCanonico]> = [
    ['GURU_PRD', 'guru.webhook', 'approved', S.PAGO],
    ['GURU_PRD', 'guru.webhook', 'completed', S.PAGO],
    ['GURU_PRD', 'guru.webhook', 'waiting_payment', S.PENDENTE],
    ['GURU_PRD', 'guru.webhook', 'pending', S.PENDENTE],
    ['GURU_PRD', 'guru.webhook', 'billet_printed', S.PENDENTE],
    ['GURU_PRD', 'guru.webhook', 'processing', S.PENDENTE],
    ['GURU_PRD', 'guru.webhook', 'analysis', S.PENDENTE],
    ['GURU_PRD', 'guru.webhook', 'charging', S.PENDENTE],
    ['GURU_PRD', 'guru.webhook', 'delayed', S.EM_ATRASO],
    ['GURU_PRD', 'guru.webhook', 'in_recovery', S.EM_ATRASO],
    ['GURU_PRD', 'guru.webhook', 'refunded', S.ESTORNADO],
    ['GURU_PRD', 'guru.webhook', 'dispute', S.ESTORNADO],
    ['GURU_PRD', 'guru.webhook', 'chargeback', S.CHARGEBACK],
    ['GURU_PRD', 'guru.webhook', 'canceled', S.CANCELADO],
    ['GURU_PRD', 'guru.webhook', 'expired', S.CANCELADO],
    ['GURU_PRD', 'guru.webhook', 'rejected', S.RECUSADO],
    ['GURU_PRD', 'guru.webhook', 'failed', S.RECUSADO],
    ['GURU_PRD', 'guru.webhook', 'blocked', S.RECUSADO],
    ['GURU_SVC', 'guru.api', 'refunded', S.ESTORNADO],
    ['GURU_SVC', 'guru.csv', 'approved', S.PAGO],
  ];

  it.each(casos)(
    'mapearStatus(%s, %s, %s) → %s sem revisão',
    (plataforma, fonte, bruto, esperado) => {
      const r = mapearStatus(plataforma, fonte, bruto);
      expect(r.status).toBe(esperado);
      expect(r.revisar).toBe(false);
    },
  );

  it('bruto fora do mapa (trial) → DESCONHECIDO + revisar', () => {
    const r = mapearStatus('GURU_PRD', 'guru.webhook', 'trial');
    expect(r.status).toBe(StatusTransacaoCanonico.DESCONHECIDO);
    expect(r.revisar).toBe(true);
  });

  it('não normaliza caixa (Regra nº 15 / gambiarra 4.4)', () => {
    expect(mapearStatus('GURU_PRD', 'guru.webhook', 'Approved').revisar).toBe(true);
  });

  it('todo status do mapa aparece em alguma fixture real dos parsers', () => {
    const dir = join(__dirname, '../../../ingestao/adapters/guru/fixtures');
    const blob = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    const declarados = new Set(Object.values(GURU).flatMap((m) => Object.keys(m)));
    for (const bruto of declarados) {
      expect(blob).toContain(`"${bruto}"`);
    }
  });
});
