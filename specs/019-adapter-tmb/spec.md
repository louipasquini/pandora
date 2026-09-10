# Feature Specification: Adaptadores de borda da plataforma TMB Educação

**Feature Branch**: `019-adapter-tmb`

**Created**: 2026-09-10

**Status**: Draft

**Input**: ROADMAP.md Fase 2 (Financeiro), item 019 — "Adapters TMB: webhook Vendas
(payload achatado) + webhook Financeiro (nível de parcela, só `status_financeiro`), API
`GET /api/pedidos`, CSV. `parse(payload|linha) → EventoCanonico`. `status_map/tmb/{api,csv}`
versionados. Fixtures reais. Webhooks públicos `POST /webhooks/tmb/{vendas,financeiro}`.
Sem frontend."

---

## Contexto

Primeira das **4 specs de adaptadores** da Fase 2 (019 TMB, 020 Asaas, 021 Guru, 022
Hotmart). A spec 006 montou o pipeline canônico de ingestão (visão 5.3) e deixou a **etapa 0**
(`RegistrarEventoService.registrarEvento`) como porta exportada "que os adapters das specs
019–022 vão injetar". A spec 018 plugou as **etapas 2–3** (`RESOLVER_PESSOA`,
`UPSERT_TRANSACAO`) e entregou o registro `financeiro/domain/status-map/` **vazio**, com o
comentário explícito: "cada spec 019–022 adiciona um `status-map/{tmb,asaas,guru,hotmart}.ts`
e registra em `MAPAS_STATUS`".

Esta spec faz o **outro lado** da borda para a conta única **`TMB`**: transforma os payloads
crus das 4 fontes da TMB (webhook Vendas, webhook Financeiro, API REST, CSV) em
`EventoCanonico` — a forma canônica **validada** que o pipeline já sabe processar — e popula
o vocabulário de status da TMB. Nenhuma regra de negócio conhece "TMB": o núcleo continua
canônico, a borda é fina e testada contra **fixtures reais** sem tocar o banco (Princípio III
da constituição). Depois do parse, o fluxo é idêntico ao de qualquer outro evento: worker da
006 → classificar → resolver pessoa → upsert transação.

A TMB é um **checkout/ERP educacional** de parcelamento de boleto. Particularidades que a
modelagem canônica precisa absorver (visão Apêndice A):

- **Sem conceito de assinatura/recorrência.** O bloco `assinatura` do `EventoCanonico` nunca
  é preenchido para a TMB.
- **Método de pagamento não exposto** e **data de vencimento não retornada.** Não há campo
  canônico obrigatório para eles; ficam só no `payload_bruto` imutável.
- **Webhook de Vendas tem payload achatado** — `cliente` é o nome numa string, telefones
  numa string separada por vírgula, endereço em campos soltos.
- **Webhook Financeiro é nível de parcela** — um pedido parcelado em N vezes gera N
  notificações, cada uma com `parcela_id` e `status_pagamento` próprios; a única coisa que
  muda de fato é o status. A transação do ledger é **nível de pedido** (ver D-02).
- **Sem papel de afiliada.** `ehAfiliada` é sempre `false` para a TMB.
- **Moeda não é exposta** — a TMB opera 100% em BRL; a borda crava `BRL` (default explícito
  na borda, nunca opcional — Padrão Transversal "Dinheiro").

## Clarifications

*019 não está marcada `⚠ clarify` no ROADMAP. As três decisões de fato ambíguas foram
levadas ao dono do produto em 2026-09-10 (D-01, D-02, D-03 abaixo). As demais (D-04..D-15)
são **defaults documentados** — mesmo tratamento das specs 010/017/018. Zero
`NEEDS CLARIFICATION` remanescente.*

- **D-01 — Chave natural `id_origem` da TMB = `pedido` / `pedido_id`** (dono do produto,
  2026-09-10). O id interno do pedido TMB (inteiro → string), presente de forma consistente
  nas 3 fontes online (webhook Vendas `pedido`, webhook Financeiro `pedido_id`, API
  `pedido_id`) e no CSV. `id_externo` (referência de checkout externo, string, pode ser
  vazia) fica **só no `payload_bruto`** — não é a identidade. Consequência: os dois webhooks
  de um mesmo pedido resolvem para a **mesma** `(TMB, <pedido>)` — a Regra Inviolável nº 1
  ("sem duplicidade") é respeitada por construção.
