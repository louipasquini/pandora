# Feature Specification: CRM · FAQ e Sugestão de IA

**Feature Branch**: `013-crm-faq-e-sugestao-ia`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "013-crm-faq-e-sugestao-ia: FAQ do CRM (versionada) + Sugestão de IA
dentro do Chat ao Vivo (spec 012). `faq_item` com histórico de versões (quem/quando editou).
`sugestao_ia` (origem: mensagem/interação, tipo: resposta sugerida com base na FAQ | campo
personalizado sugerido — reaproveitando o projeto Noctua) — nunca envia mensagem nem grava campo
sozinha, sempre exige confirmação humana antes de virar dado ou mensagem enviada, segue o ciclo
de governança de 3 etapas da Parte 10.6 da visão. IA identifica múltiplas perguntas numa
mensagem e propõe respostas separadas. Feedback loop (útil / não útil) por sugestão. Frontend:
editor de FAQ (CRUD + histórico de versões) plugado em CRM · Administração, e painel de
sugestões dentro da conversa de Chat ao Vivo, com aceitar/rejeitar/feedback. Ver Parte 8.3, 8.4,
8.5 e 10.6 da visão geral, e a seção CRM do CLAUDE.md."

## Clarifications

### Session 2026-09-09

- Q: **CL-01** — O ROADMAP descreve `faq_item` com vínculo a Produto (Financeiro) ou Campanha
  (Marketing). Nenhuma das duas entidades existe ainda neste ponto do roadmap — `produto` só
  nasce na spec 023 (Fase 2 — Financeiro) e `campanha` só na spec 032 (Fase 4 — Marketing), ambas
  bem depois desta spec 013 (Fase 1 — CRM). Como proceder? → A: **Sem vínculo nenhum por
  agora.** `faq_item` nasce como uma lista única (pergunta/resposta/ativo/versionamento), sem FK
  de produto nem de campanha. A IA busca/sugere com base em toda a FAQ ativa disponível, sem
  segmentação. Quando `produto` (023) e `campanha` (032) existirem, uma spec futura acrescenta as
  colunas de vínculo e a segmentação — sem retrabalho de stub, sem FK solto sem integridade
  referencial.
- Q: **CL-02** — "Campo personalizado sugerido" pela IA: hoje só `lead` tem campos
  personalizados (`campo_personalizado_lead`, spec 008); `pessoa` não tem, e a maioria das
  conversas do Chat ao Vivo é com `pessoa` já convertida (pós-1ª venda). A qual entidade essa
  sugestão se aplica? → A: **Às duas.** Esta spec estende o bounded context `clientes` (spec 005)
  com uma estrutura de campo personalizado para `pessoa` (`campo_personalizado_pessoa` +
  `valor_campo_pessoa`), espelhando exatamente a já existente para `lead` (spec 008). A sugestão
  de campo personalizado passa a ter destino tanto quando o atendimento está ancorado em `lead`
  quanto em `pessoa`.
- Q: **CL-03** — Qual provedor/modelo de IA gera as sugestões (resposta de FAQ e campo
  personalizado)? → A: **API da Anthropic (Claude)**, chamada HTTP direta (mesmo padrão `fetch`
  nativo + client próprio já usado para a Graph API do WhatsApp na spec 011) — sem SDK novo,
  atrás de uma porta/interface própria de domínio (mesmo padrão de inversão de dependência já
  usado por `PortaIdentidade`, spec 008, e `PortaObservacaoPagamentoCrm`, spec 010).

### Decisões já tomadas nesta spec (padrões razoáveis, sem pergunta ao dono do produto)

- **D-01 — Sugestão é sempre não-autoritativa (Princípio da governança 10.6, etapa 1)**: nenhuma
  sugestão de IA grava dado ou envia mensagem por conta própria. Uma resposta sugerida só sai
  pelo fluxo de envio já existente do atendimento (spec 012), com uma ação explícita e separada
  do atendente; um campo personalizado sugerido só é gravado no cadastro depois de uma
  confirmação explícita, editável antes de confirmar.
