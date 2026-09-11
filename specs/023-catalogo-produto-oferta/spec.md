# Feature Specification: Catálogo — `produto` → `oferta` + resolução por tag AEN (pipeline etapa 5)

**Feature Branch**: `023-catalogo-produto-oferta`

**Created**: 2026-09-11

**Status**: Draft

**Input**: ROADMAP.md Fase 2 (Financeiro), item 023 — "`produto` (id surrogate, `codigo` de 3
letras = alias único, `nome`/`assinatura` curados). `oferta` (id surrogate; produto FK, turma
nullable/enum `{TURMA(n) | EVERGREEN | PERPETUO}`, subproduto, modelo de cobrança, flags).
`oferta_origem_ref` (resolução por `(tag AEN, plataforma)`, `hotmart_code`, `offer.code`).
`oferta_catalogo` 1:1 opcional (`ticket`, `preco_tabela`, `tempo_acesso`, `bonus[]`, `combo`,
`produtos_do_combo[]` junção real, `lancamento`). `janela_lancamento` (resolve turma por data).
Decodificador de tag (1 decodificador, 2 localizadores: ancorado / texto livre Asaas).
Precedência **curado > derivado da tag > null** (colunas/tabela separadas, `marcar_editado` /
`aplicar_se_nao_editado`). Pipeline etapa 5 (resolver oferta). Curadoria: `PUT /produtos/{codigo}`,
`POST/PATCH /ofertas`, `PUT /ofertas/{codigo}`. Import catálogo Hotmart (4 CSVs; `price.code`
completo, validado contra schema de colunas antes de processar). Frontend: telas de Produtos e
Ofertas + curadoria."

---

## Contexto

Quarta fatia da **Fase 2 — Financeiro** (visão Partes 1–6, Apêndice C). O _bounded context_
**`catalogo`** está vazio desde a spec 001 (só `.gitkeep`); esta spec o torna dono de
**`produto`** e **`oferta`** — "o que se vende" e "a forma de vender".

A spec 006 desenhou o pipeline de ingestão canônico com a etapa `RESOLVER_OFERTA` (ordem 5,
`especDona: 23`) como _no-op_ `pulada`, dependendo só de `UPSERT_TRANSACAO` (spec 018, já real).
A spec 018 já persiste em `transacao` os campos crus que a etapa 5 precisa —
`oferta_codigo_origem`, `oferta_nome_origem` (ambos extraídos de `EventoCanonico.oferta` pelos
adapters 019–022) — e reservou a coluna `oferta_id` (nullable, sem `@relation` ainda). Esta spec
**pluga a etapa 5** seguindo **exatamente** o padrão de inversão de dependência que a 018 usou
para as etapas 2–3 (`ExecutorEtapaExterno` do `core`, wrapper em `ingestao/application/`,
composição em `src/pipeline-wiring.module.ts`) — sem tocar `WorkerService`/`etapas.ts`.

O histórico de gambiarras da v1 (visão Parte 4, seções 4.6–4.8) já aponta o desenho-alvo:
`Oferta` como ID surrogate opaco (nunca a tag como PK — 4.6), `turma` como tipo explícito
`nullable | { número | evergreen | perpétuo }` em vez de sentinelas string (`"X0"`, `"00"` —
4.8), e separação de campo por semântica única: `codigo_oferta_origem` (chave de resolução,
cru) ≠ `rotulo_oferta_origem` (texto livre da origem) ≠ `oferta_id` (FK resolvida, exibição só
via `Oferta`).

