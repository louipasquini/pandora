# Phase 0 — Research: Bootstrap do Projeto

Todas as decisões de tooling/versão desta spec. Nenhum `NEEDS CLARIFICATION` de negócio
permanece (os 2 abertos foram resolvidos no `/speckit-clarify`).

## 1. Gestão do monorepo

- **Decisão**: npm workspaces. `package.json` raiz com `workspaces: ["backend", "frontend"]`,
  um `package-lock.json` único, scripts agregados na raiz
  (`npm run -ws --if-present lint`, `test`, `build`, `typecheck`).
- **Rationale**: `npm` v11 + Node 24 já presentes; zero dependência extra de setup/CI;
  cache nativo `actions/setup-node` com `cache: npm`. Para 2 pacotes a orquestração de
  pnpm/turborepo não se paga (registrado na spec, Clarifications + Constraints).
- **Alternativas**: pnpm workspaces (mais rápido/estrito, mas exige instalar pnpm em toda
  máquina e runner); turborepo (cache de tasks, exagero para esqueleto); repos separados
  (perde atomicidade de PR entre back e front).

## 2. Esquema de identificador

- **Decisão**: UUID v7, coluna nativa `uuid` no Postgres. `core` entrega `uuidv7()` (via
  pacote `uuid` v11, que expõe `v7`) e o Value Object `EntidadeId` (valida formato no
  construtor; `EntidadeId.novo()` gera; `.toString()` / `.toDb()` para persistência).
- **Rationale**: time-ordered (bom para índice B-tree e localidade de escrita), 16 bytes,
  tipo nativo do PG, suporte direto em Prisma (`@db.Uuid`) e libs maduras. Wrapper de
  domínio impede confundir IDs de entidades diferentes em tempo de compilação e centraliza
  geração/validação (decisão "C" do clarify).
- **Alternativas**: ULID (string base32 de 26 chars — legível, mas maior em índice e exige
  normalização em toda borda); UUID v4 (sem ordenação temporal → fragmentação de índice);
  `bigserial` (viola Princípio I — id previsível/derivado da sequência).

## 3. Backend framework e versão

- **Decisão**: NestJS 11 (`@nestjs/common/core/platform-express` 11.x), TypeScript 5.6+,
  `reflect-metadata`. Um `@Module()` por bounded context, todos importados em `AppModule`.
  `ConfigModule` global; `PrismaModule` global.
- **Rationale**: constituição ratifica NestJS; a divisão em módulos mapeia 1:1 os contextos
  (Princípio VI). Express (não Fastify) por ser o default estável e suficiente — troca é
  localizada se necessário depois.
- **Alternativas consideradas**: Fastify adapter (perf maior, mas nenhum requisito de perf
  aqui; adia).

## 4. ORM, banco e migrações

- **Decisão**: Prisma 6 (`prisma` + `@prisma/client`). `schema.prisma` com `datasource db`
  (`provider = "postgresql"`, `url = env("DATABASE_URL")`) e `generator client`. Uma
  migração baseline (sem model de negócio; habilita extensão `pgcrypto`/`uuid-ossp` só se
  necessário — UUID v7 é gerado na aplicação, então **não** precisa de extensão). Comandos:
  `prisma migrate dev` (criar), `prisma migrate deploy` (aplicar), `prisma migrate reset`.
- **PostgreSQL 16** via `docker-compose.yml` (serviço `db`, imagem `postgres:16-alpine`,
  porta host `55432`→`5432`, volume nomeado). README documenta apontar `DATABASE_URL` para
  um Postgres já instalado como alternativa.
- **Rationale**: Prisma é a escolha da constituição; migração versionada e determinística;
  Compose dá reprodutibilidade sem exigir Docker (alternativa manual documentada).
- **Alternativas**: TypeORM/Kysely (fora da constituição); Testcontainers para o banco de
  teste (ver item 6).

## 5. Validação de configuração (`.env` por conta)

- **Decisão**: `@nestjs/config` com `validate: (raw) => envSchema.parse(raw)` usando **zod**.
  `envSchema` cobre: `NODE_ENV`, `PORT`, `DATABASE_URL`, `TEST_DATABASE_URL`,
  `SERVICE_JWT_SECRET` (placeholder — usado de fato na 003), e um bloco por conta para as 7
  contas de origem: para cada `<CONTA>` ∈ {`TMB`, `ASAAS_PRD`, `ASAAS_SVC`, `GURU_PRD`,
  `GURU_SVC`, `HOTMART_PRD`, `HOTMART_SVC`} as chaves `<CONTA>_API_BASE_URL`,
  `<CONTA>_API_KEY`, `<CONTA>_WEBHOOK_TOKEN` — **todas opcionais nesta spec** (as specs de
  adapter as tornam obrigatórias por conta quando ligarem a integração), mas **presentes e
  tipadas** no schema e no `.env.example`.
