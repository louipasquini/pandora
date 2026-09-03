# Contract — Equipes / squads (`/crm/admin/equipes`)

Todas as rotas exigem JWT (003). Leitura → `crm_admin:ver`; escrita → `crm_admin:gerir_equipes`.
Sem token → 401; token sem permissão → 403 (corpo genérico da 004).

## `GET /crm/admin/equipes` — `crm_admin:ver`

Query: `ativo?` (`true|false`), `tipo?` (`COMERCIAL|ATENDIMENTO|CS`), `usuarioId?` (uuid),
`pagina?` (default 1), `tamanho?` (default 25, teto 100).

`200` → `{ itens: EquipeResumo[], pagina, tamanho, total }`

```jsonc
// EquipeResumo
{ "id":"…", "nome":"Comercial – Alto Ticket", "tipo":"COMERCIAL", "ativo":true,
  "totalMembrosAtivos": 4, "criadoEm":"…", "atualizadoEm":"…" }
```

`usuarioId` filtra as equipes em que ele tem vínculo **ativo**.

## `GET /crm/admin/equipes/{id}` — `crm_admin:ver`

`200` → `EquipeDetalhe`; `404` se não existe.

```jsonc
{ "id":"…", "nome":"…", "descricao":"…", "tipo":"COMERCIAL", "ativo":true,
  "membrosAtivos": [ { "usuarioId":"…", "nome":"…", "email":"…", "papel":"LIDER", "entrouEm":"…" } ],
  "historicoMembros": [ { "usuarioId":"…", "papel":"MEMBRO", "entrouEm":"…", "saiuEm":"…" } ],
  "criadoEm":"…", "atualizadoEm":"…" }
```

## `POST /crm/admin/equipes` — `crm_admin:gerir_equipes`

```jsonc
{ "nome":"Comercial – Alto Ticket", "descricao":"opcional", "tipo":"COMERCIAL" }
```

`201` → `EquipeDetalhe` (`ativo:true`, sem membros). `422` se `nome` vazio / `tipo` inválido.
Auditoria: `entidade:'equipe'`, `campo:'criado'`, `valorNovo:{nome,tipo,descricao}`.

## `PATCH /crm/admin/equipes/{id}` — `crm_admin:gerir_equipes`

Corpo parcial: `nome?`, `descricao?`, `tipo?`, `ativo?`. `200` → `EquipeDetalhe`.
`404` se não existe. Corpo sem mudança efetiva → `200` **sem** auditoria (no-op).
`ativo:false` → some das listas padrão; `estaEmExpediente` deixa de aplicar janelas/feriados
dessa equipe (FR-008). Auditoria: `campo:'editado'` (ou `'desativado'` quando só `ativo`
muda para `false`), delta campo a campo.

## `POST /crm/admin/equipes/{id}/membros` — `crm_admin:gerir_equipes`

```jsonc
{ "usuarioId":"<uuid de usuario (004)>", "papel":"MEMBRO" }
```

`201` → `{ usuarioId, papel, entrouEm }`.
- `404` se a equipe não existe; `422` se `usuarioId` não existe em `usuario`.
- `409` se já há vínculo **ativo** do par (`{ "erro":"vinculo_ativo_existente", "usuarioId" }`).
- Reentrada após `saiu_em` → cria novo registro (novo `id`), `201`.
Auditoria: `entidade:'equipe_membro'`, `entidadeId:<id do vínculo>`, `campo:'membro_adicionado'`,
`valorNovo:{ equipeId, usuarioId, papel }`.

## `PATCH /crm/admin/equipes/{id}/membros/{usuarioId}` — `crm_admin:gerir_equipes`

```jsonc
{ "papel":"LIDER" }
```

`200` → `{ usuarioId, papel, entrouEm }`. Aplica ao vínculo **ativo** do par.
`404` se não há vínculo ativo. `papel` igual → no-op sem auditoria.
Auditoria: `campo:'papel_trocado'`, `valorAnterior:{papel}`, `valorNovo:{papel}`.

## `DELETE /crm/admin/equipes/{id}/membros/{usuarioId}` — `crm_admin:gerir_equipes`

`204`. Preenche `saiu_em = agoraUtc()` no vínculo ativo. Se **não** há vínculo ativo (já
saiu ou nunca existiu) → `204` **sem** auditoria (idempotente / no-op). Nenhuma linha é
apagada.
Auditoria (quando de fato removeu): `campo:'membro_removido'`, `valorAnterior:{ papel,
entrouEm }`, `valorNovo:{ saiuEm }`.

## Regras transversais

- Sem `DELETE /crm/admin/equipes/{id}` — desativação é `PATCH { ativo:false }`.
- `nome` de equipe **não** é único.
- Um `usuario` pode ter vínculo ativo em **N** equipes simultâneas.
