import pagina from './fixtures/api-transactions-pagina.json';
import { parseTransacaoApi } from './parse-transacao-api';

describe('parseTransacaoApi (spec 021 — fixture real)', () => {
  const itens = (pagina as { data: unknown[] }).data;

  it('cada item de data[] → EventoCanonico guru.api', () => {
    const rs = itens.map((i) => parseTransacaoApi(i, 'GURU_PRD'));
    expect(rs).toHaveLength(3);
    for (const r of rs) {
      expect(r.tipoOrigem).toBe('guru.api');
      expect(r.eventoCanonico?.plataformaOrigem).toBe('GURU_PRD');
    }
  });

  it('item sem payment.net usa só bruto', () => {
    const r = parseTransacaoApi(itens[1], 'GURU_PRD');
    expect(r.eventoCanonico?.valores?.bruto).toEqual({
      valorInteiro: 1490000n,
      moeda: 'BRL',
    });
    expect(r.eventoCanonico?.valores?.liquido).toBeUndefined();
  });

  it('item com currency USD → Dinheiro.moeda USD', () => {
    const r = parseTransacaoApi(itens[2], 'GURU_PRD');
    expect(r.eventoCanonico?.valores?.bruto?.moeda).toBe('USD');
    expect(r.eventoCanonico?.valores?.liquido?.moeda).toBe('USD');
  });

  it('conta é o parâmetro', () => {
    const r = parseTransacaoApi(itens[0], 'GURU_SVC');
    expect(r.eventoCanonico?.plataformaOrigem).toBe('GURU_SVC');
  });

  it('item não-objeto → erro sem lançar', () => {
    const r = parseTransacaoApi(42, 'GURU_PRD');
    expect(r.eventoCanonico).toBeUndefined();
    expect(r.erros).toContain('item não é objeto');
  });
});
