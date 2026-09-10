# Tasks — 021 · Adaptadores de borda da Guru

Ordem dependência-primeiro. `[P]` = paralelizável com o(s) anterior(es). Cada tarefa fecha
verde (typecheck + lint + o teste da própria tarefa). **0 migração, 0 dep, 0 frontend.**
Molde direto das 019 (TMB) / 020 (Asaas).

## Fase A — Fixtures reais (Princípio III — vêm primeiro)

- **T001** [P] — `fixtures/webhook-venda-approved.json`: transação Guru `status: "approved"`,
  `type: "producer"`, `payment: { gross: 497, net: 468.1, currency: "BRL", tax: { value:
  28.9 } }`, `product: { type: "product", qty: 1, offer: { id: "of_abc123", name: "Curso X —
  Oferta Anual" }, name: "Curso X" }`, `contact: { name, email, doc, phone_local_code: "55",
  phone_number, address*... }`, `dates: { ordered_at, confirmed_at, created_at }`,
  `campo_novo_2027` para o teste de "ignora chave inédita". `api_token: "GURU-TOKEN-FIXTURE"`
  (para o teste de remoção). Dados fictícios.
- **T002** [P] — `fixtures/webhook-venda-waiting-payment.json`: `status: "waiting_payment"`,
  `payment.net` ausente, `dates.confirmed_at: null` (cai em `ordered_at`).
- **T003** [P] — `fixtures/webhook-venda-refunded.json`: `status: "refunded"`,
  `payment.refund_reason` (fica só no payload_bruto).
- **T004** [P] — `fixtures/webhook-venda-chargeback.json`: `status: "chargeback"`.
- **T005** [P] — `fixtures/webhook-venda-afiliada.json`: `type: "affiliate"`,
  `affiliations: [{ name, value, net_value }]`, `status: "approved"`.
- **T006** [P] — `fixtures/webhook-venda-assinatura-ciclo.json`: `product.type: "plan"`,
  `subscription: { id: "sub_x", subscription_code, last_status: "active", charged_times: 3 }`,
  `invoice: { cycle: 3, type: "cycle", status: "paid" }`, `status: "approved"`.
- **T007** [P] — `fixtures/webhook-venda-plano-negado.json`: `product.type: "plan"`,
  `subscription: {}` (vazio), `status: "rejected"`.
- **T008** [P] — `fixtures/api-transactions-pagina.json`: `{ data: [ …3 transações… ],
  has_more_pages: 0, next_cursor: "", per_page: 50, total_rows: 3 }`; 1 item só com
  `payment.gross` (sem `net`); moedas variadas (1 com `currency: "USD"`).
- **T009** [P] — `fixtures/api-transactions-vocabulario.json`: `{ data: [ …1 transação por
  status do `VOCABULARIO` que ainda não aparece nas outras fixtures: `completed`, `pending`,
  `billet_printed`, `processing`, `analysis`, `charging`, `delayed`, `in_recovery`,
  `dispute`, `canceled`, `expired`, `failed`, `blocked`… ] }` — cobre a varredura do
  `status-map/guru.spec.ts`.
- **T010** [P] — `fixtures/export-vendas.csv`: BOM + cabeçalho separado por `;`, 6 linhas (1
  com aspas contendo `;`, 1 sem `id`), colunas
  `id;status;valor_bruto;valor_liquido;moeda;data_pedido;data_aprovacao;produto;codigo_oferta;tipo;assinatura;ciclo;nome;email;documento;telefone`.

## Fase B — Parsers puros + helpers (`src/ingestao/adapters/guru/`)

- **T011** — `tipos.ts`: `FonteGuru`, `ContaGuru`, `ResultadoParseGuru` (ver `data-model.md`).
- **T012** — `normalizar-guru.ts`: `textoOuUndefined`, `soDigitos`, `telefonesDeString`,
  `enderecoDeGuru`, `dinheiroDeValorGuru(v, erros, rotulo, moeda)` (cópia de
  `dinheiroDeValorAsaas` da 020 com `moeda` parametrizada — `Dinheiro.deDecimal`), `taxasDe`
  (`0 < taxa < bruto`), `moedaDeGuru(v)` (`ehMoeda(v) ? String(v) : undefined`). Puros.
