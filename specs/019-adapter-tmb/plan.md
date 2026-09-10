# Implementation Plan: Adaptadores de borda da plataforma TMB Educação

**Branch**: `019-adapter-tmb` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-adapter-tmb/spec.md`

## Summary

Primeira das 4 specs de adaptadores da Fase 2. Entrega a **borda de entrada da conta `TMB`**:
funções puras `parse*()` que transformam os payloads crus das 4 fontes da TMB (webhook
Vendas, webhook Financeiro, API `GET /api/pedidos`, CSV) em `EventoCanonico` — o contrato
validado do `core` que o pipeline da 006/018 já processa. Popula o vocabulário de status da
TMB em `src/financeiro/domain/status-map/tmb.ts` (o registro que a 018 deixou vazio "para as
specs 019–022 popularem").

Superfície HTTP fina (D-03): 2 webhooks **públicos** `POST /webhooks/tmb/{vendas,financeiro}`
autenticados por `WebhookAuthenticator` (003) + 2 endpoints **autenticados**
`POST /ingestao/tmb/{sincronizar,importar-csv}` sob `evento:ingerir` (catálogo desde a 006).
Todos apenas chamam `RegistrarEventoService.registrarEvento` (etapa 0, spec 006) — o worker
faz o resto. **Sem frontend, sem migração, sem tabela, sem dep nova, sem chave `.env` nova,
sem porta nova.** `CONTEXT_MODULES` segue **11**.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS. Só backend.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11 (`@Public()`, `Controller`, guards já existentes),
  `zod` 3 (DTOs de corpo/query), `csv`? **não** — parser de CSV **à mão** (0 dep, mesmo
  princípio da 015 que colou CSV como texto). Do `core`: `Dinheiro.deDecimal`/`ESCALA`,
  `parseInstante`, `PlataformaOrigem`, `eventoCanonicoSchema` (validação defensiva pós-parse).
  Do `ingestao`: `RegistrarEventoService` (porta exportada, 006). Do `auth`:
  `WebhookAuthenticator` (exportado, 003) + `RequerPermissao`.
- **`fetch` nativo do Node 24** para o `TmbApiClient` (0 dep — mesmo padrão de `GraphApiClient`
  da 011 / `SugestaoIaClient` da 013).

**Storage**: **nenhuma migração**. O adapter não tem entidade. `evento_origem`/`evento_etapa`
(006) e `transacao` (018) já existem e são escritos só pelo pipeline. `src/financeiro/domain/
status-map/tmb.ts` é **dado versionado em código**, não schema.

**Testing**:
- **Backend unit** (`jest`, sem banco), `backend/src/ingestao/adapters/tmb/`:
  - `parse-webhook-vendas.spec.ts` — fixture real "Efetivado"/"Cancelado" → `EventoCanonico`
    com `plataformaOrigem=TMB`, `idOrigem=String(pedido)`, `tipoOrigem="tmb.webhook-vendas"`,
    `statusOrigem` cru, `comprador` (nome, e-mails, telefones separados de string, documentos,
    endereço dos `endereco_*`), `valores.bruto`=`valor_principal` como `Dinheiro{BRL}`,
    `valores.taxas`=`taxa_administracao`; campo desconhecido no payload → ignorado (sem erro);
    sem `pedido` → `{ eventoCanonico: undefined, erros: [...] }` (nunca lança); `ocorridoEm`
    conforme D-09.
  - `parse-webhook-financeiro.spec.ts` — array `[{dados}]` → 1 `EventoCanonico` por item,
    `idOrigem=String(dados.pedido_id)`, `tipoOrigem="tmb.webhook-financeiro"`,
    `statusOrigem=dados.status_pagamento`; **não emite `valores`** (D-04/FR-012); objeto
    único e array vazio tolerados.
  - `parse-pedido-api.spec.ts` — item de `GET /api/pedidos` → `tipoOrigem="tmb.api"`,
    campos da API (`pedido_id`, `pais`, `cep`, `endereco_*`), `valores` conforme D-04.
  - `parse-linha-csv.spec.ts` — cabeçalho + linha → `tipoOrigem="tmb.csv"`; detecção de
    separador `,`/`;`; BOM inicial; aspas; linha sem pedido → erro, não lança.
  - `normalizar-tmb.spec.ts` — helpers locais: `telefonesDeString`, `dinheiroDeValorTmb`
    (número/string → `{ valorInteiro, moeda }` via `Dinheiro.deDecimal`; não-finito/vazio →
    `undefined`), `enderecoDeTmb`.
  - `tmb-api-client.spec.ts` — paginação: itera `pageNumber` até página vazia/`temProxima`
    falso; monta URL com `data_inicio`/`data_final`/`produto_id`; `Authorization: Bearer`;
    dublê de `fetch` (nunca rede real).
- **Backend unit**, `backend/src/financeiro/domain/`:
  - `status-map/tmb.spec.ts` — cada entrada de `TMB` casa uma fixture real; `mapearStatus('TMB',
    'tmb.webhook-vendas', 'Efetivado') === PAGO`; `'tmb.webhook-financeiro','Estornado' ===
    ESTORNADO`, `'DELETED' === CANCELADO`; bruto fora do mapa → `DESCONHECIDO`+revisar (já
    é o comportamento de `mapearStatus`, o teste fixa a regressão).
  - `status-map.spec.ts` (existente) — segue verde; `MAPAS_STATUS.TMB` agora presente.
- **Backend e2e** (`jest` e2e, Postgres real isolado, worker desligado → testes disparam
  `POST /ingestao/eventos/processar`), `backend/test/tmb-adapter.e2e-spec.ts`:
  - **US1**: `POST /webhooks/tmb/vendas` (token ok, fixture "Efetivado") → `202`; existe
    `evento_origem` `TMB`/`tmb.webhook-vendas` com `payload_bruto` == recebido e
    `evento_canonico` preenchido; `processar` → 1 `transacao` `(TMB, <pedido>)`
    `status_canonico=PAGO`, `pessoa_id` resolvido; "Cancelado" → `CANCELADO`.
  - **US1 guard**: sem header / token errado → **401**, `count(evento_origem)==0`.
  - **US2**: Vendas "Efetivado" + Financeiro "Estornado" p/ o mesmo `pedido` → 2
    `evento_origem`, **1** `transacao`, `status_canonico` final `ESTORNADO`,
    `classificacao=REEMBOLSO`. Array de 3 parcelas → 3 `evento_origem`, 1 `transacao`;
    reenviar o array → `0` novos (dedup por hash). Array vazio → `202 {registrados:0}`.
  - **US2 revisão**: `status_pagamento` inédito → `transacao.status_canonico=DESCONHECIDO`,
    `precisa_revisao=true`, `evento_origem.status=revisar`.
  - **US3**: `TmbApiClient` **dublê** (provider trocado no `Test.createTestingModule`) com 2
    páginas → `POST /ingestao/tmb/sincronizar {dataInicio,dataFinal}` → `{paginas:2,
    recebidos,novos,dedup:0,erros:[]}`; re-disparo → `novos:0`. Sem `TMB_API_KEY` no env de
    teste → **422**. (No e2e a env de teste **não** define `TMB_API_BASE_URL`/`TMB_API_KEY`
    → o teste de 422 é o caminho natural; o teste de 2 páginas injeta o client dublê que
    **não** consulta env.)
  - **US4**: `POST /ingestao/tmb/importar-csv {conteudo}` 5 boas + 1 sem pedido → `202
    {linhas:6,novos:5,ignoradas:1}`; 2º import → `novos:0`.
  - **Fronteira**: `grep` garante `src/ingestao/adapters/tmb` sem `from '../../../financeiro`
    e `src/financeiro/domain/status-map` sem `from '.*ingestao`.
  - **Regressão**: suíte 003–018 verde; `worker.service.ts`/`etapas.ts`/
    `pipeline-wiring.module.ts`/`schema.prisma` **sem diff** (assert por `git`).
  - **Catálogo**: `GET /admin/rbac/permissoes` **sem** permissão nova; `/health` = 11.

