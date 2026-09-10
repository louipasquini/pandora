# Feature Specification: Ledger de transações do Financeiro — `transacao` normalizada + pipeline etapas 2–3

**Feature Branch**: `018-financeiro-transacao-ledger`

**Created**: 2026-09-10

**Status**: Draft

**Input**: ROADMAP.md Fase 2 (Financeiro), item 018 — "`transacao` normalizada (1 por
`(plataforma_origem, id_origem)`), campos financeiros como `Dinheiro` + `status_canonico` +
FKs opcionais (oferta, contrato, cliente, `transacao_vinculada`). Pipeline etapas 1–3:
classificar `tipo` antes de qualquer efeito colateral; resolver pessoa (usa 005); upsert
transação retornando `ResultadoIngestao{transacao, foi_criada, campos_alterados}`.
`GET /transacoes` (muitos filtros), `GET /transacoes/{id}`. Frontend: lista/detalhe de
transações."

---

## Contexto

Primeira fatia da **Fase 2 — Financeiro** (visão Partes 1–6). O _bounded context_ `financeiro`
está vazio desde a spec 001; esta spec o torna dono de **`transacao`** — a projeção normalizada
de um evento financeiro cru, 1 linha por `(plataforma_origem, id_origem)`.

A spec 006 montou o pipeline de ingestão canônico (visão 5.3) como etapas idempotentes com
dependências declaradas; a etapa 1 (**classificar**) já roda de verdade, e as etapas 2–6 são
_no-op_ `pulada` com a `especDona` gravada em `etapas.ts` (`RESOLVER_PESSOA` → 18,
`UPSERT_TRANSACAO` → 18, `RESOLVER_VINCULO` → 24, `RESOLVER_OFERTA` → 23, `PROJETAR_CONTRATO`
→ 25). Esta spec **pluga as etapas 2 e 3 reais** sem tocar o worker: `RESOLVER_PESSOA`
(reusa a engine de identidade/dedup da spec 005 pela `PortaIdentidade` do `core`) e
`UPSERT_TRANSACAO` (grava/atualiza `transacao`). As etapas 4–6 seguem `pulada`.

Não há adapter de plataforma ainda (specs 019–022): os testes e a migração v1 (spec 031)
alimentam o pipeline com um `EventoCanonico` já pronto. A tradução do **vocabulário bruto de
status** de cada plataforma para `StatusTransacaoCanonico` é responsabilidade dos adapters,
versionada por fonte (visão 5.4); esta spec entrega o **registro** `status-map` que os
adapters vão popular, com o comportamento seguro por omissão: status bruto não catalogado →
`DESCONHECIDO` + revisão (Regra Inviolável nº 15), nunca um palpite.

## Clarifications

*018 não está marcada `⚠ clarify` no ROADMAP. As decisões de projeto (D-01..D-08) foram
resolvidas como **defaults documentados** — mesmo tratamento das specs 010/017. Zero
`NEEDS CLARIFICATION`.*

- **D-01 — Escopo do pipeline nesta spec.** Só as etapas 2 (`RESOLVER_PESSOA`) e 3
  (`UPSERT_TRANSACAO`). A etapa 1 (`CLASSIFICAR`) já é real desde a 006. As etapas 4
  (`RESOLVER_VINCULO`, spec 024), 5 (`RESOLVER_OFERTA`, spec 023) e 6 (`PROJETAR_CONTRATO`,
  spec 025) seguem `pulada` — o grafo de `etapas.ts` já garante que elas dependem de
  `UPSERT_TRANSACAO` e ficam `bloqueada` até ela ficar `ok`.
- **D-02 — Como o `financeiro` pluga no worker sem cruzar _bounded context_.** Um
  **contrato de inversão de dependência no `core`** (`core/pipeline/`): a interface
  `ExecutorEtapaExterno` + o token multi `EXECUTORES_ETAPA_EXTERNOS`. `financeiro` implementa
  e registra os dois executores por um módulo `@Global()` `FinanceiroWiringModule` (mesmo
  padrão de `ClientesWiringModule`/`PortaIdentidade` da spec 008/013). O `WorkerService`
  injeta `@Optional()` a lista de externos e registra um _wrapper_ `Executor` para cada —
  o worker nunca importa `src/financeiro/**` e o `financeiro` nunca importa
  `src/ingestao/**`. Specs 023–025 acrescentam mais entradas na mesma lista **sem** tocar o
  `WorkerService` de novo.
