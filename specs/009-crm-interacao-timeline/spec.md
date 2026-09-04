# Feature Specification: Timeline de Interações do CRM — histórico unificado, notas, tags e segmentos

**Feature Branch**: `009-crm-interacao-timeline`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "009 — crm-interacao-timeline: `interacao` (WhatsApp, nota, ligação, ticket, NPS) — timeline unificada por `pessoa`/`lead`. Notas internas, tags/categorização, `tag`/`segmento` (por query salva). Frontend: timeline unificada. Bounded context `crm` (já não-vazio desde a 007/008; `CONTEXT_MODULES` segue 11). Portas: reusar 3001/5174/55432 — nenhuma nova."

## Clarifications

### Session 2026-09-04

- Q: **CL-01** — Como a `interacao` se ancora, e o que acontece com a timeline quando um
  lead é convertido em pessoa (a spec 008 arquiva + vincula o lead, sem migrar dados)? → A:
  **Âncora polimórfica + UNION na leitura.** `interacao` tem `pessoa_id` **XOR** `lead_id`
  (exatamente um, via `CHECK`). A timeline de uma `pessoa` é a **união** das interações
  ancoradas nela **com** as interações dos leads cujo `pessoa_id` aponta para ela
  (`lead.pessoa_id = :pessoaId`). Nenhuma linha de `interacao` é re-apontada na conversão —
  coerente com o "nada migrado fisicamente" da CL-01 da spec 008.
- Q: **CL-02** — Nota interna é entidade própria ou um tipo de `interacao`? → A: **`tipo =
  NOTA` dentro de `interacao`.** Uma tabela só. `tarefa`/`nota` de fluxo de trabalho (agenda,
  checklist, delegação) continuam reservadas para a spec 016 — o que esta spec cobre é a
  nota **de timeline** (registro rápido de contexto), não a tarefa acionável.
- Q: **CL-03** — Escopo do `segmento` (query salva dinâmica, visão 5.2‑E) nesta spec? → A:
  **Query salva declarativa, avaliada _on-read_.** `segmento` guarda nome + um `filtro` jsonb
  validado contra um conjunto **fechado** de campos por `alvo` (`LEAD` ou `PESSOA`); os
  membros são **derivados a cada leitura** (regra 8.2.2 — nunca lista materializada que
  diverge). Sem builder visual (fica para 015/017).
- Q: **CL-04** — `tag` vira entidade de 1ª classe agora, promovendo o `lead.tags: string[]`
  da spec 008? → A: **Sim — `tag` + `tag_associacao` (polimórfica lead\|pessoa\|interacao),
  migrando a 008.** A coluna `lead.tags` (`TEXT[]`) é **removida** nesta migração; os
  endpoints `POST`/`DELETE /crm/leads/{id}/tags` da 008 mantêm o **mesmo contrato externo**
  mas passam a delegar ao novo `TagService` (upsert por slug + associação), auditando como
  antes em `crm_lead_audit`. Não há dado de produção de `lead.tags` ainda (projeto em Fase 1
  — ingestão real só chega na Fase 2), então a migração troca a coluna sem etapa de
  _backfill_.
- Q: **CL-05** — Interações podem ser editadas/removidas, ou são só-acréscimo? → A:
  **Híbrido.** `tipo = NOTA` é editável e removível (_soft-delete_ — `removido_em`) pelo
  autor, ou por quem tem a permissão `interacao:gerir` em nome de outro autor; sempre
  auditado. Interações de **canal** (`WHATSAPP`, `EMAIL`, `LIGACAO`, `TICKET`, `NPS`) são
  **append-only** — nunca `PATCH`/`DELETE`; um registro incorreto se corrige com uma nova
  interação, nunca reescrevendo o histórico real de contato com a aluna.

### Decisões já tomadas nesta spec (padrões razoáveis, sem pergunta)

- **FK cruzando bounded context via Prisma, não via import**: `interacao.pessoa_id` e
  `tag_associacao.pessoa_id` são **FKs reais** para `Pessoa` no `schema.prisma` — mesmo
  precedente já usado por `Lead.responsavelId → Usuario` (004) e `Lead.pessoaId → Pessoa`
  (008). A fronteira do Princípio VI é sobre **import de módulo TypeScript**
  (`src/crm/**` não importa `src/clientes/**`), não sobre o schema Prisma compartilhado —
  por isso **nenhuma porta nova** é necessária no `core` para esta spec.
- **Leitura da timeline não ganha permissão nova**: o acesso deriva da âncora — timeline de
  uma `pessoa` exige `pessoa:ver` (005); timeline de um `lead` segue o escopo de visão
  `lead:ver_todos`/`lead:ver_proprios` já resolvido pela 008. Só a **escrita** de interação
  ganha permissão própria (`interacao:registrar`/`interacao:gerir`), e a leitura/gestão do
  catálogo de `segmento` ganha `segmento:ver`/`segmento:gerir`.
- **`segmento` alvo `PESSOA`**: campos filtráveis ficam limitados ao que já existe (tags,
  data de criação) — sem depender de Contrato/Financeiro, que só chegam na Fase 2.
- **Catálogo de `tag`**: criar uma tag nova continua implícito ao associá-la pela 1ª vez
  (upsert por slug), como já era no `POST /crm/leads/{id}/tags` da 008. `crm_admin:gerir_tags`
  só gate operações administrativas explícitas do catálogo (renomear rótulo/cor, desativar,
  listar o catálogo completo).
- **`DELETE` de `segmento`**: permitido fisicamente — é uma query salva sem histórico
  financeiro nem dependentes (disparos/015 ainda não existe); diferente de `equipe`/
  `integracao` (007), que preservam auditoria de config operacional viva.

## Visão geral

Terceira fatia da **Fase 1 (CRM)**. Fecha o "esboço 5.2‑E" da visão que ainda faltava:
`interacao` (timeline unificada de contato), `tag` (categorização compartilhada) e
`segmento` (lista dinâmica por query salva). Mora no _bounded context_ **`crm`** (já
não-vazio desde a 007/008; `CONTEXT_MODULES` segue **11**).

