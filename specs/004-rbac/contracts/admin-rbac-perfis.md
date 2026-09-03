# Contract: `/admin/rbac/perfis`

**Auth (todos)**: JWT válido **+** `@RequerPermissao('perfil:administrar')`.
Toda escrita grava `rbac_audit` (só _delta_ real).

## `GET /admin/rbac/perfis`

**200**:

```json
{
  "perfis": [
    {
      "id": "0192...-admin",
      "nome": "Administrador",
      "deSistema": true,
      "permissoes": ["perfil:administrar", "lead:criar", "lead:editar", "lead:ver_todos", "lead:ver_proprios"],
      "permissoesDesconhecidas": [],
      "totalUsuarios": 0
    },
    {
      "id": "0192...-comercial",
      "nome": "Comercial",
      "deSistema": false,
      "permissoes": ["lead:criar", "lead:editar", "lead:ver_proprios"],
      "permissoesDesconhecidas": [],
      "totalUsuarios": 3
    }
  ]
}
```

- `permissoes`: as de `perfil_permissao` que **estão** no catálogo, ordenadas pelo catálogo.
- `permissoesDesconhecidas`: linhas de `perfil_permissao` cuja `permissao` saiu do catálogo
  (Princípio VII — mostradas, não apagadas).
- `totalUsuarios`: `count(usuario_perfil)` — usado para bloquear `DELETE`.

## `POST /admin/rbac/perfis`

**Body** (`dto/perfil.schema.ts`, zod):

```json
{ "nome": "Comercial", "permissoes": ["lead:criar", "lead:editar", "lead:ver_proprios"] }
```

- `nome`: `string`, `trim` não-vazio, ≤ 80 chars. `nomeNormalizado` = `trim().toLowerCase()`.
- `permissoes`: `string[]`, **todas** em `PERMISSAO_IDS`; deduplicadas.

**201**: `{ "id": "...", "nome": "Comercial", "deSistema": false, "permissoes": [...] }`
→ `rbac_audit`: `perfil`/`criado`, `null` → `{ nome, permissoes }`.

**400**: `nome` vazio, `nome` > 80, `permissoes` com id fora do catálogo. Nada persiste.
**409**: `nomeNormalizado` já existe.

## `PATCH /admin/rbac/perfis/{id}`

**Body** (campos opcionais, ≥ 1 presente):

```json
{ "nome": "Comercial Sr.", "permissoes": ["lead:criar", "lead:editar", "lead:ver_todos"] }
```

- `perfil` inexistente → **404**.
- `perfil.deSistema === true` → **409** (imutável), nada muda, sem auditoria.
- `nome` presente e muda → `rbac_audit` `perfil`/`renomeado` `{nome}`→`{nome}`;
  colisão de `nomeNormalizado` → **409**.
- `permissoes` presente: valida contra catálogo (**400** se id estranho);
  `calcularDelta(atual, novo)`:
  - `null` (sem mudança) → **não** grava auditoria desse eixo.
  - senão substitui `perfil_permissao` numa transação + `rbac_audit`
    `perfil`/`permissoes` `{permissoes}`→`{permissoes}`.

**200**: o perfil atualizado (mesma forma do `GET`).

## `DELETE /admin/rbac/perfis/{id}`

- inexistente → **404**.
- `deSistema === true` → **409**.
- `totalUsuarios > 0` → **409** `{ "message": "perfil em uso", "totalUsuarios": 3 }` — o
  cliente remove as atribuições primeiro.
- ok → apaga (`perfil_permissao` cai por `onDelete: Cascade`) + `rbac_audit`
  `perfil`/`apagado` `{ nome, permissoes }` → `null`.

**204** sem corpo.

## Invariantes de teste (e2e)

| # | Ação | Esperado |
| --- | --- | --- |
| 1 | `POST` perfil válido | 201; 1 `rbac_audit` `criado` com autor/quando |
| 2 | `POST` com `permissoes: ["lead:foo"]` | 400; 0 linha nova; 0 auditoria |
| 3 | `POST` com nome já usado (outra caixa) | 409 |
| 4 | `PATCH` renomear + trocar permissões | 200; **2** registros (`renomeado` + `permissoes`) |
| 5 | `PATCH` salvando as **mesmas** permissões | 200; **0** registro de `permissoes` (no-op) |
| 6 | `PATCH`/`DELETE` no `administrador` | 409; 0 auditoria; perfil intacto |
| 7 | `DELETE` perfil com 1 usuário | 409 + `totalUsuarios` |
| 8 | `DELETE` perfil comum sem usuário | 204; 1 `rbac_audit` `apagado` |
| 9 | qualquer rota acima com `Usuario` sem `perfil:administrar` | 403 |
| 10 | perfil com `perfil_permissao` fora do catálogo (fixture) | `GET` lista em `permissoesDesconhecidas`, resolução ignora |
