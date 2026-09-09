# Feature Specification: CRM · Tarefas — gestor de tarefas, checklists, agenda e gamificação

**Feature Branch**: `016-crm-tarefas`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "016 — crm-tarefas: `tarefa` / `nota` ligadas a `pessoa` /
`oportunidade`. Checklists, agenda, cronômetro por tarefa, gamificação, notificações/
lembretes, delegação/reatribuição, dependência entre tarefas, geração automática a partir
de eventos de Pipeline/Workflow. Frontend: gestor de tarefas (pessoal e geral)."

## Clarifications

### Session 2026-09-09

- Q: **CL-01 — Profundidade da gamificação no MVP desta spec?** → A: **Pontos simples +
  ranking.** Pontuação **derivada** por evento de tarefa (concluir no prazo, concluir com
  checklist 100%, etc.), tabela de pesos **congelada** (mesmo padrão de
  `PESOS_SCORE_LEAD`, spec 008); endpoint de ranking por usuário/equipe, sempre calculado
  na leitura — nunca contador persistido (Princípio V). Sem badges, sem níveis, sem
  conquistas desbloqueáveis.
- Q: **CL-02 — Canal de notificações/lembretes de tarefa?** → A: **Só in-app.** Lembrete é
  um campo **derivado** na leitura (`vencendoHoje`/`atrasada`) + um endpoint de "minhas
  notificações" que o painel consulta por _polling_ (TanStack Query); nenhum envio externo
  (WhatsApp/e-mail ficam fora desta spec — o projeto não tem infra de e-mail e o canal
  WhatsApp da spec 011 seguiria reservado a conversa com aluna, não lembrete interno da
  equipe). Zero dependência nova, zero worker de envio.
- Q: **CL-03 — Geração automática de tarefas a partir de eventos de Pipeline/Workflow?** →
  A: **Só via ação nova no motor de automação (spec 014).** Estende o catálogo fechado
  `ACAO_TIPOS` do Workflow com `CRIAR_TAREFA` (título/descrição/prazo relativo/responsável),
  reaproveitando o motor de fluxo já existente (condições E/OU, gatilhos de
  Lead/Oportunidade, worker `WorkerScheduler`). Nenhum mecanismo novo de disparo; o Pipeline
  (010) não ganha regra nativa própria de geração de tarefa — quem quiser automatizar
  publica um fluxo no Workflow.

### Decisões desta spec (sem pergunta ao dono do produto — defaults documentados, Princípio II)

- **D-01 — Âncora de `tarefa` é opcional (0..N), não polimórfica obrigatória.** Diferente
  de `interacao` (009) e `oportunidade` (010), que exigem exatamente uma âncora, uma
  `tarefa` pode existir **sem nenhuma** âncora (tarefa "geral" do time ou "pessoal" de um
  usuário), ou com qualquer combinação independente de `pessoa_id`, `lead_id` e
  `oportunidade_id` (ex.: tarefa de acompanhar uma oportunidade específica de uma pessoa; ou
  gerada automaticamente a partir de um gatilho de Lead — CL-03/FR-014 — sem que o lead já
  tenha virado pessoa). Motivo: o próprio texto da visão (8.10) descreve "gerenciador de
  tarefas do time, pessoal **e geral**" — a maioria das tarefas de um gestor de tarefas de
  equipe não está ligada a nenhum registro de CRM, e a geração automática via Workflow
  precisa ancorar tanto em Lead quanto em Oportunidade (os dois tipos de registro que os
  gatilhos do Workflow resolvem, spec 014).
- **D-02 — "Nota" desta spec é comentário de tarefa, não a `interacao` de timeline.** A
  spec 009 (CL-02) já reservou explicitamente essa distinção: "tarefa/nota de fluxo de
  trabalho (agenda, checklist, delegação) continuam reservadas para a spec 016 — o que
  aquela spec cobre é a nota de timeline". Aqui, `nota_tarefa` é um comentário append-only
  (autor + conteúdo + data) pendurado numa `tarefa` — sem edição/remoção (registro de
  acompanhamento, como um log de progresso), sem qualquer relação com `interacao`.