A decisão de negócio já resolvida em 2026-09-01 (visão, "Decisões em aberto" #2 e #3): Oferta é
resolvida por **`(tag AEN, plataforma)`** — a mesma oferta comercial vendida em 2 plataformas
vira **2 registros de `oferta`**; e a resolução Hotmart **exige catálogo completo de
`price.code`** — sem fallback por `product_id`+data, sem match → `oferta = null` + evento
`REVISAR` (Regra Inviolável nº 15 — nunca um palpite).

## Clarifications

*023 não está marcada `⚠ clarify` no ROADMAP. A maior parte das decisões já vem resolvida da
Parte 7 da visão (granularidade de Oferta, resolução Hotmart, formato de `turma`). Restava **1**
decisão de fato ambígua, explicitamente sinalizada como não confirmada no próprio documento de
visão ("Confirmar no schema se `oferta_catalogo`... é compartilhado entre as duas [plataformas]
ou também por plataforma") — levada ao dono do produto em 2026-09-11.*

- **CL-01 — Escopo de `oferta_catalogo` entre plataformas.** Quando a mesma oferta comercial
  (mesma tag AEN) é vendida em 2 plataformas — 2 registros de `oferta` — cada um tem seu
  **próprio** `oferta_catalogo` (1:1 direto, não compartilhado por uma entidade de agrupamento).
  **Resolvido (2026-09-11, dono do produto):** "Por oferta (1:1 direto)". Curadoria manual entra
  separadamente para cada `oferta`, mesmo quando ticket/tempo de acesso/bônus coincidem entre as
  duas plataformas — sem entidade de agrupamento nova. Consequência: `PATCH /ofertas/{id}` edita
  só o `oferta_catalogo` daquele `id`; não há propagação automática entre ofertas irmãs da mesma
  tag.

As demais decisões de projeto (D-01..D-13, abaixo) foram resolvidas como **defaults
documentados** — mesmo tratamento das specs 010/017/018 (não marcadas `⚠ clarify`), apoiadas em
citações diretas do documento de visão:

- **D-01 — Onde mora o "decodificador de tag AEN".** `catalogo/domain/tag/` (puro, sem banco).
  Decodifica uma string de 8 caracteres em `{codigoProduto (3), turma (2 chars crus),
  subprodutoCodigo (1), modeloCobrancaCodigo (1), modeloTransacaoCodigo (1)}` — o mapeamento
  exato caractere→significado de negócio para `subproduto`/`modelo_cobranca`/`modelo_transacao`
  não está documentado em lugar nenhum do projeto (o `src/services/oferta_tag.py` da v1 não foi
  trazido para este repositório — "código e ~329 testes da v1 não são reaproveitados"). Os 3
  códigos de 1 caractere são armazenados **crus** (sem tradução para enum) em `oferta` — a
  curadoria manual pode preencher um rótulo humano depois, se o time decidir; a ingestão nunca
  adivinha o significado de um código que não conhece (Regra Inviolável nº 15). O segmento
  `turma` (2 chars) tem semântica **conhecida** pela análise 4.8 da visão: `"X0"` → evergreen,
  `"00"` → perpétuo, numérico (`"48"`) → turma nº 48; outro valor → cru preservado +
  `precisaRevisao`.
- **D-02 — Os "2 localizadores" da tag.** Não são "1 por plataforma" (a tag pode aparecer
  ancorada em qualquer plataforma cujo checkout permita configurar o ID/nome da oferta com a
  tag) — são 2 **estratégias genéricas, platform-agnostic**, aplicadas nesta ordem sobre os
  campos já extraídos pelos adapters 019–022 (`EventoCanonico.oferta.codigoOrigem`/`nomeOrigem`,
  já persistidos em `transacao`): (1) **ancorada** — `codigoOrigem` inteiro casa o formato exato
  de 8 caracteres da tag (`^[A-Z]{3}[A-Z0-9]{5}$`) → usa direto, sem procurar; (2) **texto
  livre** — senão, procura o padrão `#([A-Z]{3}[A-Z0-9]{5})` (convenção `[#PCS48XAV] ...` da
  visão, glossário) dentro de `codigoOrigem` e depois `nomeOrigem`, primeiro achado vence. Isso
  cobre naturalmente a Guru (`product.offer.id` já É a tag configurada no checkout → ancorada),
  a TMB/Asaas (só têm `nomeOrigem` livre — título/descrição) e a Guru quando o ID não é a tag
  (cai para o nome). **Hotmart nunca passa por aqui** (D-03).
- **D-03 — Estratégia por plataforma é dado, não `if` espalhado.** Um registro
  `ESTRATEGIA_RESOLUCAO_OFERTA: Record<PlataformaOrigem, 'TAG' | 'CATALOGO_HOTMART'>` em
  `catalogo/domain/resolucao/`, análogo ao `MAPAS_STATUS` do `financeiro` (018) — tabela-driven,
  testável por varredura de cobertura das 7 contas, não um `if plataforma === 'HOTMART_PRD'`
  perdido no meio de outra função. `HOTMART_PRD`/`HOTMART_SVC` → `CATALOGO_HOTMART` (só
  `oferta_origem_ref` por `price.code` exato, decisão já resolvida na Parte 7 #3); as outras 5 →
  `TAG` (decodificador D-01/D-02, com auto-criação de `oferta`/`oferta_origem_ref` na 1ª venda
  com aquela tag — mesmo espírito do auto-create de `produto`).
- **D-04 — Como o `catalogo` pluga a etapa 5 sem cruzar _bounded context_.** Reusa **o mesmo**
  contrato de inversão de dependência da 018: `catalogo` implementa `ExecutorEtapaExterno`
  (`etapa: 'RESOLVER_OFERTA'`) do `core`; `src/pipeline-wiring.module.ts` (já existe, já importa
  `ingestao` + `financeiro`) ganha o import de `CatalogoModule` e registra o 3º executor via
  `worker.definirExecutor(...)` — **nenhuma mudança em `WorkerService`/`etapas.ts`**. O executor
  lê `entrada.canonico.oferta` (já vem no `EntradaEtapaExterna`, sem precisar reconsultar
  `transacao`) + `entrada.resultados.UPSERT_TRANSACAO.transacaoId` (para saber qual linha de
  `transacao` atualizar com o `oferta_id` resolvido) + `entrada.plataformaOrigem` +
  `entrada.canonico.ocorridoEm` (para resolver turma evergreen via `janela_lancamento`).
- **D-05 — Auto-criação de `produto`.** Confirmada pela visão (glossário): 1ª transação com um
  `codigoProduto` (3 letras) novo cria `produto` com `nome`/`assinatura` nulos (curadoria
  manual depois). Aplica-se às 5 plataformas com estratégia `TAG` — a Hotmart também pode
  precisar criar um `produto` novo mesmo com resolução por catálogo (o `produtos.csv` traz o
  código do produto goberno da oferta), então o auto-create de `produto` roda **antes** do
  `if` de estratégia, igual para as 7 contas.
- **D-06 — Auto-criação de `oferta` só para estratégia `TAG`.** Estratégia `CATALOGO_HOTMART`
  **nunca** auto-cria — só resolve contra `oferta_origem_ref` já importado via CSV (D-10); sem
  match → `oferta_id = null` + `transacao.precisaRevisao = true` + motivo (Parte 7 #3, "nunca
  chuta"). Estratégia `TAG`: 1ª venda com uma tag nova auto-cria `produto` (se preciso) +
  `oferta` (com os campos crus decodificados, sem curadoria) + `oferta_origem_ref` (alias
  `(plataforma, 'tag', <tag>)`); vendas seguintes da mesma `(tag, plataforma)` resolvem por
  `oferta_origem_ref` (nunca recriam).
- **D-07 — Precedência curado > derivado > null.** Implementada com **colunas distintas** por
  campo curável de `oferta` (`turmaCurada`/`turmaDerivada`, etc. — ver Key Entities) + 1 array
  `camposEditados: string[]` em `oferta` e `produto` (nome idêntico ao
  `campos_editados_manualmente` da v1, mas como coluna própria, não reaproveitando
  `campos_alterados` do diff do financeiro — semânticas diferentes: um é "o que a curadoria
  travou", o outro é "o que mudou nesta escrita"). Dois helpers puros em `catalogo/domain/`:
  `marcarEditado(campos, nome)` (adiciona `nome` a `camposEditados`, idempotente) e
  `aplicarSeNaoEditado(atual, campos, nome, valorDerivado)` (só escreve o valor derivado se
  `nome` não estiver em `camposEditados`). A leitura projeta **1 valor efetivo por campo**
  (curado se houver override manual explícito — modelado como coluna nullable "curada" que,
  quando não-nula, sempre vence — senão o derivado, senão `null`); nunca sobrescrita
  destrutiva da coluna derivada por dado curado nem vice-versa.
- **D-08 — `oferta_catalogo` como dados **exclusivamente curados** (Princípio VIII).** Ao
  contrário de `oferta` (que tem campos derivados da tag), `oferta_catalogo` inteiro (`ticket`,
  `precoTabela`, `tempoAcesso`, `bonus[]`, `combo`, `produtosDoCombo[]`, `lancamento`) só existe
  via curadoria manual — a ingestão/CSV Hotmart nunca escreve preço/ticket/bônus direto (o
  `ofertas.csv` da Hotmart, D-12, só resolve identidade, não popula `oferta_catalogo` sozinho:
  o time de curadoria confirma os valores comerciais depois de importar). Sem `marcar_editado`/
  `aplicar_se_nao_editado` aqui — não há "derivado" para uma tabela 100% curada.
- **D-09 — `bonus[]` e `produtos_do_combo[]` como tabela de junção real.** A visão já pede
  "`produtos_do_combo[]` (junção real)"; mesmo tratamento para `bonus` — o padrão já usado pela
  spec 009 (migrou `lead.tags: String[]` para `tag`/`tag_associacao`) evita array-coluna para
  dado multi-valor estruturado. `oferta_catalogo_bonus (id, ofertaCatalogoId, descricao, ordem)`
  e `oferta_catalogo_combo_item (id, ofertaCatalogoId, produtoId)` (`@@unique` no par).
- **D-10 — `janela_lancamento` só via CSV (Princípio VIII — superfície de escrita mínima).** A
  visão v1 já classifica "Janela de Lançamento [só CSV]" entre os 6 recursos com qualquer
  escrita. Nesta spec: só populada pelo import do catálogo Hotmart (`lancamentos.csv`, D-12) —
  **nenhum endpoint de CRUD manual** para `janela_lancamento`. Resolve a turma **só para
  exibição** (o `transacao.oferta_id` aponta sempre para a mesma `oferta` evergreen; a
  "turma efetiva" numa consulta é derivada casando `transacao.ocorrido_em` contra as janelas do
  `produto` daquela oferta — nunca grava no evento/transação, mesmo espírito do v1 "reatribui
  turma (só exibição)").
- **D-11 — Escopo do CSV Hotmart nesta spec: 3 dos 4 arquivos da v1.** A v1 tinha
  `{produtos,ofertas,lancamentos,afiliados}.csv`; `afiliados.csv` popula `ProdutoAfiliado`, que
  é o domínio da **spec 026** ("vendas-como-afiliada"), não desta. Esta spec importa
  `produtos.csv`, `ofertas.csv` e `lancamentos.csv` — os 3 que alimentam `produto`/`oferta`/
  `oferta_origem_ref`/`oferta_catalogo`(parcial)/`janela_lancamento`.
- **D-12 — Schema de colunas validado antes de processar (Parte 7 #3).** Cada CSV é validado
  **inteiro** contra um schema de colunas esperado (zod) antes de qualquer linha ser
  processada — arquivo com coluna faltando/renomeada é rejeitado **atômico** (`422`, 0 linha
  gravada), nunca um processamento parcial silenciosamente incompleto. `ofertas.csv` exige a
  coluna `price_code` (o "código do preço" bruto da Hotmart — chave de resolução) **completa**
  — linha sem `price_code` é rejeitada (a decisão de negócio já não permite fallback).
- **D-13 — Superfície de escrita de curadoria.** `PUT /produtos/{codigo}` (upsert curadoria de
  `nome`/`assinatura`, como no ROADMAP). Para oferta, a v1 tinha 3 rotas
  (`POST /ofertas`, `PATCH /ofertas/{id}`, `PUT /ofertas/{codigo}`) — mas `oferta` não tem um
  código único de exibição como `produto` (a tag pode se repetir entre plataformas, D-06/CL-01;
  usá-la como identificador de rota exigiria também a plataforma). Superfície mínima adotada:
  `POST /ofertas` (criação manual — caso raro, oferta sem nenhuma venda ainda) e
  `PATCH /ofertas/{id}` (curadoria por id surrogate — cobre 100% dos casos reais, que chegam
  auto-criados pela ingestão). **Sem `PUT /ofertas/{codigo}`** — simplificação documentada
  (Princípio VIII); o painel busca a oferta por tag/produto/plataforma e edita pelo `id`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Produto/Oferta nascem sozinhos da venda (Priority: P1)

Uma venda chega pelo pipeline (TMB/Asaas/Guru, com a tag AEN no nome/descrição/ID da oferta) e,
sem nenhuma ação manual, o sistema identifica o produto (`PCS`) e a oferta comercial (turma 48)
por trás dela, e a transação fica ligada a essa oferta.

**Why this priority**: é o comportamento que faz o pipeline (etapas 0–5) fechar de ponta a
ponta pela 1ª vez — sem ele, nenhuma transação nova-conta tem `oferta_id`, e a spec 025
(contratos) não tem o que foldar por oferta/tempo de acesso.

**Independent Test**: registrar um `EventoCanonico` com `oferta.nomeOrigem = "[#PCS48XAV] Programa..."`
via `RegistrarEventoService` + rodar `POST /ingestao/eventos/processar`; verificar que existe
`produto.codigo = 'PCS'`, `oferta` com `produtoId` correto e `turmaDerivada = 48`, e
`transacao.ofertaId` aponta pra ela.

**Acceptance Scenarios**:

1. **Given** nenhum produto `PCS` existe, **When** uma transação Guru chega com
   `oferta.codigoOrigem = "PCS48XAV"` (a tag configurada como ID da oferta no Guru), **Then** o
   sistema cria `produto` (`codigo: PCS`, `nome: null`), `oferta` (turma derivada 48,
   `produtoId`), `oferta_origem_ref (GURU_PRD, 'tag', 'PCS48XAV')`, e `transacao.ofertaId`
   aponta pra ela.
2. **Given** a mesma tag `PCS48XAV` já resolvida para `GURU_PRD`, **When** uma 2ª transação
   Guru chega com a mesma tag, **Then** nenhum `produto`/`oferta` novo é criado — resolve pelo
   `oferta_origem_ref` existente (idempotência).
3. **Given** a mesma tag comercial `PCS48XAV` aparece também numa venda `HOTMART_PRD`, **When**
   ela é resolvida (via catálogo Hotmart, não via tag — US3), **Then** nasce um **2º** registro
   de `oferta` (produto `PCS`, mesma turma 48, `plataformaOrigem` diferente na
   `oferta_origem_ref`), nunca reaproveita a `oferta` da Guru.
4. **Given** uma transação Asaas com `oferta.nomeOrigem = "Mensalidade Programa Consultório - #PCS00LAV"`,
   **When** processada, **Then** a tag é localizada por texto livre, produto/oferta resolvidos,
   turma derivada = perpétuo (`"00"`).
5. **Given** uma transação TMB sem nenhum padrão de tag reconhecível no título/código,
   **When** processada, **Then** `oferta_id` fica `null`, `transacao.precisaRevisao = true`,
   motivo explica "tag de oferta não localizada" — nunca um palpite.

---

### User Story 2 - Curadoria de Produto e Oferta (Priority: P1)

O time de operações corrige o nome/assinatura de um produto auto-criado e completa os dados
comerciais (ticket, tempo de acesso, bônus) de uma oferta que a ingestão só decodificou
parcialmente.

**Why this priority**: sem curadoria, todo produto/oferta fica com nome nulo e nenhum dado
comercial — inútil para qualquer relatório ou para a Central de Clientes calcular desconto.

**Independent Test**: `PUT /produtos/PCS {"nome": "Programa Consultório Smart"}` seguido de
`GET /produtos/PCS` mostrando o nome; depois `PATCH /ofertas/{id}` com `ticket`/`tempoAcesso`,
confirmando persistência e que uma nova venda com a mesma tag **não sobrescreve** o que foi
curado.

**Acceptance Scenarios**:

1. **Given** um produto `PCS` auto-criado sem nome, **When** `PUT /produtos/PCS` define
   `nome`/`assinatura`, **Then** o produto reflete os novos valores, `camposEditados` inclui
   `nome`/`assinatura`, e um registro em `catalogo_audit` é criado (só delta real).
2. **Given** uma oferta com `turmaDerivada = 48` (da tag) e nenhuma `turmaCurada`, **When**
   uma nova venda da mesma tag chega e a tag decodifica turma diferente por engano de dado de
   origem, **Then** o valor derivado pode mudar, mas se havia uma `turmaCurada` explícita ela
   nunca é tocada (curado > derivado).
3. **Given** uma oferta sem `oferta_catalogo`, **When** `PATCH /ofertas/{id}` envia
   `{"catalogo": {"ticket": {...}, "tempoAcesso": "P1Y", "bonus": ["Ebook X", "Mentoria Y"]}}`,
   **Then** `oferta_catalogo` + 2 `oferta_catalogo_bonus` são criados/atualizados
   transacionalmente.
4. **Given** uma tentativa de `PATCH /ofertas/{id}` com um `produtoId` de um produto inexistente,
   **When** a requisição chega, **Then** `404`, nenhuma escrita parcial.

---

### User Story 3 - Import do catálogo Hotmart e resolução por `price.code` (Priority: P2)

O time importa os 3 CSVs exportados do painel da Hotmart (produtos, ofertas com `price.code`,
lançamentos) e, a partir daí, vendas Hotmart passam a resolver oferta contra esse catálogo —
nunca por tag (a Hotmart não expõe a tag na venda).

**Why this priority**: sem isso, 100% das vendas Hotmart ficam `oferta_id = null` +
`REVISAR` para sempre — Hotmart é uma das 4 plataformas de origem do projeto.

**Independent Test**: importar um `ofertas.csv` com 2 linhas válidas + 1 com `price_code`
vazio; ver `{importadas: 2, rejeitadas: 1}`; reprocessar um evento Hotmart cujo
`oferta.codigoOrigem` bate com uma das 2 linhas e ver `transacao.ofertaId` preenchido.

**Acceptance Scenarios**:

1. **Given** um `ofertas.csv` com todas as colunas esperadas, **When**
   `POST /catalogo/hotmart/importar-ofertas`, **Then** cada linha vira/atualiza `oferta` +
   `oferta_origem_ref (HOTMART_PRD|SVC, 'hotmart_price_code', <price_code>)`, vinculada ao
   `produto` pela coluna de código de produto do CSV.
2. **Given** um `ofertas.csv` com uma coluna renomeada/faltando, **When** importado, **Then**
   `422` antes de processar qualquer linha (schema de colunas inválido), 0 escrita.
3. **Given** uma venda Hotmart com `codigoOrigem` (price code) que não bate com nenhum
   `oferta_origem_ref` importado, **When** processada, **Then** `oferta_id = null` +
   `precisaRevisao = true` — nunca tenta resolver por tag/nome como fallback.
4. **Given** `lancamentos.csv` com uma janela `PCS, "Turma 50", 2026-10-01, 2026-10-15`,
   **When** importado e uma consulta de transação Hotmart evergreen do produto `PCS` ocorrida
   em `2026-10-05` é exibida, **Then** a "turma efetiva" mostrada é "Turma 50" (só exibição,
   `oferta_id` continua apontando pra oferta evergreen).

### Edge Cases

- Tag ancorada (`codigoOrigem`) mal-formada (7 ou 9 caracteres, minúsculas) → cai para o
  localizador de texto livre em `codigoOrigem` e depois `nomeOrigem`; nada encontrado →
  `REVISAR`.
- Duas tags diferentes aparecem no mesmo `nomeOrigem` (texto livre ambíguo, ex. copy que cita
  um produto irmão) → primeiro match do regex vence (determinístico, documentado); não é
  reprocessado como ambíguo — só produto/oferta errados entram em `precisaRevisao` se a leitura
  humana perceber depois (curadoria corrige manualmente, nunca reverte automaticamente — mesmo
  princípio de "reimportação nunca desfaz vínculo, só alerta").
- `codigoProduto` decodificado da tag (3 letras) já existe como `produto` mas com `nome`
  curado — a curadoria de nome nunca é tocada; só o vínculo `oferta.produtoId` é novo.
- CSV Hotmart reimportado com o mesmo `price_code` mas dados de produto diferentes — upsert
  atualiza os campos **derivados** de `oferta` (nunca os curados, D-07), sempre idempotente por
  `(plataforma, 'hotmart_price_code', price_code)`.
- Evento reprocessado (worker retry) para uma transação cuja oferta já foi resolvida — etapa é
  idempotente: mesma oferta, 0 duplicata em `oferta_origem_ref`.
- `janela_lancamento` duas janelas do mesmo produto se sobrepõem (erro de import) — a consulta
  de turma efetiva pega a primeira por `inicio` mais recente que ainda contém a data (retorna
  1, documentado, sem 500).
- `PATCH /ofertas/{id}` tentando mudar `produtoId` para um produto que já tem outra oferta com
  a mesma tag AEN na mesma plataforma → `409` (violaria a unicidade de `oferta_origem_ref`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE decodificar uma string de 8 caracteres no formato
  `[A-Z]{3}[A-Z0-9]{2}[A-Z0-9]{3}` em `codigoProduto`, `turma` (bruto: evergreen/perpétuo/
  número/desconhecido) e 3 códigos de 1 caractere (`subproduto`, `modeloCobranca`,
  `modeloTransacao`), como função pura sem efeitos colaterais.
- **FR-002**: O sistema DEVE localizar a tag num `EventoCanonico.oferta` tentando primeiro o
  campo `codigoOrigem` como âncora (formato exato) e, se não casar, procurando o padrão
  `#<8 chars>` em `codigoOrigem` e depois em `nomeOrigem` — nessa ordem — para as plataformas
  com estratégia `TAG` (todas exceto Hotmart).
- **FR-003**: O sistema DEVE resolver oferta para contas `HOTMART_PRD`/`HOTMART_SVC`
  **exclusivamente** por consulta a `oferta_origem_ref` (tipo `hotmart_price_code`) — nunca por
  decodificação de tag, mesmo que o texto pareça conter uma.
- **FR-004**: O sistema DEVE auto-criar `produto` na 1ª vez que um `codigoProduto` (decodificado
  da tag, ou vindo do catálogo Hotmart) não existir — `nome`/`assinatura` nascem nulos.
- **FR-005**: O sistema DEVE auto-criar `oferta` + `oferta_origem_ref` na 1ª venda de uma
  `(tag, plataforma)` nova, só quando a estratégia da plataforma for `TAG`.
- **FR-006**: O sistema NUNCA DEVE auto-criar `oferta` para plataformas com estratégia
  `CATALOGO_HOTMART` — sem match no catálogo importado, `oferta_id = null` e o evento/transação
  ficam marcados para revisão, com motivo explícito.
- **FR-007**: O sistema DEVE atualizar `transacao.ofertaId` com o resultado da etapa
  `RESOLVER_OFERTA` (ou mantê-lo `null` com motivo de revisão), de forma idempotente
  (reprocessar não duplica nem regride um vínculo já resolvido para `null` sem motivo novo).
- **FR-008**: O sistema DEVE manter para cada campo curável de `produto` (`nome`, `assinatura`)
  e de `oferta` (`turma`, `subproduto`, `modeloCobranca`, `modeloTransacao`) uma coluna de valor
  curado e uma de valor derivado, com o valor efetivo de leitura sendo sempre
  curado-se-presente-senão-derivado-senão-null — nunca sobrescrita destrutiva de um pelo outro.
- **FR-009**: O sistema DEVE permitir curadoria manual de `produto` via `PUT /produtos/{codigo}`
  (upsert de `nome`/`assinatura`) sob a permissão `produto:editar`.
- **FR-010**: O sistema DEVE permitir consulta de `produto`/`oferta` (`GET /produtos`,
  `GET /produtos/{codigo}`, `GET /ofertas`, `GET /ofertas/{id}`) sob `produto:ver`/`oferta:ver`.
- **FR-011**: O sistema DEVE permitir criação manual (`POST /ofertas`) e curadoria
  (`PATCH /ofertas/{id}`) de oferta — incluindo os dados comerciais de `oferta_catalogo`
  (ticket, preço de tabela, tempo de acesso, bônus, combo) — sob `oferta:criar`/`oferta:editar`.
- **FR-012**: O sistema DEVE modelar `oferta_catalogo` como 1:1 opcional e **exclusivo** de cada
  registro de `oferta` (CL-01) — nunca compartilhado entre ofertas de plataformas diferentes,
  mesmo quando a tag AEN é a mesma.
- **FR-013**: O sistema DEVE modelar `bonus` e `produtos_do_combo` de `oferta_catalogo` como
  tabelas de junção reais (não colunas array), com ordem preservada para bônus.
- **FR-014**: O sistema DEVE importar `produtos.csv`, `ofertas.csv` e `lancamentos.csv` do
  catálogo Hotmart, validando o schema de colunas de cada arquivo **por completo** antes de
  processar qualquer linha — arquivo inválido é rejeitado atomicamente (0 linha gravada).
- **FR-015**: O sistema DEVE rejeitar (contabilizar como ignorada, não interromper o arquivo)
  qualquer linha de `ofertas.csv` sem `price_code` preenchido.
- **FR-016**: O sistema DEVE resolver, só para exibição, a "turma efetiva" de uma oferta
  evergreen numa data específica, consultando `janela_lancamento` do produto — sem jamais
  alterar `transacao.ofertaId` ou criar uma nova `oferta`.
- **FR-017**: O sistema DEVE registrar toda escrita de curadoria (produto/oferta/catálogo) em
  auditoria append-only, só com o delta real (campo, valor anterior, valor novo, autor, motivo
  quando aplicável).
- **FR-018**: O sistema NUNCA DEVE expor um endpoint de escrita para `janela_lancamento` fora do
  import de CSV do catálogo Hotmart.
- **FR-019**: O sistema DEVE tratar a etapa `RESOLVER_OFERTA` do pipeline como idempotente e
  independente de `RESOLVER_VINCULO` (etapa 4, spec 024) — ambas dependem só de
  `UPSERT_TRANSACAO`, sem depender uma da outra.

### Key Entities

- **`Produto`**: id surrogate (UUID v7), `codigo` (3 letras, alias único, imutável após
  criação), `nomeCurado`/`nomeDerivado`, `assinaturaCurada`/`assinaturaDerivada` (bool
  nullable), `camposEditados: string[]`, timestamps.
- **`Oferta`**: id surrogate; `produtoId` FK; `turmaCurada`/`turmaDerivada` (estrutura
  `{tipo: 'NUMERO'|'EVERGREEN'|'PERPETUO'|'DESCONHECIDO', numero?: int}`);
  `subprodutoCodigoCurado`/`Derivado`, `modeloCobrancaCodigoCurado`/`Derivado`,
  `modeloTransacaoCodigoCurado`/`Derivado` (1 caractere cru); `camposEditados: string[]`;
  timestamps.
- **`OfertaOrigemRef`**: `ofertaId` FK, `plataformaOrigem`, `tipoRef`
  (`'tag'|'hotmart_price_code'`), `valorRef` (cru) — `@@unique(plataformaOrigem, tipoRef,
  valorRef)`; nunca PK de `oferta`.
- **`OfertaCatalogo`**: `ofertaId` FK única (1:1); `ticket: Dinheiro`,
  `precoTabela: Dinheiro`, `tempoAcesso` (duração — dias inteiros), `combo: boolean`,
  `lancamento: boolean`; 100% curado (D-08).
- **`OfertaCatalogoBonus`**: `ofertaCatalogoId` FK, `descricao`, `ordem`.
- **`OfertaCatalogoComboItem`**: `ofertaCatalogoId` FK, `produtoId` FK (produto incluso no
  combo) — `@@unique` no par.
- **`JanelaLancamento`**: `produtoId` FK, `rotulo` (label da turma, ex. "Turma 50"), `inicio`/
  `fim` (datas), populada só via CSV (D-10).
- **`CatalogoAudit`**: forma canônica do core (`montarRegistroAuditoria`), append-only, cobre
  `produto`/`oferta`/`oferta_catalogo`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma transação nova de qualquer uma das 5 contas não-Hotmart com uma tag AEN
  reconhecível resolve produto+oferta automaticamente, sem qualquer intervenção manual, em
  100% dos casos de teste com tag bem-formada.
- **SC-002**: Uma venda Hotmart cujo `price.code` foi previamente importado resolve para a
  oferta certa em 100% dos casos; sem import prévio, cai para revisão em 100% dos casos —
  nunca resolve por adivinhação.
- **SC-003**: Uma edição de curadoria (nome de produto, ticket de oferta) sobrevive a qualquer
  quantidade de reprocessamento subsequente do pipeline sem ser sobrescrita.
- **SC-004**: Um CSV de catálogo com schema de colunas inválido é rejeitado por completo (0
  linha gravada), nunca deixando o catálogo num estado parcialmente importado.
- **SC-005**: A equipe consegue localizar e corrigir o nome de um produto e os dados comerciais
  de uma oferta pelo painel em menos de 1 minuto, sem precisar de acesso direto ao banco.

## Assumptions

- O mapeamento exato caractere→significado de `subproduto`/`modelo_cobranca`/
  `modelo_transacao` da tag de 8 caracteres não está disponível neste projeto (código v1 não
  migrado); esses 3 códigos são armazenados crus, sem tradução automática para um enum de
  negócio (D-01). Uma curadoria futura pode anotar um rótulo humano se o time decidir que vale
  a pena.
- `afiliados.csv` do catálogo Hotmart pertence à spec 026 (`ProdutoAfiliado`), fora do escopo
  desta spec (D-11).
- O formato exato de colunas dos 3 CSVs (`produtos.csv`, `ofertas.csv`, `lancamentos.csv`) é
  definido nesta spec (não há arquivo de exemplo real disponível no repositório) — nomes de
  coluna em português com aliases comuns, seguindo o padrão já usado pelos parsers de CSV das
  specs 019–022 (detecção de separador, BOM, aliases pt-BR/inglês). O time de operações pode
  precisar adaptar a exportação real da Hotmart ao schema documentado em
  `docs/023-catalogo-produto-oferta.md`.
- `oferta_catalogo.tempoAcesso` é modelado como dias inteiros (consistente com `fim_acesso`
  sendo calculado por soma de dias na spec 025, ainda não implementada) — a spec 025 pode
  refinar para uma unidade de duração mais rica se necessário.
- Nenhuma das 022 specs anteriores expôs um mecanismo de "sincronização sob demanda" para
  catálogo (a Hotmart não tem endpoint de API para listar catálogo de preços em lote de forma
  praticável para este projeto) — o único caminho de entrada do catálogo Hotmart é o CSV
  (mesmo padrão da v1).
