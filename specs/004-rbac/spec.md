# Feature Specification: RBAC — perfis de acesso e permissões granulares

**Feature Branch**: `004-rbac`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "004-rbac — Perfis de acesso e permissões granulares (RBAC único do sistema, usado por CRM, Marketing e Central de Clientes). Sobre o auth de serviço JWT da spec 003. Modelo recurso+ação versionado no código; perfis que agrupam permissões (alguns de sistema, imutáveis); noção de 'usuário' portador de perfis sem autenticação humana individual ainda; guard por permissão que estende o JwtAuthGuard da 003; vocabulário de permissões de lead; log de auditoria de ações administrativas; endpoints mínimos de administração; frontend mínimo de administração de perfis. Não-objetivos: login de usuário humano, RBAC do portal da aluna, permissões criáveis em runtime, multi-tenant."

## Clarifications

### Session 2026-09-03

- Q: **CL-01** — O RBAC (perfis e atribuições de perfil a usuários) persiste em PostgreSQL nesta spec, ou fica só como _seed_ em configuração/código na v1? → A: **Persiste em PostgreSQL.** Perfis, atribuições `usuario`↔`perfil` e registros de auditoria vão para tabelas Postgres, com **migração Prisma idempotente + _seed_ dos perfis de sistema** executável em todo ambiente (inclusive `test`). É a primeira entidade com banco do projeto. Habilita o CRUD real de perfis (US3), a atribuição (US4) e a auditoria persistida. Sem porta nova.
- Q: **CL-02** — As permissões efetivas do sujeito são resolvidas a cada requisição (a partir dos perfis do sujeito) ou embarcadas como _claim_ no JWT emitido em `POST /auth/token`? → A: **Resolvidas a cada requisição.** O guard lê os perfis do sujeito e calcula a união de permissões por _request_ (memoizado no escopo da requisição). O JWT da 003 continua fino — só identifica o sujeito, **não** carrega perfis nem permissões. Uma mudança de perfil vale já na requisição seguinte; sem janela de _staleness_.
- Q: **CL-03** — Uma rota autenticada (não-`@Public`) **sem** declaração de permissão exigida é negada por padrão (403) ou liberada a qualquer chamador autenticado? → A: **Negada por padrão (403).** Toda rota autenticada precisa de `@RequerPermissao(...)` **ou** de um marcador explícito `@AutenticadoBasta()` (entra numa allowlist central "só exige JWT"), ambos revisáveis em _diff_. Coerente com o "fechado por padrão" da constituição e da 003. Retrofit trivial: hoje só existem `/health` e `/auth/token` (ambas `@Public`) — não há rota autenticada de negócio para anotar ainda.
- Q: Como uma linha de `usuario` passa a existir nesta spec (a spec introduz a entidade mas não a cria)? → A: **Cadastro mínimo:** `POST /admin/rbac/usuarios` (criar com nome + e-mail) e `GET /admin/rbac/usuarios` (listar), além dos `/{id}/perfis` já previstos. **Sem** editar, desativar ou apagar `usuario` nesta spec — fluxo de convite/gestão de ciclo de vida é de uma spec futura de acesso da equipe.
- Q: Onde a atribuição de perfis a usuários vive no painel? → A: **Duas abas em Administração:** **Perfis** (CRUD de perfil) e **Usuários** (lista/cria `usuario` por nome + e-mail e edita o conjunto de perfis de cada um por _multi-select_ do catálogo de perfis). Ambas atrás de `perfil:administrar`.

## Visão geral

Quarta spec da **Fase 0** do [ROADMAP.md](../../ROADMAP.md). A spec 003 fechou a API por
padrão atrás de **um** JWT de serviço e **um único nível de acesso**. Esta spec introduz a
camada que falta antes do CRM (Fase 1): **quem pode fazer o quê**. Entrega a matriz de
autorização **única** do sistema — a mesma que CRM, Marketing e Central de Clientes vão
consultar, sem nenhum contexto reinventar permissão (visão Parte 8.2.1, 8.11, 9.2.6, 10.7).

O que entra:

- **Catálogo de permissões granulares** no formato `recurso:ação` (ex.: `lead:criar`,
  `lead:ver_todos`, `perfil:administrar`, `campanha:publicar`). O catálogo é **definido no
  código** — fonte única, versionada em _diff_, **não editável em runtime**. Cada spec
  futura que adiciona um recurso adiciona suas permissões ao catálogo.
- **Perfis** (papéis) que **agrupam permissões**. Alguns são **perfis de sistema**
  imutáveis — no mínimo um `administrador` que carrega todas as permissões. Os demais são
  criados/editados pela própria equipe.
- **Sujeito de autorização.** Hoje o único principal é a credencial de serviço da 003.
  Esta spec introduz a entidade **`usuario`** (membro da equipe) como **portador de
  perfis**, para o CRM/Marketing/Central já terem onde pendurar permissão — **sem**
  implementar login de pessoa individual (isso é uma spec futura de acesso da equipe; o
  login da aluna é a spec 045). Enquanto não há login individual, a credencial de serviço
  resolve para um sujeito com o perfil `administrador`, e **nada da 003 quebra**.
