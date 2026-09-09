# Implementation Plan: CRM · Tarefas

**Branch**: `016-crm-tarefas` | **Date**: 2026-09-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-crm-tarefas/spec.md`

## Summary

Décima fatia da Fase 1 (CRM), visão Parte 8.10. Entrega `tarefa` — gestor de tarefas do
time, pessoal e geral — com checklist, cronômetro, comentários de acompanhamento
(`tarefa_nota`, distinto da `interacao` de timeline da spec 009), dependência entre
tarefas, delegação/reatribuição com histórico de 1ª classe, pontos de gamificação e
ranking (sempre derivados), notificações in-app (campo derivado + endpoint), e uma ação
nova `CRIAR_TAREFA` no catálogo fechado do Workflow (spec 014) para geração automática a
partir de gatilhos de Lead/Oportunidade. Mora no _bounded context_ **`crm`** (já
não-vazio desde 007–015; `CONTEXT_MODULES` segue **11**). Reaproveita `usuario` (RBAC,
004), `pessoa` (005), `lead`/workflow (008/014), `oportunidade` (010) — nenhuma entidade
duplicada.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 24 (mesma stack do monorepo desde a 001)

**Primary Dependencies**: NestJS 11, Prisma 6, zod (validação de DTO, mesmo padrão de
todas as specs do `crm`); frontend React 19 + TanStack Query + React Router 7. **0 dep
nova.**

**Storage**: PostgreSQL 16 via Prisma — 6 tabelas novas + 1 tabela de auditoria no mesmo
banco compartilhado, sem schema novo.

**Testing**: Jest (unit, domínio puro sem banco) + Jest e2e (Postgres real, schema
isolado por execução, mesmo harness de `backend/test/setup-db.ts`) + Vitest/RTL
(frontend), mesmo padrão 003–015.

**Target Platform**: Linux server (backend) + navegador (frontend) — inalterado.

**Project Type**: Web application (monorepo `backend`/`frontend`, npm workspaces).

**Performance Goals**: Sem meta nova — mesmo padrão de baixo volume síncrono já usado em
`oportunidade`/010 e `atendimento`/012 (dezenas a poucas centenas de tarefas simultâneas
por usuário); ranking e campos derivados calculados na leitura sem paginação pesada.

**Constraints**: Nenhuma sincronização automática com API externa (Princípio VIII —
notificação é só in-app, CL-02); superfície de escrita mínima (Princípio VIII).

**Scale/Scope**: ~6 tabelas Prisma novas, ~24 endpoints, +6 permissões RBAC, 1 ação nova
no catálogo do Workflow, 1 migração Prisma, 1 tela nova de frontend (gestor de tarefas).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.0.0).

- [x] **I. Domínio, não origem**: `tarefa`/`tarefa_checklist_item`/
      `tarefa_cronometro_periodo`/`tarefa_nota`/`tarefa_dependencia`/`tarefa_delegacao`
      recebem PK UUID v7 (`EntidadeId.novo()`, mesmo padrão de toda tabela `crm`); nenhum
      id de origem externa envolvido (entidade 100% interna, sem contraparte nas 7 contas
      de origem) — item N/A quanto a `*_origem_ref`.
- [x] **II. Clarificar antes de assumir**: as 3 clarificações de maior impacto
      (gamificação, canal de notificação, mecanismo de geração automática) foram
      resolvidas com o dono do produto em 2026-09-09 (CL-01..CL-03, spec.md). Decisões
      D-01..D-11 são defaults documentados de baixo impacto, mesmo padrão das specs
      007/008/009/010 — nenhum comportamento de negócio de alto impacto foi assumido sem
      registro.
- [x] **III. Bordas finas**: N/A — `tarefa` não tem contraparte em nenhuma das 7 contas de
      origem; não há adaptador, não há vocabulário de plataforma envolvido.
- [x] **IV. Log de eventos + projeções**: N/A para ingestão externa (não há evento cru de
      origem aqui); a auditoria (`crm_tarefa_audit`) segue a forma canônica do core,
      append-only, e `execucao_fluxo` (014) já é o log append-only que torna a ação
      `CRIAR_TAREFA` idempotente (reprocessar não duplica — a checagem
      `@@unique(fluxoVersaoId, fonte, fonteRegistroId)` acontece **antes** de qualquer ação
      rodar, spec 014).
- [x] **V. Agregados derivados**: pontos de gamificação, ranking, progresso de checklist
      (`x/y`), tempo total do cronômetro, `vencendoHoje`/`atrasada` são **todos** funções
      puras `f(estado) -> valor`, recalculadas na leitura — nenhum contador incremental
      persistido (FR-006, FR-007, FR-011, FR-012, FR-013).
- [x] **VI. Contextos delimitados**: `tarefa` mora inteiramente dentro do `crm` — não
      importa `clientes`/`financeiro`; FKs diretas no `schema.prisma` para `Pessoa`/`Lead`/
      `Oportunidade`/`Usuario` seguem o mesmo precedente de `Lead.pessoaId`/
      `Oportunidade.pessoaId` (008/010) — a fronteira do Princípio VI é sobre import de
      módulo TypeScript, não sobre o schema compartilhado. A ação `CRIAR_TAREFA` do
      Workflow chama o mesmo `TarefaService` que um `POST /crm/tarefas` manual chamaria —
      nenhum caminho de escrita paralelo (mesmo padrão de `ExecutarAcaoService`, 014).
- [x] **VII. Curadoria vs derivação**: N/A — nenhum campo curado nesta spec (tarefa não
      tem contraparte de origem externa para divergir).
- [x] **VIII. Superfície de escrita mínima**: nenhuma sincronização automática com API
      externa; notificação é só in-app (CL-02, sem worker de envio, sem dependência nova).
- [x] **Padrões Transversais**: `data_vencimento`/`concluido_em`/períodos de cronômetro em
      `timestamptz` UTC (parser tolerante do core não se aplica — datas nascem no próprio
      sistema, não em payload de origem); `TarefaStatus` como enum fechado com transições
      validadas (FR-003); auditoria via `montarRegistroAuditoria` do core; `tarefa` não
      carrega `plataforma_origem` (N/A — entidade sem contraparte de origem).

## Project Structure

### Documentation (this feature)

```text
specs/016-crm-tarefas/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── tarefas.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/src/crm/
├── domain/tarefa/
│   ├── tipos.ts                    # TarefaStatus, transições, âncoras, DTOs de domínio
│   ├── transicao-status.ts         # validarTransicao(atual, destino) — pura
│   ├── dependencia.ts              # detectarCiclo(grafo, novaAresta) — pura, DFS
│   ├── prazo.ts                    # calcularEstadoPrazo(dataVencimento, agora) — pura
│   ├── cronometro.ts               # tempoTotal(periodos, agora) — pura
│   └── pontos.ts                   # calcularPontosTarefa(estado) + PESOS_PONTOS_TAREFA
├── application/tarefa/
│   ├── tarefa.service.ts           # criar/atualizar/mudarStatus/excluir(=cancelar)
│   ├── tarefa-consulta.service.ts  # escopoDe/listar/obter/exigirNoEscopo (padrão 010)
│   ├── checklist.service.ts
│   ├── cronometro.service.ts
│   ├── nota-tarefa.service.ts
│   ├── dependencia.service.ts
│   ├── delegacao.service.ts
│   ├── ranking.service.ts          # pontos/ranking derivados (CL-01)
│   ├── notificacao.service.ts      # "minhas notificações" (CL-02)
│   └── crm-tarefa-audit.service.ts # espelha CrmPipelineAuditService (010)
├── infra/tarefa/
│   └── tarefa.repository.ts (+ checklist/cronometro/nota/dependencia/delegacao)
├── dto/tarefa.schema.ts
├── tarefa.controller.ts
└── domain/workflow/tipos.ts        # ACAO_TIPOS += 'CRIAR_TAREFA' (extensão, spec 014)
    application/workflow/executar-acao.service.ts  # case 'CRIAR_TAREFA' (extensão)

frontend/src/tarefas/
├── TarefasPage.tsx          # abas Minhas / Gerais / Time; filtros; agenda
├── TarefaDetalhePage.tsx    # checklist, cronômetro, comentários, dependências, delegação
├── RankingPanel.tsx         # pontos/ranking (CL-01)
└── NotificacoesBadge.tsx    # contagem vencendo hoje/atrasadas (CL-02)
```

**Structure Decision**: Web application (Opção 2 do template) — mesmo monorepo
`backend`/`frontend` de todas as specs anteriores; `tarefa` é um módulo novo dentro do
`CrmModule` já existente (`CONTEXT_MODULES` continua 11 — nenhum bounded context novo).

## Complexity Tracking

*Sem violações de constituição a justificar — todos os gates acima passam sem
complexidade extra.*
