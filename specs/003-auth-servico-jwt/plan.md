# Implementation Plan: Autenticação de serviço JWT para a API interna

**Branch**: `003-auth-servico-jwt` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-auth-servico-jwt/spec.md`

## Summary

Fechar a API interna por padrão e dar ao painel React um jeito de se autenticar, **sem**
banco de usuários, **sem** _refresh token_, **sem** porta nova:

1. **`POST /auth/token`** — troca `client_id` + `client_secret` (comparação em tempo
   constante contra `SERVICE_CLIENT_ID` / `SERVICE_CLIENT_SECRET`) por um **JWT HS256**
   assinado com `SERVICE_JWT_SECRET`, TTL **12 h** (env `SERVICE_JWT_TTL`, teto 24 h),
   claims `sub`/`iss`/`iat`/`exp`. _Stateless_: nada persistido. 400 para corpo malformado,
   401 genérico para credencial errada, 429 sob _rate limiting_ leve por IP.
2. **Guard global de JWT** (`APP_GUARD`) — toda rota exige `Authorization: Bearer <jwt>`
   válido (assinatura + `exp`/`nbf`/`iat` com tolerância de _clock skew_ 60 s + `iss`).
   Falha → 401 de corpo genérico (sem vazar "expirado" vs "assinatura"). Rota nova nasce
   protegida; ficar pública é `@Public()` explícito ou entrada na allowlist central
   (`GET /health`, `POST /auth/token`, prefixo `/webhooks/`).
3. **`WebhookAuthenticator`** — primitiva reaproveitável, **separada do JWT**: dado um
   `PlataformaOrigem` + token candidato, compara em tempo constante contra
   `<PLATAFORMA>_WEBHOOK_TOKEN` (via `accountConfig` do `core`). Conta sem token → recusado.
   Nenhuma rota `/webhooks/*` criada aqui — só a primitiva, testada isolada, para as specs
   019–022 plugarem.
4. **Config promovida** — `SERVICE_JWT_SECRET` (≥ 32), `SERVICE_CLIENT_ID`,
   `SERVICE_CLIENT_SECRET` (≥ 16) passam de opcionais a **obrigatórias** no `env.schema`,
   em **todos** os ambientes (inclui `test`). `+ SERVICE_JWT_TTL` opcional (default `12h`,
   teto `24h`). Boot aborta nomeando a variável (FR-008 da 001, estendido). `.env.example`,
   CI e o harness e2e passam a fornecer os valores.
5. **Painel** — `AuthProvider` + `localStorage` (`pandora.token`), decodificação de `exp`
   para logout proativo, tela **`/login`** pública fora do `AppShell`, `RequireAuth` nas
   rotas do shell, `apiFetch` central que injeta `Authorization` e, num **único** ponto,
   trata 401 (limpa token → `RequireAuth` redireciona a `/login` com aviso "sessão
   expirou"). 401 de `POST /auth/token` fica como "credenciais inválidas" na tela de Login,
   sem acionar o fluxo de expiração. Botão de sair no cabeçalho.

Abordagem: **1 dependência nova no backend** (`@nestjs/jwt`); _rate limiting_ é um guard
in-house de janela fixa (a escolha de infra de _rate limiting_ real é da 055). Zero
dependência nova no frontend. Testes: unitários sem banco para as partes puras
(assinatura/verificação, comparação constante, `WebhookAuthenticator`, decode de `exp`,
`apiFetch`); e2e contra Postgres real só onde precisa do app completo (guard global,
`/auth/token`, allowlist, fail-fast de boot). Ao fim: `docs/003-auth-servico-jwt.md` +
atualização de `CLAUDE.md`, `README.md`, `ROADMAP.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict) nos dois workspaces; Node.js 24 LTS
(`engines >=24 <25`).

**Primary Dependencies**:
- Backend: **`@nestjs/jwt` `^11`** (NOVA — assina/verifica HS256 via `jsonwebtoken@9`;
  não hand-rollar JWT). NestJS 11, `@nestjs/config` 4, `zod` 3 (validação do corpo de
  `/auth/token` e do `env.schema`), `node:crypto` (`timingSafeEqual`) — já disponíveis.
  **Sem** `@nestjs/passport` / `passport-jwt` (guard próprio, mínimo). **Sem**
  `@nestjs/throttler` (guard in-house; ver research.md).
- Frontend: **nenhuma nova.** React 19, `react-router` 7, `@tanstack/react-query` 5,
  `fetch` nativo. Decodificação de JWT (`exp`) por parse de base64url — sem `jwt-decode`.

**Storage**: **N/A.** Nada é persistido — sem tabela, sem migração Prisma. O JWT é
efêmero; as credenciais vivem no `.env`; os tokens de webhook idem.

**Testing**:
- Backend unit (`jest`, `backend/jest.config.ts`, sem banco): assinatura/claims do token,
  comparação em tempo constante, `WebhookAuthenticator` (token certo/errado/ausente/de
  outra conta), parsing de `SERVICE_JWT_TTL` + teto, `env.schema` (SERVICE_* obrigatórias).
- Backend e2e (`jest` e2e, Postgres real, schema isolado): `POST /auth/token`
  (200/400/401/429), guard global (401 sem/expirado/assinatura errada/sem `Bearer`),
  allowlist (`/health` e `/auth/token` públicos; rota-isca protegida por omissão →
  SC-003), fail-fast de boot para cada SERVICE_* ausente (estende
  `bootstrap-fail-fast.e2e-spec.ts`). Helper novo `test/support/auth.ts`
  (`issueTestToken`) para as specs futuras.
- Frontend (`vitest` + Testing Library, jsdom): `LoginPage` (sucesso, 401 genérico, 429),
  `RequireAuth` (sem token → `/login`), `apiFetch` (injeta header; N respostas 401
  concorrentes → **uma** transição/limpeza; 401 de `/auth/token` não dispara expiração),
  `token-storage` (fallback quando `localStorage` lança), `decode-jwt` (`exp` no passado →
  tratado como deslogado).

**Target Platform**: backend HTTP (Express/NestJS) em `:3001`; painel Vite em `:5174`
(ambos configuráveis, spec 001). Dev local Windows + Linux; CI Linux (GitHub Actions).

**Project Type**: Web application (monorepo npm workspaces `backend` + `frontend`). Esta
fatia entrega backend **e** frontend.

**Performance Goals**: sem meta funcional. Assinatura/verificação HS256 é O(µs);
`timingSafeEqual` é O(n) no comprimento do segredo. SC-001: login → tela protegida com
dados em < 15 s (é folga larga; a chamada real é ~1 _round-trip_).

**Constraints**:
- **Nenhuma porta nova** (`netstat` confirmado: 3001/5174 seguem livres e já usadas por
  este projeto; nenhum serviço novo é aberto). CORS habilitado no backend para a origem do
  painel (`CORS_ORIGIN`, default `http://localhost:5174`).
- **Sem default silencioso de segredo** — `env.schema` aborta o boot nomeando a variável.
- Respostas 401/403 **sem** _stack_, nome de classe, nem distinção "expirado vs
  assinatura" no corpo (SC-005). Motivo específico só em log interno.
- `client_secret` e token **nunca** em log (backend ou browser), telemetria ou URL
  (SC-008).
- Regra ESLint `no-process-env` da 002 permanece: `@nestjs/jwt` lê o segredo via
  `ConfigService`, não `process.env`.
- Regra ESLint `import/no-restricted-paths` da 001 permanece: `auth` é infra transversal
  (como `config`/`health`), **não** um 12º bounded context — `CONTEXT_MODULES` continua
  com 11 nomes (as e2e de `/health` afirmam exatamente 11).

**Scale/Scope**: ~14 arquivos novos no backend (`src/auth/**` + `test/**`), ~12 no
frontend (`src/auth/**`, `src/pages/LoginPage.tsx`, testes), 1 dep nova, 0 migração,
1 endpoint novo, ~4 arquivos tocados (`app.module.ts`, `main.ts`, `env.schema.ts`,
`router.tsx`/`main.tsx`/`query-client.ts`/`AppShell.tsx`), `.env.example` + `ci.yml`
atualizados, 1 doc novo, 3 docs atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: nenhuma entidade de negócio nova, nenhuma PK, nenhum ID
      de origem. O JWT é efêmero (não é linha de banco). O token de webhook é **escopado ao
      `PlataformaOrigem`** (enum canônico já no `core` desde a 001) — identidade de conta é
      conceito de negócio, lida via `accountConfig`, não string solta.
- [x] **II. Clarificar antes de assumir**: CL-01 (TTL = 12 h) e CL-02 (`localStorage`)
      resolvidos com o dono do produto em 2026-09-03 e registrados em spec §Clarifications.
      Zero `NEEDS CLARIFICATION` aberto. Escopo de _lockout_/hardening explicitamente
      empurrado para a 055 (não assumido aqui).
- [x] **III. Bordas finas, núcleo canônico**: nenhuma regra de negócio conhece "Guru"/
      "Asaas"/etc. `auth` é borda/infra: não há lógica de domínio nele. `WebhookAuthenticator`
      recebe o enum `PlataformaOrigem` e lê `<PLATAFORMA>_WEBHOOK_TOKEN` pelo contrato de
      config do `core`; a checagem é genérica sobre as 7 contas.
- [x] **IV. Log de eventos + projeções**: N/A — sem ingestão, sem pipeline, sem
      `evento_origem` (spec 006). A primitiva de token de webhook é **o portão** que vai
      fronteirar a ingestão nas specs 019–022; é entregue isolada e testada, sem tocar em
      projeção. Nenhum `commit()`, nenhum estado mutável no ORM.
- [x] **V. Agregados derivados**: N/A — esta spec não computa valor agregado nenhum.
- [x] **VI. Contextos delimitados**: `AuthModule` entra no grupo "infra transversal" do
      `AppModule` (ao lado de `ConfigModule`/`PrismaModule`/`HealthModule`), **não** como
      bounded context. `CONTEXT_MODULES` inalterado (11). Guard global por `APP_GUARD`.
      Nenhum contexto de domínio importa `auth` nem outro contexto. A spec 004 (RBAC)
      **estende** este guard (camada de permissão por cima), não o reescreve.
- [x] **VII. Curadoria vs derivação**: N/A — não há campo curado vs derivado nesta spec.
- [x] **VIII. Superfície de escrita mínima**: **um** endpoint novo — `POST /auth/token` —
      e ele **não escreve em banco nenhum** (emissão _stateless_ de token). Justificativa
      registrada: é a primitiva de autenticação de que toda a API depende; sem ela, cada
      spec 004+ reimplementaria login. Nenhuma sincronização automática com API externa.
      Todo o resto que a spec entrega é _guard_ (leitura) e config.
- [x] **Padrões Transversais**:
      - **Config/segredos**: `.env` por conta, **falha cedo**, sem default silencioso —
        preservado da 001/002 e **estendido** (SERVICE_* obrigatórias em todo ambiente;
        `@nestjs/jwt` lê via `ConfigService`, nunca `process.env`).
      - **Multi-conta**: `plataforma_origem` (enum de 7) segue como dimensão de primeira
        classe — é a chave do `WebhookAuthenticator`.
      - **Auditoria**: log estruturado de emissão/negação (sem segredo/token); persistir
        eventos de auth em tabela `_audit` é da 053 (aqui é só o contrato de auditoria da
        002, em log).
      - **Dinheiro / Tempo / Status**: não tocados. (Tempo: o guard usa
        `clockTolerance` do `jsonwebtoken`, não o `parseInstante` do `core` — o token
        carrega epoch numérico, domínio do verificador de JWT.)
      - **Dependência nova** (`@nestjs/jwt`): registrada e justificada em research.md
        (hand-roll de JWT é risco de segurança; alternativa `jose`/manual rejeitada).

**Resultado do gate: PASS.** Uma exceção anotada (1 endpoint de escrita novo, sem
persistência) — justificada acima, sem entrada em Complexity Tracking por não ser violação
de princípio.

*Re-check pós-Phase 1: **PASS** — o design não adicionou entidade persistida, migração,
2º endpoint de escrita, nem acoplamento entre contextos. `AuthModule` permaneceu infra.
Ver `data-model.md` e `contracts/`.*

## Project Structure

### Documentation (this feature)

```text
specs/003-auth-servico-jwt/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões: lib de JWT, formato do TTL, rate limiting,
│                        #           storage do token, CORS, forma da allowlist
├── data-model.md        # Phase 1 — "entidades" (efêmeras/config): Credencial de serviço,
│                        #           Token JWT, Token de webhook, Allowlist; invariantes
├── quickstart.md        # Phase 1 — roteiro de validação (env, lint, typecheck, unit, e2e,
│                        #           fluxo manual de login no painel)
├── contracts/
│   ├── auth-token.md          # POST /auth/token — request/response, códigos, claims
│   ├── jwt-guard.md           # Contrato do guard global + @Public() + allowlist
│   ├── webhook-authenticator.md  # API da primitiva WebhookAuthenticator
│   └── frontend-auth.md       # AuthProvider/useAuth, apiFetch, RequireAuth, LoginPage
├── checklists/
│   └── requirements.md  # Criado no /speckit-specify (todos os itens ok)
└── tasks.md             # Phase 2 — /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
backend/
├── package.json                         # + "@nestjs/jwt": "^11"
├── eslint.config.mjs                    # inalterado (auth herda as regras existentes)
└── src/
    ├── main.ts                          # + app.enableCors({ origin: CORS_ORIGIN })
    ├── app.module.ts                    # + AuthModule no grupo "Infra transversal"
    ├── config/
    │   ├── env.schema.ts                # SERVICE_* → obrigatórias; + SERVICE_JWT_TTL,
    │   │                                #   + CORS_ORIGIN (opcional); + parse/teto do TTL
    │   └── env.schema.spec.ts           # + casos: SERVICE_* ausente falha nomeando a chave
    └── auth/
        ├── auth.module.ts               # JwtModule.registerAsync(secret via ConfigService)
        │                                #   + APP_GUARD(JwtAuthGuard); exporta WebhookAuthenticator
        ├── auth.controller.ts           # @Public() POST /auth/token  (+ RateLimitGuard)
        ├── auth.service.ts              # valida credencial (timingSafeEqual) → emite JWT
        ├── auth.constants.ts            # JWT_ISSUER, STORAGE_KEY doc, prefixos públicos
        ├── dto/token-request.schema.ts  # zod: { client_id, client_secret } → 400 se falha
        ├── decorators/public.decorator.ts   # @Public() → SetMetadata(IS_PUBLIC, true)
        ├── guards/jwt-auth.guard.ts     # verifica Bearer; pula @Public() e allowlist de path
        ├── guards/rate-limit.guard.ts   # janela fixa in-memory por IP (só no controller de auth)
        ├── guards/public-routes.ts      # allowlist central: paths/prefixos isentos do JWT
        ├── webhook/webhook-authenticator.ts  # WebhookAuthenticator (constant-time, por conta)
        └── *.spec.ts                    # unit ao lado de cada fonte pura
    └── test/
        ├── support/auth.ts             # NOVO — issueTestToken()/authHeader() p/ specs futuras
        ├── bootstrap-fail-fast.e2e-spec.ts  # + 3 casos: cada SERVICE_* ausente nomeia a chave
        └── auth.e2e-spec.ts            # NOVO — /auth/token + guard global + allowlist + isca

frontend/
├── vite.config.ts                      # + envDir: '..' (carrega o .env da raiz p/ VITE_*)
└── src/
    ├── main.tsx                        # <AuthProvider> em volta do <RouterProvider>
    ├── app/
    │   ├── router.tsx                  # + rota pública /login; /  embrulhada em <RequireAuth>
    │   └── query-client.ts             # QueryCache/MutationCache onError → trata ApiError 401
    ├── auth/
    │   ├── AuthProvider.tsx            # estado do token + login()/logout(reason) + useAuth()
    │   ├── RequireAuth.tsx             # sem token válido → <Navigate to="/login">
    │   ├── token-storage.ts           # localStorage com try/catch → fallback em memória
    │   ├── decode-jwt.ts              # exp a partir do payload base64url (sem verificar assinatura)
    │   ├── api-client.ts             # apiFetch(): base URL + Authorization + trata 401 num ponto
    │   ├── ApiError.ts               # Error tipado com .status
    │   └── *.test.tsx / *.test.ts
    ├── pages/
    │   └── LoginPage.tsx              # form (client_id + client_secret mascarado); erros 401/429
    └── shell/
        └── AppShell.tsx               # + botão "Sair" no cabeçalho (chama logout())

docs/
└── 003-auth-servico-jwt.md            # NOVO — como o login funciona, claims, allowlist,
                                       #        WebhookAuthenticator, variáveis de ambiente

.env.example                           # + SERVICE_JWT_TTL, CORS_ORIGIN; nota "obrigatórias"
.github/workflows/ci.yml               # + SERVICE_JWT_SECRET/ID/SECRET no bloco env: (fixture)
CLAUDE.md  README.md  ROADMAP.md        # atualizados no fim da spec
```

**Structure Decision**: `auth` é um **módulo de infra transversal** em
`backend/src/auth/`, importado pelo `AppModule` no mesmo grupo de `ConfigModule`/
`PrismaModule`/`HealthModule` — **não** um bounded context (o guard vale para todos os
contextos; ele não é dono de nenhuma entidade de domínio). Por isso `CONTEXT_MODULES`
segue com 11 nomes e as e2e de `/health` não mudam. O guard é global via `APP_GUARD`
(padrão NestJS para "fechado por padrão"); tornar uma rota pública é `@Public()` no
handler ou uma entrada em `guards/public-routes.ts` (allowlist central, revisável em
diff — FR-011). No frontend, a autenticação vive em `src/auth/` com um `AuthProvider` de
contexto e um `apiFetch` que é o **único** ponto de saída HTTP (injeta o header e
concentra o tratamento de 401), deixando o TanStack Query e qualquer `fetch` futuro
atrás dele. `LoginPage` fica em `src/pages/` (padrão da 001) e é a única rota fora do
`AppShell`.

## Complexity Tracking

Sem violação de princípio. A única exceção do gate — **1 endpoint de escrita novo**
(`POST /auth/token`) — é inerente ao pedido (autenticação), não escreve em banco, e está
justificada no Constitution Check (Princípio VIII). Tabela não aplicável.
