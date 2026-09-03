---
description: "Task list for feature 004 — RBAC"
---

# Tasks: RBAC — perfis de acesso e permissões granulares

**Input**: Design documents from `specs/004-rbac/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos — SC-001..SC-010 e a disciplina de teste da constituição exigem unit
sem banco para as partes puras e e2e contra Postgres real onde precisa do app. Convenção
001–003: `*.spec.ts` colado ao fonte no backend; `*.e2e-spec.ts` em `backend/test/`;
`*.test.tsx`/`*.test.ts` ao lado do fonte no frontend (`vitest`).

**Organization**: por user story.
US1 (guard por permissão) e US2 (catálogo + perfis de sistema) são **P1 e formam o MVP**
(uma sem a outra não decide nada). US3 (CRUD de perfil + auditoria) e US4 (atribuição a
usuários) são P2. US5 (painel Administração) é P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1 (guard/decorators/resolução), US2 (catálogo + `/permissoes` +
  `/auth/permissoes-efetivas` + seed), US3 (CRUD de perfil + `rbac_audit`), US4 (usuário +
  atribuição), US5 (painel)
- Todo caminho é relativo à raiz do monorepo

## Path Conventions

Monorepo npm workspaces. Backend em `backend/src/auth/rbac/` + `backend/prisma/` +
`backend/test/`; frontend em `frontend/src/`. Também tocados: `.github/workflows/ci.yml`,
`docs/`, `CLAUDE.md`, `README.md`, `ROADMAP.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: esqueleto de pastas e o gancho de seed do Prisma. Sem lógica.

- [x] T001 [P] Criar a árvore `backend/src/auth/rbac/` com subpastas `decorators/`,
      `guards/`, `dto/` (cada uma com `.gitkeep` até receber arquivo).
- [x] T002 [P] Criar a árvore `frontend/src/admin/` (`.gitkeep`; arquivos entram na US5).
- [x] T003 Adicionar o bloco `"prisma": { "seed": "ts-node prisma/seed.ts" }` em
      `backend/package.json` (sem dependência nova — `ts-node` já está em devDependencies).
      Confirmar `npm run build --workspace backend` verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema+migração, catálogo, constantes, repositório, seed e fiação do módulo.
**Bloqueia todas as user stories.**

**⚠️ CRITICAL**: T004–T005 bloqueiam US2/US3/US4; T006–T008 bloqueiam US1/US2; T009–T011
bloqueiam US1/US2/US3/US4.

- [x] T004 `backend/prisma/schema.prisma` — adicionar os 5 models de `data-model.md`:
      `Usuario` (`id @db.Uuid`, `nome`, `email`, `emailNormalizado @unique`, `criadoEm`/
      `atualizadoEm @db.Timestamptz`), `Perfil` (`id`, `nome`, `nomeNormalizado @unique`,
      `deSistema Boolean @default(false)`, timestamps), `PerfilPermissao`
      (`perfilId` FK `onDelete: Cascade`, `permissao String`, `@@id([perfilId, permissao])`),
      `UsuarioPerfil` (`usuarioId` FK `onDelete: Cascade`, `perfilId` FK `onDelete: Restrict`,
      `criadoEm`, `@@id([usuarioId, perfilId])`), `RbacAudit` (`id`, `autor`, `quando
      @db.Timestamptz`, `entidade`, `entidadeId @db.Uuid`, `campo`, `valorAnterior Json?`,
      `valorNovo Json?`, `motivo`, `origem`, `criadoEm`). `@@map` para snake_case
      (`usuario`, `perfil`, `perfil_permissao`, `usuario_perfil`, `rbac_audit`).
- [x] T005 Gerar a migração: `npm run prisma:migrate:dev --workspace backend -- --name rbac`
      → cria `backend/prisma/migrations/<ts>_rbac/migration.sql`. Rodar
      `npm run prisma:generate --workspace backend`. Conferir o SQL: 5 tabelas, uniques em
      `email_normalizado` e `nome_normalizado`, PKs compostas nas junções, sem porta/extensão
      nova.
