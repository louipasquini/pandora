---
description: "Task list for feature 003 — auth de serviço JWT"
---

# Tasks: Autenticação de serviço JWT para a API interna

**Input**: Design documents from `specs/003-auth-servico-jwt/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos — a spec (SC-001..SC-009) e a disciplina de teste da constituição
exigem unitário sem banco para as partes puras e e2e contra Postgres real onde precisa do
app completo. Convenção da 001/002: `*.spec.ts` colado ao fonte no backend; `*.e2e-spec.ts`
em `backend/test/`; `*.test.tsx`/`*.test.ts` ao lado do fonte no frontend (`vitest`).

**Organization**: tarefas agrupadas por user story.
US1 (login) e US2 (API fechada) são **P1 e formam o MVP juntas** (uma sem a outra não
entrega); US3 (webhook) e US4 (fail-fast) são P2; US5 (expiração no painel) é P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1 (token+painel), US2 (guard+allowlist), US3 (webhook auth), US4 (fail-fast
  de config), US5 (expiração de sessão no painel)
- Todo caminho é relativo à raiz do monorepo

## Path Conventions

Web app / monorepo npm workspaces. Backend em `backend/src/` + `backend/test/`; frontend em
`frontend/src/`. Também tocados: `.env.example`, `.github/workflows/ci.yml`, `docs/`,
`CLAUDE.md`, `README.md`, `ROADMAP.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependência nova e esqueleto do módulo de infra `auth`.

- [X] T001 Adicionar `"@nestjs/jwt": "^11.0.0"` em `backend/package.json` (dependencies) e
      rodar `npm install` na raiz; conferir que `@nestjs/jwt` e o transitivo `jsonwebtoken`
      aparecem no lockfile e que `npm run build --workspace backend` segue verde.
- [X] T002 [P] Criar a árvore de `backend/src/auth/`: subpastas `dto/`, `decorators/`,
      `guards/`, `crypto/`, `webhook/` (cada uma com `.gitkeep` até receber arquivo). Nenhum
      código ainda.
- [X] T003 [P] Criar a árvore de `frontend/src/auth/` (arquivos entram nas fases de US1/US5).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contrato de config promovido + primitivas puras compartilhadas + fiação do
módulo. **Bloqueia todas as user stories.**

**⚠️ CRITICAL**: T004 bloqueia US1/US4; T005–T006 bloqueiam US1/US2/US3; T007–T008 bloqueiam
US1/US2.

- [X] T004 Alterar `backend/src/config/env.schema.ts`:
      (a) mover `SERVICE_JWT_SECRET` (`z.string().min(32)`), `SERVICE_CLIENT_ID`
      (`z.string().min(1)`) e `SERVICE_CLIENT_SECRET` (`z.string().min(16)`) para
      **obrigatórias** (remover `.optional()`), válidas em todo `NODE_ENV`;
      (b) adicionar `SERVICE_JWT_TTL` opcional: `z.string().regex(/^\d+[smhd]$/).default('12h')`
      com um `.transform` para **segundos** (helper `duracaoParaSegundos` em
      `backend/src/auth/duracao.ts` — ver T006a) exposto como campo derivado
      `SERVICE_JWT_TTL_SEGUNDOS`, **ou** manter string e converter no `AuthModule`; escolher
      uma e documentar. Teto: `superRefine` adiciona issue em `path: ['SERVICE_JWT_TTL']` se
      segundos `> 86400`;
      (c) adicionar `CORS_ORIGIN` opcional (`z.string().url().default('http://localhost:5174')`);
      (d) adicionar `RATE_LIMIT_WINDOW_MS` (`z.coerce.number().int().min(1000).default(60000)`)
      e `RATE_LIMIT_MAX` (`z.coerce.number().int().min(1).default(10)`).
      Nenhum default silencioso para segredo — só para os parâmetros não sensíveis.
- [X] T005 [P] `backend/src/auth/crypto/comparacao-constante.ts` — `comparacaoConstante(a:
      string, b: string): boolean` usando `node:crypto.timingSafeEqual` sobre `Buffer.from`,
      com guarda de comprimento (comprimentos diferentes → `false` sem lançar, tocando um
      buffer de mesmo tamanho). Doc: usada por credencial de serviço (US1) e token de
      webhook (US3).
