# Tasks: CRM · Workflow (Motor de Automação)

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Branch**: `014-crm-workflow`

Convenção: `[P]` = paralelizável (arquivos diferentes, sem dependência entre si). `[USn]`
mapeia à user story do `spec.md` (US1=P1 criar/publicar, US2=P1 simulação, US3=P2 editar sem
afetar publicada, US4=P2 biblioteca de modelos, US5=P3 histórico de execuções).

## Fase 1 — Schema e migração

- [ ] T001 `backend/prisma/schema.prisma`: + enums `FluxoGatilhoTipo`, `FluxoVersaoStatus`,
      `FluxoRegistroTipo`, `FluxoExecucaoResultado`; + models `FluxoAutomacao`,
      `FluxoAutomacaoVersao`, `ExecucaoFluxo`, `FluxoModelo`, `FluxoCursorFonte` (bounded
      context `crm`) — ver data-model.md.
- [ ] T002 Gerar a migração (`prisma migrate dev --name crm_workflow`) e editar o SQL gerado:
      índice único **parcial** `(fluxo_id) WHERE status = 'PUBLICADA'` em
      `fluxo_automacao_versao` via SQL bruto (Prisma não modela índice parcial, mesmo padrão
      007/008/009/010/012).
- [ ] T003 Rodar a migração + regenerar `@prisma/client`; confirmar `test/setup-db.ts` limpo
      num schema novo.

## Fase 2 — Domínio puro (sem banco) `[P]` entre arquivos diferentes

- [ ] T004 [P] `backend/src/crm/domain/workflow/tipos.ts` — tipos + schemas `zod` de
      `CondicaoNo`/`AcaoFluxo` (contracts/workflow.md); `condicaoVaziaPadrao()` = grupo `E`
      sem itens.
- [ ] T005 [P][US1] `backend/src/crm/domain/workflow/avaliar-condicao.ts` + `.spec.ts` —
      `avaliarCondicao(no, contexto)`: cada operador, grupos `E`/`OU` (incl. aninhados),
      grupo vazio → `true`, campo ausente no contexto tratado sem lançar (research.md).
- [ ] T006 [P][US1] `backend/src/crm/domain/workflow/catalogo-gatilho.ts` + `.spec.ts` —
      `camposDoGatilho(tipo)` (research.md D-R3), `acoesCompativeis(tipo)` (contracts/
      workflow.md); `EVENTO_EXTERNO` não restringe.
- [ ] T007 [P][US1] `backend/src/crm/domain/workflow/validar-fluxo.ts` + `.spec.ts` —
      `validarCondicoes(gatilhoTipo, condicoes)` (campo fora do catálogo → erro),
      `validarAcoes(gatilhoTipo, acoes)` (tipo incompatível → erro); `validarParaPublicar`
      soma as duas + exige `gatilhoTipo` definido (a checagem de motivo obrigatório em etapa
      `PERDIDA`, que depende de consultar a `EtapaPipeline` no banco, fica na Fase 4 —
      `fluxo.service.ts`, não no domínio puro).
- [ ] T008 [P] `backend/src/crm/domain/workflow/index.ts` — barrel.

## Fase 3 — Persistência (infra)

- [ ] T009 [P][US1] `backend/src/crm/infra/workflow/fluxo.repository.ts` — CRUD de
      `FluxoAutomacao`/`FluxoAutomacaoVersao`: criar fluxo+v1, obter fluxo com
      publicada+rascunho atuais, listar (com filtro `gatilhoTipo`/status derivado), atualizar
      rascunho in-place, `publicar` (transação: rascunho→`PUBLICADA` + publicada
      anterior→`ARQUIVADA`), `arquivar` (publicada→`ARQUIVADA` direto), `listarVersoes`.
- [ ] T010 [P][US5] `backend/src/crm/infra/workflow/execucao.repository.ts` — `existe(chave)`,
      `registrar(...)`, `listarPorFluxo`/`obterPorId` (paginação por cursor).
- [ ] T011 [P][US4] `backend/src/crm/infra/workflow/modelo.repository.ts` — `listar`,
      `obterPorId` (leitura só; escrita é seed, T029).
- [ ] T012 [P] `backend/src/crm/infra/workflow/cursor.repository.ts` — `obter(fonte)`,
      `avancar(fonte, {ultimoCriadoEm, ultimoId})` (upsert).
