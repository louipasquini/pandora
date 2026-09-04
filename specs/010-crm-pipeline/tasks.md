# Tasks: Pipeline de Vendas do CRM — pipelines, oportunidades, atribuição e SLA

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Branch**: `010-crm-pipeline`

Convenção: `[P]` = paralelizável (arquivos diferentes, sem dependência entre si).
`[USn]` mapeia à user story do `spec.md` (US1/US2/US3 = P1, US4/US5 = P2, US6/US7 = P3).

## Fase 1 — Schema e migração

- [x] T001 `backend/prisma/schema.prisma`: + enums `EtapaPipelineTipo`, `ModoAtribuicao`,
      `RegraAtribuicaoCampo`; + models `Pipeline`, `EtapaPipeline`, `Oportunidade`,
      `OportunidadeMovimentacao`, `RegraAtribuicaoPipeline`,
      `CampoPersonalizadoOportunidade`, `ValorCampoOportunidade`, `CrmPipelineAudit`;
      relações inversas em `Lead`, `Pessoa`, `Equipe`, `Usuario`.
- [x] T002 Gerar a migração (`prisma migrate dev --name crm_pipeline`) e editar o SQL
      gerado: acrescentar o `CHECK` de âncora XOR de `oportunidade`, o `CHECK` de motivo
      obrigatório não é viável em SQL puro (fica no service — anotar comentário no
      `schema.prisma` como nas specs anteriores), confirmar `@@unique([pipelineId, ordem])`
      em `etapa_pipeline`/`regra_atribuicao_pipeline`.
- [x] T003 Rodar a migração + regenerar `@prisma/client`; confirmar que
      `test/setup-db.ts` aplica limpo num schema novo.

## Fase 2 — Domínio puro (sem banco) `[P]` entre arquivos diferentes

- [x] T004 [P] `backend/src/crm/domain/pipeline/ancora.ts` + `.spec.ts` — reusa/replica
      `validarAncora({pessoaId,leadId})` da 009 no namespace de `pipeline`.
- [x] T005 [P] `backend/src/crm/domain/pipeline/sla.ts` + `.spec.ts` —
      `calcularSlaEstourado(slaHoras, entrouEtapaEm, agora)`.
- [x] T006 [P] `backend/src/crm/domain/pipeline/esfriando.ts` + `.spec.ts` —
      `calcularEsfriando(diasEsfriando, ultimaReferencia, agora)`.
- [x] T007 [P] `backend/src/crm/domain/pipeline/atribuicao.ts` + `.spec.ts` —
      `escolherProximoRodizio(membrosAtivos, cursorAtual)`,
      `avaliarRegras(regrasOrdenadas, contexto)`.
- [x] T008 [P] `backend/src/crm/domain/pipeline/movimentacao.ts` + `.spec.ts` —
      `validarMovimento({etapaAtual, etapaDestino, motivo})` (mesmo pipeline; motivo
      obrigatório sse destino `PERDIDA`; no-op se destino = atual).
- [x] T009 [P] `backend/src/crm/domain/pipeline/metricas.ts` + `.spec.ts` —
      `agregarMetricas(linhasGroupBy)` (soma por moeda, taxa de conversão).
- [x] T010 [P] `backend/src/crm/domain/pipeline/index.ts` — barrel.

## Fase 3 — Persistência (infra)

- [x] T011 [P] `backend/src/crm/infra/pipeline/pipeline.repository.ts` — CRUD de
      `pipeline`/`etapa_pipeline` (com checagem de uso antes de `DELETE` de etapa).
- [x] T012 [P] `backend/src/crm/infra/pipeline/oportunidade.repository.ts` — criar, obter,
      listar (com filtros + escopo no `where`), atualizar campos gerais, `groupBy` para
      métricas.
- [x] T013 [P] `backend/src/crm/infra/pipeline/movimentacao.repository.ts` — criar
      movimentação + atualizar `etapaId`/`entrouEtapaEm` da oportunidade na mesma
      transação; listar histórico.
