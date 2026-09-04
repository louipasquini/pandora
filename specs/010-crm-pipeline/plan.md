# Implementation Plan: Pipeline de Vendas do CRM — pipelines, oportunidades, atribuição e SLA

**Branch**: `010-crm-pipeline` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-crm-pipeline/spec.md`

## Summary

Quarta fatia da Fase 1 (CRM), visão Parte 8.7. Adiciona ao bounded context `crm` (já
não-vazio desde 007/008/009): `pipeline` (funil configurável), `etapa_pipeline` (etapas
ordenadas com tipo `ABERTA`\|`GANHA`\|`PERDIDA` e SLA opcional), `oportunidade` (âncora
polimórfica `pessoa`\|`lead`, mesmo padrão XOR da `interacao`), `oportunidade_movimentacao`
(histórico de 1ª classe de mudança de etapa), `regra_atribuicao_pipeline` (atribuição
automática round-robin/regra simples reusando `equipe`/`equipe_membro` da 007),
`campo_personalizado_oportunidade`/`valor_campo_oportunidade` (mesmo padrão da 008), e a
porta in-process `PortaObservacaoPagamentoCrm` (sem gatilho real — Financeiro ainda não
existe, D-02 da spec). SLA estourado e "esfriando" (reusa `interacao` da 009) são campos
**derivados** na leitura — sem contador persistido, sem job de notificação. Frontend: board
Kanban por pipeline com drag-and-drop.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11, Prisma `^6` + `@prisma/client` (6 models novos,
  4 enums novos), `zod` 3 (DTOs + validação de filtro/regra). `EntidadeId`, `agoraUtc`,
  `Dinheiro`/`Moeda`, `montarRegistroAuditoria` vêm do `core` — **1ª spec a persistir
  `Dinheiro` em coluna** (`valor_estimado_int bigint` + `valor_estimado_moeda char(3)`,
  reidratado via `Dinheiro.deInteiroEscalado`). `EquipeMembroService`/consulta de membros
  ativos (007) e a leitura de `Interacao` mais recente por âncora (009) são reusadas **por
  composição de serviço dentro do próprio `crm`** — sem cruzar bounded context.
- Frontend: **nenhuma nova** — `@hello-pangea/dnd` **avaliado e rejeitado** para o MVP do
  board (ver `research.md`); drag-and-drop nativo HTML5 (`draggable` + eventos `dragstart`/
  `dragover`/`drop`) é suficiente para colunas por etapa e evita dependência nova. React 19,
  `react-router` 7, `@tanstack/react-query` 5, `apiFetch`, `usePermissoesEfetivas` +
  `RequirePermissao` (004).

**Storage**: **PostgreSQL 16 via Prisma** — 8ª migração de negócio (após `_rbac`,
`_clientes` ×2, `_ingestao`, `_crm_admin` ×2, `_crm_lead`, `_crm_interacao`). 6 tabelas
novas: `pipeline`, `etapa_pipeline`, `oportunidade`, `oportunidade_movimentacao`,
`regra_atribuicao_pipeline`, `campo_personalizado_oportunidade`, `valor_campo_oportunidade`,
`crm_pipeline_audit` (8 no total). `CHECK`s via SQL bruto na própria migração (mesmo padrão
da 007/009): âncora XOR de `oportunidade`, `etapa_pipeline.ordem` único por pipeline,
`hora`-like validações não se aplicam aqui. Sem porta nova.

**Testing**:
- Backend unit (`jest`, sem banco), `backend/src/crm/domain/pipeline/`:
  - `ancora.spec.ts` — pessoa xor lead (reusa o mesmo formato de validação da 009).
  - `sla.spec.ts` — `slaEstourado` puro: `null` sempre `false`; limite exato não estourado
    (`<=`); um segundo depois → `true`.
  - `esfriando.spec.ts` — puro: sem `diasEsfriando` → sempre `false`; sem interação usa
    `criadoEm`; com interação recente → `false`.
  - `atribuicao.spec.ts` — round robin determinístico (ordem por `entrouEm`, pula inativo,
    lista vazia → `null`); avaliação de regra em ordem, 1ª casa vence, sem match cai no
    fallback, `fallback: null` → `null`.
  - `movimentacao.spec.ts` — motivo obrigatório só ao entrar em etapa `PERDIDA`; no-op na
    mesma etapa; etapa de outro pipeline → erro.
  - `metricas.spec.ts` — soma por moeda sem misturar; `taxaConversao` `null` sem
    denominador.
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` já roda
  `migrate deploy` + `db seed`):
  - migração cria as 8 tabelas + 4 enums; `CHECK` de âncora recusa insert inválido.
  - **Pipeline/etapa**: CRUD sob `crm_admin:gerir_pipelines`; `DELETE` de etapa em uso →
    409; `POST /crm/oportunidades` em pipeline sem etapa `ABERTA` → 422.
  - **Oportunidade**: criação com âncora XOR; nasce na etapa de menor `ordem` `ABERTA`; 1ª
    `oportunidade_movimentacao`; `PATCH` não aceita `etapaId`/`pipelineId`.
  - **Mover**: destino de outro pipeline → 422; `PERDIDA` sem motivo → 422; com motivo →
    sucede; mesma etapa → no-op (sem nova movimentação); reabertura de `PERDIDA` → sucede
    sem motivo.
  - **Escopo**: `ver_proprias` filtra por `responsavelId` no `where`; fora do escopo → 404;
    credencial de serviço equivale a `ver_todas`.
  - **Atribuição**: round robin distribui em ordem entre membros ativos, pula inativo,
    equipe sem membro ativo → sem responsável (nunca erro); regra casa → responsável da
    regra; sem match → fallback; `responsavelId` explícito sempre vence.
  - **SLA/esfriando**: `GET` inclui os 2 campos recalculados; filtro combinado
    `slaEstourado=true&esfriando=true` aplica E lógico dentro do escopo de visão.
  - **Campos personalizados**: mesmo contrato de validação por tipo da 008; `PUT`
    substituição total; valor fora de `opcoes` → 422.
  - **Métricas**: soma por etapa/moeda; `taxaConversao` correto; pipeline vazio → zerado,
    `null`, nunca erro.
  - **Porta `PortaObservacaoPagamentoCrm`**: teste de integração direto no provider (sem
    endpoint HTTP) — move oportunidade `ABERTA` para 1ª etapa `GANHA`; idempotente; sem
    oportunidade `ABERTA` → no-op; nunca toca tabela de Contrato (não existe ainda).
  - **Guard**: cada rota nova sem token → 401; sem permissão → 403; credencial de serviço
    → 2xx.
  - **Catálogo/efetivas**: `GET /admin/rbac/permissoes` inclui as 6 novas.
  - **Regressão**: suíte 003–009 + `/health` (11 contextos) verdes.
