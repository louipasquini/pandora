---
description: "Task list for 017-crm-dashboard"
---

# Tasks: CRM · Dashboard

**Input**: Design documents from `/specs/017-crm-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dashboard.md, quickstart.md

**Tests**: incluídos — mesmo padrão de todas as specs 003–016 (unit de domínio sem banco +
e2e contra Postgres real + testes de componente no frontend).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Adicionar o enum `MetaComercialPeriodo` e os models `MetaComercial`,
      `DashboardVisao`, `CrmDashboardAudit` em `backend/prisma/schema.prisma` (ver
      data-model.md), com FKs para `Equipe`/`Usuario`/`Perfil` (`onDelete` conforme a
      tabela) e as back-relations em `Usuario`/`Equipe`/`Perfil`.
- [ ] T002 Rodar `npm run prisma:migrate:dev --workspace backend --name crm_dashboard`;
      revisar o SQL gerado (sem `CHECK`/índice parcial exóticos nesta spec — só índices
      comuns de `data-model.md`).
- [ ] T003 [P] Adicionar as 2 permissões (`dashboard:ver`, `dashboard:gerir_metas`, recurso
      `dashboard`) em `backend/src/auth/rbac/catalogo.ts`; confirmar `assertCatalogoCoerente()`
      e que `prisma/seed.ts` não muda.
- [ ] T004 [P] Registrar os providers/controllers de `dashboard` no `CrmModule`
      (`backend/src/crm/crm.module.ts`) — mesmo padrão dos módulos 007–016; adicionar o
      log `dashboard=<n>` no `onModuleInit` e chamar `assertCatalogoPaineisCoerente()`.

**Checkpoint**: `npx prisma generate` limpo; `npm run lint`/`typecheck` no backend passam
com o schema novo mesmo sem código de aplicação.

## Phase 2: Domínio puro (sem banco) — `backend/src/crm/domain/dashboard/`

- [ ] T005 [P] `paineis.ts` — `PAINEIS_DASHBOARD` (`Object.freeze`) +
      `assertCatalogoPaineisCoerente()` + `painelVisivel(painel, permissoes)` +
      `paineis.spec.ts` (id único; `permissao` pertence ao catálogo RBAC; `visao_geral` sem
      permissão específica; `?formato=csv` só p/ `tabela`/`ranking`).
- [ ] T006 [P] `periodo.ts` — `resolverPeriodo(deISO, ateISO)` → `{ de, ate, anteriorDe,
      anteriorAte, duracaoDias, bucket }`; `de > ate`/data inválida → `throw` (o controller
      converte em 400); `bucket` derivado da duração (D-R5) + `periodo.spec.ts`.
- [ ] T007 [P] `benchmark.ts` — `calcularDelta(valor, anterior)` → `{ delta,
      deltaPercentual: anterior === 0 ? null : … }` + `benchmark.spec.ts` (inclui anterior 0
      e ambos 0).
- [ ] T008 [P] `serie-temporal.ts` — `agruparEmBuckets(pontosDatados, bucket)` →
      `[{ rotulo, valor }]` (fuso `America/Sao_Paulo` via `Intl`, 0 dep) +
      `serie-temporal.spec.ts`.
- [ ] T009 [P] `meta.ts` — `METRICAS_META` (`Object.freeze`) + `periodoDaMeta(periodo,
      referencia)` → `{ inicio, fim }` + `statusMeta(realizado, alvo, { inicio, fim }, agora)`
      → `{ percentual, status, noRitmo }` + `meta.spec.ts` (batida; em_risco quando ritmo
      abaixo; no_caminho; período encerrado; divisão por alvo 0 → percentual `null`/`0`).
- [ ] T010 [P] `ranking.ts` — `combinarRankingComercial(ganhasPorResponsavel,
      pontosTarefaPorResponsavel, nomes)` → lista ordenada por valor ganho (por moeda, nunca
      soma moedas) + `ranking.spec.ts`.
- [ ] T011 [P] `index.ts` (barrel) + `dto/dashboard/dashboard.schema.ts` — zod: filtros do
      dashboard (`de`/`ate` obrigatórios; `equipeId`/`responsavelId`/`pipelineId` uuid
      opcionais; `formato: 'csv'` opcional), `criarMetaSchema`/`atualizarMetaSchema`
      (`metrica` ∈ catálogo; `alvo` = `{valorInt,moeda}` XOR `{valor}` conforme
      `metrica.monetaria`), `criarVisaoSchema`/`atualizarVisaoSchema` (`filtros`/`paineis`
      fechados; id de painel ∈ catálogo).

**Checkpoint**: `npm test --workspace backend` — todos os `*.spec.ts` de domínio verdes,
sem tocar o banco.

## Phase 3: Infra — `backend/src/crm/infra/dashboard/`

- [ ] T012 [P] `metrica.repository.ts` — `DashboardMetricaRepository` (injeta
      `PrismaService`): `contarLeads(where, de, ate)`, `contarLeadsPorOrigem(where, de, ate)`,
      `contarOportunidades(where, de, ate, { entrouEmTipo? })`,
      `agruparOportunidadesPorEtapaEMoeda(where)`, `somarValorEmAberto(where)`,
      `ganhasPorResponsavel(where, de, ate)`, `serieOportunidadesPorDia(where, de, ate)`,
      `tarefasConcluidas(where, de, ate, { noPrazo? })`, `metricasAtendimento(where, de,
      ate)`, `atendimentosPorDia(where, de, ate)` — cada um um `groupBy`/`aggregate`/`count`
      do Prisma. Nenhum estado, nenhum cache.
- [ ] T013 [P] `meta.repository.ts` — CRUD de `meta_comercial` (`criar` gera UUID v7;
      `atualizarCampos`; `remover`; `porId`; `listar(where)`; `equipeExiste`/
      `usuarioExiste`).
- [ ] T014 [P] `visao.repository.ts` — CRUD de `dashboard_visao` (`criar`; `atualizarCampos`;
      `remover`; `porId`; `listarDoDono(usuarioId)`; `listarCompartilhadasComPerfis(perfilIds)`).

## Phase 4: Aplicação — `backend/src/crm/application/dashboard/`

- [ ] T015 `crm-dashboard-audit.service.ts` — espelha `CrmTarefaAuditService` (016):
      `registrar(entidade, entidadeId, acao, antes, depois, req)` via
      `montarRegistroAuditoria` do core; só delta real; append-only.
- [ ] T016 `csv.ts` — `serializarCsv(colunas: string[], linhas: (string|number)[][])` puro
      (escape de `,`/`"`/`\n`) + `csv.spec.ts`.
