# Implementation Plan: Adaptadores de borda da plataforma Asaas

**Branch**: `020-adapter-asaas` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-adapter-asaas/spec.md`

## Summary

Segunda das 4 specs de adaptadores da Fase 2 (molde direto da 019/TMB). Entrega a **borda de
entrada das duas contas Asaas** (`ASAAS_PRD`, `ASAAS_SVC`): funções puras `parse*()` que
transformam os payloads crus das 3 fontes da Asaas (webhook de cobrança por conta, API
`GET /v3/payments`, CSV) em `EventoCanonico` — o contrato validado do `core` que o pipeline
da 006/018 já processa. Popula o vocabulário de status da Asaas em
`src/financeiro/domain/status-map/asaas.ts` e o registra em `MAPAS_STATUS` para as duas
contas.

Superfície HTTP fina (A-03): 2 webhooks **públicos** por conta `POST /webhooks/asaas/{prd,svc}`
autenticados por `WebhookAuthenticator` (003) + 2 endpoints **autenticados**
`POST /ingestao/asaas/{sincronizar,importar-csv}` sob `evento:ingerir` (catálogo desde a
006). Todos apenas chamam `RegistrarEventoService.registrarEvento` (etapa 0). **Sem frontend,
sem migração, sem tabela, sem dep nova, sem chave `.env` nova, sem porta nova, sem permissão
nova.** `CONTEXT_MODULES` segue **11**. Nenhum arquivo de pipeline
(`worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts`) nem `classificar.ts` é tocado.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS. Só backend.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11 (`@Public()`, `Controller`, guards já existentes),
  `zod` 3 (DTOs de corpo). Parser de CSV **à mão** (0 dep — cópia do da 019). Do `core`:
  `Dinheiro.deDecimal`, `PlataformaOrigem`, `eventoCanonicoSchema`. Do `ingestao`:
  `RegistrarEventoService` (porta exportada, 006). Do `auth`: `WebhookAuthenticator`
  (providido pelo próprio `IngestaoModule` desde a 019) + `RequerPermissao`.
- **`fetch` nativo do Node 24** para o `AsaasApiClient` (0 dep — mesmo padrão de
  `TmbApiClient`/019, `GraphApiClient`/011).

**Storage**: **nenhuma migração**. O adapter não tem entidade. `src/financeiro/domain/
status-map/asaas.ts` é dado versionado em código, não schema.

**Testing**:
- **Backend unit** (`jest`, sem banco), `backend/src/ingestao/adapters/asaas/`:
  - `normalizar-asaas.spec.ts` — `dinheiroDeValorAsaas` (`100` → `1000000n`; `19.9` →
    `199000n`; `"abc"`/`NaN`/`-5`/`1e3` → `undefined` + erro), `telefonesDeString`,
    `soDigitos`, `enderecoDeAsaas` (n/a — CSV não traz endereço estruturado; helper cobre
    campos vazios → `undefined`).
  - `parse-webhook.spec.ts` — fixtures `PAYMENT_RECEIVED`/`PAYMENT_OVERDUE`/`PAYMENT_REFUNDED`/
    `PAYMENT_DELETED`/`PAYMENT_CONFIRMED` (com `externalReference` e com `subscription`) →
    `EventoCanonico` com `plataformaOrigem = conta`, `idOrigem = payment.id`,
    `tipoOrigem = "asaas.webhook"`, `statusOrigem` cru (`DELETED` quando `deleted`),
    `valores.bruto/liquido/taxas`, `referenciaExterna.idOrigem` sem `plataforma`,
    `assinatura.ehRecorrencia`; `comprador` ausente; chave inédita ignorada; corpo sem
    `payment.id` → `{ eventoCanonico: undefined }` (nunca lança); array de 1 item tolerado.
  - `parse-pagamento-api.spec.ts` — item de `data[]` da API → `tipoOrigem = "asaas.api"`,
    mesmo mapeamento.
  - `parse-linha-csv.spec.ts` — cabeçalho + linha → `tipoOrigem = "asaas.csv"`; separador
    `;`; BOM; aspas; comprador montado das colunas; linha sem `id` → erro; cabeçalho sem
    coluna de id → todas em erro.
  - `asaas-api-client.spec.ts` — dublê global de `fetch`; 2 páginas depois `hasMore:false` →
    3 chamadas; monta `offset`/`limit`/`dateCreated[ge]`/`dateCreated[le]`; header
    `access_token`; `ASAAS_PRD_API_KEY` ausente → lança `AsaasApiIndisponivelError`.
- **Backend unit**, `backend/src/financeiro/domain/`:
  - `status-map/asaas.spec.ts` — cada `(fonte, bruto)` → canônico esperado, `revisar:false`;
    `mapearStatus('ASAAS_PRD','asaas.webhook','RECEIVED') === PAGO`;
    `('ASAAS_SVC','asaas.api','REFUNDED') === ESTORNADO`; `'DELETED' === CANCELADO`; bruto
    inédito → `DESCONHECIDO`+`revisar`; varredura "toda chave de `ASAAS` aparece em
    `statusOrigem` de alguma fixture dos parsers".
  - `status-map.spec.ts` (existente) — segue verde; `MAPAS_STATUS.ASAAS_PRD`/`ASAAS_SVC`
    agora presentes.
- **Backend e2e** (`jest` e2e, Postgres real isolado, worker desligado → testes disparam
  `POST /ingestao/eventos/processar`), `backend/test/asaas-adapter.e2e-spec.ts`:
  - **US1**: `POST /webhooks/asaas/prd` (token ok, `PAYMENT_RECEIVED`) → `200`; existe
    `evento_origem` `ASAAS_PRD`/`asaas.webhook` com `payload_bruto` == recebido e
    `evento_canonico` preenchido; `processar` → 1 `transacao` `(ASAAS_PRD, <payment.id>)`
    `status_canonico=PAGO`; `PAYMENT_OVERDUE` → `EM_ATRASO`; `PAYMENT_DELETED` → `CANCELADO`.
  - **US1 guard**: sem header / token errado / token de SVC em `/prd` → **401**,
    `count(evento_origem)==0`.
  - **US2**: `PAYMENT_CONFIRMED` com `externalReference` → `evento_canonico.referenciaExterna
    = { idOrigem }` sem `plataforma`; `processar` → `classificacao=VENDA_PROPRIA`. Cobrança
    sem `externalReference` → `referenciaExterna` ausente.
  - **US2 refund**: `PAYMENT_RECEIVED` + `PAYMENT_REFUNDED` mesmo `payment.id` → 2
    `evento_origem`, **1** `transacao`, `ESTORNADO` + `REEMBOLSO`. Reenviar o mesmo evento →
    `count(evento_origem)` estável (dedup por hash).
  - **US2 revisão**: `payment.status` inédito → `transacao.status_canonico=DESCONHECIDO`,
    `precisa_revisao=true`, `evento_origem.status=revisar`.
  - **US3**: `AsaasApiClient` **dublê** (`overrideProvider(ASAAS_API_CLIENT)`) com 2 páginas
    → `POST /ingestao/asaas/sincronizar {conta:"ASAAS_PRD",dataInicio,dataFinal}` →
    `{paginas:2,recebidos,novos,dedup:0,erros:[]}`; re-disparo → `novos:0`. `conta` fora do
    enum → **422**. Sem `ASAAS_PRD_API_KEY` no env de teste + client real (um `describe` com
    `AsaasApiClientIndisponivel`) → **422**.
  - **US4**: `POST /ingestao/asaas/importar-csv {conta,conteudo}` 5 boas + 1 sem id → `200
    {linhas:6,novos:5,ignoradas:1}`; 2º import → `novos:0`.
  - **SC-015 isolamento de contas**: evento de `/prd` e evento de `/svc` para o mesmo
    `payment.id` → **2** transações (`(ASAAS_PRD, id)` e `(ASAAS_SVC, id)`).
  - **Fronteira** (`grep`): `src/ingestao/adapters/asaas` sem `from '.*/financeiro'`/
    `.*/clientes'`; `src/financeiro/domain/status-map` sem `from '.*/ingestao'`.
  - **Regressão** (`git`): `worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts`/
    `classificar.ts`/`prisma/schema.prisma` **sem diff**.
  - **Catálogo**: `GET /admin/rbac/permissoes` **sem** permissão nova; `/health` = 11.

