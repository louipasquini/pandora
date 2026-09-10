# Feature Specification: Adaptadores de borda da plataforma Guru

**Feature Branch**: `021-adapter-guru`

**Created**: 2026-09-10

**Status**: Draft

**Input**: ROADMAP.md Fase 2 (Financeiro), item 021 — "Adapters Guru (contas PRD e SVC):
webhook por conta, API `GET /transactions` (janelas ≤180d, cursor), CSV. Datas em formatos
variados (parser tolerante da 002). Oferta, cupom, garantia, assinatura nativos.
`status_map/guru/{api,csv}`. Webhooks `POST /webhooks/guru/{prd,svc}`. Sem frontend."

---

## Contexto

Terceira das **4 specs de adaptadores** da Fase 2 (019 TMB ✅, 020 Asaas ✅, **021 Guru**,
022 Hotmart). Molde direto das 019/020: a spec 006 montou o pipeline canônico e deixou a
**etapa 0** (`RegistrarEventoService.registrarEvento`) como porta exportada "que os adapters
das specs 019–022 vão injetar"; a spec 018 plugou as **etapas 2–3** (`RESOLVER_PESSOA`,
`UPSERT_TRANSACAO`) e deixou `financeiro/domain/status-map/` para "cada spec 019–022
adicionar um `status-map/{tmb,asaas,guru,hotmart}.ts` e registrar em `MAPAS_STATUS`" — 019 e
020 já seguiram esse passo-a-passo (ver `status-map/README.md`, que traz um exemplo Guru).

Esta spec faz a borda de entrada das **duas contas Guru** — `GURU_PRD` e `GURU_SVC`
(`PlataformaOrigem`, enum de 7 contas do `core`) — transformando os payloads crus das 3
fontes da Guru (webhook de Vendas **por conta**, API `GET /api/v2/transactions`, CSV de
export) em `EventoCanonico` — a forma canônica **validada** que o pipeline já processa — e
populando o vocabulário de status da Guru. Nenhuma regra de negócio conhece "Guru": o núcleo
continua canônico, a borda é fina e testada contra **fixtures reais** sem tocar o banco
(Princípio III). Depois do parse, o fluxo é idêntico: worker da 006 → classificar → resolver
pessoa → upsert transação.

A Guru é um **checkout / plataforma de vendas** (como a TMB). Particularidades que a
modelagem canônica precisa absorver (visão Apêndice A):

- **Oferta nativa.** `product.offer.id` / `product.offer.name` → `oferta.codigoOrigem` /
  `oferta.nomeOrigem`; `product.qty` → `oferta.quantidade`. A resolução de fato da Oferta
  (`(tag AEN, plataforma)`) é da **spec 023**; aqui só se transporta o código cru.
- **Cupom e garantia** aparecem no payload (`payment.coupon.*`, `dates.warranty_until`) mas
  **não têm campo canônico** no `EventoCanonico` desta fatia — ficam só no `payload_bruto`
  (mesmo tratamento da TMB/019, que também não tem slot de cupom).
- **Assinatura nativa.** `product.type === "plan"` com o objeto `subscription` preenchido →
  `assinatura.ehRecorrencia = true`; `invoice.cycle` → `assinatura.numeroCiclo`. Sem
  `subscription` preenchido (1ª venda negada, transação não concluída) → sem bloco
  `assinatura`.
- **Moeda exposta.** Diferente de TMB/Asaas, a Guru traz `payment.currency` (ISO 4217). A
  borda usa esse valor; ausente → `BRL` cravado (default explícito — Padrão Transversal
  "Dinheiro", `moeda` nunca opcional).
- **Papel de afiliada.** O campo `type` da transação (`producer` / `co_producer` /
  `affiliate`). `type === "affiliate"` → `ehAfiliada = true` → `classificar` (006) resolve
  `VENDA_AFILIADA` (venda "só para registro" — Regra Inviolável nº 8: nunca gera Oferta /
  Contrato / Cliente novo). Qualquer outro valor → `ehAfiliada` indefinido (a etapa 1
  resolve `VENDA_PROPRIA`).
- **Guru terceiriza a cobrança para a Asaas.** A transação Guru é a **venda de registro**
  (só ela soma receita); o pagamento Asaas correlato carrega `externalReference` apontando
  para o `id` desta transação Guru (spec 020, decisão A-02). O adapter Guru **não** emite
  `referenciaExterna` — a Guru é a origem, não a ponte. Cravar o vínculo Asaas↔Guru é da
  **spec 024** (etapa 4); ela casa `asaas.payment.externalReference` → `guru.transaction.id`.
- **Comprador rico.** O objeto `contact` traz nome, e-mail, documento, telefone (+ código
  local) e endereço completo → `comprador` completo no `EventoCanonico`.

## Clarifications

*021 não está marcada `⚠ clarify` no ROADMAP. As decisões de fato ambíguas foram levadas ao
dono do produto em 2026-09-10 (G-01, G-02, G-03 abaixo). As demais (G-04..G-18) são
**defaults documentados** — mesmo tratamento das specs 010/017/018/019/020. Zero
`NEEDS CLARIFICATION` remanescente.*

