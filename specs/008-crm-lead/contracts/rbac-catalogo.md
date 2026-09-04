# Contract — catálogo RBAC estendido (+1 permissão)

`src/auth/rbac/catalogo.ts` — o array `PERMISSOES` **ganha 1 entrada** no recurso
`crm_admin` (que já existe desde a 007). As **4 permissões `lead:*` já existem desde a 004
e NÃO mudam** (byte-idênticas).

```ts
// --- Campos personalizados de lead (spec 008) ---
{ id: 'crm_admin:gerir_campos_lead', recurso: 'crm_admin',
  rotulo: 'Gerir campos personalizados de lead' },
```

Permissões `lead:*` (da 004, **inalteradas**, referência):
```ts
{ id: 'lead:criar',         recurso: 'lead', rotulo: 'Criar leads' },
{ id: 'lead:editar',        recurso: 'lead', rotulo: 'Editar leads' },
{ id: 'lead:ver_todos',     recurso: 'lead', rotulo: 'Ver todos os leads' },
{ id: 'lead:ver_proprios',  recurso: 'lead', rotulo: 'Ver apenas os próprios leads' },
```

## Efeitos garantidos

- `assertCatalogoCoerente()` continua passando (id no formato `recurso:acao`, sem
  duplicata, `recurso` == prefixo).
- `agruparPorRecurso()`: o grupo `crm_admin` passa de 4 → **5** permissões.
- `SujeitoRbacService`: credencial de serviço + perfil `administrador` → catálogo inteiro,
  **já inclui** `crm_admin:gerir_campos_lead` (special-case, **0 migração de dados, 0 seed
  novo** — o `prisma/seed.ts` idempotente sincroniza `perfil_permissao` do `administrador`
  com o catálogo).
- `RbacRouteAudit` do boot: cada `@RequerPermissao('...')` novo cita um id do catálogo —
  senão o boot **aborta**.
- `catalogo.spec.ts` — `+` asserção: `PERMISSAO_IDS` contém `crm_admin:gerir_campos_lead`;
  `agruparPorRecurso().crm_admin` tem 5 entradas; as 4 `lead:*` seguem presentes e com os
  rótulos originais.

## Uso nos endpoints (spec 008)

| Rota | Marcador |
|---|---|
| `GET /crm/leads`, `GET /crm/leads/:id`, `.../campos-personalizados` (GET), `.../auditoria` | `@AutenticadoBasta()` + gate OU (`lead:ver_todos` \| `lead:ver_proprios`) no serviço |
| `POST /crm/leads` | `@RequerPermissao('lead:criar')` |
| `PATCH /crm/leads/:id`, `.../tags` (POST/DELETE), `.../recalcular-score`, `recalcular-score` (lote), `.../campos-personalizados` (PUT) | `@RequerPermissao('lead:editar')` |
| `POST /crm/leads/:id/converter` | `@RequerPermissao('lead:editar', 'pessoa:editar')` |
| `GET/POST/PATCH/DELETE /crm/admin/campos-lead/**` | `@RequerPermissao('crm_admin:gerir_campos_lead')` (GET aceita também `crm_admin:ver`) |

Nenhuma rota `@Public()`. 401 (sem token) ≠ 403 (sem permissão) ≠ 404 (fora do escopo de
visão).
