# Research: Vínculo Asaas↔Guru (pipeline etapa 4)

Nenhum `NEEDS CLARIFICATION` técnico restou depois das 3 decisões de negócio (CL-01/02/03,
resolvidas com o dono do produto em 2026-09-11 — ver spec.md). As decisões técnicas abaixo
seguem exclusivamente precedente já estabelecido nas specs 006/018/020/021/023.

## D-01 — Onde persistir a referência externa crua

**Decisão**: adicionar `transacao.referencia_externa_id_origem` (String?, cru — o
`payment.externalReference` da Asaas), gravado no `UPSERT_TRANSACAO` (etapa 3, já
implementada pela spec 018) sempre que `EventoCanonico.referenciaExterna.idOrigem` estiver
presente — independente de plataforma (a coluna fica `null` para todas as outras).

**Rationale**: a etapa 4 precisa reprocessar vínculos pendentes **sem** reconsultar o
`EventoCanonico` original (o evento pode já estar arquivado, e o retry manual/job de pendentes
descrito no ROADMAP opera "sobre dados já no banco, sem API"). O mesmo raciocínio já levou a
spec 018 a persistir `oferta_codigo_origem`/`oferta_nome_origem` como campos crus para a etapa
5 (spec 023) consumir depois. `UPSERT_TRANSACAO` é dona de `financeiro` — a mesma spec (024)
que introduz o consumidor (etapa 4) pode estender o produtor (etapa 3) sem violar fronteira de
contexto, já que ambas moram no mesmo bounded context.

**Alternatives considered**: (a) reconsultar `evento_origem.payload_bruto`/`evento_canonico`
Json a cada tentativa de vínculo — rejeitado: acopla a etapa 4 ao formato interno de
`evento_origem` (dono é `ingestao`), violando o Princípio VI da mesma forma que `financeiro`
já evita importar `ingestao/domain`; também degrada performance do job de pendentes (teria que
fazer join com `evento_origem` em vez de um filtro direto em `transacao`).

## D-02 — Pareamento de conta (CL-01)

**Decisão**: função pura `contaGuruParDe(plataformaAsaas): PlataformaOrigem | null` e sua
inversa `contaAsaasParDe(plataformaGuru)`, mapa fechado `{ ASAAS_PRD: GURU_PRD, ASAAS_SVC:
GURU_SVC }` (e o inverso). Fora do domínio das 4 contas Asaas/Guru → `null` (nunca chamado na
prática, guarda de tipo).

**Rationale**: mesmo padrão de mapa fechado já usado em `ESTRATEGIA_RESOLUCAO_OFERTA`
(catalogo/023) e `MAPAS_STATUS` (financeiro/018) — "estratégia por conta é dado, não `if`".

## D-03 — Resolução bidirecional sem worker novo (CL-02)

**Decisão**: o `ResolverVinculoEtapaService` (executor da etapa 4) implementa os 2 sentidos
dentro do mesmo método `executar()`, ramificando por `entrada.plataformaOrigem`:

- Papel **Asaas** (a própria transação sendo processada tem `referenciaExterna.idOrigem`):
  busca 1 transação com `plataformaOrigem = contaGuruParDe(minha)` e
  `idOrigem = referenciaExterna.idOrigem`. Achou → resolve o vínculo (grava nos dois lados via
  `TentarVincularService`, abaixo). Não achou → `status: 'ok'`, sem vínculo, sem `revisar`
  (pendente é estado válido, não erro — Princípio "nunca um palpite" corta pro outro lado:
  também não é um "erro" marcar como pendente).
- Papel **Guru** (a transação sendo processada é `GURU_PRD`/`GURU_SVC`): busca transações
  `plataformaOrigem = contaAsaasParDe(minha)` com `referenciaExternaIdOrigem = <meu
  idOrigem>` e `transacaoVinculadaId IS NULL` (pendentes). Resolve todas as que achar (o
  Assumption do spec já cobre — na prática deveria achar no máximo 1, mas a query não assume
  isso).
- Qualquer outra plataforma (TMB/Hotmart): `status: 'pulada'` — a etapa não se aplica.

