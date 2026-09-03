# Contract — Expediente: janelas, feriados e consulta (`/crm/admin/...`)

Leitura → `crm_admin:ver`; escrita → `crm_admin:gerir_expediente`.

Serialização: `horaInicio`/`horaFim` como `"HH:MM"` (24h) no wire; storage é `Int` minutos
locais. `diaSemana` = `0..6` (0 = domingo). `equipeId` ausente/`null` = entrada **global**.

---

## Janelas — `/crm/admin/janelas-atendimento`

### `GET` — `crm_admin:ver`
Query: `equipeId?` (uuid), `incluirGlobais?` (default `true`), `ativo?`.
`200` → `{ itens: Janela[] }`.

```jsonc
// Janela
{ "id":"…", "equipeId":null, "diaSemana":3, "horaInicio":"09:00", "horaFim":"18:00",
  "ativo":true, "criadoEm":"…", "atualizadoEm":"…" }
```

### `POST` — `crm_admin:gerir_expediente`
```jsonc
{ "equipeId":null, "diaSemana":3, "horaInicio":"09:00", "horaFim":"18:00" }
```
`201` → `Janela`.
- `422` se `horaFim <= horaInicio` (`{ "erro":"janela_invalida", "detalhe":"hora_fim > hora_inicio" }`) — CL-02.
- `422` se `diaSemana` ∉ 0..6, `horaInicio`/`horaFim` fora de `"00:00".."24:00"`.
- `404` se `equipeId` informado não existe.
Auditoria: `entidade:'janela_atendimento'`, `campo:'criado'`.

### `PATCH /{id}` — `crm_admin:gerir_expediente`
Parcial: `diaSemana?`, `horaInicio?`, `horaFim?`, `ativo?`, `equipeId?`. Mesmas validações.
`200` → `Janela`. No-op → sem auditoria.

### `DELETE /{id}` — `crm_admin:gerir_expediente`
`204`. **Remoção física** (config sem histórico; trilha no `crm_admin_audit`:
`campo:'removido'`, `valorAnterior:<janela>`). `404` se não existe.

---

## Feriados — `/crm/admin/feriados`

### `GET` — `crm_admin:ver`
Query: `equipeId?`, `incluirGlobais?` (default `true`), `ano?` (filtra ocorrências que caem
no ano, considerando `recorrenteAnual`).
`200` → `{ itens: Feriado[] }`.

```jsonc
// Feriado
{ "id":"…", "equipeId":null, "data":"2026-12-25", "descricao":"Natal",
  "recorrenteAnual":true, "criadoEm":"…", "atualizadoEm":"…" }
```

### `POST` — `crm_admin:gerir_expediente`
```jsonc
{ "equipeId":null, "data":"2026-12-25", "descricao":"Natal", "recorrenteAnual":true }
```
`201` → `Feriado`. `422` se `data` não é `YYYY-MM-DD` ou `descricao` vazia. `404` se
`equipeId` não existe. Auditoria: `campo:'criado'`.

### `PATCH /{id}` / `DELETE /{id}` — `crm_admin:gerir_expediente`
`PATCH` parcial (`data?`, `descricao?`, `recorrenteAnual?`, `equipeId?`). `DELETE` físico.
No-op no `PATCH` → sem auditoria.

---

## `GET /crm/admin/expediente` — `crm_admin:ver`

Query:
- `instante?` — ISO 8601 (`2026-09-09T17:00:00Z`) **ou** epoch (s/ms). Ausente → agora.
- `equipeId?` — uuid; sem ele, só entradas globais.

`200`:
```jsonc
{ "emExpediente": true, "instante": "2026-09-09T17:00:00.000Z", "equipeId": null }
```

`400` se `instante` não parseia (`parseInstante` do core → `null`):
`{ "erro":"instante_invalido", "detalhe":"<motivo>" }`.

**Semântica** (idêntica à função pura `estaEmExpediente` — `contracts/estaEmExpediente.md`):
converte `instante` para America/Sao_Paulo; `true` sse a hora local cai em alguma janela
ativa aplicável (início inclusivo, fim exclusivo) **e** a data local não é feriado aplicável.
"Aplicável" = global ∪ equipe (se `equipeId` e a equipe está ativa) — CL-01. Sem janela
aplicável → `false`.
