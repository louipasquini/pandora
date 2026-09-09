# Implementation Plan: CRM · Workflow (Motor de Automação)

**Branch**: `014-crm-workflow` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-crm-workflow/spec.md`

## Summary

Oitava fatia da Fase 1 (CRM), visão Parte 8.8. Motor de automação em blocos gatilho →
condições (E/OU) → ações: `fluxo_automacao` (entidade lógica) + `fluxo_automacao_versao`
(snapshot imutável por versão — só uma `PUBLICADA` por fluxo, D-01) + `execucao_fluxo`
(histórico append-only de tentativas). Gatilhos internos são detectados por uma varredura
periódica (`WorkerScheduler` in-house, mesmo padrão `setInterval` da spec 006, 0 dependência
nova) sobre trilhas **já append-only do próprio CRM** — `crm_lead_audit` (criado/estágio),
`oportunidade_movimentacao`, `interacao`, `tag_associacao` — nunca sobre outro bounded
context (D-02). Ações do MVP reaproveitam **exatamente** os serviços já existentes das specs
008/009/010 (`TagService`, `RegistrarInteracaoService`, `MovimentacaoRepository` +
`validarMovimento`) — nenhum caminho de escrita paralelo (D-05). Idempotência por chave
`(fluxo_versao_id, fonte, fonte_registro_id)` com índice único (D-06). Gatilho por evento
externo (`EVENTO_EXTERNO`) fica só modelado — mesmo padrão de deferimento de
`PortaObservacaoPagamentoCrm` (spec 010) — sem execução real nesta versão (CL-01). Biblioteca
de automações prontas é um catálogo `fluxo_modelo`, somente leitura, semeado via seed, com
clonagem para um novo fluxo em rascunho (CL-02). Simulação nunca grava nada (D-03). Frontend:
editor de fluxo (formulário estruturado, não canvas livre — ver research.md D-R1), biblioteca
de modelos, histórico de execuções.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11, Prisma `^6` + `@prisma/client` (4 models novos, 4
  enums novos). `EntidadeId`/`uuidv7()`, `agoraUtc()` do `core`. Reaproveita diretamente
  (mesmo bounded context `crm`, sem porta nova — todas as entidades tocadas por uma ação já
  vivem em `crm`): `LeadRepository`/`CrmLeadAuditService`/`LeadScoreService` (008 — mover lead
  de estágio), `TagService.associar`/`desassociar` (009 — já idempotente e já audita, usado
  tal como está), `RegistrarInteracaoService` (009 — porta in-process já pensada para
  consumidores internos, usada tal como está para a ação "registrar nota"),
  `MovimentacaoRepository.mover` + `validarMovimento` do domínio de pipeline (010 — mover
  oportunidade de etapa, incl. motivo obrigatório em `PERDIDA`), `PipelineRepository` (010 —
  validar etapa destino). `WorkerScheduler`/`WorkerService` da `ingestao` (006) são a
  **referência de padrão**, não uma dependência de código — o worker desta spec é uma classe
  nova e independente dentro de `crm`, seguindo a mesma forma (`setInterval` in-house,
  mutex por execução, desligado em teste).
- Frontend: **nenhuma nova**. React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch`, `usePermissoesEfetivas` + `RequirePermissao`.

**Storage**: **PostgreSQL 16 via Prisma** — 12ª migração de negócio (após `_rbac`,
`_clientes` ×2, `_ingestao`, `_crm_admin` ×2, `_crm_lead`, `_crm_interacao`, `_crm_pipeline`,
`_crm_whatsapp`, `_crm_atendimento`, `_crm_faq_sugestao_ia`). 5 tabelas novas, todas no
bounded context `crm`: `fluxo_automacao`, `fluxo_automacao_versao`, `execucao_fluxo`,
`fluxo_modelo`, `fluxo_cursor_fonte` (cursor do worker, 1 linha por fonte varrida — não é
config de usuário, é estado técnico do próprio worker, mesmo racional de
`evento_etapa`/`ingestao_audit` serem infraestrutura da 006, não dado de negócio curável) + 4
enums (`FluxoGatilhoTipo`, `FluxoVersaoStatus`, `FluxoRegistroTipo`,
`FluxoExecucaoResultado`). Índice único **parcial** `(fluxo_id) WHERE status = 'PUBLICADA'`
(só uma versão publicada por fluxo, D-01) e índice único `(fluxo_versao_id, fonte,
fonte_registro_id)` em `execucao_fluxo` (idempotência, D-06) — o segundo já é `@@unique` do
Prisma; o primeiro precisa de SQL bruto na migração (Prisma não modela índice parcial, mesmo
padrão 007/008/009/010/012). `fluxo_modelo` é semeado por `prisma/seed.ts` (idempotente, mesmo
padrão do perfil `administrador` da 004) — não nasce de nenhum endpoint de escrita.

