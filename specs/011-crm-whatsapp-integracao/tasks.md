# Tasks: CRM · Integração com WhatsApp

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Branch**: `011-crm-whatsapp-integracao`

Convenção: `[P]` = paralelizável (arquivos diferentes, sem dependência entre si). `[USn]`
mapeia à user story do `spec.md` (US1=P1 receber mensagens, US2=P2 responder respeitando a
janela de 24h, US3=P3 administrar canal/templates, US4=P4 opt-out).

## Fase 1 — Schema e migração

- [x] T001 `backend/prisma/schema.prisma`: + enums `TemplateWhatsappCategoria`,
      `TemplateWhatsappStatus`, `MensagemWhatsappTipoConteudo`,
      `MensagemWhatsappStatusEntrega`, `EventoWebhookWhatsappStatus`,
      `OptOutWhatsappOrigem`; + models `CanalWhatsapp`, `TemplateWhatsapp`,
      `MensagemWhatsapp`, `EventoWebhookWhatsapp`, `OptOutWhatsapp`; relações inversas em
      `Interacao`, `Pessoa`, `Lead`.
- [x] T002 Gerar a migração (`prisma migrate dev --name crm_whatsapp`) e editar o SQL
      gerado: acrescentar o índice único **parcial**
      `mensagem_whatsapp (wa_message_id) WHERE wa_message_id IS NOT NULL` (mesmo padrão de
      SQL bruto das specs 007/009/010 — Prisma não modela índice parcial).
- [x] T003 Rodar a migração + regenerar `@prisma/client`; confirmar que
      `test/setup-db.ts` aplica limpo num schema novo.

## Fase 2 — Domínio puro (sem banco) `[P]` entre arquivos diferentes

- [x] T004 [P] `backend/src/crm/domain/whatsapp/janela-24h.ts` + `.spec.ts` —
      `estaDentroDaJanela24h(ultimaMensagemRecebidaEm: Date | null, agora: Date): boolean`
      (limite exclusivo — exatamente 24h conta como fora).
- [x] T005 [P] `backend/src/crm/domain/whatsapp/assinatura.ts` + `.spec.ts` —
      `verificarAssinatura(corpoBruto: Buffer, headerAssinatura: string | undefined,
      appSecret: string): boolean` (HMAC-SHA256 + comparação em tempo constante própria,
      **não** reusa `auth/webhook` — ver `research.md`).
- [x] T006 [P] `backend/src/crm/domain/whatsapp/payload-webhook.schema.ts` + `.spec.ts` —
      schema `zod` tolerante (`.passthrough()`) do envelope da Meta (`entry[].changes[].
      value.{metadata,contacts,messages,statuses}`); fixture de payload real de mensagem de
      texto, mídia e callback de status.
- [x] T007 [P] `backend/src/crm/domain/whatsapp/mapear-status-entrega.ts` + `.spec.ts` —
      `sent|delivered|read|failed` → `MensagemWhatsappStatusEntrega`; valor desconhecido não
      lança (fallback seguro, loga e ignora).
- [x] T008 [P] `backend/src/crm/domain/whatsapp/index.ts` — barrel.

## Fase 3 — Persistência (infra)

- [x] T009 [P] `backend/src/crm/infra/whatsapp/canal-whatsapp.repository.ts` — CRUD +
      `porPhoneNumberId` (resolução do webhook) + `listarAtivos` (handshake `GET`).
- [x] T010 [P] `backend/src/crm/infra/whatsapp/template-whatsapp.repository.ts` — *upsert*
      por `(canalId, nomeMeta, idioma)`, listar com filtro `statusAprovacao`.
- [x] T011 [P] `backend/src/crm/infra/whatsapp/mensagem-whatsapp.repository.ts` — criar,
      `porWaMessageId` (callback de status), `porInteracaoId`.
- [x] T012 [P] `backend/src/crm/infra/whatsapp/evento-webhook-whatsapp.repository.ts` —
      criar, `porHash` (dedup), atualizar status/erro, listar (paginado, filtro `status`).
- [x] T013 [P] `backend/src/crm/infra/whatsapp/optout-whatsapp.repository.ts` — `ativoPor
      Telefone` (linha mais recente sem `revertidoEm`), criar, reverter.
- [x] T014 [P] `backend/src/crm/infra/whatsapp/index.ts` — barrel.

## Fase 4 — Aplicação (serviços + cliente Graph API)

