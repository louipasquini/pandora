# Tasks: CRM · Chat ao Vivo

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Branch**: `012-crm-chat-ao-vivo`

Convenção: `[P]` = paralelizável (arquivos diferentes, sem dependência entre si). `[USn]`
mapeia à user story do `spec.md` (US1=P1 endereçamento automático, US2=P1 SLA/resposta,
US3=P2 transferência, US4=P3 CSAT, US5=P3 resposta automática fora do expediente).

## Fase 1 — Schema e migração

- [x] T001 `backend/prisma/schema.prisma`: + enums `AtendimentoCanal`, `AtendimentoStatus`,
      `AtendimentoPrioridade`; + models `Atendimento`, `TransferenciaAtendimento`,
      `RespostaAtendimento`; + coluna `atendimentoId` em `Interacao`; + colunas
      `mensagemForaExpediente`/`slaPrimeiraRespostaMinutos` em `Equipe`; relações inversas em
      `Pessoa`, `Lead`, `Usuario`, `CanalWhatsapp`.
- [x] T002 Gerar a migração (`prisma migrate dev --name crm_atendimento`) e editar o SQL
      gerado: `CHECK (num_nonnulls(pessoa_id, lead_id) = 1)` em `atendimento` (SQL bruto,
      Prisma não modela `CHECK`).
- [x] T003 Rodar a migração + regenerar `@prisma/client`; confirmar `test/setup-db.ts` limpo
      num schema novo.

## Fase 2 — Domínio puro (sem banco) `[P]` entre arquivos diferentes

- [x] T004 [P][US1] `backend/src/crm/domain/atendimento/roteamento.ts` + `.spec.ts` —
      `escolherAtendentePorCarga` (menor carga, desempate por menor `usuarioId`, vazio →
      `null`).
- [x] T005 [P][US2] `backend/src/crm/domain/atendimento/sla.ts` + `.spec.ts` —
      `calcularSlaAtendimento` (sem resposta + estourado; dentro do prazo; já
      respondido/encerrado nunca estoura).
- [x] T006 [P][US1] `backend/src/crm/domain/atendimento/fila.ts` + `.spec.ts` —
      `ordenarFila` (prioridade desc, FIFO).
- [x] T007 [P][US4] `backend/src/crm/domain/atendimento/csat.ts` + `.spec.ts` —
      `csatElegivel`, `interpretarRespostaCsat`.
- [x] T008 [P] `backend/src/crm/domain/atendimento/index.ts` — barrel.

## Fase 3 — Persistência (infra)

- [x] T009 [P] `backend/src/crm/infra/atendimento/atendimento.repository.ts` — CRUD,
      `atendimentoAbertoPorAncoraECanal`, `contarCargaPorUsuario(equipeIds)`, listar com
      filtro/ordenação (`ordenarFila` aplicado em memória — volume baixo, CL-02).
- [x] T010 [P] `backend/src/crm/infra/atendimento/transferencia.repository.ts` — criar,
      listar por `atendimentoId`.
- [x] T011 [P] `backend/src/crm/infra/atendimento/resposta.repository.ts` — criar, listar
      por `atendimentoId`, `existeRespostaAutomatica(atendimentoId)`.
- [x] T012 [P] `backend/src/crm/infra/atendimento/index.ts` — barrel.

## Fase 4 — Aplicação (serviços)

- [x] T013 [US1] `backend/src/crm/application/atendimento/abrir-atendimento.service.ts` —
      porta `abrirOuReaproveitar(ancora, canal, canalWhatsappId?)`: busca atendimento aberto
      existente; senão cria, resolve equipes `ATENDIMENTO` ativas em expediente
      (`estaEmExpediente`, 007), monta candidatos via `EquipeRepository` +
      `AtendimentoRepository.contarCargaPorUsuario`, chama `escolherAtendentePorCarga`;
      sem candidato disponível → dispara resposta automática fora do expediente (D-R6,
      canal `WHATSAPP`, `mensagemForaExpediente` da 1ª equipe `ATENDIMENTO` ativa com o
      campo preenchido, ordem alfabética) via `EnvioWhatsappService` (011), sem marcar
      `primeiraRespostaEm`.
- [x] T014 [US2][US1] `backend/src/crm/application/atendimento/resposta.service.ts` —
      `registrarResposta(atendimentoId, {conteudo, viaIa, autorId})`: valida
      `status = EM_ATENDIMENTO` + `atendenteAtualId = autorId`; canal `WHATSAPP` delega ao
      `EnvioWhatsappService` (011, `modo: LIVRE`); canal `MANUAL` cria `Interacao`
      diretamente via `RegistrarInteracaoService`/repositório; grava
      `RespostaAtendimento`; marca `primeiraRespostaEm` se ainda nulo.
- [x] T015 [US1] `backend/src/crm/application/atendimento/atendimento.service.ts` —
      `assumir`, `encerrar` (marca `csatSolicitadoEm`).
- [x] T016 [US3] `backend/src/crm/application/atendimento/transferencia.service.ts` —
      `transferir`: grava `TransferenciaAtendimento`; atendente específico → atribuição
      direta; só equipe → reaplica `escolherAtendentePorCarga` restrito a ela.
- [x] T017 [US4] `backend/src/crm/application/atendimento/csat.service.ts` —
      `registrarCsat` (manual, 409 se já existe), `interpretarEntradaWebhook` (chamado pelo
      webhook do WhatsApp editado, T021).
