# Feature Specification: Lead do CRM — entidade compartilhada, campos personalizados, scoring e conversão em pessoa

**Feature Branch**: `008-crm-lead`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "008 — crm-lead: entidade `lead` compartilhada entre CRM e Marketing (uma única tabela `lead`, acesso resolvido por RBAC 004, não por fronteira arquitetural — visão Parte 8.2.1). Campos: contato (nome, e-mail, telefone, documento opcional), origem/fonte (UTM), estágio de funil pré-compra, status (ativo/descartado/convertido), responsável (FK usuario 004 opcional), tags. Campos personalizados das alunas (custom fields). Lead scoring automático derivado por regras puras e determinísticas (nunca contador incremental — regra 8.2.2), recalculável. Transição Lead → `pessoa` na 1ª venda reusa `resolverOuCriar` / engine de identidade da spec 005; decidir no clarify se o registro de `lead` é arquivado+linkado ou migra fisicamente. Lead pode nascer de evento de campanha vindo de Marketing (via projeção de `evento_origem` da 006) — adapters de Marketing são specs 035+, aqui só a porta/serviço in-process + endpoints CRUD. RBAC 004 já tem `lead:{criar,editar,ver_todos,ver_proprios}` congelado desde a 004 — esta spec os consome. Endpoints REST `/crm/leads/**`. Frontend `frontend/src/leads/`. Bounded context `crm` (já não-vazio desde a 007; `CONTEXT_MODULES` segue 11). Divisão domain/ · application/ · infra/. 6ª migração Prisma. Auditoria em `crm_lead_audit` na forma canônica do core. Portas: reusar 3001 / 5174 / 55432 — nenhuma nova."

## Clarifications

### Session 2026-09-04

- Q: **CL-01** — Depois que um lead é convertido em `pessoa` (1ª venda ou promoção
  manual), o que acontece com a linha de `lead`? → A: **Arquivar + vincular.** A linha de
  `lead` permanece: `status = CONVERTIDO` + `pessoa_id` preenchido. Some das listas
  operacionais (filtro padrão exclui `CONVERTIDO`) mas continua existindo para histórico e
  atribuição de Marketing (035/036). **Nenhum dado do lead é apagado nem migrado
  fisicamente.** A `pessoa` recebe os contatos via engine da 005; o `lead` só ganha o
  ponteiro. Conversão idempotente.
- Q: **CL-02** — O `crm` não pode importar `src/clientes/**` (fronteira ESLint do Princípio
  VI). Como consome a engine de identidade/dedup da spec 005 (`resolverOuCriar`)? → A:
  **Porta no `core`.** Uma **interface + token DI** (`PortaIdentidade` /
  `PORTA_IDENTIDADE`) é declarada no `core`; a spec 005 (`clientes`) passa a **implementá-la
  e registrá-la** (adaptador que delega a `ResolverOuCriarService`); o `crm` injeta a
  **interface do `core`**, nunca o serviço concreto. Inversão de dependência: ambos os
  contextos dependem só do `core`. A conversão continua **síncrona e transacional**.
- Q: **CL-03** — Modelo dos campos personalizados das alunas na v1? → A: **Esquema
  administrável.** Uma tabela de **definições** de campo (`chave`, `rotulo`, `tipo` ∈
  `TEXTO|NUMERO|BOOLEANO|DATA|SELECAO`, `opcoes?` para `SELECAO`, `obrigatorio`, `ativo`)
  gerida por uma permissão nova de administração do CRM; os **valores por lead** são
  validados contra a definição (chave desconhecida → 422, tipo incompatível → 422). `PUT`
  de valores substitui o conjunto (chave ausente/`null` remove).

### Decisões já tomadas nesta spec (padrões razoáveis, sem pergunta)

- **Lead duplicado por e-mail/telefone**: `POST` **cria** assim mesmo e devolve
  `leadsSemelhantes: [<ids>]` como aviso; a dedup real é na conversão (FR-009).
- **Fila não atribuída**: leads sem responsável são visíveis só com `lead:ver_todos`;
  `lead:ver_proprios` nunca os vê (FR-012).
- **`PUT` de campos personalizados**: substituição total do conjunto; chave ausente ou
  `null` remove (FR-037).
- **Estágios do funil**: enum fixo no código (`NOVO` … `DESQUALIFICADO`); etapas
  configuráveis são a spec 010.
- **Regras de scoring**: pesos fixos no código, versionados por PR; sem UI de configuração
  na v1.

## Visão geral

Segunda fatia da **Fase 1 (CRM)** e a primeira entidade **compartilhada** do projeto: o
**`lead`**. Diferente do padrão dos demais contextos (cada um dono das suas entidades), o
Lead vive numa **única tabela** consumida por CRM **e** Marketing; quem pode criar, editar
e ver Lead é decidido por **permissão de acesso (RBAC 004)**, não por fronteira
arquitetural (visão Parte 8.2.1). A tabela mora no _bounded context_ **`crm`** (que deixou
de ser vazio na spec 007; `CONTEXT_MODULES` segue **11**), mas o `crm` **não** é "dono
exclusivo" no sentido do Princípio VI — a spec 035 (coleta de leads de Marketing) e a 010
(pipeline) vão ler e escrever a mesma tabela por meio da API/porta desta spec.

O que entra:

- **Entidade `lead`** — dados de contato (`nome`, `email?`, `telefone?`, `documento?`),
  **origem/fonte** em campos UTM (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
  `utm_content`) + um rótulo livre de origem (`origem`, ex.: `formulario_lp`,
  `importacao_csv`, `manual`), **estágio** de funil pré-compra (enum configurável-por-código
  `NOVO` | `CONTATO_FEITO` | `QUALIFICADO` | `NUTRICAO` | `DESQUALIFICADO`), **status**
  (`ATIVO` | `DESCARTADO` | `CONVERTIDO`), **responsável** (FK opcional para `usuario` da
  004), e **tags** (lista de strings normalizadas).
- **Campos personalizados das alunas** — dados que o time coleta e que não cabem num campo
  fixo. Modelados com **esquema administrável** (CL-03): uma tabela de **definições**
  (`chave`, `rotulo`, `tipo`, `opcoes?`, `obrigatorio`, `ativo`) gerida sob a permissão
  nova `crm_admin:gerir_campos_lead`, e uma tabela de **valores por lead**
  (`lead_id`, `definicao_id`, `valor`) validada contra a definição.
- **Lead scoring automático** — um `score` inteiro **derivado** por uma função **pura e
  determinística** sobre os atributos do lead + os eventos conhecidos dele (interações,
  origem, completude de dados). Nunca é um contador incremental persistido que soma deltas
  (regra 8.2.2 da visão): é `f(estado) -> score`, **recalculável** a qualquer momento com o
  mesmo resultado. O valor materializado na linha é só _cache_ de leitura, reconstruível.
  O **conjunto de regras** de scoring é fixo no código nesta v1 (uma tabela de pesos
  versionada por PR); regras configuráveis em runtime ficam para uma spec de CRM posterior.