- [x] T006 [P] `backend/src/auth/rbac/catalogo.ts` — `PERMISSOES` (`Object.freeze` de
      `{ id, recurso, rotulo }`): `perfil:administrar`, `lead:criar`, `lead:editar`,
      `lead:ver_todos`, `lead:ver_proprios` (ver `data-model.md`). Exportar `type Permissao`
      (união literal), `PERMISSAO_IDS: ReadonlySet<string>`, `agruparPorRecurso()` e
      `assertCatalogoCoerente()` (ids únicos, regex `^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$`,
      `recurso` = prefixo; falha → `throw`).
- [x] T007 [P] `backend/src/auth/rbac/catalogo.spec.ts` — ids únicos; formato válido;
      `assertCatalogoCoerente` lança para um catálogo _fixture_ com id duplicado e para
      formato inválido; `agruparPorRecurso` preserva ordem de 1ª aparição.
- [x] T008 [P] `backend/src/auth/auth.constants.ts` (editar) — acrescentar
      `PERM_METADATA_KEY = 'pandora:rbac:requer'`, `AUTENTICADO_BASTA_KEY =
      'pandora:rbac:autenticadoBasta'`, `PERFIL_ADMIN_ID` (UUID v7 fixo, comentado como
      "id do perfil de sistema"), `PERFIL_ADMIN_NOME = 'Administrador'`.
- [x] T009 [P] `backend/src/auth/rbac/resolver-permissoes.ts` +
      `resolver-permissoes.spec.ts` — função pura `resolverPermissoesEfetivas(perfis:
      { id: string; permissoes: string[] }[]): ReadonlySet<Permissao>`: união das
      `permissoes` filtradas por `PERMISSAO_IDS`; se algum `perfil.id === PERFIL_ADMIN_ID`
      → `new Set(PERMISSOES.map(p => p.id))`. Testes: união sem duplicata; permissão fora do
      catálogo descartada; lista vazia → `∅`; perfil admin → catálogo inteiro.
- [x] T010 `backend/src/auth/rbac/rbac.repository.ts` — `@Injectable()` sobre `PrismaService`:
      `perfisDoUsuario(usuarioId)`, `listarPerfis()` (com contagem de usuários e
      `perfil_permissao`), `criarPerfil`/`renomearPerfil`/`setPermissoesPerfil`/
      `apagarPerfil` (transações), `perfilPorId`, `perfilPorNomeNormalizado`,
      `criarUsuario`/`listarUsuarios`/`usuarioPorId`/`usuarioPorEmailNormalizado`,
      `perfisDoUsuarioIds`/`setPerfisDoUsuario` (diff em transação). Sem `UPDATE`/`DELETE`
      em `rbac_audit`.
- [x] T011 `backend/src/auth/rbac/rbac-audit.service.ts` — `registrar({ autor, entidade,
      entidadeId, campo, valorAnterior, valorNovo, motivo })`: monta via
      `montarRegistroAuditoria({ ..., quando: agoraUtc(), origem: OrigemMudanca.AJUSTE_MANUAL })`
      (core, spec 002) e faz um `INSERT` em `rbac_audit`. Nunca recebe/grava segredo/token.
- [x] T012 `backend/prisma/seed.ts` — idempotente: `upsert` do `Perfil`
      `{ id: PERFIL_ADMIN_ID, nome: PERFIL_ADMIN_NOME, nomeNormalizado: 'administrador',
      deSistema: true }`; sincroniza `perfil_permissao` do admin com `PERMISSOES` (deleta as
      que saíram, insere as novas). Log `rbac.seed ok perfil=administrador permissoes=<n>`.
      Reexecução não duplica.
- [x] T013 Fiação de seed nos ambientes:
      `backend/test/setup-db.ts` — após o `execFileSync('npx', ['prisma','migrate','deploy'])`,
      adicionar `execFileSync('npx', ['prisma','db','seed'], { …, stdio: 'inherit' })`.
      `.github/workflows/ci.yml` — no job de e2e, adicionar `npx prisma migrate deploy &&
      npx prisma db seed` antes de `test:e2e` (ou confirmar que o `setup-db` já cobre e
      então só garantir `DATABASE_URL`/`TEST_DATABASE_URL`).
