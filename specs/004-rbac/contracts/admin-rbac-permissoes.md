# Contract: `GET /admin/rbac/permissoes` + `GET /auth/permissoes-efetivas`

## `GET /admin/rbac/permissoes` — catálogo completo

**Auth**: JWT válido **+** `@RequerPermissao('perfil:administrar')`.

**200**:

```json
{
  "recursos": [
    {
      "recurso": "perfil",
      "permissoes": [
        { "id": "perfil:administrar", "rotulo": "Administrar perfis, permissões e atribuições de acesso" }
      ]
    },
    {
      "recurso": "lead",
      "permissoes": [
        { "id": "lead:criar", "rotulo": "Criar leads" },
        { "id": "lead:editar", "rotulo": "Editar leads" },
        { "id": "lead:ver_todos", "rotulo": "Ver todos os leads" },
        { "id": "lead:ver_proprios", "rotulo": "Ver apenas os próprios leads" }
      ]
    }
  ]
}
```

- Ordem **estável**: recursos em ordem de 1ª aparição no catálogo; permissões na ordem do
  catálogo.
- Fonte: `PERMISSOES` (código). Não há query de banco.

**403**: sujeito sem `perfil:administrar` — corpo genérico.
**401**: sem token válido.

## `GET /auth/permissoes-efetivas` — só as do sujeito atual

**Auth**: JWT válido **+** `@AutenticadoBasta()` (qualquer autenticado — o gate de UI não
exige ser admin).

**200**:

```json
{ "permissoes": ["perfil:administrar", "lead:criar", "lead:editar", "lead:ver_todos", "lead:ver_proprios"] }
```

- É `Array.from(sujeitoRbac.permissoesDe(req))`, ordenado. Para a credencial de serviço =
  catálogo inteiro.
- Usado por `AppShell` (filtra navegação) e `RequirePermissao` (gate de rota).

## Invariantes de teste (e2e)

| # | Requisição | Esperado |
| --- | --- | --- |
| 1 | `GET /admin/rbac/permissoes` com token de serviço | 200, `recursos` agrupado, ordem estável |
| 2 | `GET /admin/rbac/permissoes` com `Usuario` sem perfil | 403 |
| 3 | `GET /admin/rbac/permissoes` sem token | 401 |
| 4 | `GET /auth/permissoes-efetivas` com token de serviço | 200, catálogo inteiro |
| 5 | `GET /auth/permissoes-efetivas` com `Usuario` sem perfil | 200, `{ "permissoes": [] }` |
| 6 | `GET /auth/permissoes-efetivas` sem token | 401 |
| 7 | adicionar permissão nova ao catálogo (fixture) e repetir #1 | aparece sem mudar o frontend (SC-007) |
