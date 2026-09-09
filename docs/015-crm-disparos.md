# 015 — CRM · Disparos (WhatsApp)

Nona fatia da **Fase 1 (CRM)** — envio em massa de WhatsApp por segmento e/ou lista
importada de contatos (visão Parte 8.6). Mora no _bounded context_ **`crm`** (já não-vazio
desde a 007–014), construído **sobre** a infraestrutura de canal/template/mensagem já
existente da spec 011 e sobre `Segmento` da spec 009 — nenhuma tabela paralela de canal,
template ou mensagem.

Spec, plano, pesquisa, modelo de dados e contratos:
[`specs/015-crm-disparos/`](../specs/015-crm-disparos/).

`CONTEXT_MODULES` segue com **11**. **13ª migração de negócio**
(`20260909171024_crm_disparos`) — 3 tabelas novas (`execucao_disparo`,
`disparo_contato_importado`, `mensagem_disparo`) + 3 enums (`ExecucaoDisparoStatus`,
`MensagemDisparoStatus`, `DisparoVariante`). **0 dependência nova.** **0 chave `.env` de
segredo nova** (4 variáveis de configuração do worker, sem segredo —
`CRM_DISPAROS_WORKER_ENABLED`/`_INTERVALO_MS`/`_LOTE`/`_MAX_TENTATIVAS`, mesmo padrão de
`INGESTAO_WORKER_*`/`CRM_WORKFLOW_WORKER_*`). **+3 permissões** de catálogo
(`disparo:{criar,ver,cancelar}`); quality rating reaproveita `crm_admin:ver` já existente
(011) — **0** permissão nova para essa parte. **~10 endpoints autenticados, 0 endpoint
público novo.**

---

## Decisões do dono do produto (2026-09-09, resolvidas antes do `plan.md`)

Quatro decisões bloqueavam esta spec — resolvidas com o dono do produto antes de qualquer
código, integradas ao `spec.md` na seção Clarifications:

- **Volume esperado por disparo: até poucos milhares de destinatários** (não dezenas de
  milhares ou mais) — revalida, para o caso específico de disparo em massa, a suposição de
  baixo volume herdada da spec 012 (Chat ao Vivo). Um worker in-process (mesmo padrão
  `setInterval` das specs 006/014) é suficiente; sem fila/broker externo.
- **Contato novo importado por CSV: a escolha de virar Lead ou não é feita na hora da
  importação**, não é uma regra fixa do sistema (FR-007a) — cada disparo com CSV decide.
- **Teste A/B é só comparação manual.** As duas variantes dividem 100% do público
  configurado e o disparo encerra — sem promoção automática de uma variante vencedora para
  o restante do público.
- **Falha de envio individual tenta de novo automaticamente**, um número limitado de vezes
  (mesmo padrão de `MAX_TENTATIVAS` da spec 006/ingestão), antes de virar falha terminal.
  Falhas que não fazem sentido reter (opt-out, telefone inválido, template não aprovado) já
  nascem terminais, sem consumir tentativa.

## Por que `mensagem_disparo` é uma tabela própria, não uma extensão de `mensagem_whatsapp`

`mensagem_whatsapp.interacao_id` é `@unique` e não-nulo — cada linha corresponde a uma
interação **já registrada** na timeline (spec 011). Um destinatário pulado (opt-out,
telefone inválido) ou ainda pendente de envio nunca gera uma interação — não existe
"mensagem que não foi enviada" no modelo da 011, e não deveria existir (a timeline só
registra o que de fato aconteceu). `mensagem_disparo` é o **estado do trabalho a fazer**
(fila + resultado, 1 linha por destinatário resolvido); `mensagem_whatsapp`/`interacao`
continuam sendo só o que **de fato saiu** — `mensagem_disparo.mensagem_whatsapp_id` (FK
opcional, `@unique`) liga às duas só depois que o envio de fato acontece. Ler o status de
entrega/leitura de uma mensagem já enviada é um `JOIN` simples — nenhuma duplicação de
lógica com o webhook de entrada que já atualiza `mensagem_whatsapp.status_entrega`.

Um destinatário **sem âncora** (contato de CSV sem correspondência a pessoa/lead e sem
`criarLead`) nunca gera interação — não há pessoa/lead para anexar uma timeline — mas o
envio ainda acontece e o resultado fica registrado em `mensagem_disparo`, com
`mensagem_whatsapp_id` permanecendo nulo mesmo após o sucesso.

## Materialização de destinatários: quando e como (FR-004/FR-005/FR-006)