- **Guard por permissão** que **estende** — não substitui — o `JwtAuthGuard` da 003. Um
  decorator (`@RequerPermissao('lead:criar')`) marca a permissão exigida de um _handler_;
  um guard adicional roda **depois** da autenticação e responde **403** quando o sujeito
  não tem a permissão. 401 (não autenticado) e 403 (autenticado, sem permissão) são
  distintos.
- **Vocabulário de permissão de `lead`** (`lead:criar`, `lead:editar`, `lead:ver_todos`,
  `lead:ver_proprios`) — a regra "quem cria/edita/vê Lead é RBAC, não fronteira
  arquitetural" (Parte 8.2.1) nasce aqui como **vocabulário e mecanismo**. A entidade
  `lead` em si é a spec 008.
- **Log de auditoria de ações administrativas.** Toda mudança de perfil (criar, renomear,
  adicionar/remover permissão, atribuir/remover perfil de usuário) grava um registro de
  auditoria na forma canônica `RegistroAuditoria` do `core` (spec 002) — quem, quando, o
  quê mudou, valor anterior e novo.
- **Endpoints de administração mínimos** (Princípio VIII — superfície de escrita mínima),
  todos atrás do guard exigindo uma permissão elevada (`perfil:administrar`): ler o
  catálogo de permissões, CRUD de perfis, criar/listar `usuario`, ler/definir os perfis de
  um usuário.
- **Frontend mínimo:** um item de navegação **Administração** com duas abas — **Perfis**
  (lista de perfis, permissões de cada um, criar/editar perfil marcando permissões num
  _checklist_ agrupado por recurso) e **Usuários** (listar/criar `usuario` por nome +
  e-mail e editar os perfis de cada um). Visível só para quem tem `perfil:administrar`.
  Sem editar/desativar/apagar `usuario`.

O `auth` continua sendo **infra transversal**, não um 12º _bounded context_
(`CONTEXT_MODULES` segue com 11). O RBAC vive junto do `auth` (`backend/src/auth/`),
estendendo o mesmo módulo.

O sucesso é medido por: qualquer spec de 007 em diante consegue proteger um _handler_ por
permissão com **uma linha** (o decorator) e confiar que a checagem, a resposta 403 e a
auditoria já existem; a matriz de permissão é **uma só** para os quatro módulos de produto;
e nenhuma ação administrativa de acesso acontece sem deixar rastro de "quem" e "quando".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um handler é protegido por permissão e o guard decide 403 vs. 200 (Priority: P1)

Uma pessoa desenvolvedora anota um _endpoint_ com a permissão que ele exige
(`@RequerPermissao('lead:ver_todos')`). Quando uma requisição autenticada chega, o guard
resolve as permissões efetivas do sujeito e: se a permissão exigida está entre elas, o
_handler_ roda; se não, a resposta é **403** com corpo genérico, sem vazar qual permissão
faltou de forma que ajude a enumerar o catálogo. Requisição **sem** token válido continua
sendo **401** (guard da 003, que roda antes).

**Why this priority**: é o mecanismo central da spec e o MVP. Sem ele, "permissão
granular" é só uma tabela sem efeito. Uma vez pronto, toda spec seguinte pluga permissões
nele.

**Independent Test**: criar uma rota-isca anotada com uma permissão; chamá-la com um
sujeito que a tem (→ 200), com um sujeito que não a tem (→ 403), e sem token (→ 401);
confirmar que os três casos são distinguíveis e que o 403 não detalha o catálogo.

**Acceptance Scenarios**:

1. **Given** um _handler_ anotado `@RequerPermissao('lead:ver_todos')` e um sujeito cujos
   perfis somam essa permissão, **When** a requisição autenticada chega, **Then** o
   _handler_ executa normalmente (200).
2. **Given** o mesmo _handler_ e um sujeito **sem** `lead:ver_todos` em nenhum perfil,
   **When** a requisição autenticada chega, **Then** a resposta é **403** com corpo
   genérico ("permissão insuficiente"), sem _stack_, sem nome de classe.
3. **Given** o mesmo _handler_, **When** a requisição chega **sem** `Authorization` válido,
   **Then** a resposta é **401** (autenticação primeiro) — nunca 403.
4. **Given** um _handler_ que exige **duas** permissões (`@RequerPermissao('a', 'b')`),
   **When** o sujeito tem só uma, **Then** a resposta é 403 (semântica **E** por padrão).
5. **Given** o guard de permissão, **When** ele roda, **Then** ele roda **depois** do
   `JwtAuthGuard` da 003 e usa o sujeito que aquele guard resolveu — não reimplementa
   verificação de token.
6. **Given** um sujeito com o perfil de sistema `administrador`, **When** ele chama
   qualquer _handler_ protegido por qualquer permissão, **Then** passa (o `administrador`
   carrega o catálogo inteiro, inclusive permissões adicionadas por specs futuras).

---

### User Story 2 - O catálogo de permissões e os perfis de sistema existem e são enumeráveis (Priority: P1)

