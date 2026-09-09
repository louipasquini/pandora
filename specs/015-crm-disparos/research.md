# Research: CRM · Disparos (WhatsApp)

## D-R1 — Envio de disparo não reusa `EnvioWhatsappService` como está

**Decisão**: criar `EnviarMensagemDisparoService`, um serviço próprio que executa a mesma
sequência de 3 passos já usada por `EnvioWhatsappService` (011) — chamar `GraphApiClient.
enviarMensagem`, registrar a interação via `RegistrarInteracaoService`, criar a linha em
`MensagemWhatsappRepository` — mas orientado a **um destinatário resolvido do worker**
(telefone + âncora já conhecidos), não a uma requisição HTTP síncrona de usuário.

**Motivo**: `EnvioWhatsappService.enviar` resolve o telefone a partir de `pessoaId`/`leadId`
de um DTO de requisição, verifica a janela de 24h (regra que só faz sentido para uma mensagem
*avulsa* dentro de uma conversa) e lança exceções HTTP (`BadGatewayException` etc.) — nenhuma
dessas duas coisas se aplica a um envio de disparo por template aprovado (que nunca depende da
janela de 24h, FR-009 da 011) processado por um worker em segundo plano (que precisa de um
resultado explícito para gravar em `mensagem_disparo.status`, não de uma exceção lançada).

**Alternativa rejeitada**: alterar `EnvioWhatsappService.enviar` para aceitar telefone direto e
pular a checagem de janela quando vier de um disparo. Rejeitada por acoplar um serviço já
usado por HTTP síncrono (012) a um modo de chamada muito diferente (lote, sem exceção) —
violaria a regra de "não redesenhar o que já funciona" só para economizar um arquivo pequeno.
O novo serviço **chama os mesmos 3 pontos de integração** (`GraphApiClient`,
`RegistrarInteracaoService`, `MensagemWhatsappRepository`) — nenhum caminho de escrita
paralelo é criado, só uma orquestração diferente do mesmo caminho.

## D-R2 — Resolução de membros do segmento para disparo ignora o escopo de visão do sujeito

**Decisão**: ao materializar os destinatários de um disparo cujo destino é um `Segmento`, o
`MaterializarDestinatariosService` chama `construirWhere(filtro)` (puro, 009) diretamente
sobre `Lead`/`Pessoa` — **sem** combinar com `LeadConsultaService.escopoDe(req)` (o filtro de
`ver_todos`/`ver_proprios` que `SegmentoService.listarMembros` aplica quando alguém abre a
tela do segmento).

**Motivo**: o worker que envia um disparo agendado roda em segundo plano, sem uma requisição
HTTP em curso — não há um `sujeito` cujo escopo de visão se aplique no momento do envio.
Autorização de **quem pode disparar** já foi resolvida na criação (`disparo:criar`); o escopo
`ver_proprios` de Lead é uma regra sobre **visualizar uma tela de leads**, não sobre **quem
recebe uma campanha de WhatsApp configurada por alguém já autorizado**. Aplicar o escopo do
criador do disparo no momento do envio agendado também seria instável (o escopo poderia mudar
entre a criação e o envio, ou o criador poder ser a própria credencial de serviço).

**Alternativa rejeitada**: capturar o escopo do sujeito no momento da criação e reaplicá-lo no
envio. Rejeitada por adicionar estado (snapshot de RBAC) sem necessidade — a única coisa que
FR-006 exige recalcular é a **composição do segmento**, não a visibilidade de quem o criou.

## D-R3 — `mensagem_disparo` é uma tabela própria, não uma extensão de `mensagem_whatsapp`

**Decisão**: `mensagem_disparo` (1 linha por destinatário resolvido de um disparo, mesmo antes
de qualquer envio real) é uma tabela nova, com `mensagem_whatsapp_id` como FK **opcional**
(`@unique`) preenchida só depois que o envio de fato acontece.

**Motivo**: `mensagem_whatsapp.interacao_id` é `@unique` e não-nulo — cada linha corresponde a
uma interação **já registrada** na timeline. Um destinatário pulado (opt-out, telefone
inválido) ou ainda pendente de envio **nunca gera** uma interação — não existe "mensagem que
não foi enviada" no modelo da 011, e não deveria existir (a timeline só registra o que
realmente aconteceu). `mensagem_disparo` é o **estado do trabalho a fazer** (fila +
resultado); `mensagem_whatsapp`/`interacao` continuam sendo só o que **de fato saiu**. Ler o
status de entrega/leitura de uma mensagem já enviada é um `JOIN` simples via
`mensagem_whatsapp_id` (o webhook de entrada da 011 já atualiza `mensagem_whatsapp.
status_entrega` conforme os callbacks de status chegam — nenhuma duplicação de lógica).

## D-R4 — Throttling é o próprio ritmo do worker, sem configuração por disparo

