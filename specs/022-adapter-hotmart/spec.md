# Feature Specification: Adaptadores de borda da plataforma Hotmart

**Feature Branch**: `022-adapter-hotmart`

**Created**: 2026-09-10

**Status**: Draft

**Input**: ROADMAP.md Fase 2 (Financeiro), item 022 — "Adapters Hotmart (contas PRD e SVC):
OAuth2 client_credentials, API `GET /sales/history` + `GET /sales/price/details`, CSV.
`is_subscription` no payload. Sem webhook na v1 (adapter `hotmart/webhook` previsto para
feature futura). `status_map/hotmart/api`. Sem frontend."

---

## Contexto

**Quarta e última** das 4 specs de adaptadores da Fase 2 (019 TMB ✅, 020 Asaas ✅, 021 Guru
✅, **022 Hotmart**). Molde direto das 019/020/021: a spec 006 montou o pipeline canônico e
deixou a **etapa 0** (`RegistrarEventoService.registrarEvento`) como porta exportada "que os
adapters das specs 019–022 vão injetar"; a spec 018 plugou as **etapas 2–3**
(`RESOLVER_PESSOA`, `UPSERT_TRANSACAO`) e deixou `financeiro/domain/status-map/` para "cada
spec 019–022 adicionar um `status-map/{tmb,asaas,guru,hotmart}.ts` e registrar em
`MAPAS_STATUS`". As 019/020/021 já seguiram esse passo-a-passo (ver `status-map/README.md`).

Esta spec faz a borda de entrada das **duas contas Hotmart** — `HOTMART_PRD` e `HOTMART_SVC`
(`PlataformaOrigem`, enum de 7 contas do `core`) — transformando os payloads crus das fontes
da Hotmart (API `GET /payments/api/v1/sales/history` + `GET /payments/api/v1/sales/price/details`,
CSV de export, e — **stub para feature futura** — webhook de compras `PURCHASE_*`) em
`EventoCanonico` e populando o vocabulário de status da Hotmart. Nenhuma regra de negócio
conhece "Hotmart": o núcleo continua canônico, a borda é fina e testada contra **fixtures
reais** sem tocar o banco (Princípio III). Depois do parse, o fluxo é idêntico: worker da
006 → classificar → resolver pessoa → upsert transação.

A Hotmart é um **marketplace de infoproduto** (visão Apêndice A). Particularidades que a
modelagem canônica precisa absorver:

- **Sem webhook na v1.** A Hotmart não tem webhook ativo na operação da AEN; a política
  (visão Parte 7, decisão 2026-09-01) é "webhook da Hotmart será ativado, mas **não na v1**".
  Esta spec **entrega o esqueleto** (`adapters/hotmart/parse-webhook.ts` + rotas
  `POST /webhooks/hotmart/{prd,svc}` autenticadas por `hottok`) **desligado por padrão**
  (flag `HOTMART_WEBHOOK_ENABLED`, default `false` → **503**), para a feature futura só ligar
  o flag. O parser do webhook é **completo e testado** contra fixture — o que fica desligado
  é a rota HTTP, não o código.
- **OAuth2 `client_credentials`.** Diferente das outras 3 plataformas (token estático), a
  Hotmart exige troca de `client_id` + `client_secret` + token **Basic** por um
  `access_token` de vida curta em `POST https://api-sec-vlc.hotmart.com/security/oauth/token`.
  O `HotmartApiClient` faz essa troca, **cacheia o token em memória** por conta até
  `expires_in − folga`, e o injeta como `Authorization: Bearer` nas chamadas de dados.
- **`is_subscription` / `recurrency_number`.** `sales/history` traz `purchase.is_subscription`
  e `purchase.recurrency_number` → `assinatura.ehRecorrencia` / `assinatura.numeroCiclo` →
  `classificar` (006) resolve `RECORRENCIA` para ciclos > 1.
- **Papel de afiliada.** `sales/history` traz `purchase.commission_as` ∈ `PRODUCER` |
  `COPRODUCER` | `AFFILIATE`. `AFFILIATE` → `ehAfiliada = true` → `classificar` resolve
  `VENDA_AFILIADA` (venda "só para registro" — Regra Inviolável nº 8: nunca gera Oferta /
  Contrato / Cliente novo).
- **Moeda sempre exposta.** `purchase.price.currency_code` (API) / `purchase.price.currency_value`
  (webhook) / coluna `moeda` (CSV) — ISO 4217. Ausente/inválida → `BRL` cravado (default
  explícito — `moeda` nunca opcional).
- **Detalhamento de preço é 2ª chamada.** `GET /sales/price/details` (paginado pela mesma
  janela) traz `base`, `total`, `vat`, `fee`, `coupon`, `real_conversion_rate`. A
  sincronização pagina **os dois recursos** e faz **merge por `transaction`** — `vat` + `fee`
  refinam `valores.taxas`; `coupon` / `base` / `real_conversion_rate` **não têm slot
  canônico** nesta fatia → ficam só no `payload_bruto` (mesmo tratamento de cupom/garantia
  da Guru/021). O import CSV e o webhook **não** têm essa 2ª fonte — `sales/history` (ou a
  linha do CSV, ou o corpo do webhook) sozinho já monta um `EventoCanonico` válido.
- **`price.code` de catálogo é da spec 023.** `purchase.offer.code` → `oferta.codigoOrigem`
  (código cru transportado); a resolução `(tag AEN, plataforma)` e o import de catálogo
  Hotmart (4 CSVs, `price.code` completo) são da **spec 023**.
- **Comprador.** API `sales/history`: `buyer.name` + `buyer.email` (só isso — sem documento/
  telefone). Webhook `PURCHASE_*`: `data.buyer` rico (nome, e-mail, `document`,
  `checkout_phone` + `checkout_phone_code`, `address.*`). CSV: colunas de comprador.

## Clarifications

*022 não está marcada `⚠ clarify` no ROADMAP. As 3 decisões de fato ambíguas foram levadas
ao dono do produto em 2026-09-10 (H-01, H-02, H-03 abaixo). As demais (H-04..H-20) são
**defaults documentados** — mesmo tratamento das specs 010/017/018/019/020/021. Zero
`NEEDS CLARIFICATION` remanescente.*

