# Início | Documentação Para Desenvolvedores

Nessa documentação você vai encontrar todas as informações necessárias, para acessar nossas APIs, como, por exemplo, a autenticação através de tokens, os limite de requisições para os usuários, os códigos HTTP das Respostas, as listas e paginação, as listas de opções de afiliações, marketplaces, formas de pagamento, status de transações, tipos de transações, status de assinaturas, tipos de intervalos, tipos de rastreamento, campos de rastreamento, anunciantes, status de invoice, tipos de invoice, tipos de afiliações e webhooks.

**Atenção:** Para testar os exemplos apresentados é necessário ter uma conta no Digital Manager Guru. Caso você ainda não tenha, basta [criar uma clicando aqui](https://digitalmanager.guru/register). A criação da conta é simples e rápida, e não há custo algum.

Atenção ao tentar integrar a API:

1. Tenha responsabilidade ao partilhar sua chave api.
2. Fazer chamadas diretamente de um "frontend" é uma FALHA DE SEGURANÇA.
3. Se você está recebendo um erro de CORS, releia o _item_ 2.

Caso tenha dúvidas ou encontre algum problema, entre em contato com o nosso suporte através do nosso email [dev@digitalmanager.guru](mailto:dev@digitalmanager.guru).

# Códigos HTTP das Respostas

Todos os endpoints aceitam e respondem em JSON. Códigos 2xx indicam sucesso; 4xx indicam erros do cliente; 5xx indicam erros do servidor.

|Código|Status|Descrição|
|---|---|---|
|`200`|OK|Requisição bem-sucedida|
|`401`|Unauthorized|Token de usuário ausente ou inválido|
|`403`|Forbidden|Usuário sem permissão para a ação|
|`404`|Not Found|Endpoint ou objeto não encontrado|
|`422`|Unprocessable Entity|Parâmetro obrigatório ausente ou inválido|
|`429`|Too Many Requests|Limite de requisições excedido|
|`500`|Internal Server Error|Erro interno do servidor|

Respostas `422` retornam um JSON com as mensagens de erro por campo:

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "email": ["The email field is required."]
  }
}
```

# Limite de Requisições

O limite é de **360 requisições por minuto** por conta. Ao ultrapassar, a API retorna `429 - Too Many Attempts`.

Cada resposta da API inclui os headers:

|Header|Descrição|
|---|---|
|`X-RateLimit-Limit`|Total de requisições permitidas por minuto|
|`X-RateLimit-Remaining`|Requisições disponíveis no momento|
|`Retry-After`|Segundos até poder tentar novamente|
|`X-RateLimit-Reset`|Unix timestamp do reset do limite|

Requisições idênticas e simultâneas retornam `429 - Identical concurrent request avoided.`

# Paginação

A API usa **paginação baseada em cursor** em vez de limit/offset. Paginação por offset exige descartar registros anteriores ao offset e produz resultados imprecisos em datasets que mudam frequentemente (como transações).

## Estrutura da resposta

```json
{
  "data": [...],
  "has_more_pages": true,
  "next_cursor": "eyJpZCI6...",
  "on_first_page": true,
  "on_last_page": false,
  "per_page": 15,
  "previous_cursor": null,
  "total_rows": 1240
}
```

|Campo|Descrição|
|---|---|
|`data`|Array de itens retornados|
|`has_more_pages`|Existem páginas adicionais|
|`next_cursor`|Cursor para a próxima página|
|`on_first_page`|Esta é a primeira página|
|`on_last_page`|Esta é a última página|
|`per_page`|Máximo de itens por página|
|`previous_cursor`|Cursor para a página anterior|
|`total_rows`|Total de registros (retornado apenas na primeira página)|

  

## Uso

Inclua os filtros da consulta junto com o parâmetro `cursor` definido como o valor de `next_cursor` ou `previous_cursor` da resposta anterior.

```bash
GET /api/v2/transactions?cursor=eyJpZCI6MTIzfQ
```

# Status Guru

A página de status da Digital Manager Guru oferece visibilidade em tempo real sobre a saúde operacional de todos os sistemas da plataforma. Está organizada em três seções principais: estado atual dos serviços, manutenções programadas e histórico de incidentes.

Páginas disponíveis:

- Status (principal): [https://status.digitalmanager.guru/](https://status.digitalmanager.guru/)
- Manutenções: [https://status.digitalmanager.guru/maintenance](https://status.digitalmanager.guru/maintenance)
- Incidentes anteriores: [https://status.digitalmanager.guru/incidents](https://status.digitalmanager.guru/incidents)

---

## Estado atual

O topo da página apresenta o estado agregado de toda a plataforma com uma mensagem global e a data/hora da última atualização.

Os serviços estão organizados em quatro grupos, cada um expansível para ver o estado individual de cada serviço e o histórico de uptime dos últimos 90 dias.

- **Frontend Services**

> Engloba todas as interfaces web com que o usuário final interage diretamente: o site público, o painel de administração dos produtores e os fluxos de compra, subscrição, faturação e gestão de bilhetes.  
> **Serviços**: Main Web Site, Admin, Enrollments, Etickets, Invoice, My Orders, Pay e Subscribe.

- **Backend Services**

> Conjunto de APIs que alimentam os frontends, as aplicações móveis e as integrações externas. Inclui a API pública para integrações de terceiros, a API de administração interna e APIs dedicadas a cada domínio funcional como checkout, inscrições, bilhetes e pedidos.  
> **Serviços**: Admin Api, Checkout Api, Enrollments Api, Etickets Api, Incoming Webhooks Api, Mobile Api, My Orders Api e Public Api

- **Queues**

> Filas de processamento assíncrono responsáveis por tarefas que não requerem resposta imediata: envio de notificações, registo de cliques, disparo de webhooks de saída, processamento de pixels de rastreamento e exportação de dados.  
> **Serviços**: Clicks, Export, Notifications, Pixels e Webhooks.

- **Infrastructure**

> Camada base que suporta todos os grupos acima: servidores, rede, base de dados e outros componentes de sistema. Os serviços individuais desta camada não são expostos publicamente; o grupo apresenta apenas um estado agregado.

Os valores possíveis para o estado de cada serviço são: Operational, Degraded Performance, Partial Outage, Major Outage, Under Maintenance e Not monitored.

---

## Manutenção

Lista as janelas de manutenção agendadas com antecedência pela Guru. Permite a usuários e integradores anteciparem períodos de indisponibilidade planejada e evitar operações críticas nesses intervalos.

## Incidentes anteriores

Histórico cronológico de todas as ocorrências que afetaram um ou mais serviços. Cada incidente tem uma página de detalhe própria e registra sua evolução através de uma timeline desde a detecção (Created), eventuais atualizações intermediárias (Updated) até a resolução (Resolved), com timestamp e mensagem em cada entrada.

# Card Token JS

Script para tokenização de cartão de crédito no browser. Incorpore-o na sua página de área de membros ou portal do assinante para permitir que os seus assinantes **atualizem o cartão de uma assinatura sem saírem do seu site** — sem redirecionar para o painel do Digital Manager Guru.

## Carregamento

```html
<script src="[https://clkdmg.site/js/card-token.min.js](https://clkdmg.site/js/card-token.min.js)"></script>
```

## Como funciona

1. O assinante preenche os novos dados do cartão na sua página.
2. O script envia os dados diretamente para a API do Digital Manager Guru via HTTPS.
3. A API devolve um token criptografado válido por **5 minutos**.
4. O seu backend recebe o token e o utiliza para atualizar o método de pagamento da assinatura — nunca toca nos dados brutos do cartão.

## Atributos HTML

### Campos de entrada — `data-dmg="<campo>"`

Adicione o atributo `data-dmg` nos inputs do cartão. Os campos podem estar em qualquer lugar da página, não precisam estar dentro do mesmo `<form>`.

|Valor|Obrigatório|Descrição|
|:--|:--|:--|
|`card_number`|sim|Número do cartão|
|`card_cvv`|sim|Código de segurança (CVV)|
|`card_expiration_month`|sim|Mês de vencimento (1–12)|
|`card_expiration_year`|sim|Ano de vencimento (4 dígitos)|
|`card_holder_name`|sim|Nome impresso no cartão|

### Botão de submit — `data-dmg-submit`

Adicione estes atributos no botão que o assinante clica para salvar o novo cartão:

|Atributo|Obrigatório|Descrição|
|:--|:--|:--|
|`data-dmg-submit`|sim|Marca o botão como gatilho de tokenização|
|`data-dmg-account-token`|sim|Seu token de conta (40 caracteres) — obtido no painel DMG|
|`data-dmg-callback`|sim|Nome da função JavaScript chamada ao receber o token|
|`data-dmg-error-callback`|não|Nome da função JavaScript chamada em caso de erro|
|`data-dmg-sandbox`|não|Presença do atributo ativa o ambiente sandbox|

## Exemplo completo

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Atualizar cartão</title>
</head>
<body>

  <form id="update-card-form">
    <label>
      Número do cartão
      <input data-dmg="card_number" type="text" placeholder="0000 0000 0000 0000" autocomplete="cc-number">
    </label>

    <label>
      Nome no cartão
      <input data-dmg="card_holder_name" type="text" placeholder="NOME SOBRENOME" autocomplete="cc-name">
    </label>

    <label>
      Mês de vencimento
      <input data-dmg="card_expiration_month" type="text" placeholder="MM" autocomplete="cc-exp-month">
    </label>

    <label>
      Ano de vencimento
      <input data-dmg="card_expiration_year" type="text" placeholder="AAAA" autocomplete="cc-exp-year">
    </label>

    <label>
      CVV
      <input data-dmg="card_cvv" type="text" placeholder="123" autocomplete="cc-csc">
    </label>

    <button
      data-dmg-submit
      data-dmg-account-token="SEU_ACCOUNT_TOKEN_AQUI"
      data-dmg-callback="onCardTokenized"
      data-dmg-error-callback="onCardTokenError"
    >
      Salvar novo cartão
    </button>
  </form>

  <script src="[https://clkdmg.site/js/card-token.min.js](https://clkdmg.site/js/card-token.min.js)"></script>
  <script>
    function onCardTokenized(token) {
      // Envie o token para o seu backend para atualizar o cartão da assinatura.
      // Nunca logue ou exponha o token no frontend.
      fetch('/seu-endpoint-de-atualizacao-de-cartao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_token: token })
      }).then(function (res) {
        if (res.ok) {
          alert('Cartão atualizado com sucesso!');
        }
      });
    }

    function onCardTokenError(err) {
      // err.code e err.message descrevem o problema
      console.error('Erro na tokenização:', err.code, err.message);
      alert('Não foi possível processar os dados do cartão. Tente novamente.');
    }
  </script>

</body>
</html>
```

## Atualizando a assinatura com o token

Após receber o token no callback, o seu backend deve chamar:

```http
PUT [https://digitalmanager.guru/api/v2/subscriptions/](https://digitalmanager.guru/api/v2/subscriptions/){id}/payment-types
```

O `{id}` aceita o **UUID** ou o **código** da assinatura.

**Autenticação:** Bearer token da API (Sanctum) — o usuário precisa da permissão `subscriptions.change_credit_card`.

**Body (JSON):**

```json
{
  "payment_type": "credit_card",
  "card_token": "<token recebido no callback>",
  "comment": "Cartão atualizado pelo assinante via portal",
  "installment": 1
}
```

|Campo|Obrigatório|Descrição|
|:--|:--|:--|
|`payment_type`|sim|Deve ser `"credit_card"`|
|`card_token`|sim|Token retornado pelo script (válido 5 min)|
|`comment`|sim|Motivo da alteração (máx. 255 caracteres) — registrado no audit log|
|`installment`|não|Número de parcelas (1 ao máximo do plano; padrão: 1)|

**Resposta de sucesso (200):**

```json
{ "status": "success" }
```

O `account_token` usado para gerar o token no script deve pertencer ao mesmo cliente (merchant) da assinatura — a decriptação falha com 403 caso contrário.

## Tratamento de erros

A função de erro recebe um objeto `{ code, message }`:

|`code`|Quando ocorre|
|:--|:--|
|`missing_config`|`data-dmg-account-token` ou `data-dmg-callback` ausente no botão|
|`missing_fields`|Um ou mais campos obrigatórios estão vazios|
|`network_error`|Falha de rede (sem conexão, timeout)|
|`server_error`|A API retornou erro HTTP (token inválido, cartão recusado, etc.)|

## Ambiente sandbox

Para testar sem afetar assinaturas reais, adicione `data-dmg-sandbox` ao botão:

```html
<button
  data-dmg-submit
  data-dmg-sandbox
  data-dmg-account-token="SEU_ACCOUNT_TOKEN_SANDBOX"
  data-dmg-callback="onCardTokenized"
  data-dmg-error-callback="onCardTokenError"
>
  Salvar novo cartão (sandbox)
</button>
```

## Segurança

- Os dados do cartão são enviados diretamente para a API do Digital Manager Guru via HTTPS — nunca passam pelo seu servidor.
- O token gerado é criptografado e válido por apenas 5 minutos.
- O token é vinculado à sua conta — não pode ser utilizado por outro lojista.
- O script não armazena, não loga e não retém nenhum dado do cartão após o envio.

# Postman Collection

---

O [Postman](https://www.postman.com/) é uma das ferramentas mais utilizadas por equipes de desenvolvimento para testar, depurar e documentar APIs. Com a coleção oficial da API do Digital Manager Guru, você pode importar todos os endpoints diretamente no Postman e começar a fazer chamadas em minutos, sem precisar configurar headers, URLs ou exemplos manualmente.

---

## Download

**[⬇ Baixar Postman Collection](https://api.docs.digitalmanager.guru/postman-collection.json)**

---

## O que está incluído

A coleção contém todos os endpoints públicos da API, organizados por domínio:

|Grupo|Endpoints|
|:--|:--|
|Affiliations|Pesquisar, Consultar|
|Block lists|Pesquisar, Criar, Excluir|
|Checkout|Endpoints públicos de checkout|
|Contacts|Pesquisar, Criar, Atualizar, Excluir…|
|Coupons|Pesquisar, Criar, Atualizar, Excluir|
|Etickets|Pesquisar, Validar|
|Leads|Pesquisar, Consultar|
|Products|Pesquisar, Consultar|
|Subscriptions|Pesquisar, Consultar, Cancelar, Alterar plano…|
|Trackings|Campaigns, Checkouts, Forms, Groups, Leads, Custo com Tráfego|
|Traffic Splitting|Campaigns, Checkouts, Leads|
|Transactions|Pesquisar, Consultar, Reembolsar, Cancelar…|
|Users|Pesquisar, Consultar|
|Webhooks|Listar, Criar, Atualizar, Excluir|

---

## Como importar

**Passo 1** — Baixe o arquivo `dmg-api.postman_collection.json` usando o botão acima.

**Passo 2** — No Postman, clique em **Import** (canto superior esquerdo).

**Passo 3** — Arraste o arquivo ou clique em **Upload Files** e selecione o arquivo baixado.

**Passo 4** — Clique em **Import**. A coleção **Digital Manager Guru — API** aparece no painel esquerdo.

---

## Tipos de token

A API do Digital Manager Guru usa dois tokens distintos — é importante não confundi-los:

|Token|Escopo|Usado onde|
|:--|:--|:--|
|**User Token**|Nível de usuário|Header `Authorization: Bearer {{user_token}}` em todas as chamadas da API pública|
|**Account Token**|Nível de conta|Campo `api_token` nos webhooks recebidos; parâmetro no endpoint de validação `/accounttoken/tokenisvalid`|

O **User Token** é a credencial que você precisa para usar a API. O **Account Token** identifica a conta (tenant) e aparece nos webhooks que a plataforma envia para o seu sistema — não serve para autenticar chamadas de API.

> Para mais detalhes sobre como obter cada token, consulte a página [Autenticação](https://api.docs.digitalmanager.guru/autenticacao).

---

## Configurar as variáveis

A coleção usa as seguintes variáveis de ambiente:

|Variável|Valor|Onde obter|
|:--|:--|:--|
|`base_url`|`https://digitalmanager.guru`|Pré-configurado — não alterar|
|`user_token`|Seu User Token|Admin → Meu Perfil → Tokens API|
|`account_token`|Seu Account Token|Admin → Minha Conta → API|

**Criar um Environment no Postman:**

1. Clique no ícone **Environments** (engrenagem ou olho no canto superior direito).
2. Clique em **Add** e dê um nome ao environment (ex: _DMG Produção_).
3. Adicione as variáveis com os valores correspondentes.
4. Selecione o environment criado no menu suspenso do canto superior direito.

---

## Autenticação

A coleção está configurada com **Bearer Token** ao nível da coleção usando `{{user_token}}`. Todos os endpoints herdam automaticamente essa autenticação — não é necessário configurar o header em cada request individualmente.

A pasta **Account Token** é a única exceção: o endpoint de validação não usa Bearer, pois o `account_token` é passado diretamente na URL como parâmetro de rota.

---

## Parâmetros de exemplo

Todos os endpoints têm os parâmetros preenchidos com valores de exemplo para facilitar os primeiros testes. Os campos de UUID (como `contact_id`, `product_id`, `subscription_id`) devem ser substituídos por IDs reais da sua conta antes de enviar o pedido.

---

## Atualização da coleção

A coleção é regenerada automaticamente a cada novo deploy da documentação. Para obter a versão mais recente, basta baixar novamente o arquivo ou usar diretamente o URL permanente:

```properties
https://api.docs.digitalmanager.guru/postman-collection.json
```

Este URL pode ser importado diretamente no Postman através da opção **Import → Link** (cola o URL na caixa de texto), sem precisar baixar o arquivo localmente.

# Anunciantes

---

Consulte a lista de anunciantes na Guru.

|Código|Descrição|
|:--|:--|
|`adwords`|Google Ads|
|`adwords_remarketing`|Google Ads Remarketing|
|`bing`|Bing|
|`chatbot`|Chatbot|
|`community`|Comunidade|
|`customer_service`|Atendimento Ao Cliente|
|`ebook`|E-book|
|`email`|E-mail|
|`facebook`|Facebook|
|`facebook_ads`|Facebook Ads|
|`facebook_remarketing`|Facebook Remarketing|
|`influencers`|Influenciadores|
|`instagram`|Instagram|
|`instagram_ads`|Instagram Ads|
|`instagram_bio`|Instagram Bio|
|`instagram_remarketing`|Instagram Remarketing|
|`instagram_story`|Instagram Story|
|`linkedin`|LinkedIn|
|`linkedin_ads`|LinkedIn Ads|
|`linkedin_remarketing`|LinkedIn Remarketing|
|`member_area`|Área de Membros|
|`messengers`|Serviço de Mensagem|
|`meta`|Meta|
|`meteoric`|Meteórico|
|`organic`|Organic|
|`other`|Outro|
|`outbrain`|Outbrain|
|`ownsite`|Site Próprio|
|`pinterest`|Pinterest|
|`propeller_ads`|Propeller Ads|
|`reddit_ads`|Reddit Ads|
|`renewal`|Renovação de Assinaturas|
|`revcontent`|RevContent|
|`sales_team`|Equipa de Vendas|
|`taboola`|Taboola|
|`tiktok`|Tiktok|
|`twitter`|Twiter|
|`twitter_ads`|Twitter Ads|
|`webinar`|Webinário|
|`whatsapp`|WhatsApp|
|`without`|Sem Rastreamento|
|`yahoo`|Yahoo|
|`youtube`|YouTube|
|`youtube_ads`|YouTube Ads|

# Campos de Rastreamento

---

Consulte a lista de campos de rastreamento na Guru.

|Campo|Descrição|
|:--|:--|
|`ref`|Código de referência|
|`sck`|Código de rastreamento interno|
|`src`|Origem da venda|
|`subid`|Subidentificador de rastreamento|
|`trk`|Código de tracking|
|`utm_campaign`|Nome da campanha|
|`utm_content`|Conteúdo da campanha|
|`utm_medium`|Meio da campanha|
|`utm_source`|Origem da campanha|
|`utm_term`|Termo da campanha|
# Formas de Pagamento

---

Consulte a lista das formas de pagamento disponíveis no Guru.

|Código|Descrição|
|:--|:--|
|`applepay`|Apple Pay|
|`baloto`|Baloto|
|`bank_transfer`|Transferência bancária|
|`billet`|Boleto bancário|
|`credit_card`|Cartão de crédito|
|`cryptocurrency`|Criptomoeda|
|`efecty`|Efecty|
|`free`|Grátis|
|`google_pay`|Google Pay|
|`ideal`|iDEAL|
|`mbway`|MB WAY|
|`multibanco`|Multibanco|
|`multicaja`|Multicaja|
|`nupay`|NuPay|
|`other`|Outro|
|`oxxo`|OXXO|
|`pagoefectivo`|PagoEfectivo|
|`paypal`|PayPal|
|`personal_credit`|Crédito pessoal|
|`pix`|Pix|
|`samsung_pay`|Samsung Pay|
|`safetypay`|SafetyPay|
|`sencillito`|Sencillito|
|`servipag`|Servipag|
|`sepa`|Débito Direto SEPA|
|`spei`|SPEI|
|`wallet`|Carteira digital|
|`webpay`|Webpay|
# Lista de states pt-pt

---

Consulte a lista de códigos que pertencem ao “Estado”/ “Distrito” (pt-pt) na Guru.

|Código|Descrição|
|:--|:--|
|`01`|Aveiro|
|`02`|Beja|
|`03`|Braga|
|`04`|Bragança|
|`05`|Castelo Branco|
|`06`|Coimbra|
|`07`|Évora|
|`08`|Faro|
|`09`|Guarda|
|`10`|Leiria|
|`11`|Lisboa|
|`12`|Portalegre|
|`13`|Porto|
|`14`|Santarém|
|`15`|Setúbal|
|`16`|Viana do Castelo|
|`17`|Vila Real|
|`18`|Viseu|
|`20`|Açores|
|`30`|Madeira|
# Marketplaces

---

Consulte a lista de Marketplaces disponíveis na Guru.

|Marketplaces|Descrição|
|:--|:--|
|`adyen`|Adyen|
|`appmax`|Appmax|
|`appmaxgw`|Appmax Gateway|
|`asaas`|Asaas|
|`barte`|Barte|
|`braspag`|Braspag|
|`cel_cash`|Cel Cash|
|`cielo`|Cielo|
|`cofidis pay`|Cofidis Pay|
|`coinbase`|Coinbase|
|`coinpayments`|CoinPayments|
|`dom pagamentos`|Dom Pagamentos|
|`doppus`|Doppus|
|`ebanx`|EBANX|
|`e.rede`|e-Rede|
|`eduzz`|Eduzz|
|`getnet`|Getnet|
|`hotmart`|Hotmart|
|`iugu`|Iugu|
|`koin`|Koin|
|`lytex`|Lytex|
|`malga`|Malga|
|`marlim`|Marlim|
|`maxipago`|maxiPago!|
|`mercadopago`|Mercado Pago|
|`monetizze`|Monetizze|
|`mundipagg`|Mundipagg|
|`nupay`|NuPay|
|`pagarme2`|Pagar.me V2|
|`pagbank`|PagBank|
|`pagbrasil`|PagBrasil|
|`paypal`|PayPal|
|`perfectpay`|Perfect Pay|
|`principia`|Principia|
|`reverepayments`|Revere Payments|
|`revolut`|Revolut|
|`safe2pay`|Safe2Pay|
|`sibs`|SIBS|
|`stripe`|Stripe|
|`ticto`|Ticto|
|`vindi`|Vindi|
|`yampi`|Yampi|
# Opções de Afiliações

---

A Guru possui opções de afiliações:

|Opção|Descrição|
|:--|:--|
|`with`|Com afiliado|
|`without`|Sem afiliado|
# Status de Assinaturas

---

Consulte a lista de status de assinaturas na Guru.

|Código|Descrição|
|:--|:--|
|`active`|Ativa|
|`canceled`|Cancelada|
|`expired`|Expirada|
|`inactive`|Inativa|
|`pastdue`|Atrasada|
|`started`|Iniciada|
|`trial`|Trial|
# Status de Etickets

---

Consulte a lista de status do eticket na Guru.

|Status|Descrição|
|:--|:--|
|`assigned`|Atribuído|
|`canceled`|Cancelado|
|`checked_in`|Check-in realizado|
|`invited`|Convidado|
|`open`|Aberto|
# Status de Entrega

---

Consulte a lista de status de transações na Guru.

|Status|Descrição|
|:--|:--|
|`delayed`|Atrasado|
|`delivered`|Entregue|
|`lost`|Extraviado|
|`out_for_delivery`|Em distribuição|
|`posted`|Postado|
|`returned`|Devolvido|
|`waiting_postage`|A aguardar postagem|
|`waiting_tracking_code`|A aguardar código de rastreamento|
# Status de Invoice

---

Consulte a lista de status de invoice na Guru.

|Status|Descrição|
|:--|:--|
|`paid`|Pago|
|`waiting_payment`|Aguardando pagamento|
|`pastdue`|Atrasado|
|`canceled`|Cancelado|
# Status de Vendas

---

Consulte a lista de status de vendas na Guru.

|Status|Descrição|
|:--|:--|
|`abandoned`|Abandonada|
|`analysis`|Em Análise|
|`approved`|Aprovada|
|`billet_printed`|Boleto Impresso|
|`blocked`|Bloqueada|
|`canceled`|Cancelada|
|`chargeback`|Reclamada|
|`charging`|A Processar Pagamento|
|`completed`|Completa|
|`delayed`|Atrasada|
|`dispute`|Reembolso Sol.|
|`expired`|Expirada|
|`failed`|Erro na Transferência|
|`in_recovery`|Em Recuperação|
|`pending`|Pendente|
|`pending_transfer`|Transferência Pendente|
|`processing`|Em Processamento|
|`refunded`|Reembolsada|
|`rejected`|Rejeitada|
|`scheduled`|Agendada|
|`started`|Iniciada|
|`transferred`|Transferido|
|`trial`|Trial|
|`waiting_payment`|Ag. Pagamento|
# Tipos de Affiliações

---

Consulte a lista de tipos de afiliações na Guru:

|Tipos|Descrição|
|:--|:--|
|`all`|Todos|
|`referral`|Indicação|
# Tipos de Bloqueio

---

Consulte a lista dos tipos de bloqueio disponíveis no Guru.

|Código|Descrição|
|:--|:--|
|`all`|Todos|
|`document`|Documento (CPF/NIF)|
|`email`|E-mail|
|`ip`|Endereço IP|
# Tipos de Intervalos

---

Consulte a lista de tipos de intervalos na Guru.

|Tipos|Descrição|
|:--|:--|
|`day`|Diário|
|`week`|Semanal|
|`month`|Mensal|
|`year`|Anual|
# Tipos de Invoice

---

Consulte a lista de tipos de invoice na Guru.

|Status|Descrição|
|:--|:--|
|`cycle`|Ciclo|
|`downgrade`|Downgrade|
|`upgrade`|Upgrade|
|`upsell`|Upsell|
# Tipos de Produto

---

Consulte a lista dos tipos de produto disponíveis no Guru.

|Código|Descrição|
|:--|:--|
|`product`|Venda Avulsa|
|`plan`|Assinatura|
|`eticket`|E-ticket / Evento|
# Tipos de Rastreamento

---

Consulte a lista de tipos de rastreamento na Guru.

|Tipos|Descrição|
|:--|:--|
|`campaign`|Campanha|
|`checkout`|Checkout|
|`groups`|Grupos|
|`form`|Formulário|
|`lead`|Lead|
# Webhooks

Ao ativar webhooks, a plataforma envia um `POST` automático para a URL configurada sempre que o recurso integrado for alterado. O corpo da requisição contém os dados do recurso.

**Configuração:** para configurar os webhooks, consulte a documentação em [docs.digitalmanager.guru/configuracoes-gerais/webhook](https://docs.digitalmanager.guru/configuracoes-gerais/webhook).

## Autenticação

O campo `api_token` no payload valida que a requisição partiu do Guru (equivale ao Account Token da conta).

## Identificação da requisição

Cada disparo gera um ID único e incremental no tempo enviado no header `X-Request-ID`.

## Resposta esperada

O endpoint receptor deve retornar `HTTP 200`. Sem isso, a entrega é retentada.

## Política de retentativas

|Situação|Comportamento|
|---|---|
|Falha inicial|Retenta a cada minuto, até 10 tentativas|
|Demais erros|Até 20 tentativas com delay exponencial (1 min, 2 min, 3 min…)|
|Após esgotar tentativas|Notificação enviada ao administrador da conta|

Códigos que **suprimem retentativas** (sem reentrega):

|Códigos|
|:-:|
|`0`|
|`401`|
|`403`|
|`404`|
|`406`|
|`410`|
|`422`|
|`505`|
|`506`|
|`510`|
|`511`|

## Política de desativação automática

O sistema mantem um contador de sucessos e falhas para cada webhook.

Quando o total (sucessos + falhas) dos contadores é maior ou igual a 100 e a taxa de falhas (falhas / total) ultrapassa 60% o webhook é desativado automaticamente, o webhook de desativação é enviado e os administradores da conta são notificados por email e painel administrativo.

Sempre que o total atinge 200, o contador é reiniciado.

## Delays de entrega

|Recurso|Delay|
|---|---|
|Transações e e-tickets|5 segundos|
|Assinaturas|10 segundos|

## Limites operacionais de envio

- Máximo de 100 webhooks simultâneos por conta
- 1 webhook por URL de destino + ID de objeto
- 5 a 15 requisições simultâneas (configurável pelo admin)

Quando os limites são atingidos, os webhooks voltam para a fila com espera de 10 segundos.

# Webhook para Assinaturas

É possível utilizar webhook, para que seu sistema seja notificado sobre alterações que ocorram nas assinaturas.

|Campo|Tipo|Obrigatório|Descrição|
|:--|:--|:--|:--|
|`affiliations.*.affiliates_group_namecurr`|String|Sim|Nome do grupo da afiliação|
|`affiliations.*.contact_email`|String|Não|Email da afiliação|
|`affiliations.*.currency`|String|Não|Moeda da afiliação|
|`affiliations.*.fee`|Float|Não|Taxa da afiliação|
|`affiliations.*.id`|String|Não|Id da afiliação|
|`affiliations.*.marketplace_id`|String|Não|Id do marketplace da afiliação|
|`affiliations.*.name`|String|Não|Nome da afiliação|
|`affiliations.*.net_value`|Float|Não|Valor líquido da comissão da afiliação|
|`affiliations.*.value`|Float|Não|Valor da comissão da afiliação|
|`api_token`|Char(40)|Sim|Chave de API do Guru|
|`cancel_at_cycle_end`|Boolean (0/1)|Sim|Cancelamento no final de ciclo|
|`cancel_reason`|String|Sim|Motivo de Cancelamento|
|`cancelled_by.name`|String(191)|Sim|Nome do Usuário que fez cancelamento|
|`cancelled_by.email`|String(191)|Sim|Email do Usuário que fez cancelamento|
|`cancelled_by.date`|YYYY-MM-DDTHH:MM:SSZ (String)|Sim|Data do cancelamento|
|`charged_every_days`|Integer|Sim|Cobrança a cada X dias|
|`charged_times`|Integer|Sim|Quantidade de Cobranças|
|`contracts`|Array|Sim|Contratos|
|`credit_card.bin`|String|Não|Bin do cartão|
|`credit_card.brand`|String|Não|Marca do cartão|
|`credit_card.created_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de criação do cartão|
|`credit_card.expiration_month`|String|Não|Mês de expiração do cartão|
|`credit_card.expiration_year`|String|Não|Ano de expiração do cartão|
|`credit_card.holder_name`|String|Não|Nome do titular do cartão|
|`credit_card.id`|String|Não|Id do cartão|
|`credit_card.last_four`|String|Não|Últimos quatro dígitos do cartão|
|`credit_card.marketplace`|Object|Não|Informação do processador de pagamento|
|`credit_card.renewed`|Integer|Não|-|
|`credit_card.updated_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de Atualização do cartão|
|`current_invoice.charge_at`|YYYY-MM-DD|Sim|Data da cobrança|
|`current_invoice.code`|String|Sim|Código da fatura|
|`current_invoice.created_at`|Integer|Sim|Data de criação da fatura (Unix timestamp)|
|`current_invoice.cycle`|Integer|Sim|Ciclo da assinatura a que se refere a fatura|
|`current_invoice.discount_value`|Float|Sim|Valor do desconto|
|`current_invoice.id`|String|Sim|ID da fatura|
|`current_invoice.increment_value`|Integer|Sim|Valor do incremento|
|`current_invoice.payment_url`|String|Sim|URL do pagamento|
|`current_invoice.period_end`|YYYY-MM-DD|Sim|Fim do periodo|
|`current_invoice.period_start`|YYYY-MM-DD|Sim|Início do periodo|
|`current_invoice.status`|String|Sim|Estado da fatura|
|`current_invoice.subscription_id`|String|Sim|ID da assinatura|
|`current_invoice.tax_value`|Float|Sim|Valor do imposto|
|`current_invoice.type`|String|Sim|Tipo da fatura|
|`current_invoice.value`|Float|Sim|Valor da fatura|
|`current_invoice.updated_at`|Integer|Sim|Data de atualização da fatura (Unix timestamp)|
|`dates.canceled_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de cancelamento|
|`dates.cycle_end_date`|YYYY-MM-DD|Sim|Data de fim de ciclo|
|`dates.cycle_start_date`|YYYY-MM-DD|Sim|Data de início de ciclo|
|`dates.last_status_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data do último Status|
|`dates.next_cycle_at`|YYYY-MM-DD|Sim|Data do próximo ciclo|
|`dates.started_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data de Início|
|`id`|String(191)|Sim|ID da Assinatura|
|`internal_id`|String|Sim|ID Interno da Assinatura|
|`last_status`|SubscriptionStatus|Sim|Status da Assinatura|
|`last_transaction.affiliations.*.marketplace_id`|String(191)|Não|Id do marketplace da afiliação|
|`last_transaction.affiliations.*.name`|String(191)|Não|Nome da afiliação|
|`last_transaction.affiliations.*.contact_email`|String(191)|Não|Email da afiliação|
|`last_transaction.affiliations.*.value`|Float|Não|Valor da comissão da afiliação|
|`last_transaction.affiliations.*.currency`|String(191)|Não|Moeda da afiliação|
|`last_transaction.checkout_url`|String|Não|Url do Checkout do Guru|
|`last_transaction.checkout_invoice_url`|String|Não|Url pública do pedido|
|`last_transaction.contact.id`|Integer|Não|Id|
|`last_transaction.contact.name`|String(191)|Não|Nome|
|`last_transaction.contact.email`|String(191)|Não|E-mail|
|`last_transaction.contact.doc`|String(191)|Não|Documento|
|`last_transaction.contact.phone_number`|String(191)|Não|Telefone|
|`last_transaction.contact.phone_local_code`|String(191)|Não|Indicativo do telefone|
|`last_transaction.contact.address`|String(191)|Não|Endereço|
|`last_transaction.contact.address_number`|String(191)|Não|Número|
|`last_transaction.contact.address_comp`|String(191)|Não|Complemento|
|`last_transaction.contact.address_district`|String(191)|Não|Bairro|
|`last_transaction.contact.address_city`|String(191)|Não|Cidade|
|`last_transaction.contact.address_state`|String(191)|Não|Estado|
|`last_transaction.contact.address_state_full_name`|String|Não|Nome completo do estado|
|`last_transaction.contact.address_country`|String(191)|Não|País|
|`last_transaction.contact.address_zip_code`|String(191)|Não|Código Postal|
|`last_transaction.contact.lead.first_tracking.name`|String(191)|Não|Nome do primeiro rastreio do lead|
|`last_transaction.contact.lead.first_tracking.type`|TrackingType|Não|Tipo do primeiro rastreio do lead|
|`last_transaction.contact.lead.first_tracking.publisher`|Publisher|Não|Anunciante do primeiro rastreio do lead|
|`last_transaction.contact.lead.first_tracking.tracked_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do primeiro rastreio do lead|
|`last_transaction.contact.lead.last_tracking.name`|String(191)|Não|Nome do último rastreio do lead|
|`last_transaction.contact.lead.last_tracking.type`|TrackingType|Não|Tipo do último rastreio do lead|
|`last_transaction.contact.lead.last_tracking.publisher`|Publisher|Não|Anunciante do último rastreio do lead|
|`last_transaction.contact.lead.last_tracking.tracked_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do último rastreio do lead|
|`last_transaction.dates.canceled_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do Cancelamento|
|`last_transaction.dates.confirmed_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data da Aprovação|
|`last_transaction.dates.created_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de Criação|
|`last_transaction.dates.expires_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de Expiração|
|`last_transaction.dates.ordered_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data do Pedido|
|`last_transaction.dates.unavailable_until`|YYYY-MM-DDTHH:MM:SSZ|Não|Indisponível até|
|`last_transaction.dates.updated_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de atualização|
|`last_transaction.dates.warranty_until`|YYYY-MM-DDTHH:MM:SSZ|Não|Garantia até|
|`last_transaction.ecommerces.magento.order_id`|Integer|Não|Número do Pedido Magento|
|`last_transaction.ecommerces.kapsula.pedido`|Integer|Não|Número do Pedido Kapsula|
|`last_transaction.ecommerces.magento.quote_id`|Integer|Não|Número da Cotação Magento|
|`last_transaction.ecommerces.shopify.order_id`|Integer|Não|Número do Pedido Shopify|
|`last_transaction.ecommerces.shopify.transaction_id`|Integer|Não|Número da Transação Shopify|
|`last_transaction.ecommerces.woocommerce.id`|Integer|Não|Número do Pedido Woocommerce|
|`last_transaction.extras.accepted_terms_url`|Integer|Sim|Indica que o comprador aceitou os termos de utilização|
|`last_transaction.extras.accepted_privacy_policy_url`|Integer|Sim|Indica que o comprador aceitou a política de privacidade|
|`last_transaction.id`|String(191)|Sim|ID da Transação|
|`last_transaction.infrastructure.ip`|String(191)|Não|IP do comprador|
|`last_transaction.infrastructure.city`|String(191)|Não|Cidade do comprador|
|`last_transaction.infrastructure.region`|String|Não|Região do comprador|
|`last_transaction.infrastructure.host`|String|Não|Host do comprador|
|`last_transaction.infrastructure.country`|String(191)|Não|País do comprador|
|`last_transaction.infrastructure.user_agent`|String(191)|Não|User Agent do comprador|
|`last_transaction.infrastructure.city_lat_long`|String(191)|Não|Coordenadas do comprador|
|`last_transaction.invoice.charge_at`|YYYY-MM-DD|Sim|Data de cobrança|
|`last_transaction.invoice.created_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data de criação da fatura|
|`last_transaction.invoice.cycle`|Integer|Sim|Ciclo da assinatura a que se refere a fatura|
|`last_transaction.invoice.discount_value`|Float|Sim|Valor do desconto|
|`last_transaction.invoice.id`|String|Sim|ID da fatura|
|`last_transaction.invoice.increment_value`|Float|Sim|Valor do incremento|
|`last_transaction.invoice.period_end`|YYYY-MM-DD|Sim|Data do final do período|
|`last_transaction.invoice.period_start`|YYYY-MM-DD|Sim|Data do início do período|
|`last_transaction.invoice.status`|String|Sim|Status da fatura|
|`last_transaction.invoice.tax_value`|Float|Sim|Valor do imposto|
|`last_transaction.invoice.tries`|Integer|Sim|Número total de tentativas|
|`last_transaction.invoice.try`|Integer|Sim|Número da tentativa|
|`last_transaction.invoice.type`|Status|Sim|Tipo da fatura|
|`last_transaction.invoice.value`|Float|Sim|Valor da fatura|
|`last_transaction.payment.affiliate_value`|Float|Sim|Valor Afiliados|
|`last_transaction.payment.acquirer.code`|String|Sim|Código do adquirente|
|`last_transaction.payment.acquirer.message`|String|Sim|Mensagem do adquirente|
|`last_transaction.payment.acquirer.name`|String|Sim|Nome do adquirente|
|`last_transaction.payment.acquirer.nsu`|String|Sim|NSU do adquirente|
|`last_transaction.payment.acquirer.tid`|String|Sim|TID do adquirente|
|`last_transaction.payment.can_try_again`|Integer (0/1)|Sim|Indica se pode tentar novamente|
|`last_transaction.payment.coupon.id`|String|Não|Id do cupom|
|`last_transaction.payment.coupon.coupon_code`|String|Não|Código do cupom|
|`last_transaction.payment.coupon.incidence_type`|String|Não|Tipo de incidência do cupom|
|`last_transaction.payment.coupon.incidence_field`|String|Não|Incidência do cupom|
|`last_transaction.payment.coupon.incidence_value`|Float|Não|Valor do cupom|
|`last_transaction.payment.coupon.last_sent_at`|Integer|Não|Unix timestamp|
|`last_transaction.payment.coupon.final_value`|Float|Não|Valor final do cupom|
|`last_transaction.payment.currency`|String(191)|Sim|Moeda (ISO 4217)|
|`last_transaction.payment.discount_value`|Float|Sim|Valor Desconto|
|`last_transaction.payment.gross`|Float|Sim|Valor Bruto|
|`last_transaction.payment.instalments.value`|Float|Não|Valor das Parcelas|
|`last_transaction.payment.instalments.qty`|Integer|Não|Quantidade de Parcelas da venda|
|`last_transaction.payment.installments.interest`|Float|Não|Valor dos juros do parcelamento|
|`last_transaction.payment.marketplace_id`|String(191)|Sim|Código da Venda no Processador de Pagamento|
|`last_transaction.payment.marketplace_name`|String(191)|Sim|Processador de Pagamento|
|`last_transaction.payment.marketplace_value`|Float|Sim|Valor do Processador de Pagamento|
|`last_transaction.payment.method`|PaymentMethod|Sim|Método de Pagamento|
|`last_transaction.payment.net`|Float|Sim|Valor Líquido|
|`last_transaction.payment.processing_times.started_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de início do processamento|
|`last_transaction.payment.processing_times.finished_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de final do processamento|
|`last_transaction.payment.processing_times.delay_in_seconds`|Integer|Não|Atraso (em segundos)|
|`last_transaction.payment.refund_reason`|String|Não|Razão de reembolso|
|`last_transaction.payment.refuse_reason`|String(191)|Não|Mensagem do processador de pagamento|
|`last_transaction.payment.tax.value`|Float|Não|Valor da Taxa|
|`last_transaction.payment.tax.rate`|Float|Não|Porcentagem da Taxa|
|`last_transaction.payment.total`|Float|Sim|Valor Total|
|`last_transaction.payment.creditcard.brand`|String(191)|Não|Bandeira do cartão|
|`last_transaction.payment.creditcard.expiration_month`|String|Não|Mês de expiração do cartão|
|`last_transaction.payment.creditcard.expiration_year`|String|Não|Ano de expiração do cartão|
|`last_transaction.payment.creditcard.first_digits`|Integer|Não|Bin do cartão|
|`last_transaction.payment.creditcard.id`|String|Não|Id do cartão|
|`last_transaction.payment.creditcard.last_digits`|Integer|Não|Quatro últimos dígitos do cartão|
|`last_transaction.payment.billet.line`|String(191)|Não|Linha Digitável do Boleto|
|`last_transaction.payment.billet.url`|String(191)|Não|Url do Boleto|
|`last_transaction.payment.billet.expiration_date`|String(191)|Não|Data de Expiração do Boleto|
|`last_transaction.payment.pix.qrcode.signature`|String(191)|Não|Código QRCode do Pix|
|`last_transaction.payment.pix.qrcode.url`|String(191)|Não|URL QRCode do Pix|
|`last_transaction.payment.pix.expiration_date`|String(191)|Não|Data de Expiração do Pix|
|`last_transaction.payment.spei.url`|String(191)|Não|URL do pagamento SPEI|
|`last_transaction.payment.spei.account`|String(191)|Não|Código da Conta SPEI|
|`last_transaction.payment.spei.reference`|String(191)|Não|Código da Referência SPEI|
|`last_transaction.payment.spei.expiration_date`|String(191)|Não|Data de Expiração do SPEI|
|`last_transaction.payment.oxxo.url`|String(191)|Não|URL do pagamento OXXO|
|`last_transaction.payment.oxxo.barcode`|String(191)|Não|Código de Barras OXXO|
|`last_transaction.payment.oxxo.expiration_date`|String(191)|Não|Data de Expiração do OXXO|
|`last_transaction.product.id`|String(191)|Sim|Id do produto|
|`last_transaction.product.image_url`|String(191)|Não|Imagem do produto|
|`last_transaction.product.internal_id`|String|Sim|Id interno do produto|
|`last_transaction.product.marketplace_id`|String|Sim|Id do marketplace|
|`last_transaction.product.marketplace_name`|String(191)|Sim|Nome do marketplace do produto|
|`last_transaction.product.name`|String(191)|Sim|Nome do produto|
|`last_transaction.product.offer.id`|String|Sim|Id da oferta|
|`last_transaction.product.offer.name`|String|Sim|Nome da oferta|
|`last_transaction.product.producer.marketplace_id`|String(191)|Sim|Id Marketplace do produtor|
|`last_transaction.product.producer.name`|String(191)|Sim|Nome do produtor|
|`last_transaction.product.producer.contact_email`|String(191)|Não|Email do produtor|
|`last_transaction.product.qty`|Integer|Sim|Quantidade do produto|
|`last_transaction.product.total_value`|Float|Sim|Valor total do produto|
|`last_transaction.product.type`|String(191)|plan/product|Tipo do produto|
|`last_transaction.product.unit_value`|Float|Sim|Valor unitário do produto|
|`last_transaction.shipment.carrier`|String(191)|Não|Nome da transportadora|
|`last_transaction.shipment.service`|String(191)|Não|Serviço da transportadora|
|`last_transaction.shipment.tracking`|String(191)|Não|Código de rastremanto|
|`last_transaction.shipment.value`|Float|Não|Valor da transportadora|
|`last_transaction.shipment.status`|Array|Não|Estados do envio|
|`last_transaction.shipment.delivery_time`|Integer|Não|Tempo de entrega|
|`last_transaction.shipping.name`|String|Sim|Nome do frete|
|`last_transaction.shipping.value`|Float|Sim|Valor do frete|
|`last_transaction.source.source`|String(191)|Não|Origem da Venda|
|`last_transaction.source.checkout_source`|String(191)|Não|Origem da Venda|
|`last_transaction.source.utm_source`|String(191)|Não|Origem da Venda|
|`last_transaction.source.utm_campaign`|String(191)|Não|Origem da Venda|
|`last_transaction.source.utm_medium`|String(191)|Não|Origem da Venda|
|`last_transaction.source.utm_content`|String(191)|Não|Origem da Venda|
|`last_transaction.source.utm_term`|String(191)|Não|Origem da Venda|
|`last_transaction.source.pptc.tracking_name`|String(191)|Não|Nome do Rastreamento|
|`last_transaction.source.pptc.tracking_type`|TrackingType|Não|Tipo do Rastreamento|
|`last_transaction.source.pptc.tracking_publisher`|Publisher|Não|Anunciante do Rastreamento|
|`last_transaction.source.pptc.user_name`|String(191)|Não|Nome do usuário|
|`last_transaction.source.pptc.checkout_name`|String(191)|Não|Nome do checkout|
|`last_transaction.source.pptc.utm_campaign`|String(191)|Não|UTM_CAMPAIGN do Rastreamento|
|`last_transaction.source.pptc.utm_medium`|String(191)|Não|UTM_MEDIUM do Rastreamento|
|`last_transaction.source.pptc.utm_content`|String(191)|Não|UTM_CONTENT do Rastreamento|
|`last_transaction.source.pptc.utm_term`|String(191)|Não|UTM_TERM do Rastreamento|
|`last_transaction.status`|TransactionStatus|Sim|Status da Venda|
|`last_transaction.type`|Types|Sim|Tipo da venda|
|`name`|String(191)|Sim|Nome da Assinatura|
|`next_product.id`|String|Sim|Id do próximo produto|
|`next_product.marketplace_id`|String|Sim|Id do marketplace|
|`next_product.makerplace_name`|String|Sim|Nome do marketplace|
|`next_product.name`|String|Sim|Nome do próximo produto|
|`next_product.offer.cash_discount`|Float|Sim|Valor do desconto de pagamento à vista|
|`next_product.offer.id`|String|Sim|Id da oferta|
|`next_product.offer.name`|String|Sim|Nome da oferta|
|`next_product.offer.plan.cycles`|Integer|Sim|Número de ciclos do plano|
|`next_product.offer.plan.discount.value`|Float|Sim|Valor do desconto|
|`next_product.offer.plan.discount.cycle`|Integer|Sim|Número de ciclos a aplicar o desconto|
|`next_product.offer.plan.increment.value`|Float|Sim|Valor do incremento|
|`next_product.offer.plan.increment.cycle`|Integer|Sim|Número de ciclos a aplicar o incremento|
|`next_product.offer.plan.interval`|Integer|Sim|Intervalo da assinatura|
|`next_product.offer.plan.interval_type`|String|Sim|Tipo de intervalo da assinatura|
|`next_product.offer.plan.provider`|String|Sim|Provedor da oferta|
|`next_product.offer.plan.split_cycles`|Integer|Sim|Ciclos divididos|
|`next_product.offer.plan.trial_days`|Integer|Sim|Dias de trial|
|`next_product.offer.units_per_sale`|Integer|Sim|Unidades por venda|
|`next_product.offer.value`|Float|Sim|Valor da oferta|
|`payment_method`|PaymentMethod|Sim|Método de Pagamento|
|`product.id`|String|Sim|Id do produto|
|`product.marketplace_id`|String|Sim|Id do marketplace|
|`product.marketplace_name`|String|Sim|Nome do marketplace|
|`product.name`|String|Sim|Nome do produto|
|`product.offer.cash_discount`|Float|Sim|Valor do desconto de pagamento à vista|
|`product.offer.id`|String|Sim|Id da oferta|
|`product.offer.name`|String|Sim|Nome da oferta|
|`product.offer.plan.cycles`|Integer|Sim|Número de ciclos do plano|
|`product.offer.plan.discount.value`|Float|Sim|Valor do desconto|
|`product.offer.plan.discount.cycles`|Integer|Sim|Número de ciclos a aplicar o desconto|
|`product.offer.plan.increment.value`|Float|Sim|Valor do incremento|
|`product.offer.plan.increment.cycles`|Integer|Sim|Número de ciclos a aplicar o incremento|
|`product.offer.plan.interval`|Integer|Sim|Intervalo da assinatura|
|`product.offer.plan.interval_type`|String|Sim|Tipo de intervalo da assinatura|
|`product.offer.plan.provider`|String|Sim|Provedor da oferta|
|`product.offer.plan.split_cycles`|Integer|Sim|Ciclos divididos|
|`product.offer.plan.trial_days`|Integer|Sim|Dias de trial|
|`product.offer.units_per_sale`|Integer|Sim|Unidades por venda|
|`product.offer.value`|Float|Sim|Valor da oferta|
|`provider`|String|Sim|Provedor|
|`subscriber.address`|String(191)|Não|Endereço|
|`subscriber.address_city`|String(191)|Não|Cidade|
|`subscriber.address_comp`|String(191)|Não|Complemento|
|`subscriber.address_country`|String(191)|Não|País|
|`subscriber.address_district`|String(191)|Não|Bairro|
|`subscriber.address_number`|String(191)|Não|Número|
|`subscriber.address_state`|String(191)|Não|Estado|
|`subscriber.address_zip_code`|String|Não|Código postal|
|`subscriber.doc`|String(191)|Não|Documento|
|`subscriber.email`|String(191)|Não|E-mail|
|`subscriber.id`|String(191)|Sim|Id|
|`subscriber.name`|String(191)|Não|Nome|
|`subscriber.phone_local_code`|String(191)|Não|Indicativo do telefone|
|`subscriber.phone_number`|String(191)|Não|Telefone|
|`subscription_code`|String|Sim|Código da assinatura|
|`trial_days`|Integer|Sim|Dias de assinatura|
|`trial_finished_at`|YYYY-MM-DD|Não|Fim|
|`trial_started_at`|YYYY-MM-DD|Não|Início Trial|
|`webhook_type`|String|Sim|Tipo do webhook (subscription)|

  

**Exemplo de JSON a ser recebido [POST]**

A notificação consiste em um POST contendo um JSON, conforme exemplo:

```json
{
  "affiliations": [
          {
              "affiliates_group_name": "group test",
              "contact_email": "john.doe@email.com",
              "currency": "BRL",
              "fee": 19.32,
              "id": "99f598ca-1d90-4afb-b306-70cc52b56f2f",
              "marketplace_id": "YR5TFRMH",
              "name": "John Doe",
              "net_value": 315.07,
              "value": 334.39
          }
      ],
      "api_token": "mLjcGjzKGnXme5b7gbuKMggL34Ecdt5NHGihxfWr",
      "cancel_at_cycle_end": 0,
      "cancel_reason": null,
      "cancelled_by": {
          "date": "2023-12-13T10:39:31Z",
          "email": null,
          "name": null
      },
      "charged_every_days": 30,
      "charged_times": 1,
      "contracts": [],
      "credit_card": {
          "bin": null,
          "brand": "visa",
          "created_at": "2023-12-13T10:39:31Z",
          "expiration_month": 1,
          "expiration_year": 2025,
          "holder_name": null,
          "id": "1ece9218-12f1-4484-981e-1e8fc8b498d9",
          "last_four": "0010",
          "marketplace": {
              "stripe": {
                  "customer": {
                      "id": "cus_Pi4mdcq2qZiL4s"
                  },
                  "payment": {
                      "id": null
                  }
              }
          },
          "updated_at": "2023-12-13T10:39:31Z"
      },
      "current_invoice": {
          "charge_at": "2024-12-13",
          "code": "in_y5ZoRccnvFrFEgkPE",
          "created_at": 1709131182,
          "cycle": 2,
          "discount_value": 0,
          "id": "9b71cfb2-da2e-44d5-92ce-d83459dec85f",
          "increment_value": 0,
          "payment_url": "https://clkdmg.site/pay/9b71cfb2-da2e-44d5-92ce-d83459dec85a/invoice",
          "period_end": "2025-12-13",
          "period_start": "2024-12-13",
          "status": "paid",
          "subscription_id": "9ad693fe-4366-487b-8ac3-ff4831864928",
          "tax_value": 5.49,
          "type": "cycle",
          "updated_at": 1709131802,
          "value": 29.37
      },
      "dates": {
          "canceled_at": null,
          "cycle_end_date": "2025-12-13",
          "cycle_start_date": "2024-02-28",
          "last_status_at": "2020-05-07T18:39:34Z",
          "next_cycle_at": "2025-12-14",
          "started_at": "2020-05-07T11:35:57Z"
      },
      "id": "sub_BOAEj2WTKoclmg4X",
      "internal_id": "9ad693fe-4366-487b-8ac3-ff4831864929",
      "last_status": "active",
      "last_transaction": {
          "affiliations": [],
          "checkout_url": "https://clkdmg.site/subscribe/9059bdb6-0ca4-4253-b405-482df6393537",
          "checkout_invoice_url": "https://clkdmg.site/invoice/a1b2c3d4-0000-0000-0000-000000000001",
          "contact": {
              "address": "Rua Terra Rica",
              "address_city": "Pinhais",
              "address_comp": "",
              "address_country": "BR",
              "address_district": "Centro",
              "address_number": "123",
              "address_state": "PR",
              "address_state_full_name": "Aveiro",
              "address_zip_code": "83324090",
              "company_name": "",
              "doc": "01234567890",
              "email": "email@email.email",
              "id": "906d1e37-de6a-4f4d-8271-91ecd0d65ec6",
              "lead": {
                  "first_tracking": {
                      "name": "TEstes",
                      "publisher": "",
                      "tracked_at": "2020-02-18T15:50:11Z",
                      "type": "form"
                  },
                  "last_tracking": {
                      "name": "Teste Tracking Plano",
                      "publisher": "Adwords",
                      "tracked_at": "2020-04-02T16:03:08Z",
                      "type": "lead"
                  }
              },
              "name": "Nome Contacto",
              "phone_local_code": "55",
              "phone_number": "1234567980"
          },
          "dates": {
              "canceled_at": null,
              "confirmed_at": "2020-05-07T11:35:57Z",
              "created_at": "2024-02-28T14:45:07Z",
              "expires_at": null,
              "ordered_at": "2020-05-07T11:33:45Z",
              "unavailable_until": "2020-06-06T11:35:57Z",
              "updated_at": "2024-02-28T14:50:36Z",
              "warranty_until": "2020-06-06T11:35:57Z"
          },
          "ecommerces": [],
          "extras": {
              "accepted_terms_url": 1,
              "accepted_privacy_policy_url": 1
          },
          "id": "9081534a-7512-4dab-9172-218c1dc1f263",
          "infrastructure": {
              "city": null,
              "city_lat_long": null,
              "country": "BR",
              "host": "https://clkdmg.site",
              "ip": "127.0.0.1",
              "region": null,
              "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          "invoice": {
              "charge_at": "2024-12-13",
              "created_at": "2024-02-28T14:39:42Z",
              "cycle": 2,
              "discount_value": 0,
              "id": "in_y5ZoRccnvFrFEgkPE",
              "increment_value": 0,
              "period_end": "2025-12-13",
              "period_start": "2024-12-13",
              "status": "paid",
              "tax_value": 5.49,
              "tries": 3,
              "try": 3,
              "type": "cycle",
              "value": 29.37
          },
          "payment": {
              "acquirer": {
                  "code": "",
                  "message": "",
                  "name": "",
                  "nsu": "",
                  "tid": ""
              },
              "affiliate_value": 0,
              "can_try_again": 1,
              "coupon": null,
              "billet": {
                  "expiration_date": "",
                  "line": "",
                  "url": ""
              },
              "credit_card": {
                  "brand": "visa",
                  "expiration_month": 12,
                  "expiration_year": 2024,
                  "first_digits": "400000",
                  "id": "card_WLmNYk1fmKUOwBwX",
                  "last_digits": "0010"
              },
              "currency": "BRL",
              "discount_value": 0,
              "gross": 500,
              "installments": {
                  "interest": 0,
                  "qty": 1,
                  "value": ""
              },
              "marketplace_id": "ch_1ke4QoCQOs7VE6VY",
              "marketplace_name": "mundipagg",
              "marketplace_value": 0,
              "method": null,
              "net": 500,
              "processing_times": {
                  "delay_in_seconds": 2,
                  "finished_at": "2024-02-28T14:50:02.397Z",
                  "started_at": "2024-02-28T14:50:00.241Z"
              },
              "refund_reason": "",
              "refuse_reason": "Transação capturada com sucesso",
              "tax": {
                  "rate": 0,
                  "value": 0
              },
              "total": 500
          },
          "product": {
              "group": {
                  "id": "a038a2c8-ef55-415e-b45d-3a5a3d6a74e6",
                  "name": "grupo 1"
              },
              "id": "1587151083",
              "image_url": "",
              "internal_id": "906d1e37-de6a-4f4d-8271-91ecd0d65e32",
              "marketplace_id": "1587151083",
              "marketplace_name": "mundipagg",
              "name": "Assinatura Mundipagg",
              "offer": {
                  "id": "9ad505be-e7f9-4a08-a591-3ec4991c2615",
                  "name": "bvm - stripe - assinatura1 - oferta1"
              },
              "producer": {
                  "contact_email": "",
                  "marketplace_id": "01234567890",
                  "name": "Produtor Mundipagg"
              },
              "qty": 1,
              "total_value": 500,
              "type": "plan",
              "unit_value": 500
          },
          "self_attribution": {
              "title": "Como você conheceu nosso produto?",
              "answer": "google"
          },
          "shipment": {
              "carrier": "Correios",
              "delivery_time": 15,
              "service": "SEDEX",
              "status": [],
              "tracking": "ME20000BGL2BR",
              "value": 105.68
          },
          "shipping": {
              "name": "Standard",
              "value": 0
          },
          "source": {
              "checkout_source": "",
              "pptc": [],
              "source": "",
              "utm_campaign": "",
              "utm_content": "",
              "utm_medium": "",
              "utm_source": "",
              "utm_term": ""
          },
          "status": "approved",
          "type": "producer"
      },
      "name": "Assinatura Mundipagg",
      "next_cycle_installments": 1,
      "next_cycle_value": 49.9,
      "next_product": {
          "id": "9ad4f5bf-5fe5-4d02-bd9d-f819961b57cc",
          "marketplace_id": "1702394333",
          "marketplace_name": "mundipagg",
          "name": "Assinatura Mundipagg",
          "offer": {
              "cash_discount": 0,
              "id": "9ad505be-e7f9-4a08-a591-3ec4991c2615",
              "name": "Assinatura Mundipagg",
              "plan": {
                  "cycles": 0,
                  "discount": {
                      "cycles": 0,
                      "value": 0
                  },
                  "increment": {
                      "cycles": 0,
                      "value": 0
                  },
                  "interval": 1,
                  "interval_type": "year",
                  "provider": "guru",
                  "split_cycles": 0,
                  "trial_days": 0
              },
              "units_per_sale": 12,
              "value": 23.88
          }
      },
      "payment_method": "credit_card",
      "product": {
          "id": "9ad4f5bf-5fe5-4d02-bd9d-f819961b57cc",
          "marketplace_id": "1702394333",
          "marketplace_name": "mundipagg",
          "name": "Assinatura Mundipagg",
          "offer": {
              "cash_discount": 0,
              "id": "9ad505be-e7f9-4a08-a591-3ec4991c2615",
              "name": "Assinatura Mundipagg",
              "plan": {
                  "cycles": 0,
                  "discount": {
                      "cycles": 0,
                      "value": 0
                  },
                  "increment": {
                      "cycles": 0,
                      "value": 0
                  },
                  "interval": 1,
                  "interval_type": "year",
                  "provider": "guru",
                  "split_cycles": 0,
                  "trial_days": 0
              },
              "units_per_sale": 12,
              "value": 23.88
          }
      },
      "provider": "guru",
      "subscriber": {
          "address": "Rua Terra Rica",
          "address_city": "Pinhais",
          "address_comp": "",
          "address_country": "BR",
          "address_district": "Centro",
          "address_number": "123",
          "address_state": "PR",
          "address_zip_code": "83324090",
          "doc": "01234567890",
          "email": "email@email.email",
          "id": "906d1e37-de6a-4f4d-8271-91ecd0d65ec6",
          "name": "Nome Assinante",
          "phone_local_code": "55",
          "phone_number": "1234567980"
      },
      "subscription_code": "sub_9CFyWTuPwXdJUikS",
      "trial_days": 0,
      "trial_finished_at": null,
      "trial_started_at": null,
      "webhook_type": "subscription"
}    
```

# Webhook para Desativação

---

O webhook de desativação notifica o seu sistema quando a plataforma **desativa automaticamente** um dos seus webhooks por excesso de falhas de entrega. A desativação ocorre quando a taxa de falha ultrapassa 60% em pelo menos 100 tentativas.

Este webhook é disparado apenas na desativação **automática** por taxa de falha — não é enviado quando o webhook é desativado manualmente. Ao receber esta notificação, verifique o endpoint afetado, corrija o problema e reative o webhook na plataforma.

|Campo|Tipo|Obrigatório|Descrição|
|:--|:--|:--|:--|
|`api_token`|Char(40)|Sim|Chave de API do Guru|
|`id`|String(191)|Sim|ID do webhook que foi desativado|
|`name`|String(191)|Sim|Nome do webhook desativado|
|`url`|String|Sim|URL do webhook desativado|
|`type`|String|Sim|Tipo do webhook desativado (`transaction`, `subscription` ou `eticket`)|
|`is_active`|Boolean|Sim|Sempre `false` (o webhook foi desativado)|
|`deactivation.reason`|String|Sim|Motivo da desativação (`failure_rate_exceeded`)|
|`deactivation.delivered_times`|Integer|Sim|Total de entregas bem-sucedidas antes da desativação|
|`deactivation.failed_times`|Integer|Sim|Total de falhas antes da desativação|
|`deactivation.failure_rate`|Float|Sim|Taxa de falha entre 0 e 1|
|`deactivation.deactivated_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data/hora da desativação|
|`webhook_type`|String|Sim|Tipo do webhook (`webhook_deactivation`)|

**Exemplo de JSON a ser recebido [POST]**

A notificação consiste em um POST contendo um JSON, conforme exemplo:

```json
{
    "api_token": "mLjcGjzKGnXme5b7gbuKMggL34Ecdt5NHGihxfWr",
    "id": "9081534a-7512-4dab-9172-218c1dc1f263",
    "name": "Meu webhook de vendas",
    "url": "https://meusite.com/webhook",
    "type": "transaction",
    "is_active": false,
    "deactivation": {
        "reason": "failure_rate_exceeded",
        "delivered_times": 38,
        "failed_times": 62,
        "failure_rate": 0.62,
        "deactivated_at": "2026-06-22T10:00:00Z"
    },
    "webhook_type": "webhook_deactivation"
}
```

# Webhook para E-tickets

É possível utilizar webhook, para que seu sistema seja notificado sobre as alterações que ocorram nos ingressos.

|Campo|Tipo|Obrigatório|Descrição|
|:--|:--|:--|:--|
|`api_token`|Char(40)|Sim|Chave de API do Guru|
|`attendee.custom_fields.*.index`|String(191)|Não|Posição do campo personalizado|
|`attendee.custom_fields.*.title`|String(191)|Não|Título do campo personalizado|
|`attendee.custom_fields.*.type`|String(191)|Não|Tipo do campo personalizado|
|`attendee.custom_fields.*.value`|String(191)|Não|Valor do campo personalizado|
|`attendee.address_country`|String(191)|Não|País|
|`attendee.email`|String(191)|Não|E-mail|
|`attendee.name`|String(191)|Não|Nome|
|`attendee.phone_local_code`|String(191)|Não|Indicativo do telefone|
|`attendee.phone_number`|String(191)|Não|Telefone|
|`code`|String(30)|Sim|Código do Eticket|
|`dates.created_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data da Criação|
|`dates.updated_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data de Atualização|
|`dates.checked_in_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do Check In|
|`hash`|String(191)|Sim|Hash do Eticket|
|`hash_url`|String|Sim|Url do Eticket|
|`id`|String(191)|Sim|ID do Eticket|
|`owner.email`|String(191)|Não|E-mail do Contacto|
|`owner.id`|String(191)|Não|Id do Contacto|
|`owner.name`|String(191)|Não|Nome do Contacto|
|`owner.phone_local_code`|String(191)|Não|Indicativo do telefone do Contacto|
|`owner.phone_number`|String(191)|Não|Telefone do Contacto|
|`product.id`|String(191)|Sim|Id interno do produto|
|`product.image_url`|String|Não|Imagem do produto|
|`product.marketplace_id`|String|Sim|Id do marketplace|
|`product.marketplace_name`|String(191)|Sim|Nome do marketplace do produto|
|`product.name`|String(191)|Sim|Nome do produto|
|`product.offer.id`|String(191)|Sim|Id da oferta|
|`product.offer.name`|String(191)|Sim|Nome da oferta|
|`product.event_details.address_city`|String|Não|Cidade|
|`product.event_details.address_comp`|String|Não|Complemento|
|`product.event_details.address_country`|String|Não|País|
|`product.event_details.address_district`|String|Não|Bairro|
|`product.event_details.address_local`|String|Não|Local|
|`product.event_details.address_number`|String|Não|Número|
|`product.event_details.address_state_full_name`|String|Não|Estado (nome completo)|
|`product.event_details.address_state`|String|Não|Estado|
|`product.event_details.address_zip_code`|String|Não|Código Postal|
|`product.event_details.address`|String|Não|Endereço|
|`product.event_details.allow_duplicate_emails`|Boolean (0/1)|Não|Permite emails duplicados|
|`product.event_details.automatic_ticket_assignment`|Boolean (0/1)|Não|Atribui atomaticamente ingresso ao comprador|
|`product.event_details.end_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data final do evento|
|`product.event_details.start_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data inicial do evento|
|`product.event_details.timezone_abbr`|String|Sim|Timezone (abreviado)|
|`product.event_details.timezone`|String|Sim|Timezone|
|`product.event_details.type`|String (in_person \| online)|Sim|Tipo do evento (presencial / online)|
|`product.event_details.url`|String|Não|Url do evento|
|`product.producer.marketplace_id`|String(191)|Sim|Id Marketplace do produtor|
|`product.producer.name`|String(191)|Sim|Nome do produtor|
|`product.producer.contact_email`|String(191)|Não|Email do produtor|
|`status`|EticketStatus|Sim|Status do Eticket|
|`transaction.affiliations.*.marketplace_id`|String(191)|Não|Id do marketplace da afiliação|
|`transaction.affiliations.*.name`|String(191)|Não|Nome da afiliação|
|`transaction.affiliations.*.contact_email`|String(191)|Não|Email da afiliação|
|`transaction.affiliations.*.value`|Float|Não|Valor da comissão da afiliação|
|`transaction.affiliations.*.currency`|String(191)|Não|Moeda da afiliação|
|`transaction.checkout_url`|String|Não|Url do Checkout do Guru|
|`transaction.checkout_invoice_url`|String|Não|Url pública do pedido|
|`transaction.contact.id`|Integer|Não|Id|
|`transaction.contact.name`|String(191)|Não|Nome|
|`transaction.contact.email`|String(191)|Não|E-mail|
|`transaction.contact.doc`|String(191)|Não|Documento|
|`transaction.contact.phone_number`|String(191)|Não|Telefone|
|`transaction.contact.phone_local_code`|String(191)|Não|Indicativo do telefone|
|`transaction.contact.address`|String(191)|Não|Endereço|
|`transaction.contact.address_number`|String(191)|Não|Número|
|`transaction.contact.address_comp`|String(191)|Não|Complemento|
|`transaction.contact.address_district`|String(191)|Não|Bairro|
|`transaction.contact.address_city`|String(191)|Não|Cidade|
|`transaction.contact.address_state`|String(191)|Não|Estado|
|`transaction.contact.address_state_full_name`|String|Não|Nome completo do estado|
|`transaction.contact.address_country`|String(191)|Não|País|
|`transaction.contact.address_zip_code`|String(191)|Não|Código Postal|
|`transaction.contact.lead.first_tracking.name`|String(191)|Não|Nome do primeiro rastreio do lead|
|`transaction.contact.lead.first_tracking.type`|TrackingType|Não|Tipo do primeiro rastreio do lead|
|`transaction.contact.lead.first_tracking.publisher`|Publisher|Não|Anunciante do primeiro rastreio do lead|
|`transaction.contact.lead.first_tracking.tracked_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do primeiro rastreio do lead|
|`transaction.contact.lead.last_tracking.name`|String(191)|Não|Nome do último rastreio do lead|
|`transaction.contact.lead.last_tracking.type`|TrackingType|Não|Tipo do último rastreio do lead|
|`transaction.contact.lead.last_tracking.publisher`|Publisher|Não|Anunciante do último rastreio do lead|
|`transaction.contact.lead.last_tracking.tracked_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do último rastreio do lead|
|`transaction.dates.canceled_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do Cancelamento|
|`transaction.dates.confirmed_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data da Aprovação|
|`transaction.dates.created_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de Criação|
|`transaction.dates.expires_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de Expiração|
|`transaction.dates.ordered_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data do Pedido|
|`transaction.dates.unavailable_until`|YYYY-MM-DDTHH:MM:SSZ|Não|Indisponível até|
|`transaction.dates.updated_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de atualização|
|`transaction.dates.warranty_until`|YYYY-MM-DDTHH:MM:SSZ|Não|Garantia até|
|`transaction.ecommerces.magento.order_id`|Integer|Não|Número do Pedido Magento|
|`transaction.ecommerces.kapsula.pedido`|Integer|Não|Número do Pedido Kapsula|
|`transaction.ecommerces.magento.quote_id`|Integer|Não|Número da Cotação Magento|
|`transaction.ecommerces.shopify.order_id`|Integer|Não|Número do Pedido Shopify|
|`transaction.ecommerces.shopify.transaction_id`|Integer|Não|Número da Transação Shopify|
|`transaction.ecommerces.woocommerce.id`|Integer|Não|Número do Pedido Woocommerce|
|`transaction.extras.accepted_terms_url`|Integer|Sim|Indica que o comprador aceitou os termos de utilização|
|`transaction.extras.accepted_privacy_policy_url`|Integer|Sim|Indica que o comprador aceitou a política de privacidade|
|`transaction.id`|String(191)|Sim|ID da Transação|
|`transaction.infrastructure.ip`|String(191)|Não|IP do comprador|
|`transaction.infrastructure.city`|String(191)|Não|Cidade do comprador|
|`transaction.infrastructure.region`|String|Não|Região do comprador|
|`transaction.infrastructure.host`|String|Não|Host do comprador|
|`transaction.infrastructure.country`|String(191)|Não|País do comprador|
|`transaction.infrastructure.user_agent`|String(191)|Não|User Agent do comprador|
|`transaction.infrastructure.city_lat_long`|String(191)|Não|Coordenadas do comprador|
|`transaction.invoice.charge_at`|YYYY-MM-DD|Sim|Data de cobrança|
|`transaction.invoice.created_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data de criação da fatura|
|`transaction.invoice.cycle`|Integer|Sim|Ciclo da assinatura a que se refere a fatura|
|`transaction.invoice.discount_value`|Float|Sim|Valor do desconto|
|`transaction.invoice.id`|String|Sim|ID da fatura|
|`transaction.invoice.increment_value`|Float|Sim|Valor do incremento|
|`transaction.invoice.period_end`|YYYY-MM-DD|Sim|Data do final do período|
|`transaction.invoice.period_start`|YYYY-MM-DD|Sim|Data do início do período|
|`transaction.invoice.status`|String|Sim|Status da fatura|
|`transaction.invoice.tax_value`|Float|Sim|Valor do imposto|
|`transaction.invoice.tries`|Integer|Sim|Número total de tentativas|
|`transaction.invoice.try`|Integer|Sim|Número da tentativa|
|`transaction.invoice.type`|Status|Sim|Tipo da fatura|
|`transaction.invoice.value`|Float|Sim|Valor da fatura|
|`transaction.payment.affiliate_value`|Float|Sim|Valor Afiliados|
|`transaction.payment.acquirer.code`|String|Sim|Código do adquirente|
|`transaction.payment.acquirer.message`|String|Sim|Mensagem do adquirente|
|`transaction.payment.acquirer.name`|String|Sim|Nome do adquirente|
|`transaction.payment.acquirer.nsu`|String|Sim|NSU do adquirente|
|`transaction.payment.acquirer.tid`|String|Sim|TID do adquirente|
|`transaction.payment.can_try_again`|Integer (0/1)|Sim|Indica se pode tentar novamente|
|`transaction.payment.coupon.id`|String|Não|Id do cupom|
|`transaction.payment.coupon.coupon_code`|String|Não|Código do cupom|
|`transaction.payment.coupon.incidence_type`|String|Não|Tipo de incidência do cupom|
|`transaction.payment.coupon.incidence_field`|String|Não|Incidência do cupom|
|`transaction.payment.coupon.incidence_value`|Float|Não|Valor do cupom|
|`transaction.payment.coupon.last_sent_at`|Integer|Não|Unix timestamp|
|`transaction.payment.coupon.final_value`|Float|Não|Valor final do cupom|
|`transaction.payment.currency`|String(191)|Sim|Moeda (ISO 4217)|
|`transaction.payment.discount_value`|Float|Sim|Valor Desconto|
|`transaction.payment.gross`|Float|Sim|Valor Bruto|
|`transaction.payment.instalments.value`|Float|Não|Valor das Parcelas|
|`transaction.payment.instalments.qty`|Integer|Não|Quantidade de Parcelas da venda|
|`transaction.payment.installments.interest`|Float|Não|Valor dos juros do parcelamento|
|`transaction.payment.marketplace_id`|String(191)|Sim|Código da Venda no Processador de Pagamento|
|`transaction.payment.marketplace_name`|String(191)|Sim|Processador de Pagamento|
|`transaction.payment.marketplace_value`|Float|Sim|Valor do Processador de Pagamento|
|`transaction.payment.method`|PaymentMethod|Sim|Método de Pagamento|
|`transaction.payment.net`|Float|Sim|Valor Líquido|
|`transaction.payment.processing_times.started_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de início do processamento|
|`transaction.payment.processing_times.finished_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de final do processamento|
|`transaction.payment.processing_times.delay_in_seconds`|Integer|Não|Atraso (em segundos)|
|`transaction.payment.refund_reason`|String|Não|Razão de reembolso|
|`transaction.payment.refuse_reason`|String(191)|Não|Mensagem do processador de pagamento|
|`transaction.payment.tax.value`|Float|Não|Valor da Taxa|
|`transaction.payment.tax.rate`|Float|Não|Porcentagem da Taxa|
|`transaction.payment.total`|Float|Sim|Valor Total|
|`transaction.payment.creditcard.brand`|String(191)|Não|Bandeira do cartão|
|`transaction.payment.creditcard.expiration_month`|String|Não|Mês de expiração do cartão|
|`transaction.payment.creditcard.expiration_year`|String|Não|Ano de expiração do cartão|
|`transaction.payment.creditcard.first_digits`|Integer|Não|Bin do cartão|
|`transaction.payment.creditcard.id`|String|Não|Id do cartão|
|`transaction.payment.creditcard.last_digits`|Integer|Não|Quatro últimos dígitos do cartão|
|`transaction.payment.billet.line`|String(191)|Não|Linha Digitável do Boleto|
|`transaction.payment.billet.url`|String(191)|Não|Url do Boleto|
|`transaction.payment.billet.expiration_date`|String(191)|Não|Data de Expiração do Boleto|
|`transaction.payment.pix.qrcode.signature`|String(191)|Não|Código QRCode do Pix|
|`transaction.payment.pix.qrcode.url`|String(191)|Não|URL QRCode do Pix|
|`transaction.payment.pix.expiration_date`|String(191)|Não|Data de Expiração do Pix|
|`transaction.payment.spei.url`|String(191)|Não|URL do pagamento SPEI|
|`transaction.payment.spei.account`|String(191)|Não|Código da Conta SPEI|
|`transaction.payment.spei.reference`|String(191)|Não|Código da Referência SPEI|
|`transaction.payment.spei.expiration_date`|String(191)|Não|Data de Expiração do SPEI|
|`transaction.payment.oxxo.url`|String(191)|Não|URL do pagamento OXXO|
|`transaction.payment.oxxo.barcode`|String(191)|Não|Código de Barras OXXO|
|`transaction.payment.oxxo.expiration_date`|String(191)|Não|Data de Expiração do OXXO|
|`transaction.product.id`|String(191)|Sim|Id do produto|
|`transaction.product.image_url`|String(191)|Não|Imagem do produto|
|`transaction.product.internal_id`|String|Sim|Id interno do produto|
|`transaction.product.marketplace_id`|String|Sim|Id do marketplace|
|`transaction.product.marketplace_name`|String(191)|Sim|Nome do marketplace do produto|
|`transaction.product.name`|String(191)|Sim|Nome do produto|
|`transaction.product.offer.id`|String|Sim|Id da oferta|
|`transaction.product.offer.name`|String|Sim|Nome da oferta|
|`transaction.product.producer.marketplace_id`|String(191)|Sim|Id Marketplace do produtor|
|`transaction.product.producer.name`|String(191)|Sim|Nome do produtor|
|`transaction.product.producer.contact_email`|String(191)|Não|Email do produtor|
|`transaction.product.qty`|Integer|Sim|Quantidade do produto|
|`transaction.product.total_value`|Float|Sim|Valor total do produto|
|`transaction.product.type`|String(191)|plan/product|Tipo do produto|
|`transaction.product.unit_value`|Float|Sim|Valor unitário do produto|
|`transaction.shipment.carrier`|String(191)|Não|Nome da transportadora|
|`transaction.shipment.service`|String(191)|Não|Serviço da transportadora|
|`transaction.shipment.tracking`|String(191)|Não|Código de rastremanto|
|`transaction.shipment.value`|Float|Não|Valor da transportadora|
|`transaction.shipment.status`|Array|Não|Estados do envio|
|`transaction.shipment.delivery_time`|Integer|Não|Tempo de entrega|
|`transaction.shipping.name`|String|Sim|Nome do frete|
|`transaction.shipping.value`|Float|Sim|Valor do frete|
|`transaction.source.source`|String(191)|Não|Origem da Venda|
|`transaction.source.checkout_source`|String(191)|Não|Origem da Venda|
|`transaction.source.utm_source`|String(191)|Não|Origem da Venda|
|`transaction.source.utm_campaign`|String(191)|Não|Origem da Venda|
|`transaction.source.utm_medium`|String(191)|Não|Origem da Venda|
|`transaction.source.utm_content`|String(191)|Não|Origem da Venda|
|`transaction.source.utm_term`|String(191)|Não|Origem da Venda|
|`transaction.source.pptc.tracking_name`|String(191)|Não|Nome do Rastreamento|
|`transaction.source.pptc.tracking_type`|TrackingType|Não|Tipo do Rastreamento|
|`transaction.source.pptc.tracking_publisher`|Publisher|Não|Anunciante do Rastreamento|
|`transaction.source.pptc.user_name`|String(191)|Não|Nome do usuário|
|`transaction.source.pptc.checkout_name`|String(191)|Não|Nome do checkout|
|`transaction.source.pptc.utm_campaign`|String(191)|Não|UTM_CAMPAIGN do Rastreamento|
|`transaction.source.pptc.utm_medium`|String(191)|Não|UTM_MEDIUM do Rastreamento|
|`transaction.source.pptc.utm_content`|String(191)|Não|UTM_CONTENT do Rastreamento|
|`transaction.source.pptc.utm_term`|String(191)|Não|UTM_TERM do Rastreamento|
|`transaction.status`|TransactionStatus|Sim|Status da Venda|
|`transaction.type`|Types|Sim|Tipo da venda|
|`webhook_type`|String|Sim|Tipo do webhook (eticket)|

  

**Exemplo de JSON a ser recebido [POST]**

A notificação consiste em um POST contendo um JSON, conforme exemplo:

```json
{
  "api_token": "mLjcGjzKGnXme5b7gbuKMggL34Ecdt5NHGihxfWr",
  "attendee": {
    "address_country": "BR",
    "custom_fields": [
      {
        "index": 0,
        "title": "exemplo data/hora",
        "type": "datetime",
        "value": "20-02-2025 00:00"
      },
      {
        "index": 1,
        "title": "exemplo listas",
        "type": "list",
        "value": [
          "option1",
          "option2"
        ]
      },
      {
        "index": 2,
        "title": "exemplo numerico",
        "type": "number",
        "value": 123
      },
      {
        "index": 3,
        "title": "exemplo selecao",
        "type": "switch",
        "value": 1
      },
      {
        "index": 4,
        "title": "exemplo endereço",
        "type": "address",
        "value": {
          "address": "Avenida Brigadeiro Faria Lima",
          "city": "Santarem",
          "comp": null,
          "country": "PT",
          "number": "2",
          "state": null,
          "zip_code": "1234-789"
        }
      },
      {
        "index": 5,
        "title": "policy_privacy",
        "type": "policy_privacy",
        "value": 1
      },
      {
        "index": 6,
        "title": "use_terms",
        "type": "use_terms",
        "value": 1
      }
    ],
    "email": "email@example.com",
    "email_is_deliverable": 1,
    "name": "Nome Participante",
    "phone_local_code": "55",
    "phone_number": "123456789"
  },
  "cancel_reason": "",
  "code": "etkt_4INRdz2zLbppSrHpsaCR",
  "dates": {
    "created_at": "2024-12-26T16:16:07Z",
    "updated_at": "2024-12-26T17:10:07Z",
    "checked_in_at": "2024-12-27T11:34:07Z"
  },
  "hash": "e4ea20ce6c01b35ce5828af84e7c70f44b354a2f03624847585a20c57827ba45",
  "hash_url": "https://clkdmg.site/etickets/e4ea20ce6c01b35ce5828af84e7c70f44b354a2f03624847585a20c57827ba45",
  "id": "9dd37a5f-0b7c-47b5-bd11-49c04bcbe451",
  "owner": {
    "email": "email@sandbox.com",
    "id": "99f7127b-b641-480d-9f15-c6a4f81f627e",
    "name": "Owner Name",
    "phone_local_code": "55",
    "phone_number": "123456789"
  },
  "product": {
    "id": "9c492644-845f-470d-9dac-0a251d291b7c",
    "image_url": "",
    "marketplace_id": "1718379862",
    "marketplace_name": "pagarme",
    "name": "product name",
    "offer": {
      "id": "9c49271c-25c6-4a89-a3d6-3c25e60c2e01",
      "name": "offer name"
    },
    "event_details": {
      "url": "https://eventdomain.com",
      "end_at": "2029-08-04T21:00:00Z",
      "address": "Avenida da Liberdade",
      "start_at": "2029-08-04T21:00:00Z",
      "address_city": "tijuca",
      "address_comp": "complemento",
      "address_local": "Centro de Congressos",
      "address_state": "AM",
      "address_number": "120",
      "address_country": "BR",
      "address_district": "Rio de Janeiro",
      "address_zip_code": "38408254",
      "automatic_ticket_assignment": 1,
      "allow_duplicate_emails": 0,
      "timezone": "America/Bahia",
      "type": "in_person",
      "address_state_full_name": "AM",
      "timezone_abbr": "BRT"
    },
    "producer": {
      "marketplace_id": "26849805000106",
      "name": "Name",
      "contact_email": "ana.contacto@sandbox.com"
    }
  },
  "status": "invited",
  "transaction": {
    "affiliations": [],
    "checkout_url": "https://clkdmg.site/subscribe/9059bdb6-0ca4-4253-b405-482df6393537",
    "checkout_invoice_url": "https://clkdmg.site/invoice/a1b2c3d4-0000-0000-0000-000000000001",
    "contact": {
      "address": "Rua Terra Rica",
      "address_city": "Pinhais",
      "address_comp": "",
      "address_country": "BR",
      "address_district": "Centro",
      "address_number": "123",
      "address_state": "PR",
      "address_state_full_name": "Aveiro",
      "address_zip_code": "83324090",
      "company_name": "",
      "doc": "01234567890",
      "email": "email@email.email",
      "id": "906d1e37-de6a-4f4d-8271-91ecd0d65ec6",
      "lead": {
        "first_tracking": {
          "name": "TEstes",
          "publisher": "",
          "tracked_at": "2020-02-18T15:50:11Z",
          "type": "form"
        },
        "last_tracking": {
          "name": "Teste Tracking Plano",
          "publisher": "Adwords",
          "tracked_at": "2020-04-02T16:03:08Z",
          "type": "lead"
        }
      },
      "name": "Nome Contacto",
      "phone_local_code": "55",
      "phone_number": "1234567980"
    },
    "dates": {
      "canceled_at": null,
      "confirmed_at": "2020-05-07T11:35:57Z",
      "created_at": "2024-02-28T14:45:07Z",
      "expires_at": null,
      "ordered_at": "2020-05-07T11:33:45Z",
      "unavailable_until": "2020-06-06T11:35:57Z",
      "updated_at": "2024-02-28T14:50:36Z",
      "warranty_until": "2020-06-06T11:35:57Z"
    },
    "ecommerces": [],
    "extras": {
      "accepted_terms_url": 1,
      "accepted_privacy_policy_url": 1
    },
    "id": "9081534a-7512-4dab-9172-218c1dc1f263",
    "infrastructure": {
      "city": null,
      "city_lat_long": null,
      "country": "BR",
      "host": "https://clkdmg.site",
      "ip": "127.0.0.1",
      "region": null,
      "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    "invoice": {
      "charge_at": "2024-12-13",
      "created_at": "2024-02-28T14:39:42Z",
      "cycle": 2,
      "discount_value": 0,
      "id": "in_y5ZoRccnvFrFEgkPE",
      "increment_value": 0,
      "period_end": "2025-12-13",
      "period_start": "2024-12-13",
      "status": "paid",
      "tax_value": 5.49,
      "tries": 3,
      "try": 3,
      "type": "cycle",
      "value": 29.37
    },
    "payment": {
      "acquirer": {
        "code": "",
        "message": "",
        "name": "",
        "nsu": "",
        "tid": ""
      },
      "affiliate_value": 0,
      "can_try_again": 1,
      "coupon": null,
      "billet": {
        "expiration_date": "",
        "line": "",
        "url": ""
      },
      "credit_card": {
        "brand": "visa",
        "expiration_month": 12,
        "expiration_year": 2024,
        "first_digits": "400000",
        "id": "card_WLmNYk1fmKUOwBwX",
        "last_digits": "0010"
      },
      "currency": "BRL",
      "discount_value": 0,
      "gross": 500,
      "installments": {
        "interest": 0,
        "qty": 1,
        "value": ""
      },
      "marketplace_id": "ch_1ke4QoCQOs7VE6VY",
      "marketplace_name": "mundipagg",
      "marketplace_value": 0,
      "method": null,
      "net": 500,
      "processing_times": {
        "delay_in_seconds": 2,
        "finished_at": "2024-02-28T14:50:02.397Z",
        "started_at": "2024-02-28T14:50:00.241Z"
      },
      "refund_reason": "",
      "refuse_reason": "Transação capturada com sucesso",
      "tax": {
        "rate": 0,
        "value": 0
      },
      "total": 500
    },
    "product": {
      "id": "1587151083",
      "image_url": "",
      "internal_id": "906d1e37-de6a-4f4d-8271-91ecd0d65e32",
      "marketplace_id": "1587151083",
      "marketplace_name": "mundipagg",
      "name": "Assinatura Mundipagg",
      "offer": {
        "id": "9ad505be-e7f9-4a08-a591-3ec4991c2615",
        "name": "bvm - stripe - assinatura1 - oferta1"
      },
      "producer": {
        "contact_email": "",
        "marketplace_id": "01234567890",
        "name": "Produtor Mundipagg"
      },
      "qty": 1,
      "total_value": 500,
      "type": "plan",
      "unit_value": 500
    },
    "self_attribution": {
      "title": "Como você conheceu nosso produto?",
      "answer": "google"
    },
    "shipment": {
      "carrier": "Correios",
      "delivery_time": 15,
      "service": "SEDEX",
      "status": [],
      "tracking": "ME20000BGL2BR",
      "value": 105.68
    },
    "shipping": {
      "name": "Standard",
      "value": 0
    },
    "source": {
      "checkout_source": "",
      "pptc": [],
      "source": "",
      "utm_campaign": "",
      "utm_content": "",
      "utm_medium": "",
      "utm_source": "",
      "utm_term": ""
    },
    "status": "approved",
    "type": "producer"
  },
  "webhook_type", "eticket"
}    
```

# Webhook para Vendas

É possível utilizar webhook, para que seu sistema seja notificado sobre as alterações que ocorram nas vendas.

|Campo|Tipo|Obrigatório|Descrição|
|:--|:--|:--|:--|
|`affiliations.*.affiliates_group_namecurr`|String|Sim|Nome do grupo da afiliação|
|`affiliations.*.contact_email`|String|Não|Email da afiliação|
|`affiliations.*.currency`|String|Não|Moeda da afiliação|
|`affiliations.*.fee`|Float|Não|Taxa da afiliação|
|`affiliations.*.id`|String|Não|Id da afiliação|
|`affiliations.*.marketplace_id`|String|Não|Id do marketplace da afiliação|
|`affiliations.*.name`|String|Não|Nome da afiliação|
|`affiliations.*.net_value`|Float|Não|Valor líquido da comissão da afiliação|
|`affiliations.*.value`|Float|Não|Valor da comissão da afiliação|
|`api_token`|Char(40)|Sim|Chave de API do Guru|
|`checkout_url`|String|Não|Url do Checkout do Guru|
|`checkout_invoice_url`|String|Não|Url pública do pedido|
|`contact.id`|String(191)|Não|Id|
|`contact.name`|String(191)|Não|Nome|
|`contact.email`|String(191)|Não|E-mail|
|`contact.doc`|String(191)|Não|Documento|
|`contact.phone_number`|String(191)|Não|Telefone|
|`contact.phone_local_code`|String(191)|Não|Indicativo do telefone|
|`contact.address`|String(191)|Não|Endereço|
|`contact.address_number`|String(191)|Não|Número|
|`contact.address_comp`|String(191)|Não|Complemento|
|`contact.address_district`|String(191)|Não|Bairro|
|`contact.address_city`|String(191)|Não|Cidade|
|`contact.address_state`|String(191)|Não|Estado|
|`contact.address_country`|String(191)|Não|País|
|`contact.address_zip_code`|String(191)|Não|Código Postal|
|`contact.lead.first_tracking.name`|String(191)|Não|Nome do primeiro rastreio do lead|
|`contact.lead.first_tracking.type`|TrackingType|Não|Tipo do primeiro rastreio do lead|
|`contact.lead.first_tracking.publisher`|Publisher|Não|Anunciante do primeiro rastreio do lead|
|`contact.lead.first_tracking.tracked_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do primeiro rastreio do lead|
|`contact.lead.last_tracking.name`|String(191)|Não|Nome do último rastreio do lead|
|`contact.lead.last_tracking.type`|TrackingType|Não|Tipo do último rastreio do lead|
|`contact.lead.last_tracking.publisher`|Publisher|Não|Anunciante do último rastreio do lead|
|`contact.lead.last_tracking.tracked_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do último rastreio do lead|
|`contracts`|Array|Sim|Contratos|
|`dates.canceled_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data do Cancelamento|
|`dates.confirmed_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data da Aprovação|
|`dates.created_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data da Criação|
|`dates.expires_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de Expiração|
|`dates.ordered_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data do Pedido|
|`dates.unavailable_until`|YYYY-MM-DDTHH:MM:SSZ|Não|Indisponível até|
|`dates.updated_at`|YYYY-MM-DDTHH:MM:SSZ|Sim|Data de Atualização|
|`dates.warranty_until`|YYYY-MM-DDTHH:MM:SSZ|Não|Garantia até|
|`ecommerces.kapsula.pedido`|Integer|Não|Número do Pedido Kapsula|
|`ecommerces.magento.quote_id`|Integer|Não|Número da Cotação Magento|
|`ecommerces.magento.order_id`|Integer|Não|Número do Pedido Magento|
|`ecommerces.shopify.order_id`|Integer|Não|Número do Pedido Shopify|
|`ecommerces.shopify.transaction_id`|Integer|Não|Número da Transação Shopify|
|`ecommerces.woocommerce.id`|Integer|Não|Número do Pedido Woocommerce|
|`extras.accepted_terms_url`|Integer|Sim|Indica que o comprador aceitou os termos de utilização|
|`extras.accepted_privacy_policy_url`|Integer|Sim|Indica que o comprador aceitou a política de privacidade|
|`id`|String(191)|Sim|ID da Transação|
|`infrastructure.user_agent`|String(191)|Não|User Agent do comprador|
|`infrastructure.ip`|String(191)|Não|IP do comprador|
|`infrastructure.country`|String(191)|Não|País do comprador|
|`infrastructure.region`|String|Não|Região do comprador|
|`infrastructure.city`|String(191)|Não|Cidade do comprador|
|`infrastructure.city_lat_long`|String(191)|Não|Coordenadas do comprador|
|`infrastructure.host`|String|Não|Host do comprador|
|`invoice.charge_at`|YYYY-MM-DD|Não|Data de pagamento|
|`invoice.created_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de criação do invoice|
|`invoice.cycle`|Integer|Não|Número de ciclo|
|`invoice.discount_value`|Float|Não|Desconto do invoice (desconto associado ao ciclo específico da assinatura)|
|`invoice.id`|String(20)|Não|ID do invoice|
|`invoice.increment_value`|Float|Não|Acréscimo do invoice (cobrança adicional associada ao ciclo especifico da assinatura)|
|`invoice.period_end`|YYYY-MM-DD|Não|Fim de período|
|`invoice.period_start`|YYYY-MM-DD|Não|Início de período|
|`invoice.status`|InvoiceStatus|Não|Status do invoice|
|`invoice.tax_value`|Float|Não|Taxa do invoice|
|`invoice.tries`|Integer|Não|Total de tentativas|
|`invoice.try`|Integer|Não|Número da tentativa|
|`invoice.type`|InvoiceType|Não|Tipo do invoice|
|`invoice.value`|Float|Não|Valor do invoice|
|`items.*.id`|String|Sim|Id do item|
|`items.*.image_url`|String|Sim|URL da imagem|
|`items.*.internal_id`|String|Sim|Id interno do item|
|`items.*.marketplace_id`|String|Sim|ID do marketplace|
|`items.*.marketplace_name`|String|Sim|Nome do markeplace|
|`items.*.name`|String|Sim|Nome do item|
|`items.*.offer.id`|String|Sim|Id da oferta|
|`items.*.offer.name`|String|Sim|Nome da oferta|
|`items.*.producer.contact_email`|String|Não|Email do produtor|
|`items.*.producer.marketplace_id`|String|Sim|Id Marketplace do produtor|
|`items.*.producer.name`|String|Sim|Nome do produtor|
|`items.*.qty`|Integer|Sim|Quantidade|
|`items.*.total_value`|Float|Sim|Valor total do item|
|`items.*.type`|String|Sim|Tipo do item|
|`items.*.unit_value`|Float|Sim|Valor unitário do item|
|`last_transaction.id`|String(191)|Não|Id da transação anterior (1 Click Buy)|
|`last_transaction.url`|String(191)|Não|Url da transação anterior (1 Click Buy)|
|`payment.affiliate_value`|Float|Sim|Valor Afiliados|
|`payment.acquirer.code`|String|Sim|Código do adquirente|
|`payment.acquirer.message`|String|Sim|Mensagem do adquirente|
|`payment.acquirer.name`|String|Sim|Nome do adquirente|
|`payment.acquirer.nsu`|String|Sim|NSU do adquirente|
|`payment.acquirer.tid`|String|Sim|TID do adquirente|
|`payment.can_try_again`|Integer (0/1)|Sim|Indica se pode tentar novamente|
|`payment.coupon.id`|String|Não|Id do cupom|
|`payment.coupon.coupon_code`|String|Não|Código do cupom|
|`payment.coupon.incidence_type`|String|Não|Tipo de incidência do cupom (percent ou value)|
|`payment.coupon.incidence_field`|String|Não|Incidência do cupom (products, shipping ou total).|
|`payment.coupon.incidence_value`|Float|Não|Valor do cupom|
|`payment.coupon.last_sent_at`|Integer|Não|Unix timestamp|
|`payment.coupon.final_value`|Float|Não|Valor final do cupom (valor final do desconto já calculado)|
|`payment.currency`|String(191)|Sim|Moeda (ISO 4217)|
|`payment.presentment_currency`|String|Não|Moeda em que o comprador pagou o valor.|
|`payment.discount_value`|Float|Sim|Valor Desconto|
|`payment.gross`|Float|Sim|Valor Bruto|
|`payment.instalments.value`|Float|Não|Valor das Parcelas|
|`payment.instalments.qty`|Integer|Não|Quantidade de Parcelas da venda|
|`payment.installments.interest`|Float|Não|Valor dos juros do parcelamento|
|`payment.marketplace_id`|String(191)|Sim|Código da Venda no Processador de Pagamento|
|`payment.marketplace_name`|String(191)|Sim|Processador de Pagamento|
|`payment.marketplace_value`|Float|Sim|Valor do Processador de Pagamento|
|`payment.method`|PaymentMethod|Sim|Método de Pagamento|
|`payment.net`|Float|Sim|Valor Líquido|
|`payment.processing_times.started_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de início do processamento|
|`payment.processing_times.finished_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de final do processamento|
|`payment.processing_times.delay_in_seconds`|Integer|Não|Atraso (em segundos)|
|`payment.refund_reason`|String|Não|Razão de reembolso|
|`payment.refuse_reason`|String(191)|Não|Mensagem do processador de pagamento|
|`payment.tax.value`|Float|Não|Valor da Taxa|
|`payment.tax.rate`|Float|Não|Porcentagem da Taxa|
|`payment.total`|Float|Sim|Valor Total|
|`payment.billet.line`|String(191)|Não|Linha Digitável do Boleto|
|`payment.billet.url`|String(191)|Não|Url do Boleto|
|`payment.billet.expiration_date`|String(191)|Não|Data de Expiração do Boleto|
|`payment.creditcard.brand`|String(191)|Não|Bandeira do cartão|
|`payment.creditcard.expiration_month`|String|Não|Mês de expiração do cartão|
|`payment.creditcard.expiration_year`|String|Não|Ano de expiração do cartão|
|`payment.creditcard.first_digits`|Integer|Não|Bin do cartão|
|`payment.creditcard.id`|String|Não|Id do cartão|
|`payment.creditcard.last_digits`|Integer|Não|Quatro últimos dígitos do cartão|
|`payment.pix.qrcode.signature`|String(191)|Não|Código QRCode do Pix|
|`payment.pix.qrcode.url`|String(191)|Não|URL QRCode do Pix|
|`payment.pix.expiration_date`|String(191)|Não|Data de Expiração do Pix YYYY-MM-DD|
|`payment.spei.url`|String(191)|Não|URL do pagamento SPEI|
|`payment.spei.account`|String(191)|Não|Código da Conta SPEI|
|`payment.spei.reference`|String(191)|Não|Código da Referência SPEI|
|`payment.spei.expiration_date`|String(191)|Não|Data de Expiração do SPEI|
|`payment.oxxo.url`|String(191)|Não|URL do pagamento OXXO|
|`payment.oxxo.barcode`|String(191)|Não|Código de Barras OXXO|
|`payment.oxxo.expiration_date`|String(191)|Não|Data de Expiração do OXXO|
|`product.id`|String(191)|Sim|Id do produto|
|`product.image_url`|String(191)|Não|Imagem do produto|
|`last_transaction.product.internal_id`|String|Sim|Id interno do produto|
|`last_transaction.product.marketplace_id`|String|Sim|Id do marketplace|
|`product.marketplace_name`|String(191)|Sim|Nome do marketplace do produto|
|`product.name`|String(191)|Sim|Nome do produto|
|`product.offer.id`|String|Sim|Id da oferta|
|`product.offer.name`|String|Sim|Nome da oferta|
|`product.producer.marketplace_id`|String(191)|Sim|Id Marketplace do produtor|
|`product.producer.name`|String(191)|Sim|Nome do produtor|
|`product.producer.contact_email`|String(191)|Não|Email do produtor|
|`product.qty`|Integer|Sim|Quantidade do produto|
|`product.total_value`|Float|Sim|Valor total do produto|
|`product.type`|String(191)|plan/product|Tipo do produto|
|`product.unit_value`|Float|Sim|Valor unitário do produto|
|`shipment.carrier`|String(191)|Não|Nome da transportadora|
|`shipment.service`|String(191)|Não|Serviço da transportadora|
|`shipment.tracking`|String(191)|Não|Código de rastremanto|
|`shipment.value`|Float|Não|Valor da transportadora|
|`shipment.status`|Array|Não|Estados do envio (delayed; delivered; lost; out_for_delivery; posted; returned; waiting_postage e waiting_tracking_code)|
|`shipment.delivery_time`|Integer|Não|Tempo de entrega em dias|
|`shipping.name`|String|Sim|Nome do frete|
|`shipping.value`|Float|Sim|Valor do frete|
|`source.source`|String(191)|Não|Origem da Venda|
|`source.checkout_source`|String(191)|Não|Origem da Venda|
|`source.utm_source`|String(191)|Não|Origem da Venda|
|`source.utm_campaign`|String(191)|Não|Origem da Venda|
|`source.utm_medium`|String(191)|Não|Origem da Venda|
|`source.utm_content`|String(191)|Não|Origem da Venda|
|`source.utm_term`|String(191)|Não|Origem da Venda|
|`source.pptc.tracking_name`|String(191)|Não|Nome do Rastreamento|
|`source.pptc.tracking_type`|TrackingType|Não|Tipo do Rastreamento|
|`source.pptc.tracking_publisher`|Publisher|Não|Anunciante do Rastreamento|
|`source.pptc.user_name`|String(191)|Não|Nome do usuário|
|`source.pptc.checkout_name`|String(191)|Não|Nome do checkout|
|`source.pptc.utm_campaign`|String(191)|Não|UTM_CAMPAIGN do Rastreamento|
|`source.pptc.utm_medium`|String(191)|Não|UTM_MEDIUM do Rastreamento|
|`source.pptc.utm_content`|String(191)|Não|UTM_CONTENT do Rastreamento|
|`source.pptc.utm_term`|String(191)|Não|UTM_TERM do Rastreamento|
|`status`|TransactionStatus|Sim|Status da Venda|
|`subscription.can_cancel`|Integer (0/1)|Não|Indica se a assinatura pode ser cancelada|
|`subscription.canceled_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data de Cancelamento do plano|
|`subscription.charged_every_days`|Integer|Não|Quantidade de Dias entre as cobranças do plano|
|`subscription.charged_times`|Integer|Não|Quantidade de Cobranças do plano|
|`subscription.id`|String(191)|Não|Código do plano|
|`subscription.internal_id`|String|Não|Id interno da assinatura|
|`subscription.last_status`|SubscriptionStatus|Não|Status do plano|
|`subscription.last_status_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data da última atualização de status do plano|
|`subscription.name`|String(191)|Não|Nome do Plano|
|`subscription.started_at`|YYYY-MM-DDTHH:MM:SSZ|Não|Data da primeira cobrança do plano|
|`subscription.subscription_code`|String|Não|Código da assinatura|
|`subscription.trial_days`|Integer|Não|Dias de trial|
|`subscription.trial_finished_at`|YYYY-MM-DD|Não|Fim|
|`subscription.trial_started_at`|YYYY-MM-DD|Não|Início Trial|
|`type`|Types|Sim|Tipo da venda|
|`webhook_type`|String|Sim|Tipo do webhook (transaction)|

No campo subscription, quando o product.type === plan, o tipo de produto é uma assinatura, e o objeto **subscription** vem com os dados preenchidos.  
No entanto, **há exceções:** quando o campo subscription vem vazio, significa que a assinatura não chegou a ser criada. Isto pode acontecer, por exemplo, em cenários de primeira venda, quando o pagamento é negado ou a transação não é concluída com sucesso, nesses casos, a assinatura não é criada e, consequentemente, o campo subscription não é preenchido no webhook.

O campo `invoice` vem preenchido quando a transação é criada e pertence ao nosso motor de assinaturas.

  

**Exemplo de JSON a ser recebido [POST]**

A notificação consiste em um POST contendo um JSON, conforme exemplo:

```json
{
    "affiliations": [
        {
            "affiliates_group_name": "group test",
            "contact_email": "john.doe@email.com",
            "currency": "BRL",
            "fee": 19.32,
            "id": "99f598ca-1d90-4afb-b306-70cc52b56f2f",
            "marketplace_id": "YR5TFRMH",
            "name": "John Doe",
            "net_value": 315.07,
            "value": 334.39
        }
    ],
    "api_token": "mLjcGjzKGnXme5b7gbuKMggL34Ecdt5NHGihxfWr",
    "checkout_url": "https://clkdmg.site/subscribe/9059bdb6-0ca4-4253-b405-482df6393537",
    "checkout_invoice_url": "https://clkdmg.site/invoice/a1b2c3d4-0000-0000-0000-000000000001",
    "contact": {
        "address": "Rua Terra Rica",
        "address_city": "Pinhais",
        "address_comp": "",
        "address_country": "BR",
        "address_district": "Centro",
        "address_number": "123",
        "address_state": "PR",
        "address_state_full_name": "RJ",
        "address_zip_code": "83324090",
        "company_name": "",
        "doc": "01234567890",
        "email": "email@email.com",
        "id": "906d1e37-de6a-4f4d-8271-91ecd0d65ec6",
        "lead": {
            "first_tracking": {
                "name": "TEstes",
                "publisher": "",
                "tracked_at": "2020-02-18T15:50:11Z",
                "type": "form"
            },
            "last_tracking": {
                "name": "Teste Tracking Plano",
                "publisher": "Adwords",
                "tracked_at": "2020-04-02T16:03:08Z",
                "type": "lead"
            }
        },
        "name": "Nome Contato",
        "phone_local_code": "55",
        "phone_number": "1234567980"
    },
    "contracts": [],
    "dates": {
        "canceled_at": null,
        "confirmed_at": "2020-05-07T11:35:57Z",
        "created_at": "2023-09-19T09:19:04Z",
        "expires_at": null,
        "ordered_at": "2020-05-07T11:33:45Z",
        "unavailable_until": "2020-06-06T11:35:57Z",
        "updated_at": "2023-11-14T14:08:18Z",
        "warranty_until": "2020-06-06T11:35:57Z"
    },
    "ecommerces": [],
    "extras": {
        "accepted_terms_url": 1,
        "accepted_privacy_policy_url": 1
    },
    "id": "9081534a-7512-4dab-9172-218c1dc1f263",
    "infrastructure": {
        "city": null,
        "city_lat_long": null,
        "country": "BR",
        "host": "https://clkdmg.site",
        "ip": "127.0.0.1",
        "region": null,
        "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    "invoice": {
        "charge_at": "2021-04-12",
        "created_at": "2021-04-12T16:33:29Z",
        "cycle": 1,
        "discount_value": 0,
        "id": "in_qbaJBvDB3IzVf2PTG",
        "increment_value": 0,
        "period_end": "2021-04-13",
        "period_start": "2021-04-12",
        "status": "paid",
        "tax_value": 0,
        "type": "cycle",
        "value": 100
    },
    "items": [
        {
            "id": "1587151083",
            "image_url": "",
            "internal_id": "906d1e37-de6a-4f4d-8271-91ecd0d65e32",
            "marketplace_id": "1587151083",
            "marketplace_name": "mundipagg",
            "name": "Assinatura Mundipagg",
            "producer": {
                "contact_email": "",
                "marketplace_id": "01234567890",
                "name": "Produtor Mundipagg"
            },
            "qty": 1,
            "total_value": 500,
            "type": "plan",
            "unit_value": 500
        }
    ],
    "last_transaction": [],
    "payment": {
        "affiliate_value": 0,
        "acquirer": {
            "code": "",
            "message": "",
            "name": "",
            "nsu": "",
            "tid": ""
        },
        "can_try_again": 1,
        "coupon": null,
        "billet": {
            "expiration_date": "",
            "line": "",
            "url": ""
        },
        "credit_card": {
            "brand": "visa",
            "first_digits": "400000",
            "id": "card_WLmNYk1fmKUOwBwX",
            "last_digits": "0010"
        },
        "currency": "BRL",
        "presentment_currency": "BRL",
        "discount_value": 0,
        "gross": 500,
        "installments": {
            "interest": 0,
            "qty": 1,
            "value": 500
        },
        "marketplace_id": "ch_1ke4QoCQOs7VE6VY",
        "marketplace_name": "mundipagg",
        "marketplace_value": 0,
        "method": null,
        "net": 500,
        "processing_times": {
            "started_at": "2024-08-19T15:37:16.673Z",
            "finished_at": "2024-08-19T15:37:17.442Z",
            "delay_in_seconds": 0
        },
        "refund_reason": "",
        "refuse_reason": "Transação capturada com sucesso",
        "tax": {
            "rate": 0,
            "value": 0
        },
        "total": 500
    },
    "product": {
        "group": {
            "id": "a038a2c8-ef55-415e-b45d-3a5a3d6a74e6",
            "name": "grupo 1"
        },      
        "id": "1587151083",
        "image_url": "",
        "internal_id": "906d1e37-de6a-4f4d-8271-91ecd0d65e32",
        "marketplace_id": "1587151083",
        "marketplace_name": "mundipagg",
        "name": "Assinatura Mundipagg",
        "producer": {
            "contact_email": "",
            "marketplace_id": "01234567890",
            "name": "Produtor Mundipagg"
        },
        "qty": 1,
        "total_value": 500,
        "type": "plan",
        "unit_value": 500
    },
    "self_attribution": {
        "title": "Como você conheceu nosso produto?",
        "answer": "google"
    },
    "shipment": {
        "carrier": "Correios",
        "delivery_time": 15,
        "service": "SEDEX",
        "status": [],
        "tracking": "ME20000BGL2BR",
        "value": 105.68
    },
    "shipping": {
        "name": "Standard",
        "value": 0
    },
    "source": {
        "checkout_source": "",
        "pptc": [
            "checkout_id":"",
            "checkout_name":"",
            "tracking_group":{
                "id":"97a648d1-fba2-43e3-9d17-706d9dd86fbf",
                "name":"rppc - grupo1"
            },
            "tracking_id":"98cb5f6a-4301-4b9b-959b-1dca6e7a4f28",
            "tracking_name":"teste ab vendas 1 - rastreamento 1",
            "tracking_publisher":"Atendimento Ao Cliente",
            "tracking_type":"checkout",
            "user_name":"John Doe",
            "utm_campaign":"",
            "utm_content":"",
            "utm_medium":"",
            "utm_term":""
        ],
        "source": "",
        "utm_campaign": "",
        "utm_content": "",
        "utm_medium": "",
        "utm_source": "",
        "utm_term": ""
    },
    "status": "approved",
    "subscription": {
        "can_cancel": 1,
        "canceled_at": null,
        "charged_every_days": 30,
        "charged_times": 1,
        "id": "sub_BOAEj2WTKoclmg4X",
        "internal_id": "9ccde88d-3739-48fe-8e32-d69398b8c0e7",
        "last_status": "active",
        "last_status_at": "2020-05-07T11:35:57Z",
        "name": "Assinatura Mundipagg",
        "started_at": "2020-05-07T11:35:57Z",
        "subscription_code": "sub_7F3X50uu4VxTGenj",
        "trial_days": 0,
        "trial_finished_at": null,
        "trial_started_at": null
    },
    "type": "producer",
    "webhook_type": "transaction"
}   
```

# Account Token

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Account Token",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/accounttoken"

    }

  ],

  "paths": {

    "/tokenisvalid/{account_token}": {

      "get": {

        "summary": "Validação",

        "description": "É possível validar o account_token de um cliente através deste endpoint.",

        "parameters": [

          {

            "name": "Accept",

            "in": "header",

            "schema": {

              "type": "string"

            },

            "example": "application/json"

          },

          {

            "name": "account_token",

            "in": "path",

            "required": true,

            "description": "Account Token",

            "schema": {

              "type": "string"

            },

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "is_valid": {

                      "type": "boolean"

                    }

                  }

                },

                "example": {

                  "is_valid": true

                }

              }

            }

          }

        }

      }

    }

  }

}
```

# Affiliations

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Affiliations",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/affiliations"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de afiliações.\n\nO valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "contact_ids",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de ids de contactos",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "is_active",

            "in": "query",

            "example": 1,

            "schema": {

              "type": "number",

              "enum": [

                0,

                1

              ]

            }

          },

          {

            "name": "marketplace_id",

            "in": "query",

            "description": "ID do afiliado no marketplace",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "marketplaces",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-marketplaces\">Lista de marketplaces</a>",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do Afiliado",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "product_ids",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs de produtos",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "type",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-afiliacoes\">Lista de tipos da afiliação</a>",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/AffiliateList"

                }

              }

            }

          }

        }

      }

    },

    "/{id}": {

      "get": {

        "summary": "Consultar",

        "description": "Consulta uma afiliação a partir de seu código.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/AffiliateId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Affiliate"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/assets": {

      "get": {

        "summary": "Listar Recursos",

        "description": "Lista recursos relacionados a uma afiliação",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/AffiliateId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "asset_id": {

                        "type": "string",

                        "example": "YQD9XUBA"

                      },

                      "description": {

                        "type": "string",

                        "example": "Description"

                      },

                      "marketplace_id": {

                        "type": "string",

                        "example": "V9UBI55C"

                      },

                      "name": {

                        "type": "string",

                        "example": "John Doe"

                      },

                      "product": {

                        "type": "object",

                        "properties": {

                          "marketplace_id": {

                            "type": "string",

                            "example": "1658329531"

                          },

                          "marketplace_name": {

                            "type": "string",

                            "example": "PagarMe"

                          },

                          "name": {

                            "type": "string",

                            "example": "pagarme - produto"

                          }

                        }

                      },

                      "link": {

                        "type": "string",

                        "example": "https://digitalmanager.guru/aff/YQD9XUBA/V9UBI55C"

                      },

                      "type": {

                        "type": "string",

                        "example": "link"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/{id}/commission": {

      "put": {

        "summary": "Atualizar commissão",

        "description": "Atualiza commissão do afiliado.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/AffiliateId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "type": {

                    "type": "string",

                    "example": "percentage",

                    "enum": [

                      "percentage",

                      "flat"

                    ]

                  },

                  "value": {

                    "type": "number",

                    "example": 7

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Affiliate"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/transactions": {

      "get": {

        "summary": "Listar Transações",

        "description": "Lista as transações relacionados a uma afiliação.\nA ação retorna uma coleção paginada de transações.\n\nA consulta deverá conter o filtro por data (cancelled_at, confirmed_at ou ordered_at), incluindo sempre a data inicial e final e o período total não poderá ser maior que 365 dias.\n\nCaso a consulta contenha o filtro contact_id, invoice_id ou subscription_id, os filtros por data (cancelled_at, confirmed_at ou ordered_at) não serão obrigatórios.\n\nO valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/AffiliateId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "cancelled_at_ini",

            "in": "query",

            "description": "Data de cancelamento inicial (YYYY-MM-DD)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "cancelled_at_end",

            "in": "query",

            "description": "Data de cancelamento final (YYYY-MM-DD)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "confirmed_at_ini",

            "in": "query",

            "description": "Data de aprovação inicial (YYYY-MM-DD)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "confirmed_at_end",

            "in": "query",

            "description": "Data de aprovação final (YYYY-MM-DD)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "contact_id",

            "in": "query",

            "description": "ID do contato (UUID)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "contact_doc",

            "in": "query",

            "description": "Documento do contato",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "contact_email",

            "in": "query",

            "description": "Email do contato",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "contact_name",

            "in": "query",

            "description": "Nome do contato",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "invoice_id",

            "in": "query",

            "description": "ID da fatura (UUID)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "marketplace_id",

            "in": "query",

            "description": "ID da venda no marketplace",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "marketplaces",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-marketplaces\">Lista de marketplaces</a>",

            "schema": {

              "type": "array"

            }

          },

          {

            "name": "ordered_at_ini",

            "in": "query",

            "description": "Data da venda inicial (YYYY-MM-DD)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "ordered_at_end",

            "in": "query",

            "description": "Data da venda final (YYYY-MM-DD)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "payment_types",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-formas-pagamento\">Lista de formas de pagamento</a>",

            "schema": {

              "type": "array"

            }

          },

          {

            "name": "subscription_id",

            "in": "query",

            "description": "Id da assinatura (UUID)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "transaction_status",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Lista de status da venda</a>",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "AffiliateId": {

        "name": "id",

        "in": "path",

        "description": "ID da Afiliação",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "Affiliate": {

        "type": "object",

        "properties": {

          "commission": {

            "type": "object",

            "properties": {

              "type": {

                "type": "string",

                "example": "percentage"

              },

              "value": {

                "type": "string",

                "example": "7.00"

              }

            }

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "964fe215-d8a3-4f06-9cf9-62713f906641"

              },

              "name": {

                "type": "string",

                "example": "John Doe"

              }

            }

          },

          "deletable": {

            "type": "number",

            "example": 1

          },

          "editable": {

            "type": "number",

            "example": 1

          },

          "id": {

            "type": "string",

            "example": "970b1f0b-57d3-4fae-ade7-1000ee3400da"

          },

          "is_active": {

            "type": "number",

            "example": 1

          },

          "marketplace_id": {

            "type": "string",

            "example": "LGFW3UKY"

          },

          "marketplace_name": {

            "type": "string",

            "example": "asaas"

          },

          "name": {

            "type": "string",

            "example": "John Doe"

          },

          "product": {

            "type": "object",

            "properties": {

              "name": {

                "type": "string",

                "example": "Produto de Teste"

              },

              "id": {

                "type": "string",

                "example": "969e2a03-0a10-460f-be75-dadaed6f6b53"

              }

            }

          },

          "type": {

            "type": "string",

            "example": "referral"

          },

          "updated_at": {

            "type": "number",

            "example": 1660740212

          }

        }

      },

      "AffiliateList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Affiliate"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "affiliations": {

            "type": "array",

            "items": {

              "type": "object",

              "properties": {

                "affiliates_group_name": {

                  "type": "string",

                  "example": "affiliates_group_name"

                },

                "contact_email": {

                  "type": "string",

                  "example": "user@example.com"

                },

                "currency": {

                  "type": "string",

                  "example": "BRL"

                },

                "fee": {

                  "type": "number"

                },

                "id": {

                  "type": "string",

                  "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb41"

                },

                "marketplace_id": {

                  "type": "string",

                  "example": "marketplace_id"

                },

                "name": {

                  "type": "string",

                  "example": "Affiliate Name"

                },

                "net_value": {

                  "type": "number",

                  "example": 75

                },

                "value": {

                  "type": "number",

                  "example": 75

                }

              }

            }

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb41"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "company_name": {

                "type": "string",

                "example": "Company Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "doc": {

                "type": "string",

                "example": "012345678901"

              },

              "phone_number": {

                "type": "string",

                "example": "21983491234"

              },

              "phone_local_code": {

                "type": "string",

                "example": "55"

              },

              "address": {

                "type": "string",

                "example": "Rua Evangelina"

              },

              "address_number": {

                "type": "string",

                "example": "45"

              },

              "address_comp": {

                "type": "string",

                "example": "Casa"

              },

              "address_district": {

                "type": "string",

                "example": "Olaria"

              },

              "address_city": {

                "type": "string",

                "example": "Rio de Janeiro"

              },

              "address_state": {

                "type": "string",

                "example": "RJ"

              },

              "address_state_full_name": {

                "type": "string",

                "example": "Rio de Janeiro"

              },

              "address_country": {

                "type": "string",

                "example": "BR"

              },

              "address_zip_code": {

                "type": "string",

                "example": "21073250"

              },

              "lead": {

                "type": "array",

                "items": {

                  "type": "object",

                  "properties": {

                    "first_tracking": {

                      "type": "object",

                      "properties": {

                        "id": {

                          "type": "string"

                        },

                        "name": {

                          "type": "string"

                        },

                        "publisher": {

                          "type": "string"

                        },

                        "tracked_at": {

                          "type": "string"

                        },

                        "type": {

                          "type": "string"

                        }

                      }

                    },

                    "last_tracking": {

                      "type": "object",

                      "properties": {

                        "id": {

                          "type": "string"

                        },

                        "name": {

                          "type": "string"

                        },

                        "publisher": {

                          "type": "string"

                        },

                        "tracked_at": {

                          "type": "string"

                        },

                        "type": {

                          "type": "string"

                        }

                      }

                    }

                  }

                }

              }

            }

          },

          "contracts": {

            "type": "object"

          },

          "dates": {

            "type": "object",

            "properties": {

              "canceled_at": {

                "type": "number",

                "nullable": true

              },

              "confirmed_at": {

                "type": "number",

                "example": 1618512480

              },

              "created_at": {

                "type": "number",

                "example": 1618512480

              },

              "expires_at": {

                "type": "number",

                "nullable": true

              },

              "ordered_at": {

                "type": "number",

                "example": 1618512480

              },

              "unavailable_until": {

                "type": "number",

                "example": 1621104480

              },

              "updated_at": {

                "type": "number",

                "example": 1618514504

              },

              "warranty_until": {

                "type": "number",

                "example": 1621104480

              }

            }

          },

          "ecommerces": {

            "type": "object"

          },

          "extras": {

            "type": "object",

            "properties": {

              "accepted_terms_url": {

                "type": "number",

                "enum": [

                  0,

                  1

                ]

              },

              "accepted_privacy_policy_url": {

                "type": "number",

                "enum": [

                  0,

                  1

                ]

              }

            }

          },

          "has_order_bump": {

            "type": "number",

            "example": 0

          },

          "id": {

            "type": "string",

            "example": "9333ee25-64b5-4bd4-a0fd-4f35f95eb7cf"

          },

          "infrastructure": {

            "type": "object",

            "properties": {

              "ip": {

                "type": "string"

              },

              "city": {

                "type": "string"

              },

              "host": {

                "type": "string"

              },

              "region": {

                "type": "string"

              },

              "country": {

                "type": "string"

              },

              "user_agent": {

                "type": "string"

              },

              "city_lat_long": {

                "type": "string"

              }

            }

          },

          "invoice": {

            "type": "object",

            "properties": {

              "charge_at": {

                "type": "string"

              },

              "created_at": {

                "type": "string"

              },

              "cycle": {

                "type": "integer"

              },

              "discount_value": {

                "type": "number"

              },

              "id": {

                "type": "string"

              },

              "increment_value": {

                "type": "number"

              },

              "period_end": {

                "type": "string"

              },

              "period_start": {

                "type": "string"

              },

              "status": {

                "type": "string"

              },

              "tax_value": {

                "type": "string"

              },

              "tries": {

                "type": "string"

              },

              "try": {

                "type": "string"

              },

              "type": {

                "type": "string"

              },

              "value": {

                "type": "number"

              }

            }

          },

          "is_order_bump": {

            "type": "number",

            "example": 0

          },

          "items": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Product"

            }

          },

          "last_transaction": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string"

              },

              "url": {

                "type": "string"

              }

            }

          },

          "payment": {

            "type": "object",

            "properties": {

              "affiliate_value": {

                "type": "number",

                "example": 0

              },

              "acquirer": {

                "type": "object",

                "properties": {

                  "code": {

                    "type": "string",

                    "example": ""

                  },

                  "message": {

                    "type": "string",

                    "example": ""

                  },

                  "name": {

                    "type": "string",

                    "example": ""

                  },

                  "tid": {

                    "type": "string",

                    "example": ""

                  }

                }

              },

              "can_try_again": {

                "type": "number",

                "example": 1

              },

              "coupon": {

                "nullable": true

              },

              "currency": {

                "type": "string",

                "example": "BRL"

              },

              "discount_value": {

                "type": "number",

                "example": 0

              },

              "gross": {

                "type": "number",

                "example": 358.8

              },

              "installments": {

                "type": "object",

                "properties": {

                  "value": {

                    "type": "number",

                    "example": 71.76

                  },

                  "qty": {

                    "type": "number",

                    "example": 5

                  },

                  "interest": {

                    "type": "number",

                    "example": 0

                  }

                }

              },

              "marketplace_id": {

                "type": "string",

                "example": "ch_8BV4k2xHNmCVkmdf"

              },

              "marketplace_name": {

                "type": "string",

                "example": "mundipagg"

              },

              "marketplace_value": {

                "type": "number",

                "example": 0

              },

              "method": {

                "type": "string",

                "example": "credit_card"

              },

              "net": {

                "type": "number",

                "example": 358.8

              },

              "processing_times": {

                "type": "object",

                "properties": {

                  "started_at": {

                    "type": "string",

                    "example": ""

                  },

                  "finished_at": {

                    "type": "string",

                    "example": ""

                  },

                  "delay_in_seconds": {

                    "type": "string",

                    "example": ""

                  }

                }

              },

              "refund_reason": {

                "type": "string",

                "example": ""

              },

              "refuse_reason": {

                "type": "string",

                "example": "Stone|Aprovado"

              },

              "tax": {

                "type": "object",

                "properties": {

                  "value": {

                    "type": "number",

                    "example": 0

                  },

                  "rate": {

                    "type": "number",

                    "example": 0

                  }

                }

              },

              "total": {

                "type": "number",

                "example": 358.8

              },

              "credit_card": {

                "type": "object",

                "properties": {

                  "brand": {

                    "type": "string",

                    "example": "mastercard"

                  },

                  "expiration_month": {

                    "type": "string",

                    "example": ""

                  },

                  "expiration_year": {

                    "type": "string",

                    "example": ""

                  },

                  "first_digits": {

                    "type": "string",

                    "example": "552236"

                  },

                  "id": {

                    "type": "string",

                    "example": "card_LqYA750xUdc1no6R"

                  },

                  "last_digits": {

                    "type": "string",

                    "example": "4284"

                  }

                }

              }

            }

          },

          "product": {

            "$ref": "#/components/schemas/Product"

          },

          "shipment": {

            "type": "object",

            "properties": {

              "carrier": {

                "type": "string",

                "example": ""

              },

              "service": {

                "type": "string",

                "example": ""

              },

              "tracking": {

                "type": "string",

                "example": ""

              },

              "value": {

                "type": "number",

                "example": 0

              },

              "status": {

                "type": "string",

                "example": ""

              },

              "delivery_time": {

                "type": "string",

                "example": ""

              }

            }

          },

          "shipping": {

            "type": "object",

            "properties": {

              "name": {

                "type": "string",

                "example": "Standard"

              },

              "value": {

                "type": "number",

                "example": 0

              }

            }

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "subscription": {

            "type": "object",

            "properties": {

              "can_cancel": {

                "type": "number",

                "example": 1

              },

              "canceled_at": {

                "nullable": true

              },

              "charged_every_days": {

                "type": "number",

                "example": 360

              },

              "charged_times": {

                "type": "number",

                "example": 1

              },

              "id": {

                "type": "string",

                "example": "sub_RGpKLw1c2fj6ljo5"

              },

              "internal_id": {

                "type": "string",

                "example": "9333ee25-415e-42fd-aef8-db85184a62fe"

              },

              "last_status": {

                "type": "string",

                "example": "active"

              },

              "last_status_at": {

                "type": "number",

                "example": 1614042397

              },

              "name": {

                "type": "string",

                "example": "Produto de Teste"

              },

              "started_at": {

                "type": "number",

                "example": 1613952000

              },

              "subscription_code": {

                "type": "string",

                "example": "sub_RGpKLw1c2fj6ljo5"

              },

              "trial_days": {

                "type": "number",

                "example": 0

              },

              "trial_finished_at": {

                "nullable": true

              },

              "trial_started_at": {

                "nullable": true

              }

            }

          },

          "trackings": {

            "type": "object",

            "properties": {

              "source": {

                "nullable": true

              },

              "checkout_source": {

                "nullable": true

              },

              "utm_source": {

                "nullable": true

              },

              "utm_campaign": {

                "nullable": true

              },

              "utm_medium": {

                "nullable": true

              },

              "utm_content": {

                "nullable": true

              },

              "utm_term": {

                "nullable": true

              },

              "pptc": {

                "type": "array",

                "items": {

                  "type": "object",

                  "properties": {

                    "tracking_id": {

                      "type": "string"

                    },

                    "tracking_name": {

                      "type": "string"

                    },

                    "tracking_type": {

                      "type": "string"

                    },

                    "tracking_publisher": {

                      "type": "string"

                    },

                    "user_name": {

                      "type": "string"

                    },

                    "checkout_id": {

                      "type": "string"

                    },

                    "checkout_name": {

                      "type": "string"

                    },

                    "utm_campaign": {

                      "type": "string"

                    },

                    "utm_medium": {

                      "type": "string"

                    },

                    "utm_term": {

                      "type": "string"

                    },

                    "utm_content": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          },

          "type": {

            "type": "string",

            "example": "producer"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Product": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "1614042397"

          },

          "image_url": {

            "type": "string",

            "example": ""

          },

          "internal_id": {

            "type": "string",

            "example": "9333d6a8-344a-4765-9397-c3f860289709"

          },

          "marketplace_id": {

            "type": "string",

            "example": "1614042397"

          },

          "marketplace_name": {

            "type": "string",

            "example": "mundipagg"

          },

          "name": {

            "type": "string",

            "example": "Produto de Teste"

          },

          "offer": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "format": "uuid"

              },

              "name": {

                "type": "string"

              }

            }

          },

          "producer": {

            "type": "object",

            "properties": {

              "marketplace_id": {

                "type": "string",

                "example": "012345678901"

              },

              "name": {

                "type": "string",

                "example": "Producer Name"

              },

              "contact_email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "qty": {

            "type": "number",

            "example": 1

          },

          "total_value": {

            "type": "number",

            "example": 358.8

          },

          "type": {

            "type": "string",

            "example": "plan"

          },

          "unit_value": {

            "type": "number",

            "example": 358.8

          }

        }

      }

    }

  }

}
```

# Block lists

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Block lists",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/blocklists"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "Pode pesquisar bloqueios usando esta ação.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "type",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-bloqueio\">Tipo de bloqueio</a>",

            "schema": {

              "type": "string",

              "enum": [

                "all",

                "document",

                "email",

                "ip"

              ]

            },

            "required": true

          },

          {

            "name": "value",

            "in": "query",

            "description": "Valor do bloqueio",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "offset",

            "in": "query",

            "schema": {

              "type": "integer"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/BlockList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar um bloqueio",

        "description": "Pode consultar um bloqueio usando esta ação.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "type": {

                    "type": "string",

                    "enum": [

                      "document",

                      "email",

                      "ip"

                    ],

                    "example": "email"

                  },

                  "value": {

                    "type": "string",

                    "example": "user@example.com"

                  },

                  "reason": {

                    "type": "string",

                    "example": "Block reason"

                  }

                },

                "required": [

                  "type",

                  "value"

                ]

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Block"

                }

              }

            }

          }

        }

      }

    },

    "/{id}": {

      "get": {

        "summary": "Consultar",

        "description": "Pode consultar um bloqueio usando esta ação.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/BlockId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Block"

                }

              }

            }

          }

        }

      },

      "put": {

        "summary": "Atualizar um bloqueio",

        "description": "Pode atualizar um bloqueio usando esta ação.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/BlockId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "type": {

                    "type": "string",

                    "enum": [

                      "document",

                      "email",

                      "ip"

                    ],

                    "example": "email"

                  },

                  "value": {

                    "type": "string",

                    "example": "user@example.com"

                  },

                  "reason": {

                    "type": "string",

                    "example": "Block reason"

                  }

                },

                "required": [

                  "type",

                  "value"

                ]

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Block"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Apagar bloqueio",

        "description": "Pode apagar um bloqueio usando esta ação.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/BlockId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "reason": {

                    "type": "string"

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK"

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "BlockId": {

        "name": "id",

        "in": "path",

        "description": "ID do bloqueio",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      }

    },

    "schemas": {

      "BlockList": {

        "type": "array",

        "items": {

          "$ref": "#/components/schemas/Block"

        }

      },

      "Block": {

        "type": "object",

        "properties": {

          "client_id": {

            "type": "string",

            "example": "9d4c0e87-7bc5-402d-a1b5-ae2cbb442913"

          },

          "created_at": {

            "type": "integer",

            "example": 1750157184

          },

          "id": {

            "type": "string",

            "example": "67443a82-40b7-49ea-8aca-3efa8e282d0b"

          },

          "reason": {

            "type": "string",

            "example": "Block reason"

          },

          "type": {

            "type": "string",

            "enum": [

              "document",

              "email",

              "ip"

            ]

          },

          "updated_at": {

            "type": "integer",

            "example": 1750157184

          },

          "value": {

            "type": "string",

            "example": "user@example.com"

          }

        }

      }

    }

  }

}
```

# Checkout

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Checkout",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/checkout"

    }

  ],

  "paths": {

    "/offers/settings": {

      "post": {

        "summary": "Pré Configuração do Checkout",

        "description": "É possível criar valores dinâmicos para um checkout de produto.<br/>\nQuando gerar o id, pode usá-lo na sua url do checkout adicionando o parâmetro `settings={id}`.<br/>\nCampo `hash` é legado.<br/>\nCampo `subscription_code` serve para preencher os dados do comprador com os mesmos dados da assinatura.",

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "account_token": {

                    "type": "string",

                    "description": "Token Api Da Conta",

                    "example": "qOGo7c4TJLHjMEy4rpdoK7JxKKs1jHFzYbgE1ILx"

                  },

                  "blocked": {

                    "type": "number",

                    "description": "Bloquear campos do contato",

                    "example": 0

                  },

                  "company_name": {

                    "type": "string",

                    "description": "Nome da empresa",

                    "example": "Nome da Empresa"

                  },

                  "contact": {

                    "type": "object",

                    "properties": {

                      "name": {

                        "type": "string",

                        "description": "Nome do Comprador",

                        "example": "Ricardo Teste"

                      },

                      "email": {

                        "type": "string",

                        "description": "Email do Comprador",

                        "example": "teste@digitalmanager.guru"

                      },

                      "doc": {

                        "type": "string",

                        "description": "Documento do Comprador",

                        "example": "01234567890"

                      },

                      "phone_number": {

                        "type": "string",

                        "description": "Número de Telefone do Comprador",

                        "example": "21983491234"

                      },

                      "phone_local_code": {

                        "type": "string",

                        "description": "Código do País do Telefone do Comprador",

                        "example": "55"

                      },

                      "company_name": {

                        "type": "string",

                        "description": "Nome da Empresa do Comprador",

                        "example": "Empresa Teste LTDA"

                      }

                    }

                  },

                  "offer_id": {

                    "type": "string",

                    "format": "uuid",

                    "description": "ID da Oferta",

                    "example": "550e8400-e29b-41d4-a716-446655440000"

                  },

                  "product_name": {

                    "type": "string",

                    "description": "Nome do produto a ser exibido",

                    "example": "Produto de Teste"

                  },

                  "product_qty": {

                    "type": "integer",

                    "description": "Quantidade de itens do produto",

                    "example": 4

                  },

                  "shipping_value": {

                    "type": "number",

                    "description": "Valor do Frete",

                    "example": 5

                  },

                  "source": {

                    "type": "string",

                    "description": "Código Externo do Pedido",

                    "example": null

                  },

                  "subscription_code": {

                    "type": "string",

                    "description": "Código da Assinatura para carregar os dados do comprador",

                    "example": "sub_RYwEurn51mjqpRCu"

                  },

                  "value": {

                    "type": "number",

                    "description": "Valor do Pedido",

                    "example": 5

                  }

                },

                "required": [

                  "account_token"

                ]

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "id": {

                      "type": "string",

                      "example": "fc0e02a1-1cfb-4fc8-b7b5-1f49607c778c"

                    },

                    "hash": {

                      "type": "string",

                      "example": "fc0e02a1-1cfb-4fc8-b7b5-1f49607c778c"

                    }

                  }

                }

              }

            }

          }

        }

      }

    }

  }

}
```

# Contacts

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Contacts",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/contacts"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "Pode pesquisar contatos usando esta ação. Os parametros são passados na url (query string). A ação retorna uma coleção paginada de contatos. O valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "created_at_end",

            "in": "query",

            "description": "Data de Criação Final",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "created_at_ini",

            "in": "query",

            "description": "Data de Criação Inicial",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "$ref": "#/components/parameters/NameIdCursor"

          },

          {

            "name": "doc",

            "in": "query",

            "description": "Documento",

            "example": "05935375214",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "email",

            "in": "query",

            "description": "Email",

            "example": "dev@digitalmanager.guru",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome",

            "example": "Dev Guru",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/ContactList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar contacto",

        "description": "Criar contacto",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "name": {

                    "type": "string",

                    "example": "Nome do Contato"

                  },

                  "company_name": {

                    "type": "string",

                    "example": "Nome da Empresa do Contato"

                  },

                  "email": {

                    "type": "string",

                    "example": "dev@digitalmanager.guru"

                  },

                  "doc": {

                    "type": "string",

                    "example": "012345678901"

                  },

                  "phone_local_code": {

                    "type": "string",

                    "example": 55

                  },

                  "phone_number": {

                    "type": "string",

                    "example": "21983491234"

                  },

                  "address": {

                    "type": "string",

                    "example": "Rua Evangelina"

                  },

                  "address_number": {

                    "type": "string",

                    "example": "45"

                  },

                  "address_comp": {

                    "type": "string",

                    "example": "Casa"

                  },

                  "address_district": {

                    "type": "string",

                    "example": "Olaria"

                  },

                  "address_city": {

                    "type": "string",

                    "example": "Rio de Janeiro"

                  },

                  "address_state": {

                    "type": "string",

                    "example": "RJ"

                  },

                  "address_country": {

                    "type": "string",

                    "example": "BR"

                  },

                  "address_zip_code": {

                    "type": "string",

                    "example": "21073250"

                  },

                  "group_id": {

                    "type": "string",

                    "example": "8ad15h04-c44d-4ad8-d854-fa050e36e4a0",

                    "description": "Id do grupo"

                  }

                },

                "required": [

                  "address_country",

                  "email",

                  "name",

                  "phone_local_code",

                  "phone_number"

                ]

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/ContactFull"

                }

              }

            }

          }

        }

      }

    },

    "/{id}": {

      "get": {

        "summary": "Consultar",

        "description": "Consulta um contato a partir de seu código.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ContactId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/ContactFull"

                }

              }

            }

          }

        }

      },

      "put": {

        "summary": "Atualizar",

        "description": "Atualiza um contato através de seu id.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ContactId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "name": {

                    "type": "string",

                    "example": "Nome do Contato"

                  },

                  "company_name": {

                    "type": "string",

                    "example": "Nome da Empresa do Contato"

                  },

                  "email": {

                    "type": "string",

                    "example": "dev@digitalmanager.guru"

                  },

                  "doc": {

                    "type": "string",

                    "example": "012345678901"

                  },

                  "phone_local_code": {

                    "type": "string",

                    "example": 55

                  },

                  "phone_number": {

                    "type": "string",

                    "example": "21983491234"

                  },

                  "address": {

                    "type": "string",

                    "example": "Rua Evangelina"

                  },

                  "address_number": {

                    "type": "string",

                    "example": "45"

                  },

                  "address_comp": {

                    "type": "string",

                    "example": "Casa"

                  },

                  "address_district": {

                    "type": "string",

                    "example": "Olaria"

                  },

                  "address_city": {

                    "type": "string",

                    "example": "Rio de Janeiro"

                  },

                  "address_state": {

                    "type": "string",

                    "example": "RJ"

                  },

                  "address_country": {

                    "type": "string",

                    "example": "BR"

                  },

                  "address_zip_code": {

                    "type": "string",

                    "example": "21073250"

                  },

                  "send_affiliations_notification": {

                    "type": "number",

                    "example": 0,

                    "enum": [

                      0,

                      1

                    ]

                  }

                },

                "required": [

                  "address_country",

                  "email",

                  "name",

                  "phone_local_code",

                  "phone_number"

                ]

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/ContactFull"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/affiliations": {

      "get": {

        "summary": "Listar Afiliações",

        "description": "Listar as afiliações de um contato a partir de seu código. O valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ContactId"

          },

          {

            "$ref": "#/components/parameters/NameIdCursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/AffiliateList"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/anonymize": {

      "post": {

        "summary": "Anonimizar",

        "description": "Anonimiza um contato através de seu id. Contatos que possuam uma assinatura ativa não poderão ser anonimizados.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ContactId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "status": {

                      "type": "string",

                      "example": "success"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/{id}/subscriptions": {

      "get": {

        "summary": "Listar Assinaturas",

        "description": "Lista as assinaturas de um contato a partir de seu código. O valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ContactId"

          },

          {

            "$ref": "#/components/parameters/SubscriptionsCursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/SubscriptionList"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/transactions": {

      "get": {

        "summary": "Listar Transações",

        "description": "Lista as transações de um contato a partir de seu código. O valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ContactId"

          },

          {

            "$ref": "#/components/parameters/TransactionsCursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/etickets": {

      "get": {

        "summary": "Listar Etickets",

        "description": "Lista os Etickets de um contato. O valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ContactId"

          },

          {

            "$ref": "#/components/parameters/EticketsCursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/EticketList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar etickets",

        "description": "Cria transação e quantidade selecionada de ingressos para o contacto. Retorna a transação associada aos ingressos.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ContactId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "required": [

                  "offer_id",

                  "qty"

                ],

                "properties": {

                  "offer_id": {

                    "type": "string",

                    "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb46"

                  },

                  "qty": {

                    "type": "integer",

                    "example": 5,

                    "minimum": 1

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Transaction"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "ContactId": {

        "name": "id",

        "in": "path",

        "description": "ID do contacto",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "NameIdCursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoiY29udGFjdCBuYW1lIiwiaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      },

      "SubscriptionsCursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJzdWJzY3JpcHRpb25zLmxhc3Rfc3RhdHVzX2F0IjoiMjAyNC0wNy0xNiAxMDo0ODoyNSIsInN1YnNjcmlwdGlvbnMuaWQiOiI5Yzg5NTZiMy1hN2RkLTRhNjEtOGEzNy02ZmM2YzY3OGU1YmEiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      },

      "TransactionsCursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJvcmRlcmVkX2F0IjoiMjAyNC0wOC0yNyAxMjo0MDowMiIsImlkIjoiOWNkZTAxNjctMjg5NC00MzE5LWE0NDEtOGVjMTBkNTMxMjFhIiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ"

      },

      "EticketsCursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJzdGFydF9hdCI6IjIwMjQtMDctMjkiLCJpZCI6IjljOWIzNDU2LTU2YWQtNDg0Zi1iOTEyLWMzYTQxNTU3M2YyZSIsIl9wb2ludHNUb05leHRJdGVtcyI6dHJ1ZX0"

      }

    },

    "schemas": {

      "Contact": {

        "type": "object",

        "properties": {

          "address": {

            "type": "string",

            "example": "Address"

          },

          "address_city": {

            "type": "string",

            "example": "City"

          },

          "address_comp": {

            "type": "string",

            "example": "Comp"

          },

          "address_country": {

            "type": "string",

            "example": "BR"

          },

          "address_district": {

            "type": "string",

            "example": "Distric"

          },

          "address_number": {

            "type": "string",

            "example": "1111"

          },

          "address_state": {

            "type": "string",

            "example": "SC"

          },

          "address_zip_code": {

            "type": "string",

            "example": "08450230"

          },

          "created_at": {

            "type": "number",

            "example": 1526326690

          },

          "doc": {

            "type": "string",

            "example": "74543141463"

          },

          "email": {

            "type": "string",

            "example": "user@example.com"

          },

          "id": {

            "type": "string",

            "example": "8ad15004-cd4d-4ad8-d854-fa050e36e4a7"

          },

          "name": {

            "type": "string",

            "example": "Contact Name"

          },

          "phone_full_number": {

            "type": "string",

            "example": "34971185157"

          },

          "phone_local_code": {

            "type": "string",

            "example": "34,"

          },

          "phone_number": {

            "type": "string",

            "example": "971185157"

          },

          "update_at": {

            "type": "number",

            "example": 1530742615

          }

        }

      },

      "ContactFull": {

        "type": "object",

        "properties": {

          "address_city": {

            "type": "string",

            "example": "City"

          },

          "address_comp": {

            "type": "string",

            "example": "Comp"

          },

          "address_country": {

            "type": "string",

            "example": "BR"

          },

          "address_district": {

            "type": "string",

            "example": "Distric"

          },

          "address_number": {

            "type": "string",

            "example": "1111"

          },

          "address_state": {

            "type": "string",

            "example": "SC"

          },

          "address_zip_code": {

            "type": "string",

            "example": "08450230"

          },

          "address": {

            "type": "string",

            "example": "Address"

          },

          "affiliates_group_id": {

            "type": "string",

            "example": "8ad15004-cd4d-4ad8-d854-fa050e36e4a7"

          },

          "company_name": {

            "type": "string",

            "example": "Contact Company Name"

          },

          "created_at": {

            "type": "number",

            "example": 1526326690

          },

          "doc": {

            "type": "string",

            "example": "74543141463"

          },

          "email_is_deliverable": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "email": {

            "type": "string",

            "example": "user@example.com"

          },

          "has_recipient": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "id": {

            "type": "string",

            "example": "8ad15004-cd4d-4ad8-d854-fa050e36e4a7"

          },

          "is_anonymized": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "is_client": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "is_deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "is_lead": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Contact Name"

          },

          "phone_full_number": {

            "type": "string",

            "example": "34971185157"

          },

          "phone_local_code": {

            "type": "string",

            "example": "34,"

          },

          "phone_number": {

            "type": "string",

            "example": "971185157"

          },

          "send_affiliations_notifications": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "update_at": {

            "type": "number",

            "example": 1530742615

          },

          "lead": {

            "type": "array",

            "example": []

          }

        }

      },

      "ContactList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Contact"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoiY29udGFjdCBuYW1lIiwiaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Affiliate": {

        "type": "object",

        "properties": {

          "commission": {

            "type": "object",

            "properties": {

              "type": {

                "type": "string",

                "example": "percentage"

              },

              "value": {

                "type": "string",

                "example": "7.00"

              }

            }

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "964fe215-d8a3-4f06-9cf9-62713f906641"

              },

              "name": {

                "type": "string",

                "example": "John Doe"

              }

            }

          },

          "deletable": {

            "type": "number",

            "example": 1

          },

          "editable": {

            "type": "number",

            "example": 1

          },

          "id": {

            "type": "string",

            "example": "970b1f0b-57d3-4fae-ade7-1000ee3400da"

          },

          "is_active": {

            "type": "number",

            "example": 1

          },

          "marketplace_id": {

            "type": "string",

            "example": "LGFW3UKY"

          },

          "marketplace_name": {

            "type": "string",

            "example": "asaas"

          },

          "name": {

            "type": "string",

            "example": "John Doe"

          },

          "product": {

            "type": "object",

            "properties": {

              "name": {

                "type": "string",

                "example": "Produto de Teste"

              },

              "id": {

                "type": "string",

                "example": "969e2a03-0a10-460f-be75-dadaed6f6b53"

              }

            }

          },

          "type": {

            "type": "string",

            "example": "referral"

          },

          "updated_at": {

            "type": "number",

            "example": 1660740212

          }

        }

      },

      "AffiliateList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Affiliate"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoiY29udGFjdCBuYW1lIiwiaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Subscription": {

        "type": "object",

        "properties": {

          "cancel_at_cycle_end": {

            "type": "boolean"

          },

          "is_cycling": {

            "type": "boolean"

          },

          "cancelled_at": {

            "nullable": true

          },

          "charged_every_days": {

            "type": "number"

          },

          "charged_times": {

            "type": "number"

          },

          "contact": {

            "type": "object",

            "properties": {

              "doc": {

                "type": "string"

              },

              "email": {

                "type": "string"

              },

              "id": {

                "type": "string"

              },

              "name": {

                "type": "string"

              },

              "phone_local_code": {

                "type": "string"

              },

              "phone_number": {

                "type": "string"

              }

            }

          },

          "contracts": {

            "nullable": true

          },

          "created_at": {

            "type": "number"

          },

          "id": {

            "type": "string"

          },

          "last_status": {

            "type": "string"

          },

          "last_status_at": {

            "type": "number"

          },

          "next_cycle_at": {

            "type": "string"

          },

          "own_engine": {

            "type": "boolean"

          },

          "payment_method": {

            "type": "string"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string"

              },

              "marketplace_id": {

                "type": "string"

              },

              "marketplace_name": {

                "type": "string"

              },

              "name": {

                "type": "string"

              }

            }

          },

          "started_at": {

            "type": "number"

          },

          "subscription_code": {

            "type": "string"

          },

          "trial_finished_at": {

            "nullable": true

          },

          "trial_started_at": {

            "nullable": true

          },

          "updated_at": {

            "type": "number"

          }

        },

        "example": {

          "cancel_at_cycle_end": false,

          "is_cycling": false,

          "cancelled_at": null,

          "charged_every_days": 360,

          "charged_times": 1,

          "contact": {

            "doc": "012345678901",

            "email": "dev1@digitalmanager.guru",

            "id": "9333ee25-42ad-4446-b0d5-8eccb7a6329e",

            "name": "Nome Do Contato",

            "phone_local_code": "55",

            "phone_number": "21983491234"

          },

          "contracts": null,

          "created_at": 1618512480,

          "id": "9333ee25-415e-42fd-aef8-db85184a62fe",

          "last_status": "active",

          "last_status_at": 1614042397,

          "next_cycle_at": "2022-02-21",

          "own_engine": false,

          "payment_method": "credit_card",

          "product": {

            "id": "9333d6a8-344a-4765-9397-c3f860289709",

            "marketplace_id": "1614042397",

            "marketplace_name": "mundipagg",

            "name": "Produto de Testes"

          },

          "started_at": 1613952000,

          "subscription_code": "sub_RGpKLw1c2fj6ljo5",

          "trial_finished_at": null,

          "trial_started_at": null,

          "updated_at": 1618514504

        }

      },

      "SubscriptionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Subscription"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJzdWJzY3JpcHRpb25zLmxhc3Rfc3RhdHVzX2F0IjoiMjAyNC0wNy0xNiAxMDo0ODoyNSIsInN1YnNjcmlwdGlvbnMuaWQiOiI5Yzg5NTZiMy1hN2RkLTRhNjEtOGEzNy02ZmM2YzY3OGU1YmEiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "affiliations": {

            "type": "array",

            "items": {

              "type": "object",

              "properties": {

                "affiliates_group_name": {

                  "type": "string",

                  "example": "affiliates_group_name"

                },

                "contact_email": {

                  "type": "string",

                  "example": "user@example.com"

                },

                "currency": {

                  "type": "string",

                  "example": "BRL"

                },

                "fee": {

                  "type": "number"

                },

                "id": {

                  "type": "string",

                  "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb41"

                },

                "marketplace_id": {

                  "type": "string",

                  "example": "marketplace_id"

                },

                "name": {

                  "type": "string",

                  "example": "Affiliate Name"

                },

                "net_value": {

                  "type": "number",

                  "example": 75

                },

                "value": {

                  "type": "number",

                  "example": 75

                }

              }

            }

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb41"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "company_name": {

                "type": "string",

                "example": "Company Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "doc": {

                "type": "string",

                "example": "012345678901"

              },

              "phone_number": {

                "type": "string",

                "example": "21983491234"

              },

              "phone_local_code": {

                "type": "string",

                "example": "55"

              },

              "address": {

                "type": "string",

                "example": "Rua Evangelina"

              },

              "address_number": {

                "type": "string",

                "example": "45"

              },

              "address_comp": {

                "type": "string",

                "example": "Casa"

              },

              "address_district": {

                "type": "string",

                "example": "Olaria"

              },

              "address_city": {

                "type": "string",

                "example": "Rio de Janeiro"

              },

              "address_state": {

                "type": "string",

                "example": "RJ"

              },

              "address_state_full_name": {

                "type": "string",

                "example": "Rio de Janeiro"

              },

              "address_country": {

                "type": "string",

                "example": "BR"

              },

              "address_zip_code": {

                "type": "string",

                "example": "21073250"

              },

              "lead": {

                "type": "array",

                "items": {

                  "type": "object",

                  "properties": {

                    "first_tracking": {

                      "type": "object",

                      "properties": {

                        "id": {

                          "type": "string"

                        },

                        "name": {

                          "type": "string"

                        },

                        "publisher": {

                          "type": "string"

                        },

                        "tracked_at": {

                          "type": "string"

                        },

                        "type": {

                          "type": "string"

                        }

                      }

                    },

                    "last_tracking": {

                      "type": "object",

                      "properties": {

                        "id": {

                          "type": "string"

                        },

                        "name": {

                          "type": "string"

                        },

                        "publisher": {

                          "type": "string"

                        },

                        "tracked_at": {

                          "type": "string"

                        },

                        "type": {

                          "type": "string"

                        }

                      }

                    }

                  }

                }

              }

            }

          },

          "contracts": {

            "type": "object"

          },

          "dates": {

            "type": "object",

            "properties": {

              "canceled_at": {

                "type": "number",

                "nullable": true

              },

              "confirmed_at": {

                "type": "number",

                "example": 1618512480

              },

              "created_at": {

                "type": "number",

                "example": 1618512480

              },

              "expires_at": {

                "type": "number",

                "nullable": true

              },

              "ordered_at": {

                "type": "number",

                "example": 1618512480

              },

              "unavailable_until": {

                "type": "number",

                "example": 1621104480

              },

              "updated_at": {

                "type": "number",

                "example": 1618514504

              },

              "warranty_until": {

                "type": "number",

                "example": 1621104480

              }

            }

          },

          "ecommerces": {

            "type": "object"

          },

          "extras": {

            "type": "object",

            "properties": {

              "accepted_terms_url": {

                "type": "number",

                "enum": [

                  0,

                  1

                ]

              },

              "accepted_privacy_policy_url": {

                "type": "number",

                "enum": [

                  0,

                  1

                ]

              }

            }

          },

          "has_order_bump": {

            "type": "number",

            "example": 0

          },

          "id": {

            "type": "string",

            "example": "9333ee25-64b5-4bd4-a0fd-4f35f95eb7cf"

          },

          "infrastructure": {

            "type": "object",

            "properties": {

              "ip": {

                "type": "string"

              },

              "city": {

                "type": "string"

              },

              "host": {

                "type": "string"

              },

              "region": {

                "type": "string"

              },

              "country": {

                "type": "string"

              },

              "user_agent": {

                "type": "string"

              },

              "city_lat_long": {

                "type": "string"

              }

            }

          },

          "invoice": {

            "type": "object",

            "properties": {

              "charge_at": {

                "type": "string"

              },

              "created_at": {

                "type": "string"

              },

              "cycle": {

                "type": "integer"

              },

              "discount_value": {

                "type": "number"

              },

              "id": {

                "type": "string"

              },

              "increment_value": {

                "type": "number"

              },

              "period_end": {

                "type": "string"

              },

              "period_start": {

                "type": "string"

              },

              "status": {

                "type": "string"

              },

              "tax_value": {

                "type": "string"

              },

              "tries": {

                "type": "string"

              },

              "try": {

                "type": "string"

              },

              "type": {

                "type": "string"

              },

              "value": {

                "type": "number"

              }

            }

          },

          "is_order_bump": {

            "type": "number",

            "example": 0

          },

          "items": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Product"

            }

          },

          "last_transaction": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string"

              },

              "url": {

                "type": "string"

              }

            }

          },

          "payment": {

            "type": "object",

            "properties": {

              "affiliate_value": {

                "type": "number",

                "example": 0

              },

              "acquirer": {

                "type": "object",

                "properties": {

                  "code": {

                    "type": "string",

                    "example": ""

                  },

                  "message": {

                    "type": "string",

                    "example": ""

                  },

                  "name": {

                    "type": "string",

                    "example": ""

                  },

                  "tid": {

                    "type": "string",

                    "example": ""

                  }

                }

              },

              "can_try_again": {

                "type": "number",

                "example": 1

              },

              "coupon": {

                "nullable": true

              },

              "currency": {

                "type": "string",

                "example": "BRL"

              },

              "discount_value": {

                "type": "number",

                "example": 0

              },

              "gross": {

                "type": "number",

                "example": 358.8

              },

              "installments": {

                "type": "object",

                "properties": {

                  "value": {

                    "type": "number",

                    "example": 71.76

                  },

                  "qty": {

                    "type": "number",

                    "example": 5

                  },

                  "interest": {

                    "type": "number",

                    "example": 0

                  }

                }

              },

              "marketplace_id": {

                "type": "string",

                "example": "ch_8BV4k2xHNmCVkmdf"

              },

              "marketplace_name": {

                "type": "string",

                "example": "mundipagg"

              },

              "marketplace_value": {

                "type": "number",

                "example": 0

              },

              "method": {

                "type": "string",

                "example": "credit_card"

              },

              "net": {

                "type": "number",

                "example": 358.8

              },

              "processing_times": {

                "type": "object",

                "properties": {

                  "started_at": {

                    "type": "string",

                    "example": ""

                  },

                  "finished_at": {

                    "type": "string",

                    "example": ""

                  },

                  "delay_in_seconds": {

                    "type": "string",

                    "example": ""

                  }

                }

              },

              "refund_reason": {

                "type": "string",

                "example": ""

              },

              "refuse_reason": {

                "type": "string",

                "example": "Stone|Aprovado"

              },

              "tax": {

                "type": "object",

                "properties": {

                  "value": {

                    "type": "number",

                    "example": 0

                  },

                  "rate": {

                    "type": "number",

                    "example": 0

                  }

                }

              },

              "total": {

                "type": "number",

                "example": 358.8

              },

              "credit_card": {

                "type": "object",

                "properties": {

                  "brand": {

                    "type": "string",

                    "example": "mastercard"

                  },

                  "expiration_month": {

                    "type": "string",

                    "example": ""

                  },

                  "expiration_year": {

                    "type": "string",

                    "example": ""

                  },

                  "first_digits": {

                    "type": "string",

                    "example": "552236"

                  },

                  "id": {

                    "type": "string",

                    "example": "card_LqYA750xUdc1no6R"

                  },

                  "last_digits": {

                    "type": "string",

                    "example": "4284"

                  }

                }

              }

            }

          },

          "product": {

            "$ref": "#/components/schemas/Product"

          },

          "shipment": {

            "type": "object",

            "properties": {

              "carrier": {

                "type": "string",

                "example": ""

              },

              "service": {

                "type": "string",

                "example": ""

              },

              "tracking": {

                "type": "string",

                "example": ""

              },

              "value": {

                "type": "number",

                "example": 0

              },

              "status": {

                "type": "string",

                "example": ""

              },

              "delivery_time": {

                "type": "string",

                "example": ""

              }

            }

          },

          "shipping": {

            "type": "object",

            "properties": {

              "name": {

                "type": "string",

                "example": "Standard"

              },

              "value": {

                "type": "number",

                "example": 0

              }

            }

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "subscription": {

            "type": "object",

            "properties": {

              "can_cancel": {

                "type": "number",

                "example": 1

              },

              "canceled_at": {

                "nullable": true

              },

              "charged_every_days": {

                "type": "number",

                "example": 360

              },

              "charged_times": {

                "type": "number",

                "example": 1

              },

              "id": {

                "type": "string",

                "example": "sub_RGpKLw1c2fj6ljo5"

              },

              "internal_id": {

                "type": "string",

                "example": "9333ee25-415e-42fd-aef8-db85184a62fe"

              },

              "last_status": {

                "type": "string",

                "example": "active"

              },

              "last_status_at": {

                "type": "number",

                "example": 1614042397

              },

              "name": {

                "type": "string",

                "example": "Produto de Teste"

              },

              "started_at": {

                "type": "number",

                "example": 1613952000

              },

              "subscription_code": {

                "type": "string",

                "example": "sub_RGpKLw1c2fj6ljo5"

              },

              "trial_days": {

                "type": "number",

                "example": 0

              },

              "trial_finished_at": {

                "nullable": true

              },

              "trial_started_at": {

                "nullable": true

              }

            }

          },

          "trackings": {

            "type": "object",

            "properties": {

              "source": {

                "nullable": true

              },

              "checkout_source": {

                "nullable": true

              },

              "utm_source": {

                "nullable": true

              },

              "utm_campaign": {

                "nullable": true

              },

              "utm_medium": {

                "nullable": true

              },

              "utm_content": {

                "nullable": true

              },

              "utm_term": {

                "nullable": true

              },

              "pptc": {

                "type": "array",

                "items": {

                  "type": "object",

                  "properties": {

                    "tracking_id": {

                      "type": "string"

                    },

                    "tracking_name": {

                      "type": "string"

                    },

                    "tracking_type": {

                      "type": "string"

                    },

                    "tracking_publisher": {

                      "type": "string"

                    },

                    "user_name": {

                      "type": "string"

                    },

                    "checkout_id": {

                      "type": "string"

                    },

                    "checkout_name": {

                      "type": "string"

                    },

                    "utm_campaign": {

                      "type": "string"

                    },

                    "utm_medium": {

                      "type": "string"

                    },

                    "utm_term": {

                      "type": "string"

                    },

                    "utm_content": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          },

          "type": {

            "type": "string",

            "example": "producer"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJvcmRlcmVkX2F0IjoiMjAyNC0wOC0yNyAxMjo0MDowMiIsImlkIjoiOWNkZTAxNjctMjg5NC00MzE5LWE0NDEtOGVjMTBkNTMxMjFhIiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Product": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "1614042397"

          },

          "image_url": {

            "type": "string",

            "example": ""

          },

          "internal_id": {

            "type": "string",

            "example": "9333d6a8-344a-4765-9397-c3f860289709"

          },

          "marketplace_id": {

            "type": "string",

            "example": "1614042397"

          },

          "marketplace_name": {

            "type": "string",

            "example": "mundipagg"

          },

          "name": {

            "type": "string",

            "example": "Produto de Teste"

          },

          "offer": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "format": "uuid"

              },

              "name": {

                "type": "string"

              }

            }

          },

          "producer": {

            "type": "object",

            "properties": {

              "marketplace_id": {

                "type": "string",

                "example": "012345678901"

              },

              "name": {

                "type": "string",

                "example": "Producer Name"

              },

              "contact_email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "qty": {

            "type": "number",

            "example": 1

          },

          "total_value": {

            "type": "number",

            "example": 358.8

          },

          "type": {

            "type": "string",

            "example": "plan"

          },

          "unit_value": {

            "type": "number",

            "example": 358.8

          }

        }

      },

      "EticketList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Eticket"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJzdGFydF9hdCI6IjIwMjQtMDctMjkiLCJpZCI6IjljOWIzNDU2LTU2YWQtNDg0Zi1iOTEyLWMzYTQxNTU3M2YyZSIsIl9wb2ludHNUb05leHRJdGVtcyI6dHJ1ZX0"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Eticket": {

        "type": "object",

        "properties": {

          "code": {

            "type": "string",

            "example": "etkt_123456789"

          },

          "email": {

            "type": "string",

            "format": "email"

          },

          "id": {

            "type": "string",

            "format": "uuid"

          },

          "name": {

            "type": "string"

          },

          "phone_local_code": {

            "type": "string",

            "example": "55"

          },

          "phone_number": {

            "type": "string"

          },

          "product_name": {

            "type": "string"

          },

          "start_at": {

            "type": "integer",

            "format": "timestamp"

          },

          "status": {

            "type": "string"

          }

        }

      }

    }

  }

}
```

# Countries

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Countries",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/countries"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Listar",

        "description": "Lista completa dos países.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "value": {

                        "type": "string",

                        "example": "BR"

                      },

                      "text": {

                        "type": "string",

                        "example": "Brazil"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/br/address/{zipcode}": {

      "get": {

        "summary": "Buscar Endereço (BR)",

        "description": "Busca o endereço a partir do CEP.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "zipcode",

            "in": "path",

            "description": "CEP",

            "example": "21073250",

            "required": true,

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "logradouro": {

                      "type": "string",

                      "example": "Rua Evangelina"

                    },

                    "complemento": {

                      "type": "string",

                      "example": ""

                    },

                    "bairro": {

                      "type": "string",

                      "example": "Olaria"

                    },

                    "localidade": {

                      "type": "string",

                      "example": "Rio de Janeiro"

                    },

                    "uf": {

                      "type": "string",

                      "example": "RJ"

                    },

                    "ibge": {

                      "type": "string",

                      "example": "3304557"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/{country}/states": {

      "get": {

        "summary": "Listar estados",

        "description": "Lista os estados de um país.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "country",

            "in": "path",

            "description": "Código de duas letras do país.",

            "example": "BR",

            "required": true,

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "value": {

                        "type": "string",

                        "example": "AC"

                      },

                      "text": {

                        "type": "string",

                        "example": "Acre"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      }

    }

  }

}
```

# Coupons

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Coupons",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/coupons"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "Pode pesquisar cupons usando esta ação. Os parametros são passados na url (query string). A ação retorna uma coleção paginada de cupons.\n\nO valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "coupon_code",

            "in": "query",

            "schema": {

              "type": "string",

              "example": "coupon_code"

            }

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "is_active",

            "in": "query",

            "required": true,

            "schema": {

              "type": "string",

              "example": 1,

              "enum": [

                "all",

                "0",

                "1"

              ]

            }

          },

          {

            "name": "has_transactions",

            "in": "query",

            "required": true,

            "schema": {

              "type": "string",

              "example": 1,

              "enum": [

                "all",

                "0",

                "1"

              ]

            }

          },

          {

            "name": "validate_by",

            "in": "query",

            "required": true,

            "schema": {

              "type": "string",

              "enum": [

                "email",

                "document"

              ],

              "example": "document"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CouponList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar",

        "description": "Cria um cupom.\n\nOs parâmetros `date_ini` e `date_end` devem ser passados como _unix timestamps_.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/CouponRequest"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CouponFull"

                }

              }

            }

          }

        }

      }

    },

    "/{id}": {

      "get": {

        "summary": "Consultar",

        "description": "Consulta um cupom a partir de seu código.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/CouponId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CouponFull"

                }

              }

            }

          }

        }

      },

      "put": {

        "summary": "Atualizar",

        "description": "Atualiza um cupom.\n\nOs parâmetros `date_ini` e `date_end` devem ser passados como _unix timestamps_.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/CouponId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/CouponRequest"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CouponFull"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Apagar",

        "description": "Apaga um cupom a partir de seu código.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/CouponId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/{id}/activation": {

      "patch": {

        "summary": "Alterar activação",

        "description": "Alterar estado de activação do cupom.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/CouponId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CouponFull"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do cupom",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/CouponId"

          },

          {

            "name": "offset",

            "in": "query",

            "required": true,

            "schema": {

              "type": "number",

              "example": 51

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "coupon_update"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/{id}/duplicate": {

      "post": {

        "summary": "Duplicar",

        "description": "Duplica cupom",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/CouponId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CouponFull"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/transactions": {

      "get": {

        "summary": "Vendas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/CouponId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "CouponId": {

        "name": "id",

        "in": "path",

        "description": "ID do coupon",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "CouponRequest": {

        "type": "object",

        "properties": {

          "coupon_code": {

            "type": "string",

            "example": "coupon_code"

          },

          "date_end": {

            "type": "integer",

            "example": 1701388740

          },

          "date_ini": {

            "type": "integer",

            "example": 1698796800

          },

          "documents": {

            "type": "array",

            "items": {

              "type": "string",

              "minLength": 7,

              "maxLength": 20

            },

            "example": [

              "123456789",

              "987654321"

            ]

          },

          "emails": {

            "type": "array",

            "items": {

              "type": "string"

            },

            "example": [

              "user1@example.com",

              "user2@example.com"

            ]

          },

          "validate_by": {

            "type": "string",

            "enum": [

              "email",

              "document"

            ],

            "example": "document"

          },

          "incidence_field": {

            "type": "string",

            "enum": [

              "products",

              "shipping",

              "total"

            ],

            "example": "total"

          },

          "incidence_type": {

            "type": "string",

            "enum": [

              "value",

              "percent"

            ],

            "example": "value"

          },

          "incidence_value": {

            "type": "number",

            "example": 10

          },

          "is_active": {

            "type": "boolean",

            "example": true

          },

          "maximum_subscription_cycles": {

            "type": "number",

            "example": 3

          },

          "product_ids": {

            "type": "array",

            "items": {

              "type": "string"

            },

            "example": [

              "9b470a8f-9b11-493b-afed-f06c4ba6907d",

              "9b474843-5be4-41ce-ad9f-1b113f92df4c"

            ]

          },

          "usage_contact": {

            "type": "number",

            "example": 0

          },

          "usage_total": {

            "type": "number",

            "example": 5

          }

        },

        "required": [

          "coupon_code",

          "date_end",

          "date_ini",

          "incidence_field",

          "incidence_type",

          "incidence_value",

          "is_active",

          "usage_contact",

          "usage_total",

          "validate_by"

        ]

      },

      "Coupon": {

        "type": "object",

        "properties": {

          "client_id": {

            "type": "string",

            "example": "9b470a8f-9b11-493b-afed-f06c4ba6907d"

          },

          "coupon_code": {

            "type": "string",

            "example": "coupon_code"

          },

          "date_end": {

            "type": "number",

            "example": 1701388740

          },

          "date_ini": {

            "type": "number",

            "example": 1698796800

          },

          "deletable": {

            "type": "boolean",

            "example": false

          },

          "id": {

            "type": "string",

            "example": "9b470a8f-9b11-493b-afed-f06c4ba6907d"

          },

          "incidence_field": {

            "type": "string",

            "example": "products"

          },

          "incidence_type": {

            "type": "string",

            "example": "value"

          },

          "incidence_value": {

            "type": "number",

            "example": 10

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          }

        }

      },

      "CouponFull": {

        "type": "object",

        "properties": {

          "client_id": {

            "type": "string",

            "example": "9b470a8f-9b11-493b-afed-f06c4ba6907d"

          },

          "coupon_code": {

            "type": "string",

            "example": "coupon_code"

          },

          "created_at": {

            "type": "number",

            "example": 1699619096

          },

          "date_end": {

            "type": "number",

            "example": 1701388740

          },

          "date_ini": {

            "type": "number",

            "example": 1698796800

          },

          "deletable": {

            "type": "boolean",

            "example": false

          },

          "emails": {

            "type": "array",

            "example": []

          },

          "id": {

            "type": "string",

            "example": "9b470a8f-9b11-493b-afed-f06c4ba6907d"

          },

          "incidence_field": {

            "type": "string",

            "example": "products"

          },

          "incidence_type": {

            "type": "string",

            "example": "value"

          },

          "incidence_value": {

            "type": "number",

            "example": 10

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "maximum_subscription_cycles": {

            "type": "number",

            "example": 3

          },

          "product_ids": {

            "type": "array",

            "example": null

          },

          "updated_at": {

            "type": "number",

            "example": 1707294028

          },

          "usage_contact": {

            "type": "number",

            "example": 0

          },

          "usage_total": {

            "type": "number",

            "example": 0

          }

        }

      },

      "CouponList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Coupon"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "client_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Product Name"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "qty": {

                "type": "number",

                "example": 1

              }

            }

          },

          "marketplace": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "name": {

                "type": "string",

                "example": "Marketplace Name"

              }

            }

          },

          "has_tracking": {

            "type": "number",

            "example": 1

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "payment_type": {

            "type": "string",

            "example": "credit_card"

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "ordered_at": {

            "type": "number",

            "example": 1703151137

          },

          "value": {

            "type": "number",

            "example": "9.99"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# E-tickets

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Etickets",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/etickets"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "Pode pesquisar etickets usando esta ação. Os parametros são passados na url (query string). A ação retorna uma coleção paginada de etickets.\n\nO valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "code",

            "in": "query",

            "required": false,

            "schema": {

              "type": "string",

              "example": "etkt_123456789"

            }

          },

          {

            "name": "contact_id",

            "in": "query",

            "description": "ID do contato (UUID)",

            "schema": {

              "type": "string",

              "format": "uuid"

            }

          },

          {

            "name": "created_at_ini",

            "in": "query",

            "description": "Data de criação inicial (YYYY-MM-DD)",

            "schema": {

              "type": "string",

              "example": "2024-05-28"

            }

          },

          {

            "name": "created_at_end",

            "in": "query",

            "description": "Data de criação final (YYYY-MM-DD)",

            "schema": {

              "type": "string",

              "example": "2024-05-28"

            }

          },

          {

            "name": "email",

            "in": "query",

            "description": "Email do participante",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do participante",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "offer_id",

            "in": "query",

            "description": "Id da Oferta (UUID)",

            "schema": {

              "type": "string",

              "format": "uuid"

            }

          },

          {

            "name": "phone_number",

            "in": "query",

            "description": "Telefone do participante",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "product_id",

            "in": "query",

            "description": "ID do Produto (UUID). Não pode ser usado em conjunto com o parâmetro `products`.",

            "schema": {

              "type": "string",

              "format": "uuid",

              "example": "9ed871e0-397d-476e-87a8-8dde9e2287bf"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs de produtos (UUID). Não pode ser usado em conjunto com o parâmetro `product_id`.",

            "schema": {

              "type": "array",

              "items": {

                "type": "string",

                "format": "uuid"

              },

              "example": [

                "9ed871e0-1a71-4bc5-85d1-b4df300726cd",

                "9ed871e0-6003-4ba7-ab56-4bedaeab94b1"

              ]

            }

          },

          {

            "name": "start_at",

            "in": "query",

            "description": "Data do evento inicial (YYYY-MM-DD)",

            "schema": {

              "type": "string",

              "example": "2024-05-28"

            }

          },

          {

            "name": "end_at",

            "in": "query",

            "description": "Data do evento final (YYYY-MM-DD)",

            "schema": {

              "type": "string",

              "example": "2024-05-28"

            }

          },

          {

            "name": "status",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-etickets\">Lista de status do eticket</a>",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "transaction_id",

            "in": "query",

            "description": "Id da Transação (UUID)",

            "schema": {

              "type": "string",

              "format": "uuid"

            }

          },

          {

            "name": "updated_at_end",

            "in": "query",

            "description": "Data de alteração final (YYYY-MM-DD)",

            "schema": {

              "type": "string",

              "example": "2024-05-28"

            }

          },

          {

            "name": "updated_at_ini",

            "in": "query",

            "description": "Data de alteração inicial (YYYY-MM-DD)",

            "schema": {

              "type": "string",

              "example": "2024-05-28"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/EticketList"

                }

              }

            }

          }

        }

      }

    },

    "/{code}": {

      "get": {

        "summary": "Consultar",

        "description": "Consulta um eticket a partir de seu código.",

        "parameters": [

          {

            "$ref": "#/components/parameters/EticketCode"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Eticket"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Cancelar",

        "description": "Cancelar um etickets.",

        "parameters": [

          {

            "$ref": "#/components/parameters/EticketCode"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "reason": {

                    "type": "string"

                  }

                }

              }

            }

          }

        },

        "responses": {

          "204": {

            "description": "OK"

          }

        }

      }

    },

    "/{code}/check-in": {

      "get": {

        "summary": "Consultar",

        "description": "Check-in - Consultar um eticket a partir de seu código.",

        "parameters": [

          {

            "$ref": "#/components/parameters/EticketCode"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Eticket"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Realizar check-in",

        "description": "Realizar o check-in de um eticket.",

        "parameters": [

          {

            "$ref": "#/components/parameters/EticketCode"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Eticket"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Cancelar check-in",

        "description": "Cancelar o check-in de um eticket.",

        "parameters": [

          {

            "$ref": "#/components/parameters/EticketCode"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Eticket"

                }

              }

            }

          }

        }

      }

    },

    "/{code}/invitations": {

      "post": {

        "summary": "Convidar participante",

        "description": "Enviar convite para o participante.",

        "parameters": [

          {

            "$ref": "#/components/parameters/EticketCode"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "email": {

                    "type": "string"

                  }

                },

                "required": [

                  "email"

                ]

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Eticket"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Cancelar convite",

        "description": "Cancelar o convite.",

        "parameters": [

          {

            "$ref": "#/components/parameters/EticketCode"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Eticket"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "EticketCode": {

        "name": "code",

        "in": "path",

        "description": "Código do eticket",

        "required": true,

        "example": "etkt_123456789",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "EticketList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "type": "object",

              "properties": {

                "code": {

                  "type": "string",

                  "example": "etkt_123456789"

                },

                "custom_fields": {

                  "$ref": "#/components/schemas/CustomFields"

                },

                "email": {

                  "type": "string",

                  "format": "email"

                },

                "id": {

                  "type": "string",

                  "format": "uuid"

                },

                "name": {

                  "type": "string"

                },

                "phone_local_code": {

                  "type": "string",

                  "example": "55"

                },

                "phone_number": {

                  "type": "string"

                },

                "product_name": {

                  "type": "string"

                },

                "start_at": {

                  "type": "integer",

                  "format": "timestamp"

                },

                "status": {

                  "type": "string"

                }

              }

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Eticket": {

        "type": "object",

        "properties": {

          "attendee": {

            "type": "object",

            "description": "Detalhes sobre o participante.",

            "properties": {

              "address_country": {

                "type": "string"

              },

              "custom_fields": {

                "$ref": "#/components/schemas/CustomFields"

              },

              "email": {

                "type": "string"

              },

              "email_is_deliverable": {

                "type": "integer"

              },

              "name": {

                "type": "string"

              },

              "phone_local_code": {

                "type": "string"

              },

              "phone_number": {

                "type": "string"

              }

            }

          },

          "cancel_reason": {

            "type": "string"

          },

          "code": {

            "type": "string"

          },

          "created_at": {

            "type": "integer"

          },

          "id": {

            "type": "string"

          },

          "owner": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string"

              },

              "id": {

                "type": "string"

              },

              "name": {

                "type": "string"

              },

              "phone_local_code": {

                "type": "string"

              },

              "phone_number": {

                "type": "string"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string"

              },

              "image_url": {

                "type": "string",

                "format": "url"

              },

              "marketplace_id": {

                "type": "string"

              },

              "marketplace_name": {

                "type": "string"

              },

              "name": {

                "type": "string"

              },

              "offer": {

                "type": "object",

                "properties": {

                  "id": {

                    "type": "string"

                  },

                  "name": {

                    "type": "string"

                  }

                }

              },

              "event_details": {

                "type": "object",

                "properties": {

                  "address_city": {

                    "type": "string"

                  },

                  "address_comp": {

                    "type": "string"

                  },

                  "address_country": {

                    "type": "string"

                  },

                  "address_district": {

                    "type": "string"

                  },

                  "address_local": {

                    "type": "string"

                  },

                  "address_number": {

                    "type": "string"

                  },

                  "address_state": {

                    "type": "string"

                  },

                  "address_zip_code": {

                    "type": "string"

                  },

                  "address": {

                    "type": "string"

                  },

                  "end_at": {

                    "type": "integer"

                  },

                  "name": {

                    "type": "string"

                  },

                  "start_at": {

                    "type": "integer"

                  },

                  "url": {

                    "type": "string",

                    "format": "url"

                  },

                  "general_conditions": {

                    "type": "string"

                  },

                  "timezone": {

                    "type": "string"

                  },

                  "type": {

                    "type": "string"

                  },

                  "automatic_ticket_assignment": {

                    "type": "integer"

                  },

                  "address_state_full_name": {

                    "type": "string"

                  },

                  "timezone_abbr": {

                    "type": "string"

                  }

                }

              },

              "producer": {

                "type": "object",

                "properties": {

                  "marketplace_id": {

                    "type": "string"

                  },

                  "name": {

                    "type": "string"

                  },

                  "contact_email": {

                    "type": "string"

                  }

                }

              }

            }

          },

          "status": {

            "type": "string"

          },

          "transaction": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string"

              },

              "marketplace_id": {

                "type": "string"

              },

              "marketplace_name": {

                "type": "string"

              },

              "status": {

                "type": "string"

              },

              "payment_method": {

                "type": "string"

              }

            }

          },

          "updated_at": {

            "type": "integer"

          }

        }

      },

      "CustomFields": {

        "type": "array",

        "items": {

          "type": "object",

          "properties": {

            "index": {

              "type": "integer"

            },

            "title": {

              "type": "string"

            },

            "type": {

              "enum": [

                "address",

                "datetime",

                "document",

                "list",

                "number",

                "policy_privacy",

                "switch",

                "text",

                "use_terms"

              ],

              "type": "string"

            },

            "value": {

              "oneOf": [

                {

                  "type": "array"

                },

                {

                  "type": "integer"

                },

                {

                  "type": "string"

                }

              ]

            }

          }

        }

      }

    }

  }

}
```

# Leads

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Leads",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/leads"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string).\n\nÉ necessário filtrar pela data da primeira captura (`created_at`) ou pela data da última captura (`last_tracked_at`).\n\nA diferença máxima entre a data inicial e a data final é de 365 dias.\n\nSempre que um email é pesquisado, todos os demais filtros são descartados.\n\nO valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "contact_option",

            "in": "query",

            "description": "Opção de Contato (all, with ou without)",

            "example": "all",

            "schema": {

              "type": "string",

              "enum": [

                "all",

                "with",

                "without"

              ]

            }

          },

          {

            "name": "created_at_end",

            "in": "query",

            "description": "Data final primeira captura (YYYY-MM-DD)",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "created_at_ini",

            "in": "query",

            "description": "Data inicial primeira captura (YYYY-MM-DD)",

            "example": "2023-12-31",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "cursor",

            "in": "query",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "email",

            "in": "query",

            "description": "E-mail do lead",

            "example": "user@example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "last_tracked_at_end",

            "in": "query",

            "description": "Data final última captura (YYYY-MM-DD)",

            "example": "2023-12-31",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "last_tracked_at_ini",

            "in": "query",

            "description": "Data incial última captura (YYYY-MM-DD)",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "last_tracking_name",

            "in": "query",

            "description": "Nome rastreamento última captura",

            "example": "Nome",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "tracking_name",

            "in": "query",

            "description": "Nome rastreamento primeira captura",

            "example": "Nome",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/LeadList"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      }

    },

    "schemas": {

      "Lead": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "8cf22d00-4af5-431a-9f68-947f6e416bea"

          },

          "email": {

            "type": "string",

            "example": "email@test.com"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "8bffa604-69be-445c-bf92-4fcb4de82109"

              },

              "name": {

                "type": "string",

                "example": "Nome do Contato"

              }

            },

            "nullable": true

          },

          "first_tracking": {

            "type": "object",

            "properties": {

              "date": {

                "type": "number",

                "example": 1549721249

              },

              "id": {

                "type": "string",

                "example": "8bfd01ad-2b91-423f-8369-f414baab7552"

              },

              "name": {

                "type": "string",

                "example": "Teste"

              },

              "publisher": {

                "type": "string",

                "example": "form"

              },

              "type": {

                "type": "string"

              },

              "utm_campaign": {

                "type": "string",

                "example": ""

              },

              "utm_content": {

                "type": "string",

                "example": ""

              },

              "utm_medium": {

                "type": "string",

                "example": ""

              },

              "utm_term": {

                "type": "string",

                "example": ""

              }

            }

          },

          "last_tracking": {

            "type": "object",

            "properties": {

              "date": {

                "type": "number",

                "example": 1549721250

              },

              "id": {

                "type": "string",

                "example": "8bfd01ad-2b91-423f-8369-f414baab7552"

              },

              "name": {

                "type": "string",

                "example": "Teste"

              },

              "publisher": {

                "type": "string",

                "example": ""

              },

              "type": {

                "type": "string",

                "example": "form"

              },

              "utm_campaign": {

                "type": "string",

                "example": ""

              },

              "utm_content": {

                "type": "string",

                "example": ""

              },

              "utm_medium": {

                "type": "string",

                "example": ""

              },

              "utm_term": {

                "type": "string",

                "example": ""

              }

            }

          }

        }

      },

      "LeadList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Lead"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      }

    }

  }

}
```

# My Orders

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "MyOrders",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/myorders"

    }

  ],

  "paths": {

    "/auth/sso/{email}": {

      "post": {

        "summary": "Autenticação Única (SSO)",

        "description": "Endpoint para gerar um token de autenticação para que seus compradores entrem automaticamente no ambiente do MyOrders.\n\nApós gerar o token, encaminhe o usuário para a url https://digitalmanager.guru/myorders/sso/{token}.\n\nO campo <b>expires_in</b> tem como valor default **10 minutos**.",

        "parameters": [

          {

            "name": "Authorization",

            "in": "header",

            "description": "e.g. Bearer {user_token}",

            "required": true,

            "schema": {

              "type": "string"

            },

            "example": "Bearer {user_token}"

          },

          {

            "name": "Accept",

            "in": "header",

            "description": "e.g. application/json",

            "required": false,

            "schema": {

              "type": "string"

            },

            "example": "application/json"

          },

          {

            "name": "email",

            "in": "path",

            "description": "Email do Cliente",

            "required": true,

            "example": "cliente@email.com",

            "schema": {

              "type": "string"

            }

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "expires_in": {

                    "type": "integer",

                    "description": "Tempo de validade do token em minutos",

                    "default": 10,

                    "minimum": 10,

                    "maximum": 1440

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "email": {

                      "type": "string",

                      "example": "teste@email.com"

                    },

                    "expires_at": {

                      "type": "number",

                      "example": 1625513714

                    },

                    "redirect_url": {

                      "type": "string",

                      "example": "https://digitalmanager.guru/myorders/sso/eyJpdiI6IkpYYlZaZnFTdS9DQ3V4V1ZQVE95Umc9PSIsInZhbHVlIjoiWDVYRUZDUXBPYXdyVXcvMVpvNmVIZ3NLdUlmaCsyMHlPU2RlQmc2VTE2RG50Qml2NmZndHNzUVdmYWJuNUw3S3lVMm1BRDRCSDBEcElCWTNmaVQ3bmFHQ3ZoN3lsVzFONnNWWWYzdlpGeG89IiwibWFjIjoiNTlkYjBkYWU3YmZjOTc1YWU2NjBlNmFhMDZlYzQ5ZGU5NmE4NjgwNzQ4Yjk4ZmVlNDI0MDcxNjI0ZWNmNDg3ZCJ9"

                    },

                    "token": {

                      "type": "string",

                      "example": "eyJpdiI6IkpYYlZaZnFTdS9DQ3V4V1ZQVE95Umc9PSIsInZhbHVlIjoiWDVYRUZDUXBPYXdyVXcvMVpvNmVIZ3NLdUlmaCsyMHlPU2RlQmc2VTE2RG50Qml2NmZndHNzUVdmYWJuNUw3S3lVMm1BRDRCSDBEcElCWTNmaVQ3bmFHQ3ZoN3lsVzFONnNWWWYzdlpGeG89IiwibWFjIjoiNTlkYjBkYWU3YmZjOTc1YWU2NjBlNmFhMDZlYzQ5ZGU5NmE4NjgwNzQ4Yjk4ZmVlNDI0MDcxNjI0ZWNmNDg3ZCJ9"

                    }

                  }

                }

              }

            }

          }

        }

      }

    }

  }

}
```

# Products

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Products",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/products"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "Pode pesquisar produtos usando esta ação. Os parametros são passados na url (query string). A ação retorna uma coleção paginada de produtos. O valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "cursor",

            "in": "query",

            "example": "eyJpc19oaWRkZW4iOmZhbHNlLCJuYW1lIjoiUHJvZHV0byBQYWdhck1lICsgUmV2b2x1dCIsImlkIjoiOWM4NmYzMzUtYjI4Ny00NWUwLWI5ZjctNjc0MGZkOWI5YjM5IiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "is_hidden",

            "in": "query",

            "description": "Está oculto",

            "example": 0,

            "schema": {

              "type": "number",

              "enum": [

                0,

                1

              ]

            }

          },

          {

            "name": "is_trackable",

            "in": "query",

            "description": "Pode ser usado em rastreamentos",

            "example": 0,

            "schema": {

              "type": "number",

              "enum": [

                0,

                1

              ]

            }

          },

          {

            "name": "marketplace_id",

            "in": "query",

            "description": "Código do Marketplace",

            "example": 123456,

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "markteplaces",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Nome do Marketplace",

            "example": "pagarme",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do Produto",

            "example": "Nome do Produto",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "type",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-produto\">Tipo do Produto</a>",

            "example": "product",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/ProductList"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}": {

      "get": {

        "summary": "Consultar",

        "description": "Pode consultar um produto.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Product"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/checkout-options/appearance": {

      "get": {

        "summary": "Opções de checkout - Produto - Aparência",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsAppearance"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/checkout-options/content": {

      "get": {

        "summary": "Opções de checkout - Produto - Conteúdo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsContent"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/checkout-options/emails": {

      "get": {

        "summary": "Opções de checkout - Produto - Emails",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsEmails"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/checkout-options/order-bump": {

      "get": {

        "summary": "Opções de checkout - Produto - Order Bump",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsOrderBump"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/checkout-options/pixels": {

      "get": {

        "summary": "Opções de checkout - Produto - Pixels",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsPixels"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/checkout-options/redirects": {

      "get": {

        "summary": "Opções de checkout - Produto - Redirecionamento",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsRedirect"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers": {

      "get": {

        "summary": "Listar ofertas",

        "description": "Pode listar as ofertas de um produto usando esta ação. A ação retorna uma coleção paginada de ofertas.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "name": "cursor",

            "in": "query",

            "example": "eyJuYW1lIjoib2ZmZXIgbmFtZSIsImlkIjoiZDY2YmUwZWEtZmE2My00YzljLTk1YWUtNWRkMjc5ZWU1MDI0IiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ==",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/OfferList"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}": {

      "get": {

        "summary": "Consultar",

        "description": "Pode consultar um produto.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Offer"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}/availability": {

      "patch": {

        "summary": "Ativar/Desativar Ofertas",

        "description": "Pode ativar/desativar uma oferta.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "is_active": {

                    "type": "number",

                    "example": 1,

                    "enum": [

                      0,

                      1

                    ]

                  }

                },

                "required": [

                  "is_active"

                ]

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "id": {

                      "type": "string",

                      "example": "8f3bc6fd-64c9-4b2d-b067-9e9f96f870be"

                    },

                    "is_active": {

                      "type": "number",

                      "example": 1

                    },

                    "name": {

                      "type": "string",

                      "example": "Bluetooth Smart Watch men Q18 » Black / Box and 8G TF Card"

                    },

                    "product_id": {

                      "type": "string",

                      "example": "8f3bc6fd-638d-4de8-82e0-690a5b38acda"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}/checkout-options/appearance": {

      "get": {

        "summary": "Opções de checkout - Oferta - Aparência",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsAppearance"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}/checkout-options/content": {

      "get": {

        "summary": "Opções de checkout - Oferta - Conteúdo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsContent"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}/checkout-options/emails": {

      "get": {

        "summary": "Opções de checkout - Oferta - Emails",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsEmails"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}/checkout-options/order-bump": {

      "get": {

        "summary": "Opções de checkout - Oferta - Order Bump",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsOrderBump"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}/checkout-options/pixels": {

      "get": {

        "summary": "Opções de checkout - Oferta - Pixels",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsPixels"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}/checkout-options/redirects": {

      "get": {

        "summary": "Opções de checkout - Oferta - Redirecionamento",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/CheckoutOptionsRedirect"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/offers/{offer_id}/subscription-options": {

      "get": {

        "summary": "Opções de subscrição - Oferta",

        "description": "Obter opções de subscrição de uma oferta",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          },

          {

            "$ref": "#/components/parameters/OfferId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/SubscriptionOptions"

                }

              }

            }

          }

        }

      }

    },

    "/{product_id}/subscription-options": {

      "get": {

        "summary": "Opções de subscrição - Produto",

        "description": "Obter opções de subscrição de um produto",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/ProductId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/SubscriptionOptions"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "ProductId": {

        "name": "product_id",

        "in": "path",

        "description": "ID do produto",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "OfferId": {

        "name": "offer_id",

        "in": "path",

        "description": "ID da oferta",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      }

    },

    "schemas": {

      "Product": {

        "type": "object",

        "properties": {

          "created_at": {

            "type": "number",

            "example": 1629485709

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "97c2b6b4-ce32-4782-8361-97fe454ac414"

              },

              "name": {

                "type": "string",

                "example": "grupo de teste"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "94336bb0-5ed6-492a-a2e2-7ff9d9c6c498"

          },

          "is_deletable": {

            "type": "number",

            "example": "0,"

          },

          "is_hidden": {

            "type": "number",

            "example": 0

          },

          "is_trackable": {

            "type": "number",

            "example": 0

          },

          "marketplace_id": {

            "type": "string",

            "example": "1629485684"

          },

          "marketplace_name": {

            "type": "string",

            "example": "adyen"

          },

          "name": {

            "type": "string",

            "example": "teste adien"

          },

          "producer": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "8bc4c8c3-fee8-4ece-9f7c-c0eff2923149"

              },

              "name": {

                "type": "string",

                "example": "(Nome Da Minha Empresa)"

              }

            }

          },

          "type": {

            "type": "string",

            "example": "product"

          },

          "updated_at": {

            "type": "number",

            "example": 1659121224

          }

        }

      },

      "ProductList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Product"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJpc19oaWRkZW4iOmZhbHNlLCJuYW1lIjoiUHJvZHV0byBQYWdhck1lICsgUmV2b2x1dCIsImlkIjoiOWM4NmYzMzUtYjI4Ny00NWUwLWI5ZjctNjc0MGZkOWI5YjM5IiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Offer": {

        "type": "object",

        "properties": {

          "cash_discount": {

            "type": "number",

            "example": 0

          },

          "checkout_url": {

            "type": "string",

            "example": "https://clkdmg.site/subscribe/galaxpay-assinatura-de-testes-com-trial"

          },

          "created_at": {

            "type": "number",

            "example": 1646759411

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "friendly_url": {

            "type": "string",

            "example": "galaxpay-assinatura-de-testes-com-trial"

          },

          "id": {

            "type": "string",

            "example": "95c59af9-bd90-4970-bfef-3a060de8c53e"

          },

          "installments": {

            "type": "object",

            "properties": {

              "automatic": {

                "type": "number",

                "example": 0

              },

              "default": {

                "type": "number",

                "example": 1

              },

              "interest_rate": {

                "type": "number",

                "example": 0

              },

              "max_with_interest": {

                "type": "number",

                "example": 1

              },

              "max_without_interest": {

                "type": "number",

                "example": 1

              }

            }

          },

          "is_active": {

            "type": "number",

            "example": 1

          },

          "is_deletable": {

            "type": "number",

            "example": 0

          },

          "name": {

            "type": "string",

            "example": "galaxpay assinatura de testes com trial"

          },

          "payment_types": {

            "type": "array",

            "items": {

              "type": "string",

              "example": [

                "credit_card",

                "billet",

                "pix"

              ]

            }

          },

          "plan": {

            "type": "object",

            "properties": {

              "cycles": {

                "type": "number",

                "example": 0

              },

              "discount": {

                "type": "object",

                "properties": {

                  "value": {

                    "type": "number",

                    "example": 0

                  },

                  "cycles": {

                    "type": "number",

                    "example": 0

                  }

                }

              },

              "increment": {

                "type": "object",

                "properties": {

                  "value": {

                    "type": "number",

                    "example": 0

                  },

                  "cycles": {

                    "type": "number",

                    "example": 0

                  }

                }

              },

              "interval": {

                "type": "number",

                "example": 1

              },

              "interval_type": {

                "type": "string",

                "example": "month"

              },

              "provider": {

                "type": "string",

                "example": "guru"

              },

              "split_cycles": {

                "type": "number",

                "example": 0

              },

              "trial_days": {

                "type": "number",

                "example": 0

              }

            }

          },

          "units_per_sale": {

            "type": "number",

            "example": 1

          },

          "shipment": {

            "type": "object",

            "properties": {

              "is_fixed": {

                "type": "number",

                "example": 1

              },

              "dimensions": {

                "type": "object",

                "properties": {

                  "height": {

                    "type": "number",

                    "example": 0

                  },

                  "width": {

                    "type": "number",

                    "example": 0

                  },

                  "length": {

                    "type": "number",

                    "example": 0

                  },

                  "weight": {

                    "type": "number",

                    "example": 0

                  }

                }

              },

              "default": {

                "type": "object",

                "properties": {

                  "carrier": {

                    "nullable": true,

                    "type": "string",

                    "example": null

                  },

                  "shipping": {

                    "type": "object",

                    "properties": {

                      "type": {

                        "type": "string",

                        "example": "fixed"

                      },

                      "name": {

                        "type": "string",

                        "example": "Standard"

                      },

                      "value": {

                        "type": "number",

                        "example": 0

                      }

                    }

                  },

                  "companies": {

                    "nullable": true,

                    "type": "string",

                    "example": null

                  }

                }

              },

              "one_click": {

                "type": "object",

                "properties": {

                  "carrier": {

                    "nullable": true,

                    "type": "string",

                    "example": null

                  },

                  "shipping": {

                    "type": "object",

                    "properties": {

                      "type": {

                        "type": "string",

                        "example": "fixed"

                      },

                      "name": {

                        "type": "string",

                        "example": "Standard"

                      },

                      "value": {

                        "type": "number",

                        "example": 0

                      }

                    }

                  },

                  "companies": {

                    "nullable": true,

                    "type": "string",

                    "example": null

                  }

                }

              }

            }

          },

          "updated_at": {

            "type": "number",

            "example": 1659292448

          },

          "value": {

            "type": "number",

            "example": 97

          }

        }

      },

      "OfferList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Offer"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoib2ZmZXIgbmFtZSIsImlkIjoiZDY2YmUwZWEtZmE2My00YzljLTk1YWUtNWRkMjc5ZWU1MDI0IiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ=="

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "SubscriptionOptions": {

        "type": "object",

        "properties": {

          "checkout_show_automatically": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "checkout_show_increment_and_discount": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "checkout_show_interval": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "checkout_show_total_cycles": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "contact_can_cancel": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "contact_can_change_payment_type": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "contact_can_change_plan": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "upgrade_plan_method": {

            "type": "string",

            "enum": [

              "total",

              "prorata",

              "next_cycle",

              "plans_value_diff"

            ],

            "example": "prorata"

          },

          "days_until_reprocess": {

            "type": "number",

            "enum": [

              2,

              3,

              4

            ],

            "example": 3

          },

          "send_transactional_emails": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_active": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_automatic_renewal": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_renewed": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_canceled": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_card_expiration": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_pastdue": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_trial": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "should_expire_after_max_tries": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "should_send_pixel_events": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "track_lead_cycle": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "tracking_id": {

            "type": "string",

            "example": "9a2f5da6-f1d1-4949-b831-d568dafb400d"

          },

          "trial_days": {

            "type": "number",

            "example": 0

          },

          "tries_before_expire": {

            "type": "number",

            "example": 3

          },

          "split_cycles": {

            "type": "number",

            "example": 0

          }

        }

      },

      "CheckoutOptionsAppearance": {

        "type": "object",

        "properties": {

          "colors": {

            "type": "string",

            "example": "#EDF0FC,#B2C3F9,#F8F9FE,#8470F2,#AAAEB3,#C0382B,#F39C19,#FFFFFF,#8470F2,#96A3BD,#8470F2,#1DC4E9,#FFFFFF,#FFFFFF,#777777,#FFBA47,#FA5D5D,#8BC34A,#AAAEB3,#8470F2,#1DC4E9,#8470F2,#1DC4E9,#8470F2,#FFFFFF,#F9F9F9,#777777,#777777,#FFFFFF,#777777"

          },

          "font_family": {

            "type": "string",

            "example": "Inter, sans serif"

          },

          "convert_currency_value": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "expand_header": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "has_company_name": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "has_double_address_validation": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "has_double_email_validation": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "has_recaptcha_validation": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "hide_document_if_possible": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "hide_secure_payment": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "hide_shipping_cost": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "highlight_installments": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "installments_option": {

            "type": "string",

            "enum": [

              "none",

              "selected",

              "max"

            ],

            "example": "none"

          },

          "size_option": {

            "type": "string",

            "enum": [

              "small",

              "medium",

              "large"

            ],

            "example": "none"

          },

          "position_option": {

            "type": "string",

            "enum": [

              "top",

              "bottom",

              "both"

            ],

            "example": "none"

          },

          "redirect_if_not_approved": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "company_name_required": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "show_coupon": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "show_value_with_interest": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "show_generic_interest_rate": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "version": {

            "type": "string",

            "enum": [

              "v5",

              "v5b"

            ],

            "example": "v5b"

          },

          "has_tax_included": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "has_tax_calculation": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "process_without_address": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "can_process_without_address": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "has_settings_hash": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          }

        }

      },

      "CheckoutOptionsContent": {

        "type": "object",

        "properties": {

          "favicon_url": {

            "type": "string",

            "example": "https://example.com/example.png"

          },

          "image_url": {

            "type": "string",

            "example": "https://example.com/example.png"

          },

          "name": {

            "type": "string",

            "example": "Nome da Loja"

          },

          "email": {

            "type": "string",

            "example": "user@example.com"

          },

          "whatsapp": {

            "type": "object",

            "properties": {

              "local_code": {

                "type": "string",

                "example": "351"

              },

              "number": {

                "type": "string",

                "example": "919999999"

              }

            }

          },

          "telegram_username": {

            "type": "string",

            "example": "username"

          },

          "privacy_policy_url": {

            "type": "string",

            "example": "https://example.com/privacy.html"

          },

          "terms_url": {

            "type": "string",

            "example": "https://example.com/terms.html"

          },

          "disclaimer": {

            "type": "string",

            "example": null

          },

          "billet_days": {

            "type": "number",

            "example": 3

          },

          "pix_days": {

            "type": "number",

            "example": 3

          },

          "soft_descriptor": {

            "type": "string",

            "example": "soft_descriptor"

          }

        }

      },

      "CheckoutOptionsEmails": {

        "type": "object",

        "properties": {

          "send_transactional_emails": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_abandoned": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_approved": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_billet_printed": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_canceled": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "send_transactional_emails_expired": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "send_transactional_emails_pending": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "send_transactional_emails_refunded": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          }

        }

      },

      "CheckoutOptionsOrderBump": {

        "type": "object",

        "properties": {

          "credit_card_only": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "max_offers": {

            "type": "number",

            "example": 2

          },

          "should_add_value_to_total": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "show_order_bump_installments": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "sub_title": {

            "type": "string",

            "example": "Sub Title"

          },

          "title": {

            "type": "string",

            "example": "Title"

          }

        }

      },

      "CheckoutOptionsPixels": {

        "type": "object",

        "properties": {

          "google_analytics": {

            "type": "string"

          },

          "facebook_pixel": {

            "type": "string"

          },

          "facebook_pixels": {

            "type": "array",

            "items": {

              "type": "string"

            }

          },

          "google_ads_account": {

            "type": "string"

          },

          "google_ads_conversion": {

            "type": "string"

          },

          "propeller_ads_conversion": {

            "type": "number"

          },

          "google_tag_manager": {

            "type": "string"

          },

          "purchase_pixel_for_pending": {

            "type": "number",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "pending_value_rate": {

            "type": "number",

            "example": 50

          }

        }

      },

      "CheckoutOptionsRedirect": {

        "type": "object",

        "properties": {

          "baloto_url": {

            "type": "string"

          },

          "canceled_url": {

            "type": "string"

          },

          "confirmation_url": {

            "type": "string"

          },

          "efecty_url": {

            "type": "string"

          },

          "multibanco_url": {

            "type": "string"

          },

          "multicaja_url": {

            "type": "string"

          },

          "offline_payment_url": {

            "type": "string"

          },

          "offline_url": {

            "type": "string"

          },

          "oxxo_pay_url": {

            "type": "string"

          },

          "oxxo_url": {

            "type": "string"

          },

          "pagoefectivo_url": {

            "type": "string"

          },

          "paycash_url": {

            "type": "string"

          },

          "pix_url": {

            "type": "string"

          },

          "safetypay_url": {

            "type": "string"

          },

          "sencilito_url": {

            "type": "string"

          },

          "servipag_url": {

            "type": "string"

          },

          "spei_url": {

            "type": "string"

          },

          "trial_url": {

            "type": "string"

          },

          "webpay_url": {

            "type": "string"

          }

        }

      }

    }

  }

}
```

# Subscriptions

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "Subscriptions",
    "version": "2.0.0"
  },
  "servers": [
    {
      "url": "https://digitalmanager.guru/api/v2/subscriptions"
    }
  ],
  "paths": {
    "/": {
      "get": {
        "summary": "Pesquisar",
        "description": "Os parametros são passados na url (query string). O valor `total_rows` é apenas apresentado na primeira página.\n\nO periodo entre datas (cancelled_at, last_status_at, next_cycle_at, started_at e trial_finished_at) não poderá ser maior que 180 dias.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "name": "cancel_at_cycle_end",
            "in": "query",
            "description": "Cancelar ao final do ciclo",
            "schema": {
              "type": "number",
              "enum": [
                0,
                1
              ]
            },
            "example": 1
          },
          {
            "name": "cancelled_at_ini",
            "in": "query",
            "description": "Data de cancelamento inicial",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "cancelled_at_end",
            "in": "query",
            "description": "Data de cancelamento final",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "charged_times_ini",
            "in": "query",
            "description": "Quantidade de cobranças inicial",
            "schema": {
              "type": "number"
            },
            "example": 1
          },
          {
            "name": "charged_times_end",
            "in": "query",
            "description": "Quantidade de cobranças final",
            "schema": {
              "type": "number"
            },
            "example": 2
          },
          {
            "name": "contact_id",
            "in": "query",
            "description": "ID do contato",
            "schema": {
              "type": "string"
            },
            "example": "853bb3a3-2067-421e-8be9-7d916090e9ab"
          },
          {
            "name": "contact_doc",
            "in": "query",
            "description": "Documento do contato",
            "schema": {
              "type": "string"
            },
            "example": "contact_doc"
          },
          {
            "name": "contact_email",
            "in": "query",
            "description": "Email do contato",
            "schema": {
              "type": "string"
            },
            "example": "user@example.com"
          },
          {
            "name": "contact_name",
            "in": "query",
            "description": "Nome do contato",
            "schema": {
              "type": "string"
            },
            "example": "contact_name"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          },
          {
            "name": "last_status_at_ini",
            "in": "query",
            "description": "Data de status inicial",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "last_status_at_end",
            "in": "query",
            "description": "Data de status final",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "next_cycle_at_ini",
            "in": "query",
            "description": "Data próximo ciclo inicial",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "next_cycle_at_end",
            "in": "query",
            "description": "Data próximo ciclo final",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "product_id",
            "in": "query",
            "description": "Id do produto",
            "schema": {
              "type": "string"
            },
            "example": "d31f5df5-62ab-45be-b03f-62b03db98c64"
          },
          {
            "name": "started_at_ini",
            "in": "query",
            "example": "YYYY-MM-DD",
            "schema": {
              "type": "string"
            },
            "description": "Data de início inicial"
          },
          {
            "name": "started_at_end",
            "in": "query",
            "example": "YYYY-MM-DD",
            "schema": {
              "type": "string"
            },
            "description": "Data de início final"
          },
          {
            "name": "subscription_code",
            "in": "query",
            "description": "Código da assinatura",
            "schema": {
              "type": "string"
            },
            "example": "subscription_code"
          },
          {
            "name": "subscription_status",
            "in": "query",
            "style": "form",
            "explode": true,
            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-assinaturas\">Lista de status de assinatura</a>",
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "example": [
              "active",
              "canceled"
            ]
          },
          {
            "name": "trial_finished_at_ini",
            "in": "query",
            "description": "Data de fim trial inicial",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "trial_finished_at_end",
            "in": "query",
            "description": "Data de fim trial final",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "trial_started_at_ini",
            "in": "query",
            "description": "Data de início trial inicial",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          },
          {
            "name": "trial_started_at_end",
            "in": "query",
            "description": "Data de início trial final",
            "schema": {
              "type": "string"
            },
            "example": "YYYY-MM-DD"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SubscriptionList"
                }
              }
            }
          }
        }
      }
    },
    "/{id}": {
      "get": {
        "summary": "Consultar",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SubscriptionFull"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/activities": {
      "get": {
        "summary": "Atividades",
        "description": "Consulta as atividades de uma transação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          },
          {
            "name": "created_at_ini",
            "in": "query",
            "description": "Data inicial do período (formato YYYY-MM-DD). Obrigatória quando `created_at_end` é informada e deve ser menor ou igual a ela. O período máximo entre as datas é de 365 dias. Se nenhuma data for informada, retorna os últimos 6 meses.",
            "example": "2024-01-01",
            "schema": {
              "type": "string",
              "format": "date"
            }
          },
          {
            "name": "created_at_end",
            "in": "query",
            "description": "Data final do período (formato YYYY-MM-DD). Obrigatória quando `created_at_ini` é informada e deve ser maior ou igual a ela. O período máximo entre as datas é de 365 dias.",
            "example": "2024-06-30",
            "schema": {
              "type": "string",
              "format": "date"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ActivityList"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/cancel": {
      "post": {
        "summary": "Cancelar",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "cancel_at_cycle_end": {
                    "type": "boolean",
                    "example": true
                  },
                  "comment": {
                    "type": "string",
                    "example": "comment"
                  }
                },
                "required": [
                  "cancel_at_cycle_end",
                  "comment"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    },
                    "type": {
                      "type": "string",
                      "example": "subscription_send_to_be_cancelled",
                      "enum": [
                        "subscription_send_to_be_cancelled",
                        "subscription_marked_to_be_cancelled",
                        "subscription_canceled"
                      ]
                    }
                  }
                }
              }
            }
          },
          "403": {
            "description": "Assinatura não pode ser cancelada"
          }
        }
      }
    },
    "/{id}/cancel-at-cycle-end": {
      "delete": {
        "summary": "Reverter Cancelamento ao Final do Ciclo",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.\n\nValidações:\n\n- deve estar ativa\n\n- deve rodar no motor do guru\n\n- não pode estar em processo de cobrança\n\n- deve estar marcada para cancelar ao final do ciclo\n\n- data do próximo ciclo deve ser maior que a data atual mais 5 dias",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/coupons": {
      "post": {
        "summary": "Adicionar cupom à assinatura",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "coupon_code": {
                    "type": "string",
                    "example": "coupon_code"
                  }
                },
                "required": [
                  "coupon_code"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "coupon_code": {
                      "type": "string",
                      "example": "coupon_code"
                    },
                    "incidence_field": {
                      "type": "string",
                      "example": "total",
                      "enum": [
                        "products",
                        "shipping",
                        "total"
                      ]
                    },
                    "incidence_type": {
                      "type": "string",
                      "example": "percent",
                      "enum": [
                        "value",
                        "percent"
                      ]
                    },
                    "incidence_value": {
                      "type": "number",
                      "example": 15.6
                    },
                    "maximum_subscription_cycles": {
                      "type": "number",
                      "example": 5
                    },
                    "status": {
                      "type": "string",
                      "example": "success",
                      "enum": [
                        "success"
                      ]
                    }
                  }
                }
              }
            }
          },
          "403": {
            "description": "Não é possível adicionar cupom a esta assinatura."
          }
        }
      },
      "delete": {
        "summary": "Remover cupom da assinatura",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "coupon_code": {
                    "type": "string",
                    "example": "coupon_code"
                  }
                },
                "required": [
                  "coupon_code"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success",
                      "enum": [
                        "success"
                      ]
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Não é possível remover cupom desta assinatura."
          }
        }
      }
    },
    "/{id}/current-offer": {
      "put": {
        "summary": "Alterar Oferta Atual e de Renovação",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.\n\nValidações:\n\n- deve estar ativa\n\n- deve rodar no motor do guru\n\n- não pode estar em processo de cobrança\n\n- não pode estar marcada para cancelar ao final do ciclo\n\n- nova oferta deve ser diferente da oferta atual\n\n- oferta atual deve ser igual à oferta de renovação\n\n- nova oferta deve ser do motor do guru\n\n- nova oferta deve pertencer a um produto do tipo assinatura\n\n- marketplace da nova oferta deve ser igual ao marketplace da oferta atual",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "force_next_offer": {
                    "type": "number",
                    "description": "Força alteração da oferta de renovação (0 ou 1)",
                    "enum": [
                      0,
                      1
                    ],
                    "example": 1
                  },
                  "new_offer_id": {
                    "type": "string",
                    "description": "ID da oferta (uuid)",
                    "example": "9333ee25-42ad-4446-b0d5-8eccb7a6329e"
                  }
                },
                "required": [
                  "force_next_offer",
                  "new_offer_id"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/cycle-end-date": {
      "put": {
        "summary": "Alterar Data de Final do Ciclo",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.\n\nValidações:\n\n- deve estar ativa\n\n- deve rodar no motor do guru\n\n- não pode estar em processo de cobrança\n\n- não pode estar marcada para cancelar ao final do ciclo\n\n- nova data deve ser maior que a data atual mais 5 dias",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "new_end_date": {
                    "type": "string",
                    "description": "Nova Data (YYYY-MM-DD)",
                    "example": "2024-01-31"
                  }
                },
                "required": [
                  "new_end_date"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/invoices": {
      "get": {
        "summary": "Listar Faturas",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/InvoiceList"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/invoices/{invoice_code}": {
      "get": {
        "summary": "Consultar Fatura",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          },
          {
            "name": "invoice_code",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "example": "invoice_code"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Invoice"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/invoices/{invoice_code}/transactions": {
      "get": {
        "summary": "Listar Transações da Fatura",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          },
          {
            "name": "invoice_code",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "example": "invoice_code"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TransactionList"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/next-offer": {
      "put": {
        "summary": "Alterar Oferta de Renovação",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.\n\nValidações:\n\n- deve estar ativa\n\n- deve rodar no motor do guru\n\n- não pode estar em processo de cobrança\n\n- não pode estar marcada para cancelar ao final do ciclo\n\n- nova oferta de renovação deve ser diferente da oferta de renovação atual\n\n- nova oferta de renovação deve ser do motor do guru\n\n- nova oferta de renovação deve pertencer a um produto do tipo assinatura\n\n- marketplace da nova oferta de renovação deve ser igual ao marketplace da oferta de renovação atual",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "new_offer_id": {
                    "type": "string",
                    "description": "ID da oferta (uuid)",
                    "example": "9333ee25-42ad-4446-b0d5-8eccb7a6329e"
                  }
                },
                "required": [
                  "new_offer_id"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success",
                      "enum": [
                        "success"
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/payment-types": {
      "get": {
        "summary": "Listar Formas de Pagamento",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "example": [
                    "credit_card",
                    "billet",
                    "pix"
                  ]
                }
              }
            }
          }
        }
      },
      "put": {
        "summary": "Alterar Forma de Pagamento",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.\n\n**Formas de enviar dados do cartão (mutuamente exclusivas):**\n\n1. **Via token** (`card_token`) — recomendado para integrações via browser. Gere o token com o script `card-token.js` e envie apenas o `card_token`.  Não é necessário PCI comprovado.\n2. **Via campos brutos** (`card_number`, `card_cvv`, etc.) — somente clientes com PCI comprovado podem utilizar esta forma.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "payment_type": {
                    "type": "string",
                    "description": "Chave Forma de Pagamento"
                  },
                  "comment": {
                    "type": "string",
                    "description": "Comentário (máx 255)"
                  },
                  "card_token": {
                    "type": "string",
                    "description": "Token de cartão gerado via POST /api/v2/checkout/card-token. Quando informado, os campos de cartão bruto (card_number, card_cvv, etc.) são ignorados e a validação PCI é dispensada.",
                    "example": "eyJpdiI6Ii4uLiIsInZhbHVlIjoiLi4uIn0="
                  },
                  "card_number": {
                    "type": "string",
                    "description": "Número do Cartão de Crédito (requer PCI comprovado)"
                  },
                  "card_holder_name": {
                    "type": "string",
                    "description": "Portador do Cartão de Crédito"
                  },
                  "card_expiration_month": {
                    "type": "string",
                    "description": "Mês de Vencimento do Cartão de Crédito"
                  },
                  "card_expiration_year": {
                    "type": "string",
                    "description": "Ano de Vencimento do Cartão de Crédito"
                  },
                  "card_brand": {
                    "type": "string",
                    "description": "Bandeira do Cartão de Crédito"
                  },
                  "card_cvv": {
                    "type": "string",
                    "description": "Código de Verificação do Cartão de Crédito (requer PCI comprovado)"
                  },
                  "installment": {
                    "type": "string",
                    "description": "Quantidade de Parcelas"
                  }
                },
                "required": [
                  "payment_type",
                  "comment"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "headers": {},
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/increment-discount": {
      "put": {
        "summary": "Alterar o incremento / desconto da assinatura",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.\nValidações:\n- deve estar ativa  \n- deve rodar no motor do guru  \n- não pode estar em processo de cobrança  \n- não deve estar marcada para cancelar ao final do ciclo\n- os parametros 'cycle' e 'value' (do incremento ou desconto) devem ser definidos em conjunto",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/IncrementDiscount"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/IncrementDiscount"
                }
              }
            }
          },
          "422": {
            "description": "Não é possível alterar o incremento / desconto desta assinatura."
          }
        }
      },
      "delete": {
        "summary": "Remover alteração de incremento / desconto da assinatura",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.\nValidações:\n- deve estar ativa  \n- deve rodar no motor do guru  \n- não pode estar em processo de cobrança  \n- não deve estar marcada para cancelar ao final do ciclo",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "responses": {
          "204": {
            "description": "No content"
          },
          "422": {
            "description": "Não é possível remover o incremento / desconto desta assinatura."
          }
        }
      }
    },
    "/{id}/installment": {
      "put": {
        "summary": "Alterar Parcelamento da Assinatura",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "installment": {
                    "type": "integer",
                    "description": "Quantidade de Parcelas",
                    "example": 1
                  }
                },
                "required": [
                  "installment"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "headers": {},
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/plans": {
      "put": {
        "summary": "Executar Downgrade / Upgrade",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "offer_id": {
                    "type": "string",
                    "description": "Id da oferta (uuid)",
                    "example": "9333ee25-42ad-4446-b0d5-8eccb7a6329e"
                  }
                },
                "required": [
                  "offer_id"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "approved",
                      "enum": [
                        "analysis",
                        "approved",
                        "billet_printed",
                        "canceled",
                        "scheduled",
                        "waiting_payment"
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/plans/available": {
      "get": {
        "summary": "Listar Opções para Downgrade e Upgrade",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "headers": {},
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "upgrade": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "charge_every_days": {
                            "type": "number",
                            "example": 90
                          },
                          "currency": {
                            "type": "string",
                            "example": "BRL"
                          },
                          "id": {
                            "type": "string",
                            "example": "943b6917-2184-4ba7-87f0-088069ca8a6d"
                          },
                          "image": {
                            "type": "string",
                            "example": ""
                          },
                          "installments": {
                            "type": "object",
                            "properties": {
                              "interest_rate": {
                                "type": "number",
                                "example": 1
                              },
                              "max_with_interest": {
                                "type": "number",
                                "example": 3
                              },
                              "max_without_interest": {
                                "type": "number",
                                "example": 1
                              }
                            }
                          },
                          "interval": {
                            "type": "string",
                            "example": 3
                          },
                          "interval_type": {
                            "type": "string",
                            "example": "month"
                          },
                          "name": {
                            "type": "string",
                            "example": "Teste Upgrade"
                          },
                          "payment_methods": {
                            "type": "array",
                            "items": {
                              "type": "string"
                            },
                            "example": [
                              "credit_card",
                              "billet",
                              "pix",
                              "nupay"
                            ]
                          },
                          "product": {
                            "type": "object",
                            "properties": {
                              "id": {
                                "type": "string",
                                "example": "9385fba4-54eb-43ee-9a50-609495f3dc49"
                              },
                              "group": {
                                "type": "object",
                                "properties": {
                                  "id": {
                                    "type": "string",
                                    "example": ""
                                  },
                                  "name": {
                                    "type": "string",
                                    "example": ""
                                  }
                                }
                              },
                              "marketplace_id": {
                                "type": "string",
                                "example": "1622036593"
                              },
                              "marketplace_name": {
                                "type": "string",
                                "example": "marketplace_name"
                              },
                              "name": {
                                "type": "string",
                                "example": "AA Teste Assinatura"
                              }
                            }
                          },
                          "value": {
                            "type": "number",
                            "example": 1000
                          }
                        }
                      }
                    },
                    "downgrade": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "charge_every_days": {
                            "type": "number",
                            "example": 30
                          },
                          "currency": {
                            "type": "string",
                            "example": "BRL"
                          },
                          "id": {
                            "type": "string",
                            "example": "932fe44e-02ed-4112-867e-acc13ff579f4"
                          },
                          "image": {
                            "type": "string",
                            "example": "https://storage.googleapis.com/disk.dev.clkdmg.site/clients/8abafeec-839f-4975-bf28-994a41aa5b86/images/products/95f18406-41bf-48f0-8231-a1117bd380cc.png"
                          },
                          "installments": {
                            "type": "object",
                            "properties": {
                              "interest_rate": {
                                "type": "number",
                                "example": 0
                              },
                              "max_with_interest": {
                                "type": "number",
                                "example": 1
                              },
                              "max_without_interest": {
                                "type": "number",
                                "example": 1
                              }
                            }
                          },
                          "interval": {
                            "type": "string",
                            "example": "30"
                          },
                          "interval_type": {
                            "type": "string",
                            "example": "day"
                          },
                          "name": {
                            "type": "string",
                            "example": "Oferta - Cobrança Mensal (s/ trial)"
                          },
                          "payment_methods": {
                            "type": "array",
                            "items": {
                              "type": "string"
                            },
                            "example": [
                              "credit_card",
                              "billet",
                              "pix"
                            ]
                          },
                          "product": {
                            "type": "object",
                            "properties": {
                              "id": {
                                "type": "string",
                                "example": "8c5d3417-ff7d-4625-97b1-8277256c25c1"
                              },
                              "group": {
                                "type": "object",
                                "properties": {
                                  "id": {
                                    "type": "string",
                                    "example": "97d1ec38-269b-41cc-97f5-7ba094ed2463"
                                  },
                                  "name": {
                                    "type": "string",
                                    "example": "grupo 1"
                                  }
                                }
                              },
                              "marketplace_id": {
                                "type": "string",
                                "example": "32484"
                              },
                              "marketplace_name": {
                                "type": "string",
                                "example": "marketplace_name"
                              },
                              "name": {
                                "type": "string",
                                "example": "(Nome do Plano p/ Assinatura)"
                              }
                            }
                          },
                          "value": {
                            "type": "number",
                            "example": 111.11
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/plans/simulate": {
      "post": {
        "summary": "Simular Downgrade / Upgrade",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "offer_id": {
                    "type": "string",
                    "example": "9333ee25-42ad-4446-b0d5-8eccb7a6329e"
                  }
                },
                "required": [
                  "offer_id"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "balance": {
                      "type": "number",
                      "example": 100
                    },
                    "charge_date": {
                      "type": "string",
                      "example": "YYYY-MM-DD"
                    },
                    "charge_every_days": {
                      "type": "number",
                      "example": 30
                    },
                    "credit": {
                      "type": "number",
                      "example": 100
                    },
                    "currency": {
                      "type": "string",
                      "example": "BRL"
                    },
                    "days_until_complete_cycle": {
                      "type": "number",
                      "example": 20
                    },
                    "debit": {
                      "type": "number",
                      "example": 100
                    },
                    "id": {
                      "type": "string",
                      "example": "9333ee25-42ad-4446-b0d5-8eccb7a6329e"
                    },
                    "interval": {
                      "type": "number",
                      "example": 1
                    },
                    "interval_type": {
                      "type": "string",
                      "example": "month"
                    },
                    "installments": {
                      "type": "number",
                      "example": 0
                    },
                    "name": {
                      "type": "string",
                      "example": "Name"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/transactions": {
      "get": {
        "summary": "Listar Transações",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TransactionList"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/trial-end-date": {
      "put": {
        "summary": "Alterar Data de Final do Trial",
        "description": "Pode ser usado o id interno do guru (uuid) ou o subscription_code na url.\n\nValidações:\n\n- deve estar em trial\n\n- deve rodar no motor do guru\n\n- nova data deve ser maior que a data atual",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/SubscriptionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "new_end_date": {
                        "type": "string",
                        "description": "Nova Data (YYYY-MM-DD)",
                        "example": "2024-03-31",
                        "required": [
                          "new_end_date"
                        ],
                        "not": {
                          "required": [
                            "finish_trial_period_now"
                          ]
                        }
                      },
                      "finish_trial_period_now": {
                        "type": "boolean",
                        "description": "Terminar periodo trial imediatamente",
                        "required": [
                          "finish_trial_period_now"
                        ],
                        "not": {
                          "required": [
                            "new_end_date"
                          ]
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "parameters": {
      "Authorization": {
        "name": "Authorization",
        "in": "header",
        "description": "e.g. Bearer {user_token}",
        "required": true,
        "schema": {
          "type": "string"
        },
        "example": "Bearer {user_token}"
      },
      "Accept": {
        "name": "Accept",
        "in": "header",
        "description": "e.g. application/json",
        "required": false,
        "schema": {
          "type": "string"
        },
        "example": "application/json"
      },
      "SubscriptionId": {
        "name": "id",
        "in": "path",
        "description": "ID da assinatura",
        "required": true,
        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",
        "schema": {
          "type": "string"
        }
      },
      "Cursor": {
        "name": "cursor",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "example": "eyJzdWJzY3JpcHRpb25zLmxhc3Rfc3RhdHVzX2F0IjoiMjAyMy0xMi0xNCAwOTozNzowMCIsInN1YnNjcmlwdGlvbnMuaWQiOiI5YWQ4YzEwNi0zNGMwLTQwZDAtYWU5YS04ZTAxNzFjNmMxMjIiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"
      }
    },
    "schemas": {
      "Subscription": {
        "type": "object",
        "properties": {
          "cancel_at_cycle_end": {
            "type": "boolean"
          },
          "cancelled_at": {
            "nullable": true
          },
          "charged_every_days": {
            "type": "number"
          },
          "charged_times": {
            "type": "number"
          },
          "current_invoice": {
            "type": "object",
            "properties": {
              "charge_at": {
                "type": "string"
              },
              "code": {
                "type": "string"
              },
              "created_at": {
                "type": "number"
              },
              "cycle": {
                "type": "number"
              },
              "discount_value": {
                "type": "number"
              },
              "id": {
                "type": "string"
              },
              "increment_value": {
                "type": "number"
              },
              "payment_url": {
                "type": "string"
              },
              "period_end": {
                "type": "string"
              },
              "period_start": {
                "type": "string"
              },
              "status": {
                "type": "string"
              },
              "subscription_id": {
                "type": "string"
              },
              "tax_value": {
                "type": "number"
              },
              "type": {
                "type": "string"
              },
              "value": {
                "type": "number"
              },
              "updated_at": {
                "type": "number"
              }
            }
          },
          "contact": {
            "type": "object",
            "properties": {
              "doc": {
                "type": "string"
              },
              "email": {
                "type": "string"
              },
              "id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "phone_local_code": {
                "type": "string"
              },
              "phone_number": {
                "type": "string"
              }
            }
          },
          "contracts": {
            "nullable": true
          },
          "created_at": {
            "type": "number"
          },
          "id": {
            "type": "string"
          },
          "is_cycling": {
            "type": "boolean"
          },
          "last_status": {
            "type": "string"
          },
          "last_status_at": {
            "type": "number"
          },
          "next_cycle_at": {
            "type": "string"
          },
          "own_engine": {
            "type": "boolean"
          },
          "payment_method": {
            "type": "string"
          },
          "product": {
            "type": "object",
            "properties": {
              "group": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  }
                }
              },
              "id": {
                "type": "string"
              },
              "marketplace_id": {
                "type": "string"
              },
              "marketplace_name": {
                "type": "string"
              },
              "name": {
                "type": "string"
              }
            }
          },
          "started_at": {
            "type": "number"
          },
          "subscription_code": {
            "type": "string"
          },
          "subscriber": {
            "type": "object",
            "properties": {
              "doc": {
                "type": "string"
              },
              "email": {
                "type": "string"
              },
              "id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "phone_local_code": {
                "type": "string"
              },
              "phone_number": {
                "type": "string"
              }
            }
          },
          "trial_finished_at": {
            "nullable": true
          },
          "trial_started_at": {
            "nullable": true
          },
          "updated_at": {
            "type": "number"
          }
        },
        "example": {
          "cancel_at_cycle_end": false,
          "cancelled_at": null,
          "charged_every_days": 360,
          "charged_times": 1,
          "contact": {
            "doc": "012345678901",
            "email": "dev1@digitalmanager.guru",
            "id": "9333ee25-42ad-4446-b0d5-8eccb7a6329e",
            "name": "Nome Do Contato",
            "phone_local_code": "55",
            "phone_number": "21983491234"
          },
          "contracts": null,
          "created_at": 1618512480,
          "id": "9333ee25-415e-42fd-aef8-db85184a62fe",
          "is_cycling": false,
          "last_status": "active",
          "last_status_at": 1614042397,
          "next_cycle_at": "2022-02-21",
          "own_engine": false,
          "payment_method": "credit_card",
          "product": {
            "group": {
              "id": "a038a2c8-ef55-415e-b45d-3a5a3d6a74e6",
              "name": "grupo 1"
            },
            "id": "9333d6a8-344a-4765-9397-c3f860289709",
            "marketplace_id": "1614042397",
            "marketplace_name": "mundipagg",
            "name": "Produto de Testes"
          },
          "started_at": 1613952000,
          "subscription_code": "sub_RGpKLw1c2fj6ljo5",
          "trial_finished_at": null,
          "trial_started_at": null,
          "updated_at": 1618514504
        }
      },
      "SubscriptionList": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Subscription"
            }
          },
          "has_more_pages": {
            "type": "number",
            "example": 1
          },
          "next_cursor": {
            "type": "string",
            "example": "eyJzdWJzY3JpcHRpb25zLmxhc3Rfc3RhdHVzX2F0IjoiMjAyMy0xMi0xNCAwOTozNzowMCIsInN1YnNjcmlwdGlvbnMuaWQiOiI5YWQ4YzEwNi0zNGMwLTQwZDAtYWU5YS04ZTAxNzFjNmMxMjIiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"
          },
          "on_first_page": {
            "type": "number",
            "example": 1
          },
          "on_last_page": {
            "type": "number",
            "example": 0
          },
          "per_page": {
            "type": "number",
            "example": 50
          },
          "previous_cursor": {
            "type": "string",
            "example": 50
          },
          "total_rows": {
            "type": "number",
            "example": 256
          }
        }
      },
      "SubscriptionFull": {
        "type": "object",
        "properties": {
          "affiliations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "affiliation_comission_type": {
                  "type": "string",
                  "example": "percentage"
                },
                "affiliation_comission_value": {
                  "type": "number",
                  "example": 20
                },
                "affiliation_id": {
                  "type": "string",
                  "example": "9333d6a8-344a-4765-9397-c3f860289709"
                },
                "affiliation_marketplace_id": {
                  "type": "string",
                  "example": "affiliation_marketplace_id"
                },
                "affiliation_name": {
                  "type": "string",
                  "example": "Affiliation Name"
                },
                "affiliation_type": {
                  "type": "string",
                  "example": "all"
                },
                "contact_email": {
                  "type": "string",
                  "example": "user@example.com"
                },
                "contact_id": {
                  "type": "string",
                  "example": "9333d6a8-344a-4765-9397-c3f860289709"
                }
              }
            }
          },
          "cancel_at_cycle_end": {
            "type": "number",
            "example": 0
          },
          "cancel_reason": {
            "type": "string",
            "example": ""
          },
          "cancelled_at": {
            "type": "string",
            "nullable": true,
            "example": null
          },
          "cancelled_by": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "example": ""
              },
              "email": {
                "type": "string",
                "example": ""
              },
              "date": {
                "type": "string",
                "example": ""
              }
            }
          },
          "charged_every_days": {
            "type": "number",
            "example": 30
          },
          "charged_times": {
            "type": "number",
            "example": 1
          },
          "contact": {
            "type": "object",
            "properties": {
              "address": {
                "type": "string",
                "example": "Endereço"
              },
              "address_city": {
                "type": "string",
                "example": "Cidade"
              },
              "address_comp": {
                "type": "string",
                "example": ""
              },
              "address_country": {
                "type": "string",
                "example": "BR"
              },
              "address_district": {
                "type": "string",
                "example": "Bairro"
              },
              "address_number": {
                "type": "string",
                "example": "Número"
              },
              "address_state": {
                "type": "string",
                "example": "XX"
              },
              "address_zip_code": {
                "type": "string",
                "example": "21073990"
              },
              "doc": {
                "type": "string",
                "example": "81419192531"
              },
              "email": {
                "type": "string",
                "example": "email@gmail.com"
              },
              "id": {
                "type": "string",
                "example": "8fb01ec4-99fd-419d-ba2f-09b1447408ed"
              },
              "name": {
                "type": "string",
                "example": "Dev Guru"
              },
              "phone_local_code": {
                "type": "string",
                "example": "55"
              },
              "phone_number": {
                "type": "string",
                "example": "11999999999"
              }
            }
          },
          "contracts": {
            "type": "array",
            "items": {
              "type": "object"
            },
            "example": null
          },
          "coupon": {
            "type": "object",
            "properties": {
              "status": {
                "type": "string",
                "example": "success",
                "enum": [
                  "success"
                ]
              },
              "coupon_code": {
                "type": "string",
                "example": "coupon_code"
              },
              "final_value": {
                "type": "number",
                "example": 7.8
              },
              "last_sent_at": {
                "type": "number",
                "example": 1712912938
              },
              "incidence_type": {
                "type": "string",
                "example": "percent",
                "enum": [
                  "value",
                  "percent"
                ]
              },
              "incidence_field": {
                "type": "string",
                "example": "total",
                "enum": [
                  "products",
                  "shipping",
                  "total"
                ]
              },
              "incidence_value": {
                "type": "number",
                "example": 15.6
              },
              "maximum_subscription_cycles": {
                "type": "number",
                "example": 5
              },
              "id": {
                "type": "string",
                "example": "9bc9b809-8728-475b-b9a0-8a88d8b96e4"
              },
              "first_cycle_number_applied": {
                "type": "number",
                "example": 1
              }
            }
          },
          "created_at": {
            "type": "number",
            "example": 1660737092
          },
          "cycle_end_date": {
            "type": "string",
            "example": "2022-09-16"
          },
          "cycle_start_date": {
            "type": "string",
            "example": "2022-08-17"
          },
          "id": {
            "type": "string",
            "example": "970b0c72-7195-4cce-9f4c-f599db541f8e"
          },
          "increment_discount": {
            "$ref": "#/components/schemas/IncrementDiscount"
          },
          "is_cancelable": {
            "type": "number",
            "example": 1
          },
          "is_cycling": {
            "type": "number",
            "example": 1
          },
          "last_netvalue": {
            "type": "number",
            "example": 247
          },
          "last_status": {
            "type": "string",
            "example": "active"
          },
          "last_status_at": {
            "type": "number",
            "example": 1660737092
          },
          "last_value": {
            "type": "number",
            "example": 247
          },
          "next_cycle_at": {
            "type": "string",
            "example": "2022-09-17"
          },
          "next_cycle_installments": {
            "type": "number",
            "example": 1
          },
          "next_cycle_value": {
            "type": "number",
            "example": 247
          },
          "next_product": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "example": "8c5362df-bebc-4673-8d99-f70fc35f85e8"
              },
              "marketplace_id": {
                "type": "string",
                "example": "98882"
              },
              "marketplace_name": {
                "type": "string",
                "example": "marketplace_name"
              },
              "name": {
                "type": "string",
                "example": "Teste Assinatura"
              },
              "offer": {
                "type": "object",
                "properties": {
                  "cash_discount": {
                    "type": "number",
                    "example": 0
                  },
                  "id": {
                    "type": "string",
                    "example": "94599345-0684-457b-a83c-89afee091f17"
                  },
                  "name": {
                    "type": "string",
                    "example": "Teste Nova Assinatura"
                  },
                  "plan": {
                    "type": "object",
                    "properties": {
                      "cycles": {
                        "type": "number",
                        "example": 0
                      },
                      "discount": {
                        "type": "object",
                        "properties": {
                          "cycles": {
                            "type": "number",
                            "example": 0
                          },
                          "value": {
                            "type": "number",
                            "example": 0
                          }
                        }
                      },
                      "increment": {
                        "type": "object",
                        "properties": {
                          "cycles": {
                            "type": "number",
                            "example": 1
                          },
                          "value": {
                            "type": "number",
                            "example": 150
                          }
                        }
                      },
                      "interval": {
                        "type": "number",
                        "example": 1
                      },
                      "interval_type": {
                        "type": "string",
                        "example": "month"
                      },
                      "provider": {
                        "type": "string",
                        "example": "guru"
                      },
                      "split_cycles": {
                        "type": "number",
                        "example": 0
                      },
                      "trial_days": {
                        "type": "number",
                        "example": 0
                      }
                    }
                  },
                  "units_per_sale": {
                    "type": "number",
                    "example": 1
                  },
                  "value": {
                    "type": "number",
                    "example": 100
                  }
                }
              }
            }
          },
          "own_engine": {
            "type": "number",
            "example": 1
          },
          "payment_method": {
            "type": "string",
            "example": "credit_card"
          },
          "product": {
            "type": "object",
            "properties": {
              "group": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "example": "a038a2c8-ef55-415e-b45d-3a5a3d6a74e6"
                  },
                  "name": {
                    "type": "string",
                    "example": "grupo 1"
                  }
                }
              },
              "id": {
                "type": "string",
                "example": "8c5362df-bebc-4673-8d99-f70fc35f85e8"
              },
              "marketplace_id": {
                "type": "string",
                "example": "marketplace_id"
              },
              "marketplace_name": {
                "type": "string",
                "example": "marketplace_name"
              },
              "name": {
                "type": "string",
                "example": "Teste Assinatura"
              },
              "offer": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "example": "94599345-0684-457b-a83c-89afee091f17"
                  },
                  "name": {
                    "type": "string",
                    "example": "Teste Nova Assinatura"
                  },
                  "plan": {
                    "type": "object",
                    "properties": {
                      "cycles": {
                        "type": "number",
                        "example": 0
                      },
                      "discount": {
                        "type": "object",
                        "properties": {
                          "cycles": {
                            "type": "number",
                            "example": 0
                          },
                          "value": {
                            "type": "number",
                            "example": 0
                          }
                        }
                      },
                      "increment": {
                        "type": "object",
                        "properties": {
                          "cycles": {
                            "type": "number",
                            "example": 1
                          },
                          "value": {
                            "type": "number",
                            "example": 150
                          }
                        }
                      },
                      "interval": {
                        "type": "number",
                        "example": 1
                      },
                      "interval_type": {
                        "type": "string",
                        "example": "month"
                      },
                      "provider": {
                        "type": "string",
                        "example": "guru"
                      },
                      "split_cycles": {
                        "type": "number",
                        "example": 0
                      },
                      "trial_days": {
                        "type": "number",
                        "example": 0
                      }
                    }
                  }
                }
              }
            }
          },
          "product_id": {
            "type": "string",
            "example": "94599345-0684-457b-a83c-89afee091f17"
          },
          "provider": {
            "type": "string",
            "example": "guru"
          },
          "started_at": {
            "type": "number",
            "example": 1660737092
          },
          "subscription_code": {
            "type": "string",
            "example": "sub_YQvGxjbwbKSOTca4"
          },
          "subscription_name": {
            "type": "string",
            "example": "Teste Assinatura"
          },
          "trial_days": {
            "type": "number",
            "example": 0
          },
          "total_cycles": {
            "type": "number",
            "example": 10
          },
          "trial_finished_at": {
            "type": "number",
            "example": null
          },
          "trial_started_at": {
            "type": "number",
            "example": null
          },
          "updated_at": {
            "type": "number",
            "example": 1666287705
          }
        }
      },
      "Invoice": {
        "type": "object",
        "properties": {
          "charge_at": {
            "type": "string",
            "example": "2021-09-30"
          },
          "code": {
            "type": "string",
            "example": "in_kURUeHNJ3Lr8XPvI5"
          },
          "created_at": {
            "type": "number",
            "example": 1632756525
          },
          "cycle": {
            "type": "number",
            "example": 1
          },
          "days_until_payment": {
            "type": "number",
            "example": 1
          },
          "discount_value": {
            "type": "number",
            "example": 0
          },
          "id": {
            "type": "string",
            "example": "947f9345-fed4-49ee-8382-a98900715324"
          },
          "increment_value": {
            "type": "number",
            "example": 150
          },
          "paid_at": {
            "type": "string",
            "example": "2021-09-30"
          },
          "payment_attempts": {
            "type": "number",
            "example": 1
          },
          "payment_url": {
            "type": "string",
            "example": "https://clkdmg.site/pay/947f9345-fed4-49ee-8382-a98900715324/invoice"
          },
          "period_end": {
            "type": "string",
            "example": "2021-10-27"
          },
          "period_start": {
            "type": "string",
            "example": "2021-09-27"
          },
          "status": {
            "type": "string",
            "example": "waiting_payment"
          },
          "subscription_id": {
            "type": "string",
            "example": "947f9345-fad3-44f7-ab40-13b332c66cb2"
          },
          "tax_value": {
            "type": "number",
            "example": 0
          },
          "transaction_was_reissued": {
            "type": "integer",
            "example": 1
          },
          "type": {
            "type": "string",
            "example": "cycle"
          },
          "value": {
            "type": "number",
            "example": 247
          },
          "updated_at": {
            "type": "number",
            "example": 1691929818
          }
        }
      },
      "InvoiceList": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Invoice"
            }
          },
          "has_more_pages": {
            "type": "number",
            "example": 1
          },
          "next_cursor": {
            "type": "string",
            "example": "eyJpZCI6IjkzN2Y5ODAyLTU0ZDAtNDg1Zi1hNTE1LThlNDdiYTAxMzc3NSIsIl9wb2ludHNUb05leHRJdGVtcyI6dHJ1ZX0"
          },
          "on_first_page": {
            "type": "number",
            "example": 1
          },
          "on_last_page": {
            "type": "number",
            "example": 0
          },
          "per_page": {
            "type": "number",
            "example": 50
          },
          "previous_cursor": {
            "type": "string",
            "example": 50
          },
          "total_rows": {
            "type": "number",
            "example": 256
          }
        }
      },
      "Transaction": {
        "type": "object",
        "properties": {
          "affiliations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "affiliates_group_name": {
                  "type": "string",
                  "example": "affiliates_group_name"
                },
                "contact_email": {
                  "type": "string",
                  "example": "user@example.com"
                },
                "currency": {
                  "type": "string",
                  "example": "BRL"
                },
                "fee": {
                  "type": "number"
                },
                "id": {
                  "type": "string",
                  "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb41"
                },
                "marketplace_id": {
                  "type": "string",
                  "example": "marketplace_id"
                },
                "name": {
                  "type": "string",
                  "example": "Affiliate Name"
                },
                "net_value": {
                  "type": "number",
                  "example": 75
                },
                "value": {
                  "type": "number",
                  "example": 75
                }
              }
            }
          },
          "contact": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb41"
              },
              "name": {
                "type": "string",
                "example": "Contact Name"
              },
              "company_name": {
                "type": "string",
                "example": "Company Name"
              },
              "email": {
                "type": "string",
                "example": "user@example.com"
              },
              "doc": {
                "type": "string",
                "example": "012345678901"
              },
              "phone_number": {
                "type": "string",
                "example": "21983491234"
              },
              "phone_local_code": {
                "type": "string",
                "example": "55"
              },
              "address": {
                "type": "string",
                "example": "Rua Evangelina"
              },
              "address_number": {
                "type": "string",
                "example": "45"
              },
              "address_comp": {
                "type": "string",
                "example": "Casa"
              },
              "address_district": {
                "type": "string",
                "example": "Olaria"
              },
              "address_city": {
                "type": "string",
                "example": "Rio de Janeiro"
              },
              "address_state": {
                "type": "string",
                "example": "RJ"
              },
              "address_state_full_name": {
                "type": "string",
                "example": "Rio de Janeiro"
              },
              "address_country": {
                "type": "string",
                "example": "BR"
              },
              "address_zip_code": {
                "type": "string",
                "example": "21073250"
              },
              "lead": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "first_tracking": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "string"
                        },
                        "name": {
                          "type": "string"
                        },
                        "publisher": {
                          "type": "string"
                        },
                        "tracked_at": {
                          "type": "string"
                        },
                        "type": {
                          "type": "string"
                        }
                      }
                    },
                    "last_tracking": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "string"
                        },
                        "name": {
                          "type": "string"
                        },
                        "publisher": {
                          "type": "string"
                        },
                        "tracked_at": {
                          "type": "string"
                        },
                        "type": {
                          "type": "string"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "contracts": {
            "type": "object"
          },
          "dates": {
            "type": "object",
            "properties": {
              "canceled_at": {
                "type": "number",
                "nullable": true
              },
              "confirmed_at": {
                "type": "number",
                "example": 1618512480
              },
              "created_at": {
                "type": "number",
                "example": 1618512480
              },
              "expires_at": {
                "type": "number",
                "nullable": true
              },
              "ordered_at": {
                "type": "number",
                "example": 1618512480
              },
              "unavailable_until": {
                "type": "number",
                "example": 1621104480
              },
              "updated_at": {
                "type": "number",
                "example": 1618514504
              },
              "warranty_until": {
                "type": "number",
                "example": 1621104480
              }
            }
          },
          "ecommerces": {
            "type": "object"
          },
          "extras": {
            "type": "object",
            "properties": {
              "accepted_terms_url": {
                "type": "number",
                "enum": [
                  0,
                  1
                ]
              },
              "accepted_privacy_policy_url": {
                "type": "number",
                "enum": [
                  0,
                  1
                ]
              }
            }
          },
          "has_order_bump": {
            "type": "number",
            "example": 0
          },
          "id": {
            "type": "string",
            "example": "9333ee25-64b5-4bd4-a0fd-4f35f95eb7cf"
          },
          "infrastructure": {
            "type": "object",
            "properties": {
              "ip": {
                "type": "string"
              },
              "city": {
                "type": "string"
              },
              "host": {
                "type": "string"
              },
              "region": {
                "type": "string"
              },
              "country": {
                "type": "string"
              },
              "user_agent": {
                "type": "string"
              },
              "city_lat_long": {
                "type": "string"
              }
            }
          },
          "invoice": {
            "type": "object",
            "properties": {
              "charge_at": {
                "type": "string"
              },
              "created_at": {
                "type": "string"
              },
              "cycle": {
                "type": "integer"
              },
              "discount_value": {
                "type": "number"
              },
              "id": {
                "type": "string"
              },
              "increment_value": {
                "type": "number"
              },
              "period_end": {
                "type": "string"
              },
              "period_start": {
                "type": "string"
              },
              "status": {
                "type": "string"
              },
              "tax_value": {
                "type": "string"
              },
              "tries": {
                "type": "string"
              },
              "try": {
                "type": "string"
              },
              "type": {
                "type": "string"
              },
              "value": {
                "type": "number"
              }
            }
          },
          "is_order_bump": {
            "type": "number",
            "example": 0
          },
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Product"
            }
          },
          "last_transaction": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "url": {
                "type": "string"
              }
            }
          },
          "payment": {
            "type": "object",
            "properties": {
              "affiliate_value": {
                "type": "number",
                "example": 0
              },
              "acquirer": {
                "type": "object",
                "properties": {
                  "code": {
                    "type": "string",
                    "example": ""
                  },
                  "message": {
                    "type": "string",
                    "example": ""
                  },
                  "name": {
                    "type": "string",
                    "example": ""
                  },
                  "tid": {
                    "type": "string",
                    "example": ""
                  }
                }
              },
              "can_try_again": {
                "type": "number",
                "example": 1
              },
              "coupon": {
                "nullable": true
              },
              "currency": {
                "type": "string",
                "example": "BRL"
              },
              "discount_value": {
                "type": "number",
                "example": 0
              },
              "gross": {
                "type": "number",
                "example": 358.8
              },
              "installments": {
                "type": "object",
                "properties": {
                  "value": {
                    "type": "number",
                    "example": 71.76
                  },
                  "qty": {
                    "type": "number",
                    "example": 5
                  },
                  "interest": {
                    "type": "number",
                    "example": 0
                  }
                }
              },
              "marketplace_id": {
                "type": "string",
                "example": "ch_8BV4k2xHNmCVkmdf"
              },
              "marketplace_name": {
                "type": "string",
                "example": "mundipagg"
              },
              "marketplace_value": {
                "type": "number",
                "example": 0
              },
              "method": {
                "type": "string",
                "example": "credit_card"
              },
              "net": {
                "type": "number",
                "example": 358.8
              },
              "processing_times": {
                "type": "object",
                "properties": {
                  "started_at": {
                    "type": "string",
                    "example": ""
                  },
                  "finished_at": {
                    "type": "string",
                    "example": ""
                  },
                  "delay_in_seconds": {
                    "type": "string",
                    "example": ""
                  }
                }
              },
              "refund_reason": {
                "type": "string",
                "example": ""
              },
              "refuse_reason": {
                "type": "string",
                "example": "Stone|Aprovado"
              },
              "tax": {
                "type": "object",
                "properties": {
                  "value": {
                    "type": "number",
                    "example": 0
                  },
                  "rate": {
                    "type": "number",
                    "example": 0
                  }
                }
              },
              "total": {
                "type": "number",
                "example": 358.8
              },
              "credit_card": {
                "type": "object",
                "properties": {
                  "brand": {
                    "type": "string",
                    "example": "mastercard"
                  },
                  "expiration_month": {
                    "type": "string",
                    "example": ""
                  },
                  "expiration_year": {
                    "type": "string",
                    "example": ""
                  },
                  "first_digits": {
                    "type": "string",
                    "example": "552236"
                  },
                  "id": {
                    "type": "string",
                    "example": "card_LqYA750xUdc1no6R"
                  },
                  "last_digits": {
                    "type": "string",
                    "example": "4284"
                  }
                }
              }
            }
          },
          "product": {
            "$ref": "#/components/schemas/Product"
          },
          "shipment": {
            "type": "object",
            "properties": {
              "carrier": {
                "type": "string",
                "example": ""
              },
              "service": {
                "type": "string",
                "example": ""
              },
              "tracking": {
                "type": "string",
                "example": ""
              },
              "value": {
                "type": "number",
                "example": 0
              },
              "status": {
                "type": "string",
                "example": ""
              },
              "delivery_time": {
                "type": "string",
                "example": ""
              }
            }
          },
          "shipping": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "example": "Standard"
              },
              "value": {
                "type": "number",
                "example": 0
              }
            }
          },
          "status": {
            "type": "string",
            "example": "approved"
          },
          "subscription": {
            "type": "object",
            "properties": {
              "can_cancel": {
                "type": "number",
                "example": 1
              },
              "canceled_at": {
                "nullable": true
              },
              "charged_every_days": {
                "type": "number",
                "example": 360
              },
              "charged_times": {
                "type": "number",
                "example": 1
              },
              "id": {
                "type": "string",
                "example": "sub_RGpKLw1c2fj6ljo5"
              },
              "internal_id": {
                "type": "string",
                "example": "9333ee25-415e-42fd-aef8-db85184a62fe"
              },
              "last_status": {
                "type": "string",
                "example": "active"
              },
              "last_status_at": {
                "type": "number",
                "example": 1614042397
              },
              "name": {
                "type": "string",
                "example": "Produto de Teste"
              },
              "started_at": {
                "type": "number",
                "example": 1613952000
              },
              "subscription_code": {
                "type": "string",
                "example": "sub_RGpKLw1c2fj6ljo5"
              },
              "trial_days": {
                "type": "number",
                "example": 0
              },
              "trial_finished_at": {
                "nullable": true
              },
              "trial_started_at": {
                "nullable": true
              }
            }
          },
          "trackings": {
            "type": "object",
            "properties": {
              "source": {
                "nullable": true
              },
              "checkout_source": {
                "nullable": true
              },
              "utm_source": {
                "nullable": true
              },
              "utm_campaign": {
                "nullable": true
              },
              "utm_medium": {
                "nullable": true
              },
              "utm_content": {
                "nullable": true
              },
              "utm_term": {
                "nullable": true
              },
              "pptc": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "tracking_id": {
                      "type": "string"
                    },
                    "tracking_name": {
                      "type": "string"
                    },
                    "tracking_type": {
                      "type": "string"
                    },
                    "tracking_publisher": {
                      "type": "string"
                    },
                    "user_name": {
                      "type": "string"
                    },
                    "checkout_id": {
                      "type": "string"
                    },
                    "checkout_name": {
                      "type": "string"
                    },
                    "utm_campaign": {
                      "type": "string"
                    },
                    "utm_medium": {
                      "type": "string"
                    },
                    "utm_term": {
                      "type": "string"
                    },
                    "utm_content": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "type": {
            "type": "string",
            "example": "producer"
          }
        }
      },
      "TransactionList": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Transaction"
            }
          },
          "has_more_pages": {
            "type": "number",
            "example": 1
          },
          "next_cursor": {
            "type": "string",
            "example": "eyJvcmRlcmVkX2F0IjoiMjAyMS0wNS0yNCAwNzozMDowMyIsImlkIjoiOTM3Zjk4MDAtMmFlMy00YTE5LWFkNmUtNDQ1NDk2NjFkYjEwIiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ"
          },
          "on_first_page": {
            "type": "number",
            "example": 1
          },
          "on_last_page": {
            "type": "number",
            "example": 0
          },
          "per_page": {
            "type": "number",
            "example": 50
          },
          "previous_cursor": {
            "type": "string",
            "example": 50
          },
          "total_rows": {
            "type": "number",
            "example": 256
          }
        }
      },
      "Activity": {
        "type": "object",
        "properties": {
          "activity_id": {
            "type": "string",
            "example": "9b67cdf6-9582-4aa6-a757-aefd0f9d7429,"
          },
          "queued_at": {
            "type": "number",
            "example": "1709634897,"
          },
          "started_at": {
            "type": "number",
            "example": "1709634897,"
          },
          "finished_at": {
            "type": "number",
            "example": "1709634897,"
          },
          "data": {
            "type": "string"
          },
          "subscription_id": {
            "type": "string",
            "example": "9b495283-ebb6-4014-8b7b-dadd91f6471d,"
          },
          "type": {
            "type": "string",
            "example": "subscription_upgraded"
          },
          "created_at": {
            "type": "number",
            "example": 1709634897
          }
        }
      },
      "ActivityList": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Activity"
            }
          },
          "next_cursor": {
            "type": "string",
            "example": "eyJjcmVhdGVkX2F0IjoxNjY3NDY3ODAzLCJfX25hbWVfXyI6IjU2YTU0MTg4LTNiMzItNDU1Zi1hZTE1LTI3MjZiOWI3NGYyNyJ9"
          },
          "on_first_page": {
            "type": "number",
            "example": 1
          },
          "on_last_page": {
            "type": "number",
            "example": 0
          },
          "per_page": {
            "type": "number",
            "example": 50
          }
        }
      },
      "Product": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "example": "1614042397"
          },
          "image_url": {
            "type": "string",
            "example": ""
          },
          "internal_id": {
            "type": "string",
            "example": "9333d6a8-344a-4765-9397-c3f860289709"
          },
          "marketplace_id": {
            "type": "string",
            "example": "1614042397"
          },
          "marketplace_name": {
            "type": "string",
            "example": "mundipagg"
          },
          "name": {
            "type": "string",
            "example": "Produto de Teste"
          },
          "group": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "example": "a038a2c8-ef55-415e-b45d-3a5a3d6a74e6"
              },
              "name": {
                "type": "string",
                "example": "grupo 1"
              }
            }
          },
          "offer": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "name": {
                "type": "string"
              }
            }
          },
          "producer": {
            "type": "object",
            "properties": {
              "marketplace_id": {
                "type": "string",
                "example": "012345678901"
              },
              "name": {
                "type": "string",
                "example": "Producer Name"
              },
              "contact_email": {
                "type": "string",
                "example": "user@example.com"
              }
            }
          },
          "qty": {
            "type": "number",
            "example": 1
          },
          "total_value": {
            "type": "number",
            "example": 358.8
          },
          "type": {
            "type": "string",
            "example": "plan"
          },
          "unit_value": {
            "type": "number",
            "example": 358.8
          }
        }
      },
      "IncrementDiscount": {
        "type": "object",
        "properties": {
          "start_cycle": {
            "type": "number",
            "description": "O primeiro ciclo em que a alteração deverá ter efeito. Deve ser maior ou igual ao número do próximo ciclo da assinatura",
            "example": 5
          },
          "increment": {
            "type": "object",
            "properties": {
              "value": {
                "type": "number",
                "example": 27.5
              },
              "cycles": {
                "type": "number",
                "example": 2
              }
            }
          },
          "discount": {
            "type": "object",
            "properties": {
              "value": {
                "type": "number",
                "example": 12.5
              },
              "cycles": {
                "type": "number",
                "example": 0
              }
            }
          }
        },
        "required": [
          "start_cycle"
        ]
      }
    }
  }
}
```

# Transactions

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "Transactions",
    "version": "2.0.0"
  },
  "servers": [
    {
      "url": "https://digitalmanager.guru/api/v2/transactions"
    }
  ],
  "paths": {
    "/": {
      "get": {
        "summary": "Pesquisar",
        "description": "Pode pesquisar transações usando esta ação.\n\nA ação retorna uma coleção paginada de transações.\n\nA consulta deverá conter o filtro por data (cancelled_at, confirmed_at ou ordered_at), incluindo sempre a data inicial e final e o período total não poderá ser maior que 180 dias.\n\nCaso a consulta contenha o filtro contact_id, invoice_id ou subscription_id, os filtros por data (cancelled_at, confirmed_at ou ordered_at) não serão obrigatórios.\n\nO valor `total_rows` é apenas apresentado na primeira página.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "name": "affiliation_marketplace_id",
            "in": "query",
            "description": "Código do Afiliado",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "affiliation_name",
            "in": "query",
            "description": "Nome do Afiliado",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "affiliation_option",
            "in": "query",
            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-opcoes-afiliacoes\">Opção de afiliação</a>",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "cancelled_at_ini",
            "in": "query",
            "description": "Data de cancelamento inicial (YYYY-MM-DD)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "cancelled_at_end",
            "in": "query",
            "description": "Data de cancelamento final (YYYY-MM-DD)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "confirmed_at_ini",
            "in": "query",
            "description": "Data de aprovação inicial (YYYY-MM-DD)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "confirmed_at_end",
            "in": "query",
            "description": "Data de aprovação final (YYYY-MM-DD)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "contact_id",
            "in": "query",
            "description": "ID do contato (UUID)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "contact_doc",
            "in": "query",
            "description": "Documento do contato",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "contact_email",
            "in": "query",
            "description": "Email do contato",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "contact_name",
            "in": "query",
            "description": "Nome do contato",
            "schema": {
              "type": "string"
            }
          },
          {
            "$ref": "#/components/parameters/Cursor"
          },
          {
            "name": "invoice_id",
            "in": "query",
            "description": "ID da fatura (UUID)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "marketplace_id",
            "in": "query",
            "description": "ID da venda no marketplace",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "marketplaces",
            "in": "query",
            "style": "form",
            "explode": true,
            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-marketplaces\">Lista de marketplaces</a>",
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "ordered_at_ini",
            "in": "query",
            "description": "Data da venda inicial (YYYY-MM-DD)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "ordered_at_end",
            "in": "query",
            "description": "Data da venda final (YYYY-MM-DD)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "payment_types",
            "in": "query",
            "style": "form",
            "explode": true,
            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-formas-pagamento\">Lista de formas de pagamento</a>",
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "product_id",
            "in": "query",
            "description": "Id do produto (UUID)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "subscription_id",
            "in": "query",
            "description": "Id da assinatura (UUID)",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "transaction_status",
            "in": "query",
            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Lista de status da venda</a>",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TransactionList"
                }
              }
            }
          }
        }
      }
    },
    "/{id}": {
      "get": {
        "summary": "Consultar (ID)",
        "description": "Pode consultar uma transação usando esta ação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Transaction"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/activities": {
      "get": {
        "summary": "Atividades",
        "description": "Consulta as atividades de uma transação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          },
          {
            "name": "created_at_ini",
            "in": "query",
            "description": "Data inicial do período (formato YYYY-MM-DD). Obrigatória quando `created_at_end` é informada e deve ser menor ou igual a ela. O período máximo entre as datas é de 365 dias. Se nenhuma data for informada, retorna os últimos 6 meses.",
            "example": "2024-01-01",
            "schema": {
              "type": "string",
              "format": "date"
            }
          },
          {
            "name": "created_at_end",
            "in": "query",
            "description": "Data final do período (formato YYYY-MM-DD). Obrigatória quando `created_at_ini` é informada e deve ser maior ou igual a ela. O período máximo entre as datas é de 365 dias.",
            "example": "2024-06-30",
            "schema": {
              "type": "string",
              "format": "date"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ActivityList"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/br/invoice": {
      "post": {
        "summary": "Informar Dados da Nota Fiscal (ID)",
        "description": "Pode pesquisar informar os dados da Nota Fiscal usando esta ação.\n\n#### Request\n\n<table>\n        <thead>\n            <th>\n                Campo\n            </th>\n            <th>\n                Tipo\n            </th>\n            <th>\n                Obrigatório\n            </th>\n        </thead>\n        <tbody>\n            <tr>\n                <td>nf_id</td>\n                <td>string</td>\n                <td>true</td>\n            </tr>\n            <tr>\n                <td>xml_url</td>\n                <td>url</td>\n                <td>true</td>\n            </tr>\n            <tr>\n                <td>pdf_url</td>\n                <td>url</td>\n                <td>true</td>\n            </tr>\n            <tr>\n                <td>key</td>\n                <td>string</td>\n                <td>false</td>\n            </tr>\n            <tr>\n                <td>issued_at</td>\n                <td>date (yyyy-mm-dd)</td>\n                <td>true</td>\n            </tr>\n        </tbody>\n    </table>",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "nf_id": {
                    "type": "string",
                    "example": "7c213f96-7831-11eb-9439-0242ac130002"
                  },
                  "xml_url": {
                    "type": "string",
                    "example": "https://dominio.com/nota_fiscal.xml"
                  },
                  "pdf_url": {
                    "type": "string",
                    "example": "https://dominio.com/nota_fiscal.pdf"
                  },
                  "key": {
                    "type": "string",
                    "example": "Mr2DKE7SkEHZy57O"
                  },
                  "issued_at": {
                    "type": "string",
                    "example": "2020-01-01"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "nf_id": {
                      "type": "string",
                      "example": "7c213f96-7831-11eb-9439-0242ac130002"
                    },
                    "xml_url": {
                      "type": "string",
                      "example": "https://dominio.com/nota_fiscal.xml"
                    },
                    "pdf_url": {
                      "type": "string",
                      "example": "https://dominio.com/nota_fiscal.pdf"
                    },
                    "key": {
                      "type": "string",
                      "example": "Mr2DKE7SkEHZy57O"
                    },
                    "issued_at": {
                      "type": "string",
                      "example": "2020-01-01"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/buyer": {
      "put": {
        "summary": "Atualizar Comprador (ID)",
        "description": "Atualiza os dados do comprador de uma transação através de seu id.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "address": {
                    "type": "string",
                    "example": "Rua Evangelina"
                  },
                  "address_city": {
                    "type": "string",
                    "example": "Rio de Janeiro"
                  },
                  "address_comp": {
                    "type": "string",
                    "example": "45"
                  },
                  "address_country": {
                    "type": "string",
                    "example": "BR"
                  },
                  "address_district": {
                    "type": "string",
                    "example": "Olaria"
                  },
                  "address_number": {
                    "type": "string",
                    "example": "45"
                  },
                  "address_state": {
                    "type": "string"
                  },
                  "address_zip_code": {
                    "type": "string",
                    "example": "RJ"
                  },
                  "company_name": {
                    "type": "string",
                    "example": ""
                  },
                  "doc": {
                    "type": "string",
                    "example": "21073250"
                  },
                  "email": {
                    "type": "string",
                    "example": "dev1@digitalmanager.guru"
                  },
                  "name": {
                    "type": "string",
                    "example": "Comprador de Testes"
                  },
                  "phone_local_code": {
                    "type": "string",
                    "example": "55"
                  },
                  "phone_number": {
                    "type": "string",
                    "example": "21999999999"
                  },
                  "update_contact": {
                    "type": "boolean",
                    "example": true
                  }
                },
                "required": [
                  "address_country",
                  "email",
                  "name",
                  "phone_local_code",
                  "phone_number",
                  "update_contact"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "contact_address": {
                      "type": "string",
                      "example": "Rua Evangelina"
                    },
                    "contact_address_city": {
                      "type": "string",
                      "example": "Rio de Janeiro"
                    },
                    "contact_address_comp": {
                      "type": "string",
                      "example": "45"
                    },
                    "contact_address_country": {
                      "type": "string",
                      "example": "BR"
                    },
                    "contact_address_district": {
                      "type": "string",
                      "example": "Olaria"
                    },
                    "contact_address_number": {
                      "type": "string",
                      "example": "45"
                    },
                    "contact_address_state": {
                      "type": "string",
                      "example": "RJ"
                    },
                    "contact_address_zip_code": {
                      "type": "string",
                      "example": "21073250"
                    },
                    "contact_company_name": {
                      "type": "string",
                      "example": null,
                      "nullable": true
                    },
                    "contact_doc": {
                      "type": "string",
                      "example": "012345678901"
                    },
                    "contact_email": {
                      "type": "string",
                      "example": "dev1@digitalmanager.guru"
                    },
                    "contact_name": {
                      "type": "string",
                      "example": "Comprador de Testes"
                    },
                    "contact_phone_local_code": {
                      "type": "string",
                      "example": "55"
                    },
                    "contact_phone_number": {
                      "type": "string",
                      "example": "21999999999"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/chargeback": {
      "post": {
        "summary": "Marcar como chargeback (ID)",
        "description": "Pode marcar uma transação como chargeback.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "comment": {
                    "type": "string",
                    "example": "Cliente contestou a compra"
                  }
                },
                "required": [
                  "comment"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/order-bumps": {
      "get": {
        "summary": "Listar Order Bump (ID)",
        "description": "Pode listar as transações do Order Bump usando esta ação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Transaction"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/refund": {
      "post": {
        "summary": "Reembolsar (ID)",
        "description": "Pode reembolsar uma transação usando esta ação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "comment": {
                    "type": "string",
                    "example": "Refund comment."
                  }
                },
                "required": [
                  "comment"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "headers": {},
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "marketplace_refund": {
                      "type": "number",
                      "example": 1
                    },
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{id}/reissue": {
      "post": {
        "summary": "Reemitir Boleto Bancário (ID)",
        "description": "Pode reemitir o boleto bancário de uma transação usando esta ação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "headers": {},
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Transaction"
                }
              }
            }
          }
        }
      }
    },
    "/{id}/etickets": {
      "get": {
        "summary": "Listar Etickets (ID)",
        "description": "Lista os Etickets de uma transação. O valor `total_rows` é apenas apresentado na primeira página.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/TransactionId"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/EticketList"
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}": {
      "get": {
        "summary": "Consultar (Marketplace)",
        "description": "Pode consultar uma transação usando esta ação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Transaction"
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}/activities": {
      "get": {
        "summary": "Atividades",
        "description": "Consulta as atividades de uma transação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          },
          {
            "name": "created_at_ini",
            "in": "query",
            "description": "Data inicial do período (formato YYYY-MM-DD). Obrigatória quando `created_at_end` é informada e deve ser menor ou igual a ela. O período máximo entre as datas é de 365 dias. Se nenhuma data for informada, retorna os últimos 6 meses.",
            "example": "2024-01-01",
            "schema": {
              "type": "string",
              "format": "date"
            }
          },
          {
            "name": "created_at_end",
            "in": "query",
            "description": "Data final do período (formato YYYY-MM-DD). Obrigatória quando `created_at_ini` é informada e deve ser maior ou igual a ela. O período máximo entre as datas é de 365 dias.",
            "example": "2024-06-30",
            "schema": {
              "type": "string",
              "format": "date"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ActivityList"
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}/br/invoice": {
      "post": {
        "summary": "Informar Dados da Nota Fiscal (Marketplace)",
        "description": "Pode pesquisar informar os dados da Nota Fiscal usando esta ação.\n\n#### Request\n\n<table>\n        <thead>\n            <th>\n                Campo\n            </th>\n            <th>\n                Tipo\n            </th>\n            <th>\n                Obrigatório\n            </th>\n        </thead>\n        <tbody>\n            <tr>\n                <td>nf_id</td>\n                <td>string</td>\n                <td>true</td>\n            </tr>\n            <tr>\n                <td>xml_url</td>\n                <td>url</td>\n                <td>true</td>\n            </tr>\n            <tr>\n                <td>pdf_url</td>\n                <td>url</td>\n                <td>true</td>\n            </tr>\n            <tr>\n                <td>key</td>\n                <td>string</td>\n                <td>false</td>\n            </tr>\n            <tr>\n                <td>issued_at</td>\n                <td>date (yyyy-mm-dd)</td>\n                <td>true</td>\n            </tr>\n        </tbody>\n    </table>",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "nf_id": {
                    "type": "string",
                    "example": "7c213f96-7831-11eb-9439-0242ac130002"
                  },
                  "xml_url": {
                    "type": "string",
                    "example": "https://dominio.com/nota_fiscal.xml"
                  },
                  "pdf_url": {
                    "type": "string",
                    "example": "https://dominio.com/nota_fiscal.pdf"
                  },
                  "key": {
                    "type": "string",
                    "example": "Mr2DKE7SkEHZy57O"
                  },
                  "issued_at": {
                    "type": "string",
                    "example": "2020-01-01"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "nf_id": {
                      "type": "string",
                      "example": "7c213f96-7831-11eb-9439-0242ac130002"
                    },
                    "xml_url": {
                      "type": "string",
                      "example": "https://dominio.com/nota_fiscal.xml"
                    },
                    "pdf_url": {
                      "type": "string",
                      "example": "https://dominio.com/nota_fiscal.pdf"
                    },
                    "key": {
                      "type": "string",
                      "example": "Mr2DKE7SkEHZy57O"
                    },
                    "issued_at": {
                      "type": "string",
                      "example": "2020-01-01"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}/buyer": {
      "put": {
        "summary": "Atualizar Comprador (Marketplace)",
        "description": "Atualiza os dados do comprador de uma transação através de seu id.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "address": {
                    "type": "string",
                    "example": "Rua Evangelina"
                  },
                  "address_city": {
                    "type": "string",
                    "example": "Rio de Janeiro"
                  },
                  "address_comp": {
                    "type": "string",
                    "example": "45"
                  },
                  "address_country": {
                    "type": "string",
                    "example": "BR"
                  },
                  "address_district": {
                    "type": "string",
                    "example": "Olaria"
                  },
                  "address_number": {
                    "type": "string",
                    "example": "45"
                  },
                  "address_state": {
                    "type": "string"
                  },
                  "address_zip_code": {
                    "type": "string",
                    "example": "RJ"
                  },
                  "company_name": {
                    "type": "string",
                    "example": ""
                  },
                  "doc": {
                    "type": "string",
                    "example": "21073250"
                  },
                  "email": {
                    "type": "string",
                    "example": "dev1@digitalmanager.guru"
                  },
                  "name": {
                    "type": "string",
                    "example": "Comprador de Testes"
                  },
                  "phone_local_code": {
                    "type": "string",
                    "example": "55"
                  },
                  "phone_number": {
                    "type": "string",
                    "example": "21999999999"
                  },
                  "update_contact": {
                    "type": "boolean",
                    "example": true
                  }
                },
                "required": [
                  "address_country",
                  "email",
                  "name",
                  "phone_local_code",
                  "phone_number",
                  "update_contact"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "contact_address": {
                      "type": "string",
                      "example": "Rua Evangelina"
                    },
                    "contact_address_city": {
                      "type": "string",
                      "example": "Rio de Janeiro"
                    },
                    "contact_address_comp": {
                      "type": "string",
                      "example": "45"
                    },
                    "contact_address_country": {
                      "type": "string",
                      "example": "BR"
                    },
                    "contact_address_district": {
                      "type": "string",
                      "example": "Olaria"
                    },
                    "contact_address_number": {
                      "type": "string",
                      "example": "45"
                    },
                    "contact_address_state": {
                      "type": "string",
                      "example": "RJ"
                    },
                    "contact_address_zip_code": {
                      "type": "string",
                      "example": "21073250"
                    },
                    "contact_company_name": {
                      "type": "string",
                      "example": null,
                      "nullable": true
                    },
                    "contact_doc": {
                      "type": "string",
                      "example": "012345678901"
                    },
                    "contact_email": {
                      "type": "string",
                      "example": "dev1@digitalmanager.guru"
                    },
                    "contact_name": {
                      "type": "string",
                      "example": "Comprador de Testes"
                    },
                    "contact_phone_local_code": {
                      "type": "string",
                      "example": "55"
                    },
                    "contact_phone_number": {
                      "type": "string",
                      "example": "21999999999"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}/chargeback": {
      "post": {
        "summary": "Marcar como chargeback (Marketplace)",
        "description": "Pode marcar uma transação como chargeback.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "comment": {
                    "type": "string",
                    "example": "Cliente contestou a compra"
                  }
                },
                "required": [
                  "comment"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}/order-bumps": {
      "get": {
        "summary": "Listar Order Bump (Marketplace)",
        "description": "Pode listar as transações do Order Bump usando esta ação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Transaction"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}/refund": {
      "post": {
        "summary": "Reembolsar (Marketplace)",
        "description": "Pode reembolsar uma transação usando esta ação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "comment": {
                    "type": "string",
                    "example": "Refund comment."
                  }
                },
                "required": [
                  "comment"
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "headers": {},
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "marketplace_refund": {
                      "type": "number",
                      "example": 1
                    },
                    "status": {
                      "type": "string",
                      "example": "success"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}/reissue": {
      "post": {
        "summary": "Reemitir Boleto Bancário (Marketplace)",
        "description": "Pode reemitir o boleto bancário de uma transação usando esta ação.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "headers": {},
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Transaction"
                }
              }
            }
          }
        }
      }
    },
    "/{marketplaceName}/{marketplaceId}/etickets": {
      "get": {
        "summary": "Listar Etickets (Marketplace)",
        "description": "Lista os Etickets de uma transação. O valor `total_rows` é apenas apresentado na primeira página.",
        "parameters": [
          {
            "$ref": "#/components/parameters/Authorization"
          },
          {
            "$ref": "#/components/parameters/Accept"
          },
          {
            "$ref": "#/components/parameters/MarketplaceName"
          },
          {
            "$ref": "#/components/parameters/MarketplaceId"
          },
          {
            "$ref": "#/components/parameters/Cursor"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/EticketList"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "parameters": {
      "Authorization": {
        "name": "Authorization",
        "in": "header",
        "description": "e.g. Bearer {user_token}",
        "required": true,
        "schema": {
          "type": "string"
        },
        "example": "Bearer {user_token}"
      },
      "Accept": {
        "name": "Accept",
        "in": "header",
        "description": "e.g. application/json",
        "required": false,
        "schema": {
          "type": "string"
        },
        "example": "application/json"
      },
      "TransactionId": {
        "name": "id",
        "in": "path",
        "description": "ID da transação",
        "required": true,
        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",
        "schema": {
          "type": "string"
        }
      },
      "MarketplaceName": {
        "name": "marketplaceName",
        "in": "path",
        "description": "Nome do Marketplace",
        "required": true,
        "example": "marketplace_name",
        "schema": {
          "type": "string"
        }
      },
      "MarketplaceId": {
        "name": "marketplaceId",
        "in": "path",
        "description": "ID do Marketplace",
        "required": true,
        "example": "marketplace_id",
        "schema": {
          "type": "string"
        }
      },
      "Cursor": {
        "name": "cursor",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"
      }
    },
    "schemas": {
      "Transaction": {
        "type": "object",
        "properties": {
          "affiliations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "affiliates_group_name": {
                  "type": "string",
                  "example": "affiliates_group_name"
                },
                "contact_email": {
                  "type": "string",
                  "example": "user@example.com"
                },
                "contacts_group_id": {
                  "type": "string",
                  "example": "9d4c0e87-7bc5-402d-a1b5-ae2cbb442913"
                },
                "contacts_group_name": {
                  "type": "string",
                  "example": "contacts_group_name"
                },
                "currency": {
                  "type": "string",
                  "example": "BRL"
                },
                "fee": {
                  "type": "number"
                },
                "id": {
                  "type": "string",
                  "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb41"
                },
                "marketplace_id": {
                  "type": "string",
                  "example": "marketplace_id"
                },
                "name": {
                  "type": "string",
                  "example": "Affiliate Name"
                },
                "net_value": {
                  "type": "number",
                  "example": 75
                },
                "value": {
                  "type": "number",
                  "example": 75
                },
                "recipient_id": {
                  "type": "string",
                  "example": "9d4c0e87-7bc5-402d-a1b5-ae2cbb442913"
                },
                "recipient_marketplace_id": {
                  "type": "string",
                  "example": "re_cko2pczt40c520h9tusdzbvjb"
                }
              }
            }
          },
          "checkout_invoice_url": {
            "type": "string",
            "nullable": true,
            "example": "https://clkdmg.site/invoice/a1b2c3d4-0000-0000-0000-000000000001"
          },
          "checkout_url": {
            "type": "string",
            "example": "https:example.dev/pay/12345/invoice"
          },
          "contact": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "example": "8dfc3c49-271c-4f36-9cf3-c917bc5deb41"
              },
              "name": {
                "type": "string",
                "example": "Contact Name"
              },
              "company_name": {
                "type": "string",
                "example": "Company Name"
              },
              "email": {
                "type": "string",
                "example": "user@example.com"
              },
              "doc": {
                "type": "string",
                "example": "012345678901"
              },
              "phone_number": {
                "type": "string",
                "example": "21983491234"
              },
              "phone_local_code": {
                "type": "string",
                "example": "55"
              },
              "address": {
                "type": "string",
                "example": "Rua Evangelina"
              },
              "address_number": {
                "type": "string",
                "example": "45"
              },
              "address_comp": {
                "type": "string",
                "example": "Casa"
              },
              "address_district": {
                "type": "string",
                "example": "Olaria"
              },
              "address_city": {
                "type": "string",
                "example": "Rio de Janeiro"
              },
              "address_state": {
                "type": "string",
                "example": "RJ"
              },
              "address_state_full_name": {
                "type": "string",
                "example": "Rio de Janeiro"
              },
              "address_country": {
                "type": "string",
                "example": "BR"
              },
              "address_zip_code": {
                "type": "string",
                "example": "21073250"
              },
              "lead": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "first_tracking": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "string"
                        },
                        "name": {
                          "type": "string"
                        },
                        "publisher": {
                          "type": "string"
                        },
                        "tracked_at": {
                          "type": "string"
                        },
                        "type": {
                          "type": "string"
                        }
                      }
                    },
                    "last_tracking": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "string"
                        },
                        "name": {
                          "type": "string"
                        },
                        "publisher": {
                          "type": "string"
                        },
                        "tracked_at": {
                          "type": "string"
                        },
                        "type": {
                          "type": "string"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "contracts": {
            "type": "object"
          },
          "dates": {
            "type": "object",
            "properties": {
              "canceled_at": {
                "type": "number",
                "nullable": true
              },
              "confirmed_at": {
                "type": "number",
                "example": 1618512480
              },
              "created_at": {
                "type": "number",
                "example": 1618512480
              },
              "expires_at": {
                "type": "number",
                "nullable": true
              },
              "ordered_at": {
                "type": "number",
                "example": 1618512480
              },
              "unavailable_until": {
                "type": "number",
                "example": 1621104480
              },
              "updated_at": {
                "type": "number",
                "example": 1618514504
              },
              "warranty_until": {
                "type": "number",
                "example": 1621104480
              }
            }
          },
          "ecommerces": {
            "type": "object"
          },
          "extras": {
            "type": "object",
            "properties": {
              "accepted_terms_url": {
                "type": "number",
                "enum": [
                  0,
                  1
                ]
              },
              "accepted_privacy_policy_url": {
                "type": "number",
                "enum": [
                  0,
                  1
                ]
              }
            }
          },
          "has_order_bump": {
            "type": "number",
            "example": 0
          },
          "id": {
            "type": "string",
            "example": "9333ee25-64b5-4bd4-a0fd-4f35f95eb7cf"
          },
          "infrastructure": {
            "type": "object",
            "properties": {
              "ip": {
                "type": "string"
              },
              "city": {
                "type": "string"
              },
              "host": {
                "type": "string"
              },
              "region": {
                "type": "string"
              },
              "country": {
                "type": "string"
              },
              "user_agent": {
                "type": "string"
              },
              "city_lat_long": {
                "type": "string"
              }
            }
          },
          "invoice": {
            "type": "object",
            "properties": {
              "charge_at": {
                "type": "string"
              },
              "created_at": {
                "type": "string"
              },
              "cycle": {
                "type": "integer"
              },
              "discount_value": {
                "type": "number"
              },
              "id": {
                "type": "string"
              },
              "increment_value": {
                "type": "number"
              },
              "period_end": {
                "type": "string"
              },
              "period_start": {
                "type": "string"
              },
              "status": {
                "type": "string"
              },
              "tax_value": {
                "type": "string"
              },
              "tries": {
                "type": "string"
              },
              "try": {
                "type": "string"
              },
              "type": {
                "type": "string"
              },
              "value": {
                "type": "number"
              }
            }
          },
          "is_order_bump": {
            "type": "number",
            "example": 0
          },
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Product"
            }
          },
          "last_transaction": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "url": {
                "type": "string"
              }
            }
          },
          "payment": {
            "type": "object",
            "properties": {
              "affiliate_value": {
                "type": "number",
                "example": 0
              },
              "acquirer": {
                "type": "object",
                "properties": {
                  "code": {
                    "type": "string",
                    "example": ""
                  },
                  "message": {
                    "type": "string",
                    "example": ""
                  },
                  "name": {
                    "type": "string",
                    "example": ""
                  },
                  "tid": {
                    "type": "string",
                    "example": ""
                  }
                }
              },
              "can_try_again": {
                "type": "number",
                "example": 1
              },
              "coupon": {
                "nullable": true
              },
              "currency": {
                "type": "string",
                "example": "BRL"
              },
              "presentment_currency": {
                "type": "string",
                "description": "Moeda em que o comprador pagou o valor.",
                "example": "USD"
              },
              "discount_value": {
                "type": "number",
                "example": 0
              },
              "gross": {
                "type": "number",
                "example": 358.8
              },
              "installments": {
                "type": "object",
                "properties": {
                  "value": {
                    "type": "number",
                    "example": 71.76
                  },
                  "qty": {
                    "type": "number",
                    "example": 5
                  },
                  "interest": {
                    "type": "number",
                    "example": 0
                  }
                }
              },
              "marketplace_id": {
                "type": "string",
                "example": "ch_8BV4k2xHNmCVkmdf"
              },
              "marketplace_name": {
                "type": "string",
                "example": "mundipagg"
              },
              "marketplace_value": {
                "type": "number",
                "example": 0
              },
              "method": {
                "type": "string",
                "example": "credit_card"
              },
              "net": {
                "type": "number",
                "example": 358.8
              },
              "processing_times": {
                "type": "object",
                "properties": {
                  "started_at": {
                    "type": "string",
                    "example": ""
                  },
                  "finished_at": {
                    "type": "string",
                    "example": ""
                  },
                  "delay_in_seconds": {
                    "type": "string",
                    "example": ""
                  }
                }
              },
              "refund_reason": {
                "type": "string",
                "example": ""
              },
              "refuse_reason": {
                "type": "string",
                "example": "Stone|Aprovado"
              },
              "tax": {
                "type": "object",
                "properties": {
                  "value": {
                    "type": "number",
                    "example": 0
                  },
                  "rate": {
                    "type": "number",
                    "example": 0
                  }
                }
              },
              "total": {
                "type": "number",
                "example": 358.8
              },
              "credit_card": {
                "type": "object",
                "properties": {
                  "brand": {
                    "type": "string",
                    "example": "mastercard"
                  },
                  "expiration_month": {
                    "type": "string",
                    "example": ""
                  },
                  "expiration_year": {
                    "type": "string",
                    "example": ""
                  },
                  "first_digits": {
                    "type": "string",
                    "example": "552236"
                  },
                  "id": {
                    "type": "string",
                    "example": "card_LqYA750xUdc1no6R"
                  },
                  "last_digits": {
                    "type": "string",
                    "example": "4284"
                  }
                }
              }
            }
          },
          "product": {
            "$ref": "#/components/schemas/Product"
          },
          "self_attribution": {
            "type": "object",
            "properties": {
              "title": {
                "type": "string",
                "example": "Como você conheceu nosso produto?"
              },
              "answer": {
                "type": "string",
                "example": "google"
              }
            }
          },
          "shipment": {
            "type": "object",
            "properties": {
              "carrier": {
                "type": "string",
                "example": ""
              },
              "service": {
                "type": "string",
                "example": ""
              },
              "tracking": {
                "type": "string",
                "example": ""
              },
              "value": {
                "type": "number",
                "example": 0
              },
              "status": {
                "type": "string",
                "example": ""
              },
              "delivery_time": {
                "type": "string",
                "example": ""
              }
            }
          },
          "shipping": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "example": "Standard"
              },
              "value": {
                "type": "number",
                "example": 0
              }
            }
          },
          "status": {
            "type": "string",
            "example": "approved"
          },
          "subscription": {
            "type": "object",
            "properties": {
              "can_cancel": {
                "type": "number",
                "example": 1
              },
              "canceled_at": {
                "nullable": true
              },
              "charged_every_days": {
                "type": "number",
                "example": 360
              },
              "charged_times": {
                "type": "number",
                "example": 1
              },
              "id": {
                "type": "string",
                "example": "sub_RGpKLw1c2fj6ljo5"
              },
              "internal_id": {
                "type": "string",
                "example": "9333ee25-415e-42fd-aef8-db85184a62fe"
              },
              "last_status": {
                "type": "string",
                "example": "active"
              },
              "last_status_at": {
                "type": "number",
                "example": 1614042397
              },
              "name": {
                "type": "string",
                "example": "Produto de Teste"
              },
              "started_at": {
                "type": "number",
                "example": 1613952000
              },
              "subscription_code": {
                "type": "string",
                "example": "sub_RGpKLw1c2fj6ljo5"
              },
              "trial_days": {
                "type": "number",
                "example": 0
              },
              "trial_finished_at": {
                "nullable": true
              },
              "trial_started_at": {
                "nullable": true
              }
            }
          },
          "trackings": {
            "type": "object",
            "properties": {
              "source": {
                "nullable": true
              },
              "checkout_source": {
                "nullable": true
              },
              "utm_source": {
                "nullable": true
              },
              "utm_campaign": {
                "nullable": true
              },
              "utm_medium": {
                "nullable": true
              },
              "utm_content": {
                "nullable": true
              },
              "utm_term": {
                "nullable": true
              },
              "pptc": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "tracking_id": {
                      "type": "string"
                    },
                    "tracking_name": {
                      "type": "string"
                    },
                    "tracking_type": {
                      "type": "string"
                    },
                    "tracking_publisher": {
                      "type": "string"
                    },
                    "user_name": {
                      "type": "string"
                    },
                    "checkout_id": {
                      "type": "string"
                    },
                    "checkout_name": {
                      "type": "string"
                    },
                    "utm_campaign": {
                      "type": "string"
                    },
                    "utm_medium": {
                      "type": "string"
                    },
                    "utm_term": {
                      "type": "string"
                    },
                    "utm_content": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "type": {
            "type": "string",
            "example": "producer"
          }
        }
      },
      "TransactionList": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Transaction"
            }
          },
          "has_more_pages": {
            "type": "number",
            "example": 1
          },
          "next_cursor": {
            "type": "string",
            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"
          },
          "on_first_page": {
            "type": "number",
            "example": 1
          },
          "on_last_page": {
            "type": "number",
            "example": 0
          },
          "per_page": {
            "type": "number",
            "example": 50
          },
          "previous_cursor": {
            "type": "string",
            "example": 50
          },
          "total_rows": {
            "type": "number",
            "example": 256
          }
        }
      },
      "Product": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "example": "1614042397"
          },
          "image_url": {
            "type": "string",
            "example": ""
          },
          "internal_id": {
            "type": "string",
            "example": "9333d6a8-344a-4765-9397-c3f860289709"
          },
          "marketplace_id": {
            "type": "string",
            "example": "1614042397"
          },
          "marketplace_name": {
            "type": "string",
            "example": "mundipagg"
          },
          "name": {
            "type": "string",
            "example": "Produto de Teste"
          },
          "group": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "example": "a038a2c8-ef55-415e-b45d-3a5a3d6a74e6"
              },
              "name": {
                "type": "string",
                "example": "grupo 1"
              }
            }
          },
          "offer": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "name": {
                "type": "string"
              }
            }
          },
          "producer": {
            "type": "object",
            "properties": {
              "marketplace_id": {
                "type": "string",
                "example": "012345678901"
              },
              "name": {
                "type": "string",
                "example": "Producer Name"
              },
              "contact_email": {
                "type": "string",
                "example": "user@example.com"
              }
            }
          },
          "qty": {
            "type": "number",
            "example": 1
          },
          "total_value": {
            "type": "number",
            "example": 358.8
          },
          "type": {
            "type": "string",
            "example": "plan"
          },
          "unit_value": {
            "type": "number",
            "example": 358.8
          }
        }
      },
      "Activity": {
        "type": "object",
        "properties": {
          "activity_id": {
            "type": "string",
            "example": "9b67cdf6-9582-4aa6-a757-aefd0f9d7429,"
          },
          "queued_at": {
            "type": "number",
            "example": "1709634897,"
          },
          "started_at": {
            "type": "number",
            "example": "1709634897,"
          },
          "finished_at": {
            "type": "number",
            "example": "1709634897,"
          },
          "data": {
            "type": "string"
          },
          "transaction_id": {
            "type": "string",
            "example": "9b495283-ebb6-4014-8b7b-dadd91f6471d,"
          },
          "type": {
            "type": "string",
            "example": "invoice_transactional_email"
          },
          "created_at": {
            "type": "number",
            "example": 1709634897
          }
        }
      },
      "ActivityList": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Activity"
            }
          },
          "next_cursor": {
            "type": "string",
            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"
          },
          "on_first_page": {
            "type": "number",
            "example": 1
          },
          "on_last_page": {
            "type": "number",
            "example": 0
          },
          "per_page": {
            "type": "number",
            "example": 50
          }
        }
      },
      "EticketList": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Eticket"
            }
          },
          "has_more_pages": {
            "type": "number",
            "example": 1
          },
          "next_cursor": {
            "type": "string",
            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"
          },
          "on_first_page": {
            "type": "number",
            "example": 1
          },
          "on_last_page": {
            "type": "number",
            "example": 0
          },
          "per_page": {
            "type": "number",
            "example": 50
          },
          "previous_cursor": {
            "type": "string",
            "example": null
          },
          "total_rows": {
            "type": "number",
            "example": 256
          }
        }
      },
      "Eticket": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "example": "etkt_123456789"
          },
          "email": {
            "type": "string",
            "format": "email"
          },
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "phone_local_code": {
            "type": "string",
            "example": "55"
          },
          "phone_number": {
            "type": "string"
          },
          "product_name": {
            "type": "string"
          },
          "start_at": {
            "type": "integer",
            "format": "timestamp"
          },
          "status": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

# Users

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Users",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/users"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "A ação retorna uma coleção paginada de usuários.\nO valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do usuário",

            "schema": {

              "type": "string"

            },

            "example": "Nome do usuário"

          },

          {

            "name": "email",

            "in": "query",

            "description": "Email do usuário",

            "schema": {

              "type": "string"

            },

            "example": "user@example.com"

          },

          {

            "name": "is_admin",

            "description": "Define tipo de usuários. 0 - apenas não administradores, 1 - apenas administradores, all - todos os usuários (valor por defeito).",

            "in": "query",

            "schema": {

              "oneOf": [

                {

                  "type": "integer"

                },

                {

                  "type": "string"

                }

              ],

              "enum": [

                0,

                1,

                "all"

              ]

            },

            "example": 1

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/UserList"

                }

              }

            }

          }

        }

      }

    },

    "/{id}": {

      "get": {

        "summary": "Consultar (ID)",

        "description": "Pode consultar um usuário usando esta ação.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/UserId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/UserDetail"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Apagar usuário",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/UserId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "user_id": {

                    "type": "string",

                    "description": "Transferir propriedade para este usuário",

                    "example": "9a29ac9e-f192-4984-8873-75eb8027b608"

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK"

          }

        }

      }

    },

    "/{id}/activities": {

      "get": {

        "summary": "Atividades",

        "description": "Atividades do usuário. Devolve 50 items por página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/UserId"

          },

          {

            "name": "created_at_ini",

            "in": "query",

            "description": "Data inicial do período (formato YYYY-MM-DD). Obrigatória quando `created_at_end` é informada e deve ser menor ou igual a ela. O período máximo entre as datas é de 365 dias. Se nenhuma data for informada, retorna os últimos 6 meses.",

            "example": "2024-01-01",

            "schema": {

              "type": "string",

              "format": "date"

            }

          },

          {

            "name": "created_at_end",

            "in": "query",

            "description": "Data final do período (formato YYYY-MM-DD). Obrigatória quando `created_at_ini` é informada e deve ser maior ou igual a ela. O período máximo entre as datas é de 365 dias.",

            "example": "2024-06-30",

            "schema": {

              "type": "string",

              "format": "date"

            }

          },

          {

            "name": "offset",

            "in": "query",

            "schema": {

              "type": "integer"

            },

            "example": 50

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/ActivityList"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "UserId": {

        "name": "id",

        "in": "path",

        "description": "ID do usuário",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoiSm9hbyBTaWx2YSIsImlkIjoiOWEyOWFjOWUtZjE5Mi00OTg0LTg4NzMtNzllYjgwMjZhNjA4IiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ=="

      }

    },

    "schemas": {

      "UserList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/User"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoiSm9hbyBTaWx2YSIsImlkIjoiOWEyOWFjOWUtZjE5Mi00OTg0LTg4NzMtNzllYjgwMjZhNjA4IiwiX3BvaW50c1RvTmV4dEl0ZW1zIjp0cnVlfQ=="

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          },

          "total_rows": {

            "type": "number",

            "example": 25

          }

        }

      },

      "User": {

        "type": "object",

        "properties": {

          "email": {

            "type": "string",

            "example": "user@example.com"

          },

          "id": {

            "type": "string",

            "example": "9333ee25-64b5-4bd4-a0fd-4f35f95eb7cf"

          },

          "is_admin": {

            "type": "integer",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "name": {

            "type": "string",

            "example": "Nome do Usuário"

          },

          "roles": {

            "type": "array",

            "example": [

              "admin"

            ]

          },

          "two_factor_auth": {

            "type": "integer",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "two_factor_auth_type": {

            "type": "string",

            "enum": [

              "app",

              "email"

            ],

            "example": "email"

          }

        }

      },

      "UserDetail": {

        "type": "object",

        "properties": {

          "email": {

            "type": "string",

            "example": "user@example.com"

          },

          "email_is_deliverable": {

            "type": "integer",

            "enum": [

              0,

              1

            ],

            "example": 1

          },

          "id": {

            "type": "string",

            "example": "9333ee25-64b5-4bd4-a0fd-4f35f95eb7cf"

          },

          "is_admin": {

            "type": "integer",

            "enum": [

              0,

              1

            ],

            "example": 0

          },

          "name": {

            "type": "string",

            "example": "Nome do Usuário"

          },

          "roles": {

            "type": "array",

            "example": [

              "9ae2bf17-8f83-42ef-aff9-8d02d0f94047",

              "9dcb6d68-95ee-4f95-b70d-043ffeb77f56"

            ]

          },

          "settings": {

            "type": "object",

            "properties": {

              "approved_transactional_email": {

                "type": "integer",

                "enum": [

                  0,

                  1

                ],

                "example": "0,"

              },

              "daily_stats_email": {

                "type": "integer",

                "enum": [

                  0,

                  1

                ],

                "example": 0

              },

              "dark_mode": {

                "type": "integer",

                "enum": [

                  0,

                  1

                ],

                "example": "0,"

              },

              "language": {

                "type": "string",

                "example": "pt-pt"

              },

              "pending_transactional_email": {

                "type": "integer",

                "enum": [

                  0,

                  1

                ],

                "example": "0,"

              },

              "two_factor_auth": {

                "type": "integer",

                "enum": [

                  0,

                  1

                ],

                "example": 1

              },

              "two_factor_auth_type": {

                "type": "string",

                "enum": [

                  "app",

                  "email"

                ],

                "example": "email"

              },

              "can_use_mobile_app": {

                "type": "integer",

                "enum": [

                  0,

                  1

                ],

                "example": 1

              }

            }

          }

        }

      },

      "Activity": {

        "type": "object",

        "properties": {

          "activity_id": {

            "type": "string",

            "example": "9b67cdf6-9582-4aa6-a757-aefd0f9d7429,"

          },

          "causer": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "causer@example.com"

              },

              "id": {

                "type": "string",

                "example": "9b67cdf6-9582-4aa6-a757-aefd0f9d7439,"

              },

              "name": {

                "type": "string",

                "example": "Causer Name"

              }

            }

          },

          "created_at": {

            "type": "number",

            "example": "1709634897,"

          },

          "impersonator": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "nullable": true,

                "example": null

              },

              "id": {

                "type": "string",

                "nullable": true,

                "example": null

              },

              "name": {

                "type": "string",

                "nullable": true,

                "example": null

              }

            }

          },

          "infrastructure": {

            "type": "object",

            "properties": {

              "city": {

                "type": "string"

              },

              "city_lat_long": {

                "type": "string"

              },

              "cloud": {

                "type": "object",

                "properties": {

                  "instance": {

                    "type": "boolean",

                    "example": false

                  },

                  "memory": {

                    "type": "boolean",

                    "example": false

                  },

                  "project": {

                    "type": "boolean",

                    "example": false

                  },

                  "service": {

                    "type": "boolean",

                    "example": false

                  },

                  "version": {

                    "type": "boolean",

                    "example": false

                  }

                }

              },

              "country": {

                "type": "string",

                "example": "BR"

              },

              "facebook_browser_id": {

                "type": "string",

                "example": "fb.1.1743058215787.490398730526501705"

              },

              "ga_id": {

                "type": "string",

                "example": "GA1.1.1133700940.1643158215"

              },

              "ip": {

                "type": "string",

                "example": "127.0.0.1"

              },

              "region": {

                "type": "string",

                "example": ""

              },

              "user_agent": {

                "type": "string",

                "example": "user_agent_string"

              }

            }

          },

          "object_id": {

            "example": "9ae28dc0-11f9-48e4-8a1d-861bd265583f"

          },

          "type": {

            "type": "string",

            "example": "user_login"

          }

        }

      },

      "ActivityList": {

        "type": "array",

        "items": {

          "$ref": "#/components/schemas/Activity"

        }

      }

    }

  }

}
```

# Webhooks

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Webhooks",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/webhooks"

    }

  ],

  "paths": {

    "/": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de webhooks.\n\nO valor `total_rows` é apenas apresentado na primeira página.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "is_active",

            "in": "query",

            "example": 1,

            "schema": {

              "type": "number",

              "enum": [

                0,

                1

              ]

            }

          },

          {

            "name": "name",

            "in": "query",

            "example": "webhook name",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "type",

            "in": "query",

            "example": "transaction",

            "schema": {

              "type": "string",

              "enum": [

                "transaction",

                "subscription"

              ]

            }

          },

          {

            "name": "url",

            "in": "query",

            "example": "https://example.com",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/WebhookList"

                }

              }

            }

          }

        }

      }

    },

    "/{id}": {

      "get": {

        "summary": "Consultar",

        "description": "Consulta um webhook partir de seu código.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/WebhookId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Webhook"

                }

              }

            }

          }

        }

      }

    },

    "/{id}/activities": {

      "get": {

        "summary": "Atividades",

        "description": "Consulta as atividades de um webhook.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/WebhookId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "created_at_ini",

            "in": "query",

            "description": "Data inicial do período (formato YYYY-MM-DD). Obrigatória quando `created_at_end` é informada e deve ser menor ou igual a ela. O período máximo entre as datas é de 365 dias. Se nenhuma data for informada, retorna os últimos 6 meses.",

            "example": "2024-01-01",

            "schema": {

              "type": "string",

              "format": "date"

            }

          },

          {

            "name": "created_at_end",

            "in": "query",

            "description": "Data final do período (formato YYYY-MM-DD). Obrigatória quando `created_at_ini` é informada e deve ser maior ou igual a ela. O período máximo entre as datas é de 365 dias.",

            "example": "2024-06-30",

            "schema": {

              "type": "string",

              "format": "date"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/ActivityList"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "WebhookId": {

        "name": "id",

        "in": "path",

        "description": "ID do Webhook",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "Webhook": {

        "type": "object",

        "properties": {

          "associate_all": {

            "type": "number",

            "example": 0

          },

          "concurrent": {

            "type": "number",

            "example": 5

          },

          "created_at": {

            "type": "number",

            "example": 1707385000

          },

          "id": {

            "type": "string",

            "example": "9b4927a4-67d0-447b-bc3c-9755430f5c24"

          },

          "is_active": {

            "type": "number",

            "example": 1

          },

          "marketplaces": {

            "type": "array",

            "items": {

              "type": "string"

            },

            "example": [

              "marketplace 1",

              "marketplace 2"

            ]

          },

          "name": {

            "type": "string",

            "example": "Name"

          },

          "products": {

            "type": "array",

            "items": {

              "type": "string"

            },

            "example": [

              "9b4927a4-67d0-447b-bc3c-9755430f5c24",

              "9b4927a4-67d0-447b-bc3c-9755430f5c24"

            ]

          },

          "status": {

            "type": "array",

            "items": {

              "type": "string"

            },

            "example": [

              "active"

            ]

          },

          "type": {

            "type": "string",

            "example": "subscription"

          },

          "updated_at": {

            "type": "number",

            "example": "1708446187,"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          }

        }

      },

      "WebhookList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Webhook"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          },

          "previous_cursor": {

            "type": "string",

            "example": 50

          },

          "total_rows": {

            "type": "number",

            "example": 256

          }

        }

      },

      "Activity": {

        "type": "object",

        "properties": {

          "activity_id": {

            "type": "string",

            "example": "9b67cdf6-9582-4aa6-a757-aefd0f9d7429,"

          },

          "queued_at": {

            "type": "number",

            "example": "1709634897,"

          },

          "started_at": {

            "type": "number",

            "example": "1709634897,"

          },

          "finished_at": {

            "type": "number",

            "example": "1709634897,"

          },

          "data": {

            "type": "string"

          },

          "webhook_id": {

            "type": "string",

            "example": "9b495283-ebb6-4014-8b7b-dadd91f6471d,"

          },

          "type": {

            "type": "string",

            "example": "webhook_integration"

          },

          "created_at": {

            "type": "number",

            "example": 1709634897

          }

        }

      },

      "ActivityList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Activity"

            }

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 50

          }

        }

      }

    }

  }

}
```

# Trackings - Campaigns

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Trackings - Campaigns",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/trackings"

    }

  ],

  "paths": {

    "/campaigns": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de R.P.P.C.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "friendly_url",

            "in": "query",

            "description": "URL amigável",

            "example": "https://example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "group_id",

            "in": "query",

            "description": "ID do grupo",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "id",

            "in": "query",

            "description": "ID do R.P.P.C",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "is_active",

            "in": "query",

            "description": "Status do rastreamento, 0 para inativo, 1 para ativo",

            "schema": {

              "type": "integer",

              "enum": [

                "0",

                "1"

              ]

            }

          },

          {

            "name": "is_hidden",

            "in": "query",

            "description": "Visibilidade do rastreamento, 0 para oculto, 1 para visível",

            "schema": {

              "type": "integer",

              "enum": [

                "0",

                "1"

              ]

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do R.P.P.C.",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "publishers",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Origem",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "sources",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-anunciantes\">Anunciantes</a>",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "url",

            "in": "query",

            "description": "URL de destino",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Proprietário",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar",

        "description": "Cria um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/TrackingRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}": {

      "put": {

        "summary": "Atualizar",

        "description": "Atualiza um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        },

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/TrackingRequestBody"

              }

            }

          }

        }

      },

      "get": {

        "summary": "Consultar",

        "description": "Obter um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Apagar",

        "description": "Apagar um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/campaigns/{id}/activation": {

      "patch": {

        "summary": "Alterar activação",

        "description": "Alterar estado de activação do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "tracking_created"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/daily-clicks": {

      "get": {

        "summary": "Obter cliques diários",

        "description": "Obter cliques diários do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string",

              "nullable": true

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object",

                        "properties": {

                          "clicked_at": {

                            "type": "string"

                          },

                          "ttlClicks": {

                            "type": "number"

                          },

                          "ttlCheckout": {

                            "type": "number"

                          },

                          "ttlCost": {

                            "type": "number"

                          }

                        }

                      }

                    },

                    "has_more_pages": {

                      "type": "number",

                      "example": 1

                    },

                    "next_cursor": {

                      "type": "string",

                      "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

                    },

                    "on_first_page": {

                      "type": "number",

                      "example": 1

                    },

                    "on_last_page": {

                      "type": "number",

                      "example": 0

                    },

                    "per_page": {

                      "type": "number",

                      "example": 20

                    },

                    "previous_cursor": {

                      "type": "string",

                      "example": null

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/duplicate": {

      "post": {

        "summary": "Duplicar",

        "description": "Duplica R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/funnel": {

      "get": {

        "summary": "Funil",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "conversion": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object",

                            "properties": {

                              "id": {

                                "type": "string"

                              },

                              "name": {

                                "type": "string"

                              },

                              "all": {

                                "type": "number"

                              },

                              "valid": {

                                "type": "number"

                              },

                              "conversionRate": {

                                "type": "number"

                              }

                            }

                          }

                        },

                        "total": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "number"

                            },

                            "valid": {

                              "type": "number"

                            },

                            "convertionRate": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    },

                    "stats": {

                      "type": "object",

                      "properties": {

                        "sales": {

                          "$ref": "#/components/schemas/Sales"

                        },

                        "traffic": {

                          "$ref": "#/components/schemas/Traffic"

                        }

                      }

                    },

                    "trackings": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object",

                            "properties": {

                              "id": {

                                "type": "string"

                              },

                              "name": {

                                "type": "string"

                              },

                              "utm_campaign": {

                                "type": "string"

                              },

                              "utm_content": {

                                "type": "string"

                              },

                              "utm_medium": {

                                "type": "string"

                              },

                              "utm_term": {

                                "type": "string"

                              },

                              "sales": {

                                "$ref": "#/components/schemas/Sales"

                              },

                              "traffic": {

                                "$ref": "#/components/schemas/Traffic"

                              },

                              "cpa": {

                                "type": "number"

                              },

                              "cpc": {

                                "type": "number"

                              },

                              "roi": {

                                "type": "number"

                              }

                            }

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "$ref": "#/components/schemas/Sales"

                            },

                            "traffic": {

                              "$ref": "#/components/schemas/Traffic"

                            },

                            "cpa": {

                              "type": "number"

                            },

                            "cpc": {

                              "type": "number"

                            },

                            "roi": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/funnel/heatmap": {

      "get": {

        "summary": "Funil - Heatmap",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "days": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "max": {

                          "type": "number"

                        },

                        "min": {

                          "type": "number"

                        }

                      }

                    },

                    "weekdays": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "max": {

                          "type": "number"

                        },

                        "min": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/funnel/products": {

      "get": {

        "summary": "Funil - Produtos",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "object"

                    },

                    "qty_sales": {

                      "type": "number"

                    },

                    "qty_products": {

                      "type": "number"

                    },

                    "ttl_value": {

                      "type": "number"

                    },

                    "ttl_affiliate": {

                      "type": "number"

                    },

                    "ttl_netvalue": {

                      "type": "number"

                    },

                    "perc_net": {

                      "type": "number"

                    },

                    "permission": {

                      "type": "boolean"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/funnel/stats": {

      "get": {

        "summary": "Funil - Estatísticas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "dates": {

                      "type": "array",

                      "items": {

                        "type": "string"

                      }

                    },

                    "clicks": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "checkouts": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "sales": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "validSales": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "conversionRates": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "all": {

                      "type": "object",

                      "properties": {

                        "clicks": {

                          "type": "number"

                        },

                        "checkouts": {

                          "type": "number"

                        },

                        "sales": {

                          "type": "number"

                        },

                        "validSales": {

                          "type": "number"

                        },

                        "conversionRate": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/group": {

      "delete": {

        "summary": "Remove do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                },

                "example": {

                  "can_activate": 1,

                  "deletable": 0,

                  "group": null,

                  "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                  "is_active": 1,

                  "is_hidden": 0,

                  "name": "Nome do RPPC",

                  "product": {

                    "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                    "marketplace_id": "maketplace_id",

                    "marketplace_name": "marketplace_name",

                    "name": "product_name"

                  },

                  "public_url": "https://digitalmanager.guru/campaign/friendly-url",

                  "publisher": "publisher",

                  "source_field": "source_field",

                  "url": "https://example.com",

                  "user": {

                    "email": "user@example.com",

                    "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                    "name": "Nome do usuário"

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/leads": {

      "get": {

        "summary": "Leads",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "email": {

                        "type": "string",

                        "example": "user@example.com"

                      },

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1703151137

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/transactions": {

      "get": {

        "summary": "Vendas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "name": "ordered_at_ini",

            "in": "query",

            "required": true,

            "description": "Data de início",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "ordered_at_end",

            "in": "query",

            "required": true,

            "description": "Data de início",

            "example": "2023-12-31",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "transaction_status",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Estados das vendas</a>",

            "schema": {

              "type": "array"

            }

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/utms": {

      "get": {

        "summary": "UTMs",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/UtmList"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/visibility": {

      "patch": {

        "summary": "Alterar visibilidade",

        "description": "Alterar estado de visibilidade do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "TrackingId": {

        "name": "id",

        "in": "path",

        "description": "O ID do R.P.P.C",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "DateIni": {

        "name": "date_ini",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-01-01",

        "schema": {

          "type": "string"

        }

      },

      "DateEnd": {

        "name": "date_end",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-12-31",

        "schema": {

          "type": "string"

        }

      }

    },

    "schemas": {

      "TrackingRequestBody": {

        "type": "object",

        "description": "Os campos 'friendly_url' e 'src_field' são obrigatórios quando o campo 'traffic_splitting_id' não está presente.",

        "properties": {

          "friendly_url": {

            "type": "string",

            "example": "friendly-url"

          },

          "group_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "src_field": {

            "type": "string",

            "example": "src_field"

          },

          "traffic_splitting_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          }

        },

        "required": [

          "name",

          "product_id",

          "publisher",

          "url"

        ]

      },

      "Tracking": {

        "type": "object",

        "properties": {

          "can_activate": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Group Name"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "maketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "marketplace_name"

              },

              "name": {

                "type": "string",

                "example": "product_name"

              }

            }

          },

          "public_url": {

            "type": "string",

            "example": "https://digitalmanager.guru/campaign/friendly-url"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "source_field": {

            "type": "string",

            "example": "source_field"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          }

        }

      },

      "TrackingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Tracking"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Sales": {

        "type": "object",

        "properties": {

          "all": {

            "type": "object",

            "properties": {

              "qty": {

                "type": "number"

              },

              "total": {

                "type": "number"

              },

              "max": {

                "type": "number"

              },

              "avg": {

                "type": "number"

              },

              "min": {

                "type": "number"

              }

            }

          },

          "valid": {

            "type": "object",

            "properties": {

              "qty": {

                "type": "number"

              },

              "total": {

                "type": "number"

              },

              "max": {

                "type": "number"

              },

              "avg": {

                "type": "number"

              },

              "min": {

                "type": "number"

              }

            }

          }

        }

      },

      "Traffic": {

        "type": "object",

        "properties": {

          "clicks": {

            "type": "number"

          },

          "checkouts": {

            "type": "number"

          },

          "cost": {

            "type": "number"

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "client_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Product Name"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "qty": {

                "type": "number",

                "example": 1

              }

            }

          },

          "marketplace": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "name": {

                "type": "string",

                "example": "Marketplace Name"

              }

            }

          },

          "has_tracking": {

            "type": "number",

            "example": 1

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "payment_type": {

            "type": "string",

            "example": "credit_card"

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "ordered_at": {

            "type": "number",

            "example": 1703151137

          },

          "value": {

            "type": "number",

            "example": "9.99"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Utm": {

        "type": "object",

        "properties": {

          "created_at": {

            "type": "string",

            "example": 1703151137

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "total_clicks": {

            "type": "number",

            "example": 1

          },

          "updated_at": {

            "type": "number",

            "example": 1703151137

          },

          "utm_campaign": {

            "type": "string"

          },

          "utm_content": {

            "type": "string"

          },

          "utm_medium": {

            "type": "string"

          },

          "utm_term": {

            "type": "string"

          }

        }

      },

      "UtmList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Utm"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# Trackings - Checkouts

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Trackings - Checkouts",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/trackings"

    }

  ],

  "paths": {

    "/checkouts": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de R.P.P.C.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "friendly_url",

            "in": "query",

            "description": "URL amigável",

            "example": "https://example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "group_id",

            "in": "query",

            "description": "ID do grupo",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "id",

            "in": "query",

            "description": "ID do R.P.P.C",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "is_active",

            "in": "query",

            "description": "Status do rastreamento, 0 para inativo, 1 para ativo",

            "schema": {

              "type": "integer",

              "enum": [

                "0",

                "1"

              ]

            }

          },

          {

            "name": "is_hidden",

            "in": "query",

            "description": "Visibilidade do rastreamento, 0 para oculto, 1 para visível",

            "schema": {

              "type": "integer",

              "enum": [

                "0",

                "1"

              ]

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do R.P.P.C.",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "publishers",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Origem",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "sources",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-anunciantes\">Anunciantes</a>",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "url",

            "in": "query",

            "description": "URL de destino",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Proprietário",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar",

        "description": "Cria um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/TrackingRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}": {

      "put": {

        "summary": "Atualizar",

        "description": "Atualiza o R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/TrackingRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      },

      "get": {

        "summary": "Consultar",

        "description": "Obter um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Apagar",

        "description": "Apagar um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/checkouts/{id}/activation": {

      "patch": {

        "summary": "Alterar activação",

        "description": "Alterar estado de activação do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "tracking_created"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/daily-clicks": {

      "get": {

        "summary": "Obter cliques diários",

        "description": "Obter cliques diários do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string",

              "nullable": true

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object",

                        "properties": {

                          "clicked_at": {

                            "type": "string"

                          },

                          "ttlClicks": {

                            "type": "number"

                          },

                          "ttlCheckout": {

                            "type": "number"

                          },

                          "ttlCost": {

                            "type": "number"

                          }

                        }

                      }

                    },

                    "has_more_pages": {

                      "type": "number",

                      "example": 1

                    },

                    "next_cursor": {

                      "type": "string",

                      "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

                    },

                    "on_first_page": {

                      "type": "number",

                      "example": 1

                    },

                    "on_last_page": {

                      "type": "number",

                      "example": 0

                    },

                    "per_page": {

                      "type": "number",

                      "example": 20

                    },

                    "previous_cursor": {

                      "type": "string",

                      "example": null

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/duplicate": {

      "post": {

        "summary": "Duplicar",

        "description": "Duplica R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/group": {

      "delete": {

        "summary": "Remove do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                },

                "example": {

                  "can_activate": 1,

                  "deletable": 0,

                  "group": null,

                  "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                  "is_active": 1,

                  "is_hidden": 0,

                  "name": "Nome do RPPC",

                  "product": {

                    "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                    "marketplace_id": "maketplace_id",

                    "marketplace_name": "marketplace_name",

                    "name": "product_name"

                  },

                  "public_url": "https://digitalmanager.guru/campaign/friendly-url",

                  "publisher": "publisher",

                  "source_field": "source_field",

                  "url": "https://example.com",

                  "user": {

                    "email": "user@example.com",

                    "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                    "name": "Nome do usuário"

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/leads": {

      "get": {

        "summary": "Leads",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "email": {

                        "type": "string",

                        "example": "user@example.com"

                      },

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1703151137

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/stats": {

      "get": {

        "summary": "Estatísticas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "dates": {

                      "type": "array",

                      "items": {

                        "type": "string"

                      }

                    },

                    "clicks": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "sales": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "validSales": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "conversionRates": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "all": {

                      "type": "object",

                      "properties": {

                        "clicks": {

                          "type": "number"

                        },

                        "sales": {

                          "type": "number"

                        },

                        "validSales": {

                          "type": "number"

                        },

                        "conversionRate": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/stats/heatmap": {

      "get": {

        "summary": "Estatísticas - Heatmap",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "days": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "max": {

                          "type": "number"

                        },

                        "min": {

                          "type": "number"

                        }

                      }

                    },

                    "weekdays": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "max": {

                          "type": "number"

                        },

                        "min": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/stats/sources": {

      "get": {

        "summary": "Estatísticas - Sources",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "trackings": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "all": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "type": "number"

                            },

                            "value": {

                              "type": "number"

                            },

                            "products": {

                              "type": "number"

                            }

                          }

                        },

                        "valid": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "type": "number"

                            },

                            "value": {

                              "type": "number"

                            },

                            "products": {

                              "type": "number"

                            }

                          }

                        },

                        "conversionRate": {

                          "type": "number"

                        }

                      }

                    },

                    "publishers": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "all": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "type": "number"

                            },

                            "value": {

                              "type": "number"

                            },

                            "products": {

                              "type": "number"

                            }

                          }

                        },

                        "valid": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "type": "number"

                            },

                            "value": {

                              "type": "number"

                            },

                            "products": {

                              "type": "number"

                            }

                          }

                        },

                        "conversionRate": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/transactions": {

      "get": {

        "summary": "Vendas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "transaction_status",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Estados das vendas</a>",

            "schema": {

              "type": "array"

            }

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/visibility": {

      "patch": {

        "summary": "Alterar visibilidade",

        "description": "Alterar estado de visibilidade do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "TrackingId": {

        "name": "id",

        "in": "path",

        "description": "O ID do R.P.P.C",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "DateIni": {

        "name": "date_ini",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-01-01",

        "schema": {

          "type": "string"

        }

      },

      "DateEnd": {

        "name": "date_end",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-12-31",

        "schema": {

          "type": "string"

        }

      }

    },

    "schemas": {

      "TrackingRequestBody": {

        "type": "object",

        "description": "Os campos 'friendly_url' e 'src_field' são obrigatórios quando o campo 'traffic_splitting_id' não está presente.",

        "properties": {

          "friendly_url": {

            "type": "string",

            "example": "friendly-url"

          },

          "group_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "src_field": {

            "type": "string",

            "example": "src_field"

          },

          "traffic_splitting_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          }

        },

        "required": [

          "name",

          "product_id",

          "publisher",

          "url"

        ]

      },

      "Tracking": {

        "type": "object",

        "properties": {

          "can_activate": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Group Name"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "maketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "marketplace_name"

              },

              "name": {

                "type": "string",

                "example": "product_name"

              }

            }

          },

          "public_url": {

            "type": "string",

            "example": "https://digitalmanager.guru/campaign/friendly-url"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "source_field": {

            "type": "string",

            "example": "source_field"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          }

        }

      },

      "TrackingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Tracking"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "client_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Product Name"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "qty": {

                "type": "number",

                "example": 1

              }

            }

          },

          "marketplace": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "name": {

                "type": "string",

                "example": "Marketplace Name"

              }

            }

          },

          "has_tracking": {

            "type": "number",

            "example": 1

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "payment_type": {

            "type": "string",

            "example": "credit_card"

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "ordered_at": {

            "type": "number",

            "example": 1703151137

          },

          "value": {

            "type": "number",

            "example": "9.99"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# Trackings - Forms

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Trackings - Forms",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/trackings"

    }

  ],

  "paths": {

    "/forms": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de R.P.P.C.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "friendly_url",

            "in": "query",

            "description": "URL amigável",

            "example": "https://example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "group_id",

            "in": "query",

            "description": "ID do grupo",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "id",

            "in": "query",

            "description": "ID do R.P.P.C",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "is_active",

            "in": "query",

            "description": "Status do rastreamento, 0 para inativo, 1 para ativo",

            "schema": {

              "type": "integer",

              "enum": [

                "0",

                "1"

              ]

            }

          },

          {

            "name": "is_hidden",

            "in": "query",

            "description": "Visibilidade do rastreamento, 0 para oculto, 1 para visível",

            "schema": {

              "type": "integer",

              "enum": [

                "0",

                "1"

              ]

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do R.P.P.C.",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "publishers",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Origem",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "sources",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-anunciantes\">Anunciantes</a>",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "url",

            "in": "query",

            "description": "URL de destino",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Proprietário",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar",

        "description": "Cria um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/TrackingRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/forms/{id}": {

      "put": {

        "summary": "Atualizar",

        "description": "Atualiza o R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/TrackingRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      },

      "get": {

        "summary": "Consultar",

        "description": "Obter um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Apagar",

        "description": "Apagar um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/forms/{id}/activation": {

      "patch": {

        "summary": "Alterar activação",

        "description": "Alterar estado de activação do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/forms/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "tracking_created"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/forms/{id}/daily-clicks": {

      "get": {

        "summary": "Obter cliques diários",

        "description": "Obter cliques diários do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "name": "cursor",

            "in": "query",

            "description": "O cursor da página",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9",

            "schema": {

              "type": "string",

              "nullable": true

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object",

                        "properties": {

                          "clicked_at": {

                            "type": "string"

                          },

                          "ttlClicks": {

                            "type": "number"

                          },

                          "ttlCheckout": {

                            "type": "number"

                          },

                          "ttlCost": {

                            "type": "number"

                          }

                        }

                      }

                    },

                    "has_more_pages": {

                      "type": "number",

                      "example": 1

                    },

                    "next_cursor": {

                      "type": "string",

                      "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

                    },

                    "on_first_page": {

                      "type": "number",

                      "example": 1

                    },

                    "on_last_page": {

                      "type": "number",

                      "example": 0

                    },

                    "per_page": {

                      "type": "number",

                      "example": 20

                    },

                    "previous_cursor": {

                      "type": "string",

                      "example": null

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/forms/{id}/duplicate": {

      "post": {

        "summary": "Duplicar",

        "description": "Duplica R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/forms/{id}/group": {

      "delete": {

        "summary": "Remove do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                },

                "example": {

                  "can_activate": 1,

                  "deletable": 0,

                  "group": null,

                  "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                  "is_active": 1,

                  "is_hidden": 0,

                  "name": "Nome do RPPC",

                  "product": {

                    "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                    "marketplace_id": "maketplace_id",

                    "marketplace_name": "marketplace_name",

                    "name": "product_name"

                  },

                  "public_url": "https://digitalmanager.guru/campaign/friendly-url",

                  "publisher": "publisher",

                  "source_field": "source_field",

                  "url": "https://example.com",

                  "user": {

                    "email": "user@example.com",

                    "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                    "name": "Nome do usuário"

                  }

                }

              }

            }

          }

        }

      }

    },

    "/forms/{id}/leads": {

      "get": {

        "summary": "Leads",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "email": {

                        "type": "string",

                        "example": "user@example.com"

                      },

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1703151137

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/forms/{id}/stats": {

      "get": {

        "summary": "Estatísticas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "dates": {

                      "type": "array",

                      "items": {

                        "type": "string"

                      }

                    },

                    "leads": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "all": {

                      "type": "object",

                      "properties": {

                        "leads": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/forms/{id}/visibility": {

      "patch": {

        "summary": "Alterar visibilidade",

        "description": "Alterar estado de visibilidade do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "TrackingId": {

        "name": "id",

        "in": "path",

        "description": "O ID do R.P.P.C",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "DateIni": {

        "name": "date_ini",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-01-01",

        "schema": {

          "type": "string"

        }

      },

      "DateEnd": {

        "name": "date_end",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-12-31",

        "schema": {

          "type": "string"

        }

      }

    },

    "schemas": {

      "TrackingRequestBody": {

        "type": "object",

        "properties": {

          "facebook_pixels": {

            "type": "array",

            "example": []

          },

          "forward_url_params": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "group_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          }

        },

        "required": [

          "name",

          "product_id",

          "publisher",

          "url"

        ]

      },

      "Tracking": {

        "type": "object",

        "properties": {

          "can_activate": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "forward_url_params": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Group Name"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "maketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "marketplace_name"

              },

              "name": {

                "type": "string",

                "example": "product_name"

              }

            }

          },

          "public_url": {

            "type": "string"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "source_field": {

            "type": "string",

            "example": "source_field"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          }

        }

      },

      "TrackingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Tracking"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# Trackings - Groups

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Trackings - Groups",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/trackings"

    }

  ],

  "paths": {

    "/groups": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de grupos.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do grupo.",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Proprietário",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/GroupList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar",

        "description": "Cria um grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/GroupRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Group"

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}": {

      "put": {

        "summary": "Atualizar",

        "description": "Atualiza o grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/GroupRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Group"

                }

              }

            }

          }

        }

      },

      "get": {

        "summary": "Consultar",

        "description": "Obter um grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Group"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Apagar",

        "description": "Apagar um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/groups/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "tracking_created"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/campaigns": {

      "get": {

        "summary": "Obter vendas",

        "description": "Obter vendas do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Adiciona R.P.P.C",

        "description": "Adiciona R.P.P.C de vendas ao grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "trackings": {

                    "type": "array",

                    "items": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "status": {

                      "type": "string",

                      "example": "success"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/campaigns/{tracking_id}": {

      "delete": {

        "summary": "Remover R.P.P.C do grupo",

        "description": "Remover R.P.P.C de vendas do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/groups/{id}/checkouts": {

      "get": {

        "summary": "Obter checkouts",

        "description": "Obter checkouts do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Adiciona R.P.P.C",

        "description": "Adiciona R.P.P.C de checkouts ao grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "trackings": {

                    "type": "array",

                    "items": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "status": {

                      "type": "string",

                      "example": "success"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/checkouts/{tracking_id}": {

      "delete": {

        "summary": "Remover R.P.P.C do grupo",

        "description": "Remover R.P.P.C de checkouts do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/groups/{id}/dashboards/transactions/contacts": {

      "get": {

        "summary": "Contactos",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "count": {

                      "type": "number",

                      "example": 50

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/dashboards/transactions/conversions": {

      "get": {

        "summary": "Conversões",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object"

                      }

                    },

                    "total": {

                      "type": "object",

                      "properties": {

                        "all": {

                          "type": "number"

                        },

                        "valid": {

                          "type": "number"

                        },

                        "conversionRate": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/dashboards/transactions/products": {

      "get": {

        "summary": "Produtos",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object"

                      }

                    },

                    "ttl_value": {

                      "type": "number"

                    },

                    "ttl_affiliate": {

                      "type": "number"

                    },

                    "ttl_netvalue": {

                      "type": "number"

                    },

                    "perc_net": {

                      "type": "number"

                    },

                    "permission": {

                      "type": "boolean"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/dashboards/transactions/refunds": {

      "get": {

        "summary": "Reembolsos",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "count": {

                      "type": "number"

                    },

                    "value": {

                      "type": "number"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/dashboards/transactions/sales-graph": {

      "get": {

        "summary": "Vendas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "days": {

                      "type": "array",

                      "items": {

                        "type": "string"

                      }

                    },

                    "ttlSales": {

                      "type": "number"

                    },

                    "ttlNet": {

                      "type": "number"

                    },

                    "ttlQty": {

                      "type": "number"

                    },

                    "qtys": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "values": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "netValues": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "salesQty": {

                      "type": "number"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/duplicate": {

      "post": {

        "summary": "Duplicar",

        "description": "Duplica grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "name": "sufix",

            "in": "query",

            "required": true,

            "description": "Sufixo",

            "example": "(Cópia)",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "user_id",

            "in": "query",

            "required": true,

            "description": "Usuário",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Group"

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/forms": {

      "get": {

        "summary": "Obter R.P.P.C de forms",

        "description": "Obter R.P.P.C de forms do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Adiciona R.P.P.C",

        "description": "Adiciona R.P.P.C de forms ao grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "trackings": {

                    "type": "array",

                    "items": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "status": {

                      "type": "string",

                      "example": "success"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/forms/{tracking_id}": {

      "delete": {

        "summary": "Remover R.P.P.C do grupo",

        "description": "Remover R.P.P.C de forms do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/groups/{id}/leads": {

      "get": {

        "summary": "Obter R.P.P.C de leads",

        "description": "Obter R.P.P.C de leads do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Adiciona R.P.P.C",

        "description": "Adiciona R.P.P.C de leads ao grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "trackings": {

                    "type": "array",

                    "items": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "status": {

                      "type": "string",

                      "example": "success"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/leads/{tracking_id}": {

      "delete": {

        "summary": "Remover R.P.P.C de leads do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/groups/{id}/traffic-splittings/campaigns": {

      "get": {

        "summary": "Obter testes AB de vendas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Adicionar teste AB de vendas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "trackings": {

                    "type": "array",

                    "items": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "status": {

                      "type": "string",

                      "example": "success"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/traffic-splittings/campaigns/{traffic_splitting_id}": {

      "delete": {

        "summary": "Remover teste AB de vendas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/groups/{id}/traffic-splittings/checkouts": {

      "get": {

        "summary": "Obter testes AB de checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Adicionar teste AB de checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "trackings": {

                    "type": "array",

                    "items": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "status": {

                      "type": "string",

                      "example": "success"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/traffic-splittings/checkouts/{traffic_splitting_id}": {

      "delete": {

        "summary": "Remover teste AB de checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/groups/{id}/traffic-splittings/leads": {

      "get": {

        "summary": "Obter testes AB de leads",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Adicionar teste AB de leads",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "trackings": {

                    "type": "array",

                    "items": {

                      "type": "string"

                    }

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "status": {

                      "type": "string",

                      "example": "success"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/groups/{id}/traffic-splittings/leads/{traffic_splitting_id}": {

      "delete": {

        "summary": "Remover teste AB de leads",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/groups/{id}/transactions": {

      "get": {

        "summary": "Obter a lista de vendas",

        "description": "Um (e apenas um) par de datas [cancelled_at, confirmed_at ou ordered_at] deve estar presente no request.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/GroupId"

          },

          {

            "name": "cancelled_at_ini",

            "in": "query",

            "required": false,

            "description": "Cancelada - Data de início",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "cancelled_at_end",

            "in": "query",

            "required": false,

            "description": "Cancelada - Data de final",

            "example": "2023-12-31",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "confirmed_at_ini",

            "in": "query",

            "required": false,

            "description": "Aprovada - Data de início",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "confirmed_at_end",

            "in": "query",

            "required": false,

            "description": "Aprovada - Data de final",

            "example": "2023-12-31",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "ordered_at_ini",

            "in": "query",

            "required": false,

            "description": "Criada - Data de início",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "ordered_at_end",

            "in": "query",

            "required": false,

            "description": "Criada - Data de final",

            "example": "2023-12-31",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "currencies",

            "in": "query",

            "required": false,

            "description": "Moeda",

            "example": "BRL",

            "schema": {

              "type": "array"

            }

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "transaction_status",

            "in": "query",

            "required": false,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Status</a>",

            "example": "approved",

            "schema": {

              "type": "array"

            }

          },

          {

            "name": "payment_type",

            "in": "query",

            "required": false,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-formas-pagamento\">Formas de Pagamento</a>",

            "example": "credit_card",

            "schema": {

              "type": "array"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "required": false,

            "description": "Produtos",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "contact_name",

            "in": "query",

            "required": false,

            "description": "Nome do Contacto",

            "example": "Nome do Contacto",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "contact_email",

            "in": "query",

            "required": false,

            "description": "Email do Contacto",

            "example": "user@example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "contact_doc",

            "in": "query",

            "required": false,

            "description": "Documento do Contacto",

            "example": "999999999",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "affiliation_option",

            "in": "query",

            "required": false,

            "description": "Vendas com afiliação",

            "example": "all",

            "schema": {

              "type": "string",

              "enum": [

                "all",

                "with",

                "without"

              ]

            }

          },

          {

            "name": "affiliation_name",

            "in": "query",

            "required": false,

            "description": "Nome do Afiliado",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "affiliation_marketplace_id",

            "in": "query",

            "required": false,

            "description": "Afiliação",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "GroupId": {

        "name": "id",

        "in": "path",

        "description": "O ID do grupo",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "TrackingId": {

        "name": "tracking_id",

        "in": "path",

        "description": "O ID do R.P.P.C",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "TrafficSplittingId": {

        "name": "traffic_splitting_id",

        "in": "path",

        "description": "O ID do Traffic Splitting",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "DateIni": {

        "name": "date_ini",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-01-01",

        "schema": {

          "type": "string"

        }

      },

      "DateEnd": {

        "name": "date_end",

        "in": "query",

        "required": true,

        "description": "Data de final",

        "example": "2023-12-31",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "GroupRequestBody": {

        "type": "object",

        "properties": {

          "name": {

            "type": "string",

            "example": "Nome do Grupo"

          },

          "product_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "custom_domain": {

            "type": "string",

            "example": "https://example.com"

          }

        }

      },

      "Group": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "name": {

            "type": "string",

            "example": "Nome do Grupo"

          },

          "custom_domain": {

            "type": "string",

            "example": "https://example.com"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "markeplace_name"

              },

              "name": {

                "type": "string",

                "example": "Product name"

              }

            }

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          },

          "tracking_count": {

            "type": "number"

          },

          "traffic_splitting_id": {

            "type": "number"

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          }

        }

      },

      "GroupList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Group"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Tracking": {

        "type": "object",

        "properties": {

          "can_activate": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Group Name"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "maketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "marketplace_name"

              },

              "name": {

                "type": "string",

                "example": "product_name"

              }

            }

          },

          "public_url": {

            "type": "string",

            "example": "https://digitalmanager.guru/campaign/friendly-url"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "source_field": {

            "type": "string",

            "example": "source_field"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          }

        }

      },

      "TrackingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Tracking"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "TrafficSplitting": {

        "type": "object",

        "properties": {

          "active_trackings_count": {

            "type": "number"

          },

          "conversion_window": {

            "type": "number"

          },

          "deletable": {

            "type": "number",

            "enum": [

              0,

              1

            ]

          },

          "id": {

            "type": "string"

          },

          "inactive_trackings_count": {

            "type": "number"

          },

          "is_active": {

            "type": "number",

            "enum": [

              0,

              1

            ]

          },

          "learning_rate": {

            "type": "number"

          },

          "min_learning_rate": {

            "type": "number"

          },

          "name": {

            "type": "string"

          },

          "publisher": {

            "type": "string"

          },

          "url": {

            "type": "string"

          }

        }

      },

      "TrafficSplittingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/TrafficSplitting"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "client_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Product Name"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "qty": {

                "type": "number",

                "example": 1

              }

            }

          },

          "marketplace": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "name": {

                "type": "string",

                "example": "Marketplace Name"

              }

            }

          },

          "has_tracking": {

            "type": "number",

            "example": 1

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "payment_type": {

            "type": "string",

            "example": "credit_card"

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "ordered_at": {

            "type": "number",

            "example": 1703151137

          },

          "value": {

            "type": "number",

            "example": "9.99"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# Trackings - Leads

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Trackings - Leads",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/trackings"

    }

  ],

  "paths": {

    "/leads": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de R.P.P.C.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "friendly_url",

            "in": "query",

            "description": "URL amigável",

            "example": "https://example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "group_id",

            "in": "query",

            "description": "ID do grupo",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "id",

            "in": "query",

            "description": "ID do R.P.P.C",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "is_active",

            "in": "query",

            "description": "Status do rastreamento, 0 para inativo, 1 para ativo",

            "schema": {

              "type": "integer",

              "enum": [

                "0",

                "1"

              ]

            }

          },

          {

            "name": "is_hidden",

            "in": "query",

            "description": "Visibilidade do rastreamento, 0 para oculto, 1 para visível",

            "schema": {

              "type": "integer",

              "enum": [

                "0",

                "1"

              ]

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do R.P.P.C.",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "publishers",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Origem",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "sources",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-anunciantes\">Anunciantes</a>",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "url",

            "in": "query",

            "description": "URL de destino",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Proprietário",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      },

      "post": {

        "summary": "Criar",

        "description": "Cria um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/TrackingRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}": {

      "put": {

        "summary": "Atualizar",

        "description": "Atualiza o R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "$ref": "#/components/schemas/TrackingRequestBody"

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      },

      "get": {

        "summary": "Consultar",

        "description": "Obter um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      },

      "delete": {

        "summary": "Apagar",

        "description": "Apagar um R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "204": {

            "description": "No Content"

          }

        }

      }

    },

    "/leads/{id}/activation": {

      "patch": {

        "summary": "Alterar activação",

        "description": "Alterar estado de activação do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "tracking_created"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/daily-clicks": {

      "get": {

        "summary": "Obter cliques diários",

        "description": "Obter cliques diários do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object",

                        "properties": {

                          "clicked_at": {

                            "type": "string"

                          },

                          "ttlClicks": {

                            "type": "number"

                          },

                          "ttlCheckout": {

                            "type": "number"

                          },

                          "ttlCost": {

                            "type": "number"

                          }

                        }

                      }

                    },

                    "has_more_pages": {

                      "type": "number",

                      "example": 1

                    },

                    "next_cursor": {

                      "type": "string",

                      "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

                    },

                    "on_first_page": {

                      "type": "number",

                      "example": 1

                    },

                    "on_last_page": {

                      "type": "number",

                      "example": 0

                    },

                    "per_page": {

                      "type": "number",

                      "example": 20

                    },

                    "previous_cursor": {

                      "type": "string",

                      "example": null

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/duplicate": {

      "post": {

        "summary": "Duplicar",

        "description": "Duplica R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/funnel": {

      "get": {

        "summary": "Funil",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "conversion": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object",

                            "properties": {

                              "id": {

                                "type": "string"

                              },

                              "utm_campaing": {

                                "type": "string"

                              },

                              "utm_content": {

                                "type": "string"

                              },

                              "utm_medium": {

                                "type": "string"

                              },

                              "utm_term": {

                                "type": "string"

                              },

                              "traffic": {

                                "type": "object",

                                "properties": {

                                  "clicks": {

                                    "type": "number"

                                  },

                                  "leads": {

                                    "type": "number"

                                  },

                                  "new_leads": {

                                    "type": "number"

                                  },

                                  "cost": {

                                    "type": "number"

                                  }

                                }

                              },

                              "cpl": {

                                "type": "number"

                              },

                              "cpl_new": {

                                "type": "number"

                              },

                              "cpc": {

                                "type": "number"

                              }

                            }

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "traffic": {

                              "type": "object",

                              "properties": {

                                "clicks": {

                                  "type": "number"

                                },

                                "leads": {

                                  "type": "number"

                                },

                                "new_leads": {

                                  "type": "number"

                                },

                                "cost": {

                                  "type": "number"

                                }

                              }

                            },

                            "cpl": {

                              "type": "number"

                            },

                            "cpl_new": {

                              "type": "number"

                            },

                            "cpc": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/funnel/stats": {

      "get": {

        "summary": "Funnel - Estatísticas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "dates": {

                      "type": "array",

                      "items": {

                        "type": "string"

                      }

                    },

                    "clicks": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "leads": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "new_leads": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "conversionRates": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "all": {

                      "type": "object",

                      "properties": {

                        "clicks": {

                          "type": "number"

                        },

                        "leads": {

                          "type": "number"

                        },

                        "new_leads": {

                          "type": "number"

                        },

                        "conversionRate": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/funnel/conversion": {

      "get": {

        "summary": "Funnel - Janela de Conversão",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "conversionWindow": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "x": {

                          "type": "object",

                          "properties": {

                            "max": {

                              "type": "number"

                            },

                            "avg": {

                              "type": "number"

                            },

                            "min": {

                              "type": "number"

                            }

                          }

                        },

                        "y": {

                          "type": "object",

                          "properties": {

                            "max": {

                              "type": "number"

                            },

                            "avg": {

                              "type": "number"

                            },

                            "min": {

                              "type": "number"

                            }

                          }

                        },

                        "inside": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            }

                          }

                        }

                      }

                    },

                    "paymentConversion": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "total": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "number"

                            },

                            "valid": {

                              "type": "number"

                            },

                            "conversionRate": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    },

                    "publishers": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            }

                          }

                        }

                      }

                    },

                    "sources": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            }

                          }

                        }

                      }

                    },

                    "trackings": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            }

                          }

                        }

                      }

                    },

                    "totals": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "qtyLeadsCaptured": {

                              "type": "number"

                            },

                            "ttlTrafficCost": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/group": {

      "delete": {

        "summary": "Remove do grupo",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                },

                "example": {

                  "can_activate": 1,

                  "deletable": 0,

                  "group": null,

                  "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                  "is_active": 1,

                  "is_hidden": 0,

                  "name": "Nome do RPPC",

                  "product": {

                    "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                    "marketplace_id": "maketplace_id",

                    "marketplace_name": "marketplace_name",

                    "name": "product_name"

                  },

                  "public_url": "https://digitalmanager.guru/campaign/friendly-url",

                  "publisher": "publisher",

                  "source_field": "source_field",

                  "url": "https://example.com",

                  "user": {

                    "email": "user@example.com",

                    "id": "6e46401e-abad-4c06-8657-d84d447becbf",

                    "name": "Nome do usuário"

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/leads": {

      "get": {

        "summary": "Leads",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "email": {

                        "type": "string",

                        "example": "user@example.com"

                      },

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1703151137

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/transactions": {

      "get": {

        "summary": "Vendas",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "transaction_status",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Estados das vendas</a>",

            "schema": {

              "type": "array"

            }

          },

          {

            "$ref": "#/components/parameters/Cursor"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/utms": {

      "get": {

        "summary": "UTMs",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/UtmList"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/visibility": {

      "patch": {

        "summary": "Alterar visibilidade",

        "description": "Alterar estado de visibilidade do R.P.P.C",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrackingId"

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/Tracking"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "TrackingId": {

        "name": "id",

        "in": "path",

        "description": "O ID do R.P.P.C",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "DateIni": {

        "name": "date_ini",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-01-01",

        "schema": {

          "type": "string"

        }

      },

      "DateEnd": {

        "name": "date_end",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-12-31",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "TrackingRequestBody": {

        "type": "object",

        "description": "Os campos 'friendly_url' e 'src_field' são obrigatórios quando o campo 'traffic_splitting_id' não está presente.",

        "properties": {

          "friendly_url": {

            "type": "string",

            "example": "friendly-url"

          },

          "group_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "src_field": {

            "type": "string",

            "example": "src_field"

          },

          "traffic_splitting_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          }

        },

        "required": [

          "name",

          "product_id",

          "publisher",

          "url"

        ]

      },

      "Tracking": {

        "type": "object",

        "properties": {

          "can_activate": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Group Name"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "maketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "marketplace_name"

              },

              "name": {

                "type": "string",

                "example": "product_name"

              }

            }

          },

          "public_url": {

            "type": "string",

            "example": "https://digitalmanager.guru/campaign/friendly-url"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "source_field": {

            "type": "string",

            "example": "source_field"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          }

        }

      },

      "TrackingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Tracking"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "client_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Product Name"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "qty": {

                "type": "number",

                "example": 1

              }

            }

          },

          "marketplace": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "name": {

                "type": "string",

                "example": "Marketplace Name"

              }

            }

          },

          "has_tracking": {

            "type": "number",

            "example": 1

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "payment_type": {

            "type": "string",

            "example": "credit_card"

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "ordered_at": {

            "type": "number",

            "example": 1703151137

          },

          "value": {

            "type": "number",

            "example": "9.99"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Utm": {

        "type": "object",

        "properties": {

          "created_at": {

            "type": "string",

            "example": 1703151137

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "total_clicks": {

            "type": "number",

            "example": 1

          },

          "updated_at": {

            "type": "number",

            "example": 1703151137

          },

          "utm_campaign": {

            "type": "string"

          },

          "utm_content": {

            "type": "string"

          },

          "utm_medium": {

            "type": "string"

          },

          "utm_term": {

            "type": "string"

          }

        }

      },

      "UtmList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Utm"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# Trackings - Custo com Tráfego

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Trackings - Custo com Tráfego",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/trackings"

    }

  ],

  "paths": {

    "/trafficcost": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de custos com tráfego",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "clicked_at_ini",

            "in": "query",

            "required": true,

            "description": "Data de início",

            "example": "2023-01-01",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "clicked_at_end",

            "in": "query",

            "required": true,

            "description": "Data de final",

            "example": "2023-12-31",

            "schema": {

              "type": "string"

            }

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Proprietários",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "publishers",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Origem do tráfego",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "tracking_name",

            "in": "query",

            "description": "Nome",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "types",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Tipo",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "description": "UTM campaign",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "description": "UTM content",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "description": "medium",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficCostList"

                }

              }

            }

          }

        }

      }

    },

    "/trafficcost/{id}": {

      "put": {

        "summary": "Atualizar",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "name": "id",

            "in": "path",

            "required": true,

            "description": "ID do custo com tráfego",

            "schema": {

              "type": "string"

            },

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641"

          }

        ],

        "requestBody": {

          "content": {

            "application/json": {

              "schema": {

                "type": "object",

                "properties": {

                  "traffic_cost": {

                    "type": "number",

                    "example": 10

                  }

                }

              }

            }

          }

        },

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficCost"

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "TrafficCost": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "clicked_at": {

            "type": "string",

            "example": "2023-08-02"

          },

          "traffic_cost": {

            "type": "number",

            "example": 50

          },

          "campaign_clicks": {

            "type": "number",

            "example": 10

          },

          "name": {

            "type": "string",

            "example": "Name"

          },

          "publisher": {

            "type": "string",

            "example": "Publisher name"

          },

          "type": {

            "type": "string",

            "example": "campaign"

          },

          "tracking_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "father_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "utm_campaign": {

            "type": "string",

            "example": "utm_campaign"

          },

          "utm_medium": {

            "type": "string",

            "example": "utm_medium"

          },

          "utm_term": {

            "type": "string",

            "example": "utm_term"

          },

          "utm_content": {

            "type": "string",

            "example": "utm_content"

          }

        }

      },

      "TrafficCostList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/TrafficCost"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# Traffic Splitting - Campaigns

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Traffic Splitting - Campaigns",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/traffic-splitting"

    }

  ],

  "paths": {

    "/campaigns": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de Traffic Splitting Campaigns.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "friendly_url",

            "in": "query",

            "description": "URL amigável",

            "example": "https://example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "group_id",

            "in": "query",

            "description": "ID do grupo",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "has_group",

            "in": "query",

            "description": "Se possui grupo",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "id",

            "in": "query",

            "description": "ID do Traffic Splitting Campaign",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "is_active",

            "in": "query",

            "description": "Status do traffic splitting, true para ativo, false para inativo",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "is_hidden",

            "in": "query",

            "description": "Visibilidade do traffic splitting, true para visível, false para oculto",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do Traffic Splitting Campaign",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "publishers",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Origem",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "type",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-rastreamento\">Tipo do traffic splitting</a>",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "types",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-rastreamento\">Lista de tipos</a>",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "user_id",

            "in": "query",

            "description": "ID do usuário",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos usuários",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingCampaignList"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}": {

      "get": {

        "summary": "Consultar",

        "description": "Obter um Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingCampaign"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "traffic_splitting_created"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/daily-clicks": {

      "get": {

        "summary": "Obter cliques diários",

        "description": "Obter cliques diários do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object",

                        "properties": {

                          "clicked_at": {

                            "type": "string"

                          },

                          "ttlClicks": {

                            "type": "number"

                          },

                          "ttlLeads": {

                            "type": "number"

                          },

                          "ttlCost": {

                            "type": "number"

                          }

                        }

                      }

                    },

                    "has_more_pages": {

                      "type": "number",

                      "example": 1

                    },

                    "next_cursor": {

                      "type": "string",

                      "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

                    },

                    "on_first_page": {

                      "type": "number",

                      "example": 1

                    },

                    "on_last_page": {

                      "type": "number",

                      "example": 0

                    },

                    "per_page": {

                      "type": "number",

                      "example": 20

                    },

                    "previous_cursor": {

                      "type": "string",

                      "example": null

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/leads": {

      "get": {

        "summary": "Leads",

        "description": "Obter leads do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "email": {

                        "type": "string",

                        "example": "user@example.com"

                      },

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1703151137

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/transactions": {

      "get": {

        "summary": "Vendas",

        "description": "Obter vendas do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "transaction_status",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Estados das vendas</a>",

            "schema": {

              "type": "array"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/trackings": {

      "get": {

        "summary": "Rastreamentos",

        "description": "Obter rastreamentos do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/funnel": {

      "get": {

        "summary": "Funil",

        "description": "Obter dados do funil do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "conversion": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object",

                            "properties": {

                              "id": {

                                "type": "string"

                              },

                              "utm_campaing": {

                                "type": "string"

                              },

                              "utm_content": {

                                "type": "string"

                              },

                              "utm_medium": {

                                "type": "string"

                              },

                              "utm_term": {

                                "type": "string"

                              },

                              "traffic": {

                                "type": "object",

                                "properties": {

                                  "clicks": {

                                    "type": "number"

                                  },

                                  "leads": {

                                    "type": "number"

                                  },

                                  "new_leads": {

                                    "type": "number"

                                  },

                                  "cost": {

                                    "type": "number"

                                  }

                                }

                              },

                              "cpl": {

                                "type": "number"

                              },

                              "cpl_new": {

                                "type": "number"

                              },

                              "cpc": {

                                "type": "number"

                              }

                            }

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "traffic": {

                              "type": "object",

                              "properties": {

                                "clicks": {

                                  "type": "number"

                                },

                                "leads": {

                                  "type": "number"

                                },

                                "new_leads": {

                                  "type": "number"

                                },

                                "cost": {

                                  "type": "number"

                                }

                              }

                            },

                            "cpl": {

                              "type": "number"

                            },

                            "cpl_new": {

                              "type": "number"

                            },

                            "cpc": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/funnel/heatmap": {

      "get": {

        "summary": "Funnel - Heatmap",

        "description": "Obter heatmap do funil do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/funnel/products": {

      "get": {

        "summary": "Funnel - Produtos",

        "description": "Obter produtos do funil do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object"

                      }

                    },

                    "totals": {

                      "type": "object"

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/campaigns/{id}/funnel/stats": {

      "get": {

        "summary": "Funnel - Estatísticas",

        "description": "Obter estatísticas do funil do Traffic Splitting Campaign",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCampaignId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "dates": {

                      "type": "array",

                      "items": {

                        "type": "string"

                      }

                    },

                    "clicks": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "leads": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "new_leads": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "conversionRates": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "all": {

                      "type": "object",

                      "properties": {

                        "clicks": {

                          "type": "number"

                        },

                        "leads": {

                          "type": "number"

                        },

                        "new_leads": {

                          "type": "number"

                        },

                        "conversionRate": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "TrafficSplittingCampaignId": {

        "name": "id",

        "in": "path",

        "description": "O ID do Traffic Splitting Campaign",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "DateIni": {

        "name": "date_ini",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-01-01",

        "schema": {

          "type": "string"

        }

      },

      "DateEnd": {

        "name": "date_end",

        "in": "query",

        "required": true,

        "description": "Data de fim",

        "example": "2023-12-31",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "TrafficSplittingCampaign": {

        "type": "object",

        "properties": {

          "active_trackings_count": {

            "type": "number",

            "example": 1

          },

          "client_id": {

            "type": "string",

            "example": "9f85cb72-365e-4505-bc0d-0b4a53e9dbf3"

          },

          "conversion_window": {

            "type": "number",

            "example": 28

          },

          "created_at": {

            "type": "number",

            "example": 1760945780

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "friendly_url": {

            "type": "string",

            "example": "ab-venda-azul"

          },

          "group_id": {

            "type": "string",

            "nullable": true,

            "example": null

          },

          "has_funnel": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "id": {

            "type": "string",

            "example": "a02836c5-b793-40ba-ba44-1993c413eefd"

          },

          "inactive_trackings_count": {

            "type": "number",

            "example": 0

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "learning_rate": {

            "type": "number",

            "example": 100

          },

          "min_learning_rate": {

            "type": "number",

            "example": 10

          },

          "name": {

            "type": "string",

            "example": "ab venda azul"

          },

          "product_id": {

            "type": "string",

            "example": "9f85cb73-1c0d-4ecc-b1dd-3e2e71eaf917"

          },

          "publisher": {

            "type": "string",

            "example": "ownsite"

          },

          "settings": {

            "type": "object",

            "properties": {

              "deletable": {

                "type": "object",

                "properties": {

                  "has_trackings": {

                    "type": "boolean",

                    "example": true

                  }

                }

              },

              "has_funnel": {

                "type": "boolean",

                "example": true

              }

            }

          },

          "type": {

            "type": "string",

            "example": "campaign"

          },

          "updated_at": {

            "type": "number",

            "example": 1760954302

          },

          "url": {

            "type": "string",

            "example": "https://8080-gustavo.cluster-hci2kt5se5ekqulnutjbnlpwts.cloudworkstations.dev/campaigns/ab-venda-azul"

          },

          "user_id": {

            "type": "string",

            "example": "9f85cb73-ffe4-4b47-a272-54d6ff09ba59"

          }

        }

      },

      "TrafficSplittingCampaignList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/TrafficSplittingCampaign"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Tracking": {

        "type": "object",

        "properties": {

          "can_activate": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Group Name"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "maketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "marketplace_name"

              },

              "name": {

                "type": "string",

                "example": "product_name"

              }

            }

          },

          "public_url": {

            "type": "string",

            "example": "https://digitalmanager.guru/campaign/friendly-url"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "source_field": {

            "type": "string",

            "example": "source_field"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          }

        }

      },

      "TrackingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Tracking"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "client_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Product Name"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "qty": {

                "type": "number",

                "example": 1

              }

            }

          },

          "marketplace": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "name": {

                "type": "string",

                "example": "Marketplace Name"

              }

            }

          },

          "has_tracking": {

            "type": "number",

            "example": 1

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "payment_type": {

            "type": "string",

            "example": "credit_card"

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "ordered_at": {

            "type": "number",

            "example": 1703151137

          },

          "value": {

            "type": "number",

            "example": "9.99"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# Traffic Splitting - Checkouts

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Traffic Splitting - Checkouts",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/traffic-splitting"

    }

  ],

  "paths": {

    "/checkouts": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de Traffic Splitting Checkouts.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "friendly_url",

            "in": "query",

            "description": "URL amigável",

            "example": "https://example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "group_id",

            "in": "query",

            "description": "ID do grupo",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "has_group",

            "in": "query",

            "description": "Se possui grupo",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "id",

            "in": "query",

            "description": "ID do Traffic Splitting Checkout",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "is_active",

            "in": "query",

            "description": "Status do traffic splitting, true para ativo, false para inativo",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "is_hidden",

            "in": "query",

            "description": "Visibilidade do traffic splitting, true para visível, false para oculto",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do Traffic Splitting Checkout",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "publishers",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Origem",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "type",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-rastreamento\">Tipo do traffic splitting</a>",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "types",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-rastreamento\">Lista de tipos</a>",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "user_id",

            "in": "query",

            "description": "ID do usuário",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos usuários",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingCheckoutList"

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}": {

      "get": {

        "summary": "Consultar",

        "description": "Obter um Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingCheckout"

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "traffic_splitting_created"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/daily-clicks": {

      "get": {

        "summary": "Obter cliques diários",

        "description": "Obter cliques diários do Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object",

                        "properties": {

                          "clicked_at": {

                            "type": "string"

                          },

                          "ttlClicks": {

                            "type": "number"

                          },

                          "ttlLeads": {

                            "type": "number"

                          },

                          "ttlCost": {

                            "type": "number"

                          }

                        }

                      }

                    },

                    "has_more_pages": {

                      "type": "number",

                      "example": 1

                    },

                    "next_cursor": {

                      "type": "string",

                      "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

                    },

                    "on_first_page": {

                      "type": "number",

                      "example": 1

                    },

                    "on_last_page": {

                      "type": "number",

                      "example": 0

                    },

                    "per_page": {

                      "type": "number",

                      "example": 20

                    },

                    "previous_cursor": {

                      "type": "string",

                      "example": null

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/leads": {

      "get": {

        "summary": "Leads",

        "description": "Obter leads do Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "email": {

                        "type": "string",

                        "example": "user@example.com"

                      },

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1703151137

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/transactions": {

      "get": {

        "summary": "Vendas",

        "description": "Obter vendas do Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "transaction_status",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Estados das vendas</a>",

            "schema": {

              "type": "array"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/trackings": {

      "get": {

        "summary": "Rastreamentos",

        "description": "Obter rastreamentos do Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/stats": {

      "get": {

        "summary": "Estatísticas",

        "description": "Obter estatísticas do Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "dates": {

                      "type": "array",

                      "items": {

                        "type": "string"

                      },

                      "example": [

                        "2025-01",

                        "2025-02",

                        "2025-03"

                      ]

                    },

                    "clicks": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      },

                      "example": [

                        125,

                        89,

                        156

                      ]

                    },

                    "sales": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      },

                      "example": [

                        3,

                        2,

                        5

                      ]

                    },

                    "validSales": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      },

                      "example": [

                        3,

                        1,

                        4

                      ]

                    },

                    "conversionRates": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      },

                      "example": [

                        2.4,

                        2.2,

                        3.2

                      ]

                    },

                    "all": {

                      "type": "object",

                      "properties": {

                        "clicks": {

                          "type": "number",

                          "example": 370

                        },

                        "sales": {

                          "type": "number",

                          "example": 10

                        },

                        "validSales": {

                          "type": "number",

                          "example": 8

                        },

                        "conversionRate": {

                          "type": "number",

                          "example": 2.7

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/stats/heatmap": {

      "get": {

        "summary": "Estatísticas - Heatmap",

        "description": "Obter heatmap das estatísticas do Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "days": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object",

                            "properties": {

                              "data": {

                                "type": "array",

                                "items": {

                                  "type": "object",

                                  "properties": {

                                    "x": {

                                      "type": "string",

                                      "example": "0h"

                                    },

                                    "y": {

                                      "type": "number",

                                      "example": 0

                                    }

                                  }

                                }

                              },

                              "max": {

                                "type": "number",

                                "example": 0

                              },

                              "min": {

                                "type": "number",

                                "example": 0

                              },

                              "name": {

                                "type": "string",

                                "example": "Seg"

                              }

                            }

                          }

                        },

                        "max": {

                          "type": "number",

                          "example": 1

                        },

                        "min": {

                          "type": "number",

                          "example": 0

                        }

                      }

                    },

                    "weekdays": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object",

                            "properties": {

                              "x": {

                                "type": "string",

                                "example": "Seg"

                              },

                              "y": {

                                "type": "number",

                                "example": 0

                              }

                            }

                          }

                        },

                        "max": {

                          "type": "number",

                          "example": 1

                        },

                        "min": {

                          "type": "number",

                          "example": 0

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/checkouts/{id}/stats/sources": {

      "get": {

        "summary": "Estatísticas - Fontes",

        "description": "Obter estatísticas por fontes do Traffic Splitting Checkout",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingCheckoutId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "trackings": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          },

                          "example": []

                        },

                        "all": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "type": "number",

                              "example": 15

                            },

                            "value": {

                              "type": "number",

                              "example": 1250.5

                            },

                            "products": {

                              "type": "number",

                              "example": 18

                            }

                          }

                        },

                        "valid": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "type": "number",

                              "example": 12

                            },

                            "value": {

                              "type": "number",

                              "example": 980.25

                            },

                            "products": {

                              "type": "number",

                              "example": 15

                            }

                          }

                        },

                        "conversionRate": {

                          "type": "number",

                          "example": 2.8

                        }

                      }

                    },

                    "publishers": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          },

                          "example": []

                        },

                        "all": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "type": "number",

                              "example": 8

                            },

                            "value": {

                              "type": "number",

                              "example": 750.75

                            },

                            "products": {

                              "type": "number",

                              "example": 10

                            }

                          }

                        },

                        "valid": {

                          "type": "object",

                          "properties": {

                            "sales": {

                              "type": "number",

                              "example": 6

                            },

                            "value": {

                              "type": "number",

                              "example": 580.5

                            },

                            "products": {

                              "type": "number",

                              "example": 8

                            }

                          }

                        },

                        "conversionRate": {

                          "type": "number",

                          "example": 3.2

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "TrafficSplittingCheckoutId": {

        "name": "id",

        "in": "path",

        "description": "O ID do Traffic Splitting Checkout",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "DateIni": {

        "name": "date_ini",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-01-01",

        "schema": {

          "type": "string"

        }

      },

      "DateEnd": {

        "name": "date_end",

        "in": "query",

        "required": true,

        "description": "Data de fim",

        "example": "2023-12-31",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "TrafficSplittingCheckout": {

        "type": "object",

        "properties": {

          "active_trackings_count": {

            "type": "number",

            "example": 1

          },

          "client_id": {

            "type": "string",

            "example": "9f85cb72-365e-4505-bc0d-0b4a53e9dbf3"

          },

          "conversion_window": {

            "type": "number",

            "example": 28

          },

          "created_at": {

            "type": "number",

            "example": 1760968381

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "friendly_url": {

            "type": "string",

            "example": "gol-branco"

          },

          "group_id": {

            "type": "string",

            "nullable": true,

            "example": null

          },

          "has_funnel": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "id": {

            "type": "string",

            "example": "a028bd7b-a978-4707-8afe-bf482a5f3e0c"

          },

          "inactive_trackings_count": {

            "type": "number",

            "example": 0

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "learning_rate": {

            "type": "number",

            "example": 100

          },

          "min_learning_rate": {

            "type": "number",

            "example": 10

          },

          "name": {

            "type": "string",

            "example": "gol branco"

          },

          "product_id": {

            "type": "string",

            "example": "9f85cb73-1c0d-4ecc-b1dd-3e2e71eaf917"

          },

          "publisher": {

            "type": "string",

            "example": ""

          },

          "settings": {

            "type": "object",

            "properties": {

              "deletable": {

                "type": "object",

                "properties": {

                  "has_trackings": {

                    "type": "boolean",

                    "example": true

                  }

                }

              }

            }

          },

          "type": {

            "type": "string",

            "example": "checkout"

          },

          "updated_at": {

            "type": "number",

            "example": 1760971460

          },

          "url": {

            "type": "string",

            "example": "https://8080-gustavo.cluster-hci2kt5se5ekqulnutjbnlpwts.cloudworkstations.dev/checkouts/gol-branco"

          },

          "user_id": {

            "type": "string",

            "example": "9f85cb73-ffe4-4b47-a272-54d6ff09ba59"

          }

        }

      },

      "TrafficSplittingCheckoutList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/TrafficSplittingCheckout"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Tracking": {

        "type": "object",

        "properties": {

          "can_activate": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Group Name"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "maketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "marketplace_name"

              },

              "name": {

                "type": "string",

                "example": "product_name"

              }

            }

          },

          "public_url": {

            "type": "string",

            "example": "https://digitalmanager.guru/campaign/friendly-url"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "source_field": {

            "type": "string",

            "example": "source_field"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          }

        }

      },

      "TrackingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Tracking"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "client_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Product Name"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "qty": {

                "type": "number",

                "example": 1

              }

            }

          },

          "marketplace": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "name": {

                "type": "string",

                "example": "Marketplace Name"

              }

            }

          },

          "has_tracking": {

            "type": "number",

            "example": 1

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "payment_type": {

            "type": "string",

            "example": "credit_card"

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "ordered_at": {

            "type": "number",

            "example": 1703151137

          },

          "value": {

            "type": "number",

            "example": "9.99"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```

# Traffic Splitting - Leads

```json
{

  "openapi": "3.0.3",

  "info": {

    "title": "Traffic Splitting - Leads",

    "version": "2.0.0"

  },

  "servers": [

    {

      "url": "https://digitalmanager.guru/api/v2/traffic-splitting"

    }

  ],

  "paths": {

    "/leads": {

      "get": {

        "summary": "Pesquisar",

        "description": "Os parametros são passados na url (query string). A ação retorna uma coleção paginada de Traffic Splitting Leads.",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "friendly_url",

            "in": "query",

            "description": "URL amigável",

            "example": "https://example.com",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "group_id",

            "in": "query",

            "description": "ID do grupo",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "has_group",

            "in": "query",

            "description": "Se possui grupo",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "id",

            "in": "query",

            "description": "ID do Traffic Splitting Lead",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "is_active",

            "in": "query",

            "description": "Status do traffic splitting, true para ativo, false para inativo",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "is_hidden",

            "in": "query",

            "description": "Visibilidade do traffic splitting, true para visível, false para oculto",

            "schema": {

              "type": "boolean"

            }

          },

          {

            "name": "name",

            "in": "query",

            "description": "Nome do Traffic Splitting Lead",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "products",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos produtos",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "publishers",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Origem",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "type",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-rastreamento\">Tipo do traffic splitting</a>",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "types",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-tipos-rastreamento\">Lista de tipos</a>",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          },

          {

            "name": "user_id",

            "in": "query",

            "description": "ID do usuário",

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "users",

            "in": "query",

            "style": "form",

            "explode": true,

            "description": "Lista de IDs dos usuários",

            "schema": {

              "type": "array",

              "items": {

                "type": "string"

              }

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingLeadList"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}": {

      "get": {

        "summary": "Consultar",

        "description": "Obter um Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrafficSplittingLead"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/audits": {

      "get": {

        "summary": "Obter auditoria",

        "description": "Obter auditoria do Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "properties": {

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "causer": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "example": "user@example.com"

                          },

                          "id": {

                            "type": "string",

                            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                          },

                          "name": {

                            "type": "string",

                            "example": "User Name"

                          }

                        }

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1700651592

                      },

                      "impersonator": {

                        "type": "object",

                        "properties": {

                          "email": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "id": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          },

                          "name": {

                            "type": "string",

                            "nullable": true,

                            "example": null

                          }

                        }

                      },

                      "infrastructure": {

                        "type": "object",

                        "properties": {

                          "city": {

                            "type": "string"

                          },

                          "city_lat_long": {

                            "type": "string"

                          },

                          "country": {

                            "type": "string"

                          },

                          "ip": {

                            "type": "string"

                          },

                          "region": {

                            "type": "string"

                          },

                          "user_agent": {

                            "type": "string"

                          }

                        }

                      },

                      "type": {

                        "type": "string",

                        "example": "traffic_splitting_created"

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/daily-clicks": {

      "get": {

        "summary": "Obter cliques diários",

        "description": "Obter cliques diários do Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "data": {

                      "type": "array",

                      "items": {

                        "type": "object",

                        "properties": {

                          "clicked_at": {

                            "type": "string"

                          },

                          "ttlClicks": {

                            "type": "number"

                          },

                          "ttlLeads": {

                            "type": "number"

                          },

                          "ttlCost": {

                            "type": "number"

                          }

                        }

                      }

                    },

                    "has_more_pages": {

                      "type": "number",

                      "example": 1

                    },

                    "next_cursor": {

                      "type": "string",

                      "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

                    },

                    "on_first_page": {

                      "type": "number",

                      "example": 1

                    },

                    "on_last_page": {

                      "type": "number",

                      "example": 0

                    },

                    "per_page": {

                      "type": "number",

                      "example": 20

                    },

                    "previous_cursor": {

                      "type": "string",

                      "example": null

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/leads": {

      "get": {

        "summary": "Leads",

        "description": "Obter leads do Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "array",

                  "items": {

                    "type": "object",

                    "properties": {

                      "id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "email": {

                        "type": "string",

                        "example": "user@example.com"

                      },

                      "activity_id": {

                        "type": "string",

                        "example": "6e46401e-abad-4c06-8657-d84d447becbf"

                      },

                      "created_at": {

                        "type": "number",

                        "example": 1703151137

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/transactions": {

      "get": {

        "summary": "Vendas",

        "description": "Obter vendas do Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "transaction_status",

            "in": "query",

            "description": "<a href=\"https://api.docs.digitalmanager.guru/listas-auxiliares-status-vendas\">Estados das vendas</a>",

            "schema": {

              "type": "array"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TransactionList"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/trackings": {

      "get": {

        "summary": "Rastreamentos",

        "description": "Obter rastreamentos do Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "$ref": "#/components/parameters/Cursor"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "$ref": "#/components/schemas/TrackingList"

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/funnel": {

      "get": {

        "summary": "Funil",

        "description": "Obter dados do funil do Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "conversion": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object",

                            "properties": {

                              "id": {

                                "type": "string"

                              },

                              "utm_campaing": {

                                "type": "string"

                              },

                              "utm_content": {

                                "type": "string"

                              },

                              "utm_medium": {

                                "type": "string"

                              },

                              "utm_term": {

                                "type": "string"

                              },

                              "traffic": {

                                "type": "object",

                                "properties": {

                                  "clicks": {

                                    "type": "number"

                                  },

                                  "leads": {

                                    "type": "number"

                                  },

                                  "new_leads": {

                                    "type": "number"

                                  },

                                  "cost": {

                                    "type": "number"

                                  }

                                }

                              },

                              "cpl": {

                                "type": "number"

                              },

                              "cpl_new": {

                                "type": "number"

                              },

                              "cpc": {

                                "type": "number"

                              }

                            }

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "traffic": {

                              "type": "object",

                              "properties": {

                                "clicks": {

                                  "type": "number"

                                },

                                "leads": {

                                  "type": "number"

                                },

                                "new_leads": {

                                  "type": "number"

                                },

                                "cost": {

                                  "type": "number"

                                }

                              }

                            },

                            "cpl": {

                              "type": "number"

                            },

                            "cpl_new": {

                              "type": "number"

                            },

                            "cpc": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/funnel/stats": {

      "get": {

        "summary": "Funnel - Estatísticas",

        "description": "Obter estatísticas do funil do Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "dates": {

                      "type": "array",

                      "items": {

                        "type": "string"

                      }

                    },

                    "clicks": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "leads": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "new_leads": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "conversionRates": {

                      "type": "array",

                      "items": {

                        "type": "number"

                      }

                    },

                    "all": {

                      "type": "object",

                      "properties": {

                        "clicks": {

                          "type": "number"

                        },

                        "leads": {

                          "type": "number"

                        },

                        "new_leads": {

                          "type": "number"

                        },

                        "conversionRate": {

                          "type": "number"

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    },

    "/leads/{id}/funnel/conversion": {

      "get": {

        "summary": "Funnel - Janela de Conversão",

        "description": "Obter dados de conversão do funil do Traffic Splitting Lead",

        "parameters": [

          {

            "$ref": "#/components/parameters/Authorization"

          },

          {

            "$ref": "#/components/parameters/Accept"

          },

          {

            "$ref": "#/components/parameters/TrafficSplittingLeadId"

          },

          {

            "$ref": "#/components/parameters/DateIni"

          },

          {

            "$ref": "#/components/parameters/DateEnd"

          },

          {

            "name": "client_id",

            "in": "query",

            "description": "ID do cliente",

            "required": true,

            "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_campaign",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_medium",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_term",

            "in": "query",

            "schema": {

              "type": "string"

            }

          },

          {

            "name": "utm_content",

            "in": "query",

            "schema": {

              "type": "string"

            }

          }

        ],

        "responses": {

          "200": {

            "description": "OK",

            "content": {

              "application/json": {

                "schema": {

                  "type": "object",

                  "properties": {

                    "conversionWindow": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "x": {

                          "type": "object",

                          "properties": {

                            "max": {

                              "type": "number"

                            },

                            "avg": {

                              "type": "number"

                            },

                            "min": {

                              "type": "number"

                            }

                          }

                        },

                        "y": {

                          "type": "object",

                          "properties": {

                            "max": {

                              "type": "number"

                            },

                            "avg": {

                              "type": "number"

                            },

                            "min": {

                              "type": "number"

                            }

                          }

                        },

                        "inside": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            }

                          }

                        }

                      }

                    },

                    "paymentConversion": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "total": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "number"

                            },

                            "valid": {

                              "type": "number"

                            },

                            "conversionRate": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    },

                    "publishers": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            }

                          }

                        }

                      }

                    },

                    "sources": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            }

                          }

                        }

                      }

                    },

                    "trackings": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            }

                          }

                        }

                      }

                    },

                    "totals": {

                      "type": "object",

                      "properties": {

                        "data": {

                          "type": "array",

                          "items": {

                            "type": "object"

                          }

                        },

                        "totals": {

                          "type": "object",

                          "properties": {

                            "all": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "valid": {

                              "type": "object",

                              "properties": {

                                "qtySales": {

                                  "type": "number"

                                },

                                "qtyLeads": {

                                  "type": "number"

                                },

                                "qtyProducts": {

                                  "type": "number"

                                },

                                "ttlValue": {

                                  "type": "number"

                                },

                                "ttlNetValue": {

                                  "type": "number"

                                }

                              }

                            },

                            "qtyLeadsCaptured": {

                              "type": "number"

                            },

                            "ttlTrafficCost": {

                              "type": "number"

                            }

                          }

                        }

                      }

                    }

                  }

                }

              }

            }

          }

        }

      }

    }

  },

  "components": {

    "parameters": {

      "Authorization": {

        "name": "Authorization",

        "in": "header",

        "description": "e.g. Bearer {user_token}",

        "required": true,

        "schema": {

          "type": "string"

        },

        "example": "Bearer {user_token}"

      },

      "Accept": {

        "name": "Accept",

        "in": "header",

        "description": "e.g. application/json",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "application/json"

      },

      "TrafficSplittingLeadId": {

        "name": "id",

        "in": "path",

        "description": "O ID do Traffic Splitting Lead",

        "required": true,

        "example": "964fe215-d8a3-4f06-9cf9-62713f906641",

        "schema": {

          "type": "string"

        }

      },

      "DateIni": {

        "name": "date_ini",

        "in": "query",

        "required": true,

        "description": "Data de início",

        "example": "2023-01-01",

        "schema": {

          "type": "string"

        }

      },

      "DateEnd": {

        "name": "date_end",

        "in": "query",

        "required": true,

        "description": "Data de fim",

        "example": "2023-12-31",

        "schema": {

          "type": "string"

        }

      },

      "Cursor": {

        "name": "cursor",

        "in": "query",

        "required": false,

        "schema": {

          "type": "string"

        },

        "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

      }

    },

    "schemas": {

      "TrafficSplittingLead": {

        "type": "object",

        "properties": {

          "active_trackings_count": {

            "type": "number",

            "example": 1

          },

          "client_id": {

            "type": "string",

            "example": "9f85cb72-365e-4505-bc0d-0b4a53e9dbf3"

          },

          "conversion_window": {

            "type": "number",

            "example": 28

          },

          "created_at": {

            "type": "number",

            "example": 1760625453

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "friendly_url": {

            "type": "string",

            "example": "teste-abc"

          },

          "group_id": {

            "type": "string",

            "nullable": true,

            "example": null

          },

          "has_funnel": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "id": {

            "type": "string",

            "example": "a020c179-9d2f-44b7-bf16-f3f5d23780e8"

          },

          "inactive_trackings_count": {

            "type": "number",

            "example": 0

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "learning_rate": {

            "type": "number",

            "example": 100

          },

          "min_learning_rate": {

            "type": "number",

            "example": 10

          },

          "name": {

            "type": "string",

            "example": "teste abc"

          },

          "product_id": {

            "type": "string",

            "example": "9f85cb73-1c0d-4ecc-b1dd-3e2e71eaf917"

          },

          "publisher": {

            "type": "string",

            "example": "linkedin_ads"

          },

          "settings": {

            "type": "object",

            "properties": {

              "deletable": {

                "type": "object",

                "properties": {

                  "has_trackings": {

                    "type": "boolean",

                    "example": true

                  }

                }

              },

              "has_funnel": {

                "type": "boolean",

                "example": true

              }

            }

          },

          "type": {

            "type": "string",

            "example": "lead"

          },

          "updated_at": {

            "type": "number",

            "example": 1760708189

          },

          "url": {

            "type": "string",

            "example": "https://8080-gustavo.cluster-hci2kt5se5ekqulnutjbnlpwts.cloudworkstations.dev/leads/teste-abc"

          },

          "user_id": {

            "type": "string",

            "example": "9f85cb73-ffe4-4b47-a272-54d6ff09ba59"

          }

        }

      },

      "TrafficSplittingLeadList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/TrafficSplittingLead"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Tracking": {

        "type": "object",

        "properties": {

          "can_activate": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "deletable": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "group": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Group Name"

              }

            }

          },

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "is_active": {

            "type": "number",

            "example": 1,

            "enum": [

              0,

              1

            ]

          },

          "is_hidden": {

            "type": "number",

            "example": 0,

            "enum": [

              0,

              1

            ]

          },

          "name": {

            "type": "string",

            "example": "Nome do RPPC"

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "marketplace_id": {

                "type": "string",

                "example": "maketplace_id"

              },

              "marketplace_name": {

                "type": "string",

                "example": "marketplace_name"

              },

              "name": {

                "type": "string",

                "example": "product_name"

              }

            }

          },

          "public_url": {

            "type": "string",

            "example": "https://digitalmanager.guru/campaign/friendly-url"

          },

          "publisher": {

            "type": "string",

            "example": "publisher"

          },

          "source_field": {

            "type": "string",

            "example": "source_field"

          },

          "url": {

            "type": "string",

            "example": "https://example.com"

          },

          "user": {

            "type": "object",

            "properties": {

              "email": {

                "type": "string",

                "example": "user@example.com"

              },

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Nome do usuário"

              }

            }

          }

        }

      },

      "TrackingList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Tracking"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      },

      "Transaction": {

        "type": "object",

        "properties": {

          "id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "client_id": {

            "type": "string",

            "example": "6e46401e-abad-4c06-8657-d84d447becbf"

          },

          "contact": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Contact Name"

              },

              "email": {

                "type": "string",

                "example": "user@example.com"

              }

            }

          },

          "product": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "6e46401e-abad-4c06-8657-d84d447becbf"

              },

              "name": {

                "type": "string",

                "example": "Product Name"

              },

              "marketplace_id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "qty": {

                "type": "number",

                "example": 1

              }

            }

          },

          "marketplace": {

            "type": "object",

            "properties": {

              "id": {

                "type": "string",

                "example": "marketplace_id"

              },

              "name": {

                "type": "string",

                "example": "Marketplace Name"

              }

            }

          },

          "has_tracking": {

            "type": "number",

            "example": 1

          },

          "status": {

            "type": "string",

            "example": "approved"

          },

          "payment_type": {

            "type": "string",

            "example": "credit_card"

          },

          "currency": {

            "type": "string",

            "example": "BRL"

          },

          "ordered_at": {

            "type": "number",

            "example": 1703151137

          },

          "value": {

            "type": "number",

            "example": "9.99"

          }

        }

      },

      "TransactionList": {

        "type": "object",

        "properties": {

          "data": {

            "type": "array",

            "items": {

              "$ref": "#/components/schemas/Transaction"

            }

          },

          "has_more_pages": {

            "type": "number",

            "example": 1

          },

          "next_cursor": {

            "type": "string",

            "example": "eyJuYW1lIjoidHJhY2tpbmcgbmFtZSIsInByb2R1Y3RfaWQiOiJkNjZiZTBlYS1mYTYzLTRjOWMtOTVhZS01ZGQyNzllZTUwMjQiLCJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9"

          },

          "on_first_page": {

            "type": "number",

            "example": 1

          },

          "on_last_page": {

            "type": "number",

            "example": 0

          },

          "per_page": {

            "type": "number",

            "example": 20

          },

          "previous_cursor": {

            "type": "string",

            "example": null

          }

        }

      }

    }

  }

}
```