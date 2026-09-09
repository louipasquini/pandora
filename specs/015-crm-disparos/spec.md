# Feature Specification: CRM · Disparos (WhatsApp)

**Feature Branch**: `015-crm-disparos`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "CRM · Disparos (WhatsApp) — spec 015 do ROADMAP.md. Envio em
massa de mensagens de WhatsApp para uma lista/segmento de leads/pessoas, construído sobre a
infraestrutura de canal/template já existente da spec 011 (crm-whatsapp-integracao) e sobre
`segmento` da spec 009. Entidades novas: `execucao_disparo` (template FK, segmento ou
lista/CSV, agendado_para, status) e `mensagem_enviada` (execucao_disparo FK opcional [null se
veio do Chat ao Vivo, spec 012], interacao FK, status_entrega). Escopo funcional (visão Parte
8.6): segmentação minuciosa para o disparo (reaproveitar `segmento` da 009 e/ou importação de
CSV de contatos avulsos), agendamento de disparo, throttling de envio para preservar o
quality rating do número junto à Meta, exibição do quality rating no painel (consulta sob
demanda à Graph API, nunca sincronização automática — Princípio VIII), testes A/B de
mensagens, deduplicação automática de contatos antes do envio, respeito automático a opt-out
(`opt_out_whatsapp` da spec 011) e a `preferencia_comunicacao` (ainda não existe — Central de
Clientes não foi construída; tratar como decisão em aberto/fora de escopo nesta spec,
documentar a lacuna), export de resultados, log de erros robusto e visão geral dos disparos.
Frontend: construtor de disparo (escolher template, segmento/CSV, agendamento, variantes A/B)
+ tela de visão geral/histórico de disparos com métricas de entrega e quality rating."

## Clarifications

### Session 2026-09-09

- Q: Volume esperado de destinatários num único disparo? → A: Até poucos milhares — worker
  in-process (mesmo padrão `setInterval` de 006/014), sem fila/broker externo.
- Q: Contato novo importado por CSV vira Lead permanente ou é só uma lista descartável? → A: O
  usuário escolhe na hora da importação (opção por importação, não uma regra fixa).
- Q: O teste A/B promove automaticamente a variante vencedora para o restante do público? → A:
  Não — as duas variantes dividem 100% do público configurado e o teste encerra; comparação e
  decisão são manuais.
- Q: Falha de envio de uma mensagem individual tenta de novo automaticamente ou é sempre
  terminal (só reprocessamento manual)? → A: Retry automático limitado (mesmo padrão de
  `MAX_TENTATIVAS` da spec 006) antes de virar falha terminal.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Time monta e agenda um disparo segmentado (Priority: P1)

Uma pessoa do time comercial/marketing quer enviar uma mesma mensagem de WhatsApp para um
grupo de pessoas ou leads de uma vez só — por exemplo, avisar sobre a abertura de um novo
lançamento para todo mundo que demonstrou interesse. Ela escolhe um template já aprovado,
escolhe para quem enviar (um segmento salvo do CRM), decide se envia agora ou agenda para
mais tarde, e confirma. A partir daí o sistema cuida do envio sozinho, respeitando quem já
pediu para não receber mais mensagens e sem repetir o envio para quem aparecer mais de uma
vez na lista.

**Why this priority**: É o núcleo funcional da spec — sem a capacidade de montar, segmentar e
disparar uma campanha de mensagens, nenhuma das demais capacidades (A/B, throttling, quality
rating, CSV) tem propósito. Sem isso, o time continua dependendo de envio manual mensagem por
mensagem pelo Chat ao Vivo (012).

**Independent Test**: Criar um segmento pequeno de teste, montar um disparo com um template
aprovado direcionado a esse segmento, confirmar o envio imediato e verificar que cada pessoa
do segmento (exceto quem estiver em opt-out) recebe exatamente uma mensagem.

**Acceptance Scenarios**:

1. **Given** um segmento salvo com pessoas/leads e um template aprovado, **When** o usuário
   monta um disparo apontando para esse segmento e confirma o envio imediato, **Then** o
   sistema envia a mensagem do template para cada membro do segmento e registra o resultado
   de cada envio.
2. **Given** um disparo configurado com uma data/hora futura de agendamento, **When** o
   usuário confirma a criação do disparo, **Then** nenhuma mensagem é enviada imediatamente e
   o disparo aparece com status "agendado" até o horário chegar.