- **T013** [P] — `normalizar-guru.spec.ts`: `dinheiroDeValorGuru` (`497` → `4970000n`;
  `19.9` → `199000n`; `"abc"`/`NaN`/`-5`/`1e3` → `undefined` + erro; `moeda: "USD"`
  respeitada); `moedaDeGuru('BRL')`/`moedaDeGuru('xx')`; `enderecoDeGuru`;
  `telefonesDeString('55', '11999...')`; `soDigitos`.
- **T014** — `transacao.ts`: `ehObjeto`, `camposDeTransacao(t, erros) → CamposCanonicosGuru`
  — a extração **compartilhada** webhook/API (status cru, `ocorridoEm`, `moeda`, `valores`,
  `comprador` do `contact`, `oferta` de `product`/`items`, `assinatura` sse `plan` +
  `subscription.id`, `ehAfiliada` sse `type === "affiliate"`).
- **T015** — `montar.ts`: `montarResultado(conta, fonte, payloadBruto, campos, erros) →
  ResultadoParseGuru`. Como o da 020, mas: recebe `moeda` nos `Dinheiro`; suporta `oferta`
  com `codigoOrigem`/`quantidade`; `assinatura` com `numeroCiclo`; `ehAfiliada`; erro "sem
  identificador de transação"; valida com `eventoCanonicoSchema.safeParse`.
- **T016** — `parse-webhook.ts`: `parseWebhookGuru(payload, conta) → ResultadoParseGuru[]`.
  Aceita objeto ou array; **remove `api_token`** do `payloadBruto` (`const { api_token,
  ...resto } = obj`); `camposDeTransacao`; `t.id` ausente → sem `eventoCanonico`.
- **T017** [P] — `parse-webhook.spec.ts` contra T001–T007 (× `GURU_PRD`): campos mapeados;
  `type:"affiliate"` → `ehAfiliada:true`; `plan` + `subscription.id` + `invoice.cycle` →
  `assinatura {ehRecorrencia:true, numeroCiclo}`; `plan` + `subscription:{}` → sem
  `assinatura`; `payload_bruto` **sem `api_token`**; chave inédita ignorada; sem `id` → erro
  sem lançar; array de 1 item; `payment.currency` propagada aos `Dinheiro`.
- **T018** — `parse-transacao-api.ts`: `parseTransacaoApi(item, conta) → ResultadoParseGuru`
  (`tipoOrigem: "guru.api"`; reaproveita `camposDeTransacao`).
- **T019** [P] — `parse-transacao-api.spec.ts` contra T008: 3 itens; o item só-`gross` usa
  `gross` como `bruto`, sem `liquido`; item `currency:"USD"` → `Dinheiro.moeda === "USD"`.
- **T020** — `parse-linha-csv.ts`: `parseCsvGuru(conteudo, conta) → ResultadoParseGuru[]`.
  Cópia do `parse-linha-csv.ts` da 020 (detecta `,`/`;`, BOM, aspas); mapa de colunas com
  aliases inglês/pt-BR (ver `data-model.md`); monta `comprador`; linha sem `id` → erro;
  cabeçalho sem coluna de id → todas em erro.
- **T021** [P] — `parse-linha-csv.spec.ts` contra T010: separador `;`; aspas OK; comprador
  montado; `oferta.codigoOrigem` da coluna `codigo_oferta`; linha sem `id` → `erros:["linha
  N: sem identificador de transação"]`; cabeçalho sem `id` → todas em erro, não lança.
- **T022** — `index.ts`: re-export dos 3 parsers + `FonteGuru`/`ContaGuru`/`ResultadoParseGuru`
  + `GURU_API_CLIENT`/`GuruApiClient`/`GuruApiIndisponivelError`/`PaginaTransacoes`/
  `ParametrosListarTransacoes`/`CampoDataGuru` + `GuruApiClientHttp`.

