# Contract: catálogo RBAC — recursos `pessoa` e `conta` (spec 004 estendida)

Esta spec **adiciona** entradas ao catálogo em `backend/src/auth/rbac/catalogo.ts` — o
mecanismo previsto pela 004 ("cada spec que adiciona um recurso adiciona suas permissões").
Nenhuma mudança no `PermissionGuard`, no `SujeitoRbacService` nem no schema de RBAC.

## Novas permissões

```ts
// em PERMISSOES (mantém a ordem; recurso pela 1ª aparição)
{ id: 'pessoa:ver',    recurso: 'pessoa', rotulo: 'Ver pessoas (identidade, contatos, contas)' },
{ id: 'pessoa:editar', recurso: 'pessoa', rotulo: 'Criar e editar pessoas' },
{ id: 'pessoa:merge',  recurso: 'pessoa', rotulo: 'Unificar pessoas e desfazer unificação' },
{ id: 'conta:ver',     recurso: 'conta',  rotulo: 'Ver contas (household / empresa)' },
{ id: 'conta:editar',  recurso: 'conta',  rotulo: 'Criar, editar contas e gerir membros' },
{ id: 'conta:merge',   recurso: 'conta',  rotulo: 'Unificar contas e desfazer unificação' },
```

## Efeitos automáticos (sem código novo)

- `assertCatalogoCoerente()` no boot valida ids únicos + formato `recurso:acao` — já cobre.
- `RbacRouteAudit` no boot valida que todo `@RequerPermissao('pessoa:…' | 'conta:…')` está
  no catálogo — passa a exigir que as entradas acima existam **antes** dos controllers.
- `resolverPermissoesEfetivas` / `todasAsPermissoes` → o perfil de sistema `administrador`
  (special-case por id) e a **credencial de serviço** passam a conceder as 6 novas
  permissões **sem** intervenção (FR-007/FR-024 da 004; SC-003).
- `prisma/seed.ts` (idempotente) sincroniza `perfil_permissao` do `administrador` com o
  catálogo → as 6 entram no próximo `migrate dev` / `db seed` (dev, e2e, CI). Nenhuma
  migração de dados é necessária.
- `GET /admin/rbac/permissoes` passa a devolver os grupos `pessoa` e `conta` — o painel de
  Perfis (004) monta o checklist deles automaticamente (zero _hardcode_).

## Uso nos controllers desta spec

| Rota | Decorator |
|---|---|
| `GET /pessoas`, `GET /pessoas/{id}` | `@RequerPermissao('pessoa:ver')` |
| `POST /pessoas`, `PATCH /pessoas/{id}` | `@RequerPermissao('pessoa:editar')` |
| `POST /pessoas/{id}/merge`, `.../desfazer` | `@RequerPermissao('pessoa:merge')` |
| `GET /contas`, `GET /contas/{id}` | `@RequerPermissao('conta:ver')` |
| `POST /contas`, `PATCH /contas/{id}`, `.../pessoas` (assoc/desassoc) | `@RequerPermissao('conta:editar')` |
| `POST /contas/{id}/merge`, `.../desfazer` | `@RequerPermissao('conta:merge')` |

Nenhuma rota `@Public()` nem `@AutenticadoBasta()`. Rota autenticada sem marcador → 403
(política da 004 — não deve ocorrer; `RbacRouteAudit` avisa no boot).

## Invariantes de teste

| # | Ação | Esperado |
|---|---|---|
| 1 | `catalogo.spec.ts` | as 6 novas permissões presentes, ids únicos, `recurso` = prefixo |
| 2 | boot da app | não aborta; `RbacRouteAudit` não lista `pessoa`/`conta` como "sem marcador" |
| 3 | `GET /admin/rbac/permissoes` (admin) | grupos `pessoa` e `conta` presentes, ordenados |
| 4 | credencial de serviço em `GET /pessoas` | 200 (concede tudo) |
| 5 | `Usuario` com perfil só `{pessoa:ver}` em `POST /pessoas` | 403 |
| 6 | `Usuario` com perfil `{pessoa:ver, pessoa:editar}` em `POST /pessoas` | 201 |
| 7 | suíte e2e da 004 (`rbac.e2e-spec.ts`) | verde sem alteração (só cresceu o catálogo) |
