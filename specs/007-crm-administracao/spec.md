# Feature Specification: Administração do CRM — equipes, expediente/feriados, integrações e auditoria

**Feature Branch**: `007-crm-administracao`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "007-crm-administracao — Módulo de Administração do CRM (bounded context `crm`, hoje vazio; `CONTEXT_MODULES` segue 11). Primeira fatia da Fase 1 (CRM). Escopo (visão Parte 8.11), SEM reimplementar o que a 004 já entregou (RBAC/perfis/permissões/usuários ficam na 004; esta spec só ESTENDE o catálogo com permissões do recurso de administração do CRM): (1) Times/squads do comercial — `equipe` + `equipe_membro`; (2) Horários de atendimento e feriados — `janela_atendimento` + `feriado` + função pura `estaEmExpediente`; (3) Registro de integrações — `integracao` (API key / webhook / conexão interna) com segredo cifrado em repouso e nunca exposto em leitura, API key interna com valor pleno mostrado uma única vez; (4) Log de auditoria administrativa — `crm_admin_audit` na forma canônica do core. RBAC 004 estendido com o recurso `crm_admin`. 5ª migração de negócio. Endpoints `/crm/admin/...`. Frontend `frontend/src/crm-admin/` com abas Equipes / Expediente / Integrações. 0 dep nova, 1 migração."

## Clarifications

### Session 2026-09-03

- Q: **CL-01** — Quando `estaEmExpediente` recebe uma `equipeId`, como combinar as janelas/
  feriados **globais** (equipe nula) com os **daquela equipe**? → A: **União.** Valem os
  globais **mais** os da equipe informada (se ela estiver ativa). A equipe só **adiciona**
  janelas/feriados; nunca remove nem substitui um global. Sem `equipeId`, só os globais
  valem. Feriado aplicável (global **ou** da equipe) sempre subtrai.
- Q: **CL-02** — Janela de atendimento que cruza a meia-noite (ex.: 22:00–02:00): suportar
  ou rejeitar na v1? → A: **Rejeitar.** `POST`/`PATCH` de `janela_atendimento` com
  `hora_fim <= hora_inicio` responde 400/422. Turno noturno é cadastrado como duas janelas
  (ex.: 22:00–23:59 e 00:00–02:00). `estaEmExpediente` **nunca** precisa avaliar a janela do
  dia anterior — a lógica não cruza dias.
- Q: **CL-03** — A "Escala do SAC" (grade de turnos por atendente, visão 9.4) entra nesta
  spec? → A: **Não — fica para spec de CRM posterior.** A 007 modela o expediente **por
  equipe / global** (operação aberta/fechada) + feriados. Turno individual, disponibilidade
  e capacidade por atendente entram junto do Chat ao Vivo (012), que é quem consome. Nesta
  spec `equipe_membro` **não** ganha grade horária.
- Q: **CL-04** — Feriado com `recorrente_anual = true` e data 29/02, em ano não bissexto? →
  A: **Ignora no ano sem 29/02.** O feriado recorrente casa só por (mês, dia) exato; 29/02
  não é deslocado para 28/02. Caso raríssimo (nenhum feriado nacional brasileiro cai em
  29/02).

## Visão geral

Primeira fatia da **Fase 1 (CRM)** e primeira entidade de negócio do _bounded context_
**`crm`** (que deixa de ser um módulo vazio da spec 001; `CONTEXT_MODULES` segue **11**).
Entrega a **Administração do CRM** descrita na Parte 8.11 da visão — o painel do
administrador do comercial/atendimento — **sem reimplementar** nada da spec 004: perfis,
permissões, usuários e o guard de RBAC continuam sendo da 004; esta spec apenas **estende o
catálogo** com um recurso novo (`crm_admin`).

O que entra:

- **Times / squads do comercial** — entidade **`equipe`** (`nome`, `descricao`, `tipo`
  `COMERCIAL` | `ATENDIMENTO` | `CS`, `ativo`) e **`equipe_membro`** ligando um **usuário da
  004** a uma equipe com `papel` (`LIDER` | `MEMBRO`) e datas de entrada/saída. Um usuário
  pode estar em **várias** equipes. É **só modelagem + CRUD**: a atribuição automática
  (round robin / carga) que consome isso é do Pipeline (010) e do Chat (012).
- **Horários de atendimento e feriados** — **`janela_atendimento`** (dia da semana, hora de
  início/fim, opcionalmente por equipe) e **`feriado`** (data, descrição, recorrente-anual,
  opcionalmente por equipe), sempre no fuso **America/Sao_Paulo** fixo. Uma **função pura**
  **`estaEmExpediente(instante, { janelas, feriados, equipe? }) → boolean`** — testável
  **sem banco** — que o Chat (012) e o Workflow (014) vão consumir para "resposta automática
  fora do expediente". **Feriado que cai dentro de uma janela = fora do expediente.**
- **Registro de integrações** — **`integracao`** (`nome`, `tipo` `API_KEY` | `WEBHOOK` |
  `CONEXAO_INTERNA`, `alvo` `FINANCEIRO` | `MARKETING` | `CENTRAL` | `EXTERNO`, `config`
  jsonb sem segredo, `ativo`, `ultimo_uso_em`). O **segredo** (token de webhook, chave de
  API externa) é **cifrado em repouso** e **nunca** retorna numa leitura (mascarado). Para
  `tipo = API_KEY` interna, o sistema **gera** uma chave (`crm_…`), guarda só o **hash**, e
  mostra o **valor pleno uma única vez** na criação. **Sem** _OAuth dance_ nem chamada
  externa nesta spec — só o cadastro/curadoria que 011 / 019–022 / 033 vão consumir.
- **Log de auditoria administrativa** — toda escrita de `equipe` / `equipe_membro` /
  `janela_atendimento` / `feriado` / `integracao` grava um registro na **forma canônica de
  auditoria do `core`** (`montarRegistroAuditoria`, `origem = AJUSTE_MANUAL`) numa tabela
  **`crm_admin_audit` somente-acréscimo**, com **apenas o _delta_ real** (ação _no-op_ não
  gera linha). O segredo/chave **nunca** aparece no _delta_.