- **D-02 — Webhook Financeiro (nível de parcela) colapsa para o pedido; último evento
  vence** (dono do produto, 2026-09-10). Cada notificação de parcela vira **um
  `EventoCanonico`** próprio (`tipoOrigem = tmb.webhook-financeiro`, `idOrigem = <pedido>`,
  `statusOrigem = <status_pagamento>`), registrado **cru e imutável** em `evento_origem` —
  o histórico completo de todas as parcelas fica preservado. `UPSERT_TRANSACAO` (spec 018)
  já faz upsert por `(plataforma_origem, id_origem)`: o status canônico da transação passa a
  refletir o **último** evento processado. Limitação **documentada**: a granularidade de
  parcela colapsa para o pedido; um refino "estado da carteira de parcelas" fica para uma
  spec futura de cobranças/inadimplência, e o dado bruto para reconstruí-lo já está no
  ledger de eventos. O `status-map` de `tmb.webhook-financeiro` traduz:
  `Recebido → PAGO`, `Aguardando pagamento → PENDENTE`, `Vencido → EM_ATRASO`,
  `Estornado → ESTORNADO`, `DELETED → CANCELADO`.
- **D-03 — Escopo desta spec: parser puro + endpoints finos em `/ingestao/tmb/*`** (dono do
  produto, 2026-09-10). Entrega as **4 fontes**: funções puras `parse*()` + **fixtures
  reais** + `status-map/tmb.ts`. Superfície HTTP:
  - **Webhooks públicos** `POST /webhooks/tmb/vendas` e `POST /webhooks/tmb/financeiro`
    (as primeiras rotas `/webhooks/*` do lado financeiro do projeto; o prefixo já está
    reservado como público desde a 003).
  - **Sincronização por API sob demanda** `POST /ingestao/tmb/sincronizar` (autenticado,
    `evento:ingerir`) — puxa `GET /api/pedidos` com janela de data + paginação e registra
    cada pedido como evento.
  - **Import CSV** `POST /ingestao/tmb/importar-csv` (autenticado, `evento:ingerir`) — o
    CSV trafega como **texto no corpo JSON** (`{ conteudo, fonte? }`), **0 dependência nova**
    de upload binário (mesmo padrão da spec 015).

  A superfície `admin/` completa (`POST /admin/importar-csv/{conta}`, `POST /admin/sincronizar`)
  fica para a spec de migração/admin — abrir o módulo `admin` agora seria prematuro.
- **D-04 — Mapa de valores monetários.** `valores.bruto` = `valor_principal` (o ticket da
  venda, antes de juros de parcelamento); `valores.taxas` = `taxa_administracao` (o que a TMB
  retém); `valores.liquido` = `valor_principal − taxa_administracao` **quando os dois estão
  presentes e são numéricos**, senão omitido. `valor_total` (principal + juros),
  `valor_entrada` (boleto de entrada), `valor_parcela`, `repasse` (líquido por parcela no
  webhook Financeiro) ficam **só no `payload_bruto`** — não há campo canônico para eles nesta
  fatia. Toda conversão de número para `Dinheiro` usa a escala ×10000 do `core`; `float`
  proibido no resultado. Moeda sempre `BRL`.
- **D-05 — `tipoOrigem` = o rótulo da fonte, e é a chave `fonte` do `status-map`.**
  Convenção congelada: `tmb.webhook-vendas`, `tmb.webhook-financeiro`, `tmb.api`, `tmb.csv`.
  `mapearStatus(plataforma, fonte, bruto)` (spec 018) recebe `plataforma = 'TMB'` e
  `fonte = tipoOrigem`; `MAPAS_STATUS.TMB[tipoOrigem][statusBruto] = StatusTransacaoCanonico`.
- **D-06 — Onde vive o adapter.** `src/ingestao/adapters/tmb/` (visão Apêndice C —
  `ingestao/adapters/{tmb,…}/{webhook,csv,api}`). As funções `parse*()` são **puras**, sem
  NestJS, sem Prisma, sem `fetch` — recebem o payload/linha já desserializado e devolvem
  `{ eventoCanonico?, idOrigem, tipoOrigem, erros[] }`. Ficam dentro do _bounded context_
  `ingestao`; **não** importam `financeiro` (o `status-map/tmb.ts` vive em `financeiro/` e é
  consumido lá pela etapa 3 — o adapter só produz `statusOrigem` cru).
- **D-07 — Webhooks são finos e resilientes.** Cada webhook: (1) autentica via
  `WebhookAuthenticator` da 003 com `TMB_WEBHOOK_TOKEN` (token no header que a TMB usar —
  configurável, ver Assumptions); token inválido/ausente → **401**. (2) desserializa o
  corpo; (3) chama `parse*()`; (4) chama `RegistrarEventoService.registrarEvento` com o
  `payloadBruto` **sempre** e o `eventoCanonico` **só se o parse não acumulou erro fatal**;
  (5) responde **2xx rápido** (`202 Accepted`) — o worker da 006 faz o resto. Se a etapa 0
  (persistência) falhar → **5xx** (a TMB reenvia — visão 5.3). Erro de parse **não** é 5xx:
  o evento cru é persistido, `evento_canonico` fica nulo, e `classificar` (006) já marca
  `revisar` — nada some silenciosamente.
