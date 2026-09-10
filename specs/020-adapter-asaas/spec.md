# Feature Specification: Adaptadores de borda da plataforma Asaas

**Feature Branch**: `020-adapter-asaas`

**Created**: 2026-09-10

**Status**: Draft

**Input**: ROADMAP.md Fase 2 (Financeiro), item 020 — "Adapters Asaas (contas PRD e SVC):
webhook por conta, API `GET /payments`, CSV. `externalReference` como ponte para a Guru.
`status_map/asaas/{api,csv}`. Webhooks `POST /webhooks/asaas/{prd,svc}`. Sem frontend."

---

## Contexto

Segunda das **4 specs de adaptadores** da Fase 2 (019 TMB ✅, **020 Asaas**, 021 Guru, 022
Hotmart). Mesmo molde da 019: a spec 006 montou o pipeline canônico e deixou a **etapa 0**
(`RegistrarEventoService.registrarEvento`) como porta exportada "que os adapters das specs
019–022 vão injetar"; a spec 018 plugou as **etapas 2–3** (`RESOLVER_PESSOA`,
`UPSERT_TRANSACAO`) e deixou `financeiro/domain/status-map/` para "cada spec 019–022 adicionar
um `status-map/{tmb,asaas,guru,hotmart}.ts` e registrar em `MAPAS_STATUS`" — a 019 já seguiu
esse passo-a-passo (ver `status-map/README.md`).

Esta spec faz a borda de entrada das **duas contas Asaas** — `ASAAS_PRD` e `ASAAS_SVC`
(`PlataformaOrigem`, enum de 7 contas do `core`) — transformando os payloads crus das 3
fontes da Asaas (webhook de cobrança **por conta**, API `GET /v3/payments`, CSV de export)
em `EventoCanonico` — a forma canônica **validada** que o pipeline já processa — e populando
o vocabulário de status da Asaas. Nenhuma regra de negócio conhece "Asaas": o núcleo continua
canônico, a borda é fina e testada contra **fixtures reais** sem tocar o banco (Princípio III).
Depois do parse, o fluxo é idêntico: worker da 006 → classificar → resolver pessoa → upsert
transação.

A Asaas é um **gateway de cobrança puro** (boleto/pix/cartão). Particularidades que a
modelagem canônica precisa absorver (visão Apêndice A):

- **Sem conceito de oferta/cupom/garantia.** O bloco `oferta` do `EventoCanonico` no máximo
  transporta `nomeOrigem` a partir de `description` — sem `codigoOrigem`.
- **`externalReference` é a ponte para a Guru.** Vai para `EventoCanonico.referenciaExterna.
  idOrigem` **sem** `plataforma` — o adapter não sabe qual conta Guru. Cravar o vínculo
  Asaas↔Guru de fato (Regra Inviolável nº 2 — "uma venda Guru+Asaas conta 1×") é da **spec
  024** (etapa 4 do pipeline). Até lá, `classificar` (006) trata a cobrança como
  `VENDA_PROPRIA` (regra 2 de `classificar` só dispara quando `referenciaExterna.plataforma`
  **também** está preenchido).
- **Dados do comprador vêm só de chamadas extras.** O objeto `payment` do webhook/API traz
  `customer` só como id (`cus_…`) — **sem** nome/e-mail/documento. O `comprador` do
  `EventoCanonico` fica vazio no webhook e na API (o id do cliente fica no `payload_bruto`);
  só o **CSV** de export traz `Cliente`/`Email`/`CPF/CNPJ`/`Telefone`. Enriquecer o comprador
  da Asaas via `GET /v3/customers/{id}` fica para uma spec futura (é uma 2ª chamada de rede —
  fora do parser puro).
- **Assinaturas nativas.** `payment.subscription` (`sub_…`) presente → `assinatura.
  ehRecorrencia = true` → `classificar` resolve `RECORRENCIA`.
- **Sem papel de afiliada.** `ehAfiliada` é sempre indefinido para a Asaas.
- **Moeda não é exposta** — a Asaas opera 100% em BRL; a borda crava `BRL` (default explícito,
  nunca opcional — Padrão Transversal "Dinheiro").

## Clarifications

*020 não está marcada `⚠ clarify` no ROADMAP. As três decisões de fato ambíguas foram
levadas ao dono do produto em 2026-09-10 (A-01, A-02, A-03 abaixo). As demais (A-04..A-16)
são **defaults documentados** — mesmo tratamento das specs 010/017/018/019. Zero
`NEEDS CLARIFICATION` remanescente.*

- **A-01 — Chave natural `id_origem` da Asaas = `payment.id`** (dono do produto, 2026-09-10).
  O id da cobrança Asaas (`"pay_5427905388881530"`), presente de forma consistente nas 3
  fontes (webhook `payment.id`, API `id`, CSV coluna `id`/`Identificador`). É **por conta**:
  o `id_origem` só é único dentro de `(ASAAS_PRD | ASAAS_SVC, payment.id)` — a `PlataformaOrigem`
  desambigua (Padrão Transversal "Multi-conta"). Consequência: os N eventos de uma cobrança
  (criação, confirmação, recebimento, estorno…) resolvem para a **mesma** `(<conta>, <payment.id>)`
  — a Regra Inviolável nº 1 é respeitada por construção; o `UPSERT_TRANSACAO` (018) mantém 1
  linha e o `status_canonico` reflete o **último** evento processado.
