# Quickstart — 014-crm-workflow

Valida o motor de automação de ponta a ponta: publicar um fluxo simples, disparar o gatilho,
ver a execução acontecer, e confirmar que reprocessar não duplica o efeito.

## Pré-requisitos

- Backend rodando (`npm run dev --workspace backend`), Postgres dev de pé
  (`docker compose up -d` na raiz, ou `npm run db:up`), migração aplicada
  (`npm run db:migrate`).
- Um token de serviço válido (`POST /auth/token` com `SERVICE_CLIENT_ID`/
  `SERVICE_CLIENT_SECRET` do `.env`) — a credencial de serviço já tem `crm_admin:ver` e
  `crm_admin:gerir_workflow` de graça (`administrador`, spec 004).
- `CRM_WORKFLOW_WORKER_ENABLED=false` no `.env` de dev, se quiser controlar o disparo do
  worker manualmente via `POST /crm/workflow/processar` em vez de esperar o `setInterval`.

## 1. Criar e publicar um fluxo: "lead do site ganha a tag site"

```bash
TOKEN=... # do POST /auth/token

curl -s -X POST localhost:3001/crm/workflow/fluxos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nome":"Lead do site","gatilhoTipo":"LEAD_CRIADO"}'
# -> { id, versaoRascunhoId, ... }

FLUXO_ID=...

curl -s -X PUT localhost:3001/crm/workflow/fluxos/$FLUXO_ID/rascunho \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "gatilhoTipo": "LEAD_CRIADO",
    "condicoes": {"tipo":"folha","campo":"origem","operador":"igual","valor":"site"},
    "acoes": [{"tipo":"APLICAR_TAG","tag":"site"}]
  }'

curl -s -X POST localhost:3001/crm/workflow/fluxos/$FLUXO_ID/publicar \
  -H "Authorization: Bearer $TOKEN"
# -> versão 1 PUBLICADA
```

## 2. Testar em simulação antes de confiar nele (US2)

Pegue um lead real já existente (`GET /crm/leads?...`) e rode:

```bash
curl -s -X POST localhost:3001/crm/workflow/fluxos/$FLUXO_ID/simular \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"registroTipo\":\"LEAD\",\"registroId\":\"$LEAD_ID\"}"
# -> { gatilhoCompativel: true, condicaoSatisfeita: <true|false conforme a origem do lead>, acoesQueSeriamDisparadas: [...] }
```

Confira `GET /crm/leads/$LEAD_ID` antes e depois — nada muda.

## 3. Disparar o gatilho de verdade

Um cursor novo (`fluxo_cursor_fonte`) nunca varre o histórico — na 1ª vez que cada fonte é
vista, o worker só estabelece a linha de partida em "agora" e não processa nada
(research.md D-R9). Então, **antes** de criar o lead de teste, rode `/processar` uma vez
para estabelecer essa linha de partida (só precisa acontecer 1×, por instalação):

```bash
curl -s -X POST localhost:3001/crm/workflow/processar -H "Authorization: Bearer $TOKEN"
# -> { fontesVarridas: [...], execucoesCriadas: 0, execucoesFalharam: 0 } (estabelece o cursor)

curl -s -X POST localhost:3001/crm/leads \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nome":"Aluna Teste","email":"aluna.workflow@example.com","origem":"site"}'

NOVO_LEAD_ID=...

curl -s -X POST localhost:3001/crm/workflow/processar -H "Authorization: Bearer $TOKEN"
# -> { fontesVarridas: [...], execucoesCriadas: 1, execucoesFalharam: 0 }

curl -s localhost:3001/crm/leads/$NOVO_LEAD_ID -H "Authorization: Bearer $TOKEN" | jq .tags
# -> ["site"]
```

## 4. Confirmar idempotência (D-06)

```bash
curl -s -X POST localhost:3001/crm/workflow/processar -H "Authorization: Bearer $TOKEN"
# -> execucoesCriadas: 0 (a linha-fonte já foi processada — cursor avançou)

curl -s "localhost:3001/crm/workflow/fluxos/$FLUXO_ID/execucoes" -H "Authorization: Bearer $TOKEN" | jq 'length'
# -> 1 (nunca 2, mesmo rodando /processar várias vezes)
```

## 5. Editar sem afetar a versão publicada (US3)

```bash
curl -s -X PUT localhost:3001/crm/workflow/fluxos/$FLUXO_ID/rascunho \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"gatilhoTipo":"LEAD_CRIADO","condicoes":{"tipo":"grupo","operador":"E","itens":[]},"acoes":[{"tipo":"APLICAR_TAG","tag":"site-v2"}]}'

curl -s -X POST localhost:3001/crm/leads \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nome":"Aluna Teste 2","email":"aluna2.workflow@example.com","origem":"site"}'
curl -s -X POST localhost:3001/crm/workflow/processar -H "Authorization: Bearer $TOKEN"
# a versão PUBLICADA (v1, tag "site") ainda é a que roda — não a v2 em rascunho
```

## 6. Biblioteca de modelos (US4)

```bash
curl -s localhost:3001/crm/workflow/modelos -H "Authorization: Bearer $TOKEN"
MODELO_ID=...
curl -s -X POST localhost:3001/crm/workflow/modelos/$MODELO_ID/usar-como-base \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nome":"Meu fluxo a partir do modelo"}'
```

## Frontend

`http://localhost:5174` → **CRM · Workflow** (atrás de `crm_admin:ver`): lista de fluxos com
indicador de status, editor de gatilho/condições/ações, botão "Simular", "Publicar",
"Arquivar", aba de execuções por fluxo, e a biblioteca de modelos com "usar como base".