- **D-02 — Etapas 2 e 3 da governança (10.6) são processo humano, não automação de código**: a
  "revisão coletiva de padrão" (reunião com pelo menos mais 2 pessoas) e a "generalização do
  fluxo" são processo operacional da equipe, apoiado pelos dados desta spec (histórico de
  sugestões + feedback de utilidade consultável), não um fluxo automatizado dentro do sistema.
- **D-03 — Sugestão é sempre no contexto de um atendimento existente**: a IA só é acionada dentro
  de um atendimento em andamento (spec 012), sobre uma interação específica da pessoa/lead já
  registrada na timeline — nunca uma varredura em massa ou proativa fora de uma conversa real.
- **D-04 — Chamada à IA é síncrona, sob demanda, sem fila/worker**: mesmo racional de volume
  baixo já assumido pela spec 012 (~10 conversas simultâneas). Pedir uma sugestão é uma ação
  explícita do atendente (equivalente a "buscar na FAQ agora"), não um gatilho automático a cada
  mensagem recebida.
- **D-05 — Nova sugestão para a mesma mensagem invalida a pendente anterior**: pedir uma nova
  sugestão para a mesma mensagem de origem substitui qualquer sugestão anterior daquela mensagem
  que ainda estivesse pendente de decisão, evitando duas decisões conflitantes para a mesma
  pergunta.
- **D-06 — Indisponibilidade da IA nunca bloqueia o atendimento**: se a chamada à IA falhar ou
  demorar, o atendente continua podendo responder manualmente a qualquer momento, com ou sem
  sugestão — o atendimento nunca fica condicionado a uma resposta da IA.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um administrador mantém a base de FAQ (Priority: P1)

Um administrador cadastra perguntas e respostas frequentes das alunas, edita respostas
desatualizadas e desativa itens que não fazem mais sentido. Toda alteração fica registrada:
quem mudou o quê e quando.

**Why this priority**: é a fundação de tudo — sem conteúdo de FAQ cadastrado, não existe base
para a IA sugerir nada. Nenhuma outra história desta spec funciona sem esta primeiro.

**Independent Test**: criar um item de FAQ, editar sua resposta e verificar que o histórico
mostra as duas versões (anterior e atual) com autor e data de cada alteração.

**Acceptance Scenarios**:

1. **Given** nenhum item de FAQ cadastrado, **When** um administrador cria um novo item com
   pergunta e resposta, **Then** o item passa a existir, ativo, disponível para uso pela IA.
2. **Given** um item de FAQ existente, **When** um administrador edita sua resposta, **Then** a
   versão anterior permanece consultável no histórico, com quem editou e quando.
3. **Given** um item de FAQ desatualizado, **When** um administrador o desativa, **Then** ele
   deixa de ser considerado nas buscas da IA, mas continua existindo e consultável.

---

### User Story 2 - Atendente recebe uma sugestão de resposta baseada na FAQ (Priority: P1)

Durante uma conversa no Chat ao Vivo, o atendente seleciona a mensagem da aluna com uma
pergunta e pede uma sugestão. A IA busca na FAQ ativa e propõe uma resposta. O atendente revisa,
pode ajustar o texto, e só então decide enviar — nunca é enviado automaticamente.

**Why this priority**: é o valor central da spec — reduzir o tempo de resposta do atendente sem
tirar o controle da decisão final dele.

**Independent Test**: com um item de FAQ cadastrado cobrindo uma pergunta específica, selecionar
uma mensagem da aluna com essa pergunta, pedir uma sugestão, e verificar que a resposta proposta
aparece para revisão, sem ser enviada até uma ação explícita do atendente.

**Acceptance Scenarios**:

1. **Given** uma mensagem da aluna com uma pergunta coberta pela FAQ ativa, **When** o atendente
   pede uma sugestão de resposta, **Then** o sistema propõe uma resposta baseada no item de FAQ
   correspondente, ainda não enviada.
2. **Given** uma sugestão de resposta proposta, **When** o atendente a aceita e envia, **Then** a
   mensagem enviada fica registrada como assistida por IA.
3. **Given** uma sugestão de resposta proposta, **When** o atendente a rejeita, **Then** nada é
   enviado e o atendente segue livre para responder do seu próprio jeito.
