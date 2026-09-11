# Quickstart: Catálogo — `produto` → `oferta`

Pré-requisito: `pandora-db` rodando (`docker compose up -d`, porta `55432`), `.env` da raiz
configurado (já está, neste repositório).

## Rodar a migração

```bash
npm run db:migrate --workspace backend
```

## Ver a resolução automática funcionando (via API, sem UI)

```bash
# 1. token de serviço
TOKEN=$(curl -s -X POST http://localhost:3004/auth/token \
  -H 'content-type: application/json' \
  -d '{"clientId":"'"$SERVICE_CLIENT_ID"'","clientSecret":"'"$SERVICE_CLIENT_SECRET"'"}' \
  | jq -r .accessToken)

# 2. registra um evento canônico com tag no nome da oferta (ex.: Asaas)
curl -s -X POST http://localhost:3004/ingestao/eventos \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{
    "plataformaOrigem": "ASAAS_PRD",
    "idOrigem": "pay_quickstart_1",
    "tipoOrigem": "payment",
    "statusOrigem": "RECEIVED",
    "ocorridoEm": "2026-09-11T12:00:00Z",
    "oferta": { "nomeOrigem": "Mensalidade Programa Consultório - #PCS48XAV" }
  }'

# 3. processa a passada do worker
curl -s -X POST http://localhost:3004/ingestao/eventos/processar \
  -H "authorization: Bearer $TOKEN"

# 4. confere o produto/oferta auto-criados
curl -s http://localhost:3004/produtos/PCS -H "authorization: Bearer $TOKEN" | jq
curl -s "http://localhost:3004/ofertas?produtoCodigo=PCS" -H "authorization: Bearer $TOKEN" | jq
```

## Curar o produto

```bash
curl -s -X PUT http://localhost:3004/produtos/PCS \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"nome": "Programa Consultório Smart", "assinatura": false}'
```

## Importar catálogo Hotmart

```bash
CSV=$(printf 'price_code,produto_codigo,tag,nome\nHPXYZ1,PCS,PCS48XAV,Turma 48\n')
curl -s -X POST http://localhost:3004/catalogo/hotmart/importar-ofertas \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "$(jq -n --arg csv "$CSV" --arg conta HOTMART_PRD '{csv:$csv, conta:$conta}')"
```

## Rodar os testes desta spec

```bash
npm run test --workspace backend -- catalogo
npm run test:e2e --workspace backend -- catalogo
```