- **G-01 — Chave natural `id_origem` da Guru = `transaction.id`** (dono do produto,
  2026-09-10). O UUID da transação Guru (`"9081534a-7512-4dab-9172-218c1dc1f263"`), presente
  de forma consistente nas 3 fontes (webhook campo `id`, API `data[].id`, CSV coluna
  `id`/`transacao`/`codigo`). É **por conta**: só único dentro de
  `(GURU_PRD | GURU_SVC, transaction.id)` — a `PlataformaOrigem` desambigua (Padrão
  Transversal "Multi-conta"). Consequência: os N webhooks de uma mesma venda (aprovada →
  reembolsada, ciclos de assinatura que **repetem o mesmo `id`** de transação — os ciclos
  novos vêm com `id` novo) resolvem para a **mesma** `(<conta>, <id>)`; o `UPSERT_TRANSACAO`
  (018) mantém 1 linha e o `status_canonico` reflete o **último** evento processado (Regra
  Inviolável nº 1 por construção).
- **G-02 — O adapter Guru NÃO emite `referenciaExterna`; o vínculo Asaas↔Guru é da spec
  024** (dono do produto, 2026-09-10). A Guru é a **venda de registro**. `payment.marketplace_id`
  / `payment.marketplace_name` (o id da cobrança no processador — pode ser a cobrança Asaas)
  ficam **só no `payload_bruto`**. A spec 024 (`RESOLVER_VINCULO`, etapa 4) casa a cobrança
  Asaas (`externalReference`) com esta transação Guru (`id`), marca a Asaas como não-receita
  e faz só a Guru resolver Oferta/Contrato (Regra Inviolável nº 2).
- **G-03 — Escopo desta spec: parser puro + endpoints finos em `/ingestao/guru/*`** (dono do
  produto, 2026-09-10). Entrega as **3 fontes**: funções puras `parse*()` + **fixtures
  reais** + `status-map/guru.ts`. Superfície HTTP:
  - **Webhooks públicos por conta** `POST /webhooks/guru/prd` e `POST /webhooks/guru/svc`
    (o prefixo `/webhooks/` já é allowlist pública desde a 003; 019 abriu `/webhooks/tmb/*`,
    020 abriu `/webhooks/asaas/*`).
  - **Sincronização por API sob demanda** `POST /ingestao/guru/sincronizar` (autenticado,
    `evento:ingerir`) — `{ conta, dataInicio, dataFinal, campoData? }`; pagina
    `GET /api/v2/transactions` (cursor) e registra cada transação.
  - **Import CSV** `POST /ingestao/guru/importar-csv` (autenticado, `evento:ingerir`) —
    `{ conta, conteudo, fonte? }`; CSV como **texto no corpo JSON**, **0 dependência nova**
    de upload binário (mesmo padrão das specs 015/019/020).

  A superfície `admin/` completa fica para a spec de migração/admin.
