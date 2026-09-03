# Contract — catálogo RBAC estendido (recurso `crm_admin`)

`src/auth/rbac/catalogo.ts` — o array `PERMISSOES` **ganha 4 entradas** (recurso `crm_admin`).
Nada mais da 004 muda.

```ts
// --- Administração do CRM (spec 007) ---
{ id: 'crm_admin:ver',              recurso: 'crm_admin', rotulo: 'Ver a administração do CRM (equipes, expediente, integrações)' },
{ id: 'crm_admin:gerir_equipes',   recurso: 'crm_admin', rotulo: 'Criar e editar equipes e gerir membros' },
{ id: 'crm_admin:gerir_expediente',recurso: 'crm_admin', rotulo: 'Configurar horários de atendimento e feriados' },
{ id: 'crm_admin:gerir_integracoes',recurso:'crm_admin', rotulo: 'Cadastrar e rotacionar integrações' },
```

## Efeitos garantidos

- `assertCatalogoCoerente()` continua passando (ids no formato `recurso:acao`, sem
  duplicata, `recurso` == prefixo).
- `agruparPorRecurso()` passa a devolver o grupo `crm_admin` (na posição da 1ª aparição, ao
  final da lista atual).
- `RbacRouteAudit` do boot: cada `@RequerPermissao('crm_admin:*')` no `CrmAdminController`
  cita um id que existe no catálogo — senão o boot **aborta**.
- `SujeitoRbacService`: `sub === SERVICE_CLIENT_ID` (credencial de serviço) → catálogo
  inteiro, **já inclui** as 4 novas (special-case, não depende de seed).
- `prisma/seed.ts`: o perfil de sistema `administrador` sincroniza `perfil_permissao` com o
  catálogo no `migrate dev`/`reset`/`test/setup-db.ts` → passa a ter as 4 novas **sem
  migração de dados nem seed novo** (o seed idempotente já existente cobre).
- `catalogo.spec.ts` — `+` asserção: `PERMISSAO_IDS` contém os 4 ids; `agruparPorRecurso`
  tem um grupo `crm_admin` com 4 permissões na ordem acima.

## Uso nos endpoints

| Rota | Permissão |
|---|---|
| `GET /crm/admin/**` (todas as leituras) + `GET /crm/admin/expediente` | `crm_admin:ver` |
| `POST/PATCH/DELETE /crm/admin/equipes/**` | `crm_admin:gerir_equipes` |
| `POST/PATCH/DELETE /crm/admin/janelas-atendimento/**`, `.../feriados/**` | `crm_admin:gerir_expediente` |
| `POST/PATCH /crm/admin/integracoes/**`, `.../rotacionar` | `crm_admin:gerir_integracoes` |

Nenhuma rota `@Public()` nem `@AutenticadoBasta()`. 401 (sem token) ≠ 403 (sem permissão).
