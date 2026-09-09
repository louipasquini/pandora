# Quickstart: CRM · Disparos (WhatsApp)

Pré-requisitos: backend + Postgres de dev no ar (`npm run db:up` na raiz, se ainda não
estiver), migração aplicada (`npm run db:migrate --workspace backend`), um canal WhatsApp
conectado e ao menos um template `APROVADO` (ver `docs/011-crm-whatsapp-integracao.md`) e um
segmento salvo com membros (`docs/009-crm-interacao-timeline.md`).

## Cenário 1 — Disparo imediato para um segmento

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"'"$SERVICE_CLIENT_ID"'","clientSecret":"'"$SERVICE_CLIENT_SECRET"'"}' \
  | jq -r .accessToken)

curl -s -X POST http://localhost:3001/crm/disparos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nome":"Teste","canalId":"'"$CANAL_ID"'","templateId":"'"$TEMPLATE_ID"'","segmentoId":"'"$SEGMENTO_ID"'"}'
```

Esperado: `201`, `status: "EM_ANDAMENTO"`. Como o worker está desligado por padrão em
dev/teste, force uma passada:

```bash
curl -s -X POST http://localhost:3001/crm/disparos/processar -H "Authorization: Bearer $TOKEN"
```

Depois: `GET /crm/disparos/{id}` mostra contagens; `GET /crm/disparos/{id}/destinatarios`
mostra o resultado por telefone.

## Cenário 2 — Disparo agendado

Mesmo `POST`, com `"agendadoPara": "<data futura ISO>"`. Esperado: `201`,
`status: "AGENDADO"`, nenhuma linha em `destinatarios` ainda. Uma passada do worker **antes**
do horário não faz nada; depois do horário, materializa e começa a enviar.

## Cenário 3 — Importar CSV e usar como destino

```bash
CSV_CONTEUDO=$(cat contatos.csv | jq -Rs .)
curl -s -X POST http://localhost:3001/crm/disparos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nome":"Divulgação evento","canalId":"'"$CANAL_ID"'","templateId":"'"$TEMPLATE_ID"'","criarLead":true,"csvConteudo":'"$CSV_CONTEUDO"'}'
```

A resposta já traz `importacaoCsv` com o relatório de linhas aceitas/rejeitadas, e o disparo
criado usa os contatos do CSV como destino (combinados com `segmentoId`, se também informado).
No frontend, o conteúdo do arquivo é lido com `FileReader.readAsText()` antes de montar esse
mesmo corpo JSON (research.md D-R6 — sem upload binário).

## Cenário 4 — Teste A/B

`POST /crm/disparos` com `templateBId` + `percentualVarianteB`. Depois de processar,
`GET /crm/disparos/{id}` mostra as contagens de cada variante separadamente.

## Cenário 5 — Quality rating sob demanda

```bash
curl -s http://localhost:3001/crm/admin/whatsapp/canais/$CANAL_ID/quality-rating \
  -H "Authorization: Bearer $TOKEN"
```

Cada chamada bate direto na Graph API — nada é persistido.

## Validação automatizada

- `npm test --workspace backend -- crm/domain/disparos` — domínio puro (dedup, variante,
  parser de CSV).
- `npm run test:e2e --workspace backend -- crm-disparos` — ciclo de vida completo com
  Postgres real (schema isolado).