- **H-01 — Credenciais OAuth2: chaves `.env` novas dedicadas** (dono do produto, 2026-09-10).
  O bloco `accountConfig` (3 slots por conta) não comporta OAuth2 sem gambiarra. Adicionam-se
  **`HOTMART_PRD_CLIENT_ID` / `HOTMART_PRD_CLIENT_SECRET` / `HOTMART_SVC_CLIENT_ID` /
  `HOTMART_SVC_CLIENT_SECRET`** ao `env.schema` (opcionais em todo `NODE_ENV`, como as chaves
  de conta). `HOTMART_<conta>_API_KEY` guarda o **token Basic** (a Hotmart entrega essa
  string no painel do dev); `HOTMART_<conta>_API_BASE_URL` guarda a base da API de dados
  (default `https://developers.hotmart.com/payments/api/v1`); `HOTMART_<conta>_WEBHOOK_TOKEN`
  guarda o `hottok` da conta (usado pelo webhook stub). Chave nova de flag:
  **`HOTMART_WEBHOOK_ENABLED`** (default `false`).
- **H-02 — `GET /sales/price/details` entra como 2ª chamada de rede** (dono do produto,
  2026-09-10). `POST /ingestao/hotmart/sincronizar` pagina `sales/history` **e**
  `sales/price/details` na mesma janela e faz `merge` por `transaction` antes de registrar.
  `HotmartApiClient` tem 2 métodos (`listarVendas`, `listarDetalhesPreco`). Detalhe de preço
  faltando para uma transação **não** é erro — o evento é montado só com `sales/history`.
- **H-03 — Escopo: parsers puros + endpoints finos `/ingestao/hotmart/*` + webhook stub
  desligado** (dono do produto, 2026-09-10). Entrega:
  - **`POST /ingestao/hotmart/sincronizar`** (autenticado, `evento:ingerir`) —
    `{ conta, dataInicio, dataFinal, transactionStatus? }`; OAuth2 → pagina os 2 recursos por
    `page_token` (cursor) → merge → registra.
  - **`POST /ingestao/hotmart/importar-csv`** (autenticado, `evento:ingerir`) —
    `{ conta, conteudo }`; CSV como **texto no corpo JSON**, **0 dependência nova** de upload
    binário (mesmo padrão das specs 015/019/020/021).
  - **`POST /webhooks/hotmart/prd` e `POST /webhooks/hotmart/svc`** — rotas **públicas**
    (prefixo `/webhooks/` já é allowlist da 003), autenticadas por `hottok`
    (`HOTMART_<conta>_WEBHOOK_TOKEN` via `WebhookAuthenticator`, header `x-hotmart-hottok` |
    `authorization: Bearer`). **Desligadas por padrão**: `HOTMART_WEBHOOK_ENABLED=false` →
    **503** (`{ message: "webhook Hotmart não habilitado nesta versão" }`), **0 evento**.
    `=true` → comportamento pleno (autentica → parseia → registra → **200**). O parser
    `parseWebhookHotmart` é completo e coberto por fixture nos testes unitários independente
    do flag.

  A superfície `admin/` completa (curadoria, import de catálogo) fica para as specs 023 /
  migração. **Sem frontend** (os eventos aparecem no painel **Eventos** / 006, as transações
  em **Financeiro · Transações** / 018 sem mudança de frontend).
- **H-04 — Chave natural `id_origem` = `purchase.transaction`** (ex.: `"HP17715690036014"`),
  presente nas 3 fontes reais (API `items[].purchase.transaction`, webhook
  `data.purchase.transaction`, CSV coluna `transacao`/`transaction`/`codigo`). É **por
  conta**: só único dentro de `(HOTMART_PRD | HOTMART_SVC, transaction)` — a
  `PlataformaOrigem` desambigua (Padrão Transversal "Multi-conta"). Os N estados de uma venda
  (`PRINTED_BILLET` → `APPROVED` → `REFUNDED`…) resolvem para a **mesma** `(<conta>,
  <transaction>)`; o `UPSERT_TRANSACAO` (018) mantém 1 linha, último evento vence (Regra
  Inviolável nº 1 por construção). Cada recorrência de assinatura tem `transaction` **própria**
  (`recurrency_number` incrementa) → 1 `evento_origem` / 1 `transacao` por ciclo.
- **H-05 — `statusOrigem` = `purchase.status` cru** (`APPROVED`, `WAITING_PAYMENT`,
  `REFUNDED`, `CHARGEBACK`, `CANCELLED`, `PRINTED_BILLET`…). Sem ajuste sintético. O `event`
  do webhook (`PURCHASE_APPROVED`…) fica só no `payload_bruto` — o `status` interno é a fonte
  canônica.
- **H-06 — `tipoOrigem` = o rótulo da fonte, e é a chave `fonte` do `status-map`.** Convenção
  congelada: `hotmart.webhook`, `hotmart.api`, `hotmart.csv`. `mapearStatus(plataforma,
  fonte, bruto)` (018) recebe `plataforma = "HOTMART_PRD"` ou `"HOTMART_SVC"` e
  `fonte = tipoOrigem`; `MAPAS_STATUS.HOTMART_PRD` e `MAPAS_STATUS.HOTMART_SVC` apontam para
  o **mesmo** objeto `HOTMART` via `Object.assign(MAPAS_STATUS, { HOTMART_PRD: HOTMART,
  HOTMART_SVC: HOTMART })`.
- **H-07 — Onde vive o adapter.** `src/ingestao/adapters/hotmart/` (visão Apêndice C). As
  `parse*()` são **puras**, sem NestJS, sem Prisma, sem `fetch` — recebem o payload/linha já
  desserializado **+ a `conta`** (+ opcionalmente o detalhe de preço já casado) e devolvem
  `{ eventoCanonico?, idOrigem?, tipoOrigem, payloadBruto, erros[] }`. Ficam dentro do
  `ingestao`; **não** importam `financeiro` (o `status-map/hotmart.ts` vive em `financeiro/` e
  é consumido lá pela etapa 3) nem `clientes`.
