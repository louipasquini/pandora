# Feature Specification: CRM · Integração com WhatsApp

**Feature Branch**: `011-crm-whatsapp-integracao`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "011-crm-whatsapp-integracao: Integração com WhatsApp Business API (Cloud API oficial da Meta) para o CRM. Escopo: conexão/configuração do canal (número, credenciais, webhook), template_whatsapp (nome Meta, categoria, corpo, status_aprovacao — sincronizado com a API da Meta), janela de atendimento de 24h (cálculo de quando é permitido responder livremente vs. exigir template aprovado), webhook de recebimento de mensagens → gera interacao (tipo WHATSAPP, spec 009) + evento_origem (spec 006, plataforma de origem WhatsApp), envio de mensagem avulsa dentro da janela de 24h e de template fora da janela, gestão de opt-out/descadastro (LGPD, obrigatório). Fora de escopo desta spec (specs futuras): fila/inbox de atendimento ao vivo com endereçamento e SLA (012), disparos em massa/segmentação (015), FAQ e sugestão de IA (013). Decisões já resolvidas com o dono do produto (2026-09-04): provedor = Cloud API oficial da Meta (Graph API), não BSP; retenção de conversas = indefinida, pseudonimização só na exclusão da pessoa (mesmo padrão do resto do projeto), sem TTL automático nesta spec."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mensagens da aluna chegam automaticamente na timeline (Priority: P1)

Uma aluna manda uma mensagem de WhatsApp para o número comercial da empresa. O time
comercial/atendimento precisa ver essa mensagem, sem trabalho manual, na timeline da pessoa
(ou do lead, se ainda não é cliente) dentro do CRM — junto com as demais interações
(e-mail, ligação, nota) já existentes.

**Why this priority**: Sem isso, nada mais na integração tem valor — é o alicerce que
transforma o WhatsApp num canal de fato observável pelo CRM. Toda a Fase 1 do CRM
(pipeline, tarefas, dashboard) já depende de `interacao` existir; esta história só estende
a origem dela.

**Independent Test**: Enviar uma mensagem de teste para o número conectado e verificar que
ela aparece na timeline da pessoa/lead correspondente em poucos segundos, com o conteúdo e
o remetente corretos — sem depender de nenhuma outra história desta spec.

**Acceptance Scenarios**:

1. **Given** um número de telefone já associado a uma pessoa conhecida, **When** essa
   pessoa envia uma mensagem de WhatsApp para o número comercial, **Then** uma nova
   interação do tipo WhatsApp aparece na timeline dessa pessoa, com o texto da mensagem e o
   horário de recebimento.
2. **Given** um número de telefone que não corresponde a nenhuma pessoa ou lead existente,
   **When** uma mensagem chega desse número, **Then** o sistema cria automaticamente um
   novo lead com origem "WhatsApp" e associa a mensagem à timeline desse lead.
3. **Given** uma mensagem já processada, **When** o provedor reenvia a mesma notificação
   (reentrega por falha de rede), **Then** nenhuma interação duplicada é criada.

---

### User Story 2 - Time responde respeitando a janela de 24 horas (Priority: P2)

Depois de receber uma mensagem, um atendente responde pela própria interface do CRM. Se a
última mensagem da aluna foi há menos de 24 horas, o atendente pode escrever livremente. Se
já passou desse prazo, o sistema só permite iniciar a conversa de novo com uma mensagem de
modelo (template) já aprovado — e explica isso claramente, em vez de deixar o envio falhar
silenciosamente ou sem explicação.

**Why this priority**: É a regra de negócio central imposta pela política do WhatsApp — sem
ela, mensagens enviadas fora da janela falham na API do provedor de forma confusa para quem
está atendendo, e a empresa corre risco de violar a política da Meta.

**Independent Test**: Simular uma conversa com a última mensagem da aluna recebida há menos
de 24h e enviar uma resposta livre (deve funcionar); simular uma conversa parada há mais de
24h e tentar enviar uma resposta livre (deve ser bloqueada com uma explicação) e depois
enviar um template aprovado (deve funcionar).

**Acceptance Scenarios**:

