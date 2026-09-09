# 014 — CRM · Workflow (Motor de Automação)

Oitava fatia da **Fase 1 (CRM)** — motor de automação em blocos gatilho → condições (E/OU)
→ ações (visão Parte 8.8). Mora no _bounded context_ **`crm`** (já não-vazio desde a
007–013).

Spec, plano, pesquisa, modelo de dados e contratos:
[`specs/014-crm-workflow/`](../specs/014-crm-workflow/).

`CONTEXT_MODULES` segue com **11**. **12ª migração de negócio**
(`20260909140116_crm_workflow`) — 5 tabelas novas (`fluxo_automacao`,
`fluxo_automacao_versao`, `execucao_fluxo`, `fluxo_modelo`, `fluxo_cursor_fonte`) + 4 enums.
**0 dependência nova.** **0 chave `.env` de segredo nova** (só 3 variáveis de configuração
do worker, sem segredo — `CRM_WORKFLOW_WORKER_ENABLED`/`_INTERVALO_MS`/`_LOTE`, mesmo padrão
de `INGESTAO_WORKER_*`). **+1 permissão** de catálogo (`crm_admin:gerir_workflow`; leitura
reaproveita `crm_admin:ver`). **~16 endpoints autenticados, 0 endpoint público novo.**

---

## Decisões do dono do produto (2026-09-09, resolvidas antes do `spec.md`)

Duas decisões bloqueavam esta spec — resolvidas com o dono do produto antes de qualquer
código:

- **Gatilho por evento externo fica só modelado.** "Pagamento aprovado"/"inscrição em
  lançamento" dependem do Financeiro (`transacao`/`status_canonico`, spec 018+) e do
  Catálogo (`janela_lancamento`, spec 023+), nenhum dos dois existe ainda. O enum
  `FluxoGatilhoTipo` ganha `EVENTO_EXTERNO` como valor reservado — um fluxo pode ser
  configurado com ele, mas **nunca executa de fato** nesta versão. Mesmo padrão de
  deferimento já usado por `PortaObservacaoPagamentoCrm` (spec 010).
- **Biblioteca de automações prontas é semeada via seed.** `fluxo_modelo` é uma tabela
  somente leitura para o usuário, populada por `prisma/seed.ts` (3 modelos de partida) —
  "usar como base" clona o conteúdo para um fluxo novo em rascunho, sem vínculo de
  rastreabilidade de volta ao modelo.

## Por que o worker nunca varre o histórico na 1ª passada (D-R9)

A decisão mais importante descoberta **durante a implementação**, não no planejamento: um
cursor novo (`fluxo_cursor_fonte` sem linha para aquela fonte) não processa nada na 1ª vez
— só grava a linha de partida em "agora" e passa a varrer só o que acontece **depois**
disso. A versão original do design ("sem linha = varre desde o início da tabela") teria
disparado uma avalanche retroativa sobre todo o histórico de leads/interações/tags já
existentes assim que o 1º fluxo fosse publicado — o oposto de "reage a um evento". Publicar
um fluxo nunca reage ao passado, só ao futuro. Ver `research.md` D-R9.

## Por que o worker é uma cópia estrutural do da `ingestao` (006), não uma dependência dele

O `WorkerScheduler`/`WorkerService` desta spec (`backend/src/crm/application/workflow/`)
seguem **exatamente** o mesmo padrão de concorrência da 006 (`setInterval` in-house, mutex
`rodando` por passada única, endpoint de disparo manual determinístico para e2e) — mas são
uma classe nova e independente, sem importar nada de `src/ingestao/`. O domínio é mais
simples (sem pipeline de 6 etapas por evento; uma fonte → avaliar condição → rodar ações em
sequência, para na 1ª falha) e não haveria ganho em generalizar os dois workers numa
abstração comum sem um 3º caso de uso pedindo por isso (YAGNI).

## Por que nenhuma ação precisou de porta nova no `core`

Diferente das specs 008/013 (`PortaIdentidade`, `PortaCampoPersonalizadoPessoa`), todas as
entidades que uma ação do Workflow toca — `lead`, `oportunidade`, `tag`, `interacao` — já
vivem dentro do próprio bounded context `crm`. Cada executor de ação
(`executar-acao.service.ts`) chama **exatamente** o serviço já existente que uma ação manual
equivalente usaria: `TagService.associar`/`desassociar` (009, já idempotente e já audita),
`RegistrarInteracaoService.registrar` (009, porta in-process já pensada para consumidores
internos), `MovimentacaoRepository.mover` + `validarMovimento` (010, incluindo a regra de
motivo obrigatório em etapa `PERDIDA`), e `LeadRepository.atualizar` +
`CrmLeadAuditService.registrar` + `LeadScoreService.recalcular` (008) para mudar estágio.
Nenhum caminho de escrita paralelo — a trilha de auditoria de uma ação disparada pelo
Workflow é **idêntica** à de uma ação manual, só com o ator `sistema:workflow` no lugar de
um usuário.