- **RBAC 004 estendido** — o catálogo (`src/auth/rbac/catalogo.ts`) ganha o recurso
  **`crm_admin`** com `crm_admin:ver`, `crm_admin:gerir_equipes`,
  `crm_admin:gerir_expediente`, `crm_admin:gerir_integracoes`. O perfil de sistema
  `administrador` e a credencial de serviço passam a concedê-las **de graça** (special-case
  já existente na 004 — sem migração de dados).
- **Endpoints** sob `/crm/admin/…` — CRUD de `equipes` (+ membros), `janelas-atendimento`,
  `feriados`, `integracoes` (+ rotacionar segredo), todos atrás das permissões `crm_admin:*`;
  e `GET /crm/admin/expediente?instante=…&equipeId=…` expondo `estaEmExpediente` para o
  painel e para consumo interno.
- **Frontend** `frontend/src/crm-admin/` — item de navegação **CRM · Administração** atrás
  de `crm_admin:ver`, rota sob `RequirePermissao`, abas **Equipes** / **Expediente** /
  **Integrações**. `apiFetch` já trata 401/403 (specs 003/004).

O `crm` deixa de ser um módulo vazio e passa a ser **dono** de `equipe`, `janela_atendimento`,
`feriado` e `integracao` (Princípio VI). Consome `core` (auditoria, tempo, ids), o `auth`/
RBAC da 004 (catálogo + guard) e a tabela `usuario` da 004 (FK). É consumido — depois — por
010 (atribuição), 011/012 (expediente + provedor WhatsApp), 014 (workflow) e 019–022/033
(integrações).

O sucesso é medido por: `estaEmExpediente` é **determinística e livre de locale**, com o
feriado sempre subtraindo; **nenhum** segredo de integração volta numa leitura ou aparece
num registro de auditoria; toda escrita administrativa é auditada com _delta_ real; e o
catálogo de RBAC ganha `crm_admin` **sem** mexer no que a 004 entregou.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar expediente e consultar se um instante está no expediente (Priority: P1)

O administrador do CRM define as **janelas de atendimento** (ex.: seg–sex, 09:00–18:00) e
os **feriados** (ex.: 25/12, recorrente todo ano). Depois, qualquer consumidor — o painel
agora, o Chat (012) e o Workflow (014) depois — pergunta ao sistema: "o instante `T` está
dentro do expediente (opcionalmente da equipe `E`)?" e recebe **`true`/`false`**. A regra
de decisão é uma **função pura**, no fuso **America/Sao_Paulo** fixo, testável sem banco:
converte `T` para a hora local, checa se cai numa janela ativa aplicável, e **exclui** o
instante se a data local for um feriado aplicável — mesmo que caia dentro da janela.

**Why this priority**: é o núcleo reutilizável da spec e o MVP. Sem `estaEmExpediente`, o
Chat (012) não tem "fora do expediente" e o Workflow (014) não tem gatilho de horário. É a
única peça desta spec que outros contextos **consomem como código**, não como tela.

**Independent Test**: montar janelas e feriados de fixture (sem banco); chamar a função com
(a) um instante dentro de uma janela num dia útil → `true`; (b) o mesmo horário num sábado
sem janela → `false`; (c) um instante dentro da janela mas num feriado → `false`; (d) um
feriado recorrente-anual em outro ano → ainda `false`; (e) o `GET /crm/admin/expediente`
com um `instante` ISO retorna o mesmo veredito.

**Acceptance Scenarios**:

1. **Given** uma janela ativa seg–sex 09:00–18:00 (America/Sao_Paulo) e nenhum feriado,
   **When** `estaEmExpediente` recebe uma quarta-feira 14:00 local, **Then** retorna `true`.
2. **Given** a mesma janela, **When** recebe um domingo 14:00 local, **Then** retorna
   `false` (nenhuma janela cobre domingo).
3. **Given** a mesma janela e um `feriado` em 12/10 (não recorrente), **When** recebe
   12/10 às 14:00 local de um dia útil, **Then** retorna `false` (feriado subtrai a janela).
4. **Given** um `feriado` 25/12 com `recorrente_anual = true` cadastrado em 2026, **When**
   `estaEmExpediente` recebe 25/12/2027 14:00 local, **Then** retorna `false`.
5. **Given** um instante exatamente às 09:00:00 e outro às 18:00:00 com janela 09:00–18:00,
   **Then** o início é **dentro** (`>=`) e o fim é **fora** (`<`) — borda documentada e
   estável.
6. **Given** o processo rodando com `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo`,
   **When** a função roda com a mesma entrada, **Then** o resultado é **idêntico** (livre de
   locale — a conversão para America/Sao_Paulo é explícita, não depende do `TZ` do host).
7. **Given** `GET /crm/admin/expediente?instante=<ISO>` (sob `crm_admin:ver`), **When**
   chamado, **Then** responde `{ emExpediente: boolean, instante, equipeId? }` usando a
   mesma função — sem divergência entre API e código.

---

### User Story 2 - Cadastrar integrações sem nunca expor o segredo (Priority: P1)

O administrador registra uma **integração** — um token de webhook de uma plataforma, uma
chave de API de uma ferramenta externa, ou uma "conexão interna" com Financeiro/Marketing/
Central. Ao criar, informa o segredo (quando aplicável); a partir daí **nenhuma leitura**
devolve esse segredo — só metadados e uma **máscara** (ex.: `••••••1a2b`). Para uma **API
key interna** (`tipo = API_KEY`), o administrador **não** informa valor: o sistema **gera**
`crm_<random>`, persiste **só o hash**, e devolve o **valor pleno uma única vez** na
resposta de criação. Há uma ação **rotacionar** que gera um novo segredo/chave e invalida o
anterior, também com _reveal_ único.

**Why this priority**: P1 junto da US1 — é o outro entregável de valor imediato e o que
carrega o **risco de segurança** da spec. Um cadastro de integração que vaza o token no
`GET` da lista seria um incidente. Precisa nascer certo.

**Independent Test**: criar uma `integracao` `WEBHOOK` com segredo `s3cr3t`; `GET` da lista
e do detalhe → nunca aparece `s3cr3t`, só máscara + metadados; criar uma `API_KEY` → a
resposta de criação traz `crm_…` pleno **uma vez**, o `GET` seguinte não; `POST
/integracoes/{id}/rotacionar` → novo valor revelado uma vez, o hash antigo deixa de casar;
conferir que nenhum registro de `crm_admin_audit` contém o valor.

**Acceptance Scenarios**:

1. **Given** `crm_admin:gerir_integracoes`, **When** `POST /crm/admin/integracoes` com
   `{ nome, tipo: "WEBHOOK", alvo: "EXTERNO", segredo: "s3cr3t", config: {...} }`, **Then**
   a integração é criada, a resposta traz `segredoMascarado` (não o valor) e um registro de
   auditoria sem o segredo no _delta_.
2. **Given** uma `integracao` com segredo, **When** `GET /crm/admin/integracoes` ou
   `GET /crm/admin/integracoes/{id}`, **Then** o corpo traz `segredoMascarado`,
   `segredoDefinido: true`, `ultimoUsoEm`, `ativo` — **nunca** o segredo em claro.
3. **Given** `POST /crm/admin/integracoes` com `{ tipo: "API_KEY", ... }` e **sem**
   `segredo`, **When** processado, **Then** o sistema gera `crm_<≥32 chars>`, guarda só o
   hash, e a **resposta de criação** inclui `apiKey` com o valor pleno **e** um aviso de que
   não será mostrado de novo.
4. **Given** a `API_KEY` criada, **When** qualquer `GET` posterior, **Then** o valor pleno
   **não** aparece — só `segredoMascarado` / `segredoDefinido`.
5. **Given** `POST /crm/admin/integracoes/{id}/rotacionar` (sob `crm_admin:gerir_integracoes`),
   **When** processado, **Then** um novo segredo/chave é gerado e revelado **uma vez**, o
   valor anterior deixa de ser válido, e a rotação é auditada (sem valores no _delta_).
6. **Given** `PATCH /crm/admin/integracoes/{id}` mudando `nome`/`alvo`/`config`/`ativo`
   **sem** `segredo`, **When** processado, **Then** o segredo existente é preservado e só os
   campos tocados entram no _delta_.
7. **Given** uma requisição de integração **sem** `crm_admin:gerir_integracoes`, **When**
   autenticada, **Then** 403 (guard da 004) e nada muda.

---

### User Story 3 - Gerir equipes/squads do comercial e seus membros (Priority: P2)

O administrador cria uma **equipe** (ex.: "Comercial – Alto Ticket", tipo `COMERCIAL`),
adiciona **membros** (usuários da 004) com `papel` `LIDER` ou `MEMBRO`, remove membros
(registrando a data de saída, sem apagar o histórico), desativa uma equipe que não é mais
usada. Um usuário pode estar em várias equipes ao mesmo tempo. Nada nesta spec **usa** a
equipe para rotear trabalho — isso é 010/012; aqui é cadastro e leitura.

**Why this priority**: P2 — é pré-requisito de dados para a atribuição automática do
Pipeline (010) e do Chat (012), mas não entrega comportamento sozinho. Precisa existir agora
para essas specs terem em que se apoiar.

**Independent Test**: criar 2 equipes; adicionar o mesmo usuário às duas com papéis
diferentes; listar equipes de um usuário; remover o usuário de uma (conferir `saiu_em`
preenchido e o membro fora da lista ativa, mas visível no histórico); desativar uma equipe;
conferir que cada operação gerou 1 registro de auditoria.

**Acceptance Scenarios**:

1. **Given** `crm_admin:gerir_equipes`, **When** `POST /crm/admin/equipes` com
   `{ nome, tipo: "COMERCIAL" }`, **Then** a equipe é criada `ativo = true` e auditada.
2. **Given** uma equipe e um usuário da 004, **When** `POST /crm/admin/equipes/{id}/membros`
   com `{ usuarioId, papel: "MEMBRO" }`, **Then** o vínculo é criado com `entrou_em = agora`
   e `saiu_em = null`; adicionar o **mesmo** usuário à **mesma** equipe já ativo → 409.
3. **Given** um usuário membro de 2 equipes, **When** `GET /crm/admin/equipes?usuarioId=…`
   (ou o detalhe do usuário), **Then** as duas equipes aparecem — pertencer a várias é
   válido.
4. **Given** um membro ativo, **When** `DELETE /crm/admin/equipes/{id}/membros/{usuarioId}`,
   **Then** `saiu_em` é preenchido, o membro sai da lista **ativa**, o histórico permanece,
   e a saída é auditada — nenhuma linha é apagada.
5. **Given** `PATCH /crm/admin/equipes/{id}` com `{ ativo: false }`, **When** processado,
   **Then** a equipe fica inativa (some das listas padrão, visível com filtro), sem apagar
   membros nem janelas ligadas — as janelas/feriados daquela equipe deixam de ser
   aplicados enquanto ela estiver inativa.
6. **Given** `POST /crm/admin/equipes/{id}/membros` com um `usuarioId` **inexistente** na
   tabela `usuario` da 004, **When** processado, **Then** 404/422 e nada muda.
7. **Given** uma requisição de equipe **sem** `crm_admin:gerir_equipes`, **When**
   autenticada, **Then** 403.

---

### User Story 4 - Toda escrita administrativa fica auditada, sem vazar segredo (Priority: P2)

Cada criação, edição, remoção e rotação em `equipe` / `equipe_membro` /
`janela_atendimento` / `feriado` / `integracao` grava **um** registro em `crm_admin_audit`
na forma canônica do `core`: quem, quando, entidade, ação e o **_delta_ real** (só os campos
que mudaram). Uma requisição que não muda nada **não** gera registro. Nenhum registro
contém segredo, token ou chave de API — nem em claro nem cifrado.

**Why this priority**: P2 — a visão (8.11) pede "log de auditoria de ações administrativas"
explicitamente, e o Princípio "Auditoria" dos Padrões Transversais exige. Não é um
entregável de tela isolado, mas é _cross-cutting_ obrigatório para as US2–US3 e para o
Expediente.

**Independent Test**: criar uma equipe → 1 registro com _delta_ = campos criados; `PATCH`
que não altera nada → 0 registro; `PATCH` que muda o nome → 1 registro com _delta_
`{ nome: [antigo, novo] }`; criar/rotacionar integração com segredo → registros presentes,
mas `grep` do segredo nos registros = 0 ocorrências; conferir `origem = AJUSTE_MANUAL` e
autor = sujeito do JWT.

**Acceptance Scenarios**:

1. **Given** qualquer escrita bem-sucedida em entidade administrativa, **When** ela
   commita, **Then** existe **exatamente um** `crm_admin_audit` com autor (sujeito do JWT),
   instante `timestamptz` UTC, tipo de entidade, id da entidade, ação e _delta_.
