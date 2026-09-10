# Tasks — 020 · Adaptadores de borda da Asaas

Ordem dependência-primeiro. `[P]` = paralelizável com o(s) anterior(es). Cada tarefa fecha
verde (typecheck + lint + o teste da própria tarefa). **0 migração, 0 dep, 0 frontend.**
Molde direto da 019 (TMB).

## Fase A — Fixtures reais (Princípio III — vêm primeiro)

- **T001** [P] — `fixtures/webhook-payment-received.json`: `{ event: "PAYMENT_RECEIVED",
  payment: { id: "pay_9f8...", status: "RECEIVED", value: 197, netValue: 190.13,
  billingType: "PIX", customer: "cus_000...", dateCreated: "2026-03-08",
  paymentDate: "2026-03-09", description: "Curso ...", externalReference: "" } }` +
  `campo_novo_2027` para o teste de "ignora chave inédita". Dados fictícios.
- **T002** [P] — `fixtures/webhook-payment-overdue.json`: `status: "OVERDUE"`,
  `paymentDate: null` (cai em `dateCreated`).
- **T003** [P] — `fixtures/webhook-payment-refunded.json`: `status: "REFUNDED"`,
  `refunds: [{ value: 197, status: "DONE" }]` (fica só no payload_bruto).
- **T004** [P] — `fixtures/webhook-payment-deleted.json`: `event: "PAYMENT_DELETED"`,
  `payment: { ..., status: "PENDING", deleted: true }` (→ `statusOrigem: "DELETED"`).
- **T005** [P] — `fixtures/webhook-payment-confirmed-guru.json`: `status: "CONFIRMED"`,
  `billingType: "CREDIT_CARD"`, `subscription: "sub_123"`,
  `externalReference: "guru-tx-abc123"` (US2).
- **T006** [P] — `fixtures/api-payments-pagina.json`: `{ object: "list", hasMore: false,
  totalCount: 3, limit: 100, offset: 0, data: [ …3 payments… ] }`; 1 item só com `value` (sem
  `netValue`).
- **T007** [P] — `fixtures/export-cobrancas.csv`: BOM + cabeçalho separado por `;`, 6 linhas
  de dado (1 com aspas contendo `;`, 1 sem `id`), colunas
  `id;status;value;netValue;dateCreated;paymentDate;dueDate;description;externalReference;subscription;customer;email;cpfCnpj;phone`.

## Fase B — Parsers puros + helpers (`src/ingestao/adapters/asaas/`)

- **T008** — `tipos.ts`: `FonteAsaas` + `ResultadoParseAsaas` (ver `data-model.md`).
- **T009** — `normalizar-asaas.ts`: `textoOuUndefined`, `soDigitos`, `telefonesDeString`,
  `dinheiroDeValorAsaas` (cópia de `dinheiroDeValorTmb` da 019 — `Dinheiro.deDecimal`,
  BRL), `liquidoDe` (`bruto − taxas`, `0 < r < bruto`). Puros.
- **T010** [P] — `normalizar-asaas.spec.ts`: `dinheiroDeValorAsaas` (`197` → `1970000n`;
  `190.13` → `1901300n`; `"abc"`/`NaN`/`-5`/`1e3` → `undefined` + erro); telefones split/
  dedup; `soDigitos`.
- **T011** — `montar.ts`: `montarResultado(conta, fonte, payloadBruto, campos, erros) →
  ResultadoParseAsaas`. Como o da 019, mas recebe `conta` (`plataformaOrigem`), suporta
  `assinatura`/`referenciaExterna`/`oferta`/`comprador`; erro "sem identificador de
  cobrança"; valida com `eventoCanonicoSchema.safeParse`.
- **T012** — `parse-webhook.ts`: `parseWebhookAsaas(payload, conta) → ResultadoParseAsaas[]`.
  Extrai `{ event, payment }` (aceita array); `statusOrigem = deleted ? "DELETED" : status`;
  `valores` bruto/liquido/taxas; `assinatura` sse `subscription`; `referenciaExterna` sse
  `externalReference` (sem `plataforma`); `oferta.nomeOrigem = description`; **sem
  `comprador`**; `payment.id` ausente → sem `eventoCanonico`.
- **T013** [P] — `parse-webhook.spec.ts` contra T001–T005 (× `ASAAS_PRD`): campos mapeados;
  `deleted` → `"DELETED"`; `subscription` → `assinatura.ehRecorrencia`; `externalReference`
  → `referenciaExterna.idOrigem` sem `plataforma`; chave inédita ignorada; sem `payment.id`
  → erro sem lançar; array de 1 item.
