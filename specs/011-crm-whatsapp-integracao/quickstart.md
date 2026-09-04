# Quickstart — 011-crm-whatsapp-integracao

Valida a integração fim a fim **sem** depender de credenciais reais da Meta — o cliente da
Graph API é injetado por interface (`GraphApiClient`), então os cenários abaixo usam um
dublê nos testes de e2e/unit. Em produção, os mesmos passos valem com credenciais reais de
um número de teste da Meta (App em modo desenvolvimento).

## Pré-requisitos

- Backend rodando (`npm run start:dev --workspace backend`) contra Postgres com as
  migrações da 001–010 aplicadas + a migração desta spec.
- Token de serviço válido (`POST /auth/token`) com um perfil que tenha
  `crm_admin:gerir_whatsapp`, `whatsapp:enviar`, `whatsapp:gerir_optout`, `whatsapp:ver`
  (o perfil `administrador` do seed já cobre tudo).
- `CRM_INTEGRACAO_CIFRA_KEY` já configurada (obrigatória desde a 007 — reaproveitada aqui,
  nenhuma chave nova).

## 1. Conectar um canal

```bash
curl -X POST http://localhost:3001/crm/admin/whatsapp/canais \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nome":"AEN comercial","numeroTelefone":"+5511912345678",
       "wabaId":"1029384756","phoneNumberId":"1122334455",
       "accessToken":"token-de-teste","appSecret":"segredo-de-teste",
       "webhookVerifyToken":"verify-de-teste"}'
```

Esperado: `201`, `canal.accessTokenDefinido: true`, `canal.accessTokenMascarado` termina
com os 4 últimos caracteres de `"token-de-teste"`; o valor pleno não aparece na resposta.

## 2. Sincronizar templates (dublê de Graph API nos testes)

```bash
curl -X POST http://localhost:3001/crm/admin/whatsapp/canais/$CANAL_ID/templates/sincronizar \
  -H "Authorization: Bearer $TOKEN"
```

Esperado: `200`, `sincronizados >= 1`; `GET .../templates` lista o(s) template(s) com
`statusAprovacao`.

## 3. Receber uma mensagem (simular webhook)

```bash
BODY='{"object":"whatsapp_business_account","entry":[{"id":"1029384756","changes":[{
  "field":"messages","value":{"messaging_product":"whatsapp",
  "metadata":{"phone_number_id":"1122334455"},
  "contacts":[{"wa_id":"5511999998888","profile":{"name":"Maria Teste"}}],
  "messages":[{"from":"5511999998888","id":"wamid.TESTE1","timestamp":"1735900000",
  "type":"text","text":{"body":"Oi, quero saber sobre o curso"}}]}}]}]}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "segredo-de-teste" | sed 's/^.* //')
curl -X POST http://localhost:3001/webhooks/whatsapp \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$BODY"
```

Esperado: `200`. Um novo `Lead` com `telefone: "+5511999998888"` e `origem: "whatsapp"` é
criado (número desconhecido — FR-005); `GET /crm/leads/{id}/interacoes` mostra a mensagem
recebida. Reenviar o **mesmo** `curl` não duplica a interação nem o `Lead` (FR-015).

## 4. Responder dentro da janela de 24h

```bash
curl -X POST http://localhost:3001/crm/whatsapp/mensagens \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"leadId\":\"$LEAD_ID\",\"canalId\":\"$CANAL_ID\",\"modo\":\"LIVRE\",
       \"texto\":\"Oi Maria, posso ajudar!\"}"
```

Esperado: `201` (a última mensagem recebida do passo 3 está a segundos de distância — dentro
da janela).

## 5. Simular janela fechada (> 24h) e template obrigatório

Num teste, força a `ocorridoEm` da interação de entrada para `> 24h` atrás e repete o envio
`LIVRE`: espera **409** `{erro: 'fora_da_janela_24h'}`. Repetir com `modo: TEMPLATE` e um
`templateId` `APROVADO`: espera **201**. Repetir com um template `PENDENTE`: espera **422/
409** `{erro: 'template_nao_aprovado'}`.

## 6. Opt-out

```bash
curl -X POST http://localhost:3001/crm/whatsapp/optout \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"telefone":"+5511999998888","origem":"PROPRIO_NUMERO"}'
# tentar enviar de novo → 409 destinatario_em_optout
curl -X POST http://localhost:3001/crm/whatsapp/optout/reverter \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"telefone":"+5511999998888"}'
# envio volta a funcionar (dentro da janela ainda aberta / com template)
```

## 7. RBAC

Repetir o passo 1 com um token sem `crm_admin:gerir_whatsapp` → **403**. Repetir o passo 3
(webhook) sem assinatura ou com assinatura errada → **401**, e nenhum `Lead`/`Interacao`
novo é criado.

## Critério de aceite

Os 7 passos acima, verdes, cobrem as 4 User Stories do `spec.md` de ponta a ponta sem
depender de rede externa real.
