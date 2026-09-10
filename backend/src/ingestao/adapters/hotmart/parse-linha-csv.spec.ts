import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsvHotmart } from './parse-linha-csv';

const csv = readFileSync(join(__dirname, 'fixtures/export-vendas.csv'), 'utf8');

describe('parseCsvHotmart (spec 022 — fixture real, separador ;)', () => {
  const rs = parseCsvHotmart(csv, 'HOTMART_PRD');

  it('6 linhas de dado, separador ; detectado, BOM tolerado', () => {
    expect(rs).toHaveLength(6);
  });

  it('linha 1 → EventoCanonico completo com aspas contendo ; no nome da oferta', () => {
    const ec = rs[0].eventoCanonico!;
    expect(rs[0].idOrigem).toBe('HP12455690121001');
    expect(rs[0].tipoOrigem).toBe('hotmart.csv');
    expect(ec.plataformaOrigem).toBe('HOTMART_PRD');
    expect(ec.statusOrigem).toBe('APPROVED');
    expect(ec.ocorridoEm).toBe('2026-06-01');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 1506000n, moeda: 'BRL' });
    expect(ec.valores?.taxas).toEqual({ valorInteiro: 149000n, moeda: 'BRL' });
    expect(ec.oferta).toEqual({ codigoOrigem: 'k2pasun0', nomeOrigem: 'Curso NMX; turma anual' });
    expect(ec.comprador?.nome).toBe('Marta Nogueira');
    expect(ec.comprador?.documentos).toEqual(['39053344705']);
  });

  it('linha 2 sem valor_liquido/taxa → só bruto; ocorridoEm cai em data_pedido', () => {
    const ec = rs[1].eventoCanonico!;
    expect(ec.statusOrigem).toBe('WAITING_PAYMENT');
    expect(ec.ocorridoEm).toBe('2026-06-02');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 470000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toBeUndefined();
  });

  it('linha 4 sem id → ignorada com erro numerado, não aborta o lote', () => {
    expect(rs[3].eventoCanonico).toBeUndefined();
    expect(rs[3].erros).toContain('linha 5: sem identificador de transação');
  });

  it('linha 5 assinatura "sim" + ciclo 3 → RECORRENCIA', () => {
    expect(rs[4].eventoCanonico?.assinatura).toEqual({ ehRecorrencia: true, numeroCiclo: 3 });
  });

  it('linha 6 tipo AFFILIATE + moeda USD', () => {
    expect(rs[5].eventoCanonico?.ehAfiliada).toBe(true);
    expect(rs[5].eventoCanonico?.valores?.bruto?.moeda).toBe('USD');
  });

  it('cabeçalho sem coluna de id → toda linha vira erro, não lança', () => {
    const semId = parseCsvHotmart('status;valor\nAPPROVED;10', 'HOTMART_PRD');
    expect(semId[0].eventoCanonico).toBeUndefined();
    expect(semId[0].erros[0]).toContain('sem identificador de transação');
  });
});
