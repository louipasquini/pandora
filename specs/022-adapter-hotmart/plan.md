# Plano de Implementação — Adaptadores de borda da Hotmart (spec 022)

**Branch**: `022-adapter-hotmart` · **Spec**: [`spec.md`](./spec.md) · **Molde**: specs 019
(TMB), 020 (Asaas), 021 (Guru)

## Resumo

Borda de entrada das **duas contas Hotmart** (`HOTMART_PRD`, `HOTMART_SVC`). Funções **puras**
`parse*()` → `EventoCanonico` do `core`, **recebendo a `conta` como parâmetro**, testadas
contra **fixtures reais sem tocar o banco** (Princípio III). Vivem em
`src/ingestao/adapters/hotmart/`; **não importam `financeiro`/`clientes`**. O
`financeiro/domain/status-map/hotmart.ts` (`APPROVED`/`WAITING_PAYMENT`/`REFUNDED`/
`CHARGEBACK`/… → `StatusTransacaoCanonico`, compartilhado PRD/SVC e entre as 3 fontes) mora no
`financeiro` e é registrado via `Object.assign(MAPAS_STATUS, { HOTMART_PRD: HOTMART,
HOTMART_SVC: HOTMART })`.

**3 fontes:**
- **API `GET /payments/api/v1/sales/history`** — caminho corrente (a Hotmart **não tem
  webhook na v1**). OAuth2 `client_credentials` (token cacheado em memória por conta).
- **API `GET /payments/api/v1/sales/price/details`** — 2ª chamada de rede (H-02), paginada na
  mesma janela; merge por `transaction`; refina `valores.taxas` (`fee+vat`), o resto (`coupon`,
  `base`, `real_conversion_rate`) só no `payload_bruto`.
- **CSV** de export (texto no corpo JSON, 0 dep).
- **Webhook `PURCHASE_*` — stub desligado** (H-03): `parseWebhookHotmart` completo + testado;
  rotas `POST /webhooks/hotmart/{prd,svc}` autenticadas por `hottok`; guarda de flag
  `HOTMART_WEBHOOK_ENABLED` (default `false`) → **503** antes de qualquer processamento.

**Superfície HTTP fina**: 2 webhooks públicos por conta (desligados) + 2 endpoints
`POST /ingestao/hotmart/{sincronizar,importar-csv}` sob `evento:ingerir` (permissão já
existente). Todos são invólucros finos que só chamam `RegistrarEventoService.registrarEvento`
— o worker faz classificar → resolver pessoa (018) → upsert transação (018). **Nenhum `INSERT`
direto, nenhuma etapa nova** — `worker.service.ts` / `etapas.ts` /
`pipeline-wiring.module.ts` / `classificar.ts` / `schema.prisma` sem diff.

`HotmartApiClient` atrás de interface + token DI (`HOTMART_API_CLIENT`), impl com `fetch`
nativo do Node 24 (0 dep): OAuth2 `POST {oauthBase}/security/oauth/token` (Basic +
`grant_type=client_credentials`) com cache; `GET {base}/sales/{history,price/details}`
paginando por `page_token` cursor; sem credenciais → `HotmartApiIndisponivelError` →
`/sincronizar` responde **422**; janela > 365 dias → **422** no DTO.

**0 migração, 0 tabela, 0 dependência nova, 0 porta nova de aplicação, 0 permissão nova, 0
frontend.** Chaves `.env` novas (H-01/H-03): `HOTMART_{PRD,SVC}_CLIENT_{ID,SECRET}` (4,
opcionais) + `HOTMART_WEBHOOK_ENABLED` (1, default `false`). `CONTEXT_MODULES` segue **11**.

## Constitution Check (portão)