- **D-03 — Onde mora o contrato `EventoCanonico`.** Ele passa a viver em `core/pipeline/`
  (`ingestao/domain` re-exporta para não quebrar imports). É a forma canônica que tanto o
  `ingestao` (etapa 0/1) quanto o `financeiro` (etapa 2/3) precisam ler — pertence ao
  `core`, ao lado de `Dinheiro`, `parseInstante` e `StatusTransacaoCanonico`.
- **D-04 — `campos_alterados`.** Retornado no resultado da etapa `UPSERT_TRANSACAO`
  (`ResultadoIngestao{transacao, foi_criada, campos_alterados}`) e persistido **só** em
  `evento_etapa.resultado` (Json). **Não** vira coluna mutável em `transacao` (a v1 pendurou
  `_houve_mudanca` no ORM — gambiarra 4.9). Reprocessar o mesmo evento → `campos_alterados`
  vazio, `foi_criada: false` (idempotência, Princípio IV/V).
- **D-05 — Mapeamento de status sem adapter.** `financeiro/domain/status-map/` traz o
  registro `MAPAS_STATUS` (por `plataforma × fonte`) — **vazio nesta spec**, populado pelas
  specs 019–022. `mapearStatus(plataforma, fonte, bruto)` tenta: (1) valor canônico exato
  (`paraStatusTransacaoCanonico` do `core`), (2) o mapa da fonte. Nada casou → `DESCONHECIDO`
  + `revisar: true` + `motivo`. É o mesmo espírito de `classificar` na 006 (regras locais +
  defere o resto). Divergência da Apêndice C (que sugeriu `status_map` sob os adapters):
  `financeiro` é dono de `status_canonico` e **não pode importar `ingestao`** — o adapter faz
  a **extração crua**, o `financeiro` faz a **tradução canônica**.
- **D-06 — Venda como afiliada (`classificacao = VENDA_AFILIADA`).** A etapa
  `RESOLVER_PESSOA` chama `PortaIdentidade.resolverOuCriar(dados, {criar: false})` — nunca
  cria `pessoa` (Regra Inviolável nº 8). `pessoaId` pode ficar `null`; a etapa fica `ok`
  mesmo assim. `UPSERT_TRANSACAO` grava a transação com `pessoa_id = null` e
  `eh_afiliada = true`. Não cria oferta/contrato (essas etapas seguem `pulada`).
- **D-07 — Sem superfície de escrita.** `transacao` é escrita **só pelo pipeline**
  (Princípio VIII). Nenhum `POST`/`PATCH`/`DELETE` de `transacao` nesta spec — o retry de
  vínculo é da spec 024; o ajuste manual de contrato é da 025. Só `GET /financeiro/transacoes`
  e `GET /financeiro/transacoes/{id}`.
- **D-08 — Sem tabela de auditoria nova.** Não há escrita curada/manual em `transacao` nesta
  spec, então não há `financeiro_audit`. O rastro de "o que mudou" é `evento_etapa.resultado`
  (`campos_alterados`) + o `evento_origem` imutável (Princípio IV). Specs 024/025 introduzem
  auditoria quando aparecer a escrita manual.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Evento vira transação normalizada (Priority: P1)

Um `EventoCanonico` registrado na ingestão (spec 006) é processado pelo worker e, quando as
etapas 2 e 3 rodam, aparece uma linha em `transacao` com identidade natural
`(plataforma_origem, id_origem)`, valores como `Dinheiro`, `status_canonico`, `classificacao`
e (se resolvida) a `pessoa` do comprador.

**Why this priority**: é o núcleo do Financeiro. Sem `transacao` normalizada não há receita,
vínculo, oferta nem contrato. Entrega valor imediato: o painel passa a listar transações
consolidadas das 7 contas por trás de uma única identidade.

