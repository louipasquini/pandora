# Data Model — Adaptadores de borda da Asaas (spec 020)

## Entidades de banco

**Nenhuma.** 0 migração, 0 tabela, 0 enum, 0 coluna. O adapter só produz o contrato
`EventoCanonico` (do `core`, spec 006/018) e o alimenta na porta da etapa 0
(`RegistrarEventoService`, spec 006). `evento_origem` / `evento_etapa` / `transacao` já
existem e são escritos **só** pelo pipeline.

## Contratos de código (sem persistência)

### `FonteAsaas` / `ResultadoParseAsaas` (`src/ingestao/adapters/asaas/tipos.ts`)

```ts
export type FonteAsaas = 'asaas.webhook' | 'asaas.api' | 'asaas.csv';

export interface ResultadoParseAsaas {
  /** presente sse o parse produziu um EventoCanonico válido (passou no eventoCanonicoSchema). */
  eventoCanonico?: EventoCanonico;
  /** String(payment.id) quando identificável — usado para log e para a chave de dedup. */
  idOrigem?: string;
  tipoOrigem: FonteAsaas;
  /** payload/linha cru — sempre repassado a RegistrarEventoService como payloadBruto. */
  payloadBruto: unknown;
  /** erros não-fatais de parse. Nunca lança. */
  erros: string[];
}
```

### `AsaasApiClient` (`src/ingestao/adapters/asaas/asaas-api-client.port.ts`)

```ts
export const ASAAS_API_CLIENT = Symbol('ASAAS_API_CLIENT');

export interface ParametrosListarPagamentos {
  conta: 'ASAAS_PRD' | 'ASAAS_SVC';
  dataInicio?: string;   // YYYY-MM-DD -> dateCreated[ge]
  dataFinal?: string;    // YYYY-MM-DD -> dateCreated[le]
  offset: number;        // 0-based
  limit: number;         // <= 100
}

export interface PaginaPagamentos {
  itens: unknown[];
  temProximaPagina: boolean;  // <- body.hasMore
}

export interface AsaasApiClient {
  listarPagamentos(p: ParametrosListarPagamentos): Promise<PaginaPagamentos>;
}

export class AsaasApiIndisponivelError extends Error {
  constructor(conta: string) {
    super(`conta ${conta} sem API configurada`);
    this.name = 'AsaasApiIndisponivelError';
  }
}
```

Impl real `AsaasApiClientHttp` (`fetch` nativo, header `access_token: <ASAAS_<conta>_API_KEY>`
+ `User-Agent`, base `ASAAS_<conta>_API_BASE_URL` ?? `https://api.asaas.com/v3`). Lança
`AsaasApiIndisponivelError` se a chave da conta não estiver configurada — o service converte
para **422**. Dublê nos testes.

## Mapa de campos: payload Asaas → `EventoCanonico`

Campos **obrigatórios** do `EventoCanonico` (schema do `core`): `plataformaOrigem`,
`idOrigem`, `tipoOrigem`, `statusOrigem`, `ocorridoEm`. Todo o resto é opcional e só é
emitido quando a fonte carrega o dado.

### Fonte 1 — webhook de cobrança (`asaas.webhook`)

Entrada: `{ event: "PAYMENT_*", payment: { … } }` (ou array disso). **1 `ResultadoParseAsaas`
por item.** `conta` vem do path (`/webhooks/asaas/prd` → `ASAAS_PRD`).

| `EventoCanonico` | Origem (`payment`) | Transformação |
| --- | --- | --- |
| `plataformaOrigem` | — | `conta` (param) |
| `idOrigem` | `payment.id` | `String(payment.id)`; ausente → erro, sem `eventoCanonico` |
| `tipoOrigem` | — | literal `"asaas.webhook"` |
| `statusOrigem` | `payment.status` / `payment.deleted` | `deleted === true ? "DELETED" : String(status ?? "")` (D-R9) |
| `ocorridoEm` | `paymentDate` ?? `confirmedDate` ?? `clientPaymentDate` ?? `dateCreated` | string crua (D-R13); ausente → `""` |
| `valores.bruto` | `payment.value` | `dinheiroDeValorAsaas` → `{ valorInteiro, moeda:"BRL" }` |
| `valores.liquido` | `payment.netValue` | `dinheiroDeValorAsaas` |
| `valores.taxas` | derivado | `bruto − liquido` só se `0 < resultado < bruto` |
| `assinatura.ehRecorrencia` | `payment.subscription` | `true` sse string não-vazia; senão bloco omitido |
| `referenciaExterna.idOrigem` | `payment.externalReference` | `textoOuUndefined`; ausente → bloco omitido; **nunca** emite `plataforma` |
| `oferta.nomeOrigem` | `payment.description` | `textoOuUndefined`; vazio → `oferta` omitido |
| `comprador` | — | **omitido** (`payment` não traz contato do cliente — D-R11) |
| `ehAfiliada` | — | **nunca** |
| `classificacao` | — | **nunca** (etapa 1/006 resolve) |