- [ ] T013 [P] `backend/src/crm/infra/workflow/fontes.repository.ts` — leitura das trilhas
      já existentes por cursor: `crm_lead_audit` (`campo='criado'` / `campo='estagio'`),
      `oportunidade_movimentacao`, `interacao` (`lead_id IS NOT NULL`), `tag_associacao`
      (`lead_id IS NOT NULL`) — cada método devolve linhas ordenadas por `(criadoEm, id)`
      após o cursor, até um lote (`CRM_WORKFLOW_WORKER_LOTE`).
- [ ] T014 [P] `backend/src/crm/infra/workflow/index.ts` — barrel.

## Fase 4 — Aplicação (serviços)

- [ ] T015 [US1][US3] `backend/src/crm/application/workflow/fluxo.service.ts` — `criar`,
      `atualizarMetadado`, `obter`, `listar`, `substituirRascunho` (valida forma via T007;
      cria rascunho novo se não houver um), `publicar` (roda `validarParaPublicar` + checagem
      de motivo obrigatório para `MOVER_OPORTUNIDADE_ETAPA` em etapa `PERDIDA`, consultando
      `PipelineRepository` da spec 010 — `422 motivo_obrigatorio` se faltar), `arquivar`
      (`409` sem publicada), `listarVersoes`.
- [ ] T016 [US2] `backend/src/crm/application/workflow/simulacao.service.ts` — `simular(fluxoId,
      {versaoId?, registroTipo, registroId})`: resolve a versão (rascunho atual ou publicada),
      monta o contexto do registro (reaproveita o mesmo builder de contexto de T019),
      compara `registroTipo` esperado pelo `gatilhoTipo` (`LEAD_*`/`INTERACAO_REGISTRADA`/
      `TAG_APLICADA` → `LEAD`; `OPORTUNIDADE_ETAPA_MUDOU` → `OPORTUNIDADE`) — devolve
      `gatilhoCompativel:false` sem avaliar nada se não bater; nunca escreve.
- [ ] T017 [US4] `backend/src/crm/application/workflow/modelo.service.ts` — `listar`,
      `usarComoBase(modeloId, {nome, descricao})` → cria fluxo+v1 rascunho copiando
      `gatilhoTipo`/`condicoes`/`acoes` do modelo (T009).
- [ ] T018 [US1] `backend/src/crm/application/workflow/executar-acao.service.ts` — dispatch
      por `AcaoFluxo.tipo`, cada um chamando o serviço já existente correspondente com
      `autor`/ator do sistema (constante `'sistema:workflow'`, ver research.md):
      `MOVER_LEAD_ESTAGIO` → `LeadRepository.atualizar` + `CrmLeadAuditService.registrar`
      (campo `estagio`, motivo `workflow`; no-op se já está no estágio destino — sem
      auditoria duplicada) + `LeadScoreService.recalcular`; `APLICAR_TAG`/`REMOVER_TAG` →
      `TagService.associar`/`desassociar({tipo:'lead', id}, tag, null, 'sistema:workflow')`
      (já idempotente); `REGISTRAR_NOTA` → `RegistrarInteracaoService.registrar({leadId,
      tipo:'NOTA', conteudo}, {canalOrigem:'workflow:'+fluxoVersaoId, idExterno:
      fonteRegistroId})`; `MOVER_OPORTUNIDADE_ETAPA` → `validarMovimento` (domínio 010) +
      `MovimentacaoRepository.mover({..., movidoPorId:null, motivo})`; cada executor lança em
      caso de falha (etapa removida, etc.) — o chamador (T019) captura e marca a ação como
      `falhou`.
- [ ] T019 [US1] `backend/src/crm/application/workflow/worker.service.ts` —
      `processarPassada()`: para cada uma das 5 fontes reais (T013), lê o lote desde o
      cursor; para cada linha, busca fluxos com versão `PUBLICADA` cujo `gatilhoTipo` bate
      com a fonte (T009); para cada um, pula se `execucao.existe(chave)` (T010, D-06); monta
      o contexto do registro atual (lead/oportunidade — reaproveitado por T016), avalia
      `avaliarCondicao` (T005); se falsa, registra `CONDICAO_NAO_SATISFEITA`; se verdadeira,
      roda as ações em ordem via T018, para na 1ª falha, registra `EXECUTADA`\|`FALHOU` com
      `acoesAplicadas`; ao fim do lote de cada fonte, avança o cursor (T012) até a última
      linha lida (mesmo sem match de fluxo nenhum); devolve um resumo
      `{fontesVarridas, execucoesCriadas, execucoesFalharam}`.