- **Conversão Lead → `pessoa`** — quando o lead compra pela 1ª vez (ou quando o time decide
  promovê-lo manualmente), ele vira uma `pessoa` pela **mesma engine de identidade/dedup da
  spec 005** (`ResolverOuCriarService.resolverOuCriar`). Como o `crm` **não pode importar**
  `clientes` (fronteira ESLint do Princípio VI), o consumo é por **inversão de dependência**
  (CL-02): o `core` declara a interface `PortaIdentidade` + o token DI `PORTA_IDENTIDADE`;
  a spec 005 (`clientes`) registra um adaptador que a implementa delegando a
  `ResolverOuCriarService`; o `crm` injeta **a interface do `core`**. A conversão é
  **síncrona e transacional**. Depois dela, a **linha de `lead` é arquivada e vinculada**
  (CL-01): `status = CONVERTIDO` + `pessoa_id`, some das listas operacionais mas permanece
  para histórico e atribuição de Marketing — **nada é apagado nem migrado fisicamente**.
- **Nascimento de lead a partir de Marketing** — a visão 8.7 diz "leads podem nascer de
  eventos de campanha vindos de Marketing". Os adapters de Marketing (Meta/Google Ads,
  Mautic, landing pages) são as specs 035+. Nesta spec entra apenas a **porta in-process**
  `RegistrarLeadService` (idempotente por chave de origem) que a 035 vai injetar, mais os
  endpoints REST de CRUD manual. Nada de webhook, OAuth ou chamada externa aqui.
- **RBAC** — o catálogo (`src/auth/rbac/catalogo.ts`) **já tem** `lead:criar`,
  `lead:editar`, `lead:ver_todos` e `lead:ver_proprios` congelados desde a spec 004. Esta
  spec **consome** essas quatro: `lead:ver_proprios` mostra só os leads cujo
  `responsavel_id` é o sujeito autenticado; `lead:ver_todos` mostra todos;
  `lead:criar`/`lead:editar` liberam a escrita. A conversão em pessoa também exige
  `pessoa:editar` (permissão da 005). **Adiciona uma** permissão ao recurso `crm_admin` da
  spec 007: **`crm_admin:gerir_campos_lead`** (gerir as definições de campos personalizados)
  — mesmo padrão de extensão de catálogo das specs 005–007, concedida de graça ao
  `administrador` e à credencial de serviço.
- **Auditoria** — toda escrita bem-sucedida em `lead` (criação, edição, mudança de estágio/
  status/responsável, atribuição de tag, conversão) grava **um** registro em
  **`crm_lead_audit`** na forma canônica do `core` (`montarRegistroAuditoria`,
  `origem = AJUSTE_MANUAL`), **somente-acréscimo**, com **só o _delta_ real** (no-op → 0
  linha).
- **Endpoints** `/crm/leads/**` — CRUD, busca/filtro, recálculo de score, conversão,
  leitura/escrita de campos personalizados — todos atrás do `PermissionGuard` da 004.
- **Frontend** `frontend/src/leads/` — item de navegação **CRM · Leads** atrás de
  `lead:ver_todos` **ou** `lead:ver_proprios`, rota sob `RequirePermissao`; lista com
  filtros (estágio / status / origem / responsável) + busca; detalhe com dados, score,
  campos personalizados, timeline básica e a ação **Converter em pessoa**.

O sucesso é medido por: o `score` é **determinístico e recalculável** (mesma entrada →
mesmo valor, sem deriva sob reprocessamento); `lead:ver_proprios` **nunca** enxerga lead de
outro responsável; a conversão reusa a engine da 005 **sem** o `crm` importar `clientes`;
toda escrita é auditada com _delta_ real; e nenhuma porta nova de rede é aberta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar e trabalhar um lead pré-compra (Priority: P1)

Um membro do comercial (com `lead:criar` e `lead:editar`) cadastra um lead que chegou por
um formulário de landing page: nome, e-mail, telefone, os UTMs da campanha e o rótulo de
origem. Depois move o lead pelos estágios do funil (`NOVO` → `CONTATO_FEITO` →
`QUALIFICADO`), atribui um responsável, adiciona tags (`webinar-out`, `interesse-PCS`) e
registra uma nota. Cada mudança fica auditada.

**Why this priority**: é o núcleo da spec e o MVP. Sem o CRUD do lead e o modelo de
estágio/status/responsável/tags/UTM, nada mais nesta fatia tem em que se apoiar. É o que a
010 (pipeline) e a 035 (coleta de Marketing) vão consumir.

**Independent Test**: criar um lead via `POST /crm/leads` com contato + UTMs; `PATCH` para
mudar estágio e responsável; `POST` de tag; `GET` do detalhe mostrando todos os campos e a
timeline de auditoria; conferir que cada escrita gerou **1** `crm_lead_audit` com _delta_
real e que um `PATCH` sem mudança gera **0**.

**Acceptance Scenarios**:

1. **Given** `lead:criar`, **When** `POST /crm/leads` com `{ nome, email, telefone,
   utm_source, utm_campaign, origem: "formulario_lp" }`, **Then** o lead é criado com
   `estagio = NOVO`, `status = ATIVO`, `score` calculado, e **1** registro de auditoria com
   _delta_ = campos criados.
2. **Given** um lead `NOVO`, **When** `PATCH /crm/leads/{id}` com `{ estagio:
   "QUALIFICADO", responsavelId: <usuarioId> }`, **Then** os dois campos mudam, o `score` é
   recalculado, e há **1** registro com _delta_ `{ estagio: [...], responsavel_id: [...] }`.
3. **Given** um lead, **When** `PATCH` com um corpo idêntico ao estado atual, **Then**
   **nenhum** registro de auditoria é gravado (no-op).
4. **Given** um lead, **When** `POST /crm/leads/{id}/tags` com `{ tag: "  Webinar-Out " }`,
   **Then** a tag é normalizada (`webinar-out`), adicionada sem duplicar, e auditada.
5. **Given** `responsavelId` inexistente na tabela `usuario` da 004, **When** enviado num
   `POST`/`PATCH`, **Then** 404/422 e nada muda.
6. **Given** um e-mail já usado por outro lead **ativo**, **When** `POST /crm/leads` com o
   mesmo e-mail, **Then** o lead duplicado é **criado** (Marketing gera muitos leads pelo
   mesmo canal; leads são baratos), a resposta inclui um aviso `leadsSemelhantes: [<ids>]`,
   e a deduplicação real acontece na **conversão** para `pessoa` (US4).

---

### User Story 2 - Ver só os leads certos conforme a permissão (Priority: P1)

Uma pessoa com `lead:ver_proprios` (mas **sem** `lead:ver_todos`) abre a lista de leads e vê
**apenas** os leads em que ela é a responsável. Uma pessoa com `lead:ver_todos` vê todos.
Quem não tem nenhuma das duas não vê o item de navegação e recebe "sem permissão" ao
navegar direto. A regra vale igual no `GET` da lista, no `GET` do detalhe, na busca e nos
filtros — não dá para "escapar" por um filtro ou por acesso direto ao id.