4. **Given** uma pergunta sem nenhuma correspondência razoável na FAQ ativa, **When** o
   atendente pede uma sugestão, **Then** o sistema indica que não há sugestão disponível, em vez
   de propor uma resposta de baixa qualidade.

---

### User Story 3 - IA identifica múltiplas perguntas numa única mensagem (Priority: P2)

A aluna manda uma única mensagem com duas ou mais perguntas distintas. Em vez de uma sugestão
genérica tentando responder tudo de uma vez, o sistema propõe uma sugestão separada para cada
pergunta identificada, decidível de forma independente.

**Why this priority**: refina a história central (US2) para o caso comum de mensagens com mais
de uma dúvida — sem isso, o atendente ainda precisaria separar as perguntas manualmente.

**Independent Test**: enviar (simular) uma mensagem com duas perguntas distintas cobertas pela
FAQ, pedir uma sugestão, e verificar que aparecem duas sugestões separadas, cada uma podendo ser
aceita ou rejeitada sem afetar a outra.

**Acceptance Scenarios**:

1. **Given** uma mensagem contendo duas perguntas distintas, **When** o atendente pede uma
   sugestão, **Then** o sistema propõe uma sugestão de resposta para cada pergunta identificada,
   separadamente.
2. **Given** duas sugestões geradas para a mesma mensagem, **When** o atendente aceita uma e
   rejeita a outra, **Then** cada decisão é registrada de forma independente, sem afetar a outra
   sugestão.

---

### User Story 4 - IA sugere preenchimento de campo personalizado a partir da mensagem (Priority: P2)

Ao processar uma mensagem da aluna, a IA identifica uma informação estruturada mencionada (por
exemplo, tempo de atuação profissional) e sugere preencher um campo personalizado do cadastro
correspondente. O atendente revisa o valor sugerido, pode ajustá-lo, e só então confirma — o
cadastro nunca é alterado sem essa confirmação.

**Why this priority**: entrega valor real (enriquecer o cadastro sem digitação manual), mas
depende da sugestão de resposta (US2) já existir como mecanismo — por isso vem depois.

**Independent Test**: com uma mensagem contendo uma informação estruturada relevante, pedir uma
sugestão e verificar que aparece uma proposta de campo personalizado; confirmá-la e verificar que
o valor aparece no cadastro da pessoa/lead correspondente.

**Acceptance Scenarios**:

1. **Given** uma mensagem com uma informação estruturada correspondente a um campo personalizado
   administrável, **When** o atendente pede uma sugestão, **Then** o sistema propõe o valor para
   aquele campo, ainda não gravado no cadastro.
2. **Given** uma sugestão de campo personalizado proposta, **When** o atendente a confirma,
   **Then** o valor passa a constar no cadastro da pessoa ou do lead correspondente ao
   atendimento.
3. **Given** uma sugestão de campo personalizado proposta, **When** o atendente a rejeita,
   **Then** o cadastro permanece inalterado.
4. **Given** um atendimento ancorado numa pessoa que já convertida (pós-venda), **When** uma
   sugestão de campo personalizado é aceita, **Then** o valor é gravado no cadastro dessa pessoa,
   do mesmo jeito que seria gravado no de um lead ainda não convertido.

---

### User Story 5 - Atendente avalia se a sugestão foi útil (Priority: P3)

Depois de decidir sobre uma sugestão (aceitar ou rejeitar), o atendente pode marcar se ela foi
realmente útil. Esse retorno fica disponível para quem revisa padrões de dúvidas recorrentes.

**Why this priority**: fecha o ciclo de melhoria contínua, mas o fluxo principal (pedir, revisar,
decidir) já funciona completamente sem esse retorno — por isso é a menor prioridade.

**Independent Test**: decidir sobre uma sugestão, marcar como "não foi útil", e verificar que
essa avaliação aparece associada à sugestão no histórico consultável.

**Acceptance Scenarios**:

1. **Given** uma sugestão já decidida (aceita ou rejeitada), **When** o atendente marca se ela
   foi útil ou não, **Then** essa avaliação fica registrada e consultável junto da sugestão.
2. **Given** uma sugestão já avaliada, **When** alguém consulta o histórico de sugestões,
   **Then** a avaliação de utilidade aparece junto com o conteúdo, a origem e a decisão.

---

### Edge Cases

