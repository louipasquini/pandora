---
description: "Task list — 001 bootstrap-projeto"
---

# Tasks: Bootstrap do Projeto (esqueleto do monorepo)

**Input**: Design documents from `specs/001-bootstrap-projeto/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: incluídos — a spec pede explicitamente harness de teste contra Postgres real
(FR-013…FR-016) e testes de contrato (`contracts/health.md`, `contracts/config-schema.md`).

**Organização**: por user story. Cada fase de story é um incremento testável de forma
independente. Setup e Foundational são pré-requisitos de todas as stories.

**Convenções de caminho**: monorepo npm workspaces — `backend/` e `frontend/` na raiz.

---

## Phase 1: Setup (infraestrutura compartilhada)

**Objetivo**: raiz do monorepo e reprodutibilidade do ambiente.

- [X] T001 Criar `package.json` na raiz com `"private": true`, `"workspaces": ["backend", "frontend"]`, `"engines": { "node": ">=24 <25" }` e scripts agregados `lint`, `lint:fix`, `format`, `typecheck`, `build`, `test` como `npm run -ws --if-present <script>`; gerar `package-lock.json` único
- [X] T002 [P] Criar `.nvmrc` com `24` na raiz
- [X] T003 [P] Criar `.gitignore` (node_modules, dist, build, coverage, .env, .env.*, !.env.example, .vite, .DS_Store, *.log, .idea, .vscode/*) e `.editorconfig` (utf-8, lf, indent 2) na raiz
- [X] T004 [P] Criar `docker-compose.yml` na raiz: serviço `db` (`postgres:16-alpine`), portas `55432:5432`, `POSTGRES_USER=pandora`/`POSTGRES_PASSWORD=pandora`/`POSTGRES_DB=pandora`, volume nomeado `pandora-pgdata`, `healthcheck` com `pg_isready`
- [X] T005 Criar `.env.example` na raiz com blocos **Runtime** (`NODE_ENV`, `PORT=3001`, `VITE_PORT=5174`), **Banco** (`DATABASE_URL`, `TEST_DATABASE_URL` apontando para `localhost:55432`) e **Auth de serviço** (`SERVICE_JWT_SECRET`, `SERVICE_CLIENT_ID`, `SERVICE_CLIENT_SECRET` — placeholders inertes). Blocos das 7 contas entram na T046
- [X] T006 [P] Criar a pasta `docs/` com um `docs/.gitkeep` (o documento `docs/001-bootstrap-projeto.md` é escrito na T049)

---

## Phase 2: Foundational (bloqueia todas as user stories)

**Objetivo**: backend e frontend compiláveis, com Prisma, config e harness de teste — sem
`/health`, sem shell da marca, sem módulos de contexto ainda.

### Backend — base

- [X] T007 Criar `backend/package.json`: deps `@nestjs/common@^11 @nestjs/core@^11 @nestjs/platform-express@^11 @nestjs/config@^4 @prisma/client@^6 zod@^3 uuid@^11 reflect-metadata rxjs`; devDeps `prisma@^6 typescript@^5.6 @types/node ts-node ts-jest jest @types/jest supertest @types/supertest @nestjs/testing @nestjs/schematics eslint@^9 typescript-eslint eslint-config-prettier eslint-plugin-import prettier`; scripts `start:dev`, `build`, `start`, `lint`, `lint:fix`, `format`, `typecheck`, `test`, `test:e2e`, `prisma:migrate:dev`, `prisma:migrate:deploy`, `prisma:reset`
- [X] T008 [P] Criar `backend/tsconfig.json`, `backend/tsconfig.build.json` e `backend/nest-cli.json` (target ES2023, `experimentalDecorators`, `emitDecoratorMetadata`, `strict: true`, `outDir dist`)
- [X] T009 [P] Criar `backend/eslint.config.mjs` (flat, `typescript-eslint` recommended-type-checked + `eslint-config-prettier`) e `backend/.prettierrc` — a regra de fronteira entre contextos é adicionada na T034
- [X] T010 [P] Criar `backend/prisma/schema.prisma`: `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }` e `generator client { provider = "prisma-client-js" }` — **sem model de negócio**
- [X] T011 Rodar `prisma migrate dev --name baseline` contra o Postgres do Compose para gerar `backend/prisma/migrations/<ts>_baseline/` (migração vazia/baseline); confirmar `prisma migrate deploy` idempotente
- [X] T012 [P] Criar `backend/src/prisma/prisma.service.ts` (`PrismaClient` com `onModuleInit`/`onModuleDestroy` e método `ping(): Promise<boolean>` via `SELECT 1`) e `backend/src/prisma/prisma.module.ts` (`@Global()`, exporta `PrismaService`)
- [X] T013 Criar `backend/src/config/env.schema.ts`: `zod` schema com **Runtime + Banco + Auth** conforme `contracts/config-schema.md` (contas entram na T045); exportar `envSchema` e `type AppConfig = z.infer<typeof envSchema>`
- [X] T014 [P] Criar `backend/src/config/config.module.ts`: `ConfigModule.forRoot({ isGlobal: true, validate: (raw) => envSchema.parse(raw) })`
- [X] T015 [P] Criar `backend/src/config/env.schema.spec.ts` (unit): `.env.example` parseia; sem `DATABASE_URL` → lança citando a chave; `PORT="abc"` → lança citando `PORT`; `SERVICE_JWT_SECRET` curto → lança (casos de conta entram na T047)
- [X] T016 Criar `backend/src/app.module.ts` importando `ConfigModule` e `PrismaModule` (módulos de contexto e `HealthModule` são adicionados nas T023/T035); exportar a constante `CONTEXT_MODULES: string[]` (os 11 nomes) de um único arquivo `backend/src/app.context-modules.ts`
- [X] T017 [P] Criar `backend/src/main.ts`: `NestFactory.create(AppModule)`, obter `PORT` do `ConfigService<AppConfig, true>`, `app.listen(PORT)`; qualquer erro de `envSchema.parse` deve abortar o processo com stderr do zod

### Backend — harness de teste (Postgres real)

- [X] T018 Criar `backend/test/setup-db.ts` e `backend/test/teardown-db.ts` conforme `data-model.md` §`TestDbContext`: gera `schema = "t_"+Date.now().toString(36)+"_"+randomHex(4)`, valida `TEST_DATABASE_URL` (ausente → `throw new Error('TEST_DATABASE_URL ausente: configure o banco de teste (ver README)')`), monta `DATABASE_URL=${TEST_DATABASE_URL}?schema=${schema}`, roda `prisma migrate deploy`, injeta em `process.env`; teardown faz `DROP SCHEMA "<schema>" CASCADE`
- [X] T019 [P] Criar `backend/jest.config.ts` (unit, `testRegex` `.spec.ts$`, `ts-jest`) e `backend/test/jest-e2e.config.ts` (`.e2e-spec.ts$`, `globalSetup`/`globalTeardown` = setup-db/teardown-db, `maxWorkers: 2`); ligar `test`/`test:e2e` no `backend/package.json`

### Frontend — base

- [X] T020 Criar `frontend/package.json`: deps `react@^19 react-dom@^19 @tanstack/react-query@^5 react-router@^7 @fontsource/inter`; devDeps `vite@^6 @vitejs/plugin-react @tailwindcss/vite tailwindcss@^4 typescript@^5.6 @types/react @types/react-dom vitest @testing-library/react @testing-library/jest-dom jsdom eslint@^9 typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh eslint-config-prettier prettier`; scripts `dev`, `build`, `preview`, `lint`, `lint:fix`, `format`, `typecheck`, `test`
- [X] T021 [P] Criar `frontend/index.html`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/vite.config.ts` (`plugins: [react(), tailwindcss()]`, `server: { port: Number(process.env.VITE_PORT ?? 5174) }`), `frontend/eslint.config.mjs` e `frontend/.prettierrc`
- [X] T022 [P] Criar `frontend/vitest.config.ts` (`environment: 'jsdom'`, `setupFiles` com `@testing-library/jest-dom`, `globals: true`)

