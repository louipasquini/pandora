# 004 — RBAC (perfis de acesso e permissões granulares)

A **matriz de autorização única** do sistema, por cima do JWT de serviço da spec 003. A
mesma matriz vale para CRM, Marketing e Central de Clientes — nenhum contexto reinventa
permissão (visão Parte 8.2.1, 8.11, 9.2.6, 10.7). Continua sendo **infra transversal**
`backend/src/auth/rbac/` — não é um bounded context (`CONTEXT_MODULES` segue com 11).

Spec, plano e contratos: [`specs/004-rbac/`](../specs/004-rbac/).

Primeira **migração de negócio** do projeto (5 tabelas Prisma) e primeira tabela `_audit`
persistida (`rbac_audit`).

---

## Catálogo de permissões (código, não tabela)

`backend/src/auth/rbac/catalogo.ts` — lista **congelada**, fonte única, não editável em
runtime. Cada permissão: `id` `recurso:acao`, `recurso` (prefixo), `rotulo` pt-BR.

| Permissão | Recurso | Para quê |
| --- | --- | --- |
| `perfil:administrar` | perfil | protege **todo** `/admin/rbac/*` |
| `lead:criar` · `lead:editar` · `lead:ver_todos` · `lead:ver_proprios` | lead | vocabulário para a spec 008 (a entidade `lead` não existe ainda) |

Cada spec futura que adiciona um recurso **acrescenta** entradas aqui, num PR revisável.
`assertCatalogoCoerente()` roda no boot (`AuthModule.onModuleInit`): id duplicado ou fora
do formato **aborta** o processo. `RbacRouteAudit` (boot) também aborta se algum
`@RequerPermissao('x')` cita `x` fora do catálogo, e loga handlers HTTP sem marcador.

---

## Guard por permissão — dois `APP_GUARD`, nega por omissão

`AuthModule` registra, **nesta ordem**:

```
{ provide: APP_GUARD, useClass: JwtAuthGuard }     // 003 — autentica, põe req.auth
{ provide: APP_GUARD, useClass: PermissionGuard }  // 004 — autoriza, usa req.auth
```

Decorators:

- `@RequerPermissao('a', 'b')` — exige **a e b** (semântica E). Chamar sem argumentos é
  erro de código.
- `@AutenticadoBasta()` — allowlist explícita "só exige JWT válido" (revisável em _diff_).

Algoritmo do `PermissionGuard`:

1. `@Public()` (003) ou path em `PUBLIC_PATH_PREFIXES` (`/webhooks/`) → passa.
2. `@AutenticadoBasta()` → passa.
3. `@RequerPermissao(...)` → todas presentes nas permissões efetivas? senão **403**.
4. **Nenhum marcador** e rota não-pública → **403** (`motivo=sem-marcador-rbac`). É o
   "fechado por omissão" (CL-03): expor uma rota autenticada é sempre um ato explícito.

**403 ≠ 401.** Corpo genérico `{ statusCode: 403, error: "Forbidden", message: "permissão
insuficiente" }` — sem _stack_, sem nome de classe, **sem** o id da permissão que faltou
(o motivo real vai só para o log interno). 401 (sem token / rota fantasma via
`NotFoundAuthFilter`) e 403 (autenticado, sem permissão) são ortogonais.

---

## Resolução de permissões efetivas — por requisição

`SujeitoRbacService.permissoesDe(req)` (CL-02: por requisição, sem _staleness_, sem cache
entre requisições; memoiza em `req.rbac`):

| `req.auth.sub` | Resultado |
| --- | --- |
| `=== SERVICE_CLIENT_ID` (credencial de serviço) | **catálogo inteiro** — não consulta o banco |
| casa um `Usuario.id` com perfil `administrador` | catálogo inteiro |
| casa um `Usuario.id` sem perfil de sistema | união das `perfil_permissao` dos perfis, ∩ catálogo |
| não casa nada / sem perfil | conjunto vazio |

O **special-case do `administrador`** (id fixo `PERFIL_ADMIN_ID`) garante FR-007/FR-024
("o admin ganha permissões de specs futuras sem intervenção") **mesmo com o seed
defasado** — a decisão usa o catálogo de código, não as linhas de `perfil_permissao`. O
JWT da 003 continua **fino**: só identifica o sujeito.

Enquanto não há login individual de `Usuario`, o único sujeito real é a credencial de
serviço → `administrador`. **Nada da 003 muda** para ela.

---

## Persistência (Prisma) — 5 tabelas

| Tabela | Conteúdo |
| --- | --- |
| `usuario` | membro da equipe: `id` (UUID v7 na app), `nome`, `email` + `email_normalizado @unique`. **Sem** credencial de auth, sem edição/desativação/remoção nesta spec. |
| `perfil` | `id`, `nome` + `nome_normalizado @unique`, `de_sistema`. Perfil de sistema (`administrador`) é imutável. |
| `perfil_permissao` | junção `(perfil_id, permissao)`. `permissao` é **string** validada contra o catálogo — **não** FK. |
| `usuario_perfil` | junção N:N `(usuario_id, perfil_id)`. `onDelete: Restrict` no perfil (não apaga perfil em uso). |
| `rbac_audit` | forma canônica `RegistroAuditoria` do core (`origem = AJUSTE_MANUAL`). **Append-only** — a aplicação nunca faz `UPDATE`/`DELETE` nela. |