## Fase C — `GuruApiClient` (`fetch` nativo, cursor, 0 dep)

- **T023** — `guru-api-client.port.ts`: `GURU_API_CLIENT` (Symbol) + `CampoDataGuru` +
  `ParametrosListarTransacoes` + `PaginaTransacoes` + interface `GuruApiClient` + `class
  GuruApiIndisponivelError` (ver `data-model.md`).
- **T024** — `guru-api-client.ts`: `GuruApiClientHttp` (`@Injectable`), lê
  `GURU_<conta>_API_BASE_URL` (default `https://digitalmanager.guru/api/v2`) /
  `GURU_<conta>_API_KEY` via `ConfigService` destipado; `listarTransacoes` monta URL
  (`<campoData>_ini`/`<campoData>_end`/`cursor?`), header `Authorization: Bearer` + `Accept`
  + `User-Agent`, `AbortSignal.timeout(15000)`; `extrairPagina` (`{data, has_more_pages,
  next_cursor}` | `Array`); `proximoCursor = has_more_pages ? next_cursor : undefined`; chave
  da conta ausente → lança `GuruApiIndisponivelError(conta)`.
- **T025** [P] — `guru-api-client.spec.ts`: dublê global de `fetch`; página 1
  (`has_more_pages: 1`, `next_cursor: "c2"`) → página 2 (`has_more_pages: 0`) → 2 chamadas,
  para; 2ª chamada leva `cursor=c2`; monta `ordered_at_ini`/`ordered_at_end`; header
  `Authorization: Bearer`; chave ausente → lança.

## Fase D — `status-map/guru.ts` (`src/financeiro/domain/status-map/`)

- **T026** [P] — `financeiro/domain/status-map/guru.ts`: `VOCABULARIO` + `export const GURU`
  (ver `contracts/status-map-guru.md`).
- **T027** — `financeiro/domain/status-map/index.ts`: `import { GURU } from './guru';` +
  `Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU });` (após a linha da 020).
- **T028** — `financeiro/domain/status-map/README.md`: marca a 021 como **feita** (linha da
  tabela + confirma o exemplo); mantém o passo-a-passo para a 022.
- **T029** [P] — `financeiro/domain/status-map/guru.spec.ts`: cada `(fonte,bruto)` →
  canônico, `revisar:false`; `('GURU_PRD','guru.webhook','approved')===PAGO`;
  `('GURU_SVC','guru.api','refunded')===ESTORNADO`; `'chargeback'===CHARGEBACK`; bruto inédito
  (`trial`) → `DESCONHECIDO`+`revisar`; `'Approved'` → `revisar` (não normaliza caixa);
  varredura "toda chave de `VOCABULARIO` aparece em `status` de alguma fixture dos parsers".

## Fase E — Controllers finos (`src/ingestao/guru/`)

- **T030** — `guru/dto/sincronizar.schema.ts` (zod; `conta` enum `["GURU_PRD","GURU_SVC"]`
  obrigatório; `dataInicio`/`dataFinal` `YYYY-MM-DD` obrigatórios; `campoData` enum default
  `ordered_at`; `.superRefine` valida `inicio <= final` e janela ≤ 180 dias) +
  `guru/dto/importar-csv.schema.ts` (cópia da 020, `conta` Guru, `fonte?: "guru.csv"`).
- **T031** — `guru/guru-sync.service.ts`: `sincronizar(dto) → { conta, paginas, recebidos,
  novos, dedup, ignorados, erros }`. `@Inject(GURU_API_CLIENT)` + `RegistrarEventoService`.
  Loop de cursor (`cursor = undefined` → `resultado.proximoCursor` → até `undefined` /
  `MAX_PAGINAS`); `parseTransacaoApi` cada item; `registrarEvento` (soma `novos`/`dedup` por
  `criado`); `GuruApiIndisponivelError` → `UnprocessableEntityException`; erro HTTP de página
  → `erros.push`, `break`.
