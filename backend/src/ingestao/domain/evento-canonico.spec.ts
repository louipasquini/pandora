import { eventoCanonicoSchema } from './evento-canonico';

const base = {
  plataformaOrigem: 'GURU_PRD',
  idOrigem: 'txn_1',
  tipoOrigem: 'webhook_venda',
  statusOrigem: 'approved',
  ocorridoEm: '2026-09-03T12:00:00Z',
};

describe('EventoCanonico schema (spec 006)', () => {
  it('aceita o núcleo obrigatório mínimo', () => {
    const r = eventoCanonicoSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('aceita opcionais (comprador, valores, assinatura) e normaliza Dinheiro p/ bigint', () => {
    const r = eventoCanonicoSchema.safeParse({
      ...base,
      comprador: { nome: 'Fulana', emails: ['a@x.com'] },
      valores: { bruto: { valorInteiro: '199000', moeda: 'BRL' } },
      assinatura: { ehRecorrencia: true },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.valores?.bruto?.valorInteiro).toBe(199000n);
  });

  it('rejeita plataformaOrigem fora do enum', () => {
    expect(eventoCanonicoSchema.safeParse({ ...base, plataformaOrigem: 'XPTO' }).success).toBe(
      false,
    );
  });

  it('rejeita idOrigem vazio', () => {
    expect(eventoCanonicoSchema.safeParse({ ...base, idOrigem: '' }).success).toBe(false);
  });

  it('rejeita Dinheiro sem moeda ou com moeda inválida', () => {
    expect(
      eventoCanonicoSchema.safeParse({
        ...base,
        valores: { bruto: { valorInteiro: 100 } },
      }).success,
    ).toBe(false);
    expect(
      eventoCanonicoSchema.safeParse({
        ...base,
        valores: { bruto: { valorInteiro: 100, moeda: 'XXX' } },
      }).success,
    ).toBe(false);
  });

  it('aceita ocorridoEm "lixo" (o parse tolerante é a jusante)', () => {
    expect(eventoCanonicoSchema.safeParse({ ...base, ocorridoEm: 'ontem' }).success).toBe(
      true,
    );
  });

  it('rejeita chave desconhecida (strict)', () => {
    expect(eventoCanonicoSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
