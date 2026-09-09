import { resolverDestinatarios } from './resolver-destinatarios';

describe('resolverDestinatarios', () => {
  it('deduplica o mesmo telefone entre segmento e CSV', () => {
    const r = resolverDestinatarios({
      segmento: [{ telefone: '+5511999990000', leadId: 'lead-1' }],
      csv: [{ telefone: '+5511999990000', nome: 'Fulano' }],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ telefone: '+5511999990000', pessoaId: null, leadId: 'lead-1' });
  });

  it('deduplica telefone repetido dentro do próprio CSV', () => {
    const r = resolverDestinatarios({
      csv: [
        { telefone: '+5511999990001' },
        { telefone: '+5511999990001' },
        { telefone: '+5511999990002' },
      ],
    });
    expect(r.map((d) => d.telefone).sort()).toEqual(['+5511999990001', '+5511999990002']);
  });

  it('nenhuma fonte → lista vazia', () => {
    expect(resolverDestinatarios({})).toEqual([]);
  });

  it('descarta telefone vazio', () => {
    const r = resolverDestinatarios({ csv: [{ telefone: '' }, { telefone: '  ' }] });
    expect(r).toEqual([]);
  });

  it('segmento com pessoa e CSV com o mesmo telefone: mantém o dado do segmento (1ª fonte)', () => {
    const r = resolverDestinatarios({
      segmento: [{ telefone: '+5511999990003', pessoaId: 'pessoa-1' }],
      csv: [{ telefone: '+5511999990003', leadId: 'lead-2' }],
    });
    expect(r).toEqual([{ telefone: '+5511999990003', pessoaId: 'pessoa-1', leadId: null }]);
  });
});
