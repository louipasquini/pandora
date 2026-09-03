# Phase 1 — Data Model: pessoa e conta (spec 005)

2ª migração de negócio do projeto (`prisma/migrations/<ts>_clientes/`). Todas as PKs são
`id String @id @db.Uuid` geradas na aplicação via `EntidadeId.novo()` (UUID v7 — Padrão
Transversal). Todos os instantes `@db.Timestamptz(6)` em UTC. IDs de origem só em
`pessoa_origem_ref`.

## Diagrama de relacionamento (texto)

```
conta 1──0..N pessoa
pessoa 1──0..N pessoa_email      (>=0; no máx 1 primario)
pessoa 1──0..N pessoa_telefone   (>=0; no máx 1 primario)
pessoa 1──0..N pessoa_documento  (CPF|CNPJ; valor unico global)
pessoa 1──0..N pessoa_endereco
pessoa 1──0..N pessoa_origem_ref (unico por plataforma+tipo+valor)
pessoa 0..1 ──▶ pessoa           (merged_para → sobrevivente)
conta  0..1 ──▶ conta            (merged_para → sobrevivente)
merge_pessoa  N──> pessoa (sobrevivente) + pessoa (absorvida) + snapshot Json
merge_conta   N──> conta  (sobrevivente) + conta  (absorvida) + snapshot Json
nota_reconciliacao N──> pessoa|conta
clientes_audit     N──> {pessoa|conta}
```

## Entidades

### pessoa

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid v7 | PK, app |
| `tipo` | enum `FISICA` \| `JURIDICA` \| `DESCONHECIDO` | default `DESCONHECIDO` |
| `nome` | string | obrigatório (>= 1 char após `trim`) |
| `contaId` | uuid? | FK → `conta.id` (`onDelete: SetNull`); 0..1 |
| `pseudonimizadaEm` | timestamptz? | **sempre `null` nesta spec** (reservado spec 047) |
| `mergedPara` | uuid? | FK → `pessoa.id` (auto-relação); != `null` ⇒ entidade inativa |
| `criadoEm` / `atualizadoEm` | timestamptz | `@default(now())` / `@updatedAt` |

Índice único parcial (SQL): `CREATE UNIQUE INDEX pessoa_ativa_id ON pessoa (id) WHERE
merged_para IS NULL` (barato; ancora invariantes futuras). Índice em `contaId`, `mergedPara`.

**Invariantes**
- `mergedPara` só é setado pelo `merge.service`; nunca por CRUD.
- `GET /pessoas/{id}` de uma `pessoa` com `mergedPara != null` resolve a cadeia até a raiz
  ativa e responde com ela + `unificadaEm` (do `merge_pessoa`).
- Sem `DELETE`. "Excluir" (spec 047) = setar `pseudonimizadaEm` + ofuscar PII — não aqui.

### conta

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid v7 | PK, app |
| `tipo` | enum `HOUSEHOLD` \| `EMPRESA` | obrigatório |
| `nome` | string | obrigatório |
| `mergedPara` | uuid? | FK → `conta.id` (auto-relação) |
| `criadoEm` / `atualizadoEm` | timestamptz | |

