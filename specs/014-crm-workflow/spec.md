# Feature Specification: CRM · Workflow (Motor de Automação)

**Feature Branch**: `014-crm-workflow`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "014 — crm-workflow: motor de automação do CRM (visão Parte 8.8,
glossário 8.3, dado em 8.4 `fluxo_automacao`/`execucao_fluxo`). Fluxo de automação em blocos
gatilho → condição → ação, condições compostas E/OU, versionamento imutável (editar = nova
versão, versão publicada nunca muda), ambiente de teste/simulação antes de publicar, biblioteca
de automações prontas (templates de fluxo), triggers por eventos externos (ex.: pagamento
aprovado, inscrição em lançamento) e triggers internos do próprio CRM (mudança de estágio de
lead/oportunidade, nova interação, criação de lead, SLA estourado, tag aplicada). Idempotência:
reprocessar uma execução de fluxo não pode duplicar o efeito. Ações executáveis no MVP são as
que o sistema já sabe fazer hoje (mover lead de estágio, mover oportunidade de etapa, aplicar
tag, registrar interação/nota, marcar oportunidade como ganha). Frontend: editor visual de fluxo
+ biblioteca de templates + histórico de execuções."

## Clarifications

### Session 2026-09-09

- Q: **CL-01** — O gatilho "pagamento aprovado"/"inscrição em lançamento" (visão 8.8) depende do
  Financeiro (transação normalizada com `status_canonico`, spec 018+) e do Catálogo
  (`janela_lancamento`, spec 023+), nenhum dos dois existe ainda neste ponto do roadmap. Como
  tratar gatilho por evento externo no v1? → A: **Só contrato, sem gatilho real.** O tipo de
  gatilho `EVENTO_EXTERNO` fica modelado no domínio/schema (pronto para plugar numa projeção do
  `evento_origem` quando o Financeiro/Catálogo existirem), mas nenhum fluxo com esse tipo de
  gatilho executa de fato nesta spec — mesmo padrão de deferimento já usado pela
  `PortaObservacaoPagamentoCrm` (spec 010) para "observar pagamento aprovado" sem o Financeiro
  existir. Um fluxo criado com gatilho `EVENTO_EXTERNO` fica visivelmente marcado como
  "aguardando integração futura" e nunca é elegível para execução automática.
- Q: **CL-02** — Como a "biblioteca de automações prontas" (templates de fluxo) deve funcionar
  no v1? → A: **Templates semeados via seed.** Um conjunto fixo de fluxos-modelo (ex.:
  "boas-vindas a lead novo", "reengajar lead esfriando", "aplicar tag ao ganhar oportunidade")
  entra via `prisma seed`, somente leitura, com uma ação "usar como base" que clona o modelo
  para um novo fluxo em rascunho, editável livremente pelo usuário a partir daí.

### Decisões já tomadas nesta spec (padrões razoáveis, sem pergunta ao dono do produto)

- **D-01 — Um fluxo é uma entidade lógica com histórico de versões numeradas; no máximo uma
  versão PUBLICADA por vez.** Editar sempre cria/atualiza um rascunho próprio (nunca sobrescreve
  a versão publicada); publicar arquiva a versão publicada anterior (se houver) e promove o
  rascunho. Uma versão publicada é imutável — o mesmo racional de `oferta`/`aditivo` (Financeiro)
  e `template_whatsapp` (spec 011): histórico nunca muda retroativamente.
- **D-02 — Gatilhos internos são detectados por projeção sobre trilhas já append-only do próprio
  CRM, nunca por polling de outro bounded context.** `interacao` (nova linha), `tag_associacao`
  (nova associação), `oportunidade_movimentacao` (nova movimentação, já inclui ganha/perdida) e o
  delta de `estagio` em `crm_lead_audit` já são, cada um, uma trilha de eventos append-only
  existente desde as specs 007–010. Um `WorkerScheduler` in-process (mesmo padrão `setInterval`
  da spec 006, 0 dependência nova) varre essas trilhas por um cursor próprio, casa contra os
  gatilhos de fluxos publicados e dispara as execuções elegíveis — nunca uma automação
  proativa fora de um evento real.
