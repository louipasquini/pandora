# Feature Specification: CRM · Dashboard — métricas comerciais e de atendimento, derivadas por query

**Feature Branch**: `017-crm-dashboard`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "017 — crm-dashboard: métricas **derivadas por query** (nunca
contador): gráficos, benchmarks, correlação, rank por integrante do comercial, filtro por
data/período, dashboards configuráveis por perfil, export PDF/Excel, alertas de meta, funil
de conversão visual, métricas de qualidade de atendimento (tempo médio de resposta, CSAT,
taxa de resolução). Frontend: dashboards."

## Clarifications

### Session 2026-09-10

- Q: **CL-01 — "Dashboards configuráveis por perfil": o que exatamente é configurável no
  MVP desta spec?** → A: **Conjunto fixo de painéis, visibilidade por RBAC + "visões
  salvas" por usuário.** Os painéis (widgets) do dashboard são um catálogo fechado no
  código (mesma disciplina do catálogo de permissões da 004 e do catálogo de ações do
  Workflow da 014). Cada painel exige uma permissão de leitura; o dashboard mostra só os
  painéis que o sujeito pode ver. "Configurável" no MVP = o usuário salva **visões**
  (`dashboard_visao`): um nome + o recorte de filtros (período, equipe, responsável,
  pipeline) + a lista/ordem de painéis que quer ver — pessoais, com opção de marcar como
  compartilhada com um perfil. **Não** há um construtor de layout livre (arrastar/
  redimensionar widget), **não** há widget definido em runtime. Uma visão é preferência de
  leitura, não uma nova fonte de métrica.
- Q: **CL-02 — "Alertas de meta" entram nesta spec?** → A: **Sim, versão mínima —
  `meta_comercial` + atingimento derivado.** Uma `meta_comercial` é um alvo numérico
  (`metrica` do catálogo fechado, `periodo` mês/trimestre, escopo opcional
  `equipe_id`/`responsavel_id`, `alvo` numérico). O "atingimento" (`realizado`, `%`,
  `no_ritmo?`) é **sempre derivado** na leitura — a mesma query da métrica, comparada ao
  alvo; nunca um contador. O "alerta" é um campo derivado (`status ∈ {no_caminho,
  em_risco, batida, estourada}`) que o painel destaca + entra em `GET /crm/dashboard/
  notificacoes` (mesmo padrão in-app da spec 016, CL-02 — sem envio externo). Sem worker,
  sem e-mail/WhatsApp.
- Q: **CL-03 — Export PDF/Excel: como?** → A: **100% client-side, 0 dependência nova.**
  "Excel" = export **CSV** de qualquer painel tabular via `Blob` no navegador (mesmo padrão
  já usado em Disparos, spec 015 — sem link direto ao backend, sem `multer`, sem
  `exceljs`). "PDF" = `window.print()` com folha de estilo de impressão dedicada
  (`@media print`) na página do dashboard. O backend expõe os dados dos painéis em JSON e um
  `?formato=csv` opcional nos endpoints tabulares; nenhuma geração de binário no servidor,
  nenhuma lib de PDF/planilha nova (mantém o "0 dep nova" de toda spec do `crm`).
- Q: **CL-04 — Escopo de dados e profundidade de "benchmarks / correlação" no MVP?** → A:
  **Só dados de CRM; benchmark = comparação período-a-período; sem motor estatístico.** O
  Financeiro (specs 018–030) ainda não existe — não há `transacao`/`receita` reais, então
  o dashboard v1 cobre **apenas** o que o `crm` já produz: `lead` (008), `oportunidade`/
  pipeline (010), `atendimento`/chat (012), `tarefa` (016), `interacao` (009), `disparo`
  (015). "Benchmark" = todo painel aceita um período e devolve também o mesmo recorte no
  **período anterior de igual duração** + o `delta` (absoluto e %); "rank por integrante"
  = agregação por `responsavel_id`/`atendente_id` ordenada. **Não** há coeficiente de
  correlação estatística, regressão, nem previsão nesta spec — "correlação" fica como
  cruzamento simples (ex.: taxa de conversão por origem de lead) e uma nota nas Assumptions
  de que análise estatística é uma spec futura, se o dono do produto priorizar. Um painel
  de receita/faturamento entra quando o Financeiro existir (spec de Dashboard financeiro
  própria, fase 2+).