3. **Given** um segmento em que a mesma pessoa aparece associada tanto por um lead quanto por
   uma pessoa já convertida, **When** o disparo é enviado, **Then** essa pessoa recebe a
   mensagem uma única vez.
4. **Given** um membro do segmento que está em opt-out do canal WhatsApp, **When** o disparo é
   enviado, **Then** essa pessoa é automaticamente excluída do envio e isso fica visível no
   resultado do disparo (não é tratado como erro silencioso).
5. **Given** um membro do segmento sem número de telefone válido cadastrado, **When** o
   disparo é enviado, **Then** o envio para essa pessoa é registrado como falha com o motivo,
   sem impedir o envio para os demais.
6. **Given** um disparo agendado ainda não executado, **When** o usuário o cancela antes do
   horário, **Then** nenhuma mensagem é enviada e o disparo fica com status "cancelado".

---

### User Story 2 - Time acompanha o andamento e os resultados de um disparo (Priority: P2)

Depois de confirmar um disparo, a pessoa responsável quer saber o que aconteceu: quantas
mensagens foram enviadas, quantas entregues, quantas falharam e por quê, e qual é a saúde
atual do número de WhatsApp da empresa junto à Meta (quality rating) antes de decidir se
dispara mais campanhas na sequência.

**Why this priority**: Sem visibilidade de resultado, ninguém consegue confiar no disparo o
suficiente para usá-lo de novo, nem perceber que o número está sendo penalizado pela Meta a
tempo de agir. Depende da História 1 existir (não há o que visualizar sem um disparo).

**Independent Test**: Executar um disparo de teste com pelo menos um destinatário inválido e
verificar que a tela de acompanhamento mostra contagens corretas de sucesso/falha, o motivo de
cada falha, e que o quality rating do canal pode ser consultado sob demanda a partir da mesma
área.

**Acceptance Scenarios**:

1. **Given** um disparo em andamento ou já concluído, **When** o usuário abre sua tela de
   detalhe, **Then** ele vê a contagem de mensagens enviadas, entregues, lidas, com falha e
   puladas (opt-out/dedup), atualizada conforme os status de entrega chegam.
2. **Given** um disparo com mensagens que falharam, **When** o usuário consulta a lista de
   falhas, **Then** cada falha mostra o destinatário e o motivo do erro.
3. **Given** a lista de disparos já realizados, **When** o usuário acessa a visão geral,
   **Then** ele vê todos os disparos (agendados, em andamento, concluídos, cancelados) com suas
   métricas principais, ordenáveis/filtráveis por status e período.
4. **Given** um canal WhatsApp conectado, **When** o usuário pede para consultar o quality
   rating atual, **Then** o sistema busca o valor vigente diretamente do provedor e o exibe,
   sem depender de sincronização automática prévia.
5. **Given** um disparo concluído, **When** o usuário pede para exportar o resultado, **Then**
   o sistema disponibiliza um arquivo com o resultado de cada envio (destinatário, status,
   motivo de falha quando houver).

---

### User Story 3 - Time importa uma lista avulsa de contatos por CSV (Priority: P3)

Às vezes a lista de destinatários não existe como segmento salvo no CRM — por exemplo, uma
planilha de inscritos em um evento externo. A pessoa responsável importa um arquivo CSV com
os contatos e usa essa lista como destino de um disparo pontual. Na hora da importação, ela
decide se quer apenas usar a lista para aquele disparo (sem deixar rastro no CRM) ou se quer
que cada contato novo vire um Lead permanente, para ficar disponível no CRM depois da
campanha.

**Why this priority**: Amplia o alcance do disparo além da base já modelada no CRM, mas não é
essencial para o valor central (que já é entregue por segmentos salvos, História 1) — por
isso vem depois.

**Independent Test**: Importar um CSV pequeno com nomes e telefones, montar um disparo
usando essa lista como destino, e confirmar que o disparo é enviado aos números da lista com
a mesma deduplicação e checagem de opt-out aplicadas a um disparo por segmento.

**Acceptance Scenarios**:

1. **Given** um arquivo CSV com uma coluna de telefone (e opcionalmente nome), **When** o
   usuário o importa como destino de um novo disparo, **Then** o sistema valida as linhas,
   reporta quais foram aceitas e quais foram rejeitadas (telefone inválido/ausente), e usa as
   aceitas como lista de destinatários.
