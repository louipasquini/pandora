# Feature Specification: pessoa e conta — identidade canônica, dedup e merge

**Feature Branch**: `005-pessoa-identidade-dedup`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "005 pessoa-identidade-dedup — Entidade `pessoa` (ex-`Cliente` da v1): identidade canônica do comprador, com contatos (e-mails e telefones, histórico de secundários onde o mais recente vira primário), documentos (CPF/CNPJ), endereço. Engine `resolver_identidade(dados) → {pessoa_id, confianca, criterio, candidatos[]}`: dedup por prioridade documento → CNPJ → e-mail normalizado → telefone; quando um critério casa mais de uma pessoa (ambiguidade), o critério é DESCARTADO e a resolução segue para o próximo — nunca escolhe candidato nem faz merge automático. `merge_pessoa` auditável e reversível. IDs de origem apenas em `*_origem_ref`, nunca como PK. PK UUID v7 gerada na app. Endpoints de leitura: `GET /pessoas`, `GET /pessoas/{id}`. Escrita mínima: `POST /pessoas/{id}/merge` e o desfazer correspondente, sob permissão RBAC (spec 004). Frontend: lista e detalhe de pessoas. LGPD: exclusão = pseudonimização (spec 047) — o modelo já precisa deixar espaço. Fundação de `clientes` que o Financeiro (018) e o CRM consomem."

## Clarifications

### Session 2026-09-03

