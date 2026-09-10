# Contrato — Ingestão Asaas sob demanda (spec 020)

Ambos autenticados (JWT de serviço) + `@RequerPermissao('evento:ingerir')` (catálogo desde a
006 — **nenhuma permissão nova**). `conta` é **obrigatória** no corpo (o webhook a tira do
path; aqui não há path por conta).

## `POST /ingestao/asaas/sincronizar`

**Body** (`zod`, `.strict()`):

```jsonc
{
  "conta": "ASAAS_PRD",        // obrigatório; enum ["ASAAS_PRD","ASAAS_SVC"]
  "dataInicio": "2026-03-01",  // opcional; YYYY-MM-DD -> dateCreated[ge]
  "dataFinal": "2026-03-31",   // opcional; YYYY-MM-DD -> dateCreated[le]
  "limit": 100                  // opcional; 1..100; default 100
}
```

**Resposta `200`**:

```json
{ "conta": "ASAAS_PRD", "paginas": 2, "recebidos": 137, "novos": 137, "dedup": 0, "ignorados": 0, "erros": [] }
```

| Situação | HTTP |
| --- | --- |
| corpo inválido / `conta` fora do enum | `422` `{ "message": "corpo inválido", "detalhes": [...] }` |
| `ASAAS_<conta>_API_KEY` não configurada | `422` `{ "message": "conta ASAAS_PRD sem API configurada" }` |
| API da Asaas responde 5xx na página K | `200` com `erros: ["pagina K: …"]`; páginas 1..K−1 já commitadas |
| OK | `200` (resumo acima) |

- Commit por página; re-disparo idempotente (dedup por hash).
- Pagina `GET {base}/v3/payments?offset=&limit=&dateCreated[ge]=&dateCreated[le]=` enquanto
  `hasMore`. Header `access_token: <ASAAS_<conta>_API_KEY>` + `User-Agent`.

## `POST /ingestao/asaas/importar-csv`

**Body** (`zod`, `.strict()`):

```jsonc
{
  "conta": "ASAAS_SVC",             // obrigatório; enum
  "conteudo": "id;status;value;…",  // obrigatório; texto CSV, <= 5 MiB
  "fonte": "asaas.csv"              // opcional; literal
}
```

**Resposta `200`**:

```json
{ "conta": "ASAAS_SVC", "linhas": 6, "novos": 5, "dedup": 0, "ignoradas": 1, "erros": ["linha 4: sem identificador de cobrança"] }
```

| Situação | HTTP |
| --- | --- |
| corpo inválido / `conta` fora do enum / `conteudo` vazio ou > 5 MiB | `422` |
| OK (linha malformada não aborta o lote) | `200` (resumo acima) |

- Idempotente por hash: 2º import do mesmo conteúdo → `novos: 0`, `dedup: <linhas válidas>`.