- **H-08 — `HotmartApiClient` (OAuth2 + cursor).** Interface + token DI (`HOTMART_API_CLIENT`),
  impl real com **`fetch` nativo do Node 24** (0 dep — padrão `TmbApiClient`/019,
  `AsaasApiClient`/020, `GuruApiClient`/021). (1) `garantirToken(conta)`: `POST
  {oauthBase}/security/oauth/token?grant_type=client_credentials&client_id=…&client_secret=…`
  com header `Authorization: Basic <API_KEY>`; cacheia `{ access_token, expiraEm }` em memória
  por conta; renova quando `agora >= expiraEm − 60s`. (2) `listarVendas` / `listarDetalhesPreco`:
  `GET {base}/sales/history` (ou `/sales/price/details`) `?start_date=<ms>&end_date=<ms>
  [&transaction_status=…][&max_results=…][&page_token=…]`, header `Authorization: Bearer
  <access_token>` + `Accept`. Paginação por **cursor** (`page_info.next_page_token` enquanto
  presente), até `MAX_PAGINAS` de segurança. `HOTMART_<conta>_CLIENT_ID`/`_CLIENT_SECRET`/
  `_API_KEY` ausente → `HotmartApiIndisponivelError` → `/sincronizar` responde **422** (não
  500). Janela obrigatória; período > 365 dias → **422** no DTO (validação de borda, não
  chamada à API) — guarda contra o `502` de query lenta da Hotmart.
- **H-09 — Webhooks/endpoints finos e resilientes** (idêntico à 019/020/021). Cada
  webhook/endpoint: (1) autentica; (2) desserializa; (3) chama a `parse*()`; (4) chama
  `RegistrarEventoService.registrarEvento` com o `payloadBruto` **sempre** e o
  `eventoCanonico` **só se o parse não acumulou erro fatal**; (5) responde **`200 OK`** com
  `{ registrados, ignorados, ... }`. Falha de persistência (etapa 0) → **5xx** (a origem
  reenvia). Erro de **parse** MUST NOT virar 5xx/4xx — o evento cru é persistido,
  `evento_canonico` fica nulo, e `classificar` marca `revisar` — nada some.
- **H-10 — Payload/linha sem `transaction`** (evento não-compra que a Hotmart mande para a
  mesma URL no futuro, ou lixo, ou linha de CSV vazia): sem identidade não há dedup nem
  projeção → conta em `ignorados`, é **logado**, e **não** é registrado. `{ registrados: 0,
  ignorados: n }`, resposta `200`.
- **H-11 — Mapa de valores monetários.** `valores.bruto` = `purchase.price.value` (API/
  webhook) / coluna `valor`/`valor_bruto` (CSV). `valores.taxas` = `purchase.hotmart_fee.total`
  (API) **quando** numérica e `0 < taxa < bruto` e **mesma moeda**; senão, quando há detalhe
  de preço casado, `fee.value + vat.value` sob a mesma guarda; senão omitido. `valores.liquido`
  = `bruto − taxas` sob a mesma guarda, senão omitido. Conversão via escala ×10000 do `core`
  (`Dinheiro.deDecimal`); `float` proibido no resultado. `moeda` = `purchase.price.currency_code`
  (API) / `.currency_value` (webhook) / coluna `moeda` (CSV) ?? `"BRL"`. `full_price`,
  `original_offer_price`, `commissions[]`, `coupon`, `base`, `real_conversion_rate`,
  `installments_number` ficam **só no `payload_bruto`**.
- **H-12 — O adapter não classifica.** `EventoCanonico.classificacao` fica indefinido; a
  etapa 1 resolve — `status = "REFUNDED"`/`"PARTIALLY_REFUNDED"`/`"CHARGEBACK"` casa o regex
  de estorno de `classificar` (006) e vira `REEMBOLSO`; `ehAfiliada === true` →
  `VENDA_AFILIADA`; `assinatura.ehRecorrencia` com `numeroCiclo > 1` → `RECORRENCIA`; o resto
  é `VENDA_PROPRIA`. **Nenhuma mudança em `classificar.ts` nesta spec** (o `RE_ESTORNO` já
  cobre `refund` / `chargeback` / `charge_back` / `devolu` / `reembols` / `estorn[oa]` —
  `REFUNDED`, `PARTIALLY_REFUNDED`, `CHARGEBACK` casam; `PROTESTED`/`DISPUTE` não casam o
  regex mas o `status-map` traduz para `CHARGEBACK`/`ESTORNADO` e o `status_canonico` já
  impede a soma como receita).
- **H-13 — `ocorridoEm`.** API/webhook: `purchase.approved_date` ?? `purchase.order_date`
  (epoch ms — `String(...)`, `parseInstante` do `core` tolera epoch pelo limiar `1e11`). CSV:
  `data_aprovacao` ?? `data_pedido` ?? `data_criacao`. O parser **não** chama `parseInstante`
  — passa a string crua; a etapa 3 (018) a aplica.
- **H-14 — Segredo nunca persiste.** OAuth2 é troca de rede — `client_secret` / Basic /
  `access_token` **nunca** entram em `payload_bruto`, log de evento ou resposta HTTP. O
  webhook stub **não** carrega `hottok` no corpo (a Hotmart o manda no **header**
  `X-HOTMART-HOTTOK`); ainda assim o parser remove uma eventual chave `hottok` do corpo por
  defesa (mesmo cuidado do `api_token` da Guru/G-14). Um teste e2e faz `grep` = 0 no
  `evento_origem`.
- **H-15 — RBAC: nenhuma permissão nova.** Webhooks são `@Public()` (prefixo `/webhooks/`).
  `POST /ingestao/hotmart/*` reusam `evento:ingerir` (catálogo desde a 006). **0 migração de
  dados/seed.**
- **H-16 — Config.** `HOTMART_PRD_*` / `HOTMART_SVC_*` de conta (`_API_BASE_URL`, `_API_KEY`,
  `_WEBHOOK_TOKEN`) **já existem** no `env.schema` como `accountConfig` (spec 001/003). Esta
  spec **acrescenta** 4 chaves OAuth (`HOTMART_{PRD,SVC}_CLIENT_{ID,SECRET}`) + 1 flag
  (`HOTMART_WEBHOOK_ENABLED`) ao schema e ao `.env.example`.
- **H-17 — Vocabulário de status.** `hotmart.webhook` == `hotmart.api` == `hotmart.csv` (o
  CSV espelha o enum da API — Assumption). Ver `research.md` §D-R10 para a tabela completa.
  Valores ambíguos para a operação da AEN (`STARTED`, `PRE_ORDER`) ficam **fora do mapa de
  propósito** → caem em `DESCONHECIDO` + revisão até uma fixture real aparecer (mesmo
  precedente do `AUTHORIZED` da Asaas / `trial` da Guru).