- **D-08 — Um pedido no webhook Vendas com `status_pedido` não catalogado** (novo valor que
  a TMB introduza) → `EventoCanonico` é produzido normalmente com `statusOrigem` cru; a
  etapa 3 chama `mapearStatus` → não casou → `DESCONHECIDO` + `precisa_revisao = true`
  (Regra Inviolável nº 15). O adapter **nunca** chuta um status.
- **D-09 — `ocorridoEm`.** `data_efetivado` quando presente e parseável; senão `criado_em`;
  senão `null` (o `parseInstante` de borda do `core` tolera os formatos que a TMB manda —
  ISO com/sem fuso, `-03:00`, naïve — e devolve `null` + motivo para lixo). No webhook
  Financeiro: `data_pagamento` quando presente, senão `vencimento_parcela`.
- **D-10 — O adapter não classifica.** `EventoCanonico.classificacao` é deixado indefinido;
  a etapa 1 (`classificar.ts`, 006) resolve — `status_pagamento = "Estornado"` já casa o
  regex de estorno e vira `REEMBOLSO`; o resto é `VENDA_PROPRIA` (TMB não tem afiliada nem
  recorrência).
- **D-11 — RBAC: nenhuma permissão nova.** Webhooks são `@Public()` (prefixo `/webhooks/`,
  003). `POST /ingestao/tmb/sincronizar` e `POST /ingestao/tmb/importar-csv` reusam
  `evento:ingerir` (catálogo desde a 006). **0 migração de dados/seed.**
- **D-12 — Config.** `TMB_API_BASE_URL`, `TMB_API_KEY` (o Bearer token da TMB API) e
  `TMB_WEBHOOK_TOKEN` **já existem** no `env.schema` como `accountConfig('TMB')` (spec 003) —
  **0 chave `.env` nova**. Se `TMB_API_KEY`/`TMB_API_BASE_URL` não estiverem configurados,
  `POST /ingestao/tmb/sincronizar` responde **422** com motivo claro (não 500).
- **D-13 — Sem migração, sem tabela.** O adapter não tem entidade própria. `evento_origem`,
  `evento_etapa` e `transacao` já existem (006/018). **0 migração Prisma.**
- **D-14 — Sem frontend.** Nenhum item de navegação, nenhuma tela. Os eventos gerados
  aparecem no painel **Eventos** (006) e as transações no painel **Financeiro · Transações**
  (018) sem nenhuma mudança de frontend.
- **D-15 — `CONTEXT_MODULES` segue 11.** `ingestao` já está na lista desde a 001; o adapter
  é um subdiretório dele. Nenhum _bounded context_ novo.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Webhook de Vendas da TMB vira transação (Priority: P1)

A TMB dispara `POST /webhooks/tmb/vendas` quando um pedido é **Efetivado** ou **Cancelado**.
O sistema autentica o token, registra o evento cru, e o worker projeta uma `transacao`
`TMB` com identidade `(TMB, <pedido>)`, valores em BRL, `status_canonico` traduzido e a
`pessoa` do comprador resolvida.

**Why this priority**: é o caminho primário de entrada de dados da TMB (webhook = caminho
primário — visão 5.5). Sem ele não há ledger da TMB. Entrega valor imediato: pedidos
efetivados da TMB passam a aparecer no painel de transações consolidado.

**Independent Test**: `POST /webhooks/tmb/vendas` com uma fixture real de "Efetivado" e o
token correto → `202` → `POST /ingestao/eventos/processar` → `GET /financeiro/transacoes`
mostra 1 transação `TMB` com `status_canonico = PAGO`, `classificacao = VENDA_PROPRIA`,
`valor_bruto` reidratável como `Dinheiro{BRL}` e `pessoa_id` resolvido.

**Acceptance Scenarios**:

1. **Given** o header de token correto e uma fixture "Efetivado", **When** `POST
   /webhooks/tmb/vendas`, **Then** resposta `202`, existe um `evento_origem` `TMB` /
   `tmb.webhook-vendas` com `payload_bruto` idêntico ao recebido e `evento_canonico`
   preenchido.
2. **Given** o evento acima, **When** o worker processa a passada, **Then** existe
   `transacao` com `plataforma_origem = TMB`, `id_origem = "<pedido>"`,
   `status_canonico = PAGO`, `valor_bruto = { valorInt, moeda: "BRL" }`, `pessoa_id`
   resolvido pelo documento/e-mail do comprador, e a etapa `UPSERT_TRANSACAO` do evento
   está `ok`.
