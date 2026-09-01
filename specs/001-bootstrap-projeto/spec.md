# Feature Specification: Bootstrap do Projeto (esqueleto do monorepo)

**Feature Branch**: `001-bootstrap-projeto`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "001 — bootstrap-projeto: Monorepo com scaffold do backend NestJS (um módulo por bounded context: ingestao, financeiro, catalogo, contratos, clientes, crm, marketing, central, core, api, admin), Prisma + PostgreSQL, config por .env por conta de origem, CI, lint/format, e harness de teste contra Postgres real. Frontend: scaffold Vite + React 19 + TS + Tailwind v4 + TanStack Query + React Router, tokens da marca (azul #2E4E78, coral #EC5F6A, menta #68C0B2, fonte Inter), e shell de layout."

## Clarifications

### Session 2026-09-01

- Q: Gestão do monorepo e gerenciador de pacotes? → A: **npm workspaces** — `package.json` na raiz com `workspaces: ["backend", "frontend"]`, lockfile único, scripts agregados na raiz; sem gerenciador de pacotes adicional.
- Q: Esquema de chave primária para todas as entidades futuras? → A: **UUID v7 com wrapper de domínio** — storage nativo `uuid` no Postgres; utilitário de geração e um Value Object tipado de ID (`EntidadeId`) entregues no contexto `core` já nesta spec; IDs trafegam como Value Object, não como `string` crua.

## Visão geral

Esta é a spec de fundação da **Fase 0** do [ROADMAP.md](../../ROADMAP.md). Ela não entrega
nenhuma regra de negócio: entrega o **esqueleto verificável do repositório** sobre o qual as
outras 55 specs serão construídas. O "usuário" desta spec é a pessoa (ou agente) que vai
desenvolver as próximas fatias e a esteira de CI que valida cada mudança.

O sucesso é medido por: um clone limpo do repositório chega a "backend sobe, frontend sobe,
testes rodam contra Postgres real, lint e type-check passam" seguindo só o README, sem
conhecimento tácito.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Subir o ambiente a partir de um clone limpo (Priority: P1)

Uma pessoa nova no projeto clona o repositório, segue o passo a passo do README e, em
minutos, tem o backend respondendo, o frontend renderizando o shell da aplicação e a suíte
de testes passando contra um PostgreSQL real — sem precisar perguntar nada a ninguém.

**Why this priority**: sem isto, nenhuma das outras 55 specs pode começar. É o pré-requisito
absoluto de todo o resto do roadmap e o critério de "a Fase 0 destravou".

**Independent Test**: em uma máquina limpa (ou container), executar apenas os comandos
documentados no README — instalar dependências, subir o Postgres de desenvolvimento, rodar
as migrações, iniciar backend e frontend, rodar a suíte de testes. Tudo conclui com sucesso
sem edição manual de arquivo além de copiar `.env.example` para `.env`.

**Acceptance Scenarios**:

1. **Given** um clone limpo e as ferramentas de base instaladas (runtime de JS/TS e um
   PostgreSQL acessível), **When** a pessoa segue a seção "Como rodar" do README na ordem,
   **Then** o backend inicia e responde a um endpoint de verificação de saúde, o frontend
   serve a aplicação com o shell de layout visível, e nenhum passo exige informação que não
   esteja no README.
2. **Given** o ambiente montado, **When** a pessoa roda o comando de testes do backend,
   **Then** a suíte executa contra um banco PostgreSQL real (não um dublê em memória),
   cria e limpa seu próprio schema de teste, e reporta os resultados.
3. **Given** o ambiente montado, **When** a pessoa roda os comandos de qualidade
   (lint, formatação, verificação de tipos) em backend e frontend, **Then** todos passam
   sem erro em um repositório recém-clonado.
4. **Given** que a pessoa esqueceu de criar o `.env`, **When** inicia o backend, **Then**
   a aplicação falha imediatamente com uma mensagem que diz exatamente qual variável está
   faltando — nunca sobe com um default silencioso para segredo ou conexão de banco.

---

### User Story 2 - Adicionar código no bounded context certo (Priority: P1)

