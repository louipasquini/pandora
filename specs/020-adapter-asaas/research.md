# Research — Adaptadores de borda da Asaas (spec 020)

Fonte primária: `Documentação Asaas (LLM).md` (índice de links da doc pública), conhecimento
da API v3 da Asaas (objeto `payment`, webhook de cobranças, `GET /v3/payments`). Contexto:
`specs/006-*` (pipeline + porta `RegistrarEventoService`), `specs/018-*` (`status-map` +
`EventoCanonico` no `core/pipeline/`), `specs/019-*` (o adapter TMB — **molde direto desta
spec**), visão Apêndice A (Asaas) e Apêndice C (`ingestao/adapters/{asaas,…}`).

## D-R1 — As 3 fontes da Asaas e o que cada uma carrega

| Fonte | Gatilho | Formato | Campo de status | Identidade | Observações |
| --- | --- | --- | --- | --- | --- |
| **webhook de cobrança** (por conta) | mudança de estado de uma cobrança | objeto JSON `{ event, payment: {…} }` | `payment.status` (+ `payment.deleted`) | `payment.id` (`pay_…`) | 1 evento por request; `customer` só como id; `externalReference` = ponte Guru; `subscription` = assinatura. |
| **API `GET /v3/payments`** | pull sob demanda | `{ hasMore, totalCount, limit, offset, data: [payment…] }` | `payment.status` | `payment.id` | header `access_token` (**não** Bearer); paginação `offset`/`limit` (teto 100); filtro `dateCreated[ge]`/`dateCreated[le]`; base `https://api.asaas.com/v3`. |
| **CSV** | export manual / backfill | texto com cabeçalho | coluna `status` | coluna `id`/`Identificador` | **Sem exemplo na doc** — formato é Assumption (colunas espelham o objeto `payment`; `status` usa o enum da API). |

**Decisão**: um `parse*()` puro por fonte, **todos recebendo a `conta`** (`ASAAS_PRD` |
`ASAAS_SVC`) como parâmetro (diferente da 019 — TMB é conta única). `tipoOrigem` distinto por
fonte (`asaas.webhook` / `asaas.api` / `asaas.csv`), que é a chave `fonte` do `status-map`.

## D-R2 — Chave natural `id_origem` (A-01, resolvida com o dono do produto)

**`payment.id`** (`"pay_…"`). Presente nas 3 fontes. É **por conta** — só único dentro de
`(<conta>, payment.id)`; a `PlataformaOrigem` desambigua (por isso o mesmo `payment.id` em
PRD e SVC gera 2 transações — SC-015, cenário teórico). Os N eventos de uma cobrança
(created → confirmed → received → refunded…) resolvem para `(<conta>, <payment.id>)` — o
`UPSERT_TRANSACAO` (018, `@@unique(plataforma_origem, id_origem)`) garante **1 linha** (Regra
Inviolável nº 1), último evento vence.

## D-R3 — `externalReference` é a ponte Guru (A-02, resolvida com o dono do produto)

O adapter transporta `payment.externalReference` cru para `EventoCanonico.referenciaExterna.
idOrigem`, **sem** `plataforma`. Consequências:

- `classificar` (006) regra 2 (`ref.idOrigem && ref.plataforma && ref.plataforma !== conta`
  → `DESCONHECIDO` + `revisar` p/ spec 024) **não dispara** — falta `ref.plataforma`. A
  cobrança cai em `VENDA_PROPRIA`.
- A **spec 024** (`RESOLVER_VINCULO`, etapa 4) é quem casa a cobrança Asaas com a transação
  Guru, marca a Asaas como não-receita e não resolve Oferta/Contrato próprios (Regra
  Inviolável nº 2). O `payload_bruto` + o `EventoCanonico` já carregam tudo que a 024
  precisa.
- Cobrança Asaas **avulsa** (sem `externalReference`) → `referenciaExterna` ausente → resolve
  tudo normalmente.

Alternativa rejeitada: o adapter deduzir `plataforma: GURU_PRD/GURU_SVC` por heurística no
`externalReference`. Rejeitada — é um palpite (Regra nº 15) e o adapter não tem contexto
cross-transação. A 024 tem.

## D-R4 — Escopo CSV + API (A-03, resolvido com o dono do produto)

Idêntico à 019: **parser puro + endpoints finos em `/ingestao/asaas/*`** sob `evento:ingerir`.
A superfície `admin/` completa fica para a spec de migração/admin.

- `POST /ingestao/asaas/sincronizar` `{ conta, dataInicio?, dataFinal?, limit? }` → pagina
  `GET /v3/payments` via `AsaasApiClient` → `parsePagamentoApi` → `RegistrarEventoService`.
  Commit por página. Sem `ASAAS_<conta>_API_KEY` → **422**.
