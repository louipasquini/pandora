# 017 — CRM · Dashboard

Décima-primeira e **última fatia da Fase 1 (CRM)** — dashboard comercial e de atendimento
(visão Parte 8). Métricas **100% derivadas por query** (Princípio V é o cerne): gráficos,
comparação período-a-período (benchmark), funil de conversão visual, ranking por integrante
do comercial, filtro por data/período/equipe/responsável/pipeline, metas comerciais com
atingimento derivado + alerta in-app, visões salvas, export CSV/impressão. Mora no _bounded
context_ **`crm`** (já não-vazio desde 007–016; `CONTEXT_MODULES` segue **11** — nenhum
bounded context novo).

Spec, plano, pesquisa, modelo de dados e contratos:
[`specs/017-crm-dashboard/`](../specs/017-crm-dashboard/).

**15ª migração de negócio** (`20260910113633_crm_dashboard`) — 2 tabelas de escrita novas
(`meta_comercial`, `dashboard_visao`) + `crm_dashboard_audit` (forma canônica do core,
append-only, só delta real, uma linha por campo — espelha `crm_tarefa_audit`/016) + enum
`MetaComercialPeriodo`. **Só índices comuns**, nenhum `CHECK` nem índice parcial. **0
dependência nova** (backend e frontend). **0 chave `.env` nova.** **+2 permissões** de
catálogo (`dashboard:ver`, `dashboard:gerir_metas`, recurso novo `dashboard`;
`administrador`/credencial de serviço concedem de graça, 0 migração de dados/seed). **~14
endpoints** autenticados sob `/crm/dashboard/**`, **0 endpoint público novo**.

---

## Clarificações do dono do produto (2026-09-10, resolvidas antes do `plan.md`)

Quatro decisões de maior impacto — resolvidas com o dono do produto antes de qualquer
código, integradas ao `spec.md` na seção Clarifications:

- **"Configurável por perfil" (CL-01): painéis fixos por RBAC + visões salvas.** Catálogo
  fechado de painéis no código (não em runtime); cada painel exige uma permissão de
  leitura. "Configurável" = o usuário salva **visões** (`dashboard_visao`): nome + recorte
  de filtros + lista/ordem de painéis; pessoais, opcionalmente compartilhadas com um perfil
  (somente-leitura + clonável). Sem construtor de layout livre, sem widget definido em
  runtime.
- **Alertas de meta (CL-02): sim, versão mínima derivada.** `meta_comercial` guarda **só o
  alvo**; o atingimento (`realizado`, `percentual`, `status ∈ {no_caminho, em_risco,
  batida, estourada}`, `noRitmo`) é sempre derivado na leitura pela mesma query da métrica.
  O "alerta" é `GET /crm/dashboard/notificacoes` — in-app, sem worker, sem envio externo
  (mesmo padrão de `NotificacaoService` de tarefa/016).
- **Export (CL-03): 100% client-side, 0 dependência nova.** "Excel" = CSV via `Blob` no
  navegador (`serializarCsv` puro também no backend por `?formato=csv` nos painéis
  tabulares — mesmo padrão de Disparos/015). "PDF" = `window.print()` + folha `@media
  print`. Nenhuma lib de PDF/planilha (`exceljs`/`puppeteer` seriam as primeiras deps
  pesadas do projeto).
- **Escopo de dados / profundidade de benchmark (CL-04): só CRM; benchmark = período-a-
  período; sem motor estatístico.** O Financeiro (018–030) não existe — v1 cobre só `lead`,
  `oportunidade`, `atendimento`, `tarefa`, `interacao`. "Benchmark" = período atual vs
  período anterior de igual duração + `delta`/`deltaPercentual`. Sem coeficiente de
  correlação/regressão/previsão — "correlação" fica como cruzamento simples (ex.: conversão
  por origem de lead). Um painel de receita entra numa spec de Dashboard financeiro própria
  quando o ledger existir.

---

## Arquitetura

### Catálogo fechado de painéis (`domain/dashboard/paineis.ts`)