2. **Given** um `PATCH` cujo corpo é igual ao estado atual, **When** processado, **Then**
   **nenhum** registro é gravado (no-op — `calcularDelta → null`).
3. **Given** a criação ou rotação de uma `integracao` com segredo, **When** auditada,
   **Then** o _delta_ registra que o segredo **passou a existir / foi rotacionado** (um
   marcador booleano/hash-prefixo), **nunca** o valor.
4. **Given** os registros de `crm_admin_audit`, **When** se tenta `UPDATE`/`DELETE` neles
   pela aplicação, **Then** não há rota nem serviço que o faça — a tabela é
   somente-acréscimo.
5. **Given** a credencial de serviço (sem `usuario` correspondente), **When** ela faz uma
   escrita administrativa, **Then** o autor registrado é o identificador da credencial de
   serviço (mesma convenção da 004).

---

### User Story 5 - Painel CRM · Administração (Priority: P3)

Quem tem `crm_admin:ver` enxerga o item de navegação **CRM · Administração** e abre um
painel com três abas: **Equipes** (lista, criar/editar, gerir membros), **Expediente**
(janelas por dia da semana + feriados, com um seletor "está no expediente agora?" que chama
`GET /crm/admin/expediente`), **Integrações** (lista com máscara, criar, rotacionar,
ativar/desativar). Cada aba de escrita aparece só com a permissão específica
(`gerir_equipes` / `gerir_expediente` / `gerir_integracoes`); sem ela, a aba é
somente-leitura. Sem `crm_admin:ver`, o item some da navegação e a rota direta mostra "sem
permissão" (não o Login).

**Why this priority**: P3 — o backend já entrega o valor (função de expediente + cadastro).
A tela torna a administração usável pelo time sem `curl`, mas não é o que 010/012/014
consomem.

**Independent Test**: logar com `crm_admin:ver` apenas → ver as 3 abas em modo leitura, sem
botões de escrita; logar com `crm_admin:ver` + `crm_admin:gerir_expediente` → só a aba
Expediente ganha controles de escrita; criar uma janela e um feriado pelo painel e ver o
indicador "no expediente agora" mudar; logar sem `crm_admin:ver` → item some, rota direta →
"sem permissão"; provocar um 403 numa chamada → banner, sessão intacta.

**Acceptance Scenarios**:

1. **Given** `crm_admin:ver`, **When** o usuário abre **CRM · Administração**, **Then** vê
   as abas Equipes / Expediente / Integrações com os dados carregados dos endpoints (zero
   _mock_).
2. **Given** a aba Integrações, **When** exibida, **Then** cada integração mostra nome,
   tipo, alvo, `ativo`, `ultimoUsoEm` e a **máscara** do segredo — nunca o valor; criar/
   rotacionar mostra o valor pleno **uma vez** num aviso destacado que não persiste ao
   recarregar.
3. **Given** a aba Expediente, **When** o usuário adiciona uma janela ou um feriado (com
   `crm_admin:gerir_expediente`), **Then** a lista atualiza e o indicador "no expediente
   agora?" reflete a mudança na próxima consulta.
4. **Given** um sujeito com `crm_admin:ver` mas **sem** as permissões de escrita, **When**
   abre qualquer aba, **Then** os controles de criar/editar/rotacionar **não** aparecem.
5. **Given** um sujeito **sem** `crm_admin:ver`, **When** logado, **Then** **CRM ·
   Administração** não aparece na navegação; **When** navega direto para a rota, **Then** vê
   "sem permissão" (403 tratado no ponto único do `apiFetch`, sem deslogar).
6. **Given** qualquer resposta **403** numa chamada do painel, **When** recebida, **Then** o
   banner "sem permissão" aparece e o token **não** é limpo (403 ≠ 401 — comportamento da
   004).

---

### Edge Cases

- **Janela que cruza a meia-noite** (ex.: 22:00–02:00): **rejeitada** na entrada
  (`hora_fim <= hora_inicio` → 400/422 — CL-02). Cadastrar como duas janelas.
- **Janelas sobrepostas / duplicadas** no mesmo dia: a avaliação usa **união** — estar
  dentro de qualquer janela ativa aplicável basta. Duplicata exata é permitida (sem efeito).
- **Nenhuma janela cadastrada**: `estaEmExpediente` retorna **`false`** para qualquer
  instante (não há expediente definido) — documentado, para o Chat (012) não tratar "sem
  config" como "sempre aberto".
- **Feriado recorrente em 29/02**: **ignorado** nos anos sem 29/02; não desloca para 28/02
  (CL-04).
- **Resolução de escopo por equipe** (CL-01): quando `equipeId` é informado, a avaliação
  considera as janelas/feriados **globais (equipe nula) + os daquela equipe** (união). Uma
  equipe só **adiciona** — nunca remove nem substitui um global. Sem `equipeId`, só os
  globais valem. Feriado aplicável (global ou da equipe) sempre subtrai.
- **Equipe inativa**: suas janelas e feriados **não** são aplicados enquanto inativa;
  voltam ao reativar.
- **`instante` malformado** no `GET /crm/admin/expediente`: 400 com mensagem clara (usa o
  `parseInstante` do core — lixo → erro de request, não `500`).
- **Integração `CONEXAO_INTERNA` sem segredo**: válida — `segredoDefinido = false`; `config`
  guarda o que for necessário (ex.: nome do contexto alvo), nunca credencial.
- **Rotacionar segredo de uma integração `CONEXAO_INTERNA` que não tem segredo**: 409 /
  422 (nada a rotacionar).
- **Remover um membro que já saiu** (`saiu_em` preenchido): idempotente — 200/204 sem novo
  registro de auditoria (no-op).
- **`ultimo_uso_em`**: nesta spec **nada** o atualiza automaticamente (não há chamada
  externa); fica reservado para 011/019–022 marcarem uso. Começa `null`.
- **Usuário da 004 removido** enquanto é membro de equipe: a 004 não expõe `DELETE` de
  usuário (spec 004), então o caso não ocorre na v1; a FK usa `onDelete: Restrict`.