**Target Platform**: backend HTTP NestJS `:3001` (já em uso — **não subir servidor extra**).
e2e contra **Postgres isolado próprio** (container dedicado `pandora-db-spec020`, porta
**55437** — `55432/55433/55435/55436` ocupadas por outras sessões; `55434` livre mas fica de
reserva). Dev Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta nova. Webhook: 1 parse em memória + 1 `registrarEvento`
(`sha256` + `upsert`), resposta `200` sem esperar o worker. Sincronização: `limit` default
100, commit por página. Import CSV: 1 `registrarEvento` por linha.

**Constraints**:
- **Nenhuma porta nova. Nenhuma migração. Nenhuma dep nova. Nenhuma chave `.env` nova**
  (`ASAAS_PRD_*`/`ASAAS_SVC_*` já em `accountConfig`, spec 001/003).
- **Bordas finas** (Princípio III): nenhum arquivo fora de `src/ingestao/adapters/asaas/**` e
  `src/financeiro/domain/status-map/**` conhece "Asaas". As `parse*()` são **puras** — sem
  NestJS, sem Prisma, sem `fetch`, sem `Date.now()`/locale.
- **Fronteira de contexto** (Princípio VI): `src/ingestao/adapters/asaas` importa só `core` +
  utilitários locais; **não** importa `financeiro`/`clientes`. O `status-map/asaas.ts` vive
  em `src/financeiro/**` e importa só o enum do `core`. ESLint `import/no-restricted-paths` +
  `grep` no e2e.
