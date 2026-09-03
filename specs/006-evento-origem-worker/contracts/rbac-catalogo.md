# Contract — catálogo RBAC (spec 004) estendido

`backend/src/auth/rbac/catalogo.ts` — o array `PERMISSOES` cresce (append-only, um recurso
por spec). Acrescentar o recurso **`evento`**:

```ts
// --- evento_origem / worker de ingestão (spec 006) ---
{ id: 'evento:ver',         recurso: 'evento', rotulo: 'Ver eventos de ingestão e o histórico de etapas' },
{ id: 'evento:reprocessar', recurso: 'evento', rotulo: 'Reprocessar eventos e rodar o worker' },
{ id: 'evento:ingerir',     recurso: 'evento', rotulo: 'Registrar eventos crus na ingestão' },
```

- `assertCatalogoCoerente()` (boot do `AuthModule`) já valida formato/unicidade — os 3 ids
  batem o `ID_RE` `^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$`.
- `RbacRouteAudit` no boot já aborta se um `@RequerPermissao('x')` citar `x` fora do
  catálogo — cobre os controllers novos.
- `SujeitoRbacService` (004): `sub === SERVICE_CLIENT_ID` → catálogo inteiro (special-case)
  → a credencial de serviço **já** tem `evento:*` sem migração. O perfil de sistema
  `administrador` recebe as 3 permissões via `prisma/seed.ts` (que sincroniza
  `perfil_permissao` com o catálogo — idempotente; roda em `migrate dev`/`reset`, em
  `test/setup-db.ts` e no `ci.yml`).
- `catalogo.spec.ts` (unit): + asserção de que o recurso `evento` existe com as 3 ações.

Mapa endpoint → permissão:

| Endpoint | Permissão |
|---|---|
| `POST /ingestao/eventos` | `evento:ingerir` |
| `POST /ingestao/eventos/processar` | `evento:reprocessar` |
| `POST /ingestao/eventos/{id}/reprocessar` | `evento:reprocessar` |
| `GET /ingestao/eventos` | `evento:ver` |
| `GET /ingestao/eventos/{id}` | `evento:ver` |

Nenhuma rota `@Public()` / `@AutenticadoBasta()`.
