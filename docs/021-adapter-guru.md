# 021 — Adaptadores de borda da plataforma Guru

Terceira das **4 specs de adaptadores** da Fase 2 (019 TMB ✅, 020 Asaas ✅, **021 Guru**,
022 Hotmart). Molde direto das 019/020. Materializa o **Princípio III** (bordas finas,
núcleo canônico) para as **duas contas Guru** — `GURU_PRD` e `GURU_SVC` (`PlataformaOrigem`):
transforma os payloads crus das 3 fontes da Guru em `EventoCanonico` — o contrato validado
do `core` que o pipeline da 006/018 já processa — e popula o vocabulário de status da Guru
em `financeiro/domain/status-map/guru.ts`.

Nenhuma regra de negócio conhece "Guru": `classificar` (006) e `UPSERT_TRANSACAO` (018)
recebem só o `EventoCanonico` + o rótulo livre `tipoOrigem`. O vocabulário bruto de status
vive **só** em `status-map/guru.ts`, compartilhado entre as duas contas. Os parsers são
**puros** (sem NestJS, Prisma, `fetch`, `Date`/locale) e testados contra **fixtures reais**
sem tocar o banco.

Spec, plano, pesquisa, modelo de dados, contratos e tarefas:
[`specs/021-adapter-guru/`](../specs/021-adapter-guru/).

`CONTEXT_MODULES` segue com **11** — o adapter é um subdiretório do `ingestao` (visão
Apêndice C). **0 migração, 0 tabela, 0 dependência nova, 0 chave `.env` nova, 0 porta nova,
0 permissão nova, 0 frontend.** As `GURU_PRD_*` / `GURU_SVC_*` (`_API_BASE_URL`, `_API_KEY`,
`_WEBHOOK_TOKEN`) já existiam no `env.schema` como `accountConfig` (spec 001/003).

---

## As 3 fontes da Guru

| Fonte | `tipoOrigem` | Formato | Status | Identidade |
| --- | --- | --- | --- | --- |
| **webhook de Vendas** (por conta) | `guru.webhook` | objeto de transação `{ id, status, dates, payment, contact, product, subscription, type, api_token, webhook_type }` | `status` | `id` (UUID) |
| API **`GET /api/v2/transactions`** (paginação por **cursor**, janela ≤ 180 dias) | `guru.api` | `{ data: [transaction…], has_more_pages, next_cursor }` | `status` | `id` |
| **CSV** (export de vendas / backfill) | `guru.csv` | texto com cabeçalho | coluna `status` \| `situacao` | coluna `id` \| `transacao` \| `codigo` |

As 3 fontes recebem a **`conta`** (`GURU_PRD` | `GURU_SVC`) como parâmetro — o payload da
Guru **nunca** a determina. A `conta` vem do path do webhook (`/prd`, `/svc`) ou do corpo
dos endpoints de ingestão.

Particularidades absorvidas na borda (visão Apêndice A):

- **Oferta nativa** — `product.offer.id` / `product.offer.name` / `product.qty` →
  `oferta.codigoOrigem` / `nomeOrigem` / `quantidade` (a resolução real `(tag AEN,
  plataforma)` é da spec 023).
- **Cupom e garantia** (`payment.coupon.*`, `dates.warranty_until`) não têm campo canônico
  nesta fatia → só `payload_bruto`.
- **Assinatura nativa** — `product.type === "plan"` com `subscription` preenchido →
  `assinatura.ehRecorrencia = true`; `invoice.cycle` → `assinatura.numeroCiclo`. `plan` com
  `subscription` vazio (1ª venda negada) → sem bloco `assinatura`.
- **Moeda exposta** — `payment.currency` (ISO 4217 validado pelo `core`); ausente/inválida →
  `BRL` cravado na borda.
- **Papel de afiliada** — `type === "affiliate"` → `ehAfiliada = true` → `classificar`
  resolve `VENDA_AFILIADA` (venda "só para registro" — Regra Inviolável nº 8).
  `producer`/`co_producer` → `VENDA_PROPRIA`.
- **Guru terceiriza a cobrança para a Asaas.** A transação Guru é a **venda de registro**
  (só ela soma receita — Regra Inviolável nº 2). O adapter Guru **não** emite
  `referenciaExterna`; `payment.marketplace_id` / `payment.marketplace_name` (o id da
  cobrança no processador) ficam só no `payload_bruto`. A **spec 024** casa
  `asaas.payment.externalReference` → `guru.transaction.id`.
- **Comprador rico** — o objeto `contact` traz nome, e-mail, documento, telefone (+ código
  local) e endereço completo → `comprador` completo.

## Superfície HTTP