O catálogo de permissões é **declarado no código** como fonte única. Cada permissão tem um
identificador estável `recurso:ação`, um recurso ao qual pertence e um rótulo legível. Um
_endpoint_ de leitura devolve o catálogo agrupado por recurso, para o frontend montar o
_checklist_. Existe pelo menos um perfil de sistema, `administrador`, com **todas** as
permissões, marcado como imutável.

**Why this priority**: P1 junto da US1 — o guard não tem o que resolver sem um catálogo e
sem ao menos um perfil que garanta que alguém consiga administrar o sistema. Também é o que
impede o _lockout_ (sempre há o `administrador`).

**Independent Test**: ler o catálogo e conferir que toda permissão citada nas specs 004 e
008 está lá, com recurso e rótulo; ler os perfis e confirmar que `administrador` existe,
tem o catálogo inteiro e está marcado como imutável.

**Acceptance Scenarios**:

1. **Given** o catálogo de permissões no código, **When** ele é lido via
   `GET /admin/rbac/permissoes`, **Then** a resposta lista cada permissão com
   identificador `recurso:ação`, recurso e rótulo, agrupada por recurso, ordenada de forma
   estável.
2. **Given** o catálogo, **When** duas permissões têm o mesmo identificador, **Then** o
   _boot_ do processo **aborta** (identificador de permissão é único por construção).
3. **Given** os perfis de sistema, **When** eles são lidos, **Then** existe um
   `administrador` com todas as permissões do catálogo e uma marca `de_sistema: true`.
4. **Given** o perfil `administrador`, **When** uma spec futura adiciona uma permissão nova
   ao catálogo, **Then** o `administrador` passa a incluí-la sem intervenção manual.
5. **Given** o _endpoint_ do catálogo, **When** ele é chamado por um sujeito **sem**
   `perfil:administrar`, **Then** a resposta é 403.

---

### User Story 3 - A equipe cria e edita perfis, com auditoria de cada mudança (Priority: P2)

Alguém com `perfil:administrar` cria um perfil (ex.: "Comercial"), dá a ele um subconjunto
de permissões marcando itens num _checklist_ agrupado por recurso, e salva. Depois renomeia
o perfil e ajusta as permissões. Cada uma dessas ações grava um **registro de auditoria**
com quem fez, quando, o perfil afetado e o que mudou (permissões adicionadas/removidas,
nome anterior/novo). Perfis de sistema **não** podem ser editados nem apagados.

**Why this priority**: P2 — a matriz é útil no MVP só com o `administrador`, mas o valor
real (níveis diferentes para comercial, suporte, CS, marketing) vem daqui. A auditoria é
requisito explícito da Parte 8.11.

**Independent Test**: criar um perfil com um conjunto de permissões; editar nome e
permissões; tentar editar e apagar um perfil de sistema; para cada ação verificar o
registro de auditoria correspondente (quem, quando, diff); apagar um perfil comum não
atribuído.

**Acceptance Scenarios**:

1. **Given** `perfil:administrar`, **When** se cria um perfil com nome e uma lista de
   permissões **todas presentes no catálogo**, **Then** o perfil é criado e um registro de
   auditoria "perfil criado" é gravado com o autor, o instante e a lista de permissões.
2. **Given** um perfil comum existente, **When** se renomeia e se altera o conjunto de
   permissões, **Then** as mudanças persistem e o registro de auditoria contém nome
   anterior/novo e o _diff_ de permissões (adicionadas e removidas).
3. **Given** uma tentativa de incluir num perfil uma permissão **fora do catálogo**,
   **When** a requisição é processada, **Then** a resposta é 400 e nada é gravado.
4. **Given** um perfil de sistema (`administrador`), **When** se tenta editá-lo ou
   apagá-lo, **Then** a resposta é 409 (imutável) e nenhum registro de auditoria de
   mudança é gravado.
5. **Given** um perfil comum **ainda atribuído** a um ou mais usuários, **When** se tenta
   apagá-lo, **Then** a resposta é 409 com a informação de quantos usuários o usam — apagar
   exige antes remover as atribuições.
6. **Given** duas edições concorrentes do mesmo perfil, **When** a segunda chega sobre um
   estado já mudado, **Then** o resultado é determinístico e auditado (última escrita
   vence, com os dois registros de auditoria) — sem estado corrompido.

---

### User Story 4 - Perfis são atribuídos a usuários (Priority: P2)

O sistema passa a ter a entidade **`usuario`** (um membro da equipe — nome, e-mail,
identificador estável). Alguém com `perfil:administrar` lê os perfis de um usuário e define
o conjunto (um usuário pode ter **1 ou mais** perfis; suas permissões efetivas são a
**união** das permissões dos perfis). Atribuir e remover perfil são ações auditadas. Esta
spec **não** entrega login individual desses usuários — só o cadastro mínimo e o vínculo
com perfis, para as specs de produto consumirem.

**Why this priority**: P2 — prepara o terreno para CRM/Marketing/Central. Sem login
individual ainda, o efeito prático na v1 é indireto, mas a modelagem precisa existir agora
(o CRM depende dela desde a spec 007).