2. **Given** uma importação de CSV, **When** o usuário marca a opção de criar Lead para os
   contatos novos, **Then** cada linha válida cujo telefone não corresponde a nenhuma pessoa
   ou lead existente gera um novo Lead (origem "csv-disparo"), reaproveitando a mesma
   verificação de duplicidade já usada para leads (spec 008); contatos que já correspondem a
   uma pessoa/lead existente são apenas associados ao disparo, sem duplicar cadastro.
3. **Given** uma importação de CSV, **When** o usuário NÃO marca a opção de criar Lead,
   **Then** os contatos servem apenas como destinatários daquele disparo, sem gerar nenhum
   registro novo de Lead ou Pessoa no CRM.
4. **Given** uma lista importada por CSV com um número que também está em opt-out, **When** o
   disparo é enviado, **Then** esse número é excluído do envio da mesma forma que seria se
   viesse de um segmento.
5. **Given** um mesmo número repetido dentro do próprio CSV importado, **When** o disparo é
   enviado, **Then** a mensagem é enviada apenas uma vez para esse número.

---

### User Story 4 - Time compara duas versões de mensagem num teste A/B (Priority: P4)

A pessoa responsável quer testar se uma variação de texto tem melhor resultado que outra antes
de escolher a versão definitiva para uma campanha maior. Ela configura um disparo com duas
variantes de mensagem (por exemplo, dois templates aprovados diferentes), define como o
público é dividido entre elas, e depois consegue comparar o resultado de cada variante lado a
lado.

**Why this priority**: É uma capacidade de otimização que só faz sentido depois que o fluxo
básico de disparo (História 1) e sua visibilidade de resultado (História 2) já existem — por
isso é a menor prioridade das quatro.

**Independent Test**: Criar um disparo com duas variantes de template apontando para o mesmo
segmento, confirmar o envio, e verificar que cada destinatário recebeu exatamente uma das duas
variantes e que os resultados de cada variante podem ser vistos separadamente.

**Acceptance Scenarios**:

1. **Given** um disparo configurado com duas variantes de mensagem e uma divisão de público
   entre elas, **When** o disparo é enviado, **Then** cada destinatário recebe exatamente uma
   das variantes, respeitando a divisão configurada.
2. **Given** um disparo com teste A/B já concluído, **When** o usuário abre o detalhe do
   disparo, **Then** ele vê as métricas de entrega de cada variante separadamente, para poder
   comparar qual teve melhor desempenho.

---

### Edge Cases

- Uma pessoa entra em opt-out depois que o disparo já foi agendado, mas antes do horário de
  envio: ao processar o envio, o sistema reavalia o opt-out no momento do envio (não no
  momento do agendamento) e pula essa pessoa.
- O template usado em um disparo agendado é desaprovado ou desativado pela Meta entre a
  criação do disparo e o horário de envio: o sistema não envia mensagens com um template
  inválido — o disparo fica com erro visível em vez de falhar silenciosamente mensagem por
  mensagem.
- O canal WhatsApp usado pelo disparo é desconectado ou desativado antes do horário de envio:
  o disparo não inicia (ou é interrompido, se já em andamento) e o motivo fica registrado.
- Um disparo agendado tem seu horário reagendado ou é cancelado enquanto já parcialmente
  enviado: mensagens já enviadas não são desfeitas; apenas os destinatários ainda não
  alcançados deixam de receber.
- O provedor (Meta) recusa uma mensagem específica por motivo próprio (número inválido,
  bloqueio, limite): a falha fica registrada com o motivo, sem interromper o restante do
  disparo.
- Um segmento usado por um disparo agendado muda de composição (pessoas entram/saem) entre a
  criação e o horário de envio: a lista de destinatários é recalculada no momento do envio,
  refletindo a composição do segmento naquele momento (mesmo comportamento "sempre derivado"
  já usado pelos segmentos, spec 009).
- Um disparo é criado sem nenhum destinatário elegível (segmento vazio, ou todos os contatos
  em opt-out/inválidos): o disparo é aceito, mas conclui imediatamente com zero mensagens
  enviadas e essa condição fica visível no resultado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um usuário autorizado crie um disparo escolhendo um
  template de WhatsApp com status aprovado, um destino (um segmento salvo do CRM e/ou uma
  lista importada de contatos) e um canal WhatsApp conectado.
- **FR-002**: O sistema MUST permitir que o disparo seja enviado imediatamente ou agendado
  para uma data/hora futura.
