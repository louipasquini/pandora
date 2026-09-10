import pagina from './fixtures/api-pedidos-pagina.json';
import { parsePedidoApi } from './parse-pedido-api';

const itens = (pagina as { itens: unknown[] }).itens;

describe('parsePedidoApi (spec 019 — fixture real)', () => {
  it('item da API → EventoCanonico tmb.api com nomes de campo da API', () => {
    const r = parsePedidoApi(itens[0]);
    expect(r.erros).toEqual([]);
    expect(r.tipoOrigem).toBe('tmb.api');
    expect(r.idOrigem).toBe('501010');
    const ec = r.eventoCanonico!;
    expect(ec.statusOrigem).toBe('Efetivado');
    expect(ec.ocorridoEm).toBe('2026-03-05T08:20:11.500000');
    expect(ec.comprador?.telefones).toEqual(['+5531988880000']);
    expect(ec.comprador?.endereco).toMatchObject({ uf: 'MG', cep: '30140-071', pais: 'BR' });
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 38000000n, moeda: 'BRL' });
  });

  it('item só com valor_total (sem valor_principal) usa valor_total como bruto', () => {
    const r = parsePedidoApi(itens[1]);
    expect(r.eventoCanonico?.valores?.bruto).toEqual({
      valorInteiro: 38000000n,
      moeda: 'BRL',
    });
  });

  it('item sem documento → comprador sem documentos, ainda resolve', () => {
    const r = parsePedidoApi(itens[2]);
    expect(r.eventoCanonico?.comprador?.documentos).toBeUndefined();
    expect(r.eventoCanonico?.comprador?.emails).toEqual(['beatriz.andrade@example.invalid']);
  });
});
