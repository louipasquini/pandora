# Phase 1 — Data Model: Autenticação de serviço JWT

Esta spec **não persiste nada**: sem tabela Prisma, sem migração, sem entidade de domínio.
As "entidades" abaixo são artefatos efêmeros (token) ou de configuração (credenciais,
tokens de webhook, allowlist). Documentadas aqui para fixar campos e invariantes.

---

## 1. Credencial de serviço (config, não-persistida)

O par que representa "o painel da equipe". Um único par; um único nível de acesso.

| Campo | Origem | Regras |
| --- | --- | --- |
| `client_id` | env `SERVICE_CLIENT_ID` | obrigatório; `string` não-vazia (≥ 1) |
| `client_secret` | env `SERVICE_CLIENT_SECRET` | obrigatório; `string` (≥ 16 caracteres) |

**Invariantes**
- Ausência de qualquer um → **boot aborta** nomeando a variável (FR-008/FR-017/FR-018).
- Nunca logados, nunca em resposta HTTP, nunca em URL.
- Comparação com o que chega em `POST /auth/token` é **em tempo constante** (D5).
- A spec 004 (RBAC) introduz papéis/pessoas **por cima** disto — não altera este par.

---

## 2. Token de acesso de serviço — JWT (efêmero, não-persistido)

Emitido por `POST /auth/token`; validado pelo `JwtAuthGuard`. Assinatura **HS256** com
`SERVICE_JWT_SECRET`.

| Claim | Valor | Regras |
| --- | --- | --- |
| `sub` | valor de `SERVICE_CLIENT_ID` | identificador estável da credencial de serviço |
| `iss` | `"pandora"` (constante `JWT_ISSUER`) | verificado na emissão e na validação |
| `iat` | epoch s da emissão | preenchido pelo `jsonwebtoken` |
| `exp` | `iat + SERVICE_JWT_TTL(s)` | TTL default 43200 s (12 h); **teto 86400 s** (24 h) |
| `alg` (header) | `HS256` | validação **fixa** em `['HS256']` — `none` recusado |

**Não** carrega: papéis, permissões, e-mail, dados de pessoa (isso é 004+). Nenhum
identificador de banco (é _stateless_).

**Invariantes**
- `exp - iat ≤ 86400`. Um `SERVICE_JWT_TTL` que viole isso **aborta o boot** (FR-005).
- Verificação exige: assinatura válida, `iss === "pandora"`, não expirado, `nbf`/`iat` não
  no futuro além de `clockTolerance = 60 s` (edge case _clock skew_).
- Falha em qualquer verificação → **401 de corpo genérico**; motivo detalhado só em log
  interno (FR-009, SC-005).
- Nunca logado, nunca em URL, nunca em `localStorage` de terceiros — só no header
  `Authorization` e na chave `pandora.token` do próprio painel.

### Estados no cliente (painel)

```
        POST /auth/token 200            exp <= agora  |  qualquer 401 (path != /auth/token)
 ┌──────────┐ ───────────────► ┌──────────┐ ─────────────────────────────────────► ┌──────────┐
 │ DESLOGADO│                  │  LOGADO  │                                         │ DESLOGADO│
 │ (/login) │ ◄─────────────── │ (shell)  │                                         │ + aviso  │
 └──────────┘   logout()       └──────────┘                                         └──────────┘
```

- `DESLOGADO`: só `/login` acessível; `RequireAuth` redireciona o resto.
- `LOGADO`: token presente e `exp` no futuro; `apiFetch` injeta `Authorization`.
- Transição `LOGADO → DESLOGADO` por 401 acontece **uma vez** mesmo com N respostas 401
  simultâneas (D9 / FR-028 / SC-007) e seta `logoutReason = "expirada"` (aviso na
  `LoginPage`).

---

## 3. Token de webhook por conta (config, não-persistido)

Um segredo por `PlataformaOrigem`. Já existe no `env.schema` desde a spec 001 como
**opcional** (`accountKeys(prefix)` → `<PREFIX>_WEBHOOK_TOKEN`). Esta spec **não** o
promove a obrigatório (as specs de adapter, Fase 2, decidem por conta).

