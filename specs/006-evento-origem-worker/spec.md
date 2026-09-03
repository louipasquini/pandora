# Feature Specification: evento_origem e worker de ingestão — event log canônico e pipeline em etapas

**Feature Branch**: `006-evento-origem-worker`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "006-evento-origem-worker — Event log de ingestão canônico. Tabela `evento_origem` imutável (`plataforma_origem`, `id_origem`, `tipo_origem`, `payload_bruto jsonb`, `hash`, `recebido_em`, `status ∈ {pendente,ok,erro,revisar}`, `erro_detalhe`), dedup `(plataforma_origem, id_origem, hash)`. Contrato `EventoCanonico` (dataclass/DTO) que os adapters de borda (019–022) vão produzir. Worker idempotente que lê eventos `pendente` e chama o pipeline de ingestão em etapas independentes, cada etapa com commit próprio e reprocessável a qualquer hora (Princípio IV). Nesta spec o worker só registra e classifica (etapas 0–1); as etapas 2–6 ficam como no-op/stub plugável. Endpoint de ingestão para os adapters entregarem `EventoCanonico`; sem rotas `/webhooks/*` públicas ainda. Painel de eventos em `revisar`/`erro` no frontend. É o backbone que CRM (Workflow, 014) e Marketing (035) consomem. Convenções: PK UUID v7 via `EntidadeId.novo()`, `@db.Timestamptz`, ids de origem nunca como PK, RBAC 004 (`evento:*`), forma canônica de auditoria do core, `CONTEXT_MODULES` segue 11 (é o contexto `ingestao` que deixa de ser vazio)."

## Clarifications

### Session 2026-09-03

- Q: **CL-01** — Como o worker roda (ele lê `evento_origem` pendentes e executa o pipeline
  em etapas)? → A: **Laço in-process + gatilho manual.** Um laço agendado dentro do backend
  NestJS, com intervalo configurável por `.env` e **desligado em ambiente de teste**,
  processa o _backlog_; o endpoint `POST /ingestao/eventos/processar` (sob
  `evento:reprocessar`) força uma passada síncrona — é o que os testes e2e usam, sem
  depender de _timing_. A ingestão também pode enfileirar uma passada imediata. Sem infra
  nova, sem porta nova. Escala horizontal não é objetivo da v1.
- Q: **CL-02** — Como os adapters (specs 019–022) e a reingestão da migração (031) entregam
  um evento ao contexto `ingestao`? → A: **Porta in-process + endpoint HTTP.** A porta
  injetável `registrarEvento(...)` é o ponto único de escrita da etapa 0; os webhooks das
  019–022 a chamam direto (no mesmo processo). Além disso, `POST /ingestao/eventos` (sob
  `evento:ingerir`, **não** público) expõe a mesma porta por HTTP para a reingestão da
  spec 031 e integrações desacopladas. Uma regra, dois invólucros.
- Q: **CL-03** — Quão longe a etapa 1 (classificar o `tipo` do evento) vai nesta spec? → A:
  **Implementar a taxonomia canônica agora.** O enum `classificacao` completo
  (`VENDA_PROPRIA` | `VENDA_AFILIADA` | `COBRANCA_TERCEIRIZADA` | `REEMBOLSO` | `RECORRENCIA`
  | `OUTRO` | `DESCONHECIDO`) e a **função de decisão** entram nesta spec, aplicando **todas
  as regras deriváveis de `EventoCanonico` + `tipo_origem` sem adapter** — reembolso por
  status/`tipo_origem` de estorno; recorrência por sinal de assinatura; afiliada por sinal
  explícito no `EventoCanonico` (`ehAfiliada`); cobrança terceirizada quando o evento traz
  referência externa a uma transação de outra plataforma. Regra que dependa de contexto
  cross-transação (casar Asaas↔Guru de verdade) **não** é decidida aqui: fica
  `DESCONHECIDO` + `revisar`, e a spec 024/026 refina. **Nunca** um palpite.