- **D-03 — Checklist é uma lista de itens de texto com `concluido: boolean`**, ordenável
  (`ordem: Int`), sem peso/pontuação individual — o progresso (`x de y concluídos`) é
  **derivado** por contagem. 100% concluído é uma das condições que rendem pontos de
  gamificação (CL-01).
- **D-04 — Cronômetro por tarefa** é uma lista de **períodos** (`inicio`/`fim?`) —
  múltiplos start/stop por tarefa (retomar depois de pausar); no máximo **1 período aberto**
  (`fim = null`) por tarefa por vez (`POST .../cronometro/iniciar` com um período já aberto
  → 409); `POST .../parar` fecha o aberto; tempo total é **derivado** (soma dos períodos
  fechados + o aberto até `agoraUtc()` se houver).
- **D-05 — Dependência entre tarefas** é um grafo simples (`tarefa_dependencia`: tarefa →
  depende-de tarefa, `@@unique` no par, sem ciclos — validado na escrita via busca em
  profundidade, ciclo → 422). Efeito: uma tarefa com dependência(s) **não concluída(s)**
  não pode ser marcada `CONCLUIDA` (409); pode ser criada, editada, ter checklist/cronômetro/
  notas normalmente enquanto bloqueada — a dependência trava só a conclusão, não a edição
  (mesma disciplina de "curadoria nunca bloqueia leitura", adaptada).
- **D-06 — Delegação/reatribuição** troca `responsavel_id`; histórico de **1ª classe**
  `tarefa_delegacao` (de/para, autor da delegação, motivo opcional, quando) — mesmo
  precedente de `transferencia_atendimento` (012) e `oportunidade_movimentacao` (010) não
  serem o audit genérico. Delegar para si mesmo ou repetir o mesmo responsável é no-op (sem
  linha nova).
- **D-07 — "Geral" vs "pessoal"** é resolvido por `responsavel_id` nullable: tarefa **sem**
  responsável é "geral" (fila do time, visível por todos com `tarefa:ver_todas`); tarefa
  **com** responsável é "pessoal" dele. Não existe um 3º tipo/enum — é sempre a mesma
  entidade, a visão do painel (aba "Minhas"/"Gerais"/"Time") é um filtro de leitura.
- **D-08 — Escopo de visão** replica o padrão já usado em `lead` (008) e `oportunidade`
  (010): `tarefa:ver_todas` | `tarefa:ver_proprias` (`ver_proprias` = `responsavel_id` =
  sujeito **ou** tarefa sem responsável nenhum, já que "geral" é de todo mundo por
  definição — D-07); filtro no `where`, nunca na serialização; fora do escopo → 404.
- **D-09 — "Dashboard de resultados" (8.10)** desta spec é o endpoint de **ranking de
  pontos** (CL-01) + contagens derivadas (concluídas no prazo/atrasadas por usuário/
  período). Um painel de métricas amplo de CRM (gráficos, funil, benchmarks) é a spec 017
  (Dashboard) — que pode consumir este mesmo endpoint depois.
- **D-10 — Sem `DELETE` físico de tarefa.** Só `status = CANCELADA` (mesma disciplina de
  `lead`/`equipe`/`integracao`) — preserva histórico de delegação/cronômetro/checklist/
  pontos já concedidos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gestão pessoal de tarefas com checklist e prazo (Priority: P1)