**Why this priority**: P1 junto da US1 — é a regra que torna o Lead uma entidade
**compartilhada por permissão** (Parte 8.2.1) em vez de um vazamento de dados. O comercial
inteiro compartilha a tabela; o escopo de visão é o que protege carteira de cada um.

**Independent Test**: criar leads com responsáveis diferentes; chamar `GET /crm/leads` com
um token que só tem `lead:ver_proprios` → só os do próprio sujeito; com `lead:ver_todos` →
todos; pedir `GET /crm/leads/{id}` de um lead de outro responsável com só `ver_proprios` →
404/403; conferir que um filtro `responsavelId=<outro>` com só `ver_proprios` não revela
nada.

**Acceptance Scenarios**:

1. **Given** sujeito `U` com `lead:ver_proprios` e leads `L1` (responsável `U`) e `L2`
   (responsável `V`), **When** `GET /crm/leads`, **Then** a resposta contém `L1` e **não**
   `L2`.
2. **Given** o mesmo sujeito, **When** `GET /crm/leads/{L2.id}`, **Then** 404 (ou 403) —
   nunca o corpo de `L2`.
3. **Given** sujeito com `lead:ver_todos`, **When** `GET /crm/leads`, **Then** vê `L1` e
   `L2`.
4. **Given** sujeito com `lead:ver_proprios` que passa `?responsavelId=<V>`, **When**
   `GET /crm/leads`, **Then** a lista volta **vazia** (o filtro não amplia o escopo).
5. **Given** sujeito **sem** `lead:ver_todos` e **sem** `lead:ver_proprios`, **When**
   autenticado, **Then** todos os `GET /crm/leads*` respondem 403; **e** o item **CRM ·
   Leads** não aparece na navegação.
6. **Given** um lead **sem** responsável e um sujeito com só `lead:ver_proprios`, **When**
   `GET /crm/leads`, **Then** o lead **não** aparece — quem só tem `ver_proprios` vê
   apenas a própria carteira; a "fila não atribuída" (`responsavel_id = null`) é visível
   só para quem tem `lead:ver_todos`.

---

### User Story 3 - Score automático, determinístico e recalculável (Priority: P2)

O sistema mantém um `score` para cada lead que reflete o quão "quente" ele é, calculado por
uma **função pura** sobre atributos (completude de contato, origem, estágio, idade do lead)
e eventos conhecidos (nº e recência de interações, tags). O time vê o score na lista e no
detalhe e pode disparar um **recálculo** explícito. Rodar o recálculo N vezes seguidas sem
mudar nada dá **sempre o mesmo número**. Reprocessar um lote inteiro não faz o score
"inflar".

**Why this priority**: P2 — a visão (8.7) pede "lead scoring automático"; é o primeiro
lugar do CRM onde a regra 8.2.2 ("toda métrica é derivada, nunca contador incremental")
aparece na prática. Não bloqueia US1/US2, mas é um diferencial de valor e um teste de
disciplina arquitetural.

**Independent Test**: montar um lead de fixture com um conjunto de atributos/eventos e
verificar o score esperado **sem banco**; alterar um atributo → score muda de forma
previsível; chamar o recálculo 5×seguidas → mesmo valor; comparar o score materializado na
linha com o recalculado do zero → idênticos.

**Acceptance Scenarios**:

1. **Given** dois leads com exatamente os mesmos atributos e eventos, **When** o score de
   cada um é calculado, **Then** os dois valores são **iguais**.
2. **Given** um lead com score `S`, **When** `POST /crm/leads/{id}/recalcular-score` é
   chamado 5 vezes sem nenhuma outra mudança, **Then** o score permanece `S` nas 5.
3. **Given** um lead sem e-mail nem telefone, **When** um contato é preenchido, **Then** o
   score **aumenta** (completude de dados pesa positivo) e a mudança é auditada como
   recálculo derivado, não como edição manual do score.
4. **Given** o endpoint de recálculo em lote (`POST /crm/leads/recalcular-score`), **When**
   rodado duas vezes seguidas sobre a mesma base, **Then** nenhum score muda na 2ª execução
   (idempotente).
5. **Given** qualquer requisição, **When** ela tenta **setar** o `score` diretamente por
   `PATCH`, **Then** o campo é **ignorado** (read-only; derivado) — 422 ou silenciosamente
   descartado com aviso.
6. **Given** a função de score, **When** roda sob `TZ=UTC` e `TZ=America/Sao_Paulo` (a
   "idade do lead" e a "recência de interação" usam tempo), **Then** o resultado é
   **idêntico** (livre de locale — usa `agoraUtc()` / `parseInstante` do core).

---

### User Story 4 - Converter o lead em pessoa reusando a engine de identidade (Priority: P2)

Quando o lead compra (a 010/018 vão observar a transação paga) ou quando o time decide
promovê-lo, alguém com `lead:editar` **e** `pessoa:editar` aciona **Converter em pessoa**. O
sistema chama a **engine de identidade/dedup da spec 005** com os dados do lead: se já
existe uma `pessoa` que casa por documento/e-mail/telefone, o lead é **vinculado** a ela;
senão, uma `pessoa` nova é criada. O lead fica `status = CONVERTIDO` com `pessoa_id`
preenchido. A operação é **idempotente** — converter de novo o mesmo lead não cria uma
segunda pessoa nem duplica contatos.

**Why this priority**: P2 — carrega a decisão de arquitetura mais delicada da spec
(fronteira entre contextos + reuso da engine da 005, resolvida em CL-02 pela porta no
`core`). Entrega valor real (o lead "graduou"), mas depende de US1 existir primeiro.

**Independent Test**: criar uma `pessoa` com e-mail `x`; criar um lead com o mesmo e-mail
`x`; converter → o lead aponta para a **pessoa existente**, nenhuma pessoa nova; criar um
lead com e-mail novo `y` e converter → **pessoa nova** criada; converter o mesmo lead 2× →
2ª vez é no-op (mesmo `pessoa_id`, sem novo contato); conferir 1 `crm_lead_audit` de
conversão.

**Acceptance Scenarios**:

1. **Given** um lead `ATIVO` com e-mail que casa uma `pessoa` existente e um sujeito com
   `lead:editar` + `pessoa:editar`, **When** `POST /crm/leads/{id}/converter`, **Then** o
   lead recebe o `pessoa_id` da pessoa existente, `status = CONVERTIDO`, e **não** há pessoa
   nova.
2. **Given** um lead `ATIVO` cujos dados não casam nenhuma `pessoa`, **When** convertido,
   **Then** uma `pessoa` nova é criada pela engine da 005 (com os contatos do lead) e o lead
   aponta para ela.
3. **Given** um lead já `CONVERTIDO`, **When** `POST /crm/leads/{id}/converter` de novo,
   **Then** a resposta é idempotente — mesmo `pessoa_id`, nenhuma escrita nova em
   `pessoa`/contatos, e **nenhum** novo registro de auditoria (no-op).