**Decisão**: o "throttling para preservar o quality rating" (FR-008) é obtido pelo par
`CRM_DISPAROS_WORKER_INTERVALO_MS` (tempo entre passadas) × `CRM_DISPAROS_WORKER_LOTE`
(mensagens enviadas por passada) — mesmo padrão dos workers de 006/014. Não existe campo de
"mensagens por minuto" configurável por disparo individual.

**Motivo**: o volume esperado (até poucos milhares por disparo, decisão do dono do produto)
não justifica um mecanismo de throttling sofisticado por campanha — a mesma configuração
global de ritmo, ajustável via `.env`, já reduz o risco de rajada suficiente para o cenário
descrito. Adicionar um campo por disparo seria complexidade sem um caso de uso concreto
puxando por ela (constituição: escrever menos, derivar mais).

**Alternativa rejeitada**: throttling adaptativo que lê o quality rating antes de cada lote e
ajusta o ritmo automaticamente. Rejeitada nesta versão — exigiria uma chamada à Graph API por
passada do worker (o oposto de "consulta sob demanda", Princípio VIII) e não foi pedida pelo
dono do produto; fica como possível extensão futura, não um requisito desta spec.

## D-R5 — Retry de envio: contador em `mensagem_disparo`, não um novo `evento_etapa`

**Decisão**: `mensagem_disparo.tentativas` (Int, default 0) é incrementado a cada tentativa de
envio que falha por erro do provedor (`GraphApiError`); ao atingir
`CRM_DISPAROS_WORKER_MAX_TENTATIVAS` (default 3, mesmo valor-padrão de
`INGESTAO_WORKER_MAX_TENTATIVAS`), o status vira `FALHOU` terminal. Falhas que não fazem
sentido reter (opt-out, telefone ausente/inválido, template não aprovado no momento do envio)
já nascem `FALHOU`/`PULADA` com `tentativas` intocado — nunca entram no laço de retry.

**Motivo**: diferente da `ingestao` (006), que tem um pipeline de 7 etapas por evento e precisa
de uma tabela (`evento_etapa`) para rastrear cada etapa separadamente, o disparo tem só **uma**
operação por destinatário (enviar). Um contador simples na própria linha já é suficiente —
criar uma tabela paralela só para contar tentativas seria complexidade sem necessidade.

## D-R6 — CSV: texto simples no corpo JSON, parser à mão, sem dependência nova

**Decisão**: o CSV nunca trafega como upload binário — o frontend lê o arquivo escolhido com
`FileReader.readAsText()` e envia o conteúdo como uma string comum (`csvConteudo`) dentro do
mesmo corpo JSON de `POST /crm/disparos` (contracts/disparos.md); o parser em
`domain/disparos/importar-csv.ts` é implementado à mão (separador `,` ou `;` autodetectado
pela 1ª linha, aspas simples, sem suporte a quebras de linha dentro de campo) — suficiente
para uma planilha de contatos (telefone + nome opcional).

**Motivo**: toda a API do projeto é JSON puro desde a 001 — nenhuma outra rota faz upload
binário (`multipart/form-data`), e adicionar isso só para este caso puxaria `multer` +
`@types/multer` (nenhum dos dois está instalado hoje) só para um campo de texto que o
navegador já sabe ler localmente. Tratar o CSV como string evita a dependência nova e mantém
o contrato HTTP uniforme com o resto do projeto. O volume (até poucos milhares de linhas)
também não justifica robustez de nível "importador de dados genérico" — trazer
`csv-parse`/`papaparse` só para isso violaria a prática já estabelecida de não adicionar
dependência sem necessidade forte (mesmo racional que rejeitou `date-fns-tz`/`luxon` na 007 e
`@hello-pangea/dnd` na 010).

**Alternativa rejeitada**: `multipart/form-data` com `FileInterceptor` (`@nestjs/
platform-express` já está no projeto, mas depende de `multer` em tempo de execução — pacote
ausente hoje). Rejeitada por introduzir uma dependência nova e um formato de contrato HTTP
sem precedente no projeto, para ganhar só a conveniência (pequena, dado o volume) de não
serializar o arquivo como string no cliente.

## D-R7 — `consultarQualityRating` estende `GraphApiClient`, não um cliente novo

**Decisão**: adiciona-se um método a mais na interface já existente `GraphApiClient` (011) —
`consultarQualityRating({ phoneNumberId, accessToken }) → { qualityRating, statusExibicao }` —
implementado em `MetaGraphApiClient` via `GET /{phone-number-id}?fields=quality_rating,
name_status` da Graph API, e um dublê no teste (mesmo padrão de `enviarMensagem`/
`buscarTemplates`).

**Motivo**: é a mesma borda externa (Graph API da Meta, mesmas credenciais do canal) — criar
uma 2ª interface/injeção só para isso duplicaria a fronteira que a 011 já isolou (Princípio
III, "um adaptador por [plataforma × fonte]" — aqui a "fonte" é a própria Graph API, já
coberta por um único adaptador).
