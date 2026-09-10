import { StatusTransacaoCanonico as PrismaEnum } from '@prisma/client';
import {
  STATUS_TRANSACAO_CANONICO,
  StatusTransacaoCanonico,
} from '../../core/core.module';
import { MAPAS_STATUS, mapearStatus } from './status-map';

describe('financeiro/domain · mapearStatus', () => {
  afterEach(() => {
    for (const k of Object.keys(MAPAS_STATUS)) delete MAPAS_STATUS[k];
  });

  it('valor canônico exato → sem revisão', () => {
    expect(mapearStatus('GURU_PRD', 'guru.webhook', 'PAGO')).toEqual({
      status: StatusTransacaoCanonico.PAGO,
      revisar: false,
    });
  });

  it('bruto desconhecido com mapa vazio → DESCONHECIDO + revisar + motivo', () => {
    const r = mapearStatus('GURU_PRD', 'guru.webhook', 'approved');
    expect(r.status).toBe(StatusTransacaoCanonico.DESCONHECIDO);
    expect(r.revisar).toBe(true);
    expect(r.motivo).toContain('não catalogado');
  });

  it('não faz lowercase/trim por conta própria', () => {
    expect(mapearStatus('GURU_PRD', 'x', ' PAGO ').status).toBe(
      StatusTransacaoCanonico.DESCONHECIDO,
    );
    expect(mapearStatus('GURU_PRD', 'x', 'pago').status).toBe(
      StatusTransacaoCanonico.DESCONHECIDO,
    );
  });

  it('consulta o mapa da fonte quando populado (specs 019–022)', () => {
    MAPAS_STATUS.GURU_PRD = {
      'guru.webhook': { approved: StatusTransacaoCanonico.PAGO },
    };
    expect(mapearStatus('GURU_PRD', 'guru.webhook', 'approved')).toEqual({
      status: StatusTransacaoCanonico.PAGO,
      revisar: false,
    });
    // fonte diferente → não casa
    expect(mapearStatus('GURU_PRD', 'guru.csv', 'approved').revisar).toBe(true);
  });

  it('null / número / objeto → DESCONHECIDO + revisar', () => {
    for (const v of [null, undefined, 42, {}]) {
      expect(mapearStatus('X', 'y', v).status).toBe(
        StatusTransacaoCanonico.DESCONHECIDO,
      );
    }
  });

  it('paridade: enum Prisma StatusTransacaoCanonico == enum do core', () => {
    expect([...Object.values(PrismaEnum)].sort()).toEqual(
      [...STATUS_TRANSACAO_CANONICO].sort(),
    );
  });
});
