# Feature Specification: Contratos · Aditivos · Fold (pipeline etapa 6)

**Feature Branch**: `025-contratos-aditivos-fold`

**Created**: 2026-09-11

**Status**: Draft

**Input**: ROADMAP.md Fase 2 (Financeiro), item 025 — "`contrato` 1 por `(cliente, produto)`,
perpétuo. Campos **derivados** por fold sobre `aditivo`s (`fim_acesso`, `status_canonico`,
`acesso_liberado`, `ticket_total`, `valor_recebido` — todos `f(eventos)`, nunca incremental).
Campos **curados** (`tolerancia_atraso`, `contrato_assinado`, ajuste manual com marca de
'ajustado em X'). `fim_acesso = max(fim vigente, data do aditivo) + tempo_acesso`. Rótulo
renovação/prorrogação derivado do estado de acesso na data. Recálculo determinístico e
idempotente, testável sem banco. Pipeline etapa 6. `GET /contratos` (busca produto + turma),
`GET /contratos/{id}`, `PATCH /contratos/{id}` (ajuste manual). Frontend: lista/detalhe de
contrato + linha do tempo de aditivos."

---

## Contexto

Sexta fatia da **Fase 2 — Financeiro** (visão Partes 1–6) e a **1ª entidade de negócio** do
_bounded context_ `contratos` (vazio desde a spec 001; `CONTEXT_MODULES` segue 11). Materializa
a Regra Inviolável nº 3 ("Contrato é único por `(cliente, produto)` e perpétuo") e o Princípio V
("tudo que é agregado é derivado — `f(eventos) -> estado`, nunca `estado += delta`").

A spec 006 reservou a etapa `PROJETAR_CONTRATO` (ordem 6, `especDona: 25`, no-op `pulada`,
dependendo só de `UPSERT_TRANSACAO`) em `ingestao/domain/etapas.ts`. A spec 018 reservou a
coluna `transacao.contrato_id` (nullable, sem `@relation`) especificamente para esta spec
ligar. A spec 023 resolve `transacao.oferta_id` (com `@relation` ativa) e
`oferta_catalogo.tempo_acesso_dias` — este último é o insumo que a fórmula do aditivo consome.
Os comentários dos próprios enums do `core` (`status-transacao.ts`, `status-contrato.ts`) já
apontam para esta spec: "a janela de tolerância... é aplicada na leitura pelo contexto
`contratos` (spec 025)".

Esta spec **pluga a etapa 6** seguindo o mesmo padrão de inversão de dependência das specs
018/023/024 (`ExecutorEtapaExterno` do `core` + `src/pipeline-wiring.module.ts`, sem tocar
`WorkerService`/`etapas.ts`/`classificar.ts`). O grafo de dependências declarado em
`etapas.ts` só exige `UPSERT_TRANSACAO` — a etapa 6 roda **independente** da 4
(`RESOLVER_VINCULO`) e da 5 (`RESOLVER_OFERTA`); na prática, dentro de uma mesma passada do
`WorkerService.processarEvento`, as etapas elegíveis rodam em ordem crescente (4 → 5 → 6), então
a oferta já está resolvida quando a 6 roda pela primeira vez — mas o executor **não presume
isso**: se `oferta_id` ainda não foi resolvido (ex.: reprocessamento manual de uma etapa
isolada), não cria/atualiza o contrato agora — sem marcar um motivo de revisão **novo**, já
que `RESOLVER_OFERTA` (023) sempre marca o evento sozinho quando não consegue resolver; o
próximo reprocesso da etapa 6 tenta de novo, sem nunca "chutar" (Regra Inviolável nº 15).

Mora no _bounded context_ **`contratos`** — já listado nas zonas do ESLint
(`import/no-restricted-paths`) desde a spec 001, então **não pode importar**
`src/financeiro/**` nem `src/catalogo/**`. Seguindo o precedente já estabelecido pela spec 023
(que grava `transacao.oferta_id` direto via `PrismaService`, sem importar `financeiro`), o
executor desta spec lê `transacao`/`oferta`/`oferta_catalogo` **direto via `PrismaService`**
(a fronteira do Princípio VI é sobre import de módulo TypeScript, não sobre o schema
Prisma — CLAUDE.md já documenta esse precedente para as specs 009/010) e escreve
`transacao.contrato_id` da mesma forma.

## Clarifications

