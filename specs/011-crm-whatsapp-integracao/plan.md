# Implementation Plan: CRM · Integração com WhatsApp

**Branch**: `011-crm-whatsapp-integracao` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-crm-whatsapp-integracao/spec.md`

## Summary

Quinta fatia da Fase 1 (CRM), visão Parte 8.5/8.12. Conecta o WhatsApp Business (**Cloud
API oficial da Meta** — decisão do dono do produto, 2026-09-04) como canal de 1ª classe do
CRM, dentro do bounded context `crm` já não-vazio desde 007/008/009/010. Adiciona:
`canal_whatsapp` (conexão configurada — número, credenciais cifradas, webhook), `template_
whatsapp` (catálogo espelhado da Meta, sincronizado **sob demanda**, nunca automático —
Princípio VIII), `mensagem_whatsapp` (detalhe 1:1 de uma `interacao` tipo `WHATSAPP` já
existente desde a 009 — mantém `interacao` agnóstica de canal), `evento_webhook_whatsapp`
(evento cru imutável do webhook, dedupado por hash — **não** reaproveita `evento_origem`/
`PlataformaOrigem` da `ingestao`, que é uma dimensão fechada das 7 contas financeiras) e
`opt_out_whatsapp` (histórico de pedidos de não-contato, LGPD). Webhook de entrada
(`/webhooks/whatsapp`, público, autenticado por HMAC-SHA256 — não pelo `WebhookAuthenticator`
da 003, que é escopado às 7 contas financeiras) resolve pessoa/lead pelo telefone e cria a
interação via a porta `RegistrarInteracaoService` já exportada pela 009 especificamente para
esta spec. Envio (livre dentro da janela de 24h, ou por template aprovado fora dela) é
síncrono — sem fila (disparo em massa é escopo da 015). Retenção de conversas é indefinida,
pseudonimização só na exclusão da `pessoa` (decisão do dono do produto — mesma disciplina já
usada no resto do sistema).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11, Prisma `^6` + `@prisma/client` (5 models novos, 6
  enums novos), `zod` 3 (DTOs + schema do payload do webhook). `EntidadeId`/`uuidv7()`,
  `agoraUtc()`, `cifraIntegracaoKey` vêm do `core`. Reaproveita diretamente (mesmo bounded
  context, sem cruzar fronteira): `RegistrarInteracaoService` (009 — porta exportada
  especificamente para 011/012), `cifrar`/`decifrar`/`mascararSegredo`/`ultimos4De`/
  `gerarApiKey` (007), `normalizarTelefone` (008), `CrmAdminAuditService` (007 — auditoria
  de canal/template/opt-out, **nenhuma tabela `_audit` nova**). Chamadas à Graph API da
  Meta via **`fetch` nativo do Node 24** atrás de uma interface `GraphApiClient` (0 dep,
  dublê nos testes). Corpo bruto do webhook via `rawBody: true` do `NestFactory.create`
  (verificação HMAC exige os bytes exatos — ver `research.md`).
- Frontend: **nenhuma nova**. React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch`, `usePermissoesEfetivas` + `RequirePermissao` (004).

**Storage**: **PostgreSQL 16 via Prisma** — 9ª migração de negócio (após `_rbac`,
`_clientes` ×2, `_ingestao`, `_crm_admin` ×2, `_crm_lead`, `_crm_interacao`,
`_crm_pipeline`). 5 tabelas novas: `canal_whatsapp`, `template_whatsapp`,
`mensagem_whatsapp`, `evento_webhook_whatsapp`, `opt_out_whatsapp` + 6 enums. **Nenhuma
tabela de auditoria nova** — reaproveita `crm_admin_audit` (007). `CHECK`/índice único
parcial via SQL bruto na própria migração (mesmo padrão 007/009/010): `mensagem_whatsapp
(wa_message_id) WHERE wa_message_id IS NOT NULL`.

