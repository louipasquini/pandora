# Tasks — 022 · Adaptadores de borda da Hotmart

Ordem dependência-primeiro. `[P]` = paralelizável. Cada tarefa fecha verde (typecheck + lint
+ o teste da própria tarefa). **0 migração, 0 dep, 0 frontend.** Molde das 019/020/021.

## Fase A — Fixtures reais (Princípio III — vêm primeiro)

- **T001** [P] `fixtures/api-sales-history-pagina.json` — `{ items: [ …3 compras… ],
  page_info: { next_page_token: "" } }`. Compra 1 `APPROVED` `producer` com
  `purchase.offer.code`, `price {value:150.6, currency_code:"BRL"}`, `hotmart_fee
  {total:14.9, currency_code:"BRL"}`, `is_subscription:false`. Compra 2 `WAITING_PAYMENT`.
  Compra 3 `AFFILIATE` (`commission_as`). `campo_novo_2027` para "ignora chave inédita".
- **T002** [P] `fixtures/api-sales-history-assinatura.json` — 1 compra `APPROVED`,
  `is_subscription:true`, `recurrency_number:3`.
- **T003** [P] `fixtures/api-sales-history-refund.json` — `APPROVED` e `PARTIALLY_REFUNDED`
  com o **mesmo** `purchase.transaction`.
- **T004** [P] `fixtures/api-sales-price-details-pagina.json` — `{ items: [{ transaction:
  "<da compra 1>", base, total, vat {value, currency_code:"BRL"}, fee {value, currency_code:
  "BRL"}, coupon {code:"ABC10", value:0.1}, real_conversion_rate }], page_info:{} }`.
- **T005** [P] `fixtures/api-sales-history-vocabulario.json` — 1 compra por status do
  `VOCABULARIO` ainda não coberto (`COMPLETE`, `PRINTED_BILLET`, `UNDER_ANALISYS`,
  `PROCESSING_TRANSACTION`, `OVERDUE`, `NO_FUNDS`, `REFUNDED`, `DISPUTE`, `CHARGEBACK`,
  `PROTESTED`, `CANCELLED`, `EXPIRED`, `BLOCKED`) + 1 `STARTED` (fora do mapa).
- **T006** [P] `fixtures/webhook-purchase-approved.json` — `{ id, event:"PURCHASE_APPROVED",
  version:"2.0.0", creation_date, data:{ product, buyer{name,email,document,document_type,
  checkout_phone,checkout_phone_code,address{...}}, purchase{ transaction, status:"APPROVED",
  approved_date, order_date, price{value,currency_value:"BRL"}, offer{code,name,coupon_code},
  recurrence_number:1, is_subscription:false }, commissions:[{source:"PRODUCER",...}] } }`.
  `hottok:"HOTTOK-FIXTURE"` (teste de remoção).
- **T007** [P] `fixtures/webhook-purchase-refunded.json` — `event:"PURCHASE_REFUNDED"`,
  `data.purchase.status:"REFUNDED"`.
- **T008** [P] `fixtures/webhook-purchase-affiliate.json` — `data.purchase.commission_as:
  "AFFILIATE"`, `data.affiliates:[{affiliate_code,name}]`, `status:"APPROVED"`.
- **T009** [P] `fixtures/webhook-purchase-subscription.json` — `data.subscription{plan{id,
  name},subscriber{code}}`, `data.purchase.recurrence_number:3`, `is_subscription:true`.
- **T010** [P] `fixtures/export-vendas.csv` — BOM + cabeçalho `;`, 6 linhas (1 com aspas
  contendo `;`, 1 sem `transacao`), colunas `transacao;status;valor;valor_liquido;taxa;moeda;
  data_pedido;data_aprovacao;oferta;codigo_oferta;tipo;assinatura;ciclo;nome;email;documento;telefone`.

## Fase B — Helpers + parsers puros (`src/ingestao/adapters/hotmart/`)

- **T011** `tipos.ts` — `FonteHotmart`, `ContaHotmart`, `ResultadoParseHotmart`.
- **T012** `normalizar-hotmart.ts` (+`.spec.ts`) — `textoOuUndefined`, `soDigitos`,
  `telefonesDeString`, `enderecoDeHotmart`, `moedaDeHotmart`, `DinheiroCanonicoHotmart`,
  `dinheiroDeValorHotmart(v, erros, rotulo, moeda='BRL')`, `taxasDe(bruto, liquido,
  taxaExplicita)`. Cópia estrutural de `normalizar-guru.ts`.
- **T013** `montar.ts` — `CamposCanonicosHotmart` + `montarResultado(conta, fonte,
  payloadBruto, campos, erros)` (valida com `eventoCanonicoSchema`; nunca `referenciaExterna`).
- **T014** `compra.ts` (+`.spec.ts` via `parse-venda-api.spec.ts`) — `camposDeCompraApi(item,
  detalhePreco, erros)` a partir de `sales/history.items[]`.
- **T015** `parse-venda-api.ts` (+`.spec.ts`) — `parseVendaApi(item, conta, detalhePreco?)`
  → `montarResultado(conta, 'hotmart.api', payloadComPriceDetails, camposDeCompraApi(...),
  erros)`.
- **T016** `compra-webhook.ts` — `camposDeCompraWebhook(data, erros)` a partir de `data.*`.
- **T017** `parse-webhook.ts` (+`.spec.ts`) — `parseWebhookHotmart(payload, conta)`; remove
  `hottok`; aceita objeto/array; `tipoOrigem:'hotmart.webhook'`.
- **T018** `parse-linha-csv.ts` (+`.spec.ts`) — `parseCsvHotmart(conteudo, conta)`; separador
  `,`/`;`, BOM, aspas; mapa de aliases (ver `contracts/parsers-hotmart.md`).
