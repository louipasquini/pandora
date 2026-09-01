# Implementation Plan: Bootstrap do Projeto (esqueleto do monorepo)

**Branch**: `001-bootstrap-projeto` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-bootstrap-projeto/spec.md`

## Summary

Entregar o **esqueleto verificável** do monorepo Pandora: um `package.json` raiz com npm
workspaces (`backend`, `frontend`), um backend NestJS 11 com um módulo isolado por bounded
context (11 módulos), Prisma 6 + PostgreSQL com migração versionada, camada de config tipada
e validada (falha cedo, `.env` por conta para as 7 contas de origem), harness de teste
contra Postgres real com isolamento por schema, lint/format/type-check por workspace, CI no
GitHub Actions com serviço Postgres, e um frontend Vite + React 19 + Tailwind v4 (config
CSS-first) + TanStack Query + React Router com shell de layout e tokens da marca definidos
uma única vez. O `core` já entrega o gerador de UUID v7 e o Value Object `EntidadeId`.
Nenhuma regra de negócio, entidade de domínio, adapter ou tela real entra aqui.

## Technical Context

**Language/Version**: TypeScript 5.6+; Node.js 24 LTS (fixado em `.nvmrc` + `engines`)

**Primary Dependencies**:
- Backend: NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`,
  `@nestjs/config`), Prisma 6 (`prisma` CLI + `@prisma/client`), `zod` (validação de config),
  `uuid` v11 (geração de UUID v7 — `uuidv7()`).
- Frontend: React 19, Vite 6, `@vitejs/plugin-react`, Tailwind CSS v4 (`@tailwindcss/vite`),
  `@tanstack/react-query` v5, `react-router` v7, `@fontsource/inter` (fonte auto-hospedada).

**Storage**: PostgreSQL 16 (container Docker Compose para dev/teste; connection string por
`.env`). Prisma Migrate para schema versionado. Schema inicial vazio de entidades de negócio.

**Testing**:
- Backend: Jest + `ts-jest`; `supertest` para o smoke E2E do endpoint de saúde. Testes de
  integração rodam contra Postgres real; cada execução (worker Jest) cria um schema
  `test_<timestamp>_<rand>`, aplica `prisma migrate deploy` com `?schema=` apontado, e faz
  `DROP SCHEMA ... CASCADE` no teardown.
- Frontend: Vitest + `@testing-library/react` + `jsdom`; smoke test que renderiza o shell.

**Target Platform**: desenvolvimento local (Windows + Linux) e CI Linux. Deploy de produção
fora de escopo.

**Project Type**: Web application (monorepo backend + frontend, npm workspaces).

**Performance Goals**: N/A funcional. Metas operacionais: setup de clone limpo ≤ 15 min
(SC-001); CI de PR de esqueleto ≤ 10 min (SC-009).

**Constraints**:
- `float` proibido para dinheiro (não há dinheiro nesta spec, mas o lint/estrutura não deve
  introduzir helpers que violem isso).
- Nenhum segredo versionado; `.env` ignorado; `.env.example` só placeholders.
- Portas configuráveis por env, nenhuma porta fixa; padrões escolhidos fora da faixa comum
  já ocupada (ver Research): backend `3001`, frontend `5174`, Postgres dev `55432`.
- IDs de entidade como `EntidadeId` (UUID v7), nunca `string` crua no domínio.

**Scale/Scope**: ~11 módulos de backend vazios + `core` com 1 VO e 1 util; 1 endpoint
(`GET /health`); 1 shell de frontend com 1 rota de exemplo; 2 smoke tests; 1 workflow de CI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: esta spec não cria entidade de negócio. **Decide** o ID
      surrogate (UUID v7) e entrega o util + `EntidadeId` no `core` antes da primeira
      entidade, exatamente como o Princípio I exige. IDs de origem: N/A aqui; a estrutura
      `*_origem_ref` fica reservada para as specs de ingestão. Nenhuma granularidade de
      negócio é decidida aqui (são das specs 005/023/025).
