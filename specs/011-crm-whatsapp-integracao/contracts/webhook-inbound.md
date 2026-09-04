# Contrato — Webhook de entrada (público)

Base: `/webhooks/whatsapp` — coberto pelo prefixo público `/webhooks/` já allowlistado no
`JwtAuthGuard` (spec 003, `PUBLIC_PATH_PREFIXES`). **Sem JWT.** Autenticação própria (ver
`research.md`): HMAC-SHA256 no `POST`, `hub.verify_token` no `GET`. 1 endpoint global — o
canal é resolvido a partir do payload (`metadata.phone_number_id`), nunca da URL.

## `GET /webhooks/whatsapp` — handshake de assinatura

Query params (padrão Meta): `hub.mode`, `hub.verify_token`, `hub.challenge`.

- `hub.mode !== 'subscribe'` → 403.
- `hub.verify_token` não bate (tempo constante) com o `webhookVerifyToken` de **nenhum**
  canal ativo → 403.
- Bate com algum canal ativo → **200**, corpo = `hub.challenge` **em texto puro** (não
  JSON — a Meta exige o eco exato da string).

## `POST /webhooks/whatsapp` — eventos

Header `X-Hub-Signature-256: sha256=<hex>`. Corpo = envelope da Meta (`object`,
`entry[].id`, `entry[].changes[].value.{messaging_product, metadata, contacts?, messages?,
statuses?}`, `entry[].changes[].field`). Schema `zod` tolerante (`.passthrough()`), captura
só os campos usados.

Fluxo (síncrono, dentro do próprio request):

1. Extrai `metadata.phone_number_id` do primeiro `change` para resolver o `CanalWhatsapp`
   (`@@unique([phoneNumberId])`).
   - Não resolve → HMAC verificado contra **nenhum** canal → **401** (não há appSecret pra
     validar uma assinatura de canal desconhecido; tratado como não-autêntico).
2. Verifica `X-Hub-Signature-256` = HMAC-SHA256(corpo bruto, `appSecret` do canal) —
   comparação em tempo constante. Inválida → **401**, nada é persistido.
3. Assinatura válida → calcula `hash` do corpo bruto; se já existe
   `EventoWebhookWhatsapp` com esse `hash` → **200** imediato (reentrega, FR-015 — nenhum
   reprocessamento).
4. Insere `EventoWebhookWhatsapp` (`status: PENDENTE`, `payloadBruto`, `hash`, `canalId`).
5. Para cada `messages[]` (mensagem recebida) — ver `data-model.md` §"Fluxo de resolução de
   destinatário": resolve pessoa/lead (ou cria lead), chama `RegistrarInteracaoService`
   (`tipo: WHATSAPP`, `direcao: ENTRADA`), cria `MensagemWhatsapp`
   (`statusEntrega: RECEBIDA`, `tipoConteudo` mapeado de `messages[].type`).
6. Para cada `statuses[]` (callback de status de mensagem **enviada**): localiza
   `MensagemWhatsapp` por `waMessageId = statuses[].id`; atualiza `statusEntrega` (mapeando
   `sent→ENVIADA`, `delivered→ENTREGUE`, `read→LIDA`, `failed→FALHOU` +
   `erroDetalhe = statuses[].errors[0].title` quando `failed`).
7. Atualiza `EventoWebhookWhatsapp.status = PROCESSADO` (ou `ERRO` + `erroDetalhe` se algum
   passo 5/6 lançar) e `CanalWhatsapp.ultimoWebhookRecebidoEm = agora`.
8. Responde **200** sempre que a assinatura foi válida (mesmo em erro de processamento) —
   evita tempestade de retry da Meta; o erro fica visível em
   `evento_webhook_whatsapp.erro_detalhe` (FR-014), consultável por quem tem `whatsapp:ver`
   (endpoint de leitura opcional — ver quickstart).

Nenhum destes dois handlers passa pelo `JwtAuthGuard`/`PermissionGuard` — a segurança é
inteiramente a verificação de assinatura acima.

## `GET /crm/admin/whatsapp/eventos` — visibilidade de erros (FR-014)

`crm_admin:ver`. Query: `status?` (default `erro`), paginação padrão do projeto (`pagina`/
`tamanho`, teto 100). Lista `EventoWebhookWhatsapp` mais recentes primeiro — `payloadBruto`
incluso no detalhe (`GET .../eventos/{id}`), omitido na listagem. Sem reprocessamento manual
nesta spec (fora do escopo dos FRs — o evento cru já existe para uma spec futura reprocessar
se necessário).
