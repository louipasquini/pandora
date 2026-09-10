# 022 — Adaptadores de borda da plataforma Hotmart

**Quarta e última** das 4 specs de adaptadores da Fase 2 (019 TMB ✅, 020 Asaas ✅, 021 Guru
✅, **022 Hotmart**). Molde direto das 019/020/021. Materializa o **Princípio III** (bordas
finas, núcleo canônico) para as **duas contas Hotmart** — `HOTMART_PRD` e `HOTMART_SVC`
(`PlataformaOrigem`): transforma os payloads crus das fontes da Hotmart em `EventoCanonico`
— o contrato validado do `core` que o pipeline da 006/018 já processa — e popula o
vocabulário de status da Hotmart em `financeiro/domain/status-map/hotmart.ts`.

Nenhuma regra de negócio conhece "Hotmart": `classificar` (006) e `UPSERT_TRANSACAO` (018)
recebem só o `EventoCanonico` + o rótulo livre `tipoOrigem`. Os parsers são **puros** (sem
NestJS, Prisma, `fetch`, `Date`/locale) e testados contra **fixtures reais** sem tocar o
banco.

Spec, plano, pesquisa, modelo de dados, contratos e tarefas:
[`specs/022-adapter-hotmart/`](../specs/022-adapter-hotmart/).

`CONTEXT_MODULES` segue com **11** — o adapter é um subdiretório do `ingestao` (visão
Apêndice C). **0 migração, 0 tabela, 0 dependência nova, 0 porta nova de aplicação, 0
permissão nova, 0 frontend.** Chaves `.env` **novas**: `HOTMART_{PRD,SVC}_CLIENT_{ID,SECRET}`
(4, opcionais — OAuth2) + `HOTMART_WEBHOOK_ENABLED` (1, default `false`). As
`HOTMART_<conta>_{API_BASE_URL,API_KEY,WEBHOOK_TOKEN}` já existiam no `env.schema` como
`accountConfig` (001/003).

---

## O que muda em relação à Guru/021

| eixo | Guru (021) | **Hotmart (022)** |
| --- | --- | --- |
| Autenticação da API | token estático `Authorization: Bearer` | **OAuth2 `client_credentials`** — troca `client_id`+`client_secret`+Basic por `access_token` de vida curta, **cacheado em memória por conta** |
| Webhook | ativo, `api_token` no corpo | **sem webhook na v1** — rota + parser existem como **stub desligado** (`HOTMART_WEBHOOK_ENABLED=false` → **503**) |
| 2ª chamada de rede | — | **`GET /sales/price/details`** paginado na mesma janela, `merge` por `transaction` |
| Paginação | cursor `next_cursor` / `has_more_pages` | cursor `page_info.next_page_token` |
| Datas | ISO string | **epoch ms** (`start_date`/`end_date`; `purchase.approved_date`) |
| Papel de afiliada | `type === "affiliate"` | `purchase.commission_as === "AFFILIATE"` |
| Assinatura | `product.type === "plan"` + `subscription` | `purchase.is_subscription === true` + `recurrency_number` |
| Ponte de cobrança | Guru é a venda de registro; Asaas cobra | Hotmart processa a própria cobrança — **`referenciaExterna` nunca é emitido** |

## As fontes da Hotmart

| Fonte | `tipoOrigem` | Formato | Status | Identidade |
| --- | --- | --- | --- | --- |
| API **`GET /payments/api/v1/sales/history`** (cursor) | `hotmart.api` | `{ items: [{ product, buyer, producer, purchase }], page_info }` | `purchase.status` | `purchase.transaction` (`"HP…"`) |
| API **`GET /payments/api/v1/sales/price/details`** (cursor) | *(enriquecimento)* | `{ items: [{ transaction, base, total, vat, fee, coupon, real_conversion_rate }], page_info }` | — | `transaction` (casa com a de vendas) |
| **CSV** (export / backfill) | `hotmart.csv` | texto com cabeçalho | coluna `status` \| `situacao` | coluna `transacao` \| `transaction` \| `codigo` |
| **webhook `PURCHASE_*`** (**stub — feature futura**) | `hotmart.webhook` | `{ id, event, version, creation_date, data: { product, buyer, purchase, subscription, … } }` | `data.purchase.status` (**não** o `event`) | `data.purchase.transaction` |