A pessoa que vai implementar a próxima spec (ex.: `core`, `pessoa`, `evento_origem`) abre o
backend e encontra um lugar óbvio, já existente e isolado, para cada contexto delimitado da
arquitetura-alvo. Ela não precisa decidir a divisão de módulos — a divisão já reflete a
constituição.

**Why this priority**: o Princípio VI (contextos delimitados) tem que estar embutido na
estrutura desde o primeiro commit, senão o schema gigante compartilhado volta por inércia.

**Independent Test**: inspecionar a árvore do backend e confirmar que existe um módulo
isolado para cada contexto (`ingestao`, `financeiro`, `catalogo`, `contratos`, `clientes`,
`crm`, `marketing`, `central`, `core`, `api`, `admin`), cada um registrável de forma
independente, sem que um contexto importe as entranhas de outro por padrão.

**Acceptance Scenarios**:

1. **Given** o backend recém-scaffoldado, **When** a pessoa procura onde colocar a lógica de
   um contexto, **Then** encontra um módulo dedicado a esse contexto com um ponto de entrada
   claro e um espaço para domínio, aplicação e borda.
2. **Given** os módulos de contexto, **When** o backend inicia, **Then** todos os módulos são
   carregados pela aplicação e o endpoint de saúde confirma que a composição funcionou.
3. **Given** dois contextos diferentes, **When** se inspeciona suas dependências, **Then**
   a comunicação prevista entre eles é por contrato explícito (porta/serviço), não por
   import direto de repositório/entidade do outro.

---

### User Story 3 - Confiar que a CI barra o que está quebrado (Priority: P1)

Toda vez que alguém abre um pull request, uma esteira automática instala do zero, roda lint,
verificação de tipos, build e a suíte de testes (com um PostgreSQL real provisionado pela
própria esteira) para backend e frontend. Um PR que quebra qualquer um desses passos é
sinalizado como reprovado.

**Why this priority**: o fluxo Spec Kit exige "testes contra Postgres real" como disciplina
de qualidade e o Constitution Check como portão. Sem CID desde a fundação, a regressão entra
sem ser vista.

**Independent Test**: abrir um PR de teste que introduz um erro de lint (ou de tipo, ou um
teste falho) e confirmar que a esteira reprova; abrir um PR limpo e confirmar que passa.

**Acceptance Scenarios**:

1. **Given** um PR contra a branch principal, **When** a esteira roda, **Then** ela executa,
   em ambiente limpo, instalação, lint, verificação de tipos, build e testes de backend e
   frontend, provisionando um PostgreSQL real para os testes de backend.
2. **Given** um PR que introduz uma violação de lint, um erro de tipo ou um teste falho,
   **When** a esteira roda, **Then** o resultado é "reprovado" e o passo específico que
   falhou fica identificável.
3. **Given** um PR que só altera documentação, **When** a esteira roda, **Then** ela ainda
   conclui de forma determinística (sem flakiness) e em tempo razoável.

---

### User Story 4 - Ver a identidade visual da AEN no frontend (Priority: P2)

Ao abrir o frontend, a pessoa vê um shell de aplicação (cabeçalho, área de navegação lateral,
área de conteúdo) já pintado com as cores da marca (azul `#2E4E78`, coral `#EC5F6A`, menta
`#68C0B2`) e a tipografia Inter, com os tokens centralizados num único lugar.

**Why this priority**: garante que toda tela futura herde a identidade visual sem
redefinição, mas não bloqueia o backend nem a CI — por isso P2.

**Independent Test**: rodar o frontend, abrir a aplicação e confirmar visualmente o shell
com as cores e a fonte corretas; inspecionar que as cores vêm de tokens nomeados, não de
valores hexadecimais espalhados pelos componentes.

**Acceptance Scenarios**:

1. **Given** o frontend rodando, **When** a aplicação carrega, **Then** aparece um shell de
   layout com cabeçalho, navegação e área de conteúdo, usando as três cores da marca e a
   fonte Inter.
2. **Given** o código do frontend, **When** se procura a definição das cores da marca,
   **Then** elas estão definidas uma única vez como tokens reutilizáveis.
3. **Given** o shell, **When** a janela é redimensionada para uma largura de tablet/desktop,
   **Then** o layout permanece utilizável (sem sobreposição nem rolagem horizontal do corpo).

---

