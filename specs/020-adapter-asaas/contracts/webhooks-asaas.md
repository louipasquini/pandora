# Contrato — Webhooks públicos da Asaas (spec 020)

## `POST /webhooks/asaas/prd` · `POST /webhooks/asaas/svc`

- **Auth**: pública (prefixo `/webhooks/` na allowlist da 003). Autenticação real =
  `WebhookAuthenticator.autenticar(<conta>, token)` com `ASAAS_PRD_WEBHOOK_TOKEN` /
  `ASAAS_SVC_WEBHOOK_TOKEN`. Token lido do header `asaas-access-token` (case-insensitive),
  `authorization: Bearer <token>` como _fallback_.
- **`<conta>`**: `prd` → `ASAAS_PRD`; `svc` → `ASAAS_SVC`. Fixa `plataforma_origem`.
- **Body**: `{ "event": "PAYMENT_*", "payment": { "id": "pay_…", "status": "…", … } }` —
  ou um array disso (defensivo; a Asaas manda 1 por request).
- **Content-Type**: `application/json`.

### Respostas

| Situação | HTTP | Corpo |
| --- | --- | --- |
| token ausente / inválido / da outra conta | `401` | `{ "message": "não autorizado" }` |
| parse OK + persistência OK | `200` | `{ "registrados": n, "ignorados": 0, "eventoIds": [...] }` |
| corpo sem `payment.id` (evento não-cobrança / lixo) | `200` | `{ "registrados": 0, "ignorados": n, "eventoIds": [] }` |
| parse com erro estrutural mas com `payment.id` | `200` | `{ "registrados": n, "ignorados": m, "eventoIds": [...] }` (evento cru salvo, `evento_canonico` nulo → `revisar`) |
| `RegistrarEventoService` lançou (falha etapa 0) | `5xx` | erro genérico (a Asaas reenfileira) |

- Idempotente: reentrega do mesmo evento → mesmo `hash` → dedup na etapa 0
  (`registrados` conta a chamada; `count(evento_origem)` não cresce).
- **Nunca** um `INSERT` direto — só `RegistrarEventoService.registrarEvento` por fato.
- O worker da 006 (ou `POST /ingestao/eventos/processar`) faz classificar → resolver pessoa
  → upsert transação.