| Princípio | Como esta spec cumpre |
| --- | --- |
| **I — Modelar o domínio, não a origem** | Nenhuma regra de negócio conhece "Hotmart". O adapter só produz `EventoCanonico` (contrato do `core`). `id_origem` = `purchase.transaction` em coluna comum, nunca PK. |
| **II — Clarificar antes de assumir** | 3 decisões ambíguas (H-01 credenciais OAuth, H-02 2ª chamada de rede, H-03 escopo + webhook stub) levadas ao dono do produto em 2026-09-10. Demais = defaults documentados (H-04..H-20). Zero `NEEDS CLARIFICATION`. |
| **III — Bordas finas, núcleo canônico** | `parse*()` **puras**, sem banco/rede, testadas contra **fixtures reais** em `adapters/hotmart/fixtures/`. `status-map` justificado por fixture (SC-015). |
| **IV — Ingestão como log + projeções** | O adapter só chama `RegistrarEventoService.registrarEvento` (etapa 0). Evento cru imutável; projeção pelo worker. Nenhum `commit()` de remendo. |
| **V — Tudo agregado é derivado** | O adapter não agrega. `Dinheiro` por `{valorInt, moeda}` — moeda de `price.currency_code` (nunca soma moedas); `float` proibido. |
| **VI — Contextos delimitados** | `adapters/hotmart` importa só `core`. `status-map/hotmart.ts` mora no `financeiro`, não importa `ingestao`. ESLint `import/no-restricted-paths` + `grep` no e2e. |
| **VII — Curadoria ≠ derivação** | N/A — o adapter não escreve curadoria. |
| **VIII — Superfície de escrita mínima / sync sob demanda** | 2 webhooks (desligados) + 2 endpoints. **Nenhuma** sincronização automática — `POST /ingestao/hotmart/sincronizar` manual. 0 permissão nova. |

**Padrões transversais**: IDs (`purchase.transaction` fora da PK) ✅ · Dinheiro
(`Dinheiro.deDecimal`, ×10000, moeda de `price.currency_code` ?? `BRL`) ✅ · Tempo
(`ocorridoEm` string crua de epoch ms; `parseInstante` na etapa 3) ✅ · Status (`status-map` +
`mapearStatus` → `DESCONHECIDO`+revisar fora do mapa) ✅ · Idempotência (dedup por hash na
etapa 0) ✅ · Multi-conta (`HOTMART_PRD`/`HOTMART_SVC` em toda query) ✅ · Segredo
(`client_secret`/Basic/`access_token`/`hottok` nunca persistem — H-14) ✅.

**Veredito**: PASS. Nenhuma emenda à constituição. Nenhuma peça de stack trocada. As 5 chaves
`.env` novas são config (não segredo com default silencioso — opcionais, ausência → 422 claro
no `/sincronizar`, nunca crash) — mesmo tratamento de `CRM_DISPAROS_WORKER_*` (015).

## Testing

### Unitário (sem banco) — `src/ingestao/adapters/hotmart/*.spec.ts` + `financeiro/domain/status-map/hotmart.spec.ts`

- `normalizar-hotmart.spec.ts` — `dinheiroDeValorHotmart` (`134` → `1340000n`; `150.6` →
  `1506000n`; `"abc"`/`NaN`/`-5`/`1e3` → `undefined` + erro; moeda `USD` respeitada);
  `moedaDeHotmart` (`"brl"` → `BRL`; inválida → `undefined`); `taxasDe` (guarda `0 < taxa <
  bruto` + mesma moeda; moeda divergente → omite); `telefonesDeString` (código + número);
  `soDigitos`.
- `parse-venda-api.spec.ts` — contra `api-sales-history-pagina.json` (× `HOTMART_PRD`):
  campos mapeados; `commission_as: "AFFILIATE"` → `ehAfiliada: true`; `is_subscription: true`
  + `recurrency_number: 3` → `assinatura`; `detalhePreco` casado → `payload_bruto.price_details`
  + `valores.taxas` = `fee+vat`; `detalhePreco` ausente → sem erro; `price.currency_code`
  inválida → `BRL` + erro não-fatal; sem `purchase.transaction` → erro sem lançar; chave
  inédita ignorada.
- `parse-webhook.spec.ts` — contra `webhook-purchase-approved.json` / `-refunded` /
  `-affiliate` / `-subscription`: lê de `data.*`; `statusOrigem` = `data.purchase.status`
  (não o `event`); comprador rico de `data.buyer` (documento + telefone + endereço);
  **`payload_bruto` sem `hottok`** (se vier no corpo); array de 1 item; sem `transaction` →
  erro.
- `parse-linha-csv.spec.ts` — separador `;`; aspas; comprador montado; linha sem `transaction`
  → `erros: ["linha N: sem identificador de transação"]`; cabeçalho sem coluna de id → todas
  em erro, não lança; BOM.