- **FR-003**: O sistema MUST permitir cancelar um disparo agendado que ainda não começou a ser
  enviado.
- **FR-004**: Ao calcular a lista final de destinatários de um disparo, o sistema MUST
  eliminar duplicatas — o mesmo número de telefone MUST receber a mensagem daquele disparo no
  máximo uma vez, mesmo se aparecer em mais de uma origem (segmento, lista importada, ou
  ambos).
- **FR-005**: O sistema MUST excluir automaticamente, no momento do envio, qualquer
  destinatário que esteja em opt-out do canal WhatsApp usado, sem exigir conferência manual.
- **FR-006**: A composição de destinatários de um disparo agendado com origem em um segmento
  salvo MUST ser recalculada no momento do envio (não travada no momento da criação do
  disparo), assim como o estado de opt-out de cada destinatário.
- **FR-007**: O sistema MUST permitir importar uma lista de contatos avulsos a partir de um
  arquivo CSV para uso como destino de um disparo, validando e reportando linhas
  inválidas (telefone ausente ou malformado) sem interromper a importação das linhas válidas.
- **FR-007a**: No momento da importação, o sistema MUST permitir ao usuário escolher se os
  contatos novos (sem pessoa/lead correspondente) devem gerar um Lead permanente no CRM
  (origem "csv-disparo") ou servir apenas como destinatários daquele disparo, sem deixar
  registro novo no CRM. Um contato que já corresponde a uma pessoa/lead existente é sempre
  apenas associado ao disparo, independentemente dessa escolha.
- **FR-008**: O sistema MUST enviar as mensagens de um disparo com um ritmo controlado
  (throttling) em vez de disparar tudo de uma vez, para reduzir o risco de penalização do
  número junto à Meta.
- **FR-009**: O sistema MUST permitir consultar, sob demanda, o quality rating vigente do
  canal WhatsApp diretamente do provedor, sem depender de nenhuma sincronização automática
  recorrente (alinhado à Superfície de Escrita Mínima / Princípio VIII).
- **FR-010**: O sistema MUST registrar, para cada destinatário de um disparo, um resultado
  individual (enviado, entregue, lido, falhou, pulado) com o motivo quando não for sucesso.
- **FR-010a**: Quando o envio de uma mensagem individual falhar por erro do provedor, o
  sistema MUST tentar reenviá-la automaticamente um número limitado de vezes antes de marcar
  o resultado como falha terminal (mesmo padrão de tentativas limitadas já usado pelo worker
  de ingestão, spec 006); falhas que não fazem sentido reter (destinatário em opt-out,
  telefone inválido, template não aprovado) NÃO são retentadas — já nascem terminais.
- **FR-011**: O sistema MUST manter uma visão geral de todos os disparos (agendados, em
  andamento, concluídos, cancelados) com suas métricas agregadas, filtrável por status e
  período.
- **FR-012**: O sistema MUST permitir exportar o resultado detalhado de um disparo concluído.
- **FR-013**: O sistema MUST permitir configurar um disparo com duas variantes de mensagem e
  uma divisão do público entre elas, garantindo que cada destinatário receba exatamente uma
  variante.
- **FR-014**: Quando um disparo usa duas variantes, o sistema MUST apresentar as métricas de
  entrega de cada variante separadamente.
- **FR-015**: Toda mensagem enviada por um disparo MUST gerar (ou reaproveitar) o mesmo
  registro de interação já usado pelo restante do canal WhatsApp (spec 011), de forma que ela
  apareça na timeline unificada da pessoa/lead correspondente.
- **FR-016**: O sistema MUST ser idempotente diante de reprocessamento de um disparo — retomar
  ou reprocessar um disparo já parcialmente enviado MUST NOT duplicar o envio para quem já
  recebeu a mensagem.
- **FR-017**: Apenas usuários com a permissão apropriada MUST poder criar, agendar, cancelar
  ou consultar disparos.
- **FR-018**: O sistema MUST impedir a criação ou o envio de um disparo com um template que
  não esteja com status aprovado no momento relevante (criação e, de novo, no momento do
  envio).

### Key Entities *(include if feature involves data)*

- **Execução de disparo**: representa uma campanha de envio em massa — template (ou par de
  variantes, no caso de teste A/B), canal, destino (segmento e/ou lista importada), horário de
  agendamento (ou imediato), e status geral (agendado, em andamento, concluído, cancelado,
  com erro).
