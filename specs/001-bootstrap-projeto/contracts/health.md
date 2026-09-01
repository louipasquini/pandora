# Contract: `GET /health`

Único endpoint da spec 001. Read-only. Sem autenticação (a 003 decide o que passa a ser
protegido; `/health` fica público por design para probes).

## Request

```
GET /health
```

Sem parâmetros, sem corpo, sem headers obrigatórios.

## Response — 200 OK

```jsonc
{
  "status": "ok",                // "ok" apenas se db === "up" e contexts tem os 11 nomes
  "db": "up",                    // "up" | "down" — resultado de um SELECT 1 via PrismaService
  "contexts": [                  // nomes dos bounded contexts compostos com sucesso no AppModule
    "ingestao", "financeiro", "catalogo", "contratos", "clientes",
    "crm", "marketing", "central", "core", "api", "admin"
  ],
  "uptimeSeconds": 12.34,
  "timestamp": "2026-09-01T12:00:00.000Z"   // ISO-8601 UTC
}
```

- `contexts` é derivado de uma lista central (`CONTEXT_MODULES`) usada tanto pelo
  `AppModule` quanto pelo controller — garante que o health reflita a composição real
  (US2 / FR-006 / SC-002).
- `db` vem de uma query trivial; erro de conexão → `db: "down"`.

## Response — 503 Service Unavailable

Mesmo corpo, com `status: "degraded"` e `db: "down"`, quando o banco não responde. A
aplicação **sobe** mesmo com banco fora (para o probe reportar), mas nunca reporta `status:
"ok"` sem banco (edge case "PostgreSQL indisponível").

## Testes de contrato

`backend/test/health.e2e-spec.ts` (Jest + supertest, contra Postgres real):

1. **200 + status ok**: sobe a app com banco conectado → `GET /health` → 200,
   `body.status === "ok"`, `body.db === "up"`.
2. **11 contextos**: `body.contexts` contém exatamente os 11 nomes esperados (ordem
   irrelevante).
3. **degradado**: com `DATABASE_URL` apontando para porta morta → 503,
   `body.status === "degraded"`, `body.db === "down"`, app ainda responde.