**Checkpoint**: `npm ci` na raiz instala os 2 workspaces; `npm run -ws typecheck` e
`npm run -ws build` passam; `docker compose up -d db` + `npm run -w backend prisma:migrate:deploy` aplicam a baseline.

---

## Phase 3: User Story 1 — Subir o ambiente a partir de um clone limpo (Priority: P1) 🎯 MVP

**Goal**: de um clone limpo, seguindo só o README: backend responde `/health`, frontend
renderiza, testes verdes contra Postgres real, checks passam, e boot sem env obrigatória
falha cedo.

**Independent Test**: em máquina limpa, executar os passos do `quickstart.md` V1, V3, V5,
V7, V8, V9 — todos com o resultado esperado.

- [X] T023 [US1] Criar `backend/src/health/health.controller.ts` e `backend/src/health/health.module.ts` implementando `GET /health` conforme `contracts/health.md` (corpo `status`/`db`/`contexts`/`uptimeSeconds`/`timestamp`; `db` via `PrismaService.ping()`; 200 `ok` só com `db up` e `contexts` = `CONTEXT_MODULES`; 503 `degraded` com `db down`); importar `HealthModule` no `AppModule`
- [X] T024 [P] [US1] Criar `backend/test/health.e2e-spec.ts` (supertest, Postgres real): (1) 200 + `status:"ok"` + `db:"up"`; (2) `contexts` contém exatamente os 11 nomes; (3) `DATABASE_URL` para porta morta → 503 + `status:"degraded"` + app ainda responde
- [X] T025 [P] [US1] Criar `frontend/src/app/query-client.ts` (instância `QueryClient` com defaults) e `frontend/src/main.tsx` (`<QueryClientProvider>` + `<RouterProvider>`, `import '@fontsource/inter'`)
- [X] T026 [US1] Criar `frontend/src/app/router.tsx` (`createBrowserRouter`, rota `"/"`) e `frontend/src/pages/DashboardPlaceholder.tsx` (conteúdo mínimo identificável); layout completo (`AppShell`) chega na US4
- [X] T027 [P] [US1] Criar `frontend/src/app/App.test.tsx` (Vitest + Testing Library): renderiza o app e encontra o conteúdo do `DashboardPlaceholder`
- [X] T028 [US1] Criar `backend/test/bootstrap-fail-fast.spec.ts`: com `DATABASE_URL` ausente, importar/instanciar a app rejeita e a mensagem cita `DATABASE_URL` (FR-008, SC-006)
- [X] T029 [US1] Adicionar ao `README.md` a seção **"Como rodar"** com o passo a passo ordenado do `quickstart.md` (pré-requisitos → `npm ci` → `.env` → `docker compose up -d db` → `prisma:migrate:deploy` → `start:dev` / `dev` → `test` → `lint`/`typecheck`) e a tabela de portas padrão (3001 / 5174 / 55432) com instrução de troca