- [x] T014 `backend/src/auth/auth.module.ts` (editar) — importar `PrismaModule`; adicionar
      aos `providers`: `RbacRepository`, `RbacAuditService`, `SujeitoRbacService` (T015),
      `PermissionGuard` (T017) como **2º `APP_GUARD`** (declarado **depois** do
      `JwtAuthGuard`). Em `onModuleInit`: `assertCatalogoCoerente()` e log
      `rbac.ready permissoes=<n> perfis_sistema=1`. **Não** adicionar nada a
      `backend/src/app.context-modules.ts` (`CONTEXT_MODULES` segue 11).

**Checkpoint**: banco migrado + semeado, catálogo e repositório prontos → US1 e US2 podem começar.

---

## Phase 3: User Story 1 — Guard por permissão decide 403 vs 200 (Priority: P1) 🎯 MVP

**Goal**: `@RequerPermissao(...)` + `@AutenticadoBasta()` + `PermissionGuard` (2º `APP_GUARD`)
— rota autenticada sem marcador → 403; com `@RequerPermissao` e sujeito sem a permissão →
403; sem token → 401 (guard de JWT antes). Resolução por requisição, credencial de serviço
→ `administrador`.

**Independent Test**: rotas-isca no harness — `@RequerPermissao('lead:ver_todos')` →
200 (serviço) / 403 (`Usuario` sem perfil) / 401 (sem token); `@AutenticadoBasta()` → 200
autenticado; sem marcador → 403. Cobre SC-002, SC-005, SC-009 (regressão 003).

### Implementação — US1

- [x] T015 [P] [US1] `backend/src/auth/rbac/sujeito-rbac.service.ts` +
      `sujeito-rbac.service.spec.ts` — `permissoesDe(req): Promise<ReadonlySet<Permissao>>`:
      memoiza em `req.rbac.permissoes`; `sub = req.auth.sub`; `sub === config.get('SERVICE_CLIENT_ID')`
      → catálogo inteiro (sem query); senão `rbacRepository.perfisDoUsuario(sub)` →
      `resolverPermissoesEfetivas(...)`; `sub` sem `Usuario` → `∅`. Unit com repo/config
      falsos: serviço → tudo; usuário com 2 perfis → união; usuário desconhecido → `∅`;
      2ª chamada não re-consulta (memo).
- [x] T016 [P] [US1] `backend/src/auth/rbac/decorators/requer-permissao.decorator.ts` —
      `RequerPermissao(...permissoes: Permissao[])` = `SetMetadata(PERM_METADATA_KEY,
      permissoes)`; lançar se chamado sem argumentos.
      `backend/src/auth/rbac/decorators/autenticado-basta.decorator.ts` —
      `AutenticadoBasta()` = `SetMetadata(AUTENTICADO_BASTA_KEY, true)`.
- [x] T017 [US1] `backend/src/auth/rbac/guards/permission.guard.ts` — algoritmo de
      `contracts/permission-guard.md`: `@Public()`/`ehRotaPublicaPorPath` → `true`;
      `@AutenticadoBasta()` → `true`; `@RequerPermissao(perms)` → `perms.every(p =>
      set.has(p))` senão `ForbiddenException('permissão insuficiente')`; **sem marcador** e
      não-pública → `ForbiddenException` + `logger.warn('rbac.guard.reject … motivo=sem-marcador-rbac')`.
      Corpo 403 genérico (sem `stack`, sem classe, sem id da permissão que faltou).
- [x] T018 [P] [US1] `backend/src/auth/rbac/guards/permission.guard.spec.ts` — matriz do
      contrato (§Unit, 8 casos) com `ExecutionContext`/`Reflector`/`SujeitoRbacService`
      falsos.
- [x] T019 [US1] `backend/src/auth/rbac/rbac-route-audit.ts` — `onApplicationBootstrap`:
      via `DiscoveryService`+`MetadataScanner`, coletar todo `@RequerPermissao` registrado;
      permissão fora de `PERMISSAO_IDS` → `throw` (aborta o boot citando o id e a rota).
      Handlers HTTP sem nenhum dos 3 marcadores (e não `@Public`) → `logger.warn` com a
      lista (não aborta na v1 — FR-023 "MAY"). Registrar como provider no `AuthModule`.