- [X] T006 [P] `backend/src/auth/crypto/comparacao-constante.spec.ts` — iguais → `true`;
      diferentes de mesmo tamanho → `false`; tamanhos diferentes → `false` e não lança;
      strings vazias.
- [X] T006a [P] `backend/src/auth/duracao.ts` + `duracao.spec.ts` — `duracaoParaSegundos('12h')
      → 43200`, `'90m' → 5400`, `'1d' → 86400`, `'45s' → 45`; formato inválido → `throw`.
- [X] T007 [P] `backend/src/auth/auth.constants.ts` — `JWT_ISSUER = 'pandora'`,
      `IS_PUBLIC_KEY = 'pandora:isPublic'`, `TOKEN_STORAGE_KEY = 'pandora.token'` (doc; o
      valor é usado no frontend), `PUBLIC_PATH_PREFIXES = ['/webhooks/'] as const`.
- [X] T008 `backend/src/auth/auth.module.ts` — `JwtModule.registerAsync` lendo
      `SERVICE_JWT_SECRET` + TTL(seg) via `ConfigService<AppConfig, true>` (`signOptions:
      { issuer: JWT_ISSUER, expiresIn: <ttlSeg> }`); providers: `AuthService` (T010),
      `WebhookAuthenticator` (T033); **exporta** `WebhookAuthenticator`. O `APP_GUARD` entra
      em T028 (US2). Importar `AuthModule` em `backend/src/app.module.ts` no grupo
      "Infra transversal" (ao lado de `ConfigModule`/`PrismaModule`/`HealthModule`) — **não**
      adicionar a `app.context-modules.ts` (`CONTEXT_MODULES` continua com 11).

**Checkpoint**: config promovida + primitivas prontas → US1, US2, US3 podem começar.

---

## Phase 3: User Story 1 — Login e chamadas autenticadas (Priority: P1) 🎯 MVP

**Goal**: `POST /auth/token` emite JWT válido a partir das credenciais de serviço; o painel
tem tela de Login, guarda o token em `localStorage`, e injeta `Authorization: Bearer` em
toda chamada. (A API só é *fechada* na US2 — aqui o caminho feliz já funciona.)

**Independent Test**: `POST /auth/token` com par correto → 200 + token verificável; token
usado num `GET` responde; no painel, login pela tela → shell carrega. Cobre SC-001, e
parcialmente SC-008 (secret/token nunca logados).

### Backend — US1

- [X] T009 [P] [US1] `backend/src/auth/dto/token-request.schema.ts` — zod
      `{ client_id: z.string().min(1), client_secret: z.string().min(1) }` + type inferido.
- [X] T010 [US1] `backend/src/auth/auth.service.ts` — `emitirToken(clientId, clientSecret)`:
      compara ambos com `SERVICE_CLIENT_ID`/`SERVICE_CLIENT_SECRET` via `comparacaoConstante`
      (avaliar os dois antes de decidir, sem _short-circuit_); inválido → `UnauthorizedException`
      genérica; válido → `jwtService.signAsync({}, { subject: SERVICE_CLIENT_ID })` e retorna
      `{ access_token, token_type: 'Bearer', expires_in: <ttlSeg> }`. Log estruturado
      `auth.token.ok` (sub, exp) / `auth.token.fail` (ip, sem secret).
- [X] T011 [US1] `backend/src/auth/guards/rate-limit.guard.ts` — janela fixa em memória
      (`Map<ip, { count, resetAt }>`), `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` via config;
      excedeu → `Throttler-like` `HttpException(429)` com header `Retry-After` (segundos até
      `resetAt`). Exporta só para uso no `AuthController`.
- [X] T012 [US1] `backend/src/auth/auth.controller.ts` — `@Controller('auth')`,
      `@Public()` + `@UseGuards(RateLimitGuard)` no handler `@Post('token')`. Faz
      `tokenRequestSchema.safeParse(body)` → falha ⇒ `BadRequestException` (400, mensagem
      neutra, sem eco do corpo); ok ⇒ `authService.emitirToken(...)`. Resposta 200 conforme
      `contracts/auth-token.md`.
- [X] T013 [US1] `backend/src/main.ts` — `app.enableCors({ origin: config.get('CORS_ORIGIN',
      { infer: true }), methods: ['GET','POST','PATCH','PUT','DELETE'], allowedHeaders:
      ['Authorization','Content-Type'], credentials: false })` e
      `app.getHttpAdapter().getInstance().set('trust proxy', 1)` (para `req.ip` respeitar
      `X-Forwarded-For`). Nada mais no bootstrap muda.
