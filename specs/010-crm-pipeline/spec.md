# Feature Specification: Pipeline de Vendas do CRM — pipelines, oportunidades, atribuição e SLA

**Feature Branch**: `010-crm-pipeline`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "010 — crm-pipeline: pipelines de vendas configuráveis (etapas),
oportunidades com valor_estimado (Dinheiro), responsável, motivo de ganho/perda; presença em
múltiplos pipelines; atribuição automática (round robin ou por regra); SLA por etapa com
alerta de estouro; histórico/auditoria de mudança de etapa; alerta de lead esfriando; campos
personalizados de oportunidade; export de métricas. Oportunidade observa status de pagamento
do Financeiro via evento_origem/projeção (nunca escreve, nunca cria/antecipa Contrato — regra
8.2.3 da visão). Frontend: board Kanban. Bounded context `crm` (já não-vazio desde a
007/008/009; `CONTEXT_MODULES` segue 11). Portas: reusar 3001/5174/55432 — nenhuma nova."

## Clarifications

### Decisões desta spec (sem pergunta ao dono do produto — defaults documentados)

- **D-01 — Âncora de `oportunidade`**: mesma disciplina polimórfica da `interacao` (spec
  009) — `pessoa_id?` **XOR** `lead_id?`, exatamente um. Uma oportunidade nasce contra um
  `lead` (prospecção) ou diretamente contra uma `pessoa` já cliente (upsell de um produto de
  alto ticket). Quando o lead de uma oportunidade converte em pessoa (spec 008), a
  oportunidade **não** é re-apontada — mesmo precedente da CL-01 da 009; listagens "por
  pessoa" fazem a mesma união (oportunidades diretas ∪ oportunidades dos leads convertidos
  nela).
- **D-02 — Integração com Financeiro (regra 8.2.3 da visão)**: o Financeiro (specs
  018–030) ainda não existe no projeto — não há `evento_origem` de pagamento para observar
  de verdade ainda. Esta spec entrega a **porta** in-process `PortaObservacaoPagamentoCrm`
  (interface exportada do `CrmModule`, mesmo padrão de porta da 006/008/009) que uma spec
  futura (014 — Workflow, ou diretamente o financeiro na integração) vai **chamar** quando
  uma transação paga resolver um Contrato ligado à mesma pessoa; a implementação desta spec
  só precisa fornecer o **efeito** (mover a oportunidade correspondente para a etapa `GANHA`
  do pipeline, idempotente, auditado) — nunca o **gatilho** (não há listener de evento real
  aqui, e não há criação/antecipação de Contrato em nenhum sentido). Documentado para não
  bloquear o avanço (Princípio II) sem inventar uma integração que não tem o que consumir
  ainda.
- **D-03 — Escopo de "regra" na atribuição automática**: além de `MANUAL` e `RODIZIO`
  (round robin dentro dos membros ativos de uma `equipe` da spec 007), a atribuição "por
  regra" desta spec é uma lista **ordenada** de condições simples (campo padrão da
  oportunidade/lead — `origem`, `produtoInteresse` [se preenchido em campo personalizado],
  `valorEstimado` acima/abaixo de um limiar — → responsável fixo); a 1ª regra que casa
  decide; sem match, cai no modo `RODIZIO` configurado como *fallback* (ou fica sem
  responsável, se não houver *fallback*). Motor de regra completo com condições compostas
  fica para o Workflow (spec 014) — aqui é avaliação simples, sem E/OU.
- **D-04 — "Export de métricas"**: um endpoint de métricas agregadas (funil por etapa,
  valor total por etapa/moeda, tempo médio por etapa, taxa de conversão) em JSON, **derivado
  a cada leitura** (regra 8.2.2 — nunca contador persistido). Exportação em arquivo (CSV/
  planilha) fica para o Dashboard do CRM (spec 017), que consome o mesmo endpoint.
- **D-05 — "Alerta" de SLA estourado e de lead esfriando**: sem canal de notificação push
  ainda (WhatsApp é a 011, Slack é a 033) — o "alerta" nesta spec é um **campo derivado**
  (`slaEstourado: boolean`, `esfriando: boolean`) calculado na leitura + um endpoint de
  listagem filtrável por esses campos, para o painel (e futuramente o Workflow) consultar.
  Nenhum contador incremental, nenhum job de envio.
- **D-06 — "Lead esfriando"**: calculado a partir da última `interacao` (spec 009) ligada à
  âncora da oportunidade (ou `oportunidade.criado_em`, se não há nenhuma) comparada a um
  limiar configurável por pipeline (`dias_esfriando`, padrão 7 dias, `null` desativa).
  Reaproveita a tabela `interacao` já existente no mesmo bounded context — sem duplicar
  registro de contato.

## Visão geral

Quarta fatia da **Fase 1 (CRM)** — o "pipeline de vendas de alto ticket" da visão (Parte
8.7). Mora no _bounded context_ **`crm`** (já não-vazio desde a 007/008/009;
`CONTEXT_MODULES` segue **11**).

O que entra:

- **`pipeline`** — funis de venda independentes e configuráveis (nome, `equipe_id?` para
  atribuição, `modo_atribuicao` MANUAL\|RODIZIO\|REGRA, `dias_esfriando?`). Sem `DELETE`
  físico enquanto tiver oportunidade — só `ativo=false` (mesmo padrão de `equipe`/
  `integracao` da 007).
- **`etapa_pipeline`** — etapas ordenadas configuráveis por pipeline, com `tipo`
  (`ABERTA`\|`GANHA`\|`PERDIDA` — pipeline precisa de ≥1 `ABERTA` e ≥1 terminal de cada tipo
  fechado para poder registrar ganho/perda) e `sla_horas?` (`null` = sem SLA na etapa).
- **`oportunidade`** — ocorrência de venda em potencial (D-01: âncora `pessoa`\|`lead`),
  `titulo`, `valor_estimado: Dinheiro`, `responsavel_id?`, etapa atual, `data_prevista_
  fechamento?`; presença simultânea em múltiplos pipelines é natural (várias oportunidades
  independentes, cada uma em seu pipeline, para a mesma pessoa/lead — sem tabela de junção
  nova). Sem `DELETE` físico — "perdida" é o estado terminal, nunca exclusão.
- **`oportunidade_movimentacao`** — histórico de 1ª classe (não é só o log de auditoria
  genérico) de toda mudança de etapa: de onde, para onde, quem moveu (ou automação), quando,
  motivo (obrigatório ao mover para etapa `PERDIDA`). É a fonte para SLA, "esfriando" e
  métricas — nada é contado incrementalmente (regra 8.2.2).
- **Atribuição automática** (D-03) — `MANUAL` (sem automação), `RODIZIO` (round robin
  determinístico entre membros ativos da `equipe` do pipeline), `REGRA` (lista ordenada de
  condições simples, com *fallback* opcional para `RODIZIO`).
- **SLA por etapa + alerta de estouro** e **alerta de lead esfriando** (D-05/D-06) —
  campos derivados na leitura, sem job de notificação nesta spec.
- **Campos personalizados de oportunidade** — mesmo padrão de esquema administrável da 008
  (`campo_personalizado_oportunidade` + `valor_campo_oportunidade`).
- **Métricas derivadas** (D-04) — `GET` agregado por pipeline: funil por etapa, valor por
  etapa/moeda, tempo médio por etapa, taxa de conversão.
- **Porta `PortaObservacaoPagamentoCrm`** (D-02) — exportada do `CrmModule`, sem gatilho
  real nesta spec (Financeiro ainda não existe); só o efeito (mover oportunidade para
  `GANHA`, idempotente, auditado). Nunca cria/antecipa Contrato — regra 8.2.3 da visão.
- **RBAC** — recurso novo `oportunidade` (`oportunidade:{criar,editar,mover,ver_todas,
  ver_proprias}`, mesmo padrão ver_todos/ver_proprios da 008) + **+1** no recurso `crm_admin`
  da 007: `crm_admin:gerir_pipelines` (cobre pipeline, etapa, atribuição, campos
  personalizados de oportunidade — mesmo padrão "esquema administrável" da 008).
- **Auditoria** — `crm_pipeline_audit` (forma canônica do core, append-only) para escrita
  administrativa (pipeline/etapa/atribuição/campos personalizados) e para edição de campos
  não-etapa da oportunidade; mudança de etapa audita via `oportunidade_movimentacao`
  (domínio de 1ª classe, não duplicado no audit genérico).
- **Frontend** — **CRM · Pipelines**: board Kanban por pipeline (colunas = etapas,
  drag-and-drop move a oportunidade, motivo obrigatório ao soltar numa etapa `PERDIDA`),
  filtros (responsável, SLA estourado, esfriando), tela de métricas, administração de
  pipelines/etapas/atribuição/campos personalizados atrás de `crm_admin:gerir_pipelines`.

O sucesso é medido por: nenhuma oportunidade "ganha"/"perdida" sem motivo quando exigido;
o histórico de movimentação nunca perde uma transição (mesmo revertida); SLA/esfriando são
sempre recalculados na leitura, nunca "presos"; a atribuição automática nunca deixa uma
oportunidade sem candidato quando a `equipe` tem membro ativo; e nenhuma porta de rede nova
é aberta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar pipeline com etapas e registrar uma oportunidade (Priority: P1)

Um gestor com `crm_admin:gerir_pipelines` cria o pipeline "Mentoria Avançada" com etapas
`Novo contato` (ABERTA), `Diagnóstico` (ABERTA, SLA 48h), `Proposta enviada` (ABERTA, SLA
72h), `Ganho` (GANHA) e `Perdido` (PERDIDA). Um vendedor com `oportunidade:criar` cria uma
oportunidade nesse pipeline a partir de um lead qualificado, com `valor_estimado`.

**Why this priority**: sem pipeline/etapa/oportunidade não há o que mover, medir ou
atribuir — é o núcleo de que todo o resto depende.