- **T014** — `parse-pagamento-api.ts`: `parsePagamentoApi(item, conta) → ResultadoParseAsaas`
  (`tipoOrigem:"asaas.api"`; reaproveita a montagem da Fonte 1).
- **T015** [P] — `parse-pagamento-api.spec.ts` contra T006: 3 itens; o item só-`value` usa
  `value` como `bruto`, sem `liquido`.
- **T016** — `parse-linha-csv.ts`: `parseCsvAsaas(conteudo, conta) → ResultadoParseAsaas[]`.
  Cópia do `parse-linha-csv.ts` da 019 (detecta `,`/`;`, BOM, aspas); mapa de colunas com
  aliases inglês/pt-BR; monta `comprador` das colunas `cliente`/`email`/`cpf_cnpj`/
  `telefone`; linha sem `id` → erro; cabeçalho sem coluna de id → todas em erro.
- **T017** [P] — `parse-linha-csv.spec.ts` contra T007: separador `;`; aspas OK; comprador
  montado; linha sem `id` → `erros:["linha N: sem identificador de cobrança"]`; cabeçalho
  sem `id` → todas em erro, não lança.
- **T018** — `index.ts`: re-export dos 3 parsers + `FonteAsaas`/`ResultadoParseAsaas` +
  `ASAAS_API_CLIENT`/`AsaasApiClient`/`AsaasApiIndisponivelError`/`PaginaPagamentos`/
  `ParametrosListarPagamentos` + `AsaasApiClientHttp`.

## Fase C — `AsaasApiClient` (`fetch` nativo, 0 dep)

- **T019** — `asaas-api-client.port.ts`: `ASAAS_API_CLIENT` (Symbol) + interface
  `AsaasApiClient` + `class AsaasApiIndisponivelError` (ver `data-model.md`).
- **T020** — `asaas-api-client.ts`: `AsaasApiClientHttp` (`@Injectable`), lê
  `ASAAS_<conta>_API_BASE_URL` (default `https://api.asaas.com/v3`) / `ASAAS_<conta>_API_KEY`
  via `ConfigService` destipado; `listarPagamentos` monta URL
  (`offset`/`limit`/`dateCreated[ge]`/`dateCreated[le]`), header `access_token` + `User-Agent`,
  `AbortSignal.timeout(15000)`; `extrairItens` (`{data}` | `Array` | `{itens}`);
  `temProximaPagina = corpo.hasMore === true`; chave da conta ausente → lança
  `AsaasApiIndisponivelError(conta)`.
- **T021** [P] — `asaas-api-client.spec.ts`: dublê global de `fetch`; 2 páginas depois
  `hasMore:false` → 3 chamadas, para; monta a query string certa; header `access_token`;
  chave ausente → lança.

## Fase D — `status-map/asaas.ts` (`src/financeiro/domain/status-map/`)

- **T022** [P] — `financeiro/domain/status-map/asaas.ts`: `VOCABULARIO` + `export const
  ASAAS` (ver `contracts/status-map-asaas.md`).
- **T023** — `financeiro/domain/status-map/index.ts`: `import { ASAAS } from './asaas';` +
  `Object.assign(MAPAS_STATUS, { ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS });`.
- **T024** — `financeiro/domain/status-map/README.md`: marca a 020 como **feita** (linha da
  tabela + exemplo); mantém o passo-a-passo para 021–022.
- **T025** [P] — `financeiro/domain/status-map/asaas.spec.ts`: cada `(fonte,bruto)` →
  canônico esperado, `revisar:false`; `('ASAAS_PRD','asaas.webhook','RECEIVED')===PAGO`;
  `('ASAAS_SVC','asaas.api','REFUNDED')===ESTORNADO`; `'DELETED'===CANCELADO`; bruto inédito
  → `DESCONHECIDO`+`revisar`; varredura "toda chave de `VOCABULARIO` aparece em
  `statusOrigem` de alguma fixture dos parsers".

## Fase E — Controllers finos (`src/ingestao/asaas/`)

- **T026** — `asaas/dto/sincronizar.schema.ts` + `asaas/dto/importar-csv.schema.ts` (zod;
  `conta` enum `["ASAAS_PRD","ASAAS_SVC"]` obrigatório).