| Rota | Auth | O que faz |
| --- | --- | --- |
| `POST /webhooks/guru/prd` | **pública** + `GURU_PRD_WEBHOOK_TOKEN` (campo `api_token` do corpo) | parse webhook → evento cru (etapa 0, sem `api_token`) → `200` |
| `POST /webhooks/guru/svc` | **pública** + `GURU_SVC_WEBHOOK_TOKEN` | idem, conta SVC |
| `POST /ingestao/guru/sincronizar` | `evento:ingerir` | `{ conta, dataInicio, dataFinal, campoData? }` → pagina `GET /api/v2/transactions` **por cursor** → registra `guru.api` |
| `POST /ingestao/guru/importar-csv` | `evento:ingerir` | `{ conta, conteudo, fonte? }` — CSV como texto no corpo → registra `guru.csv` |

Os webhooks são **públicos por prefixo de path** (`/webhooks/` — allowlist da 003). A
autenticação real da Guru é o **campo `api_token` do corpo do JSON** (equivale ao Account
Token da conta — **não** um header, diferente de TMB/Asaas), verificado em tempo constante
pelo `WebhookAuthenticator` (003) contra `GURU_<conta>_WEBHOOK_TOKEN`. Token inválido/
ausente / da outra conta → **401**, nenhum `evento_origem`. Sem HMAC (a Guru não assina o
corpo).

