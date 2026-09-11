# Quickstart: Vínculo Asaas↔Guru

Pré-requisitos: backend rodando (`npm run dev --workspace backend`), Postgres dev up
(`npm run db:up` se necessário), migração aplicada (`npm run db:migrate`), JWT de serviço
obtido via `POST /auth/token` (spec 003).

## 1) Sentido "Guru primeiro"

```bash
# 1a. Ingerir a venda Guru (ex.: via endpoint de sincronização/adapter da spec 021, ou
#     diretamente via POST /ingestao/eventos com um EventoCanonico de teste)
curl -s -X POST http://localhost:3001/ingestao/eventos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"plataformaOrigem":"GURU_PRD","idOrigem":"guru-tx-001","tipoOrigem":"guru.webhook",
       "payloadBruto":{"transaction":{"id":"guru-tx-001"}},
       "canonico":{"plataformaOrigem":"GURU_PRD","idOrigem":"guru-tx-001","tipoOrigem":"guru.webhook",
                   "statusOrigem":"approved","ocorridoEm":"2026-09-11T10:00:00Z"}}'

curl -s -X POST http://localhost:3001/ingestao/eventos/processar -H "Authorization: Bearer $TOKEN"

# 1b. Ingerir a cobrança Asaas correspondente, com a referência externa apontando pra ela
curl -s -X POST http://localhost:3001/ingestao/eventos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"plataformaOrigem":"ASAAS_PRD","idOrigem":"pay_001","tipoOrigem":"asaas.webhook",
       "payloadBruto":{"payment":{"id":"pay_001","externalReference":"guru-tx-001"}},
       "canonico":{"plataformaOrigem":"ASAAS_PRD","idOrigem":"pay_001","tipoOrigem":"asaas.webhook",
                   "statusOrigem":"CONFIRMED","ocorridoEm":"2026-09-11T10:05:00Z",
                   "referenciaExterna":{"idOrigem":"guru-tx-001"}}}'

curl -s -X POST http://localhost:3001/ingestao/eventos/processar -H "Authorization: Bearer $TOKEN"
```

**Esperado**: `GET /financeiro/transacoes?plataformaOrigem=ASAAS_PRD&q=pay_001` mostra
`classificacao: "COBRANCA_TERCEIRIZADA"`; `GET /financeiro/transacoes/{id}` daquela transação
traz `vinculo.transacaoVinculadaId` apontando para a transação Guru.

## 2) Sentido "Asaas primeiro" (ordem invertida do passo 1, `idOrigem` diferente)

Repita 1b antes de 1a com um par novo (`guru-tx-002`/`pay_002`). Depois do passo Asaas, a
transação fica `vinculo: null` (pendente); `GET
/financeiro/transacoes?plataformaOrigem=ASAAS_PRD&vinculoPendente=true` deve listá-la. Ao
ingerir e processar a transação Guru (`guru-tx-002`), sem chamar nenhum endpoint de retry, a
Asaas correspondente deixa de aparecer como pendente.

## 3) Retry manual

```bash
curl -s -X POST http://localhost:3001/financeiro/transacoes/{idDaAsaasPendente}/tentar-vincular \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:3001/financeiro/transacoes/tentar-vincular-pendentes \
  -H "Authorization: Bearer $TOKEN"
```

## 4) Regra de receita

```bash
curl -s "http://localhost:3001/financeiro/transacoes?pagoDeFato=true&plataformaOrigem=ASAAS_PRD" \
  -H "Authorization: Bearer $TOKEN"
```

**Esperado**: a transação Asaas `COBRANCA_TERCEIRIZADA` do passo 1 **não** aparece nessa
listagem (mesmo com `statusCanonico=PAGO`) — só a Guru correspondente conta como receita.

## Frontend

`http://localhost:5174/financeiro/transacoes/{id}` (transação Asaas vinculada) mostra a seção
"Vínculo" com link para a transação Guru e o botão **Tentar vincular** desabilitado (já
resolvido); numa transação Asaas pendente, o botão fica habilitado e dispara o retry manual.