- Pergunta sem correspondência razoável na FAQ ativa: o sistema indica ausência de sugestão em
  vez de forçar uma resposta de baixa confiança (US2, cenário 4).
- A chamada à IA falha, demora ou o provedor está indisponível: o atendente continua livre para
  responder manualmente a qualquer momento — o atendimento nunca fica bloqueado esperando uma
  sugestão (D-06).
- O atendente pede uma nova sugestão para a mesma mensagem que já tinha uma sugestão pendente: a
  sugestão anterior daquela mensagem é invalidada, evitando duas decisões conflitantes para a
  mesma pergunta (D-05).
- Uma sugestão de campo personalizado aponta para um campo que já tem um valor diferente
  cadastrado: aceitar a sugestão substitui o valor atual, exatamente como uma edição manual —
  sem tentativa de mesclar valores automaticamente.
- Um item de FAQ usado como base de uma sugestão já decidida é editado ou desativado depois: a
  sugestão e sua decisão continuam consultáveis do jeito que estavam no momento em que foram
  geradas — o histórico da sugestão não muda retroativamente.
- A resposta da aluna, quando o atendimento é encerrado antes de uma sugestão pendente ser
  decidida: a sugestão permanece registrada como pendente, sem decisão forçada.
- Um usuário sem permissão de atender tenta pedir uma sugestão ou decidir sobre uma: a ação é
  recusada, mesma disciplina de permissão já usada para responder/transferir/encerrar (spec 012).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um usuário autorizado crie e edite itens de FAQ
  (pergunta e resposta), e os ative ou desative — sem vínculo com produto ou campanha nesta
  versão (CL-01).
- **FR-002**: Toda criação ou edição de um item de FAQ MUST manter um histórico consultável de
  versões anteriores, com quem alterou e quando.
- **FR-003**: Dentro de um atendimento em andamento, um usuário autorizado MUST poder solicitar
  que o sistema sugira uma resposta para uma mensagem específica da pessoa/lead, com base no
  conteúdo dos itens de FAQ ativos.
- **FR-004**: Quando a mensagem selecionada contiver mais de uma pergunta identificável, o
  sistema MUST propor uma sugestão de resposta separada para cada pergunta, cada uma decidível
  (aceitar/rejeitar) independentemente das demais.
- **FR-005**: Nenhuma resposta sugerida MUST ser enviada à pessoa/lead automaticamente — o envio
  MUST exigir uma ação explícita e separada do atendente, pelo mesmo fluxo de resposta já
  existente do atendimento (spec 012).
- **FR-006**: Quando não houver correspondência adequada na FAQ ativa para a pergunta
  identificada, o sistema MUST indicar a ausência de sugestão disponível, em vez de propor uma
  resposta de baixa confiança.
- **FR-007**: O sistema MUST permitir que a IA proponha o preenchimento de um campo
  personalizado — da pessoa ou do lead correspondente ao atendimento — a partir do conteúdo de
  uma mensagem, sem gravar esse valor automaticamente no cadastro.
- **FR-008**: Um usuário autorizado MUST poder confirmar uma sugestão de campo personalizado
  (podendo ajustar o valor antes de confirmar), o que grava o valor no cadastro correspondente; ou
  rejeitá-la, o que descarta a sugestão sem qualquer efeito no cadastro.
- **FR-009**: A sugestão de campo personalizado MUST estar disponível tanto quando o atendimento
  está ancorado em um lead quanto em uma pessoa já convertida (CL-02), usando em cada caso a
  estrutura de campos personalizados já administrável daquela entidade.
- **FR-010**: Toda sugestão (resposta ou campo personalizado) MUST registrar seu estado —
  pendente de decisão, aceita ou rejeitada — e, quando decidida, quem decidiu e quando.
- **FR-011**: Depois de decidida, uma sugestão MUST permitir que o usuário marque,
  opcionalmente, se ela foi útil ou não — disponível para consulta posterior, sem exigir decisão
  imediata.
- **FR-012**: Quando uma resposta sugerida é aceita e efetivamente enviada, o registro de
  resposta do atendimento (spec 012) MUST refletir que aquela resposta foi assistida por IA.