- **A-02 — `externalReference` → `referenciaExterna.idOrigem`, sem `plataforma`; o vínculo
  Asaas↔Guru é da spec 024** (dono do produto, 2026-09-10). O adapter transporta o
  `externalReference` cru; **não** deduz qual conta Guru nem marca a cobrança como
  terceirizada. `classificar` (006) mantém `VENDA_PROPRIA` enquanto `referenciaExterna.
  plataforma` está ausente (é exatamente o que o comentário da regra 2 de `classificar` já
  antecipa: "Cravar o vínculo Asaas↔Guru de fato é da spec 024"). A etapa 4
  (`RESOLVER_VINCULO`, spec 024) é quem, ao casar a cobrança com a transação Guru, marca a
  Asaas como não-receita / não resolve Oferta/Contrato próprios (Regra Inviolável nº 2).
  Cobrança Asaas **avulsa** (sem `externalReference`) resolve tudo normalmente.
- **A-03 — Escopo desta spec: parser puro + endpoints finos em `/ingestao/asaas/*`** (dono do
  produto, 2026-09-10). Entrega as **3 fontes**: funções puras `parse*()` + **fixtures reais**
  + `status-map/asaas.ts`. Superfície HTTP:
  - **Webhooks públicos por conta** `POST /webhooks/asaas/prd` e `POST /webhooks/asaas/svc`
    (o prefixo `/webhooks/` já é allowlist pública desde a 003; a 019 abriu os 2 primeiros
    `/webhooks/*`).
  - **Sincronização por API sob demanda** `POST /ingestao/asaas/sincronizar` (autenticado,
    `evento:ingerir`) — `{ conta, dataInicio?, dataFinal?, limit? }`; pagina
    `GET /v3/payments` (offset/limit) e registra cada cobrança.
  - **Import CSV** `POST /ingestao/asaas/importar-csv` (autenticado, `evento:ingerir`) —
    `{ conta, conteudo, fonte? }`; CSV como **texto no corpo JSON**, **0 dependência nova**
    de upload binário (mesmo padrão das specs 015/019).

  A superfície `admin/` completa fica para a spec de migração/admin — abrir o `AdminModule`
  (vazio desde a 001) agora seria prematuro.
- **A-04 — Autenticação do webhook.** A Asaas envia o token configurado no header
  **`asaas-access-token`** (a "Access Token" que se define ao criar o webhook). O controller
  lê esse header (case-insensitive), com `authorization: Bearer <token>` como _fallback_
  aceito, e passa o valor a `WebhookAuthenticator.autenticar(<conta>, token)` (003) — que
  compara `ASAAS_PRD_WEBHOOK_TOKEN` / `ASAAS_SVC_WEBHOOK_TOKEN` em tempo constante. Token
  ausente/errado → **401**, corpo genérico, **nenhum** `evento_origem`. Isto é separado do
  `JwtAuthGuard`. **Não** usa HMAC (a Asaas não assina o corpo — diferente do WhatsApp/011).
- **A-05 — `statusOrigem` = `payment.status` cru**, com um único ajuste: quando
  `payment.deleted === true` (evento `PAYMENT_DELETED` / cobrança removida), o adapter emite
  `statusOrigem = "DELETED"` (o `payment.status` fica congelado no valor anterior e não
  reflete a remoção). `DELETED → CANCELADO` no `status-map`. `PAYMENT_RESTORED` volta a
  `payment.status`.
- **A-06 — `tipoOrigem` = o rótulo da fonte, e é a chave `fonte` do `status-map`.**
  Convenção congelada: `asaas.webhook`, `asaas.api`, `asaas.csv`. `mapearStatus(plataforma,
  fonte, bruto)` (018) recebe `plataforma = "ASAAS_PRD"` ou `"ASAAS_SVC"` (o valor do enum) e
  `fonte = tipoOrigem`; `MAPAS_STATUS.ASAAS_PRD[fonte][statusBruto]` e
  `MAPAS_STATUS.ASAAS_SVC[fonte][statusBruto]` apontam para o **mesmo** objeto `ASAAS` via
  `Object.assign(MAPAS_STATUS, { ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS })`.
- **A-07 — Onde vive o adapter.** `src/ingestao/adapters/asaas/` (visão Apêndice C —
  `ingestao/adapters/{asaas,…}/{webhook,csv,api}`). As `parse*()` são **puras**, sem NestJS,
  sem Prisma, sem `fetch` — recebem o payload/linha já desserializado **+ a `conta`** e
  devolvem `{ eventoCanonico?, idOrigem?, tipoOrigem, payloadBruto, erros[] }`. Ficam dentro
  do _bounded context_ `ingestao`; **não** importam `financeiro` (o `status-map/asaas.ts`
  vive em `financeiro/` e é consumido lá pela etapa 3 — o adapter só produz `statusOrigem`
  cru) nem `clientes`.