**Testing**:
- Backend unit (`jest`, sem banco), `backend/src/crm/domain/workflow/`:
  - `avaliar-condicao.spec.ts` — `avaliarCondicao(no, contexto)`: folha com cada operador
    (`igual`/`diferente`/`contem`/`nao_contem`/`definido`/`nao_definido`/`maior_que`/
    `menor_que`); grupo `E` (todas verdadeiras → true; uma falsa → false); grupo `OU` (uma
    verdadeira → true; todas falsas → false); grupos aninhados; grupo vazio (`{tipo:'grupo',
    itens:[]}`) → `true` vacuamente (fluxo sem condição sempre dispara); campo ausente no
    contexto → operador `definido`/`nao_definido` decide, outros tratam como não-satisfeito
    sem lançar.
  - `catalogo-gatilho.spec.ts` — `camposDoGatilho(tipo)`/`acoesCompativeis(tipo)`: cada
    `FluxoGatilhoTipo` tem um catálogo fechado de campos avaliáveis e de tipos de ação
    permitidos (D-08); `EVENTO_EXTERNO` não valida ações (nunca executa mesmo).
  - `validar-fluxo.spec.ts` — `validarParaPublicar(versao)`: gatilho ausente → erro; ação
    incompatível com o gatilho → erro; `MOVER_OPORTUNIDADE_ETAPA` sem `motivo` quando a etapa
    destino é `PERDIDA` → erro (FR-015, validação declarativa — a etapa em si é resolvida na
    execução real, então este teste valida a forma do bloco, não a etapa de fato); fluxo
    válido → `{ok:true}`.
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` força
  `CRM_WORKFLOW_WORKER_ENABLED=false`, mesmo padrão de `INGESTAO_WORKER_ENABLED`),
  `test/crm-workflow.e2e-spec.ts`:
  - migração cria as 5 tabelas + 4 enums; índice único parcial recusa uma 2ª versão
    `PUBLICADA` do mesmo fluxo inserida via SQL bruto.
  - **Ciclo de vida**: `POST /crm/workflow/fluxos` cria fluxo + rascunho v1 vazio; `PUT
    .../rascunho` substitui gatilho/condições/ações do rascunho atual; `POST .../publicar`
    promove a `PUBLICADA` e arquiva a anterior (se houver); publicar sem gatilho ou com ação
    incompatível → 422; editar depois de publicado cria um rascunho v2 **sem** alterar a v1
    publicada (US3); `POST .../arquivar` derruba a publicada sem promover rascunho.
  - **Simulação**: `POST .../simular` com um lead/oportunidade real → mostra
    condição/ações que disparariam **sem** alterar o registro (confere estado antes/depois
    idêntico, US2); simular gatilho incompatível com o tipo de registro escolhido → indica
    incompatibilidade sem lançar.
  - **Execução reativa** (chamando `WorkerService.processarPassada()` direto no teste, sem
    depender do `setInterval`, mesmo padrão do `POST /ingestao/eventos/processar` da 006):
    fluxo publicado gatilho `LEAD_CRIADO` + condição `origem = site` + ação `APLICAR_TAG` →
    criar lead com essa origem dispara a tag; criar lead com origem diferente → execução
    registrada como `CONDICAO_NAO_SATISFEITA`, sem ação; reprocessar a mesma passada não
    duplica a tag nem cria uma 2ª `execucao_fluxo` para o mesmo lead (D-06); fluxo gatilho
    `OPORTUNIDADE_ETAPA_MUDOU` + ação `MOVER_OPORTUNIDADE_ETAPA` para uma etapa `PERDIDA` sem
    motivo configurado nunca chega a publicar (bloqueado no `PUT`/`POST publicar`); ação que
    falha (ex.: etapa destino removida) registra `execucao_fluxo.resultado = FALHOU` com
    `erroDetalhe`, sem derrubar o processamento de outros fluxos/registros.
  - **Biblioteca de modelos**: seed cria ao menos 2 `fluxo_modelo`; `GET
    /crm/workflow/modelos` lista; `POST .../usar-como-base` clona para um fluxo novo em
    rascunho editável, sem alterar o modelo original.
  - **Guard/escopo**: `crm_admin:ver` lê fluxos/versões/execuções/modelos;
    `crm_admin:gerir_workflow` (permissão nova) exige-se para criar/editar/publicar/
    arquivar/simular/usar-como-base/rodar o worker manualmente; sem token → 401; sem
    permissão → 403.
  - **Regressão**: suíte 003–013 + `/health` (11 contextos) verdes.
- Frontend (`vitest` + Testing Library, jsdom): página de fluxos (lista + editor de
  gatilho/condições/ações + publicar/arquivar + simulação), biblioteca de modelos, histórico
  de execuções — `fireEvent`, mesmo padrão de `pipelines/PipelinesPage.test.tsx`.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174`; Postgres dev em