O que entra:

- **Entidade `interacao`** — registro de um contato com uma `pessoa` **ou** um `lead`
  (âncora polimórfica, exatamente um dos dois — CL-01): `tipo` (`WHATSAPP` | `EMAIL` |
  `LIGACAO` | `TICKET` | `NOTA` | `NPS`), `direcao` (`ENTRADA` | `SAIDA`, aplicável só aos
  tipos de canal — nula em `NOTA`), `conteudo` (texto), `nota_nps` (inteiro 0–10, só em
  `tipo = NPS`), `autor_id?` (FK `usuario` da 004 — nulo quando a mensagem vem da aluna via
  canal externo), `ocorrido_em` (quando o contato de fato aconteceu — pode divergir de
  `criado_em` num lançamento retroativo), e os campos de idempotência de integração
  (`canal_origem?`, `id_externo?`). **Timeline unificada** de uma `pessoa` = interações
  ancoradas nela **∪** interações dos leads convertidos nela (CL-01) — resolvida na leitura,
  nunca copiada.
- **Nota interna como `tipo = NOTA`** (CL-02) — editável/removível pelo autor (ou por quem
  tem `interacao:gerir`); as demais interações são **append-only** (CL-05).
- **`tag`** promovida a entidade de 1ª classe (CL-04): `slug` único, `rotulo`, `cor?`,
  `ativo`. **`tag_associacao`** liga uma `tag` a exatamente um de `lead` \| `pessoa` \|
  `interacao` (polimórfica por 3 FKs nullable com `CHECK` de exclusividade). A spec 008
  (`lead.tags: string[]`) é **migrada** — a coluna some, o contrato REST de tag do lead
  continua idêntico, agora implementado por cima do `TagService` compartilhado.
- **`segmento`** — query salva declarativa (CL-03): `nome`, `alvo` (`LEAD` | `PESSOA`),
  `filtro` (jsonb validado contra um esquema **fechado** por `alvo`). Membros são
  **derivados a cada leitura** (`GET /crm/segmentos/{id}/membros`), respeitando o mesmo
  escopo de visão que a listagem direta de lead/pessoa já aplica — um `segmento` nunca
  amplia o que o sujeito pode ver.
- **Porta in-process** `RegistrarInteracaoService` (idempotente por `(canal_origem,
  id_externo)`) para as specs 011 (WhatsApp) e 012 (chat ao vivo) injetarem; nesta spec só
  o CRUD manual + a porta — nenhum `/webhooks/*`, OAuth ou chamada externa.
- **RBAC** — recurso novo `interacao` (`interacao:registrar`, `interacao:gerir`), recurso
  novo `segmento` (`segmento:ver`, `segmento:gerir`), e **+1** no recurso `crm_admin` da 007:
  `crm_admin:gerir_tags`. As permissões de `pessoa:ver`/`pessoa:editar` (005) e
  `lead:ver_*`/`lead:editar` (008) seguem controlando a leitura/associação de tag e a
  leitura da timeline em cada âncora.
- **Auditoria** — `crm_interacao_audit` (nova, forma canônica do core): escrita em
  `interacao`, `tag_associacao` de `pessoa`/`interacao`, e `segmento`. Escrita de tag em
  `lead` continua em `crm_lead_audit` (contrato da 008 preservado). Escrita no catálogo de
  `tag` (criar/renomear/desativar) vai para `crm_admin_audit` (007), mesmo padrão de
  "esquema administrável" da spec 008.
- **Frontend** — timeline unificada no detalhe de Pessoa e de Lead (`frontend/src/pessoas/`
  ganha uma aba; `frontend/src/leads/` ganha uma aba), composer de nova interação/nota,
  gestão de tags (chip picker) e uma tela nova `frontend/src/segmentos/` (lista + membros).

O sucesso é medido por: a timeline de uma pessoa **nunca** perde uma interação de um lead
convertido nela; `NOTA` é a **única** interação editável/removível — canal é sempre
append-only; um `segmento` **nunca** revela lead/pessoa fora do escopo de visão do sujeito;
a migração de tag da 008 **não** quebra o contrato REST existente; e nenhuma porta de rede
nova é aberta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar interações e ver a timeline unificada de uma pessoa (Priority: P1)

Um atendente com `interacao:registrar` registra uma ligação (`LIGACAO`, `SAIDA`) e uma nota
interna (`NOTA`) no cadastro de uma pessoa. Quem tem `pessoa:ver` abre o detalhe da pessoa e
vê as duas na timeline, em ordem cronológica, junto com qualquer interação que já existia
nos leads que foram convertidos nessa pessoa.

**Why this priority**: é o núcleo da spec — sem o modelo de `interacao` e a timeline
unificada, `tag` e `segmento` não têm sobre o que operar. É o que a Central de Clientes
(spec 044) vai ler.

**Independent Test**: criar uma `pessoa`; `POST /crm/interacoes` com `pessoaId` + `tipo:
LIGACAO`; `POST` de uma `NOTA`; `GET /crm/pessoas/{id}/interacoes` mostra as duas, mais
recente primeiro (ou cronológica — decidir na UI), cada uma com `autor`. Criar um `lead`
separado, registrar uma interação nele, convertê-lo (008) para a mesma pessoa (por e-mail
batendo), e conferir que a interação do lead **aparece** na timeline da pessoa sem ter sido
copiada (`lead_id` continua apontando para a linha original).

**Acceptance Scenarios**:

1. **Given** `interacao:registrar` e uma `pessoa` existente, **When** `POST /crm/interacoes`
   com `{ pessoaId, tipo: "LIGACAO", direcao: "SAIDA", conteudo: "Retorno sobre dúvida do
   curso" }`, **Then** a interação é criada com `ocorrido_em` = agora (se omitido) e
   `autor_id` = sujeito autenticado.
