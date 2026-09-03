# Implementation Plan: RBAC — perfis de acesso e permissões granulares

**Branch**: `004-rbac` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-rbac/spec.md`

## Summary

Colocar uma **camada de autorização** por cima do JWT de serviço da spec 003, **sem porta
nova** e mantendo `CONTEXT_MODULES` em 11 (`auth` segue infra transversal):

1. **Catálogo de permissões no código** (`src/auth/rbac/catalogo.ts`) — lista congelada de
   `{ id: 'recurso:acao', recurso, rotulo }`. Fonte única, não editável em runtime. Nesta
   spec (5): `perfil:administrar` (protege **todo** `/admin/rbac/*`), `lead:criar`,
   `lead:editar`, `lead:ver_todos`, `lead:ver_proprios` (vocabulário para a spec 008).
   `assertCatalogoCoerente()` roda no boot (puro, sem banco) — id duplicado ou
   `@RequerPermissao('x')` fora do catálogo **aborta**.
2. **Persistência Prisma** (primeira do projeto) — models `Usuario`, `Perfil`,
   `PerfilPermissao`, `UsuarioPerfil`, `RbacAudit`. PK `String @id @db.Uuid` gerada na app
   (`EntidadeId.novo()`), `criadoEm`/`atualizadoEm` `@db.Timestamptz`. Migração
   `prisma/migrations/<ts>_rbac/`. **Seed idempotente** (`prisma/seed.ts`, upsert do perfil
   de sistema `administrador`) rodando em dev (`migrate dev`), e2e (`setup-db.ts`) e CI.
3. **Dois decorators + um guard**:
   - `@RequerPermissao(...perms)` → metadata `pandora:rbac:requer` (semântica **E**).
   - `@AutenticadoBasta()` → metadata `pandora:rbac:autenticadoBasta` (allowlist "só JWT").
   - `PermissionGuard` como **2º `APP_GUARD`** (registrado depois do `JwtAuthGuard`, roda
     depois): pula `@Public()`/allowlist de path; `@AutenticadoBasta()` → libera;
     `@RequerPermissao` → resolve permissões efetivas do sujeito e exige todas (senão
     **403** genérico); **sem nenhum marcador → 403** (CL-03, fechado por omissão).
4. **Resolução de permissões por requisição** (`SujeitoRbacService`) — lê `req.auth.sub` do
   JWT; memoiza em `req.rbac`. A **credencial de serviço** (`sub === SERVICE_CLIENT_ID`)
   resolve para o perfil de sistema `administrador`, que concede **o catálogo inteiro em
   código** (special-case — não depende de a linha do seed estar fresca; FR-007/FR-024).
   Um `sub` que casa um `Usuario.id` resolve para a **união** das permissões dos perfis
   dele; desconhecido → conjunto vazio. Login individual de `Usuario` é de spec futura — o
   caminho existe mas fica dormente.
5. **Endpoints de administração** (`AdminRbacController`, prefixo `/admin/rbac`, **todos**
   `@RequerPermissao('perfil:administrar')`): `GET /permissoes` (catálogo agrupado),
   `GET/POST/PATCH/DELETE /perfis`, `GET/POST /usuarios`, `GET/PUT /usuarios/{id}/perfis`.
   Toda escrita chama `RbacAuditService.registrar(...)` (usa `montarRegistroAuditoria` do
   core) — grava só _delta_ real. `+ GET /auth/permissoes-efetivas` (`@AutenticadoBasta`,
   para o gate de UI).
6. **Painel** — item de navegação **Administração** (visível só com `perfil:administrar`)
   com abas **Perfis** e **Usuários**. `apiFetch` central ganha tratamento de **403**
   (evento `sem-permissao`, **não** desloga). `RequireAuth`/rota nova protegida por um
   `RequirePermissao` client-side que consome `GET /auth/permissoes-efetivas` (não inclui a
   permissão → tela "sem permissão"); o checklist da aba Perfis consome
   `GET /admin/rbac/permissoes`. Zero permissão _hardcoded_ no bundle.

Abordagem: **0 dependência nova** (backend e frontend). Prisma 6 e `@nestjs/jwt` já
presentes. Testes: unit sem banco (catálogo, resolução de permissões efetivas, cálculo de
_delta_, decorators/guard com `ExecutionContext` falso); e2e Postgres real (migração+seed,
guard 401/403/200, CRUD de perfil + auditoria, imutabilidade de sistema, anti-_lockout_,
regressão da suíte 003). Ao fim: `docs/004-rbac.md` + `CLAUDE.md`/`README.md`/`ROADMAP.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS (`engines >=24 <25`), nos
dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova.** NestJS 11, `@nestjs/jwt` `^11` (003), `@nestjs/config` 4,
  Prisma `^6.2.1` + `@prisma/client` `^6.2.1` (001, sem model até agora), `zod` 3 (corpos
  de request + `env.schema`), `ts-node` `^10.9` (roda `prisma/seed.ts`). Sem
  `@nestjs/passport`, sem lib de RBAC (CASL etc.) — a matriz é pequena e explícita.
- Frontend: **nenhuma nova.** React 19, `react-router` 7, `@tanstack/react-query` 5,
  `fetch` nativo.

**Storage**: **PostgreSQL 16 via Prisma** — primeira migração de negócio do projeto.
5 tabelas (`usuario`, `perfil`, `perfil_permissao`, `usuario_perfil`, `rbac_audit`).
Sem `citext`: e-mail e nome de perfil guardam a forma original + uma coluna
`*_normalizado` (lowercase/trim) com `@unique`. `rbac_audit` é _append-only_ (nenhum
`UPDATE`/`DELETE` no código). Sem porta nova — usa o mesmo `DATABASE_URL`/`TEST_DATABASE_URL`
(Postgres dev host `55432`, spec 001).

**Testing**:
- Backend unit (`jest`, sem banco): `catalogo.ts` (ids únicos, `assertCatalogoCoerente`),
  `resolverPermissoesEfetivas(perfis)` (união, vazio, admin → catálogo inteiro),
  `calcularDelta(antes, depois)` (add/remove/no-op), `PermissionGuard.canActivate` com
  `ExecutionContext`/`Reflector` falsos (sem marcador → 403; `@AutenticadoBasta` → ok;
  `@RequerPermissao` E parcial → 403; admin → ok), `montarRegistroAuditoria` já coberto na
  002.
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` passa a rodar
  `prisma db seed`): migração aplica as 5 tabelas; seed cria `administrador` idempotente
  (rodar 2× não duplica); `GET /admin/rbac/permissoes` 200 com catálogo agrupado / 403 sem
  permissão (usa um token de `Usuario` sem perfil — helper novo `issueUserToken`);
  `POST/PATCH/DELETE /perfis` + `rbac_audit` (1 registro por ação, 0 em no-op);
  `administrador` imutável → 409; apagar perfil atribuído → 409; `PUT /usuarios/{id}/perfis`
  (união, lista vazia, perfil inexistente → 404); rota-isca `@RequerPermissao` → 200/403/401;
  rota-isca **sem marcador** → 403 (CL-03); **regressão**: `auth.e2e-spec.ts`,
  `health.e2e-spec.ts`, `context-modules.e2e-spec.ts` (ainda 11) verdes sem alteração.
- Frontend (`vitest` + Testing Library, jsdom): `RequirePermissao` (catálogo tem a
  permissão → children; 403 → tela "sem permissão", **não** Login), navegação esconde
  **Administração** sem `perfil:administrar`, `apiFetch` (403 → handler `sem-permissao`,
  token intacto; 401 segue deslogando), aba Perfis (checklist agrupado por recurso, sistema
  read-only), aba Usuários (criar + multi-select de perfis).

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (ambos
configuráveis, spec 001). Dev Windows + Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta funcional. Resolução de permissões = 1 query
(`usuario_perfil` join `perfil_permissao`) memoizada por requisição; a credencial de
serviço nem consulta o banco (special-case). Catálogo é um array em memória.

**Constraints**:
- **Nenhuma porta nova** (`netstat` confirmado: 3001/5174/55432 em uso pelo próprio
  projeto; nada novo é aberto).
- **403 ≠ 401** — corpo genérico (`{ statusCode: 403, error: 'Forbidden', message:
  'permissão insuficiente' }`), **sem** _stack_, nome de classe, nem o id da permissão que
  faltou (SC-005). Motivo específico só em log interno.
- **Fechado por omissão** — `PermissionGuard` nega rota autenticada sem
  `@RequerPermissao`/`@AutenticadoBasta` (CL-03). `@Public()` e `PUBLIC_PATH_PREFIXES` da
  003 continuam valendo (guard de permissão os ignora).
- **Anti-_lockout_** — nenhuma operação pode zerar os portadores de `perfil:administrar`:
  `administrador` é `de_sistema`, imutável, e a credencial de serviço sempre resolve para
  ele (FR-012 / SC-006).
- Regra ESLint `no-restricted-syntax` da 002 (sem `process.env` fora de
  `config/`/`core/`/`main.ts`) — o RBAC lê `SERVICE_CLIENT_ID` via `ConfigService`.
- Regra ESLint `import/no-restricted-paths` da 001 — `auth` (com o `rbac/` dentro) é infra
  transversal, **não** um 12º contexto; `CONTEXT_MODULES` intacto; `AuthModule` não importa
  contexto de domínio nem vice-versa.
- `RbacAudit` guarda `delta` como `Json`; **nunca** segredo/token/senha (SC — FR-027).

**Scale/Scope**: ~18 arquivos novos no backend (`src/auth/rbac/**`, `prisma/seed.ts`,
`prisma/migrations/<ts>_rbac/`, `test/**`), ~10 no frontend (`src/admin/**`,
`src/auth/RequirePermissao.tsx`, testes), **0 dep nova**, **1 migração**, **10 endpoints**
novos (9 em `/admin/rbac/*` + `GET /auth/permissoes-efetivas`; 5 de escrita — ver Princípio
VIII no gate), ~8 arquivos tocados
(`schema.prisma`, `auth.module.ts`, `auth.constants.ts`, `env.schema.ts` só se precisar de
chave nova — **não precisa**, `test/setup-db.ts`, `test/support/auth.ts`, frontend
`router.tsx`, `nav-items.ts`, `api-client.ts`, `AuthProvider.tsx`), `.github/workflows/ci.yml`
(+ passo de seed), 1 doc novo, 3 docs atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: `Usuario` e `Perfil` nascem com **ID surrogate UUID v7**
      gerado na app (`EntidadeId.novo()`), decidido antes do schema. Nenhum identificador de
      origem envolvido — não há `*_origem_ref` porque RBAC não tem borda de plataforma. A
      **granularidade** ("permissão = `recurso:acao`", "perfil = conjunto plano", "sujeito =
      credencial de serviço hoje / `Usuario` no futuro") está documentada na spec
      (§Key Entities) e em `data-model.md`.
- [x] **II. Clarificar antes de assumir**: 5 clarificações resolvidas com o dono do produto
      em 2026-09-03 (CL-01 persistência Postgres, CL-02 resolução por requisição, CL-03
      negar por padrão, criação de `usuario`, abas do painel) — spec §Clarifications. Zero
      `NEEDS CLARIFICATION` aberto. Semântica de `lead:ver_proprios`, squads e login
      individual **explicitamente** empurrados para specs 008/007/futura — não assumidos.
- [x] **III. Bordas finas, núcleo canônico**: nenhuma regra conhece "Guru"/"Asaas"/etc.
      RBAC é infra pura. O `PermissionGuard` é genérico sobre o catálogo; nada de
      vocabulário de origem. `auth/rbac/` fica dentro da infra transversal `auth`, sem
      virar contexto.
- [x] **IV. Log de eventos + projeções**: N/A — sem ingestão, sem `evento_origem`, sem
      pipeline. `RbacAudit` é _append-only_ mas **não** é um event log de projeção; é o
      registro de auditoria exigido pela Parte 8.11, na forma canônica `RegistroAuditoria`
      do core. Sem `commit()` de remendo; cada _endpoint_ faz sua transação.
- [x] **V. Agregados derivados**: as **permissões efetivas** são `f(perfis do sujeito) →
      Set<permissao>`, recomputadas a cada requisição — nunca um campo materializado. Não há
      contador. Sem dinheiro nesta spec.
- [x] **VI. Contextos delimitados**: `AuthModule` permanece no grupo "infra transversal" do
      `AppModule` (ao lado de `ConfigModule`/`PrismaModule`/`HealthModule`). `rbac/` é
      subpasta de `auth/`, **não** um módulo de contexto — `app.context-modules.ts` intacto
      (11), e a e2e `context-modules.e2e-spec.ts` continua afirmando 11. Nenhum contexto de
      domínio importa `auth`; o RBAC não escreve em banco de contexto nenhum (só nas suas 5
      tabelas). Specs de CRM/Marketing **consomem** o decorator e o catálogo, não o
      contrário.
- [x] **VII. Curadoria vs derivação**: o catálogo (código) e os perfis (dados curados pela
      equipe) são camadas distintas; a leitura combina catálogo × perfis sem sobrescrita. Um
      perfil que referencia permissão removida do catálogo → a permissão órfã é **ignorada**
      na resolução e sinalizada como "desconhecida" na leitura (nunca apagada
      silenciosamente do registro). `RbacAudit` nunca é auto-revertido — é _append-only_.
- [x] **VIII. Superfície de escrita mínima**: **10 _endpoints_ novos** — 5 de leitura
      (`GET /admin/rbac/permissoes`, `.../perfis`, `.../usuarios`, `.../usuarios/{id}/perfis`,
      `GET /auth/permissoes-efetivas`) e **5 de escrita**
      (`POST/PATCH/DELETE /perfis`, `POST /usuarios`, `PUT /usuarios/{id}/perfis`) — todos
      atrás de `@RequerPermissao` elevado, todos auditados. Justificativa registrada: a
      Parte 8.11 pede explicitamente "ponto único de gestão de acesso" com CRUD de perfil e
      atribuição; sem esses _endpoints_ a matriz não é administrável e o CRM (007+) não
      teria como configurar acesso. É o **menor** conjunto que cobre US2–US4 (catálogo
      read-only; perfil CRUD; usuário criar+listar+atribuir — sem editar/desativar/apagar
      `usuario`). **Nenhuma sincronização automática com API externa.** Anotado no gate,
      sem entrada em Complexity Tracking (não é violação — é a razão de ser da spec).
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para `usuario`/`perfil` (`id String @id @db.Uuid`).
        `perfil_permissao`/`usuario_perfil` são junções com PK composta (sem surrogate — são
        relacionamentos, não entidades).
      - **Auditoria**: `criadoEm`/`atualizadoEm` `@db.Timestamptz` em `usuario`/`perfil`;
        `rbac_audit` na forma `RegistroAuditoria` (core 002), `origem = AJUSTE_MANUAL`,
        `quando` em UTC via `agoraUtc()`. É a primeira tabela `_audit` real — o painel
        consolidado é a 053.
      - **Config/segredos**: nenhuma chave nova; lê `SERVICE_CLIENT_ID` via `ConfigService`
        (sem `process.env`).
      - **Tempo**: `@db.Timestamptz` sempre; `quando`/`criadoEm` via `agoraUtc()` do core.
      - **Dinheiro / Status / Multi-conta / evento_origem**: não tocados (N/A nesta spec).
      - **Dependência nova**: nenhuma (registrado em research.md — CASL/lib de RBAC
        avaliada e rejeitada por excesso para uma matriz plana e pequena).

**Resultado do gate: PASS.** Uma exceção anotada (5 endpoints de escrita novos) —
inerente ao pedido ("ponto único de gestão de acesso", Parte 8.11), minimizada, auditada e
sob permissão elevada; sem entrada em Complexity Tracking por não ser violação de princípio.

*Re-check pós-Phase 1: **PASS** — o design não adicionou contexto, não acoplou `auth` a
nenhum bounded context, não criou 2º event log, e manteve `CONTEXT_MODULES` em 11. As 5
tabelas são todas do RBAC. Ver `data-model.md` e `contracts/`.*

## Project Structure

### Documentation (this feature)

```text
specs/004-rbac/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões: catálogo em código vs tabela; ordem dos
│                        #   APP_GUARD; resolução por requisição; special-case do admin;
│                        #   seed (prisma/seed.ts) vs OnApplicationBootstrap; e-mail/nome
│                        #   normalizado sem citext; 403 sem lib de RBAC
├── data-model.md        # Phase 1 — 5 models Prisma, invariantes, catálogo de permissões,
│                        #   máquina de estados (nenhuma — CRUD simples), regras de validação
├── quickstart.md        # Phase 1 — roteiro: env, prisma migrate + seed, lint/typecheck,
│                        #   unit, e2e, fluxo manual (criar perfil, atribuir, 403 no painel)
├── contracts/
│   ├── admin-rbac-permissoes.md   # GET /admin/rbac/permissoes
│   ├── admin-rbac-perfis.md       # GET/POST/PATCH/DELETE /admin/rbac/perfis
│   ├── admin-rbac-usuarios.md     # GET/POST /admin/rbac/usuarios + GET/PUT /{id}/perfis
│   ├── permission-guard.md        # @RequerPermissao / @AutenticadoBasta / PermissionGuard
│   └── frontend-rbac.md           # RequirePermissao, nav condicional, apiFetch 403, abas
├── checklists/
│   └── requirements.md            # do /speckit-specify (16/16 ok)
└── tasks.md             # Phase 2 — /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
backend/
├── package.json                    # + "prisma": { "seed": "ts-node prisma/seed.ts" } (sem dep nova)
├── prisma/
│   ├── schema.prisma               # + models Usuario, Perfil, PerfilPermissao, UsuarioPerfil, RbacAudit
│   ├── seed.ts                     # NOVO — upsert idempotente do perfil de sistema `administrador`
│   └── migrations/<ts>_rbac/
│       └── migration.sql           # NOVO — cria as 5 tabelas + índices/uniques
└── src/
    ├── app.module.ts               # inalterado (AuthModule já está no grupo infra)
    └── auth/
        ├── auth.module.ts          # + PermissionGuard como 2º APP_GUARD (depois do JwtAuthGuard);
        │                           #   + providers RBAC; importa PrismaModule; exporta o que specs usam
        ├── auth.constants.ts       # + PERM_METADATA_KEY, AUTENTICADO_BASTA_KEY, PERFIL_ADMIN_ID/NOME
        └── rbac/
            ├── catalogo.ts               # PERMISSOES (array congelado) + tipos + assertCatalogoCoerente()
            ├── catalogo.spec.ts
            ├── decorators/requer-permissao.decorator.ts   # @RequerPermissao(...perms)
            ├── decorators/autenticado-basta.decorator.ts  # @AutenticadoBasta()
            ├── guards/permission.guard.ts                 # 2º APP_GUARD (403 genérico; fechado por omissão)
            ├── guards/permission.guard.spec.ts
            ├── sujeito-rbac.service.ts    # resolve permissões efetivas do sub (memoiza em req.rbac)
            ├── sujeito-rbac.service.spec.ts
            ├── resolver-permissoes.ts     # função pura: (perfis[]) → Set<permissao> (+ special-case admin)
            ├── resolver-permissoes.spec.ts
            ├── rbac.repository.ts         # acesso Prisma: perfis, permissões, usuários, atribuições
            ├── rbac-audit.service.ts      # registrar(delta) via montarRegistroAuditoria + insert append-only
            ├── calcular-delta.ts          # (antes,depois) → { adicionadas, removidas } | null (no-op)
            ├── calcular-delta.spec.ts
            ├── admin-rbac.controller.ts   # /admin/rbac/* (todos sob @RequerPermissao elevado)
            ├── dto/perfil.schema.ts       # zod: criar/editar perfil (nome, permissoes[])
            └── dto/usuario.schema.ts      # zod: criar usuario (nome, email); PUT perfis (perfilIds[])
    └── test/
        ├── setup-db.ts             # + execFileSync('npx', ['prisma','db','seed']) após migrate deploy
        ├── support/auth.ts         # + issueUserToken(usuarioId) p/ testar sujeito não-admin
        └── rbac.e2e-spec.ts        # NOVO — guard 401/403/200, CRUD perfil + auditoria, imutável,
                                    #   anti-lockout, PUT perfis, catálogo; + rota-isca sem marcador → 403

frontend/
└── src/
    ├── app/router.tsx             # + rota /admin (dentro do AppShell) sob <RequirePermissao perm="perfil:administrar">
    ├── auth/
    │   ├── api-client.ts          # + tratamento de 403 (setForbiddenHandler; NÃO limpa token)
    │   ├── AuthProvider.tsx       # + estado sem-permissao (banner) ligado ao setForbiddenHandler
    │   ├── RequirePermissao.tsx   # NOVO — consulta GET /admin/rbac/permissoes (via hook); 403 → tela "sem permissão"
    │   ├── usePermissoes.ts       # NOVO — TanStack Query do catálogo/efetivas do sujeito
    │   └── *.test.tsx
    ├── shell/nav-items.ts         # + item Administração (flag `requerPermissao: 'perfil:administrar'`)
    ├── shell/AppShell.tsx         # filtra NAV_ITEMS por permissão efetiva
    └── admin/
        ├── AdminPage.tsx          # abas Perfis | Usuários
        ├── PerfisTab.tsx          # lista + editor (checklist agrupado por recurso; sistema read-only)
        ├── UsuariosTab.tsx        # lista + criar (nome/email) + multi-select de perfis
        ├── rbac-api.ts            # chamadas apiFetch tipadas para /admin/rbac/*
        └── *.test.tsx

docs/
└── 004-rbac.md                   # NOVO — catálogo, perfis de sistema, guard/decorators,
                                  #   resolução por requisição, tabelas, seed, painel

.github/workflows/ci.yml          # + passo `prisma migrate deploy` && `prisma db seed` no job de e2e
CLAUDE.md  README.md  ROADMAP.md   # atualizados no fim da spec
```

**Structure Decision**: o RBAC entra como **`src/auth/rbac/`** — subpasta do módulo de
infra transversal `auth` da spec 003, **não** um novo bounded context. `AuthModule` ganha
um **2º `APP_GUARD`** (`PermissionGuard`) registrado **depois** do `JwtAuthGuard` (o NestJS
executa `APP_GUARD`s na ordem de registro; o de permissão precisa do `req.auth` que o de
JWT injeta). `CONTEXT_MODULES` fica em 11 e `context-modules.e2e-spec.ts` não muda.
Persistência: 5 tabelas numa migração Prisma (`schema.prisma` ganha os models; primeira
migração de negócio do projeto), com `prisma/seed.ts` idempotente para o perfil de sistema,
plugado no `migrate dev` (dev), no `setup-db.ts` (e2e) e no `ci.yml` (CI). No frontend, a
autorização vive em `src/auth/` (ao lado do que a 003 criou); as telas de administração em
`src/admin/`. `apiFetch` continua o **único** ponto de saída HTTP e passa a distinguir
**403** (banner "sem permissão", sessão intacta) de **401** (fluxo de expiração da 003).

## Complexity Tracking

Sem violação de princípio. A única exceção do gate — **5 endpoints de escrita novos** —
é inerente ao pedido da Parte 8.11 ("ponto único de gestão de acesso"), é o menor conjunto
que torna a matriz administrável, e cada _endpoint_ é auditado e protegido por permissão
elevada. Tabela não aplicável.
