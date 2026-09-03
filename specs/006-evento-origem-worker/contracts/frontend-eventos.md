# Contract — Frontend: painel **Eventos**

Segue o molde de `frontend/src/pessoas/` (005). **0 dependência nova.**

## Navegação e rotas

- `frontend/src/shell/nav-items.ts`: `+ { label: 'Eventos', to: '/eventos', requerPermissao:
  'evento:ver' }`. O `AppShell` já filtra `NAV_ITEMS` por `usePermissoesEfetivas()` (004) —
  sem `evento:ver` o item **não aparece**.
- `frontend/src/app/router.tsx`: `+ <Route path="/eventos" …>` e `/eventos/:id`, ambas
  dentro de `<RequirePermissao perm="evento:ver">` → sem a permissão mostra `SemPermissao`
  (nunca `/login`).

## `EventosListPage`

- Filtros: conta (`plataformaOrigem`), `status` (multi; **default `revisar` + `erro`**, com
  alternador "todos"), `tipoOrigem`, `classificacao`, intervalo de data. Paginação
  (`pagina`/`tamanho`, teto 100).
- Colunas: conta · tipo · `idOrigem` · status (badge) · classificação · `recebidoEm` ·
  resumo de `erroDetalhe`.
- Consome `GET /ingestao/eventos` via `eventos-api.ts` (`apiFetch` central).
- Lista vazia → estado vazio, não erro.

## `EventoDetailPage`

- Cabeçalho: conta, `tipoOrigem`, `idOrigem`, `hash`, `status`, `classificacao`,
  `recebidoEm`/`ultimoRecebidoEm`, `reentregas`, `erroDetalhe`.
- `payloadBruto`: `<pre>` formatado dentro de container com `overflow:auto` (não estoura a
  página).
- `eventoCanonico` (se presente): idem.
- **Linha do tempo das etapas**: uma entrada por `EventoEtapa` (7), na ordem — `etapa`,
  badge de `status` (`ok`/`erro`/`bloqueada`/`pulada`/`pendente`), `tentativas`,
  `executadoEm`, `resultado`/`erroDetalhe`.
- `<ReprocessarButton eventoId>` — renderizado **só** se `usePermissoesEfetivas` inclui
  `evento:reprocessar`; `POST …/{id}/reprocessar`; ao concluir, invalida a query do detalhe.

## Erros

- `apiFetch` central (003/004): 401 → limpa token + Login (uma vez); **403 → banner "sem
  permissão", sessão intacta** (não desloga). Nada novo nesta spec.
- `404` no detalhe → tela "evento não encontrado".

## Testes (`vitest` + Testing Library)

- lista: filtros aplicam, default mostra só `revisar`/`erro`, paginação.
- detalhe: payload formatado visível; linha do tempo com os 7 estágios; `ReprocessarButton`
  ausente sem `evento:reprocessar`, presente e funcional com.
- nav: **Eventos** ausente sem `evento:ver`; rota direta sem permissão → `SemPermissao`.
- 403 numa chamada → banner, `useAuth` continua logado.
- `frontend/src/test/setup.ts`: `fetch` default responde `/ingestao/eventos` com
  `{ itens: [], total: 0, pagina: 1, tamanho: 25 }`.
