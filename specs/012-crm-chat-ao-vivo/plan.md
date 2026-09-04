# Implementation Plan: CRM · Chat ao Vivo

**Branch**: `012-crm-chat-ao-vivo` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-crm-chat-ao-vivo/spec.md`

## Summary

Sexta fatia da Fase 1 (CRM), visão Parte 8.5/8.12. Constrói a inbox de atendimento ao vivo
**sobre** a timeline de `interacao` unificada (spec 009) e o canal WhatsApp já conectado
(spec 011), dentro do bounded context `crm` já não-vazio desde 007–011. Adiciona
`atendimento` (a conversa/caso — fila, prioridade, atendente/equipe atual, SLA de 1ª
resposta, CSAT), `transferencia_atendimento` (histórico de 1ª classe, append-only) e
`resposta_atendimento` (histórico de 1ª classe, 1:1 por interação de saída — quem respondeu,
com/sem IA); mais duas colunas em tabelas já existentes: `interacao.atendimento_id`
(nullable — agrupa a timeline existente sob um atendimento, sem duplicá-la) e
`equipe.mensagem_fora_expediente` (nullable — texto do aviso automático). Endereçamento é
**por carga/disponibilidade** (CL-01): entre os membros ativos de uma equipe `tipo =
ATENDIMENTO` em expediente (reusa `estaEmExpediente`, spec 007), escolhe quem tem menos
atendimentos `EM_ATENDIMENTO` no momento — sempre um cálculo derivado, nunca um cursor
persistido. SLA de 1ª resposta é igualmente derivado a cada leitura (sem coluna de estado
nem job de fundo — volume baixo, CL-02). CSAT reaproveita a interação `tipo = NPS` já
existente (nenhuma entidade nova). Resposta continua saindo pelo `EnvioWhatsappService`/
`GraphApiClient` já existentes da spec 011 quando o canal é WhatsApp.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11, Prisma `^6` + `@prisma/client` (3 models novos, 3
  enums novos, +1 coluna em `Interacao`, +1 coluna em `Equipe`), `zod` 3 (DTOs). `EntidadeId`/
  `uuidv7()`, `agoraUtc()` vêm do `core`. Reaproveita diretamente (mesmo bounded context):
  `estaEmExpediente`/`OpcoesExpediente` (007 — endereçamento e resposta fora do expediente),
  `RegistrarInteracaoService`/`validarAncora`/`validarCamposPorTipo` (009 — toda mensagem de
  um atendimento é uma `interacao`), `EquipeRepository`/`equipe_membro` ativo (007),
  `EnvioWhatsappService`/`GRAPH_API_CLIENT` (011 — envio quando canal é WhatsApp, já respeita
  janela de 24h/template). **Nenhum contrato novo no `core`** — FKs de `Atendimento` para
  `Pessoa`/`Lead`/`Usuario`/`Equipe`/`CanalWhatsapp` são só `schema.prisma` (mesmo
  precedente 008/009/010/011).
- Frontend: **nenhuma nova**. React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch`, `usePermissoesEfetivas` + `RequirePermissao`, `TimelineInteracoes` (009,
  reaproveitada dentro da visão de conversa).

**Storage**: **PostgreSQL 16 via Prisma** — 10ª migração de negócio (após `_rbac`,
`_clientes` ×2, `_ingestao`, `_crm_admin` ×2, `_crm_lead`, `_crm_interacao`,
`_crm_pipeline`, `_crm_whatsapp`). 3 tabelas novas: `atendimento`, `transferencia_
atendimento`, `resposta_atendimento` + 3 enums (`AtendimentoCanal`, `AtendimentoStatus`,
`AtendimentoPrioridade`). 2 `ALTER TABLE`: `interacao` ganha `atendimento_id` (nullable, FK),
`equipe` ganha `mensagem_fora_expediente` (nullable). **Nenhuma tabela de auditoria
genérica nova** — a auditoria de negócio desta spec (quem respondeu/com IA, histórico de
transferência) é histórico de 1ª classe (`resposta_atendimento`/`transferencia_atendimento`),
mesmo precedente de `oportunidade_movimentacao` (010) não ser `crm_admin_audit`. `CHECK` de
âncora XOR (`pessoa_id`/`lead_id`) via SQL bruto na própria migração (mesmo padrão
007/009/010).

