# 012 — CRM · Chat ao Vivo

Sexta fatia da **Fase 1 (CRM)** — inbox de atendimento ao vivo (visão Parte 8.5/8.12),
construída **sobre** a timeline de `interacao` unificada (spec 009) e o canal WhatsApp já
conectado (spec 011). Mora no _bounded context_ **`crm`** (já não-vazio desde a
007/008/009/010/011).

Spec, plano, pesquisa, modelo de dados e contratos:
[`specs/012-crm-chat-ao-vivo/`](../specs/012-crm-chat-ao-vivo/).

`CONTEXT_MODULES` segue com **11**. **10ª migração de negócio**
(`20260904180825_crm_atendimento`) — 3 tabelas + 3 enums + 2 colunas em tabelas já
existentes (`interacao.atendimento_id`, `equipe.mensagemForaExpediente`/
`slaPrimeiraRespostaMinutos`). **0 dependência nova.** **Nenhuma variável de ambiente
nova.** **+6 permissões** de catálogo (`atendimento:{ver_todos,ver_proprios,atender,
transferir,encerrar}`, `crm_admin:gerir_atendimento`). **~16 endpoints autenticados, 0
endpoint público novo** (reaproveita o webhook já existente da 011).

---

## Decisões do dono do produto (2026-09-04, resolvidas antes do `spec.md`)

As duas decisões que bloqueavam esta spec no `ROADMAP.md` (⚠ clarify) foram resolvidas
diretamente com o dono do produto antes de qualquer código:

- **Endereçamento**: por **carga/disponibilidade** — nunca aleatório, nunca round robin
  puro. Entre os atendentes disponíveis (em expediente, mesma função pura da spec 007), o
  sistema escolhe quem tem menos conversas em andamento **agora**, um cálculo sempre
  recalculado no instante da atribuição (Princípio V).
- **Volume esperado**: baixo — até ~10 conversas simultâneas. Sem infraestrutura de fila/
  broker de mensagens; um modelo relacional direto com índices comuns basta. Suposição
  herdada pela spec 015 (Disparos).

## Por que `atendimento` não é uma 2ª tabela de mensagens

`interacao` (spec 009) já é a timeline unificada e agnóstica de canal — WhatsApp (011) já
produz linhas `WHATSAPP` nela via `RegistrarInteracaoService`. Duplicar isso numa tabela de
mensagens dentro de `atendimento` reintroduziria exatamente o problema que a 009 resolveu
(uma 2ª fonte de verdade para "o que foi dito"). Em vez disso, `atendimento` é só um
**agrupador de estado** (fila, prioridade, atendente/equipe atual, SLA, CSAT) e
`interacao` ganha uma coluna nullable `atendimentoId` — a mesma disciplina de FK direta já
usada por `Lead.responsavelId`/`Oportunidade.pessoaId` (008/010), sem cruzar nenhuma
fronteira de módulo TypeScript (Princípio VI é sobre import de código, não sobre o desenho
do schema). Nenhuma mensagem é copiada, reescrita ou duplicada — `GET
/crm/atendimentos/:id/timeline` é uma leitura filtrada da mesma `interacao` de sempre.

## Endereçamento e SLA — funções puras, sem contador nem job de fundo

`escolherAtendentePorCarga` (`crm/domain/atendimento/roteamento.ts`) recebe uma lista já
materializada `{usuarioId, cargaAtual}[]` — a "carga atual" é sempre uma contagem **ao
vivo** (`COUNT` de `Atendimento WHERE atendenteAtualId = X AND status = EM_ATENDIMENTO`),
nunca um contador incrementado/decrementado manualmente. Empate é resolvido pelo menor
`usuarioId` — desempate arbitrário mas determinístico, mesmo racional do cursor de rodízio
da spec 010, só que aqui a regra em si (menor carga observada) é o que o dono do produto
pediu, não uma rotação cega.

