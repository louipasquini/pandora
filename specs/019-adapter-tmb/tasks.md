# Tasks — 019 · Adaptadores de borda da TMB

Ordem dependência-primeiro. `[P]` = paralelizável com o(s) anterior(es). Cada tarefa fecha
verde (typecheck + lint + o teste da própria tarefa). **0 migração, 0 dep, 0 frontend.**

## Fase A — Fixtures reais (Princípio III — vêm primeiro, os testes dependem delas)

- **T001** [P] — `backend/src/ingestao/adapters/tmb/fixtures/webhook-vendas-efetivado.json`:
  payload achatado do webhook Vendas, `status_pedido:"Efetivado"`, comprador completo
  (nome/documento/email/telefones em string/endereco_*), `valor_principal`,
  `taxa_administracao`, `data_efetivado` ISO com `-03:00`, `utm_*`, `id_externo`,
  `campo_desconhecido_2027` (para o teste de "ignora chave inédita"). **Dados fictícios**
  (CPF com DV válido, e-mail `@example.invalid`).
- **T002** [P] — `.../fixtures/webhook-vendas-cancelado.json`: `status_pedido:"Cancelado"`,
  `data_efetivado:null` (→ cai em `criado_em`).
- **T003** [P] — `.../fixtures/webhook-financeiro-parcelas.json`: array de 3 `{dados}` do
  mesmo `pedido_id`, `status_pagamento` = `Aguardando pagamento` / `Recebido` / `Estornado`,
  `parcela` 1/2/3, `cliente`/`cliente_email`/`cliente_documento`, `data_pagamento`/
  `vencimento_parcela`. **Sem** campos de valor de venda.
- **T004** [P] — `.../fixtures/api-pedidos-pagina.json`: `{ "itens": [ …3 pedidos… ] }` com
  nomes de campo da API (`pedido_id`, `pais`, `cep`, `endereco_*`, `telefone` singular);
  1 item só com `valor_total` (sem `valor_principal`).
- **T005** [P] — `.../fixtures/export-pedidos.csv`: BOM + cabeçalho separado por `;`, 4
  linhas de dado (1 com aspas contendo `;`, 1 sem `pedido_id`), colunas
  `pedido_id;status_pedido;cliente;documento;email;valor_principal;taxa_administracao;criado_em;data_efetivado;endereco_logradouro;endereco_cidade;endereco_estado;endereco_cep`.

## Fase B — Parsers puros + helpers (`src/ingestao/adapters/tmb/`)

- **T006** — `tipos.ts`: `ResultadoParseTmb` (ver `data-model.md`).
- **T007** — `normalizar-tmb.ts`: `telefonesDeString`, `soDigitos`, `dinheiroDeValorTmb`
  (D-R8 — usa `Dinheiro.deDecimal` do `core`), `enderecoDeTmb`, `textoOuUndefined`. Puros.
- **T008** [P] — `normalizar-tmb.spec.ts`: telefones split/dedup; `dinheiroDeValorTmb`
  (`299.99` → `2999900n`; `1250.0000` → `12500000n`; `"abc"`/`NaN`/`-5` → `undefined`;
  `1e3` → `undefined` + erro); `enderecoDeTmb` com campos vazios → `undefined`.
- **T009** — `parse-webhook-vendas.ts`: `parseWebhookVendas(payload) → ResultadoParseTmb`.
  Monta `EventoCanonico`, valida com `eventoCanonicoSchema.safeParse` (saída), `payloadBruto`
  = entrada, `erros[]`; sem `pedido` → `eventoCanonico` undefined.
- **T010** [P] — `parse-webhook-vendas.spec.ts` contra T001/T002: campos mapeados; "Cancelado"
  cai em `criado_em`; chave inédita ignorada; `pedido` ausente → erro sem lançar.
- **T011** — `parse-webhook-financeiro.ts`: `parseWebhookFinanceiro(payload) →
  ResultadoParseTmb[]`. Aceita array / `{dados}` / achatado; 1 resultado por item; **não
  emite `valores`**; `[]` → `[]`.
- **T012** [P] — `parse-webhook-financeiro.spec.ts` contra T003: 3 resultados, `idOrigem`
  igual nos 3, `statusOrigem` distinto, sem `valores`; array vazio → `[]`; objeto único →
  `[1]`.
- **T013** — `parse-pedido-api.ts`: `parsePedidoApi(item) → ResultadoParseTmb`
  (`tipoOrigem:"tmb.api"`; `valor_principal ?? valor_total`; `telefone` singular).
- **T014** [P] — `parse-pedido-api.spec.ts` contra T004: 3 itens; o item só-`valor_total`
  usa `valor_total` como `bruto`.