4. **Given** um sujeito com `lead:editar` mas **sem** `pessoa:editar`, **When** tenta
   converter, **Then** 403 e o lead permanece `ATIVO`.
5. **Given** a conversão bem-sucedida, **When** ela commita, **Then** há **1**
   `crm_lead_audit` com ação `converter` e _delta_ `{ status: [ATIVO, CONVERTIDO],
   pessoa_id: [null, <id>] }`.
6. **Given** o `crm` como bounded context, **When** o projeto passa o ESLint, **Then**
   **nenhum** import de `src/clientes/**` aparece em `src/crm/**` — a engine chega pela
   interface `PortaIdentidade` do `core` (CL-02).
7. **Given** um lead `DESCARTADO`, **When** tenta converter, **Then** 409 (só lead `ATIVO`
   converte).

---

### User Story 5 - Campos personalizados por lead (Priority: P3)

O time guarda no lead informações que não têm campo fixo — "nicho de atuação", "tamanho da
lista de e-mails", "já é aluna de concorrente?". Cada lead carrega um conjunto de pares
chave→valor. A lista e o detalhe mostram esses campos; a busca pode filtrar por eles.

**Why this priority**: P3 — a visão (8.7) cita "campos personalizados das alunas", mas o CRM
funciona sem eles no MVP. Fica atrás do CRUD, do escopo de visão e do scoring.

**Independent Test**: criar um lead; `PUT /crm/leads/{id}/campos-personalizados` com
`{ nicho: "esportiva", lista_email: "5k-10k" }`; `GET` do detalhe mostra os dois; atualizar
um valor e remover uma chave; conferir auditoria do _delta_ dos campos personalizados.

**Acceptance Scenarios**:

1. **Given** um lead, **When** `PUT /crm/leads/{id}/campos-personalizados` com um objeto de
   pares chave→valor, **Then** os campos são persistidos e devolvidos no `GET` do detalhe.
2. **Given** campos personalizados existentes, **When** um `PUT` omite uma chave antes
   presente, **Then** o `PUT` **substitui o conjunto inteiro** — a chave omitida é
   removida (semântica REST de `PUT`); um valor `null` numa chave enviada também remove.
3. **Given** um valor de campo personalizado alterado, **When** commitado, **Then** há **1**
   `crm_lead_audit` com o _delta_ da chave (`{ campos.nicho: ["esportiva", "clinica"] }`).
4. **Given** o esquema administrável (CL-03), **When** um `PUT` envia uma chave **não**
   definida (ou inativa) no esquema, **Then** 422; **When** envia um valor de tipo
   incompatível com a definição (ex.: texto para `tipo = NUMERO`), **Then** 422.
5. **Given** a busca `GET /crm/leads?campo:nicho=esportiva`, **When** chamada, **Then**
   retorna só os leads com aquele par (respeitando também o escopo de visão da US2).

---

### User Story 6 - Painel CRM · Leads (Priority: P3)

Quem tem `lead:ver_todos` ou `lead:ver_proprios` enxerga **CRM · Leads** na navegação e abre
uma lista com filtros (estágio, status, origem, responsável) e busca por nome/e-mail/
telefone. Clicar num lead abre o detalhe: dados de contato, UTMs, score, tags, campos
personalizados, timeline de auditoria e o botão **Converter em pessoa** (visível só com
`lead:editar` + `pessoa:editar`). Os controles de escrita (criar, editar, mudar estágio,
tag, converter) aparecem só com a permissão correspondente.

**Why this priority**: P3 — o backend já entrega o valor; a tela torna o Lead usável pelo
time sem `curl`, mas 010/035 consomem a API, não a UI.

**Independent Test**: logar só com `lead:ver_proprios` → ver a lista filtrada, sem botão
"Novo lead"; logar com `lead:ver_todos` + `lead:criar` + `lead:editar` → criar e editar pelo
painel; logar sem nenhuma permissão de lead → item some, rota direta → "sem permissão";
provocar um 403 → banner, sessão intacta.

**Acceptance Scenarios**:

1. **Given** `lead:ver_proprios`, **When** o usuário abre **CRM · Leads**, **Then** vê só os
   próprios leads, com os filtros e a busca funcionando sobre esse subconjunto.
2. **Given** `lead:ver_todos` sem `lead:criar`/`lead:editar`, **When** abre o painel,
   **Then** vê tudo em modo leitura — sem "Novo lead", sem editar, sem converter.
3. **Given** `lead:editar` + `pessoa:editar`, **When** abre o detalhe de um lead `ATIVO`,
   **Then** o botão **Converter em pessoa** aparece; após converter, o detalhe mostra o
   vínculo com a pessoa e o `status = CONVERTIDO`.
4. **Given** um sujeito sem permissão de lead, **When** logado, **Then** **CRM · Leads**
   não aparece; navegar direto → "sem permissão" (403 no ponto único do `apiFetch`, sem
   deslogar).
5. **Given** qualquer resposta **403** numa chamada do painel, **When** recebida, **Then**
   banner "sem permissão" e o token **não** é limpo (403 ≠ 401 — spec 004).

---

### Edge Cases

- **Lead sem nenhum contato** (`nome` só): **rejeitado** — a spec exige **pelo menos um**
  entre `email` e `telefone` (um lead sem canal de contato não é acionável). `nome` é
  sempre obrigatório.
- **E-mail/telefone/documento malformado**: normalizados e validados pelas mesmas funções
  de borda da spec 005 (`normalizar`, DV de CPF/CNPJ); lixo → 422, nunca 500.
- **Conversão de um lead cujo e-mail casa uma `pessoa` já pseudonimizada** (LGPD, spec
  047): a engine da 005 segue `merged_para`/estado da pessoa; o lead aponta para a pessoa
  resolvida, sem "ressuscitar" dado apagado.
- **Dois leads distintos convertidos para a mesma `pessoa`** (ambos casam o mesmo e-mail):
  os dois ganham o mesmo `pessoa_id`; nenhum contato é duplicado (idempotência da 005).
  Um merge de leads não é escopo desta spec.
- **Responsável (usuário da 004) que sai da empresa**: a 004 não expõe `DELETE` de usuário;
  a FK usa `onDelete: Restrict`. Reatribuição de carteira é operação manual (`PATCH` em
  massa fora de escopo aqui).
- **`lead:ver_proprios` + o próprio sujeito é uma credencial de serviço** (sem `usuario`):
  a credencial de serviço tem o catálogo inteiro (special-case da 004), então cai em
  `ver_todos` na prática — `ver_proprios` sozinho nunca se aplica a ela.
- **Score de um lead recém-criado sem eventos**: valor base determinístico (não `null`,
  não `0` por acidente) — a função sempre devolve um inteiro.
- **Estágio `DESQUALIFICADO` vs `status = DESCARTADO`**: são eixos separados —
  `DESQUALIFICADO` é posição no funil (pode voltar), `DESCARTADO` é o lead fora de jogo.
  Converter exige `status = ATIVO` independentemente do estágio.
- **Recálculo de score em lote com a base grande**: paginado/em lotes, cada lote em
  transação própria, idempotente e retomável — não trava a tabela inteira.