**Independent Test**: `POST /crm/pipelines` + `POST /crm/pipelines/{id}/etapas` (5 etapas,
`ordem` 0–4); `POST /crm/oportunidades` com `{ leadId, pipelineId, titulo, valorEstimado:
{ valorInt, moeda } }` → nasce na 1ª etapa `ABERTA` (menor `ordem`); `GET
/crm/oportunidades/{id}` mostra a etapa atual e `entrouEtapaEm`.

**Acceptance Scenarios**:

1. **Given** `crm_admin:gerir_pipelines`, **When** `POST /crm/pipelines` com `{ nome:
   "Mentoria Avançada" }`, **Then** o pipeline é criado `ativo=true`, sem etapa nenhuma
   ainda.
2. **Given** o pipeline criado, **When** `POST /crm/pipelines/{id}/etapas` 5x com `tipo`
   variando (`ABERTA`×3, `GANHA`×1, `PERDIDA`×1) e `ordem` 0–4, **Then** as 5 etapas
   existem, ordenadas.
3. **Given** um pipeline **sem** nenhuma etapa `ABERTA` (só `GANHA`/`PERDIDA`), **When**
   `POST /crm/oportunidades` referenciando esse pipeline, **Then** 422 (pipeline não está
   pronto para receber oportunidade).
4. **Given** `oportunidade:criar` e um `leadId` existente, **When** `POST
   /crm/oportunidades` com `{ leadId, pipelineId, titulo, valorEstimado: { valorInt:
   500000000, moeda: "BRL" } }`, **Then** a oportunidade nasce na etapa de menor `ordem`
   entre as `ABERTA`, com `entrouEtapaEm` = agora, e **1** linha em
   `oportunidade_movimentacao` (`etapaAnterior: null`).
5. **Given** `pessoaId` e `leadId` **ambos** ou **nenhum** no corpo, **Then** 422 (mesma
   regra XOR da interação, D-01).
6. **Given** `pipelineId` inexistente ou inativo, **Then** 404/422.

---

### User Story 2 - Mover oportunidade entre etapas, com motivo em etapa terminal (Priority: P1)

O vendedor move a oportunidade de `Diagnóstico` para `Proposta enviada`. Mais tarde, marca
como `Perdido` — o sistema exige um motivo. Tentar mover uma oportunidade que já está numa
etapa terminal (`GANHA`/`PERDIDA`) de volta para uma etapa `ABERTA` é permitido (reabertura
explícita), mas continua exigindo motivo ao sair de `PERDIDA`? Não — só a **entrada** numa
etapa `PERDIDA` exige motivo; qualquer outra transição não exige.

**Why this priority**: P1 junto da US1 — é a ação central do dia a dia comercial e o que
alimenta SLA, histórico e métricas.

**Independent Test**: `POST /crm/oportunidades/{id}/mover` para `Proposta enviada` (etapa
`ABERTA`) sem motivo → sucede; para `Perdido` (`PERDIDA`) sem motivo → 422; com motivo →
sucede, **1** nova linha em `oportunidade_movimentacao`, `entrouEtapaEm` atualizado.

**Acceptance Scenarios**:

1. **Given** `oportunidade:mover` e uma oportunidade em `Diagnóstico`, **When** `POST
   /crm/oportunidades/{id}/mover` com `{ etapaId: <Proposta enviada> }`, **Then** a etapa
   muda, `entrouEtapaEm` é atualizado para agora, e há **1** nova
   `oportunidade_movimentacao` (`etapaAnterior: Diagnóstico`, `etapaNova: Proposta
   enviada`, `motivo: null`).
2. **Given** a mesma oportunidade, **When** `POST .../mover` com `{ etapaId: <Perdido> }`
   **sem** `motivo`, **Then** 422.
3. **Given** o mesmo caso, **When** `POST .../mover` com `{ etapaId: <Perdido>, motivo:
   "Optou por concorrente" }`, **Then** sucede; a oportunidade fica com etapa `Perdido`.
4. **Given** uma oportunidade já `Perdido`, **When** `POST .../mover` para uma etapa
   `ABERTA` do **mesmo** pipeline, **Then** sucede (reabertura), sem exigir motivo.
5. **Given** `etapaId` de um pipeline **diferente** do da oportunidade, **When** `POST
   .../mover`, **Then** 422 (etapa precisa pertencer ao mesmo pipeline da oportunidade).
6. **Given** um sujeito sem `oportunidade:mover`, **When** tenta mover, **Then** 403.
7. **Given** `GET /crm/oportunidades/{id}/movimentacoes`, **Then** retorna o histórico
   completo, ordenado, nunca perdendo uma transição mesmo após reabertura.

---

### User Story 3 - Escopo de visão por responsável (Priority: P1)

Um vendedor com `oportunidade:ver_proprias` (sem `ver_todas`) só vê as oportunidades onde é
`responsavel_id`; um gestor com `oportunidade:ver_todas` vê todas as do pipeline.

**Why this priority**: P1 — mesma disciplina de escopo já aplicada a `lead` (008) e
`interacao` (009); sem isso o board Kanban vaza oportunidade de outro vendedor.

