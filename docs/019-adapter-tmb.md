# 019 — Adaptadores de borda da plataforma TMB Educação

Primeira das **4 specs de adaptadores** da Fase 2 (019 TMB, 020 Asaas, 021 Guru,
022 Hotmart). Materializa o **Princípio III** (bordas finas, núcleo canônico) para a
conta única **`TMB`**: transforma os payloads crus das 4 fontes da TMB em `EventoCanonico`
— o contrato validado do `core` que o pipeline da 006/018 já processa — e popula o
vocabulário de status da TMB em `financeiro/domain/status-map/tmb.ts` (o registro que a 018
deixou vazio "para as specs 019–022 popularem").

Nenhuma regra de negócio conhece "TMB": `classificar` (006) e `UPSERT_TRANSACAO` (018)
recebem só o `EventoCanonico` + o rótulo livre `tipoOrigem`. O vocabulário bruto de status
vive **só** em `status-map/tmb.ts`, versionado por fonte. Os parsers são **puros** (sem
NestJS, Prisma, `fetch`, `Date`/locale) e testados contra **fixtures reais** sem tocar o
banco.

Spec, plano, pesquisa, modelo de dados, contratos e tarefas:
[`specs/019-adapter-tmb/`](../specs/019-adapter-tmb/).

`CONTEXT_MODULES` segue com **11** — o adapter é um subdiretório do `ingestao` (visão
Apêndice C). **0 migração, 0 tabela, 0 dependência nova, 0 chave `.env` nova, 0 porta nova,
0 permissão nova, 0 frontend.** As `TMB_API_BASE_URL` / `TMB_API_KEY` / `TMB_WEBHOOK_TOKEN`
já existiam no `env.schema` como `accountConfig('TMB')` (spec 003).

---

## As 4 fontes da TMB

| Fonte | `tipoOrigem` | Formato | Status | Identidade |
| --- | --- | --- | --- | --- |
| webhook **Vendas** (Efetivado / Cancelado) | `tmb.webhook-vendas` | objeto JSON **achatado** | `status_pedido` | `pedido` (int) |
| webhook **Financeiro** (mudança de parcela) | `tmb.webhook-financeiro` | **array** `[{ dados: {...} }]` | `status_pagamento` | `pedido_id` (int) |
| API **`GET /api/pedidos`** (pedidos efetivados, paginado) | `tmb.api` | objeto por item | `status_pedido` | `pedido_id` (int) |
| **CSV** (export / backfill) | `tmb.csv` | texto com cabeçalho | coluna `status_pedido` | `pedido_id` \| `pedido` |

Particularidades absorvidas na borda (visão Apêndice A): sem assinatura/recorrência (`assinatura`
nunca preenchido), sem papel de afiliada (`ehAfiliada` sempre ausente), método de pagamento e
vencimento não expostos (só no `payload_bruto`), moeda não exposta (`BRL` cravado na borda).

## Superfície HTTP

| Rota | Auth | O que faz |
| --- | --- | --- |
| `POST /webhooks/tmb/vendas` | **pública** + `TMB_WEBHOOK_TOKEN` | parse Vendas → 1 evento cru (etapa 0) → `202` |
| `POST /webhooks/tmb/financeiro` | **pública** + `TMB_WEBHOOK_TOKEN` | parse Financeiro (array) → N eventos crus → `202` |
| `POST /ingestao/tmb/sincronizar` | `evento:ingerir` | pagina `GET /api/pedidos` (janela de data) → registra `tmb.api` |
| `POST /ingestao/tmb/importar-csv` | `evento:ingerir` | CSV como texto no corpo → registra `tmb.csv` |

Os webhooks são **públicos por prefixo de path** (`/webhooks/` — allowlist da 003, coberta
pelo `JwtAuthGuard` e pelo `PermissionGuard`); a autenticação real é o `TMB_WEBHOOK_TOKEN`
verificado em tempo constante pelo `WebhookAuthenticator` (003), lido do header
`x-tmb-webhook-token` (ou `authorization: Bearer …`). Token inválido/ausente → **401**,
nenhum `evento_origem`.

