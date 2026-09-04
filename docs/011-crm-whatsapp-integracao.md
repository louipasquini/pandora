# 011 — CRM · Integração com WhatsApp

Quinta fatia da **Fase 1 (CRM)** — conecta o WhatsApp Business (visão Parte 8.5/8.12) como
canal de 1ª classe do CRM. Mora no _bounded context_ **`crm`** (já não-vazio desde a
007/008/009/010).

Spec, plano, pesquisa, modelo de dados e contratos:
[`specs/011-crm-whatsapp-integracao/`](../specs/011-crm-whatsapp-integracao/).

`CONTEXT_MODULES` segue com **11**. **9ª migração de negócio**
(`20260904165949_crm_whatsapp`) — 5 tabelas + 6 enums. **0 dependência nova** (`fetch`
nativo do Node 24 para a Graph API; `rawBody: true` nativo do Nest para a verificação HMAC).
**Nenhuma variável de ambiente nova** (reaproveita `CRM_INTEGRACAO_CIFRA_KEY` da 007).
**+4 permissões** de catálogo (`whatsapp:{ver,enviar,gerir_optout}`,
`crm_admin:gerir_whatsapp`). **~14 endpoints autenticados + 2 públicos de webhook**.

---

## Decisões do dono do produto (2026-09-04, resolvidas antes do `spec.md`)

As duas decisões que bloqueavam esta spec no `ROADMAP.md` (⚠ clarify) foram resolvidas
diretamente com o dono do produto antes de qualquer código:

- **Provedor**: Cloud API oficial da Meta (Graph API) — não BSP (Twilio/Take Blip/Zenvia/
  360dialog). Sem taxa de intermediário; a AEN não tem volume que justifique BSP na v1.
- **Retenção**: indefinida — pseudonimização de dados de identificação só na exclusão da
  `pessoa` (spec 047), sem TTL automático nesta spec. Mesma disciplina já aplicada ao resto
  do sistema (`pessoa.pseudonimizadaEm`).

## Por que o evento cru do webhook não é `evento_origem` (Princípio I)

`PlataformaOrigem` (spec 002/006) é uma dimensão **fechada** das 7 contas financeiras de
origem — "quase toda query identifica a conta específica" (CLAUDE.md). WhatsApp não é uma
conta financeira, é um canal de comunicação do CRM; e o pipeline de 7 etapas da `ingestao`
(classificar venda, resolver vínculo Asaas↔Guru, resolver oferta, projetar contrato) não
faz sentido para uma mensagem. Por isso o evento cru do webhook vive em
**`evento_webhook_whatsapp`**, tabela própria do `crm`, dedupada por hash do payload —
mesmo espírito do Princípio IV (log de eventos + projeções), sem forçar um pipeline que não
se aplica. Ver `research.md` da spec para a comparação completa das alternativas rejeitadas.

## Autenticação do webhook — não é o `WebhookAuthenticator` da spec 003

`WebhookAuthenticator` (003) é **tipado para `PlataformaOrigem`** e o próprio código-fonte
já documentava estar "reservado para as specs 019–022" (as 7 contas financeiras). WhatsApp
verifica por **HMAC-SHA256** (`X-Hub-Signature-256`) sobre o corpo bruto do request,
usando o `appSecret` do canal resolvido a partir de `metadata.phone_number_id` no próprio
payload — mecanismo de assinatura de payload, não de bearer token fixo por conta. Função
pura nova em `crm/domain/whatsapp/assinatura.ts` (HMAC + comparação em tempo constante
própria — pequena duplicação deliberada, mesmo racional de `normalizarTelefone` na 008).
O handshake `GET` (`hub.verify_token`) compara contra todo canal **ativo**.

As duas rotas (`GET`/`POST /webhooks/whatsapp`) são as **primeiras** `/webhooks/*` do
projeto — cobertas pelo prefixo público já reservado desde a spec 003
(`PUBLIC_PATH_PREFIXES`), sem precisar de `@Public()` nem de permissão: a segurança é
inteiramente a assinatura.

## Corpo bruto para HMAC — `rawBody: true` nativo do Nest

A assinatura HMAC exige os **bytes exatos** do corpo — reserializar o JSON já parseado
quebraria a verificação. `NestFactory.create(AppModule, { rawBody: true })` expõe
`req.rawBody: Buffer` sem alterar o parsing JSON das demais rotas (mecanismo padrão do
próprio NestJS para esse problema, 0 dependência nova).

## `mensagem_whatsapp` — detalhe 1:1, não colunas em `interacao`

`interacao` (spec 009) já tinha `tipo = WHATSAPP` desde a criação — não precisou de coluna
nova. Detalhes específicos de WhatsApp (`wa_message_id`, `status_entrega`, `template_id`,
`tipo_conteudo`, `midia_id_externo`) vivem numa tabela própria `mensagem_whatsapp` (FK
única para `interacao`), mantendo `interacao` agnóstica de canal — mesmo racional já usado
pela 010 para não colocar campos de pipeline dentro do audit genérico.

## Reuso máximo do que já existia

- **`RegistrarInteracaoService`** (009) — porta exportada **especificamente** para esta
  spec e para a 012 injetarem — resolve toda a idempotência por mensagem
  (`canalOrigem: "whatsapp:<canalId>"`, `idExterno: <wamid>`), tanto no recebimento quanto
  no envio.
- **`RegistrarLeadService`** (008) — cria o lead automaticamente quando um número
  desconhecido escreve (`origem: 'whatsapp'`, `idExterno: <telefone normalizado>` —
  idempotente contra reentregas).
