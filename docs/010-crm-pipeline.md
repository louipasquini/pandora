# 010 — Pipeline de Vendas do CRM: pipelines, oportunidades, atribuição e SLA

Quarta fatia da **Fase 1 (CRM)** — o pipeline de vendas de alto ticket da visão (Parte 8.7).
Mora no _bounded context_ **`crm`** (já não-vazio desde a 007/008/009).

Spec, plano e contratos: [`specs/010-crm-pipeline/`](../specs/010-crm-pipeline/).

`CONTEXT_MODULES` segue com **11**. **8ª migração de negócio**
(`20260904154451_crm_pipeline`). **0 dependência nova** (backend e frontend — drag-and-drop
do board é HTML5 nativo, ver `research.md`). **Nenhuma variável de ambiente nova.**
**Nenhuma porta de rede nova.** **+6 permissões** de catálogo
(`oportunidade:{criar,editar,mover,ver_todas,ver_proprias}`, `crm_admin:gerir_pipelines`).

---

## Âncora polimórfica de `oportunidade` (D-01)

Mesma disciplina da `interacao` (spec 009): `oportunidade.pessoa_id` **XOR** `lead_id`
(`CHECK` no banco + `validarAncora` reusado — `domain/pipeline/ancora.ts` só re-exporta
`domain/interacao/ancora.ts`, sem duplicar). Uma oportunidade nasce contra um `lead`
(prospecção) ou direto contra uma `pessoa` já cliente (upsell). Quando o lead converte
(spec 008), a oportunidade **não** é re-apontada; `GET /crm/pessoas/{id}/oportunidades`
faz a mesma união (diretas ∪ dos leads convertidos nela) que a timeline da 009 já faz.

## 1ª persistência de `Dinheiro` do `core` no schema

`oportunidade.valor_estimado_int BIGINT` + `valor_estimado_moeda CHAR(3)` — escala ×10000,
reidratado via `Dinheiro.deInteiroEscalado` na borda (`OportunidadeService`). Nenhuma outra
tabela do projeto guardava dinheiro até aqui (Financeiro ainda não existe). Métricas somam
**por moeda** (`groupBy` Prisma em `[etapaId, moeda]`) — nunca combinam moedas diferentes.

## Histórico de 1ª classe: `oportunidade_movimentacao`

Diferente de um log de auditoria genérico, `oportunidade_movimentacao` é domínio de
1ª classe: fonte de SLA, "esfriando" (indiretamente, via `interacao`) e métricas. Append-only,
sem `PATCH`/`DELETE`. `mover` (FR-010): etapa destino precisa pertencer ao mesmo pipeline;
motivo obrigatório só ao **entrar** numa etapa `tipo = PERDIDA`; mover para a etapa atual é
no-op idempotente (sem nova linha); reabrir uma oportunidade `GANHA`/`PERDIDA` para uma
etapa `ABERTA` não exige motivo. `crm_pipeline_audit` (forma canônica do core) cobre só
escrita administrativa e edição de campos não-etapa — **nunca** duplica a mudança de etapa.

## SLA e "esfriando" — sempre derivados (Princípio V)

`slaEstourado`/`esfriando` nunca são colunas — são calculados em toda leitura
(`domain/pipeline/sla.ts`/`esfriando.ts`, puros, testados sem banco). `esfriando` reusa a
`interacao` da spec 009 (última `ocorridoEm` da âncora, buscada em **lote** por
`OportunidadeConsultaService.enriquecer` — sem N+1) em vez de duplicar "última interação"
como coluna denormalizada em `oportunidade` (evitaria divergência — regra de curadoria vs.
derivação da constituição).

## Atribuição automática (D-03)

`pipeline.modoAtribuicao ∈ {MANUAL, RODIZIO, REGRA}` (+ `atribuicaoFallback: RODIZIO|null`
quando `REGRA` não casa nenhuma `regra_atribuicao_pipeline`). `RODIZIO` reusa
`equipe`/`equipe_membro` da spec 007 (`EquipeRepository.membrosAtivos`) — round robin
**determinístico**: cursor `pipeline.ultimoAtribuidoUsuarioId` persistido a cada escolha
(`domain/pipeline/atribuicao.ts::escolherProximoRodizio`, puro); sem membro ativo, a
oportunidade nasce sem responsável — **nunca erro** (research.md explica por que um cursor
persistido bate melhor que `count() % N` sob concorrência). `REGRA` é uma lista **ordenada**
de condições simples (`ORIGEM` casa `lead.origem`; `VALOR_ESTIMADO_MINIMO` casa por moeda +
limiar) — motor composto (E/OU) fica para o Workflow (spec 014). `responsavelId` explícito
no `POST` sempre vence — nenhuma regra roda.