**Testing**:
- Backend unit (`jest`, sem banco), `backend/src/crm/domain/atendimento/`:
  - `roteamento.spec.ts` — `escolherAtendentePorCarga`: menor carga vence; empate resolvido
    por menor `usuarioId` (determinístico); lista vazia → `null`.
  - `sla.spec.ts` — `calcularSlaAtendimento`: sem 1ª resposta e prazo estourado → `estourado:
    true`; dentro do prazo → `minutosRestantes` correto; já respondido ou encerrado →
    nunca estourado (mesmo depois do prazo); matriz de fuso não se aplica aqui (cálculo é
    diferença de instantes, não hora local — sem dependência de `TZ`).
  - `fila.spec.ts` — `ordenarFila`: prioridade desc, FIFO dentro da mesma prioridade.
  - `csat.spec.ts` — `csatElegivel`/`interpretarRespostaCsat`: só `ENCERRADO` +
    `csatSolicitadoEm` preenchido + sem resposta prévia é elegível; texto não-numérico ou
    fora de 0–10 → `null` (vira interação comum, nunca CSAT).
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts`),
  `test/crm-atendimento.e2e-spec.ts`:
  - migração cria as 3 tabelas + 3 enums + as 2 colunas novas; `CHECK` de âncora recusa
    0 ou 2 preenchidos.
  - **Criação/reuso**: 1ª mensagem de um número novo por WhatsApp cria 1 atendimento; 2ª
    mensagem da mesma pessoa/canal com atendimento ainda aberto (`AGUARDANDO`\|
    `EM_ATENDIMENTO`) reaproveita o mesmo, sem criar um segundo; mensagem simultânea
    (2 chamadas concorrentes) ainda resulta em 1 único atendimento.
  - **Endereçamento**: 2 atendentes em expediente com cargas diferentes → escolhe o de
    menor carga; nenhum atendente em expediente → fica em `AGUARDANDO` sem atendente;
    atendente assume manualmente um item da fila (`crm_admin`/`atendimento:atender`).
  - **SLA**: `GET` de um atendimento aberto sem resposta reflete `slaEstourado` calculado a
    partir de `abertoEm`/`slaMinutos`; após a 1ª resposta, deixa de estourar
    retroativamente.
  - **Responder**: `atendimento:atender` obrigatório; cria `Interacao` + `RespostaAtendimento`
    (`atendenteId`, `viaIa`); 1ª resposta marca `primeiraRespostaEm`; canal WhatsApp passa
    pelo `EnvioWhatsappService` (janela/template já validados pela 011 — dublê nos testes).
  - **Transferência**: `atendimento:transferir` obrigatório; gera `TransferenciaAtendimento`;
    destino = atendente específico → atribuição direta; destino = equipe sem atendente →
    reaplica o roteamento por carga dentro da equipe; timeline (`GET
    /crm/atendimentos/:id/timeline`) idêntica antes/depois (nenhuma interação duplicada ou
    perdida).
  - **Encerrar/CSAT**: `atendimento:encerrar` obrigatório; encerrar marca
    `csatSolicitadoEm`; `POST .../csat` grava a 1ª nota, recusa a 2ª (409); resposta
    numérica 0–10 via webhook do WhatsApp logo após o encerramento é reconhecida como CSAT
    (interação `tipo NPS`, não uma mensagem comum); resposta não-numérica continua como
    interação comum.
  - **Resposta automática fora do expediente**: equipe `ATENDIMENTO` sem ninguém em
    expediente e com `mensagemForaExpediente` configurada → 1ª mensagem do atendimento
    dispara o auto-reply exatamente 1×; 2ª mensagem do mesmo atendimento não dispara de
    novo; sem `mensagemForaExpediente` configurada em nenhuma equipe → sem auto-reply, fila
    normal; auto-reply nunca marca `primeiraRespostaEm`.
  - **Guard/escopo**: `atendimento:ver_todos`\|`ver_proprios` (mesmo padrão `lead`/
    `oportunidade`); sem token → 401; sem permissão → 403; `crm_admin:gerir_atendimento`
    protege configuração de SLA/mensagem por equipe.
  - **Catálogo/efetivas**: `GET /admin/rbac/permissoes` inclui as 6 novas.
  - **Regressão**: suíte 003–011 + `/health` (11 contextos) verdes.
- Frontend (`vitest` + Testing Library, jsdom): lista da fila ordenada com indicador de SLA;
  ação assumir/transferir/encerrar condicionada à permissão; conversa reaproveita
  `TimelineInteracoes` (009) com composer de resposta; badge/():CSAT exibido quando presente;
  tela de configuração de SLA/mensagem fora do expediente por equipe sob
  `crm_admin:gerir_atendimento`.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174`; Postgres dev em
