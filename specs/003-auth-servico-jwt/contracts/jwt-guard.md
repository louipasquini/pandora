# Contract: `JwtAuthGuard` (global) + `@Public()` + allowlist

## Registro

`AuthModule` provê:

```ts
{ provide: APP_GUARD, useClass: JwtAuthGuard }
```

Vale para **todas** as rotas de **todos** os módulos (fechado por padrão).

## Algoritmo do guard

1. Se o handler **ou** a classe têm metadata `IS_PUBLIC_KEY` (via `@Public()`) → `true`.
2. Senão, se `req.path` começa com algum `PUBLIC_PATH_PREFIXES` (`['/webhooks/']`) → `true`.
3. Senão, extrai o header `Authorization`:
   - ausente → `401`
   - presente 2×  → `401`
   - não casa `^Bearer[ ]+(.+)$` (esquema _case-insensitive_, espaços colapsados via
     `trim`) → `401`
   - token vazio após o esquema → `401`
4. `jwtService.verifyAsync(token, { issuer: 'pandora', algorithms: ['HS256'], clockTolerance: 60 })`:
   - assinatura inválida / `alg` ≠ HS256 / `iss` ≠ `pandora` / `exp` no passado / `nbf`
     ou `iat` no futuro além de 60 s / claims faltando → `401`
   - ok → anexa `req.auth = { sub, iat, exp }` e retorna `true`

Toda falha → `UnauthorizedException` com **corpo genérico** (`{ statusCode: 401, error:
"Unauthorized", message: "não autenticado" }`). O motivo real (`"expired"` vs
`"signature"` vs `"malformed header"`) vai **só** para o log interno
(`"auth.guard.reject"` + rota + motivo). Nunca no corpo (SC-005).

## `@Public()`

```ts
export const IS_PUBLIC_KEY = 'pandora:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

Aplicado em: `HealthController.check`, `AuthController.token`. Qualquer outro uso é um
**diff revisável** (FR-011).

## `PUBLIC_PATH_PREFIXES`

```ts
// guards/public-routes.ts
export const PUBLIC_PATH_PREFIXES = ['/webhooks/'] as const;
```

Reservado para as rotas de webhook (specs 019–022), que terão auth própria via
`WebhookAuthenticator`. Adicionar prefixo = decisão explícita e revisável.

## Invariantes de teste (e2e)

| # | Requisição | Esperado |
| --- | --- | --- |
| 1 | `GET /health` sem token | 200/503 (público) |
| 2 | `POST /auth/token` sem token | processa (público) |
| 3 | `GET /_probe-protegida` (rota-isca, sem `@Public()`) sem token | **401** (SC-003) |
| 4 | rota-isca com `Authorization: Bearer <jwt válido>` | 200 |
| 5 | rota-isca com token expirado | 401, corpo genérico |
| 6 | rota-isca com token assinado por outro segredo | 401 |
| 7 | rota-isca com `Authorization: <jwt>` (sem `Bearer`) | 401 |
| 8 | rota-isca com `authorization: bEaReR  <jwt>` (caixa/espaços) | 200 |
| 9 | rota-isca com 2 headers `Authorization` | 401 |
| 10 | `GET /rota-inexistente-protegida` sem token | 401 (guard antes do 404) — FR-012 |
| 11 | enumerar rotas registradas | só 3 entradas públicas (SC-002) |

> A rota-isca vive só no harness de teste (um `ProbeController` em `test/support/`), não
> no código de produção.
