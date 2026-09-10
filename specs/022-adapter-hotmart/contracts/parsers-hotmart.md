# Contrato — parsers puros da Hotmart (spec 022)

`src/ingestao/adapters/hotmart/` — **puros** (sem NestJS/Prisma/rede/locale). Todos recebem a
`conta` (`HOTMART_PRD` | `HOTMART_SVC`) e devolvem `ResultadoParseHotmart`.

```ts
export interface ResultadoParseHotmart {
  eventoCanonico?: EventoCanonico; // sse passou no eventoCanonicoSchema do core
  idOrigem?: string;               // String(purchase.transaction)
  tipoOrigem: 'hotmart.webhook' | 'hotmart.api' | 'hotmart.csv';
  payloadBruto: unknown;           // cru; sem segredo (hottok removido no webhook)
  erros: string[];                 // não-fatais; nunca lança
}
```

## `parseVendaApi(item, conta, detalhePreco?): ResultadoParseHotmart`

- `item` = 1 elemento de `sales/history.items[]` (`{ product, buyer, producer, purchase }`).
- `idOrigem = String(item.purchase.transaction)`; ausente → `erros: [..., 'sem identificador
  de transação']`, sem `eventoCanonico`.
- `statusOrigem = String(item.purchase.status ?? '')` cru.
- `ocorridoEm` = `String(item.purchase.approved_date ?? item.purchase.order_date ?? '')`
  (epoch ms; `parseInstante` **não** é chamado aqui).
- `moeda` = `ehMoeda(item.purchase.price.currency_code) ? ... : 'BRL'` (inválida → erro
  não-fatal).
- `valores.bruto` = `dinheiroDeValorHotmart(item.purchase.price.value, erros, ..., moeda)`.
- `valores.taxas` = `taxasDe(bruto, undefined, hotmart_fee.total | (fee.value+vat.value do
  detalhePreco))` — guarda `0 < taxa < bruto` + mesma moeda.
- `valores.liquido` = `bruto − taxas` sob a mesma guarda.
- `comprador` = `{ nome: buyer.name, emails: [buyer.email] }` (API não traz doc/telefone).
- `oferta` = `{ codigoOrigem: purchase.offer.code, nomeOrigem: purchase.offer.name ??
  product.name }`.
- `assinatura` = `purchase.is_subscription === true ? { ehRecorrencia: true, numeroCiclo:
  purchase.recurrency_number>1 ? n : undefined } : undefined`.
- `ehAfiliada` = `purchase.commission_as === 'AFFILIATE' ? true : undefined`.
- `detalhePreco` presente → anexado ao `payloadBruto` sob `price_details`; **nunca** obrigatório
  (FR-013).
- `referenciaExterna` **nunca** emitido.

## `parseWebhookHotmart(payload, conta): ResultadoParseHotmart[]`

- Aceita `{ id, event, version, creation_date, data: {...} }` **ou** um array disso → 1
  resultado por item. Lê de `data.*`.
- `payloadBruto` = o corpo **sem a chave `hottok`** (defesa — H-08).
- `idOrigem = String(data.purchase.transaction)`.
- `statusOrigem = String(data.purchase.status ?? '')` — **o `status`, não o `event`**.
- `ocorridoEm` = `String(data.purchase.approved_date ?? data.purchase.order_date ?? '')`.
- `moeda` = `data.purchase.price.currency_value` (validada) ?? `'BRL'`.
- `comprador` rico de `data.buyer`: `name`, `[email]`, `[document]`, telefone
  (`checkout_phone_code` + `checkout_phone`), endereço (`address.{street,number,complement,
  neighborhood,city,state,zipcode,country}`).
- `oferta` = `{ codigoOrigem: data.purchase.offer.code, nomeOrigem: data.purchase.offer.name
  ?? data.product.name }`.
- `assinatura` = `data.subscription` presente **ou** `data.purchase.is_subscription` truthy →
  `{ ehRecorrencia: true, numeroCiclo: data.purchase.recurrence_number>1 ? n : undefined }`.
- `ehAfiliada` = `data.purchase.commission_as === 'AFFILIATE'` (quando presente) → `true`.

## `parseCsvHotmart(conteudo, conta): ResultadoParseHotmart[]`

- Cópia estrutural do CSV da Guru/021. Detecta `,`/`;`, tira BOM, respeita aspas. 1 resultado
  por linha de dado.
- Aliases: `transaction` ← `transacao|transaction|codigo|código|id`; `status` ←
  `status|situacao|situação`; `gross` ← `valor|valor_bruto|valor da venda`; `net` ←
  `valor_liquido|líquido`; `tax` ← `taxa|taxas`; `currency` ← `moeda|currency`; `approved_at`
  ← `data_aprovacao|approved_date`; `order_at` ← `data_pedido|order_date`; `created_at` ←
  `data_criacao`; `offer_code` ← `codigo_oferta|offer_code`; `offer_name` ←
  `oferta|produto|product`; `subscription` ← `assinatura|subscription|is_subscription`;
  `cycle` ← `ciclo|recurrency_number`; `commission_as` ← `comissao|tipo|commission_as`;
  `name` ← `nome|comprador|cliente`; `email`; `doc` ← `documento|cpf_cnpj|cpf|cnpj`; `phone`
  ← `telefone|celular|phone`.
- Linha sem `transaction` → `erros: ["linha N: sem identificador de transação"]`, sem
  `eventoCanonico` (não aborta o lote).

## Comum

- `montarResultado(conta, fonte, payloadBruto, campos, erros)` valida o candidato com
  `eventoCanonicoSchema` do `core`. Schema inválido → `eventoCanonico` ausente + `erros`.
- Campo desconhecido no payload → **ignorado** (nunca erro).
- `Dinheiro` sempre `{ valorInteiro: bigint, moeda }` — `float` proibido.
