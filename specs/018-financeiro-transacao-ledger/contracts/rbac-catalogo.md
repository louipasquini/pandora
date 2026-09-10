# Contrato — RBAC (catálogo estendido)

`src/auth/rbac/catalogo.ts` ganha **1 recurso novo** (`transacao`) com **1 permissão**:

| id | recurso | rótulo |
| --- | --- | --- |
| `transacao:ver` | `transacao` | Ver o ledger de transações do Financeiro |

- `assertCatalogoCoerente()` (boot do `AuthModule`) já valida o formato `recurso:acao` e a
  unicidade — a nova entrada passa sem alteração no validador.
- **0 migração de dados / 0 seed novo.** O perfil de sistema `administrador` (criado pelo
  `prisma/seed.ts`, spec 004) e a credencial de serviço (special-case do `SujeitoRbacService`)
  concedem `transacao:ver` de graça — mesmo mecanismo de todas as permissões desde a 005.
- `GET /admin/rbac/permissoes` passa a listar o grupo `transacao` (via `agruparPorRecurso`).
- `GET /auth/permissoes-efetivas` da credencial de serviço passa a incluir `transacao:ver`.

Nenhuma outra permissão. A escrita de `transacao` é feita **só pelo pipeline** (sem sujeito
HTTP), então não há `transacao:*` de escrita nesta spec (o retry de vínculo da spec 024
introduzirá `transacao:vincular` ou similar).
