# Data Model — Adaptadores de borda da Hotmart (spec 022)

**Nenhuma tabela nova. Nenhuma migração Prisma.** Esta spec só produz `EventoCanonico`
(contrato do `core`) a partir dos payloads da Hotmart e popula `MAPAS_STATUS`. As tabelas
`evento_origem` / `evento_etapa` / `transacao` já existem (specs 006/018).

## Tipos do adapter (`src/ingestao/adapters/hotmart/`)

### `FonteHotmart`
```ts
type FonteHotmart = 'hotmart.webhook' | 'hotmart.api' | 'hotmart.csv';
```
É também a chave `fonte` do `status-map` (spec 018).

### `ContaHotmart`
```ts
type ContaHotmart = 'HOTMART_PRD' | 'HOTMART_SVC';   // grafia do enum PlataformaOrigem do core
```

### `ResultadoParseHotmart`
```ts
interface ResultadoParseHotmart {
  eventoCanonico?: EventoCanonico;   // presente ⇔ passou no eventoCanonicoSchema do core
  idOrigem?: string;                 // String(purchase.transaction)
  tipoOrigem: FonteHotmart;
  payloadBruto: unknown;             // fato cru — sem segredo (client_secret/basic/access_token/hottok)
  erros: string[];                   // nunca faz o parser lançar
}
```

### `CamposCanonicosHotmart` (interno, entrada de `montarResultado`)
```ts
interface CamposCanonicosHotmart {
  idOrigem?: string;
  statusOrigem?: string;             // purchase.status cru
  ocorridoEm?: string;               // approved_date ?? order_date (epoch ms como string)
  comprador?: { nome?; emails?; telefones?; documentos?; endereco? };
  valores?: { bruto?; liquido?; taxas?; reembolso? };   // DinheiroCanonico { valorInteiro: bigint; moeda }
  oferta?: { nomeOrigem?; codigoOrigem?; quantidade? };
  assinaturaRecorrencia?: boolean;   // purchase.is_subscription
  numeroCiclo?: number;              // purchase.recurrency_number / recurrence_number
  ehAfiliada?: boolean;              // commission_as === 'AFFILIATE'
}
```

## Cliente da API (`HotmartApiClient`)

```ts
const HOTMART_API_CLIENT = Symbol('HOTMART_API_CLIENT');

type RecursoHotmart = 'history' | 'price-details';

interface ParametrosListarHotmart {
  conta: ContaHotmart;
  dataInicio: string;    // YYYY-MM-DD → epoch ms na impl
  dataFinal: string;
  transactionStatus?: string;   // CSV de status Hotmart, repassado como query
  cursor?: string;              // page_info.next_page_token
}

interface PaginaHotmart { itens: unknown[]; proximoCursor?: string; }

interface HotmartApiClient {
  listarVendas(p: ParametrosListarHotmart): Promise<PaginaHotmart>;
  listarDetalhesPreco(p: ParametrosListarHotmart): Promise<PaginaHotmart>;
}

class HotmartApiIndisponivelError extends Error {}   // → 422 no /sincronizar (nunca 500)
```

Impl real (`HotmartApiClientHttp`): OAuth2 `client_credentials` com cache de `access_token`
em memória por conta (`Map<ContaHotmart, { token; expiraEm }>`, folga de 60 s); `fetch`
nativo; base OAuth `https://api-sec-vlc.hotmart.com`, base de dados
`HOTMART_<conta>_API_BASE_URL` ?? `https://developers.hotmart.com/payments/api/v1`.

## `status-map/hotmart.ts` (em `src/financeiro/domain/status-map/`)

```ts
export const HOTMART: Record<FonteHotmart, Record<string, StatusTransacaoCanonico>>;
// 'hotmart.webhook' == 'hotmart.api' == 'hotmart.csv' → mesmo VOCABULARIO (ver research.md D-R10)
```
Registrado em `status-map/index.ts`:
```ts
Object.assign(MAPAS_STATUS, { HOTMART_PRD: HOTMART, HOTMART_SVC: HOTMART });
```

