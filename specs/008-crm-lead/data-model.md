# Data Model — 008 crm-lead

**Migração:** `prisma/migrations/<ts>_crm_lead/` — 6ª migração de negócio (após `_rbac`,
`_clientes`, `_clientes_primario_unico`, `_ingestao`, `_crm_admin`,
`_crm_admin_membro_unico`). 4 tabelas, 3 enums novos.

Convenções (spec 001/004/005/006/007): PK `id String @id @db.Uuid` gerada na app
(`EntidadeId.novo()`); `criado_em @default(now()) @db.Timestamptz(6)`,
`atualizado_em @updatedAt @db.Timestamptz(6)`; `@@map`/`@map` para snake_case. **Sem seed de
negócio.**

---

## Enums

```prisma
enum LeadEstagio           { NOVO  CONTATO_FEITO  QUALIFICADO  NUTRICAO  DESQUALIFICADO }
enum LeadStatus            { ATIVO  DESCARTADO  CONVERTIDO }
enum CampoPersonalizadoTipo { TEXTO  NUMERO  BOOLEANO  DATA  SELECAO }
```

---

## `lead` — pessoa em estágio pré-compra (entidade compartilhada, Parte 8.2.1)

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `String @db.Uuid` | PK, UUID v7 na app |
| `nome` | `String` | obrigatório, 1–160 chars (trim, colapsa espaço) |
| `email` | `String?` | normalizado `lowercase`+`trim`; formato válido |
| `telefone` | `String?` | E.164 (`+55` na borda) |
| `documento` | `String?` | só dígitos + DV de CPF/CNPJ válido |
| `origem` | `String?` | rótulo livre (slug ≤ 60): `formulario_lp`, `importacao_csv`, `manual`… |
| `id_externo` | `String?` | id na origem (p/ `RegistrarLeadService`); **nunca PK** |
| `utm_source` / `utm_medium` / `utm_campaign` / `utm_term` / `utm_content` | `String?` | ≤ 200 cada |
| `estagio` | `LeadEstagio @default(NOVO)` | funil pré-pipeline; livre entre os 5 valores |
| `status` | `LeadStatus @default(ATIVO)` | ver Máquina de estados |
| `responsavel_id` | `String? @db.Uuid` | FK → `usuario.id` (004), `onDelete: Restrict` |
| `tags` | `String[] @default([])` | normalizadas (`lowercase`, espaço→`-`), sem duplicar |
| `score` | `Int @default(0)` | **derivado** por `calcularScore`; _cache_; `[0,100]`; nunca setável por `PATCH` |
| `score_atualizado_em` | `Timestamptz(6)?` | quando o `score` foi recalculado pela última vez |
| `pessoa_id` | `String? @db.Uuid` | FK → `pessoa.id` (005), `onDelete: Restrict`; preenchido só na conversão |
| `convertido_em` | `Timestamptz(6)?` | instante da conversão |
| `criado_em` / `atualizado_em` | `Timestamptz(6)` | |

Relações: `valores ValorCampoLead[]` (`onDelete: Cascade`).

**Índices**:
`@@index([status, estagio])`, `@@index([responsavelId])`, `@@index([origem])`,
`@@index([email])`, `@@index([telefone])`, `@@index([pessoaId])`.
**Único parcial** (via `migration.sql` cru, como 005/007):
`CREATE UNIQUE INDEX lead_origem_id_externo_key ON lead (origem, id_externo) WHERE id_externo IS NOT NULL;`
— idempotência da porta `RegistrarLeadService` por `(origem, id_externo)`.

**Invariantes**:
- `nome` obrigatório; **pelo menos um** de `email`/`telefone` na criação (validação de
  serviço, não constraint — permite `PATCH` que remove um deixando o outro).
- Sem `DELETE` físico (FR-008) — sai de jogo por `status = DESCARTADO`.
- `score` e `pessoa_id` **read-only** via API pública (`PATCH` que os envia → 422).
- `pessoa_id` só é escrito por `lead-conversao.service` (através da `PortaIdentidade`),
  nunca por CRUD.
- E-mail/telefone **não** são únicos (lead duplicado é permitido — FR-009; a dedup real é
  na conversão).

---

## `campo_personalizado_lead` — definição de campo personalizável (CL-03)

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `String @db.Uuid` | PK |
| `chave` | `String @unique` | slug `^[a-z][a-z0-9_]{1,39}$`; **imutável** após criar |
| `rotulo` | `String` | pt-BR, 1–120 chars |
| `tipo` | `CampoPersonalizadoTipo` | obrigatório |
| `opcoes` | `String[] @default([])` | **não-vazio sse** `tipo = SELECAO`; senão vazio (422 se violar) |
| `obrigatorio` | `Boolean @default(false)` | se `true` e `ativo`, todo `PUT` de valores tem de trazer a chave |
| `ativo` | `Boolean @default(true)` | `false` = ignorada na validação e não aceita valor novo |
| `criado_em` / `atualizado_em` | `Timestamptz(6)` | |

Relações: `valores ValorCampoLead[]` (`onDelete: Restrict` — não apaga definição em uso).

**Invariantes**: `chave` única e imutável. `DELETE` de definição **com** `valores` → 409
(sugere `PATCH { ativo:false }`); sem uso → `DELETE` físico permitido. Escrita gerida sob
`crm_admin:gerir_campos_lead`; auditada em **`crm_admin_audit`** (tabela da 007).