- **T015** — `parse-linha-csv.ts`: `parseCsv(conteudo) → ResultadoParseTmb[]`. Detecta
  separador (`,` vs `;` no cabeçalho), tira BOM, mini state-machine de aspas, mapa de
  colunas (aceita `pedido`|`pedido_id`), linha sem pedido → erro; reusa a montagem da
  Fonte 1/3.
- **T016** [P] — `parse-linha-csv.spec.ts` contra T005: separador `;` detectado; linha com
  aspas OK; linha sem `pedido_id` → `erros:["linha N: sem identificador de pedido"]`, sem
  `eventoCanonico`; cabeçalho sem coluna de pedido → todas as linhas em erro, não lança.
- **T017** — `index.ts`: re-export dos 4 parsers + `ResultadoParseTmb` + `TMB_API_CLIENT`/
  `TmbApiClient`.

## Fase C — `TmbApiClient` (`fetch` nativo, 0 dep)

- **T018** — `tmb-api-client.port.ts`: `TMB_API_CLIENT` (Symbol) + interface `TmbApiClient`
  (ver `data-model.md`) + `class TmbApiIndisponivelError`.
- **T019** — `tmb-api-client.ts`: `TmbApiClientHttp` (`@Injectable`), lê
  `TMB_API_BASE_URL`/`TMB_API_KEY` via `ConfigService` tipado; `listarPedidos` monta URL
  (`pageNumber`/`pageSize`/`data_inicio`/`data_final`/`produto_id`), `Authorization: Bearer`,
  `AbortSignal.timeout(15000)`; normaliza resposta (`Array` | `{itens}` | `{data}`);
  `temProximaPagina = itens.length >= pageSize`; env ausente → lança `TmbApiIndisponivelError`.
- **T020** [P] — `tmb-api-client.spec.ts`: dublê global de `fetch`; 2 páginas depois vazio →
  chama 3×, para; monta a query string certa; env ausente → lança.

## Fase D — `status-map/tmb.ts` (`src/financeiro/domain/status-map/`)

- **T021** [P] — `financeiro/domain/status-map/tmb.ts`: `export const TMB: Record<string,
  Record<string, StatusTransacaoCanonico>>` (ver `contracts/status-map-tmb.md`).
- **T022** — `financeiro/domain/status-map/index.ts`: `import { TMB } from './tmb';` +
  `Object.assign(MAPAS_STATUS, { TMB });`.
- **T023** — `financeiro/domain/status-map/README.md`: marca a 019 como **feita** (exemplo
  vira TMB real); mantém o passo-a-passo para 020–022.
- **T024** [P] — `financeiro/domain/status-map/tmb.spec.ts`: cada `(fonte,bruto)` → canônico
  esperado, `revisar:false`; bruto inédito → `DESCONHECIDO`+`revisar`; varredura "toda chave
  de `TMB` aparece em `statusOrigem` de alguma fixture dos parsers".

## Fase E — Controllers finos (`src/ingestao/tmb/`)

- **T025** — `tmb/dto/sincronizar.schema.ts` + `tmb/dto/importar-csv.schema.ts` (zod).
- **T026** — `tmb/tmb-sync.service.ts`: `sincronizar(dto) → { paginas, recebidos, novos,
  dedup, ignorados, erros }`. Injeta `@Inject(TMB_API_CLIENT)` + `RegistrarEventoService`.
  Loop de páginas; `parsePedidoApi` cada item; `registrarEvento` (soma `novos`/`dedup` pelo
  `criado`); `TmbApiIndisponivelError` → relança como `UnprocessableEntityException`
  (`"conta TMB sem API configurada"`); erro HTTP de página → `erros.push`, segue.
- **T027** — `tmb/tmb-csv-import.service.ts`: `importar(conteudo) → { linhas, novos, dedup,
  ignoradas, erros }`. `parseCsv` → registra os com `eventoCanonico`, soma o resto.
- **T028** — `tmb/tmb-webhooks.controller.ts`: `@Controller()` com
  `@Public() @Post('webhooks/tmb/vendas')` e `@Public() @Post('webhooks/tmb/financeiro')`.
  Extrai token (`x-tmb-webhook-token` | `authorization`), `WebhookAuthenticator.autenticar
  ('TMB', token)` → 401 se falhar; chama o parser; `registrarEvento` 1×/fato; `res.status
  (202)`; retorna `{ registrados, ignorados, eventoIds }`. `RegistrarEventoService` lançou →
  deixa propagar (5xx).
- **T029** — `tmb/tmb-ingestao.controller.ts`: `@Controller('ingestao/tmb')` com
  `@RequerPermissao('evento:ingerir')` em `@Post('sincronizar')` e `@Post('importar-csv')`
  (valida DTO → 422; chama os services).