| Campo | Origem | Regras |
| --- | --- | --- |
| `webhookToken` | env `<PLATAFORMA>_WEBHOOK_TOKEN` | opcional; lido via `accountConfig(config, plataforma)` |

**Invariantes**
- Conta **sem** `webhookToken` configurado → `WebhookAuthenticator` retorna **recusado**
  (nunca "aceita tudo") — FR-015.
- Token **escopado à conta**: o token de `Guru PRD` não autentica `Guru SVC` — FR-015.
- Comparação em **tempo constante** (D5) — FR-014.
- Mecanismo **independente** do JWT: não usa `SERVICE_JWT_SECRET`, não passa pelo
  `JwtAuthGuard` (FR-016). Nenhuma rota `/webhooks/*` é criada nesta spec.

`PlataformaOrigem` (do `core`, 7 contas): `TMB`, `ASAAS_PRD`, `ASAAS_SVC`, `GURU_PRD`,
`GURU_SVC`, `HOTMART_PRD`, `HOTMART_SVC`.

---

## 4. Allowlist de rotas públicas (código, não-config)

Conjunto pequeno e explícito de rotas isentas do `JwtAuthGuard`.

| Entrada | Mecanismo | Motivo |
| --- | --- | --- |
| `GET /health` | `@Public()` no handler | _probes_ de saúde (contrato da 001) |
| `POST /auth/token` | `@Public()` no handler | não pode exigir o token que emite |
| `/webhooks/*` | prefixo em `PUBLIC_PATH_PREFIXES` | reservado p/ specs 019–022; têm auth própria |

**Invariantes**
- Rota **sem** `@Public()` e **fora** dos prefixos → protegida (default fechado) — FR-011,
  SC-002, SC-003.
- Alterar a allowlist é um **diff revisável** (nunca vem de `.env`) — FR-011.
- Um teste enumera as rotas registradas e falha se algo além dessas três estiver público
  (SC-002).

---

## 5. Contador de _rate limit_ (efêmero, em memória)

Não é entidade de domínio — estrutura de proteção reiniciada a cada restart.

| Campo | Regras |
| --- | --- |
| chave | IP de origem (`req.ip`, com `trust proxy = 1`) |
| janela | `RATE_LIMIT_WINDOW_MS` (default 60000) |
| limite | `RATE_LIMIT_MAX` (default 10) por janela |
| excedido | resposta `429` + header `Retry-After` (segundos até a janela reabrir) |

**Invariante**: aplicado **só** ao `AuthController` (`POST /auth/token`), nunca às rotas
protegidas normais. Sem persistência; a 055 escolhe o store real.

---

## Variáveis de ambiente (delta desta spec)

| Chave | Antes (001/002) | Depois (003) | Validação |
| --- | --- | --- | --- |
| `SERVICE_JWT_SECRET` | opcional | **obrigatória** | `string`, ≥ 32 |
| `SERVICE_CLIENT_ID` | opcional | **obrigatória** | `string`, ≥ 1 |
| `SERVICE_CLIENT_SECRET` | opcional | **obrigatória** | `string`, ≥ 16 |
| `SERVICE_JWT_TTL` | — | **nova, opcional** | `<n>[s\|m\|h\|d]`, default `12h`, → seg, ≤ 86400 |
| `CORS_ORIGIN` | — | **nova, opcional** | URL, default `http://localhost:5174` |
| `RATE_LIMIT_WINDOW_MS` | — | **nova, opcional** | int ≥ 1000, default 60000 |
| `RATE_LIMIT_MAX` | — | **nova, opcional** | int ≥ 1, default 10 |
| `VITE_API_BASE_URL` | — | **nova, opcional** (frontend) | URL, default `http://localhost:3001` |

Obrigatórias valem em **todos** os `NODE_ENV`, inclusive `test` (CL / FR-017). O
`superRefine` do schema também valida o teto do TTL e reporta o `path` `['SERVICE_JWT_TTL']`.
