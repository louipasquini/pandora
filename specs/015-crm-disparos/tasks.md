# Tasks: CRM · Disparos (WhatsApp)

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Branch**: `015-crm-disparos`

Convenção: `[P]` = paralelizável (arquivos diferentes, sem dependência entre si). `[USn]`
mapeia à user story do `spec.md` (US1=P1 montar/agendar disparo, US2=P2 acompanhar
resultado/quality rating, US3=P3 importar CSV, US4=P4 teste A/B).

## Fase 1 — Schema e migração

- [ ] T001 `backend/prisma/schema.prisma`: + enums `ExecucaoDisparoStatus`,
      `MensagemDisparoStatus`, `DisparoVariante`; + models `ExecucaoDisparo`,
      `DisparoContatoImportado`, `MensagemDisparo` (bounded context `crm`) — ver
      data-model.md.
- [ ] T002 Gerar a migração (`prisma migrate dev --name crm_disparos`,
      `20260909171024_crm_disparos`) e editar o SQL gerado: `CHECK` em `execucao_disparo`
      — `(template_b_id IS NULL) = (percentual_variante_b IS NULL)` (Prisma não modela
      `CHECK`, mesmo padrão 007/009/010/011/012; `mensagem_whatsapp_id` já sai com `UNIQUE`
      comum do próprio `@unique` do Prisma — suficiente, sem precisar de índice parcial).
- [ ] T003 Rodar a migração + regenerar `@prisma/client`; confirmar `test/setup-db.ts` limpo
      num schema novo.

## Fase 2 — Domínio puro (sem banco) `[P]` entre arquivos diferentes

- [ ] T004 [P] `backend/src/crm/domain/disparos/resolver-destinatarios.ts` + `.spec.ts` —
      `resolverDestinatarios({ segmento, csv })`: dedup por telefone normalizado entre as
      duas fontes e dentro do próprio CSV (research.md D-R3).
- [ ] T005 [P] `backend/src/crm/domain/disparos/atribuir-variante.ts` + `.spec.ts` —
      `atribuirVariante(telefone, percentualB)`: hash estável do telefone → `'A'|'B'`
      determinístico; `percentualB` ausente → `null` (sem A/B).
- [ ] T006 [P] `backend/src/crm/domain/disparos/importar-csv.ts` + `.spec.ts` —
      `parseCsvContatos(conteudo)`: autodetecta separador `,`/`;`, cabeçalho
      `telefone`/`nome`, usa `normalizarTelefone` (lead/normalizar-lead.ts, 008) por linha;
      devolve `{ validos: [...], invalidos: [{linha, motivo}] }` (research.md D-R6).
- [ ] T007 [P] `backend/src/crm/domain/disparos/index.ts` — barrel.

## Fase 3 — Persistência (infra)

- [ ] T008 [P][US1] `backend/src/crm/infra/disparos/execucao-disparo.repository.ts` — CRUD +
      `listar` (filtro status/período) + `contarPorStatus`/`contarPorVariante` (`GROUP BY`
      em `mensagem_disparo`) + `marcarStatus(id, status, campos)`.
- [ ] T009 [P][US3] `backend/src/crm/infra/disparos/contato-importado.repository.ts` —
      `criarLote(execucaoDisparoId, linhas)`, `listarPorExecucao`.
- [ ] T010 [P][US1] `backend/src/crm/infra/disparos/mensagem-disparo.repository.ts` —
      `criarLote(...)`, `pendentesParaEnvio(execucaoDisparoId, lote)`
      (`status IN (PENDENTE)`, ordenado por `criadoEm`), `marcarEnviada`/`marcarFalha`/
      `incrementarTentativa`, `listarPorExecucao` (paginado, filtro status), `existemPendentes(execucaoDisparoId)`.
- [ ] T011 [P] `backend/src/crm/infra/disparos/index.ts` — barrel.

## Fase 4 — Aplicação (serviços)

- [ ] T012 [US1] `backend/src/crm/application/disparos/disparo.service.ts` —
      `criar(dto, autor)`: valida template(s) `APROVADO`, par `templateBId`/
      `percentualVarianteB`, `segmentoId` ou CSV presente, `agendadoPara` futuro; audita via
      `CrmAdminAuditService` (`entidade: 'execucao_disparo'`); sem `agendadoPara` → chama
      `MaterializarDestinatariosService` na mesma chamada e marca `EM_ANDAMENTO`; com
      `agendadoPara` → `AGENDADO`. `cancelar(id, autor)`: só `AGENDADO` → 409 senão; audita.
      `listar`/`obter`/`listarDestinatarios`/`exportarCsv` (projeções + contagens).
