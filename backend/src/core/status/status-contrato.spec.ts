import {
  contratoLiberaAcesso,
  STATUS_CONTRATO_CANONICO,
  StatusContratoCanonico,
} from './status-contrato';

describe('StatusContratoCanonico', () => {
  it('tem exatamente os 4 valores canônicos', () => {
    expect([...STATUS_CONTRATO_CANONICO]).toEqual([
      'ATIVO',
      'EXPIRADO',
      'CANCELADO',
      'DESCONHECIDO',
    ]);
    expect(Object.isFrozen(STATUS_CONTRATO_CANONICO)).toBe(true);
  });

  it('só ATIVO libera acesso', () => {
    expect(contratoLiberaAcesso(StatusContratoCanonico.ATIVO)).toBe(true);
    expect(contratoLiberaAcesso(StatusContratoCanonico.EXPIRADO)).toBe(false);
    expect(contratoLiberaAcesso(StatusContratoCanonico.CANCELADO)).toBe(false);
    expect(contratoLiberaAcesso(StatusContratoCanonico.DESCONHECIDO)).toBe(false);
  });

  it('cobre todos os valores do enum', () => {
    for (const s of STATUS_CONTRATO_CANONICO) {
      expect(typeof contratoLiberaAcesso(s)).toBe('boolean');
    }
  });
});
