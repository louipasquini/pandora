# Research: CRM · Dashboard

Nenhum `NEEDS CLARIFICATION` de Technical Context ficou aberto — stack e infraestrutura são
as mesmas já em produção desde a 001 (ver plan.md). As decisões de produto (CL-01..CL-04) já
foram resolvidas com o dono do produto na fase de especificação (spec.md). Este documento
registra as decisões técnicas de menor nível resolvidas durante o `/speckit-plan`.

## D-R1 — Como o dashboard respeita o escopo de visão sem reimplementar RBAC

- **Decision**: cada serviço de painel recebe o `Request` e chama o `escopoDe(req)` do
  serviço de consulta do recurso que agrega — `OportunidadeConsultaService.escopoDe`
  (010), `TarefaConsultaService.escopoDe` (016), `LeadConsultaService.escopoDe` (008),
  `AtendimentoConsultaService.escopoDe` (012). O `Prisma.*WhereInput` devolvido é
  combinado com `AND` ao filtro de período/equipe/responsável e passado às queries
  agregadas do `DashboardMetricaRepository`.
- **Rationale**: reaproveita **exatamente** a mesma lógica "OU + filtro no `where`" já
  testada nas specs 008/010/012/016 — o dashboard não pode ter uma 2ª interpretação de
  `ver_todas`/`ver_proprias` que divirja da inbox / da lista. FR-005/D-03/SC-002.
- **Alternatives considered**: um `DashboardScopeService` próprio — rejeitado: duplicaria
  regra de autorização e abriria espaço para divergência silenciosa.

## D-R2 — Catálogo de painéis no código, não em tabela

- **Decision**: `PAINEIS_DASHBOARD` é um `Object.freeze([...])` em
  `backend/src/crm/domain/dashboard/paineis.ts` — cada item `{ id, titulo, formato,
  permissao }` (`formato ∈ {serie_temporal, funil, ranking, tabela, numero}`; `permissao`
  = a permissão RBAC de leitura exigida, ou `null` p/ os painéis de "visão geral" que só
  exigem `dashboard:ver`). Uma função `assertCatalogoPaineisCoerente()` roda no boot do
  `CrmModule` (mesmo padrão de `assertCatalogoCoerente` da 004) — id duplicado / permissão
  fora do catálogo RBAC → aborta.
- **Rationale**: mesmo modelo já validado do catálogo de permissões (004) e de `ACAO_TIPOS`
  (014) — cresce por PR revisável, nunca por escrita em runtime (FR-001). Sem tabela = sem
  migração a cada painel novo, sem risco de painel "fantasma" com query inexistente.
- **Alternatives considered**: tabela `painel_dashboard` editável — rejeitada (Princípio
  VIII; um painel é código — tem uma função de consulta associada — não dado).

## D-R3 — Toda métrica é `groupBy`/`aggregate` do Prisma a cada request

- **Decision**: `DashboardMetricaRepository` (novo, em `infra/dashboard/`) expõe métodos
  como `contarLeadsPorOrigem(where, de, ate)`, `agruparOportunidadesPorEtapaEMoeda(where)`,
  `ganhasPorResponsavel(where, de, ate)`, `serieOportunidadesPorDia(where, de, ate)`,
  `metricasAtendimento(where, de, ate)` — cada um um `prisma.<model>.groupBy`/`aggregate`/
  `count`. Nenhuma tabela de métrica; nenhum cache no banco. Reusa `agregarMetricas`
  (`domain/pipeline/metricas.ts`, 010) e `calcularSlaAtendimento`/CSAT (`domain/
  atendimento/*`, 012) para a parte pura.
- **Rationale**: Princípio V é o cerne da spec (SC-003). O volume do `crm` é baixo (mesmo
  pressuposto de 010/012). `groupBy` do Prisma cobre todos os recortes do MVP.
- **Alternatives considered**: view materializada no Postgres / tabela de rollup atualizada
  por trigger — rejeitadas (D-09): reintroduzem exatamente a classe de bug que o Princípio
  V existe para evitar ("número materializado que pode divergir").

## D-R4 — Comparação período-a-período (benchmark)

- **Decision**: `resolverPeriodo(deISO, ateISO)` (`domain/dashboard/periodo.ts`, puro)
  devolve `{ de, ate, anteriorDe, anteriorAte, duracaoDias, bucket }`. O período anterior é
  os mesmos `duracaoDias` imediatamente antes de `de` (`anteriorAte = de - 1ms`,
  `anteriorDe = anteriorAte - duracaoDias`). `calcularDelta(valor, anterior)` →
  `{ delta: valor - anterior, deltaPercentual: anterior === 0 ? null : (valor-anterior)/anterior }`.
  Cada painel numérico roda a **mesma** query 2×: uma para `[de, ate]`, outra para
  `[anteriorDe, anteriorAte]`.
- **Rationale**: "benchmark" no MVP é comparação temporal (CL-04) — barato, sem motor
  estatístico, cobre "estamos melhores ou piores que o mês passado?". `deltaPercentual:
  null` evita divisão por zero (edge case do spec).
- **Alternatives considered**: comparar contra uma "meta" fixa em vez do período anterior —
  rejeitado: é o papel da `meta_comercial` (US4), não do benchmark automático de todo
  painel.

## D-R5 — Bucket da série temporal derivado da duração

- **Decision**: `bucket` = `dia` se `duracaoDias <= 62`; `semana` se `<= 366`; `mes` caso
  contrário. Regra fixa no código (FR-018), não configurável no MVP. `agruparEmBuckets`
  (puro) recebe os pontos já datados do repo e soma por rótulo de bucket
  (`America/Sao_Paulo`, `Intl` nativo — mesmo padrão de fuso de 007/016, 0 dep).