- **T027** — `asaas/asaas-sync.service.ts`: `sincronizar(dto) → { conta, paginas, recebidos,
  novos, dedup, ignorados, erros }`. `@Inject(ASAAS_API_CLIENT)` + `RegistrarEventoService`.
  Loop de `offset`; `parsePagamentoApi` cada item; `registrarEvento` (soma `novos`/`dedup`
  pelo `criado`); `AsaasApiIndisponivelError` → `UnprocessableEntityException`; erro HTTP de
  página → `erros.push`, `break`.
- **T028** — `asaas/asaas-csv-import.service.ts`: `importar(conta, conteudo) → { conta,
  linhas, novos, dedup, ignoradas, erros }`. `parseCsvAsaas` → registra os com
  `eventoCanonico`, soma o resto.
- **T029** — `asaas/asaas-webhooks.controller.ts`: `@Controller('webhooks/asaas')` com
  `@Public() @Post('prd')` e `@Public() @Post('svc')` (`@HttpCode(200)`). Extrai token
  (`asaas-access-token` | `authorization`), `WebhookAuthenticator.autenticar(<conta core>,
  token)` → 401; `parseWebhookAsaas(body, <conta prisma>)`; `registrarEvento` 1×/fato (sem
  `payment.id` → `ignorados++`, não registra); retorna `{ registrados, ignorados, eventoIds
  }`; `RegistrarEventoService` lançou → propaga (5xx).
- **T030** — `asaas/asaas-ingestao.controller.ts`: `@Controller('ingestao/asaas')` com
  `@RequerPermissao('evento:ingerir')` em `@Post('sincronizar')` e `@Post('importar-csv')`
  (`@HttpCode(200)`; valida DTO → 422; delega aos services).
- **T031** — `ingestao.module.ts`: adiciona `AsaasWebhooksController`,
  `AsaasIngestaoController` aos `controllers`; `AsaasSyncService`, `AsaasCsvImportService`,
  `{ provide: ASAAS_API_CLIENT, useClass: AsaasApiClientHttp }` aos `providers`. Log do
  `onModuleInit` menciona os webhooks Asaas.

## Fase F — e2e backend

- **T032** — `backend/test/setup-db.ts`: `process.env.ASAAS_PRD_WEBHOOK_TOKEN ??=
  'asaas-prd-webhook-token-e2e'` + idem `ASAAS_SVC` (mesmo padrão do `TMB_WEBHOOK_TOKEN` da
  019).
- **T033** — `backend/test/support/asaas.ts`: carrega fixtures;
  `postWebhook(conta, body, token?)`, `sincronizar(dto)`, `importarCsv(conta, conteudo)`,
  `processar()`, `transacoes(conta)`. `AsaasApiClientFake` (páginas configuráveis) +
  `AsaasApiClientIndisponivel`.
- **T034** — `backend/test/asaas-adapter.e2e-spec.ts` (ver `plan.md` §Testing):
  US1 / US1 guard / US2 / US2 refund / US2 revisão / US3 (dublê 2 páginas + `conta` inválida
  + sem chave) / US4 / SC-015 isolamento de contas / fronteira (`grep`) / regressão (`git`) /
  catálogo (`/admin/rbac/permissoes` sem `asaas:` + `/health`=11).
- **T035** — rodar a suíte 003–020 completa contra o Postgres isolado (`55437`); verde.

## Fase G — Qualidade + docs

- **T036** — `npm run lint && npm run typecheck && npm run build --workspace backend`; verde.
  (frontend inalterado — `test`/`build` só p/ confirmar 0 diff.)
- **T037** — `.env.example`: comentário nos `ASAAS_PRD_*` / `ASAAS_SVC_*` já existentes
  ("usado pela spec 020 — webhooks por conta + sync + CSV"). Nada novo.
- **T038** — `docs/020-adapter-asaas.md` (novo — visão geral, as 3 fontes, o mapa de campos,
  o status-map, decisões A-01..A-16, como 021–022 seguem o mesmo molde).
- **T039** — `ROADMAP.md`: marcar `[x] 020 — adapter-asaas` com o resumo (padrão dos itens
  anteriores); `README.md`: citar as rotas `/webhooks/asaas/*` e `/ingestao/asaas/*`;
  `CLAUDE.md`: **rodar `speckit.agent-context.update`** para regenerar a seção SPECKIT +
  adicionar o parágrafo da 020 (junto do texto da 019).
- **T040** — commit(s) Conventional na branch `020-adapter-asaas` (**sem** trailer de
  coautoria) + PR para `main`.