- [X] T014 [P] [US1] `backend/src/auth/auth.service.spec.ts` — par correto → token cujo
      `verify` com o segredo bate; `sub === SERVICE_CLIENT_ID`; `iss === 'pandora'`;
      `exp - iat === ttlSeg`; par errado → `UnauthorizedException` (mesma mensagem para
      id errado e secret errado); nunca inclui o secret na exceção.
- [X] T015 [P] [US1] `backend/src/auth/guards/rate-limit.guard.spec.ts` — N ok até o limite;
      limite+1 → 429 com `Retry-After`; após `WINDOW_MS` (fake timers) a janela reabre;
      IPs diferentes contam separado.
- [X] T016 [P] [US1] `backend/test/support/auth.ts` — `issueTestToken(overrides?)` assina um
      JWT HS256 com `process.env.SERVICE_JWT_SECRET`, `issuer: 'pandora'`, `subject:
      process.env.SERVICE_CLIENT_ID`, `expiresIn` default 3600; `authHeader(token?)` →
      `{ Authorization: 'Bearer ' + (token ?? issueTestToken()) }`. Para as specs futuras.
- [X] T017 [US1] `backend/test/auth.e2e-spec.ts` (parte 1) — `POST /auth/token`: par correto
      → 200 + `access_token` decodificável e `expires_in` coerente; `client_secret` errado
      → 401 genérico; `client_id` errado → 401 idêntico; corpo `{}` / sem body / `text/plain`
      → 400; 11ª chamada do mesmo IP em 60 s → 429 + `Retry-After`. Corpos de erro sem
      `stack`/nome de classe.

### Frontend — US1

- [X] T018 [P] [US1] `frontend/src/auth/ApiError.ts` — `class ApiError extends Error` com
      `status: number` e `body?: unknown`.
- [X] T019 [P] [US1] `frontend/src/auth/decode-jwt.ts` + `decode-jwt.test.ts` — `lerExp(token)
      : number | null` (parse base64url do payload, sem verificar assinatura); token quebrado
      → `null`. Teste: `exp` no passado detectável.
- [X] T020 [P] [US1] `frontend/src/auth/token-storage.ts` + `token-storage.test.ts` —
      `readToken/writeToken/clearToken` em `localStorage` (chave `pandora.token`) com
      `try/catch` → _fallback_ para variável de módulo + flag `storageDisponivel = false`.
      Teste: `localStorage.setItem` lançando não propaga e liga o _fallback_.
- [X] T021 [US1] `frontend/src/auth/api-client.ts` — `apiFetch(path, init?)`: prefixa
      `import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'`; injeta
      `Authorization: Bearer <token>` via getter registrado; `Content-Type: application/json`
      default p/ métodos com corpo; `!res.ok` → lança `ApiError(res.status, body)`. O
      tratamento centralizado de 401 (uma transição) entra na US5 (T040) — aqui deixar o
      ponto de extensão `setUnauthorizedHandler`.
- [X] T022 [US1] `frontend/src/auth/AuthProvider.tsx` — contexto com `{ token, status,
      persistente, logoutReason, login, logout }`. Na montagem lê `token-storage`; se
      `lerExp` no passado (margem 5 s) → descarta. `login(id, secret)` → `apiFetch('/auth/token',
      {method:'POST', body})` → grava token; 401/429 relança `ApiError` sem gravar. `logout(reason?)`
      limpa tudo. Registra o getter de token no `api-client` e (US5) o `setUnauthorizedHandler`.
- [X] T023 [P] [US1] `frontend/src/pages/LoginPage.tsx` — form `client_id` (texto) +
      `client_secret` (`type="password"`); submit → `useAuth().login`; `ApiError(401)` →
      "credenciais inválidas"; `ApiError(429)` → "muitas tentativas, aguarde"; sucesso →
      navega para `state.from ?? '/'`.
- [X] T024 [P] [US1] `frontend/src/auth/RequireAuth.tsx` — `status === 'deslogado'` →
      `<Navigate to="/login" replace state={{ from: location }} />`; senão `<Outlet/>`.
