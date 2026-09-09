# Implementation Plan: CRM · Disparos (WhatsApp)

**Branch**: `015-crm-disparos` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-crm-disparos/spec.md`

## Summary

Nona fatia da Fase 1 (CRM), visão Parte 8.6. Envio em massa de WhatsApp construído **sobre**
a infraestrutura já existente da spec 011 (`CanalWhatsapp`/`TemplateWhatsapp`/
`MensagemWhatsapp`/`OptOutWhatsapp`, `EnvioWhatsappService`, `GraphApiClient`) e da spec 009
(`Segmento`) — nenhuma tabela paralela de canal/template/mensagem é criada. Três entidades
novas no bounded context `crm`: **`ExecucaoDisparo`** (campanha — template[s], canal,
segmento e/ou lista importada, agendamento, status), **`DisparoContatoImportado`** (linhas de
CSV validadas, com a escolha de virar Lead ou não feita na importação — FR-007a) e
**`MensagemDisparo`** (resultado por destinatário — enviado/entregue/lido/falhou/pulado,
variante de teste A/B). A lista de destinatários é resolvida (dedup + opt-out) no momento em
que o disparo passa a `EM_ANDAMENTO` — imediatamente para envio já confirmado, ou pelo worker
no horário agendado (FR-006) — nunca travada na criação para disparos com origem em segmento.
Worker in-process (`setInterval`, mesmo padrão das specs 006/014, decisão confirmada com o
dono do produto: volume até poucos milhares por disparo) processa `MensagemDisparo` pendentes
em lotes pequenos por passada — o próprio ritmo do worker É o throttling (FR-008). Cada envio
bem-sucedido reaproveita **exatamente** o caminho de `EnvioWhatsappService`/
`RegistrarInteracaoService`/`MensagemWhatsapp` já existente (FR-015) — o Workflow do Disparo
não inventa um 2º jeito de mandar mensagem. Falha do provedor tenta de novo um número
limitado de vezes antes de virar terminal (FR-010a); falha que não faz sentido reter
(opt-out, telefone inválido, template não aprovado) já nasce terminal. Quality rating é
consultado sob demanda direto na Graph API (**0 sincronização automática** — Princípio VIII),
reaproveitando o canal já conectado. Teste A/B divide o público 100% entre duas variantes,
sem promoção automática de vencedora (decisão confirmada com o dono do produto). Frontend:
construtor de disparo + visão geral/histórico.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11, Prisma `^6`. `EntidadeId`/`uuidv7()`, `agoraUtc()` do
  `core`. Reaproveita diretamente (mesmo bounded context `crm`, sem porta nova): `CanalWhatsappRepository`/
  `CanalWhatsappService` (decifrar access token), `TemplateWhatsappRepository` (validar
  `APROVADO`), `MensagemWhatsappRepository`, `OptOutWhatsappService.ativoPorTelefone`,
  `RegistrarInteracaoService` (009), `EnvioWhatsappService`-**equivalente**: o envio de um
  disparo chama a mesma sequência (Graph API → `RegistrarInteracaoService.registrar` →
  `MensagemWhatsappRepository.criar`) através de um novo `EnviarMensagemDisparoService`
  dedicado (não reusa `EnvioWhatsappService` como está porque este é orientado a uma
  requisição HTTP síncrona de 1 mensagem — o disparo lê o lote do worker e evita repetir
  lógica duplicando os 3 passos num serviço próprio que os dois chamam por baixo — ver
  research.md D-R1), `GraphApiClient` (011, **estendido** com `consultarQualityRating`),
  `SegmentoRepository`/`filtro-segmento` (009, `construirWhere`/`validarFiltro` reaproveitados
  **sem** o escopo de visão por sujeito — ver research.md D-R2), `normalizarTelefone` (008),
  `RegistrarLeadService` (008, para contatos de CSV com `criarLead=true`), `TagService` não
  usado aqui. `WorkerScheduler`/`WorkerService` de `ingestao` (006) e `workflow` (014) são a
  **referência de padrão**, não dependência de código.
  - Parsing de CSV: **0 dependência nova** — arquivo pequeno (poucos milhares de linhas),
    parser à mão em `domain/disparos/importar-csv.ts` (vírgula/`;`, aspas simples, 1ª linha
    cabeçalho) é suficiente e evita puxar `csv-parse`/`papaparse` só para isso.
- Frontend: **nenhuma nova**. React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch`, `usePermissoesEfetivas` + `RequirePermissao`.