1. **Given** a última mensagem recebida da pessoa foi há menos de 24 horas, **When** um
   atendente envia uma mensagem de texto livre, **Then** a mensagem é enviada e registrada
   como uma nova interação.
2. **Given** a última mensagem recebida da pessoa foi há mais de 24 horas (ou nunca houve
   mensagem recebida), **When** um atendente tenta enviar uma mensagem de texto livre,
   **Then** o envio é recusado com uma explicação de que é necessário usar um template
   aprovado.
3. **Given** a janela de 24 horas está fechada, **When** um atendente envia uma mensagem
   usando um template com status aprovado, **Then** a mensagem é enviada e registrada como
   uma nova interação.
4. **Given** um template com status pendente ou rejeitado, **When** um atendente tenta
   enviá-lo, **Then** o envio é recusado.

---

### User Story 3 - Administrador conecta o canal e mantém os templates em dia (Priority: P3)

Um administrador configura a conexão do número de WhatsApp comercial da empresa com o CRM.
A partir daí, o catálogo de templates de mensagem (criados e aprovados do lado da Meta) fica
visível e atualizado dentro do sistema, para que o time saiba quais estão disponíveis para
uso e quais ainda estão pendentes ou foram rejeitados.

**Why this priority**: É pré-requisito operacional das histórias 1 e 2, mas é uma ação
pontual de configuração (não do dia a dia do atendimento), por isso vem depois em
prioridade — o valor de receber/responder mensagens (P1/P2) é maior que o de administrar a
conexão em si.

**Independent Test**: Configurar uma conexão com credenciais válidas e verificar que os
templates existentes do lado da Meta aparecem no sistema com o status de aprovação correto,
sem precisar de nenhuma mensagem trocada.

**Acceptance Scenarios**:

1. **Given** um administrador com permissão para gerenciar integrações, **When** ele
   cadastra as credenciais de um número de WhatsApp Business, **Then** o sistema confirma a
   conexão e passa a aceitar mensagens desse canal.
2. **Given** um canal conectado, **When** um novo template é aprovado do lado da Meta,
   **Then** o status desse template aparece atualizado no sistema.
3. **Given** um usuário sem a permissão apropriada, **When** ele tenta configurar ou alterar
   a conexão do canal, **Then** o sistema recusa a ação.

---

### User Story 4 - Aluna pode pedir para não receber mais mensagens (Priority: P4)

Uma aluna que não quer mais ser contatada pelo WhatsApp da empresa consegue solicitar isso
(opt-out) e, a partir daí, deixa de receber qualquer mensagem iniciada pela empresa — sem
precisar contatar ninguém fora do próprio WhatsApp para isso. Ela também pode reverter esse
pedido no futuro.

**Why this priority**: É uma obrigação legal (LGPD) e uma política da própria Meta, mas
depende das histórias anteriores existirem para fazer sentido — por isso fecha a lista,
apesar de ser inegociável antes de ir para produção com envio de mensagens reais.

**Independent Test**: Registrar o opt-out de uma pessoa e verificar que uma tentativa de
envio de mensagem iniciada pela empresa para ela é bloqueada; reverter o opt-out e verificar
que o envio volta a ser permitido.

**Acceptance Scenarios**:

1. **Given** uma pessoa que solicitou não receber mais mensagens, **When** o sistema
   registra esse pedido, **Then** nenhuma mensagem iniciada pela empresa (template ou
   avulsa) é enviada a ela a partir desse momento.
2. **Given** uma pessoa em opt-out, **When** ela mesma volta a escrever para o número da
   empresa, **Then** essa mensagem chega normalmente na timeline (o opt-out bloqueia envios
   da empresa, não o recebimento).
3. **Given** uma pessoa em opt-out, **When** ela solicita voltar a receber mensagens,
   **Then** o opt-out é revertido e os envios voltam a ser permitidos.

---

### Edge Cases

- Mensagem recebida contém mídia (imagem, áudio, documento) em vez de texto: o sistema
  registra a interação com uma referência ao tipo de mídia recebida, mesmo que a
  visualização completa dela seja tratada por uma spec futura (inbox de atendimento, 012).