- **D-03 — Simulação nunca tem efeito colateral.** Testar um fluxo em rascunho (ou publicado)
  contra um registro real escolhido pelo usuário (um lead, uma pessoa ou uma oportunidade
  específicos) avalia gatilho/condições e mostra quais ações seriam disparadas — nenhuma ação é
  executada de fato, nenhuma linha de efeito é gravada.
- **D-04 — Catálogo de ações do MVP é só o que o sistema já sabe fazer hoje**: mover lead de
  estágio (008), mover oportunidade de etapa — incluindo marcar ganha/perdida com um motivo
  configurável no próprio bloco de ação, já que não há um humano digitando o motivo exigido pela
  regra da spec 010 — (010), aplicar ou remover tag (009), e registrar uma interação tipo nota
  (009). Ações que dependem de recursos que ainda não existem (disparo de WhatsApp em massa —
  spec 015 — ou criação de tarefa — spec 016) ficam fora desta spec.
- **D-05 — Cada ação executada pelo Workflow usa exatamente o mesmo caminho e a mesma trilha de
  auditoria de uma ação manual equivalente** (ex.: mover oportunidade de etapa gera a mesma
  `oportunidade_movimentacao` que um usuário movendo manualmente, com o motivo/origem indicando
  que veio de um fluxo) — nunca um caminho de escrita paralelo e invisível ao histórico já
  existente.
- **D-06 — Idempotência por chave determinística**: cada execução é identificada por
  `(versão do fluxo, registro que disparou o evento, ocorrência do evento)`; reprocessar a mesma
  ocorrência (scheduler atrasado, reinício, reprocesso manual) nunca cria uma segunda execução
  nem duplica o efeito de uma ação já aplicada.
- **D-07 — Condições avaliam só o registro que disparou o evento e seus dados diretamente
  relacionados** (ex.: tags atuais do lead, campos personalizados, estágio/etapa atual) — nunca
  uma consulta cruzada arbitrária a outras entidades fora desse escopo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar e publicar um fluxo simples (Priority: P1)

Um administrador monta um fluxo com um gatilho interno (ex.: "lead criado"), uma condição (ex.:
"origem = site") e uma ação (ex.: "aplicar tag 'site'"), publica, e a partir daí todo lead novo
que casar com a condição recebe a tag automaticamente, sem intervenção manual.

**Why this priority**: é o valor central da spec — sem um fluxo publicado rodando de ponta a
ponta, nenhuma outra história tem por onde se apoiar.

**Independent Test**: publicar um fluxo com gatilho "lead criado" + condição simples + ação
"aplicar tag", criar um lead que satisfaça a condição, e verificar que a tag é aplicada
automaticamente pouco depois, sem nenhuma ação manual.

**Acceptance Scenarios**:

1. **Given** um fluxo em rascunho com gatilho, condição e ação definidos, **When** um
   administrador o publica, **Then** o fluxo passa a rodar automaticamente para novos eventos que
   casarem com o gatilho.
2. **Given** um fluxo publicado com uma condição, **When** ocorre o evento do gatilho e o
   registro satisfaz a condição, **Then** a ação configurada é executada e fica registrada como
   uma execução bem-sucedida.
3. **Given** um fluxo publicado com uma condição, **When** ocorre o evento do gatilho mas o
   registro não satisfaz a condição, **Then** nenhuma ação é executada e a execução fica
   registrada como "condição não satisfeita".
4. **Given** um fluxo com condições compostas usando E/OU, **When** o evento ocorre, **Then** o
   resultado da avaliação respeita a combinação lógica configurada.

---

### User Story 2 - Testar um fluxo antes de publicar (Priority: P1)

Antes de publicar, o administrador escolhe um registro real (um lead, uma pessoa ou uma
oportunidade específica) e roda uma simulação do fluxo em rascunho contra ele, vendo exatamente
o que aconteceria — sem que nada seja de fato alterado.

**Why this priority**: publicar um fluxo com efeito automático sem conseguir testá-lo antes é
arriscado demais para ser aceitável — esta história é o que torna a US1 segura de usar.

**Independent Test**: com um fluxo em rascunho e um lead real escolhido, rodar a simulação e
verificar que o resultado mostra se o gatilho/condição casariam e quais ações seriam disparadas,
e depois conferir que nenhum dado do lead mudou.