- **H-18 — Sem migração, sem tabela, `CONTEXT_MODULES` = 11.** O adapter é subdiretório do
  `ingestao`. `evento_origem`/`evento_etapa`/`transacao` já existem (006/018).
- **H-19 — Datas na API são epoch ms.** `start_date` / `end_date` da Hotmart são
  milissegundos desde 1970-01-01 UTC. O DTO recebe `YYYY-MM-DD` (borda amigável) e o
  `HotmartApiClient` converte para ms (`Date.parse(`${d}T00:00:00Z`)`).
- **H-20 — `max_results`.** Default da Hotmart varia por endpoint; o client pede
  `max_results=500` (teto comum) e segue o `next_page_token`. Nunca depende de
  `total_results`.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sincronização de vendas por API vira transação (Priority: P1)

A equipe dispara `POST /ingestao/hotmart/sincronizar` com `{ conta, dataInicio, dataFinal }`.
O sistema faz OAuth2 `client_credentials`, pagina `GET /sales/history` **por cursor**
(`next_page_token`), registra cada compra como evento `hotmart.api`, e o worker projeta uma
`transacao` `(HOTMART_PRD, <purchase.transaction>)` com valor na moeda de
`purchase.price.currency_code`, `status_canonico` traduzido, `oferta.codigoOrigem` de
`purchase.offer.code` e o `comprador` de `buyer`.

**Why this priority**: a Hotmart **não tem webhook na v1** — a API sob demanda é o **único**
caminho de entrada corrente. Sem ela não há ledger das contas Hotmart.

**Independent Test**: com um `HotmartApiClient` dublê devolvendo 2 páginas de `sales/history`
encadeadas por `next_page_token` → `POST /ingestao/hotmart/sincronizar { conta: "HOTMART_PRD",
dataInicio, dataFinal }` → `POST /ingestao/eventos/processar` → `GET /financeiro/transacoes`
mostra N transações `HOTMART_PRD` com `status_canonico` traduzido e `classificacao` derivada.

**Acceptance Scenarios**:

1. **Given** `HOTMART_PRD_CLIENT_ID`/`_CLIENT_SECRET`/`_API_KEY` configurados e a API
   devolvendo 2 páginas (a 1ª com `next_page_token`, a 2ª sem), **When**
   `POST /ingestao/hotmart/sincronizar { conta: "HOTMART_PRD", dataInicio, dataFinal }`,
   **Then** N `evento_origem` `HOTMART_PRD` / `hotmart.api` e resposta `{ paginas: 2,
   recebidos: N, novos: N, dedup: 0, erros: [] }`.
2. **Given** o evento de uma compra `APPROVED`, **When** o worker processa a passada, **Then**
   existe `transacao` com `plataforma_origem = HOTMART_PRD`,
   `id_origem = "<purchase.transaction>"`, `status_canonico = PAGO`,
   `valor_bruto = { valorInt, moeda }` da `price.currency_code`, `oferta` com
   `codigoOrigem = "<purchase.offer.code>"`, e a etapa `UPSERT_TRANSACAO` está `ok`.
3. **Given** uma compra `WAITING_PAYMENT`, **When** processada, **Then**
   `transacao.status_canonico = PENDENTE`.
4. **Given** uma compra `PARTIALLY_REFUNDED` para o mesmo `transaction` de uma `APPROVED`
   anterior, **When** as duas são processadas, **Then** **1** `transacao`,
   `status_canonico` final `ESTORNADO`, `classificacao = REEMBOLSO` (Regra Inviolável nº 1).
5. **Given** `HOTMART_PRD_CLIENT_ID` ausente, **When**
   `POST /ingestao/hotmart/sincronizar { conta: "HOTMART_PRD", ... }`, **Then** resposta
   **422** (`conta HOTMART_PRD sem API configurada`) e nenhum evento.
6. **Given** um período `dataInicio`..`dataFinal` **maior que 365 dias**, **When** recebido,
   **Then** **422** — sem chamar a API. **Given** `{ conta: "HOTMART_XYZ" }` → **422** no DTO.

---

### User Story 2 — Merge com detalhamento de preço, afiliada e assinatura (Priority: P1)

A sincronização pagina também `GET /sales/price/details` na mesma janela e casa por
`transaction`: `vat` + `fee` refinam `valores.taxas`; `coupon` / `base` /
`real_conversion_rate` entram no `payload_bruto`. Uma compra em que a AEN é **afiliada**
(`commission_as = "AFFILIATE"`) → `ehAfiliada = true` → `VENDA_AFILIADA`. Uma compra de
assinatura (`is_subscription = true`, `recurrency_number = 3`) →
`assinatura = { ehRecorrencia: true, numeroCiclo: 3 }` → `RECORRENCIA`.

**Why this priority**: materializa a Regra Inviolável nº 8 (afiliada), o tratamento de
recorrência, e a decisão H-02 (2ª chamada de rede) no ponto de entrada.

**Independent Test**: dublê com 1 página de `sales/history` + 1 página de
`sales/price/details` cobrindo a mesma `transaction` → após `processar`, o `payload_bruto` do
evento contém `price_details` com `coupon`, e `transacao.valor_taxas` reflete `fee + vat`
quando sãos.

**Acceptance Scenarios**:

1. **Given** `sales/history` com a transação `T1` e `sales/price/details` com `T1` trazendo
   `coupon.code = "ABC"` e `vat.value`/`fee.value` na moeda do bruto, **When** sincronizado
   e processado, **Then** o `payload_bruto` do evento tem `price_details.coupon.code = "ABC"`
   e `transacao.valor_taxas = fee + vat` (guarda `0 < taxa < bruto`).
2. **Given** `sales/price/details` **não** cobre `T2` (só `sales/history` traz `T2`), **When**
   sincronizado, **Then** o evento de `T2` é registrado normalmente, `valores` só do
   `sales/history`, **sem** erro.
3. **Given** uma compra com `commission_as = "AFFILIATE"`, **When** processada, **Then**
   `evento_canonico.ehAfiliada === true` e `transacao.classificacao = VENDA_AFILIADA`.