3. **Given** uma fixture "Cancelado", **When** processada, **Then** `transacao.status_canonico
   = CANCELADO` (não libera acesso, não é receita) e `classificacao = VENDA_PROPRIA`.
4. **Given** um token ausente ou errado, **When** `POST /webhooks/tmb/vendas`, **Then**
   resposta **401** e **nenhum** `evento_origem` é criado.

---

### User Story 2 — Webhook Financeiro atualiza o status sem duplicar (Priority: P1)

Um pedido parcelado gera várias notificações de `POST /webhooks/tmb/financeiro` (uma por
parcela, cada uma com o `status_pagamento` daquela parcela). Cada notificação é registrada
como evento próprio, mas todas resolvem para a **mesma** transação `(TMB, <pedido>)` — o
status canônico reflete o último evento processado, e **não** aparece uma segunda linha no
ledger.

**Why this priority**: materializa a Regra Inviolável nº 1 (sem duplicidade) no caso mais
escorregadio da TMB. Sem isso, um pedido em 12x viraria 12 transações.

**Independent Test**: dois `POST /webhooks/tmb/financeiro` para o mesmo `pedido_id` com
`status_pagamento` diferentes → 2 `evento_origem`, **1** `transacao`, `status_canonico` = o
do 2º evento.

**Acceptance Scenarios**:

1. **Given** uma transação `(TMB, 4321)` já projetada como `PAGO` pelo webhook de Vendas,
   **When** chega `POST /webhooks/tmb/financeiro` com `pedido_id = 4321`,
   `status_pagamento = "Estornado"`, **When** o worker processa, **Then** a **mesma**
   `transacao` fica `status_canonico = ESTORNADO`, `classificacao = REEMBOLSO`,
   `campos_alterados` da etapa 3 inclui `statusCanonico`, e `count(transacao WHERE
   plataforma_origem = TMB AND id_origem = '4321') = 1`.
2. **Given** um payload de webhook Financeiro que é um **array** de `{ dados: {...} }` (o
   formato real da TMB), **When** recebido, **Then** **um** `evento_origem` por item do
   array é registrado (cada `{dados}` é um fato distinto), todos com `id_origem = <pedido>`.
3. **Given** `status_pagamento = "DELETED"`, **When** processado, **Then**
   `status_canonico = CANCELADO`.
4. **Given** `status_pagamento` com um valor que a TMB nunca documentou, **When** processado,
   **Then** `status_canonico = DESCONHECIDO`, `transacao.precisa_revisao = true`,
   `evento_origem.status = revisar`.

---

### User Story 3 — Sincronização por API sob demanda (Priority: P2)

A equipe dispara `POST /ingestao/tmb/sincronizar` com uma janela de datas para reconciliar
pedidos que um webhook pode ter perdido. O sistema pagina `GET /api/pedidos`, registra cada
pedido como evento `tmb.api` e devolve um resumo (quantos novos, quantos dedup).

**Why this priority**: a API é o caminho **sob demanda** (visão 5.5) — rede de segurança
para falha de webhook. Não é o caminho primário, por isso P2.

**Independent Test**: com um `TmbApiClient` dublê devolvendo 2 páginas de pedidos →
`POST /ingestao/tmb/sincronizar` → resumo `{ paginas: 2, recebidos: N, novos: N, dedup: 0 }`
e N `evento_origem` `tmb.api`.

**Acceptance Scenarios**:

1. **Given** `TMB_API_KEY` e `TMB_API_BASE_URL` configurados e a API devolvendo 1 página com
   3 pedidos, **When** `POST /ingestao/tmb/sincronizar` com `{ dataInicio, dataFinal }`,
   **Then** 3 `evento_origem` `TMB` / `tmb.api` são criados e a resposta é
   `{ paginas: 1, recebidos: 3, novos: 3, dedup: 0 }`.
2. **Given** um pedido que já entrou por webhook (`(TMB, 999)`), **When** a sincronização
   traz o mesmo pedido, **Then** o evento `tmb.api` é registrado como um **fato novo**
   (hash diferente do webhook), mas `UPSERT_TRANSACAO` **atualiza** a transação existente —
   nunca cria uma 2ª linha.
3. **Given** `TMB_API_KEY` ausente, **When** `POST /ingestao/tmb/sincronizar`, **Then**
   resposta **422** com `{ message: "conta TMB sem API configurada" }` e nenhum evento.
4. **Given** a API da TMB responde `500` na 2ª página, **When** a sincronização roda,
   **Then** os pedidos da 1ª página **já foram registrados** (commit por página), a resposta
   informa o erro parcial, e re-disparar a sincronização é idempotente (dedup por hash).