- [ ] T017 [US1] `paineis.service.ts` — um método por painel, cada um recebendo `(req,
      periodo, filtros)`: resolve o `where` de escopo via o `*ConsultaService` do recurso
      (`OportunidadeConsultaService.escopoDe`, `TarefaConsultaService.escopoDe`,
      `LeadConsultaService.escopoDe`, `AtendimentoConsultaService.escopoDe`), combina com o
      filtro de período/equipe/responsável/pipeline, chama o `DashboardMetricaRepository`,
      aplica a parte pura (`agregarMetricas`/`calcularSlaAtendimento`/`combinarRankingComercial`/
      `agruparEmBuckets`/`calcularDelta`). Métodos: `visaoGeral`, `funilPipeline`,
      `rankingComercial`, `qualidadeAtendimento`, `leadsPorOrigem`, `serieOportunidades`.
- [ ] T018 [US1] `dashboard.service.ts` — `montar(req, filtrosDto)`: `resolverPeriodo`,
      lista `PAINEIS_DASHBOARD` filtrada por `painelVisivel(p, permissoesDoSujeito)`, chama o
      método correspondente de `PaineisService` para cada painel visível, devolve
      `{ periodo, paineis: [...] }`. `painel(req, id, filtrosDto)` — um painel isolado (404
      se `id` ∉ catálogo; 403 se sem permissão; `formato=csv` → `serializarCsv`, 400 se
      painel não-tabular). `catalogo(req)` — lista com `visivel`.