- O webhook chega com token/assinatura inválidos ou de uma conta desconhecida: a mensagem é
  recusada antes de qualquer processamento (mesmo padrão de autenticação de webhook já usado
  no restante da ingestão).
- Um template usado com frequência é rejeitado ou desativado pela Meta depois de já estar em
  uso: novas tentativas de envio com ele passam a ser recusadas, com o motivo visível.
- Uma tentativa de envio ocorre com o canal desconectado ou desativado: a mensagem é
  recusada e o motivo é registrado.
- O provedor retorna erro no envio (número inválido, limite atingido, etc.): o erro fica
  registrado de forma visível para quem tentou enviar, sem travar o restante do sistema.
- Um número desconhecido (sem pessoa nem lead) pede para não ser mais contatado: o pedido de
  opt-out é registrado mesmo sem histórico anterior, e vale a partir do momento em que esse
  número for associado a alguma pessoa ou lead.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um usuário autorizado configure uma conexão de
  canal de WhatsApp Business (identificação do número, credenciais do provedor, e o
  necessário para validar o webhook de entrada).
- **FR-002**: O sistema MUST validar a autenticidade de toda notificação recebida no webhook
  antes de processá-la, recusando qualquer chamada que não comprove pertencer ao canal
  configurado.
- **FR-003**: Toda mensagem recebida via webhook MUST gerar um registro de evento de origem
  imutável, seguindo o mesmo padrão já usado para as demais origens de dados do sistema.
- **FR-004**: Toda mensagem recebida MUST gerar (ou atualizar) uma interação do tipo
  WhatsApp associada à pessoa ou ao lead correspondente ao número de telefone remetente,
  visível na timeline unificada já existente.
- **FR-005**: Quando o número de telefone remetente não corresponder a nenhuma pessoa ou
  lead existente, o sistema MUST criar automaticamente um novo lead com origem "WhatsApp"
  para que a conversa não se perca.
- **FR-006**: O sistema MUST manter um catálogo de templates de mensagem, incluindo nome,
  categoria, corpo do texto e status de aprovação, refletindo o status vigente do lado do
  provedor.
- **FR-007**: O sistema MUST calcular, a qualquer momento e para qualquer conversa, se ela
  está dentro da janela de 24 horas de atendimento livre, com base no horário da última
  mensagem recebida da pessoa (ou do lead) naquele canal.
- **FR-008**: Dentro da janela de 24 horas, o sistema MUST permitir o envio de mensagens de
  texto livre para a pessoa/lead correspondente.
- **FR-009**: Fora da janela de 24 horas, o sistema MUST recusar o envio de mensagens de
  texto livre e permitir apenas o envio de um template com status aprovado.
- **FR-010**: O sistema MUST recusar o envio de qualquer template que não esteja com status
  aprovado.
- **FR-011**: Toda mensagem enviada pela empresa (livre ou por template) MUST gerar uma
  interação registrada na timeline da pessoa/lead correspondente, incluindo o status de
  entrega retornado pelo provedor.
- **FR-012**: O sistema MUST oferecer um mecanismo para registrar que uma pessoa não deseja
  mais receber mensagens iniciadas pela empresa (opt-out), e para reverter esse registro
  (opt-in) a pedido dela.
- **FR-013**: O sistema MUST impedir o envio de qualquer mensagem iniciada pela empresa
  (livre ou por template) para uma pessoa em opt-out; o recebimento de mensagens que essa
  pessoa enviar continua funcionando normalmente.
- **FR-014**: O sistema MUST registrar de forma clara e consultável qualquer falha de envio
  de mensagem (erro do provedor, template inválido, canal desconectado, destinatário em
  opt-out, etc.), incluindo o motivo da falha.
- **FR-015**: O sistema MUST ser idempotente diante de reentregas da mesma notificação pelo
  provedor — nenhuma reentrega MUST resultar em evento de origem ou interação duplicados.
- **FR-016**: Apenas usuários com a permissão apropriada MUST poder configurar ou alterar a
  conexão do canal e o catálogo de templates.
- **FR-017**: Apenas usuários com a permissão apropriada MUST poder enviar mensagens em nome
  da empresa através do canal conectado.