`:55432` — todas as 3 portas verificadas livres/disponíveis no início desta sessão (ver
`quickstart.md` para os comandos de verificação usados e o resultado real). Dev Linux; CI
Linux (GitHub Actions).

**Performance Goals**: sem meta nova além de SC-001/SC-006 (endereçamento em poucos segundos,
aviso automático em até 1 minuto) — atendido por construção: endereçamento e SLA são
consultas síncronas sobre no máximo dezenas de linhas (CL-02), sem fila/lote.

**Constraints**:
- **Nenhuma porta nova.**
- **Contextos delimitados** (Princípio VI): `crm` continua sem importar `clientes`. FKs de
  `Atendimento` para `Pessoa`/`Lead` são só `schema.prisma` (mesmo precedente 008/009/010/
  011) — **nenhum contrato novo no `core`**.
- **Log de eventos + projeções** (Princípio IV): não há evento cru externo nesta spec —
  `atendimento` é uma projeção/agrupamento **sobre** eventos já registrados (`interacao`,
  que por sua vez já deriva de `evento_webhook_whatsapp` na 011). A mutação de `atendimento`
  em si (status, atendente atual) é estado normal de aplicação, protegido por histórico de
  1ª classe (`transferencia_atendimento`/`resposta_atendimento`), não um log de eventos
  próprio — mesmo padrão de `oportunidade` (010), que também não reimplementa a etapa 0 da
  ingestão (006) para mutações internas do CRM.
- **Agregados derivados** (Princípio V): `slaEstourado`, a **escolha** de atendente por
  carga, e a ordenação da fila por prioridade são **sempre** `f(estado atual) -> resultado`,
  nunca contador/cursor persistido nem job de fundo (CL-02 justifica explicitamente rejeitar
  o padrão `WorkerScheduler` da 006 aqui — ver `research.md`).
- **Superfície de escrita mínima** (Princípio VIII): endpoints cobrem exatamente
  fila/endereçar/assumir/responder/transferir/encerrar/CSAT/config — sem antecipar FAQ/IA
  (013) ou disparo em massa (015); esta spec só **guarda** a flag `viaIa` por resposta, não
  gera nenhuma sugestão de IA.
- **RBAC 004**: cada endpoint autenticado sob `@RequerPermissao`/`@AutenticadoBasta`; +6
  permissões (`atendimento:{ver_todos,ver_proprios,atender,transferir,encerrar}` +
  `crm_admin:gerir_atendimento`); 403 ≠ 401.
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~24 arquivos novos no backend (`src/crm/{domain,application,infra,dto}/
atendimento/**`, `atendimento.controller.ts`, `crm-admin-atendimento.controller.ts`,
`crm.module.ts` estendido, `prisma/migrations/<ts>_crm_atendimento/`, `test/
crm-atendimento.e2e-spec.ts`), ~5 arquivos editados (`schema.prisma`,
`src/auth/rbac/catalogo.ts`, `crm.module.ts`, `webhook-whatsapp.service.ts` — abre/reusa
atendimento e detecta CSAT, `envio-whatsapp.service.ts` — grava `RespostaAtendimento`),
~9 no frontend (`src/atendimento/**` + testes, `nav-items.ts`, `router.tsx`), **0 dep
nova**, **1 migração**, **~16 endpoints** autenticados, **0 endpoint público novo** (reusa o
webhook já existente da 011), **0 chave `.env` nova**, 1 doc novo, 3 docs atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 3 tabelas nascem com **ID surrogate UUID v7** gerado na
      app. Nenhum identificador de origem externa envolvido (WhatsApp já resolve isso na
      011); `Atendimento` referencia só entidades internas (`Pessoa`/`Lead`/`Usuario`/
      `Equipe`/`CanalWhatsapp`) por FK direta, nunca por id de origem.
