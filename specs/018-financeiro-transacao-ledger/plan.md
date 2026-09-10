# Implementation Plan: Ledger de transações do Financeiro — `transacao` + pipeline etapas 2–3

**Branch**: `018-financeiro-transacao-ledger` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-financeiro-transacao-ledger/spec.md`

## Summary

Primeira fatia da **Fase 2 — Financeiro**. O _bounded context_ `financeiro` (vazio desde a
001) passa a ser dono de **`transacao`** — a projeção normalizada de um evento financeiro,
1 linha por `(plataforma_origem, id_origem)` (Regra Inviolável nº 1), com valores como
`Dinheiro` do `core`, `status_canonico`, `classificacao` e FKs opcionais para pessoa/oferta/
contrato/transação-vinculada (só `pessoa` com FK ativa nesta spec).

Pluga as **etapas 2 e 3** do pipeline canônico da 006 (que já deixou o gancho: `especDona:
18` em `etapas.ts`, etapas 2–6 `pulada`): `RESOLVER_PESSOA` (reusa a engine da 005 pela
`PortaIdentidade` do `core`) e `UPSERT_TRANSACAO` (grava/atualiza `transacao`, devolve
`ResultadoIngestao{transacao, foi_criada, campos_alterados}`). A ligação `ingestao ↔
financeiro` é feita por um **contrato de executor externo no `core`** (`core/pipeline/`) +
um `@Global() FinanceiroWiringModule` — nenhum dos dois contextos importa o outro. Etapas
4–6 seguem `pulada` (specs 023/024/025).

Leitura: `GET /financeiro/transacoes` (filtros: conta, status, classificação, "pago de
fato", pessoa, revisão, período, `q`) + `GET /financeiro/transacoes/{id}`. Frontend:
**Financeiro · Transações** (lista + detalhe) no padrão de `frontend/src/eventos/`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11, Prisma `^6` + `@prisma/client` (1 model novo, 1 enum
  de banco novo). `zod` 3 nos DTOs de query. Do `core`: `Dinheiro`/`Moeda`
  (`deInteiroEscalado`, `serializar`), `parseInstante`, `StatusTransacaoCanonico` +
  `contaComoReceita` + `paraStatusTransacaoCanonico`, `EntidadeId`, `agoraUtc`,
  `PORTA_IDENTIDADE`/`PortaIdentidade` (008). **Contrato novo no `core`**:
  `core/pipeline/` (`EventoCanonico` **movido** para cá + `ExecutorEtapaExterno` +
  `EXECUTORES_ETAPA_EXTERNOS`).
- Frontend: **nenhuma nova**. React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch`, `usePermissoesEfetivas` + `RequirePermissao`/`requerPermissao` (004).

**Storage**: **PostgreSQL 16 via Prisma** — **16ª migração de negócio**
(`<ts>_financeiro_transacao`), a **1ª do `financeiro`**. 1 tabela (`transacao`) + 1 enum
(`StatusTransacaoCanonico`, 8 valores, espelha o enum TS do `core` — paridade travada por
teste). Back-relations `Pessoa.transacoes` / `EventoOrigem.transacoes` são só schema
(precedente 008/009). **0 `CHECK`, 0 índice parcial, 0 tabela de auditoria** (não há escrita
manual — D-08).