**Target Platform**: backend HTTP NestJS `:3001` (já em uso — **não subir servidor extra**).
e2e contra **Postgres isolado próprio** (container dedicado `pandora-db-spec019`, porta
**55436** — 55432/55433/55435 ocupadas por outras sessões; 55434 livre mas fica de reserva).
Dev Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta nova. Webhook: 1 parse em memória + 1..N `registrarEvento`
(cada um: 1 `sha256` + 1 `upsert`), resposta `202` sem esperar o worker. Sincronização:
`pageSize` default 50 (o da doc TMB é 7 — subimos), commit por página. Import CSV: 1
`registrarEvento` por linha, streaming de linhas (sem carregar array gigante além do texto
já recebido).

**Constraints**:
- **Nenhuma porta nova.** **Nenhuma migração.** **Nenhuma dep nova.** **Nenhuma chave `.env`
  nova** (`TMB_*` já em `accountConfig('TMB')`, spec 003).
- **Bordas finas** (Princípio III): nenhum arquivo fora de `src/ingestao/adapters/tmb/**` e
  `src/financeiro/domain/status-map/**` conhece "TMB". As `parse*()` são **puras** — sem
  NestJS, sem Prisma, sem `fetch`, sem `Date.now()`/locale (usam `parseInstante` do `core`).
