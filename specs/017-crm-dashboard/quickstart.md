# Quickstart — CRM · Dashboard (spec 017)

## Pré-requisitos

- `.env` da raiz já configurado (specs 001–003). **Nenhuma variável nova** nesta spec.
- Postgres de dev de pé. **Portas em uso nesta máquina**: `55432` e `55433` (Postgres de
  outras sessões). Use uma porta livre para o e2e desta spec — ex.: subir um container
  próprio em `55434` e apontar `DATABASE_URL`/`E2E` para ele, ou reusar o de dev se estiver
  livre. Backend `3001` / frontend `5174` podem estar em uso por outra sessão — se
  estiverem, suba em `3002`/`5175`.

## Migração

```bash
npm run db:migrate            # prisma migrate dev + seed (cria <ts>_crm_dashboard)
# ou, contra um Postgres isolado:
DATABASE_URL=postgres://pandora:pandora@localhost:55434/pandora \
  npm run prisma:migrate:dev --workspace backend
```

A migração cria `meta_comercial`, `dashboard_visao`, `crm_dashboard_audit` e o enum
`MetaComercialPeriodo`. **0 seed novo** — `dashboard:ver`/`dashboard:gerir_metas` são
concedidas de graça ao perfil `administrador` e à credencial de serviço pelo special-case já
existente no `SujeitoRbacService`.

## Rodar

```bash
npm run start:dev --workspace backend      # :3001 (ou :3002 se ocupado)
npm run dev --workspace frontend           # :5174 (ou :5175)
```

## Fluxo de fumaça (via API, autenticado com a credencial de serviço)

```bash
TOKEN=$(curl -s localhost:3001/auth/token -H 'content-type: application/json' \
  -d '{"clientId":"'"$SERVICE_CLIENT_ID"'","clientSecret":"'"$SERVICE_CLIENT_SECRET"'"}' | jq -r .accessToken)
AUTH="authorization: Bearer $TOKEN"

# 1. Dashboard do mês passado
curl -s "localhost:3001/crm/dashboard?de=2026-08-01&ate=2026-08-31" -H "$AUTH" | jq '.paineis[].id'

# 2. Um painel isolado + export CSV
curl -s "localhost:3001/crm/dashboard/paineis/leads_por_origem?de=2026-08-01&ate=2026-08-31&formato=csv" -H "$AUTH"

# 3. Criar uma meta e ver o atingimento derivado
curl -s -X POST localhost:3001/crm/dashboard/metas -H "$AUTH" -H 'content-type: application/json' -d '{
  "metrica":"oportunidades_ganhas","periodo":"MES","referencia":"2026-08-01","alvo":{"valor":10}
}' | jq '{id, status, percentual, realizado}'

# 4. Notificações de meta (in-app)
curl -s localhost:3001/crm/dashboard/notificacoes -H "$AUTH" | jq

# 5. Salvar e reabrir uma visão
VID=$(curl -s -X POST localhost:3001/crm/dashboard/visoes -H "$AUTH" -H 'content-type: application/json' -d '{
  "nome":"Comercial 30d","filtros":{"periodo":{"tipo":"relativo","dias":30}},
  "paineis":["visao_geral","funil_pipeline","ranking_comercial"]
}' | jq -r .id)
curl -s localhost:3001/crm/dashboard/visoes -H "$AUTH" | jq '.itens[] | select(.id=="'"$VID"'")'
```

> A credencial de serviço resolve para `administrador` (vê todos os painéis). Para exercitar
> o escopo `ver_proprias`/`ver_proprios` e o corte "ranking omitido da lista", crie um
> `usuario` com só `dashboard:ver` + `oportunidade:ver_proprias` e um token para ele (mesmo
> harness da 010/016).

## Testes

```bash
# unit (domínio puro — catálogo de painéis, resolverPeriodo, calcularDelta, statusMeta, buckets)
npm test --workspace backend

# e2e (Postgres real; aponte para a porta livre)
E2E_DATABASE_URL=postgres://pandora:pandora@localhost:55434/pandora \
  npm run test:e2e --workspace backend

# frontend
npm test --workspace frontend
```

## Frontend

Item **CRM · Dashboard** na navegação, atrás de `dashboard:ver`. `DashboardPage` tem o
seletor de período (default "últimos 30 dias") + filtros de equipe/responsável/pipeline, e
renderiza os painéis visíveis:

- **Visão geral** — cartões numéricos com o delta período-a-período (seta ↑/↓ + %).
- **Funil** — barras SVG por etapa (quantidade + valor por moeda + tempo médio).
- **Ranking do comercial** — tabela ordenada; botão "Exportar CSV" (`Blob` client-side).
- **Qualidade do atendimento** — cartões (tempo médio de 1ª resposta, % SLA, CSAT, taxa de
  resolução) + mini-série por dia em SVG.
- **Série temporal** — linha/área SVG à mão.

**Metas** (aba/painel lateral) — lista com barra de progresso e badge de status; CRUD atrás
de `dashboard:gerir_metas`. **Badge de notificações** de meta com `refetchInterval` 60s.
**Visões** — salvar recorte atual, abrir, clonar (visão compartilhada), compartilhar com um
perfil. **Imprimir / PDF** — botão que chama `window.print()`; a folha `@media print` esconde
nav e controles.