**Checkpoint**: `quickstart.md` V1, V3, V5, V6, V7, V8, V9 passam. MVP entregável.

---

## Phase 4: User Story 2 — Adicionar código no bounded context certo (Priority: P1)

**Goal**: os 11 contextos da constituição têm módulo isolado, carregado no boot, e o
acoplamento entre contextos é barrado por lint.

**Independent Test**: `quickstart.md` V4; `GET /health` → `contexts` com os 11 nomes;
introduzir um import de `crm` para dentro de `financeiro` faz o `lint` falhar.

- [X] T030 [P] [US2] Criar os 8 módulos de contexto de domínio em `backend/src/<ctx>/<ctx>.module.ts` para `ingestao`, `financeiro`, `catalogo`, `contratos`, `clientes`, `crm`, `marketing`, `central`, cada um com subpastas `domain/`, `application/`, `infra/` contendo `.gitkeep`
- [X] T031 [P] [US2] Criar `backend/src/core/core.module.ts` (`@Global()`, exporta os utilitários), `backend/src/core/ids/uuid.ts` (`export function uuidv7(): string` sobre `import { v7 } from 'uuid'`), `backend/src/core/ids/entidade-id.ts` (Value Object conforme `data-model.md`: valida formato + versão 7, `.novo()`, `.de()`, `.equals()`, `toString()`/`toJSON()`), `backend/src/core/plataforma-origem.enum.ts` (enum dos 7 valores canônicos)
- [X] T032 [P] [US2] Criar `backend/src/core/ids/entidade-id.spec.ts`: round-trip gera→reidrata; rejeita UUID v4; rejeita lixo; `.equals` por valor; `.novo()` retorna versão 7 e valores distintos
- [X] T033 [P] [US2] Criar `backend/src/api/api.module.ts` e `backend/src/admin/admin.module.ts` (módulos de borda, vazios, com `.gitkeep` em subpasta se necessário)
- [X] T034 [US2] Adicionar ao `backend/eslint.config.mjs` a regra de fronteira (`import/no-restricted-paths` ou `no-restricted-imports`) proibindo `src/<ctxA>/**` de importar `src/<ctxB>/**`, com exceção de `src/core/**`; adicionar um caso de teste de lint negativo documentado no `docs/001-bootstrap-projeto.md`
- [X] T035 [US2] Atualizar `backend/src/app.module.ts` para importar os 11 módulos (`core`, 8 de domínio, `api`, `admin`) + `HealthModule`; garantir que `backend/src/app.context-modules.ts` (`CONTEXT_MODULES`) lista exatamente esses 11 nomes e é a fonte do `contexts` no `/health`
- [X] T036 [P] [US2] Criar `backend/test/context-modules.e2e-spec.ts`: sobe a app e afirma `GET /health` → `body.contexts` == os 11 nomes (ordem irrelevante), provando composição real (SC-002)