- **FR-018**: O histórico de mensagens de uma pessoa MUST seguir a mesma política do
  restante do sistema quando essa pessoa for excluída — os dados de identificação são
  pseudonimizados, mas o histórico de interações permanece íntegro para fins de auditoria e
  agregados.

### Key Entities *(include if feature involves data)*

- **Canal WhatsApp**: representa uma conexão configurada com um número de WhatsApp
  Business — identificação do número, estado da conexão (ativo/inativo), e vínculo com a
  conta de origem correspondente. É o que autoriza mensagens a entrar e sair do sistema.
- **Template de mensagem**: modelo de mensagem pré-aprovado do lado do provedor, com nome,
  categoria, corpo de texto e status de aprovação (pendente, aprovado, rejeitado). É a única
  forma de iniciar contato fora da janela de 24 horas.
- **Mensagem WhatsApp**: uma interação (já prevista na timeline unificada do CRM) que
  representa uma mensagem específica trocada por esse canal — enviada pela empresa ou
  recebida da pessoa — com seu conteúdo, sentido (enviada/recebida) e status de entrega
  quando aplicável.
- **Opt-out**: registro de que uma pessoa (ou um número ainda não associado a ninguém) não
  deseja mais receber mensagens iniciadas pela empresa por esse canal, com a data do pedido
  e, quando revertido, a data da reversão.
- **Evento de origem (WhatsApp)**: o registro cru e imutável de cada notificação recebida do
  provedor, na mesma família de dados já usada para as demais origens do sistema — é a fonte
  de verdade da qual a interação é derivada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma mensagem recebida de uma aluna aparece na timeline da pessoa/lead correta
  em até 1 minuto, sem qualquer ação manual do time.
- **SC-002**: 0% das tentativas de envio de mensagem livre fora da janela de 24 horas são
  concluídas com sucesso — todas são bloqueadas com uma explicação clara.
- **SC-003**: Um administrador consegue conectar um novo canal e ver seus templates com o
  status de aprovação correto sem precisar de suporte técnico.
- **SC-004**: 100% das pessoas em opt-out não recebem nenhuma mensagem iniciada pela empresa
  após o pedido, verificável a qualquer momento por auditoria do histórico de envios.
- **SC-005**: Reentregas duplicadas da mesma notificação pelo provedor resultam em 0
  registros duplicados de interação ou evento de origem.
- **SC-006**: Toda falha de envio fica visível para o time responsável em até 1 minuto após
  a tentativa, com um motivo compreensível.

## Assumptions

- O provedor da API de WhatsApp Business é a Cloud API oficial da Meta (Graph API), não um
  BSP terceiro — decisão confirmada com o dono do produto em 2026-09-04.
- O histórico de conversas de WhatsApp é retido indefinidamente; a pseudonimização de dados
  de identificação segue a mesma política já aplicada ao restante do sistema quando uma
  pessoa é excluída, sem prazo automático de expiração nesta spec — decisão confirmada com o
  dono do produto em 2026-09-04.
- Esta spec cobre a integração e as regras de compliance do canal (conexão, templates,
  janela de 24h, webhook de entrada, envio individual, opt-out). Fila de atendimento,
  endereçamento de chamados a atendentes, SLA de resposta e transferência de conversa ficam
  para a spec de Chat ao Vivo (012); envio em massa/segmentação para Disparos (015); sugestão
  de resposta por IA para FAQ e IA (013).
- Um usuário autenticado no sistema (equipe interna) é quem envia mensagens em nome da
  empresa nesta spec; não há, ainda, um agente automatizado enviando mensagens (isso é
  Workflow, 014, ou Disparos, 015).
- O opt-out bloqueia mensagens **iniciadas pela empresa** (template fora da janela, ou
  qualquer envio avulso); não impede a pessoa de escrever espontaneamente para o número da
  empresa, nem impede o time de responder dentro da janela de 24h aberta pela própria
  mensagem dela — alinhado à política do WhatsApp de que a iniciativa de contato é o que
  precisa de consentimento.
- Mídia recebida (imagem, áudio, documento) é registrada com uma referência ao tipo, mas a
  visualização/gestão completa desse conteúdo é aprofundada só na spec de Chat ao Vivo (012).
