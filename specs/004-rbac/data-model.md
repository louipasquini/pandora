# Phase 1 — Data Model: RBAC (spec 004)

Primeira migração de negócio do projeto. 5 tabelas, todas do RBAC, em `schema.prisma`.
Convenções da spec 001: PK `id String @id @db.Uuid` gerada na aplicação
(`EntidadeId.novo()` → UUID v7), `criadoEm`/`atualizadoEm` `@db.Timestamptz`.

## Catálogo de permissões (código, não tabela)

`src/auth/rbac/catalogo.ts`:

```ts
export const PERMISSOES = Object.freeze([
  { id: 'perfil:administrar', recurso: 'perfil',
    rotulo: 'Administrar perfis, permissões e atribuições de acesso' },
  { id: 'lead:criar',        recurso: 'lead', rotulo: 'Criar leads' },
  { id: 'lead:editar',       recurso: 'lead', rotulo: 'Editar leads' },
  { id: 'lead:ver_todos',    recurso: 'lead', rotulo: 'Ver todos os leads' },
  { id: 'lead:ver_proprios', recurso: 'lead', rotulo: 'Ver apenas os próprios leads' },
] as const);

export type Permissao = (typeof PERMISSOES)[number]['id'];
export const PERMISSAO_IDS: ReadonlySet<string> = new Set(PERMISSOES.map((p) => p.id));
```

**Invariantes** (verificadas por `assertCatalogoCoerente()` no boot — puro, aborta):
- `id` único no array. `id` casa `^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$` (`recurso:acao`).
- `recurso` = prefixo do `id` antes de `:`.
- Todo argumento de `@RequerPermissao(...)` registrado (coletado via `Reflector` no
  `RbacRouteAudit`) pertence a `PERMISSAO_IDS`.

**Regra de crescimento**: cada spec futura que adiciona um recurso **acrescenta** entradas
aqui, num PR revisável. Nada remove uma permissão sem migração de dados dos perfis que a
usam (a remoção sem cuidado é tolerada em runtime — permissão órfã é ignorada e marcada
"desconhecida" — mas é um _smell_ que a revisão de PR deve pegar).

## Tabela `usuario`

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | UUID v7 na app |
| `nome` | `text` | forma original, obrigatória, `trim` não-vazio |
| `email` | `text` | forma original |
| `emailNormalizado` | `text` `@unique` | `email.trim().toLowerCase()` — calculado na app |
| `criadoEm` | `timestamptz` | `@default(now())` |
| `atualizadoEm` | `timestamptz` | `@updatedAt` |

- **Ciclo de vida nesta spec**: só `INSERT` (`POST /admin/rbac/usuarios`) e leitura. Sem
  `UPDATE` de `nome`/`email`, sem _soft delete_, sem `DELETE`. (Fora de escopo — spec
  futura de acesso da equipe.)
- **Sem** credencial de autenticação (sem `senha`, sem `hash`, sem provider). `usuario` é
  só um portador de perfis até o login individual existir.
- `email` duplicado (por `emailNormalizado`) → 409 no _endpoint_.
- Relação: `perfis UsuarioPerfil[]`.

## Tabela `perfil`

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | UUID v7 na app; o `administrador` usa um id fixo (`PERFIL_ADMIN_ID`) |
| `nome` | `text` | forma original |
| `nomeNormalizado` | `text` `@unique` | `nome.trim().toLowerCase()` |
| `deSistema` | `boolean` | `@default(false)`; `true` só para perfis semeados |
| `criadoEm` | `timestamptz` | `@default(now())` |
| `atualizadoEm` | `timestamptz` | `@updatedAt` |

- **Perfil de sistema** (`deSistema = true`): imutável. `PATCH`/`DELETE` → **409**. Só o
  `prisma/seed.ts` cria/atualiza. Nesta spec há **um**: `administrador`.
- **Perfil comum** (`deSistema = false`): `POST`/`PATCH`/`DELETE` via _endpoint_, sob
  `perfil:administrar`, auditado.
- `DELETE` de perfil comum **com** `usuario_perfil` referenciando → **409** (com a
  contagem). Sem cascata.
- `nomeNormalizado` duplicado → **409**.
- Relações: `permissoes PerfilPermissao[]`, `usuarios UsuarioPerfil[]`.

## Tabela `perfil_permissao`

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `perfilId` | `uuid` FK → `perfil.id` `onDelete: Cascade` | |
| `permissao` | `text` | um `Permissao.id`; **não** é FK (catálogo é código) |

- PK composta `@@id([perfilId, permissao])`.
- Ao criar/editar um perfil, cada `permissao` da lista **deve** estar em `PERMISSAO_IDS` —
  senão **400**, nada persiste (FR-010).
- Linha cuja `permissao` saiu do catálogo (versão nova do código): **ignorada** em
  `resolverPermissoesEfetivas`; aparece como `{ permissao, desconhecida: true }` na leitura
  do perfil.
- Sem `criadoEm` (é relacionamento; o "quando" vive no `rbac_audit`).

