# Research — 014-crm-workflow

Decisões técnicas de implementação (o "como") que não precisam de aprovação do dono do
produto (diferente de CL-01/CL-02 em spec.md, que já foram decididas com ele). Cada uma tem
uma alternativa considerada e rejeitada.

## D-R1 — Editor de fluxo é um formulário estruturado, não um canvas de arrastar-e-soltar

**Decisão**: o frontend representa gatilho/condições/ações como um formulário guiado
(selecionar tipo de gatilho → montar árvore de condições com selects → adicionar ações de
uma lista fechada), não um canvas livre de nós conectados por linhas.

**Motivo**: o catálogo de gatilhos/condições/ações do v1 é **fechado e pequeno** (D-04/D-07 em
spec.md) — um canvas genérico de nós/arestas resolveria um problema mais geral do que o que
existe hoje (fluxos lineares gatilho→condição→ação, sem ramificação nem paralelismo). Um
formulário estruturado é muito mais barato de construir e testar, e não fecha a porta para um
canvas visual numa spec futura se o catálogo crescer o suficiente para justificar. A palavra
"canvas" na visão (Parte 8.8, "editor visual de fluxo") é satisfeita por uma UI visual e
guiada — não exige literalmente nós arrastáveis.

**Alternativas consideradas**: biblioteca de canvas de nós (ex.: React Flow) — rejeitada por
enquanto: adicionaria uma dependência nova para resolver um problema de UI que o catálogo
atual (linear, sem ramificação) não tem; reavaliar quando o catálogo de blocos crescer.

## D-R2 — Condição avalia o estado **atual** do registro, não um snapshot histórico do evento

**Decisão**: quando o worker processa uma linha de uma trilha-fonte (ex.: uma linha de
`crm_lead_audit` indicando que um lead mudou de estágio), a condição do fluxo é avaliada
contra o estado **atual** do lead/oportunidade (uma consulta viva), não contra o valor que a
trilha capturou no momento do evento.

**Motivo**: mais simples de implementar (reaproveita os repositórios já existentes, sem
duplicar todo o estado relevante em cada linha de execução) e mais correto na prática — se o
mesmo registro mudar de novo antes do worker processar (passada atrasada), avaliar contra o
estado atual reflete a verdade mais recente, que é o comportamento que um usuário esperaria de
uma automação reativa. A idempotência (D-06) já é garantida pela chave
`(fluxo_versao_id, fonte, fonte_registro_id)`, independente de como a condição é avaliada —
reprocessar a mesma linha nunca duplica o efeito, mesmo que a condição seja reavaliada contra
um estado diferente do que existia originalmente (janela de corrida considerada aceitável,
mesmo racional de latência já aceito pelo `WorkerScheduler` da 006).

**Alternativas consideradas**: snapshot completo do registro na própria linha de execução
(ex.: reaproveitar `crm_lead_audit.valorNovo`) — rejeitada: cobre só o gatilho de lead (não
oportunidade/interação/tag), obrigaria duplicar toda a lógica de "quais campos são relevantes"
em dois lugares (na trilha de origem e na condição), e não inclui tags/score do lead no
momento do evento de qualquer forma (o `snapshot()` do `LeadService` não carrega isso).

## D-R3 — Catálogo de campos de condição é fechado por tipo de gatilho, não caminho livre

**Decisão**: cada `FluxoGatilhoTipo` tem uma lista fixa e pequena de campos avaliáveis em
condição (`camposDoGatilho(tipo)`), validada no domínio — não um caminho de acesso livre
(`dot.path`) a qualquer campo da entidade.

- `LEAD_CRIADO` / `LEAD_ESTAGIO_MUDOU` / `INTERACAO_REGISTRADA` / `TAG_APLICADA` (todos
  resolvem um `lead` — ver D-R4): `estagio`, `status`, `origem`, `temResponsavel` (booleano
  derivado de `responsavelId`), `tags` (lista de slugs), `score`.