- **`GET` de listas sem nada no banco**: lista vazia paginada, nunca erro.
- **DST**: o Brasil não observa horário de verão desde 2019; a conversão para
  America/Sao_Paulo assume _offset_ fixo `-03:00` para datas correntes, mas usa uma
  biblioteca de fuso (não _offset_ _hard-coded_) para ficar correto se a política mudar.

## Requirements *(mandatory)*

### Functional Requirements

#### Equipes / squads

- **FR-001**: O sistema MUST modelar **`equipe`** com: PK UUID v7 gerada na aplicação,
  `nome` (obrigatório), `descricao` (opcional), `tipo` (`COMERCIAL` | `ATENDIMENTO` | `CS`),
  `ativo` (booleano, default `true`), `criado_em`/`atualizado_em` (`timestamptz` UTC).
- **FR-002**: O sistema MUST modelar **`equipe_membro`** ligando `equipe_id` a `usuario_id`
  (FK para a tabela `usuario` da spec 004, `onDelete: Restrict`), com `papel` (`LIDER` |
  `MEMBRO`), `entrou_em` (`timestamptz`, default agora), `saiu_em` (`timestamptz` nullable).
- **FR-003**: Um usuário MUST poder ser membro de **várias** equipes simultaneamente. O
  sistema MUST impedir **dois vínculos ativos** (`saiu_em = null`) do mesmo usuário na mesma
  equipe (409); um novo vínculo após uma saída é permitido (novo registro).
- **FR-004**: O sistema MUST expor, sob `crm_admin:gerir_equipes`: `POST /crm/admin/equipes`,
  `PATCH /crm/admin/equipes/{id}` (`nome`/`descricao`/`tipo`/`ativo`),
  `POST /crm/admin/equipes/{id}/membros` (`usuarioId`, `papel`),
  `PATCH /crm/admin/equipes/{id}/membros/{usuarioId}` (`papel`),
  `DELETE /crm/admin/equipes/{id}/membros/{usuarioId}` (preenche `saiu_em`, não apaga).
- **FR-005**: Remover um membro MUST preencher `saiu_em` e removê-lo das leituras **ativas**,
  preservando o histórico. Remover um membro já saído é **idempotente** (sem novo registro
  de auditoria).
- **FR-006**: O sistema MUST expor, sob `crm_admin:ver`: `GET /crm/admin/equipes` (lista
  paginada; filtros `ativo`, `tipo`, `usuarioId`), `GET /crm/admin/equipes/{id}` (dados +
  membros ativos + histórico de membros).
- **FR-007**: `POST`/`PATCH` de membro com `usuarioId` inexistente na tabela `usuario` MUST
  responder 404/422 sem efeito.
- **FR-008**: Desativar uma `equipe` MUST manter membros, janelas e feriados ligados a ela
  no banco, mas o `estaEmExpediente` MUST NOT aplicar janelas/feriados de equipe inativa.

#### Expediente — janelas e feriados

- **FR-009**: O sistema MUST modelar **`janela_atendimento`** com: PK UUID v7, `equipe_id`
  (FK nullable — `null` = global), `dia_semana` (0 = domingo … 6 = sábado, ou enum
  equivalente estável), `hora_inicio` e `hora_fim` (hora local, granularidade de minuto),
  `ativo` (default `true`), `criado_em`/`atualizado_em`.
- **FR-010**: O sistema MUST rejeitar (400/422) `janela_atendimento` com `hora_fim <=
  hora_inicio` — sem janelas que cruzam a meia-noite na v1 (CL-02). Turno noturno é
  cadastrado como duas janelas.
- **FR-011**: O sistema MUST modelar **`feriado`** com: PK UUID v7, `equipe_id` (FK
  nullable — `null` = global), `data` (data-calendário local), `descricao`,
  `recorrente_anual` (booleano), `criado_em`/`atualizado_em`.
- **FR-012**: Quando `recorrente_anual = true`, o `feriado` MUST casar **todo ano** pelo par
  (mês, dia) exato da `data`; o ano armazenado é só a primeira ocorrência. 29/02 recorrente
  **não** casa em anos sem 29/02 e **não** é deslocado para 28/02 (CL-04).
- **FR-013**: O sistema MUST fornecer **`estaEmExpediente(instante, { janelas, feriados,
  equipe? }) → boolean`** como **função pura e determinística**, testável **sem banco**
  (recebe os conjuntos já materializados por quem chama).
- **FR-014**: `estaEmExpediente` MUST converter `instante` para a hora local de
  **America/Sao_Paulo** (via biblioteca de fuso, não _offset_ fixo _hard-coded_), extrair
  `dia_semana` e `hora:minuto` locais e a `data` local.
- **FR-015**: `estaEmExpediente` MUST retornar `true` **somente se** a hora local cai em
  **alguma** janela ativa aplicável (`hora_inicio <= t < hora_fim`, início inclusivo, fim
  exclusivo) **e** a `data` local **não** é um feriado aplicável.
- **FR-016**: Um **feriado aplicável** cuja data bate com o `instante` MUST forçar o retorno
  **`false`**, mesmo que a hora caia dentro de uma janela.
- **FR-017**: "Aplicável" MUST significar (CL-01, **união**): entradas **globais**
  (`equipe_id = null`) sempre; **mais** as entradas da `equipe` informada, se houver
  `equipe` e ela estiver `ativa`. Sem `equipe`, só as globais. A equipe **nunca** remove nem
  substitui uma entrada global.
- **FR-018**: Sem **nenhuma** janela aplicável, `estaEmExpediente` MUST retornar `false`.
- **FR-019**: `estaEmExpediente` MUST produzir o **mesmo** resultado independente do `TZ` do
  processo (matriz de fuso na CI, como a spec 002).
- **FR-020**: O sistema MUST expor `GET /crm/admin/expediente?instante=<ISO|epoch>&equipeId=<id>?`
  (sob `crm_admin:ver`) devolvendo `{ emExpediente, instante, equipeId? }`, usando a **mesma**
  função. `instante` ausente MUST usar "agora"; `instante` malformado MUST responder 400.
- **FR-021**: O sistema MUST expor, sob `crm_admin:gerir_expediente`: CRUD de
  `janelas-atendimento` (`POST`/`PATCH`/`DELETE` — `DELETE` é físico, janela não tem
  histórico) e de `feriados`; e, sob `crm_admin:ver`, `GET` de ambos (filtro por
  `equipeId`, incluindo/excluindo globais).

#### Integrações

