# Research — 010-crm-pipeline

Sem `NEEDS CLARIFICATION` pendente no Technical Context (spec já resolveu D-01..D-06 como
defaults documentados). Este documento cobre as escolhas técnicas que a spec não fixa.

## Drag-and-drop do board Kanban

- **Decision**: HTML5 drag-and-drop nativo (`draggable`, `onDragStart`/`onDragOver`/
  `onDrop`) implementado à mão em `kanban-board.tsx`.
- **Rationale**: o board tem um requisito simples — arrastar 1 card entre colunas de 1
  lista, sem reordenação dentro da coluna, sem multi-seleção, sem virtualização. HTML5 DnD
  nativo cobre isso com ~40 linhas, sem dependência nova (mesma disciplina "0 dep nova" das
  specs 007–009) e sem custo de bundle. Suporte a mouse é suficiente para o público interno
  (equipe comercial em desktop); touch não é requisito da spec.
- **Alternatives considered**:
  - `@hello-pangea/dnd` (fork mantido do `react-beautiful-dnd`) — melhor acessibilidade
    (teclado) e suporte a touch, mas é dependência nova só para uma interação de 1 card por
    vez; reavaliar se uma spec futura (017 — dashboard, ou feedback de uso real) pedir
    reordenação dentro da coluna ou suporte a touch.
  - `@dnd-kit/core` — mais moderno, mas mesmo trade-off de dependência nova para o escopo
    atual.
  - Sem drag-and-drop (só botão "mover para..."): rejeitado — a spec pede board Kanban
    explicitamente (US7), e arrastar é a interação esperada de um Kanban.

## Persistência de `Dinheiro` no Prisma

- **Decision**: duas colunas por quantia — `<campo>_int BigInt` (`@db.BigInt` é o default do
  Prisma para `BigInt`) + `<campo>_moeda String @db.Char(3)`. Mapeamento na borda
  (service): `Dinheiro.deInteiroEscalado(row.valorEstimadoInt, row.valorEstimadoMoeda)` na
  leitura, `.valorInt`/`.moeda` na escrita.
- **Rationale**: é a forma mais direta de respeitar "Dinheiro nunca float, moeda nunca
  opcional" sem introduzir um tipo composto Postgres (que Prisma não modela nativamente) ou
  um campo Json (perderia índice/tipo). `BigInt` do Prisma mapeia para `bigint` do Postgres
  e para `bigint` do JS/TS — mesmo tipo do `Dinheiro.valorInt`.
- **Alternatives considered**: coluna `Decimal` do Postgres via `Prisma.Decimal` — rejeitada
  porque o core já decidiu (spec 002) que a representação canônica é `bigint` escala ×10000,
  não decimal; introduzir `Decimal` no schema criaria 2 representações de dinheiro no
  projeto. Campo `Json` (`{valorInt, moeda}`) — rejeitado por perder tipagem de coluna e
  dificultar `groupBy`/agregação SQL nas métricas (FR-021).

## Atribuição round-robin determinística sem contador externo (Redis etc.)

- **Decision**: `pipeline.ultimoAtribuidoUsuarioId?` (nullable) guarda o último usuário
  escolhido; a função pura `atribuicao.ts` recebe a lista de membros ativos (ordenada por
  `entrouEm`) + esse cursor e devolve o próximo da lista (ou o primeiro, se o cursor não
  está mais na lista — ex.: membro saiu). O service persiste o novo cursor na mesma
  transação da criação da oportunidade.
- **Rationale**: sem infraestrutura nova (Redis/fila) — mesma disciplina "0 dep nova"; o
  cursor é um dado de configuração do pipeline (curado), não uma métrica agregada, então
  não conflita com o Princípio V (agregados derivados) — é estado de rotação explícito,
  documentado como tal.
- **Alternatives considered**: calcular "próximo" por `count() % tamanho` a cada chamada
  (sem cursor persistido) — rejeitado porque a ordem depende da ordem de chegada das
  oportunidades, que dois requests concorrentes podem embaralhar sem uma trava; o cursor
  explícito é mais previsível e testável como função pura.

## Cálculo de "esfriando" sem duplicar dado de contato

- **Decision**: `esfriando.ts` recebe `agora`, `pipeline.diasEsfriando`, e a data da
  `interacao` mais recente da âncora (ou `null`) — a query busca só
  `interacao.ocorridoEm` mais recente via `orderBy: {ocorridoEm: 'desc'}, take: 1` nos
  índices já existentes de `interacao(pessoaId, ocorridoEm)`/`(leadId, ocorridoEm)` (spec
  009).
- **Rationale**: reusa a tabela existente sem duplicar "última interação" como coluna
  denormalizada em `oportunidade` (que divergiria — regra 8.2.2). O custo de uma query
  extra por oportunidade lida é aceitável no volume do MVP (comercial interno, não é
  endpoint de alto tráfego); se o board precisar listar muitas oportunidades de uma vez,
  o service resolve em lote (`groupBy` por âncora) — documentado em `data-model.md`.
- **Alternatives considered**: coluna `ultima_interacao_em` denormalizada em `oportunidade`
  atualizada por trigger/hook — rejeitada por violar a regra "curadoria e derivação nunca se
  sobrescrevem" da constituição (a coluna divergiria de `interacao` em qualquer caminho que
  esqueça de atualizá-la) e por antecipar uma otimização sem medição de necessidade.
