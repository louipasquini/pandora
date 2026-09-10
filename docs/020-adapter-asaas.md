# 020 — Adaptadores de borda da plataforma Asaas

Segunda das **4 specs de adaptadores** da Fase 2 (019 TMB ✅, **020 Asaas**, 021 Guru,
022 Hotmart). Molde direto da 019. Materializa o **Princípio III** (bordas finas, núcleo
canônico) para as **duas contas Asaas** — `ASAAS_PRD` e `ASAAS_SVC` (`PlataformaOrigem`):
transforma os payloads crus das 3 fontes da Asaas em `EventoCanonico` — o contrato validado
do `core` que o pipeline da 006/018 já processa — e popula o vocabulário de status da Asaas
em `financeiro/domain/status-map/asaas.ts`.

Nenhuma regra de negócio conhece "Asaas": `classificar` (006) e `UPSERT_TRANSACAO` (018)
recebem só o `EventoCanonico` + o rótulo livre `tipoOrigem`. O vocabulário bruto de status
vive **só** em `status-map/asaas.ts`, compartilhado entre as duas contas. Os parsers são
**puros** (sem NestJS, Prisma, `fetch`, `Date`/locale) e testados contra **fixtures reais**
sem tocar o banco.

Spec, plano, pesquisa, modelo de dados, contratos e tarefas:
[`specs/020-adapter-asaas/`](../specs/020-adapter-asaas/).

`CONTEXT_MODULES` segue com **11** — o adapter é um subdiretório do `ingestao` (visão
Apêndice C). **0 migração, 0 tabela, 0 dependência nova, 0 chave `.env` nova, 0 porta nova,
0 permissão nova, 0 frontend.** As `ASAAS_PRD_*` / `ASAAS_SVC_*` (`_API_BASE_URL`,
`_API_KEY`, `_WEBHOOK_TOKEN`) já existiam no `env.schema` como `accountConfig` (spec 001/003).

---

## As 3 fontes da Asaas

| Fonte | `tipoOrigem` | Formato | Status | Identidade |
| --- | --- | --- | --- | --- |
| **webhook de cobrança** (por conta) | `asaas.webhook` | objeto `{ event, payment: {…} }` | `payment.status` (+ `payment.deleted`) | `payment.id` (`pay_…`) |
| API **`GET /v3/payments`** (paginada `offset`/`limit`, `hasMore`) | `asaas.api` | `{ hasMore, data: [payment…] }` | `payment.status` | `payment.id` |
| **CSV** (export de cobranças / backfill) | `asaas.csv` | texto com cabeçalho | coluna `status` | coluna `id` \| `identificador` |

As 3 fontes recebem a **`conta`** (`ASAAS_PRD` | `ASAAS_SVC`) como parâmetro — o payload da
Asaas **nunca** a determina (diferente da 019, que é conta única). A `conta` vem do path do
webhook (`/prd`, `/svc`) ou do corpo dos endpoints de ingestão.

Particularidades absorvidas na borda (visão Apêndice A): sem catálogo de oferta/cupom/
garantia (`oferta` no máximo transporta `nomeOrigem` de `description`); sem papel de afiliada
(`ehAfiliada` sempre ausente); **`externalReference` = ponte para a Guru** → vai para
`referenciaExterna.idOrigem` **sem** `plataforma`; assinaturas nativas (`payment.subscription`
→ `assinatura.ehRecorrencia = true`); moeda não exposta (`BRL` cravado na borda); dados do
comprador **não** vêm no `payment` (só o id `cus_…`) — só o **CSV** traz nome/e-mail/CPF/
telefone.

## Superfície HTTP

| Rota | Auth | O que faz |
| --- | --- | --- |
| `POST /webhooks/asaas/prd` | **pública** + `ASAAS_PRD_WEBHOOK_TOKEN` | parse webhook → evento cru (etapa 0) → `200` |
| `POST /webhooks/asaas/svc` | **pública** + `ASAAS_SVC_WEBHOOK_TOKEN` | idem, conta SVC |
| `POST /ingestao/asaas/sincronizar` | `evento:ingerir` | `{ conta, dataInicio?, dataFinal?, limit? }` → pagina `GET /v3/payments` → registra `asaas.api` |
| `POST /ingestao/asaas/importar-csv` | `evento:ingerir` | `{ conta, conteudo, fonte? }` — CSV como texto no corpo → registra `asaas.csv` |

