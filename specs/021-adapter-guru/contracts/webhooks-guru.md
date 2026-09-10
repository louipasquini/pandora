# Contrato — webhooks públicos da Guru (spec 021)

`src/ingestao/guru/guru-webhooks.controller.ts` — `@Controller('webhooks/guru')`.

## `POST /webhooks/guru/prd` · `POST /webhooks/guru/svc`

- **Públicos** (`@Public()` — prefixo `/webhooks/` já é allowlist da 003; sem `JwtAuthGuard`/
  `PermissionGuard`). `@HttpCode(200)`.
- **Autenticação**: lê `body.api_token` (campo do JSON — a Guru **não** usa header). Chama
  `WebhookAuthenticator.autenticar(PlataformaOrigem.GURU_PRD|GURU_SVC, String(body?.api_token))`.
  Falha → `UnauthorizedException` (**401**), corpo genérico, **nenhum** `evento_origem`.
- **Fluxo** (após autenticar):
  1. `parseWebhookGuru(body, conta)` — `conta` do path.
  2. para cada resultado: se `!idOrigem` → `ignorados++`, `logger.warn`, **não registra**;
     senão `RegistrarEventoService.registrarEvento({ plataformaOrigem, tipoOrigem: r.tipoOrigem,
     idOrigem: r.idOrigem, payloadBruto: r.payloadBruto, eventoCanonico: r.eventoCanonico })`.
  3. Responde `200 { registrados, ignorados, eventoIds }`.
- `RegistrarEventoService` lançou (falha etapa 0) → propaga → **5xx** (a Guru reenvia).
- Erro de **parse** (sem `eventoCanonico` mas com `idOrigem`) → registra o cru,
  `ignorados++`, resposta `200` (a Guru **suprime retentativas** em 4xx — nunca devolver 422).

## Respostas

| Cenário | HTTP | Corpo |
| --- | --- | --- |
| `api_token` ok, venda válida | 200 | `{ registrados: 1, ignorados: 0, eventoIds: ["…"] }` |
| `api_token` ausente/errado/da outra conta | 401 | `{ statusCode: 401, message: "não autorizado" }` |
| corpo sem `id` (webhook de assinatura/contrato / lixo) | 200 | `{ registrados: 0, ignorados: 1, eventoIds: [] }` |
| parse parcial (tem `id`, sem `eventoCanonico`) | 200 | `{ registrados: 1, ignorados: 1, eventoIds: ["…"] }` |
| `RegistrarEventoService` lançou | 500 | genérico |

## Segurança

- `api_token` **nunca** entra no `payload_bruto` (`parseWebhookGuru` o remove — G-14).
- `WebhookAuthenticator` comparação em **tempo constante** por conta; token de PRD em `/svc`
  → 401.
