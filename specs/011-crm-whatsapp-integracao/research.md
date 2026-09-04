# Research — 011-crm-whatsapp-integracao

## Decisões resolvidas com o dono do produto (2026-09-04)

- **Decision**: Provedor = **Cloud API oficial da Meta** (Graph API), não BSP (Twilio/Take
  Blip/Zenvia/360dialog).
  **Rationale**: sem taxa/vendor lock-in de um intermediário; a AEN não tem volume que
  justifique BSP na v1; simplifica a integração (1 fornecedor, não 2).
  **Alternatives considered**: BSP — rejeitado por custo mensal extra e dependência de
  outro fornecedor externo, sem ganho claro no volume atual.

- **Decision**: Retenção de conversas = **indefinida**; pseudonimização de dados de
  identificação só na exclusão da `pessoa` (spec 047), sem TTL automático nesta spec.
  **Rationale**: mesma disciplina já aplicada ao resto do sistema (`pessoa.pseudonimizadaEm`,
  `evento_origem` sem expiração); evita construir um job de expiração antes de haver
  qualquer sinal de necessidade regulatória mais estrita.
  **Alternatives considered**: TTL automático (ex.: anonimizar após N meses) — rejeitado por
  exigir decidir um prazo sem critério do dono do produto e construir um job novo sem
  necessidade demonstrada agora.

## Decisões técnicas (Fase 0)

- **Decision**: Cliente HTTP para a Graph API da Meta = **`fetch` nativo do Node 24**
  (`global.fetch`), atrás de uma interface própria (`GraphApiClient`) injetável por DI.
  **Rationale**: 0 dependência nova; Node 24 já tem `fetch` estável; a interface permite
  substituir por um dublê nos testes sem chamada de rede real.
  **Alternatives considered**: `axios`/`@nestjs/axios` — rejeitados, mesmo racional de "0
  dep nova" já aplicado a `node:crypto` (007) e `Intl` nativo (007).

- **Decision**: Corpo bruto do webhook capturado via **`rawBody: true`** do
  `NestFactory.create` (Nest expõe `req.rawBody: Buffer` sem alterar o parsing das demais
  rotas).
  **Rationale**: a assinatura `X-Hub-Signature-256` da Meta é HMAC-SHA256 sobre os **bytes
  exatos** do corpo — reserializar o JSON já parseado quebraria a verificação. É o
  mecanismo padrão do próprio NestJS para esse problema (mesmo usado por integrações
  Stripe-like), 0 dependência nova, não interfere nas demais rotas.
  **Alternatives considered**: middleware `express.raw()` só na rota do webhook — mais
  código para o mesmo resultado; a opção nativa do Nest já resolve.