### Decisões desta spec (sem pergunta ao dono do produto — defaults documentados, Princípio II)

- **D-01 — Catálogo fechado de painéis (`PAINEIS_DASHBOARD`) no código.** Cada painel tem
  `id` estável, `titulo`, `permissao` de leitura exigida, `formato` (`serie_temporal` |
  `funil` | `ranking` | `tabela` | `numero`), e a função de consulta que o alimenta. Cresce
  por PR revisável a cada spec que adiciona uma fonte de métrica — mesmo modelo do catálogo
  de permissões (004) e de `ACAO_TIPOS` (014). Nenhum painel é criado em runtime.
- **D-02 — Toda métrica é uma query sobre o estado atual das entidades do `crm`, não um
  contador.** Nenhuma tabela de "métrica materializada", nenhum job de rollup. O dashboard
  lê `lead`/`oportunidade`/`atendimento`/`tarefa`/`interacao`/`disparo` com `groupBy`/
  agregação do Prisma a cada request (Princípio V). Reaproveita, onde já existe, a lógica
  pura de agregação já testada: `agregarMetricas` do pipeline (010), `calcularSlaAtendimento`
  e CSAT do atendimento (012), `calcularPontosTarefa`/ranking da tarefa (016),
  `calcularScore` do lead (008).
- **D-03 — Escopo de visão do sujeito é respeitado em todo painel.** Um painel que agrega
  oportunidades usa o mesmo `where` de escopo do `OportunidadeConsultaService`
  (`ver_todas`/`ver_proprias`, 010); um painel de tarefas usa o `TarefaConsultaService`
  (016); um de leads, o `LeadConsultaService` (008); um de atendimentos, o
  `AtendimentoConsultaService` (012). O dashboard **nunca amplia** o que o sujeito já pode
  ver por outra tela — filtros só restringem. Um sujeito sem nenhuma das permissões de
  painel vê o dashboard vazio (200, lista de painéis vazia), nunca 403 na página inteira.
- **D-04 — Permissão nova mínima.** Um recurso `dashboard` no catálogo RBAC (004) com
  `dashboard:ver` (abre a página e os painéis "de visão geral" que não exigem permissão
  mais específica) e `dashboard:gerir_metas` (criar/editar `meta_comercial`). Painéis
  específicos reusam as permissões já existentes do recurso que expõem (ex.: painel de
  funil de pipeline → `oportunidade:ver_todas`|`oportunidade:ver_proprias`; painel de
  qualidade de atendimento → `atendimento:ver_todos`|`atendimento:ver_proprios`; ranking do
  comercial → `oportunidade:ver_todas`). `administrador`/credencial de serviço concedem
  tudo de graça (mesmo padrão de toda spec desde a 005).
- **D-05 — Período é sempre explícito e fechado no servidor.** `GET /crm/dashboard?de=&
  ate=&equipeId=&responsavelId=&pipelineId=` — `de`/`ate` obrigatórios (o frontend manda o
  default "últimos 30 dias"); datas parseadas com tolerância mínima (nascem de um seletor
  de data do painel, não de payload de origem — não usa o `parseInstante` de borda do
  core, só `Date`/ISO simples; lixo → 400). O "período anterior" do benchmark é derivado:
  mesmo número de dias imediatamente antes de `de`.
- **D-06 — `meta_comercial` não tem `DELETE` físico com histórico perdido? Tem `DELETE`.**
  Diferente de `lead`/`equipe`/`tarefa`, uma meta é configuração de baixo valor histórico
  (como `janela_atendimento`/`feriado` da 007, que têm `DELETE` físico). `DELETE
  /crm/dashboard/metas/:id` remove a linha; a auditoria (`crm_dashboard_audit`) guarda o
  delta da remoção. Editar/criar/remover meta audita na forma canônica do core.
