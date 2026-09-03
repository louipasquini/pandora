# 003 — Autenticação de serviço JWT

Primeiro portão de acesso do sistema. Fecha a API interna por padrão e dá ao painel React um
jeito de se autenticar. **Sem** banco de usuários, **sem** _refresh token_, **sem** porta
nova. Módulo de **infra transversal** `backend/src/auth/` — não é um bounded context
(`CONTEXT_MODULES` continua com 11).

Spec, plano e contratos: [`specs/003-auth-servico-jwt/`](../specs/003-auth-servico-jwt/).

---

## Como o login funciona

```
painel  ──POST /auth/token {client_id, client_secret}──►  backend
painel  ◄──200 {access_token, token_type:"Bearer", expires_in}──  backend
painel  ──GET /qualquer-rota  Authorization: Bearer <jwt>──►  backend  (JwtAuthGuard)
```

- O par `client_id` / `client_secret` são as **credenciais de serviço** (`.env`:
  `SERVICE_CLIENT_ID` / `SERVICE_CLIENT_SECRET`). Um único par, um único nível de acesso —
  a spec 004 (RBAC) introduz papéis por cima disto.
- O `access_token` é um **JWT HS256** assinado com `SERVICE_JWT_SECRET`. _Stateless_: nada
  é persistido (sem sessão no servidor, sem tabela). Validado só por assinatura + claims.
- Expira em **12 h** (`SERVICE_JWT_TTL`, teto rígido 24 h). Sem _refresh_: o painel
  re-autentica com as mesmas credenciais.

### Claims do token

| Claim | Valor |
| --- | --- |
| `sub` | valor de `SERVICE_CLIENT_ID` |
| `iss` | `"pandora"` (constante `JWT_ISSUER`) |
| `iat` / `exp` | emissão / expiração (`exp − iat` = `SERVICE_JWT_TTL`, sempre ≤ 24 h) |
| `alg` (header) | `HS256` — a verificação trava em `['HS256']`, nunca aceita `none` |

### Respostas de `POST /auth/token`

| Código | Quando | Corpo |
| --- | --- | --- |
| 200 | par correto | `{ access_token, token_type: "Bearer", expires_in }` |
| 400 | corpo malformado / sem `client_id`/`client_secret` / `Content-Type` errado / campo extra | `{ statusCode:400, ... "corpo inválido" }` |
| 401 | `client_id` e/ou `client_secret` incorretos | `{ statusCode:401, ... "credenciais inválidas" }` — genérico, não diz qual campo |
| 429 | _rate limit_ por IP estourado | `Retry-After: <s>` + `{ ... "muitas tentativas, aguarde" }` |

Comparação de credenciais em **tempo constante** (`comparacaoConstante`, `node:crypto`).

---

## Guard global e allowlist

`JwtAuthGuard` é `APP_GUARD` (vale para **todas** as rotas de todos os módulos). Uma rota
sem marcação nasce **protegida**. Falha em qualquer verificação → **401 de corpo genérico**
(`"não autenticado"`); o motivo real (`expired` / `signature` / `malformed`) só vai para o
log interno (`auth.guard.reject`).

**Allowlist** (as únicas 3 formas de uma rota ser pública):

| Entrada | Mecanismo |
| --- | --- |
| `GET /health` | `@Public()` no handler |
| `POST /auth/token` | `@Public()` no handler |
| `/webhooks/*` | prefixo em `PUBLIC_PATH_PREFIXES` — reservado p/ as specs 019–022, que têm auth própria |

Tornar uma rota pública é `@Public()` (decorator `backend/src/auth/decorators/public.decorator.ts`)
ou uma entrada em `guards/public-routes.ts` — sempre um **diff revisável**.

Um caminho **inexistente** sob área protegida, sem token válido, devolve **401** (não 404):
o `NotFoundAuthFilter` converte o 404 em 401 quando a requisição não traz token válido —
quem não está autenticado não confirma nem a existência de rotas.

### Parsing do header `Authorization`

Esquema `Bearer` _case-insensitive_, espaços colapsados (`trim`); token vazio → 401; header
`Authorization` repetido → 401 (checado em `req.rawHeaders`). Tolerância de _clock skew_ de
60 s em `exp`/`nbf`/`iat`.

---

## `WebhookAuthenticator` — token de webhook por conta