### User Story 5 - Configurar as 7 contas de origem por ambiente (Priority: P2)

A pessoa que for ligar uma integração encontra, no `.env.example`, um lugar previsto para as
credenciais e URLs de cada uma das 7 contas de origem (`TMB`, `Asaas PRD`, `Asaas SVC`,
`Guru PRD`, `Guru SVC`, `Hotmart PRD`, `Hotmart SVC`), sem que nenhum segredo real esteja
versionado.

**Why this priority**: o Padrão Transversal de multi-conta e `.env` por conta precisa estar
modelado desde o começo, mas os valores reais só entram nas specs de adapter (Fase 2).

**Independent Test**: abrir `.env.example` e confirmar que há entradas nomeadas por conta
para as 7 contas; confirmar que `git` ignora o `.env` real; confirmar que a aplicação lê
essas variáveis por uma camada de configuração tipada e falha cedo se uma obrigatória
faltar.

**Acceptance Scenarios**:

1. **Given** o repositório, **When** se inspeciona `.env.example`, **Then** existem chaves
   de configuração agrupadas por conta de origem para as 7 contas, com valores de exemplo
   inertes (placeholder), além da conexão de banco e dos segredos de autenticação de serviço.
2. **Given** um `.env` real criado pela pessoa, **When** ela roda `git status`, **Then** o
   `.env` não aparece como arquivo a versionar.
3. **Given** a aplicação, **When** ela inicia, **Then** a configuração é validada por um
   esquema tipado; variáveis obrigatórias ausentes causam falha imediata com mensagem clara,
   e `plataforma_origem` é tratado como dimensão de primeira classe na modelagem de config.

---

### Edge Cases

- **PostgreSQL indisponível ao subir o backend**: a aplicação reporta erro de conexão
  explícito no start (ou no primeiro acesso ao banco, conforme a estratégia de pool), nunca
  finge estar saudável.
- **Porta padrão já ocupada**: as portas de backend e frontend são configuráveis por
  `.env`/variável; o README diz quais são os padrões e como trocá-las. Nenhum serviço
  assume uma porta fixa não-configurável.
- **Rodar os testes sem banco de teste provisionado**: o comando de teste falha com uma
  mensagem que aponta a variável de conexão de teste ausente, não com um erro genérico.
- **Duas suítes de teste em paralelo**: cada execução isola seu próprio schema/namespace de
  teste e faz a limpeza ao final, sem colisão entre execuções concorrentes.
- **Versão de runtime divergente**: o repositório fixa a versão esperada do runtime (arquivo
  de versão + `engines`), e o README diz como alinhar.
- **Clone em Windows e em Linux**: os comandos documentados funcionam nos dois; scripts de
  automação não assumem um único sistema operacional.

## Requirements *(mandatory)*

### Functional Requirements

#### Estrutura do repositório

- **FR-001**: O repositório MUST ser um monorepo gerenciado por **npm workspaces**: um
  `package.json` na raiz declarando os workspaces `backend` e `frontend`, um único lockfile
  versionado na raiz, e scripts agregados na raiz que disparam os scripts equivalentes de
  cada workspace. Cada workspace MUST manter seu próprio manifesto de dependências e seus
  próprios scripts. Nenhum gerenciador de pacotes além do `npm` MUST ser exigido no setup
  ou na CI.
- **FR-002**: O repositório MUST manter na raiz os documentos de governança e escopo já
  existentes (visão, constituição, `CLAUDE.md`, `README.md`, `ROADMAP.md`) e uma pasta
  `docs/` para documentação derivada desta e das próximas specs.
- **FR-003**: O backend MUST expor um módulo isolado para cada um dos 11 contextos da
  arquitetura-alvo: `ingestao`, `financeiro`, `catalogo`, `contratos`, `clientes`, `crm`,
  `marketing`, `central`, `core`, `api`, `admin`.
- **FR-004**: Cada módulo de contexto MUST ter um ponto de composição próprio (registrável
  de forma independente pela aplicação) e uma organização interna que separe domínio,
  aplicação e borda, mesmo que inicialmente vazia.
- **FR-005**: A estrutura MUST desencorajar por construção o acoplamento entre contextos:
  um contexto não importa entidades/persistência de outro; a integração prevista se dá por
  contrato explícito (porta/serviço/eventos).