- [x] T015 `backend/src/crm/application/whatsapp/graph-api-client.ts` (interface
      `GraphApiClient` + token DI `GRAPH_API_CLIENT`) e
      `meta-graph-api.client.ts` (implementação via `fetch` nativo — `enviarMensagem`,
      `buscarTemplates`; erro de rede/HTTP não-2xx vira uma exceção tipada com o detalhe da
      Meta).
- [x] T016 [US3] `backend/src/crm/application/whatsapp/canal-whatsapp.service.ts` — CRUD do
      canal (cifra de `accessToken`/`appSecret`/`webhookVerifyToken` via `cifrar`/
      `mascararSegredo`/`ultimos4De` de `crm/domain`, spec 007), projeção sem segredo em
      claro, audita em `CrmAdminAuditService` (`entidade: 'canal_whatsapp'`).
- [x] T017 [US3] `backend/src/crm/application/whatsapp/template-whatsapp.service.ts` —
      `sincronizar(canalId)` chama `GraphApiClient.buscarTemplates`, faz *upsert* local,
      audita (`entidade: 'template_whatsapp'`, `campo: 'sincronizado'`); `listar(canalId,
      filtro)`.
- [x] T018 [US1] `backend/src/crm/application/whatsapp/webhook-whatsapp.service.ts` —
      `processarEvento(payloadBruto, headerAssinatura)`: resolve canal por
      `metadata.phone_number_id`, verifica assinatura (T005), dedup por hash (T012),
      resolve pessoa/lead por telefone normalizado (reusa `normalizarTelefone` de
      `crm/domain/lead`) ou cria `Lead` novo (`origem: 'whatsapp'`), chama
      `RegistrarInteracaoService` (009) por mensagem recebida + cria `MensagemWhatsapp`;
      aplica callbacks de `statuses[]` via T007 + T011; marca
      `EventoWebhookWhatsapp.status`.
- [x] T019 [US2] `backend/src/crm/application/whatsapp/envio-whatsapp.service.ts` —
      `enviar(...)`: resolve telefone da âncora, checa opt-out ativo (T013 → 409), checa
      canal ativo, valida janela de 24h (T004) para `modo: LIVRE` ou `statusAprovacao ==
      APROVADO` para `modo: TEMPLATE`, chama `GraphApiClient.enviarMensagem`, em sucesso
      registra via `RegistrarInteracaoService` (`direcao: SAIDA`) + `MensagemWhatsapp`; em
      falha do provedor propaga o erro (502) sem persistir nada.
- [x] T020 [US2] `backend/src/crm/application/whatsapp/janela-whatsapp.service.ts` — `GET`
      da janela de 24h por âncora (busca a última `Interacao` `WHATSAPP`/`ENTRADA`, aplica
      T004).
- [x] T021 [US4] `backend/src/crm/application/whatsapp/optout-whatsapp.service.ts` —
      `registrar` (idempotente — telefone já ativo devolve a linha existente, sem duplicar),
      `reverter` (404 se não há opt-out ativo), `consultar`; resolve `pessoaId`/`leadId`
      pelo telefone quando possível (mesma busca de T018), sem exigir que exista.
- [x] T022 `backend/src/crm/application/whatsapp/index.ts` — barrel.

## Fase 5 — HTTP (controllers + DTOs)

- [x] T023 [P] `backend/src/crm/dto/whatsapp/criar-canal-whatsapp.schema.ts`,
      `atualizar-canal-whatsapp.schema.ts` (zod).
- [x] T024 [P] `backend/src/crm/dto/whatsapp/enviar-mensagem-whatsapp.schema.ts`,
      `optout-whatsapp.schema.ts` (zod; `modo: 'LIVRE'|'TEMPLATE'` como union discriminada).
- [x] T025 [US3] `backend/src/crm/whatsapp-admin.controller.ts` —
      `POST`/`GET`/`PATCH /crm/admin/whatsapp/canais[/:id]`,
      `POST /crm/admin/whatsapp/canais/:id/templates/sincronizar`,
      `GET /crm/admin/whatsapp/canais/:id/templates`,
      `GET /crm/admin/whatsapp/eventos[/:id]` (visibilidade de erro, FR-014).
- [x] T026 [US1] [US2] [US4] `backend/src/crm/whatsapp.controller.ts` —
      `GET /crm/whatsapp/janela`, `POST /crm/whatsapp/mensagens`,
      `POST /crm/whatsapp/optout`, `POST /crm/whatsapp/optout/reverter`,
      `GET /crm/whatsapp/optout`.
