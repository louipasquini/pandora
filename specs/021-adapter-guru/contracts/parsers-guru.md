# Contrato — parsers puros da Guru (spec 021)

`src/ingestao/adapters/guru/` — **puros** (sem NestJS/Prisma/rede/locale). Todos recebem a
`conta` (`GURU_PRD` | `GURU_SVC`) e devolvem `ResultadoParseGuru`.

```ts
export interface ResultadoParseGuru {
  eventoCanonico?: EventoCanonico; // sse passou no eventoCanonicoSchema do core
  idOrigem?: string;               // String(transaction.id)
  tipoOrigem: 'guru.webhook' | 'guru.api' | 'guru.csv';
  payloadBruto: unknown;           // cru; no webhook, SEM api_token
  erros: string[];                 // não-fatais; nunca lança
}
```

## `parseWebhookGuru(payload: unknown, conta: ContaGuru): ResultadoParseGuru[]`

- Aceita um objeto de transação Guru **ou** um array disso → 1 resultado por item.
- `payloadBruto` = o item **sem a chave `api_token`** (segredo — G-14).
- `idOrigem = String(t.id)`; ausente → `erros: [..., 'sem identificador de transação']`, sem
  `eventoCanonico`.
- `statusOrigem = String(t.status ?? '')` cru.
- `ocorridoEm` = `t.dates.confirmed_at` ?? `.ordered_at` ?? `.created_at` ?? `.updated_at` ??
  `''`.
- `moeda` = `ehMoeda(t.payment.currency) ? t.payment.currency : 'BRL'` (inválida → erro
  não-fatal).
- `valores` = `{ bruto: gross, liquido: net, taxas: tax.value|(gross−net) se 0<taxa<bruto }`
  — todos `dinheiroDeValorGuru(v, erros, rotulo, moeda)`.
- `comprador` do `t.contact` (nome/emails/documentos/telefones/endereco); tudo vazio →
  omitido.
- `oferta` = `{ codigoOrigem: product.offer.id ?? items[0].offer.id, nomeOrigem:
  product.offer.name ?? product.name ?? items[0].name, quantidade: product.qty se > 0 }`;
  nada → omitido.
- `assinatura` = `{ ehRecorrencia: true, numeroCiclo: invoice.cycle se > 0 }` **sse**
  `product.type === 'plan'` **e** `t.subscription?.id` presente; senão omitido.
- `ehAfiliada` = `true` sse `String(t.type) === 'affiliate'`; senão indefinido.
- **Nunca** emite `referenciaExterna` nem `classificacao`.

## `parseTransacaoApi(item: unknown, conta: ContaGuru): ResultadoParseGuru`

- `tipoOrigem = 'guru.api'`. Reaproveita **exatamente** a extração da Fonte 1 (o objeto de
  `data[]` tem a mesma forma). `item` não-objeto → erro, sem `eventoCanonico`.

## `parseCsvGuru(conteudo: string, conta: ContaGuru): ResultadoParseGuru[]`

- Tira BOM; detecta separador (`,` vs `;` no cabeçalho); mini state-machine de aspas (`""` =
  aspa literal). 1 resultado por linha de dado.
- Mapa de colunas → canônicas (aliases inglês/pt-BR; ver `data-model.md` §Fonte 3).
- Linha sem `id` → `erros: ['linha N: sem identificador de transação']`, sem `eventoCanonico`.
- Cabeçalho sem coluna de id → **toda** linha vira erro (nunca lança).
- Diferente do webhook/API, o CSV **traz comprador** completo das colunas.

## Invariantes (todos os parsers)

- Campo desconhecido no payload → **ignorado** (nunca erro).
- `Dinheiro` sempre `{ valorInteiro: bigint, moeda }` — nenhum `float` no resultado.
- `parseInstante` **não** é chamado (a etapa 3/018 o aplica).
- Exercidos por teste unitário contra **fixtures reais** (`adapters/guru/fixtures/`).
