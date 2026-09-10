# Contrato — `status-map/guru.ts` (spec 021)

`src/financeiro/domain/status-map/guru.ts` — só `import { StatusTransacaoCanonico } from
'../../../core/core.module'`. **Proibido** importar `ingestao` (Princípio VI).

```ts
import { StatusTransacaoCanonico as S } from '../../../core/core.module';

const VOCABULARIO: Record<string, S> = {
  approved: S.PAGO,
  completed: S.PAGO,
  waiting_payment: S.PENDENTE,
  pending: S.PENDENTE,
  billet_printed: S.PENDENTE,
  processing: S.PENDENTE,
  analysis: S.PENDENTE,
  charging: S.PENDENTE,
  delayed: S.EM_ATRASO,
  in_recovery: S.EM_ATRASO,
  refunded: S.ESTORNADO,
  dispute: S.ESTORNADO,
  chargeback: S.CHARGEBACK,
  canceled: S.CANCELADO,
  expired: S.CANCELADO,
  rejected: S.RECUSADO,
  failed: S.RECUSADO,
  blocked: S.RECUSADO,
};

export const GURU: Record<string, Record<string, S>> = {
  'guru.webhook': VOCABULARIO,
  'guru.api': VOCABULARIO,
  'guru.csv': VOCABULARIO, // espelha o enum da API — Assumption
};
```

Registro em `status-map/index.ts` (após a linha da 020):

```ts
import { GURU } from './guru';
// spec 021 — contas `GURU_PRD` / `GURU_SVC` (webhook por conta, API v2 cursor, CSV).
Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU });
```

## Regras

- Chaves **case-sensitive**, **sem `trim`**, **sem sinônimos** — `mapearStatus` (018) não
  normaliza. Vocabulário exato vem das fixtures reais.
- **Fora do mapa de propósito** (→ `DESCONHECIDO` + revisão até fixture real): `trial`,
  `started`, `abandoned`, `scheduled`, `pending_transfer`, `transferred`.
- `RECUSADO` e `CHARGEBACK` já existem no enum `StatusTransacaoCanonico` do `core`.
- Qualquer bruto fora → `mapearStatus` devolve `DESCONHECIDO` + `revisar: true` + `motivo`
  (comportamento da 018 — esta spec só popula o mapa).

## Teste (`status-map/guru.spec.ts`)

- `MAPAS_STATUS.GURU_PRD === GURU` e `MAPAS_STATUS.GURU_SVC === GURU` (mesmo objeto).
- `it.each` de todos os pares `(fonte, bruto) → canônico`, `revisar: false`.
- `mapearStatus('GURU_PRD','guru.webhook','trial').revisar === true`.
- `mapearStatus('GURU_PRD','guru.webhook','Approved').revisar === true` (não normaliza caixa).
- Varredura: toda chave de `VOCABULARIO` aparece como `status` em alguma fixture de
  `adapters/guru/fixtures/` (cobertura de vocabulário — SC-014).
