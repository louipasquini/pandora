# Quickstart — Adaptadores de borda da Hotmart (spec 022)

## Rodar os testes

```bash
# unitários (sem banco)
npm run test --workspace backend -- hotmart

# e2e (Postgres real, container isolado na porta 55439)
docker run -d --name pandora-db-spec022 -e POSTGRES_PASSWORD=pandora \
  -e POSTGRES_USER=pandora -e POSTGRES_DB=pandora -p 55439:5432 postgres:16
TEST_DATABASE_URL='postgresql://pandora:pandora@localhost:55439/pandora' \
  npm run test:e2e --workspace backend -- hotmart-adapter
```

## Sincronizar vendas por API (OAuth2)

```bash
# .env (raiz) — as 4 chaves OAuth + a base
HOTMART_PRD_API_BASE_URL=https://developers.hotmart.com/payments/api/v1
HOTMART_PRD_API_KEY=<token Basic do painel do dev>
HOTMART_PRD_CLIENT_ID=<client_id>
HOTMART_PRD_CLIENT_SECRET=<client_secret>

curl -sS -X POST http://localhost:3001/ingestao/hotmart/sincronizar \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"conta":"HOTMART_PRD","dataInicio":"2026-06-01","dataFinal":"2026-06-30"}'
# → { conta, paginas, paginasDetalhePreco, recebidos, novos, dedup, ignorados, erros }

curl -sS -X POST http://localhost:3001/ingestao/eventos/processar \
  -H "Authorization: Bearer $TOKEN"
curl -sS "http://localhost:3001/financeiro/transacoes?conta=HOTMART_PRD" \
  -H "Authorization: Bearer $TOKEN"
```

## Import CSV

```bash
curl -sS -X POST http://localhost:3001/ingestao/hotmart/importar-csv \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"conta\":\"HOTMART_PRD\",\"conteudo\":$(jq -Rs . < export-vendas.csv)}"
```

## Webhook stub (desligado por padrão)

```bash
# HOTMART_WEBHOOK_ENABLED ausente/false:
curl -sS -X POST http://localhost:3001/webhooks/hotmart/prd \
  -H 'X-HOTMART-HOTTOK: <hottok>' -H 'Content-Type: application/json' -d @webhook.json
# → 503 { "message": "webhook Hotmart não habilitado nesta versão" }

# Para ligar a feature futura: HOTMART_WEBHOOK_ENABLED=true + HOTMART_PRD_WEBHOOK_TOKEN=<hottok>
```

## Checagens

```bash
npm run lint --workspace backend
npm run typecheck --workspace backend
git diff --stat main -- backend/src/ingestao/application/worker.service.ts \
  backend/src/ingestao/domain/etapas.ts backend/src/pipeline-wiring.module.ts \
  backend/src/ingestao/domain/classificar.ts backend/prisma/schema.prisma   # vazio
curl -sS http://localhost:3001/health   # 11 contextos
```