- **`normalizarTelefone`** (008, `crm/domain/lead/normalizar-lead.ts`) — mesma normalização
  E.164 usada para casar `wa_id` da Meta contra `pessoa_telefone`/`lead.telefone`.
- **`cifrar`/`decifrar`/`mascararSegredo`/`ultimos4De`** (007) — os 3 segredos do canal
  (access token, app secret, webhook verify token) são cifrados com a mesma
  `CRM_INTEGRACAO_CIFRA_KEY` já obrigatória desde a 007.
- **`CrmAdminAuditService`** / `crm_admin_audit` (007) — canal, template e opt-out auditam
  na mesma tabela já usada para `equipe`/`integracao`/`janela_atendimento`/`feriado`
  (reuso deliberado: são configuração de baixo volume, perfil diferente de
  `lead`/`interacao`/`oportunidade`, que ganharam tabela `_audit` própria). **Nenhuma
  tabela de auditoria nova nesta spec.**

## Janela de 24h e envio — sempre derivados, sempre síncronos

`estaDentroDaJanela24h(ultimaMensagemRecebidaEm, agora)` (`crm/domain/whatsapp/janela-24h.ts`)
é pura: `f(última interação ENTRADA, agora) → boolean`, nunca uma coluna persistida/
expirando por job (Princípio V). O envio (`POST /crm/whatsapp/mensagens`) é **síncrono** —
chama a Graph API dentro do próprio request e devolve sucesso/erro na resposta HTTP; não há
fila (disparo em massa/agendamento é escopo da spec 015, fora daqui).

## Sincronização de templates — sempre sob demanda (Princípio VIII)

A constituição é explícita: "nenhuma sincronização automática com API externa — só sob
demanda, com confirmação no backend." `POST /crm/admin/whatsapp/canais/{id}/templates/
sincronizar` é a única forma de atualizar o catálogo local — nenhum job periódico chama a
Graph API. `TemplateWhatsapp.statusAprovacao` é sempre **espelho** da Meta, nunca editável
localmente.

## Opt-out — histórico de linhas, nunca um `UPDATE` que apague o pedido

Cada ciclo optar/reverter cria uma nova linha (`revertidoEm: null` = ativo); "está em
opt-out agora" é sempre a linha mais recente por telefone. Bloqueia só envios **iniciados
pela empresa** (livre ou template) — nunca o recebimento de mensagens que a própria pessoa
envie, alinhado à política real do WhatsApp de que a iniciativa de contato é o que precisa
de consentimento.

## RBAC (spec 004 estendido)

| Permissão | O que libera |
| --- | --- |
| `whatsapp:ver` | Canais, templates, janela de atendimento, status de opt-out |
| `whatsapp:enviar` | Enviar mensagem (livre ou template) |
| `whatsapp:gerir_optout` | Registrar/reverter opt-out |
| `crm_admin:gerir_whatsapp` | Configurar canal + sincronizar templates |

`administrador`/credencial de serviço concedem de graça — **0 migração de dados/seed**.

## Endpoints

- **Admin** (`/crm/admin/whatsapp/**`): `POST`/`GET`/`PATCH canais[/:id]`,
  `POST canais/:id/templates/sincronizar`, `GET canais/:id/templates`,
  `GET eventos[/:id]` (visibilidade de erro do webhook).
- **Operação** (`/crm/whatsapp/**`): `GET janela`, `POST mensagens`, `POST optout`,
  `POST optout/reverter`, `GET optout`.
- **Webhook** (`/webhooks/whatsapp`, público): `GET` (handshake), `POST` (eventos).

## Testes

423 testes unitários backend (32 novos de domínio puro: janela de 24h, assinatura HMAC,
schema do payload da Meta, mapeamento de status/tipo de conteúdo — todos sem banco, +1
asserção estendida em `catalogo.spec.ts`) + 222 e2e (23 novos: canal/template CRUD + segredo
mascarado, webhook com assinatura válida/inválida/handshake, resolução de pessoa/lead/
lead-novo, dedup por hash e por `wa_message_id`, mídia, callback de status, janela de 24h,
envio livre/template, opt-out, guard 401/403, catálogo) — suíte completa 003–011, todos
verdes. Frontend: 76 testes (4 novos, `WhatsappAdminPage.test.tsx`), todos verdes.
Lint/typecheck/build limpos nos dois workspaces.

## Frontend

`frontend/src/whatsapp/WhatsappAdminPage.tsx` — **CRM · WhatsApp**, atrás de
`crm_admin:ver`\|`whatsapp:ver` (`anyOf`): conectar canal (campos de segredo só-escrita,
nunca preenchidos de volta), lista de canais com segredo mascarado, templates por canal com
badge de status e botão "sincronizar agora" (atrás de `crm_admin:gerir_whatsapp`). Hooks
TanStack Query inline no componente — mesmo padrão de `crm-admin/IntegracoesTab.tsx` (007),
não um arquivo de hooks à parte.

**Escopo de frontend cortado deliberadamente**: indicador de janela de 24h e ação de
opt-out dentro de uma conversa (originalmente planejados como componentes próprios) foram
adiados para a spec 012 (Chat ao Vivo) — não existe hoje nenhuma tela de conversa para
hospedá-los, e o próprio ROADMAP já escopa o frontend desta spec como só "configuração de
canal e templates". Os endpoints de backend (`GET /crm/whatsapp/janela`,
`POST/GET /crm/whatsapp/optout*`) já existem e estão testados — a 012 só precisa consumi-los.
