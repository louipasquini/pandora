# Contrato — `status-map/asaas.ts` (spec 020)

`src/financeiro/domain/status-map/asaas.ts` — vocabulário bruto da Asaas →
`StatusTransacaoCanonico`, **compartilhado** entre `ASAAS_PRD` e `ASAAS_SVC` e entre as 3
fontes (`asaas.webhook`, `asaas.api`, `asaas.csv` — o CSV espelha o enum da API, Assumption).

```ts
import { StatusTransacaoCanonico as S } from '../../../core/core.module';

const VOCABULARIO: Record<string, S> = {
  RECEIVED: S.PAGO,
  CONFIRMED: S.PAGO,
  RECEIVED_IN_CASH: S.PAGO,
  DUNNING_RECEIVED: S.PAGO,
  PENDING: S.PENDENTE,
  AWAITING_RISK_ANALYSIS: S.PENDENTE,
  OVERDUE: S.EM_ATRASO,
  DUNNING_REQUESTED: S.EM_ATRASO,
  REFUNDED: S.ESTORNADO,
  REFUND_REQUESTED: S.ESTORNADO,
  REFUND_IN_PROGRESS: S.ESTORNADO,
  CHARGEBACK_REQUESTED: S.CHARGEBACK,
  CHARGEBACK_DISPUTE: S.CHARGEBACK,
  AWAITING_CHARGEBACK_REVERSAL: S.CHARGEBACK,
  DELETED: S.CANCELADO,   // sintético — payment.deleted === true (A-05)
};

export const ASAAS: Record<string, Record<string, S>> = {
  'asaas.webhook': VOCABULARIO,
  'asaas.api': VOCABULARIO,
  'asaas.csv': VOCABULARIO,
};
```

Registro em `status-map/index.ts`:

```ts
import { ASAAS } from './asaas';
// spec 020 — contas ASAAS_PRD / ASAAS_SVC (webhook por conta, API v3, CSV).
Object.assign(MAPAS_STATUS, { ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS });
```

## Regras

- `mapearStatus(plataforma, fonte, bruto)` (018) recebe `plataforma = "ASAAS_PRD"` /
  `"ASAAS_SVC"` (valor do enum) e `fonte = tipoOrigem` — as duas contas apontam para o mesmo
  objeto `ASAAS`.
- Chaves **case-sensitive, sem `trim`, sem sinônimos** — `mapearStatus` não normaliza.
  Vocabulário pt-BR de um export real (`Recebida`…) → adiciona-se a entrada literal, nunca
  `.toLowerCase()` (Regra Inviolável nº 15 / gambiarra 4.4).
- `AUTHORIZED` (pré-autorização de cartão) fica **fora** do mapa de propósito → cai em
  `DESCONHECIDO` + revisão até uma fixture real aparecer.
- `status_financeiro` a nível de conta/cliente não existe na Asaas (é gateway de cobrança —
  a cobrança já É a unidade); nada análogo ao `Adimplente/Inadimplente` da TMB.
- Qualquer bruto fora do mapa → `mapearStatus` devolve `DESCONHECIDO` + `revisar: true` +
  `motivo` → `transacao.precisa_revisao = true` + `evento_origem.status = revisar`.
- Cada entrada é coberta por uma fixture real no `asaas.spec.ts` (Princípio III / SC-014).
