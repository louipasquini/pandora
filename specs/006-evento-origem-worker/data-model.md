# Data Model — spec 006 · evento_origem e worker de ingestão

Fonte: `spec.md` §Requirements (FR-001…FR-048) e §Key Entities. Padrões Transversais da
constituição (v1.1.0) e convenções fixadas na 001/002/004/005.

Convenções (herdadas): PK `id String @id @db.Uuid` gerada na app via `EntidadeId.novo()`;
`criadoEm` / `atualizadoEm` `@db.Timestamptz(6)` em toda tabela; `plataformaOrigem` = enum
`PlataformaOrigem` do `core` (7 contas). Nomes de tabela/coluna em `snake_case` via
`@@map`/`@map` (como 004/005).

---

## Migração

`prisma/migrations/<timestamp>_ingestao/migration.sql` — **4ª migração de negócio** (após
`20260903120000_rbac`, `20260903141931_clientes`, `20260903142000_clientes_primario_unico`).
Cria 3 tabelas + 4 enums. Aplica limpo no _harness_ e2e (schema isolado). **Sem seed de
negócio.**

---

## Enums

```prisma
enum EventoOrigemStatus { pendente  ok  erro  revisar }

enum EventoEtapaStatus  { pendente  processando  ok  erro  bloqueada  pulada }

enum EtapaIngestao {
  REGISTRAR          // 0
  CLASSIFICAR        // 1
  RESOLVER_PESSOA    // 2  (no-op — spec 018)
  UPSERT_TRANSACAO   // 3  (no-op — spec 018)
  RESOLVER_VINCULO   // 4  (no-op — spec 024)
  RESOLVER_OFERTA    // 5  (no-op — spec 023)
  PROJETAR_CONTRATO  // 6  (no-op — spec 025)
}

enum Classificacao {
  VENDA_PROPRIA
  VENDA_AFILIADA
  COBRANCA_TERCEIRIZADA
  REEMBOLSO
  RECORRENCIA
  OUTRO
  DESCONHECIDO
}
```

O enum `Classificacao` é **congelado** nesta spec; specs futuras podem **acrescentar**
valores, nunca sobrepor um.

---

## `EventoOrigem`  (`evento_origem`)

Um fato cru de uma conta de origem. **Imutável** na maior parte (só progride de `status`).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @db.Uuid` | `EntidadeId.novo()` |
| `plataformaOrigem` | `PlataformaOrigem` | enum 7; **indexado** |
| `idOrigem` | `String` | id do fato na origem; **não vazio**; **nunca PK** |
| `tipoOrigem` | `String` | categoria do payload (`webhook_venda`, `api_pedido`, `csv`, `migracao_v1`, …) |
| `payloadBruto` | `Json` | JSON cru como veio — **imutável** |
| `eventoCanonico` | `Json?` | cache reconstruível do `EventoCanonico` (nullable) |
| `hash` | `String` | `sha256(canonicalize(payloadBruto))` hex — **imutável** |
| `recebidoEm` | `DateTime @db.Timestamptz(6)` | 1ª chegada — **imutável** |
| `ultimoRecebidoEm` | `DateTime @db.Timestamptz(6)` | última reentrega vista |
| `reentregas` | `Int @default(0)` | contador de reentregas idênticas (telemetria, não agregado de negócio) |
| `status` | `EventoOrigemStatus @default(pendente)` | **derivado** das `EventoEtapa`; **indexado** |
| `classificacao` | `Classificacao?` | preenchida pela etapa `CLASSIFICAR` |
| `erroDetalhe` | `String?` | só quando `status ∈ {erro, revisar}`; **sem segredo/token** |
| `criadoEm` / `atualizadoEm` | `DateTime @db.Timestamptz(6)` | |

**Índices / unicidade**
- `@@unique([plataformaOrigem, idOrigem, hash], name: "evento_origem_chave_natural")` — a
  regra de dedup (FR-003). Reentrega idêntica não cria linha (upsert → `reentregas++` +
  `ultimoRecebidoEm`).
- `@@index([status, recebidoEm])` — seleção do worker e filtro do painel.
- `@@index([plataformaOrigem])`, `@@index([classificacao])` — filtros do painel.

**Imutabilidade** (aplicação, não trigger): nenhum serviço faz `UPDATE` de
`payloadBruto`/`hash`/`plataformaOrigem`/`idOrigem`/`recebidoEm`. Mudam só `status`,
`classificacao`, `erroDetalhe`, `eventoCanonico` (só de `null`→valor no reprocesso quando
adapters existirem), `reentregas`, `ultimoRecebidoEm`, `atualizadoEm`.

**Máquina de estado** (`status`, derivado a cada passada por `plano-passada`):

```
pendente ──(worker: todas as etapas aplicáveis ok/pulada)──▶ ok
pendente ──(alguma etapa sinaliza ambiguidade, nenhuma erro)─▶ revisar
pendente ──(alguma etapa erro / bloqueada a jusante de erro)─▶ erro
ok|erro|revisar ──(POST /reprocessar)──▶ pendente   (etapas não-ok → pendente, tentativas=0)
```

Um evento nunca fica preso em `pendente` sem uma passada tê-lo tocado (SC-004).

---

## `EventoEtapa`  (`evento_etapa`)

Resultado de **uma etapa** do pipeline para **um evento**. Log operacional (não é
`RegistroAuditoria`). Uma linha por `(evento, etapa)`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @db.Uuid` | |
| `eventoOrigemId` | `String @db.Uuid` | FK → `EventoOrigem.id`, `onDelete: Restrict` |
| `etapa` | `EtapaIngestao` | |
| `status` | `EventoEtapaStatus @default(pendente)` | |
| `resultado` | `Json?` | saída explícita da etapa (p.ex. `{ implementadaNa: 18 }` nas _no-op_; `{ classificacao, motivo }` na etapa 1) |
| `erroDetalhe` | `String?` | preenchido quando `status = erro` |
| `tentativas` | `Int @default(0)` | incrementa a cada execução que termina `erro`; zerado por `/reprocessar` |
| `executadoEm` | `DateTime? @db.Timestamptz(6)` | instante da última execução |
| `criadoEm` / `atualizadoEm` | `DateTime @db.Timestamptz(6)` | |