4. **Given** uma compra com `is_subscription = true` e `recurrency_number = 3`, **When**
   processada, **Then** `evento_canonico.assinatura = { ehRecorrencia: true, numeroCiclo: 3 }`
   e `transacao.classificacao = RECORRENCIA`.
5. **Given** re-disparar a mesma janela, **When** roda de novo, **Then** `novos: 0`,
   `dedup: N` — nenhum evento nem transação duplicada (idempotência por hash na etapa 0).
6. **Given** uma compra com `status` fora do vocabulário mapeado (`STARTED`), **When**
   processada, **Then** `transacao.status_canonico = DESCONHECIDO`, `precisa_revisao = true`,
   `evento_origem.status = revisar`.

---

### User Story 3 — Import de CSV (Priority: P2)

A equipe cola o conteúdo de um export CSV de vendas da Hotmart em
`POST /ingestao/hotmart/importar-csv` com a `conta`; cada linha vira um evento `hotmart.csv`.
Linhas malformadas são reportadas sem abortar o lote.

**Why this priority**: caminho de migração/backfill (visão Parte 6). Útil, não bloqueia a
operação corrente.

**Independent Test**: um CSV com 5 linhas boas + 1 linha sem `transaction` → `{ linhas: 6,
novos: 5, ignoradas: 1, erros: [...] }`; 2º import do mesmo conteúdo → `novos: 0`.

**Acceptance Scenarios**:

1. **Given** um CSV válido da Hotmart com cabeçalho e 5 linhas, **When** `POST
   /ingestao/hotmart/importar-csv { conta, conteudo }`, **Then** 5 `evento_origem` `<conta>` /
   `hotmart.csv` e a resposta resume `{ linhas: 5, novos: 5, ignoradas: 0 }`.
2. **Given** o mesmo CSV 2 vezes, **When** o 2º import roda, **Then** `novos: 0`, `dedup: 5`.
3. **Given** uma linha sem `transaction`, **When** o import roda, **Then** essa linha entra
   em `ignoradas`, as demais são processadas, e o erro é listado com o número da linha.
4. **Given** um separador `;` em vez de `,` (comum em export BR), **When** o import roda,
   **Then** o parser detecta o separador e processa as linhas corretamente.

---

### User Story 4 — Webhook stub desligado / ligável (Priority: P3)

O esqueleto do webhook de compras `PURCHASE_*` da Hotmart existe (rotas + parser completo)
mas fica **desligado por padrão** (`HOTMART_WEBHOOK_ENABLED=false` → **503**). Uma feature
futura liga o flag e o caminho funciona: autentica `hottok` → registra evento `hotmart.webhook`
→ worker projeta transação.

**Why this priority**: a política do dono do produto é "ativar o webhook, mas não na v1". O
esqueleto pronto e testado torna a ativação futura trivial.

**Independent Test**: com `HOTMART_WEBHOOK_ENABLED` ausente/`false` → `POST /webhooks/hotmart/prd`
(com `hottok` válido) responde **503**, `0` evento. Subindo uma 2ª instância do app com
`HOTMART_WEBHOOK_ENABLED=true` → o mesmo POST responde **200** e cria 1 `evento_origem`
`HOTMART_PRD` / `hotmart.webhook`; `hottok` errado → **401**.

**Acceptance Scenarios**:

1. **Given** o flag desligado (default), **When** `POST /webhooks/hotmart/prd` com `hottok`
   válido, **Then** **503** e `count(evento_origem) == 0`.
2. **Given** o flag ligado, **When** `POST /webhooks/hotmart/prd` com uma fixture de
   `PURCHASE_APPROVED` e `X-HOTMART-HOTTOK` correto, **Then** **200**, existe um `evento_origem`
   `HOTMART_PRD` / `hotmart.webhook` com `payload_bruto` **sem** `hottok` e `evento_canonico`
   preenchido; após `processar`, `transacao.status_canonico = PAGO`.
3. **Given** o flag ligado e `hottok` ausente/errado/da outra conta, **When** o POST chega,
   **Then** **401**, **nenhum** `evento_origem`.
4. **Given** o parser `parseWebhookHotmart` (teste unitário, sem flag), **When** recebe uma
   fixture `PURCHASE_REFUNDED`, **Then** `statusOrigem = "REFUNDED"`, `idOrigem` = a
   `transaction`, `comprador` do `data.buyer` rico.

---

### Edge Cases

- **Payload com atributo novo não tratado**: o parser **ignora** campos desconhecidos — nunca
  lança por chave a mais. O `payload_bruto` guarda tudo (menos segredo).
- **`price.currency_code` inválida / ausente**: a borda usa `"BRL"`; a moeda inválida é
  logada em `erros` (não-fatal).
- **`hotmart_fee` em moeda diferente do `price`** (a doc mostra esse caso): a guarda de
  sanidade descarta a taxa (moedas diferentes) — `valores.taxas` fica omitido, sem erro.
- **`buyer` ausente/vazio** (comprador não liberou dados): `comprador` fica vazio;
  `RESOLVER_PESSOA` (018) tolera.
- **`sales/price/details` devolve `transaction` que não está no `sales/history` da janela**:
  o detalhe órfão é **ignorado** (nada a casar); não vira evento.
- **CSV com BOM / encoding Latin-1**: o corpo chega como texto já decodificado; o parser
  tolera BOM inicial.
- **Dois eventos idênticos** (reprocesso): geram o **mesmo** hash → o 2º é dedup na etapa 0.
- **`conta` do path (`prd`/`svc`) / do DTO fixa o `plataforma_origem`** — o payload nunca
  altera a conta.
- **OAuth2 token expira no meio da paginação**: `HotmartApiClient` renova transparentemente
  quando `agora >= expiraEm − 60s`; a paginação não quebra.
- **API responde `502` (query lenta)**: a página falha, as anteriores **já foram
  registradas** (commit por página), a resposta informa o erro parcial, re-disparar é
  idempotente.

---

## Requirements *(mandatory)*

### Functional Requirements

**Parsers puros (as fontes)**