2. **Given** o mesmo sujeito, **When** `POST /crm/interacoes` com `{ pessoaId, tipo: "NOTA",
   conteudo: "Prefere contato à tarde" }`, **Then** a nota é criada sem `direcao` e sem
   `nota_nps`.
3. **Given** uma pessoa com 2 interações diretas e um lead convertido nela com 1 interação
   própria, **When** `GET /crm/pessoas/{id}/interacoes`, **Then** a resposta traz as **3**,
   ordenadas por `ocorrido_em`.
4. **Given** `pessoaId` e `leadId` **ambos** no corpo do `POST`, **Then** 422 (âncora deve
   ser exatamente uma).
5. **Given** nem `pessoaId` nem `leadId` no corpo, **Then** 422.
6. **Given** `tipo: "NPS"` **sem** `nota_nps`, **Then** 422; **When** `nota_nps: 11` (fora de
   0–10), **Then** 422.
7. **Given** um `pessoaId`/`leadId` inexistente, **Then** 404 e nada é criado.

---

### User Story 2 - Nota editável, canal append-only (Priority: P1)

O mesmo atendente edita a própria nota para corrigir um erro de digitação, e depois a
remove. Ao tentar editar a ligação (`tipo = LIGACAO`) registrada antes, o sistema recusa —
canal é histórico de contato real, não se reescreve.

**Why this priority**: P1 junto da US1 — é a regra que impede a timeline de virar um editor
de histórico e preserva a integridade do log de contato com a aluna (CL-05).

**Independent Test**: `PATCH` numa `NOTA` própria → conteúdo muda, `editado_em` preenchido,
1 auditoria; `DELETE` na mesma nota → `removido_em` preenchido, some da timeline padrão,
1 auditoria; `PATCH`/`DELETE` numa interação `LIGACAO`/`WHATSAPP`/`EMAIL`/`TICKET`/`NPS` →
405/409 em 100% das tentativas.

**Acceptance Scenarios**:

1. **Given** uma `NOTA` própria, **When** `PATCH /crm/interacoes/{id}` com novo `conteudo`,
   **Then** o conteúdo muda, `editado_em` é preenchido, e há **1** `crm_interacao_audit`.
2. **Given** a mesma nota, **When** `DELETE /crm/interacoes/{id}`, **Then** `removido_em` é
   preenchido (_soft-delete_), a nota some do `GET` padrão da timeline (mas seguem
   consultável com `?incluirRemovidas=true` para quem tem `interacao:gerir`), e há **1**
   auditoria.
3. **Given** uma `NOTA` de **outro** autor, **When** um sujeito só com `interacao:registrar`
   (sem `interacao:gerir`) tenta `PATCH`/`DELETE`, **Then** 403.
4. **Given** o mesmo caso, **When** um sujeito com `interacao:gerir` tenta, **Then** sucede.
5. **Given** uma interação `tipo != NOTA` (qualquer canal), **When** `PATCH` ou `DELETE` é
   tentado por qualquer sujeito, **Then** 405/409 — nunca sucede, mesmo com
   `interacao:gerir`.
6. **Given** uma nota já removida, **When** `PATCH` é tentado, **Then** 409 (não se edita o
   que já foi removido).

---

### User Story 3 - Escopo de visão da timeline segue a âncora (Priority: P1)

Uma pessoa com `lead:ver_proprios` (sem `lead:ver_todos`) abre a timeline de um lead que não
é dela → nada vê (mesma regra 404/403 da spec 008). Um sujeito sem `pessoa:ver` tenta abrir
a timeline de uma pessoa → 403. Não existe uma permissão de "ver toda interação" que ignore
essas regras.

**Why this priority**: P1 — sem isso, `interacao` vaza dado por uma porta lateral que a spec
008 já tinha fechado para `lead`.

**Independent Test**: repetir os testes de escopo da US2 da spec 008, agora contra
`GET /crm/leads/{id}/interacoes`; e testar `GET /crm/pessoas/{id}/interacoes` com/sem
`pessoa:ver`.

**Acceptance Scenarios**:

1. **Given** sujeito com `lead:ver_proprios` e um lead de outro responsável, **When**
   `GET /crm/leads/{id}/interacoes`, **Then** 404/403 — nenhuma interação vaza.
2. **Given** sujeito **sem** `pessoa:ver`, **When** `GET /crm/pessoas/{id}/interacoes`,
   **Then** 403.
3. **Given** sujeito com `pessoa:ver` mas **sem** `lead:ver_todos`/`lead:ver_proprios`,
   **When** a timeline da pessoa inclui interações de um lead convertido nela, **Then** elas
   **aparecem normalmente** — a regra de escopo de `lead` é sobre acessar o **lead
   diretamente**, não sobre a timeline já consolidada e exposta pela permissão de `pessoa`.
4. **Given** qualquer resposta fora de escopo, **When** recebida, **Then** 404 (nunca revela
   se o id existe fora do escopo, mesma disciplina da 008 FR-011).

---

### User Story 4 - Tags compartilhadas entre lead, pessoa e interação (Priority: P2)

O time marca um lead com a tag `webinar-out` (como já fazia na 008), marca uma pessoa com
`cliente-vip`, e marca uma interação de ticket com `bug-reportado`. As três usam o **mesmo**
catálogo de tags — se `webinar-out` já existe (criada por outro lead), é reaproveitada, não
duplicada.

**Why this priority**: P2 — entrega valor de categorização cruzada (a base do `segmento`),
mas não bloqueia a timeline (US1–US3).

**Independent Test**: `POST /crm/leads/{a}/tags` com `"Webinar Out"` cria a tag
`webinar-out`; `POST /crm/pessoas/{b}/tags` com `"webinar out"` (variação de caixa/espaço)
**reaproveita** a mesma tag (mesmo `id`); `GET /crm/tags` lista 1 entrada com `usos` contado
por tipo; remover a tag do lead não afeta a associação na pessoa.