Controllers **finos**: autenticam (webhooks) / validam o DTO → chamam
`RegistrarEventoService.registrarEvento` (a porta da etapa 0 que a 006 exportou "para os
adapters das specs 019–022 injetarem"). O worker (006) faz classificar → resolver pessoa
(018) → upsert transação (018). **Nenhum `INSERT` direto**, **nenhum `commit()` de
remendo**, **nenhuma etapa nova no pipeline**.

## Decisões (D-01..D-15)

019 não está marcada `⚠ clarify` no ROADMAP. As **3 decisões de fato ambíguas** foram
levadas ao dono do produto em **2026-09-10** (D-01, D-02, D-03); as demais são defaults
documentados. **Zero `NEEDS CLARIFICATION`.**

- **D-01 — chave natural `id_origem` = `pedido` / `pedido_id`** (dono do produto). Inteiro →
  string, consistente nas 4 fontes. `id_externo` (ref de checkout externo, pode ser vazio)
  fica só no `payload_bruto`. Os 2 webhooks + API + CSV de um pedido resolvem para
  `(TMB, "<pedido>")` — Regra Inviolável nº 1 respeitada por construção.
- **D-02 — webhook Financeiro (nível de parcela) colapsa para o pedido; último evento
  vence** (dono do produto). Cada notificação de parcela vira um `EventoCanonico` próprio
  (`hash` distinto → `evento_origem` distinto e imutável — histórico completo preservado);
  o `UPSERT_TRANSACAO` (018) faz upsert por `(plataforma, id_origem)` e o `status_canonico`
  reflete o último evento processado. Refino "estado da carteira de parcelas" fica para uma
  spec futura de cobranças. `status_financeiro` a nível de pedido (`Adimplente`/
  `Inadimplente`) **não** é status de transação — não entra no `status-map`.
- **D-03 — escopo: parser puro + endpoints finos em `/ingestao/tmb/*`** (dono do produto).
  A superfície `admin/` completa da visão (`/admin/importar-csv/{conta}`) fica para a spec
  de migração — o `AdminModule` está vazio desde a 001; abri-lo agora seria prematuro.
- **D-04 — valores monetários.** `valores.bruto` = `valor_principal` (ticket antes de juros
  de parcelamento); `valores.taxas` = `taxa_administracao`; `valores.liquido` =
  `bruto − taxas` só quando `0 < resultado < bruto`. `valor_total`/`valor_entrada`/
  `valor_parcela`/`repasse` ficam só no `payload_bruto`. Conversão via `Dinheiro.deDecimal`
  do `core` (escala ×10000, sem `float`, sem `parseFloat`); moeda `BRL` default explícito.
- **D-05 — `tipoOrigem` é o rótulo da fonte e a chave `fonte` do `status-map`.** Convenção
  congelada: `tmb.webhook-vendas`, `tmb.webhook-financeiro`, `tmb.api`, `tmb.csv`.
- **D-06 — o adapter mora em `src/ingestao/adapters/tmb/`** (visão Apêndice C). Parsers
  puros; **não importam `financeiro`** — o `status-map/tmb.ts` vive em `financeiro/` e é
  consumido lá pela etapa 3.
- **D-07 — webhooks resilientes.** parse OK + persistência OK → `202`; parse com erro +
  persistência OK → `202` com `ignorados > 0`, `evento_canonico` nulo, `classificar` marca
  `revisar` (nada some — visão 5.3); persistência falhou → **5xx** (a TMB reenvia).
- **D-08 — `status_pedido`/`status_pagamento` não catalogado** → `EventoCanonico` produzido
  normalmente com `statusOrigem` cru; a etapa 3 chama `mapearStatus` → não casou →
  `DESCONHECIDO` + `precisa_revisao = true` (Regra nº 15). O adapter nunca chuta.
- **D-09 — `ocorridoEm`.** Vendas/API: `data_efetivado` \|\| `criado_em`. Financeiro:
  `data_pagamento` \|\| `vencimento_parcela`. O parser passa a **string crua**; a etapa 3
  (018) aplica `parseInstante` do `core` (tolera os formatos ISO/naïve da TMB).
- **D-10 — o adapter não classifica.** `EventoCanonico.classificacao` fica indefinido; a
  etapa 1 (`classificar.ts`, 006) resolve. **Melhoria colateral (regra local, sem adapter):**
  o `RE_ESTORNO` de `classificar.ts` foi ampliado de `estorno` para `estorn[oa]` +
  `reembols` + `devolu[cç]` para casar os particípios pt-BR (`Estornado`/`Estornada`/
  `Reembolsado`/`Devolução`) que a TMB manda em `status_pagamento` — beneficia todos os
  adapters futuros. (Não toca `worker.service.ts` / `etapas.ts` / `pipeline-wiring.module.ts` /
  schema — FR-025.)
- **D-11 — RBAC: nenhuma permissão nova.** Webhooks públicos por prefixo; endpoints de
  ingestão reusam `evento:ingerir` (catálogo desde a 006). 0 migração de dados/seed.
- **D-12 — config.** `TMB_*` já no `env.schema` (003). Sem `TMB_API_BASE_URL`/`TMB_API_KEY`,
  `POST /ingestao/tmb/sincronizar` responde **422** (`TmbApiIndisponivelError` → não 500).
- **D-13 — sem migração, sem tabela.**
- **D-14 — sem frontend.** Os eventos aparecem no painel **Eventos** (006), as transações no
  painel **Financeiro · Transações** (018) sem nenhuma mudança de frontend.
- **D-15 — `CONTEXT_MODULES` segue 11.**

## `TmbApiClient` (`fetch` nativo, 0 dep)

Interface + token DI (`TMB_API_CLIENT`), impl `TmbApiClientHttp` com `fetch` do Node 24
(mesmo padrão de `GraphApiClient`/011, `SugestaoIaClient`/013). Pagina `pageNumber`/
`pageSize` (default 50; a doc TMB sugere 7) até esgotar, com `data_inicio`/`data_final`/
`produto_id` e `Authorization: Bearer <TMB_API_KEY>`. `AbortSignal.timeout(15s)`. Env
ausente → `TmbApiIndisponivelError`. **Dublê nos testes** (`overrideProvider(TMB_API_CLIENT)`);
a impl real nunca é exercida em teste.

## `status-map/tmb.ts`

| fonte | bruto | canônico |
| --- | --- | --- |
| `tmb.webhook-vendas` / `tmb.api` / `tmb.csv` | `Efetivado` | `PAGO` |
| `tmb.webhook-vendas` / `tmb.api` / `tmb.csv` | `Cancelado` | `CANCELADO` |
| `tmb.webhook-financeiro` | `Recebido` | `PAGO` |
| `tmb.webhook-financeiro` | `Aguardando pagamento` | `PENDENTE` |
| `tmb.webhook-financeiro` | `Vencido` | `EM_ATRASO` |
| `tmb.webhook-financeiro` | `Estornado` | `ESTORNADO` |
| `tmb.webhook-financeiro` | `DELETED` | `CANCELADO` |

Case-sensitive, sem `trim`, sem sinônimos (Regra nº 15 / gambiarra 4.4). Registrado em
`status-map/index.ts` via `Object.assign(MAPAS_STATUS, { TMB })`. Um teste varre as fixtures
reais e garante que **toda** chave do mapa aparece em algum `statusOrigem` de fixture.

## Como 020–022 seguem o mesmo molde

1. `src/ingestao/adapters/<plataforma>/` — `parse*()` puros por fonte + `fixtures/` reais +
   `<Plataforma>ApiClient` com `fetch` nativo.
2. `src/ingestao/<plataforma>/` — controllers finos (webhooks públicos `/webhooks/<plataforma>/*`
   + `/ingestao/<plataforma>/{sincronizar,importar-csv}` sob `evento:ingerir`).
3. `src/financeiro/domain/status-map/<plataforma>.ts` + `Object.assign(MAPAS_STATUS, { … })`.
4. Registrar controllers/services/client no `IngestaoModule`.
5. e2e `test/<plataforma>-adapter.e2e-spec.ts` — webhook → evento → worker → `transacao`;
   dublê do client; `grep` de fronteira; regressão.

Diferenças esperadas: **020 Asaas** carrega `externalReference` (ponte para a Guru — a
`referenciaExterna` do `EventoCanonico`); **021 Guru** tem oferta/cupom/garantia/assinatura
nativos e datas em formatos variados; **022 Hotmart** usa OAuth2 `client_credentials` (sem
webhook na v1) e `is_subscription` no payload.

## Testes

- **47 unit** novos (domínio puro, sem banco): `normalizar-tmb` (helpers), os 4 parsers
  contra fixtures reais, `tmb-api-client` (dublê de `fetch`), `status-map/tmb` (vocabulário +
  varredura de cobertura). +4 casos em `classificar.spec.ts` (particípios pt-BR).
- **13 e2e** novos (`test/tmb-adapter.e2e-spec.ts`, Postgres real — container isolado
  `pandora-db-spec019` na porta **55436**, já que 55432/55433/55435 estavam em uso por
  outras sessões): US1 (webhook Vendas → transação + 401), US2 (webhook Financeiro colapsa
  no pedido, dedup por hash, status inédito → revisão), US3 (sincronização com dublê de 2
  páginas + 422 sem config), US4 (import CSV), fronteira de contexto (`grep`), catálogo RBAC
  inalterado, `/health` = 11.
- Suíte completa: **656 unit backend** (+47 vs. a 018) + **360 e2e** (20 suítes) verdes;
  lint/typecheck/build limpos. Frontend inalterado.
