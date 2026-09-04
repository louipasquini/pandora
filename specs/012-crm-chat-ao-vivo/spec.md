# Feature Specification: CRM · Chat ao Vivo

**Feature Branch**: `012-crm-chat-ao-vivo`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "012-crm-chat-ao-vivo: inbox de atendimento ao vivo do CRM (visão
Parte 8.5/8.12). Escopo: fila de atendimento com priorização, endereçamento automático de uma
conversa entrando na fila para um atendente, transferência de conversa entre
atendentes/equipes preservando o contexto, CSAT pós-atendimento, resposta automática fora do
expediente (reusa `estaEmExpediente` da spec 007), SLA de primeira resposta + alerta, log de
auditoria de quem respondeu (com ou sem IA). Constrói **sobre** a timeline de `interacao`
unificada (spec 009) e os canais já conectados (WhatsApp, spec 011) — não é uma tabela de
mensagens paralela. Decisões já resolvidas com o dono do produto em 2026-09-04: endereçamento
por carga/disponibilidade (não aleatório, não round robin puro) e volume esperado baixo (até
~10 conversas simultâneas, sem necessidade de infraestrutura de fila/broker)."

## Clarifications

### Session 2026-09-04

- Q: **CL-01** — Como o sistema decide para qual atendente encaminhar uma conversa que acabou
  de entrar na fila? → A: **Por carga/disponibilidade.** Entre os atendentes disponíveis
  (dentro do expediente da equipe de atendimento de plantão — reusa `estaEmExpediente` da
  spec 007), o sistema escolhe o que tem **menos conversas em andamento no momento** — nunca
  aleatório, nunca round robin puro. É sempre um **cálculo derivado** no instante da
  atribuição (Princípio V — nenhum contador de carga é persistido; a carga é sempre contada a
  partir do estado atual das conversas abertas).
- Q: **CL-02** — Qual o volume esperado de atendimento simultâneo, para dimensionar a
  arquitetura da fila? → A: **Baixo — até ~10 conversas simultâneas.** Não há necessidade de
  infraestrutura de fila/broker de mensagens, nem de otimização prematura de índice ou
  particionamento; um modelo relacional direto, com índices comuns sobre `status`/
  `atendente_atual_id`/`aberto_em`, é suficiente. Esta suposição é herdada pela spec 015
  (Disparos), que dimensiona volume de envio em massa a partir da mesma referência.

### Decisões já tomadas nesta spec (padrões razoáveis, sem pergunta ao dono do produto)

- **D-01 — Conversa é uma camada sobre `interacao`, não uma tabela paralela**: uma
  "conversa"/`atendimento` agrupa uma sequência já existente de linhas `interacao` (a
  timeline unificada e agnóstica de canal da spec 009) através de uma coluna opcional
  `atendimento_id` em `interacao` — a mesma disciplina de anexar uma FK direta ao invés de
  criar um segundo fluxo de mensagens, já usada por `mensagem_whatsapp` (011) como detalhe
  1:1 de uma interação. O canal WhatsApp (011) continua sendo o único produtor automático de
  interações de entrada nesta spec; um `atendimento` de canal `MANUAL` (ligação registrada
  manualmente, por exemplo) também é suportado, sem provedor externo.
- **D-02 — CSAT reaproveita `interacao` tipo `NPS`**: em vez de uma entidade nova para a
  pesquisa de satisfação, a resposta do CSAT é registrada como uma interação do tipo `NPS`
  já existente desde a 009 (`nota_nps` 0–10), marcada com o `atendimento_id` correspondente —
  o mesmo campo, sem duplicar conceito. `Atendimento.csatSolicitadoEm` marca quando a pesquisa
  foi disparada; a resposta é encontrada por leitura (`atendimento_id` + `tipo = NPS`), nunca
  copiada para uma segunda coluna.