- `OPORTUNIDADE_ETAPA_MUDOU` (resolve uma `oportunidade`): `etapaTipo` (`ABERTA`\|`GANHA`\|
  `PERDIDA`), `pipelineId`, `valorEstimadoMoeda`, `temResponsavel`.

**Motivo**: um catálogo fechado é validável no domínio (função pura, testável sem banco),
seguro contra referenciar um campo que não existe, e suficiente para os cenários de exemplo da
visão (Parte 8.8) e das histórias de usuário do spec.md. Campos personalizados (lead/
oportunidade, já existentes desde 008/010) ficam fora do catálogo de condição nesta versão —
podem entrar numa spec futura se a necessidade aparecer, sem quebrar o formato já publicado
(um fluxo publicado antes é imutável de qualquer forma).

**Alternativas consideradas**: caminho de acesso livre tipo `lead.camposPersonalizados.chave`
— rejeitada: exigiria buscar `valor_campo_lead`/`valor_campo_oportunidade` a cada avaliação
(custo extra em toda passada do worker) para um caso de uso que nenhuma história do spec.md
pede explicitamente; adicionar depois é aditivo, não é uma migração de dado.

## D-R4 — Gatilhos internos resolvem sempre `LEAD` ou `OPORTUNIDADE`, nunca `PESSOA`

**Decisão**: `FluxoRegistroTipo` tem só dois valores (`LEAD`, `OPORTUNIDADE`).
`INTERACAO_REGISTRADA` e `TAG_APLICADA` só disparam para linhas **ancoradas em `lead`**
(`interacao.lead_id IS NOT NULL` / `tag_associacao.lead_id IS NOT NULL`) — interações e tags
em `pessoa` não alimentam o Workflow nesta versão.

**Motivo**: nenhuma ação do catálogo do MVP (D-04 em spec.md) atua sobre `pessoa` (mover
estágio só existe em lead; mover etapa só existe em oportunidade). Incluir `pessoa` como um
3º `FluxoRegistroTipo` obrigaria decidir, para cada ação, o que significa aplicá-la a uma
pessoa (aplicar tag e registrar nota fariam sentido; mover estágio e mover etapa não) —
complexidade sem nenhuma história de usuário do spec.md pedindo por ela. `pessoa` como âncora
de gatilho é candidata natural de spec futura, quando (ou se) surgir uma ação que faça sentido
para ela.

**Alternativas consideradas**: incluir `PESSOA` desde já, com um subconjunto de ações válidas
menor — rejeitada por complexidade não pedida por nenhuma história desta spec (YAGNI).

## D-R5 — Um mutex por passada, sem lock a nível de banco

**Decisão**: o worker do Workflow usa o mesmo padrão de concorrência da 006 — uma *flag*
booleana em memória (`rodando`) impede que o `setInterval` sobreponha passadas, e o mesmo
método (`processarPassada()`) é chamado tanto pelo `setInterval` quanto por
`POST /crm/workflow/processar` (disparo manual/determinístico em teste). Não há lock a nível
de banco (`SELECT ... FOR UPDATE` ou equivalente).

**Motivo**: mesma decisão de escala já validada pela 006 (processo único, sem múltiplas
réplicas do backend rodando o worker simultaneamente) — reproduzir esse padrão mantém o
comportamento do sistema previsível e testável sem introduzir infraestrutura nova (fila, lock
distribuído) para um volume que nenhuma spec do roadmap até aqui exigiu.

**Alternativas consideradas**: lock a nível de linha/tabela via Postgres — rejeitado por
complexidade não justificada no volume esperado; reavaliar se o projeto passar a rodar
múltiplas réplicas do backend (fora do escopo de qualquer spec até agora).

## D-R6 — Ação que falha interrompe só aquela execução, nunca a passada inteira

**Decisão**: dentro de uma única `execucao_fluxo`, se uma ação falhar (ex.: etapa destino
removida entre a publicação do fluxo e a execução), as ações seguintes daquela mesma execução
não rodam, o resultado vira `FALHOU` com o motivo da 1ª ação que falhou — mas o worker segue
processando as demais linhas da passada (outros registros, outros fluxos) normalmente.