- [x] T020 [US1] `backend/test/support/probe.controller.ts` (editar) — o `@Get('protegida')`
      existente ganha `@AutenticadoBasta()` (mantém a semântica que a 003 testa: 401 sem
      token, 200 com token). Adicionar: `@Get('perm')` `@RequerPermissao('lead:ver_todos')`,
      `@Get('autenticado')` `@AutenticadoBasta()`, `@Get('sem-marcador')` (nada).
- [x] T021 [P] [US1] `backend/test/support/auth.ts` (editar) — `issueUserToken(usuarioId:
      string, overrides?)` — JWT HS256 válido com `subject: usuarioId` (para exercitar
      sujeito não-admin).
- [x] T022 [US1] `backend/test/rbac.e2e-spec.ts` (parte 1 — guard) — módulo de teste
      `imports: [AppModule], controllers: [ProbeController]`; seed já rodou:
      `GET /_probe/perm` sem token → 401; com token de serviço → 200; com `issueUserToken`
      de um `Usuario` recém-criado **sem** perfil → 403 genérico; com um `Usuario` com
      perfil que concede `lead:ver_todos` → 200; `GET /_probe/sem-marcador` com token válido
      → 403 (CL-03); `GET /_probe/autenticado` com `Usuario` sem perfil → 200; corpos 403
      sem `stack`/classe/id de permissão.
- [x] T023 [US1] Rodar `npm run test:e2e --workspace backend` e confirmar **sem regressão**:
      `auth.e2e-spec.ts` (o `_probe/protegida` agora `@AutenticadoBasta` segue 401/200),
      `health.e2e-spec.ts`, `context-modules.e2e-spec.ts` (ainda **11**).

**Checkpoint US1**: o mecanismo de autorização funciona ponta a ponta com rotas-isca.

---

## Phase 4: User Story 2 — Catálogo + perfis de sistema enumeráveis (Priority: P1)

**Goal**: `GET /admin/rbac/permissoes` (catálogo agrupado, sob `perfil:administrar`) e
`GET /auth/permissoes-efetivas` (permissões do sujeito, `@AutenticadoBasta`); perfil
`administrador` semeado, imutável, com o catálogo inteiro.

**Independent Test**: ler o catálogo (200 com serviço / 403 com `Usuario` sem perfil / 401
sem token); ler efetivas (serviço → catálogo; `Usuario` sem perfil → `[]`); confirmar
`administrador` no banco com `deSistema=true`. Cobre SC-002, SC-003, SC-007.

- [x] T024 [P] [US2] `backend/src/auth/rbac/admin-rbac.controller.ts` — `@Controller('admin/rbac')`,
      classe inteira `@RequerPermissao('perfil:administrar')`. Handler `GET permissoes` →
      `{ recursos: agruparPorRecurso(PERMISSOES) }` em ordem estável.
- [x] T025 [P] [US2] `backend/src/auth/auth.controller.ts` (editar) — `@Get('permissoes-efetivas')`
      `@AutenticadoBasta()` → `{ permissoes: [...sujeitoRbac.permissoesDe(req)].sort() }`.
      Injetar `SujeitoRbacService`.
- [x] T026 [US2] `backend/src/auth/auth.module.ts` (editar) — registrar `AdminRbacController`
      em `controllers`.
- [x] T027 [P] [US2] `backend/src/auth/rbac/admin-rbac.controller.spec.ts` — unit: `permissoes`
      devolve o catálogo agrupado, ordem estável; adicionar uma permissão _fixture_ ao
      catálogo e ver que aparece (SC-007).
- [x] T028 [US2] `backend/test/rbac.e2e-spec.ts` (parte 2 — catálogo/efetivas/seed):
      `GET /admin/rbac/permissoes` 200 (serviço) / 403 (`Usuario` sem perfil) / 401 (sem
      token); `GET /auth/permissoes-efetivas` → serviço = catálogo inteiro, `Usuario` sem
      perfil = `{ permissoes: [] }`; `select` em `perfil` confirma `administrador`
      `deSistema=true` com todas as `perfil_permissao`; rodar `prisma db seed` 2× → ainda
      1 linha `administrador` (idempotência).

**Checkpoint US1+US2 = MVP**: guard + catálogo + perfil de sistema. Demo possível (via `curl`).