**Acceptance Scenarios**:

1. **Given** um fluxo em rascunho e um registro real escolhido pelo usuário, **When** o
   administrador roda a simulação, **Then** o sistema mostra se a condição seria satisfeita e
   quais ações seriam disparadas, sem executar nada de fato.
2. **Given** uma simulação já rodada, **When** o administrador confere o registro usado no
   teste, **Then** nenhum dado desse registro foi alterado pela simulação.

---

### User Story 3 - Editar um fluxo publicado sem interromper o que já está rodando (Priority: P2)

O administrador precisa ajustar um fluxo publicado (ex.: trocar a tag aplicada). A edição vira um
novo rascunho; a versão publicada continua rodando exatamente como estava até o novo rascunho ser
testado e publicado por cima dela.

**Why this priority**: sem isso, qualquer ajuste em um fluxo já publicado seria arriscado —
editar em produção é exatamente o que a spec precisa evitar (visão 8.8: "publicar gera nova
versão imutável, nunca edita em produção").

**Independent Test**: com um fluxo publicado rodando, editar um bloco e verificar que isso cria
um rascunho separado; disparar o gatilho do fluxo nesse meio-tempo e confirmar que ele ainda
executa de acordo com a versão publicada antiga, não com o rascunho ainda não publicado.

**Acceptance Scenarios**:

1. **Given** um fluxo com uma versão publicada, **When** o administrador edita um bloco,
   **Then** a edição fica num rascunho novo, e a versão publicada permanece inalterada e ativa.
2. **Given** um fluxo com uma versão publicada e um rascunho em edição, **When** o gatilho da
   versão publicada ocorre, **Then** a execução usa as regras da versão publicada, não as do
   rascunho.
3. **Given** um rascunho testado e pronto, **When** o administrador o publica, **Then** a versão
   publicada anterior é arquivada (permanece consultável no histórico) e o rascunho passa a ser a
   versão ativa.

---

### User Story 4 - Partir de um modelo pronto (Priority: P2)

Em vez de montar um fluxo do zero, o administrador escolhe um modelo da biblioteca de automações
prontas (ex.: "reengajar lead esfriando") e o usa como ponto de partida, ajustando o que for
necessário antes de publicar.

**Why this priority**: acelera a adoção do Workflow por quem está começando, mas o motor já
funciona plenamente sem ela (US1/US2/US3) — por isso vem depois.

**Independent Test**: escolher um modelo da biblioteca, usar como base, verificar que um novo
fluxo em rascunho é criado com os mesmos blocos do modelo, editar um bloco, e confirmar que o
modelo original permanece intocado.

**Acceptance Scenarios**:

1. **Given** a biblioteca de modelos disponível, **When** o administrador escolhe um modelo e
   pede para usá-lo como base, **Then** um novo fluxo em rascunho é criado com os mesmos blocos
   do modelo, pronto para ser editado.
2. **Given** um fluxo criado a partir de um modelo, **When** o administrador o edita, **Then** o
   modelo original na biblioteca permanece inalterado.

---

### User Story 5 - Consultar o histórico de execuções (Priority: P3)

Alguém quer entender por que uma ação aconteceu (ou não aconteceu) para um registro específico, ou
auditar o comportamento geral de um fluxo: consulta o histórico de execuções, vendo o que rodou,
quando, o resultado e, em caso de falha, o motivo.

**Why this priority**: é observabilidade sobre um motor que já funciona (US1–US4) — importante
para confiança e depuração, mas não bloqueia o valor central de automatizar.

**Independent Test**: com um fluxo publicado que já rodou algumas vezes, abrir o histórico de
execuções e verificar que cada execução mostra o registro envolvido, o resultado (executado /
condição não satisfeita / falhou) e, quando aplicável, o motivo da falha.

**Acceptance Scenarios**:

1. **Given** um fluxo publicado que já executou, **When** alguém consulta seu histórico,
   **Then** cada execução aparece com o registro envolvido, o momento, o resultado e as ações
   aplicadas (se houver).
2. **Given** uma execução que falhou ao aplicar uma ação, **When** alguém a consulta, **Then** o
   motivo da falha fica visível, sem interromper a execução de outros fluxos ou de outras
   ocorrências do mesmo fluxo.

---

### Edge Cases

- Um fluxo é editado enquanto uma execução da versão publicada está em andamento: a execução em
  andamento termina de acordo com as regras da versão que a iniciou (D-01) — nunca troca de
  versão no meio do caminho.
- O mesmo evento é processado mais de uma vez (reinício do processamento, reprocesso manual): a
  segunda passada não duplica o efeito da ação já aplicada (D-06).
- Um fluxo é criado com gatilho `EVENTO_EXTERNO` ("pagamento aprovado", "inscrição em
  lançamento"): pode ser salvo e configurado, mas fica marcado como aguardando integração futura
  e nunca dispara automaticamente nesta versão (CL-01).
- Uma ação de mover oportunidade para a etapa "perdida" é configurada sem um motivo preenchido no
  bloco: o sistema exige o motivo já na configuração do bloco, antes de permitir publicar (mesma
  regra da spec 010, aplicada no momento da configuração em vez de no momento da execução).
- Uma condição referencia um campo personalizado que foi desativado depois que o fluxo foi
  publicado: a condição é tratada como não satisfeita, sem erromper a execução do fluxo.
- Uma ação de aplicar tag roda sobre um registro que já tem aquela tag: nenhum efeito duplicado
  (mesma idempotência de associação de tag já garantida pela spec 009).
- Um fluxo publicado é arquivado (despublicado sem publicar um substituto): deixa de ser elegível
  para novas execuções; execuções já registradas continuam consultáveis.
- Um usuário sem a permissão apropriada tenta criar, editar, publicar ou simular um fluxo: a ação
  é recusada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um usuário autorizado crie um fluxo de automação
  composto por um gatilho, uma ou mais condições combináveis por E/OU, e uma ou mais ações.
- **FR-002**: Toda edição de um fluxo MUST ocorrer sobre um rascunho próprio — nunca sobre a
  versão publicada em uso — e MUST poder ser salva incrementalmente sem publicar.
- **FR-003**: Publicar um fluxo MUST criar uma nova versão imutável a partir do rascunho atual e
  MUST arquivar a versão publicada anterior daquele fluxo, se existir; no máximo uma versão MUST
  estar publicada (ativa) por fluxo a qualquer momento.
- **FR-004**: Uma vez publicada, o conteúdo (gatilho, condições, ações) de uma versão MUST nunca
  ser alterado — qualquer mudança MUST resultar numa versão nova.
- **FR-005**: O sistema MUST oferecer um catálogo fechado de gatilhos internos do CRM (criação de
  lead, mudança de estágio de lead, movimentação de oportunidade entre etapas — incluindo
  ganha/perdida —, nova interação registrada, tag aplicada) e um tipo de gatilho por evento
  externo que fica registrável mas não executável nesta versão (CL-01).
- **FR-006**: Quando um evento correspondente a um gatilho publicado ocorre, o sistema MUST
  avaliar as condições daquele fluxo contra o registro envolvido e, se satisfeitas, MUST executar
  as ações configuradas.
- **FR-007**: O sistema MUST oferecer um catálogo fechado de ações do MVP: mover lead para outro
  estágio, mover oportunidade para outra etapa (com motivo obrigatório quando a etapa de destino
  for do tipo perdida), aplicar ou remover uma tag, e registrar uma nota na timeline de interações
  (D-04).
- **FR-008**: Cada ação executada por um fluxo MUST usar a mesma trilha de auditoria/histórico
  já existente para a mudança equivalente feita manualmente, identificando que a origem foi uma
  execução de Workflow (D-05).
- **FR-009**: O sistema MUST permitir simular um fluxo (rascunho ou publicado) contra um registro
  real escolhido pelo usuário, mostrando se o gatilho/condições casariam e quais ações seriam
  disparadas, sem produzir nenhum efeito real (D-03).
- **FR-010**: O sistema MUST reprocessar um evento (por atraso, reinício ou reprocesso manual) sem
  duplicar o efeito de uma execução já aplicada para aquela mesma ocorrência (D-06).
- **FR-011**: O sistema MUST manter um histórico consultável de toda execução de fluxo — o
  registro envolvido, o momento, o resultado (executado / condição não satisfeita / falhou) e, em
  caso de falha, o motivo — sem que uma falha numa execução interrompa outras execuções.
- **FR-012**: O sistema MUST disponibilizar uma biblioteca de fluxos-modelo prontos, somente
  leitura, com uma ação que clona um modelo para um novo fluxo em rascunho editável, sem afetar o
  modelo original (CL-02).
- **FR-013**: Um usuário MUST poder arquivar (despublicar) um fluxo publicado, tornando-o
  inelegível para novas execuções, preservando as execuções já registradas.
- **FR-014**: Apenas usuários com a permissão apropriada MUST poder criar, editar, publicar,
  arquivar ou simular fluxos de automação; a consulta ao histórico de execuções MUST exigir, no
  mínimo, permissão de visualização.
- **FR-015**: Ao configurar uma ação que exige um motivo (ex.: mover oportunidade para etapa
  perdida), o sistema MUST exigir esse motivo já na configuração do bloco, impedindo publicar sem
  ele.

### Key Entities *(include if feature involves data)*

- **Fluxo de automação**: a automação em si, identificada por nome/descrição, dona de um
  histórico de versões. Não executa diretamente — quem executa é sempre uma versão específica.
- **Versão de fluxo**: um snapshot completo e imutável de gatilho + condições + ações, com um
  estado (rascunho, publicada, arquivada). Só uma versão publicada por fluxo por vez.
- **Execução de fluxo**: o registro de uma tentativa de rodar uma versão publicada para um evento
  ocorrido — qual registro disparou, o resultado, as ações efetivamente aplicadas (ou o motivo de
  não terem sido).
- **Modelo de fluxo**: um fluxo-exemplo somente leitura, ponto de partida para um fluxo novo via
  clonagem — não executa por si mesmo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um administrador consegue montar, simular e publicar um fluxo simples (um gatilho,
  uma condição, uma ação) sem escrever código e sem ajuda técnica.
- **SC-002**: Um evento interno relevante dispara a execução correspondente de um fluxo publicado
  em poucos minutos, sem qualquer intervenção manual.
- **SC-003**: Reprocessar as mesmas ocorrências de evento produz exatamente o mesmo estado final
  que processá-las uma única vez, em 100% dos casos observados.
- **SC-004**: Toda execução, bem-sucedida ou não, fica consultável com o motivo do resultado, sem
  exceção.
- **SC-005**: Editar um fluxo publicado nunca altera nem interrompe o comportamento da versão que
  já estava em uso, até que uma nova versão seja publicada por cima dela.
- **SC-006**: Um usuário consegue partir de um modelo pronto da biblioteca e ter um fluxo
  customizado publicável em menos passos do que montar um fluxo equivalente do zero.

## Assumptions

- Decisões do dono do produto de 2026-09-09 (ver Clarifications): gatilho por evento externo
  ("pagamento aprovado", "inscrição em lançamento") fica só modelado, sem execução real, até o
  Financeiro/Catálogo existirem (CL-01); biblioteca de automações prontas é semeada via seed, com
  clonagem para um novo rascunho (CL-02).
- Gatilhos internos são detectados por uma varredura periódica (em segundos/poucos minutos) sobre
  trilhas já append-only do próprio CRM — não há garantia de disparo instantâneo, mas o atraso é
  imperceptível para o uso esperado (mesmo racional de latência já aceito pelo `WorkerScheduler`
  da spec 006).
- O catálogo de gatilhos, condições e ações desta versão é fechado e reflete só o que o CRM já
  sabe fazer hoje (specs 007–010); novos tipos de gatilho/ação entram em specs futuras conforme
  Financeiro, Marketing, Disparos (015) e Tarefas (016) forem existindo.
- O editor visual (canvas de blocos) é a interface principal de criação/edição; a estrutura
  interna de um fluxo (gatilho, condições, ações) é a mesma independentemente de como foi
  montada (do zero ou a partir de um modelo).
- Volume de fluxos e execuções esperado é baixo/moderado (escala de uma operação comercial de
  porte médio, mesmo racional de volume já assumido pelas specs 007/012) — sem necessidade de
  fila externa ou processamento distribuído.