- [x] T014 [P] `backend/src/crm/infra/pipeline/regra-atribuicao.repository.ts` —
      substituir lista completa (transação apaga+recria).
- [x] T015 [P] `backend/src/crm/infra/pipeline/campo-oportunidade.repository.ts` — mesmo
      padrão de `campo_personalizado_lead`/`valor_campo_lead` (008), trocando a FK.
- [x] T016 [P] `backend/src/crm/infra/pipeline/index.ts` — barrel.

## Fase 4 — Aplicação (serviços + auditoria)

- [x] T017 `backend/src/crm/application/pipeline/crm-pipeline-audit.service.ts` —
      simétrico a `CrmInteracaoAuditService`.
- [x] T018 [US1] `backend/src/crm/application/pipeline/pipeline.service.ts` — CRUD de
      `pipeline`/`etapa_pipeline`, validação `RODIZIO`/`REGRA` exige `equipeId`, `DELETE`
      de etapa em uso → 409.
- [x] T019 [US4] `backend/src/crm/application/pipeline/atribuicao.service.ts` —
      `PUT`/`GET` de regras + fallback; `resolverResponsavel(pipeline, contexto,
      responsavelIdExplicito?)` chamando o domínio puro (T007) com membros ativos da
      `equipe` (007); persiste o cursor de rodízio.
- [x] T020 [US1] `backend/src/crm/application/pipeline/oportunidade.service.ts` — `criar`
      (valida pipeline pronto, âncora XOR, resolve responsável via T019, grava 1ª
      movimentação), `atualizar` (campos gerais, nunca etapa), `obterPorId`.
- [x] T021 [US3] `backend/src/crm/application/pipeline/oportunidade-consulta.service.ts` —
      `listar`/`obter` aplicando escopo `ver_todas`\|`ver_proprias` no `where`; agrega
      `slaEstourado`/`esfriando` (T005/T006) por linha, incluindo busca em lote da última
      `interacao` por âncora (evitar N+1 — `groupBy`/`Map` em memória).
- [x] T022 [US2] `backend/src/crm/application/pipeline/mover-oportunidade.service.ts` —
      usa T008, grava movimentação (T013), audita reabertura/edição de campos gerais (não
      a movimentação em si) quando aplicável.
- [x] T023 [US6] `backend/src/crm/application/pipeline/campo-oportunidade.service.ts` —
      mesmo padrão do `CampoPersonalizadoLeadService` (008).
- [x] T024 [US6] `backend/src/crm/application/pipeline/metricas.service.ts` — `groupBy`
      Prisma por `[etapaId, moeda]` + tempo médio na etapa (`ABERTA`) + `agregarMetricas`
      (T009), respeitando escopo (`ver_proprias` filtra antes do `groupBy`).
- [x] T025 `backend/src/crm/application/pipeline/porta-observacao-pagamento.service.ts` —
      implementa `PortaObservacaoPagamentoCrm` (FR-023): busca oportunidades `ABERTA` da
      pessoa, move para a 1ª etapa `GANHA` do respectivo pipeline via T022,
      `movidoPorId: null`.
- [x] T026 `backend/src/crm/application/pipeline/index.ts` — barrel.

## Fase 5 — HTTP (controllers + DTOs)

- [x] T027 [P] `backend/src/crm/dto/criar-pipeline.schema.ts`,
      `criar-etapa-pipeline.schema.ts`, `atribuicao-pipeline.schema.ts` (zod).
- [x] T028 [P] `backend/src/crm/dto/criar-oportunidade.schema.ts`,
      `atualizar-oportunidade.schema.ts`, `mover-oportunidade.schema.ts` (zod; valor
      monetário via `Dinheiro.deInteiroEscalado` na borda).
- [x] T029 [P] `backend/src/crm/dto/campo-oportunidade.schema.ts`.
- [x] T030 [US1] `backend/src/crm/pipeline.controller.ts` — `POST`/`GET`/`PATCH
      /crm/pipelines`, `POST`/`GET`/`PATCH`/`DELETE /crm/pipelines/:id/etapas[/:etapaId]`,
      `PUT`/`GET /crm/pipelines/:id/atribuicao`, `GET /crm/pipelines/:id/metricas`.