- **FR-001**: O sistema MUST prover `parseVendaApi(item, conta, detalhePreco?) →
  ResultadoParseHotmart` puro (sem NestJS/Prisma/rede) para um item de `GET
  /payments/api/v1/sales/history`, com `plataformaOrigem = conta`,
  `idOrigem = String(item.purchase.transaction)`, `tipoOrigem = "hotmart.api"`,
  `statusOrigem = String(item.purchase.status)` (cru), `ocorridoEm` conforme H-13, `valores`
  conforme H-11 (incorporando `detalhePreco` quando presente), `comprador` de `item.buyer`,
  `oferta` de `item.purchase.offer` / `item.product`, `assinatura` sse
  `item.purchase.is_subscription`, `ehAfiliada = true` sse `commission_as === "AFFILIATE"`.
- **FR-002**: O sistema MUST prover `parseWebhookHotmart(payload, conta) →
  ResultadoParseHotmart[]` puro para o corpo de um webhook `PURCHASE_*` da Hotmart
  (`{ id, event, version, creation_date, data: { product, buyer, purchase, subscription, ... } }`),
  com `tipoOrigem = "hotmart.webhook"`, o mesmo mapeamento canônico da FR-001 lendo de
  `data.*`, e removendo uma eventual chave `hottok` do `payloadBruto`. Aceita um objeto e,
  defensivamente, um array.
- **FR-003**: O sistema MUST prover `parseCsvHotmart(conteudo, conta) → ResultadoParseHotmart[]`
  puro, com `tipoOrigem = "hotmart.csv"`, tolerante a separador `,` e `;` (detecção pelo
  cabeçalho), a BOM inicial e a aspas; mapeia `transaction`, `status`, `valor`/`valor_bruto`,
  `valor_liquido`, `taxa`, `moeda`, `data_pedido`, `data_aprovacao`, `data_criacao`, `oferta`,
  `codigo_oferta`, `assinatura`, `ciclo`, `comissao`/`tipo`, e os campos de comprador.
- **FR-004**: Todo parser MUST devolver `{ eventoCanonico?, idOrigem?, tipoOrigem,
  payloadBruto, erros: string[] }`. Sem `transaction` → `eventoCanonico` ausente + erro
  descritivo (nunca lança). Campo desconhecido no payload → **ignorado** (nunca erro).
- **FR-005**: Nenhum parser MUST tocar o banco, fazer I/O ou depender de locale/fuso do
  processo. `Dinheiro`/`Moeda` do `core` e utilitários locais de string são as únicas
  dependências; `parseInstante` **não** é chamado no parser.
- **FR-006**: Todo parser MUST ser exercido por teste unitário contra **fixtures reais** da
  Hotmart em `src/ingestao/adapters/hotmart/fixtures/` (Princípio III). As fixtures NÃO
  contêm PII real.
- **FR-007**: Os parsers MUST aceitar a `conta` (`HOTMART_PRD` | `HOTMART_SVC`) como
  parâmetro e cravá-la em `plataformaOrigem` — o payload da Hotmart nunca a determina.
- **FR-008**: `parseWebhookHotmart` MUST remover a chave `hottok` do `payloadBruto` que
  devolve (defesa — o `hottok` real vem no header, mas nunca deve persistir se vier no corpo).

**Sincronização por API (OAuth2 + merge)**

- **FR-009**: O sistema MUST prover um `HotmartApiClient` atrás de uma interface (dublê nos
  testes), usando **`fetch` nativo do Node 24** (0 dep nova), que: (a) troca
  `client_id`/`client_secret` + Basic por `access_token` em `POST {oauthBase}/security/oauth/token`
  e o **cacheia em memória por conta** até `expires_in − 60s`; (b) expõe `listarVendas` e
  `listarDetalhesPreco`, ambos paginando `GET {base}/sales/{history,price/details}` por
  `page_token` cursor (`page_info.next_page_token`), com `start_date`/`end_date` em epoch ms e
  `transaction_status` opcional.
- **FR-010**: `POST /ingestao/hotmart/sincronizar` (autenticado, `evento:ingerir`) MUST
  aceitar `{ conta: "HOTMART_PRD" | "HOTMART_SVC", dataInicio, dataFinal, transactionStatus? }`,
  validar que a janela `dataInicio..dataFinal` **não passa de 365 dias** (→ 422), paginar
  `listarVendas` **e** `listarDetalhesPreco`, casar por `transaction` (merge), `parseVendaApi`
  cada item, registrar via `RegistrarEventoService`, e devolver `{ conta, paginas,
  paginasDetalhePreco, recebidos, novos, dedup, ignorados, erros[] }`. Commit por página de
  vendas.
- **FR-011**: Se `HOTMART_<conta>_CLIENT_ID`/`_CLIENT_SECRET`/`_API_KEY` não estiverem
  configurados, `POST /ingestao/hotmart/sincronizar` MUST responder **422** com motivo claro —
  nunca 500.
- **FR-012**: A sincronização MUST ser idempotente por hash: re-disparar a mesma janela não
  cria eventos nem transações duplicadas.
- **FR-013**: Um `detalhePreco` faltando para uma `transaction` de `sales/history` MUST NOT
  ser erro — o evento é montado só com `sales/history`. Um `detalhePreco` **órfão** (sem
  venda correspondente) MUST ser ignorado.

**Import CSV**

- **FR-014**: `POST /ingestao/hotmart/importar-csv` (autenticado, `evento:ingerir`) MUST
  aceitar `{ conta, conteudo: string, fonte?: "hotmart.csv" }`, dividir em linhas,
  `parseCsvHotmart` cada uma, registrar as válidas, e devolver `{ conta, linhas, novos,
  dedup, ignoradas, erros[] }` — linha malformada **não** aborta o lote.
- **FR-015**: O import CSV MUST ser idempotente por hash (2º import → `novos: 0`).

**Webhook stub**

- **FR-016**: O sistema MUST expor `POST /webhooks/hotmart/prd` e `POST /webhooks/hotmart/svc`
  como rotas **públicas** (sem `JwtAuthGuard`). Com `HOTMART_WEBHOOK_ENABLED` ausente ou
  `false`, MUST responder **503** com corpo `{ message: "webhook Hotmart não habilitado
  nesta versão" }` e **0** `evento_origem` — **antes** de autenticar ou parsear.