**Independent Test**: criar/registrar um usuário; atribuir dois perfis; ler suas permissões
efetivas e conferir que são a união; remover um perfil e reconferir; verificar o registro
de auditoria de cada atribuição/remoção.

**Acceptance Scenarios**:

1. **Given** um usuário e dois perfis comuns, **When** se define os dois perfis do usuário
   via `PUT /admin/rbac/usuarios/{id}/perfis`, **Then** os perfis passam a valer e um
   registro de auditoria por mudança de vínculo é gravado (autor, instante, perfil,
   ação).
2. **Given** um usuário com dois perfis que compartilham uma permissão, **When** suas
   permissões efetivas são calculadas, **Then** o resultado é a **união** sem duplicatas.
3. **Given** um usuário **sem** nenhum perfil, **When** ele chama um _handler_ protegido
   por permissão, **Then** a resposta é 403 (nenhum perfil ⇒ nenhuma permissão).
4. **Given** uma atribuição que referencia um perfil inexistente, **When** a requisição é
   processada, **Then** a resposta é 404 e nada muda.
5. **Given** a credencial de serviço da 003 (enquanto não há login individual), **When**
   ela é usada, **Then** o sujeito resolvido tem o perfil `administrador` — comportamento
   idêntico ao da 003 para todo _endpoint_ hoje existente.

---

### User Story 5 - Painel: Administração com abas Perfis e Usuários (Priority: P3)

Quem tem `perfil:administrar` vê no painel um item de navegação **Administração**, com duas
abas. A aba **Perfis** lista os perfis, mostra as permissões de cada um, e permite
criar/editar um perfil marcando permissões num _checklist_ **agrupado por recurso** (com
"marcar recurso inteiro"). Perfis de sistema aparecem como somente-leitura. A aba
**Usuários** lista e cria `usuario`s (nome + e-mail) e edita o conjunto de perfis de cada
um por _multi-select_ do catálogo de perfis. Quem **não** tem a permissão não vê o item de
navegação e, se acessar a rota direto, vê uma tela de "sem permissão" — distinta da tela de
Login (que é ausência de sessão).

**Why this priority**: P3 — o backend já entrega o valor (a matriz e o guard). A tela é o
que torna a administração autoatendível pela equipe em vez de exigir `curl`.

**Independent Test**: logar com um sujeito com `perfil:administrar` e exercitar, nas abas
Perfis e Usuários, listar/criar/editar/atribuir; logar (ou simular) com um sujeito sem a
permissão e confirmar que o item **Administração** some da navegação e a rota direta mostra
"sem permissão", não a tela de Login nem uma tela branca.

**Acceptance Scenarios**:

1. **Given** um sujeito com `perfil:administrar`, **When** ele abre o painel, **Then** vê
   **Administração** na navegação, com as abas **Perfis** e **Usuários**, e a aba Perfis
   carrega a lista de perfis.
2. **Given** a tela de edição de perfil, **When** o _checklist_ de permissões é exibido,
   **Then** ele está agrupado por recurso, com rótulos legíveis e a opção de marcar o
   recurso inteiro de uma vez.
3. **Given** um perfil de sistema aberto na tela, **When** ele é exibido, **Then** os
   controles de edição estão desabilitados e há indicação de "perfil de sistema".
4. **Given** a aba **Usuários**, **When** o administrador cria um `usuario` (nome + e-mail) e
   seleciona perfis num _multi-select_, **Then** o `usuario` aparece na lista com os perfis
   atribuídos e a mudança de vínculo é auditada.
5. **Given** um sujeito **sem** `perfil:administrar`, **When** ele está logado, **Then** o
   item **Administração** não aparece na navegação.
6. **Given** o mesmo sujeito, **When** ele navega direto para a rota de Administração,
   **Then** vê uma tela "você não tem permissão para acessar isto" — **não** a tela de Login
   e **não** uma tela branca ou erro cru.
7. **Given** uma ação de salvar perfil que volta 403 (permissão perdida entre carregar e
   salvar), **When** o painel recebe a resposta, **Then** mostra a mensagem de "sem
   permissão" sem deslogar a sessão (403 ≠ 401).

---

### Edge Cases

- **Risco de _lockout_ de administração**: como `administrador` é um perfil de sistema
  imutável que sempre carrega `perfil:administrar`, e a credencial de serviço resolve para
  ele, **sempre há um caminho de volta**. Remover `perfil:administrar` de um perfil comum é
  permitido; não existe operação que deixe o sistema sem nenhum portador de
  `perfil:administrar`.
- **Permissão removida do catálogo numa versão nova do código** enquanto um perfil ainda a
  referenciava: a permissão órfã é **ignorada** na resolução (não concede nada) e listada
  como "desconhecida" na leitura do perfil, com log no _boot_. Nunca quebra a resolução.
- **Handler com `@RequerPermissao` citando um identificador que não está no catálogo**: o
  _boot_ **aborta** (a checagem seria impossível de satisfazer e indica erro de código).