- [ ] T013 [US3] `backend/src/crm/application/disparos/importar-csv.service.ts` —
      `importar(execucaoDisparoId, conteudoCsv, criarLead)`: chama `parseCsvContatos`; para
      cada linha válida, resolve `pessoaId` (telefone em `PessoaTelefone`) ou `leadId`
      (telefone em `Lead`) já existente; se nenhum e `criarLead=true`, chama
      `RegistrarLeadService.registrar` com `{origem:'csv-disparo', idExterno: telefone}`;
      persiste via `ContatoImportadoRepository.criarLote`; devolve o relatório
      `{totalLinhas, aceitas, rejeitadas}` (contract disparos.md). Chamado por
      `DisparoService.criar` **antes** de materializar — CSV é sempre parte da criação do
      disparo (US3: "na hora da importação" já é a criação), não um passo separado.
- [ ] T014 [US1] `backend/src/crm/application/disparos/materializar-destinatarios.service.ts`
      — `materializar(execucaoDisparo)`: resolve membros do segmento (`construirWhere` sem
      escopo de visão, research.md D-R2) + contatos importados associados; chama
      `resolverDestinatarios`; para cada um, checa `OptOutWhatsappService.ativoPorTelefone`
      → `PULADA` motivo `opt_out`; senão, se A/B, chama `atribuirVariante`; cria lote via
      `MensagemDisparoRepository.criarLote`; marca `iniciadoEm`; template não `APROVADO`
      neste momento → marca a execução inteira `ERRO` sem criar nenhuma `MensagemDisparo`
      (edge case do spec.md).
- [ ] T015 [US1] `backend/src/crm/application/disparos/enviar-mensagem-disparo.service.ts` —
      `enviar(mensagemDisparo, execucao)`: decifra access token do canal
      (`CanalWhatsappService`), resolve corpo (template da variante), chama
      `GraphApiClient.enviarMensagem`; sucesso → `RegistrarInteracaoService.registrar` +
      `MensagemWhatsappRepository.criar` + `mensagem_disparo.status='ENVIADA'` +
      `mensagemWhatsappId`; falha do provedor → incrementa `tentativas`;
      `< CRM_DISPAROS_WORKER_MAX_TENTATIVAS` → volta `PENDENTE`, senão `FALHOU` com motivo
      (research.md D-R1/D-R5).
- [ ] T016 [US1] `backend/src/crm/application/disparos/worker.service.ts` —
      `processarPassada()`: (a) para `AGENDADO` com `agendadoPara <= agora`, chama
      `materializar` e marca `EM_ANDAMENTO`; (b) para `EM_ANDAMENTO`, pega até
      `CRM_DISPAROS_WORKER_LOTE` `MensagemDisparo` pendentes (todas as execuções, mutex por
      linha) e chama `enviar` para cada; (c) para `EM_ANDAMENTO` sem nenhuma pendente
      restante, marca `CONCLUIDO`. Idempotente — mesma linha só reprocessa enquanto
      `PENDENTE`.
- [ ] T017 [US1] `backend/src/crm/application/disparos/worker.scheduler.ts` — cópia
      estrutural do `WorkerScheduler` de 006/014: `setInterval`, mutex de passada única,
      ligado por `CRM_DISPAROS_WORKER_ENABLED`.
- [ ] T018 [US2] `backend/src/crm/application/disparos/quality-rating.service.ts` —
      `consultar(canalId)`: decifra access token, chama
      `GraphApiClient.consultarQualityRating`, devolve sem persistir (research.md D-R7).
- [ ] T019 [P] `backend/src/crm/application/disparos/index.ts` — barrel.
- [ ] T020 [US2] Estender `backend/src/crm/application/whatsapp/graph-api-client.ts` — método
      `consultarQualityRating({phoneNumberId, accessToken})`; implementar em
      `meta-graph-api.client.ts` (`GET /{phone-number-id}?fields=quality_rating,
      name_status`); dublê de teste correspondente.

## Fase 5 — DTOs e HTTP

- [ ] T021 [P] `backend/src/crm/dto/disparos/*.schema.ts` (zod) — `criarDisparoSchema` (JSON —
      `csvConteudo` é texto simples, lido no navegador via `FileReader`, research.md D-R6),
      `listarDisparosSchema`, `listarDestinatariosSchema`.