- **Falha cedo**: `envSchema.parse` lança no boot → NestJS aborta com o path da variável
  inválida/ausente. `DATABASE_URL` e `PORT` são obrigatórias e sem default silencioso
  (FR-008/SC-006). `PORT` default explícito só documentado no `.env.example` (`3001`), não
  embutido no código como fallback de produção — o schema exige a chave presente.
- **Rationale**: zod dá mensagem de erro com caminho exato e um único ponto de verdade
  tipado (`AppConfig = z.infer<typeof envSchema>`). Agrupamento por conta reflete
  `plataforma_origem` como dimensão de primeira classe.
- **Alternativas**: `class-validator`/`joi` (mais verboso, tipos menos diretos);
  `envalid` (bom, mas zod já entra para outras validações).

## 6. Harness de teste contra Postgres real

- **Decisão**: **schema-per-worker** contra a instância Postgres do Compose (dev) ou do
  serviço `postgres` do GitHub Actions (CI) — **sem Testcontainers**.
  - `globalSetup`/`per-file setup` (`test/setup-db.ts`): gera
    `schema = "t_" + Date.now().toString(36) + "_" + randomHex(4)`, monta
    `DATABASE_URL = ${TEST_DATABASE_URL}?schema=${schema}`, roda `prisma migrate deploy` com
    essa URL, injeta a URL no `process.env` do worker.
  - `globalTeardown` (`test/teardown-db.ts`): `DROP SCHEMA "<schema>" CASCADE`.
  - Jest com `maxWorkers` > 1 → cada worker tem schema próprio → execuções concorrentes sem
    colisão (FR-014, SC-004).
  - Sem `TEST_DATABASE_URL` → o setup lança com mensagem
    `"TEST_DATABASE_URL ausente: configure o banco de teste (ver README)"` (FR-015).
- **Rationale**: schema-per-worker é o isolamento mais barato em Postgres (namespace, não
  base inteira), mantém 1 só instância, e casa com o texto do FR-014. Testcontainers
  adicionaria dependência de Docker no runner e nas máquinas dev (a spec já garante Compose,
  mas nem todo dev tem Docker — o item 4 permite Postgres nativo).
- **Alternativas**: database-per-run (mais pesado, `CREATE DATABASE` não roda em transação e
  polui o cluster); Testcontainers (isola melhor, custo de Docker obrigatório);
  truncate/rollback em base compartilhada (frágil com DDL de migração concorrente).

## 7. Lint / format / type-check

- **Decisão**:
  - Backend: ESLint 9 (flat config) + `typescript-eslint` + `eslint-config-prettier`;
    Prettier 3. Scripts: `lint` (`eslint .`), `lint:fix`, `format` (`prettier --write`),
    `typecheck` (`tsc --noEmit -p tsconfig.json`).
  - Frontend: ESLint 9 + `typescript-eslint` + `eslint-plugin-react-hooks` +
    `eslint-plugin-react-refresh`; Prettier 3; `typecheck` (`tsc --noEmit`).
  - Regra de fronteira: `eslint-plugin-import` com `no-restricted-paths` **ou**
    `no-restricted-imports` proibindo `src/<contextoA>/**` de importar `src/<contextoB>/**`
    (exceto `core`). Materializa o Princípio VI em lint (US2 / FR-005).
- **Rationale**: ESLint flat config é o padrão atual (ESLint 9); a regra de import barra o
  acoplamento entre contextos automaticamente.
- **Alternativas**: Biome (rápido, um binário só — mas ecossistema de regras React/Nest
  menos maduro; adia).

## 8. CI (GitHub Actions)

- **Decisão**: `.github/workflows/ci.yml`, gatilho `pull_request` (branch `main`) e `push`
  em `main`. Um job `build-test` em `ubuntu-latest`:
  1. `actions/checkout`
  2. `actions/setup-node@v4` (node 24, `cache: npm`)
  3. `npm ci` na raiz (instala os dois workspaces)
  4. `services: postgres: postgres:16` com `POSTGRES_PASSWORD`, health-check; expõe
     `5432`; `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pandora_test`
  5. `npx prisma migrate deploy` (baseline, na base `pandora_test`)
  6. `npm run -ws --if-present lint`
  7. `npm run -ws --if-present typecheck`
  8. `npm run -ws --if-present build`
  9. `npm run -ws --if-present test`
  - Qualquer passo com exit ≠ 0 reprova o PR e o step fica identificável (FR-022/SC-005).
  - `concurrency` por ref para cancelar runs antigos; sem retomada/flaky (FR-023).
