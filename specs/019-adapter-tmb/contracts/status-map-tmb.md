# Contract — `status-map/tmb.ts`

`src/financeiro/domain/status-map/tmb.ts` — tradução do vocabulário bruto da TMB para
`StatusTransacaoCanonico`, **por fonte**, versionada. Consumido pela etapa 3
(`UPSERT_TRANSACAO`, 018) via `mapearStatus('TMB', tipoOrigem, statusBruto)`.

## Export

```ts
import { StatusTransacaoCanonico as S } from '../../../core/core.module';
export const TMB: Record<string, Record<string, S>> = { … };
```

Registrado em `status-map/index.ts`:
```ts
import { TMB } from './tmb';
Object.assign(MAPAS_STATUS, { TMB });
```

## Vocabulário (v1 — confirmável por fixture real)

| fonte (`tipoOrigem`) | bruto | canônico | fonte doc |
| --- | --- | --- | --- |
| `tmb.webhook-vendas` | `Efetivado` | `PAGO` | doc "Vendas → Eventos" |
| `tmb.webhook-vendas` | `Cancelado` | `CANCELADO` | idem |
| `tmb.api` | `Efetivado` | `PAGO` | doc "TMB API → exemplo de retorno" (`status_pedido`) |
| `tmb.api` | `Cancelado` | `CANCELADO` | inferido (mesma coluna) |
| `tmb.webhook-financeiro` | `Recebido` | `PAGO` | doc "Financeiro → Eventos" |
| `tmb.webhook-financeiro` | `Aguardando pagamento` | `PENDENTE` | idem |
| `tmb.webhook-financeiro` | `Vencido` | `EM_ATRASO` | idem ("vencida há mais de 30 dias") |
| `tmb.webhook-financeiro` | `Estornado` | `ESTORNADO` | idem ("estornada devido a cancelamento") |
| `tmb.webhook-financeiro` | `DELETED` | `CANCELADO` | idem ("deletada por renegociação/cancelamento") |
| `tmb.csv` | `Efetivado` / `Cancelado` | `PAGO` / `CANCELADO` | Assumption (colunas espelham Vendas) |

## Regras

- **Case-sensitive, sem `trim`, sem sinônimos.** `mapearStatus` (018) não normaliza — se a
  TMB mandar outra caixa/acento numa fixture real, **adiciona-se a entrada literal** (nunca
  `.toLowerCase()` — Regra Inviolável nº 15 / gambiarra 4.4).
- `status_financeiro` de **pedido** (`Adimplente` / `Inadimplente`) **não entra** — é resumo
  de carteira, não estado de transação. Fica só no `payload_bruto`.
- Bruto fora do mapa → `mapearStatus` já devolve `{ DESCONHECIDO, revisar: true, motivo }`
  (comportamento da 018). A transação grava `precisa_revisao = true` e o `evento_origem`
  fica `revisar`.
- `Cancelado`/`Estornado`/`DELETED` também disparam `classificar` (006):
  - `Estornado` casa `RE_ESTORNO` → `classificacao = REEMBOLSO`.
  - `Cancelado`/`DELETED` **não** casam o regex → `classificacao = VENDA_PROPRIA` (o
    _outcome_ é do `status_canonico`, não da classificação — comportamento correto).

## Teste (`tmb.spec.ts`)

- Cada par `(fonte, bruto)` da tabela → `mapearStatus('TMB', fonte, bruto).status` == o
  canônico esperado, `.revisar === false`.
- `mapearStatus('TMB', 'tmb.webhook-financeiro', 'Coisa Nova') → DESCONHECIDO`, `revisar:
  true`.
- Toda chave de `TMB[fonte]` aparece em pelo menos uma fixture de `parsers-tmb` (varredura
  no teste: `Object.values(TMB).flatMap(Object.keys)` ⊆ `statusOrigem` das fixtures).
- Paridade não é afetada (o teste de paridade enum Prisma × `core` da 018 segue igual).
