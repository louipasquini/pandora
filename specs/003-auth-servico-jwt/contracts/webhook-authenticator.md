# Contract: `WebhookAuthenticator`

Primitiva reaproveitável de autenticação de webhook por conta de origem. **Separada** do
JWT de serviço (não usa `SERVICE_JWT_SECRET`, não passa pelo `JwtAuthGuard`). Nenhuma rota
`/webhooks/*` é criada nesta spec — as specs 019–022 injetam este serviço nos seus
controllers.

## API

```ts
type ResultadoWebhookAuth =
  | { autenticado: true; conta: PlataformaOrigem }
  | { autenticado: false; motivo: 'sem_token_configurado' | 'token_invalido' | 'token_ausente' };

class WebhookAuthenticator {
  // injeta ConfigService<AppConfig, true>
  autenticar(conta: PlataformaOrigem, tokenCandidato: string | undefined): ResultadoWebhookAuth;
}
```

- `tokenCandidato`: normalmente o valor de um header (`X-Webhook-Token`, `token`, ou o que
  a plataforma usar — a **extração** do header é responsabilidade do controller do adapter,
  não desta primitiva).
- Lê o segredo esperado via `accountConfig(config, conta)?.webhookToken`.

## Regras

| Situação | Resultado |
| --- | --- |
| conta sem `<PLATAFORMA>_WEBHOOK_TOKEN` configurado | `{ autenticado: false, motivo: 'sem_token_configurado' }` |
| `tokenCandidato` `undefined`/vazio | `{ autenticado: false, motivo: 'token_ausente' }` |
| `tokenCandidato` ≠ esperado (comparação em tempo constante) | `{ autenticado: false, motivo: 'token_invalido' }` |
| `tokenCandidato` === esperado | `{ autenticado: true, conta }` |

- Comparação **sempre** em tempo constante (`comparacaoConstante`, D5) — mesmo para
  comprimentos diferentes.
- Token **escopado à conta**: `autenticar(GURU_PRD, <token de GURU_SVC>)` → `token_invalido`.
- Sem log do token; log estruturado `"webhook.auth.reject"` com `conta` + `motivo` (sem o
  valor).

## Invariantes de teste (unit, sem banco)

Config _fixture_ com `GURU_PRD_WEBHOOK_TOKEN = 'segredo-guru-prd'` e
`GURU_SVC_WEBHOOK_TOKEN` **ausente**:

| # | Chamada | Esperado |
| --- | --- | --- |
| 1 | `autenticar(GURU_PRD, 'segredo-guru-prd')` | `{ autenticado: true, conta: GURU_PRD }` |
| 2 | `autenticar(GURU_PRD, 'errado')` | `{ autenticado: false, motivo: 'token_invalido' }` |
| 3 | `autenticar(GURU_PRD, undefined)` | `{ autenticado: false, motivo: 'token_ausente' }` |
| 4 | `autenticar(GURU_SVC, 'segredo-guru-prd')` | `{ autenticado: false, motivo: 'sem_token_configurado' }` |
| 5 | `autenticar(TMB, 'segredo-guru-prd')` | `{ autenticado: false, motivo: 'sem_token_configurado' }` |
| 6 | comprimentos diferentes | não lança; `token_invalido` |
| 7 | não referencia `SERVICE_JWT_SECRET` em nenhum caminho | (revisão + ausência de import) |