**Independent Test**: repetir o padrão de teste de escopo da 008 — `GET /crm/oportunidades`
com `ver_proprias` filtra por `responsavel_id = sujeito` no `where` (nunca na serialização);
`GET /crm/oportunidades/{id}` de uma oportunidade fora do escopo → 404.

**Acceptance Scenarios**:

1. **Given** `oportunidade:ver_proprias` e 3 oportunidades no pipeline (1 do sujeito, 2 de
   outros), **When** `GET /crm/oportunidades?pipelineId=...`, **Then** só 1 aparece.
2. **Given** o mesmo sujeito, **When** `GET /crm/oportunidades/{id}` de uma das outras 2,
   **Then** 404.
3. **Given** `oportunidade:ver_todas`, **When** a mesma listagem, **Then** as 3 aparecem.
4. **Given** credencial de serviço, **When** qualquer listagem, **Then** equivale a
   `ver_todas` (mesmo *special-case* da 004/008).

---

### User Story 4 - Atribuição automática (round robin e por regra) (Priority: P2)

Um pipeline configurado com `modo_atribuicao: RODIZIO` e `equipe_id` apontando para uma
equipe de 3 vendedores ativos distribui 3 oportunidades novas, uma para cada vendedor, na
ordem de entrada na equipe; a 4ª volta para o 1º. Um pipeline com `modo_atribuicao: REGRA`
aplica a 1ª condição que casa (ex.: `origem = "instagram"` → vendedor X); sem match, cai no
*fallback* configurado.

**Why this priority**: P2 — automatiza a distribuição de trabalho, mas o pipeline funciona
com atribuição manual (US1) sem isso.

**Independent Test**: criar equipe de 3 membros ativos (spec 007); pipeline
`modo_atribuicao: RODIZIO, equipeId`; criar 4 oportunidades sem `responsavelId` explícito →
1ª, 2ª, 3ª vão para os 3 membros em ordem, a 4ª repete o 1º. Trocar para `REGRA` com 1
condição + *fallback* `RODIZIO`; criar oportunidade que casa a condição → vai para o
responsável da regra; criar uma que não casa → cai no rodízio.

**Acceptance Scenarios**:

1. **Given** `modo_atribuicao: RODIZIO` e 3 membros ativos, **When** 4 `POST
   /crm/oportunidades` seguidos sem `responsavelId`, **Then** a distribuição segue a ordem
   round robin determinística (mesmo membro entrando/saindo da equipe não quebra a
   sequência dos que ficaram).
2. **Given** um membro que saiu da equipe (`saiu_em` preenchido, spec 007), **When** o
   rodízio roda, **Then** ele é pulado.
3. **Given** `modo_atribuicao: RODIZIO` mas **nenhum** membro ativo na equipe, **When**
   `POST /crm/oportunidades` sem `responsavelId`, **Then** a oportunidade nasce sem
   responsável (nunca erro — degrada para `MANUAL`).
4. **Given** `modo_atribuicao: REGRA` com 1 regra `{ campo: "origem", valor: "instagram",
   responsavelId }` + *fallback* `RODIZIO`, **When** uma oportunidade casa a regra, **Then**
   vai para o `responsavelId` da regra; **When** não casa, **Then** cai no rodízio.
5. **Given** `responsavelId` explícito no `POST`, **Then** a atribuição automática **não**
   roda — o valor explícito sempre vence.
6. **Given** um sujeito sem `crm_admin:gerir_pipelines`, **When** tenta `PUT
   /crm/pipelines/{id}/atribuicao`, **Then** 403.

---

### User Story 5 - SLA por etapa e alerta de lead esfriando (Priority: P2)

Um gestor abre o board e vê em destaque as oportunidades cuja etapa atual estourou o SLA
configurado, e as que estão "esfriando" (sem interação registrada há mais dias que o
limiar do pipeline).

**Why this priority**: P2 — sinalização operacional que depende de US1/US2 (etapa + tempo)
e da timeline da spec 009.

**Independent Test**: etapa com `slaHoras: 48`; mover oportunidade para ela; avançar o
relógio (ou usar `entrouEtapaEm` no passado via fixture) além de 48h; `GET
/crm/oportunidades?slaEstourado=true` inclui essa oportunidade; registrar uma `interacao`
nela reseta o cálculo de "esfriando" mas **não** o de SLA (são independentes).

**Acceptance Scenarios**:

1. **Given** uma oportunidade cuja etapa atual tem `slaHoras: 48` e `entrouEtapaEm` há mais
   de 48h, **When** `GET /crm/oportunidades/{id}`, **Then** `slaEstourado: true`.
2. **Given** a etapa sem `slaHoras` (`null`), **When** o mesmo `GET`, **Then**
   `slaEstourado: false` sempre (sem SLA aplicável).
3. **Given** `pipeline.diasEsfriando: 7` e a última `interacao` da âncora há 10 dias,
   **When** `GET /crm/oportunidades/{id}`, **Then** `esfriando: true`.