*025 não está marcada `⚠ clarify` no ROADMAP. 4 decisões de fato ambíguas — a mais importante
sendo uma aparente contradição entre o pedido original e a Regra Inviolável nº 13 já
confirmada na Parte 3 da visão — foram resolvidas diretamente nesta spec, como defaults
documentados (mesmo padrão das specs 018/023), antes do `plan.md`.*

- **CL-01 — Precedência do ajuste manual vs. Regra Inviolável nº 13.** A visão (Parte 3, regra
  13) já confirmou: "`acesso_liberado`, `status` e `valor_recebido` do Contrato são
  recalculados a cada aditivo, **mesmo sobrescrevendo um ajuste manual anterior** (decisão do
  negócio)". Isso é diferente da precedência "curado > derivado" usada em `Produto`/`Oferta`
  (specs 007/023), onde o campo curado nunca é sobrescrito. Aqui: o ajuste manual
  (`PATCH /contratos/{id}`) é um **override temporário** — aplicado na leitura enquanto
  nenhum aditivo novo chegar, mas **limpo automaticamente** (para `null`) na próxima vez que
  a etapa 6 recalcular o fold do contrato (chegada de uma transação nova, ou atualização de uma
  existente — ex.: reembolso). A marca de auditoria ("ajustado em X por Y, motivo Z") **não** é
  apagada — fica para sempre em `contrato_audit` (append-only), só o campo vivo no `contrato` é
  limpo. `tolerancia_atraso_dias` e `contrato_assinado` são diferentes: **não têm par
  derivado** (o fold nunca os calcula), então nunca são "sobrescritos" — permanecem até o
  próximo `PATCH`.
- **CL-02 — Quais transações geram aditivo.** Só `classificacao ∈ {VENDA_PROPRIA,
  RECORRENCIA, REEMBOLSO}` chegam a virar aditivo — a etapa 6 devolve `pulada` para as demais
  (`VENDA_AFILIADA` nunca gera Contrato, Regra nº 8; `COBRANCA_TERCEIRIZADA`, reclassificada
  pela etapa 4/024, também não — a venda Guru correspondente já é o aditivo de registro;
  `OUTRO`/`DESCONHECIDO` já chegam marcadas para revisão pela própria etapa 1/`classificar`,
  sem que a 6 precise repetir o sinal). Uma transação qualificada mas com `pessoa_id` ou
  `oferta_id` ainda não resolvidos **não** cria/atualiza o contrato ainda — sem acrescentar um
  motivo de revisão novo (a etapa 2 já trata `pessoa_id: null` sem dado de identidade como um
  resultado válido, não revisável; a etapa 5 já marca revisão sozinha quando não resolve a
  oferta) — reprocessável a qualquer momento (Princípio IV), nunca bloqueia as demais etapas.
- **CL-03 — Rótulo do aditivo: 3 valores, não 2.** A visão (Parte 7, item 1) define só
  "renovação" (tinha acesso, expirou) e "prorrogação" (ainda tem acesso). Nenhuma das duas
  descreve a 1ª compra de um produto (nunca teve acesso). Esta spec adiciona um 3º rótulo,
  `COMPRA_INICIAL`, para esse caso — sem contradizer a regra (é o caso degenerado que a regra
  não precisou nomear) e útil na linha do tempo do painel. Transações que não concedem acesso
  (`REEMBOLSO`, ou status que não libera acesso — `RECUSADO`/`CANCELADO`/`DESCONHECIDO`/
  `ESTORNADO`/`CHARGEBACK` numa venda própria/recorrência) recebem `REEMBOLSO` ou `SEM_EFEITO`
  respectivamente — não estendem `fim_acesso`.
- **CL-04 — `ticket_total` vs. `valor_recebido`.** `ticket_total[moeda]` soma o `valor_bruto`
  de todo aditivo com `classificacao ∈ {VENDA_PROPRIA, RECORRENCIA}` (o que a pessoa se
  comprometeu a pagar por este produto, histórico, não afetado por reembolso posterior).
  `valor_recebido[moeda]` soma o `valor_líquido` (ou bruto, se líquido ausente) só dos aditivos
  cujo `status_canonico` **atual** satisfaz `contaComoReceita()` do `core` (hoje só `PAGO`) —
  como `transacao` é upsertada por chave natural (Regra nº 1), um reembolso muda o
  `status_canonico` da **mesma** linha para `ESTORNADO`/`CHARGEBACK`, que já falha
  `contaComoReceita()`; o fold recalculando do zero a cada vez já exclui esse valor
  automaticamente — nenhuma lógica de reversão manual é necessária (Princípio V).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver o estado de acesso de um cliente a um produto (Priority: P1)

