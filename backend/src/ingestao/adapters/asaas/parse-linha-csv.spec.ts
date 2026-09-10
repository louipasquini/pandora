import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsvAsaas } from './parse-linha-csv';

const CSV = readFileSync(join(__dirname, 'fixtures/export-cobrancas.csv'), 'utf8');

describe('parseCsvAsaas (spec 020 — fixture real)', () => {
  it('detecta separador ";", tira BOM, respeita aspas; 6 linhas de dado', () => {
    const rs = parseCsvAsaas(CSV, 'ASAAS_PRD');
    expect(rs).toHaveLength(6);
  });

  it('linha 1 → EventoCanonico asaas.csv com comprador montado das colunas', () => {
    const rs = parseCsvAsaas(CSV, 'ASAAS_PRD');
    const ec = rs[0].eventoCanonico!;
    expect(ec.plataformaOrigem).toBe('ASAAS_PRD');
    expect(ec.idOrigem).toBe('pay_c1000000000000000001');
    expect(ec.tipoOrigem).toBe('asaas.csv');
    expect(ec.statusOrigem).toBe('RECEIVED');
    expect(ec.valores?.bruto).toEqual({ valorInteiro: 2500000n, moeda: 'BRL' });
    expect(ec.valores?.liquido).toEqual({ valorInteiro: 2411300n, moeda: 'BRL' });
    expect(ec.oferta?.nomeOrigem).toBe('Curso rapido; modulo 1'); // aspas com ;
    expect(ec.comprador?.nome).toBe('Ana Paula Souza');
    expect(ec.comprador?.emails).toEqual(['ana.souza@asaas-e2e.invalid']);
    expect(ec.comprador?.documentos).toEqual(['99900011122']);
    expect(ec.comprador?.telefones).toEqual(['+5511911112222']);
  });

  it('linha com subscription + externalReference (conta CNPJ)', () => {
    const rs = parseCsvAsaas(CSV, 'ASAAS_SVC');
    const ec = rs[1].eventoCanonico!;
    expect(ec.assinatura).toEqual({ ehRecorrencia: true });
    expect(ec.referenciaExterna).toEqual({ idOrigem: 'guru-tx-zzz999' });
  });

  it('linha sem id → erro por linha, sem eventoCanonico; demais processadas', () => {
    const rs = parseCsvAsaas(CSV, 'ASAAS_PRD');
    const semId = rs[5];
    expect(semId.eventoCanonico).toBeUndefined();
    expect(semId.erros.join(' ')).toMatch(/linha 7: sem identificador de cobrança/);
    expect(rs.filter((r) => r.eventoCanonico).length).toBe(5);
  });

  it('cabeçalho sem coluna de id → todas as linhas em erro, não lança', () => {
    const rs = parseCsvAsaas('status;value\nRECEIVED;10.00\nPENDING;20.00', 'ASAAS_PRD');
    expect(rs).toHaveLength(2);
    expect(rs.every((r) => r.eventoCanonico === undefined)).toBe(true);
  });

  it('conteúdo só com cabeçalho → []', () => {
    expect(parseCsvAsaas('id;status', 'ASAAS_PRD')).toEqual([]);
  });
});