- **Lista importada**: conjunto de contatos avulsos (telefone e, opcionalmente, nome) trazido
  por importação de CSV para uso pontual como destino de um disparo, sem virar
  necessariamente um lead ou pessoa no CRM.
- **Mensagem enviada**: o resultado individual do envio de uma execução de disparo para um
  destinatário específico — status de entrega, motivo de falha quando aplicável, e a variante
  usada (quando o disparo tem teste A/B). Corresponde a uma interação da timeline unificada já
  existente.
- **Quality rating**: indicador de saúde do número de WhatsApp junto à Meta, consultado sob
  demanda diretamente do provedor — não é armazenado como um valor sincronizado
  automaticamente, apenas exibido no momento da consulta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa do time consegue montar e enviar um disparo para um segmento
  existente sem qualquer envio manual mensagem por mensagem.
- **SC-002**: 100% dos destinatários em opt-out no momento do envio são excluídos do disparo,
  verificável por auditoria do resultado.
- **SC-003**: 0% dos destinatários recebem a mesma mensagem de um mesmo disparo mais de uma
  vez, mesmo quando aparecem em múltiplas origens (segmento + CSV, ou duplicados dentro do
  próprio CSV).
- **SC-004**: O time consegue ver o motivo de qualquer falha de envio em até 1 minuto após ela
  ocorrer, sem precisar de suporte técnico.
- **SC-005**: O time consegue consultar o quality rating vigente do número a qualquer momento,
  sem esperar por nenhum processo em segundo plano.
- **SC-006**: Reprocessar ou retomar um disparo já parcialmente enviado resulta em 0
  mensagens duplicadas para quem já recebeu.
- **SC-007**: O time consegue comparar o resultado de duas variantes de mensagem de um mesmo
  disparo sem precisar cruzar dados manualmente fora do sistema.

## Assumptions

- Esta spec cobre o envio em massa/segmentado (disparo). O envio individual dentro do Chat ao
  Vivo (012) e o webhook de recebimento/janela de 24h já existem desde a spec 011 e não são
  reabertos aqui — um disparo apenas reaproveita a mesma infraestrutura de canal, template e
  registro de mensagem.
- `preferencia_comunicacao` (consentimento granular por canal e tipo de mensagem, dono:
  Central de Clientes) ainda não existe no sistema — a Central de Clientes é uma fase futura
  do roadmap. Esta spec respeita apenas o opt-out do canal WhatsApp (`opt_out_whatsapp`, spec
  011), que já é o mecanismo de consentimento vigente; quando a Central de Clientes for
  construída, ela passará a alimentar essa mesma checagem de elegibilidade de envio.
- Um disparo só pode usar um template com status aprovado — o mesmo catálogo de templates já
  mantido pela spec 011, sem necessidade de um novo fluxo de aprovação.
- A lista de contatos importada por CSV é usada como destino do disparo em que foi importada;
  se o usuário optar por criar Lead (FR-007a), cada contato novo vira um Lead permanente
  (origem "csv-disparo", reaproveitando a mesma verificação de duplicidade da spec 008); caso
  contrário, nada é persistido além do próprio disparo — decisão confirmada com o dono do
  produto em 2026-09-09 (escolha fica com quem importa, não é fixa).
- Volume esperado por disparo: até poucos milhares de destinatários (não dezenas de milhares
  ou mais) — decisão confirmada com o dono do produto em 2026-09-09, revalidando para o caso
  específico de disparo em massa a suposição de baixo volume herdada da spec 012. Um worker
  in-process (mesmo padrão `setInterval` das specs 006/014, sem fila/broker externo) é
  suficiente para processar a fila de envio com throttling.
- O throttling de envio é uma política de ritmo aplicada pelo próprio disparo (mesmo padrão de
  processamento em segundo plano já usado por outras filas do sistema, specs 006/014), não uma
  configuração exposta livremente por disparo individual.
- O teste A/B divide 100% do público configurado entre as duas variantes e encerra — não há
  promoção automática de uma variante vencedora para o restante do público; a comparação de
  resultado e a decisão de qual variante usar numa próxima campanha são manuais — decisão
  confirmada com o dono do produto em 2026-09-09.
- Um usuário autenticado do sistema (equipe interna) é quem cria e gerencia disparos; não há
  disparo iniciado automaticamente por um fluxo de automação nesta spec (isso é trabalho da
  spec 014, Workflow, que pode vir a acionar um disparo como uma de suas ações numa spec
  futura).