Um atendente do time de CS/vendas precisa saber, para um cliente e produto específicos, se o
acesso está ativo, até quando, e o histórico de compras/renovações que levaram a esse estado —
sem consultar 7 plataformas diferentes.

**Why this priority**: é a razão de existir da spec — "1 registro, 7 contas" também vale para
o estado de acesso, hoje espalhado entre Guru/Hotmart/TMB/Asaas.

**Independent Test**: com um contrato existente (criado por transações já ingeridas), acessar
`GET /contratos/{id}` e ver `status_canonico`, `fim_acesso`, `acesso_liberado` e a lista
ordenada de aditivos com seus rótulos.

**Acceptance Scenarios**:

1. **Given** uma pessoa comprou um produto uma única vez com acesso de 30 dias há 10 dias,
   **When** o atendente abre o contrato, **Then** vê `status_canonico = ATIVO`,
   `acesso_liberado = true`, `fim_acesso` = data da compra + 30 dias, e 1 aditivo rotulado
   `COMPRA_INICIAL`.
2. **Given** o mesmo contrato, sem nenhuma renovação, **When** a data atual passa de
   `fim_acesso` (e da tolerância de atraso, se houver), **Then** o mesmo contrato (sem nenhum
   aditivo novo) passa a mostrar `status_canonico = EXPIRADO` na próxima leitura — o estado é
   recalculado no momento da consulta, não preso ao valor de quando o último aditivo chegou.
3. **Given** um contrato `EXPIRADO`, **When** a pessoa compra o mesmo produto de novo,
   **Then** um novo aditivo rotulado `RENOVACAO` é criado e `fim_acesso` avança a partir da
   data desta nova compra (nunca da data antiga).

### User Story 2 - Renovar/prorrogar sem duplicar contrato (Priority: P1)

O pipeline de ingestão processa uma nova venda (ou renovação, ou pagamento recorrente) do
mesmo produto para a mesma pessoa e precisa aplicá-la ao contrato **existente** — nunca criar
um segundo.

**Why this priority**: é a Regra Inviolável nº 3 e o motivo de a spec existir — o sistema atual
já teve esse bug (visão Parte 4).

**Independent Test**: ingerir 2 transações da mesma pessoa/produto (datas diferentes) pelo
pipeline e confirmar, via `GET /contratos?pessoaId=...`, que existe **1** contrato com **2**
aditivos na linha do tempo.

**Acceptance Scenarios**:

1. **Given** uma pessoa com um contrato ativo de um produto, **When** ela compra o mesmo
   produto de novo enquanto o acesso anterior ainda vale, **Then** o aditivo novo é rotulado
   `PRORROGACAO` e `fim_acesso` vira `max(fim_acesso atual, data desta compra) + tempo_acesso`
   (nunca perde tempo já pago).
2. **Given** um reembolso chega para uma transação já aplicada como aditivo, **When** o
   pipeline reprocessa, **Then** o fold recalcula o contrato do zero e o `valor_recebido`
   correspondente sai da soma (a transação, upsertada, agora tem `status_canonico` que não
   conta como receita) — sem apagar o aditivo da linha do tempo (ele passa a aparecer rotulado
   `REEMBOLSO`).

### User Story 3 - Ajuste manual pontual (Priority: P2)

Um ajuste comercial pontual (ex.: liberação de acesso por cortesia, ou cancelamento por decisão
de suporte) precisa de um jeito de sobrescrever o estado por um tempo, sem virar uma gambiarra
que trava para sempre.