- [x] T027 [US1] `backend/src/crm/whatsapp-webhook.controller.ts` —
      `GET`/`POST /webhooks/whatsapp` (`@Public()`, sem `@RequerPermissao` — a segurança é
      a assinatura HMAC/verify_token, não o `PermissionGuard`); usa
      `@Req() req: RawBodyRequest<Request>` para o corpo bruto (T029).

## Fase 6 — RBAC e módulo

- [x] T028 `backend/src/auth/rbac/catalogo.ts` — +4 permissões
      (`whatsapp:{ver,enviar,gerir_optout}`, `crm_admin:gerir_whatsapp`); `catalogo.spec.ts`
      ganha a asserção.
- [x] T029 `backend/src/main.ts` — `NestFactory.create(AppModule, { bufferLogs: false,
      rawBody: true })`.
- [x] T030 `backend/src/crm/crm.module.ts` — registra os 3 controllers novos + providers
      (inclui o binding do token `GRAPH_API_CLIENT` → `MetaGraphApiClient`).

## Fase 7 — Testes de integração (e2e, Postgres real)

- [x] T031 `backend/test/support/crm-whatsapp.ts` — helpers: criar canal com segredo
      conhecido (para calcular HMAC nos testes), assinar payload (`assinarPayload(corpo,
      appSecret)`), *override* de `GRAPH_API_CLIENT` no `TestingModule` por um dublê
      controlável (sucesso/falha configurável por teste).
- [x] T032 [US3] `backend/test/crm-whatsapp.e2e-spec.ts` — canal: CRUD sob
      `crm_admin:gerir_whatsapp`, leitura sob `crm_admin:ver`, segredo nunca em claro no
      `GET`, `phoneNumberId` duplicado → 422, `PATCH` rotaciona segredo, sem `DELETE`;
      templates: `sincronizar` idempotente (2× não duplica), dublê de falha → 502 sem
      alterar nada, listagem filtra por `statusAprovacao`.
- [x] T033 [US1] mesmo arquivo — webhook: handshake `GET` certo → 200 + eco do `challenge`
      em texto puro, errado → 403; `POST` sem assinatura/assinatura errada → 401, nada
      persistido; telefone conhecido (pessoa/lead) → interação na timeline correta;
      telefone desconhecido → cria `Lead` (`origem: 'whatsapp'`); reenvio do mesmo payload
      (mesmo hash) → 200, 0 registro novo; mensagem de mídia →
      `MensagemWhatsapp.tipoConteudo` correto; `statuses[]` atualiza
      `MensagemWhatsapp.statusEntrega` de uma mensagem enviada previamente.
- [x] T034 [US2] mesmo arquivo — `GET /crm/whatsapp/janela` reflete a última interação
      `ENTRADA`; envio `LIVRE` dentro da janela → 201, fora → 409 `fora_da_janela_24h`;
      `TEMPLATE` aprovado fora da janela → 201; `TEMPLATE` pendente/rejeitado → 422/409;
      falha do provedor (dublê) → 502 sem criar interação.
- [x] T035 [US4] mesmo arquivo — opt-out: registrar bloqueia envio subsequente (409),
      idempotente (2× não duplica linha), reverter sem opt-out ativo → 404, reverter
      restaura o envio, recebimento continua funcionando mesmo em opt-out.
- [x] T036 Guard 401/403/2xx em toda rota autenticada nova; as 2 rotas `/webhooks/whatsapp`
      **sem** JWT (só a autenticação própria); `GET /admin/rbac/permissoes` inclui as 4
      novas; regressão 003–010 + `/health` (11 contextos) verdes.

## Fase 8 — Frontend

- [x] T037 [P] `frontend/src/whatsapp/whatsapp-api.ts` — `apiFetch` tipado (canal,
      template, janela, enviar, optout).
- [x] T038 **Revisado durante o implement**: sem `use-whatsapp.ts` separado — os hooks
      `useQuery`/`useMutation` do TanStack Query ficam **inline** em
      `WhatsappAdminPage.tsx`, mesmo padrão já usado por `crm-admin/IntegracoesTab.tsx`
      (007), que também não tem um arquivo de hooks à parte. Consistência com o precedente
      mais próximo venceu a divisão especulada no planejamento.
- [x] T039 [US3] **Revisado**: `frontend/src/whatsapp/WhatsappAdminPage.tsx` — canal +
      templates numa página só (form de conexão inline, campos de segredo só-escrita,
      nunca preenchidos de volta; indicador de segredo definido/mascarado). Sem
      `canal-form.tsx` separado — mesmo padrão inline de `IntegracoesTab.tsx`.