**Independent Test**: `POST /ingestao/eventos` com um `eventoCanonico` de venda própria →
`POST /ingestao/eventos/processar` → `GET /financeiro/transacoes` mostra 1 transação com os
campos normalizados; a etapa `UPSERT_TRANSACAO` do evento está `ok` com
`resultado.foi_criada = true`.

**Acceptance Scenarios**:

1. **Given** um `EventoCanonico` `GURU_PRD` de venda própria com `comprador`, `valores.bruto`
   e `statusOrigem = "PAGO"`, **When** o worker processa a passada, **Then** existe
   `transacao` com `plataforma_origem = GURU_PRD`, `status_canonico = PAGO`,
   `classificacao = VENDA_PROPRIA`, `pessoa_id` resolvido, `valor_bruto` reidratável como
   `Dinheiro`, e a etapa 3 do evento está `ok`.
2. **Given** a mesma transação já existe, **When** um **segundo** `EventoCanonico` chega para
   a mesma `(plataforma_origem, id_origem)` com um valor bruto diferente, **When** o worker
   processa, **Then** a linha de `transacao` é **atualizada** (não duplicada),
   `resultado.campos_alterados` da etapa 3 lista `["valorBruto"]` e `foi_criada = false`.
3. **Given** um `EventoCanonico` sem `comprador`, **When** o worker processa, **Then**
   `RESOLVER_PESSOA` fica `ok` com `resultado.pessoaId = null` e `UPSERT_TRANSACAO` grava a
   transação com `pessoa_id = null` (não bloqueia).

---

### User Story 2 - Resolver a pessoa do comprador (Priority: P1)

A etapa `RESOLVER_PESSOA` do pipeline usa a engine de identidade/dedup da spec 005 (via a
`PortaIdentidade` do `core`) para casar o comprador do evento com uma `pessoa` existente ou
criar uma nova — respeitando a regra da venda de afiliada (nunca cria).

**Why this priority**: sem pessoa resolvida, a transação não liga a cliente e o Contrato
(spec 025) não tem âncora. Reusa a 005 sem duplicar a lógica de dedup.

**Independent Test**: dois eventos com o mesmo e-mail de comprador → uma única `pessoa`;
um evento de afiliada com comprador desconhecido → `pessoa_id = null`, nenhuma `pessoa` nova.

**Acceptance Scenarios**:

1. **Given** dois `EventoCanonico` de plataformas diferentes com o mesmo `comprador.emails`,
   **When** ambos são processados, **Then** as duas `transacao` apontam para a **mesma**
   `pessoa` e `pessoa_origem_ref` tem um ref por plataforma.
2. **Given** um `EventoCanonico` com `classificacao = VENDA_AFILIADA` e um comprador que
   **não** existe, **When** o worker processa, **Then** `RESOLVER_PESSOA` fica `ok`,
   `pessoaId = null`, e o `SELECT count(*) FROM pessoa` não mudou.
3. **Given** um `EventoCanonico` de afiliada cujo comprador **já existe** por compra própria
   anterior, **When** o worker processa, **Then** a transação de afiliada liga a essa
   `pessoa` (mas não cria oferta/contrato).

---

### User Story 3 - Painel de transações (Priority: P2)

A equipe abre **Financeiro · Transações**, filtra por conta / status canônico / classificação
/ "pago de fato" / período, e abre o detalhe de uma transação com todos os campos
normalizados e um link para o evento de origem.

**Why this priority**: é a superfície de consumo da fatia. Sem ela, a `transacao` só existe
para specs futuras — a equipe precisa ver o ledger consolidado ("7 contas, 1 registro").

**Independent Test**: com transações de várias contas/status semeadas via pipeline, a lista
aplica cada filtro corretamente e o detalhe abre.

**Acceptance Scenarios**:

1. **Given** transações `PAGO`, `PENDENTE` e `DESCONHECIDO`, **When** filtro
   `?pagoDeFato=true`, **Then** só as `PAGO` aparecem (via `contaComoReceita` do `core`).
2. **Given** transações de `GURU_PRD` e `HOTMART_PRD`, **When** filtro
   `?plataformaOrigem=GURU_PRD`, **Then** só as `GURU_PRD` aparecem.
3. **Given** uma transação, **When** abro `GET /financeiro/transacoes/{id}`, **Then** vejo
   os valores por moeda, `status_canonico`, `classificacao`, a `pessoa` resumida (id + nome)
   e o `evento_origem_id` que a produziu por último.
