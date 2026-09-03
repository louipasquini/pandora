# Contract — Frontend: CRM · Administração

`frontend/src/crm-admin/`. Consome só `/crm/admin/**` via `apiFetch` (003/004 — trata
401/403 num ponto único).

## Navegação e rota

- `shell/nav-items.ts` — `+ { label: 'CRM · Administração', to: '/crm/admin', requerPermissao:
  'crm_admin:ver' }`. O placeholder `{ label: 'CRM', to: '/crm', soon: true }` **permanece**
  (008+ preenchem `/crm`).
- `app/router.tsx` — rota `/crm/admin` (com `?tab=`) sob
  `<RequirePermissao perm="crm_admin:ver"><CrmAdminPage/></RequirePermissao>`.
- Sem `crm_admin:ver` → item some da nav; rota direta → tela "sem permissão" (não `/login`).

## `CrmAdminPage.tsx`

Shell com 3 abas via query `?tab=equipes|expediente|integracoes` (default `equipes`). Cada
aba é _lazy_ e busca seus dados com TanStack Query.

Permissões efetivas (`usePermissoesEfetivas`) decidem os controles de escrita:
- `crm_admin:gerir_equipes` → botões criar/editar equipe, add/remover membro na aba Equipes.
- `crm_admin:gerir_expediente` → criar/editar/remover janela e feriado.
- `crm_admin:gerir_integracoes` → criar/rotacionar/ativar integração.
Sem a permissão de escrita, a aba é **somente-leitura** (nenhum botão de escrita
renderizado).

## Aba Equipes

Lista (`GET /crm/admin/equipes`, filtros `ativo`/`tipo`, paginação). Detalhe/painel lateral:
membros ativos (nome, e-mail, papel, desde) + histórico (com `saiuEm`). Form de criação
(`nome`, `descricao`, `tipo`). Add membro = seletor de `usuario` (lista de `/admin/rbac/usuarios`
da 004) + `papel`. Remover = confirma → `DELETE`. 409 de vínculo duplicado → aviso inline.

## Aba Expediente

- Grade semanal das janelas (`GET /crm/admin/janelas-atendimento`), filtro por equipe
  (`equipeId`) + globais. Form: `diaSemana`, `horaInicio`, `horaFim` (`"HH:MM"`), `equipeId?`.
  422 `janela_invalida` → erro inline no campo `horaFim`.
- Lista de feriados (`GET /crm/admin/feriados`), form (`data`, `descricao`, `recorrenteAnual`,
  `equipeId?`).
- **Indicador "no expediente agora?"** — chama `GET /crm/admin/expediente?equipeId=<sel>`
  (sem `instante` = agora); mostra ✅/⛔ e revalida a cada mudança de janela/feriado e a cada
  troca de equipe no seletor. Um campo opcional de "testar instante" manda `instante=<ISO>`.

## Aba Integrações

Lista (`GET /crm/admin/integracoes`, filtros `tipo`/`alvo`/`ativo`). Cada linha: nome, tipo,
alvo, `ativo`, `ultimoUsoEm`, **máscara** (`segredoMascarado`) — **nunca** o valor. Form de
criação (`nome`, `tipo`, `alvo`, `config` como editor de JSON simples, `segredo` opcional).

**Reveal único**: a resposta de `POST` (com `apiKey`) ou de `POST …/rotacionar` mostra o
valor pleno num `<aside role="alert">` destacado com botão "copiar" e aviso "não será
exibido de novo". Esse valor vive só no estado do componente — **recarregar a página o
perde** (nunca é persistido nem re-buscável). `rotacionar` de `CONEXAO_INTERNA` sem segredo
→ 409 tratado com aviso inline.

## Erros

- **401** em qualquer chamada → fluxo da 003 (limpa token, volta ao Login uma vez).
- **403** → banner "sem permissão" no `AppShell` (ponto único do `apiFetch`), **sem**
  deslogar.

## Testes (`vitest` + Testing Library)

nav esconde o item sem `crm_admin:ver`; rota direta sem permissão → "sem permissão"; 3 abas
montam dos endpoints (mock `fetch` em `test/setup.ts`); sem `gerir_*` → aba read-only;
Integrações só mostra máscara e o valor pleno some ao remontar; indicador de expediente
chama o endpoint; 403 → banner + sessão intacta.