- [X] T025 [US1] Fiação de rotas e shell:
      `frontend/src/app/router.tsx` — nova rota pública `{ path: '/login', element:
      <LoginPage/> }` (fora do `AppShell`); a rota `/` passa a `element: <RequireAuth/>` com
      o `AppShell` como filho (ou `AppShell` dentro de `RequireAuth`).
      `frontend/src/main.tsx` — `<AuthProvider>` em volta do `<RouterProvider>`.
      `frontend/src/shell/AppShell.tsx` — botão "Sair" no cabeçalho → `useAuth().logout()`.
- [X] T026 [US1] `frontend/vite.config.ts` — `envDir: resolve(__dirname, '..')` (carrega o
      `.env` da raiz para `import.meta.env.VITE_*`); confirmar que `VITE_PORT` segue lido.
- [X] T027 [P] [US1] Testes frontend US1: `LoginPage.test.tsx` (fetch mockado: 200 → some o
      `/login`; 401 → mensagem genérica, sem token; 429 → mensagem de espera);
      `RequireAuth.test.tsx` (sem token → `/login`); `api-client.test.ts` (injeta header;
      `!ok` → `ApiError` com `status`).
- [X] T028 [US1] Ajustar os testes existentes do frontend que montam o app
      (`frontend/src/app/App.test.tsx`, `frontend/src/shell/AppShell.test.tsx`) para
      envolver em `<AuthProvider>` com um token _fixture_ válido (helper
      `renderComAuth`), mantendo-os verdes.

**Checkpoint US1**: login ponta a ponta funciona; token trafega no header. A API ainda está
aberta — isso fecha na US2.

---

## Phase 4: User Story 2 — API fechada por padrão + allowlist (Priority: P1)

**Goal**: toda rota exige `Bearer` válido; allowlist explícita (`/health`, `/auth/token`,
prefixo `/webhooks/`); rota nova nasce protegida.

**Independent Test**: rota-isca sem `@Public()` → 401 sem token, 200 com token; `/health` e
`/auth/token` seguem públicos; enumeração de rotas mostra só as 3 públicas. Cobre SC-002,
SC-003, SC-005.

- [X] T029 [P] [US2] `backend/src/auth/decorators/public.decorator.ts` — `IS_PUBLIC_KEY`
      (de `auth.constants.ts`) + `export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)`.
- [X] T030 [P] [US2] `backend/src/auth/guards/public-routes.ts` — re-export de
      `PUBLIC_PATH_PREFIXES` + `ehRotaPublicaPorPath(path: string): boolean`.
- [X] T031 [US2] `backend/src/auth/guards/jwt-auth.guard.ts` — implementar o algoritmo de
      `contracts/jwt-guard.md`: `Reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler, class])`
      → público; `ehRotaPublicaPorPath(req.path)` → público; parse do header `Authorization`
      (regex `^Bearer\s+(.+)$` _case-insensitive_, `trim`, token vazio → 401, header repetido
      → 401); `jwtService.verifyAsync(token, { issuer: JWT_ISSUER, algorithms: ['HS256'],
      clockTolerance: 60 })`; qualquer falha → `UnauthorizedException` **genérica**
      (`message: 'não autenticado'`); motivo real só em `Logger.debug`/`warn`
      (`auth.guard.reject` + rota + motivo). Sucesso: `req.auth = { sub, iat, exp }`.
- [X] T032 [US2] `backend/src/auth/auth.module.ts` — registrar
      `{ provide: APP_GUARD, useClass: JwtAuthGuard }`. Adicionar `@Public()` em
      `backend/src/auth/auth.controller.ts` (já em T012) e em
      `backend/src/health/health.controller.ts` (`check`). Conferir que `HealthModule` não
      precisa importar `AuthModule` (guard é global via `APP_GUARD`).
- [X] T033 [P] [US2] `backend/test/support/probe.controller.ts` — `@Controller('_probe')`
      com `@Get('protegida')` (sem `@Public()`) retornando `{ ok: true }`. Só para e2e.
- [X] T034 [P] [US2] `backend/src/auth/guards/jwt-auth.guard.spec.ts` — unit com
      `ExecutionContext`/`Reflector` mockados: `@Public()` no handler → passa sem header;
      header ausente/sem `Bearer`/vazio/duplicado → `UnauthorizedException`; `bEaReR  x`
      (caixa/espaços) → tenta verificar; prefixo `/webhooks/foo` → passa.