- **FR-022**: O sistema MUST modelar **`integracao`** com: PK UUID v7, `nome`, `tipo`
  (`API_KEY` | `WEBHOOK` | `CONEXAO_INTERNA`), `alvo` (`FINANCEIRO` | `MARKETING` |
  `CENTRAL` | `EXTERNO`), `config` (jsonb, **sem** segredo), `ativo` (default `true`),
  `ultimo_uso_em` (`timestamptz` nullable, começa `null`), `criado_em`/`atualizado_em`.
- **FR-023**: O **segredo** de uma integração MUST ser **cifrado em repouso** (chave de
  cifra vinda de config/`.env`, nunca no código) **ou**, para `API_KEY` interna gerada pelo
  sistema, guardado **apenas como hash** (não reversível). A `config` jsonb MUST NOT conter
  segredo.
- **FR-024**: **Nenhuma** resposta de leitura (`GET` lista ou detalhe) MUST conter o segredo
  em claro. As leituras MUST expor apenas: `segredoDefinido` (booleano) e
  `segredoMascarado` (ex.: últimos 4 caracteres precedidos de `•`), além dos metadados.
- **FR-025**: `POST /crm/admin/integracoes` (sob `crm_admin:gerir_integracoes`): para
  `tipo = API_KEY` **sem** `segredo` no corpo, o sistema MUST **gerar** uma chave
  `crm_<aleatório ≥ 32 chars, alta entropia>`, persistir **só o hash**, e incluir o **valor
  pleno** apenas na **resposta de criação**, com aviso de _reveal_ único. Para os demais
  tipos, o `segredo` (quando enviado) é cifrado.
- **FR-026**: `POST /crm/admin/integracoes/{id}/rotacionar` (sob
  `crm_admin:gerir_integracoes`) MUST gerar um novo segredo/chave, **invalidar** o anterior,
  revelar o novo **uma única vez**, e auditar a rotação **sem** valores.
- **FR-027**: `PATCH /crm/admin/integracoes/{id}` MUST permitir alterar
  `nome`/`alvo`/`config`/`ativo` **sem** tocar o segredo; enviar `segredo` no `PATCH`
  substitui o segredo (cifrado) e conta como rotação para fins de auditoria.
- **FR-028**: `rotacionar`/`PATCH` de segredo numa integração que não comporta segredo
  (`CONEXAO_INTERNA` sem segredo) MUST responder 409/422.
- **FR-029**: `GET /crm/admin/integracoes` e `/{id}` MUST exigir `crm_admin:ver`; a lista é
  paginada com filtros `tipo`, `alvo`, `ativo`.
- **FR-030**: Nada nesta spec MUST fazer chamada HTTP externa, _OAuth dance_ ou validar o
  segredo contra o serviço alvo — é só cadastro/curadoria.

#### Auditoria administrativa

- **FR-031**: Toda escrita bem-sucedida em `equipe`, `equipe_membro`, `janela_atendimento`,
  `feriado` e `integracao` MUST gravar **um** registro em **`crm_admin_audit`** na forma
  canônica `RegistroAuditoria` do `core` (spec 002): autor (sujeito do JWT ou identificador
  da credencial de serviço), instante `timestamptz` UTC, tipo e id da entidade, ação, e
  **_delta_ real** (`calcularDelta`). `origem = AJUSTE_MANUAL`.
- **FR-032**: Uma requisição sem mudança efetiva (`calcularDelta → null`) MUST NOT gravar
  registro (no-op).
- **FR-033**: O _delta_ de uma criação/rotação/troca de segredo MUST registrar apenas que o
  segredo **passou a existir / foi rotacionado** (marcador, ou prefixo de hash), **nunca** o
  valor — em claro ou cifrado.
- **FR-034**: `crm_admin_audit` MUST ser **somente-acréscimo**: sem endpoint nem serviço de
  `UPDATE`/`DELETE`.
- **FR-035**: A leitura consolidada do log (painel de auditoria global) **não** é desta spec
  (é a 053); esta spec só **grava**. Um `GET` simples de `crm_admin_audit` filtrado por
  entidade PODE ser exposto sob `crm_admin:ver` para o painel local (opcional).

#### RBAC e catálogo (spec 004)

- **FR-036**: A spec MUST acrescentar ao catálogo (`src/auth/rbac/catalogo.ts`) o recurso
  **`crm_admin`** com: `crm_admin:ver`, `crm_admin:gerir_equipes`,
  `crm_admin:gerir_expediente`, `crm_admin:gerir_integracoes` — cada uma com rótulo legível
  em português. `assertCatalogoCoerente()` e o agrupamento por recurso MUST continuar
  passando.
- **FR-037**: O perfil de sistema `administrador` e a credencial de serviço MUST conceder as
  novas permissões **automaticamente** (special-case da 004 — sem migração de dados, sem
  novo _seed_).
- **FR-038**: Todos os endpoints `/crm/admin/…` MUST usar o `PermissionGuard` da 004 com a
  permissão adequada; nenhum MUST ser `@Public()` nem `@AutenticadoBasta()`. Leituras →
  `crm_admin:ver`; escritas → a permissão `gerir_*` do subdomínio.
- **FR-039**: 401 (sem token) e 403 (autenticado sem permissão) MUST permanecer distintos,
  com o corpo genérico da 004 no 403.

#### Persistência e _boot_

- **FR-040**: `equipe`, `equipe_membro`, `janela_atendimento`, `feriado`, `integracao` e
  `crm_admin_audit` MUST persistir em **PostgreSQL** via **migração Prisma** — a **5ª
  migração de negócio** do projeto. Toda tabela segue os Padrões Transversais: PK `id` UUID
  v7 gerada na aplicação, `criado_em`/`atualizado_em` `timestamptz` UTC.
- **FR-041**: A migração MUST aplicar limpo no _harness_ de teste (schema isolado por
  execução) e MUST NOT exigir _seed_ de dados de negócio (não há equipe/integração de
  sistema).
- **FR-042**: O `crm` MUST passar a expor seu módulo NestJS real (`CrmModule`) com os
  _controllers_/serviços desta spec, **sem** aumentar `CONTEXT_MODULES` (segue **11** — o
  `crm` já estava na lista da spec 001) e **sem** violar a regra ESLint de fronteira entre
  contextos (o `crm` consome `core` e a API pública do `auth`; a FK de `usuario` é via
  Prisma, no schema compartilhado, como a 004 já faz para as tabelas de RBAC).