**Acceptance Scenarios**:

1. **Given** `lead:editar`, **When** `POST /crm/leads/{id}/tags` com `{ tag: "Webinar Out"
   }`, **Then** a tag `webinar-out` é criada (se não existia) e associada; contrato de
   resposta idêntico ao da spec 008.
2. **Given** a tag já existe, **When** `POST /crm/pessoas/{id}/tags` (sob `pessoa:editar`)
   com uma variação de caixa/espaço do mesmo texto, **Then** a **mesma** tag é reaproveitada
   — `GET /crm/tags` continua com 1 linha.
3. **Given** `interacao:registrar`, **When** `POST /crm/interacoes/{id}/tags` com uma tag
   nova, **Then** ela é criada e associada à interação.
4. **Given** uma tag associada a um lead e a uma pessoa, **When**
   `DELETE /crm/leads/{id}/tags/{slug}`, **Then** só a associação do lead some; a da pessoa
   permanece.
5. **Given** `crm_admin:gerir_tags`, **When** `PATCH /crm/admin/tags/{id}` muda `rotulo`/
   `cor`, **Then** o rótulo/cor mudam em toda associação existente (é o mesmo registro), e
   há **1** `crm_admin_audit`.
6. **Given** uma tag em uso, **When** alguém tenta desativá-la (`PATCH ativo:false`) via
   `crm_admin:gerir_tags`, **Then** sucede — desativar não remove associações existentes,
   só impede **novo** uso (`POST` de associação com tag inativa → 422).
7. **Given** um sujeito sem `pessoa:editar`, **When** tenta `POST /crm/pessoas/{id}/tags`,
   **Then** 403.

---

### User Story 5 - Segmento dinâmico por query salva (Priority: P2)

Um gestor com `segmento:gerir` cria um segmento "Leads quentes do webinar de outubro":
`alvo: LEAD`, filtro `{ tags: ["webinar-out"], estagio: ["QUALIFICADO", "NUTRICAO"] }`.
Quem tem `segmento:ver` abre `GET /crm/segmentos/{id}/membros` e vê a lista **atual** —
se um lead sai do estágio ou perde a tag, ele desaparece do segmento na próxima leitura,
sem nenhuma ação manual.

**Why this priority**: P2 — depende de `tag` (US4) para ser útil na prática; alimenta a
015 (disparos) e a 017 (dashboard) mais adiante.

**Independent Test**: criar 3 leads com combinações diferentes de estágio/tag; criar o
segmento; `GET .../membros` retorna só os que casam; mudar o estágio de um deles;
`GET .../membros` de novo reflete a mudança **sem** reprocessamento manual; um sujeito com
`lead:ver_proprios` (não `ver_todos`) chamando o mesmo segmento só vê os membros dentro do
próprio escopo.

**Acceptance Scenarios**:

1. **Given** `segmento:gerir`, **When** `POST /crm/segmentos` com `{ nome, alvo: "LEAD",
   filtro: { tags: ["webinar-out"] } }`, **Then** o segmento é criado.
2. **Given** um filtro com uma chave **fora** do esquema fechado do `alvo` (ex.:
   `valorEstimado` — campo que não existe nesta spec), **When** `POST`/`PATCH`, **Then**
   422.
3. **Given** o segmento criado, **When** `GET /crm/segmentos/{id}/membros`, **Then** só os
   leads que casam o filtro **e** estão no escopo de visão do sujeito (`lead:ver_*`)
   aparecem.
4. **Given** o mesmo segmento, **When** um lead que casava o filtro deixa de casar (ex.: tag
   removida), **Then** a próxima chamada de `.../membros` **não** o inclui mais — nenhum
   estado fica "preso".
5. **Given** `alvo: "PESSOA"`, **When** o filtro usa campos de `LEAD` (ex.: `estagio`),
   **Then** 422 — o esquema de filtro é fechado **por `alvo`**.
6. **Given** um sujeito sem `segmento:ver`, **When** `GET /crm/segmentos*`, **Then** 403.

---

### User Story 6 - Timeline no painel (Priority: P3)

Quem tem `pessoa:ver` ou a visão de lead abre o detalhe e vê a aba **Timeline**: lista
cronológica com ícone por `tipo`, quem registrou, e um composer para nova interação (visível
só com `interacao:registrar`). Notas mostram os botões editar/remover quando aplicável.
Uma tela nova **CRM · Segmentos** (atrás de `segmento:ver`) lista segmentos e abre os
membros; **Novo segmento** só com `segmento:gerir`.

**Why this priority**: P3 — o backend já entrega o valor; a tela torna operável pelo time.

**Independent Test**: logar com `pessoa:ver` + `interacao:registrar` → abrir timeline, criar
nota, editar, remover; logar só com `pessoa:ver` → timeline em modo leitura, sem composer;
logar com `segmento:ver` → ver lista e membros, sem "Novo segmento".

**Acceptance Scenarios**:

1. **Given** `pessoa:ver` sem `interacao:registrar`, **When** abre a timeline, **Then** vê a
   lista sem o composer.
2. **Given** `interacao:registrar`, **When** registra uma interação, **Then** ela aparece no
   topo/fim da lista sem recarregar a página inteira (atualização otimista ou refetch).
3. **Given** `segmento:ver` sem `segmento:gerir`, **When** abre **CRM · Segmentos**, **Then**
   vê lista + membros, sem "Novo segmento" nem editar/excluir.
4. **Given** uma resposta 403 em qualquer chamada da tela, **When** recebida, **Then** banner
   "sem permissão", sessão intacta (403 ≠ 401).

---

### Edge Cases

- **Lead convertido duas vezes na mesma pessoa que outro lead**: a timeline da pessoa soma
  as interações de **todos** os leads cujo `pessoa_id` aponta para ela — sem duplicar (cada
  interação pertence a exatamente um lead).