- `POST /ingestao/asaas/importar-csv` `{ conta, conteudo: string, fonte? }` → `parseCsvAsaas`
  → `RegistrarEventoService`. CSV como **texto no corpo JSON** — 0 dep de upload binário.

`conta` é **obrigatória** no corpo dos dois endpoints (diferente do webhook, onde vem do
path `prd`/`svc`). DTO valida contra `["ASAAS_PRD", "ASAAS_SVC"]` → valor fora → 422.

## D-R5 — `AsaasApiClient` com `fetch` nativo (0 dep)

Interface + token DI (`ASAAS_API_CLIENT`), impl real `AsaasApiClientHttp` com `fetch` do Node
24; **dublê nos testes** (padrão `GraphApiClient`/011, `TmbApiClient`/019). A impl:

```
GET {ASAAS_<conta>_API_BASE_URL || https://api.asaas.com/v3}/v3/payments
    ?offset=N&limit=P[&dateCreated[ge]=&dateCreated[le]=]
access_token: {ASAAS_<conta>_API_KEY}
User-Agent: pandora-ingestao
```

- Paginação: `offset` começa em 0, incrementa `+= limit` enquanto `body.hasMore === true`
  (ou até `MAX_PAGINAS` de segurança). `limit` default **100** (teto da Asaas).
- Timeout `AbortSignal.timeout(15_000)`.
- Resposta não-2xx → `Error` na página; a sincronização segue com o que já registrou (US3
  cenário 4). `ASAAS_<conta>_API_KEY` ausente → `AsaasApiIndisponivelError` → o service
  converte para `UnprocessableEntityException` (**422**, não 500).
- O client lê a env pela leitura **destipada** do `ConfigService` (`ASAAS_*` entram por
  spread `ZodRawShape`, não aparecem no tipo estático de `AppConfig` — mesmo cast do
  `WebhookAuthenticator`/003 e do `TmbApiClientHttp`/019).
- `extrairItens(corpo)`: aceita `{ data: [...] }` (forma real), `Array`, `{ itens: [...] }`
  (defensivo).

## D-R6 — Autenticação do webhook (A-04)

`WebhookAuthenticator` da 003 — `autenticar(PlataformaOrigem.ASAAS_PRD | ASAAS_SVC, token)`
compara `ASAAS_<conta>_WEBHOOK_TOKEN` em tempo constante. Header `asaas-access-token`
(case-insensitive), `authorization: Bearer <token>` como _fallback_. Sem token / errado →
**401** genérico, **nenhum** `evento_origem`. Separado do `JwtAuthGuard` (rota `@Public()`
pelo prefixo `/webhooks/`, 003). **Não** HMAC.

`WebhookAuthenticator` é **providido pelo próprio `IngestaoModule`** (stateless — evita
importar `AuthModule`, que registra `APP_GUARD`) — já é assim desde a 019.

## D-R7 — Resiliência do webhook (A-08/A-09)

| Situação | Resposta HTTP | `evento_origem` |
| --- | --- | --- |
| token inválido/ausente | **401** | não criado |
| parse OK + persistência OK | **200** `{ registrados: n, ignorados: 0 }` | criado, `evento_canonico` preenchido |
| corpo sem `payment.id` (evento não-cobrança / lixo) | **200** `{ registrados: 0, ignorados: n }` | **não** criado (logado) |
| parse com erro estrutural mas com `payment.id` | **200** `{ registrados: n, ignorados: m }` | criado com `evento_canonico` **nulo** → `classificar` marca `revisar` |
| persistência falhou (`RegistrarEventoService` lançou) | **5xx** | — (a Asaas reenvia; a fila da Asaas re-tenta) |

A Asaas espera resposta **2xx** — qualquer outra coisa (ou timeout) faz a Asaas re-enfileirar
e, após muitas falhas, **pausar a fila** da conta. Por isso erro de parse **não** é 5xx.

## D-R8 — Mapa de valores monetários (A-10)

Asaas expõe valores como **número decimal em reais** (`100`, `19.9`, `100.00`). Não expõe
moeda (100% BRL).

| Campo canônico | Origem Asaas | Regra |
| --- | --- | --- |
| `valores.bruto` | `payment.value` | valor da cobrança |
| `valores.liquido` | `payment.netValue` | líquido após taxa Asaas (quando presente) |
| `valores.taxas` | derivado | `value − netValue` **só se** ambos numéricos e `0 < resultado < value` |
| (nada) | `originalValue`, `interestValue`, `discount`, `refunds[]` | só `payload_bruto` |