- **FR-043**: A cifra do segredo de integração MUST usar uma chave de
  config/`.env` (nova variável, validada por zod no `env.schema`, obrigatória em todo
  `NODE_ENV` — a CI/_harness_ fornecem fixture). Ausência da chave MUST abortar o _boot_
  (sem default silencioso).
- **FR-044**: O _boot_ MUST logar, uma vez, que o contexto `crm` está ativo e o vocabulário
  `crm_admin:*` registrado — sem dados sensíveis.

#### Painel — CRM · Administração

- **FR-045**: O painel MUST exibir **CRM · Administração** só para sujeitos com
  `crm_admin:ver` (mecanismo `usePermissoesEfetivas` da 004); a rota fica sob
  `RequirePermissao`.
- **FR-046**: O painel MUST ter três abas — **Equipes**, **Expediente**, **Integrações** —
  consumindo só os endpoints `/crm/admin/…` (zero dado _hardcoded_).
- **FR-047**: Os controles de escrita de cada aba MUST aparecer só com a permissão
  `gerir_*` correspondente; sem ela, a aba é somente-leitura.
- **FR-048**: A aba Integrações MUST mostrar apenas a **máscara** do segredo; o valor pleno
  aparece **uma vez** (criação/rotação) num aviso destacado que **não** persiste ao
  recarregar a página.
- **FR-049**: A aba Expediente MUST ter um indicador "está no expediente agora?" que chama
  `GET /crm/admin/expediente` e reflete janelas/feriados recém-editados na próxima consulta.
- **FR-050**: Uma resposta **403** em qualquer chamada do painel MUST ser tratada no ponto
  único do `apiFetch` (banner "sem permissão"), **sem** deslogar (403 ≠ 401 — 004).

### Key Entities *(inclui só o que envolve dados)*

- **equipe**: time/squad do comercial ou atendimento. UUID v7, `nome`, `descricao?`, `tipo`
  (`COMERCIAL` | `ATENDIMENTO` | `CS`), `ativo`. Dono: contexto `crm`.
- **equipe_membro**: vínculo usuário↔equipe. `equipe_id`, `usuario_id` (FK `usuario` da
  004), `papel` (`LIDER` | `MEMBRO`), `entrou_em`, `saiu_em?`. Sem dois vínculos ativos do
  mesmo par.
- **janela_atendimento**: faixa horária de expediente. `equipe_id?` (null = global),
  `dia_semana` (0–6), `hora_inicio`, `hora_fim` (local America/Sao_Paulo), `ativo`.
  `hora_fim > hora_inicio`.
- **feriado**: data sem expediente. `equipe_id?` (null = global), `data`, `descricao`,
  `recorrente_anual`. Recorrente casa por (mês, dia).
- **integracao**: registro de uma conexão externa/interna. `nome`, `tipo` (`API_KEY` |
  `WEBHOOK` | `CONEXAO_INTERNA`), `alvo` (`FINANCEIRO` | `MARKETING` | `CENTRAL` |
  `EXTERNO`), `config` jsonb (sem segredo), `ativo`, `ultimo_uso_em?`. Segredo cifrado em
  repouso ou só-hash (API key), **nunca** retornado em leitura.
- **crm_admin_audit**: registro de auditoria administrativa na forma canônica do `core`.
  Autor, instante, entidade, ação, _delta_ real, `origem = AJUSTE_MANUAL`.
  Somente-acréscimo. Nunca contém segredo.
- **Resultado de expediente** (não é tabela): `{ emExpediente: boolean, instante, equipeId? }`
  devolvido por `estaEmExpediente` / `GET /crm/admin/expediente`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `estaEmExpediente` produz o **mesmo** veredito para a mesma entrada em
  **100%** das execuções e sob **`TZ` UTC / America/Sao_Paulo / Asia/Tokyo** — verificável
  por _property test_ + matriz de fuso na CI.
- **SC-002**: Em **100%** dos casos em que a `data` local é um feriado aplicável, o retorno
  é `false`, **mesmo** com a hora dentro de uma janela — verificável enumerando feriado fixo
  e recorrente, global e por equipe.
- **SC-003**: Com **zero** janelas aplicáveis, `estaEmExpediente` retorna `false` em
  **100%** dos instantes testados (nunca "aberto por omissão").
- **SC-004**: **0** ocorrências do segredo/chave de qualquer integração em respostas de
  `GET` (lista e detalhe), em registros de `crm_admin_audit`, e em logs — verificável por
  teste que cria/rotaciona e faz `grep` do valor nas três superfícies.
- **SC-005**: O valor pleno de uma `API_KEY` interna aparece em **exatamente uma** resposta
  (a de criação ou a de rotação) e **em nenhuma** leitura posterior — verificável por
  sequência criar → `GET` → rotacionar → `GET`.
- **SC-006**: Toda escrita administrativa bem-sucedida gera **exatamente um**
  `crm_admin_audit` com autor e instante; todo `PATCH` _no-op_ gera **zero** — verificável
  por contagem antes/depois em cada endpoint de escrita.
- **SC-007**: **0** endpoints `/crm/admin/…` acessíveis sem token (401) ou sem a permissão
  exigida (403), em **100%** dos casos — verificável nos três eixos (sem token / token sem
  permissão / token com permissão).
- **SC-008**: As partes puras (`estaEmExpediente`, cálculo de _delta_, geração/hash de
  chave, mascaramento) rodam **sem banco**; só os testes de _endpoint_ tocam Postgres real —
  disciplina de teste da constituição.
- **SC-009**: A suíte e2e das specs 003–006 continua **verde sem alteração** e `/health`
  continua afirmando **11** contextos.
- **SC-010**: Um usuário pode ser membro de **N ≥ 2** equipes ao mesmo tempo, e a tentativa
  de criar um **2º vínculo ativo** na **mesma** equipe falha com 409 em **100%** dos casos.
- **SC-011**: O catálogo de RBAC passa a ter `crm_admin:{ver,gerir_equipes,gerir_expediente,
  gerir_integracoes}`, `assertCatalogoCoerente()` passa, e o `administrador` + credencial de
  serviço as concedem **sem** nova migração de dados — verificável por teste do catálogo e
  por `GET /auth/permissoes-efetivas`.