**Why this priority**: cobre um caso real de negócio já citado na visão (Parte 8: "liberação de
desafios... é ajuste manual de Contrato"), mas é secundário ao fluxo automático.

**Independent Test**: `PATCH /contratos/{id}` com um novo status; `GET /contratos/{id}` reflete
o override imediatamente; ingerir uma nova transação qualificada para esse contrato e
confirmar, no próximo `GET`, que o override não aparece mais (voltou ao valor derivado) — mas
o registro do ajuste continua na auditoria.

**Acceptance Scenarios**:

1. **Given** um contrato `EXPIRADO`, **When** o suporte faz `PATCH` com `status: ATIVO` e um
   motivo, **Then** o contrato mostra `ATIVO`/`acesso_liberado: true` até a próxima transação
   qualificada chegar.
2. **Given** o mesmo contrato com o override ativo, **When** uma nova transação qualificada é
   processada pelo pipeline, **Then** o override é limpo e o `status_canonico` volta a ser
   1000% derivado do fold — o registro anterior do ajuste permanece na auditoria do contrato.
3. **Given** um `PATCH` sem `motivo`, **When** a requisição é enviada, **Then** o backend
   recusa com `400` (motivo é obrigatório em todo ajuste manual, Padrão Transversal
   "Auditoria").

### Edge Cases

- Transação qualificada chega **antes** da oferta ser resolvida (etapa 5 ainda `pendente`,
  ex.: reprocessamento manual isolado) → etapa 6 não cria/atualiza contrato ainda (sem
  acrescentar revisão nova — a etapa 5 já se marcou revisão sozinha quando não resolve);
  reprocessa com sucesso depois que a etapa 5 concluir.
- Oferta resolvida mas sem `tempo_acesso_dias` cadastrado em `oferta_catalogo` (curadoria
  pendente) → contrato é criado/atualizado (já se sabe o produto), mas este aditivo específico
  não estende `fim_acesso`; fica marcado para revisão até alguém curar o campo e reprocessar.
- Duas transações concorrentes da mesma pessoa/produto tentam criar o contrato ao mesmo tempo
  (corrida) → get-or-create trata a violação de unicidade `(pessoa_id, produto_id)` como
  "já existe", recarrega e aplica o fold — nunca 2 contratos.
- Pessoa tem 2 contratos de produtos **diferentes** — cada um com seu próprio `fim_acesso`;
  nunca aparecem somados nem confundidos.
- Reimportação/reprocessamento de uma transação já aplicada não desfaz nada — o fold roda do
  zero sobre o estado atual das transações do contrato (Princípio VII), então o resultado é
  sempre consistente com o que existe agora no ledger, nunca com um estado "congelado".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE garantir, por construção, no máximo 1 `contrato` por par
  `(pessoa_id, produto_id)` — nunca um 2º contrato para a mesma dupla, mesmo sob concorrência.
- **FR-002**: O sistema DEVE aplicar, à etapa `PROJETAR_CONTRATO` do pipeline de ingestão, só
  as transações cuja `classificacao` seja `VENDA_PROPRIA`, `RECORRENCIA` ou `REEMBOLSO`, com
  `pessoa_id` e `oferta_id` já resolvidos; nos demais casos, não criar/atualizar o contrato
  ainda, sem bloquear as outras etapas e sem acrescentar um motivo de revisão novo (upstream
  já sinaliza revisão quando o próprio dado é ambíguo — etapas 1/5).
- **FR-003**: O sistema DEVE calcular `fim_acesso` de um contrato como
  `max(fim_acesso vigente ?? data do aditivo, data do aditivo) + tempo_acesso da oferta`, só
  para aditivos cuja transação libera acesso (`liberaAcesso()` do `core`) e cuja classificação
  não seja `REEMBOLSO`.
- **FR-004**: O sistema DEVE derivar `status_canonico`/`acesso_liberado` de um contrato, em
  **toda leitura**, a partir de `fim_acesso` + `tolerancia_atraso_dias` + a hora atual — nunca
  de um valor persistido que dependa do tempo desde o último aditivo — exceto quando um ajuste
  manual vigente (não limpo por um aditivo posterior) estiver presente, caso em que ele vence.
- **FR-005**: O sistema DEVE recalcular **todo** o fold do contrato (não um delta) sempre que
  uma transação nova ou atualizada for aplicada a ele, e DEVE fazê-lo de forma determinística
  e idempotente (reprocessar sem duplicar efeito).
- **FR-006**: O sistema DEVE rotular cada aditivo, na hora do fold, como `COMPRA_INICIAL`
  (nunca teve acesso antes), `RENOVACAO` (tinha e expirou), `PRORROGACAO` (ainda tem acesso
  ativo), `REEMBOLSO` (classificação de estorno) ou `SEM_EFEITO` (não concede nem retira
  acesso) — derivado do estado do contrato **na data do aditivo**, nunca uma escolha manual.
- **FR-007**: O sistema DEVE somar `ticket_total` e `valor_recebido` **por moeda**
  (`dict[moeda, valor]`), nunca somando moedas diferentes nem misturando com receita de
  afiliada.
- **FR-008**: O sistema DEVE permitir 3 campos curados por contrato — `tolerancia_atraso_dias`,
  `contrato_assinado` e um ajuste manual pontual de status — editáveis só por
  `PATCH /contratos/{id}`, cada edição exigindo `motivo` e registrando autor + data + motivo em
  auditoria append-only.
- **FR-009**: O sistema DEVE limpar o ajuste manual de status (nunca a `tolerancia_atraso_dias`
  nem `contrato_assinado`) na primeira vez que uma transação nova/atualizada for aplicada ao
  contrato após o ajuste — preservando o registro da auditoria.
- **FR-010**: O sistema DEVE expor `GET /contratos` com filtros por produto (código), turma (da
  oferta de qualquer aditivo do contrato), pessoa e status derivado; e `GET /contratos/{id}`
  com o contrato e a lista ordenada de aditivos (com rótulo, data, valores e status da
  transação de origem).
- **FR-011**: O sistema NÃO DEVE oferecer nenhum endpoint que crie ou exclua um contrato
  diretamente — `contrato` só nasce/muda pelo pipeline de ingestão (Princípio VIII); a única
  escrita HTTP é o ajuste manual curado.
- **FR-012**: O sistema DEVE manter `transacao.contrato_id` apontando para o contrato de cada
  aditivo (FK ativa), permitindo navegar de uma transação ao seu contrato e vice-versa.

### Key Entities

- **Contrato**: vínculo único e perpétuo entre uma `pessoa` e um `produto`. Campos derivados
  (fold): `fim_acesso`, `ticket_total`/`valor_recebido` (por moeda); `status_canonico`/
  `acesso_liberado` são funções de leitura, não colunas. Campos curados:
  `tolerancia_atraso_dias`, `contrato_assinado`, ajuste manual pontual de status (com autor,
  data e motivo).
- **Aditivo**: projeção derivada de 1 `transacao` aplicada a 1 `contrato` (1:1 por
  `transacao_id`) — guarda o rótulo (`COMPRA_INICIAL`/`RENOVACAO`/`PRORROGACAO`/`REEMBOLSO`/
  `SEM_EFEITO`) e o `fim_acesso` resultante **naquele ponto** da linha do tempo, recalculado do
  zero a cada fold. `transacao` continua a fonte de verdade dos valores/status/data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Consultando o contrato de qualquer cliente, o time de atendimento vê em menos de
  3 segundos se o acesso está ativo e até quando — sem abrir nenhuma das 4 plataformas de
  origem.
- **SC-002**: Reprocessar o histórico completo de transações de um contrato produz exatamente
  o mesmo estado final, em qualquer ordem de reprocessamento das etapas anteriores — 0
  divergência entre 2 execuções.
- **SC-003**: Nenhum cliente acaba com 2 contratos para o mesmo produto, mesmo sob ingestão
  concorrente de eventos duplicados/webhooks reentregues.
- **SC-004**: Todo ajuste manual feito por um humano fica auditado permanentemente, mesmo
  depois de superado por um aditivo automático — 100% de rastreabilidade de "quem mudou o quê
  e por quê".

## Assumptions

- `oferta_catalogo.tempo_acesso_dias` (spec 023) é a única fonte do "tempo de acesso" da
  fórmula — não há campo equivalente em `transacao`. Enquanto não curado, o aditivo entra em
  revisão em vez de assumir um valor default.
- `PROJETAR_CONTRATO` roda, na prática, depois de `RESOLVER_OFERTA` dentro da mesma passada do
  worker (ambas dependem só de `UPSERT_TRANSACAO`, e o worker resolve etapas elegíveis em
  ordem crescente) — mas o executor é escrito para tolerar a ordem inversa sem nunca "chutar"
  dados ausentes.
- O rótulo `COMPRA_INICIAL` (CL-03) é uma extensão pragmática, não contradiz a regra de negócio
  confirmada (que só nomeia 2 casos); pode ser renomeado sem custo de migração se o dono do
  produto preferir outro nome.
- Filtro por "turma" em `GET /contratos` busca entre os aditivos do contrato qualquer
  `oferta.turma_numero` (curado ou derivado) igual ao informado — um contrato aparece se
  **qualquer** aditivo seu bater, não só o mais recente.
- Volume esperado (milhares de contratos, não milhões) permite computar `status_canonico`
  via `CASE` SQL simples na listagem paginada, sem precisar de tabela de rollup.
