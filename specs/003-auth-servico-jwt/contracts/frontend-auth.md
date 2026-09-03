# Contract: autenticação no painel (frontend)

## `AuthProvider` / `useAuth()`

```ts
interface AuthState {
  token: string | null;          // JWT bruto ou null
  status: 'logado' | 'deslogado';
  persistente: boolean;          // false se localStorage indisponível (sessão só em memória)
  logoutReason: 'expirada' | null;
}
interface AuthApi extends AuthState {
  login(clientId: string, clientSecret: string): Promise<void>;  // rejeita com ApiError em 401/429
  logout(reason?: 'expirada'): void;
}
```

- Na montagem: lê `pandora.token` via `token-storage`; se `decode-jwt` diz `exp` no passado
  (margem 5 s) → descarta, `status = 'deslogado'`.
- `login`: `POST {VITE_API_BASE_URL}/auth/token` → em 200 grava token (storage + estado),
  `logoutReason = null`; em 401/429 **não** grava e relança `ApiError` (a `LoginPage`
  formata a mensagem).
- `logout`: limpa storage + estado; `status = 'deslogado'`; seta `logoutReason` se passado.
- Nunca loga `clientSecret` nem `token` (console/telemetria) — FR-026.

## `token-storage.ts`

`readToken()`, `writeToken(t)`, `clearToken()`. Tudo em `try/catch`. Se `localStorage`
lança em qualquer operação → cai para `let memoria: string | null` e expõe
`storageDisponivel = false` (o `AuthProvider` reflete em `persistente`). Nunca propaga
exceção de storage para a UI (edge case da spec).

## `decode-jwt.ts`

`lerExp(token: string): number | null` — parse do payload base64url, retorna `exp`
(segundos) ou `null` se o token não parseia. **Não** verifica assinatura. Uso único:
logout proativo.

## `api-client.ts`

```ts
function apiFetch(path: string, init?: RequestInit): Promise<Response>  // lança ApiError em !res.ok
```

- Prefixa `VITE_API_BASE_URL` (default `http://localhost:3001`).
- Injeta `Authorization: Bearer <token>` quando há token (getter passado pelo `AuthProvider`).
- `Content-Type: application/json` por default para métodos com corpo.
- Em `res.status === 401` **e** `path !== '/auth/token'`: aciona `onUnauthorized` **uma
  única vez** por "onda" (flag de módulo `expirando`, ver D9) → `clearToken()` +
  `queryClient.clear()` + `AuthProvider.logout('expirada')`. Depois relança `ApiError(401)`.
- Em `res.status === 401` **e** `path === '/auth/token'`: só relança `ApiError(401)` (a
  `LoginPage` trata) — **não** dispara o fluxo de expiração (FR-030).
- `429` → `ApiError(429)`.

## `RequireAuth.tsx`

Componente de rota: se `useAuth().status === 'deslogado'` → `<Navigate to="/login"
replace state={{ from: location }} />`. Senão renderiza `children` / `<Outlet/>`.

## Rotas (`router.tsx`)

```
/login   → <LoginPage/>                          (pública, fora do AppShell)
/        → <RequireAuth><AppShell/></RequireAuth> (layout)
             └ index → <DashboardPlaceholder/>
```

## `LoginPage.tsx`

- Campos: `client_id` (texto), `client_secret` (`type="password"`).
- Submit → `auth.login(...)`. Em `ApiError(401)`: "credenciais inválidas". Em
  `ApiError(429)`: "muitas tentativas, aguarde". Erro de rede: mensagem neutra.
- Se `auth.logoutReason === 'expirada'`: banner "sua sessão expirou, entre novamente".
- Se `auth.persistente === false`: aviso "o login não vai persistir entre abas/reinícios".
- Sucesso → o `RequireAuth` deixa passar; navega para `state.from` ?? `/`.

## `AppShell.tsx`

- Cabeçalho ganha botão **"Sair"** → `auth.logout()` → `RequireAuth` manda para `/login`.

## Invariantes de teste (vitest + Testing Library)

| # | Cenário | Esperado |
| --- | --- | --- |
| 1 | `/` sem token | redireciona para `/login` |
| 2 | login com par correto (fetch mockado 200) | some o `/login`, aparece o shell |
| 3 | login com 401 | mensagem "credenciais inválidas", continua em `/login`, sem token gravado |
| 4 | login com 429 | mensagem "muitas tentativas" |
| 5 | logado, `apiFetch` recebe 401 | 1× `clearToken` + 1× navegação para `/login` + banner "sessão expirou" |
| 6 | 5 chamadas `apiFetch` retornam 401 juntas | **1** limpeza, **1** navegação (SC-007) |
| 7 | 401 vindo de `/auth/token` | NÃO dispara "sessão expirou" (fica erro de credencial) |
| 8 | `localStorage.setItem` lança | `persistente = false`, app funciona, aviso exibido |
| 9 | token com `exp` no passado no storage | `AuthProvider` monta como `deslogado` sem chamar a API |
| 10 | `apiFetch` com token | header `Authorization: Bearer <token>` presente na request |
