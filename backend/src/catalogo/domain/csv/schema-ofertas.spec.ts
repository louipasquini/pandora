import { validarSchemaColunas } from './schema-colunas';
import { SCHEMA_OFERTAS_CSV } from './schema-ofertas';

describe('SCHEMA_OFERTAS_CSV', () => {
  it('exige price_code e produto_codigo', () => {
    expect(validarSchemaColunas(['tag'], SCHEMA_OFERTAS_CSV).ok).toBe(false);
    expect(
      validarSchemaColunas(['price_code', 'produto_codigo'], SCHEMA_OFERTAS_CSV).ok,
    ).toBe(true);
  });

  it('aceita alias "price.code"', () => {
    const r = validarSchemaColunas(['price.code', 'produto'], SCHEMA_OFERTAS_CSV);
    expect(r.ok).toBe(true);
    expect(r.indice).toEqual({ price_code: 0, produto_codigo: 1 });
  });

  it('tag/nome são opcionais', () => {
    const r = validarSchemaColunas(['price_code', 'produto_codigo'], SCHEMA_OFERTAS_CSV);
    expect(r.colunasFaltando).toEqual([]);
  });
});