- **A-08 — Webhooks finos e resilientes** (idêntico à 019/D-07). Cada webhook: (1) autentica;
  (2) desserializa o corpo; (3) chama `parseWebhookAsaas(body, conta)`; (4) chama
  `RegistrarEventoService.registrarEvento` com o `payloadBruto` **sempre** e o
  `eventoCanonico` **só se o parse não acumulou erro fatal**; (5) responde **`200 OK`** com
  `{ registrados, ignorados }` — o worker da 006 faz o resto. Falha de persistência (etapa 0)
  → **5xx** (a Asaas reenvia; a doc da Asaas espera 200 e re-tenta em fila senão). Erro de
  **parse** MUST NOT virar 5xx: o evento cru é persistido, `evento_canonico` fica nulo, e
  `classificar` marca `revisar` — nada some.
- **A-09 — Payload de webhook sem `payment` / sem `payment.id`** (evento não-cobrança —
  `TRANSFER_*`, `SUBSCRIPTION_*` que a Asaas manda para a mesma URL, ou lixo): sem identidade
  não há como deduplicar nem projetar → conta em `ignorados` e é **logado**, sem ser
  registrado (mesmo comportamento do controller da 019 para "sem pedido"). `{ registrados: 0,
  ignorados: 1 }`, resposta `200`.
- **A-10 — Mapa de valores monetários.** `valores.bruto` = `payment.value`; `valores.liquido`
  = `payment.netValue` quando presente; `valores.taxas` = `value − netValue` **só quando os
  dois são numéricos e `0 < resultado < value`** (guarda de sanidade), senão omitido.
  `originalValue`, `interestValue`, `discount`, `refunds[]` ficam **só no `payload_bruto`** —
  não há campo canônico para eles nesta fatia. Toda conversão usa a escala ×10000 do `core`
  (`Dinheiro.deDecimal`); `float` proibido no resultado. Moeda sempre `BRL`.
- **A-11 — O adapter não classifica.** `EventoCanonico.classificacao` fica indefinido; a
  etapa 1 resolve — `status = "REFUNDED"` casa o regex de estorno de `classificar` (006) e
  vira `REEMBOLSO`; `subscription` presente → `RECORRENCIA`; o resto é `VENDA_PROPRIA` (a
  Asaas não tem afiliada). O regex `RE_ESTORNO` já foi ampliado na 019 e cobre `refund` /
  `chargeback` / `charge_back` — **nenhuma mudança em `classificar` nesta spec**.
- **A-12 — `ocorridoEm`.** webhook/API: `paymentDate` ?? `confirmedDate` ?? `clientPaymentDate`
  ?? `dateCreated` ?? `""`. CSV: coluna `data_pagamento` ?? `data_criacao` ?? `vencimento` ??
  `""`. O parser **não** chama `parseInstante` (mantém-se livre de locale/tempo) — passa a
  string crua; a etapa 3 (018) aplica `parseInstante` do `core` (que tolera `"2024-05-10"`
  date-only, `"2024-05-10 11:20:32"` com espaço, ISO com fuso).
- **A-13 — `TmbApiClient` análogo: `AsaasApiClient`.** Interface + token DI
  (`ASAAS_API_CLIENT`), impl real com **`fetch` nativo do Node 24** (0 dep — padrão
  `GraphApiClient`/011, `TmbApiClient`/019). `GET {base}/v3/payments?offset=&limit=&
  dateCreated[ge]=&dateCreated[le]=`, header **`access_token: <ASAAS_<conta>_API_KEY>`** (a
  Asaas usa esse header, **não** `Bearer`) + `User-Agent`. Paginação `offset`/`limit`
  (default 100, teto 100 na Asaas) enquanto `body.hasMore === true`. `ASAAS_<conta>_API_KEY`
  ausente → `AsaasApiIndisponivelError` → `/sincronizar` responde **422** (não 500). Base
  default `https://api.asaas.com/v3` quando `ASAAS_<conta>_API_BASE_URL` não está setado.
- **A-14 — RBAC: nenhuma permissão nova.** Webhooks são `@Public()` (prefixo `/webhooks/`).
  `POST /ingestao/asaas/*` reusam `evento:ingerir` (catálogo desde a 006). **0 migração de
  dados/seed.**
- **A-15 — Config.** `ASAAS_PRD_*` e `ASAAS_SVC_*` (`_API_BASE_URL`, `_API_KEY`,
  `_WEBHOOK_TOKEN`) **já existem** no `env.schema` como `accountConfig` (spec 001/003) —
  **0 chave `.env` nova**.
- **A-16 — Sem migração, sem tabela, sem frontend, `CONTEXT_MODULES` = 11.** O adapter é
  subdiretório do `ingestao`. `evento_origem`/`evento_etapa`/`transacao` já existem
  (006/018). Os eventos aparecem no painel **Eventos** (006) e as transações em **Financeiro ·
  Transações** (018) sem nenhuma mudança de frontend.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Webhook de cobrança da Asaas vira transação (Priority: P1)