- **Sujeito com muitos perfis**: a resolução de permissões efetivas é a união e deve ser
  barata (idealmente memoizada por requisição); nenhum limite de negócio no número de
  perfis por usuário nesta spec.
- **`PUT .../perfis` com lista vazia**: válido — remove todos os perfis do usuário (e
  audita cada remoção). O usuário fica sem permissões.
- **Nome de perfil duplicado**: rejeitado (409) — nome é único, _case-insensitive_,
  _trimmed_.
- **Ação administrativa que não muda nada** (salvar um perfil com exatamente as permissões
  que já tinha): não gera registro de auditoria de "mudança" (auditoria registra _deltas_,
  não _no-ops_).
- **403 numa rota da allowlist pública** (`/health`, `/auth/token`, `/webhooks/*`): não se
  aplica — rotas públicas não passam pelo guard de permissão, como não passam pelo de JWT.
- **Política padrão "negar" (CL-03)**: um _handler_ autenticado sem `@RequerPermissao` nem
  `@AutenticadoBasta()` responde 403 — e o _boot_ pode acusar isso como erro de código
  (fechado por omissão, detectável cedo). Retrofit da 003 é trivial: só `/health` e
  `/auth/token` existem hoje, ambas `@Public`.

## Requirements *(mandatory)*

### Functional Requirements

#### Catálogo de permissões

- **FR-001**: O sistema MUST definir o catálogo de permissões **no código**, como fonte
  única, não editável em runtime. Cada permissão MUST ter: identificador estável
  `recurso:ação` (minúsculas, `snake_case` na ação), um `recurso` de agrupamento e um
  rótulo legível em português.
- **FR-002**: O identificador de cada permissão MUST ser único. Identificador duplicado no
  catálogo MUST abortar o _boot_ com mensagem que nomeia o identificador em conflito.
- **FR-003**: O catálogo MUST incluir, nesta spec, no mínimo: `perfil:administrar` (permissão
  elevada que protege todos os _endpoints_ de administração de RBAC) e o vocabulário de
  `lead` — `lead:criar`, `lead:editar`, `lead:ver_todos`, `lead:ver_proprios` — para a
  spec 008 consumir sem redefinir nada.
- **FR-004**: O sistema MUST expor `GET /admin/rbac/permissoes` que devolve o catálogo
  agrupado por recurso, com identificador e rótulo de cada permissão, em ordem estável.
  Protegido por `perfil:administrar`.
- **FR-005**: Uma permissão referenciada por um `@RequerPermissao` que **não** exista no
  catálogo MUST abortar o _boot_ (erro de código, não de dado).

#### Perfis

- **FR-006**: Um **perfil** MUST ter: identificador estável, nome único (_case-insensitive_,
  _trimmed_), conjunto de permissões (subconjunto do catálogo) e a marca `de_sistema`
  (booleano).
- **FR-007**: O sistema MUST garantir a existência de ao menos um perfil de sistema
  `administrador` com `de_sistema: true` e **todas** as permissões do catálogo — inclusive
  as adicionadas por specs futuras, sem intervenção manual.
- **FR-008**: Perfis de sistema MUST ser imutáveis: tentativa de renomear, alterar
  permissões ou apagar MUST falhar com 409 (Conflict), sem efeito e sem registro de
  auditoria de mudança.
- **FR-009**: Perfis comuns MUST poder ser criados, renomeados, ter permissões
  adicionadas/removidas e apagados, **apenas** por sujeito com `perfil:administrar`.
- **FR-010**: Criar ou editar um perfil incluindo uma permissão **fora do catálogo** MUST
  responder 400 e não persistir nada.
- **FR-011**: Apagar um perfil comum **ainda atribuído** a ≥ 1 usuário MUST responder 409,
  informando quantos usuários o usam. A remoção das atribuições é pré-requisito explícito.
- **FR-012**: Nenhuma operação MUST poder resultar em **zero** portadores de
  `perfil:administrar` no sistema (o perfil de sistema `administrador` garante isso por
  construção).
- **FR-013**: O sistema MUST expor, protegidos por `perfil:administrar`:
  `GET /admin/rbac/perfis` (lista com permissões), `POST /admin/rbac/perfis` (criar),
  `PATCH /admin/rbac/perfis/{id}` (renomear e/ou ajustar permissões),
  `DELETE /admin/rbac/perfis/{id}` (apagar perfil comum não atribuído).

#### Sujeito, usuário e atribuição

- **FR-014**: O sistema MUST introduzir a entidade **`usuario`** com, no mínimo:
  identificador estável (UUID v7, Padrão Transversal), nome, e-mail (único, normalizado),
  `criado_em`/`atualizado_em`. Esta spec **não** entrega autenticação de `usuario`
  (sem senha, sem _magic link_, sem SSO) — só o cadastro e o vínculo com perfis.
- **FR-015**: Um `usuario` MUST poder ter **0, 1 ou mais** perfis. Suas **permissões
  efetivas** MUST ser a **união** das permissões de todos os seus perfis, sem duplicatas.