**Storage**: **PostgreSQL 16 via Prisma** — 13ª migração de negócio
(`20260909171024_crm_disparos`), após `_crm_workflow`. 3 tabelas novas, todas em `crm`:
`execucao_disparo`, `disparo_contato_importado`, `mensagem_disparo` + 2 enums novos
(`ExecucaoDisparoStatus`, `MensagemDisparoStatus`) + 1 enum pequeno (`DisparoVariante`: `A`,
`B`). `mensagem_disparo.mensagem_whatsapp_id` é `@unique` (1:1 opcional — só existe depois que
a mensagem foi de fato despachada para a Graph API). Nenhuma coluna nova em tabelas
existentes (diferente de 010/012, que estenderam `equipe`/`interacao`) — a ponte com
`mensagem_whatsapp` é só uma FK opcional em `mensagem_disparo`, nunca o inverso.

**Testing**:
- Backend unit (`jest`, sem banco), `backend/src/crm/domain/disparos/`:
  - `resolver-destinatarios.spec.ts` — dedup por telefone normalizado entre segmento e CSV
    (segmento e CSV com o mesmo telefone → 1 só); telefone repetido dentro do próprio CSV →
    1 só; nenhuma fonte → lista vazia.
  - `atribuir-variante.spec.ts` — determinístico (mesmo telefone sempre cai na mesma
    variante); distribuição aproximada do percentual configurado sobre uma amostra grande;
    sem teste A/B (`percentualB` ausente) → todo mundo variante única.
  - `importar-csv.spec.ts` — cabeçalho com `telefone`/`nome`; linha sem telefone ou telefone
    inválido → `invalidos` com motivo, sem derrubar as demais; `;` e `,` como separador;
    aspas simples.
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` força
  `CRM_DISPAROS_WORKER_ENABLED=false`), `test/crm-disparos.e2e-spec.ts`:
  - migração cria as 3 tabelas + enums.
  - **Ciclo de vida**: `POST /crm/disparos` com segmento + template aprovado + envio imediato
    → materializa `mensagem_disparo` (dedup, exclui opt-out) e vira `EM_ANDAMENTO`;
    `agendadoPara` futuro → fica `AGENDADO`, sem `mensagem_disparo` ainda; `POST
    /crm/disparos/{id}/cancelar` num agendado → `CANCELADO`, nunca materializa.
  - **Execução reativa** (chamando `WorkerService.processarPassada()` direto, mesmo padrão de
    `POST /ingestao/eventos/processar`/`POST /crm/workflow/processar`): disparo agendado cujo
    horário já passou → materializa e envia; disparo `EM_ANDAMENTO` com `mensagem_disparo`
    pendentes → envia até `LOTE` por passada, chamando o dublê de `GraphApiClient`; todas
    enviadas/puladas/falhas terminais → `CONCLUIDO`; retry: dublê falha 2× e sucede na 3ª →
    mensagem termina `ENVIADA` com `tentativas=3`; dublê sempre falha → `FALHOU` terminal ao
    atingir `CRM_DISPAROS_WORKER_MAX_TENTATIVAS`; reprocessar a mesma passada 2× não duplica
    envio (idempotente pelo próprio estado da linha).
  - **Segmentação e CSV**: segmento com lead+pessoa correspondendo ao mesmo telefone → 1
    envio; `POST /crm/disparos/importar-csv` com `criarLead=true` cria Lead novo para
    telefone não reconhecido, `criarLead=false` não cria nada; CSV com telefone já em
    opt-out → `PULADA`.
  - **A/B**: disparo com `templateBId` + `percentualVarianteB=50` sobre segmento de 20 →
    ambas variantes aparecem no resultado; `GET /crm/disparos/{id}` mostra métricas por
    variante separadas.
  - **Quality rating**: `GET /crm/admin/whatsapp/canais/{id}/quality-rating` chama o dublê de
    `GraphApiClient.consultarQualityRating` e devolve o valor, sem persistir nada.
  - **Guard/escopo**: `disparo:ver` lê; `disparo:criar` cria/importa CSV; `disparo:cancelar`
    cancela; sem token → 401; sem permissão → 403.
  - **Regressão**: suíte 003–014 + `/health` verde.
- Frontend (`vitest` + Testing Library, `fireEvent`, mesmo padrão de
  `pipelines/PipelinesPage.test.tsx`): construtor de disparo, lista/detalhe com métricas.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174`; Postgres dev em
`:55432`. Worker desligado em teste (determinístico via `POST /crm/disparos/processar`).

**Performance Goals**: SC-004 (motivo de falha visível em até 1 min) e SC-005 (quality rating
sob demanda, sem espera de job de fundo) atendidos por leitura direta do banco/consulta
síncrona à Graph API. Volume por disparo até poucos milhares de destinatários (decisão
confirmada com o dono do produto, 2026-09-09) — worker de lote pequeno por passada é
suficiente, sem fila/broker externo.