**Checkpoint**: `quickstart.md` V4 passa; `/health` lista 11 contextos; lint barra import cross-contexto.

---

## Phase 5: User Story 3 — Confiar que a CI barra o que está quebrado (Priority: P1)

**Goal**: cada PR contra `main` roda instalação + lint + typecheck + build + testes
(backend e frontend) com Postgres real; passo quebrado reprova o PR.

**Independent Test**: `quickstart.md` V10 — PR com erro de lint/tipo/teste reprova; PR limpo passa.

- [X] T037 [US3] Criar `.github/workflows/ci.yml`: gatilhos `pull_request` e `push` em `main`; job `build-test` em `ubuntu-latest`; `actions/checkout` + `actions/setup-node@v4` (node 24, `cache: npm`); `services.postgres` (`postgres:16`, env `POSTGRES_PASSWORD=postgres`/`POSTGRES_DB=pandora_test`, `options` health-check); `env.TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pandora_test` e `env.DATABASE_URL` idem; passos: `npm ci` → `npx --workspace backend prisma migrate deploy` → `npm run -ws --if-present lint` → `... typecheck` → `... build` → `... test`; `concurrency` por ref com `cancel-in-progress`
- [X] T038 [US3] Conferir/ajustar os scripts agregados da raiz (T001) para que `lint`, `typecheck`, `build`, `test` de fato executem nos dois workspaces via `-ws --if-present` e retornem exit ≠ 0 em falha
- [X] T039 [US3] Documentar a pipeline no `docs/001-bootstrap-projeto.md` (o quê roda, em que ordem, como ler um passo reprovado) e validar manualmente `quickstart.md` V10 num PR descartável

**Checkpoint**: pipeline verde num PR limpo; vermelha e com passo identificável num PR quebrado.

---

## Phase 6: User Story 4 — Ver a identidade visual da AEN no frontend (Priority: P2)

**Goal**: shell de layout (header + nav + conteúdo) pintado com as 3 cores da marca e Inter,
tokens definidos uma única vez.

**Independent Test**: `quickstart.md` V2 e V9; busca por hex de marca fora de `theme/` retorna zero (SC-007).