Migração: `backend/prisma/migrations/20260903120000_rbac/` (também remove o marcador
`_pandora_baseline` da spec 001). Nomes `citext`-free: e-mail e nome guardam a forma
original + a normalizada (`trim().toLowerCase()`) com `@unique`.

### Seed

`backend/prisma/seed.ts` (bloco `prisma.seed` no `package.json`) — **idempotente**:
`upsert` do perfil `administrador` + sincroniza suas `perfil_permissao` com o catálogo.
Roda em `prisma migrate dev` / `reset` (dev), em `test/setup-db.ts` (e2e, por schema
isolado) e no `ci.yml`. Rodar 2× não duplica.

---

## Endpoints

Todos sob `@RequerPermissao('perfil:administrar')`, exceto onde indicado. Toda escrita
grava `rbac_audit` — **só _delta_ real** (`calcularDelta` → `null` ⇒ nada gravado).

| Método | Rota | Notas |
| --- | --- | --- |
| GET | `/admin/rbac/permissoes` | catálogo agrupado por recurso, ordem estável |
| GET | `/auth/permissoes-efetivas` | **`@AutenticadoBasta()`** — só as permissões do sujeito atual (gate de UI) |
| GET | `/admin/rbac/perfis` | lista + `permissoes` / `permissoesDesconhecidas` / `totalUsuarios` |
| POST | `/admin/rbac/perfis` | 201 · 400 catálogo · 409 nome |
| PATCH | `/admin/rbac/perfis/:id` | 404 · **409** `de_sistema` · renomear + permissões = **2** registros de auditoria |
| DELETE | `/admin/rbac/perfis/:id` | 204 · 404 · 409 `de_sistema` · 409 `{ totalUsuarios }` se em uso |
| GET | `/admin/rbac/usuarios` | lista + perfis de cada |
| POST | `/admin/rbac/usuarios` | criar (nome + e-mail) · 409 e-mail normalizado |
| GET | `/admin/rbac/usuarios/:id/perfis` | 404 se o usuário não existe |
| PUT | `/admin/rbac/usuarios/:id/perfis` | substitui o conjunto · `[]` limpa · 404 `perfilId` inexistente |

### Ações auditadas (`rbac_audit.campo`)

`criado` · `renomeado` · `permissoes` · `apagado` (entidade `perfil`) · `criado` · `perfis`
(entidade `usuario`). `autor` = `req.auth.sub` (hoje sempre a credencial de serviço).
Nunca grava segredo/token/senha.

### Anti-_lockout_

Nenhuma operação zera os portadores de `perfil:administrar`: o `administrador` é
`de_sistema` e imutável, e a credencial de serviço sempre resolve para ele.

---

## Painel — Administração (abas Perfis e Usuários)

- Item de navegação **Administração** (`/admin`) visível só com `perfil:administrar`
  (`AppShell` filtra `NAV_ITEMS` por `usePermissoesEfetivas()`).
- Rota `/admin` atrás de `<RequirePermissao perm="perfil:administrar">` — sem a permissão →
  tela **"você não tem permissão"** (`SemPermissao`), **nunca** `/login` (403 ≠ 401).
- **Aba Perfis**: lista; editor com _checklist_ de permissões **agrupado por recurso**
  (marcar/desmarcar o recurso inteiro); perfil de sistema = somente-leitura + selo;
  `permissoesDesconhecidas` em cinza. Criar/salvar/apagar (409 "em uso" → aviso com
  contagem).
- **Aba Usuários**: lista; criar (nome + e-mail); editar perfis por _multi-select_ →
  `PUT /usuarios/:id/perfis`.
- `apiFetch` central: um **403** dispara `setForbiddenHandler` → banner "você não tem
  permissão para essa ação" no `AppShell`, **sem** limpar token nem deslogar. O fluxo de
  401 da 003 fica intacto.
- **Zero permissão _hardcoded_** no bundle — o _checklist_ vem de
  `GET /admin/rbac/permissoes`, o gate de UI de `GET /auth/permissoes-efetivas`.

---

## O que fica de fora (specs futuras)

- **Login individual da equipe** (senha / _magic link_ / SSO) — `usuario` ainda não tem
  credencial. Uma spec futura de acesso da equipe liga `usuario` a um mecanismo de auth.
- **Semântica de `lead:ver_proprios`** (por responsável? por squad?) — spec 008, dona da
  entidade.
- **Squads / times, horários de atendimento** — spec 007 (crm-administracao).
- **Painel consolidado de auditoria** — spec 053. Aqui só se **grava** `rbac_audit`.
- **Hierarquia/herança de perfis, regras de negação (deny), ABAC, multi-tenant** — fora de
  escopo.

---

## Decisões (spec 004, com o dono do produto em 2026-09-03)

| # | Decisão |
| --- | --- |
| CL-01 | RBAC persiste em **PostgreSQL** (Prisma + seed dos perfis de sistema). |
| CL-02 | Permissões efetivas **resolvidas a cada requisição**; JWT continua fino. |
| CL-03 | `PermissionGuard` **nega por omissão** — `@RequerPermissao` ou `@AutenticadoBasta` explícito. |
| — | `usuario` criado por `POST /admin/rbac/usuarios` (+ `GET` lista); sem editar/desativar/apagar. |
| — | Painel: **Administração** com abas **Perfis** e **Usuários**. |

## Variáveis de ambiente

Nenhuma nova. O RBAC lê `SERVICE_CLIENT_ID` (spec 003) via `ConfigService`.

## Portas

Nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` (spec 001).
