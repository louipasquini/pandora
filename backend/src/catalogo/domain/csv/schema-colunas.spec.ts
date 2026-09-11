import { leitorDeCampos, validarSchemaColunas, type ColunaSchema } from './schema-colunas';

const SCHEMA: ColunaSchema[] = [
  { canonica: 'codigo', aliases: ['codigo', 'código'], obrigatoria: true },
  { canonica: 'nome', aliases: ['nome'], obrigatoria: false },
];

describe('validarSchemaColunas', () => {
  it('ok quando toda coluna obrigatória está presente (por alias)', () => {
    const r = validarSchemaColunas(['código', 'nome'], SCHEMA);
    expect(r.ok).toBe(true);
    expect(r.indice).toEqual({ codigo: 0, nome: 1 });
    expect(r.colunasFaltando).toEqual([]);
  });

  it('coluna opcional ausente não impede ok', () => {
    const r = validarSchemaColunas(['codigo'], SCHEMA);
    expect(r.ok).toBe(true);
    expect(r.indice).toEqual({ codigo: 0 });
  });

  it('coluna obrigatória ausente -> ok=false, nomeada em colunasFaltando', () => {
    const r = validarSchemaColunas(['nome'], SCHEMA);
    expect(r.ok).toBe(false);
    expect(r.colunasFaltando).toEqual(['codigo']);
  });
});

describe('leitorDeCampos', () => {
  it('lê pelo nome canônico via o índice', () => {
    const g = leitorDeCampos(['PCS', 'Programa'], { codigo: 0, nome: 1 });
    expect(g('codigo')).toBe('PCS');
    expect(g('nome')).toBe('Programa');
  });

  it('undefined para coluna sem índice ou valor vazio', () => {
    const g = leitorDeCampos(['PCS', '  '], { codigo: 0, nome: 1 });
    expect(g('ausente')).toBeUndefined();
    expect(g('nome')).toBeUndefined();
  });
});