#### Backend — execução e saúde

- **FR-006**: O backend MUST iniciar com um único comando documentado e servir um endpoint
  de verificação de saúde que confirme que a aplicação subiu e conseguiu compor todos os
  módulos de contexto.
- **FR-007**: O backend MUST carregar toda configuração sensível (conexão de banco, segredos
  de autenticação de serviço, credenciais das 7 contas de origem) de variáveis de ambiente,
  validadas por um esquema tipado no start.
- **FR-008**: O backend MUST falhar imediatamente no start, com mensagem que nomeia a
  variável faltante, quando uma configuração obrigatória estiver ausente ou malformada —
  nunca aplicar default silencioso para segredo ou string de conexão.
- **FR-009**: As portas de rede do backend e do frontend MUST ser configuráveis por
  ambiente, com os padrões documentados no README e a instrução de como alterá-los; nenhum
  serviço MUST assumir uma porta fixa não-configurável ou uma porta que já esteja em uso no
  ambiente de desenvolvimento.

#### Banco de dados e migrações

- **FR-010**: O repositório MUST incluir a definição de schema de banco (inicialmente
  mínima/vazia de entidades de negócio) e um mecanismo de migração versionada, com comandos
  documentados para aplicar e para criar migrações.
- **FR-011**: O repositório MUST fornecer uma forma reproduzível de subir um PostgreSQL de
  desenvolvimento local (ex.: arquivo de orquestração de container) e documentar a
  alternativa de apontar para um Postgres já existente.
- **FR-012**: A decisão de ID surrogate é tomada aqui (Princípio I): toda entidade futura
  usa **UUID v7** com armazenamento no tipo nativo `uuid` do PostgreSQL. O contexto `core`
  MUST entregar, já nesta spec, (a) um utilitário de geração de UUID v7 e (b) um Value
  Object tipado de identificador (`EntidadeId`) por meio do qual os IDs trafegam na camada
  de domínio — nunca como `string` crua. ULID fica explicitamente rejeitado como alternativa
  (ver Constraints & Tradeoffs).

#### Testes

- **FR-013**: O backend MUST ter um harness de teste que executa contra um PostgreSQL
  **real**, não contra um substituto em memória.
- **FR-014**: O harness de teste MUST criar um schema/namespace isolado por execução,
  aplicar as migrações nesse schema, e limpá-lo ao final, permitindo execuções concorrentes
  sem colisão.
- **FR-015**: O comando de teste MUST falhar com mensagem clara (variável de conexão de
  teste ausente) quando o banco de teste não estiver configurado.
- **FR-016**: O repositório MUST incluir pelo menos um teste de fumaça por área (backend e
  frontend) que exercite o caminho real: no backend, subir a aplicação e bater no endpoint
  de saúde com o banco conectado; no frontend, renderizar o shell.

#### Qualidade de código

- **FR-017**: Backend e frontend MUST ter linter e formatador configurados, com um comando
  único por área para verificar e outro para corrigir.
- **FR-018**: Backend e frontend MUST ter verificação de tipos estática executável por um
  comando único por área, sem erros em repositório recém-clonado.
- **FR-019**: O repositório MUST fixar a versão esperada do runtime (arquivo de versão +
  declaração de `engines`) e documentar como alinhá-la.

#### Integração contínua

- **FR-020**: O repositório MUST ter uma esteira de CI que, a cada pull request contra a
  branch principal, roda em ambiente limpo: instalação de dependências, lint, verificação de
  tipos, build e testes — para backend e frontend.
- **FR-021**: A CI MUST provisionar um PostgreSQL real para os testes de backend.
- **FR-022**: A CI MUST reprovar o PR quando qualquer passo (lint, tipos, build, teste)
  falhar, deixando identificável qual passo quebrou.
- **FR-023**: A execução de CI MUST ser determinística (sem flakiness conhecida) e concluir
  em tempo razoável para um esqueleto de projeto.

#### Frontend — shell e identidade visual

- **FR-024**: O frontend MUST servir uma aplicação de página única com um shell de layout
  contendo, no mínimo, cabeçalho, área de navegação e área de conteúdo roteável.
