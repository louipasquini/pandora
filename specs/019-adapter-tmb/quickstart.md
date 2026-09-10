# Quickstart — Adaptador TMB (spec 019)

## Pré-requisitos

- Repo instalado (`npm install` na raiz). Node 24.
- Postgres de teste isolado (e2e): container `pandora-db-spec019` na porta **55436**
  (55432/55433/55435 ocupadas por outras sessões).
  ```bash
  docker run -d --name pandora-db-spec019 -e POSTGRES_PASSWORD=pandora \
    -e POSTGRES_DB=pandora_test -p 55436:5432 postgres:16
  ```
- `.env` da raiz com os `TMB_*` **já existentes** (nada novo). Para exercitar
  `sincronizar` localmente contra a API real: `TMB_API_BASE_URL=https://api.tmbeducacao.com.br`
  e `TMB_API_KEY=<bearer>`. Sem eles, `POST /ingestao/tmb/sincronizar` responde 422 (é o
  esperado no CI/e2e).

## Rodar os testes

```bash
# unit (parsers puros + status-map) — sem banco
npm test --workspace backend -- ingestao/adapters/tmb
npm test --workspace backend -- financeiro/domain/status-map

# e2e (Postgres real isolado)
TEST_DATABASE_URL='postgresql://postgres:pandora@localhost:55436/pandora_test?schema=e2e_tmb' \
  npm run test:e2e --workspace backend -- tmb-adapter

# lint + typecheck (fronteira de contexto)
npm run lint --workspace backend
npm run typecheck --workspace backend
```

## Fluxo manual (dev)

```bash
# 1. sobe o backend (porta 3001 — já pode estar em uso por outra sessão)
npm run start:dev --workspace backend

# 2. webhook de Vendas (token do .env)
curl -sS -X POST http://localhost:3001/webhooks/tmb/vendas \
  -H 'content-type: application/json' \
  -H "x-tmb-webhook-token: $TMB_WEBHOOK_TOKEN" \
  -d @backend/src/ingestao/adapters/tmb/fixtures/webhook-vendas-efetivado.json
# -> 202 { "registrados": 1, "eventoIds": ["..."] }

# 3. webhook Financeiro (array de parcelas)
curl -sS -X POST http://localhost:3001/webhooks/tmb/financeiro \
  -H 'content-type: application/json' \
  -H "x-tmb-webhook-token: $TMB_WEBHOOK_TOKEN" \
  -d @backend/src/ingestao/adapters/tmb/fixtures/webhook-financeiro-parcelas.json
# -> 202 { "registrados": 3, ... }

# 4. processa o pipeline (worker está desligado em dev de teste)
TOKEN=$(curl -sS -X POST http://localhost:3001/auth/token \
  -H 'content-type: application/json' \
  -d "{\"clientId\":\"$SERVICE_CLIENT_ID\",\"clientSecret\":\"$SERVICE_CLIENT_SECRET\"}" | jq -r .accessToken)
curl -sS -X POST http://localhost:3001/ingestao/eventos/processar -H "authorization: Bearer $TOKEN"

# 5. confere a transação consolidada (1 linha por pedido, mesmo com 2 webhooks + 3 parcelas)
curl -sS "http://localhost:3001/financeiro/transacoes?plataformaOrigem=TMB" -H "authorization: Bearer $TOKEN" | jq

# 6. import CSV
curl -sS -X POST http://localhost:3001/ingestao/tmb/importar-csv \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"conteudo\": $(jq -Rs . < backend/src/ingestao/adapters/tmb/fixtures/export-pedidos.csv)}"
# -> 200 { "linhas": N, "novos": M, "ignoradas": K }

# 7. sincronização por API (precisa TMB_API_KEY / TMB_API_BASE_URL)
curl -sS -X POST http://localhost:3001/ingestao/tmb/sincronizar \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"dataInicio":"2026-03-01","dataFinal":"2026-03-31"}'
# sem config -> 422 { "message": "conta TMB sem API configurada" }
```

## Checklist de validação (bate com Success Criteria)

- [ ] `POST /webhooks/tmb/vendas` "Efetivado" + token → `202`, 1 `evento_origem`
      `tmb.webhook-vendas`; após `processar`, 1 `transacao` `(TMB, <pedido>)`
      `status_canonico=PAGO`, `pessoa_id` resolvido. (SC-001)
- [ ] Sem token → `401`, `count(evento_origem)==0`. (SC-002)
- [ ] Vendas "Efetivado" + Financeiro "Estornado" mesmo pedido → 2 eventos, **1**
      transação, `status_canonico=ESTORNADO`, `classificacao=REEMBOLSO`. (SC-003)
- [ ] Array de 3 parcelas → 3 eventos, 1 transação; reenviar → 0 novos. (SC-004)
- [ ] `status_pagamento` inédito → `DESCONHECIDO` + `precisa_revisao` +
      `evento_origem.status=revisar`. (SC-005)
- [ ] `sincronizar` com client dublê de 2 páginas → `{paginas:2,...}`; re-disparo →
      `novos:0`. (SC-006)
- [ ] `sincronizar` sem `TMB_API_KEY` → `422`, 0 eventos. (SC-007)
- [ ] `importar-csv` 5 boas + 1 ruim → `{linhas:6,novos:5,ignoradas:1}`; 2º import →
      `novos:0`. (SC-008)
- [ ] Nenhum `float` no caminho dos parsers (tipo/`grep`). (SC-009)
- [ ] `GET /admin/rbac/permissoes` sem permissão nova; nenhuma migração no `setup-db`.
      (SC-010)
- [ ] ESLint verde: `adapters/tmb` sem `financeiro`; `status-map` sem `ingestao`;
      `/health`=11. (SC-011)
- [ ] `git diff` sem tocar `worker.service.ts` / `etapas.ts` / `pipeline-wiring.module.ts` /
      `schema.prisma`; suíte 003–018 verde. (SC-012)
- [ ] Cada entrada de `status-map/tmb.ts` coberta por fixture. (SC-013)