- **FR-016**: O sistema MUST expor `GET /admin/rbac/usuarios/{id}/perfis` (perfis atuais do
  usuário) e `PUT /admin/rbac/usuarios/{id}/perfis` (define o conjunto completo), ambos
  protegidos por `perfil:administrar`. `PUT` com lista vazia remove todos os perfis.
- **FR-016a**: O sistema MUST expor `POST /admin/rbac/usuarios` (criar `usuario` com nome e
  e-mail) e `GET /admin/rbac/usuarios` (listar `usuario`s com os perfis de cada um), ambos
  protegidos por `perfil:administrar`. E-mail duplicado (normalizado) MUST responder 409.
  Editar, desativar e apagar `usuario` estão **fora de escopo** desta spec.
- **FR-017**: Uma atribuição que referencie um perfil inexistente MUST responder 404 e
  não alterar nada.
- **FR-018**: Enquanto não houver login individual, a **credencial de serviço da 003** MUST
  resolver para um sujeito com o perfil `administrador`. Todo _endpoint_ existente na 003
  MUST continuar respondendo exatamente como antes para esse sujeito.
- **FR-019**: As permissões efetivas de um sujeito MUST ser **resolvidas a cada
  requisição** a partir dos perfis do sujeito (união das permissões dos perfis),
  memoizadas no escopo da requisição. O JWT da 003 MUST permanecer fino — identifica só o
  sujeito, **não** carrega perfis nem permissões. Uma mudança de perfil MUST valer já na
  requisição seguinte (sem janela de _staleness_).

#### Guard por permissão

- **FR-020**: O sistema MUST fornecer um decorator `@RequerPermissao(...permissões)` que
  marca, num _handler_ ou _controller_, as permissões exigidas. Semântica **E** por padrão
  (todas exigidas). Sem argumentos é inválido (erro de código).
- **FR-021**: O sistema MUST ter um **guard de permissão** que roda **depois** do
  `JwtAuthGuard` da 003, reutilizando o sujeito já autenticado, e responde **403** quando o
  sujeito não satisfaz `@RequerPermissao`. 403 MUST ser distinto de 401 e ter corpo
  genérico ("permissão insuficiente"), sem _stack_, sem nome de classe, sem listar o
  catálogo.
- **FR-022**: Rotas na **allowlist pública** da 003 (`/health`, `/auth/token`, prefixo
  `/webhooks/*`) MUST NOT passar pelo guard de permissão.
- **FR-023**: A **política padrão** MUST ser **negar** (403): uma rota autenticada
  (não-`@Public`) sem `@RequerPermissao` e sem o marcador explícito `@AutenticadoBasta()`
  MUST responder 403. Tornar uma rota acessível é sempre um ato **explícito e revisável em
  _diff_** — `@RequerPermissao(...)` (exige permissão) ou `@AutenticadoBasta()` (allowlist
  central "só exige JWT válido"). O _boot_ MAY falhar se um _handler_ autenticado não tem
  nenhum dos dois marcadores (fechado por omissão, detectável cedo).
- **FR-024**: O sujeito com o perfil `administrador` MUST satisfazer qualquer
  `@RequerPermissao`, incluindo permissões adicionadas por specs futuras.

#### Auditoria de ações administrativas

- **FR-025**: Toda ação administrativa de RBAC — criar/renomear/apagar perfil,
  adicionar/remover permissão de um perfil, atribuir/remover perfil de um usuário — MUST
  gravar um registro na forma canônica `RegistroAuditoria` do `core` (spec 002), contendo:
  quem (identificador do sujeito), quando (`timestamptz` UTC), entidade afetada, ação, e o
  _delta_ (valor anterior e novo, ou permissões adicionadas/removidas).
- **FR-026**: A auditoria MUST registrar apenas **deltas reais** — uma ação que não muda
  nada (salvar o mesmo conjunto de permissões) não gera registro.
- **FR-027**: Registros de auditoria MUST ser **somente-acréscimo** (nunca editados nem
  apagados por esta spec) e MUST NOT conter segredo, token ou senha.
- **FR-028**: Os registros de auditoria de RBAC e o próprio RBAC (perfis, atribuições
  `usuario`↔`perfil`) MUST persistir em **PostgreSQL**, via migração Prisma. Toda tabela
  MUST seguir os Padrões Transversais: PK `id` UUID v7 gerada na aplicação,
  `criado_em`/`atualizado_em` `timestamptz` em UTC.

#### Painel — Administração (abas Perfis e Usuários)

- **FR-029**: O painel MUST exibir o item de navegação **Administração** (com as abas
  **Perfis** e **Usuários**) apenas para sujeitos cujas permissões efetivas incluam
  `perfil:administrar`.
- **FR-030**: A aba **Perfis** MUST listar os perfis com suas permissões e permitir
  criar/editar um perfil comum via _checklist_ de permissões **agrupado por recurso** (com
  marcar/desmarcar o recurso inteiro). A aba **Usuários** MUST listar e criar `usuario`s
  (nome + e-mail) e editar o conjunto de perfis de cada um por _multi-select_ do catálogo
  de perfis.
