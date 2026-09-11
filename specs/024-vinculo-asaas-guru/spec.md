# Feature Specification: Vínculo Asaas↔Guru (pipeline etapa 4)

**Feature Branch**: `024-vinculo-asaas-guru`

**Created**: 2026-09-11

**Status**: Draft

**Input**: ROADMAP.md Fase 2 (Financeiro), item 024 — "`vinculo_transacao (id_guru, id_asaas,
resolvido_em, origem_ref)`. Pipeline etapa 4 (nos 2 sentidos de chegada). Regra de receita ('só
a Guru soma') como **função de leitura** sobre o vínculo, nunca efeito colateral de escrita. Job
`vinculo_pendente` (casa dados já no banco, sem API). `POST /transacoes/{id}/tentar-vincular`,
`POST /transacoes/tentar-vincular-pendentes`. Frontend: ação de retry no detalhe da transação."

---

## Contexto

Quinta fatia da **Fase 2 — Financeiro** (visão Partes 1–6). Materializa a regra de negócio
"Guru terceiriza cobrança para a Asaas": uma venda pode existir como **2 eventos** —
transação Guru (venda de registro) + pagamento Asaas (cobrança) — e **só a Guru soma
receita**; a Asaas vinculada não resolve Oferta/Contrato próprios (isso já é resolvido pela
019–023 tratando a transação Asaas como uma venda comum até este vínculo ser cravado).

A spec 006 reservou a etapa `RESOLVER_VINCULO` (ordem 4, `especDona: 24`, no-op `pulada`,
dependendo só de `UPSERT_TRANSACAO`) em `ingestao/domain/etapas.ts`. A spec 018 reservou a
coluna `transacao.transacao_vinculada_id` (nullable, sem `@relation`) especificamente para
esta spec ligar. A spec 020 (adapter Asaas) já transporta `EventoCanonico.referenciaExterna.
idOrigem` = `payment.externalReference` (**sem** `plataforma`, decisão A-02) quando a Asaas
carrega uma referência cruzada; a spec 021 (adapter Guru) **nunca** emite `referenciaExterna`
(decisão G-02) — nem toda venda Guru terceiriza, então a Guru não pode presumir a ponte. O
`classificar.ts` (spec 006) já tem a regra 2 documentada: uma referência externa **com**
`plataforma` explícita cai em `DESCONHECIDO`+`revisar`; como o adapter Asaas nunca preenche
`plataforma`, essa regra não dispara para o caso real — a transação Asaas segue classificada
normalmente (`VENDA_PROPRIA`/`RECORRENCIA`) até que **esta spec** resolva o vínculo de fato e
reclassifique.

Esta spec **pluga a etapa 4** seguindo o mesmo padrão de inversão de dependência das specs
018/023 (`ExecutorEtapaExterno` do `core` + `src/pipeline-wiring.module.ts`, sem tocar
`WorkerService`/`etapas.ts`/`classificar.ts`). Mora no _bounded context_ **`financeiro`** (já
dono de `transacao` desde a 018).

## Clarifications

*024 não está marcada `⚠ clarify` no ROADMAP, mas 3 decisões de fato ambíguas — escopo de
pareamento de conta, mecanismo de retry nos "2 sentidos de chegada", e onde a regra de receita
lê o vínculo — foram levadas ao dono do produto em 2026-09-11 antes do `plan`.*

- **CL-01 — Escopo do pareamento de conta.** O casamento Asaas→Guru é restrito à conta
  pareada: `ASAAS_PRD` só casa com transações `GURU_PRD`; `ASAAS_SVC` só com `GURU_SVC`.
  Nunca cruza PRD↔SVC — reflete a fronteira de conta já usada em todo o projeto (cada dupla
  PRD/SVC é um contexto de negócio separado). Uma referência externa Asaas que só existe do
  lado Guru da conta oposta permanece **pendente** (nunca vinculada por engano).

- **CL-02 — Mecanismo de resolução nos "2 sentidos de chegada", sem worker novo.** A etapa 4
  resolve **de forma síncrona e bidirecional**, dentro da mesma execução do
  `WorkerService`/`WorkerScheduler` de ingestão já existente (spec 006) — **0 processo novo, 0
  variável `.env` de worker nova**:
  - Quando a transação **Asaas** (com `referenciaExterna.idOrigem`) passa pela etapa 4, procura
    a transação **Guru** correspondente já persistida (pela chave natural
    `(plataforma_origem, id_origem)`) na conta pareada (CL-01). Achou → vincula agora.
  - Quando a transação **Guru** passa pela etapa 4, procura entre as transações **Asaas**
    pendentes da conta pareada (`referencia_externa_id_origem = <id_origem da Guru>` e ainda
    sem vínculo) e vincula as que encontrar — cobre o caso em que a Asaas chegou primeiro.
  - Os 2 endpoints do ROADMAP (`POST /transacoes/{id}/tentar-vincular` e
    `POST /transacoes/tentar-vincular-pendentes`) reusam a **mesma** lógica de domínio como
    retry manual — para depois de reprocessamento manual de dados históricos, migração
    (spec 031) ou qualquer caso em que a resolução automática não tenha rodado.

- **CL-03 — Onde a regra de receita lê o vínculo.** Ao vincular, a etapa 4 reclassifica a
  transação Asaas vinculada para `classificacao = COBRANCA_TERCEIRIZADA` (valor já reservado no
  enum congelado desde a spec 006, com o comentário "cravar o vínculo Asaas↔Guru de fato é da
  spec 024" em `classificar.ts`) — esse **é** o efeito primário da etapa, não um efeito
  colateral proibido pelo Princípio V (não recalcula Contrato/Oferta/nenhum outro agregado). A
  regra "só a Guru soma receita" vira uma função de leitura pura sobre `classificacao`: o filtro
  `pagoDeFato`/qualquer soma de receita passa a excluir `COBRANCA_TERCEIRIZADA` além dos status
  que já não contam hoje — nenhuma coluna nova de "conta como receita".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guru já no banco, Asaas chega depois (Priority: P1)

Uma venda Guru (venda de registro) já foi ingerida. Minutos depois, a cobrança Asaas
correspondente chega (webhook ou sincronização), carregando a referência externa que aponta
para o `id_origem` daquela transação Guru.

**Why this priority**: é o caso mais comum na operação real (a Guru gera a venda no checkout
e a Asaas processa o pagamento na sequência) e é o que evita a contagem dupla de receita —
Regra Inviolável nº 1/nº 2 do projeto.

**Independent Test**: ingerir um evento Guru, depois um evento Asaas com
`externalReference` = `id_origem` da Guru; verificar que a transação Asaas fica com
`transacaoVinculadaId` apontando para a Guru, `classificacao = COBRANCA_TERCEIRIZADA`, e que
o filtro de receita (`pagoDeFato=true`) passa a excluir essa transação Asaas.

**Acceptance Scenarios**:

1. **Given** uma transação Guru `GURU_PRD`/`id_origem=T1` já persistida, **When** chega um
   evento Asaas `ASAAS_PRD` cujo `EventoCanonico.referenciaExterna.idOrigem = "T1"`, **Then**
   a transação Asaas é criada com `transacaoVinculadaId` = id da transação Guru,
   `classificacao = COBRANCA_TERCEIRIZADA`, e um registro `vinculo_transacao` é criado
   ligando as duas.
2. **Given** o vínculo já resolvido do cenário anterior, **When** o pipeline reprocessa o
   mesmo evento Asaas (idempotência), **Then** nenhum registro `vinculo_transacao` duplicado é
   criado e o estado da transação permanece o mesmo.

---

### User Story 2 - Asaas chega antes do Guru (Priority: P1)

A cobrança Asaas chega primeiro (ex.: a Guru está atrasada numa janela de sincronização); a
transação Asaas fica temporariamente **pendente de vínculo**. Quando a venda Guru
correspondente chega, o vínculo é resolvido automaticamente nesse momento — sem exigir
intervenção manual nem um segundo processo de fundo.

**Why this priority**: sem esse sentido de chegada, toda venda terceirizada cuja Asaas chega
primeiro ficaria permanentemente contada como receita própria indevida até alguém notar e
reprocessar manualmente.

**Independent Test**: ingerir um evento Asaas com `externalReference` apontando para um
`id_origem` que **ainda não existe** como transação Guru; verificar que a transação Asaas fica
pendente (sem `transacaoVinculadaId`, classificação original mantida); depois ingerir a
transação Guru correspondente e verificar que o vínculo é resolvido nessa mesma passada do
worker, sem chamar nenhum endpoint manual.

**Acceptance Scenarios**:

1. **Given** nenhuma transação `GURU_PRD`/`id_origem=T2` ainda existe, **When** chega um
   evento Asaas `ASAAS_PRD` com `referenciaExterna.idOrigem = "T2"`, **Then** a transação
   Asaas é criada sem vínculo, mantendo a classificação original (`VENDA_PROPRIA` ou
   `RECORRENCIA`), e aparece na consulta de "pendentes de vínculo".
2. **Given** o estado anterior, **When** chega o evento Guru `GURU_PRD`/`id_origem=T2`,
   **Then** a etapa 4 desse evento Guru encontra a Asaas pendente da mesma conta pareada e
   resolve o vínculo (mesmo efeito do US1), sem exigir `POST /transacoes/.../tentar-vincular`.

---

### User Story 3 - Retry manual de vínculos pendentes (Priority: P2)

Um operador quer forçar uma nova tentativa de casamento — por exemplo depois de reprocessar
dados históricos fora de ordem, ou de uma migração (spec 031) onde a ordem de chegada não é
garantida.

**Why this priority**: rede de segurança sobre o US2 — cobre os casos em que a resolução
automática não teve chance de rodar (dado já existia antes desta spec, ou foi importado fora
do pipeline normal).

**Independent Test**: com uma transação Asaas pendente e a Guru correspondente já no banco (mas
sem terem passado juntas pela etapa 4 — ex.: dado semeado direto no banco de teste), chamar
`POST /transacoes/{idAsaas}/tentar-vincular` e verificar que o vínculo é resolvido; chamar
`POST /transacoes/tentar-vincular-pendentes` com mais de uma pendente e verificar que todas
que têm par são resolvidas de uma vez.

**Acceptance Scenarios**:

1. **Given** uma transação Asaas pendente cuja Guru pareada já existe, **When**
   `POST /transacoes/{idAsaas}/tentar-vincular`, **Then** `200` com o vínculo resolvido.
2. **Given** uma transação Asaas pendente cuja Guru pareada **não** existe, **When**
   `POST /transacoes/{idAsaas}/tentar-vincular`, **Then** `200` indicando que segue pendente
   (não é erro — ainda não há par).
3. **Given** N transações Asaas pendentes, M delas com Guru pareada já no banco, **When**
   `POST /transacoes/tentar-vincular-pendentes`, **Then** `200` com `{ tentativas: N,
   resolvidos: M }`.
4. **Given** uma transação já vinculada, **When** `POST /transacoes/{id}/tentar-vincular`,
   **Then** `200` no-op (idempotente — não desfaz nem recria o vínculo existente, Princípio
   VII: vínculo aplicado nunca é auto-revertido).
5. **Given** uma transação de plataforma que não é Asaas nem Guru (TMB/Hotmart), **When**
   `POST /transacoes/{id}/tentar-vincular`, **Then** `422` (não aplicável a essa plataforma).

---

### Edge Cases

- Transação Asaas sem `referenciaExterna` (cobrança avulsa, não terceirizada) → nunca entra no
  fluxo de vínculo; segue resolvendo Oferta/Contrato próprios normalmente (regra de negócio já
  confirmada na Parte 7 da visão).
- Duas transações Asaas diferentes com a mesma `referenciaExterna.idOrigem` (ex.: reembolso
  gera um 2º evento com o mesmo `externalReference`) — a chave natural `(plataforma_origem,
  id_origem)` da spec 018 já garante 1 linha de `transacao` por pagamento Asaas; se por engano
  duas linhas distintas apontarem para a mesma Guru, a 2ª tentativa de vínculo encontra a Guru
  já vinculada à 1ª e **não** duplica — fica pendente + revisão (não é um palpite: indica dado
  inconsistente na origem).
- Transação Guru cuja Asaas pareada nunca chega (ex.: venda paga por outro meio, não Asaas) —
  fica para sempre como `VENDA_PROPRIA`/`RECORRENCIA` normal, sem vínculo; não há
  `referenciaExterna` para casar, então nunca aparece como "pendente".
- Reprocessamento do mesmo evento Guru ou Asaas (via `/reprocessar` da spec 006) não duplica o
  vínculo nem o registro `vinculo_transacao` (idempotência garantida por `@@unique`).
- `POST /transacoes/tentar-vincular-pendentes` chamado sem nenhuma pendente no banco → `200`
  com `{ tentativas: 0, resolvidos: 0 }` (nunca erro).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE, ao processar a etapa `RESOLVER_VINCULO` de uma transação Asaas
  com `EventoCanonico.referenciaExterna.idOrigem` presente, procurar uma transação Guru já
  persistida com `id_origem` igual, restrita à conta Guru pareada (CL-01).
- **FR-002**: O sistema DEVE, ao processar a etapa `RESOLVER_VINCULO` de uma transação Guru,
  procurar transações Asaas pendentes (com referência externa igual ao `id_origem` dessa Guru,
  ainda sem vínculo) na conta Asaas pareada e resolver o vínculo para as que encontrar.
- **FR-003**: Quando um vínculo é resolvido, o sistema DEVE gravar `transacao_vinculada_id` na
  transação Asaas apontando para a transação Guru, reclassificar a transação Asaas para
  `COBRANCA_TERCEIRIZADA`, e criar 1 registro `vinculo_transacao` (imutável) ligando as duas.
- **FR-004**: O sistema NUNCA deve desfazer um vínculo já resolvido automaticamente (Princípio
  VII) — reprocessar o mesmo par não duplica nem altera o vínculo existente.
- **FR-005**: O sistema DEVE persistir a referência externa crua da transação Asaas
  (`referencia_externa_id_origem`) mesmo quando o vínculo ainda não pôde ser resolvido, para
  permitir retry posterior sem depender do evento original.
- **FR-006**: O sistema DEVE expor `POST /financeiro/transacoes/{id}/tentar-vincular`
  (idempotente — no-op se já vinculada; `422` se a plataforma da transação não participa do
  vínculo Asaas↔Guru) para retry manual de uma transação específica.
- **FR-007**: O sistema DEVE expor `POST /financeiro/transacoes/tentar-vincular-pendentes` que
  varre todas as transações Asaas pendentes e tenta resolver cada uma contra o estado atual do
  banco, devolvendo quantas foram tentadas e quantas resolvidas.
- **FR-008**: A leitura de receita (filtro `pagoDeFato` já existente desde a spec 018) DEVE
  excluir transações `classificacao = COBRANCA_TERCEIRIZADA`, além dos status que já não
  contam como receita — como função pura de leitura, sem reescrever nenhum outro dado.
- **FR-009**: O sistema DEVE permitir consultar transações Asaas "pendentes de vínculo"
  (referência externa presente, ainda sem `transacao_vinculada_id`) via filtro na listagem já
  existente de transações.
- **FR-010**: O detalhe de uma transação (`GET /financeiro/transacoes/{id}`) DEVE expor o
  vínculo resolvido (id da transação vinculada + quando foi resolvido) quando existir.
- **FR-011**: O sistema DEVE restringir toda escrita desta spec (retry manual) à(s) permissão
  (ões) RBAC nova(s) — leitura reaproveita `transacao:ver` já existente.

### Key Entities *(include if feature involves data)*

- **`vinculo_transacao`**: liga uma transação Guru a uma transação Asaas terceirizada
  (`transacaoGuruId`, `transacaoAsaasId`, `origemRef` — o valor cru que casou — e
  `resolvidoEm`). 1 linha por par resolvido; nunca atualizado/apagado (append-only, Princípio
  VII — reversão fica para a spec 027).
- **`transacao` (spec 018, estendida)**: ganha 2 campos novos —
  `referencia_externa_id_origem` (cru, só transações Asaas com referência externa) e passa a
  ter `transacao_vinculada_id` (já reservado) de fato preenchido e ligado por FK.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma venda Guru+Asaas da mesma operação nunca é somada duas vezes num relatório de
  receita, independentemente da ordem de chegada dos 2 eventos.
- **SC-002**: O vínculo é resolvido automaticamente (sem ação manual) em até 1 passada do
  worker de ingestão depois que os 2 eventos (Guru e Asaas) estão no banco, em qualquer ordem
  de chegada.
- **SC-003**: Um operador consegue forçar a resolução de vínculos pendentes sob demanda e ver
  quantos foram resolvidos, sem precisar consultar o banco diretamente.
- **SC-004**: Nenhum vínculo resolvido é revertido por um reprocessamento ou uma nova tentativa
  de retry sobre a mesma transação.

## Assumptions

- A chave de casamento é sempre `(conta Guru pareada, id_origem)` — nunca um match "fuzzy" por
  valor/data (Princípio I: modelar o domínio, não adivinhar).
- O `vinculo_transacao` é 1:1 — uma transação Guru vincula no máximo 1 Asaas e vice-versa
  (reflete a regra de negócio "uma venda pode existir como 2 eventos", não mais que isso).
- Não há necessidade de um endpoint de listagem dedicado para `vinculo_transacao` nesta spec —
  o vínculo é exposto no detalhe da transação (Princípio VIII: superfície mínima); a spec 027
  (reconciliação e alertas) pode agregar uma visão própria depois.
- Reversão de vínculo aplicado por engano é escopo da spec 027 (alertas de reconciliação) — 024
  só resolve e nunca desfaz.