**Motivo**: mesmo racional já usado pelo `WorkerService` da 006 (uma etapa em erro não derruba
o processamento de outros eventos) e pelo `AtendimentoConsultaService`/serviços do CRM em
geral (uma falha pontual é isolada, nunca propagada). Interromper as ações **daquela mesma
execução** depois da 1ª falha evita efeitos parciais confusos (ex.: aplicar uma tag mas não
registrar a nota que dependia logicamente da tag já estar lá) sem impedir que o restante do
sistema continue funcionando.

## D-R7 — `fluxo_modelo` não vira `fluxo_automacao` até ser clonado

**Decisão**: `fluxo_modelo` é uma tabela própria, somente leitura para o usuário (escrita só
via seed), sem relação de herança com `fluxo_automacao`/`fluxo_automacao_versao`. "Usar como
base" lê um `fluxo_modelo` e **cria** um `fluxo_automacao` novo com uma `fluxo_automacao_versao`
em `RASCUNHO` cujo conteúdo (gatilho/condições/ações) é copiado do modelo — sem nenhum vínculo
de rastreabilidade de volta ao modelo de origem.

**Motivo**: CL-02 já decidiu "templates semeados via seed", que não têm o ciclo de vida
completo de um fluxo (não versionam, não publicam, não executam por si mesmos) — modelá-los
como uma tabela separada, mais simples, é fiel à decisão e evita ramificações no estado de
`fluxo_automacao_versao` (ex.: "essa versão é modelo ou é fluxo real?"). Não guardar o vínculo
de origem é uma simplificação deliberada — nenhuma história do spec.md pede rastreabilidade de
"a partir de qual modelo este fluxo nasceu".

## D-R9 — Cursor novo começa em "agora", nunca varre o histórico anterior

**Decisão**: quando o worker vê uma fonte pela 1ª vez (sem linha em
`fluxo_cursor_fonte`), ele **não** processa nenhuma linha nessa passada —
grava um cursor inicial em "agora" e só passa a processar linhas criadas
**depois** desse instante, a partir da próxima passada.

**Motivo**: descoberto durante a implementação (T019). O design original
("sem linha = nunca varrida, varre desde o início da tabela-fonte na 1ª
passada", como registrado inicialmente em data-model.md) implicava que
publicar o 1º fluxo do sistema desencadearia uma varredura de **todo** o
histórico já acumulado daquela trilha — em produção, isso significaria uma
ativação retroativa em massa sobre leads/interações/tags antigos, o oposto
do que qualquer história do spec.md pede ("reage a um evento", não "reage à
minha base inteira quando eu ligo o motor pela 1ª vez"); em teste, com o
schema Postgres compartilhado **por execução** (não por arquivo,
`jest-e2e.config.ts`), o mesmo problema aparece amplificado — a 1ª passada
processaria o histórico acumulado por **todos** os arquivos e2e já rodados
naquela execução, tornando o teste lento e imprevisível. Estabelecer a
linha de partida em "agora" resolve os dois: só o que acontece **depois**
de o Workflow estar ativo é elegível a disparar um fluxo.

**Alternativas consideradas**: paginar o histórico inteiro até alcançar o
presente — rejeitada (é exatamente o comportamento indesejado, só mais
lento); um flag "processar histórico" por fluxo — fora do escopo de
qualquer história do spec.md, YAGNI.

## D-R8 — `EVENTO_EXTERNO` não tem `fluxo_cursor_fonte`

**Decisão**: a tabela `fluxo_cursor_fonte` só tem linhas para as 5 fontes realmente varridas
pelo worker (`LEAD_CRIADO`, `LEAD_ESTAGIO_MUDOU`, `OPORTUNIDADE_ETAPA_MUDOU`,
`INTERACAO_REGISTRADA`, `TAG_APLICADA`). `EVENTO_EXTERNO` reaproveita o mesmo enum
`FluxoGatilhoTipo` só como rótulo de configuração do fluxo (CL-01) — nunca aparece como
`fonte` de uma varredura nem de uma `execucao_fluxo`.