Conversão número → `Dinheiro`: `dinheiroDeValorAsaas(v)` (cópia do `dinheiroDeValorTmb` da
019): `null`/`''` → `undefined`; não-finito/negativo/notação científica → `undefined` + erro;
`String(v)` casa `/^-?\d+(\.\d+)?$/` → `Dinheiro.deDecimal(str, 'BRL')` (trunca > 4 casas por
string, sem `parseFloat`); emite `{ valorInteiro: bigint, moeda: 'BRL' }`.

## D-R9 — `statusOrigem` e o caso `deleted` (A-05)

`statusOrigem = payment.deleted === true ? 'DELETED' : String(payment.status ?? '')`.
Justificativa: o evento `PAYMENT_DELETED` / a remoção manual de uma cobrança deixa
`payment.status` **congelado** no valor anterior (`PENDING`, `OVERDUE`…); só a flag
`deleted` reflete a remoção. `DELETED` é um conceito real da Asaas (o `_status_` sintético é
determinístico, não um palpite) → `status-map` traduz `DELETED → CANCELADO`.
`PAYMENT_RESTORED` (`deleted: false`) volta ao `payment.status` real.

## D-R10 — Vocabulário de status → `StatusTransacaoCanonico` (A-05/FR-019)

`asaas.webhook` == `asaas.api` == `asaas.csv` (o CSV espelha o enum da API — Assumption):

| bruto Asaas | canônico | nota |
| --- | --- | --- |
| `RECEIVED` | `PAGO` | recebido (dinheiro creditado) |
| `CONFIRMED` | `PAGO` | pagamento confirmado (cartão), crédito a caminho — libera acesso e é receita |
| `RECEIVED_IN_CASH` | `PAGO` | baixa manual "recebido em dinheiro" |
| `DUNNING_RECEIVED` | `PAGO` | pago via renegociação/negativação |
| `PENDING` | `PENDENTE` | boleto/pix emitido, aguardando |
| `AWAITING_RISK_ANALYSIS` | `PENDENTE` | cartão em análise antifraude |
| `OVERDUE` | `EM_ATRASO` | vencido sem pagamento |
| `DUNNING_REQUESTED` | `EM_ATRASO` | enviado para negativação (segue não pago) |
| `REFUNDED` | `ESTORNADO` | reembolso concluído |
| `REFUND_REQUESTED` | `ESTORNADO` | reembolso solicitado — acesso já sai (visão: ESTORNADO "remove acesso") |
| `REFUND_IN_PROGRESS` | `ESTORNADO` | idem |
| `CHARGEBACK_REQUESTED` | `CHARGEBACK` | contestação aberta |
| `CHARGEBACK_DISPUTE` | `CHARGEBACK` | em disputa |
| `AWAITING_CHARGEBACK_REVERSAL` | `CHARGEBACK` | aguardando reversão |
| `DELETED` (sintético) | `CANCELADO` | cobrança removida (`deleted: true`) |

Fora do mapa → `mapearStatus` (018) devolve `DESCONHECIDO` + `revisar` + motivo. Chaves
**case-sensitive, sem `trim`, sem sinônimos** (Regra nº 15 / gambiarra 4.4). `AUTHORIZED`
(pré-autorização de cartão, raro no fluxo AEN) fica **fora** do mapa de propósito → cai em
revisão até uma fixture real aparecer.

## D-R11 — `comprador` (A / Edge Cases)

- **webhook / API**: o objeto `payment` traz `customer` só como `"cus_…"` — **sem** nome/
  e-mail/documento. `comprador` do `EventoCanonico` fica **vazio** (`undefined`). O id do
  cliente fica no `payload_bruto`. `RESOLVER_PESSOA` (018) tolera.
- **CSV**: o export traz `Cliente`/`Email`/`CPF/CNPJ`/`Telefone` → `comprador` completo
  (`nome`, `emails: [..]`, `documentos: [soDigitos(..)]`, `telefones: telefonesDeString(..)`).
- Enriquecer webhook/API via `GET /v3/customers/{id}` = 2ª chamada de rede, fora do parser
  puro → spec futura.

## D-R12 — `assinatura` / `oferta` / `ehAfiliada` (A-11)

- `payment.subscription` (`"sub_…"`) não-vazio → `assinatura = { ehRecorrencia: true }` →
  `classificar` → `RECORRENCIA`. Sem `subscription` → bloco `assinatura` omitido.
- `payment.installment` (`"ins_…"`, parcelamento de cartão) → **só `payload_bruto`** nesta
  fatia (não é recorrência; o refino de carteira de parcelas é spec futura de cobranças —
  mesmo tratamento do webhook Financeiro da TMB/019).
- `oferta.nomeOrigem` = `textoOuUndefined(payment.description)`; sem `codigoOrigem` (Asaas
  não tem catálogo). Ambos vazios → bloco `oferta` omitido.