- **D-03 — Auditoria "quem respondeu, com/sem IA" é histórico de 1ª classe**: cada resposta
  enviada por um atendente dentro de um atendimento gera uma linha em
  `resposta_atendimento` (1:1 com a interação de saída correspondente — mesmo padrão de
  `mensagem_whatsapp`/`oportunidade_movimentacao`), guardando quem respondeu e se a resposta
  foi assistida por IA. **Não** reaproveita `crm_admin_audit` (que é para configuração
  administrativa, não para o conteúdo de negócio de cada resposta) — mesma justificativa que
  a spec 010 usou para `oportunidade_movimentacao` não ser o audit genérico. Transferências
  seguem o mesmo raciocínio: `transferencia_atendimento` é um histórico append-only de 1ª
  classe, não uma entrada de audit genérica.
- **D-04 — Resposta automática fora do expediente**: reusa exclusivamente
  `estaEmExpediente` (spec 007) — nenhum segundo conceito de expediente é criado. O texto da
  mensagem automática é configurável por equipe (`Equipe.mensagemForaExpediente`, opcional);
  quando nenhuma equipe de atendimento em operação tem esse texto configurado, nenhuma
  mensagem automática é enviada (a conversa ainda entra na fila normalmente). A mensagem
  automática só é enviada uma vez por atendimento (idempotente) e **não conta** como a
  primeira resposta humana para efeito de SLA.
- **D-05 — SLA e alerta são sempre derivados, sem job de fundo**: dado o volume baixo (CL-02),
  o estouro de SLA de primeira resposta é **calculado a cada leitura** (mesmo espírito do
  `slaEstourado`/`esfriando` derivados da spec 010), nunca uma coluna persistida nem um
  contador. O "alerta" é o próprio indicador visível na fila/inbox, recalculado a cada
  consulta — não há necessidade de um `WorkerScheduler` (padrão da spec 006) rodando em
  intervalo para este volume; se o volume crescer no futuro a ponto de exigir notificação
  ativa (e-mail/Slack/push), isso é uma decisão de uma spec futura, não desta.
  Endereçamento (CL-01) segue o mesmo espírito de "sempre calculado", nunca round robin com
  cursor persistido — a carga é contada a partir de `atendimento.status = EM_ATENDIMENTO`
  no momento da atribuição.
- **D-06 — Priorização da fila**: cada `atendimento` tem uma `prioridade` explícita
  (`NORMAL` default | `ALTA` | `URGENTE`), ajustável manualmente por quem tem permissão de
  atender; a ordenação da fila é por prioridade decrescente e, dentro da mesma prioridade,
  por ordem de chegada (FIFO) — sem heurística automática de prioridade nesta spec.
- **D-07 — Escopo de equipe do roteamento**: o roteamento por carga considera apenas
  membros ativos de equipes com `tipo = ATENDIMENTO` (enum já existente desde a 007) que
  estejam em expediente no momento — reaproveita o campo que a 007 já modelou exatamente
  para esse propósito, sem introduzir um novo tipo de equipe.
- **D-08 — Zero dependências novas**: todo o roteamento, SLA e fila são funções puras em
  TypeScript sobre dados já modelados; o envio de mensagens continua saindo pelo
  `EnvioWhatsappService`/`GraphApiClient` já existentes da spec 011 (`fetch` nativo). Nenhuma
  biblioteca nova em nenhum dos dois workspaces.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Uma conversa que chega é automaticamente colocada com o atendente certo (Priority: P1)

Uma aluna manda uma mensagem de WhatsApp. Em vez de ficar perdida na timeline geral, essa
conversa é reconhecida como um atendimento novo (ou a continuação de um já aberto) e, se
houver alguém disponível na equipe de atendimento naquele momento, é automaticamente
endereçada para quem está com menos conversas em andamento — sem sorteio, sem fila manual.

**Why this priority**: é o alicerce de todo o resto — sem endereçamento automático, o "chat
ao vivo" é só a timeline da 009 com um nome diferente. Toda spec futura de atendimento
depende deste comportamento existir primeiro.

**Independent Test**: com dois atendentes em expediente, um já com uma conversa em
andamento e outro livre, enviar uma nova mensagem de um número desconhecido e verificar que
o atendimento é endereçado ao atendente livre (menor carga), aparecendo na fila desse
atendente em poucos segundos.

**Acceptance Scenarios**:

1. **Given** dois atendentes em expediente com cargas diferentes (1 conversa em andamento
   vs. nenhuma), **When** uma nova conversa entra na fila, **Then** ela é endereçada ao
   atendente com a menor carga no momento.