- [x] T040 [US3] **Revisado**: lista de templates por canal é o componente `TemplatesDoCanal`
      dentro do próprio `WhatsappAdminPage.tsx` — badge de `statusAprovacao`, botão
      "sincronizar agora" (`crm_admin:gerir_whatsapp`). Sem `templates-list.tsx` separado.
- [~] T041 [US2] **Escopo cortado deliberadamente**: `janela-indicator.tsx` (indicador de
      janela de 24h dentro de uma conversa) faz mais sentido dentro da inbox de atendimento
      da spec 012 (Chat ao Vivo), que ainda não existe — não há hoje nenhuma tela de
      conversa para hospedar esse indicador. O `GET /crm/whatsapp/janela` (backend) já
      existe e está testado (e2e); a 012 consome. O ROADMAP já escopa o frontend desta
      spec como só "configuração de canal e templates" — consistente com esse corte.
- [~] T042 [US4] **Escopo cortado deliberadamente** (mesmo motivo do T041): `optout-badge.tsx`
      também pertence naturalmente à inbox de atendimento (012). `POST/GET
      /crm/whatsapp/optout*` (backend) já existem e estão testados (e2e).
- [x] T043 `frontend/src/shell/nav-items.ts` — + **CRM · WhatsApp**
      (`crm_admin:ver`\|`whatsapp:ver`, `anyOf`).
- [x] T044 `frontend/src/app/router.tsx` — rota `/crm/whatsapp` sob `RequirePermissao`.
- [x] T045 `frontend/src/test/setup.ts` — +4 permissões novas em `TODAS_PERMISSOES`.
- [x] T046 `frontend/src/whatsapp/WhatsappAdminPage.test.tsx` (Testing Library, 4 testes):
      lista canais com segredo só mascarado; sem `crm_admin:gerir_whatsapp` → sem form de
      conexão; com a permissão → form aparece; sem `crm_admin:ver` nem `whatsapp:ver` →
      "sem permissão".

## Fase 9 — Qualidade e documentação

- [x] T047 `npm run lint && npm run typecheck && npm run build` (nos dois workspaces) —
      verde.
- [x] T048 `npm test` (unit backend + frontend) verdes localmente; `npm run test:e2e`
      contra Postgres real (schema isolado) — se o ambiente não tiver Docker/Postgres
      disponível, registrar a ressalva explicitamente (mesmo precedente da 009).
- [x] T049 `docs/011-crm-whatsapp-integracao.md` — novo (padrão dos docs 001–010).
- [x] T050 `CLAUDE.md` — seção Stack ganha o bloco condensado de 011; "Plano ativo"
      (SPECKIT) aponta para 011 (a mais recente implementada); 010 arquivada em `<details>`.
- [x] T051 `README.md` — seção Status/estrutura ganha a 011.
- [x] T052 `ROADMAP.md` — marca 011 como `[x]` implementada e validada; atualiza "Próxima".
- [ ] T053 Commit (+ push do branch `worktree-spec-011-crm-whatsapp`), mesma convenção das
      specs anteriores.

## Dependências entre fases

Fase 1 → 2/3 (schema precisa existir antes dos repositórios; domínio puro não depende do
schema, mas os testes de repositório sim) → 4 (aplicação depende de domínio+infra;
T016/T017 antes de T018 — webhook precisa resolver canal e template existentes; T019
depende de T004/T013/T015) → 5 (controllers dependem de aplicação) → 6 (módulo registra os
controllers; RBAC pode ser paralelo a 2–5; T029 `rawBody` é pré-requisito de T027) → 7 (e2e
depende de tudo montado) → 8 (frontend consome os endpoints da fase 5) → 9 (fecha com
lint/test/build/docs).

## Estratégia de entrega incremental (MVP)

- **MVP mínimo**: Fases 1–6 + US1/US3 (T001–T018, T023, T025, T027–T030) já entregam
  "conectar um canal e ver mensagens recebidas caírem na timeline" — utilizável
  manualmente via `curl`/Postman mesmo sem envio (US2) ou opt-out (US4) e sem frontend.
- **Envio (US2)** é aditivo sobre o MVP — depende só da existência de um canal (US3) e
  templates sincronizados; não bloqueia o recebimento.
- **Opt-out (US4)** é independente das demais — só precisa do telefone, pode ser
  implementado e testado em paralelo a US1/US2 depois da Fase 1–3.
- Frontend (Fase 8) fecha a fatia completa da visão 8.5/8.12 para este escopo.