**Índices / unicidade**
- `@@unique([eventoOrigemId, etapa])` — uma linha por par (FR-018).
- `@@index([status])` — seleção do worker (`pendente` / `bloqueada` / `erro` sub-`MAX`).

**Criação**: no `registrarEvento` (etapa 0), cria-se `REGISTRAR = ok` e as 6 demais
`pendente`. (Todas as 7 nascem juntas para a linha do tempo do painel ser uniforme.)

**Máquina de estado** (`status`):

```
pendente ──▶ processando ──(executar ok)──────────▶ ok
                          ──(executar lança)───────▶ erro   (tentativas++)
pendente ──(dependência declarada não está ok)────▶ bloqueada
bloqueada ──(dependência ficou ok em passada N)───▶ pendente
erro ──(tentativas < MAX, próxima passada)────────▶ processando ──▶ ok | erro
erro ──(tentativas == MAX)────────────────────────▶ erro (terminal até /reprocessar)
qualquer ──(POST /reprocessar, se != ok)──────────▶ pendente (tentativas = 0)
pulada ── estado final das etapas 2–6 nesta spec (no-op)
```

**Grafo de dependências** (`dependeDe`, dado em `domain/etapas.ts`):

```
REGISTRAR(0) → CLASSIFICAR(1) → RESOLVER_PESSOA(2) → UPSERT_TRANSACAO(3)
                                                       ├→ RESOLVER_VINCULO(4)
                                                       ├→ RESOLVER_OFERTA(5)
                                                       └→ PROJETAR_CONTRATO(6)
```

4, 5 e 6 **não** dependem entre si (visão 5.3 — "independente da 5"; "independente da 6").
`RESOLVER_PESSOA` nunca bloqueia a jusante por si (a visão diz "usa `null`, segue"): quando
virar real (018) resolve `ok` mesmo sem pessoa. A dependência dura de 4/5/6 é
`UPSERT_TRANSACAO`.

---

## `IngestaoAudit`  (`ingestao_audit`)