4. **Given** um sujeito autenticado **sem** `transacao:ver`, **When** chama qualquer rota de
   transação, **Then** recebe **403** (≠ 401).

---

### User Story 4 - Status bruto não catalogado vai para revisão (Priority: P2)

Enquanto os adapters (019–022) não populam o `status-map`, um `EventoCanonico` com
`statusOrigem` que não é um valor canônico exato produz uma transação `DESCONHECIDO`
marcada para revisão — nunca um status ativo por engano.

**Why this priority**: materializa a Regra Inviolável nº 15 e a gambiarra 4.4/4.5 corrigida.
É a rede de segurança que permite ligar o pipeline antes dos adapters existirem.

**Independent Test**: evento com `statusOrigem = "approved"` → transação
`status_canonico = DESCONHECIDO`, `precisa_revisao = true`; o `evento_origem` fica `revisar`.

**Acceptance Scenarios**:

1. **Given** `statusOrigem = "aprovado_x"`, **When** o worker processa, **Then**
   `transacao.status_canonico = DESCONHECIDO`, `transacao.precisa_revisao = true`,
   `transacao.motivo_revisao` explica, e o `evento_origem.status` derivado é `revisar`.
2. **Given** `statusOrigem = "PAGO"` (valor canônico exato), **When** o worker processa,
   **Then** `status_canonico = PAGO`, `precisa_revisao = false`.
3. **Given** `ocorridoEm` não-parseável (`"32/13/2026"`), **When** o worker processa,
   **Then** `transacao.ocorrido_em = null`, `precisa_revisao = true` com motivo, a transação
   é gravada mesmo assim.

---

### Edge Cases

- **Reprocessamento** (`POST /ingestao/eventos/{id}/reprocessar`): re-roda `RESOLVER_PESSOA`
  e `UPSERT_TRANSACAO`; a `transacao` não duplica, `campos_alterados` reflete só o que
  realmente mudou, `pessoa` não duplica.
- **Duas passadas concorrentes** do worker sobre o mesmo evento → o mutex por evento da 006
  garante 0 efeito duplicado; `@@unique(plataforma_origem, id_origem)` é a rede final.
- **Evento sem `eventoCanonico`** (adapter da plataforma ainda não existe): `CLASSIFICAR` já
  devolve `DESCONHECIDO` + `revisar` (006); `RESOLVER_PESSOA`/`UPSERT_TRANSACAO` **não
  executam** — ficam `bloqueada` porque a dependência (`CLASSIFICAR`) sinalizou revisão? Não:
  `CLASSIFICAR` fica `ok` (a etapa em si roda), só marca `revisar`. As etapas 2–3 então
  rodam: sem `comprador` → `pessoaId = null`; sem `valores`/`ocorridoEm` → transação mínima
  com `precisa_revisao = true`. Nada quebra; tudo fica visível para retrabalho.
- **`EventoCanonico` com `referenciaExterna` a outra plataforma** (cobrança terceirizada
  Asaas↔Guru): `CLASSIFICAR` já devolve `DESCONHECIDO` + `revisar` (defere para a 024). A
  transação é gravada `DESCONHECIDO` + revisão; o vínculo real é a spec 024.
- **Moeda ausente em `valores.bruto`**: o schema `EventoCanonico` já exige `moeda` em cada
  `Dinheiro` (zod). Um `Dinheiro` sem moeda é rejeitado na etapa 0 (ingestão) — nunca chega
  aqui.
- **`id_origem` colidindo entre contas**: a chave é `(plataforma_origem, id_origem)` — duas
  contas com o mesmo `id_origem` são duas transações distintas (Regra Inviolável nº 1).

---

## Requirements *(mandatory)*

### Functional Requirements

**Pipeline — etapa 2 (`RESOLVER_PESSOA`)**

- **FR-001**: O sistema MUST implementar o executor real da etapa `RESOLVER_PESSOA` e
  registrá-lo no `WorkerService` **sem** alterar `worker.service.ts` além do ponto de
  extensão previsto (injeção `@Optional()` do contrato do `core`).