- **Rationale**: serviço `postgres` do Actions substitui o Compose no CI; `-ws --if-present`
  roda o mesmo script nos dois workspaces sem duplicar YAML.
- **Alternativas**: matriz de jobs separados back/front (mais paralelismo, mais YAML —
  desnecessário para ≤10 min); usar o Compose no runner (mais lento que o service nativo).

## 9. Frontend — Vite + React 19 + Tailwind v4

- **Decisão**:
  - Vite 6 + `@vitejs/plugin-react`. `vite.config.ts` lê `server.port` de
    `import.meta.env.VITE_PORT ?? 5174`.
  - **Tailwind v4 CSS-first**: `@tailwindcss/vite` no `plugins`; **sem `tailwind.config.js`**.
    `src/theme/index.css` faz `@import "tailwindcss";` e importa `tokens.css`.
  - `tokens.css`: bloco `@theme { --color-brand-azul:#2E4E78; --color-brand-coral:#EC5F6A;
    --color-brand-menta:#68C0B2; --font-sans:"Inter", ui-sans-serif, system-ui, sans-serif; }`
    — **ponto único** das cores/tipografia (FR-027, SC-007). Utilitários `bg-brand-azul`
    etc. saem de graça do `@theme`.
  - Fonte Inter via `@fontsource/inter` (auto-hospedada, sem CDN) importada uma vez em
    `main.tsx`.
  - `@tanstack/react-query` v5: `QueryClient` em `app/query-client.ts`, `QueryClientProvider`
    em `main.tsx` (FR-026).
  - `react-router` v7 (modo *data*/`createBrowserRouter` + `RouterProvider`). Rota `"/"`
    renderiza `DashboardPlaceholder` dentro de `AppShell` via `<Outlet/>` (FR-024/FR-025).
  - `AppShell`: `header` (marca) + `nav` lateral (itens placeholder, um por módulo futuro:
    CRM, Financeiro, Marketing, Central) + `main` com `<Outlet/>`. Layout com CSS grid;
    sem overflow horizontal do body em larguras ≥ tablet (FR-028).
- **Rationale**: alinhado ao guia oficial atual do Tailwind v4 (plugin Vite obrigatório,
  config CSS-first, `@theme`). `@fontsource` evita requisição externa e mantém o build
  self-contained. Router v7 *data mode* já é a base que as próximas specs vão usar para
  loaders.
- **Alternativas**: PostCSS + `@tailwindcss/postcss` (funciona, mas o plugin Vite é o
  caminho recomendado e mais rápido); Google Fonts via `<link>` (dependência de rede,
  rejeitado); `react-router-dom` legado (v7 unifica no pacote `react-router`).

## 10. Portas (evitar colisão)

- **Decisão**: padrões **não** nas faixas mais disputadas de dev local:
  - Backend NestJS: `3001` (`PORT`) — evita `3000` (Next/CRA comuns).
  - Frontend Vite: `5174` (`VITE_PORT`) — evita `5173` (default Vite).
  - Postgres dev (Compose): host `55432` — evita `5432` de um Postgres local já instalado.
  - CI: o serviço Postgres usa `5432` dentro do runner isolado (sem conflito).
  Todos configuráveis por env; README lista os padrões e como trocar (FR-009, edge case
  "porta já ocupada").
- **Rationale**: requisito explícito do dono do produto ("não utilizar nenhuma porta que
  esteja em uso"). Offsets simples e memoráveis.

## 11. Versão de runtime

- **Decisão**: Node.js 24 (LTS a partir de out/2025). `.nvmrc` com `24`; `engines.node`
  `">=24 <25"` na raiz e nos dois workspaces. README: `nvm use` / instalar Node 24.
- **Rationale**: Node 24 já instalado na máquina de referência; LTS ativo; suportado por
  Vite 6 / NestJS 11 / Prisma 6.
- **Alternativas**: Node 22 (LTS anterior — funciona, mas sem motivo para regredir).

## Itens explicitamente adiados (não bloqueiam esta spec)

- Autenticação de serviço / JWT / guard de webhook → spec 003 (aqui só a chave
  `SERVICE_JWT_SECRET` no `.env.example` e o `api`/`admin` module vazios).
- Value Objects `Dinheiro`, tempo, status canônico → spec 002.
- `pessoa` / engine de identidade → spec 005.
- `evento_origem` + worker → spec 006.
- Adapters e `status_map` → Fase 2.
- Deploy/hospedagem/observabilidade de produção → fora do roadmap desta fase.