- **Interação de um lead que nunca converteu**: aparece só na timeline do lead — nunca na de
  nenhuma pessoa (não há `pessoa_id` para ela).
- **`autor_id` de um usuário removido**: a 004 não expõe `DELETE` de usuário; FK
  `onDelete: Restrict` (mesmo padrão do `Lead.responsavelId`).
- **Nota editada por quem não é o autor nem tem `interacao:gerir`**: 403, nada muda.
- **Tentativa de reativar associação de tag já existente** (`POST` da mesma tag 2×):
  idempotente — 2ª chamada é no-op (200, sem duplicar linha em `tag_associacao`, sem
  auditoria nova).
- **`filtro` de segmento com tipo de valor errado** (ex.: `estagio: "QUALIFICADO"` em vez de
  lista): 422 — o schema espera array.
- **Segmento `alvo: PESSOA` filtrando por tag que nunca foi usada em pessoa**: lista vazia,
  nunca erro.
- **`GET` de timeline sem nenhuma interação**: lista vazia paginada, nunca erro.
- **Reentrada da porta `RegistrarInteracaoService`** com a mesma `(canal_origem,
  id_externo)`: devolve a interação existente, sem duplicar, sem nova auditoria.
- **`nota_nps` em `tipo != NPS`**: 422 (campo só faz sentido em `NPS`); mesma regra inversa —
  `NPS` sem `nota_nps` é 422 (FR já cobre).
- **`direcao` em `tipo = NOTA`**: 422 se enviado (não aplicável); em `NPS`, `direcao`
  opcional (uma NPS pode ter sido "enviada" ou não é o foco — aceitar nula ou `SAIDA`).

## Requirements *(mandatory)*

### Functional Requirements

#### Entidade `interacao` e timeline

- **FR-001**: O sistema MUST modelar **`interacao`** com: PK UUID v7 gerada na aplicação;
  `pessoa_id?` (FK `Pessoa`, `onDelete: Restrict`) **XOR** `lead_id?` (FK `Lead`,
  `onDelete: Restrict`) — exatamente um dos dois preenchido, garantido por `CHECK` no banco
  e validado na aplicação; `tipo` (`WHATSAPP`\|`EMAIL`\|`LIGACAO`\|`TICKET`\|`NOTA`\|`NPS`);
  `direcao?` (`ENTRADA`\|`SAIDA`; obrigatório para tipos de canal exceto `NPS`, proibido em
  `NOTA`); `conteudo` (texto, obrigatório); `nota_nps?` (inteiro 0–10, obrigatório sse
  `tipo = NPS`, proibido caso contrário); `autor_id?` (FK `usuario` da 004, `onDelete:
  Restrict`, nulo quando a interação vem de um canal externo sem autor interno); `canal_
  origem?`/`id_externo?` (idempotência de integração); `ocorrido_em` (timestamptz, default
  = `criado_em` se omitido); `editado_em?`; `removido_em?`; `criado_em`/`atualizado_em`.
- **FR-002**: O sistema MUST expor `POST /crm/interacoes` (sob `interacao:registrar`) —
  cria com âncora + tipo + campos do tipo; 422 se `pessoaId`+`leadId` ambos ou nenhum
  presentes, se `direcao`/`nota_nps` violarem a regra do `tipo`, ou se `nota_nps` fora de
  0–10; 404 se a âncora referenciada não existe.
- **FR-003**: O sistema MUST expor `GET /crm/pessoas/{pessoaId}/interacoes` e
  `GET /crm/leads/{leadId}/interacoes` (paginados, filtráveis por `tipo`/período), cada um
  autorizado pela permissão da **âncora** (`pessoa:ver` / escopo de `lead:ver_*` da 008) —
  **sem** permissão nova de leitura de interação.
- **FR-004**: A timeline de uma `pessoa` MUST ser a **união**, ordenada por `ocorrido_em`,
  de: (a) interações com `pessoa_id = :id`; (b) interações com `lead_id` em
  `{ id : lead.pessoa_id = :id }`. Nenhuma linha MUST ser copiada ou re-apontada — a união é
  resolvida na leitura (CL-01).
- **FR-005**: `GET /crm/interacoes/{id}` MUST aplicar a mesma checagem de escopo da âncora
  da interação (pessoa ou lead); fora do escopo → 404.
- **FR-006**: O sistema MUST NOT expor um `GET` "todas as interações" sem âncora — toda
  leitura exige `pessoaId` ou `leadId` (evita um caminho que ignore o escopo por âncora).

#### Mutabilidade (CL-05)

- **FR-007**: `PATCH /crm/interacoes/{id}` (edição de `conteudo`) e
  `DELETE /crm/interacoes/{id}` (_soft-delete_, seta `removido_em`) MUST ser permitidos
  **somente** para `tipo = NOTA`; em qualquer outro `tipo`, ambos MUST responder 405 ou 409.
- **FR-008**: `PATCH`/`DELETE` numa `NOTA` MUST exigir: o sujeito é o `autor_id` **com**
  `interacao:registrar`, **ou** o sujeito tem `interacao:gerir` (independente de autoria).
  Sem nenhuma das duas condições → 403.
- **FR-009**: `PATCH`/`DELETE` numa `NOTA` já com `removido_em` preenchido MUST responder
  409 (não se edita/remove o que já foi removido).
- **FR-010**: `DELETE` MUST ser _soft_ — a linha permanece no banco; a timeline padrão MUST
  excluir notas removidas; `GET` com `?incluirRemovidas=true` (sob `interacao:gerir`) PODE
  incluí-las para auditoria/suporte.

#### Porta in-process

- **FR-011**: O sistema MUST exportar `RegistrarInteracaoService` (idempotente por
  `(canal_origem, id_externo)` quando ambos presentes) para as specs 011/012 injetarem.
  Reentrada com a mesma chave MUST devolver a interação existente, sem duplicar, sem nova
  auditoria.
- **FR-012**: Nesta spec **nenhum** endpoint `/webhooks/*`, chamada HTTP externa, OAuth ou
  polling MUST ser adicionado — só a porta e o CRUD REST manual.