- [x] T031 [US1] [US2] [US3] `backend/src/crm/oportunidade.controller.ts` —
      `POST`/`GET /crm/oportunidades`, `GET`/`PATCH /crm/oportunidades/:id`,
      `POST /crm/oportunidades/:id/mover`, `GET /crm/oportunidades/:id/movimentacoes`,
      `GET /crm/pessoas/:id/oportunidades`, `GET /crm/leads/:id/oportunidades`.
- [x] T032 [US6] `backend/src/crm/campo-oportunidade.controller.ts` —
      `POST`/`GET`/`PATCH /crm/admin/campos-oportunidade`,
      `PUT /crm/oportunidades/:id/campos-personalizados`.

## Fase 6 — RBAC e módulo

- [x] T033 `backend/src/auth/rbac/catalogo.ts` — +6 permissões
      (`oportunidade:{criar,editar,mover,ver_todas,ver_proprias}`,
      `crm_admin:gerir_pipelines`); `catalogo.spec.ts` ganha a asserção.
- [x] T034 `backend/src/crm/crm.module.ts` — registra os 3 controllers novos + providers;
      `exports: [..., PortaObservacaoPagamentoCrm]` (token de injeção).

## Fase 7 — Testes de integração (e2e, Postgres real)

- [x] T035 `backend/test/support/crm-pipeline.ts` — helpers (criar pipeline+etapas,
      criar oportunidade, mover, ler auditoria/movimentação, criar equipe com membros
      via helper da 007).
- [x] T036 [US1] `backend/test/crm-pipeline.e2e-spec.ts` — pipeline/etapa CRUD; `DELETE`
      etapa em uso → 409; oportunidade nasce na etapa correta; pipeline sem etapa `ABERTA`
      → 422; âncora XOR → 422/404.
- [x] T037 [US2] mesmo arquivo — mover: mesmo pipeline obrigatório, `PERDIDA` sem motivo →
      422, com motivo → sucede, no-op na mesma etapa, reabertura sem motivo,
      `oportunidade_movimentacao` completo e ordenado.
- [x] T038 [US3] mesmo arquivo — escopo `ver_todas`/`ver_proprias` em lista/detalhe/
      histórico/métricas; credencial de serviço = `ver_todas`.
- [x] T039 [US4] mesmo arquivo — round robin distribui e pula inativo; equipe sem membro
      ativo → sem responsável; regra casa/fallback; `responsavelId` explícito sempre vence.
- [x] T040 [US5] mesmo arquivo — `slaEstourado`/`esfriando` calculados e filtráveis,
      recalculados a cada leitura (fixture com `entrouEtapaEm`/`interacao` no passado).
- [x] T041 [US6] mesmo arquivo — campos personalizados (validação por tipo, substituição
      total); métricas (soma por moeda, `taxaConversao`, pipeline vazio → zerado).
- [x] T042 `backend/test/crm-pipeline-porta.spec.ts` (ou suíte de integração equivalente) —
      `PortaObservacaoPagamentoCrm`: move oportunidade `ABERTA` para `GANHA`; idempotente;
      sem oportunidade `ABERTA` → no-op.
- [x] T043 Guard 401/403/2xx em toda rota nova; `GET /admin/rbac/permissoes` inclui as 6
      novas; regressão 003–009 + `/health` (11 contextos) verdes.

## Fase 8 — Frontend

- [x] T044 [P] `frontend/src/pipelines/pipelines-api.ts` — `apiFetch` tipado (pipeline,
      etapa, oportunidade, mover, atribuição, campos, métricas).
- [x] T045 [P] `frontend/src/pipelines/use-pipelines.ts` /
      `frontend/src/pipelines/use-oportunidades.ts` — hooks TanStack Query.
