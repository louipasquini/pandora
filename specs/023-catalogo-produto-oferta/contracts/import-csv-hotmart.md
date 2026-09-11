# Contrato: Import do catálogo Hotmart (CSV)

3 endpoints, todos sob `oferta:editar` (mesma permissão de curadoria — importar catálogo é
uma forma de curadoria em lote; nenhuma permissão nova só para isso). CSV trafega como
**texto simples no corpo JSON** (`{ csv: string }`), mesmo padrão de upload das specs
015/019–022 — 0 dependência de upload binário.

## `POST /catalogo/hotmart/importar-produtos`

Body: `{ csv: string }`. Valida o schema de colunas (`data-model.md`) **por completo** antes
de processar qualquer linha — coluna faltando/renomeada → `422 { erro: 'schema_invalido',
colunasEsperadas, colunasEncontradas }`, 0 escrita. Linha válida → upsert de `produto` por
`codigo` (só atualiza campos **derivados**; nunca sobrescreve `camposEditados` — D-07).
Resposta: `200 { processadas, criadas, atualizadas, ignoradas }`.

## `POST /catalogo/hotmart/importar-ofertas`

Body: `{ csv: string }`. Mesma validação de schema atômica. Cada linha:
- sem `price_code` → conta em `ignoradas`, não interrompe o arquivo (D-12/FR-015);
- `produto_codigo` não resolve a nenhum `produto` existente → cria o `produto` (auto-create,
  D-05) antes de seguir;
- upsert de `oferta` por `oferta_origem_ref(plataforma da conta importadora, 'HOTMART_PRICE_CODE',
  price_code)` — **a importação é sempre feita no contexto de uma conta** (`HOTMART_PRD` ou
  `HOTMART_SVC`, no corpo: `{ csv, conta: 'HOTMART_PRD' | 'HOTMART_SVC' }`), já que a mesma
  oferta pode ter `price_code`s diferentes entre as duas contas Hotmart;
- se a coluna `tag` estiver presente, também grava `oferta_origem_ref(conta, 'TAG', tag)` —
  informativo, não usado na resolução em tempo de venda (Hotmart nunca resolve por tag,
  D-03), mas útil pra cross-referenciar com a oferta irmã de outra plataforma na tela de
  curadoria.
Resposta: `200 { processadas, criadas, atualizadas, ignoradas }`.

## `POST /catalogo/hotmart/importar-lancamentos`

Body: `{ csv: string }`. Cada linha cria/atualiza `janela_lancamento` (upsert por
`(produtoId, rotulo)`). `produto_codigo` que não resolve a nenhum produto existente → linha
ignorada (contabilizada), **não** cria produto (lançamento pressupõe produto já conhecido).
`inicio >= fim` → linha ignorada. Resposta: `200 { processadas, criadas, atualizadas, ignoradas }`.

## Erros comuns

- `401`/`403` — auth/RBAC padrão.
- `422 { erro: 'schema_invalido', ... }` — schema de colunas não bate (D-12), nenhuma linha
  processada.
- `422 { erro: 'csv_vazio' }` — corpo sem nenhuma linha de dado.