- **Fronteira de contexto** (Princípio VI): `src/ingestao/adapters/tmb` importa só `core` +
  utilitários locais; **não** importa `financeiro`. O `status-map/tmb.ts` vive em
  `src/financeiro/**` e importa só o enum do `core`. ESLint `import/no-restricted-paths` +
  `grep` no e2e.
- **Log de eventos** (Princípio IV): o adapter **nunca** faz `INSERT` direto — só
  `RegistrarEventoService.registrarEvento`. `payload_bruto` é gravado **sempre**, imutável,
  antes de qualquer projeção. Erro de parse não descarta o evento (D-07).
- **Sem duplicidade** (Regra nº 1): `idOrigem = String(pedido)` nas 4 fontes (D-01); os 2
  webhooks de um pedido → mesma `(TMB, <pedido>)`; o `UPSERT_TRANSACAO` (018) já garante 1
  linha.
- **Status** (Regra nº 15): o adapter produz `statusOrigem` **cru**; a tradução é o
  `status-map/tmb.ts` + `mapearStatus` (018). Valor fora do mapa → `DESCONHECIDO` + revisão,
  nunca um palpite.
- **Dinheiro** (Padrão Transversal): `valores.*` como `{ valorInteiro: bigint ×10000, moeda:
  "BRL" }` via `Dinheiro.deDecimal`; `float` nunca sai do parser. Moeda default explícito na
  borda (`BRL`), nunca opcional.
- **Superfície de escrita mínima** (Princípio VIII): 2 webhooks + 2 endpoints de ingestão,
  todos invólucros da porta da etapa 0. **Nenhum** endpoint de escrita de `transacao`.
  Sincronização por API é **sob demanda** (`POST` manual), nunca job automático.
- **Config** (002): `TMB_*` lido só pelo `TmbApiClient`/webhook via `ConfigService` tipado —
  nunca `process.env` fora de `config/`.