`PAINEIS_DASHBOARD` é um `Object.freeze` de `{ id, titulo, formato, permissoesAlternativas }`
— mesmo modelo do catálogo RBAC (004) e de `ACAO_TIPOS` (014). Cresce por PR revisável,
nunca por escrita em runtime. `assertCatalogoPaineisCoerente()` roda no boot do `CrmModule`
(id duplicado / permissão fora do catálogo RBAC → aborta o processo).

| painel | formato | permissão (além de `dashboard:ver`) |
| --- | --- | --- |
| `visao_geral` | `numero` | — |
| `funil_pipeline` | `funil` | `oportunidade:ver_todas` \| `oportunidade:ver_proprias` |
| `ranking_comercial` | `ranking` | `oportunidade:ver_todas` |
| `qualidade_atendimento` | `numero` | `atendimento:ver_todos` \| `atendimento:ver_proprios` |
| `leads_por_origem` | `tabela` | `lead:ver_todos` \| `lead:ver_proprios` |
| `serie_oportunidades` | `serie_temporal` | `oportunidade:ver_todas` \| `oportunidade:ver_proprias` |

`?formato=csv` só vale para `tabela` e `ranking` (senão 400). Um sujeito só com
`dashboard:ver` recebe a página (200) com a lista de painéis restrita ao que pode ver —
**nunca 403 na página inteira** (FR-006).

### Métricas derivadas (`infra/dashboard/metrica.repository.ts` + `application/dashboard/paineis.service.ts`)

Cada método de painel:

1. resolve o `where` de escopo pelo `escopoDe(req)` do `*ConsultaService` do recurso que
   agrega (`OportunidadeConsultaService`/`TarefaConsultaService`/`LeadConsultaService`/
   `AtendimentoConsultaService`) — o dashboard **nunca amplia** o que o sujeito já vê;
   `Forbidden` (sujeito sem a permissão) vira "não enxerga nada" (`criadoEm < epoch`), não
   500;
2. combina com o filtro de período/equipe/responsável/pipeline (`equipeId` → ids de membros
   ativos → `responsavelId in [...]`);
3. chama o `DashboardMetricaRepository` (`groupBy`/`aggregate`/`findMany` do Prisma — **sem
   estado, sem cache, sem tabela de rollup**);
4. aplica a parte pura já testada: `agregarMetricas` (pipeline/010), `calcularSlaAtendimento`
   / CSAT (atendimento/012), `calcularPontosTarefa` (tarefa/016), `combinarRankingComercial`,
   `agruparEmBuckets`, `calcularDelta`.

Dinheiro agregado é sempre `[{ moeda, valorInt }]` — funil e ranking **nunca somam moedas**
(Padrão Transversal).

### Comparação período-a-período (`domain/dashboard/periodo.ts` + `benchmark.ts`)

`resolverPeriodo(deISO, ateISO)` → `{ de, ate, anteriorDe, anteriorAte, duracaoDias,
bucket }` (puro; `Date`/ISO simples — **não** o `parseInstante` de borda do core, já que as
datas nascem de um seletor de data, não de payload de origem; lixo / `de > ate` → 400). O
período anterior é a mesma duração imediatamente antes de `de`. `calcularDelta(valor,
anterior)` → `{ delta, deltaPercentual: anterior === 0 ? null : … }` (nunca divisão por
zero). `bucket` da série temporal: `dia` se ≤ 62 dias, `semana` se ≤ 366, senão `mes`
(regra fixa, FR-018).

### Metas (`domain/dashboard/meta.ts` + `application/dashboard/meta.service.ts`)

