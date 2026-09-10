import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsvGuru } from './parse-linha-csv';

const csv = readFileSync(join(__dirname, 'fixtures/export-vendas.csv'), 'utf8');

describe('parseCsvGuru (spec 021 — fixture real)', () => {
  it('detecta separador ";", tira BOM, respeita aspas com ";" dentro', () => {
    const rs = parseCsvGuru(csv, 'GURU_PRD');
    expect(rs).toHaveLength(6);
    const primeira = rs[0].eventoCanonico!;
    expect(primeira.plataformaOrigem).toBe('GURU_PRD');
    expect(primeira.idOrigem).toBe('9081534a-7512-4dab-9172-218c1dc1c001');
    expect(primeira.oferta?.nomeOrigem).toBe('Curso NMX; turma anual');
    expect(primeira.oferta?.codigoOrigem).toBe('of_nmx_anual');
    expect(primeira.valores?.bruto).toEqual({ valorInteiro: 4970000n, moeda: 'BRL' });
    expect(primeira.comprador?.nome).toBe('Marta Nogueira');
    expect(primeira.comprador?.documentos).toEqual(['39053344705']);
    expect(primeira.statusOrigem).toBe('approved');
  });

  it('linha sem id → erro por linha, não aborta o lote', () => {
    const rs = parseCsvGuru(csv, 'GURU_PRD');
    const semId = rs[3];
    expect(semId.eventoCanonico).toBeUndefined();
    expect(semId.erros).toEqual(['linha 5: sem identificador de transação']);
    // as demais seguem válidas
    expect(rs[4].eventoCanonico?.idOrigem).toBe('9081534a-7512-4dab-9172-218c1dc1c005');
  });

  it('coluna assinatura "sim" + ciclo → assinatura { ehRecorrencia, numeroCiclo }', () => {
    const rs = parseCsvGuru(csv, 'GURU_PRD');
    expect(rs[4].eventoCanonico?.assinatura).toEqual({
      ehRecorrencia: true,
      numeroCiclo: 3,
    });
  });

  it('coluna moeda USD respeitada; tipo "affiliate" → ehAfiliada', () => {
    const rs = parseCsvGuru(csv, 'GURU_PRD');
    const usd = rs[5].eventoCanonico!;
    expect(usd.valores?.bruto?.moeda).toBe('USD');
    expect(usd.ehAfiliada).toBe(true);
  });

  it('cabeçalho sem coluna de id → todas as linhas viram erro, não lança', () => {
    const semIdHeader = 'status;valor_bruto\napproved;100.00\napproved;200.00';
    const rs = parseCsvGuru(semIdHeader, 'GURU_PRD');
    expect(rs).toHaveLength(2);
    expect(rs.every((r) => r.eventoCanonico === undefined)).toBe(true);
  });

  it('conteúdo só com cabeçalho → []', () => {
    expect(parseCsvGuru('id;status', 'GURU_PRD')).toEqual([]);
  });
});