- **Tag com caracteres especiais / vazia / só espaços**: normalizada (`trim`, `lowercase`,
  colapsa espaço interno em `-`); tag vazia após normalizar → 422.
- **`GET` de lista sem nada no banco**: lista vazia paginada, nunca erro.
- **Campos personalizados com valor `null`**: remove a chave (equivale a apagar).

## Requirements *(mandatory)*

### Functional Requirements

#### Entidade e CRUD do lead

- **FR-001**: O sistema MUST modelar **`lead`** com: PK UUID v7 gerada na aplicação;
  `nome` (obrigatório); `email`, `telefone`, `documento` (todos opcionais, normalizados
  pelas funções de borda da spec 005); `origem` (rótulo string livre); `utm_source`,
  `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` (todos opcionais); `estagio`
  (enum `NOVO` | `CONTATO_FEITO` | `QUALIFICADO` | `NUTRICAO` | `DESQUALIFICADO`, default
  `NOVO`); `status` (enum `ATIVO` | `DESCARTADO` | `CONVERTIDO`, default `ATIVO`);
  `responsavel_id` (FK nullable para `usuario` da 004, `onDelete: Restrict`); `tags`
  (coleção de strings normalizadas); `score` (inteiro, **derivado**, materializado como
  _cache_); `pessoa_id` (FK nullable — preenchida na conversão); `criado_em`/
  `atualizado_em` (`timestamptz` UTC).
- **FR-002**: O sistema MUST exigir **pelo menos um** canal de contato (`email` **ou**
  `telefone`) na criação de um lead. `nome` MUST ser obrigatório.
- **FR-003**: O sistema MUST expor, sob `lead:criar`: `POST /crm/leads`
  (contato + UTMs + origem + estágio/status/responsável/tags opcionais).
- **FR-004**: O sistema MUST expor, sob `lead:editar`: `PATCH /crm/leads/{id}` (qualquer
  campo editável exceto `score` e `pessoa_id`); `POST`/`DELETE /crm/leads/{id}/tags`
  (adicionar/remover tag normalizada); `PATCH` de `estagio`, `status` e `responsavel_id`.
- **FR-005**: `PATCH` MUST NOT permitir setar `score` nem `pessoa_id` diretamente (campos
  derivados/de sistema) — enviá-los é 422 ou descarte silencioso com aviso.
- **FR-006**: `POST`/`PATCH` com `responsavelId` inexistente na tabela `usuario` MUST
  responder 404/422 sem efeito.
- **FR-007**: O sistema MUST normalizar tags (`trim`, `lowercase`, espaço interno →
  `-`), **sem duplicar** dentro do mesmo lead; tag vazia após normalizar MUST ser 422.
- **FR-008**: O sistema MUST **NÃO** expor `DELETE /crm/leads/{id}` físico na v1 — um lead
  sai de jogo por `status = DESCARTADO`. (Pseudonimização por LGPD segue a spec 047 via a
  `pessoa` vinculada.)
- **FR-009**: Um `POST /crm/leads` com e-mail/telefone já usado por outro lead `ATIVO`
  MUST **criar** o lead assim mesmo e devolver, no corpo, `leadsSemelhantes: [<ids>]` como
  aviso não-bloqueante. A deduplicação real ocorre na conversão para `pessoa` (FR-023).

#### Escopo de visão por permissão (RBAC 004)

- **FR-010**: O sistema MUST resolver o escopo de leitura por permissão efetiva do sujeito
  (mecanismo da 004): `lead:ver_todos` → todos os leads; `lead:ver_proprios` (sem
  `ver_todos`) → **apenas** os leads com `responsavel_id` = id do sujeito; nenhuma das duas
  → 403 em todo `GET /crm/leads*`.
- **FR-011**: O escopo de `lead:ver_proprios` MUST ser aplicado no repositório/query, não
  só na serialização — `GET /crm/leads/{id}` de um lead fora do escopo responde 404/403, e
  filtros (`?responsavelId=`, busca, `campo:*`) **não** ampliam o conjunto visível.
- **FR-012**: Leads **sem responsável** (`responsavel_id = null`) MUST ser invisíveis para
  quem só tem `lead:ver_proprios`; a "fila não atribuída" é visível apenas com
  `lead:ver_todos`.
- **FR-013**: A credencial de serviço (catálogo inteiro pela 004) MUST cair em `ver_todos`;
  `ver_proprios` isolado nunca se aplica a ela.
- **FR-014**: Escrita (`lead:criar`/`lead:editar`) MUST ser independente do escopo de
  visão — mas um sujeito com só `lead:ver_proprios` MUST NOT poder `PATCH` um lead que não
  enxerga (404/403).

#### Lead scoring (derivado, determinístico)

- **FR-015**: O sistema MUST calcular o `score` de um lead por uma **função pura e
  determinística** `calcularScore(estadoDoLead) -> inteiro`, testável **sem banco**, sobre:
  completude de contato, `origem`/UTM, `estagio`, idade do lead, e nº/recência de eventos
  conhecidos (interações/tags). Mesma entrada → mesmo inteiro, em 100% das execuções.
- **FR-016**: O `score` MUST ser **recalculável** a qualquer momento a partir do estado —
  `f(estado)`, **nunca** `score += delta`. O valor na linha é _cache_ de leitura,
  reconstruível idêntico.
- **FR-017**: O sistema MUST recalcular o `score` automaticamente após qualquer escrita que
  mude um insumo do score (estágio, contato, tag, evento associado).
- **FR-018**: O sistema MUST expor `POST /crm/leads/{id}/recalcular-score` (sob
  `lead:editar`) e `POST /crm/leads/recalcular-score` (lote, sob `lead:editar`), ambos
  **idempotentes** — rodar N vezes seguidas sem outra mudança não altera nenhum score.
- **FR-019**: O recálculo em lote MUST ser paginado, cada lote em transação própria,
  retomável e sem travar a tabela inteira.
- **FR-020**: A função de score MUST ser **livre de locale** (usa `agoraUtc()` /
  `parseInstante` do core; matriz de `TZ` na CI como na spec 002).
- **FR-021**: O conjunto de **regras/pesos** de score MUST ser fixo no código nesta v1
  (uma tabela versionada por PR). Regras configuráveis em runtime são de spec posterior.
- **FR-022**: Uma alteração de `score` por recálculo MUST ser distinguível na auditoria de
  uma edição manual (não há edição manual de score) — a auditoria registra a origem
  `recálculo derivado`.

#### Conversão Lead → pessoa (engine da spec 005)

- **FR-023**: O sistema MUST oferecer `POST /crm/leads/{id}/converter` que promove um lead
  `ATIVO` a `pessoa` usando a **engine de identidade/dedup da spec 005**
  (`resolverOuCriar`): dados do lead → resolve uma `pessoa` existente (documento → e-mail
  → telefone) **ou** cria uma nova.
- **FR-024**: A conversão MUST exigir `lead:editar` **e** `pessoa:editar`; faltando a
  segunda → 403 e o lead permanece `ATIVO`.
