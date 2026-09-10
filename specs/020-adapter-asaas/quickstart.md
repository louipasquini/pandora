# Quickstart — Adaptador Asaas (spec 020)

## Pré-requisitos

- Repo instalado (`npm install` na raiz). Node 24.
- Postgres de teste isolado (e2e): container `pandora-db-spec020` na porta **55437**
  (`55432/55433/55435/55436` ocupadas por outras sessões).
  ```bash
  docker run -d --name pandora-db-spec020 -e POSTGRES_PASSWORD=pandora \
    -e POSTGRES_DB=pandora_test -p 55437:5432 postgres:16
  ```
- `.env` da raiz com os `ASAAS_PRD_*` / `ASAAS_SVC_*` **já existentes** (nada novo). Para
  exercitar `sincronizar` contra a API real: `ASAAS_PRD_API_KEY=<sua chave>` (base default
  `https://api.asaas.com/v3`; sandbox = `ASAAS_PRD_API_BASE_URL=https://api-sandbox.asaas.com/v3`).
  Sem a chave, `POST /ingestao/asaas/sincronizar` responde 422 (esperado no CI/e2e).

## Rodar os testes

```bash
# unit (parsers puros + status-map) — sem banco
npm test --workspace backend -- ingestao/adapters/asaas
npm test --workspace backend -- financeiro/domain/status-map

# e2e (Postgres real isolado)
TEST_DATABASE_URL='postgresql://postgres:pandora@localhost:55437/pandora_test?schema=e2e_asaas' \
  npm run test:e2e --workspace backend -- asaas-adapter

# lint + typecheck (fronteira de contexto)
npm run lint --workspace backend
npm run typecheck --workspace backend
```

## Fluxo manual (dev)

```bash
# 1. sobe o backend (porta 3001 — já pode estar em uso por outra sessão)
npm run start:dev --workspace backend

# 2. webhook de cobrança (conta PRD — token do .env)
curl -sS -X POST http://localhost:3001/webhooks/asaas/prd \
  -H 'content-type: application/json' \
  -H "asaas-access-token: $ASAAS_PRD_WEBHOOK_TOKEN" \
  -d @backend/src/ingestao/adapters/asaas/fixtures/webhook-payment-received.json
# -> 200 { "registrados": 1, "ignorados": 0, "eventoIds": ["..."] }

# 3. processa o pipeline (worker desligado em dev de teste)
TOKEN=$(curl -sS -X POST http://localhost:3001/auth/token \
  -H 'content-type: application/json' \
  -d "{\"clientId\":\"$SERVICE_CLIENT_ID\",\"clientSecret\":\"$SERVICE_CLIENT_SECRET\"}" | jq -r .accessToken)
curl -sS -X POST http://localhost:3001/ingestao/eventos/processar -H "authorization: Bearer $TOKEN"

# 4. confere a transação (1 linha por cobrança, mesmo com N eventos)
curl -sS "http://localhost:3001/financeiro/transacoes?plataformaOrigem=ASAAS_PRD" \
  -H "authorization: Bearer $TOKEN" | jq

# 5. import CSV (conta SVC)
curl -sS -X POST http://localhost:3001/ingestao/asaas/importar-csv \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"conta\":\"ASAAS_SVC\",\"conteudo\": $(jq -Rs . < backend/src/ingestao/adapters/asaas/fixtures/export-cobrancas.csv)}"
# -> 200 { "conta": "ASAAS_SVC", "linhas": N, "novos": M, "ignoradas": K }

# 6. sincronização por API (precisa ASAAS_PRD_API_KEY)
curl -sS -X POST http://localhost:3001/ingestao/asaas/sincronizar \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"conta":"ASAAS_PRD","dataInicio":"2026-03-01","dataFinal":"2026-03-31"}'
# sem chave -> 422 { "message": "conta ASAAS_PRD sem API configurada" }
```

## Checklist de validação (bate com Success Criteria)

- [ ] `POST /webhooks/asaas/prd` `PAYMENT_RECEIVED` + token → `200`, 1 `evento_origem`
      `asaas.webhook`; após `processar`, 1 `transacao` `(ASAAS_PRD, <payment.id>)`
      `status_canonico=PAGO`. (SC-001)
- [ ] Sem token / token de SVC em `/prd` → `401`, `count(evento_origem)==0`. (SC-002)
- [ ] `PAYMENT_CONFIRMED` com `externalReference` → `referenciaExterna.idOrigem` setado, sem
      `plataforma`; `classificacao=VENDA_PROPRIA`. (SC-003)
- [ ] `PAYMENT_RECEIVED` + `PAYMENT_REFUNDED` mesmo `payment.id` → 2 eventos, **1** transação,
      `ESTORNADO` + `REEMBOLSO`. (SC-004)
- [ ] `PAYMENT_DELETED` (`deleted=true`) → `transacao.status_canonico=CANCELADO`. (SC-005)
- [ ] `payment.status` inédito → `DESCONHECIDO` + `precisa_revisao` +
      `evento_origem.status=revisar`. (SC-006)
- [ ] `sincronizar` com client dublê de 2 páginas → `{paginas:2,...}`; re-disparo →
      `novos:0`; `conta` fora do enum → 422. (SC-007)
- [ ] `sincronizar` sem `ASAAS_PRD_API_KEY` → `422`, 0 eventos. (SC-008)
- [ ] `importar-csv` 5 boas + 1 ruim → `{linhas:6,novos:5,ignoradas:1}`; 2º import →
      `novos:0`. (SC-009)
- [ ] Nenhum `float` no caminho dos parsers (tipo/`grep`). (SC-010)
- [ ] `GET /admin/rbac/permissoes` sem permissão nova; nenhuma migração no `setup-db`. (SC-011)
- [ ] ESLint verde: `adapters/asaas` sem `financeiro`/`clientes`; `status-map` sem `ingestao`;
      `/health`=11. (SC-012)
- [ ] `git diff` sem tocar `worker.service.ts` / `etapas.ts` / `pipeline-wiring.module.ts` /
      `classificar.ts` / `schema.prisma`; suíte 003–019 verde. (SC-013)
- [ ] Cada entrada de `status-map/asaas.ts` coberta por fixture. (SC-014)
- [ ] Evento em `/prd` e em `/svc` para o mesmo `payment.id` → 2 transações distintas.
      (SC-015)
