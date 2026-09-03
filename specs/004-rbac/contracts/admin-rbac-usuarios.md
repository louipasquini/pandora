# Contract: `/admin/rbac/usuarios`

**Auth (todos)**: JWT válido **+** `@RequerPermissao('perfil:administrar')`.
Escrita audita em `rbac_audit`.

## `GET /admin/rbac/usuarios`

**200**:

```json
{
  "usuarios": [
    {
      "id": "0192...-ana",
      "nome": "Ana Souza",
      "email": "ana@amoremnutrir.com",
      "perfis": [{ "id": "0192...-comercial", "nome": "Comercial" }],
      "criadoEm": "2026-09-03T14:10:00.000Z"
    }
  ]
}
```

- `perfis`: os perfis atribuídos (id + nome), ordenados por `nome`.

## `POST /admin/rbac/usuarios`

**Body** (`dto/usuario.schema.ts`):

```json
{ "nome": "Ana Souza", "email": "Ana@AmorEmNutrir.com" }
```

- `nome`: `trim` não-vazio, ≤ 120.
- `email`: formato de e-mail; `emailNormalizado` = `trim().toLowerCase()`.

**201**: `{ "id": "...", "nome": "Ana Souza", "email": "Ana@AmorEmNutrir.com", "perfis": [] }`
→ `rbac_audit` `usuario`/`criado` `null` → `{ nome, email }`.

**400**: `nome` vazio / e-mail malformado.
**409**: `emailNormalizado` já existe.

> Editar (`nome`/`email`), desativar e apagar `usuario` são **fora de escopo** — não há
> `PATCH`/`DELETE /usuarios/{id}` nesta spec.

## `GET /admin/rbac/usuarios/{id}/perfis`

- `usuario` inexistente → **404**.
- **200**: `{ "perfis": [{ "id": "...", "nome": "Comercial" }] }`

## `PUT /admin/rbac/usuarios/{id}/perfis`

**Body**: `{ "perfilIds": ["0192...-comercial", "0192...-suporte"] }` — **conjunto
completo** (substitui).

- `usuario` inexistente → **404**.
- algum `perfilId` não existe → **404**, nada muda.
- `perfilIds: []` → remove todos os vínculos (válido).
- diff (inserts + deletes) numa transação. Se `calcularDelta(atuais, novos) === null` →
  **200** sem gravar auditoria.
- senão → `rbac_audit` `usuario`/`perfis` `{ perfilIds }` → `{ perfilIds }`.

**200**: `{ "perfis": [...] }` (estado final).

Atribuir/remover o perfil `administrador` a um `usuario` é permitido (não afeta o
anti-_lockout_: a credencial de serviço já garante um portador de `perfil:administrar`).

## Invariantes de teste (e2e)

| # | Ação | Esperado |
| --- | --- | --- |
| 1 | `POST` usuário válido | 201; 1 `rbac_audit` `usuario/criado` |
| 2 | `POST` e-mail repetido (outra caixa) | 409 |
| 3 | `POST` e-mail malformado | 400 |
| 4 | `PUT` 2 perfis; `GET .../perfis` | 200; união dos 2; permissões efetivas = união |
| 5 | `PUT` com `perfilIds: []` | 200; 0 vínculos; `rbac_audit` `perfis` `[...]`→`[]` |
| 6 | `PUT` com um `perfilId` inexistente | 404; vínculos intactos |
| 7 | `PUT` repetindo os perfis atuais | 200; **0** registro de auditoria |
| 8 | `PUT` em `usuario` inexistente | 404 |
| 9 | token de `Usuario` sem `perfil:administrar` em qualquer rota | 403 |
