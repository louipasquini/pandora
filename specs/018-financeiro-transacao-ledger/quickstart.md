# Quickstart — 018 · Ledger de transações do Financeiro

## Pré-requisitos

- Node 24, monorepo instalado (`npm ci` na raiz).
- Postgres dev em `55432` (`npm run db:up`). Para os e2e desta spec, um Postgres isolado
  próprio numa porta livre (55432/55433 ocupadas por outras sessões):

```bash
docker run -d --name pandora-db-spec018 -e POSTGRES_USER=pandora \
  -e POSTGRES_PASSWORD=pandora -e POSTGRES_DB=pandora_test \
  -p 55434:5432 postgres:16-alpine
```

## Aplicar a migração

```bash
npm run db:migrate            # dev (55432) — cria `transacao` + enum StatusTransacaoCanonico
```

## Rodar os testes

```bash
# unit (sem banco)
npm run test --workspace backend -- financeiro

# e2e (Postgres isolado desta spec)
TEST_DATABASE_URL='postgres://pandora:pandora@localhost:55434/pandora_test' \
  npm run test:e2e --workspace backend -- financeiro-transacao

# frontend
npm run test --workspace frontend -- transacoes
```

## Fluxo manual (curl)

```bash
TOKEN=$(curl -s localhost:3001/auth/token -H 'content-type: application/json' \
  -d '{"clientId":"'"$SERVICE_CLIENT_ID"'","clientSecret":"'"$SERVICE_CLIENT_SECRET"'"}' | jq -r .accessToken)

# 1) ingerir um EventoCanonico de venda própria
curl -s localhost:3001/ingestao/eventos -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{
    "plataformaOrigem": "GURU_PRD",
    "tipoOrigem": "guru.webhook",
    "idOrigem": "txn_demo_1",
    "payloadBruto": { "id": "txn_demo_1", "status": "paid" },
    "eventoCanonico": {
      "plataformaOrigem": "GURU_PRD", "idOrigem": "txn_demo_1", "tipoOrigem": "guru.webhook",
      "statusOrigem": "PAGO", "ocorridoEm": "2026-08-30T14:02:00Z",
      "comprador": { "nome": "Fulana", "emails": ["fulana@example.com"] },
      "valores": { "bruto": { "valorInteiro": "19700000", "moeda": "BRL" } },
      "oferta": { "codigoOrigem": "PCS48XAV", "quantidade": 1 }
    }
  }'

# 2) rodar uma passada do worker (worker de fundo fica ligado em dev; em teste é manual)
curl -s -XPOST localhost:3001/ingestao/eventos/processar -H "authorization: Bearer $TOKEN"

# 3) ver a transação normalizada
curl -s "localhost:3001/financeiro/transacoes?plataformaOrigem=GURU_PRD" -H "authorization: Bearer $TOKEN" | jq
curl -s "localhost:3001/financeiro/transacoes?pagoDeFato=true" -H "authorization: Bearer $TOKEN" | jq
```

## O que verificar

- 1 linha em `transacao` com `status_canonico = PAGO`, `classificacao = VENDA_PROPRIA`,
  `pessoa_id` preenchido, `valor_bruto` reidratável como `Dinheiro`.
- Reprocessar o mesmo evento → `campos_alterados = []`, `foi_criada = false`, 0 pessoa/linha
  duplicada.
- `statusOrigem` fora do vocabulário canônico → `DESCONHECIDO` + `precisa_revisao = true`,
  `evento_origem.status = revisar`.
- Painel **Financeiro · Transações**: só aparece com `transacao:ver`; detalhe linka o evento
  de origem (`/eventos/:id`).
- Etapas 4–6 do evento seguem `pulada` (`implementadaNa` 24/23/25).