**Constraints**:
- **Contextos delimitados** (Princípio VI): `preferencia_comunicacao` não existe (Central de
  Clientes é fase futura) — o disparo respeita só `opt_out_whatsapp`, já a fonte de verdade
  de consentimento vigente (documentado como lacuna nas Assumptions do spec).
- **Superfície de escrita mínima** (Princípio VIII): `consultarQualityRating` é **sempre sob
  demanda**, nunca persistida nem sincronizada em segundo plano — cada chamada bate direto na
  Graph API e devolve a resposta, sem linha nova em nenhuma tabela.
- **Agregados derivados** (Princípio V): métricas do disparo (contagem por status, por
  variante) são sempre uma `GROUP BY` sobre `mensagem_disparo`, nunca um contador
  incremental mantido à parte.
- **Idempotência**: reprocessar uma passada do worker nunca duplica envio — cada
  `mensagem_disparo` só é enviada enquanto seu próprio `status` permanece `PENDENTE`; o
  worker seleciona com `SELECT ... FOR UPDATE SKIP LOCKED`-equivalente via transação Prisma
  curta por linha (mesmo mutex por item já usado no worker da 006).
- **RBAC 004**: `disparo:{criar,ver,cancelar}` (**+3** permissões novas); quality rating
  reaproveita `crm_admin:ver`/`crm_admin:gerir_whatsapp` já existentes (011) — **0** permissão
  nova para essa parte.
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~26 arquivos novos no backend (`src/crm/{domain,application,infra,dto}/
disparos/**`, `disparo.controller.ts`, `prisma/migrations/20260909171024_crm_disparos/`,
`test/crm-disparos.e2e-spec.ts`), ~6 arquivos editados (`schema.prisma`,
`src/auth/rbac/catalogo.ts`, `crm.module.ts`, `src/config/env.schema.ts`,
`graph-api-client.ts`/`meta-graph-api.client.ts`, `whatsapp-admin.controller.ts` — endpoint de
quality rating), ~6 no frontend (`src/disparos/**`, `nav-items.ts`, `router.tsx`). **0 dep
nova**, **1 migração**, **~10 endpoints**, **0 endpoint público novo**, **0 chave `.env` de
segredo nova** (4 variáveis de configuração do worker, sem segredo — mesmo padrão de
`INGESTAO_WORKER_*`/`CRM_WORKFLOW_WORKER_*`), 1 doc novo, 4 docs atualizados (`CLAUDE.md`,
`README.md`, `ROADMAP.md`, `docs/015-crm-disparos.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 3 tabelas nascem com **ID surrogate UUID v7** gerado na
      app. Nenhum identificador de origem externa envolvido (`waMessageId` já é tratado como
      alias em `mensagem_whatsapp` desde a 011, não repetido aqui).
- [x] **II. Clarificar antes de assumir**: as 4 decisões que bloqueavam esta spec (volume
      esperado por disparo; contato de CSV virar Lead ou não; mecânica do teste A/B; retry de
      falha de envio) foram resolvidas com o dono do produto **antes** da escrita do
      `plan.md`, integradas ao `spec.md` em 2026-09-09 (seção Clarifications). **Zero `NEEDS
      CLARIFICATION`** remanescente.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não é um adaptador de ingestão
      financeira; nenhuma regra de disparo conhece "Guru"/"Asaas"/etc. A única borda externa
      (Graph API da Meta) já é isolada atrás de `GraphApiClient` desde a 011; esta spec só
      **estende** essa interface com `consultarQualityRating`, sem criar uma 2ª borda.
- [x] **IV. Log de eventos + projeções**: **N/A direto** ao pipeline de ingestão financeira;
      por analogia, `mensagem_disparo` é o log append-only-por-linha do próprio disparo
      (estado avança PENDENTE→ENVIANDO→terminal, nunca é recriado) e o worker processa em
      lotes idempotentes, cada envio numa transação própria.
- [x] **V. Agregados derivados**: contagens por status/variante são sempre `GROUP BY` em
      `mensagem_disparo`, nunca contador incremental.
- [x] **VI. Contextos delimitados — observar, não escrever**: disparo é 100% interno ao `crm`;
      não lê nem escreve em `clientes`/Financeiro. `preferencia_comunicacao` (dona: Central de
      Clientes, ainda não existe) não é lida — documentado como lacuna explícita, não como
      suposição silenciosa.
- [x] **VII. Curadoria vs derivação**: **N/A direto** (nenhum campo curado por humano em
      disputa com um campo derivado nesta spec).
- [x] **VIII. Superfície de escrita mínima**: ~10 endpoints cobrem só o ciclo de vida do
      disparo (criar/importar CSV/cancelar/consultar/exportar) e o disparo manual do worker;
      quality rating é uma **leitura sob demanda**, nunca uma sincronização — reforça, não
      enfraquece, o princípio.
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 3 tabelas.
      - **Dinheiro**: N/A (nenhum valor monetário nesta spec).
      - **Tempo**: `@db.Timestamptz(6)` em todos os timestamps novos.
      - **Status**: `ExecucaoDisparoStatus`/`MensagemDisparoStatus` são eixos próprios do
        Disparo, sem sobrepor `StatusTransacaoCanonico`/`StatusContratoCanonico`.
      - **Idempotência**: envio de uma `mensagem_disparo` só ocorre enquanto `status =
        PENDENTE`; reprocessar a passada do worker nunca duplica.
      - **Auditoria**: criar/cancelar um disparo audita via `CrmAdminAuditService` (mesma
        forma canônica do core já usada por `canal_whatsapp`/`template_whatsapp`, 011) —
        nenhuma tabela de auditoria nova.
      - **Erros**: formato de entrada (zod) → 400; regra de negócio (sem destino, template
        não aprovado, agendamento no passado, cancelar fora de `AGENDADO`) → 422/409 conforme
        o caso;
        sem permissão → 403; sem token → 401; disparo/execução inexistente → 404.
      - **Config/segredos**: 4 variáveis novas (`CRM_DISPAROS_WORKER_*`), sem segredo.
      - **Multi-conta**: N/A.
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking**: nenhuma peça fora do
padrão já estabelecido — o worker é uma cópia estrutural do padrão da 006/014.

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma que os 2 enums de status e o
índice único em `mensagem_whatsapp_id` cobrem exatamente as transições descritas;
`contracts/disparos.md` confirma que nenhuma rota de escrita ultrapassa o catálogo fechado de
ações (criar, importar CSV, cancelar, processar); nenhum import de outro bounded context em
`src/crm/domain/disparos/**`; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/015-crm-disparos/
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   └── disparos.md
└── tasks.md                # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── crm/
│   │   ├── domain/
│   │   │   └── disparos/
│   │   │       ├── resolver-destinatarios.ts   # dedup segmento ∪ CSV, pura
│   │   │       ├── atribuir-variante.ts        # split A/B determinístico, pura
│   │   │       ├── importar-csv.ts             # parse + valida CSV, pura
│   │   │       └── index.ts
│   │   ├── application/
│   │   │   └── disparos/
│   │   │       ├── disparo.service.ts          # CRUD + criar/cancelar
│   │   │       ├── importar-csv.service.ts     # importa CSV (+ Lead opcional)
│   │   │       ├── materializar-destinatarios.service.ts
│   │   │       ├── enviar-mensagem-disparo.service.ts  # Graph API → interação → mensagem_whatsapp
│   │   │       ├── worker.service.ts           # processarPassada()
│   │   │       ├── worker.scheduler.ts         # setInterval in-house
│   │   │       ├── quality-rating.service.ts   # consulta sob demanda
│   │   │       └── index.ts
│   │   ├── infra/
│   │   │   └── disparos/
│   │   │       ├── execucao-disparo.repository.ts
│   │   │       ├── contato-importado.repository.ts
│   │   │       ├── mensagem-disparo.repository.ts
│   │   │       └── index.ts
│   │   ├── dto/
│   │   │   └── disparos/  (zod schemas: criar, importar-csv, listar)
│   │   ├── disparo.controller.ts               # /crm/disparos/**
│   │   └── crm.module.ts                       # editado
│   ├── auth/rbac/catalogo.ts                   # editado — +3 permissões
│   └── config/env.schema.ts                    # editado — +4 variáveis CRM_DISPAROS_WORKER_*
├── prisma/
│   ├── schema.prisma                           # editado — 3 models + 3 enums
│   └── migrations/20260909171024_crm_disparos/migration.sql
└── test/
    ├── crm-disparos.e2e-spec.ts
    └── setup-db.ts                              # editado — CRM_DISPAROS_WORKER_ENABLED=false

frontend/
├── src/
│   ├── disparos/
│   │   ├── DisparosPage.tsx          # visão geral/histórico
│   │   ├── NovoDisparoPage.tsx       # construtor (template, destino, agendamento, A/B)
│   │   ├── DisparoDetalhePage.tsx    # métricas + falhas + export
│   │   └── *.test.tsx
│   ├── nav-items.ts                  # editado — item Disparos em CRM
│   └── router.tsx                    # editado — rotas /crm/disparos/**
```

**Structure Decision**: Web application (Option 2), já em uso desde a 001. Disparos fica
inteiramente dentro do bounded context `crm` já existente, nova pasta `disparos/` ao lado de
`whatsapp`/`segmento`/`workflow`, mesmo padrão de organização por spec desde a 008.

## Complexity Tracking

Nenhuma violação da constituição. Nenhuma entrada.
