import { validarSchemaColunas } from './schema-colunas';
import { parseDataCivil, SCHEMA_LANCAMENTOS_CSV } from './schema-lancamentos';

describe('SCHEMA_LANCAMENTOS_CSV', () => {
  it('exige as 4 colunas', () => {
    expect(
      validarSchemaColunas(['produto_codigo', 'rotulo', 'inicio'], SCHEMA_LANCAMENTOS_CSV).ok,
    ).toBe(false);
    expect(
      validarSchemaColunas(
        ['produto_codigo', 'rotulo', 'inicio', 'fim'],
        SCHEMA_LANCAMENTOS_CSV,
      ).ok,
    ).toBe(true);
  });
});

describe('parseDataCivil', () => {
  it('parseia YYYY-MM-DD', () => {
    const d = parseDataCivil('2026-10-01');
    expect(d?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('formato inválido -> null', () => {
    expect(parseDataCivil('01/10/2026')).toBeNull();
    expect(parseDataCivil('lixo')).toBeNull();
    expect(parseDataCivil(undefined)).toBeNull();
  });
});