- [x] **II. Clarificar antes de assumir**: 2 decisões abertas (gestão de monorepo, esquema
      de ID) foram levadas ao dono do produto no `/speckit-clarify` e registradas na spec.
      Nenhum `NEEDS CLARIFICATION` dependente do dono do produto permanece. Nenhum
      comportamento de negócio foi assumido.
- [x] **III. Bordas finas**: nenhuma regra de negócio existe nesta spec, portanto nenhuma
      conhece nome de plataforma. `plataforma_origem` aparece apenas como **chave de
      agrupamento na camada de config** (`.env` por conta), não em lógica. Nenhum adapter é
      criado (Fase 2).
- [x] **IV. Log de eventos + projeções**: `evento_origem` é a spec 006. Aqui só se cria o
      módulo `ingestao` vazio. Nenhum pipeline, nenhum `commit()` de remendo, nenhum estado
      mutável no ORM introduzido.
- [x] **V. Agregados derivados**: nenhum agregado nesta spec. Nenhum contador incremental
      introduzido.
- [x] **VI. Contextos delimitados**: o entregável central é **exatamente** a materialização
      deste princípio: 1 módulo NestJS isolado por contexto, sem `barrel` cruzado, sem um
      módulo importar `*.repository`/`*.entity` de outro. Comunicação entre contextos fica
      para as specs que a exigirem (porta/serviço/eventos). `api` e `admin` são módulos de
      borda que compõem, não donos de domínio.
- [x] **VII. Curadoria vs derivação**: N/A (sem campos curados/derivados nesta spec). O
      padrão de colunas separadas será aplicado pelas specs de catálogo/contrato.
- [x] **VIII. Superfície de escrita mínima**: o único endpoint criado é `GET /health`
      (read-only). Nenhum endpoint de escrita. Nenhuma sincronização automática com API
      externa. `@nestjs/config` lê env sob demanda no start, não faz polling.
- [x] **Padrões Transversais**:
      - IDs UUID v7 em `core` ✔ (decisão desta spec).
      - Dinheiro ×10000 / tempo `timestamptz` / status canônico → specs 002; aqui só se
        garante que o schema Prisma base use `@db.Timestamptz` como default de exemplo e que
        nenhum helper de `float`-dinheiro seja introduzido.
      - Auditoria (`criado_em`/`atualizado_em`): documentado como convenção a aplicar em toda
        entidade futura; sem entidade aqui para carimbar.
      - `plataforma_origem` como dimensão de primeira classe: refletido no `.env.example`
        (bloco por conta) e num `enum PlataformaOrigem` de referência no `core` (só o enum,
        sem uso).

**Resultado do gate: PASS.** Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-bootstrap-projeto/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões de tooling/versão
├── data-model.md        # Phase 1 — objetos estruturais (sem entidade de negócio)
├── quickstart.md        # Phase 1 — roteiro de validação ponta a ponta
├── contracts/
│   ├── health.md        # Contrato do endpoint GET /health
│   └── config-schema.md # Contrato das variáveis de ambiente (.env)
├── checklists/
│   └── requirements.md   # Já criado no /speckit-specify
└── tasks.md             # Phase 2 — /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