4. **Given** uma interação nova registrada hoje na âncora, **When** o mesmo `GET`, **Then**
   `esfriando: false` (recalculado, nada "preso").
5. **Given** `pipeline.diasEsfriando: null`, **When** o mesmo `GET`, **Then** `esfriando`
   sempre `false`.
6. **Given** `GET /crm/oportunidades?slaEstourado=true&esfriando=true`, **Then** ambos os
   filtros combinam (E lógico) respeitando o escopo de visão (US3).

---

### User Story 6 - Campos personalizados e métricas do pipeline (Priority: P3)

Um gestor administra campos personalizados de oportunidade (ex.: "Produto de interesse" —
seleção). Depois abre a tela de métricas do pipeline e vê o funil por etapa, valor total
por etapa/moeda e taxa de conversão.

**Why this priority**: P3 — valor incremental de curadoria/relatório; o pipeline já
funciona (US1–US5) sem isso.

**Independent Test**: `POST /crm/admin/campos-oportunidade` cria a definição;
`PUT /crm/oportunidades/{id}/campos-personalizados` grava o valor (validado por tipo);
`GET /crm/pipelines/{id}/metricas` retorna contagem/valor por etapa e taxa
ganhas/(ganhas+perdidas), recalculado a cada chamada.

**Acceptance Scenarios**:

1. **Given** `crm_admin:gerir_pipelines`, **When** `POST /crm/admin/campos-oportunidade`
   com `{ chave: "produto_interesse", tipo: "SELECAO", opcoes: [...] }`, **Then** a
   definição é criada.
2. **Given** a definição, **When** `PUT /crm/oportunidades/{id}/campos-personalizados` com
   um valor fora de `opcoes`, **Then** 422.
3. **Given** valor válido, **When** o mesmo `PUT`, **Then** grava; **1**
   `crm_pipeline_audit`.
4. **Given** um pipeline com oportunidades em vários estágios (algumas `GANHA`, algumas
   `PERDIDA`, algumas `ABERTA`), **When** `GET /crm/pipelines/{id}/metricas`, **Then** a
   resposta traz contagem e `valorEstimado` somado **por moeda** (nunca somando moedas
   diferentes) por etapa, e `taxaConversao = ganhas / (ganhas + perdidas)`.
5. **Given** nenhuma oportunidade fechada ainda, **When** o mesmo `GET`, **Then**
   `taxaConversao: null` (não `0` — sem denominador, sem dividir por zero).

---

### User Story 7 - Board Kanban no painel (Priority: P3)

Quem tem `oportunidade:ver_todas`/`ver_proprias` abre **CRM · Pipelines**, escolhe um
pipeline, vê colunas por etapa com cards de oportunidade (valor, responsável, indicador de
SLA estourado/esfriando), e arrasta um card para outra coluna — se for para uma etapa
`PERDIDA`, um modal pede o motivo antes de confirmar.

**Why this priority**: P3 — o backend já entrega o valor; a tela torna operável pelo time
comercial no dia a dia.

**Independent Test**: logar com `oportunidade:mover` → arrastar card entre colunas move de
fato (chama `POST .../mover`); arrastar para etapa `PERDIDA` sem preencher o motivo no
modal → não move; logar só com `ver_proprias` → só os próprios cards aparecem, sem
`oportunidade:mover` → colunas somem o *drag handle* (somente leitura).

**Acceptance Scenarios**:

1. **Given** `oportunidade:mover`, **When** arrasta um card para outra etapa `ABERTA`,
   **Then** o card se move e a chamada `POST .../mover` é feita.
2. **Given** o card arrastado para uma etapa `PERDIDA`, **When** o modal de motivo é
   cancelado, **Then** o card volta para a coluna original (sem chamada de rede).
3. **Given** sujeito sem `oportunidade:mover`, **When** abre o board, **Then** vê os cards
   mas não consegue arrastar.
4. **Given** um card com `slaEstourado: true`, **When** renderizado, **Then** exibe
   indicador visual distinto de um card `esfriando: true` (podem ocorrer juntos).

---

### Edge Cases

- **Mover para a mesma etapa atual**: no-op idempotente — sem nova
  `oportunidade_movimentacao`, sem erro.
- **Pipeline com múltiplas etapas `GANHA` ou `PERDIDA`**: permitido (ex.: motivos de perda
  diferentes como etapas separadas) — `tipo` só precisa existir em ≥1 etapa de cada lado
  fechado; qualquer uma delas conta como terminal para as regras de motivo/SLA.
- **Oportunidade da mesma pessoa em 2 pipelines simultaneamente**: sem restrição — cada
  `oportunidade` é independente; `GET /crm/pessoas/{id}/oportunidades` lista todas,
  agrupáveis por pipeline no frontend.
- **`equipe_id` do pipeline apontando para equipe inativa**: `modo_atribuicao: RODIZIO`
  degrada para "sem responsável" (mesma regra do Acceptance 3 da US4) — não usa equipe
  inativa.