---

## Phase 5: User Story 3 — CRUD de perfis com auditoria (Priority: P2)

**Goal**: `GET/POST/PATCH/DELETE /admin/rbac/perfis` sob `perfil:administrar`; cada escrita
grava `rbac_audit` (só _delta_ real); perfil de sistema imutável (409); apagar perfil em
uso → 409.

**Independent Test**: criar/renomear/editar-permissões/apagar um perfil comum; tentar
editar/apagar o `administrador`; conferir 1 `rbac_audit` por ação e 0 em no-op. Cobre
SC-004, SC-005, SC-006.

- [x] T029 [P] [US3] `backend/src/auth/rbac/calcular-delta.ts` + `calcular-delta.spec.ts` —
      `calcularDelta(antes: string[], depois: string[]): { adicionadas, removidas } | null`
      (`null` quando os conjuntos são iguais). Testes: add, remove, ambos, no-op → `null`,
      ordem irrelevante.
- [x] T030 [P] [US3] `backend/src/auth/rbac/dto/perfil.schema.ts` — zod: `criarPerfilSchema`
      (`nome` trim 1..80, `permissoes: string[]` todas em `PERMISSAO_IDS`, dedup),
      `editarPerfilSchema` (ambos opcionais, ≥ 1 presente). Falha de catálogo → mensagem que
      não vaza o catálogo inteiro.
- [x] T031 [US3] `backend/src/auth/rbac/admin-rbac.controller.ts` (editar) — handlers de
      `contracts/admin-rbac-perfis.md`:
      `GET perfis` (lista + `permissoes`/`permissoesDesconhecidas`/`totalUsuarios`);
      `POST perfis` (201; 400 catálogo; 409 nome; `rbac_audit` `perfil`/`criado`);
      `PATCH perfis/:id` (404; **409 se `deSistema`**; renomear → `rbac_audit`
      `perfil`/`renomeado`, 409 colisão; permissões → `calcularDelta` → grava só se `≠ null`,
      `perfil`/`permissoes`; **2 registros** se ambos mudaram);
      `DELETE perfis/:id` (404; 409 `deSistema`; 409 `totalUsuarios>0` + contagem; 204 +
      `rbac_audit` `perfil`/`apagado`).
- [x] T032 [P] [US3] `backend/src/auth/rbac/admin-rbac.controller.spec.ts` (editar) — unit
      dos ramos de erro (deSistema → 409; permissão fora do catálogo → 400; nome duplicado
      → 409) com repo falso.
- [x] T033 [US3] `backend/test/rbac.e2e-spec.ts` (parte 3 — perfis + auditoria) — a matriz
      de `contracts/admin-rbac-perfis.md` (§Invariantes 1–10): `POST` válido → 201 + 1
      `rbac_audit`; `POST` permissão inválida → 400 + 0 linha + 0 auditoria; `PATCH`
      renomear+permissões → 2 registros; `PATCH` mesmas permissões → 0 registro; `PATCH`/
      `DELETE` no `administrador` → 409 + perfil intacto; `DELETE` perfil com 1 usuário →
      409 + `totalUsuarios`; `DELETE` perfil livre → 204 + 1 `rbac_audit`; `Usuario` sem
      `perfil:administrar` em qualquer rota → 403; perfil com `perfil_permissao` órfã
      (fixture) → `permissoesDesconhecidas` na leitura, ignorada na resolução.

**Checkpoint US3**: a matriz é administrável e cada mudança deixa rastro.

---

## Phase 6: User Story 4 — Perfis atribuídos a usuários (Priority: P2)

**Goal**: `POST/GET /admin/rbac/usuarios` e `GET/PUT /admin/rbac/usuarios/{id}/perfis` sob
`perfil:administrar`; permissões efetivas do usuário = união dos perfis; atribuição
auditada.

**Independent Test**: criar usuário; atribuir 2 perfis; ler perfis + efetivas (união);
`PUT` lista vazia; `PUT` perfil inexistente → 404. Cobre SC-002.

- [x] T034 [P] [US4] `backend/src/auth/rbac/dto/usuario.schema.ts` — zod: `criarUsuarioSchema`
      (`nome` trim 1..120, `email` formato válido), `putPerfisSchema`
      (`perfilIds: string[]`).