Para um disparo **imediato**, a lista de destinatários (segmento ∪ CSV, deduplicada por
telefone, com opt-out já excluído) é resolvida **na própria criação**. Para um disparo
**agendado**, nada é materializado até o worker notar que `agendadoPara` chegou — a
composição do segmento (não do CSV, que é estático desde a importação) é recalculada nesse
momento exato, nunca travada na criação (mesmo comportamento "sempre derivado" já usado
pelos segmentos, spec 009). A resolução de membros de um segmento para fins de disparo
**ignora o escopo de visão por sujeito** (`ver_todos`/`ver_proprios` de Lead, spec 008) —
autorização de quem pode disparar já foi resolvida em `disparo:criar`; a visibilidade de
uma tela de Leads não é a mesma pergunta que "quem recebe uma campanha configurada por
alguém já autorizado", e o worker roda em segundo plano, sem um sujeito HTTP em curso.

## Envio: orquestração própria, mesmos 3 pontos de integração da spec 011

`EnviarMensagemDisparoService` não reusa `EnvioWhatsappService` (011) como está — aquele
serviço resolve telefone a partir de um DTO de requisição HTTP síncrona, checa a janela de
24h (que não se aplica a um disparo, sempre por template aprovado) e lança exceções HTTP. O
novo serviço chama **exatamente os mesmos 3 pontos de integração** —
`GraphApiClient.enviarMensagem` → `RegistrarInteracaoService.registrar` →
`MensagemWhatsappRepository.criar` — mas orientado a um destinatário já resolvido pelo
worker, devolvendo um resultado explícito para gravar em `mensagem_disparo.status` em vez
de lançar. Nenhum caminho de escrita paralelo.

## Throttling é o próprio ritmo do worker (FR-008)

`CRM_DISPAROS_WORKER_INTERVALO_MS` × `CRM_DISPAROS_WORKER_LOTE` já reduz o risco de rajada
suficiente para o volume assumido (até poucos milhares por disparo) — sem um mecanismo de
throttling adaptativo por quality rating nesta versão (exigiria uma chamada à Graph API por
passada do worker, o oposto de "consulta sob demanda", Princípio VIII).

## Quality rating: consulta sob demanda, nunca sincronizada (FR-009)

`GraphApiClient` (011) ganha `consultarQualityRating` — mesma borda externa já isolada
atrás do adaptador da Meta, sem uma 2ª interface. `GET
/crm/admin/whatsapp/canais/{id}/quality-rating` bate direto na Graph API a cada chamada;
nenhuma linha é persistida.

## CSV: texto simples no corpo JSON, sem `multer`

O CSV nunca trafega como upload binário — o frontend lê o arquivo escolhido com
`FileReader.readAsText()` e envia o conteúdo como uma string comum (`csvConteudo`) dentro
do mesmo corpo JSON de `POST /crm/disparos`. Toda a API do projeto é JSON puro desde a 001;
adicionar `multipart/form-data` só para isso puxaria `multer`/`@types/multer` (nenhum dos
dois instalado) só para um campo de texto que o navegador já sabe ler localmente. O parser
em `crm/domain/disparos/importar-csv.ts` é implementado à mão (separador `,`/`;`
autodetectado, aspas simples) — suficiente para uma planilha de contatos simples.

## Frontend

`frontend/src/disparos/`: **CRM · Disparos** (`DisparosPage.tsx`, atrás de `disparo:ver`) —
visão geral/histórico com contagem por status + construtor de disparo inline (canal →
templates aprovados daquele canal, segmento e/ou CSV com escolha de criar Lead, teste A/B
opcional, agendamento opcional), atrás de `disparo:criar`; `DisparoDetalhePage.tsx` —
métricas por status (e por variante, quando há A/B), lista de destinatários com motivo de
falha/pulo, exportar resultado (CSV via Blob, sem link direto ao backend), cancelar (atrás
de `disparo:cancelar`) e consultar quality rating do canal usado. Hooks TanStack Query
inline nos componentes, mesmo padrão de `whatsapp/WhatsappAdminPage.tsx`.

## Testes

16 testes unitários backend novos (domínio puro `crm/domain/disparos/` — sem banco:
`resolverDestinatarios` dedup entre segmento/CSV e dentro do próprio CSV;
`atribuirVariante` determinístico + distribuição aproximada; `parseCsvContatos` separador
`,`/`;`, aspas, coluna ausente, linha inválida) + 14 e2e novos (Postgres real: ciclo de
vida imediato/agendado/cancelar, validações de criação, execução reativa idempotente com
materialização de agendado, retry com sucesso na 3ª tentativa e retry terminal ao atingir o
máximo, dedup segmento+CSV, CSV com/sem criação de Lead, opt-out, teste A/B com métricas
separadas por variante, quality rating sob demanda e sua falha de provedor, guard/escopo) +
4 frontend novos (`DisparosPage` — lista, gate de permissão, formulário de criação e sua
validação) — **515 unitários / 286 e2e / 106 frontend**, todos verdes; lint/typecheck/build
limpos nos dois workspaces. Validado também manualmente no navegador de ponta a ponta:
conectar canal e template pela API, criar disparo pelo formulário do painel apontando para
um segmento real, ver o disparo concluído na lista e o detalhe com o botão de export e de
quality rating (que falha graciosamente contra a Graph API real sem credencial válida, como
esperado no ambiente de desenvolvimento).