- [x] T046 [US7] `frontend/src/pipelines/kanban-board.tsx` — colunas por etapa,
      drag-and-drop HTML5 nativo (ver `research.md`), indicadores de SLA/esfriando no card.
- [x] T047 [US7] `frontend/src/pipelines/oportunidade-card.tsx`.
- [x] T048 [US2] [US7] `frontend/src/pipelines/mover-motivo-modal.tsx` — pede motivo ao
      soltar em etapa `PERDIDA`; cancelar reverte o drag sem chamar a API.
- [x] T049 [US1] [US7] `frontend/src/pipelines/pipelines-page.tsx` — seletor de pipeline +
      board.
- [x] T050 [US1] [US4] [US6] `frontend/src/pipelines/pipeline-admin.tsx` — CRUD de
      pipeline/etapa/atribuição/campos personalizados, atrás de
      `crm_admin:gerir_pipelines`.
- [x] T051 [US6] `frontend/src/pipelines/metricas-panel.tsx`.
- [x] T052 `frontend/src/shell/nav-items.ts` — + **CRM · Pipelines**
      (`oportunidade:ver_todas`\|`ver_proprias`).
- [x] T053 `frontend/src/app/router.tsx` — rota `/crm/pipelines` sob `RequirePermissao`
      (`anyOf`).
- [x] T054 `frontend/src/test/setup.ts` — defaults para as novas rotas + novas permissões
      em `TODAS_PERMISSOES`.
- [x] T055 [P] `*.test.tsx` para T046/T048/T050 (Testing Library): drag chama `mover`;
      motivo obrigatório em `PERDIDA`; sem `oportunidade:mover` → sem drag handle;
      administração atrás de `crm_admin:gerir_pipelines`.

## Fase 9 — Qualidade e documentação

- [x] T056 `npm run lint && npm run typecheck && npm run build` — verde.
- [x] T057 `npm test` (unit backend + frontend) verdes localmente; `npm run test:e2e`
      contra Postgres real (schema isolado) — se o ambiente não tiver Docker/Postgres,
      registrar explicitamente a ressalva (mesmo precedente da 009, que só confirmou e2e
      na CI do PR).
- [x] T058 `docs/010-crm-pipeline.md` — novo (padrão dos docs 001–009).
- [x] T059 `CLAUDE.md` — seção Stack ganha o bloco condensado de 010; plano ativo (SPECKIT)
      aponta para 010 (a mais recente implementada); 009 arquivada em `<details>`.
- [x] T060 `README.md` — seção Status/estrutura ganha a 010.
- [x] T061 `ROADMAP.md` — marca 010 como `[x]` implementada e validada; atualiza "Próxima".
- [x] T062 Commit (+ push do branch `worktree-010-crm-pipeline`), mesma convenção das
      specs anteriores.

## Dependências entre fases

Fase 1 → 2/3 (schema precisa existir antes de repositórios; domínio puro não depende do
schema, mas os testes de repositório sim) → 4 (aplicação depende de domínio+infra; T019
antes de T020 — atribuição resolve responsável na criação) → 5 (controllers dependem de
aplicação) → 6 (módulo registra os controllers; RBAC pode ser paralelo a 2–5) → 7 (e2e
depende de tudo montado) → 8 (frontend consome os endpoints da fase 5) → 9 (fecha com
lint/test/build/docs).

## Estratégia de entrega incremental (MVP)

- **MVP mínimo**: Fases 1–6 + US1/US2/US3 (T001–T022 exceto T019/T023–T025, T027–T028,
  T030–T031, T033–T034) já entregam pipeline configurável + oportunidade + mover com
  motivo + escopo de visão — utilizável manualmente via `curl`/Postman mesmo sem
  atribuição automática (`modoAtribuicao: MANUAL` default) e sem frontend.
- Atribuição automática (US4) e SLA/esfriando (US5) são aditivos — não bloqueiam o MVP.
- Campos personalizados + métricas (US6) e o board Kanban (US7) fecham a fatia completa da
  visão 8.7.
