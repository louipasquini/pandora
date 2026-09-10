# Contract — Webhooks públicos da TMB

Rotas **públicas** (prefixo `/webhooks/` — allowlist da 003; sem `JwtAuthGuard`).
Autenticação: `WebhookAuthenticator.autenticar('TMB', token)` (003), token em
`x-tmb-webhook-token` (case-insensitive) ou `authorization: Bearer <token>`.

## `POST /webhooks/tmb/vendas`

- **Auth**: token TMB. Inválido/ausente → `401 { "message": "não autorizado" }`, nenhum
  `evento_origem`.
- **Body**: JSON do webhook Vendas da TMB (objeto achatado). Chaves desconhecidas
  ignoradas.
- **Fluxo**: `parseWebhookVendas(body)` → `RegistrarEventoService.registrarEvento({
  plataformaOrigem: 'TMB', tipoOrigem: 'tmb.webhook-vendas', idOrigem, payloadBruto: body,
  eventoCanonico? })`.
- **200/202**:
  ```json
  { "registrados": 1, "ignorados": 0, "eventoIds": ["<uuid>"] }
  ```
  `202 Accepted` sempre que a persistência da etapa 0 deu certo (mesmo com parse parcial —
  `ignorados: 1`, `eventoCanonico` nulo, evento vai para `revisar`).
- **5xx**: só se `RegistrarEventoService` lançar (falha de persistência) — a TMB reenvia.
- **Idempotência**: reenvio do mesmo corpo → `registrados: 1` mas `criado: false` no
  registro (dedup por `(TMB, idOrigem, hash)`); nenhuma transação nova.

## `POST /webhooks/tmb/financeiro`

- **Auth**: idem.
- **Body**: `[{ "dados": { … } }, …]` (array). Também aceita `{ "dados": {…} }` único e
  objeto achatado. `[]` → `202 { "registrados": 0 }`.
- **Fluxo**: `parseWebhookFinanceiro(body)` → **um** `registrarEvento` por item, todos com
  `tipoOrigem: 'tmb.webhook-financeiro'`, `idOrigem = String(dados.pedido_id)`.
- **200/202**:
  ```json
  { "registrados": 3, "ignorados": 0, "eventoIds": ["<uuid>", "<uuid>", "<uuid>"] }
  ```
- Itens idênticos no mesmo array → dedup por hash (o 2º não cria).

## Observações

- Nenhuma das rotas roda o worker. O processamento é assíncrono (worker da 006, ou
  `POST /ingestao/eventos/processar` nos testes).
- Nenhuma das rotas resolve pessoa, oferta, status canônico — isso é do pipeline (018+).
- Resposta **não** vaza PII nem o `evento_canonico` (só ids).