- **FR-013**: Solicitar uma nova sugestão para a mesma mensagem de origem MUST invalidar
  qualquer sugestão anterior daquela mesma mensagem que ainda estivesse pendente de decisão.
- **FR-014**: Se a geração de sugestão pela IA falhar ou não responder em tempo hábil, o sistema
  MUST permitir que o atendimento continue normalmente, sem impedir o atendente de responder
  manualmente.
- **FR-015**: Apenas usuários com a permissão apropriada MUST poder criar ou editar itens de
  FAQ; apenas usuários com a permissão de atender (spec 012) MUST poder solicitar sugestões e
  decidir sobre elas dentro de um atendimento.
- **FR-016**: O sistema MUST manter um histórico consultável de toda sugestão gerada —
  conteúdo proposto, mensagem de origem, decisão e feedback de utilidade — para apoiar a revisão
  coletiva de padrões prevista na governança de decisões automatizadas (Parte 10.6).

### Key Entities *(include if feature involves data)*

- **Item de FAQ**: par pergunta/resposta usado como base para as sugestões de resposta da IA.
  Tem um estado ativo/inativo e um histórico de versões (quem editou, quando, o que mudou). Sem
  vínculo com produto ou campanha nesta versão (CL-01).
- **Sugestão de IA**: proposta não-autoritativa gerada a partir de uma mensagem específica de um
  atendimento — de dois tipos, resposta baseada na FAQ ou campo personalizado. Guarda a origem
  (a mensagem que a gerou), o conteúdo proposto, o estado da decisão (pendente/aceita/rejeitada),
  quem decidiu e quando, e uma avaliação opcional de utilidade.
- **Campo personalizado de pessoa**: mesma estrutura de definição administrável e valor já usada
  para leads (spec 008), estendida para pessoas já convertidas — necessária para que a sugestão
  de campo personalizado tenha um destino também depois da conversão de lead em pessoa (CL-02).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um atendente consegue solicitar e receber uma sugestão de resposta baseada na FAQ
  para uma pergunta identificada em poucos segundos, sem sair da tela de conversa.
- **SC-002**: Em 100% dos casos, nenhuma mensagem sugerida pela IA é enviada à pessoa/lead sem
  uma ação explícita e separada de envio pelo atendente.
- **SC-003**: Em 100% dos casos, nenhum campo personalizado é alterado no cadastro sem uma
  confirmação explícita do atendente.
- **SC-004**: Mensagens com múltiplas perguntas identificáveis resultam em sugestões distintas,
  decidíveis independentemente, sem misturar o conteúdo de perguntas diferentes numa só resposta.
- **SC-005**: Toda sugestão gerada permanece consultável posteriormente com sua decisão e
  feedback de utilidade, permitindo levantar quais dúvidas são mais recorrentes.
- **SC-006**: A indisponibilidade temporária do provedor de IA nunca impede um atendente de
  responder manualmente a uma conversa em andamento.

## Assumptions

- Decisões do dono do produto de 2026-09-09 (ver Clarifications): FAQ sem vínculo com produto ou
  campanha nesta versão (CL-01); sugestão de campo personalizado vale tanto para lead quanto para
  pessoa, com uma nova estrutura de campo personalizado para pessoa (CL-02); provedor de IA é a
  API da Anthropic/Claude, chamada direta via HTTP (CL-03).
- As etapas 2 (revisão coletiva de padrão) e 3 (generalização do fluxo) do ciclo de governança de
  3 etapas (Parte 10.6) são processo humano/operacional apoiado pelos dados desta spec — não
  automação de código nesta versão.
- O painel de sugestões vive dentro da tela de conversa do Chat ao Vivo (spec 012); o editor de
  FAQ vive em CRM · Administração (spec 007).
- Volume de chamadas à IA é baixo (mesmo racional de volume assumido pela spec 012 — até ~10
  conversas simultâneas), portanto as chamadas são síncronas e sob demanda, sem fila nem worker
  de fundo.
- A configuração de acesso ao provedor de IA (chave de API) é uma credencial operacional; controle
  de custo/limite de uso do provedor está fora do escopo desta spec.
- IA busca e sugere apenas com base em itens de FAQ ativos; itens desativados são preservados
  para histórico, mas não entram em novas buscas.