Um integrante do time comercial cria uma tarefa para si (ex.: "Ligar para retomar negociação
da oportunidade X"), com prazo, checklist de passos e, opcionalmente, ligada a uma
`pessoa`/`oportunidade`. Ele acompanha suas tarefas pessoais numa lista, marca itens do
checklist, e conclui a tarefa quando termina.

**Why this priority**: é o núcleo mínimo utilizável do gestor de tarefas — sem isso não há
produto. Todas as outras histórias (delegação, dependência, gamificação, automação) são
extensões sobre esta base.

**Independent Test**: pode ser testado sozinho criando uma tarefa via API/painel, marcando
itens do checklist e concluindo — entrega valor completo de "lista de afazeres" mesmo sem
nenhuma outra história implementada.

**Acceptance Scenarios**:

1. **Given** um sujeito com `tarefa:criar`, **When** ele cria uma tarefa com título, prazo e
   3 itens de checklist, **Then** a tarefa nasce com `status = PENDENTE`, responsável = o
   próprio criador (padrão), progresso do checklist `0/3`.
2. **Given** a tarefa acima, **When** o responsável marca 2 dos 3 itens como concluídos e
   tenta concluir a tarefa, **Then** a conclusão é permitida (checklist incompleto não
   bloqueia — só dependência bloqueia, D-05), `status = CONCLUIDA`, `concluido_em` gravado.
3. **Given** uma tarefa já `CONCLUIDA`, **When** alguém tenta marcar/desmarcar um item do
   checklist, **Then** 409 (tarefa concluída não se edita — reabrir é uma transição
   explícita `status = PENDENTE`, permitida por quem tem `tarefa:editar`).

---

### User Story 2 - Agenda, cronômetro e comentários de acompanhamento (Priority: P2)

Um usuário organiza seu dia vendo as tarefas por data de vencimento (agenda), inicia o
cronômetro ao começar a trabalhar numa tarefa, pausa/retoma conforme necessário, e registra
comentários de progresso (`nota_tarefa`) ao longo do dia.

**Why this priority**: entrega o valor de "gestão do tempo" e do "diário de bordo" da
tarefa — depende da User Story 1 existir, mas é independente das demais (delegação,
dependência, gamificação, automação).

**Independent Test**: pode ser testado isoladamente sobre uma tarefa já criada — iniciar e
parar o cronômetro, ver o tempo total derivado, adicionar comentários, e consultar a agenda
por período (`GET /crm/tarefas?vencimentoDe=&vencimentoAte=`).

**Acceptance Scenarios**:

1. **Given** uma tarefa sem cronômetro em andamento, **When** o responsável inicia o
   cronômetro, **Then** um período abre (`inicio = agora`, `fim = null`).
2. **Given** um período já aberto, **When** o mesmo sujeito tenta iniciar de novo, **Then**
   409; **When** ele para o cronômetro, **Then** o período fecha (`fim = agora`) e o tempo
   total da tarefa (soma de todos os períodos) reflete o novo intervalo.
3. **Given** uma tarefa, **When** alguém adiciona um comentário (`nota_tarefa`), **Then** o
   comentário aparece na lista de acompanhamento em ordem cronológica e não pode ser
   editado nem removido por ninguém.
4. **Given** tarefas com vencimento em datas diferentes, **When** o painel pede a agenda de
   uma semana, **Then** só as tarefas com `data_vencimento` dentro do intervalo (e no
   escopo de visão do sujeito, D-08) voltam.

---

### User Story 3 - Delegação, dependência entre tarefas e fila geral do time (Priority: P2)

Um gestor cria uma tarefa "geral" (sem responsável, D-07), que aparece na fila do time; ou
delega uma tarefa já existente para outro integrante, com um motivo opcional. Duas tarefas
têm uma relação de dependência: a segunda só pode ser concluída depois que a primeira for.

**Why this priority**: entrega o valor de coordenação de equipe — depende da User Story 1,
mas é independente do cronômetro/agenda e da gamificação/automação.

**Independent Test**: pode ser testado isoladamente criando 2 tarefas, ligando uma como
dependência da outra, e tentando concluir fora de ordem; e delegando uma tarefa entre dois
usuários e conferindo o histórico.

**Acceptance Scenarios**:

1. **Given** uma tarefa sem `responsavel_id`, **When** ela é listada, **Then** aparece na
   fila "geral" para qualquer sujeito com `tarefa:ver_todas`.
2. **Given** uma tarefa pessoal de A, **When** um sujeito com `tarefa:delegar` a reatribui
   para B com um motivo, **Then** `responsavel_id` passa a ser B, e uma linha nasce em
   `tarefa_delegacao` (de A, para B, autor, motivo, quando).
3. **Given** a tarefa 2 depende da tarefa 1 (ainda `PENDENTE`), **When** alguém tenta
   concluir a tarefa 2, **Then** 409 com a lista de dependências pendentes; **When** a
   tarefa 1 é concluída e a tentativa se repete, **Then** a tarefa 2 é concluída
   normalmente.
4. **Given** as tarefas 1 e 2, **When** alguém tenta marcar a tarefa 1 como dependente da
   tarefa 2 (criando um ciclo), **Then** 422.

---

### User Story 4 - Pontos, ranking e geração automática via Workflow (Priority: P3)

Ao concluir tarefas dentro do prazo (ou com checklist 100%), o responsável acumula pontos
derivados; um ranking mostra quem mais pontuou no período. Separadamente, um fluxo de
automação publicado no Workflow (spec 014) cria tarefas de follow-up automaticamente quando
um lead muda de estágio ou uma oportunidade muda de etapa.

**Why this priority**: é a camada de engajamento/automação — agrega valor, mas o gestor de
tarefas já é útil sem ela (P1–P2 cobrem o essencial). Depende das User Stories 1 e 3
existirem (pontos são calculados sobre conclusões e dependem do modelo básico de tarefa).

**Independent Test**: pode ser testado isoladamente consultando o endpoint de ranking após
concluir algumas tarefas em diferentes condições (no prazo/atrasada, checklist completo/
incompleto); e publicando um fluxo com a ação `CRIAR_TAREFA` e disparando o gatilho
correspondente (mesmo harness de simulação da spec 014).

**Acceptance Scenarios**:

1. **Given** uma tarefa com prazo, **When** ela é concluída antes do vencimento, **Then** o
   responsável ganha os pontos da regra "no prazo"; **When** concluída depois do
   vencimento, **Then** ganha só os pontos-base (sem o bônus de prazo).
2. **Given** um período (ex.: mês corrente), **When** o painel pede o ranking, **Then** a
   lista vem ordenada por pontos totais **derivados** naquele período — nenhum contador
   persistido é lido.
3. **Given** um fluxo publicado no Workflow com uma ação `CRIAR_TAREFA` (título fixo, prazo
   relativo de N dias, responsável = quem está no gatilho ou um usuário fixo), **When** o
   gatilho correspondente ocorre (ex.: lead muda de estágio), **Then** uma nova `tarefa` é
   criada automaticamente, ligada ao lead/oportunidade do gatilho quando aplicável.
4. **Given** o mesmo fluxo processado 2× para o mesmo evento (reprocessamento do worker),
   **When** a ação roda de novo, **Then** nenhuma tarefa duplicada é criada (idempotência
   por `(execucao_fluxo_id, acao_indice)`, mesmo padrão das demais ações do Workflow).

---

### Edge Cases

- Tentar concluir uma tarefa `CANCELADA` → 409 (transições válidas de `status` são um
  conjunto fechado: `PENDENTE → EM_ANDAMENTO → CONCLUIDA`, qualquer estado não-terminal →
  `CANCELADA`; terminal → terminal é sempre 409).
- Excluir/editar um item de checklist de uma tarefa que não é sua e sem `tarefa:editar` →
  403.
- Criar uma tarefa com `oportunidade_id` de uma oportunidade que não existe → 404.
- Ranking pedido para um período sem nenhuma tarefa concluída → lista vazia (200), nunca
  erro.
- Ação `CRIAR_TAREFA` do Workflow apontando um `responsavelId` de usuário inexistente/
  inativo → ação falha (`status: 'falhou'` no `AcaoAplicadaResultado`, mesmo contrato das
  demais ações), não derruba as demais ações do fluxo.
- Duas tarefas formando dependência mútua direta (A depende de B, B depende de A) ou um
  ciclo indireto (A→B→C→A) → 422 em qualquer uma dessas tentativas.
- Cronômetro: parar sem ter iniciado → 409 (não há período aberto).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir criar uma `tarefa` com título (obrigatório),
  descrição opcional, prazo (`data_vencimento`) opcional, responsável opcional (D-07),
  `pessoa_id`/`lead_id`/`oportunidade_id` opcionais e independentes entre si (D-01).
- **FR-002**: O sistema MUST permitir editar título/descrição/prazo/âncoras de uma tarefa
  não-terminal (`PENDENTE`/`EM_ANDAMENTO`) por quem tem `tarefa:editar`; tarefa `CONCLUIDA`/
  `CANCELADA` MUST responder 409 a edição, exceto a transição de reabertura
  (`status → PENDENTE`).
- **FR-003**: O sistema MUST expor transições de `status` como conjunto fechado
  (`PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`); transição inválida MUST responder
  409.
- **FR-004**: O sistema MUST impedir concluir uma tarefa que tenha ao menos uma dependência
  (D-05) não concluída, respondendo 409 com a lista das dependências pendentes.
- **FR-005**: O sistema MUST permitir declarar dependência entre duas tarefas e MUST
  rejeitar (422) qualquer declaração que crie um ciclo (direto ou indireto).
- **FR-006**: O sistema MUST permitir um checklist de itens de texto por tarefa, cada item
  com `concluido: boolean` independente, reordenável; o progresso (`x/y`) MUST ser
  derivado, nunca armazenado.
- **FR-007**: O sistema MUST permitir controlar um cronômetro por tarefa como uma lista de
  períodos `inicio`/`fim`, com no máximo 1 período aberto por tarefa por vez (D-04); iniciar
  com um período já aberto, ou parar sem período aberto, MUST responder 409. O tempo total
  MUST ser derivado (soma dos períodos).
- **FR-008**: O sistema MUST permitir comentários de acompanhamento (`nota_tarefa`)
  append-only (sem edição/remoção) numa tarefa, cada um com autor, conteúdo e data (D-02).
- **FR-009**: O sistema MUST permitir delegar/reatribuir uma tarefa a outro usuário,
  gravando um histórico de 1ª classe (`tarefa_delegacao`: de, para, autor, motivo opcional,
  quando — D-06); delegar para o mesmo responsável atual MUST ser no-op (sem linha nova).
- **FR-010**: O sistema MUST resolver o escopo de visão por permissão (`tarefa:ver_todas` |
  `tarefa:ver_proprias`, D-08) no `where` da consulta, nunca na serialização; fora do
  escopo MUST responder 404.
- **FR-011**: O sistema MUST calcular pontos de gamificação (CL-01) de forma **derivada**
  a partir de tarefas concluídas (regras congeladas: pontos-base por conclusão, bônus por
  concluir no prazo, bônus por checklist 100% ao concluir) — nunca um contador incremental
  persistido.
- **FR-012**: O sistema MUST expor um endpoint de ranking de pontos por usuário, filtrável
  por período, sempre recalculado na leitura.
- **FR-013**: O sistema MUST expor um campo derivado de "vencendo hoje"/"atrasada" por
  tarefa e um endpoint de "minhas notificações" (tarefas vencendo hoje ou atrasadas do
  sujeito autenticado, no escopo de visão dele) para o painel consultar (CL-02) — sem envio
  externo.
- **FR-014**: O sistema MUST estender o catálogo fechado de ações do Workflow (spec 014)
  com uma ação nova `CRIAR_TAREFA` (título, descrição opcional, prazo relativo em dias a
  partir da execução, responsável fixo opcional) que, ao ser aplicada, cria uma `tarefa`
  ligada ao registro do gatilho (lead/oportunidade) quando aplicável (CL-03); a aplicação
  MUST ser idempotente por execução de fluxo (reprocessar não duplica tarefa).
- **FR-015**: O sistema MUST auditar toda escrita relevante (criação, edição, mudança de
  status, delegação) em `crm_tarefa_audit`, na forma canônica do `core`, append-only, só
  delta real.
- **FR-016**: O sistema MUST NOT excluir fisicamente uma tarefa; o encerramento definitivo é
  a transição para `status = CANCELADA` (D-10).
- **FR-017**: Usuários MUST conseguir consultar a "agenda" — tarefas filtradas por intervalo
  de `data_vencimento` — no escopo de visão deles.

### Key Entities *(include if feature involves data)*

- **Tarefa**: unidade de trabalho do gestor de tarefas — título, descrição, prazo,
  responsável (opcional), âncoras opcionais e independentes em `pessoa`/`lead`/
  `oportunidade` (D-01), status (conjunto fechado), datas de criação/conclusão.
- **ItemChecklist**: item de texto de uma tarefa, com posição e estado concluído/pendente
  (D-03).
- **PeriodoCronometro**: intervalo de tempo trabalhado numa tarefa, com início e fim
  opcional (D-04) — no máximo um aberto por tarefa.
- **NotaTarefa**: comentário de acompanhamento append-only numa tarefa (D-02) — distinto da
  `interacao` de timeline (spec 009).
- **DependenciaTarefa**: relação "tarefa depende de tarefa", sem ciclos (D-05).
- **DelegacaoTarefa**: histórico de reatribuição de responsável (D-06).
- **Ação `CRIAR_TAREFA`** (extensão ao catálogo do Workflow, spec 014): configuração de
  geração automática de tarefa a partir de um fluxo publicado (CL-03).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário consegue criar uma tarefa pessoal com checklist e prazo, e
  concluí-la, em menos de 1 minuto de interação no painel.
- **SC-002**: A fila "geral" do time e a visão "minhas tarefas" nunca mostram, para um
  mesmo sujeito, uma tarefa fora do escopo de visão dele (0 vazamento entre sujeitos sem
  `tarefa:ver_todas`).
- **SC-003**: Nenhuma tarefa com dependência pendente é concluída em nenhum cenário testado
  (0 exceções na suíte de testes de dependência).
- **SC-004**: O ranking de pontos e o tempo total por tarefa sempre refletem o estado atual
  das tarefas concluídas/períodos de cronômetro, sem exigir nenhum recálculo manual ou job
  de sincronização.
- **SC-005**: Um fluxo de automação publicado com a ação `CRIAR_TAREFA` gera exatamente uma
  tarefa por execução do gatilho, mesmo sob reprocessamento do worker.

## Assumptions

- Reaproveita `usuario` (RBAC, spec 004) como responsável/autor/delegado — nenhuma entidade
  de "membro do time" nova (equipe/007 já existe para agrupamento, mas tarefa não exige
  vínculo de equipe).
- `pessoa`/`oportunidade` já existem (specs 005/010); tarefa referencia por FK opcional,
  sem duplicar dados delas.
- Notificação in-app (CL-02) é suficiente para o MVP — envio por WhatsApp/e-mail fica para
  uma spec futura, se o dono do produto priorizar depois de ver o uso real.
- Gamificação (CL-01) é só pontos + ranking — badges/conquistas/níveis ficam para uma spec
  futura, se fizer sentido depois de validar o engajamento com a versão simples.
- O volume de tarefas por usuário é compatível com cálculo síncrono na leitura (dezenas a
  poucas centenas simultâneas por usuário) — o mesmo pressuposto de baixo volume já usado em
  `oportunidade`/010 e `atendimento`/012; um volume muito maior justificaria contadores
  persistidos no futuro, fora do escopo aqui.
