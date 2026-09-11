import { validarSchemaColunas } from './schema-colunas';
import { paraBooleano, SCHEMA_PRODUTOS_CSV } from './schema-produtos';

describe('SCHEMA_PRODUTOS_CSV', () => {
  it('exige a coluna codigo', () => {
    expect(validarSchemaColunas(['nome'], SCHEMA_PRODUTOS_CSV).ok).toBe(false);
    expect(validarSchemaColunas(['codigo', 'nome'], SCHEMA_PRODUTOS_CSV).ok).toBe(true);
  });
});

describe('paraBooleano', () => {
  it.each(['sim', 'true', '1', 'yes', 'SIM'])('%s -> true', (t) => {
    expect(paraBooleano(t)).toBe(true);
  });
  it.each(['nao', 'não', 'false', '0', 'no'])('%s -> false', (t) => {
    expect(paraBooleano(t)).toBe(false);
  });
  it('texto não reconhecido -> undefined', () => {
    expect(paraBooleano('talvez')).toBeUndefined();
  });
  it('ausente -> undefined', () => {
    expect(paraBooleano(undefined)).toBeUndefined();
  });
});
