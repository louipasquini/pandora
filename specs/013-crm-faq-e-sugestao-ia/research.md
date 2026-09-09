# Research — CRM · FAQ e Sugestão de IA (spec 013)

Todas as incógnitas de `Technical Context` foram resolvidas antes da escrita deste documento;
nenhum `NEEDS CLARIFICATION` chegou até aqui (ver spec.md §Clarifications CL-01/CL-02/CL-03 —
decisões do dono do produto, 2026-09-09 — e D-01..D-06 — defaults documentados, mesmo
precedente das specs 008–012).

## D-R1 — FAQ sem vínculo de produto/campanha: lista única, versionada

**Decisão**: `faq_item` nasce como uma lista única — sem `produto_id` nem `campanha_id`
(CL-01). Toda edição de `pergunta`/`resposta` gera uma nova linha em `faq_item_versao`
(snapshot completo, não *diff*), permitindo reconstruir o histórico completo e "voltar" a
qualquer versão sem depender de recompor deltas.

**Por que uma tabela de versão dedicada, e não `crm_admin_audit`**: `crm_admin_audit`
(forma canônica do `core`, spec 007) guarda **deltas de campo** — ótimo para configuração
(nome, `ativo`, segredo definido/rotacionado), mas ruim para reconstruir "qual era o texto
completo da resposta na versão 3". Uma tabela de versão de 1ª classe, com snapshot completo
por edição, é o mesmo raciocínio já usado para conteúdo de negócio versionado no projeto
(`oportunidade_movimentacao`, `resposta_atendimento`, `transferencia_atendimento` — todos
histórico de 1ª classe, não o audit genérico) — o texto de uma resposta de FAQ é conteúdo,
não configuração.

**Por que não adiantar `produto`/`campanha` (stub ou FK solto)**: rejeitado pelo dono do
produto (spec.md CL-01). Um stub de `produto`/`campanha` criado aqui teria de ser
descartado/migrado quando as specs 023/032 chegarem com o modelo real (turma, tipo de
lançamento, etc.) — retrabalho puro. Um FK solto sem integridade referencial quebraria a
disciplina que o projeto vem seguindo desde a 001. A rota de menor atrito é a mais simples:
sem vínculo agora, coluna(s) adicionadas por uma spec futura via `ALTER TABLE` quando o
destino existir de verdade.

## D-R2 — Sugestão de IA é sempre síncrona, sobre uma `Interacao` já existente

**Decisão**: `POST /crm/atendimentos/:id/sugestoes` recebe o id de uma `Interacao` já
registrada (a mensagem da pessoa/lead selecionada pelo atendente), busca a FAQ ativa + as
definições de campo personalizado aplicáveis (de `lead` ou `pessoa`, conforme a âncora do
atendimento), monta um prompt determinístico (`montarPrompt`, pura) e chama o
`SugestaoIaClient` uma única vez, de forma síncrona. A resposta bruta é interpretada por
`interpretarRespostaIa` (pura) num formato tipado de 0..N sugestões — nunca confiada
diretamente (mesma disciplina de "parser tolerante na borda" já usada por `parseInstante`,
002, e pelos `status_map` dos adapters de ingestão).

**Por que não fila/worker**: mesmo racional de volume baixo já assumido pela 012 (~10
conversas simultâneas) — pedir uma sugestão é uma ação explícita do atendente, equivalente a
"buscar na FAQ agora", não um gatilho automático por mensagem recebida. Introduzir o padrão
`WorkerScheduler` (006) aqui adicionaria latência perceptível (o atendente teria que esperar
um próximo tick) sem nenhum ganho — a mesma rejeição já documentada pela 012 para o alerta de
SLA se aplica aqui.

**Por que a IA nunca é acionada fora de um atendimento**: D-03 (spec.md) — nenhuma varredura
em massa ou proativa. Reduz custo, reduz superfície de erro, e mantém a governança 10.6
simples: toda sugestão tem um humano do outro lado, no momento em que ela é gerada.

## D-R3 — Escrita em `pessoa` a partir do `crm`: 2ª porta de inversão de dependência do projeto

**Decisão**: nasce `PortaCampoPersonalizadoPessoa` no `core`
(`src/core/campo-personalizado-pessoa/porta-campo-personalizado-pessoa.ts`), com o mesmo
formato de `PortaIdentidade` (008) — só interface + token DI, zero lógica. A implementação
(`PortaCampoPersonalizadoPessoaAdapter`) vive em `src/clientes/infra/`, chamando
`CampoPersonalizadoPessoaService` (que por sua vez é a mesma peça reaproveitada pelo endpoint
manual `PUT /pessoas/:id/campos-personalizados`, para não haver 2 caminhos de escrita
divergentes para o mesmo dado). O módulo `@Global()` que já expõe `PORTA_IDENTIDADE`
(`identidade-wiring.module.ts`) é **renomeado** para `clientes-wiring.module.ts` /
`ClientesWiringModule` e passa a exportar as duas portas — evita multiplicar módulos de
wiring de 1 linha para cada nova porta que `clientes` expõe a outros contextos.

**Alternativas consideradas**:
- *`crm` importa `src/clientes/**` diretamente* — rejeitada: viola o Princípio VI
  explicitamente (contextos delimitados — a jusante só observa, nunca escreve no contexto
  dono) e a regra ESLint `import/no-restricted-paths` já em vigor desde a 008.