---

### User Story 4 — Import de CSV (Priority: P3)

A equipe cola o conteúdo de um export CSV da TMB em `POST /ingestao/tmb/importar-csv`; cada
linha vira um evento `tmb.csv`. Linhas malformadas são reportadas sem abortar o lote.

**Why this priority**: caminho de migração/backfill (visão Parte 6 — re-ingerir CSVs das 7
contas). Útil, mas não bloqueia a operação corrente.

**Independent Test**: um CSV com 3 linhas boas + 1 linha sem `pedido` →
`{ linhas: 4, novos: 3, ignoradas: 1, erros: ["linha 3: sem identificador de pedido"] }`.

**Acceptance Scenarios**:

1. **Given** um CSV válido da TMB com cabeçalho e 5 linhas de pedidos, **When** `POST
   /ingestao/tmb/importar-csv` com `{ conteudo }`, **Then** 5 `evento_origem` `TMB` /
   `tmb.csv` são criados e a resposta resume `{ linhas: 5, novos: 5, ignoradas: 0 }`.
2. **Given** o mesmo CSV enviado 2 vezes, **When** o 2º import roda, **Then** `novos: 0`,
   `dedup: 5` — nenhum evento nem transação duplicada.
3. **Given** uma linha sem valor no campo de pedido, **When** o import roda, **Then** essa
   linha entra em `ignoradas`, as demais são processadas, e o erro é listado com o número
   da linha.
4. **Given** um separador `;` em vez de `,` (comum em export BR), **When** o import roda,
   **Then** o parser detecta o separador e processa as linhas corretamente (ou, se não
   detectar, todas as linhas caem em `ignoradas` com um erro claro — nunca um 500).

---

### Edge Cases

- **Payload de webhook com atributo novo não tratado** (a doc da TMB avisa que novos campos
  podem surgir): o parser **ignora** campos desconhecidos — nunca lança exceção por chave a
  mais (a doc pede exatamente isso). O `payload_bruto` guarda tudo.
- **`documento` do comprador vazio / inválido** no webhook Vendas: a etapa `RESOLVER_PESSOA`
  (018) já tolera — resolve por e-mail/telefone ou cria `pessoa` só com nome; nunca quebra.
- **`telefones` como string `"+5511..., +5511..."`**: o adapter separa por vírgula/;/espaço
  e normaliza cada um; entrega `comprador.telefones: string[]`.
- **`valor_principal` ausente** (webhook Financeiro não traz valores de venda): `valores`
  fica sem `bruto`; a transação é atualizada só no que o evento carrega (status). O
  `camposAlterados` (018) só lista o que mudou — não zera `valor_bruto` existente… **exceto**
  se o `extrairCanonicos` devolver `valorBruto: null` e o `camposAlterados` interpretar isso
  como mudança. Ver "Assumptions" — o adapter do webhook Financeiro **não** emite as chaves
  de valor ausentes (ver FR-012).
- **Array vazio `[]` no webhook Financeiro**: resposta `202`, `{ registrados: 0 }`, nenhum
  evento.
- **CSV com BOM / encoding Latin-1**: o corpo chega como texto já decodificado pelo cliente
  HTTP; o parser tolera BOM no início. Encoding é responsabilidade de quem exporta/cola
  (documentado); o parser não adivinha (gambiarra 4.14 da visão evitada).
- **`data_efetivado` no formato `"2025-04-23T14:32:46.752423"` (naïve, sem fuso)**:
  `parseInstante` do `core` resolve como UTC + motivo registrado — nunca naïve no banco.
- **Dois itens `{dados}` idênticos no mesmo array de webhook Financeiro**: geram o **mesmo**
  hash → o 2º é dedup na etapa 0 (`criado: false`).

---

## Requirements *(mandatory)*

### Functional Requirements

**Parsers puros (as 4 fontes)**

- **FR-001**: O sistema MUST prover `parseWebhookVendas(payload) → ResultadoParseTmb` puro
  (sem NestJS/Prisma/rede) que produz um `EventoCanonico` com
  `plataformaOrigem = TMB`, `idOrigem = String(payload.pedido)`,
  `tipoOrigem = "tmb.webhook-vendas"`, `statusOrigem = payload.status_pedido` (cru),
  `ocorridoEm` conforme D-09, `comprador` (nome, e-mails, telefones normalizados, documentos,
  endereço a partir dos campos `endereco_*`), `valores` conforme D-04, `oferta.nomeOrigem` =
  `payload.titulo`/`payload.code` quando houver.