- **Regra de atribuição referenciando `responsavelId` que não é mais usuário válido**: 422
  na gravação da regra (`PUT /crm/pipelines/{id}/atribuicao`); não é validado de novo a
  cada oportunidade criada (validação na borda de escrita da regra).
- **`valorEstimado` com moeda diferente entre oportunidades do mesmo pipeline**: permitido
  — métricas (US6) somam **por moeda**, nunca convertem (regra de Moeda do core).
- **Chamada da porta `PortaObservacaoPagamentoCrm` para uma pessoa sem oportunidade aberta
  em nenhum pipeline**: no-op (nada para marcar como ganha) — nunca cria oportunidade nova.
- **Chamada repetida da mesma porta para a mesma pessoa/contrato**: idempotente — 2ª
  chamada não gera nova `oportunidade_movimentacao` se a oportunidade já está `GANHA`.
- **`DELETE` de etapa em uso**: 409 (tem oportunidade ancorada) — só etapa sem nenhuma
  oportunidade histórica pode ser removida fisicamente.
- **`GET /crm/pipelines/{id}/metricas` num pipeline sem nenhuma oportunidade**: todas as
  contagens zeradas, `taxaConversao: null`, nunca erro.

## Requirements *(mandatory)*

### Functional Requirements

#### `pipeline` e `etapa_pipeline`

- **FR-001**: O sistema MUST modelar **`pipeline`**: PK UUID v7; `nome`; `descricao?`;
  `equipe_id?` (FK `equipe` da 007, `onDelete: Restrict`); `modo_atribuicao`
  (`MANUAL`\|`RODIZIO`\|`REGRA`, default `MANUAL`); `dias_esfriando?` (Int, `null` desativa
  o alerta); `ativo` (default `true`); `criado_em`/`atualizado_em`.
- **FR-002**: O sistema MUST modelar **`etapa_pipeline`**: PK UUID v7; `pipeline_id` FK;
  `nome`; `ordem` (Int, único por pipeline); `tipo` (`ABERTA`\|`GANHA`\|`PERDIDA`);
  `sla_horas?` (Int, `null` = sem SLA); `criado_em`/`atualizado_em`.
- **FR-003**: `POST/GET/PATCH /crm/pipelines` MUST exigir `crm_admin:gerir_pipelines` para
  escrita e `oportunidade:ver_todas`\|`ver_proprias` para leitura; **sem `DELETE`** — só
  `ativo=false`.
- **FR-004**: `POST/GET/PATCH/DELETE /crm/pipelines/{id}/etapas` MUST exigir
  `crm_admin:gerir_pipelines`; `DELETE` físico MUST responder 409 se a etapa tem qualquer
  `oportunidade` (atual ou histórica via `oportunidade_movimentacao`) referenciando-a.
- **FR-005**: `POST /crm/oportunidades` referenciando um pipeline **sem** nenhuma etapa de
  `tipo = ABERTA` MUST responder 422.

#### `oportunidade`

- **FR-006**: O sistema MUST modelar **`oportunidade`**: PK UUID v7; `pipeline_id` FK;
  `etapa_id` FK (etapa atual); `pessoa_id?` **XOR** `lead_id?` (D-01, `CHECK` no banco +
  validação de borda, mesmo padrão FR-001 da 009); `titulo`; `valor_estimado_int`
  (`bigint`) + `valor_estimado_moeda` (mapeados para `Dinheiro` do core); `responsavel_id?`
  (FK `usuario`, `onDelete: Restrict`); `data_prevista_fechamento?`; `entrou_etapa_em`
  (timestamptz, atualizado a cada movimentação); `criado_em`/`atualizado_em`.
- **FR-007**: `POST /crm/oportunidades` (sob `oportunidade:criar`) MUST criar na etapa de
  menor `ordem` entre as `ABERTA` do pipeline informado, gravar a 1ª
  `oportunidade_movimentacao` (`etapaAnterior: null`), e resolver `responsavel_id` por
  atribuição automática (FR-013–FR-016) quando não informado explicitamente.
- **FR-008**: `GET /crm/oportunidades` (paginado, filtros: `pipelineId`, `etapaId`,
  `responsavelId`, `slaEstourado`, `esfriando`) e `GET /crm/oportunidades/{id}` MUST
  respeitar o escopo `ver_todas`\|`ver_proprias` (US3) — filtro **no `where`**, nunca na
  serialização; fora do escopo → 404.
- **FR-009**: `PATCH /crm/oportunidades/{id}` (sob `oportunidade:editar`) MUST permitir
  editar `titulo`, `valorEstimado`, `responsavelId`, `dataPrevistaFechamento` — **nunca**
  `etapaId` (mudança de etapa é só via `mover`, FR-010) nem `pipelineId`.
- **FR-010**: `POST /crm/oportunidades/{id}/mover` (sob `oportunidade:mover`) MUST: validar
  que a `etapaId` destino pertence ao mesmo `pipeline_id` da oportunidade (senão 422); ser
  no-op idempotente se destino = etapa atual; exigir `motivo` (string não vazia) quando a
  etapa destino é `tipo = PERDIDA` (senão 422); gravar 1 `oportunidade_movimentacao`;
  atualizar `etapa_id` e `entrou_etapa_em`.