- **T019** `index.ts` — barrel (`parseVendaApi`, `parseWebhookHotmart`, `parseCsvHotmart`,
  tipos, `HOTMART_API_CLIENT`, `HotmartApiIndisponivelError`, `HotmartApiClientHttp`, tipos do
  client).

## Fase C — `HotmartApiClient` (OAuth2 + cursor)

- **T020** `hotmart-api-client.port.ts` — `HOTMART_API_CLIENT`, `ParametrosListarHotmart`,
  `PaginaHotmart`, `HotmartApiClient`, `HotmartApiIndisponivelError`.
- **T021** `hotmart-api-client.ts` (+`.spec.ts`) — `HotmartApiClientHttp`: `garantirToken`
  com cache em memória por conta (folga 60 s); `listarVendas`/`listarDetalhesPreco` paginando
  por `page_token`; query `start_date`/`end_date` em ms + `transaction_status` + `max_results`;
  credenciais ausentes → `HotmartApiIndisponivelError`. Dublê global de `fetch` no `.spec`.

## Fase D — `status-map/hotmart.ts` (`src/financeiro/domain/status-map/`)

- **T022** `hotmart.ts` (+`hotmart.spec.ts`) — `VOCABULARIO` + `HOTMART` (3 fontes,
  compartilhado). `spec`: cada `(fonte,bruto)` → canônico; `STARTED` → `DESCONHECIDO`+revisar;
  não normaliza caixa; varredura de cobertura contra as fixtures dos parsers.
- **T023** `status-map/index.ts` — `import { HOTMART }` + `Object.assign(MAPAS_STATUS, {
  HOTMART_PRD: HOTMART, HOTMART_SVC: HOTMART })`. `status-map/README.md`: linha 022 = ✅.

## Fase E — DTOs + services + controllers finos

- **T024** `hotmart/dto/sincronizar.schema.ts` — `sincronizarHotmartSchema` (`.strict()`,
  `superRefine` janela ≤ 365 d). `hotmart/dto/importar-csv.schema.ts`.
- **T025** `hotmart/hotmart-sync.service.ts` — pagina detalhes-preço → mapa; pagina vendas →
  merge + `parseVendaApi` + `registrarEvento`; commit por página; `HotmartApiIndisponivelError`
  → 422.
- **T026** `hotmart/hotmart-csv-import.service.ts` — `parseCsvHotmart` + `registrarEvento`.
- **T027** `hotmart/hotmart-ingestao.controller.ts` — `@Controller('ingestao/hotmart')`,
  `POST sincronizar` + `POST importar-csv`, ambos `@RequerPermissao('evento:ingerir')`,
  `@HttpCode(200)`, DTO inválido → 422.
- **T028** `hotmart/hotmart-webhooks.controller.ts` — `@Controller('webhooks/hotmart')`,
  `POST prd`/`POST svc`, `@HttpCode(200)`. Guarda `HOTMART_WEBHOOK_ENABLED !== true` → 503.
  Ligado: `hottok` via `WebhookAuthenticator` (header `x-hotmart-hottok`|`Bearer`) → 401 se
  inválido; senão parseia + registra + 200.

## Fase F — Wiring + config

- **T029** `env.schema.ts` — `HOTMART_PRD_CLIENT_ID`/`_CLIENT_SECRET`/`HOTMART_SVC_CLIENT_ID`/
  `_CLIENT_SECRET` (`z.string().optional()`); `HOTMART_WEBHOOK_ENABLED`
  (`z.enum(['true','false']).default('false').transform(v => v === 'true')`).
  `.env.example` — as 5 chaves com placeholder.
- **T030** `ingestao.module.ts` — importa `HotmartApiClientHttp`, `HOTMART_API_CLIENT`;
  adiciona `HotmartWebhooksController`, `HotmartIngestaoController` aos `controllers`;
  `HotmartSyncService`, `HotmartCsvImportService`, `{ provide: HOTMART_API_CLIENT, useClass:
  HotmartApiClientHttp }` aos `providers`. Atualiza o log do `onModuleInit`.
- **T031** `backend/test/setup-db.ts` — fixtures `HOTMART_PRD_WEBHOOK_TOKEN` /
  `HOTMART_SVC_WEBHOOK_TOKEN` (o `WebhookAuthenticator` precisa deles quando o flag liga).
  **Não** liga `HOTMART_WEBHOOK_ENABLED` (default `false`).

## Fase G — e2e (`backend/test/`)

- **T032** `test/support/hotmart.ts` — `fixture`/`fixtureCsv`, `HOTMART_TOKENS`,
  `HotmartApiClientFake` (2 métodos, páginas encadeadas), `HotmartApiClientIndisponivel`,
  `hotmartHelpers(app)` (`sincronizar`, `importarCsv`, `postWebhook(conta, body, {hottok, on})`,
  `processar`).
- **T033** `test/hotmart-adapter.e2e-spec.ts` — US1..US4 + segredo + SC-016 + fronteira +
  regressão + suíte 003–021. Container `pandora-db-spec022` na porta **55439**.

## Fase H — Qualidade + docs

- **T034** `npm run lint && npm run typecheck && npm run build` (backend) verdes; `git diff`
  não toca `worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts`/`classificar.ts`/
  `schema.prisma`; `frontend/` sem diff.
- **T035** `docs/022-adapter-hotmart.md` (novo); `CLAUDE.md` (novo bloco de plano ativo,
  arquiva 021); `README.md` (seção de contexto/rotas); `ROADMAP.md` (marca 022 + entrada
  detalhada). `financeiro/domain/status-map/README.md` já atualizado no T023.