- **FR-002**: O sistema MUST prover `parseWebhookFinanceiro(payload) → ResultadoParseTmb[]`
  puro que aceita o **array** `[{ dados: {...} }]` da TMB e devolve **um** `EventoCanonico`
  por item, com `idOrigem = String(dados.pedido_id)`,
  `tipoOrigem = "tmb.webhook-financeiro"`, `statusOrigem = dados.status_pagamento` (cru),
  `ocorridoEm` conforme D-09, `comprador` a partir de `dados.cliente` / `dados.cliente_email`
  / `dados.cliente_documento`.
- **FR-003**: O sistema MUST prover `parsePedidoApi(pedido) → ResultadoParseTmb` puro para
  um item de `GET /api/pedidos`, com `tipoOrigem = "tmb.api"`,
  `statusOrigem = pedido.status_pedido` (cru), e o mesmo mapeamento de comprador/valores da
  FR-001 adaptado aos nomes de campo da API (`pedido_id`, `endereco_*`, `pais`, `cep`).
- **FR-004**: O sistema MUST prover `parseLinhaCsv(linha, cabecalho) → ResultadoParseTmb`
  puro, com `tipoOrigem = "tmb.csv"`, tolerante a separador `,` e `;` (detecção pelo
  cabeçalho), a BOM inicial e a aspas.
- **FR-005**: Todo parser MUST devolver `{ eventoCanonico?, idOrigem?, tipoOrigem, erros:
  string[] }`. Sem identificador de pedido → `eventoCanonico` ausente + erro descritivo
  (nunca lança). Campo desconhecido no payload → **ignorado** (nunca erro).
- **FR-006**: Nenhum parser MUST tocar o banco, fazer I/O ou depender de locale/fuso do
  processo. `parseInstante` e `Dinheiro`/`Moeda` do `core` são as únicas dependências além
  de utilitários locais de string.
- **FR-007**: Todo parser MUST ser exercido por teste unitário contra **fixtures reais** da
  TMB em `src/ingestao/adapters/tmb/fixtures/` (Princípio III). As fixtures NÃO contêm PII
  real (dados fictícios equivalentes em forma).

**Webhooks públicos**

- **FR-008**: O sistema MUST expor `POST /webhooks/tmb/vendas` e `POST /webhooks/tmb/financeiro`
  como rotas **públicas** (sem `JwtAuthGuard`), autenticadas por `WebhookAuthenticator`
  (003) com a chave `TMB_WEBHOOK_TOKEN`. Token inválido/ausente → **401**, corpo genérico,
  **nenhum** `evento_origem` criado.
- **FR-009**: Cada webhook MUST, após autenticar: desserializar o corpo, chamar o parser da
  fonte, e chamar `RegistrarEventoService.registrarEvento` **uma vez por fato** com
  `payloadBruto` sempre presente e `eventoCanonico` presente só quando o parse não acumulou
  erro. Responde **`202 Accepted`** com `{ registrados: n }` no sucesso.
- **FR-010**: Se `RegistrarEventoService` lançar (falha de persistência da etapa 0), o
  webhook MUST responder **5xx** (a TMB reenvia). Erro de **parse** MUST NOT virar 5xx: o
  evento cru é persistido e segue para revisão.
- **FR-011**: O webhook Financeiro MUST aceitar tanto o array `[{dados}]` quanto um objeto
  único `{dados}` ou achatado, registrando 1 evento por `{dados}`; array vazio → `202`,
  `{ registrados: 0 }`.
- **FR-012**: O `EventoCanonico` do webhook Financeiro MUST NOT emitir chaves de `valores`
  quando o payload não traz valores de venda — só `statusOrigem` + identidade + comprador —
  para que `camposAlterados` (018) não interprete ausência como "valor zerado".

**Sincronização por API**

- **FR-013**: O sistema MUST prover um `TmbApiClient` atrás de uma interface (dublê nos
  testes), usando **`fetch` nativo do Node 24** (0 dep nova), com `Authorization: Bearer
  <TMB_API_KEY>` e base `TMB_API_BASE_URL`, que pagina `GET /api/pedidos` por
  `pageNumber`/`pageSize` até esgotar, aceitando filtro `data_inicio`/`data_final`.
- **FR-014**: `POST /ingestao/tmb/sincronizar` (autenticado, `evento:ingerir`) MUST aceitar
  `{ dataInicio?, dataFinal?, produtoId?, pageSize? }`, chamar o client, `parsePedidoApi`
  cada item, registrar via `RegistrarEventoService`, e devolver
  `{ paginas, recebidos, novos, dedup, erros[] }`. Commit por página (falha na página K não
  desfaz as 1..K−1).
- **FR-015**: Se `TMB_API_BASE_URL` ou `TMB_API_KEY` não estiverem configurados,
  `POST /ingestao/tmb/sincronizar` MUST responder **422** com motivo claro — nunca 500.