- **Decision**: Evento cru do webhook vira uma tabela **própria do `crm`**
  (`evento_webhook_whatsapp`), **não** reaproveita `evento_origem`/`PlataformaOrigem` da
  `ingestao` (spec 006).
  **Rationale**: `PlataformaOrigem` é uma dimensão **fechada e documentada** das 7 contas
  financeiras de origem (CLAUDE.md: "dimensão de primeira classe... quase toda query
  identifica a conta específica") — WhatsApp não é uma conta financeira, é um canal de
  comunicação do CRM. Estender esse enum para caber uma mensagem de WhatsApp misturaria dois
  domínios diferentes na mesma dimensão (viola Princípio I — modelar o domínio, não a
  origem). O pipeline de 7 etapas da `ingestao` (classificar tipo de venda, resolver
  vínculo Asaas↔Guru, resolver oferta, projetar contrato) também não faz sentido para uma
  mensagem — forçar esse pipeline seria abstração além do necessário.
  **Alternatives considered**: adicionar `WHATSAPP` a `PlataformaOrigem` — rejeitado (acima).
  Não persistir evento cru algum, só a `interacao` — rejeitado porque FR-003 e o Princípio
  IV (log de eventos + projeções) pedem explicitamente o registro imutável antes de
  qualquer efeito derivado.

- **Decision**: Idempotência **por mensagem individual** reaproveita a porta
  `RegistrarInteracaoService` (spec 009), já exportada do `CrmModule` especificamente para
  as specs 011/012 injetarem — chave `(canalOrigem: "whatsapp:<canalId>", idExterno: <wamid
  da Meta>)`, com o índice único parcial que já existe em `interacao`.
  **Rationale**: dedup correto e testado já existe; reimplementar seria duplicação
  desnecessária. A tabela `evento_webhook_whatsapp` ainda deduplica o **payload inteiro**
  (podem chegar reentregas do mesmo POST), mas quem decide "essa mensagem específica já foi
  registrada" é a porta da 009.
  **Alternatives considered**: dedup só no nível do payload — insuficiente, porque um único
  POST pode conter várias mensagens/eventos de status, e uma reentrega parcial (rede) não é
  garantida byte-a-byte idêntica.

- **Decision**: Detalhes específicos de WhatsApp (id da mensagem na Meta, status de entrega,
  template usado, tipo de conteúdo) vivem numa tabela própria **`mensagem_whatsapp`**, 1:1
  com `interacao` (FK única), em vez de colunas novas em `interacao`.
  **Rationale**: mantém `interacao` agnóstica de canal (ela já serve WhatsApp/e-mail/
  ligação/ticket/nota/NPS) — mesmo racional já usado pela 010 para não colocar campos de
  pipeline dentro do audit genérico (`oportunidade_movimentacao` é histórico de 1ª classe,
  não uma extensão do genérico).
  **Alternatives considered**: colunas novas em `interacao` (`waMessageId`, `statusEntrega`,
  etc.) — rejeitado, polui uma entidade compartilhada com campos que só um canal usa.

- **Decision**: Segredos do canal (access token, app secret, verify token) cifrados com a
  **mesma chave `CRM_INTEGRACAO_CIFRA_KEY`** já obrigatória desde a 007, reaproveitando
  `cifrar`/`decifrar`/`mascararSegredo`/`ultimos4De` de `crm/domain`.
  **Rationale**: 0 chave `.env` nova; a chave já existe para exatamente este propósito
  (cifra em repouso de segredo de integração dentro do `crm`).
  **Alternatives considered**: chave dedicada por canal — over-engineering para o volume
  atual (poucos canais); nada na spec pede rotação de chave por canal.

- **Decision**: Sincronização do catálogo de templates é **sob demanda** — endpoint
  administrativo explícito (`POST .../templates/sincronizar`), nunca automática/periódica.
  **Rationale**: Princípio VIII da constituição é explícito: "nenhuma sincronização
  automática com API externa — só sob demanda, com confirmação no backend." Um job
  periódico violaria isso diretamente.
  **Alternatives considered**: polling agendado — rejeitado pelo princípio acima.

- **Decision**: Envio de mensagem (livre ou template) é **síncrono** — chama a Graph API
  dentro do próprio request HTTP e devolve sucesso/erro na resposta.
  **Rationale**: esta spec cobre só o envio individual dentro de um atendimento (FR-008/
  FR-009), não o disparo em massa (fila, agendamento, throttling — isso é a spec 015). Sem
  fila para construir agora; erro do provedor fica visível imediatamente na resposta HTTP
  (satisfaz SC-006 com folga — "até 1 minuto").
  **Alternatives considered**: fila assíncrona com worker — abstração cedo demais; a 015 já
  vai precisar de fila de verdade (throttling, agendamento, A/B) e reaproveitará conceitos
  daqui, mas construir isso agora seria antecipar escopo de outra spec.

- **Decision**: 1 endpoint de webhook **global** (`GET`/`POST /webhooks/whatsapp`), canal
  resolvido a partir de `metadata.phone_number_id` no próprio payload — não por `:canalId`
  na URL.
  **Rationale**: fidelidade ao modelo real da Meta — o callback URL + verify token são
  configurados **1 vez por App da Meta**, e um único App cobre N números de telefone
  (WABAs); a Meta nunca vai chamar uma URL por canal.
  **Alternatives considered**: `/webhooks/whatsapp/:canalId` — não corresponde a como a
  API da Meta realmente funciona; obrigaria o operador a burlar o próprio modelo da Meta.

- **Decision**: Autenticação do webhook **não reaproveita** `WebhookAuthenticator` (spec
  003) — é tipado para `PlataformaOrigem` e o próprio código-fonte documenta que está
  "reservado para as specs 019–022" (as 7 contas financeiras). WhatsApp verifica por
  **HMAC-SHA256** (`X-Hub-Signature-256`) sobre o corpo bruto, usando o `appSecret` do canal
  resolvido — mecanismo de assinatura, não de token fixo comparado. Função pura nova em
  `crm/domain/whatsapp/assinatura.ts`. O handshake `GET` (`hub.verify_token`) compara (tempo
  constante) contra os canais ativos.
  **Rationale**: os dois mecanismos resolvem problemas diferentes (bearer token estático vs.
  assinatura de payload) e o `WebhookAuthenticator` já está explicitamente escopado para
  outra dimensão (`PlataformaOrigem`). Duplicar uma função pura pequena é mais simples e mais
  correto do que forçar reuso num tipo que não se aplica.
  **Alternatives considered**: generalizar `WebhookAuthenticator` para aceitar qualquer
  string de "conta" — tocaria um módulo de infra transversal já estável (spec 003) por um
  ganho pequeno; rejeitado.

- **Decision**: Assinatura inválida → **401**, rejeitado antes de qualquer processamento.
  Erros de processamento **depois** da assinatura validada (canal não encontrado, pessoa/
  lead não resolvido, payload com forma inesperada) ficam registrados em
  `evento_webhook_whatsapp.erro_detalhe`, mas a resposta HTTP ainda é **200** — evita que a
  Meta reenvie o mesmo payload em loop de retry por um erro que só reprocessamento manual
  resolveria.
  **Rationale**: separa claramente "isto não é um webhook autêntico" (bloqueio de
  segurança, deve ser 401) de "isto é autêntico mas algo interno falhou" (não é culpa do
  remetente, não deve gerar retry automático da Meta) — mesmo racional de FR-014 (falha
  visível, mas sem travar o resto do sistema).

- **Decision**: Opt-out é modelado como **histórico de linhas** (nunca `UPDATE` que apaga o
  pedido original) — optar de novo depois de já ter revertido cria uma nova linha; a
  consulta de "está em opt-out agora" é a linha mais recente por telefone com
  `revertidoEm IS NULL`.
  **Rationale**: preserva o histórico completo de pedidos/reversões para auditoria LGPD sem
  precisar de uma tabela `_audit` paralela — a própria tabela já é o registro.
  **Alternatives considered**: 1 linha mutável por telefone com toggle — perde o histórico
  de ciclos anteriores; rejeitado por ser uma regressão de auditabilidade sem ganho.

- **Decision**: Auditoria de canal/template/opt-out reaproveita **`crm_admin_audit`**
  (spec 007) — mesma tabela já usada para `integracao`/`equipe`/`janela_atendimento`/
  `feriado`. **Nenhuma tabela de auditoria nova** nesta spec.
  **Rationale**: `crm_admin_audit` já é entidade-agnóstica (`entidade: string`); canal e
  template são configuração administrativa de baixo volume, exatamente o perfil que essa
  tabela já cobre. Opt-out é um evento pouco frequente por pessoa; não justifica uma tabela
  dedicada quando a própria linha de `opt_out_whatsapp` (histórico, decisão acima) já
  serve de rastro.
  **Alternatives considered**: nova `crm_whatsapp_audit` (padrão da 008/009/010, que
  auditam entidades de alto volume) — rejeitado aqui porque canal/template/opt-out têm
  volume baixo, mais parecido com o perfil de `equipe`/`integracao` (007) do que com
  `lead`/`interacao`/`oportunidade`.

## Não resolvido nesta spec (fora de escopo)

- Fila/inbox de atendimento ao vivo, endereçamento, SLA de 1ª resposta, transferência de
  conversa → spec 012.
- Disparo em massa, throttling, agendamento, teste A/B → spec 015.
- Sugestão de resposta por IA, FAQ → spec 013.
- Download/armazenamento do conteúdo de mídia recebida (imagem/áudio/documento) — só a
  referência ao tipo é registrada nesta spec (ver Assumptions do spec.md).
