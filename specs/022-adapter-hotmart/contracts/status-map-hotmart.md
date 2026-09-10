# Contrato — `status-map/hotmart.ts` (spec 022)

`src/financeiro/domain/status-map/hotmart.ts` — só `import { StatusTransacaoCanonico } from
'../../../core/core.module'`. **Proibido** importar `ingestao` (Princípio VI).

```ts
import { StatusTransacaoCanonico as S } from '../../../core/core.module';

const VOCABULARIO: Record<string, S> = {
  APPROVED: S.PAGO,
  COMPLETE: S.PAGO,
  PRINTED_BILLET: S.PENDENTE,
  WAITING_PAYMENT: S.PENDENTE,
  UNDER_ANALISYS: S.PENDENTE,            // grafia da Hotmart (com "I")
  PROCESSING_TRANSACTION: S.PENDENTE,
  OVERDUE: S.EM_ATRASO,
  NO_FUNDS: S.EM_ATRASO,
  REFUNDED: S.ESTORNADO,
  PARTIALLY_REFUNDED: S.ESTORNADO,
  DISPUTE: S.ESTORNADO,
  CHARGEBACK: S.CHARGEBACK,
  PROTESTED: S.CHARGEBACK,
  CANCELLED: S.CANCELADO,
  EXPIRED: S.CANCELADO,
  BLOCKED: S.RECUSADO,
};

export const HOTMART: Record<string, Record<string, S>> = {
  'hotmart.webhook': VOCABULARIO,
  'hotmart.api': VOCABULARIO,
  'hotmart.csv': VOCABULARIO,   // espelha o enum da API (Assumption — sem export real na doc)
};
```

Registro em `status-map/index.ts`:

```ts
import { HOTMART } from './hotmart';
// spec 022 — contas HOTMART_PRD / HOTMART_SVC (sales/history + price/details, CSV, webhook stub)
Object.assign(MAPAS_STATUS, { HOTMART_PRD: HOTMART, HOTMART_SVC: HOTMART });
```

- `STARTED` / `PRE_ORDER` **ficam fora** do mapa (de propósito) → `mapearStatus` devolve
  `DESCONHECIDO` + `revisar` (Regra Inviolável nº 15) — mesmo precedente do `AUTHORIZED` da
  Asaas / `trial` da Guru.
- `mapearStatus` (018) não faz `trim`/`toUpperCase`/sinônimo — o vocabulário é literal.
- Cada entrada tem uma fixture real que a exercita em `hotmart.spec.ts` (SC-015).
