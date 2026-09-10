# Contract — Ingestão TMB sob demanda (autenticada)

Rotas autenticadas (`JwtAuthGuard` + `PermissionGuard`), permissão **já existente**
`evento:ingerir` (catálogo desde a 006). Sem permissão nova.

## `POST /ingestao/tmb/sincronizar`

Puxa `GET /api/pedidos` da TMB e registra cada pedido como evento `tmb.api`.

- **Body** (`zod`):
  ```jsonc
  {
    "dataInicio": "2026-03-01",   // opcional, YYYY-MM-DD
    "dataFinal":  "2026-03-31",   // opcional
    "produtoId":  123,             // opcional
    "pageSize":   50               // opcional, 1..200, default 50
  }
  ```
- **Pré-condição**: `TMB_API_BASE_URL` **e** `TMB_API_KEY` configurados. Ausente →
  `422 { "message": "conta TMB sem API configurada" }`, **0 evento**.
- **Fluxo**: pagina via `TmbApiClient.listarPedidos` (pageNumber 1..N) → `parsePedidoApi`
  cada item → `RegistrarEventoService.registrarEvento`. **Commit por página** (falha na
  página K não desfaz 1..K−1).
- **200**:
  ```json
  {
    "paginas": 2,
    "recebidos": 12,
    "novos": 12,
    "dedup": 0,
    "ignorados": 0,
    "erros": []
  }
  ```
  `erros` lista falhas de página (`"pagina 2: HTTP 500"`) — a resposta ainda é `200` com o
  parcial (US3 cenário 4). Re-disparar a mesma janela → `novos: 0` (dedup por hash).

## `POST /ingestao/tmb/importar-csv`

Registra cada linha de um export CSV como evento `tmb.csv`.

- **Body** (`zod`):
  ```jsonc
  {
    "conteudo": "pedido_id,status_pedido,cliente,...\n4321,Efetivado,...",
    "fonte": "tmb.csv"   // opcional, único valor aceito
  }
  ```
  `conteudo` obrigatório, `string`, 1..(5 MiB). CSV como texto (0 dep de upload binário).
- **Fluxo**: `parseCsv(conteudo)` → registra as linhas com `eventoCanonico` → soma as demais
  em `ignoradas`.
- **200**:
  ```json
  {
    "linhas": 6,
    "novos": 5,
    "dedup": 0,
    "ignoradas": 1,
    "erros": ["linha 4: sem identificador de pedido"]
  }
  ```
  Linha malformada **não** aborta o lote. 2º import do mesmo `conteudo` → `novos: 0`,
  `dedup: 5`.

## Erros comuns (ambas)

| Situação | HTTP |
| --- | --- |
| sem token | 401 |
| autenticado sem `evento:ingerir` | 403 |
| body inválido (`zod`) | 422 |
| API TMB não configurada (`sincronizar`) | 422 |
| `conteudo` acima do limite (`importar-csv`) | 422 |