- Q: **CL-04** — Quando uma etapa falha, o que acontece com as etapas seguintes do mesmo
  evento? → A: **Dependência declarada → `bloqueada`.** Cada etapa declara suas
  **dependências** (ex.: `RESOLVER_VINCULO`, `RESOLVER_OFERTA` e `PROJETAR_CONTRATO`
  dependem de `UPSERT_TRANSACAO`). Se uma dependência não terminou `ok`, a etapa dependente
  é registrada como **`bloqueada`** — **não executa** — e o evento fica `erro`/`revisar`. As
  etapas já `ok` e todos os outros eventos permanecem intactos; reprocessar retoma a partir
  da etapa que falhou (visão 5.3 — "marca evento com erro"; "etapas 4–6 pendentes
  retentáveis sem tocar 0–3"). Etapas independentes entre si (4 vs 5 vs 6) não se bloqueiam.
- Q: **CL-05** — Uma etapa em `erro` é re-tentada pelo worker ou fica parada até reprocesso
  manual? → A: **Re-tenta até um limite `N`.** O worker re-executa uma `evento_etapa` em
  `erro` a cada passada enquanto `tentativas < N` (`N` configurável por `.env`, _default_
  sugerido 3). Esgotado o limite, a etapa fica `erro` **terminal** até um reprocesso manual
  (`POST /ingestao/eventos/{id}/reprocessar`, que zera a contagem). Recupera de falha
  transitória (DB indisponível) sem intervenção; erro determinístico esgota `N` e cai no
  painel de `erro`. _Backoff_ sofisticado / _dead-letter_ seguem fora de escopo (spec 029).

## Visão geral

Primeira spec do _bounded context_ **`ingestao`** — que deixa de ser um módulo vazio. Entrega
o **backbone** que quase todo o resto do sistema consome: o **event log imutável
`evento_origem`**, o **contrato `EventoCanonico`** que os adapters de borda (specs 019–022)
vão produzir, e o **worker idempotente** que lê eventos pendentes e roda o **pipeline de
ingestão canônico em etapas independentes** (visão Parte 5.3; Princípio IV — evento cru
imutável é a fonte de verdade, projeções são reconstruíveis).

Substitui, na arquitetura-alvo, o `ingerir_transacao` monolítico da v1 (uma transação de
banco cobrindo todas as etapas, que forçou `_houve_mudanca` no objeto ORM e um `commit()`
no meio como remendo — Parte 4 da visão).

O que entra:

- **Entidade `evento_origem`**: um fato cru por linha, **imutável** — `plataforma_origem`
  (enum de 7 contas), `id_origem` (id do fato na origem), `tipo_origem` (que tipo de payload
  é — `webhook_venda`, `api_pedido`, `csv`, `migracao_v1`, …), `payload_bruto` (JSON cru
  como veio), `hash` (impressão digital determinística do payload), `recebido_em`, `status`
  (`pendente` | `ok` | `erro` | `revisar`), `erro_detalhe`, `classificacao` preliminar
  (preenchida na etapa 1). **Dedup** pela chave `(plataforma_origem, id_origem, hash)`.
- **Contrato `EventoCanonico`**: a forma canônica **validada** que um adapter de borda
  produz a partir do `payload_bruto` — identidade da transação de origem, dados do
  comprador (para a etapa 2 futura), identificadores crus de oferta/produto, valores
  monetários como `Dinheiro` (spec 002), status de origem cru, _timestamps_ tolerantes
  (`parseInstante`, spec 002), sinais de recorrência/assinatura e uma `classificacao`
  preliminar opcional. Nesta spec o contrato é **definido e validado**; os adapters que o
  produzem de verdade são as specs 019–022.
- **Porta de ingestão** (etapa 0 do pipeline): o **ponto único de escrita** que registra um
  evento cru — calcula o `hash`, aplica a dedup, persiste imutável, devolve o id do evento.
  Idempotente. É o análogo, para `ingestao`, do `resolverOuCriar` da spec 005.
- **Worker + framework de etapas**: lê `evento_origem` pendentes e roda uma sequência
  **ordenada, nomeada e independente** de etapas — `REGISTRAR` (0), `CLASSIFICAR` (1),
  `RESOLVER_PESSOA` (2), `UPSERT_TRANSACAO` (3), `RESOLVER_VINCULO` (4), `RESOLVER_OFERTA`
  (5), `PROJETAR_CONTRATO` (6). Cada etapa: **commit próprio**, **resultado explícito**,
  **idempotente**, **reprocessável a qualquer hora**. Falha numa etapa **não** faz _rollback_
  das anteriores nem bloqueia os outros eventos.
- **Nesta spec só as etapas 0 e 1 executam de verdade.** As etapas 2–6 entram como
  **implementações _no-op_ plugáveis** que devolvem `pulada` com um marcador ("implementada
  na spec NNN"). As specs 018/023/024/025 substituem cada _no-op_ pela lógica real **sem
  tocar o worker nem o contrato do registro de etapas**.
- **Etapa 1 — classificação**: deriva a `classificacao` preliminar do evento. Valor
  ausente ou não reconhecido → `classificacao = DESCONHECIDO` + `status = revisar` (nunca um
  palpite, nunca bloqueia — regra inviolável #15).
- **Registro por etapa** (`evento_etapa`): para cada `(evento, etapa)`, o estado
  (`pendente` | `processando` | `ok` | `erro` | `pulada`), o `resultado`, o `erro_detalhe`,
  o instante e a contagem de tentativas. É o que torna a etapa 4 retentável "sem tocar as
  0–3".
- **Reprocessamento**: `POST /ingestao/eventos/{id}/reprocessar` (sob `evento:reprocessar`)
  — devolve as etapas não-`ok` do evento para `pendente`; o worker as retenta. Ação manual
  auditada na forma canônica do `core`.
- **Vocabulário de permissão** no catálogo RBAC da 004: `evento:ver`, `evento:reprocessar`,
  `evento:ingerir`.
- **Endpoints de leitura**: `GET /ingestao/eventos` (lista paginada; filtro por conta /
  status / tipo / data; _default_ = `revisar` + `erro`), `GET /ingestao/eventos/{id}`
  (metadados + `payload_bruto` + linha do tempo de etapas).
- **Sem rotas `/webhooks/*` públicas** — essas nascem nos adapters (specs 019–022).
- **Frontend**: item de navegação **Eventos** (atrás de `evento:ver`) — lista com filtros e
  paginação, detalhe com `payload_bruto` legível, linha do tempo das etapas e ação
  **Reprocessar** (atrás de `evento:reprocessar`).

O `ingestao` passa a ser o **dono** de `evento_origem` (Princípio VI). O Financeiro, o CRM e
o Marketing **observam** o log e **leem** — nunca escrevem nessas tabelas.

O sucesso é medido por: o mesmo fato ingerido duas vezes vira **uma** linha; uma etapa que
falha **nunca** bloqueia as anteriores nem os outros eventos; rodar o worker de novo sobre o
mesmo _backlog_ é **inócuo** (idempotência); **nenhum** evento some em silêncio — todo evento
termina em `ok`, `erro` ou `revisar`; classificação desconhecida vira `revisar`, nunca um
palpite; e nenhum id de origem aparece como PK.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um adapter registra um evento cru, com dedup e imutabilidade (Priority: P1)

Um chamador (hoje um teste ou a reingestão da migração; amanhã um adapter de webhook da spec
019) entrega um fato de origem: `plataforma_origem`, `id_origem`, `tipo_origem` e o
`payload_bruto` cru. A porta de ingestão calcula o `hash`, verifica a chave
`(plataforma_origem, id_origem, hash)` e, se for novo, grava uma linha **imutável** em
`evento_origem` com `status = pendente`. Se o **mesmo** payload chega de novo (reentrega da
origem), **nenhuma** linha nova é criada — a porta devolve o id do evento que já existe e
registra a reentrega.

**Why this priority**: é a etapa 0 do pipeline e o alicerce de tudo. Sem o event log
imutável e sem a dedup, não há fonte de verdade reconstruível (Princípio IV) e a regra
inviolável #1 (sem duplicidade) não tem onde se apoiar.

**Independent Test**: chamar a porta com um payload novo → 1 linha `pendente`; chamar com o
**mesmo** payload → 0 linha nova, mesmo id devolvido; chamar com o mesmo `id_origem` mas
`payload_bruto` **alterado** → 1 linha nova (hash diferente); tentar alterar
`payload_bruto`/`hash`/`recebido_em` de uma linha existente → não há caminho que o permita.

**Acceptance Scenarios**:

1. **Given** nenhum evento com a chave `(Guru PRD, "txn_123", h)`, **When** a porta recebe
   esse fato, **Then** é criada 1 linha `evento_origem` com `status = pendente`,
   `recebido_em` preenchido e o `payload_bruto` idêntico ao recebido.
2. **Given** um evento já gravado com essa chave, **When** o **mesmo** payload chega de
   novo, **Then** nenhuma linha nova é criada, a porta devolve `{ eventoId, criado: false }`
   e a reentrega é contabilizada (contador / `ultimo_recebido_em`), sem alterar o
   `payload_bruto` original.
3. **Given** um evento com `id_origem = "txn_123"` e `payload_bruto` A, **When** chega
   `id_origem = "txn_123"` com `payload_bruto` B (hash diferente), **Then** é criada uma
   **segunda** linha — ambas preservadas; a reconciliação entre as duas é da etapa de
   _upsert_ (spec 018), não da ingestão.
4. **Given** qualquer evento gravado, **When** se tenta alterar `payload_bruto`, `hash`,
   `plataforma_origem`, `id_origem` ou `recebido_em`, **Then** não existe endpoint nem
   caminho de serviço que faça isso — a linha é _append-only_ nesses campos.
5. **Given** um `payload_bruto` que não é JSON serializável, **When** a porta o recebe,
   **Then** ela **rejeita** ao chamador com erro explícito e **nada** é persistido (o
   tratamento de payload inválido de webhook real é da spec 019).
6. **Given** uma `plataforma_origem` fora do enum de 7 contas, **When** a porta a recebe,
   **Then** rejeita ao chamador — `plataforma_origem` é dimensão de primeira classe
   validada (Padrão Transversal).

---

### User Story 2 - O worker processa pendentes em etapas independentes, idempotente e reprocessável (Priority: P1)

O worker varre `evento_origem` com `status = pendente` (e eventos com etapas pendentes) e
roda cada um pela sequência de etapas. Cada etapa tem **commit próprio** e grava seu
resultado em `evento_etapa`. Se a etapa 3 falha, as etapas 0–2 continuam `ok`, o evento não
some, e o worker segue para o próximo evento. Rodar o worker de novo sobre o mesmo _backlog_
**não** repete efeitos: uma etapa já `ok` não é reexecutada.

**Why this priority**: P1 junto da US1 — é a metade "projeção" do Princípio IV. É o que
substitui o pipeline monolítico da v1 e o que as specs 018+ vão estender.

**Independent Test**: enfileirar 3 eventos; injetar uma falha determinística na etapa 3 de
1 deles; rodar o worker; conferir que os 2 sadios chegam a `ok`, o terceiro fica `erro` só
na etapa 3 (0–2 `ok`), e os outros eventos não foram afetados; rodar o worker 2× mais e
conferir estado idêntico e zero efeito duplicado.

**Acceptance Scenarios**:

1. **Given** um evento `pendente`, **When** o worker o processa, **Then** cada etapa
   aplicável registra uma linha `evento_etapa` com `status`, `resultado`, `executado_em` e
   `tentativas`, e o evento termina em `ok`, `erro` ou `revisar` — nunca fica preso em
   `pendente` sem motivo.
2. **Given** uma etapa que lança erro inesperado, **When** o worker a executa, **Then** essa
   `evento_etapa` fica `erro` com `erro_detalhe`, o evento fica `erro`, as etapas anteriores
   permanecem `ok`, e **não** há _rollback_ delas nem bloqueio dos demais eventos.
3. **Given** um _backlog_ de eventos e o worker executado 3 vezes seguidas, **When** a 2ª e
   a 3ª passadas rodam, **Then** nenhuma etapa já `ok` é reexecutada e o estado final é
   **idêntico** ao da 1ª passada (idempotência — Princípios IV/V).
4. **Given** dois workers rodando ao mesmo tempo (ou um intervalo que dispara antes de a
   passada anterior terminar), **When** ambos varrem a fila, **Then** cada evento/etapa é
   processado **no máximo uma vez** por passada — sem efeito colateral em duplicidade.
5. **Given** o worker interrompido no meio de uma etapa, **When** ele volta, **Then** a
   etapa não concluída é retentada do começo (idempotente) — nada de estado meio-aplicado
   sem registro.
6. **Given** as etapas 2–6 ainda _no-op_ nesta spec, **When** o worker chega nelas, **Then**
   cada uma registra `evento_etapa` `pulada` com um marcador da spec que a implementará, e o
   evento pode alcançar `ok` só com as etapas 0–1 concluídas.
7. **Given** uma etapa _fake_ (em teste) que depende de outra que ficou `erro`, **When** o
   worker chega nela, **Then** ela é marcada `bloqueada` — **não executa** — e passa a
   `pendente` sozinha na passada em que a dependência ficar `ok`.
8. **Given** uma etapa _fake_ que falha nas 2 primeiras execuções e passa na 3ª, com
   `INGESTAO_WORKER_MAX_TENTATIVAS = 3`, **When** o worker faz 3 passadas, **Then**
   `tentativas` vai 1 → 2 → 3 e a etapa termina `ok`; **Given** outra que falha sempre,
   **When** passa de 3 tentativas, **Then** fica `erro` **terminal** e o worker não a tenta
   mais até um reprocesso manual.

---

### User Story 3 - Etapa 1 classifica o evento; desconhecido vira `revisar` sem bloquear (Priority: P2)

A etapa 1 deriva uma `classificacao` preliminar do evento (venda própria, afiliada, cobrança
terceirizada, reembolso, recorrência, …). Se a classificação não puder ser determinada com
confiança — dado ausente, valor fora do enum canônico — o evento recebe
`classificacao = DESCONHECIDO` e `status = revisar`, com `erro_detalhe` explicando. Isso
**não** bloqueia os outros eventos nem as etapas seguintes (que nesta spec são _no-op_ de
qualquer forma).

**Why this priority**: P2 — o backbone (US1/US2) já entrega o valor estrutural. A
classificação honesta ("na dúvida, `revisar`") materializa a regra inviolável #15 e o
Princípio II para o contexto `ingestao`.

**Independent Test**: rodar a etapa 1 com um `EventoCanonico` que traz `classificacao`
preliminar válida → evento classificado, `status` segue para `ok`; rodar com `classificacao`
ausente → `DESCONHECIDO` + `revisar` + `erro_detalhe`; rodar com um valor fora do enum →
idem; conferir que outros eventos na mesma passada não são afetados.

**Acceptance Scenarios**:

1. **Given** um evento cujo `EventoCanonico` traz `classificacao` preliminar dentro do enum
   canônico, **When** a etapa 1 roda, **Then** `evento_origem.classificacao` recebe esse
   valor, a `evento_etapa` de `CLASSIFICAR` fica `ok`, e o evento segue para as etapas
   seguintes.
2. **Given** um evento sem `classificacao` preliminar e sem `EventoCanonico` derivável,
   **When** a etapa 1 roda, **Then** `classificacao = DESCONHECIDO`, `status = revisar`,
   `erro_detalhe` cita o motivo, e o evento aparece no painel de `revisar`.
3. **Given** um evento com `classificacao` preliminar **fora** do enum canônico, **When** a
   etapa 1 roda, **Then** o valor é descartado, `classificacao = DESCONHECIDO`,
   `status = revisar` — **nunca** um valor inventado.
4. **Given** vários eventos na mesma passada, um deles caindo em `revisar`, **When** o
   worker termina, **Then** os demais chegam a `ok` normalmente — o `revisar` de um não
   contamina os outros.
5. **Given** a decisão de classificação, **When** ela roda para a mesma entrada duas vezes,
   **Then** o resultado é **idêntico** (função pura de `EventoCanonico` + `tipo_origem`,
   testável sem banco).

---

### User Story 4 - Painel de eventos em `revisar` / `erro`, com reprocessar (Priority: P2)

Quem tem `evento:ver` abre **Eventos**: uma lista paginada, filtrável por conta
(`plataforma_origem`), `status`, tipo e intervalo de datas, mostrando por _default_ só os
eventos em `revisar` e `erro` — o motivo de o painel existir. Abre um evento e vê os
metadados, o `payload_bruto` formatado e a **linha do tempo das etapas** (qual rodou, qual
falhou, qual foi pulada, com o resultado e o erro de cada uma). Com `evento:reprocessar`,
aciona **Reprocessar**: as etapas não-`ok` voltam para `pendente` e o worker as retenta.

**Why this priority**: P2 — o backend já entrega o valor. O painel torna o _backlog_ de
`revisar`/`erro` visível e acionável pela equipe de operação sem `curl`, e é a base que a
spec 029 (health "7 contas, 1 registro") consolida.

**Independent Test**: gerar eventos em `ok`, `revisar` e `erro`; abrir **Eventos** e
conferir que o _default_ mostra só `revisar`/`erro`; filtrar por conta e por status; abrir
um evento `erro` e conferir metadados + `payload_bruto` + linha do tempo das etapas; clicar
**Reprocessar** e conferir que as etapas não-`ok` voltaram a `pendente` e um registro de
auditoria foi gravado; logar sem `evento:ver` e confirmar que **Eventos** some da navegação.

**Acceptance Scenarios**:

1. **Given** `evento:ver`, **When** o usuário abre **Eventos**, **Then** vê a lista paginada
   com o filtro _default_ `status ∈ {revisar, erro}` e pode alternar para "todos"; os
   filtros por conta, status, tipo e data combinam.
2. **Given** o detalhe de um evento, **When** exibido, **Then** mostra `plataforma_origem`,
   `id_origem`, `tipo_origem`, `classificacao`, `recebido_em`, `status`, `erro_detalhe`, o
   `payload_bruto` num container com rolagem, e uma linha do tempo com uma entrada por etapa
   (status, resultado, erro, instante, tentativas).
3. **Given** `evento:reprocessar` e um evento em `erro`, **When** o usuário clica
   **Reprocessar**, **Then** as `evento_etapa` não-`ok` voltam a `pendente`, o evento volta
   a `pendente`, um `RegistroAuditoria` (`origem = AJUSTE_MANUAL`) é gravado com quem/quando,
   e o worker reprocessa na passada seguinte.
4. **Given** um usuário **sem** `evento:reprocessar` mas com `evento:ver`, **When** abre o
   detalhe, **Then** vê tudo em modo leitura e a ação **Reprocessar** não aparece.
5. **Given** um usuário **sem** `evento:ver`, **When** logado, **Then** **Eventos** não
   aparece na navegação; **When** navega direto para a rota, **Then** vê "sem permissão"
   (403 tratado no ponto único do `apiFetch`, sem deslogar).
6. **Given** o `payload_bruto` contém dados pessoais do comprador, **When** o detalhe é
   exibido, **Then** ele aparece como veio (é a fonte de verdade para retrabalho) — mas
   **nenhum** _token_/segredo de transporte é exibido (não faz parte do corpo).

---

### User Story 5 - As etapas 2–6 são um encaixe plugável que as specs 018+ preenchem (Priority: P3)

O worker roda um **registro de etapas** ordenado e nomeado. As etapas 2 (`RESOLVER_PESSOA`),
3 (`UPSERT_TRANSACAO`), 4 (`RESOLVER_VINCULO`), 5 (`RESOLVER_OFERTA`) e 6
(`PROJETAR_CONTRATO`) existem como implementações _no-op_ que devolvem `pulada` com o número
da spec que as implementará. Uma spec futura substitui a _no-op_ pela lógica real
registrando a nova implementação — **sem** alterar o worker, a tabela `evento_etapa` nem o
contrato de resultado de etapa.

**Why this priority**: P3 — não entrega valor de usuário agora, mas é a costura que faz o
Princípio IV se sustentar ao longo das specs 018–025 sem reescrever o worker a cada uma.

**Independent Test**: inspecionar o registro de etapas e confirmar as 7 etapas na ordem;
processar um evento e conferir `evento_etapa` `pulada` para 2–6 com o marcador da spec;
registrar uma etapa _fake_ substituta em teste e confirmar que o worker passa a chamá-la sem
outra mudança.

**Acceptance Scenarios**:

1. **Given** o registro de etapas, **When** inspecionado, **Then** contém exatamente
   `REGISTRAR`, `CLASSIFICAR`, `RESOLVER_PESSOA`, `UPSERT_TRANSACAO`, `RESOLVER_VINCULO`,
   `RESOLVER_OFERTA`, `PROJETAR_CONTRATO` nessa ordem, cada uma com um dono declarado (spec).
2. **Given** um evento processado nesta spec, **When** o worker termina, **Then** as etapas
   2–6 têm `evento_etapa` `pulada` com `resultado` citando a spec futura, e nenhuma delas
   toca `pessoa`, `transacao`, `oferta` ou `contrato`.
3. **Given** uma etapa substituta registrada (em teste), **When** o worker roda, **Then**
   ele chama a substituta no lugar da _no-op_, sem alteração no worker nem no schema.
4. **Given** uma etapa 2–6 que, no futuro, falhe, **When** isso ocorrer, **Then** o
   comportamento de "falha isolada, não bloqueia anteriores nem outros eventos" já vale por
   construção (verificável nesta spec com uma etapa _fake_ que falha).

---

### Edge Cases

- **Payload não-JSON / vazio**: a porta rejeita ao chamador; nada persistido. O evento cru
  problemático de um webhook real (que precisa virar `evento_origem` mesmo assim) é tratado
  pelo adapter da spec 019 — aqui a porta exige `payload_bruto` JSON serializável.
- **`id_origem` ausente**: rejeitado — a chave de dedup precisa dele. Plataformas sem id
  estável ganham um `id_origem` sintético no adapter (spec 019+), não aqui.
- **Reentrega idêntica em rajada** (mesma chave, N vezes concorrentes): a unicidade de
  `(plataforma_origem, id_origem, hash)` garante 1 linha; as demais chamadas resolvem para
  ela.
- **`payload_bruto` gigante**: `jsonb` aceita; sem teto explícito de tamanho na v1 (política
  de retenção/tamanho é a spec 055).
- **Worker desligado** (intervalo off, sem gatilho): eventos ficam `pendente` — o painel
  mostra o acúmulo; nada se perde.
- **Falha transitória numa etapa** (ex.: DB momentaneamente indisponível): a etapa fica
  `erro` com `tentativas = 1`; a próxima passada a re-tenta; se a falha passou, vira `ok`.
  **Falha determinística**: cada passada incrementa `tentativas` até
  `INGESTAO_WORKER_MAX_TENTATIVAS`, então a etapa fica `erro` terminal e cai no painel.
- **Etapa `bloqueada`**: `RESOLVER_VINCULO`/`RESOLVER_OFERTA`/`PROJETAR_CONTRATO` de um
  evento cujo `UPSERT_TRANSACAO` ficou `erro` são marcadas `bloqueada`, não executam, e
  passam a `pendente` sozinhas assim que `UPSERT_TRANSACAO` ficar `ok` numa passada futura.
  (Nesta spec 3–6 são _no-op_ `pulada`, então o caso só se materializa a partir da 018.)
- **Reprocessar um evento já todo `ok`**: _no-op_, a menos que `forcar = true` — que
  reprocessa a partir da etapa 1 (a etapa 0 é imutável; o `EventoCanonico` em cache é
  reconstruído do `payload_bruto` quando os adapters existirem).
- **Reprocessar um evento em `processando`**: 409 — espera a passada terminar.
- **Reprocessar id inexistente**: 404.
- **Classificação preliminar presente mas o `tipo_origem` contradiz** (ex.: `csv` de
  reembolso marcado como venda): nesta spec a etapa 1 confia na `classificacao` preliminar
  do `EventoCanonico`; a regra de coerência real é da spec 018 (fica registrada como
  _out of scope_ aqui).
- **Evento sem `EventoCanonico`** (só `payload_bruto`, sem adapter registrado): a etapa 1
  não tem o que classificar → `revisar` com motivo "sem adapter para (plataforma,
  tipo_origem)".
- **`GET /ingestao/eventos` sem nada no banco**: lista vazia paginada, não erro.
- **Migração (spec 031)** reingerindo payloads da v1 com `tipo_origem = 'migracao_v1'`: usa
  a mesma porta; a dedup evita reingestão dupla ao rodar de novo.

## Requirements *(mandatory)*

### Functional Requirements

#### `evento_origem` e deduplicação

- **FR-001**: O sistema MUST modelar **`evento_origem`** com: PK UUID v7 gerada na
  aplicação (Padrão Transversal), `plataforma_origem` (enum de 7 contas), `id_origem`
  (texto não vazio), `tipo_origem` (texto — categoria do payload), `payload_bruto` (JSON
  cru), `hash` (texto), `recebido_em` (`timestamptz` UTC), `status` (`pendente` | `ok` |
  `erro` | `revisar`), `erro_detalhe` (nullable), `classificacao` (nullable, preenchida na
  etapa 1), `criado_em`/`atualizado_em` (`timestamptz` UTC).
- **FR-002**: O `hash` MUST ser uma **função determinística e pura** do `payload_bruto`
  canonicalizado (chaves ordenadas, sem espaço irrelevante), calculada pela porta de
  ingestão — testável sem banco, estável entre execuções e independente de _locale_.
- **FR-003**: A chave `(plataforma_origem, id_origem, hash)` MUST ser **única**. Uma
  reentrega com a **mesma** chave MUST NOT criar linha nova — a porta devolve o id
  existente e contabiliza a reentrega (contador e/ou `ultimo_recebido_em`), sem alterar o
  `payload_bruto` original.
- **FR-004**: Após inserido, `payload_bruto`, `hash`, `plataforma_origem`, `id_origem` e
  `recebido_em` de um `evento_origem` MUST ser **imutáveis** — nenhum endpoint nem serviço
  os altera. Só `status`, `erro_detalhe`, `classificacao` e `atualizado_em` mudam depois.
- **FR-005**: Todo `evento_origem` novo MUST nascer com `status = pendente`. `erro_detalhe`
  MUST ser preenchido apenas quando `status ∈ {erro, revisar}` e MUST NOT conter
  segredo/token.
- **FR-006**: `plataforma_origem` MUST ser validada contra o enum de 7 contas (Padrão
  Transversal) e MUST ter índice; `status` MUST ter índice (o painel filtra por ele).
- **FR-007**: `payload_bruto` MUST ser retido integralmente na v1 — esta spec **não**
  implementa expurgo nem anonimização (política de retenção é a spec 055; PII do comprador é
  tratada por pseudonimização de `pessoa`, spec 047, não aqui).

#### Contrato `EventoCanonico`

- **FR-008**: O sistema MUST definir **`EventoCanonico`** como um **contrato validado**
  (schema), contendo ao menos: `plataforma_origem`, `id_origem`, `tipo_origem`; dados do
  comprador (nome, e-mails, telefones, documentos, endereço) para a etapa 2 futura;
  identificadores **crus** de oferta/produto de origem; valores monetários como `Dinheiro` +
  `Moeda` (spec 002); status de origem **cru** (texto); _timestamps_ parseados por
  `parseInstante` (spec 002); sinais de recorrência/assinatura; e `classificacao` preliminar
  **opcional**.
- **FR-009**: `EventoCanonico` MUST ser validado na borda. Entrada que não satisfaz o
  contrato MUST ser **rejeitada ao chamador** com erros por campo — **nunca** persistida
  como canônica.
- **FR-010**: `EventoCanonico` MUST NOT carregar segredo/token de transporte. O contrato é
  de **dados de negócio crus**, não de credencial.
- **FR-011**: Nesta spec o `EventoCanonico` é **definido e validado**; os adapters que o
  produzem a partir do `payload_bruto` são as specs 019–022. Se o `EventoCanonico` for
  entregue junto do evento, ele MUST ser guardado como **cache reconstruível** (nullable) —
  a fonte de verdade continua sendo `payload_bruto`.

#### Porta de ingestão / endpoint (etapa 0)

- **FR-012**: O sistema MUST fornecer uma **porta de ingestão** `registrarEvento({
  plataformaOrigem, tipoOrigem, idOrigem, payloadBruto, eventoCanonico? })` — o **ponto
  único de escrita** da etapa 0: calcula o `hash`, aplica a dedup (FR-003), persiste
  imutável, devolve `{ eventoId, criado: boolean }`. Commit próprio, idempotente.
- **FR-013**: A porta `registrarEvento` MUST ser exposta de **duas** formas (CL-02): (a)
  **porta in-process** injetável, que os adapters das specs 019–022 chamam no mesmo
  processo; (b) endpoint **HTTP** `POST /ingestao/eventos` sob `evento:ingerir`, para a
  reingestão da spec 031 e integrações desacopladas. As duas compartilham a mesma lógica de
  etapa 0.
- **FR-014**: O endpoint HTTP de ingestão MUST exigir `evento:ingerir` (**não** `@Public()`),
  responder 201 com o id em criação, 200 em dedup e 422 com erros de campo quando o
  `EventoCanonico` fornecido for inválido.
- **FR-015**: Esta spec MUST NOT expor nenhuma rota `/webhooks/*` pública — os webhooks por
  conta nascem nos adapters (specs 019–022).

#### Worker e framework de etapas

- **FR-016**: O sistema MUST fornecer um **worker** que seleciona `evento_origem` com
  trabalho pendente — `evento_etapa` em `pendente` ou `bloqueada`, ou em `erro` com
  `tentativas < INGESTAO_WORKER_MAX_TENTATIVAS` (CL-05) — do mais antigo para o mais novo
  (`recebido_em`), e roda cada um pela sequência de etapas. Uma passada esgota o _backlog_
  elegível no momento em que começou.
- **FR-017**: As etapas MUST ser um conjunto **ordenado e nomeado** com **dependências
  declaradas**: `REGISTRAR` (0) → `CLASSIFICAR` (1) → `RESOLVER_PESSOA` (2) →
  `UPSERT_TRANSACAO` (3); `RESOLVER_VINCULO` (4), `RESOLVER_OFERTA` (5) e `PROJETAR_CONTRATO`
  (6) dependem de (3) mas **não** entre si. Cada etapa: commit próprio, resultado explícito,
  idempotente, reprocessável a qualquer hora. O conjunto e o grafo de dependências vivem no
  código, versionados.
- **FR-018**: Para cada `(evento, etapa)` o sistema MUST persistir **uma** linha
  **`evento_etapa`** (única por `(evento_origem_id, etapa)`) com `status` (`pendente` |
  `processando` | `ok` | `erro` | `bloqueada` | `pulada`), `resultado` (JSON), `erro_detalhe`
  (nullable), `executado_em` e `tentativas` (contador incremental por reexecução).
- **FR-019**: Uma etapa que **falha** MUST marcar sua própria `evento_etapa` como `erro`
  (com `erro_detalhe`) e incrementar `tentativas`; MUST NOT fazer _rollback_ das etapas
  anteriores nem afetar outros eventos. Uma etapa cuja **dependência** (FR-017) não terminou
  `ok` MUST ser marcada `bloqueada` — **não executa**. O evento fica `erro` (falha) ou
  `revisar` (ambiguidade); o worker segue para o próximo evento.
- **FR-019a**: O worker MUST **re-tentar** uma `evento_etapa` em `erro` nas passadas
  seguintes enquanto `tentativas < INGESTAO_WORKER_MAX_TENTATIVAS` (`.env`, _default_ 3;
  CL-05). Esgotado o limite, a etapa fica `erro` **terminal** — só um reprocesso manual
  (FR-031, que zera `tentativas`) a reativa. Uma etapa `bloqueada` volta a ser tentada
  assim que sua dependência ficar `ok`.
- **FR-020**: As etapas 2–6 MUST ser entregues como implementações **_no-op_ plugáveis**
  que devolvem `evento_etapa` `pulada` com um marcador da spec que as implementará. Uma spec
  futura MUST poder substituir cada _no-op_ registrando a implementação real **sem alterar**
  o worker, a tabela `evento_etapa` nem o contrato de resultado de etapa.
- **FR-021**: O worker MUST ser **idempotente**: uma etapa já `ok` não é reexecutada numa
  passada normal; rodar o worker N vezes sobre o mesmo _backlog_ produz estado final
  idêntico e **zero** efeito colateral duplicado (Princípios IV/V).
- **FR-022**: A execução concorrente do worker (dois processos, ou intervalo que dispara
  antes do fim da passada anterior) MUST ser segura — cada evento/etapa processado no
  máximo uma vez por passada, via trava. Interrupção no meio de uma etapa MUST deixar a
  etapa retentável do começo, sem estado meio-aplicado sem registro.
- **FR-023**: O `status` final do evento MUST ser derivado das suas `evento_etapa`: `ok`
  quando toda etapa aplicável está `ok` ou `pulada`; `revisar` quando alguma etapa sinaliza
  ambiguidade de negócio (ex.: classificação desconhecida) e nenhuma está em `erro`; `erro`
  quando alguma etapa está em `erro` (inclui as `bloqueada` a jusante dela). Nenhum evento
  MUST terminar preso em `pendente` sem uma passada tê-lo tocado.
- **FR-024**: O worker MUST rodar como **laço in-process** no backend NestJS (CL-01), com
  intervalo configurável por `.env` e **desligado em ambiente de teste**; MUST existir o
  endpoint `POST /ingestao/eventos/processar` (sob `evento:reprocessar`) que força uma
  passada **síncrona e determinística** para os e2e. A ingestão MAY enfileirar uma passada
  imediata. Nenhuma porta nova, nenhum processo separado.
- **FR-025**: O processamento do worker MUST registrar seu resultado **apenas** em
  `evento_etapa` (log operacional) — MUST NOT gravar `RegistroAuditoria` do `core` (esse é
  para curadoria e ajuste manual). A rastreabilidade da projeção vem do `evento_origem` +
  `evento_etapa`.

#### Etapa 1 — classificação

- **FR-026**: A etapa 1 MUST derivar uma `classificacao` preliminar do evento e gravá-la em
  `evento_origem.classificacao`.
- **FR-027**: A `classificacao` MUST pertencer a um **enum canônico congelado**:
  `VENDA_PROPRIA` | `VENDA_AFILIADA` | `COBRANCA_TERCEIRIZADA` | `REEMBOLSO` | `RECORRENCIA`
  | `OUTRO` | `DESCONHECIDO` (specs futuras podem estender o enum, nunca sobrepor um valor).
- **FR-028**: A etapa 1 MUST implementar a **função de decisão de classificação** com todas
  as regras deriváveis de `EventoCanonico` + `tipo_origem` **sem adapter** (CL-03):
  `REEMBOLSO` por status/`tipo_origem` de estorno; `RECORRENCIA` por sinal de assinatura;
  `VENDA_AFILIADA` por sinal explícito `ehAfiliada` no `EventoCanonico`;
  `COBRANCA_TERCEIRIZADA` quando o evento traz referência externa a uma transação de outra
  plataforma; senão `VENDA_PROPRIA`. Regra que dependa de **contexto cross-transação**
  (casar Asaas↔Guru de fato) MUST NOT ser decidida aqui → `DESCONHECIDO` + `revisar`,
  refinada pelas specs 024/026.
- **FR-029**: Classificação ausente ou não reconhecida MUST resultar em
  `classificacao = DESCONHECIDO` **e** `status = revisar` com `erro_detalhe` — **nunca** um
  valor inventado, **nunca** bloqueando os outros eventos (regra inviolável #15;
  Princípio II).
- **FR-030**: A decisão de classificação MUST ser uma **função pura** de `EventoCanonico`
  (+ `tipo_origem`), determinística e testável sem banco.

#### Reprocessamento

- **FR-031**: O sistema MUST expor `POST /ingestao/eventos/{id}/reprocessar` (sob
  `evento:reprocessar`) que devolve as `evento_etapa` **não-`ok`** do evento (`erro`,
  `bloqueada`, `pendente`) para `pendente`, **zera** o contador `tentativas` dessas etapas,
  e devolve o `evento_origem` para `pendente`; o worker as retenta na passada seguinte.
  Idempotente por chamada.
- **FR-032**: Reprocessar um evento cujas etapas estão **todas `ok`** MUST ser _no-op_, a
  menos que `forcar = true` — que reenfileira a partir da etapa 1 (a etapa 0 é imutável; o
  `EventoCanonico` em cache é reconstruído do `payload_bruto` quando os adapters existirem).
- **FR-033**: Reprocessar um evento em `processando` MUST responder 409; id inexistente MUST
  responder 404. Nada muda nesses casos.
- **FR-034**: Cada reprocessamento manual MUST gravar **exatamente um** `RegistroAuditoria`
  na forma canônica do `core` (spec 002), `origem = AJUSTE_MANUAL` — quem, quando, id do
  evento, etapas reenfileiradas.

#### Endpoints de leitura / painel

- **FR-035**: O sistema MUST expor `GET /ingestao/eventos` (sob `evento:ver`): lista
  **paginada**, filtro por `plataforma_origem`, `status`, `tipo_origem`/`classificacao` e
  intervalo de `recebido_em`; ordenação estável; _default_ do filtro de status =
  `{revisar, erro}` com opção de "todos"; a lista traz campos-resumo, **não** o
  `payload_bruto` inteiro.
- **FR-036**: O sistema MUST expor `GET /ingestao/eventos/{id}` (sob `evento:ver`):
  metadados, `payload_bruto`, `evento_canonico` (se em cache) e a **linha do tempo das
  etapas** (`evento_etapa`: etapa, status, resultado, erro, instante, tentativas).
- **FR-037**: Nenhuma resposta de leitura MUST expor segredo/token de transporte.

#### RBAC e catálogo (spec 004)

- **FR-038**: A spec MUST acrescentar ao catálogo de permissões da 004 (`src/auth/rbac/
  catalogo.ts`): recurso `evento` — `evento:ver`, `evento:reprocessar`, `evento:ingerir` —
  cada uma com rótulo legível em português. O `administrador` de sistema e a credencial de
  serviço MUST passar a incluí-las automaticamente (special-case da 004).
- **FR-039**: Todo endpoint de `evento` MUST usar o guard da 004 com a permissão adequada.
  Nenhum MUST ficar `@Public()` nem `@AutenticadoBasta()` (o endpoint de ingestão, se
  existir, é `evento:ingerir` — não público; webhooks públicos são das specs 019–022).
- **FR-040**: 401 (sem token) e 403 (autenticado sem permissão) MUST permanecer distintos,
  com o corpo genérico da 004 no 403.

#### Persistência e _boot_

- **FR-041**: `evento_origem` e `evento_etapa` MUST persistir em **PostgreSQL** via
  **migração Prisma** — a 4ª migração de negócio do projeto. Padrões Transversais: PK `id`
  UUID v7 gerada na aplicação, `criado_em`/`atualizado_em` `timestamptz` UTC, índice por
  `plataforma_origem` e por `status`; `evento_etapa` referencia `evento_origem` por FK e é
  única por `(evento_origem_id, etapa)`.
- **FR-042**: A migração MUST aplicar limpo no _harness_ de teste (schema isolado por
  execução, como 001/004/005) e MUST NOT exigir _seed_ de dados de negócio.
- **FR-043**: O `ingestao` MUST passar a expor seu módulo NestJS real (`IngestaoModule`) com
  os _controllers_, o worker e a porta de ingestão, **sem** aumentar `CONTEXT_MODULES`
  (segue **11** — `ingestao` já estava na lista da spec 001 como módulo vazio) e **sem**
  violar a regra ESLint de fronteira entre contextos (`financeiro`/`crm`/`marketing`
  consomem `ingestao` pela porta/contrato público, não por import cruzado de infra).
- **FR-044**: O _boot_ MUST logar, uma vez, que o contexto `ingestao` está ativo, o modo de
  execução do worker e o vocabulário `evento:*` registrado — sem dados sensíveis.

#### Painel — Eventos

- **FR-045**: O painel MUST exibir o item **Eventos** só para sujeitos com `evento:ver`
  (mecanismo `usePermissoesEfetivas` da 004).
- **FR-046**: A lista MUST ter filtros (conta / status / tipo / data) e paginação, com
  _default_ mostrando `revisar` + `erro` e um alternador para "todos"; o detalhe MUST
  mostrar `payload_bruto` formatado num container com rolagem e a linha do tempo das etapas.
- **FR-047**: A ação **Reprocessar** MUST aparecer só com `evento:reprocessar`; sem ela, o
  detalhe é somente-leitura.
- **FR-048**: Uma resposta **403** em qualquer chamada do painel MUST ser tratada no ponto
  único do `apiFetch` (banner "sem permissão"), **sem** deslogar (403 ≠ 401 —
  comportamento da 004).

### Key Entities *(inclui só o que envolve dados)*

- **evento_origem**: um fato cru de uma conta de origem, imutável. UUID v7,
  `plataforma_origem` (enum 7), `id_origem`, `tipo_origem`, `payload_bruto` (JSON cru),
  `evento_canonico` (JSON, cache reconstruível, nullable), `hash`, `recebido_em`, `status`
  (`pendente` | `ok` | `erro` | `revisar`), `erro_detalhe` (nullable), `classificacao`
  (nullable), contador de reentrega. Único por `(plataforma_origem, id_origem, hash)`. Dono:
  contexto `ingestao`.
- **evento_etapa**: resultado de uma etapa do pipeline para um evento. FK `evento_origem_id`,
  `etapa` (`REGISTRAR` … `PROJETAR_CONTRATO`), `status` (`pendente` | `processando` | `ok` |
  `erro` | `bloqueada` | `pulada`), `resultado` (JSON), `erro_detalhe` (nullable),
  `executado_em`, `tentativas`. Única por `(evento_origem_id, etapa)`. `bloqueada` = uma
  dependência declarada não terminou `ok`; `erro` com `tentativas` no teto = terminal até
  reprocesso manual. Log operacional — não é `RegistroAuditoria`.
- **EventoCanonico** *(contrato, não é tabela)*: a forma canônica validada que um adapter de
  borda produz do `payload_bruto` — identidade da transação, dados do comprador,
  identificadores crus de oferta/produto, `Dinheiro`/`Moeda`, status de origem cru,
  _timestamps_, sinais de recorrência, `classificacao` preliminar opcional.
- **classificacao** *(enum canônico congelado)*: `VENDA_PROPRIA` | `VENDA_AFILIADA` |
  `COBRANCA_TERCEIRIZADA` | `REEMBOLSO` | `RECORRENCIA` | `OUTRO` | `DESCONHECIDO`.
- **Registro de auditoria** *(forma canônica do `core`, spec 002)*: grava o
  **reprocessamento manual** de um evento. `origem = AJUSTE_MANUAL`. Somente-acréscimo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O mesmo fato de origem (mesma chave `(plataforma_origem, id_origem, hash)`)
  ingerido **N** vezes produz **exatamente 1** linha `evento_origem` em **100%** dos casos —
  verificável chamando a porta em rajada concorrente e contando linhas.
- **SC-002**: Uma etapa que falha **nunca** faz _rollback_ das etapas anteriores do mesmo
  evento nem afeta qualquer outro evento — verificável injetando falha determinística numa
  etapa e confirmando etapas anteriores `ok`, etapas dependentes a jusante `bloqueada`, e os
  demais eventos em `ok`.
- **SC-002a**: Uma etapa em `erro` por falha **transitória** vira `ok` numa passada
  seguinte sem intervenção; uma etapa em `erro` **determinístico** para de ser tentada
  exatamente após `INGESTAO_WORKER_MAX_TENTATIVAS` passadas e só volta com reprocesso manual
  — verificável com uma etapa _fake_ que falha K vezes e depois passa.
- **SC-003**: Rodar o worker **3×** sobre um _backlog_ **sem falhas** resulta em estado
  final **idêntico** e **0** efeito colateral duplicado (nenhuma etapa `ok` reexecutada) —
  verificável por comparação de estado entre passadas.
- **SC-004**: **100%** dos eventos processados terminam em `ok`, `erro` ou `revisar` —
  nenhum some, nenhum fica preso em `pendente` após uma passada (contagem de entrada =
  contagem por status).
- **SC-005**: **100%** dos eventos sem classificação determinável recebem
  `classificacao = DESCONHECIDO` **e** `status = revisar` — **0** recebem um `tipo`
  adivinhado.
- **SC-006**: Reprocessar um evento reenfileira **apenas** as etapas não-`ok` (`erro`,
  `bloqueada`, `pendente`) e zera o `tentativas` delas; um evento todo `ok` reprocessado sem
  `forcar` sofre **0** mudança — verificável por _snapshot_ antes/depois.
- **SC-007**: Todo reprocessamento manual gera **exatamente 1** `RegistroAuditoria` com
  "quem" e "quando"; o worker gera **0** — verificável contando registros por origem.
- **SC-008**: **0** identificadores de origem aparecem como PK de `evento_origem`,
  `evento_etapa` ou qualquer tabela relacionada — toda PK é `@db.Uuid` gerada na aplicação
  (inspeção do schema Prisma).
- **SC-009**: As partes puras (cálculo de `hash`, canonicalização do payload, chave de
  dedup, decisão de classificação, sequenciamento de etapas) rodam **sem banco**; só os
  testes de porta, worker e _endpoint_ tocam Postgres real — disciplina de teste da
  constituição.
- **SC-010**: Todos os endpoints de `evento` respondem **401** sem token e **403**
  autenticado sem a permissão exigida, em **100%** dos casos.
- **SC-011**: A suíte e2e das specs 003/004/005 continua **verde sem alteração** e
  `/health` continua afirmando **11** contextos.
- **SC-012**: As etapas 2–6 desta spec não referenciam `pessoa`, `transacao`, `oferta` nem
  `contrato` em código nem migração — verificável por _grep_ do diff e pela ausência de
  dependência de `financeiro`/`clientes`/`catalogo`/`contratos` no `IngestaoModule`.
- **SC-013**: O painel monta lista/detalhe consumindo só os endpoints de `evento` (zero dado
  _hardcoded_); um 403 numa chamada **nunca** desloga a sessão — verificável por teste de
  componente.

## Assumptions

- **Modelo de execução do worker** (CL-01): laço in-process, intervalo por `.env`
  (`INGESTAO_WORKER_INTERVALO`), desligado em teste (`INGESTAO_WORKER_ENABLED=false`), +
  `POST /ingestao/eventos/processar` para uma passada síncrona nos e2e. Sem processo
  separado, sem porta nova.
- **Falha e retentativa de etapa** (CL-04/CL-05): etapas têm dependências declaradas;
  dependência não-`ok` → etapa `bloqueada`. Etapa em `erro` é re-tentada pelo worker até
  `INGESTAO_WORKER_MAX_TENTATIVAS` (`.env`, _default_ 3); depois `erro` terminal até
  reprocesso manual (que zera `tentativas`). Sem _backoff_ exponencial nem _dead-letter_
  nesta spec (spec 029).
- **Superfície de entrada** (CL-02): porta in-process (adapters co-localizados) **e**
  endpoint HTTP `POST /ingestao/eventos` sob `evento:ingerir` (migração 031 e integrações
  desacopladas).
- **Profundidade da classificação** (CL-03): a taxonomia canônica e a função de decisão
  entram nesta spec, com todas as regras deriváveis sem adapter; o que depende de contexto
  cross-transação (Asaas↔Guru real) fica `DESCONHECIDO` + `revisar` para as specs 024/026.
- **`hash`** cobre o `payload_bruto` canonicalizado — reentrega idêntica dedup; payload
  corrigido para o mesmo `id_origem` gera evento novo (ambos preservados; a reconciliação é
  da etapa de _upsert_, spec 018).
- **`EventoCanonico` como cache reconstruível**: guardado (nullable) quando entregue junto
  do evento; a fonte de verdade é sempre `payload_bruto`. Quando os adapters (019+)
  existirem, o reprocessamento re-deriva o `EventoCanonico` do `payload_bruto`.
- **Retenção de `payload_bruto`**: integral na v1, sem expurgo. Política de
  retenção/tamanho é a spec 055; PII do comprador é tratada por pseudonimização de `pessoa`
  (spec 047), não aqui.
- **Etapas 2–6 _no-op_**: devolvem `pulada` com o número da spec dona. Specs 018/023/024/025
  plugam as reais sem tocar o worker.
- **Sem rotas `/webhooks/*`**: os webhooks por conta e o tratamento de payload cru inválido
  de webhook são das specs 019–022.
- **Auditoria**: só o **reprocessamento manual** audita (forma canônica do `core`,
  `AJUSTE_MANUAL`). O worker registra em `evento_etapa`, que é log operacional, não
  `_audit`. O painel consolidado de operação é a spec 029; o de auditoria, a 053.
- **Portas**: nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` (spec
  001), configuráveis por `.env`.
- **`auth`/RBAC da 004** já provê guard, `usePermissoesEfetivas`, tratamento central de 403
  e catálogo extensível — esta spec só adiciona o recurso `evento`.
- **`CONTEXT_MODULES` segue 11** — `ingestao` já estava na lista (spec 001). As e2e de
  `/health` continuam afirmando 11.

## Dependencies

- **Spec 001 (bootstrap)**: módulo `ingestao` vazio a preencher; convenções de entidade (PK
  UUID v7 na app, `timestamptz`); _harness_ e2e contra Postgres real com schema isolado;
  regra ESLint de fronteira entre contextos; shell/navegação do frontend.
- **Spec 002 (core value objects)**: `EntidadeId`/`uuidv7()` para as PKs;
  `parseInstante`/`agoraUtc()` para instantes; `PlataformaOrigem` (enum 7) para
  `plataforma_origem`; `Dinheiro`/`Moeda` para o contrato `EventoCanonico`;
  `RegistroAuditoria` + `montarRegistroAuditoria` (`AJUSTE_MANUAL`) para o reprocessamento;
  `StatusTransacaoCanonico` como referência do status de origem cru → canônico (a tradução
  em si é dos adapters, specs 019–022).
- **Spec 003 (auth-servico-jwt)**: `JwtAuthGuard` global; `apiFetch` central do painel.
- **Spec 004 (rbac)**: catálogo extensível (`src/auth/rbac/catalogo.ts`) +
  `assertCatalogoCoerente()`; `PermissionGuard` + `@RequerPermissao`;
  `usePermissoesEfetivas` + tratamento central de 403 no frontend; `RequirePermissao`.
- **Spec 005 (clientes)**: precedente de divisão `domain/` · `application/` · `infra/` num
  _bounded context_ de domínio; a porta `resolverOuCriar` é o que a etapa 2 (`RESOLVER_PESSOA`)
  vai chamar quando deixar de ser _no-op_ (spec 018).
- **Consome desta spec**: **018 (financeiro-transacao-ledger)** pluga as etapas 2–3;
  **023 (catalogo)** pluga a etapa 5; **024 (vinculo-asaas-guru)** pluga a etapa 4;
  **025 (contratos)** pluga a etapa 6; **019–022 (adapters)** produzem `EventoCanonico` e
  abrem as rotas `/webhooks/*` que chamam a porta; **014 (crm-workflow)** e
  **035 (marketing-coleta-de-leads)** consomem `evento_origem` como projeção (nunca
  _polling_); **029 (health-e-observabilidade)** consolida o painel de `revisar`/`erro`;
  **031 (migração)** reingere payloads da v1 pela mesma porta; **053** consolida auditoria.

## Out of Scope

- **Adapters de borda** (`parse(payload) → EventoCanonico`) e as rotas `/webhooks/*`
  públicas por conta — specs 019–022.
- **Classificação que depende de contexto cross-transação** — casar Asaas↔Guru de fato para
  cravar `COBRANCA_TERCEIRIZADA`, reconciliar afiliada contra o catálogo de produtos
  afiliados, coerência `tipo_origem` × classificação — specs 024/026. Aqui essas caem em
  `DESCONHECIDO` + `revisar`. O enum e a função de decisão com as regras locais **estão** no
  escopo (CL-03).
- **Etapas 2–6 de verdade** (`RESOLVER_PESSOA`, `UPSERT_TRANSACAO`, `RESOLVER_VINCULO`,
  `RESOLVER_OFERTA`, `PROJETAR_CONTRATO`) — specs 018/023/024/025. Aqui são _no-op_.
- **Qualquer escrita em `pessoa`, `transacao`, `oferta`, `contrato`** — os contextos donos.
- **Política de retenção / expurgo / anonimização de `payload_bruto`** — spec 055.
- **Painel consolidado de saúde das 7 contas** ("configurado / último evento / defasado /
  histórico") — spec 029. Aqui só a lista/detalhe de eventos.
- **_Dead-letter queue_, alertas e _backoff_ sofisticado de retentativa** — além de
  `status = erro` + `erro_detalhe` + reprocessar manual, nada nesta spec.
- **Reprocessamento em massa / por filtro** (reprocessar "todos os `erro` da conta X") —
  fica para a spec 029/031 se necessário; aqui é um evento por vez.
- **Métricas/observabilidade estruturada** (contadores de _throughput_, latência por etapa)
  — spec 029/053.