## Config (`env.schema.ts`) — chaves novas

| chave | tipo | default | uso |
| --- | --- | --- | --- |
| `HOTMART_PRD_CLIENT_ID` | `string().optional()` | — | OAuth2 `client_id` da conta PRD |
| `HOTMART_PRD_CLIENT_SECRET` | `string().optional()` | — | OAuth2 `client_secret` da conta PRD |
| `HOTMART_SVC_CLIENT_ID` | `string().optional()` | — | idem SVC |
| `HOTMART_SVC_CLIENT_SECRET` | `string().optional()` | — | idem SVC |
| `HOTMART_WEBHOOK_ENABLED` | `enum('true','false')` → boolean | `false` | liga a rota `/webhooks/hotmart/*` |

Já existentes (via `accountConfig`, spec 001/003), reaproveitadas:
`HOTMART_<conta>_API_BASE_URL` (base de dados), `HOTMART_<conta>_API_KEY` (token **Basic**),
`HOTMART_<conta>_WEBHOOK_TOKEN` (`hottok`, usado pelo webhook stub).

## Mapeamento payload → `EventoCanonico` (resumo)

| canônico | `sales/history` (API) | webhook `PURCHASE_*` | CSV |
| --- | --- | --- | --- |
| `idOrigem` | `purchase.transaction` | `data.purchase.transaction` | `transacao`/`transaction`/`codigo` |
| `statusOrigem` | `purchase.status` | `data.purchase.status` | `status`/`situacao` |
| `ocorridoEm` | `purchase.approved_date` ?? `.order_date` | `data.purchase.approved_date` ?? `.order_date` | `data_aprovacao` ?? `data_pedido` ?? `data_criacao` |
| `comprador.nome` | `buyer.name` | `data.buyer.name` | `nome`/`comprador` |
| `comprador.emails` | `[buyer.email]` | `[data.buyer.email]` | `email` |
| `comprador.documentos` | — | `[data.buyer.document]` | `documento`/`cpf_cnpj` |
| `comprador.telefones` | — | `data.buyer.checkout_phone_code` + `checkout_phone` | `telefone` |
| `comprador.endereco` | — | `data.buyer.address.*` | — |
| `valores.bruto` | `purchase.price.value` @ `price.currency_code` | `data.purchase.price.value` @ `.currency_value` | `valor`/`valor_bruto` @ `moeda` |
| `valores.taxas` | `purchase.hotmart_fee.total` (guarda) ou `fee+vat` do detalhe | — (guarda) | `taxa` (guarda) |
| `valores.liquido` | `bruto − taxas` (guarda) | `bruto − taxas` (guarda) | `valor_liquido` ou derivado |
| `oferta.codigoOrigem` | `purchase.offer.code` | `data.purchase.offer.code` | `codigo_oferta` |
| `oferta.nomeOrigem` | `purchase.offer.name` ?? `product.name` | `data.purchase.offer.name` ?? `data.product.name` | `oferta`/`produto` |
| `assinatura.ehRecorrencia` | `purchase.is_subscription === true` | `data.subscription` presente / `is_subscription` | `assinatura` truthy |
| `assinatura.numeroCiclo` | `purchase.recurrency_number` | `data.purchase.recurrence_number` | `ciclo` |
| `ehAfiliada` | `purchase.commission_as === 'AFFILIATE'` | `data.purchase.commission_as === 'AFFILIATE'` (quando presente) | `comissao`/`tipo` == `affiliate` |

`referenciaExterna` **nunca** é emitido (a Hotmart não terceiriza cobrança como a Guru→Asaas).
`full_price` / `original_offer_price` / `commissions[]` / `coupon` / `base` /
`real_conversion_rate` / `installments_number` / `order_bump` / `tracking` ficam **só no
`payload_bruto`**.