Os webhooks são **públicos por prefixo de path** (`/webhooks/` — allowlist da 003); a
autenticação real é o `ASAAS_<conta>_WEBHOOK_TOKEN` verificado em tempo constante pelo
`WebhookAuthenticator` (003), lido do header `asaas-access-token` (ou `authorization:
Bearer …`). Token inválido/ausente / da outra conta → **401**, nenhum `evento_origem`.

Controllers **finos**: autenticam (webhooks) / validam o DTO → chamam
`RegistrarEventoService.registrarEvento` (a porta da etapa 0 que a 006 exportou "para os
adapters das specs 019–022 injetarem"). O worker (006) faz classificar → resolver pessoa
(018) → upsert transação (018). **Nenhum `INSERT` direto**, **nenhum `commit()` de
remendo**, **nenhuma etapa nova no pipeline** (`worker.service.ts` / `etapas.ts` /
`pipeline-wiring.module.ts` / `classificar.ts` / `schema.prisma` sem diff).

Payload de webhook **sem `payment.id`** (evento `TRANSFER_*`/`SUBSCRIPTION_*` que a Asaas
manda para a mesma URL, ou lixo) → conta em `ignorados`, é **logado**, e **não** é
registrado (não há como deduplicar nem projetar sem identidade). `200 { registrados: 0,
ignorados: n }`.

## Decisões (A-01..A-16)

020 não está marcada `⚠ clarify` no ROADMAP. As **3 decisões de fato ambíguas** foram
levadas ao dono do produto em **2026-09-10** (A-01, A-02, A-03); as demais são defaults
documentados. **Zero `NEEDS CLARIFICATION`.**

- **A-01 — chave natural `id_origem` = `payment.id`** (dono do produto). `"pay_…"`,
  consistente nas 3 fontes. É **por conta**: só único dentro de `(<conta>, payment.id)` — a
  `PlataformaOrigem` desambigua. Os N eventos de uma cobrança (created → confirmed →
  received → refunded…) resolvem para `(<conta>, <payment.id>)` — Regra Inviolável nº 1
  respeitada por construção; `UPSERT_TRANSACAO` (018) mantém 1 linha, último evento vence.
- **A-02 — `externalReference` → `referenciaExterna.idOrigem`, sem `plataforma`; o vínculo
  Asaas↔Guru é da spec 024** (dono do produto). O adapter transporta o `externalReference`
  cru; **não** deduz qual conta Guru. `classificar` (006) regra 2 (`ref.idOrigem &&
  ref.plataforma && ref.plataforma !== conta` → `DESCONHECIDO`+`revisar` p/ spec 024) **não
  dispara** sem `ref.plataforma` — a cobrança cai em `VENDA_PROPRIA` (ou `RECORRENCIA` se
  tiver `subscription`). A etapa 4 (`RESOLVER_VINCULO`, spec 024) casa a cobrança com a
  transação Guru, marca a Asaas como não-receita e não resolve Oferta/Contrato próprios
  (Regra Inviolável nº 2). Cobrança Asaas **avulsa** (sem `externalReference`) → resolve
  tudo normalmente.
- **A-03 — escopo: parser puro + endpoints finos em `/ingestao/asaas/*`** (dono do produto).
  `conta` é **obrigatória** no corpo dos endpoints (o webhook a tira do path). A superfície
  `admin/` completa fica para a spec de migração.
- **A-04 — autenticação do webhook.** A Asaas envia a "Access Token" no header
  `asaas-access-token` (fallback `authorization: Bearer`). Sem HMAC (a Asaas não assina o
  corpo — diferente do WhatsApp/011).
- **A-05 — `statusOrigem` = `payment.status` cru**, com **um** ajuste determinístico: quando
  `payment.deleted === true` (cobrança removida) o `payment.status` fica congelado no valor
  anterior e não reflete a remoção → o adapter emite `statusOrigem = "DELETED"` (conceito
  real da Asaas; `status-map` traduz `DELETED → CANCELADO`). `PAYMENT_RESTORED` volta ao
  `payment.status` real.
- **A-06 — `tipoOrigem` é o rótulo da fonte e a chave `fonte` do `status-map`.** Convenção
  congelada: `asaas.webhook`, `asaas.api`, `asaas.csv`. `mapearStatus` (018) é chamado com
  `plataforma = "ASAAS_PRD"` / `"ASAAS_SVC"` — as duas apontam para o mesmo objeto `ASAAS`.
- **A-07 — o adapter mora em `src/ingestao/adapters/asaas/`** (visão Apêndice C). Parsers
  puros; **não importam `financeiro`/`clientes`** — o `status-map/asaas.ts` vive em
  `financeiro/` e é consumido lá pela etapa 3.
- **A-08 — webhooks resilientes.** parse OK + persistência OK → `200`; parse com erro +
  persistência OK → `200` com `ignorados > 0`, `evento_canonico` nulo, `classificar` marca
  `revisar`; persistência falhou → **5xx** (a Asaas reenfileira — a fila pausa após muitas
  falhas). A Asaas espera **2xx**.
- **A-09 — payload de webhook sem `payment.id`** → `ignorados`, logado, **não** registrado.
- **A-10 — valores monetários.** `valores.bruto` = `payment.value`; `valores.liquido` =
  `payment.netValue`; `valores.taxas` = `value − netValue` só quando `0 < resultado <
  value`. `originalValue`/`interestValue`/`discount`/`refunds[]` ficam só no `payload_bruto`.
  Conversão via `Dinheiro.deDecimal` do `core` (escala ×10000, sem `float`); moeda `BRL`
  default explícito.
- **A-11 — o adapter não classifica.** `EventoCanonico.classificacao` fica indefinido; a
  etapa 1 resolve — `status = "REFUNDED"` casa o `RE_ESTORNO` de `classificar` (já ampliado
  na 019, cobre `refund`/`chargeback`) → `REEMBOLSO`; `subscription` → `RECORRENCIA`; o
  resto → `VENDA_PROPRIA`. **`classificar.ts` sem diff nesta spec.**
- **A-12 — `ocorridoEm`.** webhook/API: `paymentDate` ?? `confirmedDate` ??
  `clientPaymentDate` ?? `dateCreated`. CSV: `data_pagamento` ?? `data_criacao` ??
  `vencimento`. O parser passa a **string crua**; a etapa 3 (018) aplica `parseInstante` do
  `core` (tolera `"2024-05-10"` date-only, `"2024-05-10 11:20:32"` com espaço, ISO c/ fuso).
- **A-13 — `AsaasApiClient`** (`fetch` nativo, 0 dep). Header **`access_token: <ASAAS_<conta>
  _API_KEY>`** (não `Bearer`) + `User-Agent`; base `ASAAS_<conta>_API_BASE_URL` ??
  `https://api.asaas.com/v3`; paginação `offset`/`limit` (default/teto 100) enquanto
  `hasMore`; `dateCreated[ge]`/`dateCreated[le]`. Chave da conta ausente →
  `AsaasApiIndisponivelError` → `/sincronizar` responde **422**.
- **A-14 — RBAC: nenhuma permissão nova.** Webhooks públicos por prefixo; endpoints de
  ingestão reusam `evento:ingerir` (catálogo desde a 006). 0 migração de dados/seed.
- **A-15 — config.** `ASAAS_PRD_*` / `ASAAS_SVC_*` já no `env.schema` (001/003).
- **A-16 — sem migração, sem tabela, sem frontend, `CONTEXT_MODULES` = 11.** Os eventos
  aparecem no painel **Eventos** (006), as transações no painel **Financeiro · Transações**
  (018) sem nenhuma mudança de frontend.

## `AsaasApiClient` (`fetch` nativo, 0 dep)

Interface + token DI (`ASAAS_API_CLIENT`), impl `AsaasApiClientHttp` com `fetch` do Node 24
(mesmo padrão de `TmbApiClient`/019, `GraphApiClient`/011). Lê `ASAAS_<conta>_API_KEY` /
`ASAAS_<conta>_API_BASE_URL` pela leitura destipada do `ConfigService` (as chaves `ASAAS_*`
entram no schema por spread `ZodRawShape`, igual ao `WebhookAuthenticator`/003). Pagina
`offset`/`limit` enquanto `body.hasMore`, com `AbortSignal.timeout(15s)`. Env ausente →
`AsaasApiIndisponivelError(conta)`. **Dublê nos testes** (`overrideProvider(ASAAS_API_CLIENT)`);
a impl real nunca é exercida em teste.

## `status-map/asaas.ts`

Vocabulário compartilhado entre `asaas.webhook`, `asaas.api` e `asaas.csv` (o CSV de export
espelha o enum da API — Assumption, sem export real na doc consultada):

| bruto Asaas | canônico |
| --- | --- |
| `RECEIVED` / `CONFIRMED` / `RECEIVED_IN_CASH` / `DUNNING_RECEIVED` | `PAGO` |
| `PENDING` / `AWAITING_RISK_ANALYSIS` | `PENDENTE` |
| `OVERDUE` / `DUNNING_REQUESTED` | `EM_ATRASO` |
| `REFUNDED` / `REFUND_REQUESTED` / `REFUND_IN_PROGRESS` | `ESTORNADO` |
| `CHARGEBACK_REQUESTED` / `CHARGEBACK_DISPUTE` / `AWAITING_CHARGEBACK_REVERSAL` | `CHARGEBACK` |
| `DELETED` (sintético — `payment.deleted === true`) | `CANCELADO` |

Case-sensitive, sem `trim`, sem sinônimos (Regra nº 15 / gambiarra 4.4). `AUTHORIZED`
(pré-autorização de cartão) fica **fora** de propósito → `DESCONHECIDO` + revisão até uma
fixture real aparecer. Registrado em `status-map/index.ts` via `Object.assign(MAPAS_STATUS,
{ ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS })`. Um teste varre as fixtures reais e garante que
**toda** chave do mapa aparece em algum `statusOrigem` de fixture (o `DELETED` sintético é
justificado por uma fixture com `"deleted": true`).

## Como 021–022 seguem o mesmo molde

Idêntico ao passo-a-passo da 019 (ver `docs/019-adapter-tmb.md` §"Como 020–022 seguem o
mesmo molde"). Diferenças esperadas: **021 Guru** tem oferta/cupom/garantia/assinatura
nativos, datas em formatos variados (parser de borda do `core`), e terceiriza a cobrança
para a Asaas — o `id_transacao_origem` da Guru é o outro lado da ponte que a 020 já carrega
no `referenciaExterna`; **022 Hotmart** usa OAuth2 `client_credentials` (sem webhook na v1)
e `is_subscription` no payload de `/sales/history`.

Detalhe do adapter Asaas com duas contas: os parsers recebem `conta` como parâmetro; os
webhooks são **por conta** (`/prd`, `/svc`, cada um com seu token); o `status-map` é
**compartilhado** e registrado para as duas chaves.

## Testes

- **~57 unit** novos (domínio puro, sem banco): `normalizar-asaas` (helpers), os 3 parsers
  contra fixtures reais, `asaas-api-client` (dublê de `fetch`), `status-map/asaas`
  (vocabulário + varredura de cobertura contra as fixtures).
- **16 e2e** novos (`test/asaas-adapter.e2e-spec.ts`, Postgres real — container isolado
  `pandora-db-spec020` na porta **55437**, já que 55432/55433/55435/55436 estavam em uso por
  outras sessões): US1 (webhook por conta → transação; OVERDUE/DELETED; 401; evento
  não-cobrança), US2 (ponte Guru sem forçar revisão; `PAYMENT_REFUNDED` colapsa no
  `payment.id` → 1 transação `ESTORNADO`/`REEMBOLSO`; dedup por hash; status inédito →
  revisão), US3 (sincronização com dublê de 2 páginas + `conta` fora do enum → 422 + sem
  chave → 422), US4 (import CSV com comprador), SC-015 (isolamento PRD/SVC → 2 transações),
  fronteira de contexto (`grep`), catálogo RBAC inalterado, `/health` = 11.
- Suíte completa: **711 unit backend** (+55 vs. a 019) + **376 e2e** (21 suítes, +16)
  verdes; lint/typecheck/build limpos. Frontend inalterado.
