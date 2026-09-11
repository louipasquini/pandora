# Contrato HTTP: Catálogo (`produto`/`oferta`)

Todas as rotas exigem JWT válido (`JwtAuthGuard`, spec 003) + a permissão indicada
(`PermissionGuard`, spec 004). Credencial de serviço tem o catálogo inteiro.

## Produtos

### `GET /produtos`

`produto:ver`. Query: `q` (busca em `codigo`/nome efetivo), `page`, `pageSize` (default 25,
teto 100). Resposta: `{ items: ProdutoResumo[], total, page, pageSize }`.

### `GET /produtos/:codigo`

`produto:ver`. `codigo` case-insensitive, normalizado para maiúsculo. 404 se não existe.
Resposta inclui `nome`/`assinatura` efetivos + os pares curado/derivado + `camposEditados` +
lista resumida de ofertas do produto.

### `PUT /produtos/:codigo`

`produto:editar`. Body: `{ nome?: string, assinatura?: boolean }`. Upsert — cria o produto se
`codigo` (3 letras maiúsculas, validado) ainda não existe (caso raro: curar antes de qualquer
venda). Cada campo enviado marca `camposEditados` (D-07) e gera 1 `catalogo_audit` por campo
que efetivamente mudou. `codigo` mal formatado (não 3 letras) → 422.

## Ofertas

### `GET /ofertas`

`oferta:ver`. Query: `produtoId?`, `produtoCodigo?`, `plataformaOrigem?`, `page`, `pageSize`.
Resposta: `{ items: OfertaResumo[], total, page, pageSize }` — cada item inclui turma efetiva,
tag(s) associadas (`oferta_origem_ref`), e se tem `oferta_catalogo`.

### `GET /ofertas/:id`

`oferta:ver`. 404 se não existe. Inclui produto resumido, todos os campos curado/derivado/
efetivo, `oferta_origem_ref[]`, e `oferta_catalogo` completo (com `bonus[]`/`combo[]`) se
existir.

### `POST /ofertas`

`oferta:criar`. Body: `{ produtoId: uuid, turma?: {...}, subprodutoCodigo?, modeloCobrancaCodigo?,
modeloTransacaoCodigo?, origemRef?: { plataformaOrigem, tipoRef, valorRef } }`. Cria uma
oferta manualmente (caso raro — a maioria nasce auto-criada pela ingestão). `produtoId`
inexistente → 404. `origemRef` colidindo com `@@unique` existente → 409.

### `PATCH /ofertas/:id`

`oferta:editar`. Body parcial: campos curáveis de `oferta` (marcam `camposEditados`) +
opcionalmente `catalogo: { ticket?, precoTabela?, tempoAcessoDias?, combo?, lancamento?,
bonus?: string[], produtosDoComboIds?: uuid[] }` — grava/atualiza `oferta_catalogo` +
substitui a lista de bônus/combo por completo (semântica de substituição total, como o
`PUT /crm/leads/:id/campos-personalizados` da spec 008). `produtoId` novo apontando pra
produto inexistente → 404; tentativa que colidiria com `@@unique` de `oferta_origem_ref` →
409. Cada campo alterado gera 1 `catalogo_audit`.

## Erros comuns

- `401` sem token / token inválido.
- `403` autenticado sem a permissão exigida.
- `404` recurso não encontrado (produto/oferta/produto do combo).
- `409` colisão de unicidade (`oferta_origem_ref`).
- `422` payload malformado (schema zod do DTO).
