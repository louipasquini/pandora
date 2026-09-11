import { StatusContratoCanonico } from '@prisma/client';
import { statusDoContrato } from './status-contrato';

const AGORA = new Date('2026-06-15T00:00:00Z');

describe('statusDoContrato', () => {
  it('sem fimAcesso nunca teve aditivo que concedesse acesso -> DESCONHECIDO', () => {
    const r = statusDoContrato({
      fimAcesso: null,
      toleranciaAtrasoDias: 0,
      ajusteManual: null,
      agora: AGORA,
    });
    expect(r.statusCanonico).toBe(StatusContratoCanonico.DESCONHECIDO);
    expect(r.acessoLiberado).toBe(false);
  });

  it('agora dentro do fimAcesso -> ATIVO', () => {
    const r = statusDoContrato({
      fimAcesso: new Date('2026-07-01T00:00:00Z'),
      toleranciaAtrasoDias: 0,
      ajusteManual: null,
      agora: AGORA,
    });
    expect(r.statusCanonico).toBe(StatusContratoCanonico.ATIVO);
    expect(r.acessoLiberado).toBe(true);
  });

  it('agora depois do fimAcesso -> EXPIRADO', () => {
    const r = statusDoContrato({
      fimAcesso: new Date('2026-06-01T00:00:00Z'),
      toleranciaAtrasoDias: 0,
      ajusteManual: null,
      agora: AGORA,
    });
    expect(r.statusCanonico).toBe(StatusContratoCanonico.EXPIRADO);
    expect(r.acessoLiberado).toBe(false);
  });

  it('tolerância de atraso estende a janela de ATIVO além do fimAcesso', () => {
    const r = statusDoContrato({
      fimAcesso: new Date('2026-06-10T00:00:00Z'),
      toleranciaAtrasoDias: 7,
      ajusteManual: null,
      agora: AGORA, // 15/06, dentro dos +7 dias a partir de 10/06
    });
    expect(r.statusCanonico).toBe(StatusContratoCanonico.ATIVO);
  });

  it('ajuste manual vigente vence sobre o fimAcesso, mesmo já expirado', () => {
    const r = statusDoContrato({
      fimAcesso: new Date('2020-01-01T00:00:00Z'),
      toleranciaAtrasoDias: 0,
      ajusteManual: { status: StatusContratoCanonico.ATIVO },
      agora: AGORA,
    });
    expect(r.statusCanonico).toBe(StatusContratoCanonico.ATIVO);
    expect(r.viaAjusteManual).toBe(true);
  });

  it('ajuste manual CANCELADO vence mesmo com fimAcesso no futuro', () => {
    const r = statusDoContrato({
      fimAcesso: new Date('2099-01-01T00:00:00Z'),
      toleranciaAtrasoDias: 0,
      ajusteManual: { status: StatusContratoCanonico.CANCELADO },
      agora: AGORA,
    });
    expect(r.statusCanonico).toBe(StatusContratoCanonico.CANCELADO);
    expect(r.acessoLiberado).toBe(false);
  });
});
