# 001 — Bootstrap do projeto (esqueleto do monorepo)

Referência da estrutura entregue pela spec [`001-bootstrap-projeto`](../specs/001-bootstrap-projeto/spec.md).
Nada de regra de negócio aqui: só o esqueleto verificável sobre o qual as specs 002–056
são construídas.

## Visão geral

Monorepo gerenciado por **npm workspaces** (`backend`, `frontend`), um único
`package-lock.json` na raiz, Node **24** (`.nvmrc` + `engines`).

```
package.json            workspaces + scripts agregados
docker-compose.yml      Postgres 16 (host :55432)
.env.example            todas as variáveis (runtime, banco, auth, 7 contas)
.github/workflows/ci.yml  install → lint → typecheck → build → test (unit + e2e)
scripts/db/init-test-db.sql   cria o banco pandora_test na 1ª subida do container
backend/                NestJS 11 + Prisma 6
frontend/               Vite 6 + React 19 + Tailwind v4 + TanStack Query + React Router 7
docs/                   esta e as próximas documentações
specs/                  ciclo Spec Kit por feature
```

## Portas (todas configuráveis — nenhuma fixa)

| Serviço | Padrão | Variável | Por quê esse valor |
| --- | --- | --- | --- |
| Backend (NestJS) | `3001` | `PORT` | evita `3000` (CRA/Next comuns) |
| Frontend (Vite) | `5174` | `VITE_PORT` | evita `5173` (default do Vite) |
| Postgres dev (Compose) | `55432` | porta do host no `docker-compose.yml` | evita `5432` de um Postgres local |
| Postgres na CI | `5432` | — | runner isolado, sem conflito |

Para trocar: ajuste a variável no `.env` (ou exporte no ambiente) e reinicie o processo.

## Comandos por workspace

Rodados da raiz (fan-out para os dois workspaces via `--workspaces --if-present`):

| Raiz | O que faz |
| --- | --- |
| `npm run lint` / `lint:fix` | ESLint em backend e frontend |
| `npm run typecheck` | `tsc --noEmit` nos dois |
| `npm run build` | `nest build` + `vite build` |
| `npm test` | testes unitários (Jest no backend, Vitest no frontend) |
| `npm run test:e2e` | e2e do backend contra Postgres real (schema isolado) |
| `npm run db:up` / `db:down` | sobe/derruba o Postgres do Compose |

Backend (`npm run <script> --workspace backend`): `start:dev`, `start`, `prisma:generate`,
`prisma:migrate:dev`, `prisma:migrate:deploy`, `prisma:reset`.
Frontend (`--workspace frontend`): `dev`, `preview`.

## Mapa contexto → módulo (Princípio VI)

`backend/src/<contexto>/<contexto>.module.ts`, todos importados em
`backend/src/app.module.ts`. A lista canônica vive em
`backend/src/app.context-modules.ts` (`CONTEXT_MODULES`) e alimenta o campo `contexts`
do `GET /health`.

| Contexto | Módulo | Entra de verdade na spec |
| --- | --- | --- |
| `core` | `CoreModule` | 001 (aqui) + 002 |
| `ingestao` | `IngestaoModule` | 006 + adapters (019–022) |
| `financeiro` | `FinanceiroModule` | 018 |
| `catalogo` | `CatalogoModule` | 023 |
| `contratos` | `ContratosModule` | 025 |
| `clientes` | `ClientesModule` | 005 |
| `crm` | `CrmModule` | 007 |
| `marketing` | `MarketingModule` | 032 |
| `central` | `CentralModule` | 044 |
| `api` | `ApiModule` | borda — routers finos por contexto |
| `admin` | `AdminModule` | borda — 028 (sync/imports/curadoria) |

Cada contexto de domínio tem `domain/`, `application/`, `infra/` (com `.gitkeep`).
`api` e `admin` são módulos de **borda** que compõem os demais.

### Regra de fronteira (ESLint)

`backend/eslint.config.mjs` liga `import/no-restricted-paths`: um contexto de domínio
(`ingestao`, `financeiro`, `catalogo`, `contratos`, `clientes`, `crm`, `marketing`,
`central`) **não pode importar** de outro contexto de domínio. Só `core` é livre. `api` e
`admin` estão fora da restrição (compõem tudo).

Teste manual: criar `backend/src/financeiro/_probe.ts` com
`import { CrmModule } from '../crm/crm.module';` → `npm run lint --workspace backend` acusa
`Unexpected path ... imported in restricted zone`.

## Configuração (`.env`)

- `.env` fica na **raiz** (não em `backend/`). `cp .env.example .env`.
- Fonte de verdade tipada: `backend/src/config/env.schema.ts` (zod). Validação roda no
  boot; falta/erro de variável obrigatória **aborta** o processo nomeando a chave.
- Seam de teste: `PANDORA_IGNORE_ENV_FILE=1` faz a config vir só de `process.env`
  (usado pelo teste de fail-fast).

### Mapa nome-humano ↔ prefixo de variável (7 contas)

