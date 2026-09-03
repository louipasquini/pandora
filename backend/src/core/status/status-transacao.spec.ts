import {
  contaComoReceita,
  liberaAcesso,
  STATUS_TRANSACAO_CANONICO,
  StatusTransacaoCanonico,
} from './status-transacao';

describe('StatusTransacaoCanonico', () => {
  it('tem exatamente os 8 valores canônicos', () => {
    expect([...STATUS_TRANSACAO_CANONICO]).toEqual([
      'PENDENTE',
      'PAGO',
      'EM_ATRASO',
      'RECUSADO',
      'CANCELADO',
      'ESTORNADO',
      'CHARGEBACK',
      'DESCONHECIDO',
    ]);
    expect(Object.isFrozen(STATUS_TRANSACAO_CANONICO)).toBe(true);
  });

  // Tabela-verdade fixada em FR-021 / contracts/status-canonico.md
  const tabela: Array<[StatusTransacaoCanonico, boolean, boolean]> = [
    [StatusTransacaoCanonico.PAGO, true, true],
    [StatusTransacaoCanonico.PENDENTE, true, false],
    [StatusTransacaoCanonico.EM_ATRASO, true, false],
    [StatusTransacaoCanonico.RECUSADO, false, false],
    [StatusTransacaoCanonico.CANCELADO, false, false],
    [StatusTransacaoCanonico.ESTORNADO, false, false],
    [StatusTransacaoCanonico.CHARGEBACK, false, false],
    [StatusTransacaoCanonico.DESCONHECIDO, false, false],
  ];

  it.each(tabela)('%s → liberaAcesso=%s, contaComoReceita=%s', (status, acesso, receita) => {
    expect(liberaAcesso(status)).toBe(acesso);
    expect(contaComoReceita(status)).toBe(receita);
  });

  it('cobre todos os valores do enum (nenhum status sem definição)', () => {
    for (const s of STATUS_TRANSACAO_CANONICO) {
      expect(typeof liberaAcesso(s)).toBe('boolean');
      expect(typeof contaComoReceita(s)).toBe('boolean');
    }
    expect(tabela.map(([s]) => s).sort()).toEqual([...STATUS_TRANSACAO_CANONICO].sort());
  });

  it('DESCONHECIDO nunca libera acesso nem conta como receita', () => {
    expect(liberaAcesso(StatusTransacaoCanonico.DESCONHECIDO)).toBe(false);
    expect(contaComoReceita(StatusTransacaoCanonico.DESCONHECIDO)).toBe(false);
  });
});