Controllers **finos**: autenticam (webhooks) / validam o DTO → chamam
`RegistrarEventoService.registrarEvento` (a porta da etapa 0 que a 006 exportou "para os
adapters das specs 019–022 injetarem"). O worker (006) faz classificar → resolver pessoa
(018) → upsert transação (018). **Nenhum `INSERT` direto**, **nenhum `commit()` de
remendo**, **nenhuma etapa nova no pipeline** (`worker.service.ts` / `etapas.ts` /
`pipeline-wiring.module.ts` / `classificar.ts` / `schema.prisma` sem diff).

Payload de webhook **sem `id` de transação** (webhook de assinatura/contrato/eticket que a
Guru manda para a mesma URL, ou lixo) → conta em `ignorados`, é **logado**, e **não** é
registrado. `200 { registrados: 0, ignorados: n }`. A Guru **suprime retentativas** em
`4xx` (`0/401/403/404/406/410/422/505/506/510/511`) — por isso erro de parse é **200**, não
4xx.

## Decisões (G-01..G-18)

021 não está marcada `⚠ clarify` no ROADMAP. As **3 decisões de fato ambíguas** foram
levadas ao dono do produto em **2026-09-10** (G-01, G-02, G-03); as demais são defaults
documentados. **Zero `NEEDS CLARIFICATION`.**

- **G-01 — chave natural `id_origem` = `transaction.id`** (dono do produto). UUID da
  transação, consistente nas 3 fontes. É **por conta**: só único dentro de `(<conta>, id)` —
  a `PlataformaOrigem` desambigua. Os N webhooks de uma venda (aprovada → reembolsada →
  chargeback…) resolvem para `(<conta>, <id>)` — Regra Inviolável nº 1 respeitada por
  construção; `UPSERT_TRANSACAO` (018) mantém 1 linha, último evento vence. Ciclos de
  assinatura **têm `id` próprio** (transação nova por cobrança).
- **G-02 — o adapter Guru NÃO emite `referenciaExterna`; o vínculo Asaas↔Guru é da spec
  024** (dono do produto). A Guru é a venda de registro. Nem toda venda Guru terceiriza para
  a Asaas (cartão via mundipagg, pix nativo…) — deduzir a ponte no adapter marcaria toda
  venda como `DESCONHECIDO`. A spec 024 (`RESOLVER_VINCULO`, etapa 4) tem o contexto
  cross-transação para casar os dois lados.
- **G-03 — escopo: parser puro + endpoints finos em `/ingestao/guru/*`** (dono do produto).
  `conta` é **obrigatória** no corpo dos endpoints (o webhook a tira do path). A superfície
  `admin/` completa fica para a spec de migração.
- **G-04 — autenticação do webhook: `api_token` NO CORPO.** Diferente de TMB (header
  `x-tmb-webhook-token`) e Asaas (header `asaas-access-token`). O controller lê
  `body.api_token` e o passa ao `WebhookAuthenticator`. O `api_token` **é removido** do
  `payload_bruto` antes de registrar o evento (segredo — nunca persiste; um teste e2e faz
  `grep` do valor = 0).
- **G-05 — `statusOrigem` = `transaction.status` cru** (`approved`, `waiting_payment`,
  `refunded`, `chargeback`, `canceled`…). Sem ajuste sintético. `webhook_type` fica só no
  `payload_bruto`.
- **G-06 — `tipoOrigem` é o rótulo da fonte e a chave `fonte` do `status-map`.** Convenção
  congelada: `guru.webhook`, `guru.api`, `guru.csv`. `mapearStatus` (018) é chamado com
  `plataforma = "GURU_PRD"` / `"GURU_SVC"` — as duas apontam para o mesmo objeto `GURU`.
- **G-07 — o adapter mora em `src/ingestao/adapters/guru/`** (visão Apêndice C). Parsers
  puros; **não importam `financeiro`/`clientes`** — o `status-map/guru.ts` vive em
  `financeiro/` e é consumido lá pela etapa 3.
- **G-08 — webhooks resilientes.** parse OK + persistência OK → `200`; parse com erro +
  persistência OK → `200` com `ignorados > 0`, `evento_canonico` nulo, `classificar` marca
  `revisar`; persistência falhou → **5xx** (a Guru reenvia — retenta a cada minuto até 10×,
  depois delay exponencial até 20×). **Nunca 4xx para "reenvie"** (a Guru suprime
  retentativas em 4xx).
- **G-09 — payload de webhook sem `id`** → `ignorados`, logado, **não** registrado.
- **G-10 — valores monetários.** `valores.bruto` = `payment.gross`; `valores.liquido` =
  `payment.net`; `valores.taxas` = `payment.tax.value` (ou `gross − net`) só quando
  `0 < taxa < bruto`. `payment.total` / `discount_value` / `affiliate_value` /
  `installments.*` / `coupon.*` ficam só no `payload_bruto`. Conversão via
  `Dinheiro.deDecimal` do `core` (escala ×10000, sem `float`); `moeda` = `payment.currency`
  ?? `BRL`.
- **G-11 — o adapter não classifica.** `EventoCanonico.classificacao` fica indefinido; a
  etapa 1 resolve — `status = "refunded"`/`"chargeback"` casa o `RE_ESTORNO` de `classificar`
  → `REEMBOLSO`; `ehAfiliada` → `VENDA_AFILIADA`; `assinatura` → `RECORRENCIA`; o resto →
  `VENDA_PROPRIA`. **`classificar.ts` sem diff nesta spec.** (`dispute` não casa o regex; o
  `status-map` traduz `dispute → ESTORNADO` e o `status_canonico` já exclui o valor da
  receita.)
- **G-12 — `ocorridoEm`.** webhook/API: `dates.confirmed_at` ?? `.ordered_at` ??
  `.created_at` ?? `.updated_at`. CSV: `data_aprovacao` ?? `data_pedido` ?? `data_criacao`.
  O parser passa a **string crua**; a etapa 3 (018) aplica `parseInstante` do `core` (tolera
  `"2023-09-19T09:19:04Z"`, date-only, epoch).
- **G-13 — `GuruApiClient` (cursor)** (`fetch` nativo, 0 dep). Header **`Authorization:
  Bearer <GURU_<conta>_API_KEY>`** + `Accept` + `User-Agent`; base `GURU_<conta>_API_BASE_URL`
  ?? `https://digitalmanager.guru/api/v2`; paginação **por cursor** (segue `next_cursor`
  enquanto `has_more_pages`); janela obrigatória `<campoData>_ini`/`_end`
  (`ordered_at` default). Chave da conta ausente → `GuruApiIndisponivelError` →
  `/sincronizar` responde **422**. Período > 180 dias → **422** no DTO (validação de borda,
  API não chamada).
- **G-14 — segredo nunca persiste.** `parseWebhookGuru` remove a chave `api_token` do objeto
  que devolve como `payloadBruto`. Uma coluna `api_token` no CSV é simplesmente não mapeada.
- **G-15 — RBAC: nenhuma permissão nova.** Webhooks públicos por prefixo; endpoints de
  ingestão reusam `evento:ingerir` (catálogo desde a 006). 0 migração de dados/seed.
- **G-16 — config.** `GURU_PRD_*` / `GURU_SVC_*` já no `env.schema` (001/003).
- **G-17 — vocabulário de status** — ver tabela abaixo. Valores ambíguos para a operação da
  AEN (`trial`, `started`, `abandoned`, `scheduled`, `pending_transfer`, `transferred`)
  ficam **fora do mapa de propósito** → `DESCONHECIDO` + revisão até uma fixture real
  aparecer (precedente do `AUTHORIZED` da Asaas).
- **G-18 — sem migração, sem tabela, sem frontend, `CONTEXT_MODULES` = 11.** Os eventos
  aparecem no painel **Eventos** (006), as transações no painel **Financeiro · Transações**
  (018) sem nenhuma mudança de frontend.

## `GuruApiClient` (`fetch` nativo, cursor, 0 dep)

Interface + token DI (`GURU_API_CLIENT`), impl `GuruApiClientHttp` com `fetch` do Node 24
(mesmo padrão de `TmbApiClient`/019, `AsaasApiClient`/020). Lê `GURU_<conta>_API_KEY` /
`GURU_<conta>_API_BASE_URL` pela leitura destipada do `ConfigService` (as chaves `GURU_*`
entram no schema por spread `ZodRawShape`, igual ao `WebhookAuthenticator`/003).

Paginação **por cursor**: 1ª chamada sem `cursor`; segue `body.next_cursor` enquanto
`body.has_more_pages` (`1` ou `true`); para quando `has_more_pages` é falso/`0` ou
`next_cursor` vazio; trava `MAX_PAGINAS`. `AbortSignal.timeout(15s)`. Env ausente →
`GuruApiIndisponivelError(conta)`. **Dublê nos testes** (`overrideProvider(GURU_API_CLIENT)`);
a impl real nunca é exercida em teste.

## `status-map/guru.ts`

Vocabulário compartilhado entre `guru.webhook`, `guru.api` e `guru.csv` (o CSV de export
espelha o enum da API — Assumption, sem export real na doc consultada):

| bruto Guru | canônico |
| --- | --- |
| `approved` / `completed` | `PAGO` |
| `waiting_payment` / `pending` / `billet_printed` / `processing` / `analysis` / `charging` | `PENDENTE` |
| `delayed` / `in_recovery` | `EM_ATRASO` |
| `refunded` / `dispute` | `ESTORNADO` |
| `chargeback` | `CHARGEBACK` |
| `canceled` / `expired` | `CANCELADO` |
| `rejected` / `failed` / `blocked` | `RECUSADO` |

Case-sensitive, sem `trim`, sem sinônimos (Regra nº 15 / gambiarra 4.4). `trial` / `started`
/ `abandoned` / `scheduled` / `pending_transfer` / `transferred` ficam **fora** de propósito
→ `DESCONHECIDO` + revisão até uma fixture real aparecer. Registrado em `status-map/index.ts`
via `Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU })`. Um teste varre as
fixtures reais e garante que **toda** chave do mapa aparece em algum `status` de fixture.

## Como 022 segue o mesmo molde

Idêntico ao passo-a-passo da 019/020 (ver `docs/019-adapter-tmb.md` §"Como 020–022 seguem o
mesmo molde"). Diferenças esperadas para **022 Hotmart**: OAuth2 `client_credentials` (sem
webhook na v1 — só `GET /sales/history` + `GET /sales/price/details`), `is_subscription` no
payload, e o papel de **afiliada** central (vendas em que a AEN é afiliada de outro produtor
entram "só para registro").

Detalhe do adapter Guru com duas contas: os parsers recebem `conta` como parâmetro; os
webhooks são **por conta** (`/prd`, `/svc`, cada um com seu token, lido do **corpo**); o
`status-map` é **compartilhado** e registrado para as duas chaves; a API usa **cursor**
(não offset como Asaas nem `pageNumber` como TMB).

## Testes

- **66 unit** novos (domínio puro, sem banco): `normalizar-guru` (helpers + moeda
  parametrizada), os 3 parsers contra fixtures reais, `guru-api-client` (dublê de `fetch`,
  encadeamento por cursor), `status-map/guru` (vocabulário + varredura de cobertura contra
  as fixtures).
- **18 e2e** novos (`test/guru-adapter.e2e-spec.ts`, Postgres real — container isolado
  `pandora-db-spec021` na porta **55438**, já que 55432/55433/55435/55436 estavam em uso por
  outras sessões): US1 (webhook por conta → transação; `payload_bruto` sem `api_token`;
  `waiting_payment`/`chargeback`; 401; webhook de assinatura ignorado), US2 (`type:
  "affiliate"` → `VENDA_AFILIADA`; `invoice.cycle=3` → `RECORRENCIA`; plano negado sem
  `subscription` → `RECUSADO` sem assinatura; `approved` + `refunded` colapsa no `id` → 1
  transação `ESTORNADO`/`REEMBOLSO`; dedup por hash; status inédito `trial` → revisão), US3
  (sincronização com dublê de 2 páginas encadeadas por cursor + `conta` fora do enum → 422 +
  janela > 180 dias → 422, API não chamada + sem chave → 422), US4 (import CSV com
  comprador), SC-015 (isolamento PRD/SVC → 2 transações), fronteira de contexto (`grep`),
  catálogo RBAC inalterado, `/health` = 11.
- Suíte completa: **777 unit backend** (+66 vs. a 020) + **394 e2e** (22 suítes, +18)
  verdes; lint/typecheck/build limpos. Frontend inalterado.
