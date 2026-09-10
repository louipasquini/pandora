import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './parse-linha-csv';

const CSV = readFileSync(
  join(__dirname, 'fixtures', 'export-pedidos.csv'),
  'utf8',
);

describe('parseCsv (spec 019 — fixture real)', () => {
  it('detecta separador ";", tira BOM, respeita aspas', () => {
    const rs = parseCsv(CSV);
    // 5 linhas de dado no fixture (1 sem pedido_id)
    expect(rs).toHaveLength(5);

    const ok = rs.filter((r) => r.eventoCanonico);
    expect(ok).toHaveLength(4);
    expect(ok[0].tipoOrigem).toBe('tmb.csv');
    expect(ok[0].idOrigem).toBe('502001');
    expect(ok[0].eventoCanonico?.statusOrigem).toBe('Efetivado');
    expect(ok[0].eventoCanonico?.comprador?.nome).toBe('Lopes, Mariana'); // aspas com ";" dentro
    expect(ok[0].eventoCanonico?.comprador?.endereco?.logradouro).toBe('Rua das Acácias, 1200');
    expect(ok[0].eventoCanonico?.valores?.bruto).toEqual({
      valorInteiro: 42000000n,
      moeda: 'BRL',
    });
  });

  it('linha sem pedido_id → erro com número da linha, sem eventoCanonico', () => {
    const rs = parseCsv(CSV);
    const ruim = rs.find((r) => !r.eventoCanonico)!;
    expect(ruim.erros.join(' ')).toMatch(/linha \d+: sem identificador de pedido/);
  });

  it('separador "," também funciona', () => {
    const csv = 'pedido_id,status_pedido,valor_principal\n999,Efetivado,100.00\n';
    const rs = parseCsv(csv);
    expect(rs).toHaveLength(1);
    expect(rs[0].eventoCanonico?.idOrigem).toBe('999');
  });

  it('cabeçalho sem coluna de pedido → toda linha vira erro, não lança', () => {
    const csv = 'nome;valor\nFulano;10\n';
    expect(() => parseCsv(csv)).not.toThrow();
    const rs = parseCsv(csv);
    expect(rs).toHaveLength(1);
    expect(rs[0].eventoCanonico).toBeUndefined();
  });

  it('conteúdo só com cabeçalho → []', () => {
    expect(parseCsv('pedido_id;status_pedido')).toEqual([]);
  });
});