- [x] T035 [US4] `backend/src/auth/rbac/admin-rbac.controller.ts` (editar) — handlers de
      `contracts/admin-rbac-usuarios.md`:
      `GET usuarios` (lista + `perfis`); `POST usuarios` (201; 400; 409 e-mail normalizado;
      `rbac_audit` `usuario`/`criado`);
      `GET usuarios/:id/perfis` (404 se usuário não existe);
      `PUT usuarios/:id/perfis` (404 usuário; 404 se algum `perfilId` não existe; `[]` limpa;
      diff em transação; `calcularDelta` → grava `rbac_audit` `usuario`/`perfis` só se mudou;
      200 com o estado final).
- [x] T036 [P] [US4] `backend/src/auth/rbac/admin-rbac.controller.spec.ts` (editar) — unit:
      e-mail normalizado duplicado → 409; `perfilId` inexistente → 404.
- [x] T037 [US4] `backend/test/rbac.e2e-spec.ts` (parte 4 — usuários) — a matriz de
      `contracts/admin-rbac-usuarios.md` (§Invariantes 1–9): `POST` válido → 201 + 1
      `rbac_audit`; e-mail repetido (outra caixa) → 409; e-mail malformado → 400; `PUT` 2
      perfis → união em `GET .../perfis` **e** em `GET /auth/permissoes-efetivas` com
      `issueUserToken(id)`; `PUT []` → 0 vínculos + `rbac_audit` `perfis` `[...]`→`[]`;
      `PUT` `perfilId` inexistente → 404 + intacto; `PUT` repetindo os atuais → 0 registro;
      `PUT` usuário inexistente → 404.
- [x] T038 [US4] `backend/test/rbac.e2e-spec.ts` (parte 5 — anti-_lockout_, SC-006) —
      nenhuma sequência (`DELETE` do admin, remover `perfil:administrar` de perfis comuns,
      `PUT []` no único usuário) zera os portadores de `perfil:administrar`: a credencial de
      serviço continua resolvendo para o catálogo inteiro depois de tudo.

**Checkpoint US1–US4**: RBAC completo no backend, auditado, sem caminho para _lockout_.

---

## Phase 7: User Story 5 — Painel Administração (abas Perfis e Usuários) (Priority: P3)

**Goal**: item **Administração** visível só com `perfil:administrar`; aba Perfis (checklist
agrupado por recurso, sistema read-only) e aba Usuários (criar + multi-select de perfis);
403 tratado central (banner, **não** desloga); catálogo do backend, zero _hardcoded_.

**Independent Test**: `contracts/frontend-rbac.md` §Invariantes 1–9. Cobre SC-007, SC-008.

- [x] T039 [P] [US5] `frontend/src/auth/api-client.ts` (editar) — `setForbiddenHandler(fn)`;
      em `res.status === 403` chama `onForbidden()` e relança `ApiError(403)` **sem** limpar
      token, **sem** `queryClient.clear()`, **sem** navegar. Fluxo de 401 intacto.
- [x] T040 [US5] `frontend/src/auth/AuthProvider.tsx` (editar) — `useEffect` registra
      `setForbiddenHandler(() => setSemPermissaoAviso(Date.now()))`; expõe
      `semPermissaoAviso` no contexto (`auth-context.ts` ganha o campo).
- [x] T041 [P] [US5] `frontend/src/auth/usePermissoes.ts` — `usePermissoesEfetivas()`
      (TanStack Query, `queryKey: ['permissoes-efetivas']`, `apiFetch('/auth/permissoes-efetivas')`
      → `ReadonlySet<string>`; 403/erro → `new Set()`); invalidar no `login`/`logout`.
- [x] T042 [P] [US5] `frontend/src/auth/RequirePermissao.tsx` + `RequirePermissao.test.tsx`
      — `perm` prop: `isLoading` → spinner; `has(perm)` → `<Outlet/>`/children; senão
      `<SemPermissao/>` ("você não tem permissão…", link p/ Visão geral) — **nunca**
      `<Navigate to="/login">`.
