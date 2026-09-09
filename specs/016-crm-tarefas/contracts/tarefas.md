# Contratos — CRM · Tarefas

Todos os endpoints exigem JWT (`JwtAuthGuard`, spec 003); leitura via `@AutenticadoBasta()`
+ escopo no `where` (`tarefa:ver_todas`\|`ver_proprias`); escrita via `@RequerPermissao`.

## Tarefa

- `POST /crm/tarefas` — `tarefa:criar`. Body: `{ titulo, descricao?, dataVencimento?,
  responsavelId?, pessoaId?, leadId?, oportunidadeId?, checklist?: string[] }`. 404 se
  `pessoaId`/`leadId`/`oportunidadeId` informado não existir. Responsável default = autor
  se omitido? **Não** — default é `null` (geral), a menos que o corpo informe
  `responsavelId` explicitamente (D-07 não assume "para mim" — o painel decide o default
  na UI, ex.: preencher com o próprio usuário na aba "Minhas").
- `GET /crm/tarefas` — `@AutenticadoBasta()`. Filtros: `status?`, `responsavelId?`,
  `pessoaId?`, `leadId?`, `oportunidadeId?`, `vencimentoDe?`/`vencimentoAte?` (agenda,
  FR-017), `vencendoHoje?`/`atrasada?` (boolean, derivado), paginação. Escopo D-08 sempre
  aplicado no `where`.
- `GET /crm/tarefas/{id}` — `@AutenticadoBasta()`, escopo D-08; 404 fora do escopo.
  Retorna a tarefa projetada com `progressoChecklist { concluidos, total }`,
  `tempoTotalSegundos`, `vencendoHoje`, `atrasada`, `dependenciasPendentes: [{id,titulo}]`.
- `PATCH /crm/tarefas/{id}` — `tarefa:editar`. Body parcial: título/descrição/prazo/
  âncoras. 409 se `status` for terminal (exceto reabrir via `PATCH { status: 'PENDENTE' }`
  vindo de `CONCLUIDA`).
- `POST /crm/tarefas/{id}/status` — `tarefa:editar`. Body: `{ status }`. Valida transição
  (`transicao-status.ts`); 409 em transição inválida; 409 se `CONCLUIDA` pedida com
  dependência pendente (corpo inclui a lista); grava/limpa `concluidoEm`.
- `POST /crm/tarefas/{id}/delegar` — `tarefa:delegar`. Body: `{ responsavelId?, motivo? }`
  (`responsavelId` omitido = torna "geral"). No-op se igual ao atual. Grava
  `tarefa_delegacao`.

## Checklist

- `POST /crm/tarefas/{id}/checklist` — `tarefa:editar`. Body: `{ texto }`. 409 se tarefa
  terminal.
- `PATCH /crm/tarefas/{id}/checklist/{itemId}` — `tarefa:editar`. Body: `{ texto?,
  concluido?, ordem? }`. 409 se tarefa terminal.
- `DELETE /crm/tarefas/{id}/checklist/{itemId}` — `tarefa:editar`. 409 se tarefa terminal.

## Cronômetro

- `POST /crm/tarefas/{id}/cronometro/iniciar` — `tarefa:editar`. 409 se já há período
  aberto.
- `POST /crm/tarefas/{id}/cronometro/parar` — `tarefa:editar`. 409 se não há período
  aberto.
- `GET /crm/tarefas/{id}/cronometro` — `@AutenticadoBasta()`, escopo D-08. Lista de
  períodos + `tempoTotalSegundos` derivado.

## Notas de acompanhamento

- `POST /crm/tarefas/{id}/notas` — `tarefa:editar`. Body: `{ conteudo }`. Append-only.
- `GET /crm/tarefas/{id}/notas` — `@AutenticadoBasta()`, escopo D-08.

## Dependências

- `POST /crm/tarefas/{id}/dependencias` — `tarefa:editar`. Body: `{ dependeDeId }`. 422 em
  auto-dependência ou ciclo; 404 se `dependeDeId` não existir.
- `DELETE /crm/tarefas/{id}/dependencias/{dependeDeId}` — `tarefa:editar`.
- `GET /crm/tarefas/{id}/dependencias` — `@AutenticadoBasta()`, escopo D-08. Cada item
  inclui `status` da tarefa da qual depende (para o painel destacar bloqueio).

## Delegação (histórico)

- `GET /crm/tarefas/{id}/delegacoes` — `@AutenticadoBasta()`, escopo D-08.

## Notificações e ranking (CL-01/CL-02)

- `GET /crm/tarefas/notificacoes` — `@AutenticadoBasta()`. Tarefas do sujeito autenticado
  (escopo D-08 restrito a `responsavelId = sujeito`, notificação é sempre pessoal mesmo
  que o sujeito tenha `ver_todas`) com `vencendoHoje = true` ou `atrasada = true`.
- `GET /crm/tarefas/ranking?desde=&ate=` — `@AutenticadoBasta()`. Ranking de pontos
  (CL-01) por `responsavelId`, período opcional (default: mês corrente); sempre
  recalculado (`domain/tarefa/pontos.ts`), nunca lido de contador.

## Por pessoa (read-only, composição)

- `GET /crm/pessoas/{pessoaId}/tarefas` — `pessoa:ver` + escopo D-08 combinado (mesmo
  padrão de `oportunidade`/010 — `listarPorPessoa`).

## Extensão ao Workflow (spec 014 — sem endpoint novo)

Nenhum endpoint novo: `CRIAR_TAREFA` é só mais um `tipo` dentro do array `acoes` (jsonb)
de `POST/PATCH /crm/workflow/fluxos/{id}` (endpoint já existente da 014); a simulação
(`POST /crm/workflow/fluxos/{id}/simular`) passa a reconhecer a ação nova no relatório
(sem side-effect, mesma disciplina D-03 da 014).