- **FR-025**: A conversão MUST ser **idempotente** — converter um lead já `CONVERTIDO`
  devolve o mesmo `pessoa_id`, sem criar segunda pessoa, sem duplicar contatos, sem novo
  registro de auditoria (no-op).
- **FR-026**: Só lead com `status = ATIVO` MUST poder ser convertido; `DESCARTADO` →
  409. O estágio do funil **não** restringe a conversão.
- **FR-027**: Após a conversão, o lead MUST ficar `status = CONVERTIDO` com `pessoa_id`
  preenchido (CL-01: **arquivar + vincular**). A linha de `lead` MUST permanecer no banco,
  MUST sair do filtro padrão das listas operacionais (que exclui `CONVERTIDO`), e MUST NOT
  ter seus dados apagados nem migrados para outra tabela. Continua consultável por id e por
  filtro explícito `status=CONVERTIDO` para histórico e atribuição de Marketing.
- **FR-028**: O `crm` MUST consumir a engine da 005 **sem importar `src/clientes/**`**
  (fronteira ESLint do Princípio VI), por **inversão de dependência** (CL-02): o `core`
  MUST declarar uma interface `PortaIdentidade` (contrato de `resolverOuCriar`) e um token
  DI `PORTA_IDENTIDADE`; a spec 005 (`clientes`) MUST registrar um adaptador que a
  implementa delegando a `ResolverOuCriarService`; o `crm` MUST injetar **a interface do
  `core`**, nunca o serviço concreto. A conversão MUST ser síncrona e transacional.
- **FR-029**: A conversão bem-sucedida MUST gravar **1** `crm_lead_audit` com ação
  `converter` e o _delta_ `{ status, pessoa_id }`.
- **FR-030**: Enquanto os adapters de Marketing (035+) não existem, a "conversão
  automática na 1ª venda" MUST ser apenas o **gancho documentado** — a 010/018 (que
  observam transação paga) chamarão `converter`. Esta spec entrega o endpoint e a porta,
  não o observador de transação.

#### Nascimento de lead por integração (porta in-process)

- **FR-031**: O sistema MUST exportar uma **porta in-process** `RegistrarLeadService`
  (método idempotente por uma chave de origem, ex.: `(origem, id_externo)`) para a spec 035
  injetar. Reentrada com a mesma chave MUST devolver o lead existente, sem duplicar.
- **FR-032**: Nesta spec **nenhum** endpoint `/webhooks/*`, chamada HTTP externa, OAuth ou
  polling MUST ser adicionado — só a porta e o CRUD REST manual.
- **FR-033**: A porta MUST aceitar os mesmos campos do `POST` manual + a chave de origem, e
  MUST auditar a criação como `origem = AJUSTE_MANUAL` com autor = identificador da
  integração/credencial de serviço.

#### Campos personalizados (esquema administrável — CL-03)

- **FR-034**: O sistema MUST modelar **`campo_personalizado_lead`** (definição): PK UUID
  v7, `chave` (slug único, imutável após criar), `rotulo` (pt-BR), `tipo`
  (`TEXTO` | `NUMERO` | `BOOLEANO` | `DATA` | `SELECAO`), `opcoes` (lista de strings —
  obrigatória e não-vazia sse `tipo = SELECAO`, proibida caso contrário), `obrigatorio`
  (booleano), `ativo` (booleano, default `true`), `criado_em`/`atualizado_em`.
- **FR-035**: O sistema MUST modelar **`valor_campo_lead`**: `lead_id`, `definicao_id` (FK
  para `campo_personalizado_lead`), `valor` (serializado conforme o `tipo` da definição),
  com `@@unique(lead_id, definicao_id)`. O valor MUST ser validado contra a definição:
  chave/`definicao` inexistente ou inativa → 422; valor incompatível com o `tipo` (ou fora
  de `opcoes` para `SELECAO`) → 422.
- **FR-036**: O sistema MUST expor, sob a **permissão nova `crm_admin:gerir_campos_lead`**:
  `GET/POST/PATCH/DELETE /crm/admin/campos-lead` (CRUD das definições). `DELETE` de uma
  definição em uso MUST ser recusado (409) ou apenas desativar (`ativo = false`) —
  desativar é o caminho padrão; `chave` nunca muda.
- **FR-037**: O sistema MUST expor `GET` e `PUT /crm/leads/{id}/campos-personalizados`
  (sob `lead:ver_*` e `lead:editar` respectivamente). O `PUT` tem semântica de
  **substituição total**: o corpo é o conjunto final de pares `chave→valor`; chave ausente
  é removida; valor `null` numa chave enviada também remove. Uma definição `obrigatorio`
  ausente no `PUT` MUST ser 422.
- **FR-038**: A busca MUST aceitar filtro por par de campo personalizado
  (`?campo:<chave>=<valor>`), respeitando o escopo de visão da US2. Mudanças em **valores**
  de campo personalizado MUST ser auditadas em `crm_lead_audit` (delta por chave); mudanças
  em **definições** MUST ser auditadas em `crm_admin_audit` (tabela da spec 007) — mesma
  forma canônica do core.

#### Auditoria

- **FR-039**: Toda escrita bem-sucedida em `lead` (criação, `PATCH`, tag, estágio, status,
  responsável, campos personalizados, recálculo de score que muda o valor, conversão) MUST
  gravar **um** registro em **`crm_lead_audit`** na forma canônica `RegistroAuditoria` do
  core (`montarRegistroAuditoria`, `origem = AJUSTE_MANUAL`): autor (sujeito do JWT ou
  identificador da credencial de serviço), instante `timestamptz` UTC, tipo e id da
  entidade, ação, e **_delta_ real** (`calcularDelta`).
- **FR-040**: Uma requisição sem mudança efetiva (`calcularDelta → null`) MUST NOT gravar
  registro (no-op).
- **FR-041**: `crm_lead_audit` MUST ser **somente-acréscimo** — sem endpoint nem serviço de
  `UPDATE`/`DELETE`. Um `GET` local filtrado por lead PODE ser exposto sob a permissão de
  leitura de lead; o painel de auditoria global é a spec 053.
- **FR-042**: Nenhum registro MUST conter dado sensível além do necessário para o _delta_
  (os campos do lead não são segredo; não há token aqui).

#### RBAC e catálogo (spec 004)

- **FR-043**: A spec MUST consumir as permissões `lead:criar`, `lead:editar`,
  `lead:ver_todos`, `lead:ver_proprios` **já existentes** no catálogo desde a 004 (sem
  renomear nem remover) e MUST **acrescentar exatamente uma**:
  **`crm_admin:gerir_campos_lead`** (recurso `crm_admin` da spec 007), com rótulo pt-BR.
  `assertCatalogoCoerente()` MUST continuar passando; o `administrador` e a credencial de
  serviço a concedem de graça (special-case da 004, **sem** migração de dados nem seed).
- **FR-044**: Todos os endpoints `/crm/leads/**` MUST usar o `PermissionGuard` da 004 com a
  permissão adequada; nenhum MUST ser `@Public()` nem `@AutenticadoBasta()`.