- [ ] T022 [US1][US2][US3][US4] `backend/src/crm/disparo.controller.ts` — rotas de
      `contracts/disparos.md`: `POST /crm/disparos` (`disparo:criar`, JSON — `csvConteudo`
      opcional é parte do mesmo corpo, CSV é parte da própria criação, US3),
      `GET /crm/disparos` (`disparo:ver`), `GET /crm/disparos/{id}` (`disparo:ver`),
      `GET /crm/disparos/{id}/destinatarios` (`disparo:ver`),
      `GET /crm/disparos/{id}/export` (`disparo:ver`),
      `POST /crm/disparos/{id}/cancelar` (`disparo:cancelar`),
      `POST /crm/disparos/processar` (`disparo:criar`).
- [ ] T023 [US2] `backend/src/crm/whatsapp-admin.controller.ts` (editado) — +
      `GET /crm/admin/whatsapp/canais/{id}/quality-rating` (`crm_admin:ver`).

## Fase 6 — RBAC, config e wiring

- [ ] T024 `backend/src/auth/rbac/catalogo.ts` — + `disparo:criar`, `disparo:ver`,
      `disparo:cancelar` (recurso novo `disparo`).
- [ ] T025 `backend/src/config/env.schema.ts` — + `CRM_DISPAROS_WORKER_{ENABLED,
      INTERVALO_MS,LOTE,MAX_TENTATIVAS}` (mesmo padrão de `CRM_WORKFLOW_WORKER_*`).
- [ ] T026 `backend/src/crm/crm.module.ts` — registra os novos repositories/services/
      controller; `backend/test/setup-db.ts` — força `CRM_DISPAROS_WORKER_ENABLED=false`.

## Fase 7 — Testes e2e (US1–US4 + regressão)

- [ ] T027 `backend/test/crm-disparos.e2e-spec.ts` — cenários do plan.md: ciclo de vida
      (imediato/agendado/cancelar), execução reativa via `POST .../processar` (materializa,
      envia em lote, retry, terminal), dedup segmento+CSV, opt-out, CSV com/sem
      `criarLead`, A/B com métricas separadas, quality rating, guard/escopo (401/403),
      regressão suíte 003–014 + `/health`.

## Fase 8 — Frontend

- [ ] T028 [P][US1] `frontend/src/disparos/NovoDisparoPage.tsx` + `.test.tsx` — formulário:
      canal, template (+ variante B opcional com slider de %), segmento OU upload de CSV
      (com toggle "criar Lead"), agendamento opcional; usa `disparo:criar`.
- [ ] T029 [P][US2] `frontend/src/disparos/DisparosPage.tsx` + `.test.tsx` — lista/visão
      geral com filtros de status/período e contagens; atrás de `disparo:ver`.
- [ ] T030 [P][US2][US4] `frontend/src/disparos/DisparoDetalhePage.tsx` + `.test.tsx` —
      métricas (por variante quando A/B), lista de falhas com motivo, export, cancelar
      (`disparo:cancelar`), botão de quality rating do canal usado.
- [ ] T031 `frontend/src/nav-items.ts` + `frontend/src/router.tsx` (editados) — item **CRM ·
      Disparos** atrás de `disparo:ver`, rotas `/crm/disparos/**`.

## Fase 9 — Documentação

- [ ] T032 `docs/015-crm-disparos.md` (novo) + `CLAUDE.md`/`README.md`/`ROADMAP.md`
      (editados) — resumo da spec, marcar `015` como concluída no ROADMAP.

## Dependências

- Fase 1 → Fase 2/3 (schema antes de repositórios).
- Fase 3 → Fase 4 (repositórios antes de serviços).
- T020 (estender `GraphApiClient`) pode rodar em paralelo à Fase 2/3 — só precisa existir
  antes de T015/T018.
- Fase 4 → Fase 5 (serviços antes de controller/DTOs).
- Fase 6 pode rodar em paralelo à Fase 4/5 (arquivos diferentes), mas o módulo (T026) só
  fecha depois que os providers da Fase 4/5 existem.
- Fase 7 depende de tudo (1–6).
- Fase 8 é independente do backend além do contrato já fechado em `contracts/disparos.md` —
  pode começar em paralelo assim que os DTOs (T021) estiverem definidos.
- US1 (T012, T014–T017) é a espinha dorsal; US2 (T018, T020, T023) e US3 (T013) dependem só
  da Fase 3; US4 (A/B) é só `atribuirVariante` (T005) + os campos já previstos em T001/T012 —
  não é uma fase própria de backend, só a T030 no frontend.

## MVP sugerido

Fases 1–7 com **US1 apenas** (disparo imediato/agendado para um segmento, sem CSV nem A/B) já
é um incremento entregável e testável de ponta a ponta — T006 (CSV) e T005/parte de T012/T014
(A/B) podem ficar para depois sem bloquear o resto.