- [X] T035 [US2] `backend/test/auth.e2e-spec.ts` (parte 2) — montar módulo de teste com
      `imports: [AppModule], controllers: [ProbeController]`:
      `GET /_probe/protegida` sem token → 401 (SC-003); com `authHeader()` → 200; token
      expirado → 401 genérico; token assinado com outro segredo → 401; `Authorization` sem
      `Bearer` → 401; `authorization: bEaReR <t>` → 200; 2 headers `Authorization` → 401;
      `GET /_probe/inexistente` sem token → 401 (guard antes do 404);
      `GET /health` e `POST /auth/token` sem token → funcionam; corpos 401 sem `stack`/classe.
- [X] T036 [P] [US2] `backend/test/auth.e2e-spec.ts` (parte 3, SC-002) — introspecção do
      router Express (`app.getHttpAdapter().getInstance()._router.stack`): o conjunto de
      rotas alcançáveis sem token é exatamente `{ GET /health, POST /auth/token }` e nenhuma
      rota fora do prefixo `/webhooks/` está pública.
- [X] T037 [US2] Rodar `npm run test:e2e --workspace backend` e confirmar **sem regressão**
      em `health.e2e-spec.ts` e `context-modules.e2e-spec.ts` (200 + exatamente 11
      contextos; `auth` não entra na lista).

**Checkpoint US1+US2 = MVP**: painel usável e API fechada. Demo possível.

---

## Phase 5: User Story 3 — Autenticação de webhook por conta (Priority: P2)

**Goal**: primitiva `WebhookAuthenticator` reaproveitável, separada do JWT. Sem rota
`/webhooks/*` nesta spec.

**Independent Test**: exercitar `autenticar(conta, token)` — token certo/errado/ausente/de
outra conta/conta sem token. Cobre SC-006.

- [X] T038 [P] [US3] `backend/src/auth/webhook/webhook-authenticator.ts` — `@Injectable()`
      `WebhookAuthenticator` (injeta `ConfigService<AppConfig, true>`); `autenticar(conta:
      PlataformaOrigem, tokenCandidato: string | undefined): ResultadoWebhookAuth` conforme
      `contracts/webhook-authenticator.md`, lendo o esperado via `accountConfig(config,
      conta)?.webhookToken` e comparando com `comparacaoConstante`. Log `webhook.auth.reject`
      (conta + motivo, sem o token). Nunca importa `JwtService`/`SERVICE_JWT_SECRET`.
- [X] T039 [US3] `backend/src/auth/auth.module.ts` — confirmar `WebhookAuthenticator` em
      `providers` **e** `exports` (para as specs 019–022 injetarem).
- [X] T040 [P] [US3] `backend/src/auth/webhook/webhook-authenticator.spec.ts` — matriz do
      contrato (7 casos), com `ConfigService` _fixture_ (`GURU_PRD_WEBHOOK_TOKEN` setado,
      `GURU_SVC_WEBHOOK_TOKEN` ausente): token certo → `{autenticado:true, conta}`; errado →
      `token_invalido`; `undefined` → `token_ausente`; conta sem token → `sem_token_configurado`;
      token de outra conta → `sem_token_configurado`/`token_invalido` conforme a conta alvo;
      comprimentos diferentes não lançam.

**Checkpoint US3**: primitiva pronta e testada para a Fase 2 plugar.

---

## Phase 6: User Story 4 — Boot recusa sem credenciais de serviço (Priority: P2)

**Goal**: `SERVICE_*` obrigatórias em todo ambiente; boot aborta nomeando a variável;
`.env.example` e CI atualizados.

**Independent Test**: subir `main.ts` sem cada `SERVICE_*` (uma por vez) → exit ≠ 0 citando
a chave; com todas presentes → sobe. Cobre SC-004.

- [X] T041 [US4] `backend/test/bootstrap-fail-fast.e2e-spec.ts` — adicionar 3 casos (padrão
      do teste existente, `PANDORA_IGNORE_ENV_FILE=1`, env completa **exceto** a chave sob
      teste, com `DATABASE_URL` válida sintaticamente para isolar a falha): sem
      `SERVICE_JWT_SECRET` → exit ≠ 0 + `/SERVICE_JWT_SECRET/`; idem `SERVICE_CLIENT_ID`;
      idem `SERVICE_CLIENT_SECRET`. Manter o caso existente de `DATABASE_URL`.