## Idempotência: por que a chave é `(fluxo_versao_id, fonte, fonte_registro_id)`

`execucao_fluxo` tem um índice único nessa tripla — reprocessar a mesma linha-fonte
(reinício do processo, `POST /crm/workflow/processar` manual coincidindo com o
`setInterval`) para a mesma versão de fluxo nunca cria uma 2ª execução nem duplica o efeito
de uma ação já aplicada. As ações reaproveitadas (`TagService`, `RegistrarInteracaoService`)
já são idempotentes por construção, então a garantia é dupla — mas a chave de execução é a
que importa para nunca **tentar de novo** uma ação que já rodou (evitando, por exemplo,
"aplicar tag" e "remover tag" alternando em reprocessamentos fora de ordem).

## Catálogo fechado de gatilhos, condições e ações (v1)

| Gatilho | Resolve | Fonte (trilha append-only) |
| --- | --- | --- |
| `LEAD_CRIADO` | `LEAD` | `crm_lead_audit` (`campo='criado'`) |
| `LEAD_ESTAGIO_MUDOU` | `LEAD` | `crm_lead_audit` (`campo='estagio'`) |
| `OPORTUNIDADE_ETAPA_MUDOU` | `OPORTUNIDADE` | `oportunidade_movimentacao` |
| `INTERACAO_REGISTRADA` | `LEAD` | `interacao` (só `lead_id IS NOT NULL`) |
| `TAG_APLICADA` | `LEAD` | `tag_associacao` (só `lead_id IS NOT NULL`) |
| `EVENTO_EXTERNO` | — | nenhuma (nunca executa, CL-01) |

Nenhum gatilho interno resolve `PESSOA` nesta versão (research.md D-R4) — nenhuma ação do
catálogo do MVP faz sentido para uma pessoa (mover estágio só existe em lead; mover etapa só
em oportunidade). Ações: `MOVER_LEAD_ESTAGIO`, `APLICAR_TAG`, `REMOVER_TAG`,
`REGISTRAR_NOTA` (compatíveis com todo gatilho de `LEAD`); `MOVER_OPORTUNIDADE_ETAPA`
(só `OPORTUNIDADE_ETAPA_MUDOU`) — validado contra o catálogo em duas camadas: forma
(domínio puro, ao salvar o rascunho) e regra de negócio dependente de banco (motivo
obrigatório para etapa `PERDIDA`, checado ao publicar).

## Simulação nunca escreve (D-03)

`SimulacaoService` reaproveita o **mesmo** `ContextoRegistroService` que o worker usa para
avaliar condições reais — garantindo que simular e executar nunca divirjam no que uma
condição "vê" — mas nunca chama `ExecutarAcaoService`. O resultado (`gatilhoCompativel`,
`condicaoSatisfeita`, `acoesQueSeriamDisparadas`) é só leitura.

## Frontend

`frontend/src/workflow/`: **CRM · Workflow** (`FluxosPage.tsx`, atrás de `crm_admin:ver`) —
lista com status derivado (rascunho/publicado/arquivado); `FluxoDetalhePage.tsx` — editor de
gatilho (select fechado) + condições (lista de linhas campo/operador/valor combinadas por
E/OU — um formulário guiado, não um canvas de nós livres, ver research.md D-R1) + ações
(catálogo fechado por gatilho) + Salvar rascunho/Publicar/Arquivar (condicionados a
`crm_admin:gerir_workflow`) + `SimulacaoPanel.tsx` embutido + aba `ExecucoesTab.tsx`;
`ModelosPage.tsx` — biblioteca de modelos + "usar como base". Hooks TanStack Query inline
nos componentes, mesmo padrão de `whatsapp/WhatsappAdminPage.tsx`.

## Testes

30 testes unitários backend novos (domínio puro `crm/domain/workflow/` — sem banco:
`avaliarCondicao` por operador/grupos E-OU/aninhamento/campo ausente; `camposDoGatilho`/
`acoesCompativeis` por gatilho; `validarCondicoes`/`validarAcoes`/`validarParaPublicar`; +1
no catálogo RBAC) + 14 e2e novos (Postgres real: ciclo de vida do fluxo com D-01 e FR-015,
simulação sem efeito colateral, execução reativa com idempotência D-06 e falha isolada D-R6,
biblioteca de modelos, guard/escopo) + 12 frontend novos (`FluxosPage`, `FluxoDetalhePage`,
`ModelosPage`) — **499 unitários / 272 e2e / 102 frontend**, todos verdes; lint/typecheck/
build limpos nos dois workspaces. Validado também manualmente no navegador: criar fluxo,
configurar gatilho/condição/ação, publicar, simular contra um lead real (sem efeito),
disparar o gatilho de verdade e confirmar a tag aplicada automaticamente pelo worker de
fundo, conferir a execução no histórico, clonar um modelo da biblioteca.
