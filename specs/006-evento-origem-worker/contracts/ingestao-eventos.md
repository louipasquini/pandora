# Contract — HTTP `/ingestao/eventos`

Todos sob o `JwtAuthGuard` global (003) + `PermissionGuard` (004). Nenhum `@Public()` /
`@AutenticadoBasta()`. 401 sem token; 403 autenticado sem a permissão (corpo genérico da
004); 404 para caminho inexistente sem token válido (`NotFoundAuthFilter` da 003). **Não
existe** rota `/webhooks/*` nesta spec.

Prefixo global da API conforme 001/003. Corpo JSON. DTOs validados por `zod`.

---

## `POST /ingestao/eventos` — ingerir um evento cru (etapa 0)

**Permissão**: `evento:ingerir`

**Body**
```jsonc
{
  "plataformaOrigem": "GURU_PRD",          // enum 7 (obrigatório)
  "tipoOrigem": "webhook_venda",            // string não vazia (obrigatório)
  "idOrigem": "txn_abc123",                 // string não vazia (obrigatório)
  "payloadBruto": { /* JSON cru como veio */ },   // JSON-serializável (obrigatório)
  "eventoCanonico": { /* ver contracts/evento-canonico.md */ }  // opcional
}
```

**Respostas**
- `201 Created` — `{ "eventoId": "<uuid>", "criado": true }` (evento novo, `REGISTRAR=ok`,
  demais etapas `pendente`).
- `200 OK` — `{ "eventoId": "<uuid>", "criado": false }` (reentrega idêntica: mesma chave
  `(plataformaOrigem, idOrigem, hash)`; `reentregas` incrementado, `payloadBruto` original
  intacto).
- `422 Unprocessable Entity` — `idOrigem`/`tipoOrigem` vazio; `plataformaOrigem` fora do
  enum; `payloadBruto` não JSON-serializável; `eventoCanonico` presente e inválido (erros
  por campo).
- `401` / `403` — conforme guards.

Idempotente. Chamadas concorrentes com a mesma chave → 1 linha (a 2ª resolve para a 1ª).

---

## `POST /ingestao/eventos/processar` — forçar uma passada do worker

**Permissão**: `evento:reprocessar`

**Body**: vazio.

**Resposta** `200 OK`
```jsonc
{
  "selecionados": 12,
  "ok": 9,
  "revisar": 2,
  "erro": 1,
  "bloqueadas": 0,
  "duracaoMs": 34
}
```
Síncrono: roda `WorkerService.processarPassada()` (até `INGESTAO_WORKER_LOTE` eventos) e
retorna o resumo. É o gatilho determinístico dos e2e.

---

## `POST /ingestao/eventos/{id}/reprocessar` — reenfileirar etapas não-`ok`

**Permissão**: `evento:reprocessar`

**Body** (opcional): `{ "forcar": false }`

**Comportamento**
- Sem `forcar`: as `EventoEtapa` do evento em `erro` / `bloqueada` / `pendente` voltam a
  `pendente`, `tentativas = 0`; `EventoOrigem.status = pendente`.
- `forcar: true`: idem, e também reenfileira a partir da etapa 1 mesmo se todas `ok` (etapa
  0 `REGISTRAR` é imutável e permanece `ok`).
- Grava **1** linha em `ingestao_audit` (`AJUSTE_MANUAL`, `sujeito`, `quando`, `delta`).

**Respostas**
- `200 OK` — `{ "eventoId": "<uuid>", "etapasReenfileiradas": ["CLASSIFICAR", ...] }`.
- `200 OK` — `{ "eventoId": "<uuid>", "etapasReenfileiradas": [] }` (evento já todo `ok` e
  sem `forcar` → no-op; **não** grava auditoria).
- `409 Conflict` — evento em `processando`.
- `404 Not Found` — id inexistente.
- `401` / `403`.

---

## `GET /ingestao/eventos` — lista paginada / filtrada (painel)

**Permissão**: `evento:ver`

**Query**
| Param | Default | Notas |
|---|---|---|
| `status` | `revisar,erro` | CSV de `pendente|ok|erro|revisar`; `status=todos` remove o filtro |
| `plataformaOrigem` | — | enum 7 |
| `tipoOrigem` | — | igualdade |
| `classificacao` | — | enum `Classificacao` |
| `recebidoDe` / `recebidoAte` | — | ISO; intervalo em `recebidoEm` |
| `pagina` | 1 | |
| `tamanho` | 25 | teto 100 |

**Resposta** `200 OK`
```jsonc
{
  "itens": [
    {
      "id": "<uuid>", "plataformaOrigem": "GURU_PRD", "tipoOrigem": "webhook_venda",
      "idOrigem": "txn_abc123", "status": "revisar", "classificacao": "DESCONHECIDO",
      "erroDetalhe": "sem EventoCanonico", "recebidoEm": "2026-09-03T12:00:00Z",
      "reentregas": 0
    }
  ],
  "pagina": 1, "tamanho": 25, "total": 1
}
```
Sem `payloadBruto` na lista. Ordenação estável (`recebidoEm desc, id desc`). Banco vazio →
`{ "itens": [], "total": 0, ... }` (não erro).

---

## `GET /ingestao/eventos/{id}` — detalhe (painel)

**Permissão**: `evento:ver`

**Resposta** `200 OK`
```jsonc
{
  "id": "<uuid>",
  "plataformaOrigem": "GURU_PRD", "tipoOrigem": "webhook_venda", "idOrigem": "txn_abc123",
  "hash": "9f2c…", "status": "revisar", "classificacao": "DESCONHECIDO",
  "erroDetalhe": "sem EventoCanonico",
  "recebidoEm": "2026-09-03T12:00:00Z", "ultimoRecebidoEm": "2026-09-03T12:00:00Z",
  "reentregas": 0,
  "payloadBruto": { /* … */ },
  "eventoCanonico": null,
  "etapas": [
    { "etapa": "REGISTRAR",  "status": "ok",     "tentativas": 0, "executadoEm": "…", "resultado": null },
    { "etapa": "CLASSIFICAR","status": "ok",     "tentativas": 0, "executadoEm": "…",
      "resultado": { "classificacao": "DESCONHECIDO", "motivo": "sem EventoCanonico" } },
    { "etapa": "RESOLVER_PESSOA",   "status": "pulada", "tentativas": 0,
      "resultado": { "implementadaNa": 18 } }
    // … 3–6 idem
  ]
}
```

`404` se id inexistente. Nenhum segredo/token no corpo. (`payloadBruto` aparece como veio —
é a fonte de verdade para retrabalho.)