- **FR-016**: A sincronização MUST ser idempotente por hash: re-disparar a mesma janela não
  cria eventos nem transações duplicadas.

**Import CSV**

- **FR-017**: `POST /ingestao/tmb/importar-csv` (autenticado, `evento:ingerir`) MUST aceitar
  `{ conteudo: string, fonte?: "tmb.csv" }`, dividir em linhas, `parseLinhaCsv` cada uma,
  registrar as válidas, e devolver `{ linhas, novos, dedup, ignoradas, erros[] }` — linha
  malformada **não** aborta o lote.
- **FR-018**: O import CSV MUST ser idempotente por hash (2º import → `novos: 0`).

**Status canônico da TMB**

- **FR-019**: O sistema MUST criar `src/financeiro/domain/status-map/tmb.ts` exportando
  `TMB: Record<string, Record<string, StatusTransacaoCanonico>>` com as 4 fontes
  (`tmb.webhook-vendas`, `tmb.webhook-financeiro`, `tmb.api`, `tmb.csv`) e registrar em
  `MAPAS_STATUS` via `Object.assign(MAPAS_STATUS, { TMB })` em `status-map/index.ts`.
- **FR-020**: O mapa MUST cobrir, no mínimo: **Vendas/API** — `Efetivado → PAGO`,
  `Cancelado → CANCELADO` (+ variações de caixa que a TMB use nas fixtures reais);
  **Financeiro** — `Recebido → PAGO`, `Aguardando pagamento → PENDENTE`, `Vencido → EM_ATRASO`,
  `Estornado → ESTORNADO`, `DELETED → CANCELADO`. `status_financeiro` a nível de pedido
  (`Adimplente`/`Inadimplente`) **não** entra no mapa de status canônico (não é um estado de
  transação — é um resumo de carteira); fica só no `payload_bruto`.
- **FR-021**: Qualquer valor bruto fora do mapa MUST resultar em `DESCONHECIDO` + revisão
  (comportamento já garantido por `mapearStatus` da 018 — esta spec só popula o mapa).
- **FR-022**: Cada entrada do mapa MUST ser justificada por uma fixture real
  correspondente no teste de `status-map` (Princípio III).

**Fronteiras / não-regressão**

- **FR-023**: `src/ingestao/adapters/tmb/**` MUST NOT importar `src/financeiro/**` nem
  `src/clientes/**` (ESLint `import/no-restricted-paths` já cobre). O `status-map/tmb.ts`
  vive em `src/financeiro/**` e é consumido lá.
- **FR-024**: `src/financeiro/domain/status-map/**` MUST NOT importar `ingestao` — só o
  `core` (enum `StatusTransacaoCanonico`).
- **FR-025**: Esta spec MUST NOT alterar `worker.service.ts`, `pipeline-wiring.module.ts`,
  `etapas.ts`, nem o schema Prisma. Nenhuma migração.
- **FR-026**: `CONTEXT_MODULES` MUST seguir com **11**; `/health` inalterado.
- **FR-027**: A suíte e2e 003–018 MUST seguir verde sem alteração de comportamento.

### Key Entities

- **`EventoCanonico`** (contrato do `core`, spec 006/018) — o que os parsers produzem.
  Nenhum campo novo; a TMB usa o núcleo obrigatório + `comprador` + `valores` + `oferta`.
- **`ResultadoParseTmb`** — `{ eventoCanonico?: EventoCanonico; idOrigem?: string;
  tipoOrigem: string; erros: string[] }`. Contrato de saída **uniforme** dos 4 parsers.
- **`TmbApiClient`** (interface + impl `fetch`) — `listarPedidos({ dataInicio?, dataFinal?,
  produtoId?, pageNumber, pageSize }) → { itens: unknown[]; temProximaPagina: boolean }`.
  Dublê nos testes; a impl real nunca é exercida em teste unitário/e2e.
- **`status-map/tmb.ts`** (dado, em `financeiro/domain/status-map/`) — vocabulário bruto da
  TMB → `StatusTransacaoCanonico`, por fonte, versionado.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma fixture real de webhook Vendas "Efetivado" com token válido →
  `POST /webhooks/tmb/vendas` responde `202`, cria **1** `evento_origem`
  `TMB`/`tmb.webhook-vendas`, e após `processar` existe **exatamente 1** `transacao`
  `(TMB, <pedido>)` com `status_canonico = PAGO` e `pessoa_id` resolvido.
- **SC-002**: `POST /webhooks/tmb/vendas` sem token / token errado → **401** e
  `count(evento_origem) == 0`.