A Asaas dispara `POST /webhooks/asaas/prd` (ou `/svc`) a cada mudança de estado de uma
cobrança (`PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
`PAYMENT_REFUNDED`, `PAYMENT_DELETED`…). O sistema autentica o token da conta, registra o
evento cru, e o worker projeta uma `transacao` `(ASAAS_PRD, <payment.id>)` com valor em BRL,
`status_canonico` traduzido e a `referenciaExterna` (quando há `externalReference`).

**Why this priority**: é o caminho primário de entrada de dados da Asaas (webhook = caminho
primário — visão 5.5). Sem ele não há ledger das contas Asaas.

**Independent Test**: `POST /webhooks/asaas/prd` com uma fixture real de `PAYMENT_RECEIVED` e
o token correto → `200` → `POST /ingestao/eventos/processar` → `GET /financeiro/transacoes`
mostra 1 transação `ASAAS_PRD` com `status_canonico = PAGO`, `classificacao = VENDA_PROPRIA`,
`valor_bruto` reidratável como `Dinheiro{BRL}`.

**Acceptance Scenarios**:

1. **Given** o header `asaas-access-token` correto e uma fixture `PAYMENT_RECEIVED`, **When**
   `POST /webhooks/asaas/prd`, **Then** resposta `200`, existe um `evento_origem` `ASAAS_PRD`
   / `asaas.webhook` com `payload_bruto` idêntico ao recebido e `evento_canonico` preenchido.
2. **Given** o evento acima, **When** o worker processa a passada, **Then** existe `transacao`
   com `plataforma_origem = ASAAS_PRD`, `id_origem = "<payment.id>"`, `status_canonico = PAGO`,
   `valor_bruto = { valorInt, moeda: "BRL" }`, e a etapa `UPSERT_TRANSACAO` está `ok`.
3. **Given** uma fixture `PAYMENT_OVERDUE` (`status = OVERDUE`), **When** processada, **Then**
   `transacao.status_canonico = EM_ATRASO`.
4. **Given** uma fixture `PAYMENT_DELETED` (`deleted = true`), **When** processada, **Then**
   `transacao.status_canonico = CANCELADO`.
5. **Given** um token ausente ou errado, **When** `POST /webhooks/asaas/prd`, **Then**
   resposta **401** e **nenhum** `evento_origem` é criado.
6. **Given** o **mesmo** token de PRD enviado para `/webhooks/asaas/svc`, **When** recebido,
   **Then** **401** (cada conta valida só o seu `ASAAS_<conta>_WEBHOOK_TOKEN`).

---

### User Story 2 — Cobrança Guru+Asaas: a Asaas carrega a ponte, não conta 2× (Priority: P1)

Uma venda que a Guru terceiriza para a Asaas gera uma cobrança Asaas com
`externalReference` apontando para a transação Guru. O adapter transporta esse
`externalReference` para `referenciaExterna.idOrigem`; a cobrança é registrada como
transação `ASAAS_*` **própria** nesta fatia (o vínculo e a exclusão de receita são da spec
024) — mas o `payload_bruto` e o `EventoCanonico` já carregam tudo que a 024 precisa.

**Why this priority**: materializa a Regra Inviolável nº 2 no ponto de entrada. Sem o
`externalReference` no `EventoCanonico`, a spec 024 não teria como casar.

**Independent Test**: `POST /webhooks/asaas/prd` com `payment.externalReference = "guru-tx-abc"`
→ `evento_origem` cujo `evento_canonico.referenciaExterna = { idOrigem: "guru-tx-abc" }` (sem
`plataforma`); após `processar`, `transacao.classificacao = VENDA_PROPRIA` (regra 2 de
`classificar` **não** dispara sem `referenciaExterna.plataforma`).

**Acceptance Scenarios**:

1. **Given** uma fixture `PAYMENT_CONFIRMED` com `externalReference` não-vazio, **When**
   registrada, **Then** `evento_canonico.referenciaExterna.idOrigem` == esse valor e
   `referenciaExterna.plataforma` é ausente.
2. **Given** o evento acima, **When** processado, **Then** `transacao.precisa_revisao =
   false` e `transacao.classificacao ∈ { VENDA_PROPRIA, RECORRENCIA }` conforme haja
   `subscription` — **nunca** `DESCONHECIDO`/revisão por causa do `externalReference` (a
   regra 2 de `classificar` só dispara com `referenciaExterna.plataforma` presente). A
   exclusão de receita fica para a spec 024.
3. **Given** uma cobrança Asaas **sem** `externalReference`, **When** registrada, **Then**
   `evento_canonico.referenciaExterna` é ausente.

---

### User Story 3 — Sincronização por API sob demanda (Priority: P2)

A equipe dispara `POST /ingestao/asaas/sincronizar` com `{ conta, dataInicio, dataFinal }`
para reconciliar cobranças que um webhook pode ter perdido. O sistema pagina
`GET /v3/payments` (offset/limit) da conta indicada, registra cada cobrança como evento
`asaas.api` e devolve um resumo.

**Why this priority**: a API é o caminho **sob demanda** (visão 5.5) — rede de segurança para
falha de webhook. P2.

**Independent Test**: com um `AsaasApiClient` dublê devolvendo 2 páginas → `POST
/ingestao/asaas/sincronizar { conta: "ASAAS_PRD" }` → resumo `{ paginas: 2, recebidos: N,
novos: N, dedup: 0 }` e N `evento_origem` `ASAAS_PRD` / `asaas.api`.

**Acceptance Scenarios**:

1. **Given** `ASAAS_PRD_API_KEY` configurado e a API devolvendo 1 página com 3 cobranças,
   **When** `POST /ingestao/asaas/sincronizar { conta: "ASAAS_PRD", dataInicio, dataFinal }`,
   **Then** 3 `evento_origem` `ASAAS_PRD` / `asaas.api` e resposta `{ paginas: 1, recebidos:
   3, novos: 3, dedup: 0 }`.
2. **Given** uma cobrança que já entrou por webhook (`(ASAAS_PRD, pay_1)`), **When** a
   sincronização traz a mesma cobrança, **Then** o evento `asaas.api` é registrado como um
   **fato novo** (hash diferente do webhook), mas `UPSERT_TRANSACAO` **atualiza** a transação
   existente — nunca cria uma 2ª linha.
3. **Given** `ASAAS_PRD_API_KEY` ausente, **When** `POST /ingestao/asaas/sincronizar { conta:
   "ASAAS_PRD" }`, **Then** resposta **422** com `{ message: "conta ASAAS_PRD sem API
   configurada" }` e nenhum evento.
4. **Given** a API da Asaas responde `500` na 2ª página, **When** a sincronização roda,
   **Then** as cobranças da 1ª página **já foram registradas** (commit por página), a
   resposta informa o erro parcial, e re-disparar é idempotente (dedup por hash).
5. **Given** `{ conta: "ASAAS_XYZ" }` (fora do enum de contas Asaas), **When** recebido,
   **Then** **422** (`conta` inválida no DTO).

---

### User Story 4 — Import de CSV (Priority: P3)

A equipe cola o conteúdo de um export CSV de cobranças da Asaas em
`POST /ingestao/asaas/importar-csv` com a `conta`; cada linha vira um evento `asaas.csv`.
Linhas malformadas são reportadas sem abortar o lote.

**Why this priority**: caminho de migração/backfill (visão Parte 6). Útil, mas não bloqueia a
operação corrente.

**Independent Test**: um CSV com 3 linhas boas + 1 linha sem `id` → `{ linhas: 4, novos: 3,
ignoradas: 1, erros: ["linha 3: sem identificador de cobrança"] }`.

**Acceptance Scenarios**:

1. **Given** um CSV válido da Asaas com cabeçalho e 5 linhas de cobranças, **When** `POST
   /ingestao/asaas/importar-csv { conta, conteudo }`, **Then** 5 `evento_origem` `<conta>` /
   `asaas.csv` e a resposta resume `{ linhas: 5, novos: 5, ignoradas: 0 }`.
2. **Given** o mesmo CSV enviado 2 vezes, **When** o 2º import roda, **Then** `novos: 0`,
   `dedup: 5` — nenhum evento nem transação duplicada.
3. **Given** uma linha sem valor no campo de id, **When** o import roda, **Then** essa linha
   entra em `ignoradas`, as demais são processadas, e o erro é listado com o número da linha.
4. **Given** um separador `;` em vez de `,` (comum em export BR), **When** o import roda,
   **Then** o parser detecta o separador e processa as linhas corretamente.

---

### Edge Cases

- **Payload de webhook com atributo novo não tratado**: o parser **ignora** campos
  desconhecidos — nunca lança por chave a mais. O `payload_bruto` guarda tudo.
- **`payment.customer` só como `cus_…`**: o `comprador` do `EventoCanonico` fica vazio no
  webhook/API; a etapa `RESOLVER_PESSOA` (018) tolera comprador vazio (cria/não resolve
  `pessoa` sem quebrar). O id do cliente fica no `payload_bruto`.
- **`netValue` ausente** (cobrança pendente ainda sem líquido): `valores` fica só com
  `bruto`; a transação é atualizada só no que o evento carrega.
- **`value` ausente / não-numérico**: `valores` fica sem `bruto`; erro não-fatal em `erros`;
  o evento cru é registrado e vai para revisão.
- **`deleted: true` com `status` congelado em `PENDING`**: `statusOrigem = "DELETED"` (A-05)
  → `CANCELADO`.
- **Array de eventos no corpo do webhook**: a Asaas manda **1 evento por request**; o parser
  aceita `{ event, payment }` e também um array `[{ event, payment }]` defensivamente (1
  `EventoCanonico` por item).
- **CSV com BOM / encoding Latin-1**: o corpo chega como texto já decodificado; o parser
  tolera BOM inicial. Encoding é responsabilidade de quem exporta (documentado).
- **Dois eventos idênticos** (reentrega): geram o **mesmo** hash → o 2º é dedup na etapa 0.
- **`conta` do path (`prd`/`svc`) fixa o `plataforma_origem`** — o corpo do webhook nunca
  altera a conta (o `payment` não tem esse campo, e mesmo que tivesse seria ignorado).

---

## Requirements *(mandatory)*

### Functional Requirements

**Parsers puros (as 3 fontes)**

- **FR-001**: O sistema MUST prover `parseWebhookAsaas(payload, conta) → ResultadoParseAsaas[]`
  puro (sem NestJS/Prisma/rede) que aceita `{ event, payment }` (ou um array disso) e produz
  **um** `EventoCanonico` por item com `plataformaOrigem = conta`,
  `idOrigem = String(payment.id)`, `tipoOrigem = "asaas.webhook"`,
  `statusOrigem = payment.deleted ? "DELETED" : payment.status` (cru), `ocorridoEm` conforme
  A-12, `valores` conforme A-10, `assinatura.ehRecorrencia = true` sse `payment.subscription`
  não-vazio, `referenciaExterna = { idOrigem: payment.externalReference }` sse não-vazio,
  `oferta.nomeOrigem = payment.description` quando houver.
- **FR-002**: O sistema MUST prover `parsePagamentoApi(payment, conta) → ResultadoParseAsaas`
  puro para um item de `GET /v3/payments`, com `tipoOrigem = "asaas.api"` e o mesmo
  mapeamento da FR-001 (o objeto `payment` da API tem a mesma forma do de webhook).
- **FR-003**: O sistema MUST prover `parseCsvAsaas(conteudo, conta) → ResultadoParseAsaas[]`
  puro, com `tipoOrigem = "asaas.csv"`, tolerante a separador `,` e `;` (detecção pelo
  cabeçalho), a BOM inicial e a aspas; mapeia `id`/`Identificador`, `status`, `valor`,
  `valor_liquido`, `data_criacao`, `data_pagamento`, `vencimento`, `descricao`,
  `referencia_externa`, `assinatura`, e os campos de comprador (`cliente`, `email`,
  `cpf_cnpj`, `telefone`).
- **FR-004**: Todo parser MUST devolver `{ eventoCanonico?, idOrigem?, tipoOrigem,
  payloadBruto, erros: string[] }`. Sem identificador de cobrança → `eventoCanonico` ausente
  + erro descritivo (nunca lança). Campo desconhecido no payload → **ignorado** (nunca erro).
- **FR-005**: Nenhum parser MUST tocar o banco, fazer I/O ou depender de locale/fuso do
  processo. `Dinheiro`/`Moeda` do `core` e utilitários locais de string são as únicas
  dependências; `parseInstante` **não** é chamado no parser (a etapa 3 o aplica).
- **FR-006**: Todo parser MUST ser exercido por teste unitário contra **fixtures reais** da
  Asaas em `src/ingestao/adapters/asaas/fixtures/` (Princípio III). As fixtures NÃO contêm
  PII real (dados fictícios equivalentes em forma).
- **FR-007**: Os parsers MUST aceitar a `conta` (`ASAAS_PRD` | `ASAAS_SVC`) como parâmetro e
  cravá-la em `plataformaOrigem` — o payload da Asaas nunca a determina.

**Webhooks públicos**

- **FR-008**: O sistema MUST expor `POST /webhooks/asaas/prd` e `POST /webhooks/asaas/svc`
  como rotas **públicas** (sem `JwtAuthGuard`), autenticadas por `WebhookAuthenticator` (003)
  com `ASAAS_PRD_WEBHOOK_TOKEN` / `ASAAS_SVC_WEBHOOK_TOKEN` respectivamente, lendo o header
  `asaas-access-token` (case-insensitive) com `authorization: Bearer` como _fallback_. Token
  inválido/ausente → **401**, corpo genérico, **nenhum** `evento_origem` criado.
- **FR-009**: Cada webhook MUST, após autenticar: desserializar o corpo, chamar
  `parseWebhookAsaas(body, conta)`, e chamar `RegistrarEventoService.registrarEvento` **uma
  vez por fato** com `payloadBruto` sempre presente e `eventoCanonico` presente só quando o
  parse não acumulou erro. Responde **`200 OK`** com `{ registrados, ignorados }`.
- **FR-010**: Se `RegistrarEventoService` lançar (falha de persistência da etapa 0), o
  webhook MUST responder **5xx** (a Asaas reenvia). Erro de **parse** MUST NOT virar 5xx: o
  evento cru é persistido e segue para revisão.
- **FR-011**: Payload de webhook sem `payment.id` MUST contar em `ignorados` (logado, **não**
  registrado); `{ registrados: 0, ignorados: n }`, resposta `200`.

**Sincronização por API**

- **FR-012**: O sistema MUST prover um `AsaasApiClient` atrás de uma interface (dublê nos
  testes), usando **`fetch` nativo do Node 24** (0 dep nova), com header
  `access_token: <ASAAS_<conta>_API_KEY>` + `User-Agent`, base `ASAAS_<conta>_API_BASE_URL`
  ?? `https://api.asaas.com/v3`, que pagina `GET /v3/payments` por `offset`/`limit`
  (default/teto 100) enquanto `hasMore`, aceitando `dateCreated[ge]` / `dateCreated[le]`.
- **FR-013**: `POST /ingestao/asaas/sincronizar` (autenticado, `evento:ingerir`) MUST aceitar
  `{ conta: "ASAAS_PRD" | "ASAAS_SVC", dataInicio?, dataFinal?, limit? }`, chamar o client,
  `parsePagamentoApi` cada item, registrar via `RegistrarEventoService`, e devolver
  `{ conta, paginas, recebidos, novos, dedup, ignorados, erros[] }`. Commit por página.
- **FR-014**: Se `ASAAS_<conta>_API_KEY` não estiver configurado,
  `POST /ingestao/asaas/sincronizar` MUST responder **422** com motivo claro — nunca 500.
- **FR-015**: A sincronização MUST ser idempotente por hash: re-disparar a mesma janela não
  cria eventos nem transações duplicadas.

**Import CSV**

- **FR-016**: `POST /ingestao/asaas/importar-csv` (autenticado, `evento:ingerir`) MUST
  aceitar `{ conta, conteudo: string, fonte?: "asaas.csv" }`, dividir em linhas,
  `parseCsvAsaas` cada uma, registrar as válidas, e devolver `{ conta, linhas, novos, dedup,
  ignoradas, erros[] }` — linha malformada **não** aborta o lote.
- **FR-017**: O import CSV MUST ser idempotente por hash (2º import → `novos: 0`).

**Status canônico da Asaas**

- **FR-018**: O sistema MUST criar `src/financeiro/domain/status-map/asaas.ts` exportando
  `ASAAS: Record<string, Record<string, StatusTransacaoCanonico>>` com as 3 fontes
  (`asaas.webhook`, `asaas.api`, `asaas.csv`) e registrar em `MAPAS_STATUS` via
  `Object.assign(MAPAS_STATUS, { ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS })` em
  `status-map/index.ts`.
- **FR-019**: O mapa MUST cobrir, no mínimo: `RECEIVED → PAGO`, `CONFIRMED → PAGO`,
  `RECEIVED_IN_CASH → PAGO`, `DUNNING_RECEIVED → PAGO`, `PENDING → PENDENTE`,
  `AWAITING_RISK_ANALYSIS → PENDENTE`, `OVERDUE → EM_ATRASO`, `DUNNING_REQUESTED → EM_ATRASO`,
  `REFUNDED → ESTORNADO`, `REFUND_REQUESTED → ESTORNADO`, `REFUND_IN_PROGRESS → ESTORNADO`,
  `CHARGEBACK_REQUESTED → CHARGEBACK`, `CHARGEBACK_DISPUTE → CHARGEBACK`,
  `AWAITING_CHARGEBACK_REVERSAL → CHARGEBACK`, `DELETED → CANCELADO` (sintético — A-05).
  `asaas.webhook`, `asaas.api` e `asaas.csv` compartilham o mesmo vocabulário (o CSV de
  export espelha o enum da API — Assumption, ver §Assumptions).
- **FR-020**: Qualquer valor bruto fora do mapa MUST resultar em `DESCONHECIDO` + revisão
  (comportamento já garantido por `mapearStatus` da 018 — esta spec só popula o mapa).
- **FR-021**: Cada entrada do mapa MUST ser justificada por uma fixture real correspondente
  no teste de `status-map` (Princípio III).

**Fronteiras / não-regressão**

- **FR-022**: `src/ingestao/adapters/asaas/**` MUST NOT importar `src/financeiro/**` nem
  `src/clientes/**` (ESLint `import/no-restricted-paths` já cobre `ingestao → financeiro/
  clientes`). O `status-map/asaas.ts` vive em `src/financeiro/**` e é consumido lá.
- **FR-023**: `src/financeiro/domain/status-map/**` MUST NOT importar `ingestao` — só o
  `core` (enum `StatusTransacaoCanonico`).
- **FR-024**: Esta spec MUST NOT alterar `worker.service.ts`, `pipeline-wiring.module.ts`,
  `etapas.ts`, `classificar.ts`, nem o schema Prisma. Nenhuma migração.
- **FR-025**: `CONTEXT_MODULES` MUST seguir com **11**; `/health` inalterado.
- **FR-026**: A suíte e2e 003–019 MUST seguir verde sem alteração de comportamento.

### Key Entities

- **`EventoCanonico`** (contrato do `core`, spec 006/018) — o que os parsers produzem.
  Nenhum campo novo; a Asaas usa o núcleo obrigatório + `valores` + `referenciaExterna` +
  `assinatura` + `oferta.nomeOrigem`.
- **`ResultadoParseAsaas`** — `{ eventoCanonico?: EventoCanonico; idOrigem?: string;
  tipoOrigem: FonteAsaas; payloadBruto: unknown; erros: string[] }`. Contrato de saída
  **uniforme** dos 3 parsers.
- **`AsaasApiClient`** (interface + impl `fetch`) — `listarPagamentos({ conta, dataInicio?,
  dataFinal?, offset, limit }) → { itens: unknown[]; temProximaPagina: boolean }`. Dublê nos
  testes; a impl real nunca é exercida em teste unitário/e2e.
- **`status-map/asaas.ts`** (dado, em `financeiro/domain/status-map/`) — vocabulário bruto da
  Asaas → `StatusTransacaoCanonico`, por fonte, compartilhado entre PRD e SVC.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma fixture real de webhook `PAYMENT_RECEIVED` com token válido →
  `POST /webhooks/asaas/prd` responde `200`, cria **1** `evento_origem`
  `ASAAS_PRD`/`asaas.webhook`, e após `processar` existe **exatamente 1** `transacao`
  `(ASAAS_PRD, <payment.id>)` com `status_canonico = PAGO`.
- **SC-002**: `POST /webhooks/asaas/prd` sem token / token errado / token da outra conta →
  **401** e `count(evento_origem) == 0`.
- **SC-003**: `PAYMENT_CONFIRMED` com `externalReference` → `evento_canonico.referenciaExterna
  = { idOrigem: <valor> }` (sem `plataforma`); após `processar`, `transacao.precisa_revisao =
  false` e `classificacao` ∈ `{ VENDA_PROPRIA, RECORRENCIA }` — **nunca** `DESCONHECIDO` por
  causa do `externalReference`.
- **SC-004**: `PAYMENT_RECEIVED` seguido de `PAYMENT_REFUNDED` para o mesmo `payment.id` →
  **2** `evento_origem`, **1** `transacao`, `status_canonico` final `ESTORNADO`,
  `classificacao = REEMBOLSO` (Regra Inviolável nº 1).
- **SC-005**: `PAYMENT_DELETED` (`deleted = true`) → `transacao.status_canonico = CANCELADO`.
- **SC-006**: `payment.status` fora do vocabulário mapeado → `transacao.status_canonico =
  DESCONHECIDO`, `precisa_revisao = true`, `evento_origem.status = revisar` — **nunca** um
  status que libera acesso (Regra nº 15).
- **SC-007**: `POST /ingestao/asaas/sincronizar` com um `AsaasApiClient` dublê de 2 páginas →
  resposta `{ paginas: 2, recebidos, novos, dedup: 0, erros: [] }` e os `evento_origem`
  `asaas.api` correspondentes; re-disparo → `novos: 0`.
- **SC-008**: `POST /ingestao/asaas/sincronizar { conta: "ASAAS_PRD" }` sem `ASAAS_PRD_API_KEY`
  → **422**, `0` eventos.
- **SC-009**: `POST /ingestao/asaas/importar-csv` com 5 linhas boas + 1 ruim → `200`,
  `{ linhas: 6, novos: 5, ignoradas: 1 }`; 2º import do mesmo conteúdo → `novos: 0`.
- **SC-010**: Todo valor monetário produzido pelos parsers é `Dinheiro{ valorInt: bigint,
  moeda: "BRL" }` — nenhum `float` no caminho (verificável por tipo/`grep`).
- **SC-011**: `GET /admin/rbac/permissoes` **não** ganha nenhuma permissão nova; nenhuma
  migração roda no `setup-db`.
- **SC-012**: `src/ingestao/adapters/asaas` não importa `financeiro`/`clientes`;
  `src/financeiro/domain/status-map` não importa `ingestao` (ESLint verde). `/health` segue
  com **11** contextos.
- **SC-013**: Regressão — suíte e2e 003–019 verde; nenhuma alteração em `worker.service.ts`,
  `etapas.ts`, `pipeline-wiring.module.ts`, `classificar.ts` ou no schema Prisma
  (verificável por `git diff`).
- **SC-014**: Cada entrada de `status-map/asaas.ts` tem uma fixture real que a exercita no
  teste de `status-map` (cobertura de vocabulário verificável).
- **SC-015**: As duas contas são isoladas: um webhook em `/svc` com o token de PRD → 401; um
  evento de `/prd` e um de `/svc` para o mesmo `payment.id` geram **2** transações distintas
  (`(ASAAS_PRD, id)` e `(ASAAS_SVC, id)`).

---

## Assumptions

- **Header do token de webhook da Asaas.** A Asaas envia a "Access Token" configurada no
  webhook no header `asaas-access-token`. Assume-se esse nome (case-insensitive), com
  `authorization: Bearer <token>` como _fallback_ aceito. Se a conta usar outro nome, é
  config — não muda o código do adapter.
- **`GET /v3/payments` retorna todas as cobranças da conta** (paginado por `offset`/`limit`,
  `hasMore`), incluindo removidas quando `?deleted=true` (a sincronização padrão não passa
  esse filtro — foca em cobranças vivas; cancelamentos chegam por webhook `PAYMENT_DELETED`).
- **Base URL da API.** `https://api.asaas.com/v3` (produção) quando
  `ASAAS_<conta>_API_BASE_URL` não está setado; sandbox (`https://api-sandbox.asaas.com/v3`)
  é config.
- **Formato do CSV da Asaas.** Não há CSV de exemplo na doc consultada
  (`Documentação Asaas (LLM).md` é um índice de links). Assume-se um export com cabeçalho
  cujas colunas espelham o objeto `payment` (`id`/`Identificador`, `status`, `value`/`valor`,
  `netValue`/`valor_liquido`, `dateCreated`/`data_criacao`, `paymentDate`/`data_pagamento`,
  `dueDate`/`vencimento`, `description`/`descricao`, `externalReference`/`referencia_externa`,
  `subscription`/`assinatura`, `customer`/`cliente`, `email`, `cpfCnpj`/`cpf_cnpj`,
  `phone`/`telefone`) e cujo `status` usa o **mesmo enum da API** (`RECEIVED` etc.). A
  fixture de CSV é montada nesse formato; ajustar quando um export real aparecer é trocar a
  fixture + o mapa de colunas/status, não a arquitetura (mesmo precedente da 019).
- **`comprador` da Asaas via webhook/API fica vazio.** O objeto `payment` não embute os dados
  de contato do cliente (só `customer: "cus_…"`). Enriquecer via `GET /v3/customers/{id}` é
  uma 2ª chamada de rede — fora do parser puro e desta spec. `RESOLVER_PESSOA` (018) tolera
  comprador vazio.
- **Fixtures não contêm PII real.**
- **Sem migração v1 aqui.** Re-ingerir o histórico real das contas Asaas (visão Parte 6) é a
  spec de migração; esta spec entrega o mecanismo (`importar-csv` + `sincronizar`).
- **Sem frontend.** O `git diff` de `frontend/` desta spec é vazio.
- **Portas.** Nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` seguem como
  estão; os e2e desta spec rodam contra um Postgres isolado próprio (container dedicado
  `pandora-db-spec020` na porta **55437** — `55432/55433/55435/55436` já estão em uso por
  outras sessões; `55434` fica de reserva).
- **`RegistrarEventoService` é a única porta de escrita de evento** — o adapter nunca faz
  `INSERT` direto em `evento_origem`; nunca toca `evento_etapa`/`transacao`.