- **FR-002**: O executor MUST extrair `comprador` do `EventoCanonico` (nome, e-mails,
  telefones, documentos) e chamar `PortaIdentidade.resolverOuCriar`, com
  `criar: false` **se e somente se** `classificacao = VENDA_AFILIADA`, `criar: true` caso
  contrário.
- **FR-003**: O executor MUST anexar `pessoa_origem_ref` da conta de origem via a própria
  engine da 005 (a `PortaIdentidade` já faz isso) — id de origem **nunca** vira PK.
- **FR-004**: O resultado da etapa MUST gravar `{ pessoaId, criada }` em
  `evento_etapa.resultado`; `pessoaId = null` é um resultado válido (`ok`), não um erro.
- **FR-005**: A etapa MUST ser idempotente — reprocessar o mesmo evento resolve para a
  **mesma** `pessoa` (ou `null`), sem criar contato nem `pessoa` duplicada.

**Pipeline — etapa 3 (`UPSERT_TRANSACAO`)**

- **FR-006**: O sistema MUST implementar o executor real da etapa `UPSERT_TRANSACAO`,
  registrado pelo mesmo mecanismo da FR-001, dependente de `RESOLVER_PESSOA` estar `ok`
  (grafo já em `etapas.ts`).
- **FR-007**: O executor MUST fazer **upsert** de `transacao` pela chave natural
  `(plataforma_origem, id_origem)` — nunca cria uma 2ª linha para a mesma chave (Regra
  Inviolável nº 1).
- **FR-008**: O executor MUST normalizar do `EventoCanonico`: `tipo_origem`, `status_origem`
  (cru, guardado), `status_canonico` (via `mapearStatus`), `classificacao` (lida do
  resultado de `CLASSIFICAR`), `ocorrido_em` (via `parseInstante` do `core`; lixo → `null` +
  revisão), `pessoa_id` (lido do resultado de `RESOLVER_PESSOA`), `valor_bruto`/
  `valor_liquido`/`taxas`/`reembolso` como pares `(bigint ×10000, moeda char(3))`,
  `quantidade`, sinais de recorrência (`eh_recorrencia`, `assinatura_ciclo`, `numero_ciclo`),
  e os identificadores crus de oferta (`oferta_codigo_origem`, `oferta_nome_origem`) para a
  spec 023 resolver.
- **FR-009**: O executor MUST devolver `ResultadoIngestao { transacaoId, foi_criada,
  campos_alterados }` e gravá-lo em `evento_etapa.resultado`. `campos_alterados` é a lista
  dos campos normalizados cujo valor mudou em relação à linha anterior (vazia numa criação
  seria a lista completa? **Não** — numa criação `foi_criada: true` e `campos_alterados` traz
  os campos preenchidos; num update sem mudança, `campos_alterados: []`).
- **FR-010**: `campos_alterados` MUST NOT ser persistido como coluna de `transacao` (só em
  `evento_etapa.resultado`). Nenhum atributo mutável de "houve mudança" pendurado no modelo.
- **FR-011**: O executor MUST marcar `precisa_revisao = true` + `motivo_revisao` quando
  `status_canonico = DESCONHECIDO` **ou** `ocorrido_em` não pôde ser parseado; a transação é
  gravada mesmo assim.
- **FR-012**: O executor MUST gravar `eh_afiliada = (classificacao = VENDA_AFILIADA)` e o
  `evento_origem_id` do evento que fez o último upsert.
- **FR-013**: A etapa MUST ser idempotente: reprocessar o mesmo evento → mesma linha,
  `foi_criada: false`, `campos_alterados: []`, `pessoa` não duplicada.
- **FR-014**: As etapas 4–6 (`RESOLVER_VINCULO`, `RESOLVER_OFERTA`, `PROJETAR_CONTRATO`)
  MUST seguir `pulada` — esta spec não as implementa; o grafo de `etapas.ts` garante que só
  rodam depois de `UPSERT_TRANSACAO` ficar `ok`.

**Status canônico**