`calcularSlaAtendimento` (`crm/domain/atendimento/sla.ts`) é igualmente pura —
`f(abertoEm, primeiraRespostaEm, slaMinutos, agora) → {estourado, minutosRestantes}` — e é
recalculada em **toda** leitura de fila/detalhe, nunca uma coluna. Dado o volume baixo
(até ~10 conversas simultâneas, decisão do dono do produto), o padrão `WorkerScheduler` da
spec 006 (`setInterval` in-house) foi deliberadamente **rejeitado** aqui: calcular o SLA de
cada atendimento aberto a cada leitura da fila é computacionalmente trivial nesse volume, e
um job de fundo só adicionaria mais um processo a operar/testar/desligar em teste e uma
janela de defasagem entre o job rodar e o estado real — exatamente o tipo de "coluna que
pode divergir" que o Princípio VII quer evitar. Ver `research.md` (D-R3) para o raciocínio
completo, incluindo o que mudaria se um dia for pedida notificação ativa (e-mail/Slack).

## CSAT reaproveita `interacao` tipo `NPS` — nenhuma tabela nova

A pesquisa de satisfação não é uma entidade nova: é a mesma `interacao` tipo `NPS`
(`notaNps` 0–10) já suportada desde a spec 009, marcada com o `atendimentoId` do
atendimento encerrado. `Atendimento.csatSolicitadoEm` marca quando a pesquisa foi
disparada (ao encerrar); a nota pode ser lançada manualmente (`POST
/crm/atendimentos/:id/csat`) ou capturada automaticamente: o webhook do WhatsApp (011,
editado), ao receber uma mensagem, verifica primeiro se há um atendimento `ENCERRADO`
recente elegível para CSAT e se o texto interpreta como uma nota 0–10
(`interpretarRespostaCsat`, pura) — se sim, grava como `NPS` em vez do fluxo padrão de
mensagem; texto que não interpreta como nota segue normalmente (pode até reabrir um novo
atendimento, se a conversa continuar).

## "Quem respondeu, com/sem IA" — histórico de 1ª classe, não audit genérico

`resposta_atendimento` é um detalhe 1:1 de cada `Interacao` de saída dentro de um
atendimento (mesma disciplina de `mensagem_whatsapp`, 011, como detalhe 1:1 de uma
`Interacao`), guardando `atendenteId` + `viaIa`. `transferencia_atendimento` é um
histórico append-only análogo. Nenhuma das duas reaproveita `crm_admin_audit` — esse é
para configuração administrativa de baixo volume (equipes, expediente, integrações,
canal/template de WhatsApp); "quem respondeu com IA" e "de quem para quem, por quê" são
fatos de negócio consultáveis (relatório de desempenho, taxa de uso de IA) que merecem
colunas tipadas, exatamente o mesmo raciocínio que a spec 010 já registrou para
`oportunidade_movimentacao` não ser o audit genérico.

## Resposta automática fora do expediente — reusa só `estaEmExpediente`

Nenhum segundo conceito de expediente foi criado. O texto é uma coluna opcional nova em
`Equipe` (`mensagemForaExpediente`) — configurável só para equipes `tipo = ATENDIMENTO`,
sob `crm_admin:gerir_atendimento`. Enviada apenas para canal WhatsApp (o único com envio
automatizado hoje), no máximo 1× por atendimento, e **nunca** conta como a primeira
resposta humana para efeito de SLA — a checagem de "já enviei o aviso automático deste
atendimento?" verifica se já existe uma `Interacao` de saída sem autor humano
(`autorId: null`), sem precisar de uma coluna dedicada.

## Reuso máximo do que já existia

- **`estaEmExpediente`** (007, `crm/domain/expediente.ts`) — endereçamento e resposta
  automática fora do expediente usam exatamente a mesma função pura, sem segundo conceito.
- **`RegistrarInteracaoService`**/`validarAncora`/`validarCamposPorTipo` (009) — toda
  mensagem de um atendimento (WhatsApp ou manual) segue sendo uma `interacao` comum.
- **`EnvioWhatsappService`/`GraphApiClient`** (011) — responder um atendimento de canal
  WhatsApp chama o mesmo serviço de envio já existente (mesma validação de janela de 24h/
  template, sem regra nova); a resposta automática fora do expediente reusa o mesmo
  caminho.
- **`EquipeRepository`/`equipe_membro` ativo** (007) — pool de candidatos ao endereçamento.
- **`TimelineInteracoes`** (009, frontend) — a conversa de um atendimento reaproveita o
  mesmo componente em modo leitura para mostrar o histórico completo da pessoa/lead, além
  só do que aquele atendimento específico gerou.

## RBAC (spec 004 estendido)