`METRICAS_META` (catálogo fechado): `oportunidades_ganhas`, `valor_ganho` (monetária —
`alvo_moeda` obrigatório), `leads_novos`, `tarefas_concluidas`, `atendimentos_encerrados`.
`periodoDaMeta(periodo, referencia)` deriva `{ inicio, fim }` de `(MES|TRIMESTRE, referencia
@db.Date)` em America/Sao_Paulo. `statusMeta(realizado, alvo, { inicio, fim }, agora)` puro:
`batida` se `realizado >= alvo`; `em_risco` se o período ainda corre e a fração realizada
está abaixo da fração decorrida menos uma margem de 10 p.p. (ou se o período já terminou sem
bater); senão `no_caminho`. O `realizado` é a mesma query do painel correspondente restrita
ao escopo da meta (`equipe_id`/`responsavel_id`) — nunca uma coluna.

`GET /crm/dashboard/notificacoes` devolve as metas do sujeito (todas se
`dashboard:gerir_metas`/`administrador`; senão as de `responsavelId = sub` ∪ equipes do
sujeito) com `status ∈ {em_risco, batida, estourada}` no período corrente — só in-app.

### Visões salvas (`application/dashboard/visao.service.ts`)

`dashboard_visao.filtros` (`{ periodo: relativo|absoluto, equipeId?, responsavelId?,
pipelineId? }`) e `.paineis` (`string[]`) validados por zod fechado. Ao reidratar, ids de
painel fora do catálogo são ignorados em silêncio (nunca quebram a página); ao **gravar**,
id desconhecido → 422. Só o `dono_usuario_id` edita/exclui (403 para os demais, mesmo
compartilhada). Uma visão com `perfil_compartilhado_id` aparece como `somenteLeitura: true`
para os demais sujeitos daquele perfil, que podem **clonar** (`POST .../:id/clonar` → cópia
própria, sem compartilhamento). A credencial de serviço não é um `Usuario` real → 400 ao
criar/clonar.

### Auditoria

`crm_dashboard_audit` — forma canônica do core (`montarRegistroAuditoria`, `origem =
AJUSTE_MANUAL`), append-only, **só delta real** (`PATCH` no-op → 0 linha). Uma linha por
campo alterado (`campo`, `valor_anterior`, `valor_novo`, `motivo ∈ {criar, atualizar,
remover}`). Espelha `crm_tarefa_audit` (016) coluna a coluna. As **leituras** de painel não
auditam (não há mutação).

---

## Endpoints (`/crm/dashboard/**`)

| método · rota | permissão | o quê |
| --- | --- | --- |
| `GET /crm/dashboard?de=&ate=&equipeId=&responsavelId=&pipelineId=` | `dashboard:ver` | monta os painéis visíveis já resolvidos |
| `GET /crm/dashboard/paineis` | `dashboard:ver` | catálogo com `visivel` resolvido para o sujeito |
| `GET /crm/dashboard/paineis/:id?…[&formato=csv]` | `dashboard:ver` (+ a do painel) | um painel isolado; `csv` só em `tabela`/`ranking` |
| `GET /crm/dashboard/metas?periodo=&referencia=` | `dashboard:ver` | metas + atingimento derivado |
| `POST /crm/dashboard/metas` | `dashboard:gerir_metas` | cria (métrica ∉ catálogo → 422; coerência alvo/moeda → 422; equipe/responsável inexistente → 422) |
| `PATCH /crm/dashboard/metas/:id` | `dashboard:gerir_metas` | edita alvo/escopo/descrição (`metrica`/`periodo`/`referencia` imutáveis) |
| `DELETE /crm/dashboard/metas/:id` | `dashboard:gerir_metas` | remove (204) |
| `GET /crm/dashboard/notificacoes` | `dashboard:ver` | metas do sujeito em alerta no período corrente |
| `GET /crm/dashboard/visoes` | `dashboard:ver` | próprias + compartilhadas com perfis do sujeito |
| `POST /crm/dashboard/visoes` | `dashboard:ver` | cria (só usuário real; painel ∉ catálogo → 422) |
| `PATCH /crm/dashboard/visoes/:id` | `dashboard:ver` (só o dono) | edita |
| `POST /crm/dashboard/visoes/:id/clonar` | `dashboard:ver` | cópia própria de uma visão visível |
| `DELETE /crm/dashboard/visoes/:id` | `dashboard:ver` (só o dono) | remove (204) |