- Frontend (`vitest` + Testing Library, jsdom): board renderiza colunas por etapa; arrastar
  chama `mover`; soltar em etapa `PERDIDA` sem preencher motivo no modal → não move;
  indicadores de SLA/esfriando visíveis; sem `oportunidade:mover` → sem *drag handle*; telas
  de administração atrás de `crm_admin:gerir_pipelines`.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (portas já em
uso por outra sessão neste ambiente — não subir servidor extra nessas portas durante o
desenvolvimento; testes usam `TEST_DATABASE_URL`/schema isolado, sem depender de servidor
rodando). Dev Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta funcional nova. `GET /crm/oportunidades` paginado (default
25, teto 100); métricas são 1 query agregada por pipeline (`groupBy` do Prisma), sem N+1;
cálculo de "esfriando" busca só a interação mais recente por âncora (`take: 1`, índice já
existe em `interacao(pessoaId, ocorridoEm)`/`(leadId, ocorridoEm)` da 009).

**Constraints**:
- **Nenhuma porta nova** (3001/5174/55432 do próprio projeto).
- **Contextos delimitados** (Princípio VI): `crm` continua sem importar `clientes`/
  `financeiro` (financeiro nem existe ainda). FKs de `oportunidade` para `Pessoa`/`Lead` são
  só `schema.prisma` (mesmo precedente da 008/009) — nenhum contrato novo no `core`.
  `PortaObservacaoPagamentoCrm` é definida e implementada **dentro do `crm`** (não é uma
  porta *consumida* de outro contexto — é uma porta *exposta* pelo `crm` para um consumidor
  futuro chamar; por isso não entra no `core`, mesmo padrão de "porta in-process exportada"
  já usado por `RegistrarInteracaoService`/`RegistrarLeadService`).