2. **Given** nenhum atendente da equipe de atendimento está em expediente no momento,
   **When** uma nova conversa chega, **Then** ela permanece na fila sem atendente
   atribuído, visível para quem tem permissão de ver a fila geral.
3. **Given** uma conversa já em andamento com um atendente, **When** chega uma nova
   mensagem da mesma pessoa pelo mesmo canal, **Then** a mensagem é anexada ao atendimento
   já aberto — nenhum atendimento novo é criado nem endereçado de novo.

---

### User Story 2 - Atendente responde e conversa mostra alerta de SLA (Priority: P1)

Um atendente abre a fila, vê as conversas aguardando ordenadas por prioridade e tempo de
espera, assume uma e responde. A partir do momento em que a conversa é aberta sem resposta,
um indicador mostra quanto tempo falta (ou já passou) do prazo de primeira resposta.

**Why this priority**: sem isso, a fila não orienta a equipe sobre o que atender primeiro —
é a diferença entre uma inbox de verdade e uma lista simples de conversas.

**Independent Test**: abrir uma conversa sem resposta há mais tempo que o prazo configurado
e verificar que ela aparece com o alerta de SLA estourado; responder e verificar que o
alerta desaparece imediatamente.

**Acceptance Scenarios**:

1. **Given** uma conversa aguardando sem nenhuma resposta humana há mais tempo que o prazo
   de SLA configurado, **When** a fila é consultada, **Then** essa conversa aparece marcada
   como SLA estourado.
2. **Given** uma conversa com SLA estourado, **When** um atendente envia a primeira
   resposta, **Then** o alerta some e a conversa passa a mostrar que já foi respondida.
3. **Given** uma conversa recém-aberta dentro do prazo, **When** a fila é consultada,
   **Then** ela mostra o tempo restante até o estouro, não um alerta.

---

### User Story 3 - Atendente transfere a conversa sem perder o histórico (Priority: P2)

No meio de um atendimento, o atendente percebe que o assunto é de outra equipe (ou está de
saída) e transfere a conversa para outro atendente ou para outra equipe, com um motivo
opcional. Quem recebe a conversa vê a timeline completa — nada foi perdido ou duplicado.

**Why this priority**: atendimento sem transferência trava o fluxo real de trabalho em
equipe, mas depende do endereçamento (P1) já existir para fazer sentido.

**Independent Test**: com uma conversa em andamento, transferi-la para outro atendente e
verificar que a conversa aparece na fila do novo atendente com a timeline completa (todas as
mensagens anteriores) e um registro do motivo da transferência.

**Acceptance Scenarios**:

1. **Given** uma conversa em andamento com o atendente A, **When** A a transfere para o
   atendente B com um motivo, **Then** a conversa passa a aparecer para B com a timeline
   completa e o motivo registrado no histórico da conversa.
2. **Given** uma conversa transferida para uma equipe (sem atendente específico), **When**
   há alguém disponível nessa equipe, **Then** ela é endereçada automaticamente dentro dessa
   equipe pela mesma regra de menor carga (CL-01); sem ninguém disponível, fica na fila
   dessa equipe.
3. **Given** uma conversa com 2 transferências anteriores, **When** alguém consulta o
   histórico da conversa, **Then** todas as transferências aparecem em ordem, sem que
   nenhuma mensagem da timeline tenha sido duplicada ou perdida no processo.

---

### User Story 4 - Aluna avalia o atendimento ao ser encerrado (Priority: P3)

Quando o atendente encerra a conversa, o sistema marca que uma pesquisa de satisfação pode
ser feita. Se a aluna responder com uma nota, essa nota fica associada ao atendimento
encerrado e visível para quem gerencia a equipe.

**Why this priority**: é um retorno de qualidade valioso, mas não bloqueia o atendimento em
si — por isso vem depois do fluxo central de fila/resposta/transferência.

**Independent Test**: encerrar um atendimento e registrar uma nota de CSAT para ele (via
resposta da aluna ou lançamento manual do atendente); verificar que a nota aparece associada
a esse atendimento específico e que uma segunda tentativa de registro é recusada.

**Acceptance Scenarios**:

1. **Given** um atendimento em andamento, **When** o atendente o encerra, **Then** o
   atendimento fica marcado como encerrado e elegível para receber uma nota de CSAT.
2. **Given** um atendimento encerrado elegível para CSAT, **When** uma nota é registrada
   para ele, **Then** essa nota fica visível no histórico do atendimento.
3. **Given** um atendimento que já recebeu uma nota de CSAT, **When** uma segunda tentativa
   de registro é feita, **Then** o sistema recusa, mantendo apenas a primeira nota.

---

### User Story 5 - Fora do expediente, quem escreve recebe um aviso automático (Priority: P3)

Uma aluna manda uma mensagem fora do horário de atendimento configurado. Em vez de silêncio
total, ela recebe automaticamente um aviso informando que a equipe vai responder no próximo
horário de expediente — sem que nenhum atendente precise agir.

**Why this priority**: melhora a experiência de quem escreve fora de hora, mas o sistema
funciona corretamente (a conversa entra na fila) mesmo sem esse aviso — por isso é a menor
prioridade.

**Independent Test**: configurar uma mensagem automática para a equipe de atendimento,
simular o recebimento de uma mensagem fora do expediente configurado e verificar que uma
resposta automática com esse texto é enviada uma única vez para aquele atendimento.

**Acceptance Scenarios**:

1. **Given** uma equipe de atendimento com uma mensagem automática configurada e nenhum
   horário de expediente aplicável no momento, **When** uma nova conversa chega por
   WhatsApp, **Then** essa mensagem automática é enviada como resposta uma única vez.
2. **Given** uma segunda mensagem da mesma pessoa chegando poucos minutos depois, ainda fora
   do expediente, **When** o sistema processa essa mensagem, **Then** nenhuma nova mensagem
   automática é enviada de novo (o atendimento já a recebeu).
3. **Given** nenhuma equipe de atendimento tem mensagem automática configurada, **When** uma
   conversa chega fora do expediente, **Then** ela entra na fila normalmente, sem aviso
   automático.

---

### Edge Cases

- Duas mensagens da mesma pessoa chegam quase simultaneamente antes de qualquer atendimento
  existir: apenas um atendimento é criado (idempotência pela mesma disciplina de chave já
  usada por `interacao`), nunca dois.
- Um atendente é removido da equipe (ou fica inativo) enquanto tem conversas em andamento:
  as conversas continuam atribuídas a ele até serem transferidas manualmente — a saída da
  equipe não desatribui automaticamente nada.
- Um atendimento é transferido para um atendente que, entre o pedido e a execução, deixou de
  estar em expediente: a transferência é aceita mesmo assim (transferência é uma ação
  explícita de quem está atendendo, não uma nova rodada de endereçamento automático).
- Uma conversa fica em `AGUARDANDO` por muito tempo sem que ninguém entre em expediente: o
  SLA aparece estourado indefinidamente até alguém assumi-la; nenhum encerramento automático
  acontece.
- Um atendimento é encerrado sem nenhuma mensagem de resposta humana ter sido enviada (SLA
  já estourado): o encerramento é permitido mesmo assim, e o CSAT continua elegível.
- A resposta de CSAT chega fora do formato esperado (texto livre em vez de uma nota
  numérica): a mensagem é registrada normalmente na timeline como uma interação comum,
  sem virar CSAT nem travar o fluxo.
- Uma pessoa com um atendimento aberto pede para excluir seus dados (LGPD, spec 047,
  futura): segue a mesma política do restante do sistema — pseudonimização de identificação
  mantendo o histórico do atendimento íntegro para auditoria.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST agrupar as interações de uma conversa contínua entre uma
  pessoa/lead e a equipe de atendimento sob um único atendimento, sem duplicar nem
  reescrever nenhuma interação já registrada na timeline unificada (spec 009).
- **FR-002**: Ao chegar uma mensagem de um canal já conectado (WhatsApp, spec 011) sem
  atendimento aberto correspondente, o sistema MUST criar automaticamente um novo
  atendimento associado à pessoa/lead correspondente; se já existir um atendimento aberto
  para essa pessoa/lead nesse canal, a mensagem MUST ser anexada a ele em vez de criar um
  novo.