- **D-07 — "Configurável por perfil" via visão compartilhada, não por override de perfil.**
  `dashboard_visao` tem `dono_usuario_id` (sempre) e `perfil_compartilhado_id?` (opcional):
  quando setado, qualquer sujeito com aquele perfil vê a visão na lista dele como
  "somente-leitura" (pode clonar para uma própria). Só o dono ou quem tem
  `dashboard:gerir_metas`… não — melhor: só o dono edita/exclui a visão; compartilhar/
  descompartilhar é do dono. Sem uma 2ª permissão só para isso.
- **D-08 — Sem gráfico = sem lib de gráfico.** Os painéis `serie_temporal` e `funil` são
  desenhados em **SVG à mão** no frontend (mesmo precedente do Kanban HTML5 nativo da 010 e
  do "0 dep nova" de todas as specs). O backend devolve os pontos já agregados; o frontend
  só os posiciona.
- **D-09 — Cache leve opcional, na borda HTTP, nunca no banco.** Se algum painel ficar
  pesado, a resposta pode ganhar um `Cache-Control: private, max-age=60` — decisão de
  implementação, não de schema. Nenhuma métrica é persistida para "acelerar". (Registrado
  aqui para deixar explícito que a alternativa "tabela de rollup" foi considerada e
  rejeitada — Princípio V.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visão geral do comercial num período, com comparação ao período anterior (Priority: P1)

Um gestor comercial abre o Dashboard, escolhe um período (default: últimos 30 dias) e vê os
números-chave do CRM naquele recorte — leads novos, oportunidades criadas/ganhas/perdidas,
valor em aberto por moeda, taxa de conversão do funil, tarefas concluídas no prazo — cada um
com o valor do **período anterior de igual duração** e o `delta` (absoluto e %). Ele pode
filtrar por equipe e por responsável.

**Why this priority**: é o núcleo mínimo utilizável do dashboard — sem isso não há produto.
Todos os outros painéis (funil visual, ranking, qualidade de atendimento, metas) são
recortes adicionais sobre a mesma mecânica de "query derivada num período + comparação".

**Independent Test**: pode ser testado sozinho chamando `GET /crm/dashboard?de=&ate=` e
conferindo que cada número bate com uma query direta nas tabelas do `crm` para aquele
intervalo, e que o bloco do período anterior cobre exatamente os N dias imediatamente
antes de `de`.

**Acceptance Scenarios**:

1. **Given** um sujeito com `dashboard:ver` e `oportunidade:ver_todas`, **When** ele pede o
   dashboard para 2026-08-01..2026-08-31, **Then** cada painel de visão geral devolve
   `{ valor, periodoAnterior, delta, deltaPercentual }`, e `periodoAnterior` corresponde a
   2026-07-02..2026-07-31 (31 dias imediatamente antes).
2. **Given** o mesmo sujeito, **When** ele adiciona `responsavelId=<X>`, **Then** todos os
   painéis passam a agregar só registros de X; nenhum painel passa a mostrar mais dados do
   que sem o filtro.
3. **Given** um sujeito com `dashboard:ver` mas **sem** nenhuma permissão de painel
   específico, **When** ele abre o dashboard, **Then** a página carrega (200) com a lista de
   painéis visíveis vazia ou só com os painéis "de visão geral" liberados por
   `dashboard:ver` — nunca 403 na página inteira.
4. **Given** `de` depois de `ate`, ou uma data inválida, **When** o dashboard é pedido,
   **Then** 400 com mensagem clara.

---

### User Story 2 - Funil de conversão visual e ranking por integrante do comercial (Priority: P2)

O gestor vê o funil de um pipeline como um gráfico de barras/etapas (quantidade e valor por
etapa, tempo médio na etapa, taxa de conversão) e um ranking dos integrantes do comercial no
período — oportunidades ganhas, valor ganho por moeda, taxa de conversão individual, e (de
Tarefas) pontos de produtividade.

**Why this priority**: entrega o valor de "onde a venda trava" e "quem está performando" —
depende da User Story 1 (mesma mecânica de período), mas é um recorte independente dos
painéis de atendimento e de metas.

**Independent Test**: pode ser testado isoladamente chamando o painel de funil
(`GET /crm/dashboard/paineis/funil-pipeline?pipelineId=&de=&ate=`) e o de ranking
(`GET /crm/dashboard/paineis/ranking-comercial?de=&ate=`), conferindo contra as mesmas
queries que `MetricasService` (010) e `RankingService` (016) já usam.

**Acceptance Scenarios**:

1. **Given** um pipeline com etapas `ABERTA`/`GANHA`/`PERDIDA` e oportunidades no período,
   **When** o painel de funil é pedido, **Then** devolve por etapa `{ quantidade,
   valorPorMoeda[], tempoMedioHoras }` e a `taxaConversao` global — reusando `agregarMetricas`
   do domínio do pipeline (010), nunca somando moedas diferentes.
2. **Given** oportunidades ganhas por 3 responsáveis diferentes no período, **When** o
   ranking do comercial é pedido, **Then** a lista vem ordenada por valor ganho (por moeda)
   e inclui, por responsável, oportunidades ganhas, taxa de conversão e pontos de tarefa do
   mesmo período.
3. **Given** um sujeito com `oportunidade:ver_proprias` (não `ver_todas`), **When** ele pede
   o ranking, **Then** o painel de ranking não é listado para ele (ranking do time exige
   `oportunidade:ver_todas`, D-04) — mas o funil (restrito às próprias) continua disponível.

---

### User Story 3 - Métricas de qualidade de atendimento (Priority: P2)

Um coordenador de atendimento vê, para o período: tempo médio de 1ª resposta, % de
atendimentos dentro do SLA, CSAT médio e distribuição de notas, taxa de resolução
(encerrados / abertos no período), volume por dia e por atendente.

**Why this priority**: entrega o valor de "como está o atendimento ao vivo" — depende da
mecânica de período (US1), independente do funil comercial e das metas.

**Independent Test**: pode ser testado isoladamente chamando
`GET /crm/dashboard/paineis/qualidade-atendimento?de=&ate=` e conferindo tempo médio de
resposta / SLA / CSAT / taxa de resolução contra as mesmas fontes que o
`AtendimentoConsultaService` e o domínio de SLA/CSAT (012) já usam.

**Acceptance Scenarios**:

1. **Given** atendimentos com 1ª resposta registrada no período, **When** o painel é pedido,
   **Then** devolve `tempoMedioPrimeiraRespostaMinutos`, `percentualDentroSla`, `csatMedio`,
   `distribuicaoCsat` (0–10), `taxaResolucao` e `porAtendente[]`.
2. **Given** um atendimento sem nenhuma resposta ainda, **When** o painel é calculado,
   **Then** ele conta em "abertos" e em "fora do SLA" se já estourou, e não entra no
   denominador do tempo médio de resposta.
3. **Given** um sujeito com `atendimento:ver_proprios`, **When** ele pede o painel, **Then**
   as métricas cobrem só os atendimentos dele (mesmo escopo da inbox, 012).

---

### User Story 4 - Metas comerciais e alerta de atingimento (Priority: P3)

Um gestor com `dashboard:gerir_metas` define metas para o período (ex.: "R$ 50.000 em valor
ganho no mês para a equipe Comercial"; "20 oportunidades ganhas no trimestre para o
responsável X"). O dashboard mostra, por meta, o realizado, o % de atingimento, e um status
derivado (`no_caminho` / `em_risco` / `batida` / `estourada`); as metas em risco ou já
batidas aparecem em `GET /crm/dashboard/notificacoes`.

**Why this priority**: é a camada de acompanhamento de objetivo — agrega valor, mas o
dashboard já é útil sem ela (US1–US3 cobrem o essencial). Depende de US1 (a métrica
realizada é a mesma query derivada de um painel).

**Independent Test**: pode ser testado isoladamente criando uma `meta_comercial` via API,
concluindo/ganhando alguns registros no período, e conferindo que `realizado` e `status`
refletem o estado atual sem nenhum recálculo manual; e que uma meta `em_risco` aparece em
`/notificacoes`.

**Acceptance Scenarios**:

1. **Given** uma meta de "valor ganho no mês" = 50000 BRL para a equipe Comercial, **When**
   as oportunidades ganhas da equipe no mês somam 30000 BRL e o mês está 80% decorrido,
   **Then** a meta devolve `realizado: 30000`, `percentual: 60`, `status: em_risco` (ritmo
   abaixo do necessário) — tudo derivado, nada persistido além do alvo.
2. **Given** a mesma meta com 55000 BRL realizados, **When** o dashboard é lido, **Then**
   `status: batida` e a meta aparece em `/notificacoes`.
3. **Given** um sujeito sem `dashboard:gerir_metas`, **When** ele tenta `POST/PATCH/DELETE`
   uma meta, **Then** 403; **When** ele apenas lê o dashboard, **Then** vê as metas e o
   atingimento normalmente (leitura só exige `dashboard:ver`).
4. **Given** uma meta com escopo `responsavelId` de um usuário inexistente, **When** é
   criada, **Then** 404/422 (não cria meta órfã).

---

### User Story 5 - Visões salvas e export (Priority: P3)

Um usuário monta seu recorte preferido (período relativo, equipe, conjunto e ordem de
painéis), salva como uma **visão** nomeada, e a reabre depois. Pode marcar a visão como
compartilhada com um perfil. De qualquer painel tabular, exporta um CSV; da página inteira,
usa "Imprimir / PDF".

**Why this priority**: conveniência de leitura — o dashboard funciona sem visões salvas
(sempre há a visão default). Depende só de US1.

**Independent Test**: criar uma `dashboard_visao` via API, recarregar e confirmar que o
recorte volta idêntico; baixar o CSV de um painel e conferir cabeçalho/linhas; compartilhar
com um perfil e confirmar que outro sujeito daquele perfil a vê como somente-leitura.

**Acceptance Scenarios**:

1. **Given** um usuário, **When** ele salva uma visão com nome, filtros e lista de painéis,
   **Then** `GET /crm/dashboard/visoes` devolve a visão para ele, e abri-la reidrata
   exatamente aquele recorte.
2. **Given** uma visão marcada como compartilhada com o perfil P, **When** outro sujeito com
   o perfil P lista suas visões, **Then** ele vê a visão como `somenteLeitura: true` e pode
   cloná-la; editar/excluir a original → 403 (só o dono).
3. **Given** um painel tabular (ex.: ranking), **When** o usuário pede `?formato=csv`,
   **Then** a resposta é um CSV com uma linha por item e cabeçalho estável; nenhum binário é
   gerado no servidor.
4. **Given** a página do dashboard, **When** o usuário aciona "Imprimir", **Then** a folha
   de estilo de impressão esconde a navegação e os controles e mantém só os painéis.

---

### Edge Cases

- Período que não cobre nenhum registro → todos os painéis devolvem zeros/listas vazias
  (200), `delta` calculado contra o período anterior (que também pode ser 0 → `delta: 0`,
  `deltaPercentual: null` quando o anterior é 0, nunca divisão por zero).
- `de`/`ate` cobrindo intervalo enorme (anos) → sem paginação de série temporal, o backend
  agrega por dia/semana/mês conforme a duração (bucket derivado da duração; regra fixa, não
  configurável no MVP).
- Sujeito com `oportunidade:ver_proprias` mas `atendimento:ver_todos` → vê o funil só das
  próprias oportunidades e o painel de atendimento do time inteiro; cada painel resolve seu
  próprio escopo (D-03).
- Meta cujo período já terminou → continua sendo calculada (realizado congelado no fim do
  período), `status` final (`batida`/`estourada`), some de `/notificacoes` depois de N dias
  do fim (regra fixa).
- Duas metas para a mesma métrica/período/escopo → permitido (não há unicidade); o painel
  lista as duas. (Evita bloquear ajuste de meta no meio do período.)
- Export CSV de um painel não-tabular (funil, série temporal) → 400 (`formato=csv` só vale
  para painéis `tabela`/`ranking`).
- `dashboard_visao` referenciando um `id` de painel que saiu do catálogo (após um deploy) →
  a visão ignora silenciosamente ids desconhecidos ao reidratar (nunca quebra a página).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST expor um catálogo **fechado, no código** de painéis de
  dashboard (`PAINEIS_DASHBOARD`), cada um com `id` estável, `titulo`, `formato`, e a
  permissão de leitura exigida; nenhum painel é criável em runtime (D-01).
- **FR-002**: Toda métrica de painel MUST ser calculada por query/agregação sobre o estado
  atual das entidades do `crm` a cada request — nunca lida de um contador ou tabela de
  rollup persistida (Princípio V, D-02).
- **FR-003**: `GET /crm/dashboard` MUST aceitar `de` e `ate` (obrigatórios) e os filtros
  opcionais `equipeId`, `responsavelId`, `pipelineId`; datas inválidas ou `de > ate` → 400
  (D-05).
- **FR-004**: Cada painel numérico/temporal MUST devolver, além do valor no período, o
  mesmo recorte no **período anterior de igual duração** e o `delta` absoluto e percentual;
  divisão por período anterior 0 → `deltaPercentual: null`, nunca erro (CL-04, FR edge).
- **FR-005**: Todo painel MUST resolver o escopo de visão do sujeito reusando o serviço de
  consulta do recurso que ele expõe (`OportunidadeConsultaService`/`TarefaConsultaService`/
  `LeadConsultaService`/`AtendimentoConsultaService`); o dashboard MUST NOT ampliar o que o
  sujeito já pode ver (D-03).
- **FR-006**: Um sujeito com `dashboard:ver` mas sem permissões de painel específico MUST
  receber a página (200) com a lista de painéis restrita ao que ele pode ver — nunca 403 na
  página inteira (D-03/US1-3).
- **FR-007**: O sistema MUST expor um painel de **funil de conversão** por pipeline
  (quantidade e valor por etapa por moeda, tempo médio na etapa, taxa de conversão),
  reusando a agregação pura já testada do pipeline (010) — nunca somando moedas diferentes.
- **FR-008**: O sistema MUST expor um painel de **ranking por integrante do comercial** no
  período (oportunidades ganhas, valor ganho por moeda, taxa de conversão individual,
  pontos de produtividade de tarefa), exigindo `oportunidade:ver_todas`.
- **FR-009**: O sistema MUST expor um painel de **qualidade de atendimento** (tempo médio de
  1ª resposta, % dentro do SLA, CSAT médio e distribuição, taxa de resolução, volume por
  dia e por atendente) reusando a lógica de SLA/CSAT do atendimento (012).
- **FR-010**: O sistema MUST permitir criar/editar/remover uma `meta_comercial` (métrica do
  catálogo fechado, período, escopo opcional equipe/responsável, alvo numérico) sob
  `dashboard:gerir_metas`; leitura das metas e do atingimento exige só `dashboard:ver`
  (D-04, D-06).
- **FR-011**: O atingimento de cada meta (`realizado`, `percentual`, `status ∈ {no_caminho,
  em_risco, batida, estourada}`) MUST ser derivado na leitura pela mesma query da métrica —
  nunca persistido (CL-02).
- **FR-012**: O sistema MUST expor `GET /crm/dashboard/notificacoes` com as metas do sujeito
  em risco ou já batidas/estouradas no período corrente — in-app, sem envio externo (CL-02,
  mesmo padrão da 016).
- **FR-013**: O sistema MUST permitir salvar, listar, abrir, editar e excluir **visões**
  (`dashboard_visao`: nome, filtros, lista/ordem de painéis, `dono_usuario_id`,
  `perfil_compartilhado_id?`); só o dono edita/exclui; uma visão compartilhada é
  somente-leitura para os demais do perfil e clonável (D-07).
- **FR-014**: Endpoints de painéis **tabulares** (`tabela`/`ranking`) MUST aceitar
  `?formato=csv` e devolver CSV (uma linha por item, cabeçalho estável); `formato=csv` em
  painel não-tabular → 400. Nenhuma geração de binário no servidor (CL-03).
- **FR-015**: O frontend MUST desenhar os gráficos (série temporal, funil) em SVG próprio,
  sem biblioteca de gráfico (D-08); e MUST ter folha de estilo `@media print` que reduz a
  página do dashboard ao conteúdo dos painéis para "Imprimir / PDF" (CL-03).
- **FR-016**: Toda escrita (meta, visão) MUST ser auditada em `crm_dashboard_audit` na
  forma canônica do `core` (`montarRegistroAuditoria`, `AJUSTE_MANUAL`), append-only, só
  delta real.
- **FR-017**: O catálogo RBAC (004) MUST ganhar o recurso `dashboard` com `dashboard:ver` e
  `dashboard:gerir_metas`; `administrador`/credencial de serviço concedem de graça, sem
  migração de dados/seed.
- **FR-018**: Para períodos longos, a série temporal MUST ser agregada num bucket derivado
  da duração (dia / semana / mês) por uma regra fixa no código — não configurável no MVP.

### Key Entities *(include if feature involves data)*

- **PainelDashboard** (catálogo no código, não tabela): definição de um painel — `id`,
  `titulo`, `formato`, `permissao`, função de consulta. Fechado, cresce por PR (D-01).
- **MetaComercial** (tabela): alvo numérico para uma `metrica` do catálogo, num `periodo`
  (mês/trimestre), com escopo opcional `equipe_id`/`responsavel_id` e `alvo` numérico. O
  atingimento é derivado, não armazenado (CL-02).
- **DashboardVisao** (tabela): recorte de leitura salvo — `nome`, `filtros` (jsonb:
  período relativo/absoluto, equipe, responsável, pipeline), `paineis` (jsonb: lista
  ordenada de ids do catálogo), `dono_usuario_id`, `perfil_compartilhado_id?`. Preferência
  de UI, não fonte de métrica (CL-01, D-07).
- **CrmDashboardAudit** (tabela): forma canônica do core, append-only, só delta real — toda
  escrita de meta/visão (FR-016).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cada número de painel exibido no dashboard bate exatamente com uma query
  direta equivalente nas tabelas do `crm` para o mesmo período e escopo (0 divergência em
  toda a suíte de testes de agregação).
- **SC-002**: Nenhum painel mostra, para um sujeito sem `*:ver_todas`/`ver_todos`, um
  registro fora do escopo de visão dele (0 vazamento entre sujeitos na suíte de escopo).
- **SC-003**: O dashboard nunca lê nem escreve um contador de métrica persistido —
  reprocessar/recarregar produz sempre o mesmo resultado a partir do estado das entidades
  (0 tabela de rollup no schema).
- **SC-004**: Um gestor consegue abrir o dashboard, trocar o período e filtrar por equipe em
  menos de 15 segundos de interação, sem recarregar a página.
- **SC-005**: O atingimento de uma meta reflete o estado atual dos registros do período sem
  nenhum job de sincronização; uma meta que passa de `em_risco` para `batida` aparece em
  `/notificacoes` na leitura seguinte.
- **SC-006**: Nenhuma dependência nova (backend ou frontend) é adicionada; export é
  client-side, gráficos são SVG próprio.

## Assumptions

- O Financeiro (specs 018–030) ainda não existe — o dashboard v1 cobre **apenas** dados do
  `crm` (lead, oportunidade, atendimento, tarefa, interação, disparo). Um painel de
  receita/faturamento por moeda/papel entra numa spec de Dashboard financeiro própria
  quando o ledger canônico existir (fase 2+).
- Análise estatística (coeficiente de correlação, regressão, previsão de fechamento) está
  **fora** desta spec — "correlação" no MVP é cruzamento simples (ex.: conversão por origem
  de lead). Uma spec futura pode aprofundar se o dono do produto priorizar depois de ver o
  uso real.
- O volume de registros do `crm` é compatível com agregação síncrona por request (mesmo
  pressuposto de baixo volume já usado em `oportunidade`/010 e `atendimento`/012); um
  volume muito maior justificaria cache/rollup no futuro, fora do escopo aqui (D-09).
- Reaproveita `usuario`/`perfil` (RBAC, 004) como dono de visão / escopo de meta,
  `equipe`/`equipe_membro` (007) como escopo de equipe, e os serviços de consulta de
  lead/oportunidade/atendimento/tarefa já existentes — nenhuma entidade de domínio nova
  além de `meta_comercial`, `dashboard_visao` e a tabela de auditoria.
- Notificação in-app (CL-02) é suficiente para o MVP — envio por WhatsApp/e-mail de alerta
  de meta fica para uma spec futura, se priorizado.
- Export "Excel" = CSV (abre no Excel/Sheets); "PDF" = impressão do navegador. Geração
  server-side de `.xlsx`/`.pdf` fica para depois, se o dono do produto exigir formato
  fiel de relatório.