- **Agregado derivado** (Princípio V / regra 8.2.2): `slaEstourado`, `esfriando` e toda
  métrica de `GET .../metricas` são `f(estado atual) → valor`, nunca contador persistido.
  `oportunidade_movimentacao` é fato/evento (uma linha = uma transição real), não uma
  métrica incremental — não conflita com o princípio (mesmo raciocínio do `tag_associacao`
  na 009).
- **Regra 8.2.3 da visão (D-02)**: "ganho"/"perdido" é só estado do processo comercial —
  não cria, edita nem lê nenhuma tabela de Contrato (que não existe ainda). A porta de
  observação é escrita e testada isoladamente, sem endpoint HTTP e sem consumidor real
  nesta spec.
- **Dinheiro** (Padrão Transversal): `valorEstimado` usa `Dinheiro` do `core`, escala
  ×10000, `bigint`, moeda obrigatória; métricas somam **só dentro da mesma moeda**
  (`groupBy` por `[etapaId, moeda]`).
- **Escopo de visão**: `oportunidade:ver_todas`\|`ver_proprias` filtra no `where` (nunca na
  serialização), mesmo padrão de `lead` (008); `pipeline`/`etapa` são configuração
  administrativa (leitura já coberta por qualquer permissão de `oportunidade`, escrita por
  `crm_admin:gerir_pipelines`).
- **Auditoria** (Padrão Transversal): `crm_pipeline_audit` nova cobre escrita
  administrativa + edição de campos não-etapa de oportunidade; mudança de etapa audita via
  `oportunidade_movimentacao` (não duplica em `crm_pipeline_audit`).
- **RBAC 004**: cada endpoint sob `@RequerPermissao`/`@AutenticadoBasta`; +6 permissões
  (`oportunidade:{criar,editar,mover,ver_todas,ver_proprias}` + `crm_admin:gerir_pipelines`);
  403 ≠ 401.
- **Superfície de escrita mínima** (Princípio VIII): endpoints cobrem só o que a visão 8.7
  pede nesta fatia — sem antecipar Workflow (014), Dashboard (017) ou WhatsApp (011). Sem
  `DELETE` físico de `oportunidade`/`pipeline` (só `ativo=false`); `etapa` só remove se sem
  uso (409 caso contrário).
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~34 arquivos novos no backend
(`src/crm/{domain,application,infra,dto}/pipeline/**`, `pipeline.controller.ts`,
`etapa-pipeline.controller.ts`, `oportunidade.controller.ts`, `campo-oportunidade.
controller.ts`, `crm.module.ts` estendido, `prisma/migrations/<ts>_crm_pipeline/`,
`test/crm-pipeline.e2e-spec.ts` + `test/support/crm-pipeline.ts`), ~3 arquivos editados
(`schema.prisma`, `src/auth/rbac/catalogo.ts`, `crm.module.ts`), ~11 no frontend
(`src/pipelines/**` + testes, `nav-items.ts`, `router.tsx`), **0 dep nova**, **1 migração**,
**~26 endpoints** (10 leitura + ~16 escrita), 1 doc novo, 3 docs atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 8 tabelas nascem com **ID surrogate UUID v7** gerado na
      app. Nenhuma vem de plataforma de origem — sem `plataforma_origem`/`*_origem_ref`
      aqui. FKs para `usuario`/`pessoa`/`lead`/`equipe` referenciam PKs UUID, nunca id
      externo. Granularidade documentada em `data-model.md`: 1 `pipeline` por PK; N `etapa_
      pipeline` por pipeline (`ordem` única); 1 `oportunidade` por PK (âncora XOR); N
      `oportunidade_movimentacao` por oportunidade (append-only); N `regra_atribuicao_
      pipeline` por pipeline (ordenadas).