```text
package.json                     # raiz: npm workspaces [backend, frontend] + scripts agregados
package-lock.json                # lockfile único
.nvmrc                           # Node 24
.gitignore                       # node_modules, dist, .env, coverage, .vite, etc.
.env.example                     # todas as chaves (db dev/teste, auth de serviço, 7 contas)
.editorconfig
docker-compose.yml               # Postgres 16 para dev/teste (porta 55432)
.github/
└── workflows/
    └── ci.yml                   # install → lint → typecheck → build → test (backend+frontend)
docs/
└── 001-bootstrap-projeto.md     # estrutura final, comandos por workspace, mapa contexto→módulo

backend/
├── package.json                 # nest, prisma, zod, uuid, jest
├── tsconfig.json  tsconfig.build.json
├── nest-cli.json
├── .eslintrc.cjs  .prettierrc
├── jest.config.ts               # unit
├── test/
│   ├── jest-e2e.config.ts
│   ├── setup-db.ts              # cria schema isolado, migrate deploy, expõe DATABASE_URL
│   ├── teardown-db.ts           # DROP SCHEMA CASCADE
│   └── health.e2e-spec.ts       # smoke: sobe app + GET /health com banco conectado
├── prisma/
│   ├── schema.prisma            # datasource + generator + (sem model de negócio)
│   └── migrations/              # 1ª migração vazia/baseline
└── src/
    ├── main.ts                  # bootstrap; lê PORT; valida config; liga /health
    ├── app.module.ts            # importa todos os módulos de contexto + ConfigModule global
    ├── config/
    │   ├── env.schema.ts        # zod schema de todas as variáveis
    │   └── config.module.ts     # @nestjs/config com validate: (env) => envSchema.parse(env)
    ├── core/
    │   ├── core.module.ts
    │   ├── ids/
    │   │   ├── entidade-id.ts   # Value Object EntidadeId (UUID v7)
    │   │   ├── entidade-id.spec.ts
    │   │   └── uuid.ts          # uuidv7() wrapper
    │   └── plataforma-origem.enum.ts   # enum de referência das 7 contas (sem uso ainda)
    ├── health/
    │   ├── health.module.ts
    │   └── health.controller.ts # GET /health → { status, contexts: string[], db: 'up' }
    ├── ingestao/ingestao.module.ts        + domain/ application/ infra/ (vazios, .gitkeep)
    ├── financeiro/financeiro.module.ts    + idem
    ├── catalogo/catalogo.module.ts        + idem
    ├── contratos/contratos.module.ts      + idem
    ├── clientes/clientes.module.ts        + idem
    ├── crm/crm.module.ts                  + idem
    ├── marketing/marketing.module.ts      + idem
    ├── central/central.module.ts          + idem
    ├── api/api.module.ts                  # módulo de borda (routers finos) — vazio
    ├── admin/admin.module.ts              # módulo de borda (sync/imports/curadoria) — vazio
    └── prisma/
        ├── prisma.module.ts     # global
        └── prisma.service.ts    # PrismaClient com onModuleInit/onModuleDestroy

frontend/
├── package.json                 # react, vite, tailwind v4, tanstack query, react-router
├── index.html
├── vite.config.ts               # plugins: react(), tailwindcss(); server.port de env
├── tsconfig.json  tsconfig.node.json
├── .eslintrc.cjs  .prettierrc
├── vitest.config.ts
├── src/
│   ├── main.tsx                 # QueryClientProvider + RouterProvider
│   ├── app/
│   │   ├── router.tsx           # rotas; "/" → DashboardPlaceholder dentro do AppShell
│   │   └── query-client.ts
│   ├── theme/
│   │   ├── tokens.css           # @theme { --color-azul/coral/menta; --font-sans: Inter }
│   │   └── index.css            # @import "tailwindcss"; @import "./tokens.css";
│   ├── shell/
│   │   ├── AppShell.tsx         # header + nav lateral + <Outlet/>
│   │   ├── AppShell.test.tsx    # smoke: renderiza header/nav/conteúdo
│   │   └── nav-items.ts
│   └── pages/
│       └── DashboardPlaceholder.tsx
└── public/
```

**Structure Decision**: Web application com npm workspaces. `backend/src/<contexto>/` reflete
1:1 os 11 bounded contexts da constituição (Princípio VI). `core`, `config`, `health`,
`prisma` são infra transversal do backend. Frontend segue `theme/` (tokens únicos, FR-027),
`shell/` (FR-024), `app/` (router + query client, FR-025/FR-026).

## Complexity Tracking

Sem violações de constituição. Tabela não aplicável.