- [X] T042 [P] [US4] `backend/src/config/env.schema.spec.ts` — novos casos: `SERVICE_JWT_SECRET`
      ausente → `safeParse` falha citando a chave; idem `SERVICE_CLIENT_ID` /
      `SERVICE_CLIENT_SECRET`; `SERVICE_JWT_TTL='48h'` → falha citando `SERVICE_JWT_TTL`
      (teto 24 h); `SERVICE_JWT_TTL` ausente → default `12h`/43200 s; `.env.example` ainda
      parseia. Ajustar o caso "todas as chaves de conta ausentes" se necessário (agora
      `SERVICE_*` são obrigatórias e continuam presentes no exemplo).
- [X] T043 [P] [US4] `.env.example` — adicionar `SERVICE_JWT_TTL=12h` (comentado, com nota
      do teto 24 h), `CORS_ORIGIN=http://localhost:5174`, `RATE_LIMIT_WINDOW_MS=60000`,
      `RATE_LIMIT_MAX=10`, `VITE_API_BASE_URL=http://localhost:3001`; ajustar o comentário do
      bloco de auth para "**obrigatórias a partir da 003** — o boot aborta se faltarem".
- [X] T044 [US4] `.github/workflows/ci.yml` — no bloco `env:` do job `build-test`, adicionar
      `SERVICE_JWT_SECRET` (≥ 32 chars, fixture), `SERVICE_CLIENT_ID: pandora-panel`,
      `SERVICE_CLIENT_SECRET` (≥ 16, fixture). Conferir que o job `timezone-matrix` (só
      `npm test -- tempo`, unit, sem boot) não precisa das chaves.

**Checkpoint US4**: nenhum ambiente sobe sem os segredos; CI verde.

---

## Phase 7: User Story 5 — Expiração reconduz ao Login sem travar (Priority: P3)

**Goal**: um 401 em qualquer chamada (≠ `/auth/token`) limpa o token e leva ao Login **uma
vez**, com aviso; expiração detectada proativamente pelo `exp`.

**Independent Test**: no painel logado, forçar 401 → uma transição para `/login` + banner;
N×401 concorrentes → uma limpeza; 401 de `/auth/token` não dispara o fluxo. Cobre SC-007.

- [X] T045 [US5] `frontend/src/auth/api-client.ts` — implementar o tratamento central de
      401 (D9): flag de módulo `expirando`; no 1º 401 de `path !== '/auth/token'` chama
      `onUnauthorized()` (registrado pelo `AuthProvider`), marca `expirando`, agenda reset no
      próximo tick; 401 de `/auth/token` só relança `ApiError`.
- [X] T046 [US5] `frontend/src/auth/AuthProvider.tsx` — expor `logoutReason` e registrar
      `setUnauthorizedHandler(() => { clearToken(); queryClient.clear(); logout('expirada'); })`
      (import do `queryClient` singleton — sentido único, sem ciclo). `RequireAuth`
      redireciona ao ver `token === null`.
- [X] T047 [US5] `frontend/src/pages/LoginPage.tsx` — banner "sua sessão expirou, entre
      novamente" quando `logoutReason === 'expirada'`; aviso "o login não vai persistir
      entre abas/reinícios" quando `persistente === false`.
- [X] T048 [P] [US5] Testes frontend US5: `api-client.test.ts` — 5 respostas 401 concorrentes
      → **1** `onUnauthorized`; 401 de `/auth/token` não chama `onUnauthorized`.
      `AuthProvider.test.tsx` — token com `exp` no passado no storage → monta `deslogado` sem
      chamar a API; após 401, `RequireAuth` navega uma vez e `LoginPage` mostra o banner.

**Checkpoint US5**: expiração de 12 h vira uma transição suave, não um chamado de suporte.

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: documentação e fecho do "Definition of Done" da spec (memória
[[pandora-workflow-conventions]]).

- [X] T049 [P] `docs/003-auth-servico-jwt.md` — novo: fluxo de login, claims do JWT, tabela
      de variáveis de ambiente (novas/promovidas), allowlist e como marcar rota pública,
      `WebhookAuthenticator` (assinatura + como as specs 019–022 vão usar), o que fica para a
      spec 004 (RBAC) e 055 (hardening). Linkar de `docs/` no padrão da 001/002.