#### `tag` e `tag_associacao` (CL-04 — migração da spec 008)

- **FR-013**: O sistema MUST modelar **`tag`**: PK UUID v7; `slug` (único, gerado por
  normalização — `trim`, `lowercase`, espaço interno → `-` — mesma função da 008); `rotulo`
  (texto de exibição, pode ter caixa/acentuação); `cor?`; `ativo` (default `true`);
  `criado_em`/`atualizado_em`.
- **FR-014**: O sistema MUST modelar **`tag_associacao`**: PK UUID v7; `tag_id` (FK `Tag`);
  `lead_id?`/`pessoa_id?`/`interacao_id?` (exatamente um preenchido, `CHECK` +
  `@@unique` parcial por par não-nulo — evita duplicar a mesma tag na mesma entidade);
  `criado_por?` (FK `usuario`); `criado_em`.
- **FR-015**: Associar uma tag por **texto** (não por id) MUST fazer _upsert_ por `slug`:
  se a tag já existe (mesmo slug normalizado), reaproveita; senão, cria. Associar uma tag
  **inativa** por id/slug explícito MUST ser 422.
- **FR-016**: Associar uma tag já associada à mesma entidade (mesmo `tag_id` + mesma âncora)
  MUST ser **idempotente** — no-op, sem duplicar linha, sem auditoria nova.
- **FR-017**: O sistema MUST expor, preservando o contrato externo da spec 008:
  `POST`/`DELETE /crm/leads/{id}/tags` sob `lead:editar` (audita em `crm_lead_audit`, como
  antes). MUST acrescentar: `POST`/`DELETE /crm/pessoas/{id}/tags` sob `pessoa:editar` e
  `POST`/`DELETE /crm/interacoes/{id}/tags` sob `interacao:registrar` (ambos auditam em
  `crm_interacao_audit`).
- **FR-018**: O sistema MUST expor `GET /crm/tags` (catálogo completo, `@AutenticadoBasta()`
  — leitura sem PII, só nome/cor/contagem de uso por tipo de âncora) e, sob
  `crm_admin:gerir_tags`: `POST /crm/admin/tags` (criar explicitamente), `PATCH
  /crm/admin/tags/{id}` (`rotulo`/`cor`/`ativo`; `slug` imutável). Toda escrita audita em
  `crm_admin_audit` (007).
- **FR-019**: A **6ª migração de negócio** (spec 008, tabela `lead`) MUST ser alterada por
  esta migração nova: a coluna `lead.tags` (`TEXT[]`) MUST ser **removida**; os dados
  existentes MUST NOT precisar de _backfill_ (sem dado de produção nesta fase do projeto —
  Assumption).

#### `segmento` (CL-03 — query salva)

- **FR-020**: O sistema MUST modelar **`segmento`**: PK UUID v7; `nome`; `descricao?`;
  `alvo` (`LEAD`\|`PESSOA`); `filtro` (jsonb); `ativo` (default `true`); `criado_por` (FK
  `usuario`); `criado_em`/`atualizado_em`.
- **FR-021**: `filtro` MUST ser validado contra um **esquema fechado por `alvo`**: para
  `LEAD` — `estagio?: LeadEstagio[]`, `status?: LeadStatus[]`, `origem?: string[]`,
  `tags?: string[]` (slugs), `responsavelId?: uuid[]`, `campoPersonalizado?: {chave,
  valor}[]`, `criadoDe?`/`criadoAte?: datetime`; para `PESSOA` — `tags?: string[]`,
  `criadoDe?`/`criadoAte?: datetime`. Uma chave fora do esquema do `alvo` (ou de outro
  `alvo`) MUST ser 422.
- **FR-022**: O sistema MUST expor, sob `segmento:gerir`: `POST`/`PATCH`/`DELETE
  /crm/segmentos`; sob `segmento:ver`: `GET /crm/segmentos`, `GET /crm/segmentos/{id}`,
  `GET /crm/segmentos/{id}/membros` (paginado).
- **FR-023**: `GET /crm/segmentos/{id}/membros` MUST traduzir `filtro` numa consulta
  **derivada** (nunca lista materializada persistida) sobre `lead` ou `pessoa`, aplicando
  **também** o escopo de visão do sujeito (`lead:ver_todos`/`ver_proprios` quando
  `alvo=LEAD`; `pessoa:ver` quando `alvo=PESSOA`) — um segmento **nunca** amplia o que o
  sujeito já pode ver.
- **FR-024**: A tradução do `filtro` para consulta (a parte pura — validação de esquema +
  montagem da condição) MUST ser testável **sem banco**; só a execução final MUST tocar
  Postgres.
- **FR-025**: `DELETE /crm/segmentos/{id}` MUST ser físico (sem dependentes nesta fase).

#### Auditoria

- **FR-026**: Toda escrita bem-sucedida em `interacao` (criação, edição de `NOTA`, remoção
  de `NOTA`) MUST gravar **um** registro em **`crm_interacao_audit`** na forma canônica
  `RegistroAuditoria` do core (`montarRegistroAuditoria`, `origem = AJUSTE_MANUAL`): autor,
  instante, entidade, ação, _delta_ real.
- **FR-027**: Toda escrita de `tag_associacao` em `pessoa` ou `interacao` MUST auditar em
  `crm_interacao_audit`; em `lead`, continua em `crm_lead_audit` (contrato 008); escrita no
  catálogo de `tag` (criar/renomear/desativar) e em `segmento` MUST auditar em
  `crm_admin_audit`.
- **FR-028**: Uma requisição sem mudança efetiva (`calcularDelta → null`, ex.: associar tag
  já associada, `PATCH` de segmento com corpo idêntico) MUST NOT gravar registro.
- **FR-029**: `crm_interacao_audit` MUST ser **somente-acréscimo** — sem `UPDATE`/`DELETE`
  de linha de auditoria.

