import { validarMovimento, type EtapaRef } from './movimentacao';

describe('validarMovimento (spec 010)', () => {
  const aberta: EtapaRef = { id: 'e1', pipelineId: 'p1', tipo: 'ABERTA' };
  const aberta2: EtapaRef = { id: 'e2', pipelineId: 'p1', tipo: 'ABERTA' };
  const perdida: EtapaRef = { id: 'e3', pipelineId: 'p1', tipo: 'PERDIDA' };
  const ganha: EtapaRef = { id: 'e4', pipelineId: 'p1', tipo: 'GANHA' };
  const outroPipeline: EtapaRef = { id: 'e5', pipelineId: 'p2', tipo: 'ABERTA' };

  it('etapa de outro pipeline é rejeitada', () => {
    const r = validarMovimento({ etapaAtual: aberta, etapaDestino: outroPipeline });
    expect(r).toEqual({ ok: false, erro: 'pipeline_diferente' });
  });

  it('mesma etapa é no-op', () => {
    const r = validarMovimento({ etapaAtual: aberta, etapaDestino: aberta });
    expect(r).toEqual({ ok: true, noop: true });
  });

  it('entrar em PERDIDA sem motivo é rejeitado', () => {
    const r = validarMovimento({ etapaAtual: aberta, etapaDestino: perdida });
    expect(r).toEqual({ ok: false, erro: 'motivo_obrigatorio' });
  });

  it('entrar em PERDIDA com motivo em branco é rejeitado', () => {
    const r = validarMovimento({ etapaAtual: aberta, etapaDestino: perdida, motivo: '   ' });
    expect(r).toEqual({ ok: false, erro: 'motivo_obrigatorio' });
  });

  it('entrar em PERDIDA com motivo sucede', () => {
    const r = validarMovimento({
      etapaAtual: aberta,
      etapaDestino: perdida,
      motivo: 'Optou por concorrente',
    });
    expect(r).toEqual({ ok: true, noop: false });
  });

  it('mover entre etapas ABERTA não exige motivo', () => {
    const r = validarMovimento({ etapaAtual: aberta, etapaDestino: aberta2 });
    expect(r).toEqual({ ok: true, noop: false });
  });

  it('reabrir de PERDIDA/GANHA para ABERTA não exige motivo', () => {
    expect(validarMovimento({ etapaAtual: perdida, etapaDestino: aberta })).toEqual({
      ok: true,
      noop: false,
    });
    expect(validarMovimento({ etapaAtual: ganha, etapaDestino: aberta })).toEqual({
      ok: true,
      noop: false,
    });
  });
});