- [ ] T019 [US4] `meta.service.ts` — `listar(req, {periodo, referencia})` (default período
      corrente) devolvendo cada meta + atingimento (`realizado` via `PaineisService`/
      `DashboardMetricaRepository` restrito ao escopo da meta; `statusMeta`); `criar`/
      `atualizar`/`remover` sob `dashboard:gerir_metas` (valida `metrica` ∈ catálogo,
      coerência `alvo`/`moeda`, existência de `equipeId`/`responsavelId`; `metrica`/`periodo`/
      `referencia` imutáveis no `PATCH`); audita via T015.
- [ ] T020 [US4] `meta-notificacao.service.ts` — `notificacoes(req)`: metas do sujeito
      (todas se `dashboard:gerir_metas`/`administrador`; senão escopo `responsavelId = sub`
      ∪ equipes do sujeito) com `status ∈ {em_risco, batida, estourada}` no período
      corrente. In-app, sem envio externo.
- [ ] T021 [US5] `visao.service.ts` — `listar(req)` (próprias + compartilhadas com perfis do
      sujeito, `somenteLeitura`/`dono` marcados); `criar` (credencial de serviço → 400; id
      de painel ∉ catálogo → 422; audita); `atualizar`/`remover` (só o dono → senão 403;
      audita); `clonar` (cópia com dono = sub, sem compartilhamento, nome + " (cópia)").
- [ ] T022 [P] `index.ts` (barrel) da aplicação.

## Phase 5: Controller + wiring

- [ ] T023 `dashboard.controller.ts` — todas as rotas de `contracts/dashboard.md`
      (`/crm/dashboard`, `/crm/dashboard/paineis[/:id]`, `/crm/dashboard/metas[/:id]`,
      `/crm/dashboard/notificacoes`, `/crm/dashboard/visoes[/:id][/clonar]`). `@RequerPermissao`/
      `@AutenticadoBasta` conforme o contrato; `ZodValidationPipe` nos bodies/queries;
      `resolverPeriodo` que lança → `BadRequestException`. CSV → `res.type('text/csv')` +
      `Content-Disposition`.
- [ ] T024 Finalizar o wiring no `CrmModule` (T004): todos os `*Repository`/`*Service`/
      `DashboardController` nos arrays; `assertCatalogoPaineisCoerente()` no `onModuleInit`.

## Phase 6: e2e — `backend/test/`

- [ ] T025 [P] [US1] `dashboard-paineis.e2e-spec.ts` — semear leads/oportunidades/tarefas/
      atendimentos num período conhecido; `GET /crm/dashboard?de=&ate=` devolve cada painel
      com `valor`/`periodoAnterior`/`delta`; conferir contra query direta (SC-001); período
      anterior cobre os N dias antes de `de`; `de > ate` → 400; sujeito só com `dashboard:ver`
      → página 200 com painéis restritos (FR-006).
- [ ] T026 [P] [US2] `dashboard-funil-ranking.e2e-spec.ts` — funil por etapa (qtd + valor
      por moeda, nunca soma moedas) reusando `agregarMetricas`; ranking ordenado por valor
      ganho + pontos de tarefa; sujeito com `oportunidade:ver_proprias` **não** vê o painel
      `ranking_comercial` na lista (não 403).
- [ ] T027 [P] [US3] `dashboard-atendimento.e2e-spec.ts` — tempo médio de 1ª resposta / %
      SLA / CSAT / distribuição / taxa de resolução / por atendente; atendimento sem
      resposta não entra no denominador do tempo médio; escopo `ver_proprios` restringe.
- [ ] T028 [P] [US4] `dashboard-metas.e2e-spec.ts` — criar meta (contagem e monetária);
      `realizado`/`status` derivados refletem o estado; `em_risco` → aparece em
      `/notificacoes`; sem `dashboard:gerir_metas` → 403 na escrita, 200 na leitura;
      `equipeId`/`responsavelId` inexistente → 422; `metrica` fora do catálogo → 422;
      `DELETE` remove + audita.
- [ ] T029 [P] [US5] `dashboard-visoes.e2e-spec.ts` — salvar/reidratar visão idêntica;
      compartilhar com perfil → outro sujeito do perfil vê `somenteLeitura:true` e pode
      clonar; editar/excluir alheia → 403; `?formato=csv` em painel tabular → `text/csv` com
      cabeçalho estável; `?formato=csv` em `funil` → 400; credencial de serviço criando
      visão → 400.