`:55432`. Dev Linux; CI Linux (GitHub Actions). Worker desligado em teste (determinístico via
`POST /crm/workflow/processar`, mesmo padrão da 006).

**Performance Goals**: SC-002 (execução em poucos minutos) atendido pelo intervalo padrão do
scheduler (`CRM_WORKFLOW_WORKER_INTERVALO_MS`, default 15s) sobre um lote pequeno por
passada — mesma ordem de grandeza de volume já assumida pelas specs 007/012 (dezenas de
eventos, não milhares por minuto).

**Constraints**:
- **Nenhuma porta nova no `core`**: todas as entidades que uma ação toca (`lead`,
  `oportunidade`, `interacao`, `tag`) já vivem dentro do próprio bounded context `crm` —
  diferente das specs 008/013, esta spec não cruza a fronteira `crm`→`clientes`.
- **Contextos delimitados** (Princípio VI): o gatilho `EVENTO_EXTERNO` só é **modelado**
  (enum + validação "aguardando integração futura"), nunca executado — nenhuma leitura nova
  do Financeiro/Catálogo, que nem existem ainda. Nenhuma escrita em Contrato (regra 8.2.3) —
  a única ação que se aproxima de "efeito de negócio" é `MOVER_OPORTUNIDADE_ETAPA`, que já é
  só estado do processo comercial (mesma ressalva já registrada pela spec 010).
- **Log de eventos + projeções** (Princípio IV): gatilhos internos nunca fazem *polling*
  direto de "o que mudou" comparando estados — leem trilhas **já append-only** (auditoria de
  lead, movimentação de oportunidade, interação, associação de tag), cada uma com seu próprio
  cursor em `fluxo_cursor_fonte`, avançado só depois de processar o lote (nunca perde nem
  reprocessa por acidente um evento entre passadas).
- **Agregados derivados** (Princípio V): nenhum contador incremental — `execucao_fluxo` é o
  próprio log; qualquer métrica futura (specs 016/017) é uma query sobre ele, não um campo
  mantido à mão.
- **Idempotência (Princípio "Padrões Transversais")**: `(fluxo_versao_id, fonte,
  fonte_registro_id)` único garante que reprocessar uma passada (reinício do processo,
  `POST /processar` manual coincidindo com o `setInterval`) nunca duplica o efeito de uma
  ação já aplicada — mesmo mutex de passada única do `WorkerScheduler` da 006 evita a
  concorrência dentro do próprio processo; sem suposição de múltiplas réplicas do backend
  rodando o worker ao mesmo tempo (mesmo racional de escala das specs 007/012).
- **Superfície de escrita mínima** (Princípio VIII): ~16 endpoints cobrem só o ciclo de vida
  do fluxo (criar/editar rascunho/publicar/arquivar/simular), consulta (fluxos/versões/
  execuções/modelos) e o disparo manual do worker — nenhuma ação nova sobre lead/oportunidade/
  tag/interação além do que as specs 008/009/010 já expõem (o Workflow só **chama** os
  serviços existentes internamente). Nenhuma sincronização automática com API externa.