**Rationale**: reusa o `WorkerService`/`WorkerScheduler` de ingestão já existente (spec 006)
como único "motor" de retry automático — toda vez que um evento novo de qualquer lado da
ponte passa pela etapa 4, ele tenta ativamente destravar o outro lado. Isso cobre o caso comum
(webhooks chegando em qualquer ordem) sem introduzir um 2º processo de fundo, uma 2ª variável
`.env` de intervalo, ou um 2º ponto de falha silenciosa.

**Alternatives considered**: worker `setInterval` dedicado (padrão `INGESTAO_WORKER_*`/
`CRM_WORKFLOW_WORKER_*`) — rejeitado pelo dono do produto (CL-02): mais um processo a manter
para resolver um caso que a resolução bidirecional síncrona já cobre na prática; os 2
endpoints de retry manual (FR-006/007) cobrem os casos residuais (dado histórico, migração).

## D-04 — Reclassificação para `COBRANCA_TERCEIRIZADA` (CL-03)

**Decisão**: ao resolver o vínculo, a transação Asaas tem `classificacao` sobrescrita para
`Classificacao.COBRANCA_TERCEIRIZADA` (valor já existente no enum congelado desde a spec 006).
A regra de leitura "só a Guru soma receita" vira: `financeiro/domain/vinculo/receita.ts` —
`pagoDeFatoTransacao(statusCanonico, classificacao) = contaComoReceita(statusCanonico) &&
classificacao !== 'COBRANCA_TERCEIRIZADA'` (função pura, sem banco), consumida por
`TransacaoRepository.where()` no lugar da checagem só-de-status que a 018 introduziu.

**Rationale**: `classificar.ts` (spec 006) já documenta essa decisão explicitamente no
comentário da regra 2 ("Cravar o vínculo Asaas↔Guru de fato é da spec 024") — não é uma
invenção desta spec, é a conclusão do design que a 006 deixou em aberto de propósito. Manter
a exclusão de receita só no filtro de leitura (nunca reescrevendo `valorBruto`/`valorLiquido`
ou qualquer outro agregado) respeita o Princípio V ("nunca efeito colateral de escrita").

**Alternatives considered**: não tocar `classificacao`, e o filtro de receita olhar só
`transacao_vinculada_id IS NOT NULL` — rejeitado (CL-03): perde a informação de "por que essa
transação não conta" na UI/API (o usuário vendo a lista de transações filtradas por
`classificacao` não veria a cobrança terceirizada separada de uma venda própria comum), e
diverge do design já anunciado em `classificar.ts`.

## D-05 — `vinculo_transacao` como entidade própria (não só a FK em `transacao`)

**Decisão**: `vinculo_transacao` é uma tabela de 1ª classe (`transacaoGuruId`,
`transacaoAsaasId` — cada um `@unique`, `origemRef`, `resolvidoEm`), **além** de popular
`transacao.transacao_vinculada_id` (coluna já reservada pela 018) na transação Asaas.

**Rationale**: `transacao_vinculada_id` sozinho não registraria **quando** o vínculo foi
resolvido nem **qual** valor cru casou (`origemRef`) — informação de auditoria que a spec 027
(reconciliação/alertas) vai precisar para decidir se um vínculo é suspeito. Espelha o
precedente de `oportunidade_movimentacao`/`transferencia_atendimento` — "histórico de 1ª
classe, não o audit genérico" — mas aqui é ainda mais simples: 1 linha por par, nunca mais de
uma (índices únicos garantem), nunca atualizada.

**Alternatives considered**: só a FK em `transacao` — rejeitado, perde o "quando"/"com que
valor casou" sem justificativa para reconstruir depois; guardar isso como JSON dentro de
`transacao` — rejeitado, mistura dado derivado com projeção normalizada (Princípio I).

## D-06 — RBAC

**Decisão**: 1 permissão nova, `transacao:vincular` (recurso `transacao`, já existe desde a
018), cobrindo os 2 endpoints de retry manual. Leitura (vínculo aparecendo no detalhe/filtro
de pendentes) reusa `transacao:ver` já existente — **0** permissão nova de leitura.

**Rationale**: mesmo padrão RBAC de toda spec anterior — granularidade por recurso:ação,
`administrador`/credencial de serviço de graça, sem migração de dados.