- **FR-003**: Todo novo atendimento MUST entrar na fila com uma prioridade (padrão
  `NORMAL`, ajustável) e ser ordenado, para exibição, por prioridade decrescente e depois
  por ordem de chegada.
- **FR-004**: Ao entrar na fila, o sistema MUST tentar endereçar automaticamente o
  atendimento a um atendente disponível — membro ativo de uma equipe de atendimento que
  esteja em expediente no momento (reaproveitando o cálculo de expediente da spec 007) —
  escolhendo sempre quem tem a menor quantidade de atendimentos em andamento no momento do
  cálculo (CL-01); a escolha MUST ser recalculada a cada nova atribuição, nunca baseada em
  um contador persistido ou em rotação cega.
- **FR-005**: Quando nenhum atendente estiver disponível no momento em que um atendimento
  entra na fila, o sistema MUST mantê-lo sem atendente atribuído, visível para quem tem
  permissão de ver a fila geral, até que seja assumido manualmente ou endereçado numa
  tentativa futura.
- **FR-006**: Um usuário autorizado MUST poder assumir manualmente um atendimento que esteja
  na fila sem atendente.
- **FR-007**: Um usuário autorizado MUST poder transferir um atendimento em andamento para
  outro atendente específico ou para outra equipe, com um motivo opcional; a timeline
  completa do atendimento MUST continuar visível e íntegra para quem o recebe.
- **FR-008**: Toda transferência MUST gerar um registro histórico consultável (de quem/qual
  equipe, para quem/qual equipe, quando, motivo).
- **FR-009**: Quando um atendimento é transferido para uma equipe sem indicar um atendente
  específico, o sistema MUST tentar o mesmo cálculo de menor carga (FR-004) dentro dos
  membros disponíveis dessa equipe; sem ninguém disponível, o atendimento MUST permanecer na
  fila dessa equipe.
- **FR-010**: Cada atendimento MUST calcular, a qualquer momento da sua leitura, se o prazo
  de primeira resposta foi estourado — com base no horário de abertura do atendimento, no
  horário da primeira resposta humana (se já houve) e no prazo configurado — sem depender de
  um valor persistido que precise ser mantido em sincronia.
- **FR-011**: Um usuário autorizado MUST poder responder a um atendimento em andamento; toda
  resposta MUST gerar uma nova interação na timeline da pessoa/lead correspondente,
  associada ao mesmo atendimento.
- **FR-012**: A primeira resposta humana de um atendimento MUST ser registrada de forma
  distinguível (quem respondeu e se a resposta foi assistida por IA ou não) e MUST marcar o
  atendimento como tendo cumprido (ou não) o prazo de primeira resposta a partir daquele
  momento.
- **FR-013**: Toda resposta enviada dentro de um atendimento — não só a primeira — MUST
  registrar quem respondeu e se foi assistida por IA, formando um histórico consultável por
  atendimento.
- **FR-014**: Um usuário autorizado MUST poder encerrar um atendimento em andamento; ao
  encerrar, o atendimento MUST ficar marcado como elegível para receber uma pesquisa de
  satisfação (CSAT).
- **FR-015**: O sistema MUST permitir registrar uma nota de satisfação (CSAT) para um
  atendimento encerrado elegível, e MUST recusar uma segunda tentativa de registro para o
  mesmo atendimento.
- **FR-016**: Quando uma pessoa/lead responde com uma nota numérica dentro do canal
  conectado logo após o encerramento de um atendimento elegível para CSAT, o sistema MUST
  reconhecer essa resposta como a nota de satisfação daquele atendimento, em vez de tratá-la
  como uma mensagem comum.
- **FR-017**: Quando uma nova conversa chega fora do horário de expediente aplicável (mesmo
  cálculo da spec 007) e a equipe de atendimento correspondente tem uma mensagem automática
  configurada, o sistema MUST enviar essa mensagem automaticamente uma única vez por
  atendimento; sem mensagem configurada, o atendimento MUST entrar na fila normalmente, sem
  aviso.
- **FR-018**: A mensagem automática fora do expediente MUST NOT ser contabilizada como a
  primeira resposta humana para efeito de cumprimento de SLA.