- **Rationale**: evita devolver 730 pontos diários para um filtro de 2 anos; mantém o SVG
  legível. Limiares escolhidos para ~2 meses diário / ~1 ano semanal.
- **Alternatives considered**: deixar o cliente pedir o bucket — adiado (mais um parâmetro,
  sem demanda no MVP).

## D-R6 — `meta_comercial`: métrica de um catálogo fechado, atingimento derivado

- **Decision**: `METRICAS_META` (`domain/dashboard/meta.ts`) é o subconjunto de métricas
  que fazem sentido como alvo: `oportunidades_ganhas` (contagem),
  `valor_ganho` (por moeda — a meta carrega `alvo_moeda` quando a métrica é monetária),
  `leads_novos`, `tarefas_concluidas`, `atendimentos_encerrados`. `statusMeta(realizado,
  alvo, { inicio, fim }, agora)` (puro) → `{ percentual, status, noRitmo }` com
  `status ∈ {no_caminho, em_risco, batida, estourada}`: `batida` se `realizado >= alvo`;
  `estourada` reservada p/ métricas onde ultrapassar é ruim (nenhuma no MVP — fica como
  valor do enum, sempre `batida` por ora); `em_risco` se o período ainda corre e
  `realizado / alvo < fraçãoDecorrida - MARGEM`; senão `no_caminho`.
- **Rationale**: alvo é o **único** dado persistido (CL-02); tudo mais é a mesma query do
  painel correspondente comparada ao alvo. Catálogo fechado evita meta apontando para uma
  métrica que o dashboard não sabe calcular.
- **Alternatives considered**: meta como texto livre de "métrica" — rejeitada (não dá para
  derivar `realizado` de uma string arbitrária).

## D-R7 — `meta_comercial` e o período: enum, não intervalo livre

- **Decision**: `MetaComercialPeriodo ∈ { MES, TRIMESTRE }` + uma coluna `referencia`
  (`@db.Date`, o 1º dia do mês/trimestre). `inicio`/`fim` do período são **derivados** de
  `(periodo, referencia)` na leitura (`America/Sao_Paulo`). Sem `de`/`ate` arbitrários numa
  meta.
- **Rationale**: metas comerciais são sempre "do mês" / "do trimestre" na prática da AEN;
  fechar o enum simplifica o cálculo de `fraçãoDecorrida` e a listagem "metas do período
  corrente" em `/notificacoes`.
- **Alternatives considered**: `inicio`/`fim` livres — mais flexível, mas nenhuma demanda e
  complica "quais metas estão ativas agora".

## D-R8 — `dashboard_visao`: filtros e painéis em jsonb, validados por zod

- **Decision**: `dashboard_visao.filtros` (jsonb) e `.paineis` (jsonb `string[]`) validados
  por schema zod fechado (`domain/dashboard` reexporta o schema; mesmo padrão de
  `segmento.filtro`, 009). Ao reidratar, ids de painel que não estão mais em
  `PAINEIS_DASHBOARD` são ignorados silenciosamente (edge case do spec). `dono_usuario_id`
  sempre presente; `perfil_compartilhado_id?` opcional — quando setado, a visão aparece
  como `somenteLeitura: true` para os demais sujeitos daquele perfil (`SujeitoRbacService`
  já resolve os perfis do sujeito).
- **Rationale**: jsonb validado evita 2 tabelas-filhas (`visao_filtro`, `visao_painel`) para
  uma preferência de UI de baixo risco; mesmo precedente de `segmento`/009 e de
  `campo config` de integrações/007.
- **Alternatives considered**: tabelas-filhas normalizadas — over-engineering para
  preferência de leitura.

## D-R9 — Export: CSV client-side + `window.print()`

- **Decision**: endpoints de painel `tabela`/`ranking` aceitam `?formato=csv` e o
  `DashboardController` responde `text/csv` montado por `serializarCsv(colunas, linhas)`
  (puro, `application/dashboard/csv.ts`) — mas o **frontend** também sabe montar o CSV de
  qualquer painel tabular a partir do JSON já carregado, via `Blob` (helper reaproveitado
  de `disparos/`, 015). "PDF" = `window.print()` + `@media print` em `DashboardPage.tsx`
  (esconde nav/controles). `?formato=csv` em painel não-tabular → 400.
- **Rationale**: 0 dependência nova (CL-03/SC-006); `exceljs`/`puppeteer` seriam as
  primeiras deps "pesadas" do projeto. CSV abre no Excel/Sheets; impressão do navegador
  gera PDF fiel o suficiente para o uso interno.
- **Alternatives considered**: `.xlsx`/`.pdf` server-side — adiado explicitamente nas
  Assumptions do spec.

## D-R10 — Nenhum bounded context novo, nenhuma porta nova no `core`

- **Decision**: `dashboard` é um subdiretório do `crm` (mesmo padrão de `tarefa`/016).
  `CONTEXT_MODULES` segue 11. Nenhuma porta nova no `core` — o dashboard só **lê** entidades
  do próprio `crm` (e `usuario`/`perfil`/`equipe` já compartilhados via schema). Nada é
  exportado do `CrmModule` para outros contextos.
- **Rationale**: Princípio VI — a fronteira é sobre import de módulo TS; FKs no schema
  compartilhado já são o precedente aceito (008/010). O Financeiro não existe para observar.
- **Alternatives considered**: expor um `PortaMetricasCrm` para um futuro dashboard
  consolidado — YAGNI; quando o Financeiro existir, ele terá seu próprio dashboard e a
  consolidação é uma spec da fase 6 (053, painel de auditoria consolidado, já no ROADMAP).