- [x] T043 [P] [US5] `frontend/src/shell/nav-items.ts` (editar) — `NavItem` ganha
      `requerPermissao?: string`; adicionar `{ label: 'Administração', to: '/admin',
      requerPermissao: 'perfil:administrar' }`.
- [x] T044 [US5] `frontend/src/shell/AppShell.tsx` (editar) — filtrar `NAV_ITEMS` por
      `usePermissoesEfetivas()` (`requerPermissao == null || set.has(requerPermissao)`);
      renderizar o `<Banner>` de `semPermissaoAviso` (some em ~5 s / no próximo `navigate`).
- [x] T045 [US5] `frontend/src/app/router.tsx` (editar) — rota `admin` dentro do `AppShell`,
      embrulhada em `<RequirePermissao perm="perfil:administrar">`; `<AdminPage/>` como
      elemento (aba via `?aba=perfis|usuarios`).
- [x] T046 [P] [US5] `frontend/src/admin/rbac-api.ts` — wrappers `apiFetch` tipados:
      `getPermissoes()`, `getPerfis()`, `criarPerfil()`, `editarPerfil()`, `apagarPerfil()`,
      `getUsuarios()`, `criarUsuario()`, `getPerfisDoUsuario()`, `setPerfisDoUsuario()`.
      400/409 → mensagem inline.
- [x] T047 [US5] `frontend/src/admin/AdminPage.tsx` + `PerfisTab.tsx` + `PerfisTab.test.tsx`
      — `<Tabs>` Perfis|Usuários; PerfisTab: lista (`getPerfis`), editor com campo `nome` +
      _checklist_ de permissões **agrupado por recurso** (de `getPermissoes`) com "marcar
      recurso inteiro"; `deSistema` → tudo `disabled` + selo; `permissoesDesconhecidas` em
      cinza; criar/salvar/apagar (confirmação; 409 "em uso" → aviso com contagem).
- [x] T048 [P] [US5] `frontend/src/admin/UsuariosTab.tsx` + `UsuariosTab.test.tsx` — lista
      (`getUsuarios`), criar (nome + e-mail), editar perfis por _multi-select_ dos perfis
      existentes → `setPerfisDoUsuario`.
- [x] T049 [US5] Ajustar os testes que montam o app com `AuthProvider`
      (`frontend/src/app/App.test.tsx`, `frontend/src/shell/AppShell.test.tsx`, helper
      `frontend/src/test/ComAuth.tsx`) para prover um `QueryClient` e mockar
      `GET /auth/permissoes-efetivas` (default: catálogo inteiro) — manter verdes.
- [x] T050 [P] [US5] Testes frontend restantes de `contracts/frontend-rbac.md`:
      `api-client.test.ts` (403 → `ApiError(403)`, token intacto, sem navegação; 401
      inalterado), navegação esconde **Administração** sem a permissão, `usePermissoes`
      (403 → `Set()`).

**Checkpoint US5**: a equipe administra acesso pelo painel; 403 não desloga.

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: documentação e fecho do "Definition of Done" (memória `pandora-workflow-conventions`).

- [x] T051 [P] `docs/004-rbac.md` — novo: catálogo de permissões (formato, como crescer),
      perfis de sistema + seed, `@RequerPermissao`/`@AutenticadoBasta`/`PermissionGuard`
      (ordem dos 2 `APP_GUARD`, 403 vs 401), resolução por requisição + special-case do
      admin, as 5 tabelas + migração, `rbac_audit` (forma canônica, append-only, painel =
      053), painel (abas Perfis/Usuários, `RequirePermissao`), o que fica para 007/008/futura.
- [x] T052 [P] `CLAUDE.md` — na seção **Stack**, acrescentar o bloco RBAC (catálogo,
      guard/decorators, 5 tabelas + 1ª migração, seed, resolução por requisição); confirmar
      o bloco SPECKIT apontando para `specs/004-rbac/plan.md`.
- [x] T053 [P] `README.md` — "Como rodar": passo de `prisma migrate` + `prisma db seed`
      (1ª migração de negócio); nota de que a API agora nega por omissão (rota precisa de
      `@RequerPermissao`/`@AutenticadoBasta`); citar a tela **Administração**.