- **T030** — `ingestao.module.ts`: adiciona `TmbWebhooksController`, `TmbIngestaoController`
  aos `controllers`; `TmbSyncService`, `TmbCsvImportService`,
  `{ provide: TMB_API_CLIENT, useClass: TmbApiClientHttp }` aos `providers`.
  `WebhookAuthenticator` já vem do `AuthModule` (global). Log do `onModuleInit` menciona os
  webhooks TMB.

## Fase F — e2e backend

- **T031** — `backend/test/support/tmb.ts`: carrega as fixtures; `postWebhookVendas(app,
  body, token?)`, `postWebhookFinanceiro(...)`, `sincronizar(app, token, dto)`,
  `importarCsv(app, token, conteudo)`, `processar(app, token)`, `getTransacoesTmb(app,
  token)`. Classe `TmbApiClientFake implements TmbApiClient` (páginas configuráveis).
- **T032** — `backend/test/tmb-adapter.e2e-spec.ts`:
  - `overrideProvider(TMB_API_CLIENT).useValue(fake)` no `Test.createTestingModule`.
  - **US1**: webhook Vendas "Efetivado" + token → 202; 1 `evento_origem`
    `tmb.webhook-vendas`, `payload_bruto` == enviado; `processar` → 1 `transacao`
    `(TMB,<pedido>)` `PAGO`, `pessoa_id` != null. "Cancelado" → `CANCELADO`.
  - **US1 guard**: sem token / errado → 401; `count(evento_origem)==0`.
  - **US2**: Vendas "Efetivado" + Financeiro "Estornado" mesmo `pedido` → 2 eventos, **1**
    transação, `ESTORNADO` + `REEMBOLSO`. Array de 3 parcelas → 3 eventos, 1 transação;
    reenviar o array → `registrados:3` mas `count(evento_origem)` estável (dedup). `[]` →
    202 `{registrados:0}`.
  - **US2 revisão**: `status_pagamento:"Xpto"` → transação `DESCONHECIDO`,
    `precisa_revisao`, `evento_origem.status='revisar'`.
  - **US3**: fake com 2 páginas → `sincronizar` → `{paginas:2,recebidos:N,novos:N,dedup:0}`;
    re-disparo → `novos:0`. Sem `TMB_API_KEY`/`TMB_API_BASE_URL` no env de teste **e**
    usando o `TmbApiClientHttp` real (um `describe` sem override) → 422. *(alternativa: teste
    dedicado que injeta um client que lança `TmbApiIndisponivelError`.)*
  - **US4**: `importar-csv` 5 boas + 1 sem pedido → `{linhas:6,novos:5,ignoradas:1}`; 2º
    import → `novos:0`.
  - **Fronteira** (`grep` no fs): `src/ingestao/adapters/tmb` sem `financeiro`;
    `src/financeiro/domain/status-map` sem `ingestao`.
  - **Não-regressão** (`git`): `worker.service.ts`, `etapas.ts`,
    `pipeline-wiring.module.ts`, `prisma/schema.prisma` sem diff nesta branch.
  - **Catálogo**: `GET /admin/rbac/permissoes` sem permissão nova; `/health` = 11.
- **T033** — rodar a suíte 003–019 completa contra o Postgres isolado (`55436`); verde.

## Fase G — Qualidade + docs

- **T034** — `npm run lint && npm run typecheck && npm run build --workspace backend`;
  verde. (frontend inalterado — rodar `test`/`build` só p/ confirmar 0 diff.)
- **T035** — `.env.example`: comentário nos `TMB_API_BASE_URL`/`TMB_API_KEY`/
  `TMB_WEBHOOK_TOKEN` já existentes ("usado pela spec 019 — webhooks + sync"). Nada novo.
- **T036** — `docs/019-adapter-tmb.md` (novo — visão geral, as 4 fontes, o mapa de campos, o
  status-map, decisões D-01..D-15, como 020–022 seguem o mesmo molde).
- **T037** — `ROADMAP.md`: marcar `[x] 019 — adapter-tmb` com o resumo (padrão dos itens
  anteriores); `README.md`: citar as rotas `/webhooks/tmb/*` e `/ingestao/tmb/*` se listar
  rotas; `CLAUDE.md`: **rodar `speckit.agent-context.update`** para regenerar a seção
  SPECKIT + adicionar o parágrafo da 019 na lista de specs implementadas (fora do bloco
  SPECKIT, junto do texto da 018).
- **T038** — commit(s) Conventional na branch `019-adapter-tmb` (**sem** trailer de
  coautoria) + PR para `main`.
