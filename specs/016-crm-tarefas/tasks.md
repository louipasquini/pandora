---
description: "Task list for 016-crm-tarefas"
---

# Tasks: CRM · Tarefas

**Input**: Design documents from `/specs/016-crm-tarefas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tarefas.md, quickstart.md

**Tests**: incluídos — mesmo padrão de todas as specs 003–015 (unit de domínio sem banco +
e2e contra Postgres real + testes de componente no frontend).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Adicionar enum `TarefaStatus` e os 6 models (`Tarefa`, `TarefaChecklistItem`,
      `TarefaCronometroPeriodo`, `TarefaNota`, `TarefaDependencia`, `TarefaDelegacao`,
      `CrmTarefaAudit`) em `backend/prisma/schema.prisma` (ver data-model.md), com FKs para
      `Pessoa`/`Lead`/`Oportunidade`/`Usuario` (`onDelete` conforme a tabela do
      data-model.md).
- [ ] T002 Rodar `npx prisma migrate dev --name crm_tarefas` (via
      `npm run prisma:migrate:dev --workspace backend`) e editar o SQL gerado para
      acrescentar: índice único parcial `(tarefa_id) WHERE fim IS NULL` em
      `tarefa_cronometro_periodo`; `CHECK (tarefa_id <> depende_de_id)` em
      `tarefa_dependencia` (Prisma não modela nenhum dos dois — mesmo padrão 007/009/010/012).
- [ ] T003 [P] Adicionar as 5 permissões novas (`tarefa:{criar,editar,ver_todas,
      ver_proprias,delegar}`) em `backend/src/auth/rbac/catalogo.ts`; confirmar que
      `assertCatalogoCoerente()` segue passando e que `prisma/seed.ts` não precisa mudar
      (administrador/credencial de serviço concedem de graça).
- [ ] T004 [P] Registrar `TarefaModule` (ou os providers/controllers direto no
      `CrmModule` existente, mesmo padrão dos módulos anteriores do `crm`) em
      `backend/src/crm/crm.module.ts`.

**Checkpoint**: `npx prisma generate` roda limpo; `npm run lint`/`typecheck` no backend
passam com o schema novo mesmo sem nenhum código de aplicação ainda.

## Phase 2: Foundational (blocking prerequisites)

- [ ] T005 [P] `domain/tarefa/tipos.ts` em `backend/src/crm/domain/tarefa/tipos.ts` —
      `TarefaStatus` (re-export do Prisma), tipos de DTO de domínio
      (`EstadoTransicaoTarefa`, `EstadoPrazoTarefa`, `EstadoPontosTarefa`, arestas de
      dependência).
- [ ] T006 [P] `domain/tarefa/transicao-status.ts` — `validarTransicao(atual, destino):
      {ok:true} | {ok:false, erro}` pura, conjunto fechado (data-model.md).
- [ ] T007 [P] `domain/tarefa/prazo.ts` — `calcularEstadoPrazo(dataVencimento, status,
      agora): {vencendoHoje, atrasada}` pura, `Intl` America/Sao_Paulo (research.md D-R3).
- [ ] T008 [P] `domain/tarefa/cronometro.ts` — `tempoTotalSegundos(periodos, agora)` pura
      (research.md).
- [ ] T009 [P] `domain/tarefa/dependencia.ts` — `detectarCiclo(arestasExistentes,
      novaAresta): boolean` pura, DFS (research.md D-R5).
- [ ] T010 [P] `domain/tarefa/pontos.ts` — `PESOS_PONTOS_TAREFA` congelado +
      `calcularPontosTarefa(estado: EstadoPontosTarefa): number` pura (research.md D-R4).
- [ ] T011 [P] Testes unitários de T005–T010 em `backend/src/crm/domain/tarefa/*.spec.ts`
      (todas as transições válidas/inválidas; prazo em fusos/dias-limite; ciclo direto e
      indireto de profundidade 3+; pontos com/sem bônus de prazo/checklist).
- [ ] T012 `infra/tarefa/tarefa.repository.ts` — CRUD básico + `existe(pessoaId|leadId|
      oportunidadeId)` para validar âncoras na criação, em
      `backend/src/crm/infra/tarefa/tarefa.repository.ts`.
- [ ] T013 [P] `infra/tarefa/checklist.repository.ts`,
      `infra/tarefa/cronometro.repository.ts`, `infra/tarefa/nota.repository.ts`,
      `infra/tarefa/dependencia.repository.ts`, `infra/tarefa/delegacao.repository.ts` em
      `backend/src/crm/infra/tarefa/`.
- [ ] T014 `application/tarefa/crm-tarefa-audit.service.ts` — espelha
      `CrmPipelineAuditService` (010) para a tabela `crm_tarefa_audit`, em
      `backend/src/crm/application/tarefa/crm-tarefa-audit.service.ts`.
- [ ] T015 `application/tarefa/tarefa-consulta.service.ts` — `escopoDe(req)` (D-08: OU
      `responsavelId=sujeito` OU `responsavelId=null` para `ver_proprias`; `{}` para
      `ver_todas`), `listar`, `obter`, `exigirNoEscopo` (mesmo padrão de
      `OportunidadeConsultaService`, 010), em
      `backend/src/crm/application/tarefa/tarefa-consulta.service.ts`.

**Checkpoint**: domínio puro 100% testado; consulta/escopo prontos para as histórias de
usuário consumirem.

---

## Phase 3: User Story 1 — Gestão pessoal de tarefas com checklist e prazo (P1) 🎯 MVP

**Goal**: criar, editar, listar e concluir tarefas com checklist — o núcleo do gestor de
tarefas.

**Independent Test**: `POST /crm/tarefas` → marcar itens do checklist → `POST
.../status {CONCLUIDA}` → `GET` reflete tudo, sem depender de nenhuma outra história.

- [ ] T016 [US1] `dto/tarefa.schema.ts` (zod) — `criarTarefaSchema`,
      `atualizarTarefaSchema`, `mudarStatusTarefaSchema`, `listarTarefasSchema`,
      `criarChecklistItemSchema`, `atualizarChecklistItemSchema`, em
      `backend/src/crm/dto/tarefa.schema.ts`.
- [ ] T017 [US1] `application/tarefa/tarefa.service.ts` — `criar` (valida âncoras via
      T012, cria checklist inicial se enviado), `atualizar` (409 se terminal, exceto
      reabrir), `mudarStatus` (usa T006; 409 se `CONCLUIDA` e há dependência pendente via
      T009/repo de dependência; grava/limpa `concluidoEm`; audita via T014), em
      `backend/src/crm/application/tarefa/tarefa.service.ts`.
- [ ] T018 [US1] `application/tarefa/checklist.service.ts` — criar/atualizar/remover item
      (409 se tarefa terminal), progresso derivado (`x/y`), em
      `backend/src/crm/application/tarefa/checklist.service.ts`.
- [ ] T019 [US1] `tarefa.controller.ts` — `POST/GET/GET{id}/PATCH /crm/tarefas`,
      `POST /crm/tarefas/{id}/status`, `POST/PATCH/DELETE
      /crm/tarefas/{id}/checklist[/{itemId}]`, em `backend/src/crm/tarefa.controller.ts`
      (permissões conforme contracts/tarefas.md).
- [ ] T020 [P] [US1] Testes e2e de US1 em `backend/test/tarefa.e2e-spec.ts` — cobre os
      3 acceptance scenarios da US1 + edge cases (concluir `CANCELADA` → 409; editar
      `CONCLUIDA` → 409 exceto reabrir; checklist em tarefa terminal → 409; âncora
      inexistente → 404; escopo `ver_proprias` não vaza tarefa de outro responsável).
- [ ] T021 [US1] `frontend/src/tarefas/TarefasPage.tsx` — lista com filtros
      (status/responsável), criação inline (título + prazo + checklist), item de menu
      **CRM · Tarefas** atrás de `tarefa:ver_todas`\|`tarefa:ver_proprias`.
- [ ] T022 [US1] `frontend/src/tarefas/TarefaDetalhePage.tsx` — detalhe com checklist
      interativo e transição de status; rota sob `RequirePermissao`.
- [ ] T023 [P] [US1] Testes de componente `frontend/src/tarefas/TarefasPage.test.tsx` e
      `TarefaDetalhePage.test.tsx` (mesmo padrão `fireEvent` de `PipelinesPage.test.tsx`).

**Checkpoint**: US1 é um gestor de tarefas pessoal utilizável de ponta a ponta (API +
painel), independente das demais histórias.

---

## Phase 4: User Story 2 — Agenda, cronômetro e comentários (P2)

**Goal**: cronômetro por tarefa, comentários de acompanhamento, e filtro de agenda por
data de vencimento.

**Independent Test**: sobre uma tarefa já existente (US1), iniciar/parar cronômetro, ver
tempo total, comentar, e listar por intervalo de vencimento.

- [ ] T024 [P] [US2] `application/tarefa/cronometro.service.ts` — `iniciar` (409 se
      período aberto), `parar` (409 se não há aberto), `obter` (períodos +
      `tempoTotalSegundos` via T008), em
      `backend/src/crm/application/tarefa/cronometro.service.ts`.
- [ ] T025 [P] [US2] `application/tarefa/nota-tarefa.service.ts` — `registrar` (append-only),
      `listar`, em `backend/src/crm/application/tarefa/nota-tarefa.service.ts`.
- [ ] T026 [US2] Estender `tarefa-consulta.service.ts` (T015) com filtros
      `vencimentoDe`/`vencimentoAte`/`vencendoHoje`/`atrasada` (usa T007) e projeção com
      `progressoChecklist`/`tempoTotalSegundos`/`vencendoHoje`/`atrasada` na listagem e no
      detalhe.
- [ ] T027 [US2] Endpoints `POST /crm/tarefas/{id}/cronometro/{iniciar,parar}`,
      `GET /crm/tarefas/{id}/cronometro`, `POST/GET /crm/tarefas/{id}/notas` em
      `backend/src/crm/tarefa.controller.ts`.
- [ ] T028 [P] [US2] Testes e2e em `backend/test/tarefa-cronometro-notas.e2e-spec.ts` —
      cobre os 4 acceptance scenarios da US2 + edge case "parar sem iniciar".
- [ ] T029 [US2] Frontend: cronômetro (iniciar/parar/tempo total) e lista de comentários
      em `TarefaDetalhePage.tsx`; view de agenda (semana) em `TarefasPage.tsx`.

**Checkpoint**: gestão do tempo e diário de bordo funcionam sobre qualquer tarefa da US1.

---

## Phase 5: User Story 3 — Delegação, dependência e fila geral (P2)

**Goal**: tarefas gerais (sem responsável), delegação com histórico, dependência entre
tarefas bloqueando conclusão.

**Independent Test**: criar 2 tarefas, ligar dependência, tentar concluir fora de ordem;
delegar uma tarefa entre 2 usuários e conferir o histórico; tarefa sem responsável aparece
na fila geral.

- [ ] T030 [P] [US3] `application/tarefa/dependencia.service.ts` — `adicionar` (422 se
      auto-dependência via id igual, 422 se ciclo via T009, 404 se `dependeDeId` não
      existe), `remover`, `listar` (com status da tarefa referenciada), em
      `backend/src/crm/application/tarefa/dependencia.service.ts`.
- [ ] T031 [P] [US3] `application/tarefa/delegacao.service.ts` — `delegar` (no-op se
      mesmo responsável; grava `tarefa_delegacao`; atualiza `tarefa.responsavelId`),
      `listar`, em `backend/src/crm/application/tarefa/delegacao.service.ts`.
- [ ] T032 [US3] Integrar T030 em `TarefaService.mudarStatus` (T017): bloquear
      `CONCLUIDA` com 409 + lista de dependências pendentes (FR-004).
- [ ] T033 [US3] Endpoints `POST/DELETE/GET /crm/tarefas/{id}/dependencias[/{dependeDeId}]`,
      `POST /crm/tarefas/{id}/delegar`, `GET /crm/tarefas/{id}/delegacoes` em
      `backend/src/crm/tarefa.controller.ts`.
- [ ] T034 [P] [US3] Testes e2e em `backend/test/tarefa-dependencia-delegacao.e2e-spec.ts`
      — cobre os 4 acceptance scenarios da US3 + edge case de ciclo indireto (A→B→C→A).
- [ ] T035 [US3] Frontend: seção de dependências (adicionar/remover, indicador de
      bloqueio) e botão "Delegar" com histórico em `TarefaDetalhePage.tsx`; aba "Gerais"
      (tarefas sem responsável) em `TarefasPage.tsx`.

**Checkpoint**: coordenação de equipe completa — fila geral, delegação e dependência —
sobre a base da US1 (independente do cronômetro/agenda da US2).

---

## Phase 6: User Story 4 — Pontos, ranking e geração automática via Workflow (P3)

**Goal**: pontos derivados por conclusão, ranking por período, notificações in-app, e a
ação `CRIAR_TAREFA` no motor de automação (spec 014).

**Independent Test**: concluir tarefas em condições variadas e consultar o ranking;
publicar um fluxo com a ação `CRIAR_TAREFA` e disparar o gatilho correspondente.

- [ ] T036 [P] [US4] `application/tarefa/ranking.service.ts` — soma `calcularPontosTarefa`
      (T010) sobre tarefas `CONCLUIDA` no período, agrupado por `responsavelId`, em
      `backend/src/crm/application/tarefa/ranking.service.ts`.
- [ ] T037 [P] [US4] `application/tarefa/notificacao.service.ts` — tarefas do sujeito
      autenticado com `vencendoHoje`\|`atrasada` (usa T007), em
      `backend/src/crm/application/tarefa/notificacao.service.ts`.
- [ ] T038 [US4] Endpoints `GET /crm/tarefas/ranking`, `GET /crm/tarefas/notificacoes` em
      `backend/src/crm/tarefa.controller.ts`.
- [ ] T039 [US4] Estender `backend/src/crm/domain/workflow/tipos.ts`: `ACAO_TIPOS` +=
      `'CRIAR_TAREFA'`, interface `AcaoCriarTarefa`, branch em `acaoFluxoSchema`
      (data-model.md).
- [ ] T040 [US4] Estender `backend/src/crm/application/workflow/executar-acao.service.ts`:
      `executar()` ganha o parâmetro `registroTipo`; `case 'CRIAR_TAREFA'` chama
      `TarefaService.criar` com `leadId`/`oportunidadeId` conforme `registroTipo`,
      `origem: 'workflow:<fluxoVersaoId>'` (research.md D-R2).
- [ ] T041 [US4] Atualizar `backend/src/crm/application/workflow/worker.service.ts`
      (repassar `registroTipo` já calculado em `processarLinha` para
      `this.acoes.executar(...)`) e `simulacao.service.ts` (reconhecer `CRIAR_TAREFA` no
      relatório de simulação sem efeito colateral, D-03 da 014).
- [ ] T042 [P] [US4] Testes unitários de T036/T037 em
      `backend/src/crm/application/tarefa/*.spec.ts` (ou domínio, se extraído).
- [ ] T043 [P] [US4] Testes e2e em `backend/test/tarefa-ranking-notificacoes.e2e-spec.ts`
      (cobre os 2 primeiros acceptance scenarios da US4) e extensão de
      `backend/test/workflow.e2e-spec.ts` (ou arquivo próprio
      `backend/test/workflow-criar-tarefa.e2e-spec.ts`) cobrindo os 2 últimos (criação
      automática + idempotência sob reprocessamento).
- [ ] T044 [US4] Frontend: `frontend/src/tarefas/RankingPanel.tsx` +
      `NotificacoesBadge.tsx` (contagem no menu/topo); estender
      `frontend/src/workflow/FluxoDetalhePage.tsx` (editor de ações) com o formulário da
      ação **Criar tarefa**.
- [ ] T045 [P] [US4] Teste de componente `frontend/src/tarefas/RankingPanel.test.tsx`.

**Checkpoint**: engajamento (pontos/ranking) e automação (Workflow) completos — todas as
4 histórias de usuário entregues.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T046 [P] Rodar `npm run lint`/`typecheck`/`build` nos dois workspaces
      (`backend`, `frontend`) e corrigir o que quebrar.
- [ ] T047 [P] Rodar a suíte completa (`npm test --workspace backend`,
      `npm run test:e2e --workspace backend`, `npm test --workspace frontend`) —
      regressão 003–015 + os testes novos desta spec, todos verdes.
- [ ] T048 Validação manual de ponta a ponta no navegador seguindo `quickstart.md`
      (criar tarefa → checklist → cronômetro → dependência → delegação → ranking →
      geração automática via Workflow).
- [ ] T049 Atualizar `CLAUDE.md` (seção Stack + "Plano ativo"), `README.md` e
      `ROADMAP.md` (marcar `016 — crm-tarefas` como implementada, com o resumo padrão das
      specs anteriores) e criar `docs/016-crm-tarefas.md`.

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** bloqueiam todo o resto.
- **US1 (Phase 3)** depende só do Foundational — é o MVP.
- **US2 (Phase 4)** e **US3 (Phase 5)** dependem do Foundational + da tabela `tarefa` de
  US1 existir, mas são independentes **entre si** (podem ser feitas em qualquer ordem ou
  em paralelo por desenvolvedores diferentes).
- **US4 (Phase 6)** depende de US1 (conclusão gera pontos) e toca o módulo `workflow`
  (014) já existente — pode começar em paralelo a US2/US3, mas só fecha depois de US1.
- **Polish (Phase 7)** depende de todas as histórias.

## Parallel Example: Foundational (Phase 2)

```text
T005, T006, T007, T008, T009, T010 podem rodar em paralelo (arquivos de domínio
independentes); T011 depois de todos eles; T013 em paralelo entre si (repositórios
independentes) depois de T012.
```

## Implementation Strategy

**MVP first**: Setup → Foundational → US1 (Phase 3) já é entregável — um gestor de
tarefas pessoal com checklist. US2/US3/US4 são incrementos independentes na ordem de
prioridade do spec.md.