Primitiva reaproveitável, **separada** do JWT de serviço (não usa `SERVICE_JWT_SECRET`, não
passa pelo guard). Nenhuma rota `/webhooks/*` existe nesta spec — as specs 019–022 injetam
o serviço e extraem o token do header que cada plataforma usar.

```ts
import { WebhookAuthenticator } from '../auth/webhook/webhook-authenticator';

const r = this.webhookAuth.autenticar(PlataformaOrigem.GURU_PRD, tokenDoHeader);
// r: { autenticado: true, conta } | { autenticado: false, motivo: 'sem_token_configurado' | 'token_invalido' | 'token_ausente' }
```

- Compara em tempo constante contra `<PLATAFORMA>_WEBHOOK_TOKEN` (via `ConfigService`).
- Conta **sem** token configurado → `sem_token_configurado` (nunca "aceita qualquer coisa").
- Token **escopado à conta**: o de `GURU_PRD` não autentica `GURU_SVC`.
- Exportado pelo `AuthModule` (`exports: [WebhookAuthenticator]`).

---

## Painel (frontend)

- **`/login`** — tela fora do `AppShell`, coleta `client_id` + `client_secret` (mascarado).
  Erros genéricos: 401 → "Credenciais inválidas", 429 → "Muitas tentativas".
- **`AuthProvider`** (`src/auth/`) + **`useAuth()`** (`src/auth/auth-context.ts`) — estado
  `{ token, status, persistente, logoutReason }` + `login` / `logout`.
- **Token em `localStorage`** (chave `pandora.token`) — sobrevive a fechar/reabrir o
  navegador e é compartilhado entre abas (decisão CL-02). Se `localStorage` estiver
  indisponível, degrada para sessão em memória e a tela avisa que o login não persiste.
- **`decode-jwt.ts`** — lê `exp` (sem verificar assinatura) para tratar como deslogado, de
  forma proativa, um token já vencido.
- **`api-client.ts` (`apiFetch`)** — ponto **único** de saída HTTP: injeta
  `Authorization: Bearer`, e num 401 de qualquer rota que não seja `/auth/token` limpa o
  token e reconduz ao Login **uma vez** (N respostas 401 simultâneas → uma transição). Um
  401 de `/auth/token` fica como erro de credencial na tela de Login.
- **`RequireAuth`** — envolve as rotas do shell; sem sessão → `<Navigate to="/login">`.
- **Botão "Sair"** no cabeçalho do `AppShell`.

---

## Variáveis de ambiente (delta desta spec)

| Chave | Antes | Agora | Regra |
| --- | --- | --- | --- |
| `SERVICE_JWT_SECRET` | opcional | **obrigatória** | `string`, ≥ 32 — boot aborta se faltar |
| `SERVICE_CLIENT_ID` | opcional | **obrigatória** | `string`, ≥ 1 |
| `SERVICE_CLIENT_SECRET` | opcional | **obrigatória** | `string`, ≥ 16 |
| `SERVICE_JWT_TTL` | — | nova, opcional | `<n>[s\|m\|h\|d]`, default `12h`, convertida p/ segundos, **teto 24 h** (acima disso o boot aborta) |
| `CORS_ORIGIN` | — | nova, opcional | URL, default `http://localhost:5174` |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | — | novas, opcionais | default `60000` / `10` (por IP, só em `/auth/token`) |
| `VITE_API_BASE_URL` | — | nova, opcional (frontend) | URL, default `http://localhost:3001` (lida do `.env` da raiz — `vite.config.ts` usa `envDir: '..'`) |

As 3 obrigatórias valem em **todo** `NODE_ENV`, inclusive `test` — a CI e o harness e2e
fornecem valores de _fixture_. Sem default silencioso para segredo (Padrão Transversal de
config).

---

## O que fica para depois

- **Papéis / permissões / pessoas usuárias** — spec 004 (RBAC), estende este guard.
- **Rotas `/webhooks/*` reais** e parsing de payload — specs 019–022 (plugam o
  `WebhookAuthenticator`).
- **Login da aluna** no portal da Central — mecanismo distinto, spec 045.
- **_Hardening_**: _rate limiting_ robusto / _lockout_, reavaliar armazenamento do token,
  CSP, cabeçalhos de segurança, retenção de log de auth — spec 055.
- **Auditoria persistida** de eventos de autenticação (tabela `_audit`) — spec 053.
