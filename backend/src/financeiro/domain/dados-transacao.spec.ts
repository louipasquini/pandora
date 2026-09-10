import { Dinheiro, eventoCanonicoSchema } from '../../core/core.module';
import { extrairCanonicos } from './dados-transacao';

function canonico(over: Record<string, unknown> = {}) {
  return eventoCanonicoSchema.parse({
    plataformaOrigem: 'GURU_PRD',
    idOrigem: 'txn_1',
    tipoOrigem: 'guru.webhook',
    statusOrigem: 'PAGO',
    ocorridoEm: '2026-08-30T14:02:00Z',
    ...over,
  });
}

describe('financeiro/domain · extrairCanonicos', () => {
  it('canonico null → tudo null/false', () => {
    expect(extrairCanonicos(null)).toEqual({
      valorBruto: null,
      valorLiquido: null,
      taxas: null,
      reembolso: null,
      quantidade: null,
      ehRecorrencia: false,
      assinaturaCiclo: null,
      numeroCiclo: null,
      ofertaCodigoOrigem: null,
      ofertaNomeOrigem: null,
    });
  });

  it('valores por moeda viram Dinheiro (escala ×10000)', () => {
    const d = extrairCanonicos(
      canonico({
        valores: {
          bruto: { valorInteiro: '19700000', moeda: 'BRL' },
          liquido: { valorInteiro: 18500000, moeda: 'BRL' },
        },
      }),
    );
    expect(d.valorBruto).toBeInstanceOf(Dinheiro);
    expect(d.valorBruto?.valorInt).toBe(19700000n);
    expect(d.valorBruto?.moeda).toBe('BRL');
    expect(d.valorLiquido?.valorInt).toBe(18500000n);
    expect(d.taxas).toBeNull();
  });

  it('assinatura → ehRecorrencia + ciclo/numeroCiclo', () => {
    const d = extrairCanonicos(
      canonico({ assinatura: { ehRecorrencia: true, ciclo: 'mensal', numeroCiclo: 3 } }),
    );
    expect(d.ehRecorrencia).toBe(true);
    expect(d.assinaturaCiclo).toBe('mensal');
    expect(d.numeroCiclo).toBe(3);
  });

  it('numeroCiclo > 1 sozinho já marca ehRecorrencia', () => {
    expect(extrairCanonicos(canonico({ assinatura: { numeroCiclo: 2 } })).ehRecorrencia).toBe(
      true,
    );
  });

  it('oferta → códigos crus + quantidade', () => {
    const d = extrairCanonicos(
      canonico({ oferta: { codigoOrigem: 'PCS48XAV', nomeOrigem: '[#PCS48XAV] ...', quantidade: 2 } }),
    );
    expect(d.ofertaCodigoOrigem).toBe('PCS48XAV');
    expect(d.ofertaNomeOrigem).toBe('[#PCS48XAV] ...');
    expect(d.quantidade).toBe(2);
  });
});