- `hotmart-api-client.spec.ts` — dublê global de `fetch`: (1) 1º `fetch` = OAuth token →
  cacheado (2 chamadas de dados = 1 só POST de token); token expirado → renova; (2)
  `listarVendas`/`listarDetalhesPreco` montam a query certa (`start_date`/`end_date` em ms,
  `transaction_status`, `page_token`), header `Authorization: Bearer <access_token>`;
  paginação segue `page_info.next_page_token` e para quando ausente; credenciais ausentes →
  lança `HotmartApiIndisponivelError`.
- `status-map/hotmart.spec.ts` — cada `(fonte,bruto)` → canônico esperado, `revisar:false`;
  `('HOTMART_PRD','hotmart.api','APPROVED')===PAGO`;
  `('HOTMART_SVC','hotmart.webhook','REFUNDED')===ESTORNADO`; `'CHARGEBACK'===CHARGEBACK`;
  bruto inédito (`STARTED`) → `DESCONHECIDO`+`revisar`; não normaliza caixa (`approved` →
  revisar); varredura "toda chave de `VOCABULARIO` aparece em `status` de alguma fixture dos
  parsers".

### e2e backend — `backend/test/hotmart-adapter.e2e-spec.ts` (Postgres real, container isolado `pandora-db-spec022` na porta **55439**)

- **US1** — `sincronizar` com dublê de 2 páginas de `sales/history` encadeadas por cursor →
  `{paginas:2, recebidos, novos, dedup:0, erros:[]}`; `processar` → transações `HOTMART_PRD`
  com `status_canonico` traduzido; `APPROVED` → `PAGO` + `oferta.codigoOrigem`;
  `WAITING_PAYMENT` → `PENDENTE`.
- **US1 guard** — sem credenciais OAuth → 422, 0 evento; janela > 365 d → 422 (API não
  chamada); `conta` fora do enum → 422.
- **US2** — `sales/price/details` casado → `payload_bruto.price_details` + `valor_taxas` =
  `fee+vat`; venda sem detalhe → registrada, sem erro; `commission_as: "AFFILIATE"` →
  `VENDA_AFILIADA`; `is_subscription` + `recurrency_number: 3` → `RECORRENCIA`; re-disparo →
  `novos:0`; `status: "STARTED"` → `DESCONHECIDO` + `precisa_revisao` +
  `evento_origem.status=revisar`.
- **US2 refund** — `APPROVED` seguido de `PARTIALLY_REFUNDED` mesmo `transaction` → 2 eventos,
  **1** transação, `ESTORNADO` + `REEMBOLSO` (SC-004).
- **US3** — `importar-csv` 5 boas + 1 ruim → `{linhas:6, novos:5, ignoradas:1}`; 2º import →
  `novos:0`; separador `;`.
- **US4 webhook stub** — flag ausente → `POST /webhooks/hotmart/prd` (hottok válido) → **503**,
  `count(evento_origem)==0`. 2ª instância do app com `HOTMART_WEBHOOK_ENABLED=true` → o mesmo
  POST → **200**, 1 `evento_origem` `hotmart.webhook`; `processar` → `PAGO`; `hottok` errado →
  **401**, 0 evento.
- **Segredo** — `grep` de `client_secret` / Basic / `access_token` / `hottok` no
  `evento_origem` = 0 (SC-010).
- **SC-016** — evento `HOTMART_PRD` e `HOTMART_SVC` para o mesmo `transaction` → 2 transações
  distintas.
- **Fronteira** — `grep` de `financeiro`/`clientes` em `adapters/hotmart` = 0; `grep` de
  `ingestao` em `status-map` = 0.
- **Regressão** — `/admin/rbac/permissoes` sem permissão nova; `/health` = 11; `git diff` sem
  tocar `worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts`/`classificar.ts`/`schema.prisma`.
- **Suíte 003–021 completa** verde contra o Postgres isolado (`55439`).

## Fases (ver `tasks.md`)

A. Fixtures reais → B. Helpers de normalização + parsers puros → C. `HotmartApiClient`
(OAuth2 + cursor) → D. `status-map/hotmart.ts` → E. DTOs + services + controllers finos
(incl. webhook stub) → F. Wiring do módulo + `env.schema` + `.env.example` + `setup-db.ts` →
G. e2e → H. Qualidade (lint/typecheck/build) + docs (`docs/022`, CLAUDE.md, README, ROADMAP,
status-map/README).