As fontes recebem a **`conta`** (`HOTMART_PRD` | `HOTMART_SVC`) como parâmetro — o payload
da Hotmart **nunca** a determina. A `conta` vem do corpo dos endpoints de ingestão ou do
path do webhook (`/prd`, `/svc`).

Particularidades absorvidas na borda:

- **Moeda sempre exposta** — `purchase.price.currency_code` (API) / `.currency_value`
  (webhook) / coluna `moeda` (CSV), ISO 4217 validado pelo `core`; ausente/inválida → `BRL`
  cravado + erro não-fatal.
- **Detalhe de preço** — `vat` + `fee` refinam `valores.taxas` (guarda `0 < taxa < bruto`,
  mesma moeda); `coupon` / `base` / `real_conversion_rate` não têm slot canônico nesta fatia
  → só `payload_bruto` (sob a chave `price_details`). Detalhe faltando para uma venda **não**
  é erro; detalhe **órfão** (sem venda) é ignorado.
- **Oferta nativa** — `purchase.offer.code` → `oferta.codigoOrigem`; `purchase.offer.name` ??
  `product.name` → `oferta.nomeOrigem` (a resolução `(tag AEN, plataforma)` e o import de
  catálogo Hotmart — 4 CSVs, `price.code` completo — são da **spec 023**).
- **Comprador** — API `sales/history`: só `buyer.name` + `buyer.email`. Webhook: `data.buyer`
  rico (nome, e-mail, `document`, `checkout_phone` + `checkout_phone_code`, `address.*`). CSV:
  colunas de comprador.
- **`hotmart_fee` em moeda diferente do `price`** (a doc mostra esse caso): a guarda de
  sanidade descarta a taxa — `valores.taxas` fica omitido, sem erro.

## Superfície HTTP

| Rota | Auth | O que faz |
| --- | --- | --- |
| `POST /ingestao/hotmart/sincronizar` | `evento:ingerir` | `{ conta, dataInicio, dataFinal, transactionStatus? }` → OAuth2 → pagina `sales/history` **e** `sales/price/details` por cursor → merge por `transaction` → registra `hotmart.api` |
| `POST /ingestao/hotmart/importar-csv` | `evento:ingerir` | `{ conta, conteudo, fonte? }` — CSV como texto no corpo → registra `hotmart.csv` |
| `POST /webhooks/hotmart/prd` · `POST /webhooks/hotmart/svc` | **pública** + `hottok` (`HOTMART_<conta>_WEBHOOK_TOKEN`, header `X-HOTMART-HOTTOK` \| `Bearer`) | **stub** — `HOTMART_WEBHOOK_ENABLED=false` → **503** antes de autenticar; `=true` → autentica → parseia (sem `hottok`) → registra `hotmart.webhook` → **200** |