- **FR-017**: Com `HOTMART_WEBHOOK_ENABLED=true`, cada webhook MUST autenticar por
  `WebhookAuthenticator` (003) com `HOTMART_PRD_WEBHOOK_TOKEN` / `HOTMART_SVC_WEBHOOK_TOKEN`
  (`hottok`), lendo o header `x-hotmart-hottok` **ou** `authorization: Bearer`; token
  inválido/ausente/da outra conta → **401**, **0** `evento_origem`. Autenticado: chamar
  `parseWebhookHotmart(body, conta)`, registrar via `RegistrarEventoService`, responder
  **200** com `{ registrados, ignorados, eventoIds }`. Falha de persistência → **5xx**; erro
  de parse → **200** (evento cru persistido, segue para revisão).

**Status canônico da Hotmart**

- **FR-018**: O sistema MUST criar `src/financeiro/domain/status-map/hotmart.ts` exportando
  `HOTMART: Record<string, Record<string, StatusTransacaoCanonico>>` com as 3 fontes
  (`hotmart.webhook`, `hotmart.api`, `hotmart.csv`, vocabulário compartilhado) e registrar em
  `MAPAS_STATUS` via `Object.assign(MAPAS_STATUS, { HOTMART_PRD: HOTMART, HOTMART_SVC:
  HOTMART })` em `status-map/index.ts`.
- **FR-019**: O mapa MUST cobrir, no mínimo: `APPROVED → PAGO`, `COMPLETE → PAGO`,
  `PRINTED_BILLET → PENDENTE`, `WAITING_PAYMENT → PENDENTE`, `UNDER_ANALISYS → PENDENTE`,
  `PROCESSING_TRANSACTION → PENDENTE`, `OVERDUE → EM_ATRASO`, `NO_FUNDS → EM_ATRASO`,
  `REFUNDED → ESTORNADO`, `PARTIALLY_REFUNDED → ESTORNADO`, `DISPUTE → ESTORNADO`,
  `CHARGEBACK → CHARGEBACK`, `PROTESTED → CHARGEBACK`, `CANCELLED → CANCELADO`,
  `EXPIRED → CANCELADO`, `BLOCKED → RECUSADO`. `hotmart.webhook`, `hotmart.api` e
  `hotmart.csv` compartilham o mesmo vocabulário.
- **FR-020**: Qualquer valor bruto fora do mapa (`STARTED`, `PRE_ORDER`, …) MUST resultar em
  `DESCONHECIDO` + revisão (comportamento já garantido por `mapearStatus` da 018 — esta spec
  só popula o mapa).
- **FR-021**: Cada entrada do mapa MUST ser justificada por uma fixture real correspondente
  no teste de `status-map` (Princípio III).

**Fronteiras / não-regressão**

- **FR-022**: `src/ingestao/adapters/hotmart/**` MUST NOT importar `src/financeiro/**` nem
  `src/clientes/**` (ESLint `import/no-restricted-paths` já cobre).
- **FR-023**: `src/financeiro/domain/status-map/**` MUST NOT importar `ingestao` — só o
  `core` (enum `StatusTransacaoCanonico`).
- **FR-024**: Esta spec MUST NOT alterar `worker.service.ts`, `pipeline-wiring.module.ts`,
  `etapas.ts`, `classificar.ts`, nem o schema Prisma. Nenhuma migração.
- **FR-025**: `CONTEXT_MODULES` MUST seguir com **11**; `/health` inalterado.
- **FR-026**: A suíte e2e 003–021 MUST seguir verde sem alteração de comportamento.

### Key Entities

- **`EventoCanonico`** (contrato do `core`, spec 006/018) — o que os parsers produzem.
  Nenhum campo novo; a Hotmart usa o núcleo obrigatório + `comprador` + `valores` + `oferta`
  + `assinatura` + `ehAfiliada`.
- **`ResultadoParseHotmart`** — `{ eventoCanonico?: EventoCanonico; idOrigem?: string;
  tipoOrigem: FonteHotmart; payloadBruto: unknown; erros: string[] }`. Contrato de saída
  **uniforme** dos parsers.
- **`HotmartApiClient`** (interface + impl `fetch`) — `listarVendas({ conta, dataInicio,
  dataFinal, transactionStatus, cursor? }) → { itens, proximoCursor? }` e
  `listarDetalhesPreco(...)` idem. Cacheia o `access_token` OAuth2 por conta. Dublê nos
  testes; a impl real nunca é exercida em teste unitário/e2e.
- **`status-map/hotmart.ts`** (dado, em `financeiro/domain/status-map/`) — vocabulário bruto
  da Hotmart → `StatusTransacaoCanonico`, por fonte, compartilhado entre PRD e SVC.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `POST /ingestao/hotmart/sincronizar` com um `HotmartApiClient` dublê de 2
  páginas de `sales/history` encadeadas por cursor → resposta `{ paginas: 2, recebidos,
  novos, dedup: 0, erros: [] }` e os `evento_origem` `hotmart.api` correspondentes;
  re-disparo → `novos: 0`.
- **SC-002**: Após `processar`, uma compra `APPROVED` vira **exatamente 1** `transacao`
  `(HOTMART_PRD, <purchase.transaction>)` com `status_canonico = PAGO`,
  `valor_bruto` reidratável como `Dinheiro`, `oferta.codigoOrigem = "<purchase.offer.code>"`.
- **SC-003**: `POST /ingestao/hotmart/sincronizar { conta: "HOTMART_PRD" }` sem as credenciais
  OAuth → **422**, `0` eventos. Janela > 365 dias → **422**, `0` eventos, API não chamada.
  `{ conta: "HOTMART_XYZ" }` → **422** no DTO.
- **SC-004**: Uma compra `APPROVED` seguida de `PARTIALLY_REFUNDED` para o mesmo
  `purchase.transaction` → **2** `evento_origem`, **1** `transacao`, `status_canonico` final
  `ESTORNADO`, `classificacao = REEMBOLSO` (Regra Inviolável nº 1).
- **SC-005**: `commission_as = "AFFILIATE"` → `transacao.classificacao = VENDA_AFILIADA`;
  `is_subscription = true` + `recurrency_number = 3` → `transacao.classificacao = RECORRENCIA`.
- **SC-006**: `purchase.status` fora do vocabulário mapeado (`STARTED`) →
  `transacao.status_canonico = DESCONHECIDO`, `precisa_revisao = true`,
  `evento_origem.status = revisar` — **nunca** um status que libera acesso (Regra nº 15).
