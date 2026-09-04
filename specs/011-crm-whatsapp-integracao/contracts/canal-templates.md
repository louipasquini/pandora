# Contrato — Canal e Templates (Administração)

Base: `/crm/admin/whatsapp`. Leitura (`GET`) de canal → `crm_admin:ver`; escrita de canal →
`crm_admin:gerir_whatsapp`. Leitura de templates → `whatsapp:ver` (precisa ser visível a
quem só envia mensagem, não só a administradores); sincronizar templates (escrita, chama a
Graph API) → `crm_admin:gerir_whatsapp`.

## `POST /crm/admin/whatsapp/canais`

`crm_admin:gerir_whatsapp`. Body:

```json
{
  "nome": "AEN comercial",
  "numeroTelefone": "+55 11 91234-5678",
  "wabaId": "1029384756",
  "phoneNumberId": "1122334455",
  "accessToken": "EAAG...",
  "appSecret": "9f1c...",
  "webhookVerifyToken": "pandora-verify-abc123"
}
```

- 422 se `phoneNumberId` já existe em outro canal.
- 201 → `{ canal: CanalView }` (segredos nunca no corpo de resposta).
- Audita em `crm_admin_audit` (`entidade: 'canal_whatsapp'`, segredo entra como marcador
  `{segredo: 'definido'}`, nunca o valor).

## `GET /crm/admin/whatsapp/canais` / `GET .../canais/{id}`

`crm_admin:ver`. `CanalView`:

```json
{
  "id": "...", "nome": "...", "numeroTelefone": "...", "wabaId": "...",
  "phoneNumberId": "...", "ativo": true, "ultimoWebhookRecebidoEm": "...|null",
  "accessTokenDefinido": true, "accessTokenMascarado": "••••••1234",
  "appSecretDefinido": true, "appSecretMascarado": "••••••5678",
  "webhookVerifyTokenDefinido": true, "webhookVerifyTokenMascarado": "••••••cd90",
  "criadoEm": "...", "atualizadoEm": "..."
}
```

## `PATCH /crm/admin/whatsapp/canais/{id}`

`crm_admin:gerir_whatsapp`. Body parcial: `nome?`, `numeroTelefone?`, `ativo?`,
`accessToken?`, `appSecret?`, `webhookVerifyToken?` (qualquer segredo presente no body é
**rotacionado** — cifra de novo, nunca faz merge/append). 404 se não existe. Audita
`campo: 'editado'` (ou `'segredo_rotacionado'` se algum segredo veio no body).

Sem `DELETE` — só `ativo=false` (mesmo padrão de `Equipe`/`Integracao`, 007).

## `POST /crm/admin/whatsapp/canais/{id}/templates/sincronizar`

`crm_admin:gerir_whatsapp`. **Sob demanda** (Princípio VIII — nunca automático). Chama
`GET https://graph.facebook.com/{versão}/{wabaId}/message_templates` com o access token do
canal; faz *upsert* local por `(canalId, nomeMeta, idioma)`.

- 404 se canal não existe; 409 `{erro: 'canal_inativo'}` se `ativo=false`.
- 502 `{erro: 'falha_provedor', detalhe}` se a Graph API falhar (rede, token inválido, etc.)
  — nada é alterado localmente nessa falha.
- 200 → `{ sincronizados: N, templates: TemplateView[] }`.
- Audita em `crm_admin_audit` (`entidade: 'template_whatsapp'`, `campo: 'sincronizado'`,
  `valorNovo: { total: N }`).

## `GET /crm/admin/whatsapp/canais/{id}/templates`

`whatsapp:ver`. Query: `statusAprovacao?` (filtro). `TemplateView`:

```json
{
  "id": "...", "canalId": "...", "nomeMeta": "boas_vindas_curso",
  "idioma": "pt_BR", "categoria": "UTILITY", "corpo": "Olá {{1}}, ...",
  "statusAprovacao": "APROVADO", "motivoRejeicao": null,
  "sincronizadoEm": "...", "criadoEm": "...", "atualizadoEm": "..."
}
```

Só templates com `statusAprovacao: APROVADO` podem ser usados em
`POST /crm/whatsapp/mensagens` (ver `envio-mensagem.md`) — FR-010.
