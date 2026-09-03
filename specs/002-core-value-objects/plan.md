# Implementation Plan: Value Objects e primitivas canônicas do `core`

**Branch**: `002-core-value-objects` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-core-value-objects/spec.md`

## Summary

Entregar, no contexto `core` do backend, as primitivas canônicas que todos os outros 10
contextos importam — **sem** banco, **sem** endpoint, **sem** entidade Prisma de negócio,
**sem** frontend:

1. **`Dinheiro` + `Moeda`** — Value Object imutável, valor interno `bigint` em escala fixa
   ×10000, `moeda` como código ISO 4217 validado (conjunto aberto porém validado). Operações
   `somar`/`subtrair`/`negar`/`multiplicarPorEscalar` (só fator inteiro)/comparações/`zero`/
   `ratear`/`ratearPorPesos`, todas puras; nunca soma moedas diferentes; nunca `float`;
   serialização `{ valorInt: string, moeda: string }` reversível.
2. **Tempo** — `parseInstante(entrada): { valor: Date|null, motivo?: string }` de borda,
   tolerante, livre de locale: aceita ISO 8601 (com/sem fuso, com espaço no lugar do `T`),
   epoch em s, epoch em ms, objeto `Date`; tudo o mais → `null` + `motivo`. Helper `agoraUtc()`.
3. **Status canônico** — enums `StatusTransacaoCanonico` (8 valores) e `StatusContratoCanonico`
   (`ATIVO`/`EXPIRADO`/`CANCELADO`/`DESCONHECIDO`); funções puras `liberaAcesso` /
   `contaComoReceita` (tabela-verdade fixa na spec) e `contratoLiberaAcesso`; resolução de
   rede de segurança `paraStatusTransacaoCanonico(bruto)` → `DESCONHECIDO` + sinal de revisão.
4. **Base de auditoria** — contrato `EntidadeAuditavel` (`criadoEm`/`atualizadoEm` UTC) e a
   forma canônica `RegistroAuditoria` (`origem ∈ {CURADORIA, AJUSTE_MANUAL, MIGRACAO}`) +
   função pura `montarRegistroAuditoria(...)`. Nenhuma tabela — isso é das specs donas / 053.
5. **Config tipada (consolidação)** — `core` passa a ser o dono do contrato de configuração:
   re-exporta `AppConfig` / acessos tipados; ESLint proíbe `process.env` fora de
   `src/config/**`, `src/core/**` e `src/main.ts`; documentação de "como cada contexto lê
   config". Sem redesenho, sem chave nova, sem regressão da 001.

Abordagem: TypeScript puro, sem dependência npm nova (usa `bigint`, `Date`, RegExp nativos;
lista ISO 4217 embarcada como constante). Cobertura unitária exaustiva de casos de borda
(Jest, sem banco). Ao final: `docs/002-core-value-objects.md`, e atualização de `CLAUDE.md`,
`README.md`, `ROADMAP.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict); Node.js 24 LTS (`.nvmrc` + `engines`).

**Primary Dependencies**: **nenhuma nova.** Só recursos nativos — `BigInt`, `Date`, `RegExp`,
`Intl` não é usado (locale-free por design). `zod` já presente (config). NestJS 11 só para o
`CoreModule` já existente (barrel de export; nenhum provider novo).

**Storage**: N/A. Esta spec não toca Prisma nem Postgres. Nenhuma migração.

**Testing**: Jest + `ts-jest` (unit, já configurado em `backend/jest.config.ts`). Zero testes
e2e / zero banco. Alvo: 1 arquivo `*.spec.ts` por primitiva, ao lado do fonte. Cobertura dos
casos de borda enumerados na spec (SC-001..SC-009).

**Target Platform**: biblioteca interna do backend (consumida por `import` dos outros
contextos). Dev local (Windows + Linux) e CI Linux. Os testes devem passar idênticos sob
`TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo` (SC-004).

**Project Type**: Web application (monorepo npm workspaces). Esta fatia é 100% backend/`core`.

**Performance Goals**: N/A funcional. Operações são O(1) sobre `bigint`/string curtas.

**Constraints**:
- `float`/`number` fracionário **proibido** no caminho do valor de `Dinheiro` (verificável
  por lint/review — SC-003).
- `process.env` **proibido** fora de `src/config/**`, `src/core/**`, `src/main.ts` e
  `test/**` (nova regra ESLint — SC-009).
- `parseInstante` **livre de locale/timezone** da máquina (SC-004).
- Nenhuma porta nova; nenhum serviço novo (FR-037).
- Regra `import/no-restricted-paths` da 001 continua válida; `core` não importa de contexto
  nenhum.

**Scale/Scope**: ~10 arquivos de fonte novos em `backend/src/core/` + ~10 `*.spec.ts`;
0 migração; 0 endpoint; 1 doc novo; 3 docs atualizados; 1 regra ESLint nova.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: nenhuma entidade de negócio, nenhuma PK, nenhum ID de
      origem nesta spec. As primitivas são **pré-requisito** da modelagem de domínio (dinheiro,
      tempo, status), decididas "uma vez, no início" como o Princípio I e os Padrões
      Transversais exigem. `Moeda` = ISO 4217 validado, não string livre (identidade de moeda
      é conceito de negócio, não detalhe de origem).
- [x] **II. Clarificar antes de assumir**: 6 decisões do dono do produto resolvidas
      (`/speckit-specify` + `/speckit-clarify`, registradas em spec §Clarifications). Zero
      `NEEDS CLARIFICATION` aberto. Nenhum comportamento de negócio assumido — a tabela-verdade
      de `liberaAcesso`/`contaComoReceita` e o conjunto de `StatusContratoCanonico` foram
      confirmados.
- [x] **III. Bordas finas, núcleo canônico**: esta spec **é** o núcleo canônico. Nenhuma
      primitiva conhece "Guru"/"Asaas"/etc. `parseInstante` recusa formatos de planilha/locale
      de propósito — normalizá-los é da borda (adapter de CSV, specs 019–022/028). O mapa rico
      de status por plataforma é dos adapters; o `core` só tem a rede de segurança
      `paraStatusTransacaoCanonico → DESCONHECIDO`.
- [x] **IV. Log de eventos + projeções**: N/A — sem ingestão, sem pipeline, sem `evento_origem`
      (spec 006). `parseInstante` retorna resultado + motivo em vez de lançar, justamente para
      que uma data ruim num payload não derrube a ingestão (o chamador marca `REVISAR`).
      Nenhum `commit()`, nenhum estado mutável no ORM.
- [x] **V. Agregados derivados**: `Dinheiro` é o **escalar**, não o agregador. A spec proíbe
      explicitamente "helper de total" no `core` (FR-011) — somar lista / agrupar por moeda é
      `f(eventos)` nas specs de ledger/contrato/dashboard. `multiplicarPorEscalar` só aceita
      inteiro; rateio é `ratear` com resto determinístico (sem centavo perdido).
- [x] **VI. Contextos delimitados**: tudo vive em `backend/src/core/`. `CoreModule` é
      `@Global()` (única exceção à fronteira, já estabelecida na 001). Nenhum contexto de
      domínio é tocado. `core` não importa de `ingestao`/`financeiro`/… (lint garante).
- [x] **VII. Curadoria vs derivação**: `RegistroAuditoria` é o **contrato** que as specs de
      catálogo/contrato usarão para manter curadoria e derivação em trilhas separadas
      (colunas/tabelas distintas + precedência na leitura). Esta spec não implementa
      precedência — só padroniza o registro de "quem mudou o quê, quando, por quê".
- [x] **VIII. Superfície de escrita mínima**: zero endpoint (nenhum, nem read-only). Zero
      sincronização. A consolidação de config é refatoração + regra de lint + doc; não adiciona
      superfície.
- [x] **Padrões Transversais**:
      - **Dinheiro** ×10000, `bigint`, sem `float`, `moeda` obrigatória, soma só entre mesma
        moeda ✔ (FR-001..FR-011).
      - **Tempo** `timestamptz` UTC, parser de borda tolerante (ISO / epoch s / epoch ms /
        naive→UTC com motivo / lixo→null com motivo), nunca naive ✔ (FR-012..FR-018).
      - **Status** enum canônico rico; `libera_acesso()` / `conta_como_receita()` funções
        puras; desconhecido → `DESCONHECIDO` + revisão ✔ (FR-019..FR-024).
      - **Idempotência**: todas as funções são puras/determinísticas ✔.
      - **Auditoria** `criado_em`/`atualizado_em` em tudo (contrato `EntidadeAuditavel`);
        mudança curada/manual em forma canônica ✔ (FR-025..FR-028).
      - **Config/segredos** `.env` por conta, falha cedo, sem default silencioso — preservado
        da 001 e consolidado no `core` ✔ (FR-029..FR-032).
      - **Multi-conta** `plataforma_origem` — inalterado (enum já no `core` desde a 001).

**Resultado do gate: PASS.** Nenhuma violação. Complexity Tracking vazio.

*Re-check pós-Phase 1: **PASS** — o design (Phase 1) não introduziu dependência, endpoint,
entidade nem acoplamento entre contextos. Ver `data-model.md` e `contracts/`.*

## Project Structure

### Documentation (this feature)

```text
specs/002-core-value-objects/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões de representação/algoritmo (sem NEEDS CLARIFICATION)
├── data-model.md        # Phase 1 — as primitivas do core, campos e invariantes
├── quickstart.md        # Phase 1 — roteiro de validação (lint + typecheck + jest, sem banco)
├── contracts/
│   ├── dinheiro.md      # API pública de Dinheiro + Moeda + serialização
│   ├── tempo.md         # Contrato de parseInstante / agoraUtc
│   ├── status-canonico.md  # Enums + tabela-verdade de liberaAcesso/contaComoReceita
│   └── auditoria-e-config.md  # EntidadeAuditavel, RegistroAuditoria, contrato de config
├── checklists/
│   └── requirements.md  # Já criado no /speckit-specify (16/16)
└── tasks.md             # Phase 2 — /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
backend/
├── eslint.config.mjs                 # + regra no-process-env fora de config/core/main (FR-031)
└── src/
    └── core/
        ├── core.module.ts            # barrel: + re-exports de dinheiro/tempo/status/auditoria/config
        ├── dinheiro/
        │   ├── moeda.ts              # tipo Moeda (branded string) + ISO_4217 (Set) + ehMoeda/assertMoeda
        │   ├── moeda.spec.ts
        │   ├── dinheiro.ts           # class Dinheiro (bigint ×10000) — todas as operações
        │   ├── dinheiro.spec.ts
        │   ├── ratear.ts             # ratear(total, n) / ratearPorPesos(total, pesos[]) — maior resto
        │   └── ratear.spec.ts
        ├── tempo/
        │   ├── parse-instante.ts     # parseInstante(entrada) → { valor, motivo? }
        │   ├── parse-instante.spec.ts
        │   ├── agora.ts              # agoraUtc(): Date
        │   └── agora.spec.ts
        ├── status/
        │   ├── status-transacao.ts   # enum StatusTransacaoCanonico + STATUS_* helpers + funções puras
        │   ├── status-transacao.spec.ts
        │   ├── status-contrato.ts    # enum StatusContratoCanonico + contratoLiberaAcesso
        │   ├── status-contrato.spec.ts
        │   ├── resolver-status.ts    # paraStatusTransacaoCanonico(bruto) → { status, revisar }
        │   └── resolver-status.spec.ts
        ├── auditoria/
        │   ├── entidade-auditavel.ts # interface EntidadeAuditavel { criadoEm; atualizadoEm }
        │   ├── registro-auditoria.ts # OrigemMudanca enum + RegistroAuditoria + montarRegistroAuditoria()
        │   └── registro-auditoria.spec.ts
        ├── config/
        │   └── index.ts              # re-export tipado de AppConfig/accountConfig p/ os contextos
        ├── ids/                      # (inalterado — 001)
        └── plataforma-origem.enum.ts # (inalterado — 001)

docs/
└── 002-core-value-objects.md        # NOVO — API de cada primitiva, exemplos, trade-offs

CLAUDE.md   README.md   ROADMAP.md   # atualizados no fim da spec (FR-036)
```

**Structure Decision**: as primitivas ficam em subpastas temáticas de `backend/src/core/`
(`dinheiro/`, `tempo/`, `status/`, `auditoria/`, `config/`), no mesmo padrão de `ids/` da 001
(fonte + `*.spec.ts` colado). `core.module.ts` continua sendo o **único barrel** de export do
`core` — os contextos importam `from '../core/core.module'` (ou o alias definido), nunca de
subpaths internos. `src/config/` (schema zod + `ConfigModule`) **não se move** — o `core`
apenas passa a re-exportar seu contrato tipado e a documentação passa a tratá-lo como parte do
`core`; assim não há churn nem risco de regressão no boot (FR-032).

## Complexity Tracking

Sem violações de constituição. Tabela não aplicável.