- **SC-003**: Webhook Vendas "Efetivado" seguido de webhook Financeiro "Estornado" para o
  mesmo `pedido` → **2** `evento_origem`, **1** `transacao`, `status_canonico` final
  `ESTORNADO`, `classificacao = REEMBOLSO` (Regra Inviolável nº 1).
- **SC-004**: Um array de webhook Financeiro com 3 parcelas do mesmo pedido → **3**
  `evento_origem`, **1** `transacao`; enviar o mesmo array de novo → `0` eventos novos
  (dedup por hash).
- **SC-005**: `status_pagamento`/`status_pedido` fora do vocabulário mapeado →
  `transacao.status_canonico = DESCONHECIDO`, `precisa_revisao = true`,
  `evento_origem.status = revisar` — **nunca** um status que libera acesso (Regra nº 15).
- **SC-006**: `POST /ingestao/tmb/sincronizar` com um `TmbApiClient` dublê de 2 páginas →
  resposta `{ paginas: 2, recebidos, novos, dedup: 0, erros: [] }` e os `evento_origem`
  `tmb.api` correspondentes; re-disparo → `novos: 0`.
- **SC-007**: `POST /ingestao/tmb/sincronizar` sem `TMB_API_KEY` → **422**, `0` eventos.
- **SC-008**: `POST /ingestao/tmb/importar-csv` com 5 linhas boas + 1 ruim → `202`,
  `{ linhas: 6, novos: 5, ignoradas: 1 }`; 2º import do mesmo conteúdo → `novos: 0`.
- **SC-009**: Todo valor monetário produzido pelos parsers é `Dinheiro{ valorInt: bigint,
  moeda: "BRL" }` — nenhum `float` no caminho (verificável por tipo/`grep`).
- **SC-010**: `GET /admin/rbac/permissoes` **não** ganha nenhuma permissão nova; nenhuma
  migração roda no `setup-db`.
- **SC-011**: `src/ingestao/adapters/tmb` não importa `financeiro`/`clientes`;
  `src/financeiro/domain/status-map` não importa `ingestao` (ESLint verde). `/health` segue
  com **11** contextos.
- **SC-012**: Regressão — suíte e2e 003–018 verde; nenhuma alteração em `worker.service.ts`,
  `etapas.ts`, `pipeline-wiring.module.ts` ou no schema Prisma (verificável por `git diff`).
- **SC-013**: Cada entrada de `status-map/tmb.ts` tem uma fixture real que a exercita no
  teste de `status-map` (cobertura de vocabulário verificável).

---

## Assumptions

- **Header do token de webhook da TMB.** A doc da TMB permite configurar "Chave" (nome do
  header) e "Valor" (o token) na tela de webhook. Assume-se um header configurável com
  _default_ `x-tmb-webhook-token`; o webhook lê esse header (case-insensitive) e passa o
  valor a `WebhookAuthenticator.autenticar('TMB', token)`. Se a TMB usar outro nome de
  header em produção, é config — não muda o código do adapter.
- **`GET /api/pedidos` retorna pedidos efetivados** (a doc diz "Consultar Pedidos
  Efetivados"). Cancelamentos posteriores só chegam por webhook. A sincronização por API,
  portanto, é um _backfill_ de efetivações — não substitui o webhook para cancelamentos.
- **Formato do CSV da TMB.** Não há CSV de exemplo na doc. Assume-se um export com cabeçalho
  cujas colunas espelham o payload do webhook Vendas / retorno da API (`pedido_id`/`pedido`,
  `status_pedido`, `cliente`, `documento`, `email`, `valor_principal`, `taxa_administracao`,
  `criado_em`, `data_efetivado`, `endereco_*`, `utm_*`). A fixture de CSV é montada nesse
  formato; ajustar quando um export real aparecer é trocar a fixture + o mapa de colunas,
  não a arquitetura.
- **Fixtures não contêm PII real.** Documentos/e-mails/telefones nas fixtures são fictícios
  válidos em forma (DV de CPF correto etc.), suficientes para exercitar normalização e
  dedup.
- **Sem migração v1 aqui.** Re-ingerir o histórico real da TMB (visão Parte 6) é a spec de
  migração; esta spec entrega o mecanismo (`importar-csv` + `sincronizar`) que aquela vai
  usar.
- **Sem frontend.** O `git diff` de `frontend/` desta spec é vazio.
- **Portas.** Nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` seguem
  como estão; os e2e desta spec rodam contra um Postgres isolado próprio (container
  dedicado numa porta livre — `55432/55433/55435` já estão em uso por outras sessões).
- **`RegistrarEventoService` é a única porta de escrita de evento** — o adapter nunca faz
  `INSERT` direto em `evento_origem`; nunca toca `evento_etapa`/`transacao` (isso é do
  worker + etapas da 018).