**Testing**:
- Backend unit (`jest`, sem banco), `backend/src/crm/domain/whatsapp/`:
  - `janela-24h.spec.ts` — `null` (nunca recebeu) → `false`; `< 24h` → `true`; exatamente
    `24h` → `false` (limite exclusivo); `> 24h` → `false`.
  - `assinatura.spec.ts` — HMAC correto → válido; corpo alterado em 1 byte → inválido;
    `appSecret` errado → inválido; header ausente → inválido.
  - `payload-webhook.schema.spec.ts` — parse tolerante (`.passthrough()`) de um payload
    real de exemplo da Meta (mensagem de texto, mensagem de mídia, callback de status);
    payload sem `entry`/`changes` → erro de parse tratável.
  - `mapear-status-entrega.spec.ts` — `sent|delivered|read|failed` → enum; valor
    desconhecido → não lança (fallback seguro).
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` já roda `migrate
  deploy` + `db seed`), `test/crm-whatsapp.e2e-spec.ts`:
  - migração cria as 5 tabelas + 6 enums; índice único parcial de `wa_message_id` recusa
    duplicidade quando não-nulo.
  - **Canal**: CRUD sob `crm_admin:gerir_whatsapp`; leitura sob `crm_admin:ver`; segredo
    nunca aparece em `GET`; `phoneNumberId` duplicado → 422; `PATCH` rotaciona segredo
    quando presente no body; sem `DELETE` (só `ativo=false`).
  - **Templates**: `sincronizar` faz *upsert* por `(canalId, nomeMeta, idioma)`, idempotente
    (rodar 2× não duplica); dublê de `GraphApiClient` simula falha → 502, nada muda
    localmente; listagem filtra por `statusAprovacao`.
  - **Webhook — assinatura**: `GET` handshake com `verify_token` certo → 200 + eco do
    `challenge` em texto puro; errado → 403. `POST` sem assinatura ou assinatura errada →
    401, **nada** persistido (nem `EventoWebhookWhatsapp`).
  - **Webhook — mensagem recebida**: telefone conhecido (pessoa) → interação na timeline
    dela; telefone conhecido (lead) → interação na timeline dele; telefone desconhecido →
    cria `Lead` novo (`origem: 'whatsapp'`) + interação (FR-005); reenvio do mesmo payload
    (mesmo hash) → 200, 0 registro novo (FR-015); mensagem de mídia → `MensagemWhatsapp.
    tipoConteudo` correto, `Interacao.conteudo` com referência textual (sem baixar mídia).
  - **Webhook — callback de status**: `statuses[]` para um `waMessageId` existente atualiza
    `MensagemWhatsapp.statusEntrega`; `failed` grava `erroDetalhe`; `waMessageId`
    desconhecido → não lança, fica registrado em `erro_detalhe` do evento, ainda 200.
  - **Janela de 24h**: `GET /crm/whatsapp/janela` reflete a última interação `ENTRADA`;
    envio `LIVRE` dentro da janela → 201; fora → 409 `fora_da_janela_24h`; `TEMPLATE`
    aprovado fora da janela → 201; `TEMPLATE` pendente/rejeitado → 422/409.
  - **Opt-out**: registrar → bloqueia envio subsequente (409); idempotente (2× não
    duplica linha); reverter sem opt-out ativo → 404; reverter → envio volta a funcionar;
    recebimento continua funcionando mesmo em opt-out (só o envio da empresa é bloqueado).
  - **Guard**: cada rota autenticada nova sem token → 401; sem permissão → 403; credencial
    de serviço → 2xx; as duas rotas `/webhooks/whatsapp` **não** exigem JWT.
  - **Catálogo/efetivas**: `GET /admin/rbac/permissoes` inclui as 4 novas.
  - **Regressão**: suíte 003–010 + `/health` (11 contextos) verdes.
- Frontend (`vitest` + Testing Library, jsdom): tela de configuração de canal (mascarada,
  campos de segredo só de escrita); lista de templates com badge de status; indicador de
  janela de 24h numa conversa; composer bloqueia texto livre fora da janela e sugere
  template; ação de opt-out/reverter; controles de admin só com `crm_admin:gerir_whatsapp`.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (portas já em
uso por outra sessão neste ambiente — não subir servidor extra nessas portas durante o
desenvolvimento; testes usam `TEST_DATABASE_URL`/schema isolado, sem depender de servidor
rodando). Dev Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta funcional nova além de SC-001/SC-006 (visibilidade em até 1
minuto) — como o processamento do webhook e o envio são **síncronos e imediatos** (sem
fila), esse alvo é atendido por construção, não por otimização.

**Constraints**:
- **Nenhuma porta nova** (3001/5174/55432 do próprio projeto).
- **Contextos delimitados** (Princípio VI): `crm` continua sem importar `clientes`. FKs de
  `OptOutWhatsapp`/`MensagemWhatsapp` para `Pessoa`/`Lead`/`Interacao` são só
  `schema.prisma` (mesmo precedente da 008/009/010) — **nenhum contrato novo no `core`**.
- **`PlataformaOrigem` intocada** (Princípio I): WhatsApp não entra nessa dimensão fechada
  das 7 contas financeiras — evento cru do webhook vive em tabela própria do `crm` (ver
  `research.md`).
- **Log de eventos + projeções** (Princípio IV): `evento_webhook_whatsapp` é o registro cru
  imutável; `interacao`/`mensagem_whatsapp` são a projeção derivada. Processamento síncrono
  (não um worker de etapas como a 006) porque não há etapas de negócio equivalentes
  (classificar venda, resolver oferta, etc. não se aplicam a uma mensagem).
- **Superfície de escrita mínima** (Princípio VIII): sincronização de template é **sempre**
  sob demanda — nenhum job periódico, nenhuma chamada automática à Graph API. Envio de
  mensagem é 1 ação explícita por vez (sem fila/lote — isso é a 015). Sem `DELETE` físico de
  `canal_whatsapp`/`template_whatsapp` (só `ativo`/`statusAprovacao` espelhado da Meta).
- **Auditoria** (Padrão Transversal): canal/template/opt-out auditam em `crm_admin_audit`
  (007) — reuso deliberado, sem tabela `_audit` nova (ver `research.md` para o porquê do
  volume baixo justificar isso, diferente de `lead`/`interacao`/`oportunidade`).
- **RBAC 004**: cada endpoint autenticado sob `@RequerPermissao`/`@AutenticadoBasta`; +4
  permissões (`whatsapp:{ver,enviar,gerir_optout}` + `crm_admin:gerir_whatsapp`); 403 ≠ 401.
  As 2 rotas de webhook são as **primeiras** `/webhooks/*` do projeto — cobertas pelo
  prefixo público já reservado desde a spec 003, mas com autenticação própria (HMAC), não
  JWT nem `WebhookAuthenticator`.
- **Segredos**: cifrados com a `CRM_INTEGRACAO_CIFRA_KEY` já obrigatória desde a 007 — **0
  chave `.env` nova**.
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~26 arquivos novos no backend
(`src/crm/{domain,application,infra,dto}/whatsapp/**`, `whatsapp-admin.controller.ts`,
`whatsapp.controller.ts`, `whatsapp-webhook.controller.ts`, `crm.module.ts` estendido,
`prisma/migrations/<ts>_crm_whatsapp/`, `test/crm-whatsapp.e2e-spec.ts` + `test/support/
crm-whatsapp.ts`), ~4 arquivos editados (`schema.prisma`, `src/auth/rbac/catalogo.ts`,
`crm.module.ts`, `src/main.ts` — `rawBody: true`), ~9 no frontend (`src/whatsapp/**` +
testes, `nav-items.ts`, `router.tsx`), **0 dep nova**, **1 migração**, **~14 endpoints**
autenticados + **2 endpoints públicos de webhook**, **0 chave `.env` nova**, 1 doc novo, 3
docs atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 5 tabelas nascem com **ID surrogate UUID v7** gerado na
      app. `PlataformaOrigem` (dimensão fechada das 7 contas financeiras) permanece
      intocada — o evento cru do webhook vive em `evento_webhook_whatsapp`, tabela própria
      do `crm`, não em `evento_origem`. `wamid`/`phone_number_id`/`waba_id` da Meta são
      campos comuns, nunca PK.
- [x] **II. Clarificar antes de assumir**: as 2 decisões que bloqueavam esta spec no
      ROADMAP (provedor WhatsApp; retenção/anonimização) foram resolvidas com o dono do
      produto **antes** da escrita do `spec.md` (2026-09-04) — ver Assumptions do spec e
      research.md. **Zero `NEEDS CLARIFICATION`** remanescente; `/speckit-clarify` não
      encontrou nenhuma ambiguidade adicional de alto impacto.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não é um adaptador da
      ingestão financeira. Nenhuma regra do `crm` conhece "Guru"/"Asaas"/etc.; o único
      "vocabulário de origem" aqui é o próprio formato do payload da Meta, isolado no
      schema `zod` de `payload-webhook.ts` e no mapeamento de status — não vaza para
      `interacao`/`mensagem_whatsapp` (que usam os enums canônicos do projeto).
- [x] **IV. Log de eventos + projeções**: `evento_webhook_whatsapp` é o evento cru
      **imutável**, persistido **antes** de qualquer efeito derivado; `interacao`/
      `mensagem_whatsapp` são a projeção. Idempotente por hash (payload) e por
      `(canalOrigem, idExterno)` (mensagem individual, via a porta da 009). Processamento
      síncrono com resultado explícito (`status: PROCESSADO|ERRO` + `erroDetalhe`) — sem
      `commit()` de remendo, sem estado mutável escondido.
- [x] **V. Agregados derivados**: `dentroDaJanela` (janela de 24h) é **sempre** `f(última
      interação recebida, agora) → boolean`, nunca uma coluna persistida/expirando por
      job. "Está em opt-out" é `f(linha mais recente por telefone) → boolean`, nunca um
      contador ou flag isolada sem histórico.
- [x] **VI. Contextos delimitados — observar, não escrever**: `crm` continua **sem**
      importar `clientes`/`ingestao`. FKs de `OptOutWhatsapp`/`MensagemWhatsapp` para
      `Pessoa`/`Lead`/`Interacao` são só `schema.prisma` compartilhado (mesmo precedente da
      008/009/010) — nenhum módulo TypeScript de outro contexto é importado.
- [x] **VII. Curadoria vs derivação**: `template_whatsapp.statusAprovacao` é **espelho**
      (nunca editável localmente — só a sincronização sob demanda atualiza); `canal_
      whatsapp`/segredo são curados (config manual). `dentroDaJanela`/`emOptOut` são sempre
      derivados, nunca colunas que possam divergir. Nenhum vínculo é auto-revertido — opt-
      out só muda por ação explícita (registrar/reverter), nunca por job.
- [x] **VIII. Superfície de escrita mínima**: ~14 endpoints autenticados cobrem exatamente o
      que o `spec.md` pede (conexão, templates, envio individual, janela, opt-out) — sem
      antecipar fila de atendimento (012), disparo em massa (015) ou FAQ/IA (013).
      **Sincronização de template é sempre sob demanda** (regra explícita da constituição,
      citada literalmente em `research.md`) — nenhum job periódico chamando a Graph API.
      Sem `DELETE` físico de `canal_whatsapp`/`template_whatsapp`.
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 5 tabelas.
      - **Dinheiro**: N/A (WhatsApp não tem valor monetário nesta spec).
      - **Tempo**: `@db.Timestamptz(6)` em todos os timestamps; janela de 24h calculada com
        `agoraUtc()`, livre de locale.
      - **Status**: `MensagemWhatsappStatusEntrega`/`TemplateWhatsappStatus` são eixos de
        status próprios do canal, sem sobrepor `StatusTransacaoCanonico`/
        `StatusContratoCanonico` (que são do Financeiro, ainda inexistente).
      - **Idempotência**: webhook dedupado por hash do payload **e** por `(canalOrigem,
        idExterno)` por mensagem; opt-out idempotente (pedido repetido não duplica linha).
      - **Auditoria**: canal/template/opt-out audita em `crm_admin_audit` (007, reuso
        deliberado — ver `research.md`); `evento_webhook_whatsapp` é o próprio log de
        eventos crus (Princípio IV), não um substituto da auditoria de escrita curada.
      - **Erros**: validação zod → 422; sem permissão → 403; sem token → 401; canal/
        template/opt-out inexistente → 404; conflitos de regra de negócio (janela fechada,
        template não aprovado, opt-out ativo, canal inativo) → 409; falha do provedor
        externo → 502; assinatura de webhook inválida → 401 (handshake mal formado → 403).
      - **Config/segredos**: nenhuma chave `.env` nova — reaproveita
        `CRM_INTEGRACAO_CIFRA_KEY` (007).
      - **Multi-conta**: N/A (WhatsApp não é uma das 7 contas financeiras de origem).
      - **Dependência nova**: nenhuma (`fetch` nativo + `rawBody` nativo do Nest).

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking**: nenhum ponto fora
do padrão já estabelecido pelas specs 007/009/010 — a única decisão de arquitetura
"não-óbvia" (não reaproveitar `evento_origem`/`WebhookAuthenticator`) está justificada em
`research.md`, não é uma violação da constituição.

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma que nenhuma coluna nova entra em
`Interacao`/`Pessoa`/`Lead` (só FKs apontando para eles); `contracts/webhook-inbound.md`
confirma que a assinatura HMAC é o único gate de segurança das rotas públicas; `contracts/
canal-templates.md` confirma que a sincronização é sempre uma ação `POST` explícita;
`CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/011-crm-whatsapp-integracao/
├── plan.md               # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── canal-templates.md
│   ├── webhook-inbound.md
│   └── envio-optout-rbac.md
└── tasks.md                # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── crm/
│   │   ├── domain/
│   │   │   └── whatsapp/
│   │   │       ├── janela-24h.ts            # estaDentroDaJanela24h(...) pura
│   │   │       ├── assinatura.ts            # HMAC-SHA256 + comparação constante (própria, não reusa auth/webhook)
│   │   │       ├── payload-webhook.schema.ts # zod, .passthrough()
│   │   │       └── mapear-status-entrega.ts # sent|delivered|read|failed -> enum
│   │   ├── application/
│   │   │   └── whatsapp/
│   │   │       ├── canal-whatsapp.service.ts
│   │   │       ├── template-whatsapp.service.ts
│   │   │       ├── graph-api-client.ts           # interface + token DI
│   │   │       ├── meta-graph-api.client.ts      # implementação fetch
│   │   │       ├── webhook-whatsapp.service.ts   # processarEvento(...)
│   │   │       ├── envio-whatsapp.service.ts
│   │   │       └── optout-whatsapp.service.ts
│   │   ├── infra/
│   │   │   └── whatsapp/  (repos Prisma: canal, template, mensagem, evento-webhook, optout)
│   │   ├── dto/
│   │   │   └── whatsapp/  (zod schemas: canal, enviar-mensagem, optout)
│   │   ├── whatsapp-admin.controller.ts    # /crm/admin/whatsapp/** (canal, templates, eventos)
│   │   ├── whatsapp.controller.ts          # /crm/whatsapp/** (janela, mensagens, optout)
│   │   ├── whatsapp-webhook.controller.ts  # /webhooks/whatsapp (público)
│   │   └── crm.module.ts            # editado — registra os novos providers/controllers
│   ├── auth/rbac/catalogo.ts        # editado — +4 permissões
│   └── main.ts                       # editado — rawBody: true
├── prisma/
│   ├── schema.prisma                 # editado — 5 models + 6 enums
│   └── migrations/<ts>_crm_whatsapp/migration.sql
└── test/
    ├── crm-whatsapp.e2e-spec.ts
    └── support/crm-whatsapp.ts        # dublê de GraphApiClient + helper de assinatura HMAC

frontend/
├── src/
│   ├── whatsapp/
│   │   ├── whatsapp-admin-page.tsx     # CRM · WhatsApp — canal + templates (crm_admin:gerir_whatsapp)
│   │   ├── canal-form.tsx               # campos de segredo só-escrita, máscara
│   │   ├── templates-list.tsx           # badge de status, botão sincronizar
│   │   ├── janela-indicator.tsx         # "dentro da janela" / "fora — use template"
│   │   ├── optout-badge.tsx
│   │   ├── use-whatsapp.ts               # TanStack Query hooks
│   │   └── *.test.tsx
│   ├── nav-items.ts                      # editado — item CRM · WhatsApp
│   └── router.tsx                        # editado — rotas /crm/whatsapp/**
```

**Structure Decision**: Web application (Option 2 do template) — já em uso desde a 001.
Tudo dentro do bounded context `crm` existente (`backend/src/crm/`), nova pasta de domínio
`whatsapp/` ao lado de `interacao/lead/pipeline/segmento/tag`; frontend ganha
`src/whatsapp/` como módulo de tela próprio, mesmo padrão de `src/leads/`/`src/pipelines/`.

## Complexity Tracking

Nenhuma violação da constituição. Nenhuma entrada.
