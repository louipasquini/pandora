---
description: "Task list — spec 006 evento_origem e worker de ingestão"
---

# Tasks: evento_origem e worker de ingestão — event log canônico e pipeline em etapas

**Input**: `specs/006-evento-origem-worker/` — plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md

**Tests**: incluídos — spec + constituição exigem (SC-001..013; "testes contra Postgres
real" é disciplina de projeto). Domínio puro = `jest` sem banco; porta/worker/endpoints =
`jest` e2e contra Postgres real (schema isolado, `test/setup-db.ts`); frontend = `vitest`.

**Organização**: por user story (US1..US5 da spec.md). Cada story é um incremento testável
de forma independente.

## Path Conventions

Monorepo web: `backend/src/`, `backend/test/`, `frontend/src/`. `ingestao` adota `domain/`
(puro) · `application/` (serviços/worker) · `infra/` (Prisma), como a 005 estreou.

---

## Phase 1: Setup (infra compartilhada)

**Purpose**: schema, migração, chaves de config e esqueleto do módulo.

- [x] T001 Adicionar os models Prisma em `backend/prisma/schema.prisma`: `EventoOrigem`,
  `EventoEtapa`, `IngestaoAudit` + enums `EventoOrigemStatus`, `EventoEtapaStatus`,
  `EtapaIngestao`, `Classificacao` conforme `data-model.md` — PK `id String @id @db.Uuid`,
  `@db.Timestamptz(6)`, `@map`/`@@map` snake_case, `payloadBruto`/`eventoCanonico`/
  `resultado`/`delta` como `Json`, FK `EventoEtapa.eventoOrigemId` → `EventoOrigem`
  (`onDelete: Restrict`).
- [x] T002 Gerar a migração: `npm run prisma:migrate:dev --workspace backend` →
  `backend/prisma/migrations/<ts>_ingestao/migration.sql`. Conferir/ajustar no SQL:
  `@@unique([plataformaOrigem, idOrigem, hash])` em `evento_origem`,
  `@@unique([eventoOrigemId, etapa])` em `evento_etapa`, e índices
  `evento_origem (status, recebido_em)`, `evento_origem (plataforma_origem)`,
  `evento_origem (classificacao)`, `evento_etapa (status)`,
  `ingestao_audit (entidade, entidade_id)`.
- [x] T003 [P] Config: em `backend/src/config/env.schema.ts` adicionar
  `INGESTAO_WORKER_ENABLED` (`z.coerce.boolean().default(true)`),
  `INGESTAO_WORKER_INTERVALO_MS` (`z.coerce.number().int().min(250).default(5000)`),
  `INGESTAO_WORKER_MAX_TENTATIVAS` (`z.coerce.number().int().min(1).default(3)`),
  `INGESTAO_WORKER_LOTE` (`z.coerce.number().int().min(1).default(50)`); re-exportar o
  contrato tipado em `backend/src/core/config/` (Padrão 002); acrescentar as 4 chaves (com
  defaults) a `.env`, `.env.example` e ao bloco `env:` de `.github/workflows/ci.yml`.
  Forçar `INGESTAO_WORKER_ENABLED=false` no `backend/test/setup-db.ts` (ou no `env` do
  jest e2e).
- [x] T004 [P] Criar as pastas/barrels do contexto: `backend/src/ingestao/domain/index.ts`,
  `backend/src/ingestao/application/index.ts`, `backend/src/ingestao/infra/index.ts`
  (re-exports; preenchidos ao longo das fases).

---

## Phase 2: Foundational (pré-requisito bloqueante)

**Purpose**: catálogo RBAC, tipos, auditoria, _wiring_ do módulo e helpers de teste que
TODAS as stories usam. ⚠️ Nenhuma story começa antes disto.

- [x] T005 Estender o catálogo RBAC em `backend/src/auth/rbac/catalogo.ts`: adicionar
  `evento:ver`, `evento:reprocessar`, `evento:ingerir` ao array `PERMISSOES` (rótulos de
  `contracts/rbac-catalogo.md`), mantendo a ordem e o `satisfies`.
- [x] T006 [P] Atualizar `backend/src/auth/rbac/catalogo.spec.ts`: asserção de que o recurso
  `evento` existe com as 3 ações, ids únicos, `recurso` = prefixo do id.
- [x] T007 [P] `backend/src/ingestao/domain/tipos.ts` — `EntradaIngestao`,
  `ResultadoIngestao`, `ResultadoEtapa` (`{ status: 'ok'|'erro'|'pulada'; resultado?;
  erroDetalhe?; revisar?; motivo? }`), `EtapaCtx`, `AcaoEtapa`
  (`'EXECUTAR'|'BLOQUEADA'|'JA_OK'|'ESGOTADA'`), `ResumoPassada`, re-export dos enums do
  `@prisma/client`.
- [x] T008 [P] `backend/src/ingestao/application/ingestao-audit.service.ts` +
  `backend/src/ingestao/infra/ingestao-audit.repository.ts` — `registrar(entrada)` via
  `montarRegistroAuditoria` do core (`origem = AJUSTE_MANUAL`, `agoraUtc()`), `INSERT`
  append-only em `ingestao_audit`; espelha `RbacAuditService`/`ClientesAuditService`.
- [x] T009 `backend/src/ingestao/ingestao.module.ts` — reescrever: `imports: [PrismaModule]`
  (+ `AuthModule` se preciso p/ tipos/decorator), `providers`/`controllers` (adicionados
  nas fases), `exports: [RegistrarEventoService]` (porta p/ os adapters 019–022).
  `OnModuleInit` loga uma vez `ingestao.ready` (modo do worker + `evento:*` registrado, sem
  dados sensíveis). **Não** importa `financeiro`/`clientes`/`catalogo`/`contratos`.
- [x] T010 [P] `backend/src/ingestao/infra/evento.repository.ts` (esqueleto) —
  `constructor(prisma)`, métodos declarados vazios (implementados por fase:
  `upsertPorChave`, `criarEtapasIniciais`, `selecionarElegiveis`, `carregarEtapas`,
  `atualizarEtapa`, `atualizarEventoDerivado`, `listar`, `detalhe`, `resetarEtapasNaoOk`).
- [x] T011 [P] `backend/test/support/ingestao.ts` — helpers e2e: `ingerirViaApi(entrada)`,
  `ingerirViaPorta(app, entrada)`, `montarEventoCanonico(over?)` (fixture válido mínimo),
  `rodarPassada(app)` (chama `POST /ingestao/eventos/processar`), `registrarEtapaFake(app,
  { nome, dependeDe, comportamento })` (troca um item do `ETAPAS` em runtime de teste),
  `tokenSemPermissao()` (reusa `issueUserToken` da 004).

**Checkpoint**: `npm run typecheck --workspace backend` verde; app sobe (`RbacRouteAudit`
não aborta — catálogo tem `evento:*`); `/health` ainda 11 contextos.

---

## Phase 3: User Story 1 — adapter registra evento cru, dedup e imutável (P1) 🎯 MVP

**Goal**: a porta `registrarEvento` (etapa 0) — calcula `hash`, aplica a dedup
`(plataforma_origem, id_origem, hash)`, persiste imutável, cria as 7 `evento_etapa`, devolve
`{ eventoId, criado }`. Idempotente. Contrato `EventoCanonico` definido e validado.

**Independent Test**: `contracts/porta-registrar-evento.md` + `contracts/ingestao-eventos.md`
§`POST /ingestao/eventos`.

- [x] T012 [P] [US1] `backend/src/ingestao/domain/hash-evento.ts` — `hashEvento(payloadBruto:
  unknown): string`: `canonicalize` (chaves ordenadas recursivamente, sem espaço) + SHA-256
  hex via `node:crypto`. Lança se `payloadBruto` não for JSON-serializável.
- [x] T013 [P] [US1] `backend/src/ingestao/domain/hash-evento.spec.ts` — mesma entrada →
  mesmo hash; ordem de chaves irrelevante; `TZ`/_locale_ irrelevante; payload alterado →
  hash diferente; valor circular/função → lança.
- [x] T014 [P] [US1] `backend/src/ingestao/domain/evento-canonico.ts` — schema `zod`
  (`EventoCanonicoSchema`) + tipo `EventoCanonico` conforme `contracts/evento-canonico.md`
  (núcleo obrigatório; opcionais validados se presentes; `Dinheiro` via `{ valorInteiro:
  z.bigint(), moeda: MoedaSchema }`; `ocorridoEm` string passada a `parseInstante`).
- [x] T015 [P] [US1] `backend/src/ingestao/domain/evento-canonico.spec.ts` — aceita mínimo
  válido; rejeita `plataformaOrigem` fora do enum, `idOrigem` vazio, `moeda` ausente num
  `Dinheiro`, `valorInteiro` não-bigint; `ocorridoEm` lixo → aceito (motivo registrado, não
  rejeita).
- [x] T016 [US1] `backend/src/ingestao/infra/evento.repository.ts` (etapa 0) —
  `upsertPorChave({ plataformaOrigem, idOrigem, hash, payloadBruto, eventoCanonico? })`:
  transação; `create` se novo (+ `criarEtapasIniciais`: `REGISTRAR=ok`, 6 demais
  `pendente`), captura `P2002` → `reentregas += 1` + `ultimoRecebidoEm` e retorna a linha
  existente; devolve `{ evento, criado }`.
- [x] T017 [US1] `backend/src/ingestao/application/registrar-evento.service.ts` —
  `registrarEvento(entrada)`: valida `EntradaIngestao` (zod: `plataformaOrigem` enum,
  `idOrigem`/`tipoOrigem` não vazios, `payloadBruto` JSON-serializável, `eventoCanonico?`
  contra `EventoCanonicoSchema` → 422), `hash = hashEvento(payloadBruto)`, chama
  `upsertPorChave`, retorna `{ eventoId, criado }`. Registrar no `IngestaoModule` e
  **exportar**.
- [x] T018 [US1] `backend/src/ingestao/dto/ingerir-evento.schema.ts` (zod) +
  `backend/src/ingestao/eventos.controller.ts` — `POST /ingestao/eventos`
  (`@RequerPermissao('evento:ingerir')`): 201 `{ eventoId, criado:true }` / 200
  `{ criado:false }` / 422. Zod pipe no corpo. Registrar controller no `IngestaoModule`.
- [x] T019 [US1] `backend/test/ingestao.e2e-spec.ts` (bloco `ingestão`) — migração cria as 3
  tabelas; `POST` novo → 201 + `REGISTRAR=ok` + 6 `pendente`; reentrega idêntica → 200 +
  `criado:false` + `reentregas` incrementado + `payloadBruto` intacto; `idOrigem` vazio /
  `plataformaOrigem` inválida / `payloadBruto` não-JSON → 422; 10 chamadas concorrentes
  mesma chave → 1 linha; sem token → 401; token de `Usuario` sem perfil → 403; credencial
  de serviço → 2xx.

**Checkpoint**: `npm test --workspace backend` verde para `domain/` (hash, canônico);
`ingestao.e2e` §ingestão verde — a porta que os adapters 019–022 vão chamar está pronta
(SC-001, SC-008 parcial, SC-010 parcial).

---

## Phase 4: User Story 2 — worker processa pendentes em etapas independentes, idempotente e reprocessável (P1)

**Goal**: `processarPassada()` seleciona elegíveis (trava `SKIP LOCKED`), roda cada etapa
em transação própria, grava `evento_etapa`, deriva `evento_origem.status`. Falha isolada;
dependente vira `bloqueada`; retry até `MAX`; idempotente. Laço `setInterval` in-house.

**Independent Test**: `contracts/worker-e-etapas.md`.

- [x] T020 [P] [US2] `backend/src/ingestao/domain/etapas.ts` — `ETAPAS: readonly EtapaDef[]`
  (`REGISTRAR`..`PROJETAR_CONTRATO`, `ordem`, `dependeDe`, `especDona`) conforme
  `contracts/worker-e-etapas.md`; `CLASSIFICAR.executar` = _placeholder_ (implementado em
  US3); as demais apontam para as _no-op_ de T021.
- [x] T021 [P] [US2] `backend/src/ingestao/application/etapas-noop/` — `resolver-pessoa.noop.ts`
  (18), `upsert-transacao.noop.ts` (18), `resolver-vinculo.noop.ts` (24),
  `resolver-oferta.noop.ts` (23), `projetar-contrato.noop.ts` (25): cada `executar` devolve
  `{ status: 'pulada', resultado: { implementadaNa: <n> } }`.
- [x] T022 [P] [US2] `backend/src/ingestao/domain/plano-passada.ts` — `planejarPassada(mapa,
  max) → { acoes, statusEvento }` puro, regras de `data-model.md` §plano-passada
  (`JA_OK`/`ESGOTADA`/`BLOQUEADA`/`EXECUTAR`; `statusEvento` `ok`/`revisar`/`erro`/`pendente`
  derivado).
- [x] T023 [P] [US2] `backend/src/ingestao/domain/plano-passada.spec.ts` — dependência
  não-`ok` → `BLOQUEADA`; `erro` com `tentativas>=max` → `ESGOTADA`; todas `ok`/`pulada` →
  evento `ok`; alguma `ESGOTADA` e sem `EXECUTAR` → `erro`; alguma `revisar` sem `erro` →
  `revisar`; determinismo N×.
- [x] T024 [US2] `backend/src/ingestao/infra/evento.repository.ts` (worker) —
  `selecionarElegiveis(lote)` (`$queryRaw` `SELECT id … FOR UPDATE SKIP LOCKED` dos eventos
  com etapa `pendente`/`bloqueada`/(`erro` e `tentativas < max`), ordem `recebido_em asc`),
  `carregarEtapas(eventoId)`, `atualizarEtapa(id, patch)` (status/resultado/erroDetalhe/
  tentativas/executadoEm), `atualizarEventoDerivado(eventoId, { status, classificacao?,
  erroDetalhe? })`.
- [x] T025 [US2] `backend/src/ingestao/application/worker.service.ts` —
  `processarPassada(): Promise<ResumoPassada>`: seleciona ≤ `INGESTAO_WORKER_LOTE`; por
  evento (transação) roda `planejarPassada` e executa as etapas `EXECUTAR` na ordem de
  `ETAPAS` (cada uma em sub-transação; `ok`/`pulada`/`erro`+`tentativas++`; sem rollback das
  anteriores); recomputa e grava o `status`. Acumula o resumo.
- [x] T026 [US2] `backend/src/ingestao/application/worker.scheduler.ts` — `setInterval`
  in-house com `OnModuleInit`/`OnModuleDestroy`, `INGESTAO_WORKER_INTERVALO_MS`, _flag_ de
  reentrância, `try/catch` que loga e segue; **não** agenda se `INGESTAO_WORKER_ENABLED`
  falso. Registrar `WorkerService` + `WorkerScheduler` no `IngestaoModule`.
- [x] T027 [US2] `backend/src/ingestao/eventos.controller.ts` (+ rota) —
  `POST /ingestao/eventos/processar` (`@RequerPermissao('evento:reprocessar')`) → roda
  `processarPassada()` síncrono e devolve `ResumoPassada`.
- [x] T028 [US2] `backend/test/ingestao.e2e-spec.ts` (bloco `worker`) — `POST /processar`
  leva um evento (com etapa `CLASSIFICAR` _stub_ que resolve `ok` até US3) a `ok`, 2–6
  `pulada`; `processarPassada` 3× sobre backlog sem falha → estado idêntico, 0 etapa `ok`
  reexecutada; 3 eventos, 1 com **etapa fake** que falha → os outros 2 chegam a `ok`; etapa
  fake que falha 2× e passa na 3ª (`MAX=3`) → `tentativas` 1→2→3, termina `ok`; etapa fake
  que falha sempre → após `MAX` passadas fica `erro` terminal, a passada seguinte não a
  toca; etapa fake dependente de outra `erro` → `bloqueada`, vira `pendente` quando a
  dependência fica `ok`; 2 `processarPassada` concorrentes → nenhum efeito duplicado.

**Checkpoint**: SC-002, SC-002a, SC-003, SC-004 verdes; o backbone do Princípio IV está de
pé — etapas 018+ só plugam.

---

## Phase 5: User Story 3 — etapa 1 classifica; desconhecido vira `revisar` sem bloquear (P2)

**Goal**: `classificar(canonico, tipoOrigem)` puro com o enum congelado e as regras locais;
integrado como `CLASSIFICAR.executar`; ausência/indecisão → `DESCONHECIDO` + `revisar` +
`erroDetalhe`, sem bloquear outros eventos.

**Independent Test**: `data-model.md` §classificar + `spec.md` US3.

- [x] T029 [P] [US3] `backend/src/ingestao/domain/classificar.ts` —
  `classificar(canonico: EventoCanonico | null, tipoOrigem: string) → { classificacao,
  revisar, motivo? }` com a ordem de decisão de `data-model.md` (`null` → `DESCONHECIDO`+
  `revisar`; estorno → `REEMBOLSO`; `referenciaExterna` a outra plataforma → `DESCONHECIDO`+
  `revisar` (024); `ehAfiliada` → `VENDA_AFILIADA`; assinatura → `RECORRENCIA`; senão
  `VENDA_PROPRIA`). Pura, determinística.
- [x] T030 [P] [US3] `backend/src/ingestao/domain/classificar.spec.ts` — cada regra local;
  `canonico=null` → `DESCONHECIDO`+`revisar`; `classificacao` preliminar fora do enum →
  ignorada; `referenciaExterna` cross-plataforma → `revisar` com motivo "spec 024";
  determinismo N×.
- [x] T031 [US3] Integrar em `backend/src/ingestao/domain/etapas.ts`:
  `CLASSIFICAR.executar(ctx)` = lê `ctx.eventoCanonico` (do `evento_origem.eventoCanonico`),
  chama `classificar`, devolve `{ status: 'ok', resultado: { classificacao, motivo? },
  revisar }`. O `worker.service` grava `evento_origem.classificacao` e, se `revisar`,
  `status = revisar` + `erroDetalhe = motivo` (a etapa em si fica `ok`).
- [x] T032 [US3] `backend/test/ingestao.e2e-spec.ts` (bloco `classificação`) — evento com
  `eventoCanonico` de venda própria → `classificacao = VENDA_PROPRIA`, `status = ok`;
  reembolso por `tipoOrigem` → `REEMBOLSO`; sem `eventoCanonico` → `DESCONHECIDO` +
  `revisar` + `erroDetalhe`; `classificacao` fora do enum → `DESCONHECIDO`; um evento em
  `revisar` numa passada não impede os outros de chegarem a `ok`.

**Checkpoint**: SC-005 verde; a etapa 1 é honesta ("na dúvida, `revisar`" — regra #15).

---

## Phase 6: User Story 4 — painel de eventos em `revisar` / `erro`, com reprocessar (P2)

**Goal**: `GET /ingestao/eventos` (lista filtrável, _default_ `revisar`+`erro`),
`GET /ingestao/eventos/{id}` (payload + linha do tempo), `POST /ingestao/eventos/{id}/
reprocessar` (auditado). Painel no frontend.

**Independent Test**: `contracts/ingestao-eventos.md` + `contracts/frontend-eventos.md`.

- [x] T033 [P] [US4] `backend/src/ingestao/dto/listar-eventos.schema.ts` +
  `backend/src/ingestao/dto/reprocessar.schema.ts` (zod) — filtros (`status` CSV/`todos`,
  `plataformaOrigem`, `tipoOrigem`, `classificacao`, `recebidoDe`/`recebidoAte`, `pagina`,
  `tamanho` teto 100) e `{ forcar?: boolean }`.
- [x] T034 [US4] `backend/src/ingestao/application/eventos.query.ts` —
  `listar(filtros)` (default `status ∈ {revisar,erro}`; ordenação `recebido_em desc, id
  desc`; sem `payloadBruto` na lista; lista vazia OK) e `detalhe(id)` (metadados +
  `payloadBruto` + `eventoCanonico` + `etapas[]` ordenadas; 404 se inexistente).
- [x] T035 [US4] `backend/src/ingestao/application/reprocessar-evento.service.ts` —
  `reprocessar(id, { forcar }, sujeito)`: 404 inexistente; 409 se alguma etapa
  `processando`; devolve `evento_etapa` não-`ok` (`erro`/`bloqueada`/`pendente`) a
  `pendente` + `tentativas = 0` + evento `pendente`; `forcar` reenfileira da etapa 1 mesmo
  se tudo `ok`; grava **1** `ingestao_audit` (`delta = { etapasReenfileiradas, forcar }`);
  no-op (tudo `ok`, sem `forcar`) → **não** audita.
- [x] T036 [US4] `backend/src/ingestao/eventos.controller.ts` (+ rotas) —
  `GET /ingestao/eventos` e `GET /ingestao/eventos/:id` (`@RequerPermissao('evento:ver')`),
  `POST /ingestao/eventos/:id/reprocessar` (`@RequerPermissao('evento:reprocessar')`).
- [x] T037 [US4] `backend/test/ingestao.e2e-spec.ts` (bloco `painel`) — lista _default_ só
  `revisar`/`erro`; `status=todos` + filtros combinam; paginação (teto 100); lista vazia →
  `{ itens: [], total: 0 }`; detalhe traz `payloadBruto` + 7 `etapas`; reprocessar zera
  `tentativas` + evento `pendente` + **1** `ingestao_audit`; `processando` → 409;
  inexistente → 404; tudo `ok` sem `forcar` → no-op + 0 audit; 401/403 nos 3 endpoints.
- [x] T038 [P] [US4] `frontend/src/shell/nav-items.ts` (+ `{ label:'Eventos', to:'/eventos',
  requerPermissao:'evento:ver' }`) e `frontend/src/app/router.tsx` (rotas `/eventos` e
  `/eventos/:id` dentro do `AppShell`, sob `<RequirePermissao perm="evento:ver">`).
- [x] T039 [P] [US4] `frontend/src/eventos/eventos-api.ts` (`apiFetch` tipado) +
  `frontend/src/eventos/EventosListPage.tsx` — filtros (conta/status/tipo/data, _default_
  `revisar`+`erro`, alternador "todos"), paginação, tabela de resumo.
- [x] T040 [P] [US4] `frontend/src/eventos/EventoDetailPage.tsx` +
  `frontend/src/eventos/ReprocessarButton.tsx` — cabeçalho, `payloadBruto` em `<pre>` com
  `overflow:auto`, linha do tempo das 7 etapas (status/tentativas/executadoEm/resultado),
  **Reprocessar** só com `evento:reprocessar` (invalida a query ao concluir).
- [x] T041 [US4] `frontend/src/test/setup.ts` (+ `fetch` default p/ `/ingestao/eventos`
  lista vazia) e `frontend/src/eventos/*.test.tsx` — nav esconde **Eventos** sem
  `evento:ver`; rota direta sem permissão → `SemPermissao` (≠ Login); _default_ mostra só
  `revisar`/`erro`; detalhe com linha do tempo; 403 numa chamada → banner + sessão intacta;
  **Reprocessar** ausente sem `evento:reprocessar`.

**Checkpoint**: SC-006, SC-007, SC-013 verdes; operação enxerga e resolve o _backlog_.

---

## Phase 7: User Story 5 — etapas 2–6 são um encaixe plugável que as specs 018+ preenchem (P3)

**Goal**: o registro `ETAPAS` é ordenado, nomeado, com dependências declaradas; 2–6 são
_no-op_ `pulada` com o nº da spec dona; substituíveis sem tocar o worker.

**Independent Test**: `spec.md` US5 + SC-012.

- [x] T042 [US5] Consolidar o barrel `backend/src/ingestao/domain/index.ts` exportando
  `ETAPAS` e conferir que cada _no-op_ de T021 está registrada com a `especDona` correta
  (2→18, 3→18, 4→24, 5→23, 6→25) e `dependeDe` conforme `data-model.md`.
- [x] T043 [US5] `backend/test/ingestao.e2e-spec.ts` (bloco `plugável`) — `ETAPAS` tem
  exatamente as 7 etapas na ordem 0..6; evento processado → 2–6 com `evento_etapa` `pulada`
  e `resultado.implementadaNa` correto, e **nenhuma** delas toca `pessoa`/`transacao`/
  `oferta`/`contrato`; `registrarEtapaFake` substitui uma etapa e o worker passa a chamá-la
  sem outra mudança; SC-012: `grep -R "pessoa\|transacao\|oferta\|contrato"
  backend/src/ingestao/application/etapas-noop` (fora de comentário) não retorna nada e o
  `IngestaoModule` não importa `Financeiro/Clientes/Catalogo/ContratosModule`.

**Checkpoint**: US5 fecha; o worker está "pronto para as specs 018–025" sem reescrita.

---

## Phase 8: Polish & cross-cutting

- [x] T044 [P] Regressão e2e: `auth.e2e-spec.ts`, `rbac.e2e-spec.ts`, `clientes.e2e-spec.ts`,
  `health.e2e-spec.ts`, `context-modules.e2e-spec.ts` (ainda **11**) — verdes sem alteração
  (SC-011).
- [x] T045 [P] Portões estáticos na raiz: `npm run lint`, `npm run typecheck`,
  `npm run build` — verde (`import/no-restricted-paths`: `ingestao` só importa `core`/`auth`;
  `no-restricted-syntax`: sem `process.env` fora de `config/`/`core/`).
- [x] T046 [P] Escrever `docs/006-evento-origem-worker.md` — `evento_origem`/`evento_etapa`/
  `ingestao_audit`, contrato `EventoCanonico`, `hashEvento` + dedup, registro `ETAPAS` +
  grafo de dependências, `plano-passada`, worker (`setInterval` in-house + `SKIP LOCKED` +
  retry até `MAX` + `bloqueada`), classificação (enum congelado + regras locais),
  reprocessamento auditado, painel. Seguir o formato dos `docs/00X-*.md`.
- [x] T047 Atualizar `CLAUDE.md` — bloco novo em "Stack" para o contexto `ingestao`
  (entidades, `EventoCanonico`, worker + etapas + dependências + retry, classificação,
  catálogo RBAC `evento:*`, 4ª migração) + link do doc. O bloco `<!-- SPECKIT -->` já
  aponta a 006 (feito no plan).
- [x] T048 [P] Atualizar `README.md` — nota da 4ª migração de negócio no "Como rodar"
  (só `prisma migrate`); menção a `ingestao`/`evento_origem`/worker no mapa de contextos;
  as 4 chaves `INGESTAO_WORKER_*` na tabela de env.
- [x] T049 [P] Atualizar `ROADMAP.md` — marcar `- [x] **006 — evento-origem-worker**` com o
  resumo do que entrou (data 2026-09-03), no padrão das specs 001–005.
- [x] T050 [P] Atualizar as memórias do agente:
  `C:\Users\Amore\.claude\projects\C--Users-Amore-Codes-projeto-pandora\memory\pandora-roadmap-status.md`
  (006 → concluída; próxima = 007 crm-administracao) e `MEMORY.md` (linha do índice).
- [x] T051 Rodar `quickstart.md` §"Fluxo manual" e conferir: `POST /ingestao/eventos` novo
  e reentrega; `POST /processar` → `ok`/`revisar`; painel _default_ só `revisar`/`erro`;
  reprocessar → `select * from ingestao_audit` = 1 por ação; `select id from pessoa` /
  `transacao` intocados.
- [x] T052 `netstat`/`docker ps` — confirmar nenhuma porta nova (3001/5174/55432 já do
  projeto); `GET /health` → 11 contextos.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → stories.
- **US1 (P1)** — depende só da Phase 2. MVP (a porta de ingestão).
- **US2 (P1)** — depende da Phase 2 e de US1 (usa `evento_origem`/`evento_etapa` criados
  pela porta). `plano-passada` (T022) e as _no-op_ (T021) são puros e podem ir em paralelo
  com US1.
- **US3 (P2)** — depende de US2 (integra `CLASSIFICAR` no worker). `classificar.ts` (T029)
  é puro e pode ir cedo, em paralelo com US1/US2.
- **US4 (P2)** — depende de US1+US2 (precisa de eventos em vários `status` para os testes);
  T038–T040 (frontend) podem começar cedo com mocks.
- **US5 (P3)** — depende de US2 (o registro `ETAPAS` e as _no-op_ já existem lá); é
  sobretudo consolidação + testes.
- **Phase 8** — depois de todas.

## Parallel Opportunities

- Phase 1: T003, T004 em paralelo. Phase 2: T006, T007, T008, T010, T011 em paralelo.
- US1: T012+T013, T014+T015 em paralelo; T016 → T017 → T018 → T019 em série.
- US2: T020, T021, T022, T023 em paralelo (domínio puro / arquivos distintos); T024 → T025
  → T026 → T027 → T028 em série.
- US3: T029+T030 em paralelo; T031 depois; T032 depois.
- US4: T033 solo; T038, T039, T040 em paralelo; T034/T035 em paralelo; T036 → T037; T041 no fim.
- Phase 8: T044, T045, T046, T048, T049, T050 em paralelo.

## Implementation Strategy

- **MVP = US1** (porta `registrarEvento` + `EventoCanonico` + migração): o event log
  imutável com dedup — já dá para os adapters 019–022 e a reingestão da 031 gravarem, mesmo
  sem worker (SC-001, SC-008).
- **Incremento 2 = US1+US2**: worker rodando o pipeline em etapas com as 2–6 _no-op_ — o
  Princípio IV de pé (SC-002..004).
- **Incremento 3 = +US3**: classificação honesta na etapa 1 (SC-005).
- **Incremento 4 = +US4**: painel de `revisar`/`erro` + reprocessar (SC-006/007/013).
- **Incremento 5 = +US5**: consolidação do encaixe plugável (SC-012).
- **Fecho = Phase 8**: docs, regressão, ROADMAP, memórias, quickstart.

## Format validation

Todas as tasks: `- [ ] Txxx [P?] [USx?] descrição com caminho de arquivo`. Setup/
Foundational/Polish sem `[US]`; fases de story com `[US1]`..`[US5]`.