Forma canônica `RegistroAuditoria` do `core` (spec 002), `origem = AJUSTE_MANUAL`,
**append-only** — simétrica ao `rbac_audit` (004) / `clientes_audit` (005). Grava **só o
reprocessamento manual**.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @db.Uuid` | |
| `entidade` | `String` | `"evento_origem"` |
| `entidadeId` | `String @db.Uuid` | id do evento |
| `acao` | `String` | `"reprocessar"` |
| `origem` | `String` | `"AJUSTE_MANUAL"` |
| `sujeito` | `String` | `sub` do JWT (usuário ou credencial de serviço) |
| `delta` | `Json` | `{ etapasReenfileiradas: EtapaIngestao[], forcar: boolean }` |
| `quando` | `DateTime @db.Timestamptz(6)` | `agoraUtc()` |
| `criadoEm` | `DateTime @db.Timestamptz(6)` | |

A aplicação nunca faz `UPDATE`/`DELETE` aqui.

---

## Contrato `EventoCanonico`  (não é tabela — schema `zod` em `domain/evento-canonico.ts`)

Núcleo **obrigatório**:

| Campo | Tipo | Validação |
|---|---|---|
| `plataformaOrigem` | `PlataformaOrigem` | enum 7 |
| `idOrigem` | `string` | não vazio |
| `tipoOrigem` | `string` | não vazio |
| `statusOrigem` | `string` | cru, não normalizado (a tradução é dos adapters) |
| `ocorridoEm` | `Instante` | via `parseInstante` — resolve `null` + motivo se lixo (registrado, não rejeita) |

**Opcionais** (transportados; validados se presentes):

| Campo | Tipo | Uso nesta spec |
|---|---|---|
| `comprador` | `{ nome?, emails?: string[], telefones?: string[], documentos?: string[], endereco?: {...} }` | só transportado (etapa 2 é _no-op_) |
| `valores` | `{ bruto?, liquido?, taxas?, reembolso? }` cada um `{ valorInteiro: bigint, moeda: Moeda }` | transportado; **nunca somado** |
| `oferta` | `{ codigoOrigem?, nomeOrigem?, ... }` (crus) | transportado (etapa 5 é _no-op_) |
| `assinatura` | `{ ehRecorrencia?: boolean, ciclo?: string, numeroCiclo?: number }` | `classificar` lê `ehRecorrencia` |
| `ehAfiliada` | `boolean` | `classificar` → `VENDA_AFILIADA` |
| `referenciaExterna` | `{ plataforma?: PlataformaOrigem, idOrigem?: string }` | `classificar` → `COBRANCA_TERCEIRIZADA`; ponte da etapa 4 |
| `classificacao` | `Classificacao` | dica preliminar do adapter |

Entrada que viola o schema → `422` ao chamador; **nunca** persistida como canônica
(FR-009). `EventoCanonico` **não** carrega segredo/token (FR-010).

---

## Função de classificação (`domain/classificar.ts`)

`classificar(canonico: EventoCanonico | null, tipoOrigem: string) → { classificacao:
Classificacao; revisar: boolean; motivo?: string }` — **pura, determinística** (FR-030).

Ordem de decisão (primeira que casa vence):

1. `canonico == null` → `{ DESCONHECIDO, revisar, motivo: "sem EventoCanonico" }`.
2. estorno (`statusOrigem` de estorno/chargeback **ou** `tipoOrigem` contém `reembolso`/
   `estorno`/`refund`/`chargeback`) → `REEMBOLSO`.
3. `canonico.referenciaExterna?.idOrigem` presente **e** aponta outra `plataformaOrigem` →
   `COBRANCA_TERCEIRIZADA` **se** dá para cravar sem casar a transação; caso contrário
   `{ DESCONHECIDO, revisar, motivo: "vínculo Asaas↔Guru é da spec 024" }`.
4. `canonico.ehAfiliada === true` → `VENDA_AFILIADA`.
5. `canonico.assinatura?.ehRecorrencia === true` (ou `numeroCiclo > 1`) → `RECORRENCIA`.
6. senão → `VENDA_PROPRIA`.

`canonico.classificacao` (dica do adapter) fora do enum → ignorada; se todas as regras
acima também falham em cravar → `{ DESCONHECIDO, revisar }`. **Nunca** um palpite (FR-029).

`revisar: true` → o worker marca `EventoEtapa(CLASSIFICAR).status = ok` (a etapa **rodou**)
mas `EventoOrigem.status = revisar` + `erroDetalhe = motivo` (a classificação em si é o
resultado; "revisar" é sinal para humano, não falha de etapa).

---

## Registro `ETAPAS` e `plano-passada` (puros)

`domain/etapas.ts` exporta `ETAPAS: readonly EtapaDef[]` (ver D5 do research).
`domain/plano-passada.ts`:

`planejarPassada(etapasDoEvento: Map<EtapaIngestao, EventoEtapa>, max: number) → {
  acoes: Map<EtapaIngestao, 'EXECUTAR' | 'BLOQUEADA' | 'JA_OK' | 'PULAR' | 'ESGOTADA'>;
  statusEvento: EventoOrigemStatus;
}`

Regras:
- etapa `ok`/`pulada` → `JA_OK` (não reexecuta — SC-003).
- etapa `erro` com `tentativas >= max` → `ESGOTADA` (não executa; contribui `erro` ao
  evento).
- etapa cujo `dependeDe` tem alguma **não** `ok`/`pulada` → `BLOQUEADA`.
- etapa `pendente`/`bloqueada`/`erro<max` com dependências satisfeitas → `EXECUTAR`.
- `statusEvento`: `erro` se alguma etapa `erro`/`ESGOTADA`/`BLOQUEADA`-por-erro; senão
  `revisar` se alguma sinaliza ambiguidade; senão `ok` se todas `JA_OK`; senão `pendente`
  (ainda há `EXECUTAR`).

100% testável sem banco (SC-009).
