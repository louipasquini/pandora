# Research — Adaptadores de borda da Guru (spec 021)

Fonte primária: `Documentação Guru.md` (doc pública — "Webhook para Vendas", "Transactions"
OpenAPI v2, "Status de Vendas", "Paginação", "Webhooks"). Contexto: `specs/006-*` (pipeline
+ porta `RegistrarEventoService`), `specs/018-*` (`status-map` + `EventoCanonico` no
`core/pipeline/`), `specs/019-*` / `specs/020-*` (adapters TMB e Asaas — **molde direto**),
visão Apêndice A (Guru) e Apêndice C (`ingestao/adapters/{guru,…}`).

## D-R1 — As 3 fontes da Guru

| Fonte | Gatilho | Formato | Status | Identidade | Observações |
| --- | --- | --- | --- | --- | --- |
| **webhook de Vendas** (por conta) | mudança de estado de uma venda | objeto JSON `{ id, status, dates, payment, contact, product, items, subscription, type, api_token, webhook_type }` | `status` | `id` (UUID) | 1 por request; `api_token` no corpo = auth; `webhook_type` também cobre subscription/contract/eticket (mesma URL). |
| **API `GET /api/v2/transactions`** | pull sob demanda | `{ data: [transaction…], has_more_pages, next_cursor, per_page, total_rows }` | `status` | `id` | header `Authorization: Bearer <token>`; **cursor** (`next_cursor`); janela obrigatória (`ordered_at`/`confirmed_at`/`cancelled_at` `_ini`+`_end`) ≤ 180 dias; base `https://digitalmanager.guru/api/v2`. |
| **CSV** | export manual / backfill | texto com cabeçalho | coluna `status`/`situacao` | coluna `id`/`transacao`/`codigo` | **Sem exemplo na doc** — formato é Assumption (colunas espelham a transação; `status` usa o enum da API). |

**Decisão**: um `parse*()` puro por fonte, **todos recebendo a `conta`** (`GURU_PRD` |
`GURU_SVC`). `tipoOrigem` distinto por fonte (`guru.webhook` / `guru.api` / `guru.csv`),
chave `fonte` do `status-map`.

## D-R2 — Chave natural `id_origem` (G-01)

**`transaction.id`** (UUID). Presente nas 3 fontes. **Por conta** — único dentro de
`(<conta>, id)`; a `PlataformaOrigem` desambigua. Os N webhooks de uma venda (aprovada →
reembolsada → chargeback…) resolvem para `(<conta>, <id>)` — `UPSERT_TRANSACAO` (018,
`@@unique(plataforma_origem, id_origem)`) garante **1 linha**, último evento vence. Ciclos de
assinatura **têm `id` próprio** (transação nova por cobrança) — a agregação por
`subscription.id` é de specs futuras.

## D-R3 — Sem `referenciaExterna` no lado Guru (G-02)