Sem unicidade de `nome`. **Não** tem FK para `contrato` nem para nada de `financeiro`/
`contratos` (regra inviolável #3 — `conta` não altera o Contrato `(pessoa, produto)`).

### pessoa_email / pessoa_telefone

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid v7 | PK, app |
| `pessoaId` | uuid | FK → `pessoa.id` (`onDelete: Cascade`) |
| `valor` | string | **normalizado** (e-mail: `lowercase`+`trim`; telefone: E.164) |
| `primario` | boolean | no máx 1 `true` por `pessoaId` (garantido na aplicação/transação) |
| `curado` | boolean | default `false`; `true` ⇒ `resolverOuCriar`/`desfazer` não sobrescrevem |
| `rebaixadoEm` | timestamptz? | setado quando deixa de ser primário |
| `origemMergeId` | uuid? | proveniência: id do `merge_pessoa` que moveu esta linha |
| `criadoEm` / `atualizadoEm` | timestamptz | |

`@@unique([pessoaId, valor])`. Unicidade **global** de `valor` entre pessoas **ativas** é
checada na aplicação (`donoDoContato(valor)` → 409 apontando a pessoa) — ver research D9.

### pessoa_documento

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid v7 | PK |
| `pessoaId` | uuid | FK → `pessoa.id` (`Cascade`) |
| `tipo` | enum `CPF` \| `CNPJ` | |
| `valor` | string | **só dígitos**, DV validado na entrada |
| `curado` | boolean | default `false` |
| `origemMergeId` | uuid? | proveniência |
| `criadoEm` / `atualizadoEm` | timestamptz | |

`@@unique([tipo, valor])` **global** no banco. Colisão em `POST`/`PATCH` → 409. No merge, a
linha da absorvida troca de `pessoaId` (a absorvida fica sem) — o índice não quebra.

### pessoa_endereco

`id`, `pessoaId` (FK Cascade), `logradouro`, `numero?`, `complemento?`, `bairro?`,
`cidade?`, `uf?` (2), `cep?` (só dígitos, sem validação forte), `pais` (default `BR`),
`curado` (bool), `origemMergeId?`, `criadoEm`/`atualizadoEm`. Sem unicidade.

### pessoa_origem_ref

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid v7 | PK |
| `pessoaId` | uuid | FK → `pessoa.id` (`Cascade`) |
| `plataformaOrigem` | enum (7 contas do `core`) | obrigatório; indexado |
| `tipoRef` | string | ex.: `guru_customer_id`, `asaas_customer`, `hotmart_buyer_email`, `documento` |
| `valorRef` | string | o identificador de origem cru |
| `origemMergeId` | uuid? | proveniência |
| `criadoEm` | timestamptz | |

`@@unique([plataformaOrigem, tipoRef, valorRef])` — a mesma chave de origem nunca aponta
duas `pessoa`s (FR-013). Índice em `pessoaId` e em `plataformaOrigem`.

### merge_pessoa / merge_conta

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid v7 | PK |
| `sobreviventeId` | uuid | FK → `pessoa.id` / `conta.id` |
| `absorvidaId` | uuid | FK idem |
| `autor` | string | identificador do sujeito (JWT `sub`) |
| `quando` | timestamptz | `agoraUtc()` |
| `snapshot` | Json | estado pré-merge das **duas** entidades (ver forma abaixo) |
| `estado` | enum `ativo` \| `desfeito` | default `ativo` |
| `desfeitoPor` | string? | |
| `desfeitoEm` | timestamptz? | |
| `criadoEm` | timestamptz | |

**Append-only**: a aplicação nunca faz `DELETE`; o único `UPDATE` permitido é
`estado`/`desfeitoPor`/`desfeitoEm` no desfazer. Índice em `sobreviventeId`, `absorvidaId`.

**Forma do `snapshot` (`merge_pessoa`)** — JSON:
```jsonc
{
  "sobrevivente": {
    "id": "…", "nome": "…", "tipo": "FISICA", "contaId": null,
    "emails":     [{ "valor": "…", "primario": true,  "curado": true,  "rebaixadoEm": null }],
    "telefones":  [{ "valor": "…", "primario": true,  "curado": false, "rebaixadoEm": null }],
    "documentos": [{ "tipo": "CPF", "valor": "…", "curado": false }],
    "enderecos":  [{ "logradouro": "…", "curado": false /* … */ }],
    "origemRefs": [{ "plataformaOrigem": "GURU_PRD", "tipoRef": "…", "valorRef": "…" }]
  },
  "absorvida": { /* mesma forma */ }
}
```
`merge_conta.snapshot`: `{ "sobrevivente": { id, nome, tipo, membros: [pessoaId…] },
"absorvida": { … } }`.

### nota_reconciliacao

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid v7 | PK |
| `entidade` | enum `pessoa` \| `conta` | |
| `entidadeId` | uuid | |
| `origem` | enum `resolver_ou_criar` \| `merge_desfeito` | de onde veio o conflito |
| `campo` | string | ex.: `email_primario`, `telefone_primario` |
| `valorCurado` / `valorDerivado` | Json? | o que ficou vs. o que a automação queria pôr |
| `motivo` | string | `primario_curado` \| `divergiu_pos_merge` |
| `criadoEm` | timestamptz | |

**Append-only.** Leitores futuros: 027 (reconciliação financeira) e 053 (auditoria global).

### clientes_audit

Mesma forma de `rbac_audit` (spec 004): `id` uuid v7, `autor`, `quando` (timestamptz),
`entidade ∈ {pessoa, conta}`, `entidadeId` uuid, `campo` (`criado` \| `editado` \|
`conta_associada` \| `conta_desassociada` \| `merge` \| `merge_desfeito`), `valorAnterior
Json?`, `valorNovo Json?`, `motivo` string, `origem` string (`AJUSTE_MANUAL`), `criadoEm`.
**Append-only.** Gravada só quando há **delta real** (no-op não grava). Índice em
`(entidade, entidadeId)`.

## Contrato da engine (não é tabela)

```ts
type Criterio = 'documento' | 'cnpj' | 'email' | 'telefone';
type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA';

interface DadosIdentidade {
  nome?: string;
  documento?: string;   // CPF ou CNPJ bruto; classificado por nº de dígitos
  email?: string;
  telefone?: string;
}

interface PessoaCandidata {
  id: string;
  documentos: string[];  // normalizados
  cnpjs: string[];
  emails: string[];      // primário + secundários, normalizados
  telefones: string[];
  mergedPara: string | null;
}

interface ResultadoIdentidade {
  pessoaId: string | null;
  criterio: Criterio | null;
  confianca: Confianca | null;
  candidatos: { id: string; criterios: Criterio[] }[];  // p/ revisão / merge humano
}

function resolverIdentidade(
  dados: DadosIdentidade,
  candidatos: PessoaCandidata[],
): ResultadoIdentidade; // puro, determinístico, sem I/O
```

`resolverOuCriar` (serviço) → `{ pessoaId: string | null; criada: boolean; candidatos:
{ id: string; criterios: Criterio[] }[]; notas: number }`.

## Regras de validação (resumo)

| Entrada | Regra | Falha |
|---|---|---|
| `pessoa.nome` | `trim().length >= 1` | 400 |
| `POST /pessoas` | `nome` + ≥1 de {documento válido, email válido, telefone válido} | 400 |
| documento | 11 díg → CPF + DV; 14 díg → CNPJ + DV; senão inválido | 400 (manual) / ignora + log (engine) |
| e-mail | `^[^\s@]+@[^\s@]+\.[^\s@]+$` após normalizar | 400 (manual) / ignora (engine) |
| telefone | 10–13 díg após tirar não-dígitos; `+55` se sem DDI | 400 (manual) / ignora (engine) |
| contato já de outra `pessoa` ativa | — | 409 `{ pessoaId }` (nunca funde) |
| `(tipo, valor)` de documento já existe | — | 409 `{ pessoaId }` |
| `merge`: `absorvida == sobrevivente` | — | 400 |
| `merge`: entidade inexistente | — | 404 |
| `merge`: entidade já `merged` | — | 409 |
| `desfazer`: merge já `desfeito` | — | 409 |
| associar `pessoa` já em outra `conta` | — | 409 `{ contaId }` |

## Estados

Única "máquina de estado" é `merge_*.estado`: `ativo → desfeito` (irreversível para
`ativo`; refazer é um **novo** merge). `pessoa`/`conta` não têm status — `mergedPara`
nullable é o único eixo de (in)atividade, e `pseudonimizadaEm` é reservado e inerte aqui.