- **FR-015**: O sistema MUST prover `mapearStatus(plataforma, fonte, bruto) → { status,
  revisar, motivo? }` puro: (1) valor canônico exato → `{ status, revisar: false }`;
  (2) mapa da fonte (`MAPAS_STATUS[plataforma][fonte]`) — **vazio nesta spec**;
  (3) qualquer outra coisa → `{ DESCONHECIDO, revisar: true, motivo }`.
- **FR-016**: `mapearStatus` MUST NOT fazer `trim`/`lowercase`/sinônimos por conta própria —
  o mapa rico é dado dos adapters (019–022), versionado por fonte.

**Leitura / painel**

- **FR-017**: O sistema MUST expor `GET /financeiro/transacoes` — paginado (default 25, teto
  100), ordenado por `ocorrido_em desc` (nulos por último), com filtros: `plataformaOrigem`,
  `statusCanonico` (CSV), `classificacao` (CSV), `pagoDeFato` (bool — usa `contaComoReceita`),
  `pessoaId`, `precisaRevisao` (bool), `ocorridoDe`/`ocorridoAte`, `q` (busca por
  `id_origem`).
- **FR-018**: O sistema MUST expor `GET /financeiro/transacoes/{id}` — todos os campos
  normalizados, valores serializados como `{ valorInt: string, moeda }` (nunca float),
  `pessoa` resumida (`id`, `nome`) quando houver, e `eventoOrigemId`.
- **FR-019**: Ambas as rotas MUST exigir a permissão nova `transacao:ver`; 401 (sem token) ≠
  403 (autenticado sem permissão), corpo genérico da 004.
- **FR-020**: O sistema MUST NOT expor nenhum endpoint de escrita de `transacao` nesta spec
  (Princípio VIII).

**RBAC**

- **FR-021**: O catálogo (`src/auth/rbac/catalogo.ts`) MUST ganhar o recurso `transacao` com
  a permissão `transacao:ver`. `administrador` (via seed) e a credencial de serviço
  (special-case) a concedem de graça — **0 migração de dados/seed**.

**Fronteiras**

- **FR-022**: `src/financeiro/**` MUST NOT importar `src/ingestao/**` nem `src/clientes/**`
  (ESLint `import/no-restricted-paths`). Consome só `core` (contrato de executor,
  `PortaIdentidade`, `Dinheiro`, `parseInstante`, status canônico).
- **FR-023**: `src/ingestao/**` MUST NOT importar `src/financeiro/**`. O `WorkerService`
  consome só o token/interface do `core`.
- **FR-024**: `CONTEXT_MODULES` MUST seguir com **11** — `financeiro` já está na lista desde
  a 001; nenhum _bounded context_ novo.

### Key Entities

- **`transacao`** — projeção normalizada de um evento financeiro. Identidade natural
  `(plataforma_origem, id_origem)`, imutável; campos atualizáveis por re-sync/reprocessamento.
  Campos: `plataforma_origem`, `id_origem`, `tipo_origem`, `status_origem` (cru),
  `status_canonico` (`StatusTransacaoCanonico`), `classificacao` (`Classificacao`),
  `ocorrido_em` (nullable), `pessoa_id` (FK opcional → `pessoa`), `oferta_id`/`contrato_id`/
  `transacao_vinculada_id` (uuid opcionais, **sem FK ativa** — specs 023/025/024 as ligam),
  `valor_bruto`/`valor_liquido`/`taxas`/`reembolso` (pares `Dinheiro`), `quantidade`,
  `eh_afiliada`, `eh_recorrencia`/`assinatura_ciclo`/`numero_ciclo`,
  `oferta_codigo_origem`/`oferta_nome_origem` (crus, para a 023), `precisa_revisao`/
  `motivo_revisao`, `evento_origem_id` (FK → `evento_origem`, último evento aplicado),
  `criado_em`/`atualizado_em`.
- **`EventoCanonico`** (contrato, movido para `core/pipeline/`) — forma canônica validada
  produzida por um adapter. Já definido na 006; esta spec só o realoca e o consome nas
  etapas 2–3.
- **`ExecutorEtapaExterno`** (contrato, `core/pipeline/`) — `{ etapa, executar(entrada) →
  saida }` que um contexto a jusante registra para assumir uma etapa `pulada` do pipeline.