- **SC-007**: `sales/price/details` casado por `transaction` → `payload_bruto` do evento
  contém `price_details` e `valor_taxas` da transação reflete `fee + vat` quando sãos; um
  `sales/history` sem detalhe casado → evento registrado normalmente, sem erro.
- **SC-008**: `POST /ingestao/hotmart/importar-csv` com 5 linhas boas + 1 ruim → `200`,
  `{ linhas: 6, novos: 5, ignoradas: 1 }`; 2º import → `novos: 0`.
- **SC-009**: `HOTMART_WEBHOOK_ENABLED` ausente/`false` → `POST /webhooks/hotmart/prd` (com
  `hottok` válido) → **503**, `count(evento_origem) == 0`. Com o flag `true` (2ª instância) →
  **200**, 1 `evento_origem` `HOTMART_PRD`/`hotmart.webhook`; `hottok` errado → **401**, 0
  evento.
- **SC-010**: `payload_bruto` de qualquer `evento_origem` registrado **não contém** o
  `client_secret`, o Basic, o `access_token` OAuth nem o `hottok` (verificável por `grep`).
- **SC-011**: Todo valor monetário produzido pelos parsers é `Dinheiro{ valorInt: bigint,
  moeda }` — nenhum `float` no caminho. `moeda` vem de `purchase.price.currency_code`/
  `.currency_value`/coluna quando presente e válida, senão `"BRL"`.
- **SC-012**: `GET /admin/rbac/permissoes` **não** ganha nenhuma permissão nova; nenhuma
  migração roda no `setup-db`.
- **SC-013**: `src/ingestao/adapters/hotmart` não importa `financeiro`/`clientes`;
  `src/financeiro/domain/status-map` não importa `ingestao` (ESLint verde). `/health` segue
  com **11** contextos.
- **SC-014**: Regressão — suíte e2e 003–021 verde; nenhuma alteração em `worker.service.ts`,
  `etapas.ts`, `pipeline-wiring.module.ts`, `classificar.ts` ou no schema Prisma (verificável
  por `git diff`).
- **SC-015**: Cada entrada de `status-map/hotmart.ts` tem uma fixture real que a exercita no
  teste de `status-map` (cobertura de vocabulário verificável).
- **SC-016**: As duas contas são isoladas: um evento de `HOTMART_PRD` e um de `HOTMART_SVC`
  para o mesmo `purchase.transaction` geram **2** transações distintas (`(HOTMART_PRD, tx)` e
  `(HOTMART_SVC, tx)`).

---

## Assumptions

- **OAuth2 `client_credentials` da Hotmart.** `POST https://api-sec-vlc.hotmart.com/security/oauth/token`
  com `grant_type=client_credentials`, `client_id`, `client_secret` como query params **e**
  header `Authorization: Basic <basic_token>` (a Hotmart entrega o `basic_token` no painel do
  dev — é `base64(client_id:client_secret)`, mas usa-se o valor entregue). Resposta
  `{ access_token, token_type: "bearer", expires_in }`. Base de dados
  `https://developers.hotmart.com/payments/api/v1`.
- **`GET /sales/history` e `GET /sales/price/details`** são cursor-based
  (`items`, `page_info.next_page_token`), filtram por `start_date`/`end_date` (epoch ms) e
  `transaction_status`. Sem os filtros de status, a Hotmart devolve só `APPROVED`/`COMPLETE`
  — o client passa `transaction_status` quando o DTO o informa; sem ele, aceita-se o default
  da Hotmart (documentado). Auth `Authorization: Bearer <access_token>`.
- **Formato do CSV da Hotmart.** Não há CSV de exemplo na doc. Assume-se um export com
  cabeçalho cujas colunas espelham a compra (`transacao`/`transaction`/`codigo`,
  `status`/`situacao`, `valor`/`valor_bruto`, `valor_liquido`, `taxa`, `moeda`,
  `data_pedido`, `data_aprovacao`, `oferta`/`produto`, `codigo_oferta`, `assinatura`,
  `ciclo`, `comissao`/`tipo`, `nome`/`comprador`, `email`, `documento`, `telefone`) e cujo
  `status` usa o **mesmo enum da API** (`APPROVED` etc.). A fixture de CSV é montada nesse
  formato; ajustar quando um export real aparecer é trocar a fixture + o mapa de colunas.
- **`commission_as`.** Valores da Hotmart: `PRODUCER`, `COPRODUCER`, `AFFILIATE`. Só
  `AFFILIATE` → `ehAfiliada = true`; os demais → `VENDA_PROPRIA` pela etapa 1.
- **Cada recorrência de assinatura tem `transaction` própria** — 1 `evento_origem` / 1
  `transacao` por ciclo, ligadas pelo `subscriber_code` / `subscription.plan.id` (a agregação
  por assinatura é de specs futuras — 025/contratos).
- **Webhook `PURCHASE_*`.** A fixture de webhook segue a estrutura documentada
  (`{ id, event, version, creation_date, data: { product, affiliates, buyer, producer,
  commissions, purchase, subscription } }`, `event ∈ PURCHASE_APPROVED | PURCHASE_COMPLETE |
  PURCHASE_BILLET_PRINTED | PURCHASE_CANCELED | PURCHASE_REFUNDED | PURCHASE_CHARGEBACK |
  PURCHASE_EXPIRED | PURCHASE_DELAYED | PURCHASE_PROTEST`). O parser lê `data.purchase.status`
  como fonte canônica de status (não o `event`).
- **Fixtures não contêm PII real.**
- **Sem migração v1 aqui.** Re-ingerir o histórico real das contas Hotmart (visão Parte 6) é
  a spec de migração; esta spec entrega o mecanismo (`importar-csv` + `sincronizar`).
- **Sem frontend.** O `git diff` de `frontend/` desta spec é vazio.
- **Portas.** Nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` seguem como
  estão; os e2e desta spec rodam contra um Postgres isolado próprio (container dedicado
  `pandora-db-spec022` na porta **55439** — `55432/55433/55435/55436/55438` estão em uso por
  outras sessões).
- **`RegistrarEventoService` é a única porta de escrita de evento** — o adapter nunca faz
  `INSERT` direto em `evento_origem`; nunca toca `evento_etapa`/`transacao`.