- [ ] T030 [P] `dashboard-fronteira.e2e-spec.ts` — `grep` garante 0 import de
      `src/clientes/**` em `src/crm/**/dashboard/**`; nenhuma tabela `*_rollup`/`*_metrica`
      no schema (SC-003).

## Phase 7: Frontend — `frontend/src/dashboard/`

- [ ] T031 [P] Rota `crm/dashboard` em `frontend/src/app/router.tsx` sob
      `<RequirePermissao perm="dashboard:ver">`; item **CRM · Dashboard** em
      `frontend/src/shell/nav-items.ts` atrás de `dashboard:ver`.
- [ ] T032 [US1] `DashboardPage.tsx` — seletor de período (default "últimos 30 dias") +
      filtros equipe/responsável/pipeline; carrega `GET /crm/dashboard`; renderiza os painéis
      visíveis; folha `@media print` que esconde nav/controles; botão "Imprimir / PDF"
      (`window.print()`). Hooks TanStack Query inline (padrão `whatsapp/WhatsappAdminPage.tsx`).
- [ ] T033 [P] [US1] `paineis/PainelVisaoGeral.tsx` — cartões numéricos com seta ↑/↓ e % do
      delta período-a-período.
- [ ] T034 [P] [US2] `paineis/PainelFunil.tsx` — funil/barras em **SVG à mão** (qtd + valor
      por moeda + tempo médio por etapa); `paineis/PainelSerieTemporal.tsx` — linha/área SVG.
- [ ] T035 [P] [US2] `paineis/PainelRankingComercial.tsx` — tabela ordenada + "Exportar CSV"
      (`exportar-csv.ts` via `Blob`, helper copiado de `disparos/`).
- [ ] T036 [P] [US3] `paineis/PainelQualidadeAtendimento.tsx` — cartões (tempo médio 1ª
      resposta, % SLA, CSAT, taxa de resolução) + mini-série por dia em SVG.
- [ ] T037 [US4] `MetasPanel.tsx` — lista com barra de progresso + badge de status; CRUD
      atrás de `dashboard:gerir_metas`; `NotificacoesMetaBadge.tsx` com `refetchInterval` 60s.
- [ ] T038 [US5] `VisoesBar.tsx` — salvar recorte atual, abrir, clonar, compartilhar com
      perfil.
- [ ] T039 [P] Testes de componente (Vitest/RTL, `fireEvent` — sem `user-event`, padrão
      `pipelines/PipelinesPage.test.tsx`): `DashboardPage` monta os painéis do mock;
      `PainelVisaoGeral` mostra o delta; `MetasPanel` esconde o CRUD sem permissão;
      `exportar-csv` gera o Blob com o cabeçalho certo.

## Phase 8: Polish & docs

- [ ] T040 `npm run lint`/`typecheck`/`build` limpos nos dois workspaces; `npm test` (unit)
      + `npm run test:e2e` (Postgres real, porta livre) + `npm test --workspace frontend`
      todos verdes.
- [ ] T041 Validação manual no navegador (ver quickstart.md): abrir o dashboard, trocar o
      período, filtrar por equipe, ver o delta, exportar um CSV, imprimir, criar uma meta e
      ver o atingimento + a notificação, salvar e reabrir uma visão, compartilhar com um
      perfil.
- [ ] T042 Atualizar `CLAUDE.md` (bloco da stack + "Plano ativo" → arquivar 016, ativar
      017), `README.md` (frente CRM, se precisar), `ROADMAP.md` (marcar 017 `[x]` com o
      resumo), e criar `docs/017-crm-dashboard.md`.

## Dependency Notes

- Phase 1 → 2 → (3 ∥ parte de 4). T017 depende de T005–T012. T018 depende de T017.
  T019/T020 dependem de T017 + T015. T021 depende de T014 + T015.
- Controller (T023) depois de toda a Phase 4. e2e (Phase 6) depois do controller + wiring.
- Frontend (Phase 7) depois dos contratos estáveis (pode começar em paralelo com a Phase 6
  usando o `contracts/dashboard.md` como referência).
- `[P]` = arquivos distintos, sem dependência mútua — podem ir juntos.