## Regra 8.2.3 da visão: "ganho" não antecipa Contrato (D-02)

O Financeiro (specs 018–030) ainda não existe. `PortaObservacaoPagamentoCrm` (interface +
`PortaObservacaoPagamentoService`, exportada do `CrmModule`) entrega só o **efeito**: mover
a(s) oportunidade(s) `ABERTA` de uma pessoa para a 1ª etapa `GANHA` do respectivo pipeline,
idempotente (`movidoPorId: null`). O **gatilho** real (consumir o pagamento confirmado) é
trabalho de uma spec futura — a porta é testada isoladamente (injeção direta do provider,
sem endpoint HTTP), sem nenhum consumidor registrado nesta spec. Nunca cria, edita ou lê
nenhuma tabela de Contrato.

## Frontend: board Kanban sem dependência nova

`frontend/src/pipelines/` — `KanbanBoard.tsx` usa drag-and-drop **HTML5 nativo**
(`draggable`/`onDragStart`/`onDragOver`/`onDrop`), decisão registrada em `research.md`:
o board tem 1 card por vez entre colunas de 1 lista, sem reordenação interna nem suporte a
touch — não justifica uma dependência nova (`@hello-pangea/dnd` avaliada e rejeitada).
Soltar num card numa coluna `PERDIDA` abre `MoverMotivoModal`; cancelar não chama a API (o
card volta visualmente pois a lista não foi otimisticamente alterada, só invalidada após
sucesso). `PipelineAdminPage.tsx` (etapas, atribuição, campos personalizados) atrás de
`crm_admin:gerir_pipelines`; item de navegação **CRM · Pipelines** atrás de
`oportunidade:ver_todas`\|`ver_proprias`.

## Armadilhas encontradas e corrigidas nesta spec

- **Atribuição por `REGRA.ORIGEM` não resolvia `origem` do lead**: o `OportunidadeService`
  inicialmente passava `origem: null` fixo para o resolvedor de atribuição — bug pego pelo
  e2e (`REGRA casa por origem`), corrigido com `OportunidadeRepository.origemDoLead`.
- **Limpeza de fixtures entre suítes e2e**: `equipe_membro.usuario_id` e `interacao.pessoa_id`
  são `onDelete: Restrict` — o `afterEach` desta spec precisa apagar `equipeMembro`/`equipe`
  (criados para os testes de rodízio) e `interacao` (criada no teste de "esfriando") antes
  de outra suíte (ex.: `rbac.e2e-spec.ts`, `clientes.e2e-spec.ts`) rodar seu próprio
  `deleteMany({})` global — senão a FK quebra a suíte seguinte, não a própria.
- **Ambiente de desenvolvimento**: as portas padrão (3001/5174/55432) já estavam em uso por
  outra sessão neste ambiente — o desenvolvimento e os testes desta spec rodaram contra um
  Postgres isolado (container próprio, porta 55433) sem tocar o ambiente compartilhado.

## RBAC 004 estendido

Recurso novo `oportunidade` (`criar`, `editar`, `mover`, `ver_todas`, `ver_proprias` — mesmo
padrão `ver_todos`/`ver_proprios` da 008) + `crm_admin:gerir_pipelines` no recurso
`crm_admin` já existente (007) — cobre pipeline, etapa, atribuição, campos personalizados de
oportunidade. `administrador` e a credencial de serviço recebem todas de graça.

## Escopo desta spec vs. specs futuras

- Gatilho real da porta de observação de pagamento → Financeiro (018+) ou Workflow (014).
- Motor de regra de atribuição composta (E/OU) → Workflow (014).
- Export de métricas em arquivo (CSV) → Dashboard do CRM (017), que consome
  `GET /crm/pipelines/{id}/metricas`.
- Notificação push de SLA estourado/esfriando → WhatsApp (011) / Slack (033); esta spec só
  expõe os campos derivados e os filtros de listagem.