#### RBAC e catálogo (spec 004)

- **FR-030**: O sistema MUST acrescentar ao catálogo (`src/auth/rbac/catalogo.ts`) os
  recursos novos **`interacao`** (`interacao:registrar`, `interacao:gerir`), **`segmento`**
  (`segmento:ver`, `segmento:gerir`), e **+1** no recurso `crm_admin` (007):
  `crm_admin:gerir_tags`. `assertCatalogoCoerente()` MUST continuar passando; o
  `administrador` e a credencial de serviço concedem todas de graça (special-case da 004,
  **sem** migração de dados nem seed).
- **FR-031**: Todos os endpoints novos MUST usar o `PermissionGuard` da 004 com a permissão
  adequada; nenhum MUST ser `@Public()`. `GET /crm/tags` MUST ser `@AutenticadoBasta()`
  (catálogo sem PII, útil para picker de UI de qualquer sujeito autenticado).
- **FR-032**: 401 e 403 MUST permanecer distintos, corpo genérico no 403 (padrão 004).

#### Persistência e boot

- **FR-033**: `interacao`, `tag`, `tag_associacao`, `segmento`, `crm_interacao_audit` MUST
  persistir via **migração Prisma** — a **7ª migração de negócio** do projeto (a mesma
  migração remove `lead.tags` — FR-019). Toda tabela nova segue os Padrões Transversais: PK
  `id` UUID v7 na aplicação, `criado_em`/`atualizado_em` `timestamptz` UTC onde aplicável.
- **FR-034**: A migração MUST aplicar limpo no _harness_ de teste (schema isolado por
  execução) e MUST NOT exigir _seed_ de dados de negócio.
