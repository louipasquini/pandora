import type { ColunaSchema } from './schema-colunas';

/**
 * Colunas esperadas de `ofertas.csv` do catálogo Hotmart. `price_code` é
 * **obrigatória como coluna** (o arquivo é rejeitado por completo sem ela) —
 * mas uma **linha** sem valor em `price_code` é só ignorada, não derruba o
 * arquivo inteiro (spec 023, D-12/FR-015).
 */
export const SCHEMA_OFERTAS_CSV: readonly ColunaSchema[] = [
  {
    canonica: 'price_code',
    aliases: ['price_code', 'código_preço', 'codigo_preco', 'price.code'],
    obrigatoria: true,
  },
  {
    canonica: 'produto_codigo',
    aliases: ['produto_codigo', 'produto', 'codigo_produto', 'código_produto'],
    obrigatoria: true,
  },
  { canonica: 'tag', aliases: ['tag', 'tag_aen'], obrigatoria: false },
  { canonica: 'nome', aliases: ['nome', 'nome_oferta'], obrigatoria: false },
];