- `ehAfiliada` **nunca** emitido (Asaas é gateway puro, sem papel de afiliada).
- `classificacao` **nunca** emitido (etapa 1/006 resolve).

## D-R13 — `ocorridoEm` (A-12)

- webhook/API: `paymentDate` ?? `confirmedDate` ?? `clientPaymentDate` ?? `dateCreated` ??
  `''`.
- CSV: `data_pagamento` ?? `data_criacao` ?? `vencimento` ?? `''`.
- O parser **não** chama `parseInstante`. Formatos reais da Asaas (`"2024-05-10"` date-only,
  `"2024-05-10 11:20:32"` com espaço, ISO com fuso em alguns campos) já são cobertos pelo
  parser de borda do `core` (spec 002: `ISO_SEM_FUSO_RE` cobre date-only → `T00:00:00Z` +
  motivo "sem fuso — assumido UTC").

## D-R14 — Parser de CSV à mão (0 dep)

Cópia estrutural do `parse-linha-csv.ts` da 019: detecta separador (`,` vs `;` no cabeçalho),
tira BOM, mini state-machine de aspas (`""` = aspa literal, sem multilinha). Mapa de colunas
→ nomes canônicos (aceita `id`|`identificador`; `status`; `value`|`valor`;
`netvalue`|`valor_liquido`; `datecreated`|`data_criacao`; `paymentdate`|`data_pagamento`;
`duedate`|`vencimento`; `description`|`descricao`; `externalreference`|`referencia_externa`;
`subscription`|`assinatura`; `customer`|`cliente`; `email`; `cpfcnpj`|`cpf_cnpj`;
`phone`|`telefone`). Coluna ausente → campo omitido. Linha vazia → pulada. Linha sem `id` →
`erros: ["linha N: sem identificador de cobrança"]` + `eventoCanonico` ausente. Cabeçalho sem
coluna de id → **todas** as linhas em erro (nunca um 500).

## D-R15 — Onde os arquivos moram (Princípio VI)

- `src/ingestao/adapters/asaas/**` — parsers puros + `AsaasApiClient` + fixtures. Importa
  `core` e utilitários locais. **Proibido** importar `financeiro`/`clientes` (ESLint
  `import/no-restricted-paths` já cobre `ingestao → financeiro/clientes`).
- `src/ingestao/asaas/**` — controllers finos + services de sync/import. Importam
  `RegistrarEventoService` (mesmo módulo), `WebhookAuthenticator` (`auth`, infra
  transversal), os parsers de `../adapters/asaas`, o `AsaasApiClient`.
- `src/financeiro/domain/status-map/asaas.ts` — só `import { StatusTransacaoCanonico } from
  '../../../core/core.module'`. **Proibido** importar `ingestao`.
- `ingestao.module.ts` — registra os 2 controllers, os 2 services, e o provider
  `{ provide: ASAAS_API_CLIENT, useClass: AsaasApiClientHttp }` (dublê o substitui no e2e).

## Alternativas consideradas e rejeitadas

| Alternativa | Rejeitada porque |
| --- | --- |
| Parser de CSV com `csv-parse`/`papaparse` | +1 dep para 1 formato simples. O parser à mão da 019 é reaproveitado quase inteiro. |
| `id_origem = payment.externalReference` | Pode ser vazio (cobrança avulsa) e é a ponte p/ Guru, não a identidade. (Dono do produto escolheu `payment.id`.) |
| Adapter marcar `referenciaExterna.plataforma = GURU_*` por heurística | Palpite (Regra nº 15); sem contexto cross-transação. A spec 024 resolve. |
| 1 webhook `/webhooks/asaas` com a conta no corpo | A conta não está no `payload` da Asaas; o token é **por conta**. Rotas separadas `prd`/`svc` (visão 5.6) espelham a autenticação. |
| `status-map` sob `src/ingestao/adapters/asaas/` (Apêndice C) | `financeiro` é dono de `status_canonico` e **não pode importar `ingestao`** (Princípio VI). Precedente da 018/019: mapa em `financeiro/domain/status-map/`. |
| Enriquecer `comprador` via `GET /v3/customers/{id}` no parser | Acopla o parser a rede. Fica para spec futura; `RESOLVER_PESSOA` (018) tolera comprador vazio. |
| `statusOrigem = event` (nome do evento do webhook) | O nome do evento (`PAYMENT_CHECKOUT_VIEWED`…) é mais granular que o estado da cobrança; o estado canônico é `payment.status`. O `event` fica no `payload_bruto`. |
| Sincronização automática por `setInterval` | Princípio VIII: só sob demanda. `POST /ingestao/asaas/sincronizar` manual. |
