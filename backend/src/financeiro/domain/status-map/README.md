# `status-map/` — tradução de status bruto → `StatusTransacaoCanonico`

`financeiro` é dono de `status_canonico` e **não pode importar `ingestao`** (Princípio VI).
O adapter de borda (specs 019–022) produz `EventoCanonico.statusOrigem` (cru) +
`tipoOrigem` (o rótulo da fonte, ex.: `guru.webhook`, `tmb.csv`); a tradução para o enum
canônico mora aqui, **versionada por fonte**.

## Como as specs 019–022 populam

1. Criar `status-map/guru.ts` (idem tmb/asaas/hotmart):

   ```ts
   import { StatusTransacaoCanonico } from '../../../core/core.module';

   export const GURU: Record<string, Record<string, StatusTransacaoCanonico>> = {
     'guru.webhook': {
       approved: StatusTransacaoCanonico.PAGO,
       waiting_payment: StatusTransacaoCanonico.PENDENTE,
       refunded: StatusTransacaoCanonico.ESTORNADO,
       // ...
     },
     'guru.api': { /* ... */ },
     'guru.csv': { /* ... */ },
   };
   ```

2. Registrar em `index.ts`:

   ```ts
   import { GURU } from './guru';
   Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU });
   ```

3. Cada mapa é testado contra as **fixtures reais** da plataforma (Princípio III).

## Comportamento seguro por omissão (spec 018)

`MAPAS_STATUS` vazio → `mapearStatus` só resolve valores canônicos **exatos**
(`paraStatusTransacaoCanonico` do `core`); qualquer outro bruto →
`DESCONHECIDO` + `revisar: true` + `motivo`. A transação é gravada com
`precisa_revisao = true` e o `evento_origem` fica `revisar` — nunca "chuta" um status que
libera acesso (Regra Inviolável nº 15).