---

## `valor_campo_lead` — valor de um campo personalizado para um lead

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `String @db.Uuid` | PK |
| `lead_id` | `String @db.Uuid` | FK → `lead.id`, `onDelete: Cascade` |
| `definicao_id` | `String @db.Uuid` | FK → `campo_personalizado_lead.id`, `onDelete: Restrict` |
| `valor` | `String` | serialização canônica por tipo (ver abaixo); nunca `null` (ausência = linha removida) |
| `criado_em` / `atualizado_em` | `Timestamptz(6)` | |

`@@unique([leadId, definicaoId])`. `@@index([definicaoId])`.

**Serialização de `valor`** (validada na escrita — 422 se violar):
| `tipo` | Formato guardado | Validação |
|---|---|---|
| `TEXTO` | a string (trim) | não-vazia (vazio → remove a linha) |
| `NUMERO` | decimal canônico como string | `Number.isFinite(Number(v))` |
| `BOOLEANO` | `"true"` / `"false"` | um dos dois |
| `DATA` | `YYYY-MM-DD` | regex + `Date` válido |
| `SELECAO` | a opção escolhida | `∈ definicao.opcoes` |

---

## `crm_lead_audit` — auditoria de escrita de lead (forma canônica do core)

Estrutura **idêntica** a `crm_admin_audit` (007) / `clientes_audit` (005) / `ingestao_audit`
(006):

| Campo | Tipo | |
|---|---|---|
| `id` | `String @db.Uuid` | PK |
| `autor` | `String` | `sub` do JWT, ou identificador da credencial de serviço / integração |
| `quando` | `Timestamptz(6)` | `agoraUtc()` |
| `entidade` | `String` | `"lead"` \| `"valor_campo_lead"` |
| `entidade_id` | `String @db.Uuid` | id do lead |
| `campo` | `String` | nome do campo (ou `campos.<chave>` para valor personalizado) |
| `valor_anterior` | `Json?` | |
| `valor_novo` | `Json?` | |
| `motivo` | `String` | `"criar"` \| `"editar"` \| `"tag"` \| `"estagio"` \| `"status"` \| `"responsavel"` \| `"recalculo"` \| `"converter"` \| `"campos_personalizados"` \| `"registrar_integracao"` |
| `origem` | `String` | sempre `AJUSTE_MANUAL` (`OrigemMudanca` do core) |
| `criado_em` | `Timestamptz(6)` | |

`@@index([entidade, entidadeId])`. **Append-only** — sem serviço/endpoint de `UPDATE`/
`DELETE`. `PATCH` sem delta real (`jsonIgual`) → **0 linha**.

---

## `EstadoScoreLead` (não é tabela — entrada da função pura)

Materializado pelo `lead-score.service` a partir do `lead` + (futuro) `interacao`:

```ts
interface EstadoScoreLead {
  temEmail: boolean; temTelefone: boolean; temDocumento: boolean;
  temUtm: boolean; origem: string | null;
  estagio: LeadEstagio;
  criadoEm: string;              // ISO
  qtdInteracoes: number;        // 0 nesta spec (interacao é a 009)
  ultimaInteracaoEm: string | null;
  qtdTags: number;
}
```

Regra e pesos: ver `contracts/scoring.md`. `calcularScore(estado) → Int` puro,
determinístico, livre de locale (`agoraUtc()` para a idade/recência), clamp `[0,100]`.

---

## Máquina de estados

**`status`**:
```
ATIVO ──(PATCH status=DESCARTADO)──▶ DESCARTADO ──(PATCH status=ATIVO)──▶ ATIVO
ATIVO ──(POST /converter, sucesso)──▶ CONVERTIDO   [terminal]
DESCARTADO ──(POST /converter)──▶ 409
CONVERTIDO ──(POST /converter)──▶ 200 no-op (mesmo pessoa_id)
CONVERTIDO ──(PATCH status=*)──▶ 409 (terminal; não sai de CONVERTIDO por CRUD)
```

**`estagio`**: transição livre entre os 5 valores por `PATCH` (funil pré-pipeline, sem
ordem imposta). **Não** afeta a conversão — só `status` a governa. `DESQUALIFICADO`
(estágio) ≠ `DESCARTADO` (status): um lead pode estar `DESQUALIFICADO` + `ATIVO` e ainda
ser convertido.

---

## Relação com outras specs

- **005**: `pessoa_id` FK; a escrita em `pessoa` na conversão passa **só** pela
  `PortaIdentidade` (adaptador da 005) — o `crm` nunca toca a tabela `pessoa`.
- **004**: `responsavel_id` FK → `usuario.id`; `crm_admin:gerir_campos_lead` no catálogo.
- **007**: definições de campo personalizado auditam em `crm_admin_audit`; a sub-tela de
  definições pode viver no painel **CRM · Administração**.
- **009** (interacao): vai preencher `qtdInteracoes`/`ultimaInteracaoEm` do `EstadoScoreLead`
  e ligar `interacao.lead_id`.
- **010** (pipeline): lê/escreve `lead`, dispara `POST /crm/leads/:id/converter` ao observar
  transação paga.
- **035** (marketing-coleta): injeta `RegistrarLeadService`, preenche `origem`/`id_externo`/
  `utm_*`.