- [X] T040 [P] [US4] Criar `frontend/src/theme/tokens.css` com `@theme { --color-brand-azul:#2E4E78; --color-brand-coral:#EC5F6A; --color-brand-menta:#68C0B2; --font-sans:"Inter", ui-sans-serif, system-ui, sans-serif; }` e `frontend/src/theme/index.css` com `@import "tailwindcss";` + `@import "./tokens.css";` + estilos base (`body { font-family: var(--font-sans); }`)
- [X] T041 [US4] Criar `frontend/src/shell/AppShell.tsx` (grid CSS: `header` da marca, `nav` lateral, `main` com `<Outlet/>`; sem overflow-x do body em ≥768px) e `frontend/src/shell/nav-items.ts` (itens placeholder: CRM, Financeiro, Marketing, Central)
- [X] T042 [US4] Atualizar `frontend/src/app/router.tsx` para uma rota de layout que renderiza `AppShell` envolvendo `DashboardPlaceholder` em `"/"`
- [X] T043 [P] [US4] Criar `frontend/src/shell/AppShell.test.tsx` (Vitest + Testing Library): renderiza e encontra header, nav e região de conteúdo
- [X] T044 [US4] Importar `./theme/index.css` em `frontend/src/main.tsx`; garantir que nenhum componente contém hex de marca literal (só classes utilitárias `bg-brand-*`/`text-brand-*` ou `var(--color-brand-*)`)

**Checkpoint**: `quickstart.md` V2 e V9 passam; grep por `#2E4E78|#EC5F6A|#68C0B2` fora de `frontend/src/theme/` → vazio.

---

## Phase 7: User Story 5 — Configurar as 7 contas de origem por ambiente (Priority: P2)

**Goal**: `.env.example` e o schema tipado têm um bloco por conta para as 7 contas; nenhum
segredo real versionado; obrigatórias ausentes falham cedo.

**Independent Test**: `quickstart.md` V8 (fail-fast) + testes da T047; `git status` não mostra `.env`.

- [X] T045 [US5] Estender `backend/src/config/env.schema.ts`: para cada `C` em `TMB, ASAAS_PRD, ASAAS_SVC, GURU_PRD, GURU_SVC, HOTMART_PRD, HOTMART_SVC` adicionar `C_API_BASE_URL` (url opcional), `C_API_KEY` (string opcional), `C_WEBHOOK_TOKEN` (string opcional); exportar um helper `accountConfig(platform: PlataformaOrigem)` que agrupa as 3 chaves
- [X] T046 [US5] Estender `.env.example` (raiz) com os 7 blocos comentados (`# --- Conta: Asaas PRD ---` etc.), 21 chaves com placeholders inertes (`https://api.exemplo.invalido/`, `placeholder`)
- [X] T047 [P] [US5] Estender `backend/src/config/env.schema.spec.ts`: `.env.example` completo parseia sem erro; omitir todas as chaves de conta → **não** lança; formato inválido de `TMB_API_BASE_URL` → lança citando a chave
- [X] T048 [US5] Confirmar no `.gitignore` que `.env` e `.env.*` (exceto `.env.example`) são ignorados; adicionar nota no `docs/001-bootstrap-projeto.md` sobre "segredo real nunca versionado" e o mapa nome-humano ↔ enum

**Checkpoint**: schema e example cobrem as 7 contas; `quickstart.md` V8 passa; `.env` não rastreado.

---

## Phase 8: Polish & Cross-Cutting

- [X] T049 [P] Escrever `docs/001-bootstrap-projeto.md`: estrutura final do repositório, comandos por workspace, mapa contexto → módulo, mapa nome-humano ↔ `PlataformaOrigem`, convenções para entidades futuras (PK `EntidadeId`/`@db.Uuid`, `criado_em`/`atualizado_em` `@db.Timestamptz`, IDs de origem em `*_origem_ref`, dinheiro ×10000 a partir da 002), regra de fronteira do ESLint
- [X] T050 [P] Atualizar `README.md`: seção Stack com versões, "Estrutura do repositório" real (backend/frontend/workspaces), tabela de portas, e ajustar a seção **Status** para "Fase 0 em andamento — spec 001 implementada"
- [X] T051 [P] Atualizar `CLAUDE.md` (fora dos marcadores SPECKIT): acrescentar em "Stack" as versões concretas e as portas padrão (3001/5174/55432); nota de que o `core` já expõe `EntidadeId`/`uuidv7()`/`PlataformaOrigem`
- [X] T052 [P] Atualizar `ROADMAP.md`: marcar `[x] 001 — bootstrap-projeto`; ajustar a nota de "Próximo passo"/resumo para apontar a 002 como próxima
- [X] T053 Executar o `quickstart.md` inteiro (V1–V10) numa cópia limpa; registrar tempos (SC-001 ≤ 15 min, SC-009 CI ≤ 10 min) e corrigir qualquer lacuna
- [X] T054 [P] Rodar `npm run -ws lint && npm run -ws typecheck && npm run -ws build && npm run -w backend test:e2e && npm run -w frontend test` limpo do zero e confirmar verde

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → nada depende de código; T001 antes de T007/T020 (workspaces).
- **Foundational (Phase 2)** → depende de Setup. Bloqueia **todas** as user stories.
  - Backend: T007 → T008/T009/T010 → T011 → T012/T013/T014 → T016 → T017; T018 depende de T011; T019 depende de T018.
  - Frontend: T020 → T021 → T022.
