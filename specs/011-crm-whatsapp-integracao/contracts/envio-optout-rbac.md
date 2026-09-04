# Contrato — Envio, Janela de 24h, Opt-out e RBAC

Base operacional: `/crm/whatsapp`. Requer `pessoaId` **xor** `leadId` em todo endpoint que
recebe uma âncora — mesma disciplina de `interacao`/`oportunidade` (009/010).

## `GET /crm/whatsapp/janela?pessoaId=|leadId=`

`whatsapp:ver`. Calcula a janela de 24h (FR-007) com base na última `Interacao`
(`tipo: WHATSAPP`, `direcao: ENTRADA`) daquela âncora.

```json
{ "dentroDaJanela": true, "ultimaMensagemRecebidaEm": "2026-09-04T10:00:00Z" }
```

`ultimaMensagemRecebidaEm: null` → `dentroDaJanela: false` (nunca houve mensagem recebida).

## `POST /crm/whatsapp/mensagens`

`whatsapp:enviar`. Body:

```json
{ "pessoaId": "...", "canalId": "...", "modo": "LIVRE", "texto": "Oi, tudo bem?" }
```

ou

```json
{
  "leadId": "...", "canalId": "...", "modo": "TEMPLATE",
  "templateId": "...", "parametros": ["Maria", "Curso X"]
}
```

Regras (em ordem, cada uma explícita no erro):

1. Âncora sem telefone resolvido → **422** `{erro: 'sem_telefone'}`.
2. Telefone em opt-out ativo → **409** `{erro: 'destinatario_em_optout'}` (FR-013).
3. Canal inexistente/inativo → **404**/**409** `{erro: 'canal_inativo'}`.
4. `modo: LIVRE` fora da janela de 24h → **409** `{erro: 'fora_da_janela_24h'}` (FR-009).
5. `modo: TEMPLATE` com `templateId` de outro canal, ou `statusAprovacao != APROVADO` →
   **422**/**409** `{erro: 'template_nao_aprovado'}` (FR-010).
6. Chamada à Graph API falha → **502** `{erro: 'falha_provedor', detalhe}` — nada é
   registrado (nenhuma `interacao` criada; nada foi de fato enviado).
7. Sucesso → registra via `RegistrarInteracaoService` (`direcao: SAIDA`,
   `canalOrigem: "whatsapp:<canalId>"`, `idExterno: <wamid retornado>`) + `MensagemWhatsapp`
   (`statusEntrega: ENVIADA`) → **201** `{ interacaoId, mensagem: MensagemView }`.

## Opt-out

### `POST /crm/whatsapp/optout`

`whatsapp:gerir_optout`. Body: `{ "telefone": "+5511999998888", "origem": "ATENDENTE" }`
(campo `pessoaId`/`leadId` opcional — se omitido, o sistema tenta resolver a partir do
telefone, sem exigir que já exista). Idempotente: telefone já em opt-out ativo → **200**
(devolve a linha existente, não cria outra) — FR-012.

### `POST /crm/whatsapp/optout/reverter`

`whatsapp:gerir_optout`. Body: `{ "telefone": "+5511999998888" }`. Sem opt-out ativo para
esse telefone → **404**. Reverte a linha ativa (`revertidoEm = agora`) → **200**.

### `GET /crm/whatsapp/optout?telefone=`

`whatsapp:ver`. `{ "emOptOut": true, "desde": "2026-09-01T12:00:00Z" }` ou
`{ "emOptOut": false, "desde": null }`.

## RBAC — catálogo (+4 permissões)

| id | recurso | rótulo |
| --- | --- | --- |
| `whatsapp:ver` | `whatsapp` | Ver canais, templates, janela de atendimento e status de opt-out |
| `whatsapp:enviar` | `whatsapp` | Enviar mensagens de WhatsApp em nome da empresa |
| `whatsapp:gerir_optout` | `whatsapp` | Registrar e reverter opt-out de WhatsApp |
| `crm_admin:gerir_whatsapp` | `crm_admin` | Configurar canal de WhatsApp e sincronizar templates |

`administrador` + credencial de serviço concedem de graça (mesmo padrão de todas as specs
anteriores) — **0 migração de dados/seed**. Toda rota nova sob `@RequerPermissao`; sem
marcador → 403 (fechado por omissão, spec 004 CL-03); as duas rotas de webhook (público)
**não** passam pelo `PermissionGuard` (não são `@Controller` sob o prefixo autenticado — ver
`webhook-inbound.md`).
