# 016 — CRM · Tarefas

Décima fatia da **Fase 1 (CRM)** — gestor de tarefas do time, pessoal e geral (visão Parte
8.10): checklist, cronômetro, comentários de acompanhamento, dependência entre tarefas,
delegação/reatribuição com histórico, pontos de gamificação e ranking, notificações
in-app, e uma ação nova (`CRIAR_TAREFA`) no motor de automação do Workflow (spec 014) para
geração automática a partir de eventos de Pipeline/Lead. Mora no _bounded context_ **`crm`**
(já não-vazio desde 007–015; `CONTEXT_MODULES` segue **11**).

Spec, plano, pesquisa, modelo de dados e contratos:
[`specs/016-crm-tarefas/`](../specs/016-crm-tarefas/).

**14ª migração de negócio** (`20260909190407_crm_tarefas` +
`20260909190442_crm_tarefas_constraints`) — 6 tabelas novas (`tarefa`,
`tarefa_checklist_item`, `tarefa_cronometro_periodo`, `tarefa_nota`, `tarefa_dependencia`,
`tarefa_delegacao`) + `crm_tarefa_audit` (forma canônica do core) + enum `TarefaStatus`;
índice único parcial `(tarefa_id) WHERE fim IS NULL` em `tarefa_cronometro_periodo` (no
máximo 1 período de cronômetro aberto por tarefa) e `CHECK (tarefa_id <> depende_de_id)`
em `tarefa_dependencia` via SQL bruto (Prisma não modela nenhum dos dois). **0 dependência
nova** (backend e frontend). **0 chave `.env` nova.** **+5 permissões** de catálogo
(`tarefa:{criar,editar,ver_todas,ver_proprias,delegar}`; `administrador`/credencial de
serviço concedem de graça, 0 migração de dados/seed). **~21 endpoints** autenticados sob
`/crm/tarefas/**` + `/crm/pessoas/{id}/tarefas`, **0 endpoint público novo**.

---

## Clarificações do dono do produto (2026-09-09, resolvidas antes do `plan.md`)

Três decisões de maior impacto — resolvidas com o dono do produto antes de qualquer
código, integradas ao `spec.md` na seção Clarifications:

- **Gamificação (CL-01): pontos simples + ranking.** Tabela de pesos congelada
  (`PESOS_PONTOS_TAREFA`) — pontos-base por conclusão, bônus por concluir no prazo, bônus
  por checklist 100% completo; ranking sempre **derivado** na leitura (Princípio V), nunca
  contador persistido. Sem badges, níveis ou conquistas desbloqueáveis nesta versão.
- **Notificações/lembretes (CL-02): só in-app.** Campo derivado `vencendoHoje`/`atrasada`
  + endpoint `GET /crm/tarefas/notificacoes` (tarefas do sujeito autenticado); nenhum envio
  externo — WhatsApp (011) fica reservado à conversa com a aluna, e o projeto não tinha
  infra de e-mail. Zero dependência nova, zero worker de envio.
- **Geração automática (CL-03): só via ação nova no Workflow.** Estende o catálogo fechado
  de ações da spec 014 com `CRIAR_TAREFA` (título, descrição opcional, prazo relativo em
  dias, responsável fixo opcional) — reaproveita o motor de fluxo já existente (condições
  E/OU, publicação/versionamento, `WorkerScheduler`, simulação sem efeito colateral); o
  Pipeline (010) **não** ganhou uma 2ª via nativa de geração automática.

## Por que `tarefa_nota` é uma tabela própria, não um `tipo` de `interacao`

A spec 009 (CL-02) já havia reservado essa distinção explicitamente: "tarefa/nota de fluxo
de trabalho (agenda, checklist, delegação) continuam reservadas para a spec 016 — o que
aquela spec cobre é a nota **de timeline**, não a tarefa acionável." `tarefa_nota` é um
comentário de acompanhamento **append-only** (sem edição/remoção, ao contrário de
`interacao.NOTA`, que é editável) pendurado numa `tarefa` — que pode não ter **nenhuma**
âncora de CRM (uma tarefa "geral" do time). Forçar isso dentro de `interacao` quebraria a
invariante de âncora polimórfica obrigatória (`pessoa_id` XOR `lead_id`) já testada desde a
009.

## Âncora de `tarefa`: 0..N, não polimórfica obrigatória

Diferente de `interacao` (009) e `oportunidade` (010), que exigem exatamente uma âncora,
`tarefa` tem três FKs opcionais e **independentes** — `pessoa_id`, `lead_id`,
`oportunidade_id` — e pode não ter nenhuma (tarefa "geral" ou "pessoal" sem vínculo com
CRM). O 3º campo (`lead_id`) existe especificamente para a ação `CRIAR_TAREFA`: quando o
gatilho do Workflow resolve um `Lead` (`LEAD_CRIADO`, `LEAD_ESTAGIO_MUDOU`, etc.), a tarefa
gerada ancora nele; quando resolve uma `Oportunidade` (`OPORTUNIDADE_ETAPA_MUDOU`), ancora
nela.

## "Geral" vs "pessoal" é `responsavel_id` nullable, não um enum

