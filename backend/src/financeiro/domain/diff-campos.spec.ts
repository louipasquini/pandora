import { Dinheiro } from '../../core/core.module';
import { camposAlterados } from './diff-campos';
import type { SnapshotTransacao } from './dados-transacao';

function snap(over: Partial<SnapshotTransacao> = {}): SnapshotTransacao {
  return {
    statusCanonico: 'PAGO',
    classificacao: 'VENDA_PROPRIA',
    ocorridoEm: new Date('2026-08-30T14:02:00Z'),
    pessoaId: 'p1',
    ehAfiliada: false,
    valorBruto: Dinheiro.deInteiroEscalado(19700000n, 'BRL'),
    valorLiquido: null,
    taxas: null,
    reembolso: null,
    quantidade: 1,
    ehRecorrencia: false,
    assinaturaCiclo: null,
    numeroCiclo: null,
    ofertaCodigoOrigem: 'PCS48XAV',
    ofertaNomeOrigem: null,
    ...over,
  };
}

describe('financeiro/domain · camposAlterados', () => {
  it('sem anterior (criação) → campos preenchidos', () => {
    const c = camposAlterados(null, snap());
    expect(c).toEqual(
      expect.arrayContaining([
        'statusCanonico',
        'classificacao',
        'ocorridoEm',
        'pessoaId',
        'valorBruto',
        'quantidade',
        'ofertaCodigoOrigem',
      ]),
    );
    expect(c).not.toContain('ehAfiliada'); // false não conta como preenchido
    expect(c).not.toContain('valorLiquido');
  });

  it('nada mudou → []', () => {
    expect(camposAlterados(snap(), snap())).toEqual([]);
  });

  it('só o valor bruto mudou → ["valorBruto"]', () => {
    const antes = snap();
    const depois = snap({ valorBruto: Dinheiro.deInteiroEscalado(20000000n, 'BRL') });
    expect(camposAlterados(antes, depois)).toEqual(['valorBruto']);
  });

  it('mesma quantia, moeda diferente → mudou', () => {
    const antes = snap({ valorBruto: Dinheiro.deInteiroEscalado(100n, 'BRL') });
    const depois = snap({ valorBruto: Dinheiro.deInteiroEscalado(100n, 'USD') });
    expect(camposAlterados(antes, depois)).toEqual(['valorBruto']);
  });

  it('ocorridoEm compara instante; null ↔ Date conta como mudança', () => {
    expect(camposAlterados(snap(), snap({ ocorridoEm: null }))).toEqual(['ocorridoEm']);
    expect(
      camposAlterados(
        snap({ ocorridoEm: new Date('2026-01-01T00:00:00Z') }),
        snap({ ocorridoEm: new Date('2026-01-01T00:00:00.000Z') }),
      ),
    ).toEqual([]);
  });

  it('pessoaId null → preenchido → mudança', () => {
    expect(camposAlterados(snap(), snap({ pessoaId: null }))).toEqual(['pessoaId']);
  });
});
