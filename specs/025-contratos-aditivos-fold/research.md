# Research: Contratos · Aditivos · Fold

## R1 — Onde mora "status derivado que depende do tempo"

**Decisão**: `status_canonico`/`acesso_liberado` do `Contrato` NÃO são colunas persistidas.
São calculados em toda leitura por uma função pura `statusDoContrato(fimAcesso,
toleranciaAtrasoDias, ajusteManual, agora)`.

**Racional**: um contrato cujo `fim_acesso` já passou, mas que nunca recebe outra transação,
teria um status "congelado" para sempre se fosse persistido só na hora do fold (que só roda
quando uma transação nova chega). Os próprios comentários do `core`
(`status-transacao.ts`/`status-contrato.ts`) já apontam essa decisão para esta spec: "a
eventual tolerância... é decisão de **leitura** do contexto `contratos`".

**Alternativas rejeitadas**: (a) job periódico que recalcula todos os contratos — rejeitado
por Princípio VIII (nenhum job novo, e o problema não precisa de um: é puramente uma função do
relógio, calculável sob demanda, sem custo); (b) persistir e reprocessar por gatilho de tempo
— mesma objeção.

## R2 — Regra Inviolável nº 13 vs. padrão de precedência "curado > derivado"

O padrão das specs 007/023 ("curadoria nunca é sobrescrita por derivação") **não** se aplica
ao ajuste manual de status do Contrato — a visão já confirmou o oposto para este caso
específico (Parte 3, regra 13). Ver spec.md CL-01 para a mecânica exata (override limpo no
próximo fold, mas a auditoria permanece).

## R3 — Ordem real de execução das etapas 4/5/6 dentro de uma passada

Lido `backend/src/ingestao/application/worker.service.ts::processarEvento`: o laço interno
(até `TETO_ITERACOES = 10`) escolhe, a cada iteração, a próxima etapa elegível segundo
`planejarPassada` + a ordem de `ETAPAS_DO_WORKER` (que preserva a ordem de declaração em
`etapas.ts`: `RESOLVER_VINCULO(4)`, `RESOLVER_OFERTA(5)`, `PROJETAR_CONTRATO(6)`). Como as 3
só dependem de `UPSERT_TRANSACAO(3)` (já `ok`), todas ficam elegíveis na mesma passada e são
executadas em sequência **nesta ordem** dentro da mesma chamada — ou seja, na prática
`RESOLVER_OFERTA` sempre roda antes de `PROJETAR_CONTRATO` para o mesmo evento. Mesmo assim, o
executor da etapa 6 não presume isso (edge case: reprocesso manual de uma etapa isolada via
correção de dados) — trata `oferta_id` ausente marcando revisão, nunca lança exceção.

## R4 — Onde fica o "tempo de acesso"

`oferta_catalogo.tempo_acesso_dias` (`Int?`, spec 023) — curado, sem fallback. Ausente →
aditivo marcado para revisão, `fim_acesso` não avança para aquele aditivo específico (mas o
contrato e os demais aditivos continuam existindo/atualizando normalmente).

## R5 — `ticket_total`/`valor_recebido` como `Json`, não tabela por moeda

**Decisão**: 2 colunas `Json` no `Contrato` (`ticket_total`, `valor_recebido`), forma
`Record<moeda, string>` (bigint serializado como string, mesmo padrão de `DinheiroSerializado`
do `core` usado pela API de `transacao`/018). Recalculadas por completo a cada fold (nunca
`+=`).

**Alternativas rejeitadas**: tabela `contrato_valor(contrato_id, tipo, moeda, valor_int)` —
mais "correta" relacionalmente, mas nenhuma necessidade real ainda (nenhum outro contexto
faz `JOIN`/agregação sobre esses valores) e adiciona uma tabela + N `DELETE`+`INSERT` a cada
fold só para guardar o que 1 `UPDATE` de uma coluna `Json` já resolve. Revisitável se uma spec
futura precisar consultar por moeda diretamente no banco.

## R6 — Filtro de `status` em `GET /contratos` sem tabela de rollup

**Decisão**: a mesma função pura de derivação de status é espelhada como `CASE` SQL
(`Prisma.sql`, parametrizado) no repositório, e uma suíte de testes garante paridade entre a
função TS e o SQL (mesmo padrão "paridade travada por teste" da spec 018 para o enum de
status). Permite filtrar/paginar no banco sem carregar todos os contratos em memória.

## R7 — Rótulo do aditivo (`AditivoRotulo`)

5 valores: `COMPRA_INICIAL`, `RENOVACAO`, `PRORROGACAO`, `REEMBOLSO`, `SEM_EFEITO`. Só os 2
centrais (`RENOVACAO`/`PRORROGACAO`) vêm da visão (Parte 7, item 1); os outros 3 são extensões
pragmáticas documentadas no spec (CL-03) para cobrir os casos que a regra de negócio não
precisou nomear (1ª compra, reembolso, tentativa sem efeito). Sem custo de migração para
renomear depois.