**Scale/Scope**: ~18 arquivos novos no backend
(`src/ingestao/adapters/tmb/{parse-webhook-vendas,parse-webhook-financeiro,parse-pedido-api,
parse-linha-csv,normalizar-tmb,tipos,tmb-api-client,tmb-api-client.port,index}.ts` +
`fixtures/*.json|*.csv` + `*.spec.ts`; `src/ingestao/tmb/{tmb-webhooks.controller,
tmb-ingestao.controller,tmb-sync.service,tmb-csv-import.service}.ts` +
`dto/{sincronizar,importar-csv}.schema.ts`; `src/financeiro/domain/status-map/tmb.ts` +
`tmb.spec.ts`; `test/tmb-adapter.e2e-spec.ts` + `test/support/tmb.ts`), ~4 editados
(`src/ingestao/ingestao.module.ts` — +controllers/+services; `src/financeiro/domain/status-map/
index.ts` — `Object.assign(MAPAS_STATUS, { TMB })`; `src/financeiro/domain/status-map/README.md`
— marca a 019 como feita; `.env.example` — comentário nos `TMB_*` já existentes). **0
migração, 0 dep, ~4 endpoints (2 públicos + 2 autenticados), 0 frontend.** 1 doc novo
(`docs/019-adapter-tmb.md`), 3 atualizados (`CLAUDE.md` SPECKIT, `README.md`, `ROADMAP.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: nenhuma entidade nova. O adapter produz o contrato
      canônico `EventoCanonico` (id surrogate é do `evento_origem`, spec 006). `idOrigem` da
      TMB (`pedido`) entra como **valor de `EventoCanonico.idOrigem`** e vira a coluna comum
      `evento_origem.id_origem` / a chave natural `(plataforma, id_origem)` de `transacao` —
      **nunca uma PK**. `id_externo` da TMB fica só no `payload_bruto`. Granularidade
      decidida com o dono do produto (D-01: chave = pedido; D-02: parcela colapsa no pedido).
- [x] **II. Clarificar antes de assumir**: as 3 decisões de fato ambíguas (chave natural,
      granularidade de parcela, escopo CSV/API) foram ao dono do produto e respondidas em
      2026-09-10 (spec §Clarifications D-01/D-02/D-03). O resto (D-04..D-15) é default
      documentado. **Zero `NEEDS CLARIFICATION`.** O formato exato do CSV real e o nome do
      header do token são **Assumptions** explícitas — trocar qualquer um é config/fixture,
      não arquitetura.
- [x] **III. Bordas finas, núcleo canônico**: **este é o coração da spec.** Um adapter por
      `(plataforma × fonte)` — 4 funções `parse*()` puras em `src/ingestao/adapters/tmb/`,
      testadas contra **fixtures reais**, **sem tocar o banco**. Nenhuma regra de negócio
      conhece "TMB": `classificar` (006) e `UPSERT_TRANSACAO` (018) recebem só o
      `EventoCanonico` + o rótulo livre `tipoOrigem`. O vocabulário bruto de status vive
      **só** em `status-map/tmb.ts`, versionado por fonte.
- [x] **IV. Log de eventos + projeções**: os webhooks/endpoints só chamam a **porta da etapa
      0** (`RegistrarEventoService`) — `payload_bruto` imutável gravado antes de qualquer
      projeção; dedup por `(plataforma, id_origem, hash)`. O adapter **não** roda etapas,
      **não** faz `commit()`, **não** escreve projeção. Reprocessar/re-sincronizar é
      idempotente por hash. Erro de parse → evento persistido + `revisar` (nada some — D-07).
- [x] **V. Agregados derivados**: o adapter não agrega nada. Não soma dinheiro, não conta.
      `valores.*` sai como `Dinheiro{BRL}` por campo; própria/afiliada não se aplica (TMB
      não tem afiliada — `ehAfiliada` sempre `false`).
- [x] **VI. Contextos delimitados — observar, não escrever**: o adapter vive **dentro** do
      `ingestao` (Apêndice C). Escreve só via a porta do próprio contexto. **Não importa
      `financeiro`** (o `status-map/tmb.ts` é um arquivo de `financeiro`, consumido lá pela
      etapa 3 — o adapter só produz `statusOrigem` cru). **Não importa `clientes`** (a
      resolução de pessoa é da etapa 2/018). ESLint + `grep` no e2e nos dois sentidos.
- [x] **VII. Curadoria vs derivação**: não há campo curado nesta spec. `status-map/tmb.ts` é
      **derivação** (tradução determinística de vocabulário), não curadoria — vive em
      arquivo próprio, versionado, testado contra fixture. Nenhum vínculo é aplicado/
      revertido aqui.
- [x] **VIII. Superfície de escrita mínima**: 2 webhooks **públicos** (o prefixo
      `/webhooks/` já é allowlist pública desde a 003; são os invólucros da etapa 0 que a
      006 explicitamente previu para as specs 019–022) + 2 endpoints `POST /ingestao/tmb/*`
      sob a permissão **já existente** `evento:ingerir`. **Nenhuma permissão nova, nenhum
      endpoint de escrita de negócio, nenhuma sincronização automática** (a API é `POST`
      manual sob demanda — Princípio VIII literal).
- [x] **Padrões Transversais**:
      - **IDs**: n/a (sem entidade nova); `id_origem` nunca vira PK.
      - **Dinheiro**: `{ valorInteiro: bigint ×10000, moeda: "BRL" }` via `Dinheiro.deDecimal`;
        `float` nunca sai do parser (SC-009).
      - **Tempo**: `ocorridoEm` string do payload → `parseInstante` a jusante (018); o
        parser não normaliza data por conta própria (livre de locale).
      - **Status**: `statusOrigem` cru no `EventoCanonico`; `status-map/tmb.ts` +
        `mapearStatus` (018) traduzem; fora do mapa → `DESCONHECIDO` + revisão.
      - **Idempotência**: dedup por hash na etapa 0; re-webhook / re-sync / re-import →
        `novos: 0`.
      - **Auditoria**: n/a (sem escrita curada). O rastro é `evento_origem` imutável.
      - **Erros de ingestão**: parse falho → evento persistido, `evento_canonico` nulo,
        `classificar` marca `revisar`; falha de persistência → 5xx (TMB reenvia).
      - **Config/segredos**: `TMB_API_KEY`/`TMB_WEBHOOK_TOKEN`/`TMB_API_BASE_URL` já no
        `env.schema`; lidos só via `ConfigService` tipado. **0 chave nova.**
      - **Multi-conta**: `plataformaOrigem = TMB` fixo em todo `EventoCanonico` do adapter.
      - **Dependência nova**: **nenhuma**.

**Resultado do gate: PASS.** Zero item em Complexity Tracking — a spec é aditiva pura
(nenhum arquivo de pipeline/worker/schema tocado; ver FR-025 e o assert `git diff` no e2e).

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma "0 entidade, 0 migração"; os
mapeamentos de campo por fonte não introduzem nenhum campo novo em `EventoCanonico`;
`contracts/webhooks-tmb.md` confirma `202`/`401`/`5xx` e o corpo mínimo;
`contracts/ingestao-tmb-http.md` confirma `evento:ingerir` + `422` sem config;
`contracts/status-map-tmb.md` fixa o vocabulário; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/019-adapter-tmb/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── webhooks-tmb.md          # POST /webhooks/tmb/{vendas,financeiro}
│   ├── ingestao-tmb-http.md     # POST /ingestao/tmb/{sincronizar,importar-csv}
│   ├── parsers-tmb.md           # ResultadoParseTmb + mapa de campos por fonte
│   └── status-map-tmb.md        # vocabulário TMB -> StatusTransacaoCanonico
├── checklists/
│   └── requirements.md
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── ingestao/
│   │   ├── adapters/
│   │   │   └── tmb/
│   │   │       ├── index.ts                     # re-export dos 4 parsers + tipos
│   │   │       ├── tipos.ts                     # ResultadoParseTmb
│   │   │       ├── normalizar-tmb.ts            # telefonesDeString, dinheiroDeValorTmb, enderecoDeTmb (puros)
│   │   │       ├── parse-webhook-vendas.ts      # parseWebhookVendas(payload) -> ResultadoParseTmb
│   │   │       ├── parse-webhook-financeiro.ts  # parseWebhookFinanceiro(payload) -> ResultadoParseTmb[]
│   │   │       ├── parse-pedido-api.ts          # parsePedidoApi(item) -> ResultadoParseTmb
│   │   │       ├── parse-linha-csv.ts           # parseCsv(conteudo) -> ResultadoParseTmb[] (detecta separador)
│   │   │       ├── tmb-api-client.port.ts       # interface TmbApiClient + token DI
│   │   │       ├── tmb-api-client.ts            # impl com fetch nativo (paginação)
│   │   │       ├── fixtures/
│   │   │       │   ├── webhook-vendas-efetivado.json
│   │   │       │   ├── webhook-vendas-cancelado.json
│   │   │       │   ├── webhook-financeiro-parcelas.json
│   │   │       │   ├── api-pedidos-pagina.json
│   │   │       │   └── export-pedidos.csv
│   │   │       └── *.spec.ts
│   │   ├── tmb/
│   │   │   ├── tmb-webhooks.controller.ts       # @Public() POST /webhooks/tmb/{vendas,financeiro}
│   │   │   ├── tmb-ingestao.controller.ts       # POST /ingestao/tmb/{sincronizar,importar-csv} (evento:ingerir)
│   │   │   ├── tmb-sync.service.ts              # pagina o client + registra
│   │   │   ├── tmb-csv-import.service.ts        # quebra linhas + registra
│   │   │   └── dto/
│   │   │       ├── sincronizar.schema.ts
│   │   │       └── importar-csv.schema.ts
│   │   └── ingestao.module.ts                   # editado — +2 controllers, +2 services, +TmbApiClient provider
│   └── financeiro/
│       └── domain/
│           └── status-map/
│               ├── tmb.ts                       # NOVO — export const TMB: Record<...>
│               ├── tmb.spec.ts                  # NOVO
│               ├── index.ts                     # editado — Object.assign(MAPAS_STATUS, { TMB })
│               └── README.md                    # editado — 019 feita
└── test/
    ├── tmb-adapter.e2e-spec.ts                  # NOVO
    └── support/tmb.ts                           # NOVO — fixtures + helpers de request

.env.example                                     # editado — comentário nos TMB_* (nada novo)
```

**Structure Decision**: Web application (Option 2). O adapter mora em
`backend/src/ingestao/adapters/tmb/` exatamente como a visão Apêndice C prevê
(`ingestao/adapters/{tmb,…}/{webhook,csv,api}`). Os controllers finos ficam em
`backend/src/ingestao/tmb/` (subpasta de _delivery_ do mesmo _bounded context_, análoga a
`ingestao/eventos.controller.ts`). O `status-map/tmb.ts` mora no `financeiro` (dono de
`status_canonico`) — a única "pegada" desta spec fora do `ingestao`.

## Complexity Tracking

> Sem violações. A spec é 100% aditiva: nenhum arquivo de pipeline (`worker.service.ts`,
> `etapas.ts`, `pipeline-wiring.module.ts`), nenhum schema Prisma, nenhuma migração, nenhuma
> dep, nenhuma permissão, nenhuma porta. O único arquivo compartilhado editado é
> `financeiro/domain/status-map/index.ts` (uma linha `Object.assign`) — extensão exatamente
> como a 018 documentou no `README.md` daquele diretório.