---

## Frontend (`frontend/src/dashboard/`)

Item de navegação **CRM · Dashboard** atrás de `dashboard:ver`; rota `crm/dashboard` sob
`<RequirePermissao perm="dashboard:ver">`.

- **`DashboardPage.tsx`** — seletor de período (default "últimos 30 dias"), filtros
  equipe/responsável/pipeline, botão **Imprimir / PDF** (`window.print()`), folha `@media
  print` inline que esconde nav/controles, barra de visões salvas (aplicar / clonar), botão
  "Salvar visão".
- **`Paineis.tsx`** — um renderer por formato: cartões numéricos com seta ▲/▼ e % do delta;
  funil em barras **SVG à mão** (quantidade + valor por moeda + tempo médio); série temporal
  como `polyline` SVG; tabela; ranking. Botão "Exportar CSV" (`Blob` client-side) nos
  painéis tabulares.
- **`MetasPanel.tsx`** — lista com barra de progresso + badge de status derivado; formulário
  "Nova meta" inline e "remover" atrás de `dashboard:gerir_metas`.
- **`NotificacoesMetaBadge.tsx`** — contagem de metas em alerta, `refetchInterval` 60s.
- **`exportar-csv.ts`** — `montarCsv` + `baixarCsv` (`Blob`), mesmo padrão de Disparos/015.

Hooks TanStack Query **inline** nos componentes (mesmo padrão de
`whatsapp/WhatsappAdminPage.tsx`).

---

## Testes

- **Unit backend (44 novos, domínio puro — sem banco):** catálogo de painéis
  (`assertCatalogoPaineisCoerente`, `painelVisivel`), `resolverPeriodo` (benchmark + bucket
  + validação), `calcularDelta` (inclui anterior 0), `agruparEmBuckets` (fuso), `METRICAS_META`
  + `periodoDaMeta` + `statusMeta` (batida / em_risco / no_caminho / período encerrado /
  alvo 0), `combinarRankingComercial` (ordena por valor ganho, nunca soma moedas),
  `serializarCsv`.
- **e2e backend (18 novos, Postgres real):** monta o dashboard e confere cada número contra
  query direta; período anterior de igual duração; `de > ate`/data inválida → 400; sujeito
  só com `dashboard:ver` → página 200 restrita; funil por etapa (valor por moeda);
  `ranking_comercial` omitido da lista para `oportunidade:ver_proprias`; qualidade de
  atendimento (tempo méd. / % SLA / CSAT / taxa de resolução); metas (contagem e monetária)
  com realizado/status derivados + `/notificacoes`; 403 na escrita sem `dashboard:gerir_metas`;
  422 para métrica/escopo inválidos; `DELETE` + auditoria; visões salvas/compartilhadas/
  clone + 403 para não-dono; `?formato=csv` (`text/csv` em tabela, 400 em funil); credencial
  de serviço criando visão → 400; fronteira (0 import de `src/clientes/**`, 0 tabela de
  rollup no schema).
- **Frontend (7 novos, 2 arquivos):** `DashboardPage` monta os painéis do mock e mostra o
  delta; painel tabular tem "Exportar CSV"; `MetasPanel` esconde o CRUD sem
  `dashboard:gerir_metas` e mostra com; `montarCsv`.

589 unit backend + 325 e2e + 120 frontend, todos verdes. Lint/typecheck/build limpos nos
dois workspaces. Validado manualmente no navegador de ponta a ponta.

> **Nota de ambiente:** o e2e desta spec rodou contra um Postgres isolado num container
> próprio na porta **55434** (`docker run … postgres:16-alpine`), porque `55432` e `55433`
> estavam em uso por outras sessões neste ambiente. O harness (`backend/test/setup-db.ts`)
> respeita `TEST_DATABASE_URL` — basta exportá-lo apontando para a porta livre. A migração
> `20260910113633_crm_dashboard` foi criada com `prisma migrate dev` contra esse mesmo
> container.