- [X] T050 [P] `CLAUDE.md` — na seção **Stack**, acrescentar que o backend agora tem o
      módulo de infra `auth` (JWT de serviço + guard global + `WebhookAuthenticator`) e a
      dep `@nestjs/jwt`; citar `SERVICE_JWT_TTL`/`CORS_ORIGIN`. (O bloco SPECKIT já aponta
      para o plano da 003.)
- [X] T051 [P] `README.md` — seção de variáveis de ambiente: marcar `SERVICE_*` como
      obrigatórias e listar as novas; seção "Como rodar": passo de login no painel
      (credenciais de serviço) e o `POST /auth/token` via `curl` para uso fora do painel.
- [X] T052 [P] `ROADMAP.md` — marcar `- [x] **003 — auth-servico-jwt**` com data
      (2026-09-XX) e resumo de 3–4 linhas no padrão das 001/002.
- [X] T053 Rodar o roteiro de `specs/003-auth-servico-jwt/quickstart.md` inteiro: `npm run
      lint`, `npm run typecheck`, `npm run build`, `npm test` (backend + frontend),
      `npm run test:e2e --workspace backend` — tudo verde. Conferir `netstat`/`docker ps`:
      nenhuma porta nova (3001/5174 já do projeto).
- [X] T054 Atualizar a memória `pandora-roadmap-status` (003 concluída, 004 é a próxima) e
      `MEMORY.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependência.
- **Foundational (Phase 2)**: depende do Setup. **Bloqueia todas as user stories.**
- **US1 (Phase 3)** e **US2 (Phase 4)**: dependem da Fundação. US2 depende de US1 só para o
  `@Public()` do `AuthController` já existir (T012); na prática US2 pode começar em paralelo
  e integrar. Juntas = MVP.
- **US3 (Phase 5)**: depende só da Fundação (T005/T008). Independente de US1/US2.
- **US4 (Phase 6)**: depende de T004 (schema). Independente de US1/US2/US3.
- **US5 (Phase 7)**: depende de US1 (frontend base: `api-client`, `AuthProvider`,
  `RequireAuth`, `LoginPage`).
- **Polish (Phase 8)**: depois de todas as user stories desejadas.

### Ordem recomendada (single-dev)

`Setup → Foundational → US1 → US2 → (checkpoint MVP) → US3 → US4 → US5 → Polish`.

### Parallel Opportunities

- T002/T003 (setup) em paralelo.
- Fundação: T005+T006, T006a, T007 em paralelo; T004 independente; T008 depois de T004+T007.
- US1: os `[P]` de DTO/serviço-spec/helpers/decode-jwt/token-storage/ApiError em paralelo;
  o backend (T009–T017) e o frontend (T018–T028) são duas trilhas quase independentes
  (só compartilham o contrato de `contracts/auth-token.md`).
- US3 inteira pode correr em paralelo com US1/US2 após a Fundação.
- US4 (T042/T043 `[P]`) em paralelo com US1/US2.

---

## Implementation Strategy

### MVP (US1 + US2)

1. Phase 1 (Setup) → Phase 2 (Foundational).
2. Phase 3 (US1) → login ponta a ponta funciona.
3. Phase 4 (US2) → API fechada por padrão + allowlist.
4. **PARAR e VALIDAR**: `quickstart.md` seções 2–5; demo.

### Incremental

- +US3 → `WebhookAuthenticator` testado (destrava a Fase 2 do roadmap).
- +US4 → boot fail-fast + CI + `.env.example` (destrava deploy seguro).
- +US5 → expiração de sessão suave no painel.
- Polish → docs + `CLAUDE.md`/`README.md`/`ROADMAP.md` + quickstart completo + memória.

---

## Notes

- `[P]` = arquivo diferente, sem dependência pendente.
- Segredo e token **nunca** em log, resposta, telemetria ou URL (SC-008) — vale para toda
  tarefa que loga.
- Respostas 401/403 sempre com corpo genérico (SC-005).
- `auth` é infra transversal: **não** mexer em `app.context-modules.ts`; as e2e de `/health`
  afirmam exatamente 11 contextos.
- Commit por tarefa ou grupo lógico. Parar em qualquer checkpoint para validar.