Controllers **finos**: validam o DTO (webhooks: guarda de flag → autenticam) → chamam
`RegistrarEventoService.registrarEvento` (a porta da etapa 0 que a 006 exportou "para os
adapters das specs 019–022 injetarem"). O worker (006) faz classificar → resolver pessoa
(018) → upsert transação (018). **Nenhum `INSERT` direto**, **nenhum `commit()` de
remendo**, **nenhuma etapa nova no pipeline** (`worker.service.ts` / `etapas.ts` /
`pipeline-wiring.module.ts` / `classificar.ts` / `schema.prisma` sem diff).

Janela obrigatória; período > **365 dias** → **422** no DTO (guarda de borda contra o `502`
de query lenta da Hotmart — a doc não documenta um teto rígido; ajustável). `conta` fora do
enum de contas Hotmart → **422** no DTO. Credenciais OAuth ausentes →
`HotmartApiIndisponivelError` → **422** (nunca 500).

## Decisões (H-01..H-20)

022 não está marcada `⚠ clarify` no ROADMAP. As **3 decisões de fato ambíguas** foram
levadas ao dono do produto em **2026-09-10** (H-01, H-02, H-03); as demais são defaults
documentados. **Zero `NEEDS CLARIFICATION`.**

- **H-01 — credenciais OAuth2: chaves `.env` novas dedicadas** (dono do produto). O bloco
  `accountConfig` (3 slots) não comporta OAuth2 sem gambiarra. Adicionadas
  `HOTMART_{PRD,SVC}_CLIENT_{ID,SECRET}` (opcionais em todo `NODE_ENV`).
  `HOTMART_<conta>_API_KEY` guarda o token **Basic** do painel do dev;
  `HOTMART_<conta>_API_BASE_URL` a base da API de dados
  (`https://developers.hotmart.com/payments/api/v1` default; base OAuth
  `https://api-sec-vlc.hotmart.com` é fixa); `HOTMART_<conta>_WEBHOOK_TOKEN` o `hottok`
  (usado pelo webhook stub). Chave nova de flag: `HOTMART_WEBHOOK_ENABLED` (default `false`).
- **H-02 — `GET /sales/price/details` entra como 2ª chamada de rede** (dono do produto). A
  sincronização pagina os dois recursos na mesma janela e faz merge por `transaction`.
  `HotmartApiClient` tem 2 métodos (`listarVendas`, `listarDetalhesPreco`).
- **H-03 — escopo: parsers puros + endpoints finos `/ingestao/hotmart/*` + webhook stub
  desligado** (dono do produto). O `parseWebhookHotmart` é **completo e testado** contra
  fixture; o que fica desligado é a rota HTTP (`HOTMART_WEBHOOK_ENABLED=false` → 503). A
  superfície `admin/` completa fica para as specs 023 / migração. **Sem frontend.**
- **H-04 — chave natural `id_origem` = `purchase.transaction`** (`"HP…"`), consistente nas 3
  fontes. É **por conta**: único só dentro de `(<conta>, transaction)` — a `PlataformaOrigem`
  desambigua. Os N estados de uma compra (`PRINTED_BILLET` → `APPROVED` → `REFUNDED`…)
  resolvem para a mesma `(<conta>, <transaction>)`; `UPSERT_TRANSACAO` (018) mantém 1 linha,
  último evento vence (Regra Inviolável nº 1). Cada recorrência de assinatura tem
  `transaction` própria.
- **H-05 — `statusOrigem` = `purchase.status` cru** (`APPROVED`, `WAITING_PAYMENT`,
  `REFUNDED`, `CHARGEBACK`, `PRINTED_BILLET`…). O `event` do webhook (`PURCHASE_APPROVED`…)
  fica só no `payload_bruto`.
- **H-06 — `tipoOrigem` é o rótulo da fonte e a chave `fonte` do `status-map`.** Convenção
  congelada: `hotmart.webhook`, `hotmart.api`, `hotmart.csv`. `MAPAS_STATUS.HOTMART_PRD` e
  `.HOTMART_SVC` apontam para o **mesmo** objeto `HOTMART`.
- **H-07 — o adapter mora em `src/ingestao/adapters/hotmart/`.** Parsers puros; **não
  importam `financeiro`/`clientes`** — o `status-map/hotmart.ts` vive em `financeiro/` e é
  consumido lá pela etapa 3.
- **H-08 — `HotmartApiClient` (OAuth2 + cursor)** (`fetch` nativo, 0 dep). `garantirToken`
  cacheia `{ access_token, expiraEm }` por conta, renova quando faltam < 60 s;
  `listarVendas`/`listarDetalhesPreco` paginam por `page_token` (`page_info.next_page_token`);
  `start_date`/`end_date` em epoch ms; `transaction_status` opcional (repetido por valor).
  Credenciais ausentes → `HotmartApiIndisponivelError` → **422**.
- **H-09 — webhooks/endpoints resilientes.** parse OK + persistência OK → `200`/`503`
  (stub); parse com erro + persistência OK → `200` com `evento_canonico` nulo, `classificar`
  marca `revisar`; persistência falhou → **5xx**.
- **H-10 — payload/linha sem `transaction`** → `ignorados`, logado, **não** registrado.
- **H-11 — valores monetários.** `valores.bruto` = `purchase.price.value`; `valores.taxas` =
  `purchase.hotmart_fee.total` (guarda `0 < taxa < bruto`, mesma moeda) ou `fee.value +
  vat.value` do detalhe; `valores.liquido` = `bruto − taxas` sob a mesma guarda.
  `full_price` / `original_offer_price` / `commissions[]` / `coupon` / `base` /
  `real_conversion_rate` / `installments_number` ficam só no `payload_bruto`. Conversão via
  `Dinheiro.deDecimal` do `core` (escala ×10000, sem `float`); `moeda` =
  `price.currency_code` / `.currency_value` / coluna ?? `BRL`.
- **H-12 — o adapter não classifica.** `EventoCanonico.classificacao` fica indefinido; a
  etapa 1 resolve — `REFUNDED`/`PARTIALLY_REFUNDED`/`CHARGEBACK` casam o `RE_ESTORNO` de
  `classificar` → `REEMBOLSO`; `ehAfiliada` → `VENDA_AFILIADA`; `assinatura` com
  `numeroCiclo > 1` → `RECORRENCIA`; o resto → `VENDA_PROPRIA`. **`classificar.ts` sem diff.**
- **H-13 — `ocorridoEm`.** API/webhook: `purchase.approved_date` ?? `purchase.order_date`
  (epoch ms → string crua). CSV: `data_aprovacao` ?? `data_pedido` ?? `data_criacao`. O
  parser passa a string crua; a etapa 3 (018) aplica `parseInstante` do `core` (o limiar
  `1e11` distingue segundos de milissegundos).
- **H-14 — segredo nunca persiste.** `client_secret` / Basic / `access_token` OAuth /
  `hottok` **nunca** entram em `payload_bruto`, log de evento ou resposta HTTP.
  `parseWebhookHotmart` remove uma eventual chave `hottok` do corpo por defesa (o real vem no
  header). Um teste e2e faz `grep` = 0 no `evento_origem`.
- **H-15 — RBAC: nenhuma permissão nova.** Webhooks públicos por prefixo; endpoints de
  ingestão reusam `evento:ingerir`. 0 migração de dados/seed.
- **H-16 — config.** As 5 chaves novas (§H-01) são config opcional / flag — ausência → 422
  claro, nunca crash (mesmo tratamento de `CRM_DISPAROS_WORKER_*`/015).
- **H-17 — vocabulário de status** — ver tabela abaixo. `STARTED` / `PRE_ORDER` ficam
  **fora do mapa de propósito** → `DESCONHECIDO` + revisão (precedente do `AUTHORIZED` da
  Asaas / `trial` da Guru).
- **H-18 — sem migração, sem tabela, `CONTEXT_MODULES` = 11.**
- **H-19 — datas na API são epoch ms.** O DTO recebe `YYYY-MM-DD` (borda amigável) e o
  `HotmartApiClient` converte para ms.
- **H-20 — `max_results`.** O client pede `max_results=500` e segue o `next_page_token`.
  Nunca depende de `total_results`.

## `status-map/hotmart.ts`

Vocabulário compartilhado entre `hotmart.webhook`, `hotmart.api` e `hotmart.csv` (o CSV
espelha o enum da API — Assumption, sem export real na doc):

| bruto Hotmart | canônico |
| --- | --- |
| `APPROVED` / `COMPLETE` | `PAGO` |
| `PRINTED_BILLET` / `WAITING_PAYMENT` / `UNDER_ANALISYS` / `PROCESSING_TRANSACTION` | `PENDENTE` |
| `OVERDUE` / `NO_FUNDS` | `EM_ATRASO` |
| `REFUNDED` / `PARTIALLY_REFUNDED` / `DISPUTE` | `ESTORNADO` |
| `CHARGEBACK` / `PROTESTED` | `CHARGEBACK` |
| `CANCELLED` / `EXPIRED` | `CANCELADO` |
| `BLOCKED` | `RECUSADO` |

`UNDER_ANALISYS` é a grafia oficial da Hotmart (com "I"). Case-sensitive, sem `trim`, sem
sinônimos (Regra nº 15 / gambiarra 4.4). `STARTED` / `PRE_ORDER` ficam **fora** de propósito
→ `DESCONHECIDO` + revisão até uma fixture real aparecer. Registrado em `status-map/index.ts`
via `Object.assign(MAPAS_STATUS, { HOTMART_PRD: HOTMART, HOTMART_SVC: HOTMART })`. Um teste
varre as fixtures reais e garante que **toda** chave do mapa aparece em algum `status` de
fixture.

## `HotmartApiClient` (`fetch` nativo, OAuth2, cursor, 0 dep)

Interface + token DI (`HOTMART_API_CLIENT`), impl `HotmartApiClientHttp` com `fetch` do Node
24 (mesmo padrão de `TmbApiClient`/019, `AsaasApiClient`/020, `GuruApiClient`/021). Lê
`HOTMART_<conta>_*` pela leitura destipada do `ConfigService`.

`garantirToken(conta)`: renova quando não há cache ou faltam < 60 s.
`POST {OAUTH_BASE}/security/oauth/token?grant_type=client_credentials&client_id=…&client_secret=…`
com header `Authorization: Basic <API_KEY>`. Falta `CLIENT_ID`/`CLIENT_SECRET`/`API_KEY` →
`HotmartApiIndisponivelError(conta)`.

`listarVendas`/`listarDetalhesPreco`: `GET {BASE}/sales/{history,price/details}?start_date=<ms>
&end_date=<ms>&max_results=500[&transaction_status=…][&page_token=…]`, header `Authorization:
Bearer <access_token>`. Paginação por `page_info.next_page_token`; trava `MAX_PAGINAS`.
`AbortSignal.timeout(15s)`. **Dublê nos testes** (`overrideProvider(HOTMART_API_CLIENT)`); a
impl real nunca é exercida em teste.

## Testes

- **63 unit** novos (domínio puro, sem banco): `normalizar-hotmart` (helpers + moeda
  parametrizada + `taxasDe`/`somarDinheiro`), `parse-venda-api` (contra fixture real de
  `sales/history` + merge de `price/details` + afiliada + assinatura + estorno colapsado),
  `parse-webhook` (stub, contra fixtures `PURCHASE_*` — comprador rico, sem `hottok`),
  `parse-linha-csv` (separador `;`, aspas, BOM, sem id → erro), `hotmart-api-client` (dublê
  de `fetch` — 1 POST de OAuth reusado, paginação por `page_token`, `transaction_status`
  repetido, 502), `status-map/hotmart` (vocabulário + varredura de cobertura contra as
  fixtures).
- **16 e2e** novos (`test/hotmart-adapter.e2e-spec.ts`, Postgres real — container isolado
  `pandora-db-spec022` na porta **55439**, já que 55432/55433/55435/55436/55438 estavam em
  uso por outras sessões): US1 (sincronização com dublê de 2 páginas de `sales/history`
  encadeadas por cursor → transações `HOTMART_PRD`; `APPROVED` → `PAGO` + `oferta`;
  `WAITING_PAYMENT` → `PENDENTE`; sem credenciais → 422; `conta` fora do enum → 422; janela
  > 365 d → 422, API não chamada), US2 (`price/details` casado → `payload_bruto.price_details`
  + `ABC10`; venda sem detalhe → sem erro; `commission_as: "AFFILIATE"` → `VENDA_AFILIADA`;
  `is_subscription` + `recurrency_number: 3` → `RECORRENCIA`; `APPROVED` +
  `PARTIALLY_REFUNDED` colapsa no `transaction` → 2 eventos, 1 transação `ESTORNADO`/
  `REEMBOLSO`; `STARTED` → `DESCONHECIDO` + `precisa_revisao` + `evento_origem.status =
  revisar`; `CHARGEBACK` do mesmo lote → `CHARGEBACK` sem revisão), US3 (import CSV 5 boas +
  1 sem id → `{ novos: 5, ignoradas: 1 }`; 2º import → `novos: 0`), US4 (webhook stub: flag
  desligado → 503, 0 evento; 2ª instância com `HOTMART_WEBHOOK_ENABLED=true` → 200 + 1
  `evento_origem` `hotmart.webhook` sem `hottok`; `processar` → `PAGO`; `hottok` errado →
  401), SC-016 (isolamento PRD/SVC → 2 transações), segredo (`grep` de `client_secret` /
  `access_token` / `hottok` / `Basic ` = 0), fronteira de contexto (`grep`), catálogo RBAC
  inalterado, `/health` = 11.
- Suíte completa: **840 unit backend** (+63 vs. a 021) + **410 e2e** (23 suítes, +16)
  verdes; lint/typecheck/build limpos no backend. Frontend inalterado.