- *Gravar `pessoa_origem_ref`/evento e deixar um worker aplicar depois* — rejeitada por
  desproporcional: a gravação de um campo personalizado é uma escrita direta, pequena,
  decidida por um humano no mesmo instante (D-01) — não há nenhum cenário de
  reprocessamento assíncrono que justifique o padrão de ingestão (Princípio IV é sobre
  eventos crus de **origem externa**, não sobre toda escrita interna entre contextos).
- *Deixar campo personalizado de `pessoa` só gravável pelo endpoint manual, sem porta* —
  rejeitada: obrigaria o atendente a copiar manualmente o valor sugerido para uma tela
  separada, quebrando a UX descrita em US4 ("aceitar" grava direto) e o requisito FR-008.

## D-R4 — Credencial da Anthropic reaproveita `integracao` (spec 007), ociosa até aqui

**Decisão**: a spec 007 já modelou `integracao` (`tipo API_KEY|WEBHOOK|CONEXAO_INTERNA`,
`alvo FINANCEIRO|MARKETING|CENTRAL|EXTERNO`, segredo cifrado com `CRM_INTEGRACAO_CIFRA_KEY`,
projeção de leitura que nunca revela o segredo) prevendo consumidores futuros — a 011 optou
por um modelo dedicado (`canal_whatsapp`) por precisar de campos muito específicos
(`wabaId`, `phoneNumberId`), mas não havia, até esta spec, nenhum consumidor real da tabela
genérica. Uma única credencial de API (a chave da Anthropic) para o sistema inteiro é
exatamente o caso de uso simples para o qual `integracao` foi desenhada: uma linha
`tipo=CONEXAO_INTERNA` (o sistema chamando um serviço externo, não emitindo uma chave para
alguém nos chamar — por isso não `API_KEY`), `alvo=EXTERNO`, `nome` convencionado (ex.:
`"sugestao-ia-anthropic"`, documentado em `quickstart.md`), com o modelo (ex.: qual
`claude-*`) guardado em `config` (jsonb, sem segredo) — editável via `PATCH
/crm/admin/integracoes/{id}` já existente, sem precisar de nenhum endpoint novo para isso.

**Por que não uma chave `.env`**: uma chave `.env` (padrão `SERVICE_JWT_SECRET`,
`CRM_INTEGRACAO_CIFRA_KEY`) é apropriada para segredos de infraestrutura fixos por ambiente.
A credencial de um provedor de IA é mais parecida com uma integração de negócio administrável
(pode ser trocada, rotacionada, desativada sem redeploy) — exatamente o que `integracao` já
resolve, com auditoria (`crm_admin_audit`) e RBAC (`crm_admin:gerir_integracoes`) de graça.
**0 chave `.env` nova, 0 tabela nova, 0 permissão nova** só para a credencial.

**Como o `AnthropicSugestaoIaClient` a encontra**: busca a `integracao` `ativo=true` com o
`nome` convencionado; se ausente ou sem segredo definido, trata como falha de geração de
sugestão (FR-014 — nunca bloqueia o atendimento, apenas indica ausência de sugestão).

## D-R5 — Parser da resposta da IA: nunca confiar, sempre validar na borda

**Decisão**: o prompt (`montarPrompt`) instrui o modelo a responder em um formato JSON
estrito (lista de `{ tipo, perguntaDetectada?, conteudoSugerido, faqItemId?,
campoPersonalizadoChave?, valorSugerido? }`). `interpretarRespostaIa` faz o parse com um
schema `zod` — qualquer desvio (JSON inválido, campo obrigatório ausente, `tipo`
desconhecido, `faqItemId` que não existe mais na FAQ ativa) descarta **só aquele item**,
nunca lança exceção que derrubaria o pedido inteiro; se nada sobrar, o retorno é uma lista
vazia + motivo, e o endpoint responde "sem sugestão disponível" (FR-006/FR-014).

**Por que não confiar no modelo devolver sempre JSON perfeito**: mesma disciplina de todo
adaptador de borda do projeto (`parseInstante`, os `status_map` de ingestão) — uma API de IA
é uma fonte externa como qualquer outra, sujeita a variação de formato; o núcleo do domínio
nunca deve ver o texto bruto do provedor, só o resultado já validado.

## D-R6 — Aceitar ≠ enviar (resposta) vs. aceitar = gravar (campo personalizado)

**Decisão**, explícita para eliminar ambiguidade na fase de tasks: para `tipo=RESPOSTA`,
`POST .../aceitar` só marca `status=ACEITA` (decisão humana registrada) — o envio de fato
continua exigindo uma chamada separada a `POST /crm/atendimentos/:id/responder` (já existente
da 012), agora aceitando um `sugestaoId` opcional que, quando presente, deve apontar para uma
sugestão `ACEITA`/`tipo=RESPOSTA` daquele mesmo atendimento (senão 409), força `viaIa=true` e
grava `RespostaAtendimento.sugestaoIaId`. Para `tipo=CAMPO_PERSONALIZADO`, `POST .../aceitar`
**já grava** o valor no cadastro (lead ou pessoa, conforme a âncora) na mesma chamada — não
existe um "enviar" separado para um campo de cadastro (FR-008 é explícito: "aceitar... o que
grava o valor").

**Por que essa assimetria é intencional, não uma inconsistência**: reflete a diferença real
entre as duas ações — uma mensagem tem um passo de envio que o atendente pode querer revisar
mais uma vez / editar no composer antes de efetivamente sair para a aluna (US2); um campo de
cadastro não tem um "envio" equivalente, só um "gravar" — a própria ação de aceitar É a
confirmação humana exigida pela governança 10.6 (D-01). Documentar isso aqui evita que a fase
de tasks trate os dois fluxos como o mesmo *endpoint pattern*.