- **SC-012**: O painel monta as 3 abas consumindo só os endpoints `/crm/admin/…` (zero dado
  _hardcoded_); um 403 numa chamada **nunca** desloga a sessão — verificável por teste de
  componente.
- **SC-013**: **0** dependências novas (backend e frontend) e **exatamente 1** migração
  Prisma — verificável por _diff_ de `package.json` e da pasta `prisma/migrations`.

## Assumptions

- **Escopo de `equipe`**: só modelagem + CRUD + membros. **Nenhuma** lógica de atribuição
  (round robin, carga, disponibilidade) nem grade de turno por atendente — isso é 010
  (Pipeline) e 012 (Chat); `equipe_membro` **não** ganha grade horária nesta spec (CL-03).
- **Fuso fixo America/Sao_Paulo** para todo o expediente; não há expediente por fuso nem
  multi-região na v1. Usa biblioteca de fuso (não _offset_ `-03:00` _hard-coded_) para
  sobreviver a uma eventual volta do horário de verão.
- **Janela não cruza a meia-noite** na v1 (CL-02): `hora_fim > hora_inicio` é validado.
  Turnos noturnos (22:00–02:00) são cadastrados como duas janelas.
- **Resolução de escopo por equipe = união** (CL-01): global + equipe. Uma equipe **adiciona**
  janelas/feriados, nunca **substitui** os globais.
- **Feriado recorrente 29/02** não casa em anos sem 29/02 e não desloca para 28/02 (CL-04).
- **Sem nenhuma janela = fora do expediente** (`false`), deliberadamente, para o Chat (012)
  não interpretar ausência de config como "sempre aberto".
- **Cifra de segredo**: simétrica, chave única de `.env` (nova variável obrigatória validada
  por zod). Rotação de **chave de cifra** (re-encriptar segredos existentes) é operação de
  _ops_, fora do escopo. API key interna é **só-hash** (irreversível), não cifra reversível.
- **`ultimo_uso_em`** não é atualizado por nada nesta spec — reservado para 011/019–022/033
  marcarem uso real.
- **`config` jsonb** é _free-form_ por `tipo` (ex.: `WEBHOOK` guarda a URL de destino;
  `CONEXAO_INTERNA` guarda o nome do contexto). Schema por tipo **não** é validado nesta
  spec além de "não contém segredo".
- **Auditoria**: reusa `montarRegistroAuditoria`/`calcularDelta` do core (spec 002),
  `origem = AJUSTE_MANUAL`, mesma convenção da 004/005/006. O painel de auditoria **global**
  é a spec 053; aqui só grava (+ `GET` local opcional).
- **`CONTEXT_MODULES` segue 11** — o `crm` já estava na lista da spec 001 como módulo vazio;
  esta spec só o preenche. As e2e de `/health` continuam afirmando 11.
- **Portas**: nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` (spec
  001), configuráveis por `.env`.
- **`auth`/RBAC da 004** já provê guard, `usePermissoesEfetivas`, tratamento central de 403,
  catálogo extensível e `PermissionGuard` — esta spec só adiciona o recurso `crm_admin`.
- **Tabela `usuario` da 004** é a fonte de usuários; esta spec **não** cria nem edita
  usuários (isso é 004), só referencia por FK.

## Dependencies

- **Spec 001 (bootstrap)**: módulo `crm` vazio a preencher; convenções de entidade (PK UUID
  v7 na app, `timestamptz`); _harness_ e2e contra Postgres real; regra ESLint de fronteira
  entre contextos; shell/navegação do frontend.
- **Spec 002 (core value objects)**: `EntidadeId`/`uuidv7()` para as PKs; `parseInstante`/
  `agoraUtc()` e a disciplina livre-de-locale para `estaEmExpediente` e o
  `GET /crm/admin/expediente`; `RegistroAuditoria` + `montarRegistroAuditoria` +
  `calcularDelta` (`origem = AJUSTE_MANUAL`) para `crm_admin_audit`; contrato de config
  tipado por zod para a chave de cifra.
- **Spec 003 (auth-servico-jwt)**: `JwtAuthGuard` global; identificador da credencial de
  serviço como autor de auditoria; `apiFetch` central do painel.
- **Spec 004 (rbac)**: catálogo extensível (`src/auth/rbac/catalogo.ts`) +
  `assertCatalogoCoerente()`; `PermissionGuard` + `@RequerPermissao`; tabela `usuario`
  (FK); special-case `administrador`/credencial de serviço; `usePermissoesEfetivas` +
  `RequirePermissao` + tratamento central de 403 no frontend.
- **Consome desta spec**: **010 (crm-pipeline)** e **012 (crm-chat-ao-vivo)** usam `equipe`/
  `equipe_membro` para atribuição e `estaEmExpediente` para "fora do expediente";
  **011 (crm-whatsapp)** usa `integracao` para o provedor/token e `estaEmExpediente` para
  resposta automática; **014 (crm-workflow)** usa `estaEmExpediente` como condição de
  horário; **019–022 (adapters)** e **033 (marketing-slack)** consomem `integracao` para
  tokens/webhooks; **053** consolida `crm_admin_audit` no painel de auditoria global.

## Out of Scope

- **Atribuição automática** de leads/chamados a equipes ou membros (round robin, carga,
  disponibilidade) — specs 010/012. Aqui só o cadastro de equipes/membros.
- **Qualquer chamada externa**: _OAuth dance_, validação de token contra o serviço alvo,
  troca de credenciais, _webhook_ de recebimento — 011/019–022.
- **Uso real do expediente** para silenciar/agendar mensagens — 012/014. Aqui só a função e
  o endpoint de consulta.
- **Perfis, permissões, usuários e o guard de RBAC** — tudo da spec 004; aqui só o **recurso
  novo** no catálogo.
- **Painel de auditoria global** e alertas operacionais — spec 053.
- **Rotação da chave de cifra** / re-encriptação em massa de segredos — operação de _ops_.
- **Escala/turno de atendentes** (quem trabalha em qual horário) como recurso próprio — a
  visão 9.4 cita "Escala do SAC" na Administração do CRM, mas o detalhamento (grade de
  turnos por pessoa) fica para uma spec de CRM posterior; aqui o expediente é da
  **equipe/global**, não por pessoa.
- **`lead`, `interacao`, `pipeline`, `oportunidade`, `tarefa`** e qualquer outra entidade de
  CRM — specs 008+.