- [ ] T020 [US1] `backend/src/crm/application/workflow/worker.scheduler.ts` — `setInterval`
      in-house ligado por `CRM_WORKFLOW_WORKER_ENABLED`, intervalo
      `CRM_WORKFLOW_WORKER_INTERVALO_MS`, mutex `rodando` (cópia estrutural de
      `backend/src/ingestao/application/worker.scheduler.ts`, ver research.md D-R5).
- [ ] T021 [P] `backend/src/crm/application/workflow/index.ts` — barrel.

## Fase 5 — RBAC, config e DTOs

- [ ] T022 `backend/src/auth/rbac/catalogo.ts` — `+1` permissão: `crm_admin:gerir_workflow`
      ("Criar, editar, publicar, arquivar e simular fluxos de automação; rodar o worker
      manualmente"); leitura reaproveita `crm_admin:ver` já existente.
- [ ] T023 `backend/src/config/env.schema.ts` — `+3` variáveis: `CRM_WORKFLOW_WORKER_ENABLED`
      (bool, default `true`), `CRM_WORKFLOW_WORKER_INTERVALO_MS` (int, default `15_000`),
      `CRM_WORKFLOW_WORKER_LOTE` (int, default `50`) — mesmo padrão de `INGESTAO_WORKER_*`.
- [ ] T024 `backend/test/setup-db.ts` — força `process.env.CRM_WORKFLOW_WORKER_ENABLED =
      'false'`, mesmo padrão de `INGESTAO_WORKER_ENABLED`.
- [ ] T025 [P] `backend/src/crm/dto/workflow/*.schema.ts` — schemas `zod` de entrada de cada
      endpoint (criar fluxo, atualizar metadado, substituir rascunho, simular, usar-como-base,
      listar execuções) — ver contracts/workflow.md.

## Fase 6 — HTTP e módulo

- [ ] T026 `backend/src/crm/workflow.controller.ts` — todas as rotas `/crm/workflow/**` de
      contracts/workflow.md, `@RequerPermissao('crm_admin:ver')`/`('crm_admin:gerir_workflow')`
      por rota.
- [ ] T027 `backend/src/crm/crm.module.ts` — registra os repositórios/serviços/controller
      novos (Fases 3–6) nos arrays `providers`/`controllers`; `WorkerScheduler` novo entra
      como provider comum (Nest o instancia e chama `onModuleInit` automaticamente, mesmo
      padrão do `WorkerScheduler` da 006 em `IngestaoModule`).

## Fase 7 — Biblioteca de modelos (seed)

- [ ] T028 [P][US4] `backend/prisma/seed.ts` — semear ao menos 3 `fluxo_modelo` (idempotente
      por `nome` único ou `upsert` por um slug estável): "Boas-vindas a lead novo"
      (`LEAD_CRIADO`, sem condição, ação `REGISTRAR_NOTA`), "Tag por origem do site"
      (`LEAD_CRIADO`, condição `origem = site`, ação `APLICAR_TAG` "site"), "Marcar
      interesse em reengajamento" (`INTERACAO_REGISTRADA`, sem condição, ação `APLICAR_TAG`
      "reengajar").

## Fase 8 — Testes e2e (Postgres real)

- [ ] T029 `backend/test/crm-workflow.e2e-spec.ts` — cenários de plan.md §Testing: ciclo de
      vida (criar/rascunho/publicar/editar-sem-afetar-publicada/arquivar + validação 422),
      simulação sem efeito colateral, execução reativa via `POST /crm/workflow/processar`
      (tag aplicada, condição não satisfeita, idempotência D-06, falha isolada não derruba a
      passada, `MOVER_OPORTUNIDADE_ETAPA` para `PERDIDA` sem motivo bloqueado no publicar),
      biblioteca de modelos (listar + usar-como-base), guard/escopo (401/403), regressão
      `/health` com 11 contextos.

## Fase 9 — Frontend

- [ ] T030 [P][US1] `frontend/src/workflow/FluxosPage.tsx` + `.test.tsx` — lista de fluxos
      com status (rascunho/publicado/arquivado), atrás de `crm_admin:ver`; botão "Novo fluxo".
