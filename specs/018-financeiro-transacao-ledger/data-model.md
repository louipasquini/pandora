# Data Model — 018 · Ledger de transações do Financeiro

**Migração**: `prisma/migrations/<ts>_financeiro_transacao/` — a **1ª migração de negócio do
`financeiro`** (após `_rbac`, `_clientes` ×2, `_ingestao`, `_crm_admin` ×2, `_crm_lead`,
`_crm_interacao`, `_crm_pipeline`, `_crm_whatsapp`, `_crm_atendimento`,
`_crm_faq_sugestao_ia`, `_crm_workflow`, `_crm_disparos`, `_crm_tarefas`,
`_crm_dashboard` — a **16ª**).

**1 tabela nova** (`transacao`) + **1 enum de banco novo** (`StatusTransacaoCanonico`, 8
valores, espelha o enum TS do `core`). **0 tabela de auditoria** (não há escrita manual
nesta fatia — D-08). **0 `CHECK`/índice parcial** — só índices comuns.

---

## Enum `StatusTransacaoCanonico` (banco)

```
PENDENTE PAGO EM_ATRASO RECUSADO CANCELADO ESTORNADO CHARGEBACK DESCONHECIDO
```

Paridade com `src/core/status/status-transacao.ts` travada por teste unitário
(`status-map.spec.ts`).

## Tabela `transacao`

| Coluna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | `uuid` PK | não | `EntidadeId.novo()` na app (UUID v7) |
| `plataforma_origem` | `PlataformaOrigem` | não | enum de 7 (já existe) |
| `id_origem` | `text` | não | id da transação na origem — **nunca PK** (Princípio I) |
| `tipo_origem` | `text` | não | rótulo da fonte (`guru.webhook`, `tmb.csv`…) — copiado do `EventoCanonico` |
| `status_origem` | `text` | não | status **cru** como veio da origem |
| `status_canonico` | `StatusTransacaoCanonico` | não | via `mapearStatus` |
| `classificacao` | `Classificacao` | não | lida do resultado de `CLASSIFICAR` (006) |
| `ocorrido_em` | `timestamptz` | **sim** | via `parseInstante`; lixo → `null` + `precisa_revisao` |
| `pessoa_id` | `uuid` | sim | FK → `pessoa` (`onDelete: SetNull`) — resultado da etapa 2 |
| `oferta_id` | `uuid` | sim | **sem FK** — spec 023 liga |
| `contrato_id` | `uuid` | sim | **sem FK** — spec 025 liga |
| `transacao_vinculada_id` | `uuid` | sim | **sem FK** — spec 024 liga (vínculo Asaas↔Guru) |
| `valor_bruto_int` | `bigint` | sim | `Dinheiro` ×10000 |
| `valor_bruto_moeda` | `char(3)` | sim | ISO 4217; obrigatório sse `valor_bruto_int` não-nulo |
| `valor_liquido_int` | `bigint` | sim | idem |
| `valor_liquido_moeda` | `char(3)` | sim | |
| `taxas_int` | `bigint` | sim | |
| `taxas_moeda` | `char(3)` | sim | |
| `reembolso_int` | `bigint` | sim | |
| `reembolso_moeda` | `char(3)` | sim | |
| `quantidade` | `int` | sim | `EventoCanonico.oferta.quantidade` |
| `eh_afiliada` | `bool` | não | `= (classificacao == VENDA_AFILIADA)` (default `false`) |
| `eh_recorrencia` | `bool` | não | default `false` |
| `assinatura_ciclo` | `text` | sim | |
| `numero_ciclo` | `int` | sim | |
| `oferta_codigo_origem` | `text` | sim | cru — a spec 023 resolve a `oferta` |
| `oferta_nome_origem` | `text` | sim | cru |
| `precisa_revisao` | `bool` | não | default `false`; `true` se status `DESCONHECIDO` ou data não parseável |
| `motivo_revisao` | `text` | sim | |
| `evento_origem_id` | `uuid` | sim | FK → `evento_origem` (`onDelete: SetNull`) — último evento aplicado |
| `criado_em` | `timestamptz` | não | `@default(now())` |
| `atualizado_em` | `timestamptz` | não | `@updatedAt` |

### Constraints / índices

- `@@unique([plataforma_origem, id_origem], name: "transacao_chave_natural")` — Regra
  Inviolável nº 1.
- `@@index([status_canonico])`
- `@@index([classificacao])`
- `@@index([pessoa_id])`
- `@@index([plataforma_origem])`
- `@@index([ocorrido_em])`
- `@@index([precisa_revisao])`

### Relações Prisma

```prisma
model Transacao {
  // ... campos acima ...
  pessoa       Pessoa?       @relation(fields: [pessoaId], references: [id], onDelete: SetNull)
  eventoOrigem EventoOrigem? @relation(fields: [eventoOrigemId], references: [id], onDelete: SetNull)
  @@map("transacao")
}
```

`Pessoa` ganha `transacoes Transacao[]`; `EventoOrigem` ganha `transacoes Transacao[]`.
Ambas as back-relations são só do `schema.prisma` compartilhado — **nenhum import de módulo
TS entre contextos** (mesmo precedente de `Lead.pessoaId`/`Interacao.pessoaId` das specs
008/009; a fronteira do Princípio VI é sobre import de código, não sobre o schema).

## Regras de derivação (nada é `estado += delta`)

| Campo | Fonte | Idempotência |
| --- | --- | --- |
| `status_canonico` | `mapearStatus(plataforma, tipoOrigem, statusOrigem)` | função pura do evento |
| `classificacao` | `evento_etapa[CLASSIFICAR].resultado.classificacao` | idem |
| `pessoa_id` | `evento_etapa[RESOLVER_PESSOA].resultado.pessoaId` | `resolverOuCriar` idempotente (005) |
| `ocorrido_em` | `parseInstante(canonico.ocorridoEm)` | função pura |
| `valor_*` | `canonico.valores.*` | cópia direta |
| `eh_afiliada` | `classificacao == VENDA_AFILIADA` | função pura |
| `campos_alterados` | _diff_ (linha anterior × normalizada) → `evento_etapa.resultado` | vazio se nada mudou |

Reprocessar o mesmo `evento_origem` re-executa etapas 2–3 → recalcula tudo a partir do
`payload_bruto` imutável → mesma linha, `campos_alterados: []`, `foi_criada: false`.

## Fora do modelo desta spec

- **Receita** — query sobre `transacao` (filtro `contaComoReceita` + `groupBy [moeda, papel]`),
  entra com a spec 024/025. Nenhum número materializado.
- **`vinculo_transacao`** — spec 024.
- **`oferta` / `oferta_origem_ref`** — spec 023.
- **`contrato` / `aditivo`** — spec 025.
- **`financeiro_audit`** — quando houver escrita manual (024/025).
