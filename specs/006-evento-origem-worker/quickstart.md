# Quickstart / validação — spec 006 · evento_origem e worker de ingestão

Guia de validação ponta a ponta. Detalhes de modelo em `data-model.md`; de API em
`contracts/`.

## Pré-requisitos

- Node 24, Postgres dev em `localhost:55432` (spec 001 — `docker compose up -d db` ou
  equivalente já usado).
- `.env` na raiz com as chaves das specs 001–005 **+** as novas:
  ```
  INGESTAO_WORKER_ENABLED=true
  INGESTAO_WORKER_INTERVALO_MS=5000
  INGESTAO_WORKER_MAX_TENTATIVAS=3
  INGESTAO_WORKER_LOTE=50
  ```
  `.env.example` e o bloco `env:` do `ci.yml` recebem as mesmas (com defaults).

## Setup

```bash
npm install                      # 0 dep nova — lockfile não muda
npm --workspace backend run prisma:generate
npm --workspace backend run prisma:migrate      # aplica <ts>_ingestao
```

## Portões automáticos

```bash
npm --workspace backend run lint          # inclui import/no-restricted-paths + no process.env fora de config
npm --workspace backend run typecheck
npm --workspace backend run test           # unit — sem banco
npm --workspace backend run test:e2e       # Postgres real, schema isolado, worker desligado no setup
npm --workspace frontend run test
npm --workspace frontend run build
```

Esperado: unit cobre `hashEvento` (determinismo/estabilidade), `classificar` (cada regra +
`DESCONHECIDO`→`revisar` + determinismo), `plano-passada` (`bloqueada`/`esgotada`/status
final), `evento-canonico` (zod). e2e cobre os fluxos abaixo + regressão 003/004/005 e
`/health` = 11.

## Fluxo manual (backend rodando: `npm --workspace backend run start:dev`)

Obter token de serviço (003):

```bash
TOKEN=$(curl -s localhost:3001/auth/token -H 'content-type: application/json' \
  -d '{"clientId":"'"$SERVICE_CLIENT_ID"'","clientSecret":"'"$SERVICE_CLIENT_SECRET"'"}' \
  | jq -r .accessToken)
```

1. **Ingerir um evento** (com `EventoCanonico` de venda própria):
   ```bash
   curl -s localhost:3001/ingestao/eventos -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{
       "plataformaOrigem":"GURU_PRD","tipoOrigem":"webhook_venda","idOrigem":"txn_demo_1",
       "payloadBruto":{"id":"txn_demo_1","status":"approved","valor":19900},
       "eventoCanonico":{"plataformaOrigem":"GURU_PRD","idOrigem":"txn_demo_1",
         "tipoOrigem":"webhook_venda","statusOrigem":"approved",
         "ocorridoEm":"2026-09-03T12:00:00Z"}
     }'
   # → 201 { "eventoId": "...", "criado": true }
   ```
2. **Reentrega idêntica** → dedup:
   ```bash
   # repetir o comando acima → 200 { "criado": false }, mesmo eventoId
   ```
3. **Processar** (o worker também roda sozinho a cada 5 s; aqui forçamos):
   ```bash
   curl -s -X POST localhost:3001/ingestao/eventos/processar -H "authorization: Bearer $TOKEN"
   # → { "selecionados": 1, "ok": 1, "revisar": 0, "erro": 0, "bloqueadas": 0, ... }
   ```
4. **Ver o evento**: `GET /ingestao/eventos/{id}` → `status: "ok"`, `classificacao:
   "VENDA_PROPRIA"`, `CLASSIFICAR = ok`, etapas 2–6 `pulada` (`{implementadaNa: 18/23/24/25}`).
5. **Evento sem canônico** → `revisar`:
   ```bash
   curl -s localhost:3001/ingestao/eventos -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{
       "plataformaOrigem":"ASAAS_PRD","tipoOrigem":"csv","idOrigem":"row_9",
       "payloadBruto":{"linha":9}}'
   curl -s -X POST localhost:3001/ingestao/eventos/processar -H "authorization: Bearer $TOKEN"
   # GET do evento → status "revisar", classificacao "DESCONHECIDO", erroDetalhe "sem EventoCanonico"
   ```
6. **Painel `revisar`/`erro`**: `GET /ingestao/eventos` (sem query) → só o evento do passo 5.
   `GET /ingestao/eventos?status=todos` → os dois.
7. **Reprocessar**:
   ```bash
   curl -s -X POST localhost:3001/ingestao/eventos/<id-do-passo-5>/reprocessar \
     -H "authorization: Bearer $TOKEN"
   # → etapas não-ok voltam a pendente, tentativas=0; 1 linha em ingestao_audit
   ```
8. **Guard**: `curl localhost:3001/ingestao/eventos` sem `authorization` → 401; token de
   `Usuario` sem perfil → 403 (corpo genérico). Rota `/webhooks/...` → 401/404 (não existe).

## Frontend

`npm --workspace frontend run dev` → `localhost:5174`, login com credenciais de serviço →
item **Eventos** aparece (credencial de serviço tem `evento:*`) → lista com filtro default
`revisar`+`erro`, detalhe com payload formatado + linha do tempo das 7 etapas + botão
**Reprocessar**.

## Encerramento da spec (Definition of Done)

- [ ] `docs/006-evento-origem-worker.md` criado.
- [ ] `CLAUDE.md` (bloco SPECKIT + seção Stack), `README.md`, `ROADMAP.md` atualizados.
- [ ] `netstat`/`docker ps` conferidos — nenhuma porta nova.
- [ ] Suíte 003/004/005 verde sem alteração; `/health` = 11 contextos.