- **FR-025**: O frontend MUST ter roteamento client-side configurado com pelo menos uma rota
  de exemplo renderizada dentro do shell.
- **FR-026**: O frontend MUST ter a camada de busca de dados assíncrona (cache de
  servidor-estado) configurada e pronta para uso pelas próximas specs, com um provider no
  topo da árvore.
- **FR-027**: O frontend MUST definir as três cores da marca (azul `#2E4E78`, coral
  `#EC5F6A`, menta `#68C0B2`) e a fonte Inter **uma única vez**, como tokens de tema
  reutilizáveis, e aplicar esses tokens no shell.
- **FR-028**: O shell MUST permanecer utilizável em larguras de tablet e desktop, sem
  rolagem horizontal do corpo nem sobreposição de elementos.

#### Documentação

- **FR-029**: O README MUST conter uma seção "Como rodar" com o passo a passo completo e
  ordenado (pré-requisitos, instalação, `.env`, subir Postgres, migrações, iniciar backend,
  iniciar frontend, rodar testes, rodar checks), suficiente para o cenário da User Story 1
  sem conhecimento tácito.
- **FR-030**: O repositório MUST ter um `.env.example` com todas as chaves necessárias —
  conexão de banco (dev e teste), segredos de autenticação de serviço, e um bloco por conta
  para as 7 contas de origem — com valores de exemplo inertes.
- **FR-031**: A pasta `docs/` MUST conter um documento desta spec descrevendo a estrutura
  final do repositório, os comandos disponíveis por área, e o mapa de contexto → módulo.
- **FR-032**: Ao final desta spec, `CLAUDE.md`, `README.md` e `ROADMAP.md` MUST ser
  atualizados para refletir o estado "Fase 0 / 001 implementada" (marcar o checkbox 001,
  ajustar o "Status" e o "Próximo passo").

#### Higiene de repositório

- **FR-033**: O repositório MUST ignorar artefatos de build, dependências instaladas,
  arquivos de ambiente reais e artefatos locais de ferramentas.
- **FR-034**: Nenhum segredo real MUST ser versionado; o `.env.example` só contém
  placeholders.

### Key Entities

Esta spec **não** cria entidades de negócio. Os únicos "objetos" que ela introduz são
estruturais:

- **Módulo de contexto**: unidade de composição do backend que corresponde 1:1 a um bounded
  context da constituição. Atributos: nome do contexto, ponto de composição, espaço para
  domínio/aplicação/borda. Relação: registrado pela aplicação raiz; comunica-se com outros
  módulos só por contrato explícito.
- **Camada de configuração**: leitura tipada e validada das variáveis de ambiente. Atributos:
  conjunto de chaves obrigatórias, agrupamento por conta de origem (7 contas), validação de
  presença/formato no start.
- **`EntidadeId` (Value Object de identificador)**: wrapper tipado sobre um UUID v7. Entregue
  pelo `core` nesta spec. Atributos: valor UUID v7 subjacente; construtor que valida o
  formato; fábrica que gera um novo ID; conversão explícita de/para a representação de
  persistência (`uuid` nativo). Todo ID de entidade futura trafega como `EntidadeId` na
  camada de domínio, nunca como `string`.
- **Harness de teste**: utilitário que provisiona schema isolado em Postgres real, aplica
  migrações e limpa ao final. Atributos: identificador de schema por execução, ciclo
  setup/teardown.
- **Tema da marca**: conjunto único de tokens visuais (3 cores + tipografia) consumido pelo
  shell e por telas futuras.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partir de um clone limpo, uma pessoa seguindo apenas o README leva o
  ambiente completo (backend respondendo saúde, frontend com shell, testes verdes) ao ar em
  até 15 minutos, sem precisar de informação externa ao repositório.
- **SC-002**: 100% dos 11 contextos da arquitetura-alvo têm um módulo dedicado e isolado no
  backend, carregado com sucesso na inicialização.
- **SC-003**: Os comandos de lint, formatação e verificação de tipos passam sem nenhum erro
  em um repositório recém-clonado, tanto no backend quanto no frontend.
- **SC-004**: A suíte de testes do backend roda contra PostgreSQL real e passa de forma
  determinística em 3 execuções consecutivas, inclusive com duas execuções concorrentes sem
  colisão.
