---
description: "Task list for feature 002 — core value objects"
---

# Tasks: Value Objects e primitivas canônicas do `core`

**Input**: Design documents from `specs/002-core-value-objects/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos — a spec (FR-034, SC-001..SC-009) exige cobertura unitária dos casos de
borda. Cada primitiva tem um `*.spec.ts` colado ao fonte (padrão de `ids/` da 001). Sem
banco, sem e2e nesta spec.

**Organization**: tarefas agrupadas por user story. US1–US3 são P1 (podem correr em
paralelo após a Fundação); US4–US5 são P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1 (Dinheiro), US2 (Tempo), US3 (Status), US4 (Auditoria), US5 (Config)
- Todo caminho é relativo à raiz do monorepo

## Path Conventions

Web app / monorepo npm workspaces. Backend em `backend/src/`. Esta fatia é 100%
`backend/src/core/` + `backend/eslint.config.mjs` + `.github/workflows/ci.yml` + `docs/` +
docs de raiz.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: estrutura de pastas e regra de fronteira de config

- [X] T001 Criar as subpastas temáticas do core: `backend/src/core/dinheiro/`,
      `backend/src/core/tempo/`, `backend/src/core/status/`, `backend/src/core/auditoria/`,
      `backend/src/core/config/` (cada uma com um `.gitkeep` até receber arquivo).
- [X] T002 [P] Adicionar regra ESLint `no-restricted-syntax` em `backend/eslint.config.mjs`
      que barra `MemberExpression[object.name='process'][property.name='env']` em
      `backend/src/**`, com exceção para `src/config/**`, `src/core/**` e `src/main.ts`
      (bloco `files`/`ignores` dedicado). Mensagem: "leia config pelo contrato tipado do
      `core` (Padrão Transversal), não `process.env`."

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: primitiva de tempo compartilhada por US2 (exposição) e US4 (carimbo de
auditoria) e por toda entidade futura.

**⚠️ CRITICAL**: T003 bloqueia US4; T001/T002 bloqueiam todo o resto.

- [X] T003 Implementar `agoraUtc(): Date` em `backend/src/core/tempo/agora.ts` — wrapper de
      `new Date()`, com doc explicando que é o ponto único de carimbo (fakeável em teste).
- [X] T004 [P] `backend/src/core/tempo/agora.spec.ts` — com `jest.useFakeTimers()` fixado em
      `2026-01-01T00:00:00Z`, asserta `agoraUtc().toISOString()`.

**Checkpoint**: Fundação pronta — US1, US2, US3 podem começar em paralelo.

---

## Phase 3: User Story 1 — Dinheiro (Priority: P1) 🎯 MVP

**Goal**: `Dinheiro` + `Moeda` — quantia imutável `bigint` ×10000, moeda ISO 4217 validada,
operações puras, nunca soma moedas diferentes, nunca `float`, serialização reversível,
rateio com soma exata.

**Independent Test**: `npm test -w backend -- dinheiro moeda ratear` verde; prova SC-001
(round-trip), SC-002 (moedas mistas → erro), SC-003 (sem `float`).

### Implementation for User Story 1

- [X] T005 [P] [US1] `backend/src/core/dinheiro/moeda.ts` — `type Moeda` (branded string),
      `ISO_4217` (array `const` congelado com os códigos alfabéticos ativos da ISO 4217) +
      `ISO_4217_SET`, `ehMoeda(v): v is Moeda`, `assertMoeda(v): asserts v is Moeda`
      (normaliza p/ caixa alta; inválido → `RangeError` nomeando o código), `criarMoeda(v)`.
- [X] T006 [P] [US1] `backend/src/core/dinheiro/moeda.spec.ts` — `brl`/`BRL`/`Brl` → `"BRL"`;
      rejeita `"XXX"`, `"BR"`, `"REAIS"`, `123`, `null`, `""`.
- [X] T007 [US1] `backend/src/core/dinheiro/dinheiro.ts` — `class Dinheiro` imutável
      (`readonly valorInt: bigint`, `readonly moeda: Moeda`). Fábricas: `deDecimal(texto,
      moeda)` (regex `^-?\d+(\.\d+)?$` + checagem ≤ 4 casas → senão `RangeError`, sem `parseFloat`),
      `deInteiroEscalado(valorInt, moeda)` (`number` não inteiro → `TypeError`),
      `zero(moeda)`, `deSerializado({valorInt, moeda})`. Operações: `somar`/`subtrair`
      (moeda diferente → `Error` nomeando as duas), `negar`, `multiplicarPorEscalar(fator)`
      (só inteiro; não inteiro/`NaN`/`Infinity` → `TypeError`), `equals` (valor+moeda;
      nunca lança; nulo/moeda diferente → `false`), `compararCom` (mesma moeda, senão
      `Error`; nulo → `TypeError`) + `maiorQue`/`menorQue`/`maiorOuIgual`/`menorOuIgual`,
      `ehZero`/`ehNegativo`/`ehPositivo`. Serialização: `toJSON()` →
      `{ valorInt: string, moeda: string }`, `paraPersistencia()` (alias), `toString()` →
      `"1234.5678 BRL"`. (depende de T005)
- [X] T008 [US1] `backend/src/core/dinheiro/dinheiro.spec.ts` — cobre `contracts/dinheiro.md`
      §"Testes de contrato": `deDecimal("1234.5678","BRL").valorInt === 12345678n`;
      `"10.12345"` → `RangeError`; `"1,50"` → `RangeError`; imutabilidade de `somar`; BRL+USD
      → `Error` citando `BRL` e `USD`; `equals` cross-moeda → `false`; `compararCom`
      cross-moeda → `Error`; `multiplicarPorEscalar(0.5)` → `TypeError`, `(3)` ok; round-trip
      de serialização com 5 casos (inteiro, 1–4 casas, negativo, `zero`, `> 2^53`);
      `zero("BRL").equals(zero("USD"))` → `false`.
- [X] T009 [P] [US1] `backend/src/core/dinheiro/ratear.ts` — `ratear(total: Dinheiro,
      n: number): Dinheiro[]` (`n` inteiro `>0`, senão `RangeError`; `base = valorInt/n`,
      `resto = valorInt%n`; as `abs(resto)` primeiras parcelas recebem `+sign(1)` unidade) e
      `ratearPorPesos(total, pesos: number[]): Dinheiro[]` (inteiros `≥0`, soma `>0`;
      maior-resto/Hamilton). (depende de T007)
- [X] T010 [P] [US1] `backend/src/core/dinheiro/ratear.spec.ts` — `ratear(10.0000 BRL, 3)` →
      3 parcelas somando exatamente `10.0000`; `ratearPorPesos(100.0000 BRL, [1,1,1])` →
      soma exata; `ratear(x, 0)` → `RangeError`; rateio de valor negativo distribui resto
      corretamente.

**Checkpoint**: US1 funcional e testável isolada (importando dos arquivos de fonte).

---

## Phase 4: User Story 2 — Tempo (Priority: P1)

**Goal**: `parseInstante` de borda tolerante e livre de locale; `agoraUtc` exposto.

**Independent Test**: `npm test -w backend -- tempo` verde sob `TZ` `UTC` /
`America/Sao_Paulo` / `Asia/Tokyo` com resultados idênticos (SC-004, SC-005).

### Implementation for User Story 2

- [X] T011 [P] [US2] `backend/src/core/tempo/parse-instante.ts` —
      `parseInstante(entrada: unknown): { valor: Date | null; motivo?: string }`, nunca
      lança. Ordem: `Date` (válido/`NaN`); `number` finito → epoch com limiar
      `Math.abs(n) < 1e11` ⇒ segundos senão ms; string `^-?\d+$` → epoch; ISO com offset
      (`Z`/`±HH:MM`) → `new Date`; ISO sem offset (data, data+hora, `T` ou espaço) → anexa
      `Z` + `motivo` "sem fuso — assumido UTC"; vazio/`dd/mm/aaaa`/texto/`null`/`undefined`/
      boolean/objeto → `{ valor: null, motivo }`. Ver `contracts/tempo.md`.
- [X] T012 [P] [US2] `backend/src/core/tempo/parse-instante.spec.ts` — cobre a tabela de
      `contracts/tempo.md`: `"...T12:00:00Z"` ≡ `"...T09:00:00-03:00"`; naive → instante +
      `motivo`; `1772539200` ≡ `1772539200000`; lixo (`""`, `"n/a"`, `"0000-00-00"`, `null`,
      `undefined`, `true`, `{}`) → `valor: null` + `motivo` não vazio; `"01/03/2026"` →
      `valor: null` + `motivo` de formato; `new Date("nope")` → `valor: null`. Incluir um
      `describe` que roda a matriz-núcleo e serve à execução multi-`TZ` do CI.
- [X] T013 [US2] Adicionar ao `.github/workflows/ci.yml` uma matriz (ou 3 steps) que roda
      `npm test -w backend -- tempo` com `TZ` ∈ `{ UTC, America/Sao_Paulo, Asia/Tokyo }` e
      falha se qualquer uma divergir (prova SC-004). Não alterar os demais jobs.

**Checkpoint**: US2 funcional; parser comprovadamente livre de locale.

---

## Phase 5: User Story 3 — Status canônico (Priority: P1)

**Goal**: enums `StatusTransacaoCanonico` / `StatusContratoCanonico`; funções puras
`liberaAcesso` / `contaComoReceita` / `contratoLiberaAcesso`; rede de segurança
`paraStatusTransacaoCanonico`.

**Independent Test**: `npm test -w backend -- status` verde; para os 8 valores de transação
o par `(liberaAcesso, contaComoReceita)` bate a tabela-verdade (SC-006); bruto desconhecido
→ `{ DESCONHECIDO, revisar: true }` (SC-007).

### Implementation for User Story 3

- [X] T014 [P] [US3] `backend/src/core/status/status-transacao.ts` — `enum
      StatusTransacaoCanonico` (`PENDENTE`, `PAGO`, `EM_ATRASO`, `RECUSADO`, `CANCELADO`,
      `ESTORNADO`, `CHARGEBACK`, `DESCONHECIDO`), `STATUS_TRANSACAO_CANONICO` (array
      congelado), `liberaAcesso(s)` e `contaComoReceita(s)` como `switch` exaustivo com
      `default: never`. Tabela-verdade de `contracts/status-canonico.md` (`EM_ATRASO` →
      acesso `true`).
- [X] T015 [P] [US3] `backend/src/core/status/status-transacao.spec.ts` —
      `it.each(STATUS_TRANSACAO_CANONICO)` asserta o par exato para cada valor; garante que
      os 8 estão cobertos.
- [X] T016 [P] [US3] `backend/src/core/status/status-contrato.ts` — `enum
      StatusContratoCanonico` (`ATIVO`, `EXPIRADO`, `CANCELADO`, `DESCONHECIDO`),
      `STATUS_CONTRATO_CANONICO`, `contratoLiberaAcesso(s)` (só `ATIVO` → `true`).
- [X] T017 [P] [US3] `backend/src/core/status/status-contrato.spec.ts` — `ATIVO` → `true`;
      os outros 3 → `false`.
- [X] T018 [US3] `backend/src/core/status/resolver-status.ts` —
      `paraStatusTransacaoCanonico(bruto: unknown): { status: StatusTransacaoCanonico;
      revisar: boolean }`. Valor exato do enum → `{ status: bruto, revisar: false }`; resto
      → `{ status: DESCONHECIDO, revisar: true }`. Sem `trim`/`lowercase`/sinônimo.
      (depende de T014)
- [X] T019 [US3] `backend/src/core/status/resolver-status.spec.ts` — `"PAGO"` →
      `{ PAGO, false }`; `"pago"`, `"aprovado"`, `""`, `null`, `undefined`, `42`, `{}` →
      `{ DESCONHECIDO, true }`.

**Checkpoint**: US3 funcional e testável isolada.

---

## Phase 6: User Story 4 — Base de auditoria (Priority: P2)

**Goal**: contrato `EntidadeAuditavel` (`criadoEm`/`atualizadoEm` UTC) e forma canônica
`RegistroAuditoria` + `montarRegistroAuditoria` (sem tabela).

**Independent Test**: `npm test -w backend -- auditoria` verde; `montarRegistroAuditoria`
sem `quando` usa `agoraUtc()`, `motivo` vazio → `TypeError`, `origem` fora do enum →
`TypeError`.

### Implementation for User Story 4

- [X] T020 [P] [US4] `backend/src/core/auditoria/entidade-auditavel.ts` — `interface
      EntidadeAuditavel { readonly criadoEm: Date; readonly atualizadoEm: Date }` +
      `const TIMESTAMPTZ_PRISMA = '@db.Timestamptz'` (lembrete de convenção) + doc da
      semântica (criação define os dois; escrita atualiza `atualizadoEm`).
- [X] T021 [P] [US4] `backend/src/core/auditoria/registro-auditoria.ts` — `enum
      OrigemMudanca { CURADORIA, AJUSTE_MANUAL, MIGRACAO }`, `interface RegistroAuditoria`
      (`autor`, `quando: Date`, `entidade`, `entidadeId`, `campo`, `valorAnterior: unknown`,
      `valorNovo: unknown`, `motivo`, `origem`), `montarRegistroAuditoria(dados)` — pura;
      `quando ?? agoraUtc()`; valida `motivo` não vazio (`TypeError`) e `origem` no enum
      (`TypeError`). (depende de T003)
- [X] T022 [US4] `backend/src/core/auditoria/registro-auditoria.spec.ts` — `quando` default
      via fake timer; `motivo: ""` → `TypeError`; `origem` inválida → `TypeError`; registro
      válido tem todos os campos na ordem do contrato.

**Checkpoint**: US4 funcional; forma canônica pronta para a spec 053.

---

## Phase 7: User Story 5 — Config tipada consolidada (Priority: P2)

**Goal**: `core` passa a ser o dono do contrato de config (re-export tipado); regra de
fronteira `process.env` (T002) verificada; fluxo documentado. Sem redesenho, sem chave nova,
sem regressão da 001.

**Independent Test**: testes da 001 (`env.schema.spec.ts`) continuam verdes;
`AppConfig`/`accountConfig` importáveis a partir de `core`; `npm run lint -w backend` acusa
`process.env` em código de contexto.

### Implementation for User Story 5

- [X] T023 [US5] `backend/src/core/config/index.ts` — re-export de `type AppConfig` e
      `accountConfig` de `../../config/env.schema`; `export type LeitorConfig =
      ConfigService<AppConfig, true>['get']` (import de `@nestjs/config`). Doc no topo:
      fluxo `.env` → `envSchema.parse` no boot → `ConfigService` → fatia por contexto.
- [X] T024 [US5] `backend/src/core/config/index.spec.ts` — teste de compilação/importação:
      `import { AppConfig, accountConfig } from '../...'` resolve; `accountConfig` com uma
      conta sem chaves → `undefined` (mesma semântica da 001).
- [X] T025 [US5] Rodar `npm run lint -w backend` e confirmar que a regra de T002 não gera
      falso positivo no código existente (`src/main.ts`, `src/config/**`, `test/**` na
      allowlist); ajustar a allowlist da regra se necessário. Registrar no PR um fixture
      temporário (não commitado) provando que um `process.env` em `src/crm/` falha o lint.

**Checkpoint**: config é contrato do `core`; fronteira aplicada por lint.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: barrel único, documentação e "Definition of Done" da spec.

- [X] T026 Estender o barrel único `backend/src/core/core.module.ts` com
      `export * from './dinheiro/moeda'`, `'./dinheiro/dinheiro'`, `'./dinheiro/ratear'`,
      `'./tempo/parse-instante'`, `'./tempo/agora'`, `'./status/status-transacao'`,
      `'./status/status-contrato'`, `'./status/resolver-status'`,
      `'./auditoria/entidade-auditavel'`, `'./auditoria/registro-auditoria'`, `'./config'`.
      `CoreModule` continua `@Global()` sem `providers`. Atualizar o comentário do arquivo
      (não menciona mais "entram na spec 002" como futuro).
- [X] T027 [P] Criar `docs/002-core-value-objects.md` — API pública de cada primitiva,
      exemplos de uso curtos, e as decisões de trade-off (bigint, ISO 4217 embarcado,
      limiar epoch `1e11`, `multiplicarPorEscalar` só inteiro + `ratear`, `EM_ATRASO`
      permissivo, `parseInstante` livre de locale, config não movida). Linkar
      `contracts/` e `research.md`.
- [X] T028 [P] Atualizar `README.md` — bloco "Estrutura do repositório" do `core`
      (subpastas `dinheiro/tempo/status/auditoria/config`), e a seção "Status" (002
      implementada; próxima 003). Ajustar a linha `core/  ... dinheiro/tempo/status → spec 002`.
- [X] T029 [P] Atualizar `ROADMAP.md` — marcar `- [x] **002 — core-value-objects**` com data
      e resumo do entregue; ajustar "Próxima" implícita para 003; nenhuma outra linha.
- [X] T030 Atualizar `CLAUDE.md` — seção "Stack" (o `core` agora expõe `Dinheiro`/`Moeda`,
      `parseInstante`/`agoraUtc`, enums de status + funções puras, `RegistroAuditoria`);
      trocar "`Dinheiro`/tempo/status canônico entram na spec 002" por estado presente. Não
      tocar o bloco `<!-- SPECKIT ... -->` (gerado).
- [X] T031 Rodar a validação do `quickstart.md`: `npm run lint && npm run typecheck &&
      npm test` na raiz + `npm run test:e2e -w backend` (sem regressão da 001) + a matriz de
      `TZ` do teste de tempo. Registrar o resultado no PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependência — pode começar já.
- **Foundational (Phase 2)**: depende de T001. Bloqueia US4 (via T003).
- **US1 / US2 / US3 (Phases 3–5, P1)**: dependem de T001/T002 (e T003 já feito). Podem
  correr em paralelo.
- **US4 (Phase 6, P2)**: depende de T003.
- **US5 (Phase 7, P2)**: depende de T002.
- **Polish (Phase 8)**: T026 depende de todos os arquivos de fonte das US1–US5 existirem;
  T027–T031 dependem de T026.

### User Story Dependencies

- Nenhuma US depende de outra US no nível de fonte (os `*.spec.ts` importam do arquivo de
  fonte local, não do barrel). O barrel (T026) é o único ponto de convergência e fica no
  Polish.

### Parallel Opportunities

- T002 ∥ (T003→T004).
- Dentro de US1: T005 ∥ nada (T006 depois); T007 depois de T005; T009/T010 depois de T007;
  T006 ∥ T008 ∥ T010 (arquivos de teste distintos).
- US1 ∥ US2 ∥ US3 inteiras (equipes/execuções distintas).
- US4 ∥ US5 depois da Fundação.
- Polish: T027 ∥ T028 ∥ T029 (arquivos distintos); T030 sozinho (mesmo arquivo que ninguém
  mais toca, mas depois de T026); T031 por último.

---

## Parallel Example: User Story 1

```bash
# Após T005 (moeda.ts):
Task: "T007 [US1] Implementar class Dinheiro em backend/src/core/dinheiro/dinheiro.ts"
# Após T007:
Task: "T009 [US1] ratear.ts"      # paralelo com:
Task: "T008 [US1] dinheiro.spec.ts"
Task: "T010 [US1] ratear.spec.ts"
Task: "T006 [US1] moeda.spec.ts"
```

---

## Implementation Strategy

### MVP (US1 apenas)

1. Phase 1 (Setup) → Phase 2 (Fundação).
2. Phase 3 (US1 — Dinheiro).
3. **PARAR e VALIDAR**: `npm test -w backend -- dinheiro moeda ratear`.
4. É o núcleo que o ledger (018) e contratos (025) mais esperam.

### Entrega incremental

1. Setup + Fundação → base pronta.
2. US1 (Dinheiro) → testar → o resto da Fase 2 do roadmap destrava aos poucos.
3. US2 (Tempo) → testar sob 3 `TZ`.
4. US3 (Status) → testar os 8 valores.
5. US4 (Auditoria) + US5 (Config) → P2, fecham a spec.
6. Polish: barrel + 4 docs + `quickstart`.

### Notas

- `[P]` = arquivos diferentes, sem dependência pendente.
- Commit por tarefa ou grupo lógico.
- Nenhuma porta nova, nenhum serviço novo, nenhuma migração (FR-037).
- Nenhum contexto de domínio é tocado; `core` não importa de contexto (lint da 001).
