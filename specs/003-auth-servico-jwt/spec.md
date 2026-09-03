# Feature Specification: Autenticação de serviço JWT para a API interna

**Feature Branch**: `003-auth-servico-jwt`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "003-auth-servico-jwt — Autenticação de serviço JWT para a API interna. Backend: endpoint POST /auth/token que troca SERVICE_CLIENT_ID/SERVICE_CLIENT_SECRET (credenciais de serviço, um único nível de acesso) por um JWT assinado com SERVICE_JWT_SECRET; guard de autenticação global que protege todos os routers de contexto (com allowlist para rotas públicas: /health, futuros /webhooks/*); validação de token de webhook (header/token por conta de origem, comparação constante) como mecanismo separado do JWT. Promove SERVICE_JWT_SECRET, SERVICE_CLIENT_ID e SERVICE_CLIENT_SECRET de opcionais para obrigatórios no env.schema (zod, falha cedo no boot). Sem persistência — sem tabela de usuários, sem refresh token na v1 (credenciais de serviço, expiração curta, cliente re-autentica). Frontend: tela de Login (credenciais de serviço), armazenamento do token, interceptor do TanStack Query/fetch que injeta Authorization: Bearer e trata 401 (redireciona para Login). Segue a constituição: superfície de escrita mínima, config tipada dona no core, nenhuma porta nova em uso."

## Clarifications

### Session 2026-09-03

- Q: Tornar `SERVICE_JWT_SECRET`/`SERVICE_CLIENT_ID`/`SERVICE_CLIENT_SECRET` obrigatórias vale para `NODE_ENV=test` também? → A: **Sim, em todos os ambientes.** O harness de teste e a CI passam a fornecer valores de fixture. Não há default silencioso para segredo (Padrão Transversal de config; FR-008 da spec 001).
- Q: `POST /auth/token` com credencial errada tem bloqueio progressivo / lockout nesta spec? → A: **Não nesta spec.** Só _rate limiting_ leve por IP (janela curta, resposta 429) para barrar força bruta trivial. Lockout, bloqueio de conta e revisão da proteção de webhook são escopo da spec 055 (hardening).
- Q: **CL-01** — duração do token de acesso ("expiração curta" pedida, valor não fixado)? → A: **12 horas** (cobre uma jornada de trabalho contínua; sem refresh, o operador re-autentica no máximo 1×/dia). Configurável por `SERVICE_JWT_TTL` (default `12h`), com **teto rígido de 24 h** — valor acima do teto aborta o boot.
- Q: **CL-02** — a sessão do operador no painel persiste entre reinícios do navegador? → A: **Sim, via `localStorage`** — token compartilhado entre abas e mantido após reiniciar o navegador enquanto válido. Ao expirar (ou 401), o painel limpa o token e reconduz ao Login. Se `localStorage` estiver indisponível, degrada para sessão em memória com aviso. Reavaliar armazenamento é escopo da spec 055.

## Visão geral

Terceira spec da **Fase 0** do [ROADMAP.md](../../ROADMAP.md). É o primeiro portão de acesso
do sistema: sem ela, todo endpoint que as specs seguintes criarem estaria aberto. Entrega
**um** mecanismo de autenticação para a API interna consumida pelo painel React da equipe, e
**um** mecanismo separado para autenticar os webhooks que as plataformas de origem vão chamar
(rotas criadas nas specs 019–022, mas o mecanismo de verificação nasce aqui).