**Testing**:
- Backend unit (`jest`, sem banco), `backend/src/financeiro/domain/`:
  - `status-map.spec.ts` — `mapearStatus`: valor canônico exato → sem revisão; mapa vazio +
    bruto desconhecido → `DESCONHECIDO`+revisar+motivo; **paridade** dos 8 valores do enum
    Prisma × enum `core`.
  - `dados-transacao.spec.ts` — extração de `DadosTransacaoNormalizada` do `EventoCanonico`
    (valores por moeda, quantidade, recorrência, códigos de oferta crus); ausência de
    `valores`/`oferta` → campos `null`, sem lançar.
  - `diff-campos.spec.ts` — `camposAlterados(anterior, novo)`: só os campos que mudaram;
    `Dinheiro` compara `valorInt`+`moeda`; `ocorridoEm` compara instante; sem anterior
    (criação) → lista dos campos preenchidos; nada mudou → `[]`.
  - `deve-criar-pessoa.spec.ts` — `deveCriarPessoa(classificacao)`: `false` só para
    `VENDA_AFILIADA`; `true` para as demais; valor desconhecido → `true` (permissivo — a
    afiliada é o único caso proibido pela Regra nº 8).
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` roda `migrate
  deploy` + `db seed`; worker de ingestão **desligado** — testes disparam
  `POST /ingestao/eventos/processar`):
  - migração cria `transacao` + o enum; `@@unique(plataforma_origem,id_origem)` recusa a 2ª
    linha.
  - **US1**: `POST /ingestao/eventos` (venda própria) → `processar` → `GET
    /financeiro/transacoes` tem 1 linha normalizada; etapa 3 do evento `ok`,
    `resultado.foi_criada = true`. 2º evento p/ a mesma chave com valor diferente → mesma
    linha, `campos_alterados = ["valorBruto"]`, `foi_criada = false`.
  - **US2**: 2 eventos de contas diferentes, mesmo e-mail → 1 `pessoa`, 2 transações
    apontando p/ ela; `pessoa_origem_ref` com 1 ref por conta. Afiliada + comprador
    desconhecido → `pessoaId = null`, `count(pessoa)` inalterado. Afiliada + comprador
    existente → transação liga à `pessoa`, sem oferta/contrato.
  - **US3**: filtros `plataformaOrigem`, `statusCanonico`, `pagoDeFato=true`
    (bate `contaComoReceita`), `pessoaId`, `precisaRevisao`, período; paginação (teto 100);
    `GET /{id}` traz valores por moeda + `pessoa` resumida + `eventoOrigemId`; `{id}`
    inexistente → 404.
  - **US4**: `statusOrigem = "aprovado_x"` → `DESCONHECIDO` + `precisa_revisao` +
    `evento_origem.status = revisar`. `statusOrigem = "PAGO"` → `PAGO`, sem revisão.
    `ocorridoEm` lixo → `ocorrido_em = null` + revisão, transação gravada.
  - **Idempotência**: `POST /ingestao/eventos/{id}/reprocessar` → 0 transação/pessoa
    duplicada, `campos_alterados = []`.
  - **Concorrência**: 2 `processar` concorrentes sobre o mesmo evento → 0 efeito duplicado
    (mutex da 006 + `@@unique`).
  - **Guard**: rotas de transação sem token → 401; autenticado sem `transacao:ver` → 403;
    credencial de serviço → 2xx.
  - **Catálogo/efetivas**: `GET /admin/rbac/permissoes` inclui `transacao:ver`;
    `GET /auth/permissoes-efetivas` (serviço) inclui.
  - **Etapas 4–6**: seguem `pulada` com `implementadaNa` 24/23/25; nada em oferta/contrato.
  - **Regressão**: suíte 003–017 + `/health` (11 contextos) verdes.
- Frontend (`vitest` + Testing Library, jsdom): lista renderiza colunas + aplica filtro de
  status (muda o querystring); detalhe mostra valores por moeda e link "ver evento";
  item de nav e rotas atrás de `transacao:ver` (sem permissão → não aparece / `RequirePermissao`
  bloqueia).

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (portas já em
uso por outra sessão — **não subir servidor extra**). Os e2e usam `TEST_DATABASE_URL` +
schema isolado; nesta spec, contra um **Postgres isolado próprio** (container dedicado,
porta livre — 55432/55433 ocupadas). Dev Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta nova. `GET /financeiro/transacoes` paginado (default 25,
teto 100), 1 query + 1 `count`, índices comuns cobrindo os filtros. O executor de
`UPSERT_TRANSACAO` faz 1 `SELECT` (linha anterior) + 1 `upsert` por evento.

**Constraints**:
- **Nenhuma porta nova** (3001/5174/55432 do projeto).
- **Fronteira de contexto** (Princípio VI): `src/financeiro` importa **só** `core`; `src/ingestao`
  não importa `financeiro`. ESLint `import/no-restricted-paths` + `grep` no e2e cobrem os dois
  sentidos. `EventoCanonico` migra para `core/pipeline/` (é contrato compartilhado, não código
  de contexto).
- **Log de eventos + projeções** (Princípio IV): `transacao` é 100% derivada do `evento_origem`
  imutável; o executor não faz `commit()` de remendo (o worker já commita por etapa);
  `campos_alterados` é **resultado explícito** em `evento_etapa.resultado`, nunca atributo
  mutável no ORM (corrige a gambiarra 4.9/4.10).
- **Agregado derivado** (Princípio V): nada de contador. `pagoDeFato` no filtro deriva de
  `contaComoReceita` do `core` (lista computada), não de string hard-coded no SQL. Receita
  agregada não entra nesta spec.
- **Dinheiro** (Padrão Transversal): 4 pares `(bigint ×10000, char(3))`; reidratado via
  `Dinheiro.deInteiroEscalado`; serializado como `{ valorInt: string, moeda }`; **nunca
  `float`** (SC-006).
- **Tempo**: `ocorrido_em` via `parseInstante`; lixo → `null` + `precisa_revisao`. Todos os
  timestamps `@db.Timestamptz(6)` UTC.
- **Status** (Padrão Transversal / Regra nº 15): `mapearStatus` só faz _match_ exato +
  consulta o mapa da fonte (vazio na 018); qualquer outra coisa → `DESCONHECIDO` + revisão.
  Nunca "chuta" um status que libera acesso.
- **Superfície de escrita mínima** (Princípio VIII): **0 endpoint de escrita**. `transacao`
  só é escrita pelo pipeline. RBAC: **+1** permissão de leitura (`transacao:ver`).
- **Afiliada** (Regra nº 8): `RESOLVER_PESSOA` com `criar: false` p/ `VENDA_AFILIADA` —
  nunca cria `pessoa`; a transação grava `eh_afiliada = true`, sem oferta/contrato.
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~24 arquivos novos no backend (`core/pipeline/**`,
`src/financeiro/{domain,application,infra,dto}/**`, `transacao.controller.ts`,
`financeiro.module.ts` reescrito, `financeiro-wiring.module.ts`,
`prisma/migrations/<ts>_financeiro_transacao/`, `test/financeiro-transacao.e2e-spec.ts` +
`test/support/financeiro.ts`), ~5 editados (`schema.prisma`, `src/auth/rbac/catalogo.ts`,
`src/core/core.module.ts`, `src/ingestao/application/worker.service.ts` +
`src/ingestao/domain/{evento-canonico.ts,tipos.ts,index.ts}` re-export/`ctx`,
`src/app.module.ts`), ~9 no frontend (`src/transacoes/**` + testes, `shell/nav-items.ts`,
`app/router.tsx`). **0 dep nova**, **1 migração**, **~2 endpoints**, 1 doc novo, 3 docs
atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: `transacao` nasce com **ID surrogate UUID v7** na app.
      `id_origem` é **coluna comum, nunca PK**; a identidade natural é
      `(plataforma_origem, id_origem)` num `@@unique`. `plataforma_origem` (enum 7) é
      dimensão de 1ª classe (coluna + índice). Granularidade documentada em `data-model.md`:
      1 `transacao` por PK; a identidade `(plataforma, id_origem)` é imutável, os campos
      normalizados são atualizáveis por re-sync. Os aliases de oferta (`oferta_codigo_origem`,
      `oferta_nome_origem`) ficam como **texto cru** para a spec 023 resolver via
      `oferta_origem_ref` — nunca viram PK/FK aqui.
- [x] **II. Clarificar antes de assumir**: 018 não está `⚠ clarify` no ROADMAP. 8 decisões
      (D-01..D-08) resolvidas como defaults documentados (spec §Clarifications + research.md).
      **Zero `NEEDS CLARIFICATION`.** O que depende de spec futura (status-map real → 019–022;
      vínculo → 024; oferta → 023; contrato/receita → 025) está em §Assumptions, com as
      colunas/ganchos já preparados (sem antecipar comportamento).
- [x] **III. Bordas finas, núcleo canônico**: nenhum código do `financeiro` conhece
      "Guru"/"Asaas"/"TMB"/"Hotmart" — só o **valor do enum** `PlataformaOrigem` e o rótulo
      livre `tipo_origem` que vem do `EventoCanonico`. `mapearStatus` **não** traduz
      vocabulário por conta própria: só _match_ exato + o mapa da fonte, **versionado por
      fonte** (`financeiro/domain/status-map/{plataforma}.ts`), vazio nesta spec e populado
      pelos PRs das specs 019–022. O adapter (borda) é dono da extração crua; o `financeiro`
      é dono da tradução canônica (justificado no gate — Apêndice C sugeria sob adapters, mas
      `financeiro` é dono de `status_canonico` e não pode importar `ingestao`).
- [x] **IV. Log de eventos + projeções**: `evento_origem` (imutável, spec 006) segue a fonte
      de verdade; `transacao` é projeção reconstruível. As etapas 2–3 rodam **cada uma em
      transação própria** (o worker da 006 já garante), idempotentes, com **resultado
      explícito** (`{ pessoaId, criada }` / `{ transacaoId, foi_criada, campos_alterados }`)
      gravado em `evento_etapa.resultado`. **Nenhum `_houve_mudanca` no ORM, nenhum
      `commit()` de remendo** (corrige 4.9/4.10). Reprocessar re-deriva do `payload_bruto`.
- [x] **V. Agregados derivados**: nesta fatia não há agregado (receita é spec 024/025).
      `campos_alterados` é um _diff_ calculado, não um contador. O filtro `pagoDeFato` deriva
      de `STATUS_TRANSACAO_CANONICO.filter(contaComoReceita)` do `core`. Dinheiro por par
      `(valorInt, moeda)` — nunca soma moedas (não há soma aqui).
- [x] **VI. Contextos delimitados — observar, não escrever**: `financeiro` **observa** o
      `evento_origem` (via o executor que o worker chama) e escreve **só** na própria
      `transacao`. Não toca `evento_origem`/`evento_etapa` (o worker os grava), não toca
      `pessoa` diretamente (delega à `PortaIdentidade` da 005), não toca
      `oferta`/`contrato`/`vinculo` (nem existem). `ingestao` não importa `financeiro` — o
      `WorkerService` consome só o token do `core`. `financeiro` não importa
      `ingestao`/`clientes`.
- [x] **VII. Curadoria vs derivação**: `transacao` é 100% derivada nesta spec — **não há
      campo curado** (o ajuste manual é spec 024/025, com tabela `_audit` própria então).
      Nenhum vínculo é auto-revertido: `transacao_vinculada_id` nem é populado aqui.
- [x] **VIII. Superfície de escrita mínima**: **0 endpoint de escrita** de `transacao`.
      Só `GET`. A escrita acontece pelo pipeline (sem sujeito HTTP). Nenhuma sincronização
      automática com API externa (não há adapter). +1 permissão de **leitura**
      (`transacao:ver`), justificada como a superfície de consumo mínima da fatia.
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para `transacao`.
      - **Dinheiro**: 4 pares `bigint ×10000 + char(3)`; `float` proibido; serialização
        `{ valorInt: string, moeda }`.
      - **Tempo**: `@db.Timestamptz(6)` UTC; `ocorrido_em` via `parseInstante` (lixo →
        `null` + `precisa_revisao`).
      - **Status**: enum de banco `StatusTransacaoCanonico` espelha o do `core` (paridade
        testada); desconhecido → `DESCONHECIDO` + `precisa_revisao` + `evento_origem.status
        = revisar`.
      - **Idempotência**: `@@unique(plataforma_origem, id_origem)`; `resolverOuCriar` (005)
        idempotente; reprocessar → `campos_alterados = []`.
      - **Auditoria**: `criado_em`/`atualizado_em` em `transacao`. **Sem tabela `_audit`** —
        não há mudança curada/manual nesta fatia; o rastro é `evento_origem` + `evento_etapa`.
      - **Erros de ingestão**: as etapas 2–3 seguem o modelo da 006 (`evento_etapa.status`
        + `erro_detalhe`; retry até `INGESTAO_WORKER_MAX_TENTATIVAS`); `evento_origem.status`
        derivado inclui `revisar` quando a transação precisa de revisão.
      - **Config/segredos**: **nenhuma chave `.env` nova**.
      - **Multi-conta**: `plataforma_origem` em toda query e no `@@unique`/índice.
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.** 1 ponto fora do padrão trivial — mover `EventoCanonico` para o
`core` e o contrato `ExecutorEtapaExterno` — registrado em Complexity Tracking como escolha
deliberada (não é violação: é a materialização do Princípio VI para o ponto de extensão que
a própria spec 006 previu).

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma `@@unique` natural + FKs opcionais
sem relação ativa; `contracts/pipeline-executor.md` confirma que o `WorkerService` só ganha
`@Optional() @Inject` (aditivo) e o `financeiro` fala só dados planos; `contracts/transacao-http.md`
confirma leitura-só + serialização `Dinheiro`; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/018-financeiro-transacao-ledger/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── transacao-http.md
│   ├── pipeline-executor.md
│   └── rbac-catalogo.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── core/
│   │   ├── pipeline/
│   │   │   ├── evento-canonico.ts        # MOVIDO de ingestao/domain (schema zod + tipo)
│   │   │   └── executor-externo.ts       # ExecutorEtapaExterno + EXECUTORES_ETAPA_EXTERNOS
│   │   └── core.module.ts                # editado — re-exporta core/pipeline/*
│   ├── ingestao/
│   │   ├── domain/
│   │   │   ├── evento-canonico.ts        # editado — vira `export * from core/pipeline/...`
│   │   │   ├── tipos.ts                  # editado — EtapaCtx ganha plataformaOrigem/idOrigem opcionais
│   │   │   └── index.ts                  # inalterado (re-export segue funcionando)
│   │   └── application/
│   │       ├── worker.service.ts         # editado — @Optional() inject + criarWrapper + ctx enriquecido
│   │       └── executor-externo.wrapper.ts  # NOVO — adapta EtapaCtx -> EntradaEtapaExterna
│   ├── financeiro/
│   │   ├── domain/
│   │   │   ├── status-map/
│   │   │   │   ├── index.ts              # MAPAS_STATUS (vazio) + mapearStatus(...)
│   │   │   │   └── README.md             # como as specs 019–022 populam
│   │   │   ├── dados-transacao.ts        # EventoCanonico -> DadosTransacaoNormalizada (puro)
│   │   │   ├── diff-campos.ts            # camposAlterados(anterior, novo) (puro)
│   │   │   ├── deve-criar-pessoa.ts      # deveCriarPessoa(classificacao) (puro)
│   │   │   └── index.ts
│   │   ├── application/
│   │   │   ├── resolver-pessoa-etapa.service.ts   # ExecutorEtapaExterno p/ RESOLVER_PESSOA
│   │   │   ├── upsert-transacao-etapa.service.ts  # ExecutorEtapaExterno p/ UPSERT_TRANSACAO
│   │   │   ├── transacao-query.service.ts         # lista + detalhe
│   │   │   └── index.ts
│   │   ├── infra/
│   │   │   └── transacao.repository.ts   # upsert por chave natural + leitura
│   │   ├── dto/
│   │   │   └── listar-transacoes.schema.ts
│   │   ├── transacao.controller.ts       # GET /financeiro/transacoes[/:id]
│   │   ├── financeiro.module.ts          # reescrito — providers + controller
│   │   └── financeiro-wiring.module.ts   # @Global() — registra os 2 executores no token multi
│   ├── auth/rbac/catalogo.ts             # editado — +transacao:ver
│   └── app.module.ts                     # editado — importa FinanceiroWiringModule
├── prisma/
│   ├── schema.prisma                     # editado — model Transacao + enum StatusTransacaoCanonico + back-relations
│   └── migrations/<ts>_financeiro_transacao/migration.sql
└── test/
    ├── financeiro-transacao.e2e-spec.ts
    └── support/financeiro.ts             # helper: monta EventoCanonico + ingere + processa

frontend/
├── src/
│   ├── transacoes/
│   │   ├── transacoes-api.ts             # tipos + apiFetch
│   │   ├── TransacoesListPage.tsx        # filtros + paginação
│   │   ├── TransacoesListPage.test.tsx
│   │   ├── TransacaoDetailPage.tsx       # campos + valores por moeda + link p/ evento
│   │   └── TransacaoDetailPage.test.tsx
│   ├── shell/nav-items.ts               # editado — Financeiro · Transações
│   └── app/router.tsx                    # editado — /financeiro/transacoes[/:id]
```

**Structure Decision**: Web application (Option 2), já em uso desde a 001. Novo _bounded
context_ preenchido em `backend/src/financeiro/` com a divisão `domain/`·`application/`·
`infra/`·`dto/` das specs 005/006/010. `core/pipeline/` é a única adição ao `core` (contrato
compartilhado). Frontend ganha `src/transacoes/` como módulo de tela, espelhando
`src/eventos/`.

## Complexity Tracking

| Ponto fora do trivial | Por que é necessário | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Mover `EventoCanonico` para `core/pipeline/` | O contrato é lido pelo `ingestao` (etapa 0/1) **e** pelo `financeiro` (etapa 2/3); a fronteira do Princípio VI proíbe `financeiro` de importar `ingestao/domain`. | Manter em `ingestao/domain` e o `financeiro` ter uma cópia do schema zod → duas fontes de verdade do contrato canônico, divergem em silêncio. |
| Contrato `ExecutorEtapaExterno` + token multi no `core` | É o ponto de extensão que a **spec 006 já previu** (`especDona: 18/23/24/25`, "pluga a etapa real sem tocar o worker"). Multi-provider → specs 023–025 acrescentam sem re-tocar o `WorkerService`. | `WorkerService.definirExecutor` chamado de um wiring no `AppModule` → os executores do `financeiro` ainda precisariam do tipo `EtapaCtx` (de `ingestao`) → violação ESLint. |
| `worker.service.ts` editado (1 arquivo do `ingestao`) | Adicionar `@Optional() @Inject(EXECUTORES_ETAPA_EXTERNOS)` + registrar _wrappers_ + enriquecer `ctx` com `plataformaOrigem`/`idOrigem`. Mudança **aditiva**, coberta pelos e2e de regressão da 006. | Não editar o worker → impossível: alguém tem que ler o token e registrar os executores; qualquer outro lugar seria mais indireto e menos testável. |