- [x] **II. Clarificar antes de assumir**: 6 decisões (D-01..D-06) resolvidas como defaults
      documentados na própria spec (não marcada `⚠ clarify` no ROADMAP, diferente de
      011/012) — spec §Clarifications. **Zero `NEEDS CLARIFICATION`.** O que depende de
      outra spec (gatilho real da porta de pagamento → Financeiro 018+/Workflow 014; motor
      de regra composta → 014; export em arquivo → 017; notificação push → 011/033) está em
      §Assumptions.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não há ingestão de
      plataforma nesta spec. Nenhum código conhece "Guru"/"Asaas"/etc.
- [x] **IV. Log de eventos + projeções**: **N/A parcial** — não é pipeline de ingestão, mas
      `oportunidade_movimentacao` segue o mesmo espírito de "log imutável + estado
      derivado": a etapa atual da oportunidade é reconstruível a partir do histórico
      (`etapa_id` denormalizado é uma *view* da última movimentação, nunca a única fonte —
      ver `data-model.md`).
- [x] **V. Agregados derivados**: `slaEstourado`/`esfriando`/métricas são **sempre** `f(etapa
      atual, histórico, interação) → valor`, nunca persistidos/incrementados (SC-003).
      Dinheiro por `dict[moeda, valor]` nas métricas — nunca soma entre moedas (SC-005).
- [x] **VI. Contextos delimitados — observar, não escrever**: `crm` continua **sem**
      importar `clientes`. `PortaObservacaoPagamentoCrm` é a peça que, quando um consumidor
      futuro (Financeiro/Workflow) chamar, faz o `crm` **observar** um pagamento — nunca
      escreve em Contrato (que é de outro contexto e nem existe ainda). "Ganho"/"perdido" é
      só estado comercial do CRM — regra 8.2.3 confirmada em D-02/FR-023.
- [x] **VII. Curadoria vs derivação**: `oportunidade.responsavelId`/`valorEstimado`/`título`
      são dados curados (edição manual); `slaEstourado`/`esfriando`/métricas são sempre
      derivados — nunca uma coluna que possa divergir do estado real. Etapa atual nunca é
      "auto-revertida" — só muda por `mover` explícito (ou pela porta, auditada).