- **FR-011**: O sistema MUST NOT expor `DELETE` físico de `oportunidade` — o estado
  terminal é `PERDIDA`, nunca exclusão.

#### `oportunidade_movimentacao` (histórico)

- **FR-012**: O sistema MUST modelar **`oportunidade_movimentacao`**: PK UUID v7;
  `oportunidade_id` FK; `etapa_anterior_id?` FK (`null` na criação); `etapa_nova_id` FK;
  `movido_por_id?` FK `usuario` (`null` quando a porta D-02 move automaticamente);
  `motivo?`; `criado_em`. `GET /crm/oportunidades/{id}/movimentacoes` MUST retornar o
  histórico completo ordenado por `criado_em`, respeitando o mesmo escopo de visão da
  oportunidade (FR-008).

#### Atribuição automática (D-03)

- **FR-013**: O sistema MUST modelar **`regra_atribuicao_pipeline`**: PK UUID v7;
  `pipeline_id` FK; `ordem` (Int); `campo` (enum fechado: `origem`\|`valorEstimadoMinimo`);
  `valor` (jsonb, formato depende de `campo`); `responsavel_id` FK `usuario`.
  `PUT /crm/pipelines/{id}/atribuicao` (sob `crm_admin:gerir_pipelines`) MUST substituir a
  lista completa de regras + `modoAtribuicao` + `fallback?`
  (`null`\|`RODIZIO`); `responsavelId` de usuário inexistente ou removido MUST responder
  422 na gravação.
- **FR-014**: Quando `modo_atribuicao = RODIZIO` e `responsavelId` não foi informado no
  `POST`, o sistema MUST escolher, de forma **determinística** (função pura dado o estado:
  membros ativos ordenados por `entrou_em` + último atribuído), o próximo membro **ativo**
  da `equipe` do pipeline em rotação; sem membro ativo, a oportunidade MUST nascer sem
  `responsavel_id` (nunca erro).
- **FR-015**: Quando `modo_atribuicao = REGRA`, o sistema MUST avaliar as
  `regra_atribuicao_pipeline` em ordem crescente de `ordem`; a 1ª que casa define o
  `responsavel_id`; sem nenhuma casar, MUST aplicar o `fallback` (`RODIZIO`, mesma regra do
  FR-014) ou deixar sem responsável se `fallback: null`.
- **FR-016**: `responsavelId` explícito no `POST /crm/oportunidades` MUST sempre vencer a
  atribuição automática (nenhuma regra roda).

#### SLA e "esfriando" (D-05/D-06)

- **FR-017**: Toda leitura de `oportunidade` MUST incluir `slaEstourado: boolean`,
  calculado por função pura `agoraUtc() - entrouEtapaEm > etapaAtual.slaHoras` (`false`
  sempre que `slaHoras` for `null`).
- **FR-018**: Toda leitura de `oportunidade` MUST incluir `esfriando: boolean`, calculado
  por função pura comparando `agoraUtc()` contra a `interacao` mais recente (spec 009)
  ligada à âncora da oportunidade (ou `criado_em` da oportunidade, se nenhuma) contra
  `pipeline.diasEsfriando` (`false` sempre que `diasEsfriando` for `null`).
- **FR-019**: `GET /crm/oportunidades` MUST aceitar os filtros `slaEstourado`/`esfriando`
  (booleanos), combináveis com E lógico e com os demais filtros (FR-008).

#### Campos personalizados

- **FR-020**: O sistema MUST modelar `campo_personalizado_oportunidade` (definição —
  `chave` slug único imutável, `rotulo`, `tipo TEXTO`\|`NUMERO`\|`BOOLEANO`\|`DATA`\|
  `SELECAO`, `opcoes?`, `obrigatorio`, `ativo`) e `valor_campo_oportunidade`
  (`@@unique(oportunidade_id, definicao_id)`, `valor` validado por tipo → 422), mesmo
  padrão da 008. Definição sob `crm_admin:gerir_pipelines`; `PUT
  /crm/oportunidades/{id}/campos-personalizados` (substituição total) sob
  `oportunidade:editar`.

#### Métricas (D-04)

- **FR-021**: `GET /crm/pipelines/{id}/metricas` (sob leitura de oportunidade) MUST
  retornar, **derivado a cada chamada**: contagem e soma de `valorEstimado` **por moeda**,
  agrupado por `etapaId`; tempo médio (horas) na etapa atual para oportunidades `ABERTA`;
  `taxaConversao = ganhas / (ganhas + perdidas)` (`null` se denominador `0`).
- **FR-022**: A resposta de métricas MUST respeitar o escopo de visão do sujeito
  (`ver_proprias` agrega só as oportunidades do próprio responsável).

#### Porta de observação de pagamento (D-02)