`event`, `payment.customer`, `payment.installment`, `payment.billingType`,
`payment.originalValue`, `payment.interestValue`, `payment.discount`, `payment.refunds`,
`payment.dueDate`, `payment.invoiceUrl`, `payment.bankSlipUrl` → **só `payload_bruto`**.

### Fonte 2 — API `GET /v3/payments` (`asaas.api`)

O objeto `payment` da API tem a **mesma forma** do de webhook → reaproveita **exatamente** a
montagem da Fonte 1, só troca `tipoOrigem` para `"asaas.api"`. `conta` vem do DTO.

### Fonte 3 — CSV (`asaas.csv`)

`parseCsvAsaas(conteudo, conta)` detecta separador, lê cabeçalho, mapeia colunas e monta o
`EventoCanonico`. Diferente das Fontes 1/2, o CSV **traz o comprador**:

| `EventoCanonico` | Coluna CSV (aliases) | Transformação |
| --- | --- | --- |
| `idOrigem` | `id` \| `identificador` | sem valor → erro por linha |
| `tipoOrigem` | — | `"asaas.csv"` |
| `statusOrigem` | `status` | cru (enum da API — Assumption) |
| `ocorridoEm` | `data_pagamento` \| `data_criacao` \| `vencimento` | string crua |
| `valores.bruto` | `value` \| `valor` | `dinheiroDeValorAsaas` |
| `valores.liquido` | `netvalue` \| `valor_liquido` | `dinheiroDeValorAsaas` |
| `valores.taxas` | derivado | `bruto − liquido` (guarda de sanidade) |
| `assinatura.ehRecorrencia` | `subscription` \| `assinatura` | `true` sse não-vazio |
| `referenciaExterna.idOrigem` | `externalreference` \| `referencia_externa` | `textoOuUndefined` |
| `oferta.nomeOrigem` | `description` \| `descricao` | `textoOuUndefined` |
| `comprador.nome` | `customer` \| `cliente` | `textoOuUndefined` |
| `comprador.emails` | `email` | `[email]` se não-vazio |
| `comprador.documentos` | `cpfcnpj` \| `cpf_cnpj` | `[soDigitos(..)]` se ≥ 1 dígito |
| `comprador.telefones` | `phone` \| `telefone` | `telefonesDeString(..)` |

## Vocabulário de status — `src/financeiro/domain/status-map/asaas.ts`

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
  DELETED: S.CANCELADO, // sintético (A-05 / D-R9)
};

export const ASAAS: Record<string, Record<string, S>> = {
  'asaas.webhook': VOCABULARIO,
  'asaas.api': VOCABULARIO,
  'asaas.csv': VOCABULARIO, // CSV espelha o enum da API — Assumption
};
```

Registro em `status-map/index.ts`:
`Object.assign(MAPAS_STATUS, { ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS })`.

- `mapearStatus` (018) é chamado com `plataforma = entrada.plataformaOrigem` (`"ASAAS_PRD"` /
  `"ASAAS_SVC"`) e `fonte = tipoOrigem` — por isso as duas contas mapeiam para o mesmo
  objeto.
- Chaves **case-sensitive**, **sem `trim`** — vocabulário exato. Se um export real usar
  rótulos pt-BR (`Recebida`…), adiciona-se a entrada literal; não se implementa
  `.toLowerCase()` (Regra nº 15).
- `CHARGEBACK` já existe no enum `StatusTransacaoCanonico` do `core` (Apêndice B).
- Qualquer bruto fora do mapa → `mapearStatus` devolve `DESCONHECIDO` + `revisar` + motivo.

## Índices / constraints

Nenhum. A dedup é `evento_origem @@unique(plataforma_origem, id_origem, hash)` (006) e a
identidade da transação é `transacao @@unique(plataforma_origem, id_origem)` (018) — ambas já
existem.

## Retenção / LGPD

O `payload_bruto` da Asaas contém PII no CSV (nome, documento, e-mail, telefone) e o id de
cliente no webhook. Fica no `evento_origem` imutável — a pseudonimização (spec 047) opera
sobre `pessoa`, não sobre o evento cru. As **fixtures** do repositório usam dados fictícios.