- **FR-031**: Perfis de sistema MUST aparecer como somente-leitura, com indicação visual
  de "perfil de sistema".
- **FR-032**: Um sujeito sem `perfil:administrar` que navegue direto para uma rota de
  Administração MUST ver uma tela "sem permissão" — visualmente distinta da tela de Login
  (401) e nunca uma tela branca ou erro cru.
- **FR-033**: Uma resposta **403** a qualquer chamada do painel MUST ser tratada de forma
  central como "sem permissão" **sem** limpar o token nem deslogar (403 ≠ 401, que é o
  fluxo da 003).
- **FR-034**: O painel MUST NOT depender de um catálogo de permissões _hardcoded_ no
  frontend — ele consome `GET /admin/rbac/permissoes` para montar o _checklist_.

#### Configuração e _boot_

- **FR-035**: O _boot_ MUST validar a coerência do catálogo (identificadores únicos, todo
  `@RequerPermissao` no catálogo) e a existência do perfil `administrador` **antes** de
  aceitar conexões; qualquer inconsistência aborta com mensagem específica.
- **FR-036**: O _boot_ MUST logar, uma vez, que o RBAC está ativo, o número de permissões
  no catálogo e o número de perfis de sistema — sem dados sensíveis.
- **FR-037**: A spec MUST incluir uma migração Prisma idempotente e um _seed_ dos perfis
  de sistema (mín.: `administrador`) executável em todo ambiente, inclusive `test` e a
  CI — sem default silencioso e sem porta nova. O _seed_ MUST ser reexecutável sem
  duplicar (upsert por identificador estável).

### Key Entities *(inclui só o que envolve dados)*

- **Permissão**: unidade atômica de autorização. `recurso:ação` (identificador estável),
  `recurso`, rótulo. Vive **no código** — não é linha de banco, não é editável em runtime.
- **Perfil (papel)**: agrupador nomeado de permissões. Identificador estável, nome único,
  conjunto de permissões, `de_sistema`. Perfis de sistema (mín.: `administrador`) são
  imutáveis. Persiste em Postgres (tabela `perfil` + junção `perfil_permissao`).
- **Usuário**: membro da equipe portador de perfis. Identificador estável (UUID v7), nome,
  e-mail único. Criado por `POST /admin/rbac/usuarios`; **sem** credencial de autenticação,
  edição, desativação ou remoção nesta spec. Permissões efetivas = união das permissões de
  seus perfis.
- **Atribuição de perfil**: vínculo N:N entre `usuario` e `perfil`. Criar/remover é
  auditado.
- **Registro de auditoria de RBAC**: forma canônica `RegistroAuditoria` do `core` — quem,
  quando, entidade, ação, _delta_. Somente-acréscimo. Persiste em Postgres (tabela
  `rbac_audit`).
- **Sujeito de autorização**: quem a requisição representa. Hoje: a credencial de serviço
  da 003 → perfil `administrador`. Futuro: um `usuario` autenticado individualmente (spec
  posterior).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma spec futura protege um _handler_ por permissão adicionando **uma linha**
  (o decorator) — sem escrever verificação de token, resposta 403 ou auditoria, que já
  existem. Demonstrado por uma rota-isca que passa a exigir permissão só com o decorator.
- **SC-002**: **100%** das requisições autenticadas sem a permissão exigida por um
  `@RequerPermissao` recebem **403** (não 200, não 401, não 500), e **100%** das sem token
  recebem **401** — verificável por teste que cobre os três eixos (sem token / autenticado
  sem permissão / autenticado com permissão).
- **SC-003**: O sujeito com perfil `administrador` satisfaz **100%** das permissões do
  catálogo, incluindo uma permissão adicionada depois — verificável por um teste que
  injeta uma permissão nova e confirma que o `administrador` a possui sem mudança de dados.
- **SC-004**: Toda ação administrativa de RBAC produz **exatamente um** registro de
  auditoria com "quem" e "quando" preenchidos; ações _no-op_ produzem **zero** —
  verificável enumerando as 7 ações administrativas em teste.
- **SC-005**: Nenhuma resposta 403 do sistema inclui _stack trace_, nome de classe interno
  ou o identificador da permissão que faltou — verificado por inspeção dos corpos de erro
  em todos os cenários de teste.
- **SC-006**: Não existe sequência de operações administrativas que deixe o sistema sem
  nenhum portador de `perfil:administrar` — verificável por um teste que tenta esvaziar a
  administração por todos os caminhos expostos e falha em todos.
- **SC-007**: O painel monta o _checklist_ de permissões **inteiramente** a partir do
  catálogo servido pelo backend (zero permissões _hardcoded_ no frontend) — verificável
  por inspeção do _bundle_ e por um teste que adiciona uma permissão no backend e a vê
  aparecer na tela sem mudança no frontend.
- **SC-008**: Um 403 em qualquer chamada do painel **nunca** desloga a sessão nem limpa o
  token — verificável por teste de componente que dispara 403 e confirma que a sessão
  permanece.
- **SC-009**: Todos os _endpoints_ existentes da spec 003 respondem **igual** antes e
  depois desta spec para a credencial de serviço — verificável rodando a suíte e2e da 003
  sem alteração.