- **RBAC 004**: `crm_admin:ver` (leitura, já existe) + `crm_admin:gerir_workflow`
  (**+1** permissão nova, escrita) — mesmo padrão de um único recurso administrativo "gerir_*"
  por spec já usado em 007/008/010/011/012/013; sem escopo `ver_proprios`, já que um fluxo não
  tem "dono" individual (é configuração compartilhada, como `equipe`/`pipeline`).
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~30 arquivos novos no backend (`src/crm/{domain,application,infra,dto}/
workflow/**`, `workflow.controller.ts`, `prisma/migrations/<ts>_crm_workflow/`, `prisma/
seed.ts` editado, `test/crm-workflow.e2e-spec.ts`), ~4 arquivos editados (`schema.prisma`,
`src/auth/rbac/catalogo.ts`, `crm.module.ts`, `src/config/env.schema.ts`), ~7 no frontend
(`src/workflow/**`, `nav-items.ts`, `router.tsx`), **0 dep nova**, **1 migração**, **~16
endpoints**, **0 endpoint público novo**, **0 chave `.env` de segredo nova** (só 3 variáveis
de configuração do worker, sem segredo — mesmo padrão de `INGESTAO_WORKER_*`), 1 doc novo, 4
docs atualizados (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `docs/014-crm-workflow.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 5 tabelas nascem com **ID surrogate UUID v7** gerado na
      app. Nenhum identificador de origem externa envolvido nesta spec.
- [x] **II. Clarificar antes de assumir**: as 2 decisões que bloqueavam esta spec (gatilho por
      evento externo sem Financeiro/Catálogo; formato da biblioteca de automações prontas)
      foram resolvidas com o dono do produto **antes** da escrita do `spec.md` (2026-09-09) —
      CL-01/CL-02. **Zero `NEEDS CLARIFICATION`** remanescente.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não é um adaptador de ingestão
      financeira; nenhuma regra de gatilho/condição/ação conhece "Guru"/"Asaas"/etc.
- [x] **IV. Log de eventos + projeções**: gatilhos internos são uma **projeção** sobre
      trilhas append-only já existentes (nunca comparação de estado a estado); cada `fonte`
      tem seu cursor próprio, avançado só após processar o lote; `execucao_fluxo` é o
      resultado explícito e idempotente de cada tentativa — sem `commit()` de remendo.
- [x] **V. Agregados derivados**: nenhum contador incremental introduzido.
- [x] **VI. Contextos delimitados — observar, não escrever**: todas as ações do MVP escrevem
      só dentro de `crm` (lead, oportunidade, tag, interação), reusando os serviços já
      existentes das specs 008/009/010 — nenhum caminho de escrita novo. `EVENTO_EXTERNO`
      fica só modelado, sem ler nem escrever em nenhum outro bounded context.
- [x] **VII. Curadoria vs derivação**: uma versão `PUBLICADA` de fluxo é imutável (curadoria
      congelada no momento da publicação); `execucao_fluxo` é derivado/append-only, nunca
      editado; nenhum vínculo aplicado por uma ação é auto-revertido (regra já garantida
      pelos próprios serviços reaproveitados — ex.: `TagService.desassociar` exige uma
      chamada explícita, o Workflow nunca reverte uma tag sozinho).
- [x] **VIII. Superfície de escrita mínima**: ~16 endpoints cobrem só o ciclo de vida do
      fluxo e o disparo manual do worker — nenhuma sincronização automática com API externa
      (o gatilho `EVENTO_EXTERNO` nem executa nesta versão).
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 5 tabelas.
      - **Dinheiro**: N/A (nenhuma ação desta spec cria/edita valor monetário).
      - **Tempo**: `@db.Timestamptz(6)` em todos os timestamps novos.
      - **Status**: `FluxoVersaoStatus`/`FluxoExecucaoResultado` são eixos próprios do
        Workflow, sem sobrepor `StatusTransacaoCanonico`/`StatusContratoCanonico`.
      - **Idempotência**: `(fluxo_versao_id, fonte, fonte_registro_id)` único — reprocessar
        nunca duplica efeito (FR-010, D-06); ações reaproveitadas (`TagService`,
        `RegistrarInteracaoService`) já são idempotentes por construção.
      - **Auditoria**: cada ação executada usa a **mesma** trilha de auditoria de uma ação
        manual equivalente (D-05) — nenhuma tabela de auditoria nova; `execucao_fluxo` em si
        já é o log append-only do próprio Workflow.
      - **Erros**: validação zod → 422; publicar um rascunho inválido → 422; sem permissão →
        403; sem token → 401; fluxo/versão/execução/modelo inexistente → 404.
      - **Config/segredos**: 3 variáveis novas (`CRM_WORKFLOW_WORKER_*`), sem segredo, mesmo
        padrão de `INGESTAO_WORKER_*` — nenhuma chave `.env` de credencial nova.
      - **Multi-conta**: N/A.
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking**: nenhuma peça
"não-óbvia" fora do padrão já estabelecido — o worker é uma cópia estrutural do padrão da
006, adaptado a um domínio mais simples (sem pipeline de 6 etapas por evento).

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma que os 4 enums e o índice único
parcial cobrem exatamente as regras de negócio descritas; `contracts/workflow.md` confirma
que nenhuma rota de escrita ultrapassa o catálogo fechado de gatilhos/condições/ações; nenhum
import de outro bounded context em `src/crm/domain/workflow/**`; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/014-crm-workflow/
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   └── workflow.md
└── tasks.md                # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── crm/
│   │   ├── domain/
│   │   │   └── workflow/
│   │   │       ├── tipos.ts                 # FluxoGatilhoTipo/condição/ação (tipos + zod)
│   │   │       ├── avaliar-condicao.ts       # avaliarCondicao(no, contexto) pura
│   │   │       ├── catalogo-gatilho.ts       # camposDoGatilho/acoesCompativeis puras
│   │   │       └── validar-fluxo.ts          # validarParaPublicar(versao) pura
│   │   ├── application/
│   │   │   └── workflow/
│   │   │       ├── fluxo.service.ts          # CRUD fluxo + rascunho + publicar/arquivar
│   │   │       ├── simulacao.service.ts      # simular(...) sem efeito colateral
│   │   │       ├── modelo.service.ts         # listar + usar-como-base
│   │   │       ├── worker.service.ts         # processarPassada() por fonte
│   │   │       ├── worker.scheduler.ts        # setInterval in-house (mesmo padrão 006)
│   │   │       └── executar-acao.service.ts  # dispatch por tipo de ação, chama serviços 008/009/010
│   │   ├── infra/
│   │   │   └── workflow/
│   │   │       ├── fluxo.repository.ts
│   │   │       ├── execucao.repository.ts
│   │   │       ├── modelo.repository.ts
│   │   │       └── cursor.repository.ts
│   │   ├── dto/
│   │   │   └── workflow/  (zod schemas)
│   │   ├── workflow.controller.ts            # /crm/workflow/**
│   │   └── crm.module.ts                     # editado — registra os novos providers/controllers
│   ├── auth/rbac/catalogo.ts                 # editado — +1 permissão
│   └── config/env.schema.ts                  # editado — +3 variáveis CRM_WORKFLOW_WORKER_*
├── prisma/
│   ├── schema.prisma                         # editado — 5 models + 4 enums
│   ├── seed.ts                                # editado — semeia fluxo_modelo
│   └── migrations/<ts>_crm_workflow/migration.sql
└── test/
    ├── crm-workflow.e2e-spec.ts
    └── setup-db.ts                            # editado — CRM_WORKFLOW_WORKER_ENABLED=false

frontend/
├── src/
│   ├── workflow/
│   │   ├── FluxosPage.tsx           # lista de fluxos + status (rascunho/publicado)
│   │   ├── FluxoDetalhePage.tsx     # editor de gatilho/condições/ações + publicar/arquivar
│   │   ├── SimulacaoPanel.tsx       # escolher registro + rodar simulação
│   │   ├── ModelosPage.tsx          # biblioteca de modelos + usar como base
│   │   ├── ExecucoesTab.tsx         # histórico de execuções do fluxo
│   │   └── *.test.tsx
│   ├── nav-items.ts                 # editado — item Workflow em CRM
│   └── router.tsx                   # editado — rotas /crm/workflow/**
```

**Structure Decision**: Web application (Option 2) — já em uso desde a 001. Workflow fica
inteiramente dentro do bounded context `crm` já existente (`backend/src/crm/`), nova pasta de
domínio/aplicação/infra `workflow/` ao lado de `atendimento`/`pipeline`/`lead`/`interacao`/
`faq`, mesmo padrão de organização por spec já usado desde a 008.

## Complexity Tracking

Nenhuma violação da constituição. Nenhuma entrada.
