# Quickstart — Adaptador Guru (spec 021)

## Pré-requisitos

- Repo instalado (`npm install` na raiz). Node 24.
- Postgres de teste isolado (e2e): container `pandora-db-spec021` na porta **55438**
  (`55432/55433/55435/55436` ocupadas por outras sessões).
  ```bash
  docker run -d --name pandora-db-spec021 -e POSTGRES_PASSWORD=pandora \
    -e POSTGRES_DB=pandora_test -p 55438:5432 postgres:16
  ```
- `.env` da raiz com os `GURU_PRD_*` / `GURU_SVC_*` **já existentes** (nada novo). Para
  exercitar `sincronizar` contra a API real: `GURU_PRD_API_KEY=<Account Token>` (base default
  `https://digitalmanager.guru/api/v2`). Sem a chave, `POST /ingestao/guru/sincronizar`
  responde 422 (esperado no CI/e2e).

## Rodar os testes

```bash
# unit (parsers puros + status-map) — sem banco
npm test --workspace backend -- ingestao/adapters/guru
npm test --workspace backend -- financeiro/domain/status-map

# e2e (Postgres real isolado)
TEST_DATABASE_URL='postgresql://postgres:pandora@localhost:55438/pandora_test?schema=e2e_guru' \
  npm run test:e2e --workspace backend -- guru-adapter

# lint + typecheck (fronteira de contexto)
npm run lint --workspace backend
npm run typecheck --workspace backend
```

## Fluxo manual (dev)

```bash
# 1. sobe o backend (porta 3001 — já pode estar em uso por outra sessão)
npm run start:dev --workspace backend

# 2. webhook de venda (conta PRD — api_token NO CORPO, do .env)
curl -sS -X POST http://localhost:3001/webhooks/guru/prd \
  -H 'content-type: application/json' \
  -d "$(jq --arg t "$GURU_PRD_WEBHOOK_TOKEN" '.api_token=$t' \
    backend/src/ingestao/adapters/guru/fixtures/webhook-venda-approved.json)"
# -> 200 { "registrados": 1, "ignorados": 0, "eventoIds": ["..."] }

# 3. processa o pipeline (worker desligado em dev de teste)
TOKEN=$(curl -sS -X POST http://localhost:3001/auth/token \
  -H 'content-type: application/json' \
  -d "{\"clientId\":\"$SERVICE_CLIENT_ID\",\"clientSecret\":\"$SERVICE_CLIENT_SECRET\"}" | jq -r .accessToken)
curl -sS -X POST http://localhost:3001/ingestao/eventos/processar -H "authorization: Bearer $TOKEN"

# 4. confere a transação (1 linha por venda, mesmo com N eventos)
curl -sS "http://localhost:3001/financeiro/transacoes?plataformaOrigem=GURU_PRD" \
  -H "authorization: Bearer $TOKEN" | jq

# 5. import CSV (conta SVC)
curl -sS -X POST http://localhost:3001/ingestao/guru/importar-csv \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"conta\":\"GURU_SVC\",\"conteudo\": $(jq -Rs . < backend/src/ingestao/adapters/guru/fixtures/export-vendas.csv)}"
# -> 200 { "conta": "GURU_SVC", "linhas": N, "novos": M, "ignoradas": K }

# 6. sincronização por API (precisa GURU_PRD_API_KEY; janela <= 180 dias)
curl -sS -X POST http://localhost:3001/ingestao/guru/sincronizar \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"conta":"GURU_PRD","dataInicio":"2026-03-01","dataFinal":"2026-03-31"}'
# sem chave -> 422 { "message": "conta GURU_PRD sem API configurada" }
# janela > 180 dias -> 422 { "message": "corpo inválido", "detalhes": ["...180 dias"] }
```

## Checklist de validação (bate com Success Criteria)

- [ ] `POST /webhooks/guru/prd` venda `approved` + `api_token` → `200`, 1 `evento_origem`
      `guru.webhook` **sem `api_token`**; após `processar`, 1 `transacao` `(GURU_PRD, <id>)`
      `status_canonico=PAGO`, `oferta.codigoOrigem` setado. (SC-001/SC-003)
- [ ] Sem `api_token` / token de SVC em `/prd` → `401`, `count(evento_origem)==0`. (SC-002/SC-015)
- [ ] `approved` + `refunded` mesmo `id` → 2 eventos, **1** transação, `ESTORNADO` +
      `REEMBOLSO`. (SC-004)
- [ ] `type:"affiliate"` → `classificacao=VENDA_AFILIADA`; `plan` + `invoice.cycle=3` →
      `RECORRENCIA`. (SC-005)
- [ ] `status:"trial"` → `DESCONHECIDO` + `precisa_revisao` + `evento_origem.status=revisar`.
      (SC-006)
- [ ] `sincronizar` com dublê de 2 páginas por cursor → `{paginas:2,...}`; re-disparo →
      `novos:0`; `conta` fora do enum → 422; janela > 180 dias → 422 (API não chamada); sem
      `GURU_PRD_API_KEY` → 422. (SC-007/SC-008)
- [ ] `importar-csv` 5 boas + 1 ruim → `{linhas:6,novos:5,ignoradas:1}`; 2º import →
      `novos:0`. (SC-009)
- [ ] Nenhum `float` no caminho dos parsers; `moeda` de `payment.currency` ?? `BRL`. (SC-010)
- [ ] `GET /admin/rbac/permissoes` sem permissão nova; nenhuma migração no `setup-db`. (SC-011)
- [ ] ESLint verde: `adapters/guru` sem `financeiro`/`clientes`; `status-map` sem `ingestao`;
      `/health`=11. (SC-012)
- [ ] `git diff` sem tocar `worker.service.ts` / `etapas.ts` / `pipeline-wiring.module.ts` /
      `classificar.ts` / `schema.prisma`; suíte 003–020 verde. (SC-013)
- [ ] Cada entrada de `status-map/guru.ts` coberta por fixture. (SC-014)
