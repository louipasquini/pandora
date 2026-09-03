# Contract: frontend — Pessoas e Contas

Reusa **todo** o encanamento de gate de UI da 004 (`usePermissoesEfetivas`,
`RequirePermissao`, `apiFetch` com tratamento central de 401 **e** 403, `nav-items` com
`requerPermissao`). Esta spec só **consome**. Nada novo no cliente HTTP.

## Navegação

`frontend/src/shell/nav-items.ts` — `NAV_ITEMS` ganha:

```ts
{ label: 'Pessoas', to: '/pessoas', requerPermissao: 'pessoa:ver' },
{ label: 'Contas',  to: '/contas',  requerPermissao: 'conta:ver'  },
```

`AppShell` já filtra `NAV_ITEMS` por `usePermissoesEfetivas()` — sem a permissão, o item
não aparece.

## Rotas (`frontend/src/app/router.tsx`, dentro do `AppShell`)

| Path | Elemento | Guard |
|---|---|---|
| `pessoas` | `<PessoasListPage/>` | `<RequirePermissao perm="pessoa:ver">` |
| `pessoas/:id` | `<PessoaDetailPage/>` | `<RequirePermissao perm="pessoa:ver">` |
| `contas` | `<ContasListPage/>` | `<RequirePermissao perm="conta:ver">` |
| `contas/:id` | `<ContaDetailPage/>` | `<RequirePermissao perm="conta:ver">` |

`RequirePermissao` sem a permissão → tela "você não tem permissão para acessar isto"
(componente `SemPermissao` da 004), **nunca** a tela de Login.

## Telas

### PessoasListPage
- campo de busca (`q`), paginação (`pagina`/`tamanho`), tabela: nome, e-mail primário,
  telefone primário, documento, `conta`.
- linha de pessoa `merged` só aparece com o toggle "incluir unificadas".
- botão **Nova pessoa** só se `usePodeUsar('pessoa:editar')`.

### PessoaDetailPage
- identidade (nome, tipo), **contatos**: primário destacado; secundários com "rebaixado em
  <data>"; ícone/badge **curado** onde `curado: true`.
- documentos, endereços.
- **origem**: lista `plataformaOrigem` + `valorRef` (legível — não é a identidade).
- **conta**: nome + link para `/contas/:id`, se houver.
- **linha do tempo de merges**: cada `merge` com papel (sobrevivente/absorvida), data,
  autor, `estado`; se `ativo` e o usuário tem `pessoa:merge` → botão **Desfazer**; se
  `desfeito` ou com nota → mostra o estado/nota.
- ações **Editar** (`pessoa:editar`) e **Unificar** (`pessoa:merge`) — escondidas sem a
  permissão.
- abrir `/pessoas/:id` de uma pessoa `merged` → banner "esta pessoa foi unificada" +
  redireciona/renderiza a sobrevivente (usa `unificacao` do corpo / `Content-Location`).

### PessoaForm (criar/editar)
- criar: `nome` + ao menos um contato/documento; validação client-side espelha o zod
  (mensagens amigáveis), mas o backend é a autoridade (400/409 exibidos inline).
- editar: adicionar/remover contatos, escolher primário; salvar mostra o novo estado com a
  marca "curado".

### Contas
- `ContasListPage`: busca, tabela (nome, tipo, nº de pessoas), **Nova conta**
  (`conta:editar`).
- `ContaDetailPage`: dados + lista de membros (link para cada `pessoa`), adicionar/remover
  membro (`conta:editar`), linha do tempo de merges + **Desfazer** (`conta:merge`).

## Tratamento de erro

- **401** em qualquer chamada → fluxo da 003 (limpa token, vai para Login **uma vez**).
- **403** em qualquer chamada → `apiFetch` central (004) dispara `sem-permissao` → banner
  no `AppShell`; **não** desloga, **não** limpa token.
- **409** (unicidade / merge inválido / pessoa em outra conta) → mensagem inline no
  formulário/diálogo, com o `pessoaId`/`contaId` do corpo vira link "ver".
- **404** no detalhe → tela "pessoa/conta não encontrada".

## Invariantes de teste (`vitest` + Testing Library)

| # | Cenário | Esperado |
|---|---|---|
| 1 | permissões efetivas = `{pessoa:ver}` | nav mostra **Pessoas**, esconde **Contas**; lista carrega; sem botão "Nova pessoa" |
| 2 | permissões `{}` e navega para `/pessoas` | `SemPermissao`, não Login |
| 3 | detalhe com 1 primário + 2 secundários | primário destacado; cada secundário com data; badge "curado" onde aplicável |
| 4 | uma chamada devolve 403 | banner "sem permissão"; `token` intacto no storage; não redireciona a Login |
| 5 | abrir `/pessoas/:id` de pessoa `merged` | banner de unificação + dados da sobrevivente |
| 6 | `{pessoa:ver, pessoa:merge}` no detalhe | botão **Desfazer** visível em merge `ativo`; **Editar** ausente (sem `pessoa:editar`) |
| 7 | busca por trecho de e-mail secundário | item aparece (backend casa primário **ou** secundário) |
