# Phase 1 — Data Model: Bootstrap do Projeto

Esta spec **não introduz entidade de negócio nem tabela**. O `schema.prisma` baseline tem
apenas `datasource` + `generator` e uma migração vazia. O que segue são os **objetos
estruturais** que a spec cria e os invariantes que eles carregam.

## `EntidadeId` — Value Object de identificador (`backend/src/core/ids/entidade-id.ts`)

Wrapper tipado sobre um UUID v7. É a base de identidade de **toda** entidade futura.

| Aspecto | Definição |
| --- | --- |
| Estado interno | `readonly value: string` — um UUID v7 canônico em minúsculas |
| Construção | `new EntidadeId(value)` valida: formato UUID (regex RFC 4122) **e** versão `7` (13º dígito hex `= '7'`). Inválido → `throw new TypeError('EntidadeId inválido: <value>')` |
| Fábrica | `EntidadeId.novo(): EntidadeId` → gera via `uuidv7()` do `core/ids/uuid.ts` |
| Reidratação | `EntidadeId.de(value: string): EntidadeId` — idem construtor (nome explícito para leitura de persistência) |
| Serialização | `toString(): string` e `toJSON(): string` → `value`; `equals(other: EntidadeId): boolean` |
| Persistência | mapeado para coluna Prisma `@db.Uuid`; conversão VO↔string feita na borda de repositório (nenhuma entidade nesta spec exercita isso — só o contrato fica fixado) |

**Invariantes**
- Nunca circula `string` crua de ID na camada de domínio — sempre `EntidadeId`.
- Duas instâncias com o mesmo `value` são iguais por `.equals` (VO, não por referência).
- Imutável: sem setters; `value` é `readonly`.

**Testes** (`entidade-id.spec.ts`): gera-e-reidrata (round-trip), rejeita UUID v4, rejeita
lixo, `.equals` por valor, `.novo()` produz versão 7 e valores distintos a cada chamada.

## `uuidv7()` — utilitário de geração (`backend/src/core/ids/uuid.ts`)

Fina camada sobre `import { v7 as uuidv7 } from 'uuid'`. Existe para dar **um** ponto de
troca caso a fonte de UUID v7 mude. Exporta `uuidv7(): string`.

## `PlataformaOrigem` — enum de referência (`backend/src/core/plataforma-origem.enum.ts`)

Enum TypeScript com os 7 valores canônicos. **Sem uso nesta spec** — existe para (a) fixar a
grafia canônica das contas desde o começo e (b) ser a dimensão de primeira classe que as
specs de ingestão/financeiro vão consumir.

```
TMB | ASAAS_PRD | ASAAS_SVC | GURU_PRD | GURU_SVC | HOTMART_PRD | HOTMART_SVC
```

Mapeamento nome humano ↔ enum documentado em `docs/001-bootstrap-projeto.md`
(`Asaas PRD` ↔ `ASAAS_PRD`, etc.).

## `AppConfig` — configuração validada (`backend/src/config/env.schema.ts`)

Objeto imutável derivado de `envSchema.parse(process.env)` (zod). Não é persistido; é
resolvido uma vez no boot e injetável via `ConfigService<AppConfig, true>`.

| Grupo | Chaves | Regra |
| --- | --- | --- |
| Runtime | `NODE_ENV` (`development`\|`test`\|`production`), `PORT` (número, obrigatória) | sem default silencioso em código |
| Banco | `DATABASE_URL` (URL pg, obrigatória), `TEST_DATABASE_URL` (URL pg, obrigatória só quando `NODE_ENV=test` ou ao rodar a suíte) | falha cedo nomeando a chave |
| Auth de serviço | `SERVICE_JWT_SECRET` (string ≥ 32, **opcional** nesta spec; a 003 torna obrigatória) | placeholder no `.env.example` |
| Contas de origem (×7) | para cada `C` ∈ `{TMB, ASAAS_PRD, ASAAS_SVC, GURU_PRD, GURU_SVC, HOTMART_PRD, HOTMART_SVC}`: `C_API_BASE_URL` (URL, opcional), `C_API_KEY` (string, opcional), `C_WEBHOOK_TOKEN` (string, opcional) | presentes e tipadas; specs de adapter promovem a obrigatórias por conta |

**Invariantes**
- `envSchema.parse` lançando aborta o boot (FR-008). Mensagem inclui o caminho zod
  (`PORT: Expected number, received nan`).
- `AppConfig = z.infer<typeof envSchema>` é a **única** fonte de tipo de config no backend.
- Nenhuma chave de conta é lida fora de um futuro adapter; aqui só existem no schema/example.

## `TestDbContext` — contexto de teste (`backend/test/setup-db.ts` / `teardown-db.ts`)

Não é entidade de runtime; é o objeto de ciclo de vida do harness.

| Campo | Definição |
| --- | --- |
| `schema` | `"t_" + Date.now().toString(36) + "_" + randomHex(4)` — único por worker Jest |
| `databaseUrl` | `${TEST_DATABASE_URL}?schema=${schema}` (injetado em `process.env.DATABASE_URL` do worker) |
| setup | valida `TEST_DATABASE_URL` (ausente → erro explícito, FR-015); `prisma migrate deploy` com `databaseUrl`; `CREATE SCHEMA IF NOT EXISTS` implícito pelo Prisma |
| teardown | `DROP SCHEMA "<schema>" CASCADE` |

**Invariante**: dois workers concorrentes nunca compartilham `schema` (SC-004).

## Convenções para entidades futuras (documentadas, não implementadas aqui)

Registradas em `docs/001-bootstrap-projeto.md` para as próximas specs herdarem:

- PK: `id String @id @db.Uuid` gerado na aplicação via `EntidadeId.novo()` (não
  `@default(...)` do banco).
- Auditoria: toda tabela carrega `criado_em DateTime @default(now()) @db.Timestamptz` e
  `atualizado_em DateTime @updatedAt @db.Timestamptz`.
- Tempo: colunas de instante sempre `@db.Timestamptz` (UTC).
- IDs de origem: nunca PK — vão para tabelas `<entidade>_origem_ref`.
- Dinheiro (a partir da 002): inteiro ×10000 + coluna de moeda; `float`/`Decimal` sem escala
  proibidos.