- [x] **VIII. Superfície de escrita mínima**: ~16 endpoints de escrita cobrem exatamente o
      que a visão 8.7 pede nesta fatia. **Nenhuma** sincronização automática externa — a
      porta é in-process e passiva. `DELETE` físico só em `etapa_pipeline` sem uso e em
      `regra_atribuicao_pipeline` (substituição total via `PUT`); demais entidades usam
      `ativo`/estado terminal. Cada escrita sob `@RequerPermissao` + auditada.
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 8 tabelas.
      - **Dinheiro**: `oportunidade.valorEstimado` — 1ª persistência de `Dinheiro` do core
        no schema (`bigint` ×10000 + `moeda` `char(3)`); nunca `float`.
      - **Tempo**: `@db.Timestamptz(6)` em todos os timestamps; `entrouEtapaEm` via
        `agoraUtc()`.
      - **Status**: `etapa_pipeline.tipo` (`ABERTA`\|`GANHA`\|`PERDIDA`) é o eixo de status
        do CRM, separado dos status canônicos financeiros (que não existem ainda).
      - **Idempotência**: `mover` na mesma etapa é no-op; `PortaObservacaoPagamentoCrm` é
        idempotente por estado (já `GANHA` → no-op).
      - **Auditoria**: `crm_pipeline_audit` nova (forma `RegistroAuditoria` do core,
        `AJUSTE_MANUAL`, append-only, só delta real) para escrita administrativa;
        `oportunidade_movimentacao` é o registro de 1ª classe de mudança de etapa.
      - **Erros**: validação zod → 422; etapa de outro pipeline / entrar em `PERDIDA` sem
        motivo → 422; sem permissão → 403; sem token → 401; fora do escopo → 404; `DELETE`
        de etapa em uso → 409.
      - **Config/segredos**: nenhuma chave nova.
      - **Multi-conta**: N/A.
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking**: nenhum ponto fora do
padrão já estabelecido pelas specs 007/008/009 — ver decisão sobre `@hello-pangea/dnd` em
`research.md` (rejeitada, não é uma violação, é uma escolha de "0 dep nova").

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma o `CHECK` de âncora XOR e o
índice único de `ordem` por pipeline; `contracts/` confirma que a leitura de pipeline/etapa
não exige permissão administrativa (só a escrita); `atribuicao.ts`/`sla.ts`/`esfriando.ts`
puros e testáveis sem banco; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/010-crm-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/             # Phase 1 output
│   ├── pipeline-etapa.md
│   ├── oportunidade-movimentacao.md
│   ├── atribuicao-sla.md
│   ├── campos-metricas.md
│   └── rbac-catalogo.md
└── tasks.md               # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── crm/
│   │   ├── domain/
│   │   │   └── pipeline/
│   │   │       ├── ancora.ts               # pessoa xor lead (mesmo formato da 009)
│   │   │       ├── sla.ts                  # calcularSlaEstourado(...) pura
│   │   │       ├── esfriando.ts            # calcularEsfriando(...) pura
│   │   │       ├── atribuicao.ts           # escolherResponsavel(...) pura (round robin + regra)
│   │   │       ├── movimentacao.ts         # validarMovimento(...) pura (motivo, mesmo pipeline)
│   │   │       └── metricas.ts             # agregarMetricas(...) pura
│   │   ├── application/
│   │   │   └── pipeline/
│   │   │       ├── pipeline.service.ts
│   │   │       ├── etapa-pipeline.service.ts
│   │   │       ├── oportunidade.service.ts
│   │   │       ├── oportunidade-consulta.service.ts   # escopo ver_todas/ver_proprias
│   │   │       ├── atribuicao.service.ts               # regras + round robin persistido
│   │   │       ├── campo-oportunidade.service.ts
│   │   │       ├── metricas.service.ts
│   │   │       ├── porta-observacao-pagamento.service.ts  # PortaObservacaoPagamentoCrm
│   │   │       └── crm-pipeline-audit.service.ts
│   │   ├── infra/
│   │   │   └── pipeline/  (repos Prisma, se necessário além do PrismaService direto)
│   │   ├── dto/
│   │   │   └── pipeline/  (zod schemas: criar/mover/atribuir/campos)
│   │   ├── pipeline.controller.ts
│   │   ├── etapa-pipeline.controller.ts
│   │   ├── oportunidade.controller.ts
│   │   ├── campo-oportunidade.controller.ts
│   │   └── crm.module.ts            # editado — registra os novos providers/controllers
│   └── auth/rbac/catalogo.ts        # editado — +6 permissões
├── prisma/
│   ├── schema.prisma                # editado — 8 models + 4 enums
│   └── migrations/<ts>_crm_pipeline/migration.sql
└── test/
    ├── crm-pipeline.e2e-spec.ts
    └── support/crm-pipeline.ts

frontend/
├── src/
│   ├── pipelines/
│   │   ├── pipelines-page.tsx           # CRM · Pipelines — seletor de pipeline
│   │   ├── kanban-board.tsx             # colunas por etapa, drag-and-drop nativo
│   │   ├── oportunidade-card.tsx        # indicadores SLA/esfriando
│   │   ├── mover-motivo-modal.tsx       # modal de motivo ao entrar em etapa PERDIDA
│   │   ├── pipeline-admin.tsx           # CRUD de pipeline/etapa/atribuição/campos
│   │   ├── metricas-panel.tsx
│   │   ├── use-pipelines.ts / use-oportunidades.ts  # TanStack Query hooks
│   │   └── *.test.tsx
│   ├── nav-items.ts                      # editado — item CRM · Pipelines
│   └── router.tsx                        # editado — rotas /crm/pipelines/**
```

**Structure Decision**: Web application (Option 2 do template) — já em uso desde a 001.
Tudo dentro do bounded context `crm` existente (`backend/src/crm/`), nova pasta de domínio
`pipeline/` ao lado de `interacao/lead/segmento/tag`; frontend ganha `src/pipelines/` como
módulo de tela próprio, mesmo padrão de `src/leads/`/`src/segmentos/`.

## Complexity Tracking

Nenhuma violação da constituição. Nenhuma entrada.