A Guru é a **venda de registro** (Regra Inviolável nº 2 — "uma venda Guru+Asaas conta 1×;
só a Guru soma receita"). O pagamento Asaas correlato é quem carrega a ponte
(`externalReference` → `guru.transaction.id`, spec 020/A-02). O adapter Guru **não** emite
`referenciaExterna`; `payment.marketplace_id`/`payment.marketplace_name` ficam só no
`payload_bruto`. A **spec 024** (`RESOLVER_VINCULO`, etapa 4) casa os dois lados.

Alternativa rejeitada: o adapter Guru emitir `referenciaExterna.plataforma = ASAAS_*` +
`idOrigem = payment.marketplace_id`. Rejeitada — nem toda venda Guru terceiriza para a Asaas
(cartão via mundipagg, pix nativo…), e `classificar` regra 2 marcaria `DESCONHECIDO` +
`revisar` **toda** venda Guru. O vínculo real precisa de contexto cross-transação (spec 024).

## D-R4 — Escopo CSV + API (G-03)

Idêntico à 019/020: **parser puro + endpoints finos em `/ingestao/guru/*`** sob
`evento:ingerir`. `conta` **obrigatória** no corpo dos dois endpoints (o webhook a tira do
path `prd`/`svc`). DTO valida contra `["GURU_PRD", "GURU_SVC"]` → valor fora → 422.

## D-R5 — `GuruApiClient` com cursor (`fetch` nativo, 0 dep)

Interface + token DI (`GURU_API_CLIENT`), impl real `GuruApiClientHttp`; **dublê nos
testes** (padrão `TmbApiClient`/019, `AsaasApiClient`/020).

```
GET {GURU_<conta>_API_BASE_URL || https://digitalmanager.guru/api/v2}/transactions
    ?<campoData>_ini=YYYY-MM-DD&<campoData>_end=YYYY-MM-DD[&cursor=<next_cursor>]
Authorization: Bearer {GURU_<conta>_API_KEY}
Accept: application/json
User-Agent: pandora-ingestao
```

- Paginação **por cursor**: 1ª chamada sem `cursor`; segue `body.next_cursor` enquanto
  `body.has_more_pages` for `1` / `true`; para quando `has_more_pages` é falso/`0` ou
  `next_cursor` vazio; trava `MAX_PAGINAS`.
- `campoData` ∈ `{ ordered_at, confirmed_at, cancelled_at }`, default `ordered_at`.
- Timeout `AbortSignal.timeout(15_000)`. Resposta não-2xx → `Error` na página; a
  sincronização segue com o que já registrou (US3 cenário 6). `GURU_<conta>_API_KEY` ausente
  → `GuruApiIndisponivelError` → o service converte para **422**.
- `extrairPagina(corpo)`: aceita `{ data: [...] , has_more_pages, next_cursor }` (forma
  real), `Array` (defensivo).
- Leitura da env **destipada** pelo `ConfigService` (mesmo cast do `TmbApiClientHttp`/019).

## D-R6 — Autenticação do webhook (G-04) — token NO CORPO

Diferente de TMB/Asaas (header). `WebhookAuthenticator` da 003 —
`autenticar(PlataformaOrigem.GURU_PRD | GURU_SVC, body.api_token)` compara
`GURU_<conta>_WEBHOOK_TOKEN` em tempo constante. Sem token / errado / **da outra conta** →
**401** genérico, **nenhum** `evento_origem`. Separado do `JwtAuthGuard` (rota `@Public()`
pelo prefixo `/webhooks/`, 003). **Não** HMAC. `WebhookAuthenticator` é **providido pelo
próprio `IngestaoModule`** (stateless — já é assim desde a 019).

O `api_token` é lido do corpo já desserializado pelo NestJS (`@Body()`), então o controller
tem o objeto inteiro; passa `String(body?.api_token)` ao autenticador.

## D-R7 — Resiliência do webhook (G-08/G-09)

| Situação | Resposta HTTP | `evento_origem` |
| --- | --- | --- |
| `api_token` inválido/ausente | **401** | não criado |
| parse OK + persistência OK | **200** `{ registrados: n, ignorados: 0 }` | criado, `evento_canonico` preenchido, `payload_bruto` **sem** `api_token` |
| corpo sem `id` (webhook de assinatura/contrato / lixo) | **200** `{ registrados: 0, ignorados: n }` | **não** criado (logado) |
| parse com erro estrutural mas com `id` | **200** `{ registrados: n, ignorados: m }` | criado com `evento_canonico` **nulo** → `classificar` marca `revisar` |
| persistência falhou (`RegistrarEventoService` lançou) | **5xx** | — (a Guru reenvia) |

**Nunca 4xx para "reenvie"**: a Guru **suprime retentativas** em `0/401/403/404/406/410/422/
505/506/510/511`. Erro de parse → **200** (evento cru salvo, vai para revisão).

## D-R8 — Mapa de valores monetários (G-10)

Guru expõe valores como **número decimal** e **traz a moeda** (`payment.currency`, ISO 4217).

| Campo canônico | Origem Guru | Regra |
| --- | --- | --- |
| `valores.bruto` | `payment.gross` | valor bruto da venda |
| `valores.liquido` | `payment.net` | líquido após taxas |
| `valores.taxas` | `payment.tax.value` (ou `gross − net`) | só se numérica e `0 < taxa < bruto` |
| `moeda` (de todos) | `payment.currency` | ISO 4217 validado pelo `core` (`ehMoeda`); inválida/ausente → `"BRL"` + erro não-fatal |
| (nada) | `payment.total`, `discount_value`, `affiliate_value`, `marketplace_value`, `installments.*`, `coupon.*` | só `payload_bruto` |

Conversão número → `Dinheiro`: `dinheiroDeValorGuru(v, erros, rotulo, moeda)` (cópia de
`dinheiroDeValorAsaas`/020 com moeda parametrizada): `null`/`''` → `undefined`; não-finito/
negativo/notação científica → `undefined` + erro; `String(v)` casa `/^-?\d+(\.\d+)?$/` →
`Dinheiro.deDecimal(str, moeda)` (trunca > 4 casas por string, sem `parseFloat`); emite
`{ valorInteiro: bigint, moeda }`.

## D-R9 — `comprador` / `oferta` / `assinatura` / `ehAfiliada` / `ocorridoEm`

- **`comprador`** do objeto `contact`: `nome` = `contact.name`; `emails` = `[contact.email]`;
  `documentos` = `[soDigitos(contact.doc)]`; `telefones` =
  `telefonesDeString(contact.phone_local_code + contact.phone_number)`; `endereco` de
  `contact.address*` (logradouro/numero/complemento/bairro/cidade/uf/cep/pais). Tudo vazio →
  `comprador` omitido. `RESOLVER_PESSOA` (018) tolera vazio.
- **`oferta`**: `codigoOrigem` = `product.offer.id` ?? `items[0].offer.id`; `nomeOrigem` =
  `product.offer.name` ?? `product.name` ?? `items[0].name`; `quantidade` = `product.qty`
  (inteiro). Nada → `oferta` omitido. A resolução real `(tag AEN, plataforma)` é da spec
  023.
- **`assinatura`**: sse `product.type === "plan"` **e** `subscription` é objeto não-vazio
  (`subscription.id` presente) → `{ ehRecorrencia: true, numeroCiclo: invoice.cycle (inteiro,
  quando > 0) }`. `product.type === "plan"` com `subscription` vazio (1ª venda negada) → sem
  bloco `assinatura` (a doc: "quando o campo subscription vem vazio, a assinatura não chegou
  a ser criada").
- **`ehAfiliada`**: `true` sse `String(type) === "affiliate"`. Qualquer outro (`producer`,
  `co_producer`, ausente) → indefinido.
- **`ocorridoEm`**: `dates.confirmed_at` ?? `dates.ordered_at` ?? `dates.created_at` ??
  `dates.updated_at` ?? `""` (webhook/API). CSV: `data_aprovacao` ?? `data_pedido` ??
  `data_criacao` ?? `""`. String crua — a etapa 3 aplica `parseInstante` (o `core` já cobre
  `"2023-09-19T09:19:04Z"`, date-only, epoch).

## D-R10 — Vocabulário de status → `StatusTransacaoCanonico` (G-17 / FR-020)

`guru.webhook` == `guru.api` == `guru.csv` (o CSV espelha o enum da API — Assumption).
Enum de origem: "Status de Vendas" da doc.

| bruto Guru | canônico | nota |
| --- | --- | --- |
| `approved` | `PAGO` | aprovada — pagamento confirmado, libera acesso e é receita |
| `completed` | `PAGO` | completa (entrega concluída) |
| `waiting_payment` | `PENDENTE` | aguardando pagamento (boleto/pix emitido) |
| `pending` | `PENDENTE` | pendente |
| `billet_printed` | `PENDENTE` | boleto impresso, aguardando |
| `processing` | `PENDENTE` | em processamento |
| `analysis` | `PENDENTE` | em análise (antifraude) |
| `charging` | `PENDENTE` | a processar pagamento |
| `delayed` | `EM_ATRASO` | atrasada |
| `in_recovery` | `EM_ATRASO` | em recuperação (dunning) |
| `refunded` | `ESTORNADO` | reembolsada |
| `dispute` | `ESTORNADO` | reembolso solicitado — acesso já sai |
| `chargeback` | `CHARGEBACK` | reclamada (contestação) |
| `canceled` | `CANCELADO` | cancelada |
| `expired` | `CANCELADO` | expirada (boleto venceu sem pagamento — venda não se concretizou) |
| `rejected` | `RECUSADO` | rejeitada pelo processador |
| `failed` | `RECUSADO` | erro na transferência |
| `blocked` | `RECUSADO` | bloqueada (fraude) |

**Fora do mapa de propósito** → `DESCONHECIDO` + revisão até uma fixture real aparecer:
`trial`, `started`, `abandoned`, `scheduled`, `pending_transfer`, `transferred`. Motivo: são
estados de "carrinho" ou de repasse ao produtor, sem semântica financeira canônica clara na
operação da AEN. Chaves **case-sensitive, sem `trim`, sem sinônimos** (Regra nº 15 /
gambiarra 4.4).

## D-R11 — Segredo `api_token` (G-14)

O `api_token` do corpo do webhook é o Account Token da conta (segredo). O parser
`parseWebhookGuru` devolve `payloadBruto` = o corpo **sem** a chave `api_token`
(`const { api_token: _omitido, ...resto } = body`). Um teste e2e faz `grep` do valor no
`evento_origem.payload_bruto` = 0. No CSV, uma coluna `api_token` (improvável) é simplesmente
não mapeada.

## D-R12 — Parser de CSV à mão (0 dep)

Cópia estrutural do `parse-linha-csv.ts` da 020: detecta separador (`,` vs `;`), tira BOM,
mini state-machine de aspas. Mapa de colunas → nomes canônicos (aliases inglês/pt-BR).
Coluna ausente → campo omitido. Linha vazia → pulada. Linha sem `id` → `erros: ["linha N:
sem identificador de transação"]` + `eventoCanonico` ausente. Cabeçalho sem coluna de id →
**todas** as linhas em erro (nunca um 500).

## D-R13 — Onde os arquivos moram (Princípio VI)

- `src/ingestao/adapters/guru/**` — parsers puros + `GuruApiClient` + fixtures. Importa
  `core` e utilitários locais. **Proibido** importar `financeiro`/`clientes`.
- `src/ingestao/guru/**` — controllers finos + services de sync/import. Importam
  `RegistrarEventoService` (mesmo módulo), `WebhookAuthenticator` (`auth`), os parsers de
  `../adapters/guru`, o `GuruApiClient`.
- `src/financeiro/domain/status-map/guru.ts` — só `import { StatusTransacaoCanonico } from
  '../../../core/core.module'`. **Proibido** importar `ingestao`.
- `ingestao.module.ts` — registra os 2 controllers, os 2 services, e o provider
  `{ provide: GURU_API_CLIENT, useClass: GuruApiClientHttp }` (dublê o substitui no e2e).

## Alternativas consideradas e rejeitadas

| Alternativa | Rejeitada porque |
| --- | --- |
| Parser de CSV com `csv-parse`/`papaparse` | +1 dep para 1 formato simples. O parser à mão da 019/020 é reaproveitado quase inteiro. |
| `id_origem` = `payment.marketplace_id` | É o id no processador (pode ser a cobrança Asaas), não a identidade da venda Guru. O dono do produto escolheu `transaction.id`. |
| Adapter Guru emitir `referenciaExterna` para a Asaas | Nem toda venda Guru terceiriza; marcaria toda venda como `DESCONHECIDO`. A spec 024 tem contexto cross-transação. |
| 1 webhook `/webhooks/guru` com a conta no corpo | O `api_token` é **por conta** e a conta não está no payload de forma canônica; rotas `prd`/`svc` espelham a autenticação (visão 5.6). |
| `status-map` sob `src/ingestao/adapters/guru/` (Apêndice C) | `financeiro` é dono de `status_canonico` e **não pode importar `ingestao`**. Precedente 018/019/020: mapa em `financeiro/domain/status-map/`. |
| Paginação por offset no `GuruApiClient` | A Guru usa **cursor** explicitamente ("Paginação baseada em cursor em vez de limit/offset"). |
| Mapear `trial`/`started`/`abandoned` por palpite | Regra nº 15 — sem semântica financeira canônica clara; cai em revisão até fixture real. |
| Sincronização automática por `setInterval` | Princípio VIII: só sob demanda. `POST /ingestao/guru/sincronizar` manual. |