- **FR-023**: O sistema MUST exportar do `CrmModule` a interface **`PortaObservacaoPagamentoCrm`**
  com um método `observarPagamentoConfirmado({ pessoaId }): Promise<void>` — para uma
  pessoa com ≥1 oportunidade em etapa `ABERTA` (em qualquer pipeline), MUST mover a(s)
  oportunidade(s) correspondente(s) para a 1ª etapa `GANHA` do respectivo pipeline (mesmo
  fluxo de `mover`, `movido_por_id: null`), idempotente (chamada repetida não duplica
  movimentação se já `GANHA`). Sem oportunidade `ABERTA` para a pessoa → no-op. Esta spec
  **não** registra nenhum consumidor real da porta (Financeiro não existe ainda — D-02);
  **nunca** cria, edita ou lê Contrato.

#### RBAC e auditoria

- **FR-024**: O catálogo RBAC MUST ganhar o recurso `oportunidade`
  (`oportunidade:{criar,editar,mover,ver_todas,ver_proprias}`) e a permissão
  `crm_admin:gerir_pipelines` no recurso `crm_admin` existente (007); `administrador` e a
  credencial de serviço MUST receber todas de graça (sem migração de dados/seed).
- **FR-025**: Toda escrita administrativa (pipeline, etapa, atribuição, definição de campo
  personalizado, edição de campos não-etapa de oportunidade) MUST auditar em
  `crm_pipeline_audit` (forma canônica do core, append-only, só delta real). Mudança de
  etapa **não** duplica em `crm_pipeline_audit` — `oportunidade_movimentacao` já é o
  registro de 1ª classe dessa mudança.

### Key Entities

- **Pipeline**: funil de vendas independente e configurável, com modo de atribuição e
  limiar de "esfriando".
- **Etapa do pipeline**: posição ordenada dentro de um pipeline, com tipo (aberta/ganha/
  perdida) e SLA opcional.
- **Oportunidade**: ocorrência de venda em potencial dentro de um pipeline, ancorada em uma
  pessoa ou um lead, com valor estimado, responsável e etapa atual.
- **Movimentação de oportunidade**: registro imutável de cada mudança de etapa (quem, de
  onde, para onde, quando, motivo).
- **Regra de atribuição**: condição simples que define o responsável automático de uma
  oportunidade nova dentro de um pipeline em modo `REGRA`.
- **Campo personalizado de oportunidade**: definição administrável de um atributo extra da
  oportunidade, e o valor preenchido em cada oportunidade.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma oportunidade nunca entra em etapa `PERDIDA` sem motivo registrado — 100%
  das tentativas sem motivo são recusadas (422).
- **SC-002**: O histórico de movimentação de uma oportunidade reflete 100% das transições
  reais, incluindo reaberturas, sem nenhuma perda de linha.
- **SC-003**: SLA estourado e "esfriando" nunca ficam desatualizados — recalculados a cada
  leitura, sem depender de job assíncrono.
- **SC-004**: Uma oportunidade criada sem responsável explícito num pipeline `RODIZIO`
  recebe responsável em 100% dos casos em que a equipe tem ≥1 membro ativo.
- **SC-005**: As métricas de um pipeline nunca somam valores de moedas diferentes numa
  mesma cifra.
- **SC-006**: Um vendedor com visão restrita (`ver_proprias`) nunca vê, em nenhuma resposta
  (lista, detalhe, métricas, histórico), oportunidade de outro responsável.
- **SC-007**: Nenhuma porta de rede nova é aberta por esta spec (reusa 3001/5174/55432).

## Assumptions

- O Financeiro (specs 018–030) ainda não existe no projeto nesta fase — a integração de
  "observar pagamento" (regra 8.2.3 da visão) é entregue como porta in-process sem gatilho
  real (D-02); conectar o gatilho de verdade é trabalho de uma spec futura (014 ou a
  própria integração do Financeiro), não desta.
- "Atribuição por regra" nesta spec cobre condições simples de campo único, sem lógica
  composta (E/OU) — o motor completo de regra fica para o Workflow (spec 014), consistente
  com a divisão de escopo já usada na 006 (classificação com regras locais, sem inferência)
  (D-03).
- "Export de métricas" é entregue como endpoint de dados agregados (JSON); exportação em
  arquivo fica para o Dashboard (spec 017), que consumirá o mesmo endpoint (D-04).
- Não há canal de notificação push nesta spec (WhatsApp é a 011, Slack é a 033) — SLA
  estourado e "esfriando" são expostos como campos/filtros consultáveis, não como
  notificação enviada (D-05).
- A mesma pessoa/lead pode ter oportunidades simultâneas em vários pipelines sem nenhuma
  tabela de associação nova — cada oportunidade já carrega seu `pipeline_id`.
- Reusa integralmente `equipe`/`equipe_membro` da spec 007 para o pool de round robin —
  nenhuma tabela de equipe nova.
- Reusa a `interacao` da spec 009 para o cálculo de "esfriando" — nenhuma tabela de contato
  nova.
- Nenhuma porta de rede nova (backend 3001, frontend 5174, Postgres dev 55432 — já em uso
  por outras sessões neste ambiente; não iniciar servidores adicionais nessas portas
  durante o desenvolvimento desta spec).