- [x] T018 [US1][US2] `backend/src/crm/application/atendimento/atendimento-consulta.service.ts`
      — escopo `ver_todos`\|`ver_proprios` (mesmo padrão 008/010), projeta `sla` calculado
      (`calcularSlaAtendimento`) em toda listagem/detalhe, `exigirNoEscopo`.
- [x] T019 [P] `backend/src/crm/application/atendimento/crm-atendimento-equipe.service.ts` —
      `configurar`/`obter` SLA + mensagem fora do expediente por equipe `ATENDIMENTO`, audita
      em `CrmAdminAuditService`.
- [x] T020 [P] `backend/src/crm/application/atendimento/index.ts` — barrel.

## Fase 5 — Integração com a spec 011 (WhatsApp)

- [x] T021 [US1][US5] Editar `backend/src/crm/application/whatsapp/webhook-whatsapp.
      service.ts`: após `RegistrarInteracaoService.registrar(...)` devolver `criada: true`
      em `processarMensagemRecebida`, chamar `AbrirAtendimentoService.abrirOuReaproveitar`
      e marcar `interacao.atendimentoId`; **antes** disso, checar `CsatService.
      interpretarEntradaWebhook` (D-R5) — se casar, grava a interação como `NPS` associada
      ao atendimento encerrado em vez do fluxo padrão.
- [x] T022 [US2] Editar `backend/src/crm/application/whatsapp/envio-whatsapp.service.ts`:
      quando o envio for originado por `POST /crm/atendimentos/:id/responder` (T014 chama
      este serviço passando `atendimentoId`), gravar `RespostaAtendimento` após o sucesso do
      envio (em vez de duplicar a lógica de envio dentro de `resposta.service.ts`).
- [x] T023 `backend/src/crm/crm.module.ts`: registrar os novos repositórios/serviços/
      controllers; exportar nada de novo (portas ficam internas ao módulo, diferente de
      `RegistrarInteracaoService`).

## Fase 6 — HTTP (controllers + DTO + RBAC)

- [x] T024 [P] `backend/src/crm/dto/atendimento/atendimento.schema.ts` — zod: listar,
      responder, transferir, encerrar, csat, configurar-equipe.
- [x] T025 [US1][US2][US3][US4] `backend/src/crm/atendimento.controller.ts` — `/crm/
      atendimentos/**` (contracts `atendimento-crud.md` + `transferencia-csat.md` — rotas de
      leitura, assumir, responder, encerrar, transferir, csat, timeline, transferências).
- [x] T026 `backend/src/crm/crm-admin-atendimento.controller.ts` — `/crm/admin/atendimento/
      equipes/:equipeId` (`GET`/`PATCH`).
- [x] T027 `backend/src/auth/rbac/catalogo.ts`: +6 permissões — `atendimento:{ver_todos,
      ver_proprios,atender,transferir,encerrar}` + `crm_admin:gerir_atendimento`.

## Fase 7 — Testes backend

- [x] T028 [P] e2e `backend/test/crm-atendimento.e2e-spec.ts` — cobre todos os cenários de
      `plan.md §Testing` (criação/reuso, endereçamento, SLA, responder, transferir,
      encerrar/CSAT, resposta automática fora do expediente, guard/escopo, catálogo,
      regressão 003–011).
- [x] T029 Rodar suíte unit + e2e completa; confirmar 0 regressão nas specs 003–011.

## Fase 8 — Frontend

- [x] T030 [P] `frontend/src/atendimento/use-atendimento.ts` — hooks TanStack Query (fila,
      detalhe, timeline, assumir, responder, transferir, encerrar, csat), inline no padrão
      de `crm-admin/IntegracoesTab.tsx`/`whatsapp/`.
- [x] T031 [US1][US2] `frontend/src/atendimento/FilaAtendimento.tsx` — lista ordenada,
      indicador de SLA (estourado/tempo restante).
- [x] T032 [US2][US3][US4] `frontend/src/atendimento/ConversaAtendimento.tsx` — reaproveita
      `TimelineInteracoes` (009) + composer + ações (assumir/transferir/encerrar) + badge de
      CSAT.
- [x] T033 [US3] `frontend/src/atendimento/TransferirModal.tsx`.
- [x] T034 `frontend/src/atendimento/AtendimentoInboxPage.tsx` — compõe fila + conversa,
      atrás de `atendimento:ver_todos`\|`ver_proprios`.
- [x] T035 `frontend/src/atendimento/AtendimentoAdminPage.tsx` — SLA/mensagem fora do
      expediente por equipe, atrás de `crm_admin:gerir_atendimento`.
- [x] T036 Editar `frontend/src/nav-items.ts`/`router.tsx` — item **CRM · Chat ao Vivo**.
- [x] T037 [P] Testes de componente (`vitest` + Testing Library) para T031/T032/T033/T035.
- [x] T038 `npm run lint && npm run typecheck && npm run build` nos dois workspaces.

## Fase 9 — Documentação

- [x] T039 `docs/012-crm-chat-ao-vivo.md` — novo, mesma profundidade de `docs/
      011-crm-whatsapp-integracao.md`.
- [x] T040 `ROADMAP.md` — marcar `012` concluído, parágrafo-resumo completo, resolver as 2
      linhas de decisão bloqueante (CL-01/CL-02).
- [x] T041 `README.md` — bullet `✅ 012 — crm-chat-ao-vivo`, status "em andamento" → 013.
- [x] T042 `speckit-agent-context-update` — regenerar a seção `SPECKIT` do `CLAUDE.md` +
      apontar "Plano ativo" para `specs/012-crm-chat-ao-vivo/plan.md`.
