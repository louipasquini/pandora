# Contract: RBAC no painel (frontend)

Constrói sobre o `AuthProvider`/`apiFetch` da spec 003. **Zero permissão _hardcoded_** —
tudo vem de `GET /auth/permissoes-efetivas` e `GET /admin/rbac/permissoes`.

## `usePermissoesEfetivas()` (`src/auth/usePermissoes.ts`)

```ts
function usePermissoesEfetivas(): {
  data: ReadonlySet<string> | undefined;
  isLoading: boolean;
  isError: boolean;   // 403/rede → tratamos como "sem permissões"
}
```

- TanStack Query, `queryKey: ['permissoes-efetivas']`, `apiFetch('/auth/permissoes-efetivas')`.
- Invalidada no `login`/`logout` (permissões trocam com o sujeito).
- `403` da chamada → `data` fica `new Set()` (sujeito sem nada), não erro de UI.

## `RequirePermissao` (`src/auth/RequirePermissao.tsx`)

```tsx
<RequirePermissao perm="perfil:administrar">
  <AdminPage />
</RequirePermissao>
```

- `isLoading` → _spinner_ leve.
- `data?.has(perm)` → renderiza `children` / `<Outlet/>`.
- senão → `<SemPermissao />` (tela "você não tem permissão para acessar isto", com link
  para a Visão geral). **Nunca** `<Navigate to="/login">` — 403 ≠ 401 (FR-032).

## `apiFetch` — tratamento de **403** (adição a `src/auth/api-client.ts`)

- Novo `setForbiddenHandler(fn)` (análogo a `setUnauthorizedHandler`).
- `res.status === 403` → chama `onForbidden()` (o `AuthProvider` mostra um _toast_/banner
  "você não tem permissão para essa ação") e relança `ApiError(403)`.
- **NÃO** limpa token, **NÃO** faz `queryClient.clear()`, **NÃO** navega. A sessão
  permanece (FR-033 / SC-008).
- O fluxo de 401 da 003 fica **intacto**.

## `AuthProvider` (adição)

- `useEffect` registra `setForbiddenHandler(() => setSemPermissaoAviso(Date.now()))`.
- Expõe `semPermissaoAviso` no contexto; um `<Banner>` no `AppShell` o consome e some em
  ~5 s ou no próximo `navigate`.

## Navegação condicional (`src/shell/nav-items.ts` + `AppShell.tsx`)

```ts
export interface NavItem { label: string; to: string; soon?: boolean; requerPermissao?: string }

export const NAV_ITEMS: NavItem[] = [
  { label: 'Visão geral', to: '/' },
  { label: 'CRM', to: '/crm', soon: true },
  { label: 'Financeiro', to: '/financeiro', soon: true },
  { label: 'Marketing', to: '/marketing', soon: true },
  { label: 'Central de Clientes', to: '/central', soon: true },
  { label: 'Administração', to: '/admin', requerPermissao: 'perfil:administrar' },
];
```

`AppShell` filtra: `item.requerPermissao == null || permissoesEfetivas.has(item.requerPermissao)`.

## Rotas (`src/app/router.tsx`)

```
/login  → <LoginPage/>                              (pública)
/       → <RequireAuth><AppShell/></RequireAuth>
            ├ index → <DashboardPlaceholder/>
            └ admin → <RequirePermissao perm="perfil:administrar"><AdminPage/></RequirePermissao>
                        (abas Perfis | Usuários — estado da aba no querystring ?aba=)
```

## `src/admin/`

- **`AdminPage`** — `<Tabs>` Perfis | Usuários.
- **`PerfisTab`** — lista (`GET /admin/rbac/perfis`); editor: campo `nome` + _checklist_ de
  permissões **agrupado por recurso** (de `GET /admin/rbac/permissoes`), com "marcar recurso
  inteiro". Perfil `deSistema` → tudo `disabled` + selo "perfil de sistema".
  `permissoesDesconhecidas` mostradas em cinza com aviso. Criar → `POST`; salvar → `PATCH`;
  apagar → `DELETE` (confirmação; 409 de "em uso" vira aviso com a contagem).
- **`UsuariosTab`** — lista (`GET /admin/rbac/usuarios`); criar (nome + e-mail → `POST`);
  editar perfis por _multi-select_ dos perfis existentes → `PUT /usuarios/{id}/perfis`.
- **`rbac-api.ts`** — wrappers `apiFetch` tipados; erros 400/409 viram mensagem inline.

## Invariantes de teste (vitest + Testing Library)

| # | Cenário | Esperado |
| --- | --- | --- |
| 1 | efetivas incluem `perfil:administrar` | item **Administração** visível; `/admin` renderiza `AdminPage` |
| 2 | efetivas **não** incluem `perfil:administrar` | item some; `/admin` → `<SemPermissao/>` (não `/login`) |
| 3 | `/auth/permissoes-efetivas` responde 403 | tratado como `Set()` → item some, sem crash |
| 4 | `apiFetch` recebe 403 numa ação | `ApiError(403)`, token **intacto**, banner "sem permissão", sem navegação |
| 5 | `apiFetch` recebe 401 | fluxo da 003 inalterado (limpa token, vai a `/login`) |
| 6 | `PerfisTab` com um perfil `deSistema` | controles `disabled`, selo visível |
| 7 | _checklist_ de permissões | agrupado por `recurso`, "marcar recurso" alterna todos do grupo |
| 8 | adicionar permissão no backend (mock do catálogo) | aparece no _checklist_ sem mudança no código do front (SC-007) |
| 9 | `UsuariosTab` criar usuário + atribuir 2 perfis | 2 chamadas (`POST` + `PUT`), lista reflete |