| Conta | Prefixo | Chaves |
| --- | --- | --- |
| TMB | `TMB` | `TMB_API_BASE_URL`, `TMB_API_KEY`, `TMB_WEBHOOK_TOKEN` |
| Asaas PRD | `ASAAS_PRD` | idem com prefixo |
| Asaas SVC | `ASAAS_SVC` | idem |
| Guru PRD | `GURU_PRD` | idem |
| Guru SVC | `GURU_SVC` | idem |
| Hotmart PRD | `HOTMART_PRD` | idem |
| Hotmart SVC | `HOTMART_SVC` | idem |

Todas **opcionais** na spec 001 (as specs de adapter, Fase 2, tornam obrigatórias por
conta). Enum canônico: `backend/src/core/plataforma-origem.enum.ts` (`PlataformaOrigem`).
Helper `accountConfig(config, PlataformaOrigem.X)` agrupa as 3 chaves.

**Segredo real nunca é versionado** — `.gitignore` ignora `.env` e `.env.*` (exceto
`.env.example`, que só tem placeholders inertes).

## Banco e migrações

- Prisma 6, `provider = postgresql`, `url = env("DATABASE_URL")`.
- `backend/prisma/schema.prisma` **não tem model de negócio** (entram nas specs 002+).
- Migração baseline: `backend/prisma/migrations/20260901000000_baseline/` — cria uma tabela
  marcadora `_pandora_baseline` só para `prisma migrate deploy` ter o que aplicar na CI e
  no harness. Pode ser removida quando a primeira entidade real chegar.
- Aplicar: `npm run prisma:migrate:deploy --workspace backend`.

## Harness de teste contra Postgres real

- Unitários (`*.spec.ts` em `src/`): Jest, sem banco.
- e2e (`*.e2e-spec.ts` em `test/`): Jest com `globalSetup`/`globalTeardown`
  (`test/setup-db.ts` / `test/teardown-db.ts`).
- Cada **execução** da suíte cria um schema `t_<base36>_<hex>` dentro de
  `TEST_DATABASE_URL`, aplica `prisma migrate deploy` nele, e o destrói no fim. Duas
  execuções concorrentes usam schemas distintos — sem colisão (validado).
- Sem `TEST_DATABASE_URL` (nem no ambiente nem no `.env`): o setup falha com
  `TEST_DATABASE_URL ausente: configure o banco de teste (ver README...)`.

## `GET /health`

Contrato: [`contracts/health.md`](../specs/001-bootstrap-projeto/contracts/health.md).
`{ status, db, contexts[11], uptimeSeconds, timestamp }`. `200` só com `db: "up"` e os 11
contextos; `503` + `status: "degraded"` quando o banco não responde (a app segue de pé).
Público por design (probes).

## Frontend — identidade visual

- Tailwind v4 **config CSS-first**: plugin `@tailwindcss/vite`, **sem `tailwind.config.js`**.
- **Ponto único** de cores/tipografia: `frontend/src/theme/tokens.css` (bloco `@theme`).
  Azul `#2E4E78`, coral `#EC5F6A`, menta `#68C0B2`, fonte Inter (auto-hospedada via
  `@fontsource/inter`, sem CDN). Utilitários: `bg-brand-azul`, `text-brand-coral`, etc.
- Shell: `frontend/src/shell/AppShell.tsx` (header da marca + nav lateral + `<Outlet/>`,
  grid CSS, sem scroll horizontal do corpo em ≥ tablet).
- Router 7 em *data mode* (`createBrowserRouter`); `routes` exportado à parte p/ testes.
- TanStack Query: `QueryClientProvider` no topo (`frontend/src/main.tsx`).

## Convenções para entidades futuras (specs 002+)

- **PK**: `id String @id @db.Uuid`, gerado na aplicação via `EntidadeId.novo()` (UUID v7) —
  **não** `@default` do banco. IDs trafegam como o Value Object `EntidadeId`
  (`backend/src/core/ids/entidade-id.ts`), nunca `string` crua no domínio.
- **Auditoria**: toda tabela com `criadoEm DateTime @default(now()) @db.Timestamptz` e
  `atualizadoEm DateTime @updatedAt @db.Timestamptz`.
- **Tempo**: instantes sempre `@db.Timestamptz` (UTC).
- **IDs de origem**: nunca PK — tabelas `<entidade>_origem_ref`.
- **Dinheiro** (a partir da 002): inteiro ×10000 + coluna de moeda; `float`/`Decimal` sem
  escala proibidos.

## CI

`.github/workflows/ci.yml` — `pull_request` e `push` em `main`. Job único em
`ubuntu-latest` com serviço `postgres:16`:

`npm ci` → `prisma generate` → `prisma migrate deploy` → `lint` → `typecheck` → `build` →
`test` (unit) → `test:e2e`. Qualquer passo com exit ≠ 0 reprova o PR; `concurrency`
cancela runs antigos do mesmo ref.

## Nota operacional (ambiente com bloqueio de install scripts)

Este ambiente bloqueia scripts de `postinstall` por padrão. A raiz do `package.json` tem
um bloco `allowScripts` liberando os pacotes necessários (`prisma`, `@prisma/client`,
`@prisma/engines`, `esbuild`, `unrs-resolver`). Se um `npm ci`/`npm install` reclamar de
scripts pendentes, rode `npm approve-scripts --all` e reinstale.