- **FR-035**: O `crm` MUST continuar expondo um único `CrmModule`, **sem** aumentar
  `CONTEXT_MODULES` (segue **11**) e **sem** import de `src/clientes/**` em `src/crm/**`
  (as FKs cruzando contexto vivem só no `schema.prisma` compartilhado — ver "Decisões já
  tomadas"). `import/no-restricted-paths` MUST continuar verde.
- **FR-036**: Nenhuma **porta de rede nova** MUST ser aberta — backend `3001`, frontend
  `5174`, Postgres dev `55432`, todos configuráveis por `.env`.

#### Painel — Timeline e Segmentos

- **FR-037**: O detalhe de **Pessoas** (005) e de **Leads** (008) MUST ganhar uma aba
  **Timeline** consumindo `GET .../interacoes`, com composer de nova interação visível só
  com `interacao:registrar`; editar/remover nota visível só quando FR-008 permite.
  Interações vinculadas a leads convertidos aparecem com uma marca discreta indicando a
  origem (lead) sem exigir navegação extra.
- **FR-038**: O sistema MUST introduzir **CRM · Segmentos** (`frontend/src/segmentos/`)
  atrás de `segmento:ver`, rota sob `RequirePermissao`: lista de segmentos + tela de membros
  (reaproveita a lista de leads/pessoas conforme o `alvo`); **Novo segmento**/editar/excluir
  só com `segmento:gerir`.
- **FR-039**: A gestão de tags (chip picker: adicionar/remover, criar nova por texto) MUST
  aparecer nas telas de Pessoa, Lead e no detalhe de uma interação, condicionada à permissão
  de edição de cada âncora (`pessoa:editar`/`lead:editar`/`interacao:registrar`).
- **FR-040**: Uma resposta **403** em qualquer chamada dessas telas MUST ser tratada no
  ponto único do `apiFetch` (banner "sem permissão"), sem deslogar.

### Key Entities *(inclui só o que envolve dados)*

- **interacao**: registro de contato (canal ou nota interna), ancorado em `pessoa` **XOR**
  `lead`. `tipo`, `direcao?`, `conteudo`, `nota_nps?`, `autor_id?`, `ocorrido_em`,
  `editado_em?`, `removido_em?`. Só `NOTA` é editável/removível; o resto é append-only.
- **tag**: `slug` único, `rotulo`, `cor?`, `ativo`. Catálogo compartilhado entre lead,
  pessoa e interação.
- **tag_associacao**: liga uma `tag` a exatamente um de `lead`\|`pessoa`\|`interacao`.
  `@@unique` parcial por par não-nulo — sem duplicar a mesma tag na mesma entidade.
- **segmento**: query salva declarativa (`alvo` + `filtro` jsonb validado por esquema
  fechado). Membros são sempre **derivados**, nunca uma lista persistida.
- **crm_interacao_audit**: registro de auditoria da forma canônica do core, cobrindo
  `interacao`, `tag_associacao` (pessoa/interacao) e `segmento`. Somente-acréscimo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A timeline de uma `pessoa` inclui **100%** das interações ancoradas nela mais
  as de todo lead convertido nela, e **0%** de duplicação — verificável por contagem
  antes/depois de uma conversão de lead com interações prévias.
- **SC-002**: **0** `PATCH`/`DELETE` bem-sucedidos em interação com `tipo != NOTA`, em
  **100%** das tentativas, para qualquer permissão — verificável por matriz de tipo ×
  permissão.
- **SC-003**: Um sujeito com só `lead:ver_proprios` ou sem `pessoa:ver` recebe **0**
  interações fora do próprio escopo, nos três eixos (lista/detalhe/segmento) — mesma
  disciplina de vazamento zero da spec 008 (SC-003).
- **SC-004**: A migração de `lead.tags` (008) para `tag`/`tag_associacao` preserva o
  contrato REST de `POST`/`DELETE /crm/leads/{id}/tags` — a suíte e2e da 008 (regressão)
  continua **verde sem alterar as asserções de contrato**, só a implementação por trás.
- **SC-005**: Associar a mesma tag (por texto, variações de caixa/espaço) 2× na mesma
  entidade produz **1** linha em `tag_associacao`, **0** tags duplicadas em `tag` —
  verificável por _property test_ de normalização + contagem.
- **SC-006**: `GET /crm/segmentos/{id}/membros` reflete o estado **atual** em **100%** das
  leituras — sem estado "preso": alterar um atributo que sai do filtro remove o membro na
  próxima leitura, sem ação manual — verificável por sequência muda-atributo → relê.
- **SC-007**: **0** endpoints novos acessíveis sem token (401) ou sem a permissão exigida
  (403), em **100%** dos casos.
- **SC-008**: As partes puras (validação de âncora, regra de mutabilidade por `tipo`,
  normalização de tag, validação de esquema de `filtro`) rodam **sem banco**; só testes de
  _endpoint_ tocam Postgres real.
- **SC-009**: A suíte e2e das specs 003–008 continua **verde** e `/health` continua
  afirmando **11** contextos.
- **SC-010**: **0** imports de `src/clientes/**` em `src/crm/**` — verificável por ESLint +
  `grep`, mesma disciplina da SC-005 da spec 008.
- **SC-011**: **0** dependências novas (backend e frontend) e **exatamente 1** migração
  Prisma nova (a 7ª) — verificável por _diff_ de `package.json` e da pasta
  `prisma/migrations`.
- **SC-012**: O catálogo de RBAC ganha **exatamente 5** permissões novas
  (`interacao:registrar`, `interacao:gerir`, `segmento:ver`, `segmento:gerir`,
  `crm_admin:gerir_tags`); `assertCatalogoCoerente()` passa; `administrador`/credencial de
  serviço as concedem sem migração de dados.

## Assumptions

- **Sem dado de produção de `lead.tags`**: a migração desta spec remove a coluna
  diretamente (FR-019) — a ingestão real de dados só chega na Fase 2/3 do projeto.
- **`tarefa`/`nota` de fluxo de trabalho** (agenda, checklist, delegação, lembrete) são a
  spec 016 — a `NOTA` desta spec é só um registro rápido na timeline, sem os recursos de
  tarefa acionável.
- **`oportunidade`/`pipeline`** (spec 010) não existem ainda — `interacao` não se ancora em
  oportunidade nesta v1; se necessário, a 010 estende.
- **WhatsApp/chat real** (specs 011/012) ainda não existem — a porta `RegistrarInteracaoService`
  existe para elas injetarem; nada de integração real aqui.
- **FAQ/IA** (spec 013) não toca esta spec — `sugestao_ia` é entidade própria de spec
  futura, sem relação com `interacao` aqui.
- **`segmento` de `alvo = PESSOA`** fica deliberadamente limitado a `tags`/data de criação —
  sem Contrato/estado de acesso (Financeiro só chega na Fase 2). Uma spec futura pode
  estender o esquema de filtro.
- **FK cruzando bounded context via Prisma**: mesmo precedente de `Lead.pessoaId`/
  `Lead.responsavelId` (008/004) — a fronteira do Princípio VI é sobre import de módulo
  TypeScript, não sobre o `schema.prisma` compartilhado.
- **Portas**: nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432`,
  configuráveis por `.env`.
- **`CONTEXT_MODULES` segue 11** — o `crm` já existe (007/008); esta spec só adiciona
  entidades.

## Dependencies

- **Spec 001 (bootstrap)**: módulo `crm`; convenções de entidade; _harness_ e2e; regra
  ESLint de fronteira; shell/navegação do frontend.
- **Spec 002 (core)**: `EntidadeId`/`uuidv7()`; `agoraUtc()`/`parseInstante`;
  `RegistroAuditoria` + `montarRegistroAuditoria` + `calcularDelta` para
  `crm_interacao_audit`.
- **Spec 003 (auth)**: `JwtAuthGuard`; identificador da credencial de serviço como autor de
  auditoria; `apiFetch` central.
- **Spec 004 (rbac)**: `PermissionGuard` + `@RequerPermissao`/`@AutenticadoBasta`; tabela
  `usuario` (FK `autor_id`/`criado_por`); `usePermissoesEfetivas` + `RequirePermissao`.
- **Spec 005 (pessoa-identidade-dedup)**: `pessoa` como âncora de `interacao`/tag/segmento;
  permissão `pessoa:ver`/`pessoa:editar`; tela de detalhe ganha a aba Timeline.
- **Spec 007 (crm-administracao)**: `crm_admin_audit` (recebe escrita de catálogo de tag);
  recurso `crm_admin` do catálogo (esta spec adiciona `crm_admin:gerir_tags`).
- **Spec 008 (crm-lead)**: `lead` como âncora; `lead.pessoa_id` para a união da timeline
  (CL-01); escopo de visão `lead:ver_todos`/`ver_proprios` reusado para `interacao` e
  `segmento` de `alvo=LEAD`; **esta spec migra** `lead.tags` para `tag`/`tag_associacao`
  preservando o contrato REST.
- **Consome desta spec**: **010 (crm-pipeline)** pode ancorar automações em interação/tag;
  **011 (whatsapp)**/**012 (chat)** injetam `RegistrarInteracaoService`; **015 (disparos)**
  e **017 (dashboard)** consomem `segmento`; **044 (central-bff-360)** lê a timeline
  unificada; **053** consolida `crm_interacao_audit`.

## Out of Scope

- **WhatsApp/chat real, templates, janela de 24h, opt-out** — specs 011/012.
- **Pipeline/oportunidade** — spec 010; `interacao` não se ancora em oportunidade nesta v1.
- **Tarefas/agenda/checklist** — spec 016.
- **FAQ e sugestão de IA** — spec 013.
- **Disparos em massa usando `segmento`** — spec 015; aqui só a leitura de membros.
- **Builder visual de filtro de segmento** — UI é formulário estruturado simples nesta v1;
  editor visual fica para spec posterior.
- **Segmento de `alvo=PESSOA` filtrando por Contrato/Financeiro** — Fase 2 do projeto.
- **Perfis, permissões e o guard de RBAC** — spec 004; esta spec só consome/estende o
  catálogo.
