# Tasks: Contratos · Aditivos · Fold (pipeline etapa 6)

**Input**: spec.md, plan.md, research.md, data-model.md, contracts/. Convenção: `[P]` =
paralelizável (arquivos distintos, sem dependência entre si).

## Fase 1 — Schema

- [ ] T001 Editar `backend/prisma/schema.prisma`: enums `StatusContratoCanonico`/
  `AditivoRotulo`; models `Contrato`/`Aditivo`/`ContratoAudit`; ativar `@relation` em
  `Transacao.contratoId`; back-relations em `Pessoa`/`Produto`.
- [ ] T002 Gerar e aplicar a migração (`npm run prisma:migrate:dev --workspace backend` —
  nome `contratos_aditivo_fold`).

## Fase 2 — Domínio puro (sem banco) `backend/src/contratos/domain/`

- [ ] T003 [P] `status-contrato.ts` + `.spec.ts` — `statusDoContrato(fimAcesso,
  toleranciaAtrasoDias, ajusteManual, agora)`.
- [ ] T004 [P] `fold.ts` + `.spec.ts` — fold puro (data-model.md §Fluxo do fold); casos:
  compra inicial, renovação, prorrogação, reembolso, sem-efeito, tempo de acesso ausente,
  múltiplas moedas, ordenação por `ocorridoEm` com empate por `transacaoId`.
- [ ] T005 [P] `index.ts` — barrel do domínio.

## Fase 3 — Infra (Prisma) `backend/src/contratos/infra/`

- [ ] T006 `contrato.repository.ts` — `getOrCreateContrato` (com fallback de corrida P2002),
  `transacoesDoContrato`, `upsertAditivos`, `atualizarFold` (limpa ajuste manual
  incondicionalmente), `listar` (filtros produto/turma/pessoa/status via `Prisma.sql` — R6),
  `detalhe`, `aplicarAjusteManual`.

## Fase 4 — Aplicação `backend/src/contratos/application/`

- [ ] T007 `projetar-contrato-etapa.service.ts` + `.spec.ts` — `ExecutorEtapaExterno` da
  etapa `PROJETAR_CONTRATO` (contracts/pipeline-executor.md).
- [ ] T008 [P] `contrato-query.service.ts` + `.spec.ts` — `listar`/`detalhe`.
- [ ] T009 [P] `ajustar-contrato.service.ts` + `.spec.ts` — `PATCH`, grava `contrato_audit`
  via `montarRegistroAuditoria`.
- [ ] T010 `index.ts` — barrel.

## Fase 5 — API `backend/src/contratos/`

- [ ] T011 [P] `dto/listar-contratos.schema.ts` + `dto/ajustar-contrato.schema.ts` (zod).
- [ ] T012 `contrato.controller.ts` — `GET /contratos`, `GET /contratos/:id`,
  `PATCH /contratos/:id`, `@RequerPermissao('contrato:ver'|'contrato:editar')`.
- [ ] T013 `contratos.module.ts` — providers/controller, `exports: [ProjetarContratoEtapaService]`.
- [ ] T014 `backend/src/auth/rbac/catalogo.ts` — `+2` permissões (`contrato:ver`,
  `contrato:editar`).
- [ ] T015 `backend/src/pipeline-wiring.module.ts` — importar `ContratosModule` +
  `ProjetarContratoEtapaService`; registrar no `WorkerService.definirExecutor`.

## Fase 6 — Testes e2e `backend/test/`

- [ ] T016 `contratos.e2e-spec.ts` — US1 (status derivado/tolerância/expiração pelo relógio),
  US2 (2 transações → 1 contrato, 2 aditivos; reembolso sai de `valorRecebido` sem apagar o
  aditivo), US3 (`PATCH` + limpeza automática no próximo aditivo + `motivo` obrigatório),
  edge cases (oferta não resolvida, tempo de acesso ausente, corrida de criação, RBAC
  403/401, `/health` contexts = 11).
- [ ] T017 Ajustar fixtures/asserções de suítes existentes que dependiam de
  `PROJETAR_CONTRATO` ficar `pulada` (006/018/023/024), mesmo padrão de regressão documentada
  das specs anteriores.

## Fase 7 — Frontend `frontend/src/contratos/`

- [ ] T018 [P] `contratos-api.ts` (tipos + `listar`/`detalhe`/`ajustar`).
- [ ] T019 `ContratosListPage.tsx` + `.test.tsx` — filtros produto/turma/pessoa/status,
  paginação, badge de status.
- [ ] T020 `ContratoDetailPage.tsx` + `.test.tsx` — linha do tempo de aditivos (rótulo +
  data + valor + status da transação), campos curados, formulário de ajuste manual atrás de
  `contrato:editar`.
- [ ] T021 `frontend/src/app/router.tsx` — rotas `/contratos`, `/contratos/:id`.
- [ ] T022 `frontend/src/shell/nav-items.ts` — item **Financeiro · Contratos**
  (`contrato:ver`).

## Fase 8 — Documentação

- [ ] T023 `docs/025-contratos-aditivos-fold.md`.
- [ ] T024 `CLAUDE.md` (seção SPECKIT — plano ativo + arquivar 025, promover 024 a
  `<details>`), `README.md`, `ROADMAP.md` (marcar 025 `[x]`, resumo).

## Fase 9 — Verificação

- [ ] T025 Lint + typecheck + build (backend e frontend); unit + e2e + frontend tests, todos
  verdes.
- [ ] T026 Verificação manual no navegador (dev server) do fluxo completo do quickstart.md.