- **Log de eventos** (Princípio IV): o adapter **nunca** faz `INSERT` direto — só
  `RegistrarEventoService.registrarEvento`. `payload_bruto` gravado **sempre**, imutável.
  Erro de parse não descarta o evento (A-08).
- **Sem duplicidade** (Regra nº 1): `idOrigem = String(payment.id)` nas 3 fontes (A-01); os N
  eventos de uma cobrança → mesma `(<conta>, <payment.id>)`; `UPSERT_TRANSACAO` (018)
  garante 1 linha.
- **Status** (Regra nº 15): o adapter produz `statusOrigem` **cru** (com o único ajuste
  determinístico `deleted → "DELETED"`); a tradução é o `status-map/asaas.ts` + `mapearStatus`
  (018). Valor fora do mapa → `DESCONHECIDO` + revisão.
- **Dinheiro** (Padrão Transversal): `valores.*` como `{ valorInteiro: bigint ×10000, moeda:
  "BRL" }` via `Dinheiro.deDecimal`; `float` nunca sai do parser. Moeda default explícito na
  borda (`BRL`).
- **Superfície de escrita mínima** (Princípio VIII): 2 webhooks + 2 endpoints de ingestão,
  todos invólucros da porta da etapa 0. Sincronização por API é **sob demanda**, nunca job.
- **Config** (002): `ASAAS_*` lido só pelo `AsaasApiClient`/webhook via `ConfigService` —
  nunca `process.env` fora de `config/`.