| Permissão | O que libera |
| --- | --- |
| `atendimento:ver_todos` | Ver todos os atendimentos (fila e em andamento de qualquer atendente) |
| `atendimento:ver_proprios` | Ver apenas os atendimentos do próprio atendente |
| `atendimento:atender` | Assumir, responder e registrar CSAT |
| `atendimento:transferir` | Transferir atendimentos |
| `atendimento:encerrar` | Encerrar atendimentos |
| `crm_admin:gerir_atendimento` | Configurar SLA de 1ª resposta e mensagem fora do expediente por equipe |

`administrador`/credencial de serviço concedem de graça — **0 migração de dados/seed**.

## Endpoints

- **Operação** (`/crm/atendimentos/**`): `POST` (canal manual), `GET` (fila, filtros
  `status`/`prioridade`/`equipeId`/`mine`), `GET /:id`, `GET /:id/timeline`,
  `GET /:id/transferencias`, `POST /:id/assumir`, `POST /:id/responder`,
  `POST /:id/transferir`, `POST /:id/encerrar`, `POST /:id/csat`.
- **Admin** (`/crm/admin/atendimento/equipes/:equipeId`): `GET`/`PATCH` (SLA + mensagem
  fora do expediente).
- Nenhum endpoint público novo — o webhook do WhatsApp (`/webhooks/whatsapp`, 011)
  continua sendo o único ponto de entrada externo, agora também abrindo/reaproveitando
  `atendimento` e detectando CSAT.

## Testes

454 testes unitários backend (31 novos de domínio puro: endereçamento por carga, SLA,
priorização de fila, elegibilidade/interpretação de CSAT — todos sem banco, +1 asserção
estendida em `catalogo.spec.ts`) + 245 e2e (23 novos: criação/reuso de atendimento por
âncora+canal, endereçamento por carga com equipe em expediente, fila sem ninguém
disponível, SLA estourado/não-estourado, responder fora de escopo/status, transferência
preservando a timeline, CSAT manual e via webhook, resposta automática fora do expediente
1× por atendimento, configuração administrativa por equipe, guard 401/403, escopo
`ver_proprios`, catálogo) — suíte completa 003–012, todos verdes. `crm-whatsapp.e2e-
spec.ts` (011) e `crm-admin.e2e-spec.ts` (007) foram atualizados: o webhook agora também
cria `Atendimento` como efeito colateral de toda mensagem de entrada, então a limpeza entre
testes precisou aprender sobre as tabelas novas antes de apagar `canalWhatsapp`/`equipe`
(FK `onDelete: Restrict`). Frontend: 83 testes (7 novos, `AtendimentoInboxPage.test.tsx` +
`AtendimentoAdminPage.test.tsx`), todos verdes. Lint/typecheck/build limpos nos dois
workspaces.

## Frontend

`frontend/src/atendimento/`: **CRM · Chat ao Vivo** (`AtendimentoInboxPage.tsx`, atrás de
`atendimento:ver_todos`\|`atendimento:ver_proprios`) — fila ordenada por prioridade/tempo
de espera com indicador de SLA (`FilaAtendimento.tsx`) à esquerda, conversa selecionada à
direita (`ConversaAtendimento.tsx`: assumir/responder/transferir/encerrar condicionados à
permissão, badge de CSAT, composer de resposta próprio — que passa por
`POST /crm/atendimentos/:id/responder`, não pela porta genérica de `interacao` — mais
`TimelineInteracoes` (009) em modo leitura para o histórico completo da pessoa/lead).
`TransferirModal.tsx` para a ação de transferência. `AtendimentoAdminPage.tsx` — SLA/
mensagem fora do expediente por equipe, atrás de `crm_admin:gerir_atendimento`. Hooks
TanStack Query inline nos componentes — mesmo padrão de `whatsapp/WhatsappAdminPage.tsx`
(011). **0 dependência nova** — testes usam `fireEvent` (mesmo padrão de
`pipelines/PipelinesPage.test.tsx`), não `@testing-library/user-event` (não é dependência
do projeto).

**Escopo cortado deliberadamente**: um seletor de atendente/equipe com busca por nome no
modal de transferência (hoje aceita o id diretamente) fica para uma iteração futura de
UX — não bloqueia a ação em si, e nenhuma spec futura depende dela.