O sistema tem **um único nível de acesso** (decisão da spec 001: "login = credenciais de
serviço"). Não há cadastro de pessoas usuárias, papéis nem senhas individuais nesta spec —
isso é a spec 004 (RBAC), que vai estender este alicerce. Aqui existe **um par de credenciais
de serviço** (`SERVICE_CLIENT_ID` + `SERVICE_CLIENT_SECRET`), configurado por `.env`, que o
painel troca por um **JWT de vida curta**. O JWT não referencia nenhuma linha de banco: é
_stateless_, validado só pela assinatura e pela expiração. Sem tabela de usuários, sem
_refresh token_, sem sessão no servidor — quando o token expira, o painel re-autentica com as
mesmas credenciais.

Além do fluxo de token, esta spec:

- **Fecha a API por padrão.** Um guard global exige `Authorization: Bearer <jwt>` válido em
  toda rota, com uma **allowlist** curta e explícita de rotas públicas (`/health` hoje;
  `/auth/token` e os futuros `/webhooks/*` por design).
- **Promove as credenciais de serviço a obrigatórias** no schema de config tipada
  (`SERVICE_JWT_SECRET`, `SERVICE_CLIENT_ID`, `SERVICE_CLIENT_SECRET`) — o processo aborta no
  boot, com o caminho da variável, se qualquer uma faltar. Cumpre o Padrão Transversal
  "config/segredos: `.env` por conta, nunca hard-coded, falha cedo".
- **Entrega a primitiva de verificação de token de webhook** — comparação em tempo constante
  de um token por conta de origem (`<PLATAFORMA>_WEBHOOK_TOKEN`, já previsto no schema desde a
  spec 001) — como utilitário reaproveitável, **separado** do JWT de serviço. Nenhuma rota
  `/webhooks/*` é criada nesta spec; a primitiva é testada isoladamente.
- **Entrega a tela de Login e o interceptor de token no painel.** O painel passa a ter dois
  estados: deslogado (só a tela de Login) e logado (o shell da spec 001, com todas as
  chamadas carregando o `Authorization`). Um 401 em qualquer chamada limpa o token e volta ao
  Login.

O "usuário" da fatia de backend é a própria equipe da AEN operando o painel, e as plataformas
de origem chamando webhooks. O sucesso é medido por: nenhuma rota de negócio das specs 004+
precisa reimplementar autenticação; toda rota nova nasce protegida sem o autor fazer nada; e
um segredo ausente nunca sobe silenciosamente para um ambiente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operador da equipe entra no painel e passa a fazer chamadas autenticadas (Priority: P1)

Uma pessoa da equipe abre o painel, vê a tela de Login, informa o **ID e o segredo de
serviço** (as mesmas credenciais para todo mundo, distribuídas fora de banda), e entra. A
partir daí, toda requisição que o painel faz à API carrega um token de portador, e a API
responde normalmente. Se ela fecha e reabre o navegador dentro da validade do token, continua
logada; passada a validade, o painel a reconduz ao Login.

**Why this priority**: é o caminho feliz que destrava **todo** o resto do produto. Sem ele,
nenhuma tela das specs 004+ tem como carregar dados. É o MVP da spec: só isso já entrega
valor (painel utilizável e fechado).

**Independent Test**: com as credenciais de serviço configuradas, chamar `POST /auth/token`
com o par correto e receber um token válido; usar esse token num `GET` protegido e receber
200; no painel, fazer login pela tela e confirmar que uma tela protegida carrega dados.

**Acceptance Scenarios**:

1. **Given** as credenciais de serviço configuradas no ambiente, **When** o painel envia
   `POST /auth/token` com `client_id` e `client_secret` corretos, **Then** a resposta é 200
   com um token de portador e a indicação de quando ele expira.
2. **Given** um token recém-emitido, **When** o painel chama qualquer rota protegida com
   `Authorization: Bearer <token>`, **Then** a rota responde normalmente (não 401).
3. **Given** `POST /auth/token` com `client_id` ou `client_secret` errado, **When** a
   requisição é processada, **Then** a resposta é 401 com corpo genérico ("credenciais
   inválidas"), **sem** revelar qual dos dois campos falhou e **sem** vazar tempo de
   processamento que permita distinguir os casos.
4. **Given** a tela de Login do painel, **When** a pessoa informa credenciais corretas e
   confirma, **Then** ela é levada ao shell do painel e uma tela protegida carrega dados sem
   novo pedido de login.
5. **Given** uma pessoa logada no painel, **When** ela fecha e reabre o navegador dentro da
   validade do token, **Then** ela continua logada e não vê a tela de Login.
6. **Given** a tela de Login, **When** a pessoa informa credenciais incorretas, **Then** vê
   uma mensagem de erro clara, permanece na tela de Login e nenhum token é guardado.

---

### User Story 2 - A API recusa qualquer acesso não autenticado, com uma allowlist pública explícita (Priority: P1)

Qualquer requisição a uma rota de negócio sem um token válido é recusada com 401 — token
ausente, malformado, com assinatura inválida, expirado ou emitido por outra chave. Um
conjunto **curto e explícito** de rotas continua público: a verificação de saúde e o próprio
endpoint de emissão de token, além das rotas de webhook (que têm o seu próprio mecanismo).

**Why this priority**: "fechado por padrão" é o valor de segurança central da spec. Vale P1
junto com a US1 porque um sem o outro não entrega: emitir token sem fechar a API não protege
nada.

**Independent Test**: chamar uma rota protegida sem cabeçalho, com um token lixo, com um
token expirado e com um token assinado por outra chave — todos devem dar 401; chamar
`/health` e `POST /auth/token` sem token — devem funcionar.

**Acceptance Scenarios**:

1. **Given** nenhuma credencial, **When** se chama uma rota protegida sem `Authorization`,
   **Then** a resposta é 401 e o corpo não vaza detalhe interno (stack, nome de classe).
2. **Given** um token expirado, **When** ele é usado numa rota protegida, **Then** a resposta
   é 401 e a razão registrada internamente distingue "expirado" de "assinatura inválida"
   (sem expor isso no corpo).
3. **Given** um token com assinatura que não bate com `SERVICE_JWT_SECRET`, **When** ele é
   usado, **Then** a resposta é 401.
4. **Given** o cabeçalho `Authorization` presente mas sem o prefixo `Bearer ` (ou com o
   token vazio), **When** a requisição chega, **Then** a resposta é 401.
5. **Given** a rota `/health`, **When** ela é chamada sem token, **Then** responde
   normalmente (200/503 conforme o banco) — continua pública.
6. **Given** `POST /auth/token`, **When** é chamado sem token, **Then** é processado
   normalmente — ele não pode exigir o token que emite.
7. **Given** uma rota nova adicionada por uma spec futura sem nenhuma anotação de
   autenticação, **When** ela é chamada sem token, **Then** o padrão é 401 (protegida por
   omissão) — tornar uma rota pública é um ato explícito e revisável.

---

### User Story 3 - Uma plataforma de origem autentica um webhook por token de conta, sem tocar no JWT (Priority: P2)

Cada uma das 7 contas de origem tem um **token de webhook próprio** (`<PLATAFORMA>_WEBHOOK_TOKEN`).
Quando uma rota de webhook existir (specs 019+), ela vai verificar esse token — por
comparação em tempo constante — e ignorar por completo o mecanismo de JWT de serviço. Um
token de webhook ausente na configuração de uma conta significa "webhooks daquela conta
desabilitados", não "qualquer requisição passa".

**Why this priority**: P2 porque não há rota de webhook nesta spec — o entregável é a
**primitiva** de verificação, isolada e testada, pronta para as specs de adapter plugarem.
Sem ela, cada adapter (019–022) reinventaria a checagem de token e a comparação constante.

**Independent Test**: exercitar a primitiva de verificação diretamente com: token correto da
conta → aceita; token errado → recusa; conta sem token configurado → recusa (não "aceita
tudo"); e confirmar que a comparação não retorna mais cedo no primeiro byte divergente.

**Acceptance Scenarios**:

1. **Given** a conta `Guru PRD` com `GURU_PRD_WEBHOOK_TOKEN` configurado, **When** a
   primitiva verifica uma requisição que traz esse mesmo token, **Then** o resultado é
   "autenticado" para a conta `Guru PRD`.
2. **Given** a mesma conta, **When** a requisição traz um token diferente, **Then** o
   resultado é "recusado" e nada indica quão perto o token esteve do correto.
3. **Given** uma conta **sem** `*_WEBHOOK_TOKEN` configurado, **When** uma requisição de
   webhook para ela é verificada, **Then** o resultado é "recusado" (webhooks daquela conta
   estão efetivamente desligados).
4. **Given** duas contas com tokens diferentes, **When** a requisição de uma traz o token da
   outra, **Then** o resultado é "recusado" (o token é escopado à conta, não global).
5. **Given** a verificação de token de webhook, **When** ela roda, **Then** não usa nem
   depende do `SERVICE_JWT_SECRET` nem do guard de JWT — são mecanismos separados.

---

### User Story 4 - O processo se recusa a subir sem as credenciais de serviço (Priority: P2)

Quem faz o _deploy_ (ou roda local) precisa saber **no boot**, não em produção, que uma
credencial essencial está faltando. Com `SERVICE_JWT_SECRET`, `SERVICE_CLIENT_ID` ou
`SERVICE_CLIENT_SECRET` ausente ou fraca demais, o processo aborta imediatamente informando
**qual** variável e **por quê**, e não atende nenhuma requisição.

**Why this priority**: P2 — é uma rede de segurança de configuração, não um fluxo de usuário,
mas é barata e evita a pior falha possível (API "aberta" porque o segredo veio vazio e o
código assumiu um default).

**Independent Test**: subir o processo com cada uma das três variáveis ausente, uma de cada
vez, e com `SERVICE_JWT_SECRET` curto demais; confirmar que cada caso aborta com mensagem que
nomeia a variável; subir com todas presentes e válidas e confirmar que atende.

**Acceptance Scenarios**:

1. **Given** `SERVICE_JWT_SECRET` ausente, **When** o processo inicia, **Then** ele aborta
   antes de aceitar conexões, com uma mensagem que contém `SERVICE_JWT_SECRET`.
2. **Given** `SERVICE_CLIENT_ID` ou `SERVICE_CLIENT_SECRET` ausente, **When** o processo
   inicia, **Then** ele aborta com uma mensagem que nomeia a variável faltante.
3. **Given** `SERVICE_JWT_SECRET` com menos que o mínimo de comprimento exigido, **When** o
   processo inicia, **Then** ele aborta com uma mensagem sobre comprimento mínimo — nunca
   assume nem completa o segredo.
4. **Given** as três variáveis presentes e válidas (em qualquer ambiente, inclusive
   `test`), **When** o processo inicia, **Then** ele sobe normalmente.
5. **Given** o `.env.example` da raiz, **When** ele é consultado, **Then** as três chaves
   aparecem documentadas, sem valores reais, marcadas como obrigatórias.

---

### User Story 5 - A sessão expira e o painel reconduz ao Login sem travar (Priority: P3)

Quando o token do painel expira (ou é rejeitado por qualquer motivo), a próxima chamada à API
volta 401. O painel detecta isso de forma central, descarta o token guardado e leva a pessoa
de volta à tela de Login com um aviso curto ("sua sessão expirou, entre novamente") — sem
tela branca, sem laço de requisições repetidas, sem erro cru na interface.

**Why this priority**: P3 — é polimento de robustez do caminho da US1. O sistema é usável sem
o aviso bonito, mas com ele a expiração de 12h não vira um chamado de suporte.

**Independent Test**: no painel logado, substituir o token guardado por um expirado, disparar
uma chamada e confirmar: uma única transição para o Login, token descartado, aviso exibido,
nenhuma tempestade de retries.

**Acceptance Scenarios**:

1. **Given** o painel logado com um token expirado, **When** qualquer chamada à API retorna
   401, **Then** o painel descarta o token e navega para o Login uma única vez.
2. **Given** várias chamadas em paralelo que retornam 401 juntas, **When** o interceptor as
   trata, **Then** há **uma** transição para o Login, não uma por resposta.
3. **Given** a pessoa reconduzida ao Login por expiração, **When** ela entra de novo com as
   credenciais corretas, **Then** volta ao painel e a ação interrompida pode ser refeita
   manualmente (sem replay automático nesta versão).
4. **Given** um 401 vindo especificamente de `POST /auth/token` (credencial errada no
   próprio login), **When** o interceptor o vê, **Then** ele **não** dispara o fluxo de
   "sessão expirou" — o erro fica na tela de Login como "credenciais inválidas".

---

### Edge Cases

- **Relógio fora de sincronia**: um token com `exp`/`nbf`/`iat` ligeiramente à frente do
  relógio do servidor por _clock skew_ deve ser aceito dentro de uma tolerância pequena e
  documentada (ex.: 60 s); fora dela, 401.
- **`Authorization` duplicado ou com espaços extras**: cabeçalho repetido, `Bearer` com
  caixa diferente (`bearer`), múltiplos espaços — a política de aceitação é explícita e
  testada (recomendado: aceitar `Bearer` case-insensitive no esquema, recusar cabeçalho
  repetido).
- **Token válido na assinatura mas sem os claims esperados** (falta `sub`/`iss`, ou `iss`
  de outro emissor): 401.
- **`POST /auth/token` com corpo ausente, campos vazios ou tipo de conteúdo inesperado**:
  400 (requisição malformada) — distinto de 401 (credencial errada).
- **Rate limiting disparado**: chamadas repetidas a `POST /auth/token` de um mesmo IP num
  curto intervalo recebem 429 com `Retry-After`; o painel mostra "muitas tentativas, aguarde".
- **`SERVICE_JWT_SECRET` rotacionado**: tokens emitidos com o segredo anterior passam a dar
  401 na hora; o painel trata como expiração (US5). Não há período de graça / duas chaves
  nesta versão.
- **`localStorage` indisponível** (navegador restrito, aba privada com storage bloqueado):
  o painel degrada para sessão só em memória e avisa que o login não vai persistir entre
  abas/reinícios; nunca quebra.
- **Chamada a uma rota inexistente sem token**: 401 do guard antes do 404 — não confirmar a
  existência de rotas a quem não está autenticado (exceto nas rotas da allowlist).
- **Webhook sem cabeçalho de token nenhum**: recusado como qualquer token errado, sem
  detalhar o que faltou.

## Requirements *(mandatory)*

### Functional Requirements

#### Emissão de token (`POST /auth/token`)

- **FR-001**: O sistema MUST expor um endpoint `POST /auth/token` que aceita um `client_id`
  e um `client_secret` no corpo da requisição e, se ambos baterem exatamente com
  `SERVICE_CLIENT_ID` e `SERVICE_CLIENT_SECRET`, responde 200 com um token de portador
  assinado e a informação de expiração (instante ou duração em segundos).
- **FR-002**: A comparação de `client_id` e `client_secret` MUST ser feita em **tempo
  constante** (não retornar mais cedo no primeiro caractere divergente) e a resposta de
  falha MUST ser genérica (401, "credenciais inválidas"), sem indicar qual campo falhou.
- **FR-003**: O token emitido MUST ser _stateless_: validável apenas pela assinatura
  (`SERVICE_JWT_SECRET`) e pelos seus claims temporais, sem consultar nenhuma linha de
  banco. O sistema MUST NOT persistir o token, uma sessão, nem um registro de emissão em
  tabela nesta spec.
- **FR-004**: O token MUST carregar, no mínimo: um identificador de assunto estável para a
  credencial de serviço (`sub`), um emissor (`iss`) fixo do próprio sistema, o instante de
  emissão (`iat`) e o instante de expiração (`exp`).
- **FR-005**: O tempo de vida do token MUST ser **12 horas** por padrão, configurável por
  variável de ambiente (`SERVICE_JWT_TTL`), com um **teto rígido de 24 horas** — um valor
  configurado acima do teto aborta o boot (FR-008).
- **FR-006**: `POST /auth/token` MUST NOT emitir _refresh token_ nem qualquer credencial de
  longa duração nesta versão. Expirado o token, o cliente re-autentica com `client_id` /
  `client_secret`.
- **FR-007**: `POST /auth/token` com corpo ausente, campos vazios/ausentes ou
  `Content-Type` não suportado MUST responder 400 (malformada), distinguível do 401
  (credencial inválida).
- **FR-007a**: `POST /auth/token` MUST aplicar _rate limiting_ por IP de origem (janela
  curta, contagem pequena) e responder 429 com `Retry-After` quando excedido. Bloqueio
  progressivo / lockout de conta é **fora de escopo** desta spec (spec 055).

#### Guard de autenticação e allowlist

- **FR-008**: Toda rota da API MUST ser protegida **por padrão**: exigir
  `Authorization: Bearer <jwt>` com assinatura válida (`SERVICE_JWT_SECRET`), não expirado,
  `nbf`/`iat` coerentes (com tolerância de _clock skew_ ≤ 60 s) e `iss` igual ao emissor
  esperado. Falha em qualquer verificação → 401.
- **FR-009**: As respostas 401 MUST ter corpo genérico e estável, **sem** vazar detalhe
  interno (stack trace, nome de classe, motivo específico "expirado" vs "assinatura"). O
  motivo específico MAY ser registrado apenas no log interno.
- **FR-010**: O sistema MUST manter uma **allowlist explícita e curta** de rotas públicas
  (sem exigir token): `GET /health`, `POST /auth/token`, e o prefixo `/webhooks/*`
  (reservado para as specs 019+). Qualquer outra rota é protegida.
- **FR-011**: Marcar uma rota como pública MUST ser um ato explícito no código (anotação /
  decorator dedicado ou entrada na allowlist central), **revisável em diff**. Uma rota sem
  marcação nenhuma é protegida.
- **FR-012**: O guard MUST rodar antes da resolução de rota a ponto de **não confirmar a
  existência** de rotas protegidas a quem não está autenticado (um caminho inexistente sob
  área protegida retorna 401, não 404).
- **FR-013**: O cabeçalho `Authorization` MUST ser interpretado com regra explícita: esquema
  `Bearer` aceito _case-insensitive_, exatamente um espaço separador tolerado com
  _trimming_, token vazio → 401, cabeçalho `Authorization` repetido → 401.

#### Verificação de token de webhook (primitiva)

- **FR-014**: O sistema MUST fornecer uma primitiva reaproveitável que, dada uma conta de
  origem (`PlataformaOrigem`) e um token candidato, retorne um resultado explícito
  "autenticado para a conta X" ou "recusado", comparando em **tempo constante** contra
  `<PLATAFORMA>_WEBHOOK_TOKEN`.
- **FR-015**: Se a conta não tem `*_WEBHOOK_TOKEN` configurado, a primitiva MUST retornar
  "recusado" (nunca "aceita qualquer coisa"). O token é **escopado à conta**: o token da
  conta A não autentica a conta B.
- **FR-016**: A verificação de webhook MUST ser independente do JWT de serviço — não usa
  `SERVICE_JWT_SECRET`, não passa pelo guard de FR-008, e vive num utilitário separado. Não
  há rota `/webhooks/*` criada nesta spec.

#### Configuração tipada (promoção a obrigatória)

- **FR-017**: `SERVICE_JWT_SECRET`, `SERVICE_CLIENT_ID` e `SERVICE_CLIENT_SECRET` MUST
  passar de opcionais a **obrigatórias** no schema de config tipada, validadas no boot. Em
  **todos** os ambientes, inclusive `NODE_ENV=test`.
- **FR-018**: A validação MUST impor mínimos de robustez: `SERVICE_JWT_SECRET` com
  comprimento mínimo (≥ 32 caracteres), `SERVICE_CLIENT_SECRET` com mínimo (≥ 16). Valor
  ausente ou abaixo do mínimo aborta o boot com mensagem que **nomeia a variável** e o
  motivo. Nunca há default silencioso.
- **FR-019**: O contrato de config exposto pelo `core` (Padrão Transversal: o `core` é dono
  do contrato tipado) MUST refletir essas chaves como presentes e não-opcionais para o
  código consumidor.
- **FR-020**: O `.env.example` da raiz e a documentação de setup MUST listar as chaves
  novas/promovidas, sem valores reais, marcadas como obrigatórias, incluindo `SERVICE_JWT_TTL`
  (opcional, com o default e o teto documentados).

#### Painel — Login e sessão

- **FR-021**: O painel MUST ter dois estados de nível superior: **deslogado** (só a tela de
  Login é acessível; qualquer rota do painel redireciona para o Login) e **logado** (o shell
  da spec 001 com navegação).
- **FR-022**: A tela de Login MUST coletar `client_id` e `client_secret`, chamar
  `POST /auth/token`, e em caso de sucesso guardar o token e levar ao shell. O campo de
  segredo MUST ser mascarado.
- **FR-023**: Em caso de falha de login (401 do `POST /auth/token`), o painel MUST exibir
  uma mensagem genérica ("credenciais inválidas"), permanecer no Login, e **não** guardar
  token. Em caso de 429, exibir "muitas tentativas, aguarde".
- **FR-024**: O token MUST ser guardado em `localStorage` e reaproveitado em novas abas e
  após reiniciar o navegador enquanto estiver dentro da validade. Se `localStorage` estiver
  indisponível, o painel MUST degradar para sessão em memória e avisar que o login não
  persiste.
- **FR-025**: O painel MUST decodificar a expiração do token para, de forma proativa, tratar
  como deslogado um token já vencido (sem precisar de uma chamada falhar primeiro).
- **FR-026**: O painel MUST NOT registrar o `client_secret` nem o token em log do
  navegador, telemetria ou URL. O token só trafega no cabeçalho `Authorization`.

#### Painel — Interceptor

- **FR-027**: Toda chamada à API feita pelo painel (camada de dados do TanStack Query e
  qualquer `fetch` direto) MUST passar por um ponto único que injeta
  `Authorization: Bearer <token>` quando há token.
- **FR-028**: Uma resposta 401 de **qualquer** chamada que **não** seja `POST /auth/token`
  MUST, de forma centralizada: descartar o token guardado, cancelar/curto-circuitar chamadas
  em andamento, e navegar para o Login **uma única vez** (várias 401 simultâneas → uma
  transição), exibindo "sua sessão expirou, entre novamente".
- **FR-029**: O interceptor MUST NOT tentar _refresh_ nem _replay_ automático da requisição
  que falhou nesta versão — a pessoa refaz a ação manualmente após relogar.
- **FR-030**: Um 401 originado de `POST /auth/token` MUST ser tratado só como erro de
  credencial na tela de Login, sem acionar o fluxo de "sessão expirou".

#### Observabilidade e auditoria

- **FR-031**: O sistema MUST registrar em log estruturado, sem dados sensíveis (nunca o
  segredo nem o token): emissões de token bem-sucedidas (com o `sub` e o `exp`), falhas de
  autenticação em `POST /auth/token` (com IP e motivo), rejeições do guard (com rota e
  motivo interno) e disparos de _rate limiting_.
- **FR-032**: O boot MUST logar, uma vez, que a autenticação de serviço está ativa e qual o
  TTL efetivo do token — sem imprimir o segredo.

### Key Entities *(inclui só o que envolve dados)*

- **Credencial de serviço**: o par `client_id` + `client_secret` que representa "o painel da
  equipe". Não é uma linha de banco — vive na configuração (`.env`). Um único par, um único
  nível de acesso. A spec 004 (RBAC) introduz papéis por cima disto.
- **Token de acesso de serviço (JWT)**: artefato efêmero, não persistido. Claims mínimos:
  `sub` (identificador da credencial de serviço), `iss` (emissor fixo do sistema), `iat`,
  `exp` (≤ 24 h após `iat`). Assinado com `SERVICE_JWT_SECRET` (segredo simétrico).
- **Token de webhook por conta**: um segredo por `PlataformaOrigem`
  (`<PLATAFORMA>_WEBHOOK_TOKEN`), já no schema de config desde a spec 001. Ausência =
  webhooks daquela conta desabilitados. Escopado à conta.
- **Allowlist de rotas públicas**: lista central e curta de rotas isentas do guard de JWT
  (`GET /health`, `POST /auth/token`, prefixo `/webhooks/*`). Alterá-la é um _diff_
  revisável.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa da equipe com as credenciais corretas conclui o login e vê uma
  tela protegida do painel carregando dados em **menos de 15 segundos**, sem passos além de
  informar ID e segredo.
- **SC-002**: **100%** das rotas de negócio existentes e futuras respondem 401 sem um token
  válido; a única exceção é a allowlist de 3 entradas (`/health`, `/auth/token`,
  `/webhooks/*`), verificável por um teste que enumera as rotas registradas.
- **SC-003**: Uma rota recém-criada, sem nenhuma anotação de autenticação, é recusada sem
  token em **100%** dos casos (protegida por omissão) — demonstrado por um teste de
  regressão com uma rota-isca.
- **SC-004**: O processo **não sobe** em nenhum ambiente com qualquer uma das três
  credenciais de serviço ausente ou fraca; a mensagem de aborto nomeia a variável em
  **100%** dos casos testados (3 ausências + 1 segredo curto).
- **SC-005**: Nenhuma resposta 401/403 do sistema inclui _stack trace_, nome de classe
  interno ou a distinção "expirado vs assinatura inválida" — verificado por inspeção dos
  corpos de erro em todos os cenários de teste.
- **SC-006**: A verificação de token de webhook recusa **100%** das requisições para contas
  sem token configurado e **100%** das que usam o token de outra conta, em teste unitário
  isolado.
- **SC-007**: Após a expiração do token, o painel reconduz ao Login com no máximo **uma**
  transição de rota, independentemente de quantas chamadas simultâneas receberam 401 —
  verificável por um teste de componente que dispara N chamadas.
- **SC-008**: Um segredo de serviço ou token de acesso **nunca** aparece em log do backend,
  console do navegador, telemetria ou URL — verificado por varredura dos artefatos de log
  dos testes.
- **SC-009**: A cobertura de teste da fatia de backend (emissão, guard, allowlist,
  primitiva de webhook, boot) roda **sem banco** para as partes puras e contra Postgres real
  só onde a rota exige o app completo, seguindo a disciplina de teste da constituição.

## Assumptions

- **Distribuição das credenciais de serviço é fora de banda** (cofre / canal seguro da
  equipe). Esta spec não cobre como o `client_id`/`client_secret` chega às pessoas.
- **Um único par de credenciais para toda a equipe** — coerente com "um único nível de
  acesso" da spec 001. Diferenciação de pessoas e papéis é a spec 004 (RBAC), que estende
  este guard sem reescrevê-lo.
- **Segredo simétrico (HS\*)** para assinar o JWT, derivado de `SERVICE_JWT_SECRET`. Não há
  requisito de chave assimétrica / JWKS nesta versão (nenhum verificador terceiro).
- **Rotação de `SERVICE_JWT_SECRET` é disruptiva por design**: invalida todos os tokens na
  hora; os painéis tratam como expiração. Sem janela de duas chaves na v1.
- **As rotas `/webhooks/*` não existem ainda** — o prefixo já entra na allowlist e a
  primitiva de verificação já é entregue e testada, para as specs 019–022 plugarem.
- **O harness de teste e a CI passarão a definir** `SERVICE_JWT_SECRET`, `SERVICE_CLIENT_ID`
  e `SERVICE_CLIENT_SECRET` de fixture, já que a validação passa a ser obrigatória em
  `NODE_ENV=test`.
- **Portas**: nenhuma porta nova. O backend segue em `3001` e o frontend em `5174`
  (configuráveis, spec 001). Esta spec não abre serviço novo.
- **`localStorage` é aceitável para um painel interno de nível único** (CL-02); o
  _hardening_ de segurança de ponta a ponta (reavaliar armazenamento de token, CSP, rate
  limiting robusto) é a spec 055.
- **Sem CAPTCHA / MFA** nesta versão — credencial de serviço, não conta de pessoa.

## Dependencies

- **Spec 001 (bootstrap)**: o schema de config tipada (`env.schema`), o shell do frontend, o
  `GET /health` (que entra na allowlist), o harness de teste e2e contra Postgres real.
- **Spec 002 (core value objects)**: o `core` como **dono do contrato de config tipada**
  (re-export) e o enum `PlataformaOrigem` (7 contas) usado pela primitiva de token de
  webhook.
- **Consome desta spec**: **004 (RBAC)** estende o guard com papéis/permissões; **019–022
  (adapters)** plugam a primitiva de token de webhook nas rotas `/webhooks/*` reais; **toda
  spec com endpoint** (005+, 007+, 018+) herda "protegida por padrão" sem trabalho extra;
  **055 (hardening)** endurece _rate limiting_, revisita armazenamento de token e a proteção
  de webhook.

## Out of Scope

- Cadastro de pessoas usuárias, senhas individuais, papéis, permissões granulares (spec 004).
- _Refresh tokens_, sessões no servidor, _logout_ com revogação server-side, lista de
  bloqueio de tokens.
- Rotas `/webhooks/*` de verdade e o parsing de payload de qualquer plataforma (specs
  019–022).
- Autenticação da **aluna** no portal da Central de Clientes — mecanismo distinto, spec 045.
- _Single sign-on_, OAuth2 com provedor externo, MFA, CAPTCHA, JWKS / chave assimétrica.
- _Rate limiting_ robusto, lockout progressivo, CSP, cabeçalhos de segurança HTTP
  abrangentes, política de retenção de log de autenticação (spec 055).
- Auditoria persistida em tabela `_audit` de eventos de autenticação (a spec 002 entregou só
  o **contrato** de auditoria; persistir é 053).