- Q: **CL-01** — O agrupamento `conta` (household / empresa) que reúne várias `pessoa` (visão Parte 5.2‑E e 8.9; decisão em aberto do roadmap que "afeta 005, 010, 044") entra nesta spec? → A: **Modelar `conta` por completo nesta spec.** Entra a entidade `conta` (household / empresa) agrupando **0..N `pessoa`**, com CRUD, associação/desassociação de `pessoa` e **`merge_conta`** auditável e reversível — mesmo tratamento de `pessoa`. Uma `pessoa` pertence a **0 ou 1** `conta`. O Contrato **continua** `(pessoa, produto)` (regra inviolável #3 — `conta` não muda isso); `conta` é agrupamento de CRM/Central, não de Financeiro.
- Q: **CL-02** — Como uma linha de `pessoa` passa a existir nesta spec, já que o pipeline de ingestão é a spec 018? → A: **CRUD manual completo + serviço `resolverOuCriar`.** A equipe cria e **edita** `pessoa` pelo painel: `POST /pessoas`, `PATCH /pessoas/{id}` (nome, tipo, adicionar/remover/rebaixar contatos e documentos, endereços). Toda edição manual marca o campo tocado como **curado** (Princípio VII — curadoria vence derivação: um `resolverOuCriar` futuro não sobrescreve primário curado, só anexa como secundário e alerta). Além disso a engine expõe `resolverOuCriar(dados)` — o ponto único que a spec 018 vai chamar no pipeline. **Sem** `DELETE` de `pessoa` (exclusão é pseudonimização — spec 047).
- Q: **CL-03** — `merge_pessoa` "reversível": o desfazer tem limite (ordem, merges posteriores)? → A: **Sempre reversível, em qualquer ordem.** Qualquer `merge_pessoa` (ou `merge_conta`) do histórico pode ser desfeito a qualquer momento, mesmo com merges ou edições posteriores. Cada linha movida no merge carrega **proveniência** (`merge_pessoa_id`); o desfazer reverte exatamente as linhas daquele merge por proveniência e recria a `pessoa` absorvida a partir do _snapshot_. Se uma **edição curada posterior** ou um **merge posterior** já alterou um item que o desfazer reverteria, o valor curado atual **prevalece** e o desfazer registra uma **nota de reconciliação** (nunca sobrescreve em silêncio — Princípio VII). Desfazer é idempotente; merge já desfeito → 409.
- Q: **CL-04** — O `clientes` vira o 1º _bounded context_ com entidade de negócio (o RBAC da 004 ficou no `auth`). `CONTEXT_MODULES` muda? → A: **Não.** Segue com **11** — `clientes` já estava na lista (spec 001) como módulo vazio; esta spec só o preenche. As e2e de `/health` continuam afirmando 11.

## Visão geral

Primeira spec da **Fase 0** a entregar **entidades de negócio com banco** dentro de um
_bounded context_ de produto: `clientes`. (A 004 criou tabelas, mas no `auth`, infra
transversal.) Entrega **`pessoa`** — a identidade canônica do comprador, o antigo `Cliente`
da v1 — a **engine de identidade/dedup** que o Financeiro (spec 018, etapa 2 do pipeline
"resolver pessoa") e o CRM consomem, e **`conta`** (household / empresa) agrupando pessoas.

O que entra:

- **Entidade `pessoa`**: identidade (`nome`, `tipo` física / jurídica), **documentos**
  (CPF, CNPJ) com validação de dígito verificador, **e-mails** e **telefones** com
  **primário + secundários** e histórico (o mais recente vira primário, o anterior desce
  para secundário — regra de negócio inviolável #10), **endereço(s)**. UID _surrogate_
  opaco (UUID v7, Padrão Transversal), `criado_em`/`atualizado_em`, `pseudonimizada_em`
  nullable (espaço para a spec 047), ponteiro `merged_para` nullable, FK `conta_id`
  nullable.
- **Entidade `conta`** (household / empresa): `tipo` (`HOUSEHOLD` | `EMPRESA`), `nome`,
  agrupa **0..N `pessoa`**. CRUD, associar/desassociar `pessoa`, e **`merge_conta`**
  (auditável, reversível — mesmo mecanismo de `merge_pessoa`). **Não** altera a
  granularidade de Contrato (`(pessoa, produto)` — regra inviolável #3).
- **Referências de origem** (`pessoa_origem_ref`): identificadores que as plataformas usam
  para o comprador (id de cliente Guru, `customer` Asaas, `buyer` Hotmart, doc/e-mail como
  chave de origem) vivem numa tabela de resolução muitos-para-um — **nunca** como PK,
  sempre com `plataforma_origem` (Princípio I).
- **Engine de identidade** `resolver_identidade(dados, candidatos) → { pessoa_id,
  confianca, criterio, candidatos[] }`: função **determinística e testável sem banco** que
  aplica a **prioridade documento → CNPJ → e-mail normalizado → telefone**. Um critério que
  casa **exatamente uma** `pessoa` resolve. Um critério que casa **duas ou mais** é
  **descartado** (a engine **não** escolhe, **não** funde) e a resolução segue para o
  próximo. Esgotados os critérios sem casamento único: `pessoa_id = null` + `candidatos[]`,
  para o chamador decidir (criar / `REVISAR`).
- **Normalização de borda** das chaves de dedup: e-mail (_lowercase_, _trim_), telefone
  (E.164; assume BR na borda se o país não for inferível, com log), documento (só dígitos +
  validação CPF/CNPJ). Chave inválida **não vira critério** — é ignorada com log, nunca
  quebra a resolução.
- **`resolverOuCriar(dados, { criar, origem })`**: sobre a engine pura — resolve; se
  resolveu, **anexa** refs de origem novas e **rotaciona** e-mail/telefone (novo →
  primário, antigo → secundário) **respeitando primário curado** (Princípio VII); se não
  resolveu e `criar = true`, **cria** a `pessoa` com os dados e as refs; se `criar = false`
  (venda de afiliada — regra inviolável #8), retorna `pessoa_id = null`. É o ponto único de
  escrita **derivada** — o que a spec 018 chamará no pipeline.
- **CRUD manual** (CL-02): `POST /pessoas`, `PATCH /pessoas/{id}` (identidade, contatos,
  documentos, endereços); idem para `conta`. Edição manual marca campo **curado**. Sem
  `DELETE`.
- **`merge_pessoa` / `merge_conta`** — unem duas entidades (uma **sobrevivente**, uma
  **absorvida**): movem contatos, documentos, endereços, refs de origem (e, para `conta`,
  as `pessoa`s membras) para a sobrevivente com **proveniência** por linha; marcam a
  absorvida `merged` (ponteiro para a sobrevivente; `GET` redireciona); gravam um registro
  com _snapshot_ completo. Reversível **em qualquer ordem** (CL-03). Merge é sempre
  **explícito** — nunca disparado pela engine.
- **Vocabulário de permissão** no catálogo RBAC da 004: `pessoa:ver`, `pessoa:editar`,
  `pessoa:merge`; `conta:ver`, `conta:editar`, `conta:merge`.
- **Endpoints de leitura**: `GET /pessoas` (lista paginada; busca por nome / e-mail /
  telefone / documento), `GET /pessoas/{id}` (detalhe completo), `GET /contas`,
  `GET /contas/{id}`.
- **Espaço para LGPD**: `pseudonimizada_em` nullable + a noção de quais campos são PII, para
  a spec 047 executar a exclusão **sem** tocar `transacao` nem agregados. Nesta spec só o
  espaço — nenhum fluxo de exclusão.
- **Frontend**: itens de navegação **Pessoas** (atrás de `pessoa:ver`) e **Contas** (atrás
  de `conta:ver`) — listas com busca, detalhe, formulários de criação/edição, ação
  **Unificar** (atrás de `*:merge`) e linha do tempo de merges com **Desfazer**.

O `clientes` deixa de ser um módulo vazio e passa a ser o **dono** de `pessoa` e `conta`
(Princípio VI). Nenhum outro contexto escreve nessas entidades — o Financeiro e o CRM
**chamam a engine** e **leem**.

O sucesso é medido por: a engine resolve identidade de forma **idêntica e determinística**
para o Financeiro e o CRM (uma regra, um código); ambiguidade **nunca** produz merge
silencioso nem palpite; todo merge é **auditado e reversível**; curadoria manual **nunca** é
sobrescrita em silêncio pela derivação; e nenhum id de origem aparece como PK.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A engine resolve identidade por prioridade e descarta critério ambíguo (Priority: P1)

Um chamador (hoje um teste; amanhã o pipeline da 018) passa os dados de um comprador para
`resolver_identidade`. A engine tenta os critérios **na ordem** documento → CNPJ → e-mail
normalizado → telefone. No primeiro critério que casa **exatamente uma** `pessoa`, retorna
essa `pessoa` com o `criterio` e a `confianca`. Se um critério casa **duas ou mais**
`pessoa`s, a engine **descarta** esse critério (não escolhe, não junta) e tenta o próximo.
Se nenhum critério casa exatamente uma, retorna `pessoa_id = null` e `candidatos[]`.

**Why this priority**: é o núcleo da spec e o MVP. Sem a engine, não há dedup — o Financeiro
(018) não resolve o comprador. É a regra de negócio inviolável #10 virada em código
canônico.

**Independent Test**: montar `pessoa`s de fixture; chamar a engine com dados que (a) casam
um documento único → resolve por documento; (b) casam e-mail de duas pessoas → descarta
e-mail, tenta telefone; (c) não casam nada → `null` + candidatos; confirmar a ordem e que
ambiguidade nunca resolve.

**Acceptance Scenarios**:

1. **Given** uma `pessoa` com CPF `X` e nenhuma outra com esse CPF, **When**
   `resolver_identidade` recebe `documento = X` (mesmo com e-mail/telefone divergentes),
   **Then** retorna essa `pessoa`, `criterio = "documento"`, `confianca` alta.
2. **Given** duas `pessoa`s com o mesmo e-mail normalizado e nenhuma correspondência por
   documento/CNPJ, **When** a engine chega ao critério e-mail, **Then** descarta o critério
   e tenta telefone — **nunca** retorna uma das duas.
3. **Given** que o telefone informado casa exatamente uma terceira `pessoa`, **When** a
   engine cai para o critério telefone, **Then** resolve por telefone com `confianca` menor
   que a de documento.
4. **Given** dados que não casam nenhuma `pessoa` em nenhum critério, **When** a engine
   roda, **Then** retorna `pessoa_id = null`, `criterio = null`, `candidatos[] = []`.
5. **Given** um `documento` com dígito verificador inválido, **When** a engine roda,
   **Then** o critério documento é **ignorado** e a resolução segue para CNPJ/e-mail/
   telefone, com log da chave descartada.
6. **Given** a mesma entrada e o mesmo conjunto de `pessoa`s, **When** a engine roda duas
   vezes, **Then** o resultado é **idêntico** (determinística; sem efeito colateral).

---

### User Story 2 - `resolverOuCriar` cria a pessoa quando não há match e rotaciona contato quando há (Priority: P1)

O pipeline precisa de um ponto único que, dado o comprador, devolva sempre uma `pessoa` (ou
`null` para afiliada). Se a engine resolve para uma existente e os dados trazem um **e-mail
novo**, esse e-mail vira **primário** e o anterior desce para **secundário** — **exceto** se
o primário atual foi **curado** manualmente, caso em que o novo entra como secundário e uma
nota de reconciliação é registrada. Se a engine não resolve, uma `pessoa` **nova** é criada
com os `pessoa_origem_ref` correspondentes.

**Why this priority**: P1 junto da US1 — é o que a spec 018 chama. Sem criação e rotação, a
engine pura não alimenta o banco.

**Independent Test**: chamar `resolverOuCriar` sem match → `pessoa` nova + refs; chamar de
novo com o mesmo documento e e-mail diferente → mesma `pessoa`, e-mail novo primário, antigo
secundário; marcar o primário como curado e repetir → novo e-mail entra secundário + nota;
chamar idêntico → nenhuma mudança.

**Acceptance Scenarios**:

1. **Given** nenhuma `pessoa` casando os dados, **When** `resolverOuCriar` recebe nome +
   CPF + e-mail + `plataforma_origem` + id de origem, **Then** uma `pessoa` nova é criada,
   o e-mail entra primário, o CPF como documento, e uma linha `pessoa_origem_ref` liga a
   origem a essa `pessoa`.
2. **Given** uma `pessoa` resolvida por documento com primário **não curado**, **When** os
   dados trazem um e-mail diferente, **Then** o novo vira primário, o antigo vira secundário
   (com o instante do rebaixamento), nenhum e-mail é apagado.
3. **Given** a mesma `pessoa` com primário **curado**, **When** chega um e-mail diferente
   por `resolverOuCriar`, **Then** o novo entra como **secundário**, o primário curado
   permanece, e uma nota de reconciliação é registrada (Princípio VII).
4. **Given** duas chamadas idênticas de `resolverOuCriar`, **When** a segunda roda,
   **Then** o estado final é o mesmo — sem `pessoa` duplicada, sem ref duplicada, sem
   rotação espúria (idempotência — Princípios IV/V).
5. **Given** dados de venda de **afiliada** (`tipo` marcado pela spec 026), **When**
   `resolverOuCriar` roda com `criar = false`, **Then** retorna `pessoa_id = null` se não
   houver match — **nunca** cria `pessoa` (regra inviolável #8).
6. **Given** um critério ambíguo (e-mail casando 2 pessoas) e nenhum outro resolvendo,
   **When** `resolverOuCriar` roda com `criar = true`, **Then** cria uma `pessoa` nova
   (não funde as ambíguas) e o resultado carrega `candidatos[]` para eventual merge humano.

---

### User Story 3 - CRUD manual de `pessoa`, com curadoria que a derivação não sobrescreve (Priority: P2)

Alguém com `pessoa:editar` cria uma `pessoa` (nome + ao menos um contato/documento) e
depois edita: corrige o nome, define qual e-mail é o primário, adiciona um telefone,
remove um documento digitado errado, ajusta o endereço. Cada campo tocado manualmente fica
**curado** — um `resolverOuCriar` posterior não o sobrescreve, só anexa alternativas como
secundárias e alerta. Não há `DELETE` de `pessoa`.

**Why this priority**: P2 — a engine (US1/US2) já entrega o dedup; o CRUD é como a base é
povoada e corrigida pela equipe antes de o pipeline da 018 existir, e é onde a precedência
curadoria > derivação (Princípio VII) nasce para `clientes`.

**Independent Test**: criar `pessoa` por `POST`; `PATCH` nome e primário de e-mail; conferir
que os campos ficaram marcados curados e auditados; rodar `resolverOuCriar` com dado
conflitante e conferir que o curado permaneceu + nota de reconciliação; tentar `DELETE` →
405/404 (não existe).

**Acceptance Scenarios**:

1. **Given** `pessoa:editar`, **When** `POST /pessoas` com `nome` e um e-mail válido,
   **Then** a `pessoa` é criada com o e-mail primário e um registro de auditoria "pessoa
   criada manualmente" (autor, instante).
2. **Given** uma `pessoa` com dois e-mails, **When** `PATCH` define o secundário como
   primário, **Then** a troca persiste, o antigo primário vira secundário datado, o campo
   fica **curado**, e a mudança é auditada com _delta_.
3. **Given** um `PATCH` que adiciona um documento com dígito verificador inválido, **When**
   processado, **Then** 400 e nada muda.
4. **Given** um `PATCH` com um e-mail/telefone/documento que **já pertence a outra**
   `pessoa`, **When** processado, **Then** 409 apontando a `pessoa` existente — **sem**
   fundir (merge é ação separada).
5. **Given** uma `pessoa` com primário de e-mail curado, **When** `resolverOuCriar` traz
   outro e-mail, **Then** o curado permanece primário, o novo entra secundário, e há nota
   de reconciliação.
6. **Given** qualquer `pessoa`, **When** se tenta `DELETE /pessoas/{id}`, **Then** a rota
   não existe (exclusão é pseudonimização — spec 047).

---

### User Story 4 - Unificar (merge) duas pessoas, auditado e reversível em qualquer ordem (Priority: P2)

Alguém com `pessoa:merge` percebe que duas `pessoa`s são a mesma e as **unifica**: escolhe
a **sobrevivente** e a **absorvida**. Contatos, documentos, endereços e refs de origem
passam para a sobrevivente, cada linha marcada com a **proveniência** do merge; a absorvida
vira ponteiro. Grava-se `merge_pessoa` com _snapshot_ completo. Depois — a qualquer momento,
mesmo após outros merges ou edições — a mesma pessoa **desfaz** o merge: as linhas daquele
merge são revertidas por proveniência e a absorvida é recriada do _snapshot_. Onde uma
edição curada ou merge posterior já mudou um item, o valor atual **prevalece** e o desfazer
registra uma nota de reconciliação.

**Why this priority**: P2 — a engine já entrega o dedup automático; o merge cobre o resíduo
que a ambiguidade deliberadamente **não** resolve. Auditável e reversível é requisito da
visão (Parte 5.2‑E) e do Princípio VII.

**Independent Test**: criar duas `pessoa`s; unificar; conferir contatos acumulados como
secundários, absorvida redirecionando, `merge_pessoa` com _snapshot_ e proveniência;
fazer um segundo merge sobre a sobrevivente; desfazer o **primeiro** merge; conferir que a
primeira absorvida voltou e o segundo merge continua íntegro; tentar desfazer de novo →
409.

**Acceptance Scenarios**:

1. **Given** `A` (sobrevivente) e `B` (absorvida) e `pessoa:merge`, **When**
   `POST /pessoas/A/merge` com `{ absorvida: B }`, **Then** e-mails/telefones/documentos/
   endereços/refs de `B` passam para `A` (contatos de `B` entram **secundários**, sem
   promover sobre o primário de `A`), `B` fica `merged→A`, e `merge_pessoa` é gravado com
   autor, instante, _snapshot_ e proveniência por linha.
2. **Given** `B` `merged→A`, **When** `GET /pessoas/B`, **Then** a resposta resolve para
   `A` com indicação explícita de unificação — nunca dados órfãos de `B`.
3. **Given** o merge de `B` e um merge posterior de `B2` sobre `A`, **When**
   `POST /pessoas/A/merge/{mergeDoB}/desfazer`, **Then** `B` é recriada do _snapshot_, só
   as linhas com proveniência do merge de `B` voltam, o merge de `B2` permanece íntegro, e
   `merge_pessoa` do `B` fica `desfeito` (autor + instante).
4. **Given** um item que o merge de `B` moveu e que uma **edição curada** posterior sobre
   `A` alterou, **When** o merge de `B` é desfeito, **Then** o valor curado de `A`
   **permanece** e o desfazer registra uma nota de reconciliação (sem sobrescrita
   silenciosa).
5. **Given** um merge já desfeito, **When** se tenta desfazê-lo de novo, **Then** 409.
6. **Given** `absorvida == sobrevivente`, ou uma `pessoa` inexistente, ou uma já `merged`,
   **When** a requisição de merge é processada, **Then** 400 / 404 / 409 conforme o caso e
   nada muda.
7. **Given** uma requisição de merge **sem** `pessoa:merge`, **When** ela chega
   autenticada, **Then** 403 (guard da 004) — e a ação **Unificar** nem aparece no painel.

---

### User Story 5 - `conta` (household / empresa) agrupa pessoas, com CRUD e merge reversível (Priority: P2)

Alguém com `conta:editar` cria uma `conta` (`tipo` household ou empresa, nome), associa e
desassocia `pessoa`s (cada `pessoa` em **0 ou 1** `conta`), edita o nome. Quem tem
`conta:merge` unifica duas `conta`s — as `pessoa`s membras e os atributos passam para a
sobrevivente, com proveniência, e o `merge_conta` é reversível **em qualquer ordem**, igual
ao de `pessoa`. `conta` **não** altera a granularidade de Contrato (`(pessoa, produto)`
segue intacta — regra inviolável #3).

**Why this priority**: P2 — o roadmap pediu `conta` modelada por completo nesta spec (CL-01)
porque CRM (010) e Central (044) dependem do agrupamento. Sem login individual ainda, o
efeito prático é indireto, mas a modelagem precisa existir agora.

**Independent Test**: criar uma `conta`; associar 3 `pessoa`s; desassociar 1; editar o
nome; criar uma 2ª `conta` com 2 `pessoa`s; unificar as duas; conferir que a sobrevivente
tem as 4 `pessoa`s e `merge_conta` com _snapshot_; desfazer; conferir as duas `conta`s
restauradas; confirmar que nenhum Contrato mudou de dono.

**Acceptance Scenarios**:

1. **Given** `conta:editar`, **When** `POST /contas` com `tipo` e `nome`, **Then** a
   `conta` é criada e auditada (autor, instante).
2. **Given** uma `conta` e uma `pessoa` sem `conta`, **When** a `pessoa` é associada,
   **Then** `pessoa.conta_id` passa a apontar a `conta` e a mudança é auditada; associar
   uma `pessoa` que **já** está em outra `conta` exige desassociar antes (409 com a `conta`
   atual).
3. **Given** duas `conta`s `C1` (sobrevivente) e `C2` (absorvida) e `conta:merge`, **When**
   `POST /contas/C1/merge` com `{ absorvida: C2 }`, **Then** as `pessoa`s de `C2` passam a
   `C1`, `C2` fica `merged→C1`, e `merge_conta` grava _snapshot_ + proveniência.
4. **Given** o `merge_conta` de `C2`, **When** é desfeito, **Then** `C2` é recriada e suas
   `pessoa`s membras voltam — pessoas adicionadas a `C1` depois do merge permanecem em
   `C1`.
5. **Given** qualquer merge de `conta`, **When** ele ocorre e é desfeito, **Then** nenhum
   `contrato` muda de `pessoa` (a granularidade `(pessoa, produto)` é imune a `conta` —
   regra inviolável #3) — verificável porque esta spec não toca `contrato`.
6. **Given** uma requisição de `conta` **sem** a permissão exigida, **When** autenticada,
   **Then** 403.

---

### User Story 6 - Painel: Pessoas e Contas (Priority: P3)

Quem tem `pessoa:ver` vê **Pessoas**: lista paginada com busca (nome / e-mail / telefone /
documento) e detalhe com identidade, contatos (primário destacado, secundários datados,
marca de "curado"), documentos, endereços, refs de origem (plataforma + id), `conta` a que
pertence, e a linha do tempo de merges com **Desfazer**. Quem tem `conta:ver` vê **Contas**:
lista, detalhe com as `pessoa`s membras, e merge/desfazer. Sem a permissão, o item some da
navegação e a rota direta mostra "sem permissão" (não a tela de Login).

**Why this priority**: P3 — o backend já entrega o valor (engine + leitura + escrita). A
tela torna a base navegável e corrigível pela equipe (suporte, comercial) sem `curl`.

**Independent Test**: logar com `pessoa:ver`; buscar por trecho de e-mail; abrir o detalhe
e conferir primário/secundário, "curado", refs de origem, `conta`, histórico de merges;
logar sem a permissão e confirmar que **Pessoas** some e a rota direta mostra "sem
permissão"; repetir para **Contas**.

**Acceptance Scenarios**:

1. **Given** `pessoa:ver`, **When** o usuário abre **Pessoas**, **Then** vê a lista
   paginada e a busca; buscar por parte de um e-mail retorna as pessoas cujo e-mail
   (primário **ou** secundário) casa.
2. **Given** o detalhe de uma `pessoa` com 1 primário e 2 secundários, **When** exibido,
   **Then** o primário aparece destacado, cada secundário mostra desde quando foi
   rebaixado, e um campo curado tem marca visual.
3. **Given** o detalhe de uma `pessoa` em uma `conta`, **When** exibido, **Then** mostra a
   `conta` e link para o detalhe dela; a aba **Contas** mostra as `pessoa`s membras.
4. **Given** `pessoa:editar` (ou `conta:editar`), **When** o usuário salva uma edição,
   **Then** a tela reflete o novo estado e a marca de curado; **without** a permissão de
   escrita, os controles de edição não aparecem (só leitura).
5. **Given** um sujeito **sem** `pessoa:ver`, **When** logado, **Then** **Pessoas** não
   aparece; **When** navega direto para a rota, **Then** vê "sem permissão" (403 tratado no
   ponto único do `apiFetch`, sem deslogar).
6. **Given** uma `pessoa`/`conta` `merged`, **When** aberta pelo id antigo, **Then** o
   painel redireciona para a sobrevivente com aviso "esta pessoa/conta foi unificada".
7. **Given** um merge listado na linha do tempo, **When** ele foi desfeito ou tem nota de
   reconciliação, **Then** o painel mostra o estado e a nota.

---

### Edge Cases

- **Documento/CNPJ com máscara** (`123.456.789-09`): normalizado para só dígitos antes de
  virar chave; a máscara nunca é armazenada como chave de dedup.
- **E-mail com maiúsculas / espaços / `+tag`**: normalização é _lowercase_ + _trim_. **Sem**
  remoção de `+tag` nem de pontos (comportamento por provedor não é assumido) —
  `a+x@gmail.com` e `a@gmail.com` são chaves distintas na v1.
- **Telefone sem DDI / com formatação**: normalizado para E.164 quando possível; país não
  inferível → assume BR (`+55`) **só na borda**, com log. Telefone que não normaliza → não
  vira critério.
- **Dados só com nome**: nenhum critério aplicável → `resolver_identidade` retorna `null`;
  `resolverOuCriar` com `criar = true` cria uma `pessoa` só com nome (nome **não** é
  critério de dedup — homônimos são comuns).
- **Chave que casa uma `pessoa` já `merged`**: a resolução segue o ponteiro e retorna a
  **sobrevivente**.
- **Merge onde ambas têm o mesmo documento**: permitido (caso típico); o documento não
  duplica na sobrevivente.
- **Merge onde cada uma tem um CPF diferente**: permitido; a sobrevivente passa a ter os
  dois (cabe revisão humana; merge é ato deliberado, a spec não bloqueia).
- **`resolverOuCriar` concorrente** com os mesmos dados: a criação é protegida por
  unicidade das chaves normalizadas de origem/contato — a 2ª chamada resolve para a
  `pessoa` que a 1ª criou.
- **Desfazer um merge cujo item foi curado depois**: o valor curado atual prevalece; o
  desfazer registra nota de reconciliação (CL-03) — nunca sobrescreve.
- **Desfazer um merge cuja absorvida foi, ela mesma, absorvida por outro merge depois**: a
  absorvida é recriada já `merged` apontando para onde a cadeia atual leva; o desfazer
  registra nota de reconciliação.
- **`pessoa` associada a uma `conta` que depois é `merged`**: `pessoa.conta_id` passa a
  apontar a `conta` sobrevivente (movido com proveniência).
- **Pseudonimização (spec 047) ainda não existe**: `pseudonimizada_em` é sempre `null`;
  nenhum endpoint a preenche.
- **`GET /pessoas` / `GET /contas` sem nada no banco**: lista vazia paginada, não erro.

## Requirements *(mandatory)*

### Functional Requirements

#### Entidade `pessoa` e contatos

- **FR-001**: O sistema MUST modelar **`pessoa`** com: PK UUID v7 gerada na aplicação
  (Padrão Transversal), `tipo` (`FISICA` | `JURIDICA` | `DESCONHECIDO`), `nome`,
  `criado_em`/`atualizado_em` (`timestamptz` UTC), `pseudonimizada_em` nullable (reservado
  spec 047; sempre `null` aqui), `merged_para` nullable, `conta_id` nullable.
- **FR-002**: Uma `pessoa` MUST poder ter **0..N e-mails**, no máximo **um primário**; cada
  secundário MUST registrar o instante em que foi rebaixado. Rotação nunca apaga e-mail.
- **FR-003**: Uma `pessoa` MUST poder ter **0..N telefones** com a mesma regra de primário
  único + secundários datados.
- **FR-004**: Uma `pessoa` MUST poder ter **0..N documentos** (`CPF` | `CNPJ`), guardados
  **só com dígitos**, validados por dígito verificador na entrada. Documento inválido MUST
  ser rejeitado na entrada manual (400) e **ignorado com log** quando vem pela engine.
- **FR-005**: Uma `pessoa` MUST poder ter **0..N endereços** (logradouro, número,
  complemento, bairro, cidade, UF, CEP, país) — sem validação forte de CEP na v1.
- **FR-006**: Cada e-mail/telefone/campo de identidade MUST carregar uma marca **`curado`**
  (booleano) — ligada quando um `PATCH` manual o toca. `resolverOuCriar` MUST NOT
  sobrescrever um campo curado; quando um dado derivado conflita com um primário curado, o
  novo entra como **secundário** e uma **nota de reconciliação** é registrada (Princípio
  VII).
- **FR-007**: A regra "o contato mais recente vira primário, o anterior vira secundário"
  (regra inviolável #10) MUST ser aplicada por `resolverOuCriar` sobre contatos **não
  curados**; o `PATCH` manual aplica a troca explicitamente e marca `curado`.

#### Entidade `conta` (household / empresa)

- **FR-008**: O sistema MUST modelar **`conta`** com: PK UUID v7, `tipo` (`HOUSEHOLD` |
  `EMPRESA`), `nome`, `criado_em`/`atualizado_em`, `merged_para` nullable. Uma `conta`
  agrupa **0..N `pessoa`** via `pessoa.conta_id`.
- **FR-009**: Uma `pessoa` MUST pertencer a **0 ou 1** `conta`. Associar uma `pessoa` que
  já está em outra `conta` MUST responder 409 com a `conta` atual — desassociar é
  pré-requisito explícito.
- **FR-010**: O sistema MUST expor, sob `conta:editar`: `POST /contas` (criar),
  `PATCH /contas/{id}` (renomear / trocar tipo), `POST /contas/{id}/pessoas` (associar) e
  `DELETE /contas/{id}/pessoas/{pessoaId}` (desassociar). Cada operação é auditada.
- **FR-011**: `conta` **não** altera a granularidade de Contrato — que segue
  `(pessoa, produto)` (regra inviolável #3). Esta spec MUST NOT tocar `contrato`.

#### Referências de origem

- **FR-012**: Identificadores de origem do comprador (id de cliente Guru, `customer` Asaas,
  `buyer`/e-mail Hotmart, doc como chave de origem, etc.) MUST viver em `pessoa_origem_ref`
  (`pessoa_id`, `plataforma_origem`, `tipo_ref`, `valor_ref`), muitos-para-um, **nunca**
  como PK de `pessoa` (Princípio I).
- **FR-013**: `pessoa_origem_ref` MUST ter `plataforma_origem` (enum de 7 contas — Padrão
  Transversal) e ser **único** por `(plataforma_origem, tipo_ref, valor_ref)` — a mesma
  chave de origem não pode apontar duas `pessoa`s.
- **FR-014**: Ao unificar duas `pessoa`s, as refs de origem da absorvida MUST passar para a
  sobrevivente sem violar FR-013.

#### Engine de identidade (`resolver_identidade`)

- **FR-015**: O sistema MUST fornecer `resolver_identidade(dados, candidatos) →
  { pessoa_id, confianca, criterio, candidatos[] }` como **função pura e determinística**,
  testável **sem banco** (recebe os candidatos já materializados por quem chama).
- **FR-016**: A engine MUST aplicar os critérios **nesta ordem**: (1) documento (CPF),
  (2) CNPJ, (3) e-mail normalizado, (4) telefone normalizado. Ordem fixa, versionada no
  código.
- **FR-017**: No **primeiro** critério que casa **exatamente uma** `pessoa`, a engine MUST
  resolver: retorna `pessoa_id`, `criterio` e `confianca` (documento/CNPJ → alta; e-mail →
  média; telefone → baixa).
- **FR-018**: Um critério que casa **duas ou mais** `pessoa`s MUST ser **descartado** — a
  engine **não** escolhe candidato, **não** funde — e a resolução segue para o próximo
  (regra inviolável #10).
- **FR-019**: Esgotados os critérios sem casamento único, a engine MUST retornar
  `pessoa_id = null`, `criterio = null` e `candidatos[]` com todas as `pessoa`s que casaram
  algum critério (mesmo os ambíguos).
- **FR-020**: As chaves de dedup MUST ser normalizadas antes da comparação: e-mail
  (_lowercase_, _trim_), telefone (E.164; assume BR na borda se o país não for inferível,
  com log), documento (só dígitos + validação). Chave inválida MUST ser **ignorada** (não
  vira critério), com log — nunca lança exceção.
- **FR-021**: `resolver_identidade` MUST NOT ter efeito colateral (não escreve, não cria
  `pessoa`, não loga em banco) — todo efeito é de `resolverOuCriar`.
- **FR-022**: A resolução MUST seguir `merged_para`: uma chave que casa uma `pessoa`
  `merged` resolve para a **sobrevivente**.

#### `resolverOuCriar` (escrita derivada)

- **FR-023**: O sistema MUST fornecer `resolverOuCriar(dados, { criar: boolean, origem })`
  que: chama `resolver_identidade`; se resolveu, **anexa** refs de origem novas e
  **rotaciona** e-mail/telefone não curados (novo → primário, antigo → secundário); se
  **não** resolveu e `criar = true`, **cria** uma `pessoa` nova com os dados e as refs; se
  `criar = false`, retorna `pessoa_id = null` (venda de afiliada — regra inviolável #8).
- **FR-024**: `resolverOuCriar` MUST ser **idempotente**: repetir a mesma chamada não cria
  `pessoa` nem ref duplicada e não rotaciona um contato que já é primário.
- **FR-025**: `resolverOuCriar` com `criar = true` sob **ambiguidade** MUST criar uma
  `pessoa` nova (nunca fundir as ambíguas) e devolver `candidatos[]` no resultado.
- **FR-026**: Criação concorrente com os mesmos dados MUST ser protegida por unicidade das
  chaves normalizadas (origem/contato) — a 2ª chamada resolve para a `pessoa` da 1ª.
- **FR-027**: `resolverOuCriar` MUST registrar **nota de reconciliação** (não
  `RegistroAuditoria` de curadoria) quando um dado derivado conflita com um campo curado —
  o campo curado permanece.

#### CRUD manual de `pessoa`

- **FR-028**: O sistema MUST expor `POST /pessoas` (sob `pessoa:editar`): exige `nome` e
  **ao menos um** entre documento válido / e-mail / telefone. Passa pela mesma normalização
  e validação da engine.
- **FR-029**: O sistema MUST expor `PATCH /pessoas/{id}` (sob `pessoa:editar`): editar
  `nome`/`tipo`, adicionar/remover e-mails/telefones/documentos/endereços, e **definir o
  primário** de e-mail/telefone. Todo campo tocado fica `curado`; a mudança é auditada com
  _delta_.
- **FR-030**: `POST`/`PATCH` de `pessoa` com um e-mail/telefone/documento que **já pertence
  a outra** `pessoa` MUST responder 409 apontando a `pessoa` existente — **sem** fundir.
- **FR-031**: O sistema MUST NOT expor `DELETE /pessoas/{id}` — exclusão de pessoa é
  **pseudonimização** (spec 047) sobre `pseudonimizada_em`.

#### `merge_pessoa` / `merge_conta` e reversão

- **FR-032**: O sistema MUST expor `POST /pessoas/{sobreviventeId}/merge` (sob
  `pessoa:merge`) e `POST /contas/{sobreviventeId}/merge` (sob `conta:merge`), cada um
  identificando a entidade **absorvida**. O merge move e-mails, telefones, documentos,
  endereços, refs de origem (e, para `conta`, as `pessoa`s membras) para a sobrevivente;
  contatos movidos entram como **secundários** (não promovem sobre o primário da
  sobrevivente).
- **FR-033**: Cada linha movida num merge MUST carregar **proveniência** (`merge_pessoa_id`
  / `merge_conta_id`) para o desfazer poder reverter exatamente aquele merge.
- **FR-034**: Após o merge, a entidade absorvida MUST ficar `merged` com ponteiro
  (`merged_para`) para a sobrevivente; `GET` da absorvida MUST resolver para a sobrevivente
  com indicação explícita — nunca dados órfãos.
- **FR-035**: Todo merge MUST gravar um registro (`merge_pessoa` / `merge_conta`) com:
  sobrevivente, absorvida, autor, instante (`timestamptz` UTC) e **_snapshot_** suficiente
  para reconstruir as duas entidades como estavam (contatos com status primário/secundário
  e marca curado, documentos, endereços, refs, membros).
- **FR-036**: O sistema MUST expor `POST /.../merge/{mergeId}/desfazer` (mesma permissão do
  merge) que, **a qualquer momento e em qualquer ordem** (CL-03), reverte as linhas com a
  proveniência daquele merge e recria a entidade absorvida do _snapshot_, marcando o
  registro `desfeito` (autor + instante).
- **FR-037**: Se uma **edição curada posterior** ou um **merge posterior** já alterou um
  item que o desfazer reverteria, o valor atual **prevalece** e o desfazer registra uma
  **nota de reconciliação** — nunca sobrescreve em silêncio (Princípio VII).
- **FR-038**: Merge inválido MUST falhar sem efeito: `absorvida == sobrevivente` → 400;
  entidade inexistente → 404; entidade já `merged` (qualquer lado) → 409; desfazer de um
  merge já desfeito → 409.
- **FR-039**: `merge_pessoa` / `merge_conta` (e seus _snapshots_ e notas de reconciliação)
  MUST ser **somente-acréscimo** — nunca editados nem apagados — e MUST NOT conter
  segredo/token.
- **FR-040**: O merge MUST ser sempre **explícito** (endpoint) — `resolver_identidade` e
  `resolverOuCriar` **nunca** disparam merge.

#### Endpoints de leitura

- **FR-041**: O sistema MUST expor `GET /pessoas` (sob `pessoa:ver`): lista **paginada**,
  busca única por texto que casa nome, e-mail (primário **ou** secundário), telefone (idem)
  ou documento (com/sem máscara), ordenação estável. Pessoas `merged` omitidas por padrão
  (parâmetro opcional para incluir).
- **FR-042**: O sistema MUST expor `GET /pessoas/{id}` (sob `pessoa:ver`): identidade,
  e-mails (primário + secundários datados + marca curado), telefones (idem), documentos,
  endereços, `pessoa_origem_ref` (plataforma + id), `conta` (se houver) e o **histórico de
  merges** (como sobrevivente ou absorvida, com estado ativo/desfeito e notas).
- **FR-043**: `GET` de uma entidade `merged` MUST responder com a sobrevivente e indicação
  explícita de unificação (para o painel redirecionar com aviso).
- **FR-044**: O sistema MUST expor `GET /contas` (sob `conta:ver`, lista paginada com
  busca por nome) e `GET /contas/{id}` (sob `conta:ver`: dados + `pessoa`s membras +
  histórico de merges).

#### RBAC e catálogo (spec 004)

- **FR-045**: A spec MUST acrescentar ao catálogo de permissões da 004 (`src/auth/rbac/
  catalogo.ts`): recurso `pessoa` — `pessoa:ver`, `pessoa:editar`, `pessoa:merge`; recurso
  `conta` — `conta:ver`, `conta:editar`, `conta:merge`; cada uma com rótulo legível em
  português. O `administrador` de sistema MUST passar a incluí-las automaticamente.
- **FR-046**: Todos os endpoints de `pessoa`/`conta` MUST usar o guard da 004 com a
  permissão adequada. Nenhum MUST ficar `@Public()` nem `@AutenticadoBasta()`.
- **FR-047**: 401 (sem token) e 403 (autenticado sem permissão) MUST permanecer distintos,
  com o corpo genérico da 004 no 403.

#### Auditoria

- **FR-048**: Criação/edição manual de `pessoa`/`conta`, associação/desassociação de
  `pessoa` a `conta`, merge e desfazer-merge MUST gravar um registro na forma canônica
  `RegistroAuditoria` do `core` (spec 002) — quem, quando, entidade, ação, _delta_ — com
  `origem = AJUSTE_MANUAL`. Ações _no-op_ (sem _delta_ real) não geram registro.
- **FR-049**: `resolverOuCriar` chamado internamente (pipeline futuro da 018) **não** grava
  `RegistroAuditoria` por criação derivada — a rastreabilidade vem do `evento_origem` (spec
  006) e das refs de origem. Notas de reconciliação (FR-027/FR-037) são registro próprio,
  somente-acréscimo.

#### Persistência e _boot_

- **FR-050**: `pessoa`, `conta` e tabelas relacionadas (`pessoa_email`, `pessoa_telefone`,
  `pessoa_documento`, `pessoa_endereco`, `pessoa_origem_ref`, `merge_pessoa`, `merge_conta`,
  `nota_reconciliacao`) MUST persistir em **PostgreSQL** via **migração Prisma** — a 2ª
  migração de negócio do projeto. Toda tabela segue os Padrões Transversais: PK `id` UUID
  v7 gerada na aplicação, `criado_em`/`atualizado_em` `timestamptz` UTC, índice por
  `plataforma_origem` onde aplicável.
- **FR-051**: A migração MUST aplicar limpo no _harness_ de teste (schema isolado por
  execução, como 001/004) e MUST NOT exigir _seed_ de dados de negócio (não há `pessoa`
  nem `conta` de sistema).
- **FR-052**: O `clientes` MUST passar a expor seu módulo NestJS real (`ClientesModule`)
  com os _controllers_/serviços de `pessoa` e `conta`, **sem** aumentar `CONTEXT_MODULES`
  (segue 11 — CL-04) e **sem** violar a regra ESLint de fronteira entre contextos (o
  `financeiro`/`crm` consomem `clientes` pela sua API pública/porta, não por import cruzado
  de infra).
- **FR-053**: O _boot_ MUST logar, uma vez, que o contexto `clientes` está ativo e o
  vocabulário de permissões de `pessoa`/`conta` registrado — sem dados sensíveis.

#### Painel — Pessoas e Contas

- **FR-054**: O painel MUST exibir **Pessoas** só para sujeitos com `pessoa:ver` e
  **Contas** só para `conta:ver` (mecanismo `usePermissoesEfetivas` da 004).
- **FR-055**: A lista de Pessoas MUST ter busca por texto (nome / e-mail / telefone /
  documento) e paginação; o detalhe MUST mostrar contatos com primário destacado,
  secundários datados, marca de curado, documentos, endereços, refs de origem (plataforma +
  id), `conta`, e a linha do tempo de merges com notas.
- **FR-056**: Controles de criação/edição/merge MUST aparecer só com a permissão de escrita
  correspondente (`pessoa:editar` / `pessoa:merge` / `conta:editar` / `conta:merge`); sem
  ela, a tela é somente-leitura.
- **FR-057**: Uma resposta **403** em qualquer chamada do painel MUST ser tratada no ponto
  único do `apiFetch` (banner "sem permissão"), **sem** deslogar (403 ≠ 401 — comportamento
  da 004).
- **FR-058**: Abrir uma `pessoa`/`conta` `merged` pelo id antigo MUST redirecionar para a
  sobrevivente com aviso visível "esta pessoa/conta foi unificada".

### Key Entities *(inclui só o que envolve dados)*

- **pessoa**: identidade canônica do comprador (ex-`Cliente`). UUID v7, `tipo`, `nome`,
  `criado_em`/`atualizado_em`, `pseudonimizada_em` (nullable, reservado 047), `merged_para`
  (nullable), `conta_id` (nullable). Dono: contexto `clientes`.
- **conta**: agrupador household / empresa de `pessoa`s. UUID v7, `tipo` (`HOUSEHOLD` |
  `EMPRESA`), `nome`, `merged_para` (nullable). Não afeta a granularidade de Contrato.
- **pessoa_email / pessoa_telefone**: contato da `pessoa`. Valor normalizado, flag
  `primario`, `rebaixado_em` (nullable), flag `curado`. Primário único por `pessoa`.
- **pessoa_documento**: `tipo` (`CPF` | `CNPJ`), valor só-dígitos validado, flag `curado`.
  Único por `(tipo, valor)` no sistema.
- **pessoa_endereco**: endereço postal; sem validação forte de CEP na v1.
- **pessoa_origem_ref**: identificador de origem do comprador. `pessoa_id`,
  `plataforma_origem` (enum 7), `tipo_ref`, `valor_ref`. Único por
  `(plataforma_origem, tipo_ref, valor_ref)`. Nunca PK de `pessoa` (Princípio I).
- **merge_pessoa / merge_conta**: registro de negócio de uma unificação. Sobrevivente,
  absorvida, autor, instante, _snapshot_ pré-merge completo, estado (`ativo` | `desfeito`)
  + autor/instante do desfazer. Cada linha movida referencia o merge por proveniência.
  Somente-acréscimo.
- **nota_reconciliacao**: registrada quando derivação/desfazer encontraria um campo curado
  já divergente. Somente-acréscimo. Consolidação de painel é a spec 053 / 027.
- **Resultado de identidade** (não é tabela): `{ pessoa_id, confianca, criterio,
  candidatos[] }` devolvido por `resolver_identidade`.
- **Registro de auditoria** (forma canônica do `core`, spec 002): grava criação/edição
  manual, associação a `conta`, merge e desfazer. `origem = AJUSTE_MANUAL`.
  Somente-acréscimo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `resolver_identidade` produz o **mesmo** resultado para a mesma entrada em
  **100%** das execuções (determinística, sem efeito colateral) — verificável por
  _property test_ que roda N vezes e compara.
- **SC-002**: Em **100%** dos casos em que um critério casa 2+ `pessoa`s, a engine
  **descarta** o critério e **nunca** retorna um dos candidatos por ele — verificável
  enumerando os 4 critérios com fixtures ambíguas.
- **SC-003**: A ordem documento → CNPJ → e-mail → telefone é respeitada em **100%** dos
  testes: dado match único em documento e outro em telefone para `pessoa`s diferentes, a
  engine resolve **sempre** pela do documento.
- **SC-004**: `resolverOuCriar` é idempotente: repetir a mesma chamada cria **0** `pessoa`/
  ref duplicada e rotaciona **0** contatos já primários — verificável chamando 3× e
  comparando o estado.
- **SC-005**: Um primário **curado** nunca é sobrescrito por `resolverOuCriar` nem por
  desfazer-merge; em **100%** desses conflitos há uma **nota de reconciliação** — verificável
  por teste que provoca cada caminho.
- **SC-006**: Todo merge produz **exatamente um** registro (`merge_pessoa`/`merge_conta`) +
  **exatamente um** registro de auditoria com "quem" e "quando"; todo desfazer restaura o
  estado pré-merge (igualdade dos campos relevantes) das linhas com a proveniência daquele
  merge — verificável por _snapshot test_ com merges encadeados e desfazer fora de ordem.
- **SC-007**: Não há sequência de operações expostas (merge, `resolverOuCriar`, CRUD
  manual, associação a `conta`) que resulte numa chave de contato/documento/origem
  apontando **duas** entidades ativas — verificável por teste que tenta violar cada
  unicidade por todos os endpoints.
- **SC-008**: **0** identificadores de origem aparecem como PK de `pessoa`/`conta` ou de
  qualquer tabela relacionada — verificável por inspeção do schema Prisma (toda PK é
  `@db.Uuid` gerada na app).
- **SC-009**: As partes puras (engine, normalização, validação de documento, cálculo de
  _delta_ e de _snapshot_/reconciliação de merge) rodam **sem banco**; só os testes de
  _endpoint_ e de `resolverOuCriar` tocam Postgres real — disciplina de teste da
  constituição.
- **SC-010**: Todos os endpoints de `pessoa`/`conta` respondem **401** sem token e **403**
  autenticado sem a permissão exigida, em **100%** dos casos — verificável nos três eixos.
- **SC-011**: A suíte e2e das specs 003 e 004 continua **verde sem alteração** e `/health`
  continua afirmando **11** contextos.
- **SC-012**: `conta` **não** altera nenhum Contrato: esta spec não referencia `contrato`
  em código nem migração — verificável por _grep_ do diff e por não haver dependência de
  `contratos` no `ClientesModule`.
- **SC-013**: O painel monta lista/detalhe consumindo só os endpoints de `pessoa`/`conta`
  (zero dado _hardcoded_); um 403 numa chamada **nunca** desloga a sessão — verificável por
  teste de componente.

## Assumptions

- **`conta` modelada por completo nesta spec** (CL-01): entidade + CRUD + associação +
  `merge_conta` reversível. Escopo deliberadamente amplo por pedido do dono do produto; o
  uso concreto (regras de household no CRM/Central) é das specs 010/044. `conta` **não**
  muda o Contrato `(pessoa, produto)` (regra inviolável #3).
- **CRUD manual completo de `pessoa`/`conta`** (CL-02), **sem** `DELETE`. Edição manual
  marca campo `curado`; a precedência curadoria > derivação (Princípio VII) nasce aqui para
  `clientes`. A ingestão (018) alimentará em massa via `resolverOuCriar`.
- **Merge sempre reversível, em qualquer ordem** (CL-03), via proveniência por linha +
  _snapshot_ + notas de reconciliação. Conflitos com curadoria/merge posterior preservam o
  valor atual e alertam.
- **Merge automático interno** (visão, decisão #8 de 2026-09-01) é entregue **como a
  resolução da engine**: casar exatamente uma `pessoa` atribui o comprador a ela, sem criar
  duplicata — logo não há "merge" a fazer. `merge_pessoa` cobre o resíduo (duplicatas que
  já existem). Merge auto-declarado pela aluna (100% humano) é a spec 050.
- **Normalização de e-mail**: _lowercase_ + _trim_, **sem** heurística por provedor (não
  remove `+tag` nem pontos). Dedup de Gmail mais agressivo é mudança futura versionada.
- **Normalização de telefone**: assume BR (`+55`) quando o país não é inferível, **só na
  borda**. Telefone que não normaliza para E.164 não vira critério.
- **`confianca`** é rótulo ordinal (alta/média/baixa por critério), não score numérico
  calibrado — suficiente para o pipeline decidir "resolver vs. revisar".
- **Pseudonimização** (spec 047): só reserva `pseudonimizada_em` e a noção de PII. Nenhum
  fluxo de exclusão.
- **"Fonte de verdade de quem é cliente"** (tem contrato / transação paga) é derivada no
  Financeiro (specs 018/025), **não** aqui. `pessoa` é só identidade + contatos + `conta`.
- **Portas**: nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` (spec
  001), configuráveis por `.env`.
- **`auth`/RBAC da 004** já provê guard, `usePermissoesEfetivas`, tratamento central de 403
  e catálogo extensível — esta spec só adiciona os recursos `pessoa` e `conta`.

## Dependencies

- **Spec 001 (bootstrap)**: módulo `clientes` vazio a preencher, convenções de entidade (PK
  UUID v7 na app, `timestamptz`), _harness_ e2e contra Postgres real, regra ESLint de
  fronteira entre contextos, shell/navegação do frontend.
- **Spec 002 (core value objects)**: `EntidadeId`/`uuidv7()` para as PKs; `parseInstante`/
  `agoraUtc()` para os instantes; `PlataformaOrigem` (enum 7) para `pessoa_origem_ref`;
  `RegistroAuditoria` + `montarRegistroAuditoria` (`origem = AJUSTE_MANUAL`) para a
  auditoria.
- **Spec 003 (auth-servico-jwt)**: `JwtAuthGuard` global; `apiFetch` central do painel.
- **Spec 004 (rbac)**: catálogo extensível (`src/auth/rbac/catalogo.ts`) +
  `assertCatalogoCoerente()`; `PermissionGuard` + `@RequerPermissao`; `usePermissoesEfetivas`
  + tratamento central de 403 no frontend; `RequirePermissao`.
- **Consome desta spec**: **018 (financeiro-transacao-ledger)** chama `resolverOuCriar` na
  etapa 2 do pipeline; **026 (vendas-como-afiliada)** usa `criar = false`; **008 (crm-lead)**
  converte `lead` em `pessoa` pela mesma engine; **010 (crm-pipeline)** e **044 (central-bff)**
  usam `conta`; **todo o CRM e a Central** leem `pessoa`; **047** implementa a
  pseudonimização sobre o espaço reservado aqui; **050** aciona `merge_pessoa` a partir de
  vínculo auto-declarado aprovado; **053** consolida o painel de auditoria/reconciliação.

## Out of Scope

- **Regras de household no CRM/Central** (o que `conta` *significa* para pipeline, 360,
  cobrança conjunta) — specs 010/044. Aqui só a entidade + CRUD + merge.
- **Pipeline de ingestão** que chama `resolverOuCriar` em massa (spec 018) e o
  `evento_origem` (spec 006).
- **`DELETE` / pseudonimização executável** e qualquer fluxo de exclusão (spec 047) — aqui
  só o espaço no modelo.
- **Merge auto-declarado pela aluna** e a fila de revisão 100% humana (spec 050).
- **"Quem é cliente" derivado de Contratos/Transações** (specs 018/025) e qualquer toque em
  `contrato`.
- **Dedup por provedor de e-mail** (normalização Gmail agressiva), _fuzzy matching_ de
  nome, ML de identidade.
- **`lead`** e qualquer entidade de CRM.
- **Score numérico calibrado de `confianca`** — aqui é rótulo ordinal por critério.
- **Endpoint de leitura / painel do log de auditoria e de reconciliação** — esta spec
  **grava**; a visualização consolidada é a spec 053 (e 027 para reconciliação financeira).