- **SC-005**: Um pull request que introduz um erro de lint, um erro de tipo ou um teste
  falho é reprovado pela CI em 100% das tentativas; um PR limpo passa em 100% das tentativas.
- **SC-006**: Iniciar o backend sem uma variável de ambiente obrigatória resulta, em 100%
  dos casos, em falha imediata nomeando a variável — nunca em um start "saudável".
- **SC-007**: Todas as cores da marca e a tipografia aparecem no frontend a partir de um
  único ponto de definição; uma busca por valores hexadecimais de marca fora do arquivo de
  tokens retorna zero ocorrências.
- **SC-008**: Nenhum segredo real está versionado; `.env.example` cobre 100% das variáveis
  que o backend exige no start, incluindo um bloco para cada uma das 7 contas de origem.
- **SC-009**: A execução completa de CI para um PR de esqueleto conclui em até 10 minutos.

## Assumptions

- **Runtime e stack já decididos pela constituição** (v1.1.0) e pelo ROADMAP: backend em
  Node.js + TypeScript + NestJS + Prisma sobre PostgreSQL; frontend em React 19 + TypeScript
  + Vite + Tailwind v4 + TanStack Query + React Router. Esta spec **implementa** essa
  decisão; não a reabre.
- **Plataforma de CI**: GitHub Actions, por o repositório já estar hospedado no GitHub
  (`github.com/louipasquini/pandora`). Caso o dono do produto prefira outra, é troca de
  configuração, não de escopo.
- **PostgreSQL local via container** (Docker/Compose) é a forma recomendada de subir o banco
  de desenvolvimento e de teste; apontar para um Postgres já instalado é alternativa
  documentada.
- **Sem autenticação, sem entidades de negócio, sem adapters nesta spec** — auth é a 003,
  `core` value objects é a 002, `pessoa` é a 005, `evento_origem` é a 006, adapters são a
  Fase 2. Aqui só entra o **espaço vazio, nomeado e testável** para cada um.
- **`core` recebe já nesta spec** o utilitário de geração de UUID v7 e o Value Object
  `EntidadeId` (ver Clarifications), porque o Princípio I exige que a decisão de ID surrogate
  seja tomada antes da primeira entidade; os value objects de dinheiro/tempo/status ficam
  para a 002.
- **Um único nível de acesso** no frontend (credenciais de serviço) — a tela de login em si
  é da 003; aqui o shell só reserva o lugar dela.
- **Deploy/hospedagem de produção está fora de escopo** desta spec; ela cobre
  desenvolvimento local + CI.
- **Valores reais das 7 contas de origem** não entram aqui — só as chaves de configuração e
  seus placeholders.

## Constraints & Tradeoffs

- **UUID v7 escolhido, ULID rejeitado.** UUID v7 usa o tipo `uuid` nativo do PostgreSQL
  (16 bytes, índice B-tree compacto), é time-ordered como o ULID, e tem suporte direto no
  ecossistema (Prisma, libs de geração maduras). ULID exigiria coluna `char(26)`/`text`,
  maior em índice, e normalização consistente em toda borda. O ganho de legibilidade do
  ULID não justifica o custo. Os IDs de origem continuam fora da PK (tabelas `*_origem_ref`,
  Princípio I) independentemente dessa escolha.
- **IDs trafegam como Value Object (`EntidadeId`), não como `string`.** Custo: uma camada de
  conversão nas bordas de persistência e de API. Ganho: impossível confundir o ID de uma
  entidade com o de outra em tempo de compilação, e o ponto único para validar/gerar ID.
- **npm workspaces, não pnpm/turborepo.** Para 2 pacotes, a orquestração extra não se paga;
  se o monorepo crescer muito, a migração é localizada (arquivo de workspace + CI).
- **Escopo é esqueleto verificável, não funcionalidade.** Qualquer regra de negócio,
  entidade de domínio, adapter ou tela real que vaze para esta spec deve ser recusada e
  remetida à spec dona (002–056).

## Dependencies

- Nenhuma spec anterior (é a 001).
- Depende da constituição v1.1.0 (stack ratificada) e do ROADMAP.md (ordem de fases).
- Habilita: **todas** as demais specs (002–056).
