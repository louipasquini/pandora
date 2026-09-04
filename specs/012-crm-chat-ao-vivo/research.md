# Research — CRM · Chat ao Vivo (spec 012)

Todas as incógnitas de `Technical Context` foram resolvidas antes da escrita deste
documento; nenhum `NEEDS CLARIFICATION` chegou até aqui (ver spec.md §Clarifications
CL-01/CL-02 — decisões do dono do produto, 2026-09-04 — e D-01..D-08 — defaults
documentados, mesmo precedente das specs 008–011).

## D-R1 — Atendimento como camada sobre `interacao`, não uma 2ª timeline

**Decisão**: `Atendimento` é uma tabela de agrupamento/estado (fila, prioridade, atendente
atual, SLA, CSAT) que se conecta à timeline **já existente** através de uma coluna nullable
`interacao.atendimento_id`. Nenhuma mensagem é copiada, reescrita ou duplicada — o mesmo
registro `Interacao` criado pela 009 (diretamente ou via o webhook da 011) simplesmente
ganha uma tag apontando para o atendimento ao qual pertence.

**Alternativas consideradas**:
- *Tabela de mensagens paralela dentro de `atendimento`* — rejeitada: duplicaria o que
  `interacao` já resolve (conteúdo, direção, autor, canal, timeline unificada por
  pessoa/lead) e quebraria a garantia de "1 timeline só" que a 009 estabeleceu.
  Especificamente proibido pelo `CLAUDE.md` desta spec ("camada em cima da timeline, não
  substituição dela").
- *Tabela de junção `atendimento_interacao (atendimento_id, interacao_id)`* — avaliada como
  mais "pura" (não altera `Interacao`), mas rejeitada por custo/benefício: com volume baixo
  (CL-02) o ganho de não tocar `Interacao` não compensa a complexidade extra de sempre fazer
  um JOIN a mais para montar a timeline de um atendimento; uma coluna nullable é exatamente
  o mesmo padrão já usado por `Lead.responsavelId`/`Oportunidade.pessoaId` (FK direta no
  schema compartilhado, sem cruzar fronteira de módulo TypeScript — Princípio VI é sobre
  import de código, não sobre o desenho do schema).

## D-R2 — Endereçamento por carga (CL-01): pool de candidatos e desempate

**Decisão**: o pool de candidatos ao endereçamento automático são os membros **ativos**
(`equipe_membro.saiuEm IS NULL`) de toda `equipe` com `tipo = ATENDIMENTO` e `ativo = true`
que esteja **em expediente no momento** (`estaEmExpediente(agora, {janelas, feriados,
equipe})`, spec 007 — sem novo conceito de expediente). Para cada candidato, a "carga atual"
é `COUNT(atendimento WHERE atendenteAtualId = candidato AND status = EM_ATENDIMENTO)` —
sempre uma consulta ao estado atual, nunca um contador incrementado/decrementado
manualmente. `escolherAtendentePorCarga` (função pura) recebe a lista já materializada
`{usuarioId, cargaAtual}[]` e devolve quem tem a menor carga; **empate é resolvido pelo
menor `usuarioId`** (comparação lexicográfica de string) — uma escolha arbitrária mas
**determinística e testável**, documentada aqui exatamente pelo mesmo motivo que a 010
documentou o cursor de rodízio: alguma regra de desempate é necessária, e "sempre a mesma
para a mesma entrada" é o requisito real, não qual regra especificamente.

**Por que não round robin nem aleatório**: CL-01 exclui ambos explicitamente. Round robin
(cursor persistido, como o `pipeline.ultimoAtribuidoUsuarioId` da 010) foi cogitado por
paralelismo com a 010, mas rejeitado porque o pedido do dono do produto é por **carga
observada agora**, não por posição na fila de rotação — os dois só coincidem se todos os
atendentes atenderem em velocidade idêntica, o que não é uma suposição segura para
atendimento humano.

**Escopo por equipe (D-07 do spec)**: reaproveita o `EquipeTipo` enum já existente desde a
007 (`COMERCIAL|ATENDIMENTO|CS`) — `ATENDIMENTO` já foi modelado exatamente para este
propósito, então usá-lo aqui é a leitura mais direta do schema existente, não uma decisão
nova de verdade.

## D-R3 — SLA e alerta sempre derivados; rejeição explícita do `WorkerScheduler`

**Decisão**: `calcularSlaAtendimento(atendimento, agora)` é uma função pura que, a cada
chamada, decide `estourado`/`minutosRestantes` a partir de `abertoEm`, `primeiraRespostaEm`
e `slaMinutos` — nunca uma coluna booleana gravada. O "alerta" desta spec é esse resultado
sendo mostrado na fila/inbox a cada consulta (SC-002).

**Por que não reusar o padrão `WorkerScheduler` da spec 006** (`setInterval` in-house,
0 dep, configurável, desligado em teste — cogitado porque o `CLAUDE.md` desta spec cita
esse precedente como "se precisar"): com volume baixo (CL-02, até ~10 conversas
simultâneas), calcular o SLA de cada atendimento aberto a cada leitura da fila é
computacionalmente trivial (uma subtração de datas por linha, sobre no máximo dezenas de
linhas) — não há necessidade de pré-computar nem cachear nada em um job periódico. Um job
de fundo aqui adicionaria: (a) mais um processo a operar/testar/desligar em teste, (b) uma
janela de defasagem entre o job rodar e o estado real (exatamente o tipo de "coluna que pode
divergir" que o Princípio VII quer evitar), sem nenhum ganho mensurável no volume alvo desta
spec. Notificação **ativa** (e-mail/Slack/push) de estouro de SLA — que *exigiria* algo
rodando em segundo plano para nao depender de alguém olhar a tela — está fora do escopo
desta spec (ver spec.md §Assumptions) porque nenhuma infraestrutura de notificação existe
ainda no projeto; se um dia for pedida, ela consome exatamente esta mesma função pura como
gatilho, sem precisar redesenhar o cálculo de SLA.

## D-R4 — Histórico de 1ª classe para transferência e "quem respondeu, com/sem IA"

**Decisão**: `transferencia_atendimento` (append-only, 1 linha por transferência) e
`resposta_atendimento` (1:1 por interação de saída dentro de um atendimento, guardando
`atendenteId` + `viaIa`) são tabelas de domínio próprias, não `crm_admin_audit`.

**Rationale**: `crm_admin_audit` (007) existe para **configuração administrativa** de baixo
volume (equipes, expediente, integrações) — um log genérico `{entidade, campo, valorAnterior,
valorNovo}`. "Quem respondeu e se foi com IA" e "de quem para quem, com qual motivo" são
**fatos de negócio consultáveis** (relatório de desempenho por atendente, taxa de uso de IA,
tempo até transferência) que merecem colunas tipadas e índices próprios — exatamente o
raciocínio que a spec 010 já registrou para `oportunidade_movimentacao` não ser o audit
genérico. Reaproveitar `crm_admin_audit` aqui obrigaria a extrair `viaIa`/`atendenteId` de
um `Json` genérico toda vez que alguém quisesse consultar esse histórico — o mesmo
anti-padrão que 010 já rejeitou.

**Alternativas consideradas**: gravar `viaIa` como coluna direto em `Interacao` — rejeitada
porque poluiria o contrato canal-agnóstico de `Interacao` (009) com um conceito que só faz
sentido dentro de um atendimento; um NPS/nota/e-mail avulso nunca tem "via IA". Uma coluna
opcional em uma tabela de detalhe **específica de atendimento** (`resposta_atendimento`,
mesma disciplina de `mensagem_whatsapp` como detalhe 1:1 de uma `Interacao` tipo WHATSAPP)
mantém `Interacao` limpa.

## D-R5 — CSAT reaproveita `interacao` tipo `NPS`

**Decisão**: nenhuma tabela nova para CSAT. `Atendimento.csatSolicitadoEm` marca o instante
em que a pesquisa foi disparada (ao encerrar); a resposta é uma `Interacao` com
`tipo = 'NPS'`, `notaNps` 0–10 (contrato já validado por `validarCamposPorTipo`, 009),
`atendimentoId` = o atendimento encerrado. Descobrir "a nota de CSAT de um atendimento" é
uma leitura (`interacao WHERE atendimentoId = ? AND tipo = 'NPS'`), nunca uma cópia.

**Captura automática via WhatsApp**: `interpretarRespostaCsat(texto) -> number | null`
(pura — aceita só um inteiro 0–10, isolado ou com espaços/pontuação simples ao redor;
qualquer outra coisa devolve `null`). O `webhook-whatsapp.service.ts` (011), ao processar
uma mensagem recebida, primeiro verifica se existe um atendimento `ENCERRADO` **recente**
(mesma pessoa/lead, mesmo canal, `csatSolicitadoEm` preenchido, ainda sem `Interacao` tipo
`NPS` associada) e se o texto recebido interpreta como nota; se sim, grava como `NPS`
+ `atendimentoId` em vez do fluxo padrão (`WHATSAPP` + reabrir/anexar a um atendimento).
Texto que não interpreta como nota segue o fluxo normal (edge case do spec.md: "vira
interação comum, sem travar o fluxo") — inclusive pode reabrir um atendimento novo se a
pessoa continuar a conversa.

**Elegibilidade** (`csatElegivel`): pura — `status === 'ENCERRADO' && csatSolicitadoEm !=
null && !jaTemResposta`.

## D-R6 — Resposta automática fora do expediente

**Decisão**: reaproveita só `estaEmExpediente` (007). O texto vem de
`Equipe.mensagemForaExpediente` (coluna nova, nullable) em qualquer equipe `ATENDIMENTO`
ativa — quando mais de uma equipe tem o campo preenchido, usa-se a primeira por `nome` (
ordem alfabética, escolha arbitrária documentada, já que só se aplica quando **nenhuma**
equipe está em expediente — não há "equipe certa" a preferir nesse instante). Enviado só
para canal `WHATSAPP` (o único com envio automatizado disponível — 011); enviado no máximo
1× por atendimento, controlado verificando se já existe alguma `Interacao` de saída
(`direcao = SAIDA`, `autorId IS NULL`) associada ao atendimento antes de disparar de novo.
Não marca `primeiraRespostaEm` (D-04 do spec — não é uma resposta humana).

**Por que não uma tabela de configuração nova**: uma coluna opcional na `Equipe` já
existente é a superfície de escrita mínima (Princípio VIII) — criar uma entidade
`configuracao_atendimento` só para 1 campo de texto seria complexidade desnecessária dado o
volume/escopo desta spec.

## D-R7 — Volume baixo (CL-02): sem fila/broker, índices comuns bastam

**Decisão confirmada com o dono do produto**: até ~10 conversas simultâneas. Nenhuma
infraestrutura de mensageria (Redis, RabbitMQ, BullMQ etc.) é introduzida; todas as consultas
de fila/roteamento são `SELECT`s diretos com índices `(status, prioridade, abertoEm)` e
`(atendenteAtualId, status)` — nunca precisando paginar mais que algumas dezenas de linhas
por consulta. Esta suposição é herdada explicitamente pela spec 015 (Disparos), que deve
revisitar o volume antes de assumir o mesmo modelo para envio em massa.

## D-R8 — Zero dependências novas

Roteamento, SLA, fila e interpretação de CSAT são funções puras em TypeScript. Envio
continua saindo por `EnvioWhatsappService`/`GraphApiClient` (011, `fetch` nativo). Nenhuma
biblioteca nova em nenhum dos dois workspaces — mesma disciplina "0 dep nova" das specs
007–011.