- **T032** — `guru/guru-csv-import.service.ts`: `importar(conta, conteudo) → { conta, linhas,
  novos, dedup, ignoradas, erros }`. `parseCsvGuru` → registra os com `eventoCanonico`, soma
  o resto. (Cópia direta da 020.)
- **T033** — `guru/guru-webhooks.controller.ts`: `@Controller('webhooks/guru')` com
  `@Public() @Post('prd')` e `@Public() @Post('svc')` (`@HttpCode(200)`). Lê
  `body.api_token`, `WebhookAuthenticator.autenticar(PlataformaCore[conta],
  String(body?.api_token) || undefined)` → 401; `parseWebhookGuru(body, <conta prisma>)`;
  `registrarEvento` 1×/fato (sem `id` → `ignorados++`, não registra); retorna `{ registrados,
  ignorados, eventoIds }`; `RegistrarEventoService` lançou → propaga (5xx).
- **T034** — `guru/guru-ingestao.controller.ts`: `@Controller('ingestao/guru')` com
  `@RequerPermissao('evento:ingerir')` em `@Post('sincronizar')` e `@Post('importar-csv')`
  (`@HttpCode(200)`; valida DTO → 422; delega aos services).
- **T035** — `ingestao.module.ts`: adiciona `GuruWebhooksController`, `GuruIngestaoController`
  aos `controllers`; `GuruSyncService`, `GuruCsvImportService`, `{ provide: GURU_API_CLIENT,
  useClass: GuruApiClientHttp }` aos `providers`. Log do `onModuleInit` menciona os webhooks
  Guru.

## Fase F — e2e backend

- **T036** — `backend/test/setup-db.ts`: `process.env.GURU_PRD_WEBHOOK_TOKEN ??=
  'guru-prd-webhook-token-e2e'` + idem `GURU_SVC` (mesmo padrão do `ASAAS_*` da 020).
- **T037** — `backend/test/support/guru.ts`: carrega fixtures; `postWebhook(conta, body,
  token?)` (injeta `api_token` no corpo), `sincronizar(dto)`, `importarCsv(conta, conteudo)`,
  `processar()`. `GuruApiClientFake` (páginas encadeadas por cursor) +
  `GuruApiClientIndisponivel`.
- **T038** — `backend/test/guru-adapter.e2e-spec.ts` (ver `plan.md` §Testing): US1 / US1
  guard / US1 segredo (`grep` do `api_token`) / US2 (afiliada + ciclo + plano negado) / US2
  refund / US2 revisão / US3 (dublê 2 páginas cursor + `conta` inválida + janela > 180d + sem
  chave) / US4 / SC-015 isolamento de contas / fronteira (`grep`) / regressão (`git` +
  `/health`=11 + catálogo RBAC).
- **T039** — rodar a suíte 003–021 completa contra o Postgres isolado (`55438`); verde.

## Fase G — Qualidade + docs

- **T040** — `npm run lint && npm run typecheck && npm run build --workspace backend`; verde.
  (frontend inalterado — `test`/`build` só p/ confirmar 0 diff.)
- **T041** — `.env.example`: comentário nos `GURU_PRD_*` / `GURU_SVC_*` já existentes ("usado
  pela spec 021 — webhooks por conta + sync cursor + CSV"). Nada novo.
- **T042** — `docs/021-adapter-guru.md` (novo — visão geral, as 3 fontes, o mapa de campos,
  o status-map, decisões G-01..G-18, `api_token` no corpo, cursor, como a 022 segue o molde).
- **T043** — `ROADMAP.md`: marcar `[x] 021 — adapter-guru` com o resumo; `README.md`: citar
  as rotas `/webhooks/guru/*` e `/ingestao/guru/*`; `CLAUDE.md`: **rodar
  `speckit.agent-context.update`** para regenerar a seção SPECKIT + adicionar o parágrafo da
  021 (arquivando o da 020 em `<details>`, como foi feito com a 019).
- **T044** — commit(s) Conventional na branch `021-adapter-guru` (**sem** trailer de
  coautoria) + PR para `main`.
