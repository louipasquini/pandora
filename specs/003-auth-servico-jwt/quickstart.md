# Quickstart — Validação da spec 003 (auth de serviço JWT)

Roteiro para provar a fatia ponta a ponta. Não contém implementação — só como rodar e o
que esperar.

## Pré-requisitos

- Node 24, workspaces instalados (`npm ci` na raiz).
- Postgres de teste de pé (o mesmo da 001/002): `npm run db:up`.
- `.env` na raiz com as chaves da 001/002 **mais**:
  ```
  SERVICE_JWT_SECRET=<≥ 32 chars>
  SERVICE_CLIENT_ID=pandora-panel
  SERVICE_CLIENT_SECRET=<≥ 16 chars>
  # opcionais (têm default):
  # SERVICE_JWT_TTL=12h
  # CORS_ORIGIN=http://localhost:5174
  # VITE_API_BASE_URL=http://localhost:3001
  ```
  O `.env.example` já traz todas com placeholders válidos.

## 1. Portões estáticos (raiz)

```bash
npm run lint
npm run typecheck
npm run build
```

Esperado: verde. A regra ESLint `no-process-env` continua barrando leitura de env fora de
`config/`/`core/`/`main.ts` (o `AuthModule` lê tudo via `ConfigService`).

## 2. Unit — backend (sem banco)

```bash
npm test --workspace backend
```

Cobre (novos):
- `auth.service` — emissão de JWT: claims `sub`/`iss`/`iat`/`exp`, `exp-iat == TTL`,
  assinatura verificável; credencial errada → erro genérico; comparação em tempo constante.
- `webhook-authenticator` — matriz do contrato (`contracts/webhook-authenticator.md`).
- `env.schema` — `SERVICE_*` ausente → `safeParse` falha citando a chave; `SERVICE_JWT_TTL`
  acima de 24 h → falha citando `SERVICE_JWT_TTL`; `.env.example` ainda parseia.
- `rate-limit.guard` — 10 ok, 11ª → bloqueio; janela reabre após `WINDOW_MS`.

## 3. Unit — frontend (jsdom)

```bash
npm test --workspace frontend
```

Cobre a matriz de `contracts/frontend-auth.md`: `RequireAuth`, `LoginPage` (200/401/429),
`apiFetch` (injeção de header; **uma** transição para N×401; 401 de `/auth/token` isolado),
`token-storage` (fallback), `decode-jwt` (`exp` vencido).

## 4. e2e — backend (Postgres real, schema isolado)

```bash
npm run test:e2e --workspace backend
```

Cobre:
- `auth.e2e-spec.ts` — `POST /auth/token` 200/400/401/429; guard global com rota-isca
  protegida por omissão (SC-003); `/health` e `/auth/token` públicos; enumeração de rotas
  → só 3 públicas (SC-002); token expirado / assinatura errada / sem `Bearer` → 401 de
  corpo genérico (SC-005).
- `bootstrap-fail-fast.e2e-spec.ts` (estendido) — subir `main.ts` sem `SERVICE_JWT_SECRET`
  / sem `SERVICE_CLIENT_ID` / sem `SERVICE_CLIENT_SECRET` → exit ≠ 0 citando a chave
  (SC-004).
- `health.e2e-spec.ts` / `context-modules.e2e-spec.ts` — **sem regressão**: `/health`
  segue 200 e lista exatamente **11** contextos (o `auth` é infra, não entra na lista).

## 5. Fluxo manual no painel

```bash
# terminal 1
npm run start:dev --workspace backend      # :3001
# terminal 2
npm run dev --workspace frontend           # :5174
```

1. Abrir `http://localhost:5174/` → redireciona para `/login`.
2. Informar `SERVICE_CLIENT_ID` / `SERVICE_CLIENT_SECRET` corretos → cai no shell, a
   "Visão geral" carrega.
3. Recarregar a página (F5) → continua logado (token em `localStorage`, chave
   `pandora.token`).
4. No DevTools, apagar/quebrar `pandora.token` e disparar uma navegação → volta a
   `/login` com "sua sessão expirou" (uma transição só).
5. Errar o segredo no `/login` → "credenciais inválidas", sem token gravado.
6. Repetir o login errado > 10× em 1 min → "muitas tentativas, aguarde" (429).
7. Botão **Sair** no cabeçalho → volta a `/login`.

## 6. CI

`.github/workflows/ci.yml` ganha `SERVICE_JWT_SECRET`/`SERVICE_CLIENT_ID`/
`SERVICE_CLIENT_SECRET` de _fixture_ no bloco `env:` (obrigatórias em `test` agora). Os
jobs `build-test` e `timezone-matrix` seguem verdes.

## Definition of Done (além dos testes)

- [ ] `docs/003-auth-servico-jwt.md` escrito.
- [ ] `CLAUDE.md` (stack + "Plano ativo"), `README.md` (env + "Como rodar" com login),
      `ROADMAP.md` (003 marcada) atualizados.
- [ ] `.env.example` com as chaves novas e nota de "obrigatórias".
- [ ] `netstat` conferido: nenhuma porta nova (3001/5174 já do projeto).