- **FR-045**: 401 (sem token) e 403 (autenticado sem permissão) MUST permanecer distintos,
  com o corpo genérico da 004 no 403.
- **FR-046**: O perfil de sistema `administrador` e a credencial de serviço MUST conceder
  as permissões de lead **automaticamente** (special-case já existente na 004).

#### Persistência e boot

- **FR-047**: `lead`, `crm_lead_audit`, `campo_personalizado_lead` (definições) e
  `valor_campo_lead` (valores) MUST persistir em **PostgreSQL** via **migração Prisma** — a
  **6ª migração de negócio** do projeto. Toda tabela segue os Padrões Transversais: PK `id`
  UUID v7 na aplicação, `criado_em`/`atualizado_em` `timestamptz` UTC.
- **FR-048**: A migração MUST aplicar limpo no _harness_ de teste (schema isolado por
  execução) e MUST NOT exigir _seed_ de dados de negócio.
- **FR-049**: O `crm` MUST continuar expondo um único `CrmModule` (agora com os
  _controllers_/serviços de lead **além** dos de administração da 007), **sem** aumentar
  `CONTEXT_MODULES` (segue **11**) e **sem** violar a regra ESLint de fronteira entre
  contextos.
- **FR-050**: O _boot_ MUST logar, uma vez, que o `crm` registrou o vocabulário de lead —
  sem dados sensíveis.
- **FR-051**: Nenhuma **porta de rede nova** MUST ser aberta — backend `3001`, frontend
  `5174`, Postgres dev `55432` (spec 001), todos configuráveis por `.env`.

#### Painel — CRM · Leads

- **FR-052**: O painel MUST exibir **CRM · Leads** só para sujeitos com `lead:ver_todos`
  **ou** `lead:ver_proprios` (`usePermissoesEfetivas` da 004); a rota fica sob
  `RequirePermissao`.
- **FR-053**: A lista MUST ter filtros por estágio, status, origem e responsável, e busca
  por nome/e-mail/telefone; o conjunto exibido MUST respeitar o escopo de visão do sujeito.
- **FR-054**: O detalhe MUST mostrar contato, UTMs, `score`, tags, campos personalizados,
  timeline de auditoria e — só com `lead:editar` + `pessoa:editar` e lead `ATIVO` — o botão
  **Converter em pessoa**.
- **FR-055**: Os controles de escrita (Novo lead, editar, mudar estágio, tag, converter)
  MUST aparecer só com a permissão correspondente; sem ela, a tela é somente-leitura.
- **FR-056**: Uma resposta **403** em qualquer chamada do painel MUST ser tratada no ponto
  único do `apiFetch` (banner "sem permissão"), **sem** deslogar (403 ≠ 401 — spec 004).

### Key Entities *(inclui só o que envolve dados)*

- **lead**: pessoa em estágio pré-compra, **compartilhada** por CRM e Marketing (acesso por
  RBAC). UUID v7; `nome`, `email?`, `telefone?`, `documento?`; `origem` + `utm_*`;
  `estagio` (funil), `status` (`ATIVO`|`DESCARTADO`|`CONVERTIDO`); `responsavel_id?` (FK
  `usuario` da 004); `tags[]`; `score` (derivado, cache); `pessoa_id?` (FK — preenchida na
  conversão). Tabela mora no `crm`; escrita por CRUD REST + porta `RegistrarLeadService`.
- **crm_lead_audit**: registro de auditoria de escrita de lead, forma canônica do core.
  Autor, instante, entidade, ação, _delta_ real, `origem = AJUSTE_MANUAL`.
  Somente-acréscimo.
- **campo_personalizado_lead** (definição): `chave` (slug único imutável), `rotulo`,
  `tipo` (`TEXTO`|`NUMERO`|`BOOLEANO`|`DATA`|`SELECAO`), `opcoes?` (só `SELECAO`),
  `obrigatorio`, `ativo`. Gerida sob `crm_admin:gerir_campos_lead`.
- **valor_campo_lead**: `(lead_id, definicao_id, valor)` com `@@unique(lead_id,
  definicao_id)`; `valor` validado contra o `tipo` da definição.
- **Resultado de conversão** (não é tabela): `{ leadId, pessoaId, criouPessoa: boolean,
  status: "CONVERTIDO" }` devolvido por `POST /crm/leads/{id}/converter`.
- **Estado de score** (não é tabela): a entrada da função pura `calcularScore` — atributos
  do lead + eventos materializados por quem chama.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `calcularScore` produz o **mesmo** inteiro para a mesma entrada em **100%**
  das execuções e sob **`TZ` UTC / America/Sao_Paulo / Asia/Tokyo** — verificável por
  _property test_ + matriz de fuso na CI.
- **SC-002**: Rodar `recalcular-score` (individual ou lote) **N ≥ 5** vezes seguidas sem
  outra mudança altera **zero** scores após a 1ª execução — idempotência verificável por
  contagem de _diffs_.
- **SC-003**: Um sujeito com só `lead:ver_proprios` recebe, em **100%** das leituras (lista,
  detalhe, busca, filtros), **apenas** leads em que é responsável — **0** vazamentos,
  verificável nos três eixos (lista / detalhe por id / filtro `responsavelId` de terceiro).
- **SC-004**: A conversão Lead → pessoa reusa a engine da 005 e é **idempotente**: converter
  o mesmo lead 2× cria **exatamente uma** `pessoa` e **zero** contatos duplicados —
  verificável por sequência converter → converter → contagem.
- **SC-005**: **0** imports de `src/clientes/**` em `src/crm/**` — verificável por ESLint
  (`import/no-restricted-paths`) verde e por `grep`.
- **SC-006**: Toda escrita de lead bem-sucedida gera **exatamente um** `crm_lead_audit` com
  autor e instante; todo `PATCH`/`PUT` _no-op_ gera **zero** — verificável por contagem
  antes/depois em cada endpoint de escrita.
- **SC-007**: **0** endpoints `/crm/leads/**` acessíveis sem token (401) ou sem a permissão
  exigida (403), em **100%** dos casos — verificável nos três eixos.
- **SC-008**: As partes puras (`calcularScore`, normalização, cálculo de _delta_, plano de
  conversão) rodam **sem banco**; só os testes de _endpoint_ tocam Postgres real —
  disciplina de teste da constituição.
- **SC-009**: A suíte e2e das specs 003–007 continua **verde sem alteração** e `/health`
  continua afirmando **11** contextos.
- **SC-010**: O `score` **nunca** é setável por `PATCH`; toda tentativa é rejeitada (422) ou
  descartada — verificável por teste que envia `score` e confere o valor derivado.
- **SC-011**: O catálogo de RBAC ganha **exatamente uma** permissão
  (`crm_admin:gerir_campos_lead`); as 4 permissões `lead:*` seguem **inalteradas**,
  `assertCatalogoCoerente()` passa, e o `administrador`/credencial de serviço a concedem
  sem nova migração — verificável por _diff_ de `catalogo.ts` (só +1 entrada) e por
  `GET /auth/permissoes-efetivas`.