**Scale/Scope**: ~20 arquivos novos no backend
(`src/ingestao/adapters/asaas/{tipos,normalizar-asaas,montar,parse-webhook,parse-pagamento-api,
parse-linha-csv,asaas-api-client,asaas-api-client.port,index}.ts` + `fixtures/*` + `*.spec.ts`;
`src/ingestao/asaas/{asaas-webhooks.controller,asaas-ingestao.controller,asaas-sync.service,
asaas-csv-import.service}.ts` + `dto/{sincronizar,importar-csv}.schema.ts`;
`src/financeiro/domain/status-map/asaas.ts` + `asaas.spec.ts`; `test/asaas-adapter.e2e-spec.ts`
+ `test/support/asaas.ts`), ~5 editados (`src/ingestao/ingestao.module.ts`;
`src/financeiro/domain/status-map/index.ts`; `src/financeiro/domain/status-map/README.md`;
`backend/test/setup-db.ts` — fixtures dos 2 `ASAAS_*_WEBHOOK_TOKEN`; `.env.example` —
comentário nos `ASAAS_*` já existentes). **0 migração, 0 dep, ~4 endpoints (2 públicos + 2
autenticados), 0 frontend.** 1 doc novo (`docs/020-adapter-asaas.md`), 3 atualizados
(`CLAUDE.md` SPECKIT + parágrafo, `README.md`, `ROADMAP.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md`.

- [x] **I. Domínio, não origem**: nenhuma entidade nova. O adapter produz `EventoCanonico`.
      `payment.id` da Asaas entra como valor de `EventoCanonico.idOrigem` → coluna comum
      `evento_origem.id_origem` / chave natural `(plataforma, id_origem)` de `transacao` —
      **nunca uma PK**. `externalReference` vira `referenciaExterna.idOrigem` (não identidade).
      Granularidade decidida com o dono do produto (A-01: chave = `payment.id`, por conta).
- [x] **II. Clarificar antes de assumir**: as 3 decisões de fato ambíguas (chave natural,
      papel do `externalReference`, escopo CSV/API) foram ao dono do produto e respondidas em
      2026-09-10 (spec §Clarifications A-01/A-02/A-03). O resto (A-04..A-16) é default
      documentado. **Zero `NEEDS CLARIFICATION`.** O formato exato do CSV real, o nome do
      header do token e o vocabulário de status do export são **Assumptions** explícitas —
      trocar qualquer um é config/fixture/mapa, não arquitetura.
- [x] **III. Bordas finas, núcleo canônico**: **coração da spec.** Um adapter por
      `(plataforma × fonte)` — 3 funções `parse*()` puras em `src/ingestao/adapters/asaas/`,
      testadas contra **fixtures reais**, **sem tocar o banco**. Nenhuma regra de negócio
      conhece "Asaas": `classificar` (006) e `UPSERT_TRANSACAO` (018) recebem só o
      `EventoCanonico` + o rótulo livre `tipoOrigem`. O vocabulário bruto de status vive
      **só** em `status-map/asaas.ts`.
- [x] **IV. Log de eventos + projeções**: os webhooks/endpoints só chamam a **porta da etapa
      0** — `payload_bruto` imutável gravado antes de qualquer projeção; dedup por
      `(plataforma, id_origem, hash)`. O adapter **não** roda etapas, **não** faz `commit()`.
      Re-webhook / re-sync / re-import é idempotente por hash. Erro de parse → evento
      persistido + `revisar`.
- [x] **V. Agregados derivados**: o adapter não agrega nada. `valores.*` sai como
      `Dinheiro{BRL}` por campo; própria/afiliada não se aplica (Asaas não tem afiliada).
- [x] **VI. Contextos delimitados — observar, não escrever**: o adapter vive **dentro** do
      `ingestao` (Apêndice C). Escreve só via a porta do próprio contexto. **Não importa
      `financeiro`** (o `status-map/asaas.ts` é arquivo de `financeiro`, consumido lá pela
      etapa 3) **nem `clientes`**. ESLint + `grep` no e2e nos dois sentidos.
- [x] **VII. Curadoria vs derivação**: não há campo curado. `status-map/asaas.ts` é
      **derivação** (tradução determinística), versionada, testada contra fixture. Nenhum
      vínculo é aplicado/revertido aqui (o vínculo Asaas↔Guru é da 024).
- [x] **VIII. Superfície de escrita mínima**: 2 webhooks **públicos** (prefixo `/webhooks/`
      já é allowlist desde a 003; invólucros da etapa 0 previstos para as specs 019–022) + 2
      endpoints `POST /ingestao/asaas/*` sob a permissão **já existente** `evento:ingerir`.
      **Nenhuma permissão nova, nenhum endpoint de escrita de negócio, nenhuma sincronização
      automática.**
- [x] **Padrões Transversais**:
      - **IDs**: n/a (sem entidade nova); `id_origem` nunca vira PK.
      - **Dinheiro**: `{ valorInteiro: bigint ×10000, moeda: "BRL" }` via `Dinheiro.deDecimal`;
        `float` nunca sai do parser (SC-010).
      - **Tempo**: `ocorridoEm` string do payload → `parseInstante` a jusante (018); o parser
        não normaliza data (livre de locale).
      - **Status**: `statusOrigem` cru no `EventoCanonico`; `status-map/asaas.ts` +
        `mapearStatus` (018) traduzem; fora do mapa → `DESCONHECIDO` + revisão.
      - **Idempotência**: dedup por hash na etapa 0.
      - **Auditoria**: n/a (sem escrita curada). O rastro é `evento_origem` imutável.
      - **Erros de ingestão**: parse falho → evento persistido, `evento_canonico` nulo,
        `classificar` marca `revisar`; falha de persistência → 5xx (Asaas reenvia).
      - **Config/segredos**: `ASAAS_*_API_KEY`/`ASAAS_*_WEBHOOK_TOKEN`/`ASAAS_*_API_BASE_URL`
        já no `env.schema`; lidos só via `ConfigService`. **0 chave nova.**
      - **Multi-conta**: `plataformaOrigem ∈ { ASAAS_PRD, ASAAS_SVC }` cravada pelo path do
        webhook / pelo DTO — o payload nunca a determina.
      - **Dependência nova**: **nenhuma**.

**Resultado do gate: PASS.** Zero item em Complexity Tracking — a spec é aditiva pura.

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma "0 entidade, 0 migração"; os
mapeamentos de campo por fonte não introduzem nenhum campo novo em `EventoCanonico`;
`contracts/webhooks-asaas.md` confirma `200`/`401`/`5xx`; `contracts/ingestao-asaas-http.md`
confirma `evento:ingerir` + `422` sem config + `conta` obrigatória;
`contracts/status-map-asaas.md` fixa o vocabulário; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/020-adapter-asaas/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── webhooks-asaas.md          # POST /webhooks/asaas/{prd,svc}
│   ├── ingestao-asaas-http.md     # POST /ingestao/asaas/{sincronizar,importar-csv}
│   ├── parsers-asaas.md           # ResultadoParseAsaas + mapa de campos por fonte
│   └── status-map-asaas.md        # vocabulário Asaas -> StatusTransacaoCanonico
├── checklists/
│   └── requirements.md
└── tasks.md                       # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── ingestao/
│   │   ├── adapters/
│   │   │   └── asaas/
│   │   │       ├── index.ts                     # re-export dos 3 parsers + tipos + client port
│   │   │       ├── tipos.ts                     # FonteAsaas + ResultadoParseAsaas
│   │   │       ├── normalizar-asaas.ts          # dinheiroDeValorAsaas, telefonesDeString, soDigitos, textoOuUndefined, liquidoDe (puros)
│   │   │       ├── montar.ts                    # montarResultado(conta, fonte, payloadBruto, campos, erros)
│   │   │       ├── parse-webhook.ts             # parseWebhookAsaas(payload, conta) -> ResultadoParseAsaas[]
│   │   │       ├── parse-pagamento-api.ts       # parsePagamentoApi(item, conta) -> ResultadoParseAsaas
│   │   │       ├── parse-linha-csv.ts           # parseCsvAsaas(conteudo, conta) -> ResultadoParseAsaas[]
│   │   │       ├── asaas-api-client.port.ts     # interface AsaasApiClient + token DI + AsaasApiIndisponivelError
│   │   │       ├── asaas-api-client.ts          # impl com fetch nativo (offset/limit, access_token)
│   │   │       ├── fixtures/
│   │   │       │   ├── webhook-payment-received.json
│   │   │       │   ├── webhook-payment-overdue.json
│   │   │       │   ├── webhook-payment-refunded.json
│   │   │       │   ├── webhook-payment-deleted.json
│   │   │       │   ├── webhook-payment-confirmed-guru.json   # externalReference + subscription
│   │   │       │   ├── api-payments-pagina.json              # { hasMore, data: [...] }
│   │   │       │   └── export-cobrancas.csv
│   │   │       └── *.spec.ts
│   │   ├── asaas/
│   │   │   ├── asaas-webhooks.controller.ts     # @Public() POST /webhooks/asaas/{prd,svc}
│   │   │   ├── asaas-ingestao.controller.ts     # POST /ingestao/asaas/{sincronizar,importar-csv} (evento:ingerir)
│   │   │   ├── asaas-sync.service.ts            # pagina o client + registra
│   │   │   ├── asaas-csv-import.service.ts      # quebra linhas + registra
│   │   │   └── dto/
│   │   │       ├── sincronizar.schema.ts
│   │   │       └── importar-csv.schema.ts
│   │   └── ingestao.module.ts                   # editado — +2 controllers, +2 services, +AsaasApiClient provider
│   └── financeiro/
│       └── domain/
│           └── status-map/
│               ├── asaas.ts                     # NOVO — export const ASAAS
│               ├── asaas.spec.ts                # NOVO
│               ├── index.ts                     # editado — Object.assign(MAPAS_STATUS, { ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS })
│               └── README.md                    # editado — 020 feita
└── test/
    ├── asaas-adapter.e2e-spec.ts                # NOVO
    ├── support/asaas.ts                         # NOVO — fixtures + helpers de request + dublês
    └── setup-db.ts                              # editado — fixtures ASAAS_PRD_WEBHOOK_TOKEN / ASAAS_SVC_WEBHOOK_TOKEN

.env.example                                     # editado — comentário nos ASAAS_* (nada novo)
```

**Structure Decision**: Web application (Option 2). O adapter mora em
`backend/src/ingestao/adapters/asaas/` exatamente como a visão Apêndice C prevê. Os
controllers finos ficam em `backend/src/ingestao/asaas/` (subpasta de _delivery_ do mesmo
_bounded context_, análoga a `ingestao/tmb/`). O `status-map/asaas.ts` mora no `financeiro`
(dono de `status_canonico`) — a única "pegada" desta spec fora do `ingestao`.

## Complexity Tracking

> Sem violações. A spec é 100% aditiva: nenhum arquivo de pipeline (`worker.service.ts`,
> `etapas.ts`, `pipeline-wiring.module.ts`), nenhum `classificar.ts`, nenhum schema Prisma,
> nenhuma migração, nenhuma dep, nenhuma permissão, nenhuma porta. Os arquivos compartilhados
> editados são `financeiro/domain/status-map/index.ts` (uma linha `Object.assign`) e
> `backend/test/setup-db.ts` (2 fixtures de token, mesmo padrão do `TMB_WEBHOOK_TOKEN` da
> 019) — extensão exatamente como a 018/019 documentaram.