- [x] **II. Clarificar antes de assumir**: as 2 decisões que bloqueavam esta spec no
      ROADMAP (endereçamento por carga/disponibilidade; volume baixo) foram resolvidas com o
      dono do produto **antes** da escrita do `spec.md` (2026-09-04) — CL-01/CL-02. Os
      demais pontos de design (D-01..D-08) seguem o mesmo precedente de "default razoável
      documentado" das specs 008–011. **Zero `NEEDS CLARIFICATION`** remanescente.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não é um adaptador de
      ingestão financeira; nenhuma regra do `crm` conhece "Guru"/"Asaas"/etc.
- [x] **IV. Log de eventos + projeções**: nenhum evento cru novo — `atendimento` é uma
      projeção sobre `interacao`, que já deriva de eventos crus na 011 (ou é criada
      diretamente por um atendente, canal `MANUAL`). Toda transição de estado relevante
      (transferência, resposta) é registrada em histórico append-only próprio antes de
      qualquer leitura subsequente depender dela.
- [x] **V. Agregados derivados**: endereçamento (`escolherAtendentePorCarga`), SLA
      (`calcularSlaAtendimento`) e ordenação de fila (`ordenarFila`) são funções puras
      `f(estado atual) -> resultado`; nenhum contador de carga, cursor de rodízio ou flag de
      SLA persistido — ver `research.md` D-05/CL-02 para a rejeição explícita de job de
      fundo dado o volume baixo.
- [x] **VI. Contextos delimitados — observar, não escrever**: `crm` continua **sem**
      importar `clientes`. FKs de `Atendimento`/`TransferenciaAtendimento`/
      `RespostaAtendimento` para `Pessoa`/`Lead`/`Usuario` são só `schema.prisma`
      compartilhado (mesmo precedente 008/009/010/011).
- [x] **VII. Curadoria vs derivação**: `atendimento.prioridade`/`equipe_id`/`atendente_
      atual_id` são estado **curado** (ação explícita: endereçar, assumir, transferir);
      `slaEstourado` é sempre **derivado**, nunca uma coluna que possa divergir. Nenhuma
      transferência é auto-revertida.
