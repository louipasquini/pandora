# Research: CRM · Tarefas

Nenhum `NEEDS CLARIFICATION` de Technical Context ficou aberto (stack e infraestrutura
são as mesmas já em produção desde a 001; ver plan.md). As decisões de produto (CL-01..
CL-03) já foram resolvidas com o dono do produto na fase de especificação (spec.md). Este
documento registra as decisões técnicas de menor nível resolvidas durante o `/speckit-plan`.

## D-R1 — Onde a "Tarefa" mora e como se relaciona com `interacao`/`oportunidade`

- **Decision**: `tarefa` é uma tabela nova dentro do `crm`, com âncoras opcionais e
  independentes (`pessoaId?`, `leadId?`, `oportunidadeId?`) — nenhuma relação com
  `interacao` (a "nota" desta spec é `tarefa_nota`, uma tabela própria, comentário de
  acompanhamento da tarefa, não a nota de timeline da spec 009 — precedente já registrado
  na CL-02 da própria 009).
- **Rationale**: a visão (8.4) já esboça `tarefa`/`nota` como entidades irmãs de
  `interacao`/`oportunidade` dentro do mesmo bounded context, mas distintas — misturar as
  duas quebraria a disciplina de "canal append-only" que a `interacao` já tem (uma nota de
  tarefa pode ser sobre uma tarefa sem NENHUMA pessoa/lead ancorada, o que a `interacao`
  não permite).
- **Alternatives considered**: reaproveitar `interacao` com um novo `tipo = TAREFA` —
  rejeitado porque `interacao` exige âncora `pessoa` XOR `lead` (009, CL-01) e uma tarefa
  "geral" não tem âncora nenhuma; forçar isso quebraria a invariante já testada da 009.

## D-R2 — Extensão do catálogo de ações do Workflow (`CRIAR_TAREFA`)

- **Decision**: adicionar `'CRIAR_TAREFA'` a `ACAO_TIPOS` (`backend/src/crm/domain/
  workflow/tipos.ts`), com payload `{ titulo, descricao?, prazoDias?, responsavelId? }`, e
  um `case 'CRIAR_TAREFA'` em `ExecutarAcaoService.executar()`. Para saber se a
  `tarefa` deve ancorar em `leadId` ou `oportunidadeId`, a assinatura de `executar()`
  ganha um 4º parâmetro `registroTipo: FluxoRegistroTipo` (o `WorkerService` já calcula
  isso via `registroTipoDoGatilho(fonte)` — só precisa repassar).
- **Rationale**: reaproveita **exatamente** o motor de fluxo já existente (condições E/OU,
  publicação/versionamento, worker `WorkerScheduler`, simulação) — mesma disciplina das
  demais 5 ações (`MOVER_LEAD_ESTAGIO`, `APLICAR_TAG`, `REMOVER_TAG`, `REGISTRAR_NOTA`,
  `MOVER_OPORTUNIDADE_ETAPA`), todas por composição de serviço já existente, nunca um
  caminho de escrita paralelo. A idempotência (FR-014 — reprocessar não duplica) já vem de
  graça: `WorkerService.processarLinha` só chama `ExecutarAcaoService.executar` depois de
  checar `execucoes.existe(chave)` (`@@unique(fluxoVersaoId, fonte, fonteRegistroId)`) —
  a mesma execução nunca roda 2×.
- **Alternatives considered**: um worker/gatilho próprio de `tarefa` reagindo direto a
  `oportunidade_movimentacao`/`crm_lead_audit` — rejeitado pela CL-03 (o dono do produto
  optou por só o caminho via Workflow, sem 2º mecanismo de geração automática).

## D-R3 — Cálculo de "vencendo hoje" / "atrasada" livre de fuso

- **Decision**: `calcularEstadoPrazo(dataVencimento, agora)` compara o **dia civil** em
  `America/Sao_Paulo` de `dataVencimento` e de `agora` via `Intl.DateTimeFormat` nativo
  (mesmo padrão de `estaEmExpediente`, spec 007 — **0 dependência nova**, livre de locale,
  matriz de `TZ` testada na CI). `atrasada` = dia(`dataVencimento`) < dia(`agora`) e status
  não-terminal; `vencendoHoje` = dia(`dataVencimento`) = dia(`agora`) e status não-terminal;
  tarefa sem `dataVencimento`, ou `CONCLUIDA`/`CANCELADA`, nunca é `atrasada`/`vencendoHoje`.
- **Alternatives considered**: comparar `Date` bruto em UTC — rejeitado porque uma tarefa
  com vencimento "hoje às 23h" em UTC já apareceria como "atrasada" horas antes do fim do
  dia local da equipe (mesmo motivo que levou a 007 a converter fuso).

## D-R4 — Pontos de gamificação como função pura

- **Decision**: `calcularPontosTarefa(estado: EstadoPontosTarefa): number` em
  `domain/tarefa/pontos.ts`, com tabela congelada `PESOS_PONTOS_TAREFA` (mesmo padrão de
  `PESOS_SCORE_LEAD`, spec 008): pontos-base por conclusão + bônus "concluída no prazo"
  (só se `dataVencimento` definida e `concluidoEm <= dataVencimento`) + bônus "checklist
  100%" (só se a tarefa tinha ao menos 1 item de checklist e todos estavam concluídos no
  momento da conclusão). O endpoint de ranking soma `calcularPontosTarefa` sobre as
  tarefas concluídas do período filtrado, agrupado por `responsavelId` — cálculo em
  memória/SQL na leitura, nunca um contador gravado.
- **Rationale**: Princípio V (agregado sempre derivado) + precedente direto de
  `calcularScore` (008) — mesma forma (`f(estado) -> número`, pesos congelados,
  determinístico, sem I/O).

## D-R5 — Dependência sem ciclos

- **Decision**: `detectarCiclo(dependenciasExistentes, novaAresta)` — função pura que
  recebe a lista de arestas já persistidas (`tarefaId -> dependeDeId`) e a aresta proposta,
  faz uma busca em profundidade a partir do destino da nova aresta procurando um caminho de
  volta à origem; encontrado → 422. Rodada **antes** do `INSERT` (leitura de todas as
  dependências da tarefa-alvo dentro da mesma transação).
- **Alternatives considered**: `CHECK` de banco — descartado porque Postgres não expressa
  "sem ciclo em grafo" via `CHECK`/FK simples; a validação de aplicação é o único caminho
  viável (mesmo racional de `validar-fluxo.ts` da 014 validar condições em memória, não no
  banco).

## D-R6 — Escopo de visão (`tarefa:ver_todas`\|`ver_proprias`)

- **Decision**: mesmo padrão de `OportunidadeConsultaService.escopoDe` (010) — filtro no
  `where`, nunca na serialização — mas com a nuance de D-08 (spec.md): `ver_proprias`
  inclui tarefas **sem** responsável (`{ OR: [{ responsavelId: sujeito }, { responsavelId:
  null }] }`), porque uma tarefa "geral" (D-07) é, por definição, de todo mundo.
- **Rationale**: literal da visão 8.10 — "gerenciador de tarefas do time, pessoal **e
  geral**" — um integrante sem `ver_todas` ainda precisa ver a fila geral do time para
  poder pegá-la para si.