- [ ] T031 [US1][US3] `frontend/src/workflow/FluxoDetalhePage.tsx` + `.test.tsx` — editor de
      gatilho (select fechado) + condições (árvore E/OU com selects de campo/operador/valor,
      catálogo por gatilho vindo do backend ou espelhado no frontend) + ações (lista fechada
      com formulário por tipo); botões Salvar rascunho/Publicar/Arquivar condicionados a
      `crm_admin:gerir_workflow`.
- [ ] T032 [US2] `frontend/src/workflow/SimulacaoPanel.tsx` + `.test.tsx` — escolher
      lead/oportunidade (busca por id/nome, reaproveitando padrão de busca já usado em
      Pipelines) + rodar simulação + mostrar resultado.
- [ ] T033 [P][US4] `frontend/src/workflow/ModelosPage.tsx` + `.test.tsx` — lista de modelos
      + "usar como base" (abre modal de nome do novo fluxo).
- [ ] T034 [US5] `frontend/src/workflow/ExecucoesTab.tsx` + `.test.tsx` — histórico de
      execuções do fluxo (dentro de `FluxoDetalhePage`), com resultado e `erroDetalhe`.
- [ ] T035 `frontend/src/nav-items.ts` + `frontend/src/router.tsx` — item **CRM · Workflow**
      atrás de `crm_admin:ver`, rotas `/crm/workflow`, `/crm/workflow/:id`,
      `/crm/workflow/modelos`.

## Fase 10 — Documentação

- [ ] T036 `docs/014-crm-workflow.md` — resumo técnico da spec (mesmo formato de
      `docs/007-crm-administracao.md`..`docs/013-crm-faq-e-sugestao-ia.md`).
- [ ] T037 `CLAUDE.md` — `Plano ativo` → `specs/014-crm-workflow/plan.md`; arquivar o
      parágrafo ativo da 013 num `<details>` (mesmo padrão já usado para 007–012); escrever o
      parágrafo ativo da 014 com contagens reais de teste após T029 passar.
- [ ] T038 `README.md` — atualizar a seção de specs implementadas / stack, se aplicável.
- [ ] T039 `ROADMAP.md` — marcar `014 — crm-workflow` como `[x]` implementada, com o resumo
      no mesmo formato das specs 007–013.

## Dependências entre fases

1→2→3→4→5→6→7→8 são sequenciais (cada fase usa artefatos da anterior). 9 (frontend) depende
só de 6 (contratos HTTP estáveis) — pode começar em paralelo com 7/8. 10 depende de 8 (números
reais de teste) e 9 (frontend implementado) para descrever o estado final.

Dentro da Fase 4: T015 depende de T007/T009; T016 depende de T009 (leitura) e do mesmo builder
de contexto que T019 usa (extrair um helper compartilhado, ex. `contexto-registro.ts`, evita
duplicar a lógica entre simulação e execução real — ajuste de escopo permitido dentro de T016/
T019, mesmo arquivo de domínio). T018 é usado só por T019. T020 depende de T019.

## Estratégia de entrega incremental (MVP)

**MVP = US1 (P1) sozinha**: Fases 1–6 (schema, domínio, infra, aplicação, RBAC/config, HTTP)
entregam um fluxo criável/editável/publicável que reage a um gatilho interno e aplica uma
ação — testável de ponta a ponta via `curl` (quickstart.md, passos 1 e 3–4), mesmo sem
simulação (US2), biblioteca de modelos (US4) ou frontend. US2 (simulação) é a próxima fatia
crítica antes de liberar para uso real (publicar sem poder testar antes é o risco que a
própria US2 existe para mitigar). US3 é validado pela mesma infraestrutura de T009/T015 sem
trabalho extra dedicado — a garantia "editar não afeta a publicada" é uma propriedade do
design de dados (D-01), não uma feature separada. US4 (modelos) e US5 (histórico) são aditivas
e podem entrar em qualquer ordem depois do MVP.

## Paralelização por fase

- Fase 2: T004–T008 em arquivos diferentes — todos `[P]` entre si (T004 primeiro, pois T005–
  T007 importam seus tipos).
- Fase 3: T009–T014 em arquivos diferentes — todos `[P]` entre si.
- Fase 5: T022–T025 em arquivos diferentes — todos `[P]` entre si.
- Fase 9: T030/T033 não dependem de T031/T032/T034 — `[P]`.