- **FR-019**: Apenas usuários com a permissão apropriada MUST poder ver a fila/inbox de
  atendimento, sendo que o escopo MUST distinguir entre ver todos os atendimentos e ver
  apenas os atendimentos do próprio usuário — mesmo padrão de escopo já usado para leads e
  oportunidades.
- **FR-020**: Apenas usuários com a permissão apropriada MUST poder assumir, responder,
  transferir ou encerrar um atendimento.
- **FR-021**: Apenas usuários com a permissão apropriada MUST poder configurar o prazo de
  SLA e a mensagem automática fora do expediente de uma equipe.

### Key Entities *(include if feature involves data)*

- **Atendimento**: representa uma conversa/caso de atendimento contínuo com uma pessoa ou
  lead, por um canal específico — status (aguardando, em andamento, encerrado), prioridade,
  equipe e atendente atual, horário de abertura, horário da primeira resposta humana (se
  houve), prazo de SLA aplicável, horário de encerramento e motivo, e se já foi solicitada
  uma pesquisa de satisfação. É o agrupador de uma sequência de interações já existentes —
  nunca uma cópia delas.
- **Transferência de atendimento**: um registro histórico, append-only, de cada
  transferência de um atendimento — de quem/qual equipe para quem/qual equipe, quando, e o
  motivo informado.
- **Resposta de atendimento**: um registro histórico, um por resposta enviada dentro de um
  atendimento, ligado 1:1 à interação de saída correspondente — quem respondeu e se a
  resposta foi assistida por inteligência artificial ou não.
- **Nota de satisfação (CSAT)**: não é uma entidade nova — é a mesma interação de avaliação
  (tipo NPS) já suportada pela timeline unificada, associada ao atendimento que a originou.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma nova conversa chegando com pelo menos um atendente disponível é endereçada
  automaticamente ao atendente de menor carga em até alguns segundos, sem intervenção
  manual, em 100% dos casos observáveis em teste.
- **SC-002**: A fila de atendimento mostra, para toda conversa aguardando resposta, se o
  prazo de primeira resposta já foi estourado ou quanto tempo falta, sempre refletindo o
  estado real no momento da consulta (sem defasagem por valor desatualizado).
- **SC-003**: 100% das transferências preservam a timeline completa do atendimento — nenhuma
  mensagem é perdida ou duplicada, verificável comparando a timeline antes e depois da
  transferência.
- **SC-004**: Todo atendimento encerrado permite registrar exatamente uma nota de CSAT — uma
  segunda tentativa nunca é aceita.
- **SC-005**: Toda resposta enviada dentro de um atendimento é rastreável posteriormente até
  quem a enviou e se foi assistida por IA, sem exceção.
- **SC-006**: Fora do expediente configurado, uma pessoa que escreve pela primeira vez num
  atendimento recebe um aviso automático (quando configurado) em até 1 minuto, e nunca mais
  de uma vez para o mesmo atendimento.

## Assumptions

- Endereçamento por carga/disponibilidade e volume baixo (~10 conversas simultâneas) — ver
  Clarifications CL-01/CL-02, decisões do dono do produto de 2026-09-04.
- O único canal com criação automática de atendimento nesta spec é o WhatsApp (spec 011), já
  conectado; um atendimento de canal manual pode ser criado para registrar atendimento por
  outros meios (telefone, presencial), mas sem automação de entrada/roteamento por essa via.
- FAQ e sugestão de resposta por IA (spec 013) e disparo em massa/segmentação (spec 015)
  estão fora de escopo — esta spec só guarda **se** uma resposta foi assistida por IA
  (FR-013), sem implementar a geração da sugestão em si.
- Notificação ativa de estouro de SLA (e-mail, Slack, push) está fora de escopo — o alerta
  desta spec é o indicador visível na fila/inbox, recalculado a cada consulta (D-05).
- O prazo de SLA de primeira resposta é configurável por equipe de atendimento; sem
  configuração explícita, um valor padrão razoável é aplicado.
- A mesma pessoa pode ter, no máximo, um atendimento aberto (aguardando ou em andamento) por
  canal ao mesmo tempo — mensagens adicionais nesse canal se anexam ao atendimento aberto,
  nunca abrem um segundo.