Não existe um 3º tipo de tarefa — é sempre a mesma entidade. `responsavel_id = null` é uma
tarefa "geral" (fila do time, visível a todo mundo com `tarefa:ver_todas`); com
responsável, é "pessoal" dele. O escopo de visão (`tarefa:ver_proprias`) reflete essa regra
no `where`: `{ OR: [{ responsavelId: sujeito }, { responsavelId: null }] }` — quem só vê as
próprias tarefas também precisa ver a fila geral para poder pegá-la para si (literal da
visão 8.10: "gerenciador de tarefas do time, pessoal **e geral**").

## Dependência sem ciclos

`tarefa_dependencia` é um grafo simples (`tarefa → depende_de`). `detectarCiclo` (domínio
puro, DFS) roda **antes** do `INSERT`, buscando um caminho de volta da tarefa-alvo à
origem proposta — direto ou indireto (Postgres não expressa "sem ciclo em grafo" via
`CHECK`/FK simples, então a validação é só de aplicação). Uma tarefa com dependência(s)
pendente(s) não pode ser marcada `CONCLUIDA` (409, com a lista de dependências pendentes no
corpo) — mas segue editável, com checklist/cronômetro/notas normais; a dependência trava só
a conclusão.

## Extensão ao Workflow (spec 014): `CRIAR_TAREFA`

`ACAO_TIPOS` ganha um 6º valor. `ExecutarAcaoService.executar()` ganha um 4º parâmetro
(`registroTipo: FluxoRegistroTipo`, já calculado pelo `WorkerService` via
`registroTipoDoGatilho`) para decidir se a tarefa ancora em `leadId` ou `oportunidadeId`. A
idempotência (reprocessar não duplica tarefa) vem **de graça** do guard já existente do
worker: `WorkerService.processarLinha` só chama `ExecutarAcaoService.executar` depois de
checar `execucoes.existe({fluxoVersaoId, fonte, fonteRegistroId})` — a mesma execução nunca
roda 2×, então nenhuma chave de idempotência nova foi necessária dentro da própria ação. A
simulação (`SimulacaoService`) nunca chama `executar()`, então `CRIAR_TAREFA` já é
"simulável sem efeito colateral" sem nenhuma mudança adicional (D-03 da 014).

## Armadilha resolvida: `sub` do JWT como FK de `usuario`

A credencial de serviço (login único do painel, spec 003 — `SERVICE_CLIENT_ID`, ex.:
`"pandora-panel"`) **não** é o id de um `Usuario` real. Um primeiro rascunho desta spec
passava `sub(req)` direto para colunas FK (`criadoPorId` em `tarefa`, `autorId` em
`tarefa_nota`/`tarefa_delegacao`, e o filtro de `responsavelId` em
`NotificacaoService.minhasNotificacoes`) — Postgres rejeita a string não-UUID com um erro
500 (`P2023`), pego só na verificação manual no navegador (os testes e2e sempre autenticam
como a credencial de serviço, que tem `ver_todas` e nunca exercitava esses caminhos
específicos). Corrigido com `resolverUsuarioIdOuNulo` (mesmo padrão já usado por
`resolverMovidoPor`, spec 010): resolve para `null` quando o sujeito não é um UUID válido
ou não existe em `usuario` — o campo fica vazio (auditoria/comentário/delegação "sem
autor", notificação vazia) em vez de quebrar. `TarefaConsultaService.escopoDe` não precisou
do mesmo tratamento porque a credencial de serviço sempre resolve para `ver_todas` (todo o
catálogo) antes de qualquer comparação de `responsavelId` — o mesmo precedente seguro já
usado por `OportunidadeConsultaService`/`LeadConsultaService`.

## Frontend

`frontend/src/tarefas/`: **CRM · Tarefas** (`TarefasPage.tsx`, atrás de `tarefa:ver_todas`
\| `tarefa:ver_proprias`) — abas Minhas/Gerais/Todas (Todas só com `ver_todas`), filtro de
status, criação inline com checklist; `TarefaDetalhePage.tsx` — checklist interativo,
cronômetro iniciar/parar com tempo total, comentários de acompanhamento, dependências
(adicionar/remover, com o status da tarefa referenciada), delegação com histórico;
`RankingPanel.tsx` (pontos por período) e `NotificacoesBadge.tsx` (contagem
vencendo/atrasada, `refetchInterval` de 60s). `frontend/src/workflow/FluxoDetalhePage.tsx`
ganha o formulário da ação **Criar tarefa** (título, prazo em dias, responsável opcional).
A aba "Minhas" detecta quando o sujeito autenticado é a credencial de serviço (não um
UUID de `Usuario`) e não envia o filtro `responsavelId` malformado — mostra todas as
tarefas no escopo, com uma legenda explicando por quê.

## Testes

30 testes unitários novos de domínio puro (transições de status, dependência/DFS, prazo
livre de fuso, cronômetro, pontos de gamificação — 545 no total) + 21 e2e novos (Postgres
real, suíte 003–016 completa, 307 no total) + 7 de frontend (2 arquivos de componente, 113
no total), todos verdes;
lint/typecheck/build limpos nos dois workspaces. Validado manualmente no navegador de
ponta a ponta: criar tarefa com checklist → marcar item → cronômetro → comentário →
concluir → reabrir; dependência bloqueando conclusão; delegação com histórico; fila geral
visível à credencial de serviço; ranking de pontos refletindo a conclusão; e a ação
`CRIAR_TAREFA` publicada num fluxo de Workflow gerando automaticamente uma tarefa (via o
worker de fundo real, sem chamada manual de `/processar`) ao criar um lead novo.