- **SC-010**: As partes puras (resolução de permissões efetivas, validação do catálogo,
  cálculo de _delta_ de auditoria) rodam **sem banco**; só os testes de _endpoint_ tocam
  Postgres real — seguindo a disciplina de teste da constituição.

## Assumptions

- **Um único nível de acesso efetivo na v1.** Enquanto não há login individual de
  `usuario`, o único sujeito real é a credencial de serviço da 003, mapeada para
  `administrador`. O valor desta spec é a **modelagem e o mecanismo** de que o CRM (007+)
  depende — não uma mudança de comportamento visível para a equipe hoje.
- **`auth` continua infra transversal.** O RBAC vive em `backend/src/auth/`, não é um novo
  _bounded context_; `CONTEXT_MODULES` segue com 11 e as e2e de `/health` continuam
  afirmando 11.
- **O `core` é dono do contrato de auditoria** (spec 002): esta spec **usa**
  `RegistroAuditoria`/`montarRegistroAuditoria`, não redefine a forma.
- **Sem regras de _negação_ (deny) explícitas** na v1 — permissões são só aditivas; a
  ausência de uma permissão é a negação. Regras "este perfil nunca pode X mesmo com outro
  perfil que dá X" ficam fora de escopo.
- **Sem hierarquia de perfis / herança** na v1 — um perfil é um conjunto plano de
  permissões. Composição se faz atribuindo vários perfis ao usuário.
- **`lead:ver_proprios` vs `lead:ver_todos`** são vocabulário reservado; a semântica de
  "próprios" (por responsável? por squad?) é detalhada na spec 008, que é dona da entidade.
- **Escopo por squad/time** (Parte 8.11 "gestão de times/squads") **não** entra aqui — é a
  spec 007 (crm-administracao). Esta spec entrega só perfil↔permissão↔usuário.
- **Portas**: nenhuma porta nova. Backend `3001`, frontend `5174`, Postgres dev `55432`
  (spec 001), todos já em uso pelo próprio projeto e configuráveis por `.env`.
- **Distribuição/gestão de contas de `usuario`** (como um membro da equipe é cadastrado na
  prática) é mínima nesta spec — cadastro por _endpoint_/`seed`; um fluxo de convite/gestão
  é de uma spec futura de acesso da equipe.

## Dependencies

- **Spec 001 (bootstrap)**: convenções de entidade (PK UUID v7 na app, `criado_em`/
  `atualizado_em` `timestamptz`), o harness e2e contra Postgres real, o shell e a
  navegação do frontend, a regra ESLint de fronteira entre contextos.
- **Spec 002 (core value objects)**: `EntidadeId`/`uuidv7()` para a PK de `usuario`; o
  contrato `RegistroAuditoria` + `montarRegistroAuditoria` (`origem` inclui
  `AJUSTE_MANUAL`); o contrato de config tipada.
- **Spec 003 (auth-servico-jwt)**: o `JwtAuthGuard` global que esta spec **estende**; o
  módulo `backend/src/auth/`; a allowlist de rotas públicas (`@Public()` +
  `PUBLIC_PATH_PREFIXES`); o `apiFetch` central do painel (que já trata 401) — esta spec
  acrescenta o tratamento central de **403**; a tela de Login e o `AuthProvider`.
- **Consome desta spec**: **008 (crm-lead)** usa o vocabulário `lead:*` e o guard;
  **007 (crm-administracao)** estende com squads/times e integrações; **toda spec de CRM,
  Marketing e Central** (007–052) usa esta matriz única de permissão; a futura spec de
  **login individual da equipe** liga `usuario` a um mecanismo de autenticação;
  **053 (auditoria global)** consolida os painéis de auditoria, incluindo o de RBAC.

## Out of Scope

- **Autenticação de usuário humano individual** (senha, _magic link_, SSO, MFA) — spec
  futura de acesso da equipe. Aqui `usuario` não tem credencial.
- **RBAC / login do portal da aluna** — outro principal, mecanismo distinto (spec 045).
- **Permissões criáveis/editáveis em runtime** além de perfis — o catálogo é sempre código.
- **Hierarquia/herança de perfis, regras de negação (deny), permissões condicionais por
  atributo (ABAC)**.
- **Escopo por squad/time, atribuição automática, horários de atendimento** (spec 007).
- **Multi-tenant / múltiplas organizações**.
- **Semântica concreta de `lead:ver_proprios`** (é da spec 008) e qualquer CRUD de `lead`.
- **Edição, desativação e remoção de `usuario`**, fluxo de convite, e qualquer UI de gestão
  de usuário além de criar (nome + e-mail) e listar para atribuir perfis.
- **Rotação/expiração de perfis, aprovação em duas etapas para mudança de acesso,
  _access reviews_ periódicos** — _hardening_ (spec 055) ou futuro.
- **Endpoint de leitura / painel do log de auditoria** — esta spec **grava** os registros;
  a visualização consolidada é a spec 053 (auditoria e observabilidade global).
