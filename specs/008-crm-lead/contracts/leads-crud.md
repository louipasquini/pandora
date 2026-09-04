# Contract — Leads CRUD, busca e escopo de visão

Prefixo `/crm/leads`. Todas as rotas exigem JWT (spec 003). Leitura →
`@AutenticadoBasta()` + gate "OU" no serviço; escrita → `@RequerPermissao`.

## Escopo de visão (aplicado no `where`, não na serialização)

`lead-consulta.service` resolve `permissoesDe(req)` uma vez:

| Permissões efetivas do sujeito | Resultado |
|---|---|
| nem `lead:ver_todos` nem `lead:ver_proprios` | **403** (genérico da 004) |
| `lead:ver_todos` (inclui `administrador` / credencial de serviço) | sem filtro de responsável |
| só `lead:ver_proprios` | `where.responsavelId = <sujeito.usuarioId>` **AND** `responsavelId IS NOT NULL` |

Filtros de query-string entram com **AND** por cima — **nunca** ampliam o escopo.
`GET /crm/leads/:id` fora do escopo → **404** (não 403 — não vaza existência).

## `POST /crm/leads` — `@RequerPermissao('lead:criar')`

Body (zod):
```jsonc
{
  "nome": "Ana Nutri",                       // obrigatório
  "email": "ana@ex.com",                     // email OU telefone obrigatório
  "telefone": "+5511998887777",
  "documento": "39053344705",               // opcional; DV validado
  "origem": "formulario_lp",                // opcional
  "utmSource": "meta", "utmCampaign": "lanc-pcs-out",  // opcionais
  "estagio": "NOVO",                        // opcional, default NOVO
  "responsavelId": "<uuid usuario>",        // opcional; 404/422 se não existe
  "tags": ["webinar-out"]                   // opcional; normalizadas
}
```
- `nome` ausente **ou** (`email` **e** `telefone` ausentes) → **422**.
- `documento` com DV inválido → **422**.
- `responsavelId` inexistente em `usuario` → **404/422**, nada criado.
- `score` / `pessoaId` / `status=CONVERTIDO` no body → **422** (campos de sistema).

`201`:
```jsonc
{
  "id": "...", "nome": "...", "estagio": "NOVO", "status": "ATIVO",
  "score": 31, "scoreAtualizadoEm": "2026-09-04T...Z",
  "responsavelId": null, "pessoaId": null, "tags": ["webinar-out"],
  "leadsSemelhantes": ["<id>", "..."]      // leads ATIVOS com mesmo email/telefone (aviso, não bloqueia)
}
```
Auditoria: **1** `crm_lead_audit` `motivo="criar"`, delta = campos criados.

## `PATCH /crm/leads/:id` — `@RequerPermissao('lead:editar')`

Campos editáveis: `nome`, `email`, `telefone`, `documento`, `origem`, `utm*`, `estagio`,
`status` (`ATIVO`↔`DESCARTADO` só; `CONVERTIDO` → 409), `responsavelId`.
- fora do escopo de visão do sujeito → **404**.
- `score` / `pessoaId` / `convertidoEm` no body → **422**.
- remover o último canal de contato (deixaria `email` e `telefone` nulos) → **422**.
- corpo idêntico ao estado → **200**, **0** auditoria (no-op).
- mudança que afeta insumo de score → `score` recalculado na mesma transação.

Auditoria: **1** registro com `motivo` = `editar` (ou `estagio`/`status`/`responsavel`
quando só esse campo muda), delta real.

## `POST /crm/leads/:id/tags` / `DELETE /crm/leads/:id/tags` — `@RequerPermissao('lead:editar')`

Body `{ "tag": "  Webinar-Out " }` → normaliza `webinar-out`. Adicionar duplicada → no-op.
Tag vazia após normalizar → **422**. Score recalculado se `qtdTags` cruzar de 0→1.

## `GET /crm/leads` — `@AutenticadoBasta()`

Query: `estagio`, `status` (default: exclui `CONVERTIDO`), `origem`, `responsavelId`,
`q` (busca `nome`/`email`/`telefone`, `ILIKE`), `campo:<chave>=<valor>`,
`page` (1..), `pageSize` (≤100, default 25), `ordenarPor` (`score`|`criadoEm`, default
`score` desc).

`200`: `{ "itens": [<lead resumido>], "page": 1, "pageSize": 25, "total": N }`.
Lead resumido inclui `score` e `estagio`/`status`/`origem`/`responsavelId`/`tags`.

## `GET /crm/leads/:id` — `@AutenticadoBasta()`

`200`: lead completo + `campos` (mapa chave→valor dos personalizados) +
`auditoria` (últimos N registros, opcional). Fora do escopo → **404**.

## `GET /crm/leads/:id/auditoria` — `@AutenticadoBasta()` (opcional, FR-041)

Lista paginada de `crm_lead_audit` daquele lead. O painel consolidado é a spec 053.
