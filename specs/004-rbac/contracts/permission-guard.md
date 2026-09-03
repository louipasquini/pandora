# Contract: `@RequerPermissao` / `@AutenticadoBasta` / `PermissionGuard`

## Registro

`AuthModule` provê **dois** `APP_GUARD`, nesta ordem (execução na ordem de declaração):

```ts
{ provide: APP_GUARD, useClass: JwtAuthGuard },     // 003 — autentica, injeta req.auth
{ provide: APP_GUARD, useClass: PermissionGuard },  // 004 — autoriza, usa req.auth
```

## Decorators

```ts
// decorators/requer-permissao.decorator.ts
export const PERM_METADATA_KEY = 'pandora:rbac:requer';
export const RequerPermissao = (...permissoes: Permissao[]) =>
  SetMetadata(PERM_METADATA_KEY, permissoes);   // vazio = erro de código (lança na init)

// decorators/autenticado-basta.decorator.ts
export const AUTENTICADO_BASTA_KEY = 'pandora:rbac:autenticadoBasta';
export const AutenticadoBasta = () => SetMetadata(AUTENTICADO_BASTA_KEY, true);
```

Semântica de `@RequerPermissao(a, b)`: **E** — o sujeito precisa de `a` **e** `b`.

## Algoritmo do `PermissionGuard.canActivate`

1. `@Public()` (handler/classe, `IS_PUBLIC_KEY`) **ou** `ehRotaPublicaPorPath(req.path)` →
   `true`. (Guard de permissão não se aplica ao que a allowlist da 003 já libera.)
2. `@AutenticadoBasta()` presente → `true`.
3. `@RequerPermissao(...perms)` presente:
   - `set = await sujeitoRbac.permissoesDe(req)` (resolução D4, memoizada em `req.rbac`)
   - `perms.every((p) => set.has(p))` → `true`
   - senão → `ForbiddenException('permissão insuficiente')`
4. **Nenhum** dos três marcadores e rota não-pública → `ForbiddenException('permissão
   insuficiente')`. Log `warn` `rbac.guard.reject rota=<m> <path> motivo=sem-marcador-rbac`.

Corpo do 403 (padrão Nest `ForbiddenException`): `{ statusCode: 403, error: "Forbidden",
message: "permissão insuficiente" }`. **Nunca** inclui a permissão que faltou, _stack_ ou
nome de classe (SC-005). O detalhe (`faltou=lead:ver_todos`) vai só para o log interno.

## Boot checks

- `AuthModule.onModuleInit`: `assertCatalogoCoerente()` — ids únicos, formato
  `recurso:acao`, `recurso` = prefixo. Falha → `throw` (aborta o processo).
- `RbacRouteAudit.onApplicationBootstrap`: varre handlers HTTP; qualquer `@RequerPermissao`
  com permissão fora do catálogo → `throw` (aborta). Handlers sem marcador nenhum → `log`
  da lista (não aborta na v1; FR-023 "MAY").
- `AuthModule.onModuleInit` loga uma vez: `rbac.ready permissoes=<n> perfis_sistema=<n>`.

## Resolução de permissões efetivas (`SujeitoRbacService.permissoesDe`)

| `req.auth.sub` | Resultado |
| --- | --- |
| `=== config.SERVICE_CLIENT_ID` (credencial de serviço) | **catálogo inteiro** (código) — não consulta banco |
| casa um `Usuario.id` com perfil `administrador` | catálogo inteiro |
| casa um `Usuario.id` sem perfil de sistema | `∪` das `perfil_permissao` dos perfis `∩` catálogo |
| não casa nada / usuário sem perfil | `∅` |

Memoizado em `req.rbac.permissoes` — uma resolução por requisição (CL-02, sem _staleness_,
sem cache entre requisições).

## Invariantes de teste

### Unit (`permission.guard.spec.ts`, sem banco — `ExecutionContext`/`Reflector` falsos)

| # | Cenário | Esperado |
| --- | --- | --- |
| 1 | handler `@Public()` | `true` |
| 2 | `req.path = '/webhooks/x'` | `true` |
| 3 | `@AutenticadoBasta()` | `true` |
| 4 | `@RequerPermissao('a')`, set `{a}` | `true` |
| 5 | `@RequerPermissao('a','b')`, set `{a}` | `ForbiddenException` |
| 6 | `@RequerPermissao('a')`, set `∅` | `ForbiddenException` |
| 7 | sem marcador, rota não-pública | `ForbiddenException` |
| 8 | sujeito credencial de serviço, `@RequerPermissao('perfil:administrar')` | `true` |

### e2e (`rbac.e2e-spec.ts`, rota-isca no `ProbeController` do harness)

| # | Requisição | Esperado |
| --- | --- | --- |
| 1 | `GET /_probe-perm` (`@RequerPermissao('lead:ver_todos')`) sem token | **401** (JWT antes) |
| 2 | idem, token da credencial de serviço | **200** (admin tem tudo) |
| 3 | idem, token de `Usuario` sem perfil (`issueUserToken(id)`) | **403** genérico |
| 4 | idem, token de `Usuario` com perfil que concede `lead:ver_todos` | **200** |
| 5 | `GET /_probe-sem-marcador` (nada), token válido | **403** (CL-03) |
| 6 | `GET /_probe-autenticado` (`@AutenticadoBasta()`), token de `Usuario` sem perfil | **200** |
| 7 | corpo de qualquer 403 acima | sem `stack`, sem nome de classe, sem id de permissão |
| 8 | catálogo com id duplicado (fixture) no boot | processo **aborta** citando o id |