- [x] **VIII. Superfície de escrita mínima**: ~16 endpoints cobrem exatamente
      fila/endereçamento/resposta/transferência/encerramento/CSAT/config desta spec — FAQ/
      IA (013) e disparo em massa (015) ficam de fora; nenhuma sincronização automática com
      API externa nova (o envio via WhatsApp continua um `POST` explícito por resposta,
      herdado da 011).
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 3 tabelas.
      - **Dinheiro**: N/A (sem valor monetário nesta spec).
      - **Tempo**: `@db.Timestamptz(6)` em todos os timestamps; SLA calculado com
        `agoraUtc()`, livre de locale (diferença de instantes, não hora local).
      - **Status**: `AtendimentoStatus`/`AtendimentoPrioridade` são eixos próprios do
        atendimento, sem sobrepor `StatusTransacaoCanonico`/`StatusContratoCanonico`
        (Financeiro, ainda inexistente).
      - **Idempotência**: criação de atendimento por mensagem recebida é idempotente pela
        mesma disciplina de `(canalOrigem, idExterno)` já usada por `interacao` (009) +
        busca de atendimento aberto antes de criar um novo; resposta automática fora do
        expediente é enviada no máximo 1× por atendimento (flag derivada de já existir
        alguma interação de saída não-humana registrada para aquele atendimento).
      - **Auditoria**: `resposta_atendimento`/`transferencia_atendimento` são histórico de
        1ª classe (mesmo raciocínio de `oportunidade_movimentacao`, 010) — não
        `crm_admin_audit`, que é para configuração administrativa (SLA/mensagem por
        equipe, que sim usa `crm_admin_audit`).
      - **Erros**: validação zod → 422; sem permissão → 403; sem token → 401; atendimento/
        transferência/CSAT inexistente ou fora de escopo → 404; conflitos de regra de
        negócio (responder sem ser o atendente atual, CSAT já registrado, atendimento já
        encerrado) → 409.
      - **Config/segredos**: nenhuma chave `.env` nova.
      - **Multi-conta**: N/A.
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking**: nenhum ponto fora do
padrão já estabelecido pelas specs 007/009/010/011 — a única decisão "não-óbvia" (rejeitar
`WorkerScheduler` para o alerta de SLA) está justificada em `research.md`, não é uma
violação da constituição.

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma que `Interacao` ganha só uma
coluna nullable (`atendimentoId`) sem alterar seu contrato de mutabilidade (009); `contracts/
roteamento-sla.md` confirma que endereçamento/SLA nunca persistem estado derivado;
`contracts/atendimento-crud.md`/`contracts/transferencia-csat.md` confirmam RBAC em toda
rota de escrita; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/012-crm-chat-ao-vivo/
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── atendimento-crud.md
│   ├── transferencia-csat.md
│   └── roteamento-sla.md
└── tasks.md                # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── crm/
│   │   ├── domain/
│   │   │   └── atendimento/
│   │   │       ├── roteamento.ts        # escolherAtendentePorCarga(...) pura
│   │   │       ├── sla.ts               # calcularSlaAtendimento(...) pura
│   │   │       ├── fila.ts              # ordenarFila(...) pura
│   │   │       └── csat.ts              # csatElegivel/interpretarRespostaCsat(...) puras
│   │   ├── application/
│   │   │   └── atendimento/
│   │   │       ├── abrir-atendimento.service.ts   # porta: abre/reaproveita + endereça
│   │   │       ├── atendimento.service.ts         # assumir/responder/encerrar
│   │   │       ├── transferencia.service.ts
│   │   │       ├── csat.service.ts
│   │   │       └── atendimento-consulta.service.ts # escopo ver_todos|ver_proprios
│   │   ├── infra/
│   │   │   └── atendimento/  (repos Prisma: atendimento, transferencia, resposta)
│   │   ├── dto/
│   │   │   └── atendimento/  (zod schemas)
│   │   ├── atendimento.controller.ts            # /crm/atendimentos/**
│   │   ├── crm-admin-atendimento.controller.ts   # /crm/admin/atendimento/** (SLA/msg por equipe)
│   │   └── crm.module.ts                # editado — registra os novos providers/controllers
│   ├── auth/rbac/catalogo.ts            # editado — +6 permissões
│   └── (webhook-whatsapp.service.ts / envio-whatsapp.service.ts editados — ver data-model.md)
├── prisma/
│   ├── schema.prisma                     # editado — 3 models + 3 enums + 2 colunas
│   └── migrations/<ts>_crm_atendimento/migration.sql
└── test/
    └── crm-atendimento.e2e-spec.ts

frontend/
├── src/
│   ├── atendimento/
│   │   ├── AtendimentoInboxPage.tsx     # CRM · Chat ao Vivo — fila + conversa
│   │   ├── FilaAtendimento.tsx           # lista ordenada, indicador de SLA
│   │   ├── ConversaAtendimento.tsx       # TimelineInteracoes (009) + composer + ações
│   │   ├── TransferirModal.tsx
│   │   ├── CsatBadge.tsx
│   │   ├── AtendimentoAdminPage.tsx      # SLA/mensagem fora do expediente por equipe
│   │   └── *.test.tsx
│   ├── nav-items.ts                      # editado — item CRM · Chat ao Vivo
│   └── router.tsx                        # editado — rotas /crm/atendimentos/**
```

**Structure Decision**: Web application (Option 2) — já em uso desde a 001. Tudo dentro do
bounded context `crm` existente (`backend/src/crm/`), nova pasta de domínio `atendimento/`
ao lado de `expediente`/`interacao`/`lead`/`pipeline`/`whatsapp`; frontend ganha
`src/atendimento/` como módulo de tela próprio, mesmo padrão de `src/whatsapp/`/
`src/pipelines/`.

## Complexity Tracking

Nenhuma violação da constituição. Nenhuma entrada.