- [x] T054 [P] `ROADMAP.md` — marcar `- [x] **004 — rbac**` com data e resumo de 4–5 linhas
      no padrão das 001–003.
- [x] T055 Rodar o roteiro de `specs/004-rbac/quickstart.md` inteiro: `prisma migrate dev`
      (+ seed), `npm run lint`, `typecheck`, `build`, `npm test` (backend + frontend),
      `npm run test:e2e --workspace backend` — tudo verde. Conferir `netstat`/`docker ps`:
      nenhuma porta nova (3001/5174/55432 já do projeto). `context-modules.e2e-spec.ts`
      ainda afirma **11**.
- [x] T056 Atualizar a memória `pandora-roadmap-status` (004 concluída, 005 é a próxima) e
      `MEMORY.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependência.
- **Foundational (Phase 2)**: depende do Setup. **Bloqueia todas as user stories.** T004→T005
  (migração); T006/T008 independentes; T009 depende de T006/T008; T010/T011 dependem de
  T004/T005; T012 depende de T004/T006/T008; T014 depende de T010/T011 (e de T015/T017 para
  o registro — pode ser feita por último na fase).
- **US1 (Phase 3)** e **US2 (Phase 4)**: dependem da Fundação. US2 usa o `AdminRbacController`
  que a US1 não precisa; podem correr quase em paralelo. Juntas = MVP.
- **US3 (Phase 5)**: depende da Fundação + do `AdminRbacController` criado em US2 (T024).
- **US4 (Phase 6)**: depende da Fundação + T024; independente de US3 (arquivos de handler
  diferentes, mas mesmo controller — sequenciar T031/T035 se colidirem).
- **US5 (Phase 7)**: depende de US2 (`GET /auth/permissoes-efetivas`) e US3/US4 para as telas
  terem o que chamar; o frontend base é o da 003.
- **Polish (Phase 8)**: depois de todas as user stories desejadas.

### Ordem recomendada (single-dev)

`Setup → Foundational → US1 → US2 → (checkpoint MVP) → US3 → US4 → US5 → Polish`.

### Parallel Opportunities

- T001/T002 (setup) em paralelo.
- Fundação: T006+T007, T008, T009 em paralelo; T010/T011 em paralelo após T004/T005.
- US1: T015, T016, T018, T021 em paralelo; T017 depende de T015/T016.
- US2: T024/T025/T027 em paralelo; T028 depois.
- US3: T029/T030/T032 em paralelo; T031 depois; T033 por último.
- US4: T034/T036 em paralelo; T035 depois; T037/T038 por último.
- US5: T039/T041/T042/T043/T046/T048/T050 em paralelo; T044/T045/T047 dependem deles; T049
  por último.

---

## Implementation Strategy

### MVP (US1 + US2)

1. Phase 1 (Setup) → Phase 2 (Foundational: schema+migração+seed+catálogo+repo+fiação).
2. Phase 3 (US1) → guard por permissão funciona com rotas-isca.
3. Phase 4 (US2) → catálogo servido + `/auth/permissoes-efetivas` + `administrador` semeado.
4. **PARAR e VALIDAR**: `quickstart.md` seções 1–5; regressão da 003 verde.

### Incremental

- +US3 → CRUD de perfil + `rbac_audit` (a matriz vira administrável).
- +US4 → `usuario` + atribuição (o CRM 007+ tem onde pendurar acesso).
- +US5 → painel Administração (abas Perfis/Usuários), 403 não desloga.
- Polish → `docs/004-rbac.md` + `CLAUDE.md`/`README.md`/`ROADMAP.md` + quickstart + memória.

---

## Notes

- `[P]` = arquivo diferente, sem dependência pendente.
- **403 ≠ 401**: corpo genérico, sem `stack`/classe/id de permissão (SC-005). Motivo real só
  em log interno.
- `rbac_audit` **nunca** grava segredo/token/senha; só ids, nomes, permissões (FR-027).
- `auth` (com `rbac/` dentro) é **infra transversal**: **não** mexer em
  `backend/src/app.context-modules.ts`; `context-modules.e2e-spec.ts` afirma **11**.
- Nenhuma porta nova; nenhuma dependência nova.
- Commit por tarefa ou grupo lógico. Parar em qualquer checkpoint para validar.