- **SC-012**: **0** dependências novas (backend e frontend) e **exatamente 1** migração
  Prisma nova — verificável por _diff_ de `package.json` e da pasta `prisma/migrations`.
- **SC-013**: O painel monta a lista e o detalhe consumindo só os endpoints `/crm/leads/**`
  (zero dado _hardcoded_); um 403 numa chamada **nunca** desloga a sessão — verificável por
  teste de componente.

## Assumptions

- **Estágios do funil** são um enum **fixo no código** nesta v1 (`NOVO` | `CONTATO_FEITO` |
  `QUALIFICADO` | `NUTRICAO` | `DESQUALIFICADO`). Pipelines com etapas configuráveis são a
  spec 010 — o `lead.estagio` aqui é o funil pré-pipeline, não uma etapa de `pipeline`.
- **Scoring**: regras/pesos **fixos no código**, versionados por PR. Sem UI de configuração
  de regra na v1. O `score` materializado é _cache_; a fonte é a função pura.
- **Contato mínimo**: um lead precisa de `nome` + (`email` **ou** `telefone`). Documento é
  opcional e, quando enviado, validado pelo DV de CPF/CNPJ da spec 005.
- **Normalização** de e-mail/telefone/documento/tags reusa as funções de borda da spec 005
  (`normalizar`) — sem heurística de provedor, telefone E.164, documento só dígitos.
- **Engine de identidade** = `ResolverOuCriarService.resolverOuCriar` da spec 005, sem
  reimplementação. Consumida pelo `crm` via a interface `PortaIdentidade` + token
  `PORTA_IDENTIDADE` declarados no `core` (CL-02); a spec 005 ganha um adaptador que a
  registra. Nenhum import de `clientes` no `crm`.
- **Campos personalizados** = esquema administrável (CL-03): definições em
  `campo_personalizado_lead` sob `crm_admin:gerir_campos_lead`, valores em
  `valor_campo_lead` validados por tipo. `PUT` de valores substitui o conjunto.
- **Conversão automática na 1ª venda**: só o **gancho** nesta spec. O observador de
  transação paga que dispara `converter` é da 010/018.
- **Marketing**: a porta `RegistrarLeadService` existe para a spec 035 injetar; os
  adapters, UTMs vindos de webhook e a atribuição são specs 035–036.
- **`conta` (household)**: fora de escopo — lead vira `pessoa`, não `conta`. Vínculo de
  `conta` é decisão em aberto do projeto (afeta 005/010/044), não desta spec.
- **Auditoria**: reusa `montarRegistroAuditoria`/`calcularDelta` do core, mesma convenção
  da 004/005/006/007. Painel global de auditoria = spec 053.
- **`CONTEXT_MODULES` segue 11** — o `crm` já existe (007); esta spec só adiciona entidade.
- **Portas**: nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` (spec
  001), configuráveis por `.env`.
- **`auth`/RBAC da 004** já provê guard, `usePermissoesEfetivas`, tratamento central de
  403, e o catálogo com as 4 permissões de lead — esta spec as usa e acrescenta só
  `crm_admin:gerir_campos_lead`.
- **Tabela `usuario` da 004** é a fonte de responsáveis; esta spec **não** cria nem edita
  usuários, só referencia por FK.

## Dependencies

- **Spec 001 (bootstrap)**: módulo `crm` (já preenchido pela 007); convenções de entidade;
  _harness_ e2e contra Postgres real; regra ESLint de fronteira entre contextos; shell/
  navegação do frontend.
- **Spec 002 (core)**: `EntidadeId`/`uuidv7()` para PKs; `agoraUtc()`/`parseInstante` e a
  disciplina livre-de-locale para o scoring; `RegistroAuditoria` +
  `montarRegistroAuditoria` + `calcularDelta` para `crm_lead_audit`. **Esta spec adiciona
  ao `core`** a interface `PortaIdentidade` + o token DI `PORTA_IDENTIDADE` (contrato da
  engine de identidade — CL-02), sem lógica, só o contrato.
- **Spec 003 (auth)**: `JwtAuthGuard` global; identificador da credencial de serviço como
  autor de auditoria; `apiFetch` central do painel.
- **Spec 004 (rbac)**: `PermissionGuard` + `@RequerPermissao`; as 4 permissões `lead:*`
  já no catálogo; tabela `usuario` (FK `responsavel_id`); special-case `administrador`/
  credencial de serviço; `usePermissoesEfetivas` + `RequirePermissao` + tratamento central
  de 403 no frontend.
- **Spec 005 (pessoa-identidade-dedup)**: `ResolverOuCriarService.resolverOuCriar` (engine
  de identidade/dedup) para a conversão — **esta spec faz a 005 registrar o adaptador de
  `PortaIdentidade`**; funções de borda `normalizar` + DV de documento; permissão
  `pessoa:editar` exigida na conversão.
- **Spec 007 (crm-administracao)**: o `CrmModule` real e a divisão `domain/`/`application/`/
  `infra/` já estabelecidos; a tabela `crm_admin_audit` e o recurso `crm_admin` do catálogo
  (esta spec adiciona `crm_admin:gerir_campos_lead`); as telas de administração do CRM
  ganham a aba/subtela de definições de campos personalizados.
- **Consome desta spec**: **010 (crm-pipeline)** lê/escreve `lead` e dispara `converter` ao
  observar transação paga; **009 (crm-interacao-timeline)** liga `interacao` a `lead`;
  **035 (marketing-coleta-de-leads)** injeta `RegistrarLeadService` e preenche UTMs;
  **036 (marketing-atribuicao)** cruza lead/campanha; **053** consolida `crm_lead_audit`.

## Out of Scope

- **Pipelines / oportunidades / etapas configuráveis** — spec 010. Aqui só o funil
  pré-pipeline (`lead.estagio`).
- **Timeline de interações real** (`interacao`: WhatsApp, nota, ligação, ticket) — spec
  009. O detalhe do lead mostra a timeline de **auditoria**, não de interações.
- **Adapters de Marketing** (Meta/Google Ads, Mautic, landing pages), webhooks de captura,
  UTMs vindos de evento externo, atribuição — specs 035–036. Aqui só a porta in-process.
- **Regras de scoring configuráveis em runtime** e UI de edição de pesos — spec de CRM
  posterior.
- **Merge de dois leads** entre si — não modelado nesta spec (a dedup acontece na
  conversão para `pessoa`, via engine da 005).
- **Observador de transação paga** que converte o lead automaticamente — spec 010/018.
- **Reatribuição de carteira em massa** (trocar o responsável de N leads de uma vez) —
  operação futura; aqui só `PATCH` individual.
- **Pseudonimização / exclusão LGPD do lead** — spec 047, via a `pessoa` vinculada.
- **Painel de auditoria global** — spec 053; aqui só grava (+ `GET` local opcional).
- **Perfis, permissões e o guard de RBAC** — spec 004; esta spec só consome as 4
  permissões `lead:*`.
