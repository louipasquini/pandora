# Implementation Plan: CRM · Dashboard

**Branch**: `017-crm-dashboard` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-crm-dashboard/spec.md`

## Summary

Décima-primeira e **última fatia da Fase 1 (CRM)**, visão Parte 8 (dashboard comercial e de
atendimento). Entrega um **dashboard de métricas derivadas por query** — nunca contador
(Princípio V) — sobre o que o `crm` já produz: `lead` (008), `oportunidade`/pipeline (010),
`atendimento`/chat (012), `tarefa` (016), `interacao` (009), `disparo` (015). Componentes:

- **Catálogo fechado de painéis** (`PAINEIS_DASHBOARD`, no código — mesmo modelo do catálogo
  de permissões da 004 e de `ACAO_TIPOS` da 014): visão geral, funil de conversão por
  pipeline, ranking por integrante do comercial, qualidade de atendimento (tempo de 1ª
  resposta / SLA / CSAT / taxa de resolução), leads por origem, série temporal de
  oportunidades.
- **Comparação período-a-período** (benchmark): todo painel numérico devolve o valor no
  período + o mesmo recorte no período anterior de igual duração + `delta`/`deltaPercentual`.
- **Metas comerciais** (`meta_comercial`): alvo numérico para uma métrica do catálogo, num
  período, com escopo opcional equipe/responsável; atingimento (`realizado`/`percentual`/
  `status`) **sempre derivado** na leitura + `GET /crm/dashboard/notificacoes` in-app (mesmo
  padrão da 016, CL-02 — sem envio externo).
- **Visões salvas** (`dashboard_visao`): recorte de leitura nomeado (filtros + lista/ordem
  de painéis), pessoal, opcionalmente compartilhado com um perfil (somente-leitura +
  clonável). Preferência de UI, não fonte de métrica.
- **Export client-side** (0 dep): CSV via `Blob` nos painéis tabulares (`?formato=csv`);
  "PDF" = `window.print()` com folha `@media print`. Gráficos em **SVG próprio**, sem lib.

Mora no _bounded context_ **`crm`** (já não-vazio desde 007–016; `CONTEXT_MODULES` segue
**11** — nenhum bounded context novo). Reaproveita os serviços de consulta de escopo já
existentes (`OportunidadeConsultaService`/`TarefaConsultaService`/`LeadConsultaService`/
`AtendimentoConsultaService`) — o dashboard **nunca amplia** o que o sujeito já vê.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 24 (mesma stack do monorepo desde a 001).

**Primary Dependencies**: NestJS 11, Prisma 6, zod (validação de DTO); frontend React 19 +
TanStack Query + React Router 7. **0 dependência nova** (backend e frontend) — export é
client-side, gráficos são SVG à mão (D-08/CL-03).

**Storage**: PostgreSQL 16 via Prisma — **2 tabelas de negócio novas** (`meta_comercial`,
`dashboard_visao`) + **1 tabela de auditoria** (`crm_dashboard_audit`) + 1 enum
(`MetaComercialPeriodo`). Nenhuma tabela de métrica materializada / rollup (Princípio V).

**Testing**: Jest (unit, domínio puro sem banco — catálogo de painéis, `resolverPeriodo`,
`calcularDelta`, `statusMeta`, buckets de série temporal) + Jest e2e (Postgres real, schema
isolado por execução, `backend/test/setup-db.ts`) + Vitest/RTL (frontend). Mesmo padrão
003–016.

**Target Platform**: Linux server (backend) + navegador (frontend) — inalterado.

**Project Type**: Web application (monorepo `backend`/`frontend`, npm workspaces).

**Performance Goals**: Sem meta nova — mesmo pressuposto de baixo volume síncrono já usado
em `oportunidade`/010 e `atendimento`/012 (agregação por request via `groupBy` do Prisma).
Um painel pesado pode ganhar `Cache-Control: private, max-age=60` na borda HTTP (decisão de
implementação, D-09) — nunca um rollup no banco.

**Constraints**: Nenhuma sincronização automática com API externa (Princípio VIII — o
dashboard só lê o estado do próprio `crm`); superfície de escrita mínima (só `meta_comercial`
e `dashboard_visao`, ambas configuração de leitura/objetivo, não entidade de domínio
comercial); Dinheiro nunca soma entre moedas (Padrão Transversal — funil e ranking agregam
`valorGanho` como `dict[moeda, valor]`).

**Scale/Scope**: ~2 tabelas Prisma de negócio + 1 de auditoria, ~14 endpoints, +2 permissões
RBAC (`dashboard:ver`, `dashboard:gerir_metas`), 1 catálogo novo de painéis no código, 1
catálogo novo de métricas de meta, 1 migração Prisma, 1 tela nova de frontend (dashboard com
painéis SVG + gestão de metas + visões salvas).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.0.0/1.1.0).

- [x] **I. Domínio, não origem**: `meta_comercial`, `dashboard_visao` e
      `crm_dashboard_audit` recebem PK UUID v7 (`EntidadeId.novo()`, mesmo padrão de toda
      tabela do `crm`); nenhuma dessas entidades tem contraparte nas 7 contas de origem —
      item N/A quanto a `*_origem_ref`. O catálogo de painéis não é tabela (é código).
- [x] **II. Clarificar antes de assumir**: as 4 clarificações de maior impacto (alcance de
      "configurável", metas dentro/fora, mecânica de export, escopo de dados / profundidade
      de benchmark) foram resolvidas com o dono do produto em 2026-09-10 (CL-01..CL-04,
      spec.md). Decisões D-01..D-09 são defaults documentados de baixo impacto, mesmo padrão
      das specs 007–016.
- [x] **III. Bordas finas**: N/A — o dashboard não fala com nenhuma das 7 contas de origem
      nem com nenhuma API externa; não há adaptador, não há vocabulário de plataforma.
- [x] **IV. Log de eventos + projeções**: N/A para ingestão externa (não há evento cru de
      origem). A auditoria (`crm_dashboard_audit`) segue a forma canônica do core,
      append-only, só delta real. Nenhuma métrica é persistida — o "estado" que o dashboard
      lê já é a projeção mantida pelas specs 008–016.
- [x] **V. Agregados derivados**: **cerne desta spec.** Todo número de painel, todo
      `realizado` de meta, todo `delta` de benchmark, toda linha de ranking e cada bucket de
      série temporal é `f(estado das entidades do crm) -> valor`, recalculado por `groupBy`/
      agregação do Prisma a cada request. **0 tabela de rollup, 0 contador persistido, 0
      job** (SC-003). A alternativa "tabela de métrica materializada" foi considerada e
      rejeitada explicitamente (D-09). Dinheiro agregado é sempre `dict[moeda, valor]` —
      funil e ranking nunca somam moedas (reusa `agregarMetricas` do pipeline, 010).
- [x] **VI. Contextos delimitados**: `dashboard` mora inteiramente dentro do `crm` — não
      importa `src/clientes/**` nem nenhum outro contexto (ESLint `import/no-restricted-paths`
      + `grep` no e2e, mesmo guard das specs 008+). Lê apenas entidades do próprio `crm`
      (e `usuario`/`perfil`/`equipe` do RBAC/007, já compartilhados). Nenhuma escrita em
      contexto alheio; o Financeiro nem existe ainda (Assumptions). O dashboard **observa**
      o estado, nunca escreve nas entidades que agrega.
- [x] **VII. Curadoria vs derivação**: N/A — nenhum campo curado nesta spec. `meta_comercial`
      e `dashboard_visao` são 100% entrada humana de configuração, sem contraparte derivada
      para divergir.
- [x] **VIII. Superfície de escrita mínima**: só **2** recursos ganham endpoint de escrita —
      `meta_comercial` (alvo de objetivo, análogo a `janela_atendimento`/`feriado` da 007) e
      `dashboard_visao` (preferência de leitura do próprio usuário). Justificativa
      registrada: sem persistir o alvo não há como derivar atingimento; sem persistir a
      visão o usuário reconfigura o recorte a cada sessão (CL-01/CL-02). Nenhuma
      sincronização automática com API externa. Os ~10 endpoints restantes são **todos
      read-only** (painéis, notificações, catálogo).
- [x] **Padrões Transversais**: Dinheiro ×10000 sem float, agregado por moeda separada
      (funil/ranking); tempo `timestamptz` UTC — `de`/`ate` do filtro nascem de um seletor
      de data do painel (não de payload de origem), parseados com `Date`/ISO simples, lixo →
      400 (D-05); auditoria via `montarRegistroAuditoria` do core; `plataforma_origem` N/A
      (entidade sem contraparte de origem). Enum `MetaComercialPeriodo` fechado; `status` de
      atingimento é função pura derivada, não coluna.

## Project Structure

### Documentation (this feature)

```text
specs/017-crm-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── dashboard.md     # Phase 1 output — endpoints do dashboard
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/src/crm/
├── domain/dashboard/
│   ├── paineis.ts             # PAINEIS_DASHBOARD (catálogo fechado: id, titulo, formato, permissao)
│   ├── periodo.ts             # resolverPeriodo(de, ate) -> {de, ate, anteriorDe, anteriorAte, bucket} + validação (D-05, FR-003/FR-018)
│   ├── benchmark.ts           # calcularDelta(valor, anterior) -> {delta, deltaPercentual|null} (FR-004)
│   ├── serie-temporal.ts      # bucketsDoPeriodo / agruparEmBuckets (FR-018)
│   ├── meta.ts                # METRICAS_META (catálogo fechado) + statusMeta(realizado, alvo, periodo, agora) (CL-02, FR-011)
│   ├── ranking.ts             # combinarRankingComercial(ganhas, pontosTarefa) — puro
│   └── index.ts
├── application/dashboard/
│   ├── dashboard.service.ts           # GET /crm/dashboard — monta lista de painéis visíveis + resolve cada um
│   ├── paineis.service.ts             # um método por painel: visaoGeral / funilPipeline / rankingComercial / qualidadeAtendimento / leadsPorOrigem / serieOportunidades
│   ├── meta.service.ts                # CRUD meta_comercial + atingimento derivado (reusa paineis p/ o "realizado")
│   ├── meta-notificacao.service.ts    # GET /crm/dashboard/notificacoes (in-app, CL-02)
│   ├── visao.service.ts               # CRUD dashboard_visao (dono edita/exclui; compartilhada = read-only + clonável)
│   ├── csv.ts                         # serializarCsv(colunas, linhas) — puro, reusa padrão da 015
│   └── crm-dashboard-audit.service.ts # espelha CrmTarefaAuditService (016) / CrmPipelineAuditService (010)
├── infra/dashboard/
│   ├── metrica.repository.ts   # groupBy/aggregate do Prisma sobre lead/oportunidade/atendimento/tarefa/interacao/disparo
│   ├── meta.repository.ts
│   └── visao.repository.ts
├── dto/dashboard/dashboard.schema.ts  # zod: filtros do dashboard, criar/editar meta, criar/editar visão
└── dashboard.controller.ts            # /crm/dashboard/**

frontend/src/dashboard/
├── DashboardPage.tsx        # seletor de período + filtros (equipe/responsável/pipeline) + grid de painéis; @media print
├── paineis/
│   ├── PainelVisaoGeral.tsx     # cartões numéricos com delta período-a-período
│   ├── PainelFunil.tsx          # funil SVG por etapa (qtd + valor por moeda + tempo médio)
│   ├── PainelRankingComercial.tsx
│   ├── PainelQualidadeAtendimento.tsx
│   └── PainelSerieTemporal.tsx  # linha/barras SVG à mão
├── MetasPanel.tsx          # lista de metas + atingimento + CRUD (atrás de dashboard:gerir_metas)
├── VisoesBar.tsx           # salvar/abrir/clonar/compartilhar visão
├── NotificacoesMetaBadge.tsx  # contagem de metas em risco/batidas, refetchInterval 60s
└── exportar-csv.ts         # Blob client-side (mesmo helper de disparos/015)
```

**Structure Decision**: Web application (Opção 2 do template) — mesmo monorepo
`backend`/`frontend` de todas as specs anteriores; `dashboard` é um módulo novo dentro do
`CrmModule` já existente (`CONTEXT_MODULES` continua 11 — nenhum bounded context novo). Os
serviços de painel **compõem** os serviços de consulta de escopo já existentes (010/012/
008/016) em vez de reimplementar `where` de RBAC.

## Complexity Tracking

*Sem violações de constituição a justificar — todos os gates acima passam. As 2 tabelas de
escrita novas (`meta_comercial`, `dashboard_visao`) têm justificativa registrada no gate
VIII (alvo de meta é pré-requisito de atingimento derivado; visão é preferência de leitura
do usuário) e são análogas a `janela_atendimento`/`feriado` (007) em peso e risco.*