## Tabela `usuario_perfil`

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `usuarioId` | `uuid` FK → `usuario.id` `onDelete: Cascade` | |
| `perfilId` | `uuid` FK → `perfil.id` `onDelete: Restrict` | não apaga perfil em uso |
| `criadoEm` | `timestamptz` | `@default(now())` |

- PK composta `@@id([usuarioId, perfilId])`.
- `PUT /admin/rbac/usuarios/{id}/perfis` **substitui** o conjunto (diff → inserts +
  deletes numa transação). Lista vazia = remove todos.
- `perfilId` inexistente no corpo → **404**, nada muda.

## Tabela `rbac_audit` (append-only)

Colunas alinhadas a `RegistroAuditoria` (core, spec 002) + chaves de tabela:

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | UUID v7 na app |
| `autor` | `text` | `req.auth.sub` (hoje sempre a credencial de serviço) |
| `quando` | `timestamptz` | `agoraUtc()` |
| `entidade` | `text` | `'perfil'` \| `'usuario'` |
| `entidadeId` | `uuid` | id do alvo |
| `campo` | `text` | a ação: `criado` \| `renomeado` \| `permissoes` \| `apagado` \| `perfis` |
| `valorAnterior` | `jsonb?` | estado/lista antes (ou `null` em `criado`) |
| `valorNovo` | `jsonb?` | estado/lista depois (ou `null` em `apagado`) |
| `motivo` | `text` | string curta legível (`'perfil criado via /admin/rbac/perfis'`) |
| `origem` | `text` | sempre `AJUSTE_MANUAL` nesta spec |
| `criadoEm` | `timestamptz` | `@default(now())` |

- Construído por `montarRegistroAuditoria({...})` e persistido com um `INSERT`. O `service`
  **não** expõe `update`/`delete`.
- `calcularDelta(antes: string[], depois: string[])` → `{ adicionadas, removidas }` ou
  `null`. `null` ⇒ **não** grava (FR-026 — sem registro de _no-op_).
- **Nunca** grava segredo, token, senha, `client_secret` (FR-027). Só ids, nomes,
  permissões.
- Leitura/painel consolidado: **fora de escopo** (spec 053). Não há `GET /rbac/audit` aqui.

## Ações auditadas (7)

| Ação | `entidade` / `campo` | `valorAnterior` → `valorNovo` |
| --- | --- | --- |
| Criar perfil | `perfil` / `criado` | `null` → `{ nome, permissoes[] }` |
| Renomear perfil | `perfil` / `renomeado` | `{ nome }` → `{ nome }` |
| Alterar permissões do perfil | `perfil` / `permissoes` | `{ permissoes[] }` → `{ permissoes[] }` (só se `calcularDelta ≠ null`) |
| Apagar perfil | `perfil` / `apagado` | `{ nome, permissoes[] }` → `null` |
| Criar usuário | `usuario` / `criado` | `null` → `{ nome, email }` |
| Alterar perfis do usuário | `usuario` / `perfis` | `{ perfilIds[] }` → `{ perfilIds[] }` (só se mudou) |

(`renomeado` + `permissoes` de um mesmo `PATCH` = **dois** registros, um por eixo que mudou.)

## Resolução de permissões efetivas (derivado, por requisição)

```
permissoesDe(req):
  se req.rbac.permissoes já setado → retorna
  sub = req.auth.sub
  se sub == config.SERVICE_CLIENT_ID:
      set = todas do catálogo            # credencial de serviço = administrador
  senão:
      perfis = rbacRepository.perfisDoUsuario(sub)   # [] se sub não casa Usuario
      se algum perfil.id == PERFIL_ADMIN_ID → set = todas do catálogo
      senão → set = ∪ perfil_permissao.permissao ∩ PERMISSAO_IDS
  req.rbac.permissoes = set ; retorna set
```

- **Idempotente / sem estado materializado**: recomputa por requisição. Sem cache entre
  requisições (CL-02 — sem _staleness_).
- **Special-case do admin** garante FR-007/FR-024 mesmo com o seed defasado: o
  `administrador` concede o catálogo **de código**, não as linhas de `perfil_permissao`.
- `sub` desconhecido / usuário sem perfil → `∅` → todo `@RequerPermissao` dá 403;
  `@AutenticadoBasta` continua passando (é autenticado).

## Seed (`prisma/seed.ts`) — idempotente

1. `upsert` `perfil` `{ id: PERFIL_ADMIN_ID, nome: 'Administrador', nomeNormalizado:
   'administrador', deSistema: true }`.
2. Sincroniza `perfil_permissao` do `administrador` com `PERMISSOES` atuais: apaga as que
   não estão mais no catálogo, insere as novas. (Cosmético — a resolução usa o catálogo de
   código — mas mantém a leitura do perfil coerente na UI.)
3. Roda em `prisma migrate dev` / `reset` (via bloco `prisma.seed` no `package.json`), no
   `test/setup-db.ts` (e2e) e no `ci.yml`. Reexecução não duplica nada.

## Estados / transições

Nenhuma máquina de estados. `perfil` e `usuario` são CRUD simples (com `perfil` de sistema
imutável). `rbac_audit` só cresce.