- **`ResultadoIngestao`** (retorno da etapa 3) — `{ transacaoId, foi_criada,
  campos_alterados: string[] }`, gravado em `evento_etapa.resultado` (Princípio IV — resultado
  explícito, nunca atributo mutável no ORM).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um `EventoCanonico` de venda própria processado pelo worker produz **exatamente
  1** linha em `transacao` com identidade `(plataforma_origem, id_origem)`, e a etapa 3 do
  evento fica `ok`.
- **SC-002**: Processar o **mesmo** evento N vezes (reprocessamento) mantém **1** linha de
  `transacao`, `0` `pessoa` duplicada, e `campos_alterados = []` a partir da 2ª vez
  (idempotência — Princípio V).
- **SC-003**: Dois eventos de plataformas diferentes com o mesmo e-mail de comprador → **1**
  `pessoa`, referenciada pelas 2 transações.
- **SC-004**: Um evento de `VENDA_AFILIADA` com comprador desconhecido → `transacao` com
  `pessoa_id = null`, `eh_afiliada = true`, e `count(pessoa)` inalterado (Regra Inviolável
  nº 8).
- **SC-005**: `statusOrigem` fora do vocabulário canônico → `status_canonico = DESCONHECIDO`,
  `precisa_revisao = true`, `evento_origem.status = revisar` — **nunca** um status que libera
  acesso (Regra Inviolável nº 15).
- **SC-006**: Valores monetários trafegam e persistem como `bigint ×10000 + moeda`; nenhum
  ponto do caminho usa `float` (verificável por `grep`/tipo).
- **SC-007**: `GET /financeiro/transacoes` aplica cada filtro (conta, status, classificação,
  `pagoDeFato`, `pessoaId`, `precisaRevisao`, período) e a paginação; `pagoDeFato=true`
  bate com `contaComoReceita`.
- **SC-008**: Rotas de transação sem token → 401; autenticado sem `transacao:ver` → 403;
  `GET /admin/rbac/permissoes` inclui `transacao:ver`.
- **SC-009**: `src/financeiro` não importa `ingestao`/`clientes` e `src/ingestao` não importa
  `financeiro` (ESLint verde); `/health` segue com **11** contextos.
- **SC-010**: As etapas 4–6 continuam `pulada` com a `especDona` correta; nenhuma toca
  `oferta`/`contrato`/`vinculo`.
- **SC-011**: Regressão — suíte e2e 003–017 verde sem alteração de comportamento.

---

## Assumptions

- **Adapters de plataforma (019–022) não existem ainda.** Os testes e a migração v1 (spec
  031) fornecem um `EventoCanonico` já montado via `POST /ingestao/eventos`. Sem adapter, o
  `status-map` está vazio e a maioria dos eventos reais cairia em `DESCONHECIDO` — é o
  comportamento correto e seguro por omissão.
- **Receita, vínculo Asaas↔Guru, resolução de oferta e projeção em contrato NÃO entram
  aqui** — são as specs 024 (vínculo), 023 (catálogo/oferta), 025 (contratos) e a query de
  receita (visão 5.2‑B) que virá com elas. `transacao.oferta_id`/`contrato_id`/
  `transacao_vinculada_id` nascem como colunas nulas sem FK ativa.
- **`transacao` não tem endpoint de escrita** — a única forma de criar/atualizar é pelo
  pipeline. O retry de vínculo (`POST /transacoes/{id}/tentar-vincular`) da visão 2.5 é da
  spec 024.
- **Sem auditoria de `transacao`** — não há curadoria/ajuste manual nesta fatia; o rastro é o
  `evento_origem` imutável + `evento_etapa.resultado`.
- **Frontend**: um módulo de tela novo `frontend/src/transacoes/` no padrão de
  `frontend/src/eventos/` (lista + detalhe, hooks TanStack Query inline, `apiFetch` já trata
  401/403). Item de navegação **Financeiro · Transações** atrás de `transacao:ver`.
- **Portas**: nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` seguem
  como estão; os e2e desta spec rodam contra um Postgres isolado próprio (container
  dedicado, porta livre) para não colidir com sessões concorrentes.
- **`parseInstante`** do `core` é a única porta de parsing de data — tolera ISO/epoch/naive/
  lixo (→ `null` + motivo), livre de locale.