- **US1 (Phase 3)** → depende de Foundational. T023 depende de T016+T012; T024 depende de T019+T023; T025/T026 dependem de T021; T027 depende de T026; T028 depende de T017; T029 depende do `quickstart.md` estável.
- **US2 (Phase 4)** → depende de Foundational; T035 ajusta o `AppModule` da US1 (coordenar com T023) — rode US2 logo após US1. T036 depende de T035.
- **US3 (Phase 5)** → depende de existir algo para lint/test/build (Foundational + ao menos US1). T037 independe de US2/US4 mas fica mais útil depois delas.
- **US4 (Phase 6)** → depende de Foundational + T026 (router). Independente de US2/US3.
- **US5 (Phase 7)** → depende de T013/T005/T015. Independente de US2/US3/US4.
- **Polish (Phase 8)** → depois de todas as stories que documenta; T049 consolida referências das T034/T031.

### Ordem recomendada (MVP incremental)

1. Phase 1 → Phase 2 → **Phase 3 (US1)** ⇒ **MVP**: clone limpo sobe, testado.
2. **Phase 4 (US2)** ⇒ contextos isolados + lint de fronteira.
3. **Phase 5 (US3)** ⇒ CI protege a branch.
4. **Phase 6 (US4)** e **Phase 7 (US5)** ⇒ podem correr em paralelo (arquivos disjuntos:
   `frontend/src/theme|shell` vs `backend/src/config` + `.env.example`).
5. **Phase 8** ⇒ docs + atualização de `README`/`CLAUDE`/`ROADMAP` + validação final.

## Parallel Opportunities

- **Setup**: T002, T003, T004, T006 em paralelo após T001.
- **Foundational**: bloco backend (T008–T019) e bloco frontend (T020–T022) são caminhos
  independentes; dentro do backend, T008/T009/T010 em paralelo; T012/T013/T014 em paralelo.
- **US1**: T024 ∥ T025 ∥ T027 (arquivos distintos).
- **US2**: T030 ∥ T031 ∥ T032 ∥ T033 (arquivos distintos) antes de T034/T035.
- **US4**: T040 ∥ T043.
- **US5**: T047 paralelo às demais da fase.
- **US4 inteira ∥ US5 inteira** (workspaces distintos).
- **Polish**: T049, T050, T051, T052, T054 em paralelo (arquivos distintos); T053 por último.

## Independent Test Criteria (resumo)

| Story | Critério |
| --- | --- |
| US1 | `quickstart.md` V1/V3/V5/V6/V7/V8/V9 verdes a partir de clone limpo |
| US2 | `/health` lista 11 contextos; `lint` barra import cross-contexto; `entidade-id.spec.ts` verde |
| US3 | PR quebrado reprova com passo identificável; PR limpo passa (V10) |
| US4 | shell visível com 3 cores da marca + Inter; grep de hex fora de `theme/` vazio (V2/V9) |
| US5 | schema + `.env.example` cobrem as 7 contas; boot sem obrigatória falha cedo; `.env` não rastreado (V8) |

## Suggested MVP Scope

**Phase 1 + Phase 2 + Phase 3 (US1)** — um clone limpo que sobe backend + frontend, roda
testes contra Postgres real e falha cedo sem env. É o mínimo que destrava a spec 002.
