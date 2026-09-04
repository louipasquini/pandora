# Contract — Frontend `frontend/src/leads/`

## Navegação e rota

`shell/nav-items.ts` — nova entrada:
```ts
{ label: 'CRM · Leads', to: '/crm/leads',
  requerPermissao: ['lead:ver_todos', 'lead:ver_proprios'] }   // OU (anyOf)
```
`requerPermissao` passa a aceitar **`string | string[]`**; array = o item aparece se o
sujeito tem **qualquer** uma (`perms.some(p => efetivas.has(p))`). String continua igual.

`RequirePermissao` ganha prop `anyOf?: string[]` (além de `perm?: string`). Rota:
```tsx
<Route element={<RequirePermissao anyOf={['lead:ver_todos','lead:ver_proprios']} />}>
  <Route path="/crm/leads" element={<LeadsPage />} />
  <Route path="/crm/leads/:id" element={<LeadDetalhePage />} />
</Route>
```
Sem nenhuma das permissões → `<SemPermissao />` (nunca `/login`).

## `LeadsPage`

- Tabela: nome, e-mail/telefone, origem, estágio, status, **score**, responsável, criado em.
- Filtros: estágio, status (default esconde `CONVERTIDO`), origem, responsável; busca `q`.
- Ordenação default `score` desc. Paginação (25).
- Botão **Novo lead** só com `lead:criar`. Form: nome + (e-mail | telefone) obrigatório;
  origem/UTM/estágio/responsável/tags opcionais. `leadsSemelhantes` na resposta → aviso não
  bloqueante ("já existem N leads com este contato").
- O conjunto exibido **é** o que o backend devolve (escopo aplicado no servidor) — o
  frontend não filtra por responsável para "esconder"; confia no `where` do backend.

## `LeadDetalhePage`

- Blocos: contato + documento; UTMs + origem; **score** (+ botão **Recalcular** com
  `lead:editar`); tags (add/remover com `lead:editar`); campos personalizados (form gerado
  das definições `GET /crm/admin/campos-lead`; `PUT` com `lead:editar`); timeline de
  auditoria (`GET /crm/leads/:id/auditoria`).
- Ações de estágio/status/responsável: `PATCH` (com `lead:editar`).
- **Converter em pessoa**: botão visível **só** com `lead:editar` **e** `pessoa:editar`
  **e** `lead.status === 'ATIVO'`. Após sucesso → mostra vínculo (`pessoaId`, link para a
  tela de Pessoas da 005) e `status: CONVERTIDO`; some das listas operacionais.
- `DESCARTADO` → botão "Reativar" (`PATCH status=ATIVO`). `CONVERTIDO` → sem ações de
  escrita.

## Tratamento de erro

- **403** em qualquer chamada → banner "sem permissão" no ponto único do `apiFetch`, **sem**
  deslogar (403 ≠ 401 — spec 004).
- **404** no detalhe (lead fora do escopo/inexistente) → tela "lead não encontrado".
- **422** em `POST`/`PUT` → erros de campo inline (zod → mensagens).

## Testes (`vitest` + Testing Library, jsdom)

| Cenário | Esperado |
|---|---|
| sem `lead:*` de leitura | item **CRM · Leads** ausente; rota direta → `<SemPermissao />` |
| só `lead:ver_proprios` | lista monta; mostra o subconjunto que o backend devolve |
| `lead:ver_todos` sem `lead:criar`/`editar` | sem "Novo lead", sem editar, sem converter |
| `lead:editar` + `pessoa:editar`, lead `ATIVO` | botão **Converter em pessoa** presente; pós-converter mostra vínculo |
| `lead:editar` sem `pessoa:editar` | botão **Converter** ausente |
| resposta 403 numa chamada | banner; `localStorage` do token intacto |

`test/setup.ts` — `fetch` default para `/crm/leads/*` e `/crm/admin/campos-lead*`; adiciona
`lead:criar`, `lead:editar`, `lead:ver_todos`, `lead:ver_proprios`,
`crm_admin:gerir_campos_lead` a `TODAS_PERMISSOES`.