- **G-04 — Autenticação do webhook: `api_token` NO CORPO.** Diferente de TMB (header
  `x-tmb-webhook-token`) e Asaas (header `asaas-access-token`), a Guru envia o token de
  validação no **campo `api_token` do JSON** (equivale ao Account Token da conta). O
  controller lê `body.api_token` e passa a `WebhookAuthenticator.autenticar(<conta>, token)`
  (003) — que compara `GURU_PRD_WEBHOOK_TOKEN` / `GURU_SVC_WEBHOOK_TOKEN` em tempo
  constante. Token ausente/errado/**da outra conta** → **401**, corpo genérico, **nenhum**
  `evento_origem`. **Não** usa HMAC. O `api_token` **é removido** do `payload_bruto` antes de
  registrar o evento (é segredo — nunca persistir; ver G-14).
- **G-05 — `statusOrigem` = `transaction.status` cru** (`approved`, `waiting_payment`,
  `refunded`, `chargeback`, `canceled`…). Sem ajuste sintético (não há caso `deleted` como
  na Asaas). `webhook_type` (`transaction` / `subscription` / …) fica só no `payload_bruto`.
- **G-06 — `tipoOrigem` = o rótulo da fonte, e é a chave `fonte` do `status-map`.**
  Convenção congelada: `guru.webhook`, `guru.api`, `guru.csv`. `mapearStatus(plataforma,
  fonte, bruto)` (018) recebe `plataforma = "GURU_PRD"` ou `"GURU_SVC"` e `fonte = tipoOrigem`;
  `MAPAS_STATUS.GURU_PRD` e `MAPAS_STATUS.GURU_SVC` apontam para o **mesmo** objeto `GURU`
  via `Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU })`.
- **G-07 — Onde vive o adapter.** `src/ingestao/adapters/guru/` (visão Apêndice C). As
  `parse*()` são **puras**, sem NestJS, sem Prisma, sem `fetch` — recebem o payload/linha já
  desserializado **+ a `conta`** e devolvem `{ eventoCanonico?, idOrigem?, tipoOrigem,
  payloadBruto, erros[] }`. Ficam dentro do `ingestao`; **não** importam `financeiro` (o
  `status-map/guru.ts` vive em `financeiro/` e é consumido lá pela etapa 3) nem `clientes`.
- **G-08 — Webhooks finos e resilientes** (idêntico à 019/020). Cada webhook: (1) autentica
  por `body.api_token`; (2) desserializa; (3) chama `parseWebhookGuru(body, conta)`; (4)
  chama `RegistrarEventoService.registrarEvento` com o `payloadBruto` (sem `api_token`)
  **sempre** e o `eventoCanonico` **só se o parse não acumulou erro fatal**; (5) responde
  **`200 OK`** com `{ registrados, ignorados }`. Falha de persistência (etapa 0) → **5xx** (a
  Guru reenvia — retenta a cada minuto até 10×, depois delay exponencial até 20×). Erro de
  **parse** MUST NOT virar 5xx: o evento cru é persistido, `evento_canonico` fica nulo, e
  `classificar` marca `revisar` — nada some. **Atenção:** a Guru **suprime retentativas** em
  `401/403/404/406/410/422/505/506/510/511` — nunca devolver 422 para "quero que reenvie".
- **G-09 — Payload de webhook sem `id` de transação** (webhook de assinatura/contrato/
  eticket que a Guru manda para a mesma URL, ou lixo): sem identidade não há dedup nem
  projeção → conta em `ignorados`, é **logado**, e **não** é registrado. `{ registrados: 0,
  ignorados: n }`, resposta `200`.
- **G-10 — Mapa de valores monetários.** `valores.bruto` = `payment.gross`; `valores.liquido`
  = `payment.net`; `valores.taxas` = `payment.tax.value` quando numérica **e** `0 < taxa <
  bruto` (guarda de sanidade), senão derivado de `gross − net` sob a mesma guarda, senão
  omitido. `payment.total`, `payment.discount_value`, `payment.affiliate_value`,
  `payment.marketplace_value`, `payment.installments.*` ficam **só no `payload_bruto`**.
  Conversão via escala ×10000 do `core` (`Dinheiro.deDecimal`); `float` proibido no
  resultado. `moeda` = `payment.currency` (ISO 4217 validado pelo `core`) ?? `"BRL"`.
- **G-11 — O adapter não classifica.** `EventoCanonico.classificacao` fica indefinido; a
  etapa 1 resolve — `status = "refunded"`/`"chargeback"`/`"dispute"` casa o regex de estorno
  de `classificar` (006) e vira `REEMBOLSO`; `ehAfiliada === true` → `VENDA_AFILIADA`;
  `assinatura.ehRecorrencia`/`numeroCiclo > 1` → `RECORRENCIA`; o resto é `VENDA_PROPRIA`.
  **Nenhuma mudança em `classificar.ts` nesta spec** (o `RE_ESTORNO` já cobre `refund` /
  `chargeback` / `charge_back` / `devolu` / `reembols` / `estorn[oa]`; `dispute` casa por
  `disput`? não — `dispute` **não** casa o regex atual. Ver G-17: o `status-map` traduz
  `dispute → ESTORNADO`, e a etapa 3 grava `status_canonico = ESTORNADO`; a `classificacao`
  fica `VENDA_PROPRIA` — aceitável, o dinheiro não conta como receita pelo `status_canonico`).
- **G-12 — `ocorridoEm`.** webhook/API: `dates.confirmed_at` ?? `dates.ordered_at` ??
  `dates.created_at` ?? `dates.updated_at` ?? `""`. CSV: `data_aprovacao` ?? `data_pedido` ??
  `data_criacao` ?? `""`. O parser **não** chama `parseInstante` — passa a string crua; a
  etapa 3 (018) aplica `parseInstante` do `core` (tolera ISO com `Z`, date-only, epoch).
- **G-13 — `GuruApiClient` (cursor).** Interface + token DI (`GURU_API_CLIENT`), impl real
  com **`fetch` nativo do Node 24** (0 dep). `GET {base}/transactions?<campoData>_ini=&
  <campoData>_end=[&cursor=]`, header **`Authorization: Bearer <GURU_<conta>_API_KEY>`** +
  `User-Agent` + `Accept: application/json`, base `GURU_<conta>_API_BASE_URL` ??
  `https://digitalmanager.guru/api/v2`. Paginação **por cursor**: segue `next_cursor`
  enquanto `has_more_pages` (número 1 / booleano `true`), até `MAX_PAGINAS` de segurança.
  `GURU_<conta>_API_KEY` ausente → `GuruApiIndisponivelError` → `/sincronizar` responde
  **422** (não 500). Janela obrigatória; período > 180 dias → **422** no DTO (validação de
  borda, não chamada à API).
- **G-14 — Segredo nunca persiste.** O `api_token` do corpo do webhook é **removido** do
  objeto antes de virar `payload_bruto` (`{ ...body, api_token: undefined }` → sem a chave).
  Um teste e2e faz `grep` do valor do token no `evento_origem` = 0. Idem CSV: coluna
  `api_token`, se existir, é ignorada.
- **G-15 — RBAC: nenhuma permissão nova.** Webhooks são `@Public()` (prefixo `/webhooks/`).
  `POST /ingestao/guru/*` reusam `evento:ingerir` (catálogo desde a 006). **0 migração de
  dados/seed.**
- **G-16 — Config.** `GURU_PRD_*` e `GURU_SVC_*` (`_API_BASE_URL`, `_API_KEY`,
  `_WEBHOOK_TOKEN`) **já existem** no `env.schema` como `accountConfig` (spec 001/003) —
  **0 chave `.env` nova**.
- **G-17 — Vocabulário de status.** `guru.webhook` == `guru.api` == `guru.csv` (o CSV
  espelha o enum da API — Assumption, sem export real na doc). Ver `research.md` §D-R10 para
  a tabela completa. Valores ambíguos para a operação da AEN (`trial`, `started`,
  `abandoned`, `scheduled`, `pending_transfer`, `transferred`, `pre_order`) ficam **fora do
  mapa de propósito** → caem em `DESCONHECIDO` + revisão até uma fixture real aparecer (mesmo
  precedente do `AUTHORIZED` da Asaas).
- **G-18 — Sem migração, sem tabela, sem frontend, `CONTEXT_MODULES` = 11.** O adapter é
  subdiretório do `ingestao`. `evento_origem`/`evento_etapa`/`transacao` já existem
  (006/018). Os eventos aparecem no painel **Eventos** (006) e as transações em **Financeiro
  · Transações** (018) sem nenhuma mudança de frontend.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Webhook de Vendas da Guru vira transação (Priority: P1)

A Guru dispara `POST /webhooks/guru/prd` (ou `/svc`) a cada mudança de estado de uma venda
(`approved`, `waiting_payment`, `refunded`, `chargeback`, `canceled`…). O sistema valida o
`api_token` da conta, registra o evento cru **sem o token**, e o worker projeta uma
`transacao` `(GURU_PRD, <transaction.id>)` com valor na moeda de `payment.currency`,
`status_canonico` traduzido, `oferta.codigoOrigem` e o `comprador` do `contact`.

**Why this priority**: é o caminho primário de entrada de dados da Guru (webhook = caminho
primário — visão 5.5). Sem ele não há ledger das contas Guru.

**Independent Test**: `POST /webhooks/guru/prd` com uma fixture real de venda `approved` e o
`api_token` correto → `200` → `POST /ingestao/eventos/processar` → `GET /financeiro/transacoes`
mostra 1 transação `GURU_PRD` com `status_canonico = PAGO`, `classificacao = VENDA_PROPRIA`,
`valor_bruto` reidratável como `Dinheiro{BRL}` e `oferta` com o código cru.

**Acceptance Scenarios**:

1. **Given** `body.api_token` correto e uma fixture de venda `approved`, **When**
   `POST /webhooks/guru/prd`, **Then** resposta `200`, existe um `evento_origem` `GURU_PRD` /
   `guru.webhook` com `payload_bruto` **sem** `api_token` e `evento_canonico` preenchido.
2. **Given** o evento acima, **When** o worker processa a passada, **Then** existe `transacao`
   com `plataforma_origem = GURU_PRD`, `id_origem = "<transaction.id>"`,
   `status_canonico = PAGO`, `valor_bruto = { valorInt, moeda: "BRL" }`, `oferta` com
   `codigoOrigem = "<product.offer.id>"`, e a etapa `UPSERT_TRANSACAO` está `ok`.
3. **Given** uma fixture de venda `waiting_payment`, **When** processada, **Then**
   `transacao.status_canonico = PENDENTE`.
4. **Given** uma fixture de venda `chargeback`, **When** processada, **Then**
   `transacao.status_canonico = CHARGEBACK` e `classificacao = REEMBOLSO`.
5. **Given** `body.api_token` ausente ou errado, **When** `POST /webhooks/guru/prd`, **Then**
   resposta **401** e **nenhum** `evento_origem` é criado.
6. **Given** o `api_token` de PRD enviado para `/webhooks/guru/svc`, **When** recebido,
   **Then** **401** (cada conta valida só o seu `GURU_<conta>_WEBHOOK_TOKEN`).

---

### User Story 2 — Venda como afiliada e assinatura recorrente (Priority: P1)

Uma venda em que a AEN é **afiliada** (`type = "affiliate"`) entra "só para registro" — o
adapter emite `ehAfiliada = true` e `classificar` resolve `VENDA_AFILIADA` (nunca gera
Oferta/Contrato/Cliente novo). Um ciclo de assinatura (`product.type = "plan"` +
`subscription` preenchido, `invoice.cycle > 1`) → `assinatura.ehRecorrencia = true` +
`numeroCiclo` → `RECORRENCIA`.

**Why this priority**: materializa a Regra Inviolável nº 8 (afiliada) e o tratamento de
recorrência no ponto de entrada.

**Independent Test**: `POST /webhooks/guru/prd` com `type = "affiliate"` → após `processar`,
`transacao.classificacao = VENDA_AFILIADA`. Outra fixture com `product.type = "plan"` +
`invoice.cycle = 3` → `transacao.classificacao = RECORRENCIA`.

**Acceptance Scenarios**:

1. **Given** uma fixture com `type = "affiliate"`, **When** registrada e processada, **Then**
   `evento_canonico.ehAfiliada === true` e `transacao.classificacao = VENDA_AFILIADA`.
2. **Given** uma fixture com `product.type = "plan"`, `subscription.id` preenchido e
   `invoice.cycle = 3`, **When** processada, **Then**
   `evento_canonico.assinatura = { ehRecorrencia: true, numeroCiclo: 3 }` e
   `transacao.classificacao = RECORRENCIA`.
3. **Given** uma fixture de 1ª venda de plano **negada** (`status = "rejected"`,
   `subscription` vazio), **When** processada, **Then** sem bloco `assinatura` e
   `status_canonico = RECUSADO`.

---

### User Story 3 — Sincronização por API com cursor (Priority: P2)

A equipe dispara `POST /ingestao/guru/sincronizar` com `{ conta, dataInicio, dataFinal }`
para reconciliar vendas que um webhook pode ter perdido. O sistema pagina
`GET /api/v2/transactions` **por cursor** (`next_cursor` enquanto `has_more_pages`) da conta
indicada, registra cada transação como evento `guru.api` e devolve um resumo.

**Why this priority**: a API é o caminho **sob demanda** (visão 5.5) — rede de segurança
para falha de webhook. P2.

**Independent Test**: com um `GuruApiClient` dublê devolvendo 2 páginas encadeadas por
cursor → `POST /ingestao/guru/sincronizar { conta: "GURU_PRD", dataInicio, dataFinal }` →
resumo `{ paginas: 2, recebidos: N, novos: N, dedup: 0 }` e N `evento_origem` `GURU_PRD` /
`guru.api`.

**Acceptance Scenarios**:

1. **Given** `GURU_PRD_API_KEY` configurado e a API devolvendo 2 páginas (a 1ª com
   `has_more_pages` e `next_cursor`, a 2ª sem), **When**
   `POST /ingestao/guru/sincronizar { conta: "GURU_PRD", dataInicio, dataFinal }`, **Then** N
   `evento_origem` `GURU_PRD` / `guru.api` e resposta `{ paginas: 2, recebidos: N, novos: N,
   dedup: 0 }`.
2. **Given** uma transação que já entrou por webhook (`(GURU_PRD, tx_1)`), **When** a
   sincronização traz a mesma transação, **Then** o evento `guru.api` é registrado como um
   **fato novo** (hash diferente do webhook), mas `UPSERT_TRANSACAO` **atualiza** a transação
   existente — nunca cria uma 2ª linha.
3. **Given** `GURU_PRD_API_KEY` ausente, **When** `POST /ingestao/guru/sincronizar
   { conta: "GURU_PRD", ... }`, **Then** resposta **422** com `{ message: "conta GURU_PRD sem
   API configurada" }` e nenhum evento.
4. **Given** um período `dataInicio`..`dataFinal` **maior que 180 dias**, **When** recebido,
   **Then** **422** (`janela acima de 180 dias`) — sem chamar a API.
5. **Given** `{ conta: "GURU_XYZ" }` (fora do enum de contas Guru), **When** recebido,
   **Then** **422** (`conta` inválida no DTO).
6. **Given** a API da Guru responde `500` na 2ª página, **When** a sincronização roda,
   **Then** as transações da 1ª página **já foram registradas** (commit por página), a
   resposta informa o erro parcial, e re-disparar é idempotente (dedup por hash).

---

### User Story 4 — Import de CSV (Priority: P3)

A equipe cola o conteúdo de um export CSV de vendas da Guru em
`POST /ingestao/guru/importar-csv` com a `conta`; cada linha vira um evento `guru.csv`.
Linhas malformadas são reportadas sem abortar o lote.

**Why this priority**: caminho de migração/backfill (visão Parte 6). Útil, mas não bloqueia
a operação corrente.

**Independent Test**: um CSV com 3 linhas boas + 1 linha sem `id` → `{ linhas: 4, novos: 3,
ignoradas: 1, erros: ["linha 3: sem identificador de transação"] }`.

**Acceptance Scenarios**:

1. **Given** um CSV válido da Guru com cabeçalho e 5 linhas de vendas, **When** `POST
   /ingestao/guru/importar-csv { conta, conteudo }`, **Then** 5 `evento_origem` `<conta>` /
   `guru.csv` e a resposta resume `{ linhas: 5, novos: 5, ignoradas: 0 }`.
2. **Given** o mesmo CSV enviado 2 vezes, **When** o 2º import roda, **Then** `novos: 0`,
   `dedup: 5` — nenhum evento nem transação duplicada.
3. **Given** uma linha sem valor no campo de id, **When** o import roda, **Then** essa linha
   entra em `ignoradas`, as demais são processadas, e o erro é listado com o número da linha.
4. **Given** um separador `;` em vez de `,` (comum em export BR), **When** o import roda,
   **Then** o parser detecta o separador e processa as linhas corretamente.

---

### Edge Cases

- **Payload de webhook com atributo novo não tratado**: o parser **ignora** campos
  desconhecidos — nunca lança por chave a mais. O `payload_bruto` guarda tudo (menos
  `api_token`).
- **`payment.currency` inválida / ausente**: a borda usa `"BRL"`; a moeda inválida é logada
  em `erros` (não-fatal).
- **`payment.net` ausente** (venda ainda pendente): `valores` fica só com `bruto`; a
  transação é atualizada só no que o evento carrega.
- **`payment.gross` ausente / não-numérico**: `valores` fica sem `bruto`; erro não-fatal em
  `erros`; o evento cru é registrado e vai para revisão.
- **`contact` ausente/vazio**: `comprador` fica vazio; `RESOLVER_PESSOA` (018) tolera.
- **Array de eventos no corpo do webhook**: a Guru manda **1 por request**; o parser aceita
  um objeto e também um array defensivamente (1 `EventoCanonico` por item).
- **CSV com BOM / encoding Latin-1**: o corpo chega como texto já decodificado; o parser
  tolera BOM inicial. Encoding é responsabilidade de quem exporta.
- **Dois eventos idênticos** (reentrega): geram o **mesmo** hash → o 2º é dedup na etapa 0.
- **`conta` do path (`prd`/`svc`) fixa o `plataforma_origem`** — o corpo do webhook nunca
  altera a conta.
- **`status = "dispute"` / `"in_recovery"`**: traduzem para `ESTORNADO` / `EM_ATRASO` no
  `status-map`; a `classificacao` pode ficar `VENDA_PROPRIA` (o `RE_ESTORNO` de `classificar`
  não casa `dispute`) — aceitável, o dinheiro não vira receita pelo `status_canonico`.

---

## Requirements *(mandatory)*

### Functional Requirements

**Parsers puros (as 3 fontes)**

- **FR-001**: O sistema MUST prover `parseWebhookGuru(payload, conta) → ResultadoParseGuru[]`
  puro (sem NestJS/Prisma/rede) que aceita um objeto de transação Guru (ou um array disso) e
  produz **um** `EventoCanonico` por item com `plataformaOrigem = conta`,
  `idOrigem = String(transaction.id)`, `tipoOrigem = "guru.webhook"`,
  `statusOrigem = String(transaction.status)` (cru), `ocorridoEm` conforme G-12, `valores`
  conforme G-10, `comprador` do `contact`, `oferta` de `product`/`items`,
  `assinatura` sse `product.type === "plan"` com `subscription` preenchido,
  `ehAfiliada = true` sse `type === "affiliate"`. **Nunca** emite `referenciaExterna`.
- **FR-002**: O sistema MUST prover `parseTransacaoApi(item, conta) → ResultadoParseGuru`
  puro para um item de `GET /api/v2/transactions`, com `tipoOrigem = "guru.api"` e o mesmo
  mapeamento da FR-001 (o objeto da API tem a mesma forma do de webhook, menos `api_token`).
- **FR-003**: O sistema MUST prover `parseCsvGuru(conteudo, conta) → ResultadoParseGuru[]`
  puro, com `tipoOrigem = "guru.csv"`, tolerante a separador `,` e `;` (detecção pelo
  cabeçalho), a BOM inicial e a aspas; mapeia `id`, `status`, `valor_bruto`, `valor_liquido`,
  `moeda`, `data_pedido`, `data_aprovacao`, `data_criacao`, `oferta`, `codigo_oferta`,
  `assinatura`, `ciclo`, `tipo`, e os campos de comprador (`nome`, `email`, `documento`,
  `telefone`).
- **FR-004**: Todo parser MUST devolver `{ eventoCanonico?, idOrigem?, tipoOrigem,
  payloadBruto, erros: string[] }`. Sem identificador de transação → `eventoCanonico` ausente
  + erro descritivo (nunca lança). Campo desconhecido no payload → **ignorado** (nunca erro).
- **FR-005**: Nenhum parser MUST tocar o banco, fazer I/O ou depender de locale/fuso do
  processo. `Dinheiro`/`Moeda` do `core` e utilitários locais de string são as únicas
  dependências; `parseInstante` **não** é chamado no parser (a etapa 3 o aplica).
- **FR-006**: Todo parser MUST ser exercido por teste unitário contra **fixtures reais** da
  Guru em `src/ingestao/adapters/guru/fixtures/` (Princípio III). As fixtures NÃO contêm PII
  real (dados fictícios equivalentes em forma).
- **FR-007**: Os parsers MUST aceitar a `conta` (`GURU_PRD` | `GURU_SVC`) como parâmetro e
  cravá-la em `plataformaOrigem` — o payload da Guru nunca a determina.
- **FR-008**: `parseWebhookGuru` MUST remover a chave `api_token` do `payloadBruto` que
  devolve (segredo — nunca persistir).

**Webhooks públicos**

- **FR-009**: O sistema MUST expor `POST /webhooks/guru/prd` e `POST /webhooks/guru/svc` como
  rotas **públicas** (sem `JwtAuthGuard`), autenticadas por `WebhookAuthenticator` (003) com
  `GURU_PRD_WEBHOOK_TOKEN` / `GURU_SVC_WEBHOOK_TOKEN` respectivamente, lendo o **campo
  `api_token` do corpo**. Token inválido/ausente → **401**, corpo genérico, **nenhum**
  `evento_origem` criado.
- **FR-010**: Cada webhook MUST, após autenticar: chamar `parseWebhookGuru(body, conta)`, e
  chamar `RegistrarEventoService.registrarEvento` **uma vez por fato** com `payloadBruto`
  (sem `api_token`) sempre presente e `eventoCanonico` presente só quando o parse não
  acumulou erro. Responde **`200 OK`** com `{ registrados, ignorados, eventoIds }`.
- **FR-011**: Se `RegistrarEventoService` lançar (falha de persistência da etapa 0), o
  webhook MUST responder **5xx** (a Guru reenvia). Erro de **parse** MUST NOT virar 5xx nem
  4xx — o evento cru é persistido e segue para revisão (a Guru suprime retentativas em 4xx).
- **FR-012**: Payload de webhook sem `id` de transação MUST contar em `ignorados` (logado,
  **não** registrado); `{ registrados: 0, ignorados: n }`, resposta `200`.

**Sincronização por API**

- **FR-013**: O sistema MUST prover um `GuruApiClient` atrás de uma interface (dublê nos
  testes), usando **`fetch` nativo do Node 24** (0 dep nova), com header
  `Authorization: Bearer <GURU_<conta>_API_KEY>` + `User-Agent` + `Accept`, base
  `GURU_<conta>_API_BASE_URL` ?? `https://digitalmanager.guru/api/v2`, que pagina
  `GET /transactions` **por cursor** (`next_cursor` enquanto `has_more_pages`), aceitando
  `<campoData>_ini` / `<campoData>_end` (`ordered_at` default; `confirmed_at` / `cancelled_at`
  opcionais).
- **FR-014**: `POST /ingestao/guru/sincronizar` (autenticado, `evento:ingerir`) MUST aceitar
  `{ conta: "GURU_PRD" | "GURU_SVC", dataInicio, dataFinal, campoData? }`, validar que a
  janela `dataInicio..dataFinal` **não passa de 180 dias** (→ 422), chamar o client,
  `parseTransacaoApi` cada item, registrar via `RegistrarEventoService`, e devolver
  `{ conta, paginas, recebidos, novos, dedup, ignorados, erros[] }`. Commit por página.
- **FR-015**: Se `GURU_<conta>_API_KEY` não estiver configurado,
  `POST /ingestao/guru/sincronizar` MUST responder **422** com motivo claro — nunca 500.
- **FR-016**: A sincronização MUST ser idempotente por hash: re-disparar a mesma janela não
  cria eventos nem transações duplicadas.

**Import CSV**

- **FR-017**: `POST /ingestao/guru/importar-csv` (autenticado, `evento:ingerir`) MUST
  aceitar `{ conta, conteudo: string, fonte?: "guru.csv" }`, dividir em linhas,
  `parseCsvGuru` cada uma, registrar as válidas, e devolver `{ conta, linhas, novos, dedup,
  ignoradas, erros[] }` — linha malformada **não** aborta o lote.
- **FR-018**: O import CSV MUST ser idempotente por hash (2º import → `novos: 0`).

**Status canônico da Guru**

- **FR-019**: O sistema MUST criar `src/financeiro/domain/status-map/guru.ts` exportando
  `GURU: Record<string, Record<string, StatusTransacaoCanonico>>` com as 3 fontes
  (`guru.webhook`, `guru.api`, `guru.csv`) e registrar em `MAPAS_STATUS` via
  `Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU })` em `status-map/index.ts`.
- **FR-020**: O mapa MUST cobrir, no mínimo: `approved → PAGO`, `completed → PAGO`,
  `waiting_payment → PENDENTE`, `pending → PENDENTE`, `billet_printed → PENDENTE`,
  `processing → PENDENTE`, `analysis → PENDENTE`, `charging → PENDENTE`,
  `delayed → EM_ATRASO`, `in_recovery → EM_ATRASO`, `refunded → ESTORNADO`,
  `dispute → ESTORNADO`, `chargeback → CHARGEBACK`, `canceled → CANCELADO`,
  `expired → CANCELADO`, `rejected → RECUSADO`, `failed → RECUSADO`, `blocked → RECUSADO`.
  `guru.webhook`, `guru.api` e `guru.csv` compartilham o mesmo vocabulário.
- **FR-021**: Qualquer valor bruto fora do mapa (`trial`, `started`, `abandoned`,
  `scheduled`, `pending_transfer`, `transferred`, …) MUST resultar em `DESCONHECIDO` +
  revisão (comportamento já garantido por `mapearStatus` da 018 — esta spec só popula o
  mapa).
- **FR-022**: Cada entrada do mapa MUST ser justificada por uma fixture real correspondente
  no teste de `status-map` (Princípio III).

**Fronteiras / não-regressão**

- **FR-023**: `src/ingestao/adapters/guru/**` MUST NOT importar `src/financeiro/**` nem
  `src/clientes/**` (ESLint `import/no-restricted-paths` já cobre). O `status-map/guru.ts`
  vive em `src/financeiro/**` e é consumido lá.
- **FR-024**: `src/financeiro/domain/status-map/**` MUST NOT importar `ingestao` — só o
  `core` (enum `StatusTransacaoCanonico`).
- **FR-025**: Esta spec MUST NOT alterar `worker.service.ts`, `pipeline-wiring.module.ts`,
  `etapas.ts`, `classificar.ts`, nem o schema Prisma. Nenhuma migração.
- **FR-026**: `CONTEXT_MODULES` MUST seguir com **11**; `/health` inalterado.
- **FR-027**: A suíte e2e 003–020 MUST seguir verde sem alteração de comportamento.

### Key Entities

- **`EventoCanonico`** (contrato do `core`, spec 006/018) — o que os parsers produzem.
  Nenhum campo novo; a Guru usa o núcleo obrigatório + `comprador` + `valores` + `oferta` +
  `assinatura` + `ehAfiliada`.
- **`ResultadoParseGuru`** — `{ eventoCanonico?: EventoCanonico; idOrigem?: string;
  tipoOrigem: FonteGuru; payloadBruto: unknown; erros: string[] }`. Contrato de saída
  **uniforme** dos 3 parsers.
- **`GuruApiClient`** (interface + impl `fetch`) — `listarTransacoes({ conta, dataInicio,
  dataFinal, campoData, cursor? }) → { itens: unknown[]; proximoCursor?: string }`. Dublê nos
  testes; a impl real nunca é exercida em teste unitário/e2e.
- **`status-map/guru.ts`** (dado, em `financeiro/domain/status-map/`) — vocabulário bruto da
  Guru → `StatusTransacaoCanonico`, por fonte, compartilhado entre PRD e SVC.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma fixture real de webhook de venda `approved` com `api_token` válido →
  `POST /webhooks/guru/prd` responde `200`, cria **1** `evento_origem` `GURU_PRD`/`guru.webhook`,
  e após `processar` existe **exatamente 1** `transacao` `(GURU_PRD, <transaction.id>)` com
  `status_canonico = PAGO`.
- **SC-002**: `POST /webhooks/guru/prd` sem `api_token` / token errado / token da outra conta
  → **401** e `count(evento_origem) == 0`.
- **SC-003**: `payload_bruto` do `evento_origem` registrado **não contém** o valor do
  `api_token` (verificável por `grep`).
- **SC-004**: Uma venda `approved` seguida de `refunded` para o mesmo `transaction.id` →
  **2** `evento_origem`, **1** `transacao`, `status_canonico` final `ESTORNADO`,
  `classificacao = REEMBOLSO` (Regra Inviolável nº 1).
- **SC-005**: `type = "affiliate"` → `transacao.classificacao = VENDA_AFILIADA`;
  `product.type = "plan"` + `invoice.cycle = 3` → `transacao.classificacao = RECORRENCIA`.
- **SC-006**: `transaction.status` fora do vocabulário mapeado (`trial`, `started`, …) →
  `transacao.status_canonico = DESCONHECIDO`, `precisa_revisao = true`,
  `evento_origem.status = revisar` — **nunca** um status que libera acesso (Regra nº 15).
- **SC-007**: `POST /ingestao/guru/sincronizar` com um `GuruApiClient` dublê de 2 páginas
  encadeadas por cursor → resposta `{ paginas: 2, recebidos, novos, dedup: 0, erros: [] }` e
  os `evento_origem` `guru.api` correspondentes; re-disparo → `novos: 0`.
- **SC-008**: `POST /ingestao/guru/sincronizar { conta: "GURU_PRD" }` sem `GURU_PRD_API_KEY`
  → **422**, `0` eventos. Janela > 180 dias → **422**, `0` eventos, API não chamada.
- **SC-009**: `POST /ingestao/guru/importar-csv` com 5 linhas boas + 1 ruim → `200`,
  `{ linhas: 6, novos: 5, ignoradas: 1 }`; 2º import do mesmo conteúdo → `novos: 0`.
- **SC-010**: Todo valor monetário produzido pelos parsers é `Dinheiro{ valorInt: bigint,
  moeda }` — nenhum `float` no caminho (verificável por tipo/`grep`). `moeda` vem de
  `payment.currency` quando presente e válida, senão `"BRL"`.
- **SC-011**: `GET /admin/rbac/permissoes` **não** ganha nenhuma permissão nova; nenhuma
  migração roda no `setup-db`.
- **SC-012**: `src/ingestao/adapters/guru` não importa `financeiro`/`clientes`;
  `src/financeiro/domain/status-map` não importa `ingestao` (ESLint verde). `/health` segue
  com **11** contextos.
- **SC-013**: Regressão — suíte e2e 003–020 verde; nenhuma alteração em `worker.service.ts`,
  `etapas.ts`, `pipeline-wiring.module.ts`, `classificar.ts` ou no schema Prisma
  (verificável por `git diff`).
- **SC-014**: Cada entrada de `status-map/guru.ts` tem uma fixture real que a exercita no
  teste de `status-map` (cobertura de vocabulário verificável).
- **SC-015**: As duas contas são isoladas: um webhook em `/svc` com o `api_token` de PRD →
  401; um evento de `/prd` e um de `/svc` para o mesmo `transaction.id` geram **2**
  transações distintas (`(GURU_PRD, id)` e `(GURU_SVC, id)`).

---

## Assumptions

- **`api_token` no corpo é a autenticação do webhook da Guru.** A doc é explícita: "O campo
  `api_token` no payload valida que a requisição partiu do Guru (equivale ao Account Token)".
  Assume-se comparação em tempo constante contra `GURU_<conta>_WEBHOOK_TOKEN`. Sem HMAC (a
  Guru não assina o corpo).
- **`GET /api/v2/transactions` é cursor-based** (`data`, `has_more_pages`, `next_cursor`),
  exige filtro por data (`ordered_at` / `confirmed_at` / `cancelled_at`, `_ini` + `_end`),
  período ≤ 180 dias. Auth `Authorization: Bearer <user_token>` (Account Token). Base
  `https://digitalmanager.guru/api/v2`.
- **Formato do CSV da Guru.** Não há CSV de exemplo na doc. Assume-se um export com cabeçalho
  cujas colunas espelham a transação (`id`/`transacao`/`codigo`, `status`/`situacao`,
  `valor_bruto`/`valor`, `valor_liquido`, `moeda`, `data_pedido`, `data_aprovacao`,
  `data_criacao`, `produto`/`oferta`, `codigo_oferta`, `assinatura`, `ciclo`, `tipo`,
  `nome`/`cliente`, `email`, `documento`/`cpf_cnpj`, `telefone`) e cujo `status` usa o
  **mesmo enum da API** (`approved` etc.). A fixture de CSV é montada nesse formato; ajustar
  quando um export real aparecer é trocar a fixture + o mapa de colunas, não a arquitetura
  (mesmo precedente da 019/020).
- **`type` da transação.** Valores conhecidos da Guru: `producer`, `co_producer`,
  `affiliate`. Só `affiliate` gera `ehAfiliada = true`; `producer`/`co_producer` (e qualquer
  outro) → `VENDA_PROPRIA` pela etapa 1. Ajustar se um valor novo aparecer é uma linha.
- **Ciclos de assinatura têm `id` de transação próprio.** Cada cobrança recorrente é uma
  transação nova (`id` novo) → um `evento_origem` / uma `transacao` por ciclo, ligadas ao
  mesmo `subscription.id` (a agregação por assinatura é de specs futuras — 025/contratos).
- **Fixtures não contêm PII real.**
- **Sem migração v1 aqui.** Re-ingerir o histórico real das contas Guru (visão Parte 6) é a
  spec de migração; esta spec entrega o mecanismo (`importar-csv` + `sincronizar`).
- **Sem frontend.** O `git diff` de `frontend/` desta spec é vazio.
- **Portas.** Nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` seguem
  como estão; os e2e desta spec rodam contra um Postgres isolado próprio (container dedicado
  `pandora-db-spec021` na porta **55438** — `55432/55433/55435/55436` estão em uso por
  outras sessões).
- **`RegistrarEventoService` é a única porta de escrita de evento** — o adapter nunca faz
  `INSERT` direto em `evento_origem`; nunca toca `evento_etapa`/`transacao`.
