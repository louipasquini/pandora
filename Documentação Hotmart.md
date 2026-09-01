# Códigos de Resposta HTTP

A API da Hotmart utiliza o padrão de códigos de resposta HTTP para indicar o sucesso ou falha de cada requisição.

A API da Hotmart utiliza o padrão de códigos de resposta HTTP para indicar o sucesso ou falha de cada requisição. No caso de erros, além do código de resposta HTTP, enviamos também um objeto JSON com uma mensagem descritiva do erro e o seu tipo.

No geral, códigos no intervalo **2xx** indicam sucesso.

Operações que resultam em um erro que ocorreu no lado do **cliente** (ex. token de acesso inválido) vão retornar um código no intervalo **4xx** e indicam que a requisição está de alguma forma inválida. Se você receber um erro 4xx, recomendamos que leia o nosso glossário de erros para obter mais contexto para ajudá-lo a solucionar o problema.

Já os códigos de erros no intervalo **5xx** sugerem um problema com os serviços da API da Hotmart.

Caso tenha dúvida ou não consiga resolver o seu problema, não hesite em **contatar nosso time de suporte**, se possível enviando a requisição completa que você está tentando fazer e o erro recebido. Assim nosso time poderá ajudá-lo a achar uma solução o mais rápido possível.

### [](https://developers.hotmart.com/docs/pt-BR/start/http-response-codes/#retorno)Retorno

- error
    
    O tipo de erro retornado. Pode ser um dos valores:
    
    `invalid_token`, `token_expired`, `unauthorized`, `unauthorized_client`, `invalid_parameter`, `invalid_value_parameter`, `invalid_value_headers`, `not_found`, `too_many_requests` ou `internal_server_error`.
    
- error_description
    
    Uma mensagem de fácil entendimento que fornece mais detalhes sobre o erro.
    
- error_uri
    
    Um link para nossa documentação onde poderá encontrar mais sobre o código de erro recebido.
    

Response

```json
{
   "error": "unauthorized",
   "error_description": "Full authentication is required to access this resource."
   "error_uri": "https://developers.hotmart.com/docs/pt-BR/start/http-response-codes/"
}
```

### [](https://developers.hotmart.com/docs/pt-BR/start/http-response-codes/#sumario-de-status-http)Sumário de status HTTP

|Status|Tipo de erro|Definição|
|---|---|---|
|**200** - OK|-|Código de sucesso. Tudo ocorreu como planejado.|
|**201** - Created|-|Similar ao 200, porém se refere a um retorno quando um novo recurso foi criado.|
|**400** - Bad Request|`invalid_parameter`|A requisição enviada está de alguma forma inválida.|
||`invalid_value_parameter`|A requisição enviada está com o valor da queryString de alguma forma inválida.|
||`invalid_value_headers`|A requisição enviada está com o valor do header de alguma forma inválida.|
||`invalid_token`|O valor do parâmetro _page_token_ está inválido na requisição enviada.|
|**401** - Unauthorized|`unauthorized`|É necessário estar autenticado para prosseguir com a requisição. Esse erro normalmente ocorre quando o token de acesso não foi passado como parâmetro, ou há algum problema no nome do parâmetro passado no Header da requisição.|
||`token_expired`|O token de acesso passado como parâmetro expirou.|
||`invalid_token`|O token de acesso passado como parâmetro está, de alguma forma, inválido.|
|**403** - Forbidden|`unauthorized_client`|O usuário não possui permissões para prosseguir com a requisição.|
|**404** - Not Found|`not_found`|A URL requisitada não foi encontrada e está de alguma forma inválida.|
|**429** - Too Many Requests|`too_many_requests`|Muitas requisições foram feitas em um período curto de tempo. Para saber mais sobre nossos limites veja nossa seção de [Rate Limit](https://developers.hotmart.com/docs/pt-BR/start/rate-limit/) .|
|**500** - Server Error|`internal_server_error`|Ocorreu algum erro interno não esperado e não foi possível completar a requisição.|
|**502** - Bad Gateway|`internal_server_error`|A requisição demorou mais do que 30 segundos para buscar os dados. Recomendamos revisar as datas consultadas e/ou [usar outros filtros disponíveis](https://developers.hotmart.com/docs/en/v1/sales/sales-history/#query) .|
|**503** - Service Unavailable|`internal_server_error`|Tivemos um erro interno e a API está indisponível para todos os usuários. Tente novamente mais tarde, estamos atuando para restabelecer o serviço.|
# Rate Limit

Saiba como lidamos com o rate limit em nossas APIs

### [](https://developers.hotmart.com/docs/pt-BR/start/rate-limit/#o-que-e-rate-limit)O que é Rate Limit?

Rate limit é o número de chamadas à API que o usuário ou aplicação pode realizar dentro de um período de tempo. Isso é feito para evitar a sobrecarga dos nossos sistemas e manter sua estabilidade e segurança.

Por padrão, permitimos 500 chamadas por minuto considerando leitura e escrita. Usuários que enviam muitas requisições em sequência e ultrapassam esse limite, receberão uma mensagem de erro com status code [429](https://developers.hotmart.com/docs/pt-BR/start/http-response-codes/) .

### [](https://developers.hotmart.com/docs/pt-BR/start/rate-limit/#http-headers)HTTP Headers

Para conhecimento, enviamos no Header do response campos adicionais informando quais são os limites permitidos, quantas solicitações estão disponíveis e quanto tempo levará até que a cota seja restaurada, por exemplo:

- **RateLimit-Limit**: Indica quantas chamadas a sua aplicação pode fazer à nossa API por janela de tempo. Como dito anteriormente, nossa janela de tempo é de 1 minuto.
- **RateLimit-Remaining**: Indica o total de requisições do cliente disponíveis na janela de tempo.
- **RateLimit-Reset**: Indica o tempo restante para que o limite de requisições seja redefinido.

Também enviaremos, no Header, informações sobre os limites por período e o número de solicitações restantes:

- **X-RateLimit-Limit-Minute**: Indica quantas chamadas a sua aplicação pode fazer à nossa API por minuto.
- **X-RateLimit-Remaining-Minute**: Indica o total de requisições do cliente disponíveis no minuto corrente.

# Paginação

A Hotmart utiliza uma estrutura de paginação baseada na abordagem de cursor pagination para lidar com suas coleções de recursos.

Na plataforma da Hotmart, nós podemos encontrar algumas coleções de recursos. Coleções de usuários, de assinaturas, produtos, entre muitos outros. Essas coleções também podem ser chamadas de listas.

A API da Hotmart possui endpoints que dão acesso a algumas dessas listas de elementos que em alguns casos podem se tornar muito grandes.

Imagina um endpoint que retorna todas as vendas do ano anterior, por exemplo. Muita coisa, não é mesmo?

Pensando em melhorar a experiência, usamos uma estrutura de paginação, utilizando a abordagem de _cursor pagination_.

### [](https://developers.hotmart.com/docs/pt-BR/start/pagination/#parametros-da-requisicao)Parâmetros da requisição

- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista.
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    

GETRequest

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/subscriptions?page_token=:page_token' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer :access_token'
```

### [](https://developers.hotmart.com/docs/pt-BR/start/pagination/#retorno)Retorno

- items
    
    Coleção de itens do tipo da lista, como lista de vendas por exemplo.
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    - total_results
    
    ```
    Pode não ser retornado em todos os endpoints, mas nele estará a quantidade de itens que a lista inteira possui, desconsiderando a paginação.
    ```
    
- next_page_token
    
    ```
    Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next\_page\_token**.
    ```
    
- prev_page_token
    
    ```
    Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev\_page\_token**.
    ```
    
- results_per_page
    
    ```
    Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
    
    Cada endpoint terá um **results\_per\_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
    ```
    

Response

```json
{
  "items": [...],
  "page_info": {
      "total_results": 30,
      "next_page_token": "eyJwYWdlIjoyLCJyb3dzIjoxMH0=",
      "prev_page_token": "eyJwYWdlIjoyLCJyb3dzIjoxMH0=",
      "results_per_page": 10
  }
}
```

Onde o atributo **items** contém uma coleção de itens do tipo da lista, como lista de vendas por exemplo.

# Custom Response

Custom Response possibilita a customização do retorno das APIs da Hotmart de forma a atender melhor o seu negócio. Saiba como lidamos com esta funcionalidade em nossas APIs.

### [](https://developers.hotmart.com/docs/pt-BR/start/custom-response/#o-que-e-custom-response)O que é Custom Response?

**Custom Response** possibilita a customização do retorno de nossas APIs de forma a atender melhor o seu negócio.

Usando a abordagem de seleção de atributos, você pode escolher quais dados deseja receber, tornando a integração mais ágil e fácil de compreender.

Isto é feito passando um _query param_ de nome `select`, que lhe permite escolher quais atributos estarão presentes no body da resposta da sua solicitação `HTTP`. Ele pode ser usado em qualquer verbo `HTTP` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) disponível em nossos endpoints.

Você irá receber os dados somente dos atributos que informar, desconsiderando os demais. Caso nenhum atributo seja encontrado o retorno será um JSON vazio.

### [](https://developers.hotmart.com/docs/pt-BR/start/custom-response/#parametros-da-requisicao)Parâmetros da requisição

- select
    
    Lista de atributos que se deseja selecionar, seus valores são separados por vírgula.
    
    Caso o atributo que você precisa selecionar esteja dentro de um **Objeto**, como por exemplo o país do endereço de um produtor, você pode atribuir o valor `address.country` ao _query param_ select.
    
    Caso o atributo que você precisa selecionar esteja dentro de um **Array**, como por exemplo o nome dos produtos de um produtor, você pode atribuir o valor `products.nome` ao _query param_ select.
    
    Em endpoints de [Paginação](https://developers.hotmart.com/docs/pt-BR/start/pagination/) , você pode simplesmente atribuir ao _query param_ **select** os atributos contidos no `items` sendo somente este atributos possíveis de ser customizados.
    

POSTRequest

cURL

```bash
curl --location --request POST 'https://developers.hotmart.com/payments/api/v1/subscriptions/:subscriber_code/cancel?select=subscriber_code,date_last_recurrence,status' \
--header 'Content-Type: application / json' \
--header 'Authorization: Bearer: access_token'
```

### [](https://developers.hotmart.com/docs/pt-BR/start/custom-response/#selecao-de-dados)Seleção de Dados

O exemplo de resposta informado possui diferentes tipos de dados, no caso temos `id` e `name` do tipo simples, `address` como um objeto e `products` como um array de objetos. Para selecionar cada um destes diferentes tipos de dados, você deverá fazer da seguinte forma:

|Tipo|Query param|Retorno|
|---|---|---|
|`simples`|`select=id,name`|Dados de `id` e `name`|
|`objetos`|`select=address`|Dados do Objeto de `address`|
|`arrays`|`select=products`|Dados do Arrays de `products`|

Para selecionar atributos de estruturas mais complexas tais como objetos e arrays, você deverá fazer da seguinte forma:

|Atributos|Query param|Retorno|
|---|---|---|
|`objetos`|`select=address.country`|Dados de `country` do `address`|
|`arrays`|`select=products.name`|Dados de `name` do `products`|

Response

```json
{
  "id": 123,
  "name": "Producer 01",
  "address": {
    "country": "Brazil",
    "city": "Belo Horizonte"
  },
  "products": [
    {
      "id": 1,
      "name": "Product Name 01"
    },
    {
      "id": 2,
      "name": "Product Name 02"
    },
    {
      "id": 3,
      "name": "Product Name 03"
    }
  ]
}
```

# Assinaturas

O serviço de assinaturas da Hotmart é um modo de cobranças recorrentes que são programadas e processadas pelo HotPay.

## [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/about-subscription/#o-que-sao-assinaturas)O que são Assinaturas

Essa modalidade implica a **cobrança recorrente** pelo acesso ao conteúdo, isto é, o comprador deverá efetuar pagamentos periódicos (mensal, bimestral, trimestral, semestral ou anual, conforme configurado pelo produtor) para ter acesso contínuo ao produto por um determinado tempo.

O Produtor poderá definir qual será o **intervalo de tempo** em que será processada a cobrança de uma recorrência. Caso não seja configurado um número de recorrências as cobranças são realizadas até que o comprador cancele a assinatura.

A data de cobrança de uma assinatura será no **mesmo dia** em que ela foi adquirida, desde que o assinante não a altere. Ou seja, em um plano semestral iniciado em 01/01/2020, a segunda cobrança será realizada automaticamente em 01/07/2020, e assim por diante.

As assinaturas na Hotmart podem assumir **diferentes status** que auxiliam os compradores, afiliados e produtores a acompanhar o momento do usuário por meio do sistema.

Uma assinatura pode assumir os seguintes status:

|Status|Definição|
|---|---|
|Ativa|O pagamento da última recorrência está em dia e a assinatura ainda dentro do período de duração.|
|Atrasada|Seu cliente está com o pagamento da última recorrência atrasado e a assinatura ainda está no período vigente.|
|Cancelada pelo Administrador|O cancelamento da assinatura foi feito pela Equipe de Suporte Hotmart.|
|Cancelada pelo Cliente|O cancelamento da assinatura foi feito pelo Comprador.|
|Cancelada pelo Vendedor|O cancelamento da assinatura feito por você, Produtor, ou pelo seu colaborador.|
|Inativa|A primeira recorrência não teve pagamento confirmado/aprovado.|
|Iniciada|O seu aluno gerou o boleto para pagamento da primeira recorrência da assinatura, mas ele ainda não foi confirmado.|
|Vencida|Acabou o período de duração da assinatura. As recorrências cobradas neste período podem estar todas quitadas ou pode haver alguma em atraso.|


## [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscribers/#obter-assinaturas)Obter Assinaturas

Este endpoint exibe as informações detalhadas das assinaturas/assinantes do produtor. Utilizado para listagem de assinaturas e informações detalhadas para as mesmas.

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscribers/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscribers/#query)Query

- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista.
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- product_id
    
    Mostra o ID (é um número de 7 dígitos) do seu produto de assinatura.
    
- plan
    
    Mostra o nome do plano no qual o(a) assinante se inscreveu. Este atributo pode receber múltiplos valores, bastando apenas que o usuário repita sua chave na requisição com valores diferentes.
    
- plan_id
    
    Identificador único do plano de assinatura.
    
- accession_date
    
    Mostra a data de início da assinatura. Caso nenhum valor seja informado será considerada a data atual menos 30 dias. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_accession_date
    
    Data em que o assinante solicitou o cancelamento da assinatura. A data deve estar em milissegundos, a partir de 1970-01-01 00:00:00 UTC.
    
- status
    
    Mostra os status do momento em que aquela assinatura se encontra. Estes status podem ser:  
    `ACTIVE`, `INACTIVE`, `DELAYED`, `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_SELLER`, `CANCELLED_BY_ADMIN`, `STARTED` ou `OVERDUE`
    
- subscriber_code
    
    Mostra o código exclusivo de um assinante, que pode inclusive não ser a mesma pessoa que fez a compra da assinatura.
    
- subscriber_email
    
    Mostra o email de um assinante.
    
- transaction
    
    Identificador único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
    
- trial
    
    Mostra se a assinatura que você vai buscar tem ou não período de teste. Algumas assinaturas podem ter um período de testes no início.
    
- cancelation_date
    
    Assinaturas canceladas a partir desta data. Caso nenhum valor seja informado, será considerada a data atual menos 30 dias. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_cancelation_date
    
    Assinaturas canceladas até esta data. Caso nenhum valor seja informado, será considerada a data atual. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- date_next_charge
    
    Data de tentativa do próximo pagamento. No caso de assinaturas canceladas, indicará a última data de acesso do assinante ao produto e, portanto, nenhuma cobrança será efetuada após este período.  
    Exemplo: o assinante comprou um produto que é cobrado todo dia 10 do mês. Se no dia 20 deste mês o assinante decidiu cancelar a assinatura, a data mostrada neste campo será o dia 10 do mês subsequente.  
    Esse dado será retornado em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC.
    
    Aqui será aplicado o filtro para assinaturas com data de tentativa do próximo pagamento a partir dessa data. Caso nenhum valor seja informado, será considerada a data atual. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_date_next_charge
    
    Aqui será aplicado o filtro para assinaturas com data de tentativa do próximo pagamento até essa data. Caso nenhum valor seja informado, será considerada a data atual. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    

GET/payments/api/v1/subscriptions

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/subscriptions?status=CANCELLED_BY_SELLER&status=ACTIVE' \
	--header 'Content-Type: application/json' \
	--header 'Authorization: Bearer :access_token'
```

---

### Retorno

- items
    
    esconder parâmetros
    
    - subscriber_code
        
        Traz o código daquele assinante. Este campo é usado pelo sistema externo para identificar um assinante de uma assinatura. Um mesmo comprador terá 2 subscribersCode diferentes se ele assinar dois produtos diferentes.
        
    - subscription_id
        
        Mostra o número de identificação da assinatura na Hotmart.
        
    - status
        
        Mostra os status do momento em que aquela assinatura se encontra. Estes status podem ser:  
        `ACTIVE`, `INACTIVE`, `DELAYED`, `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_SELLER`, `CANCELLED_BY_ADMIN`, `STARTED` ou `OVERDUE`
        
    - accession_date
        
        Mostra a data inicial de liberação para acesso ao conteúdo da assinatura.
        
    - end_accession_date
        
        Data em que o assinante solicitou o cancelamento da assinatura. A data deve estar em milissegundos, a partir de 1970-01-01 00:00:00 UTC.
        
    - request_date
        
        Mostra a data da criação da assinatura.
        
    - date_next_charge
        
        Retorna a data de tentativa do próximo pagamento. No caso de assinaturas canceladas, indicará a última data de acesso do assinante ao produto e, portanto, nenhuma cobrança será efetuada após este período.  
        Exemplo: o assinante comprou um produto que é cobrado todo dia 10 do mês. Se no dia 20 deste mês o assinante decidiu cancelar a assinatura, a data mostrada neste campo será o dia 10 do mês subsequente.  
        Esse dado será retornado em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC.
        
    - trial
        
        Indica se assinatura tem ou teve um período de teste. O valor 'true' significa que sim, 'false' que não.
        
    - transaction
        
        Identificador único de referência para uma transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
        
    - plan
        
        Mostra os dados do plano.
        
        esconder parâmetros
        
        - name
            
            Mostra o nome do plano de assinatura.
            
        - id
            
            Identificador único do plano de assinatura.
            
        - recurrency_period
            
            Retorna a periodicidade de recorrência da assinatura. Os valores possíveis para este campo são 7, 30, 60, 90, 180 e 360 e representam, respectivamente, os seguintes períodos de pagamento da assinatura: semanal, mensal, bimestral, trimestral, semestral e anual.
            
        - max_charge_cycles
            
            Número máximo de recorrências do produto. Caso esse campo não seja retornado, isso significa que o produto foi configurado para o ciclo de cobrança acontecer até o assinante solicitar o cancelamento da assinatura.
            
        
    - product
        
        Mostra os dados do produto.
        
        esconder parâmetros
        
        - id
            
            Mostra o ID do produto.
            
        - name
            
            Mostra o nome do produto de assinatura.
            
        - ucode
            
            Mostra a identificação externa de um produto. É o que você vai usar em seu sistema para identificar seu produto.
            
        
    - price
        
        Mostra os dados do preço.
        
        esconder parâmetros
        
        - value
            
            Mostra o preço de cada recorrência da assinatura.
            
        - currency_code
            
            Mostra o código da moeda de pagamento da assinatura. É um código internacional de três digitos, por exemplo BRL, USD, EUR, ...
            
        
    - subscriber
        
        Mostra os dados do assinante.
        
        esconder parâmetros
        
        - name
            
            Mostra o nome do assinante.
            
        - email
            
            Mostra o email do assinante.
            
        - ucode
            
            Mostra a identificação externa do assinante. É o que você vai usar em seu sistema para identificar seu produto.
            
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - total_results
        
        Pode não ser retornado em todos os endpoints, mas nele estará a quantidade de itens que a lista inteira possui, desconsiderando a paginação.
        
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
    

Response

200 - Success

```json
{
  "items": [
    {
      "subscriber_code": "ABC12DEF",
      "subscription_id": 123456,
      "status": "ACTIVE",
      "accession_date": 1577847600,
      "end_accession_date": 1641005999,
      "request_date": 1577847600,
      "date_next_charge": 1580558059,      
      "trial": false,
      "transaction": "HP16616613605324",
      "plan": {
        "name": "Plan name",
        "id": 726420,
        "recurrency_period": 30,
        "max_charge_cycles": 6
      },
      "product": {
        "id": 123456,
        "name": "Product Name",
        "ucode": "12a34bcd-56e7-4847-fg89-h1i23j4567l8"
      },
      "price": {
        "value": 123.45,
        "currency_code": "BRL"
      },
      "subscriber": {
        "name": "Subscriber name",
        "email": "subscriber@email.com.br",
        "ucode": "10a98bcd-76e5-4321-fg09-h8i76j5432l1"
      }
    }
  ],
  "page_info": {
    "total_results": 30,
    "next_page_token": "05b60506b659c1c6e728db93eada6271e3adcfb4edf507b679874458e31577b3",
    "prev_page_token": "cf1fg8bd082e2864069035c057eca0bac7eb5d604719c5a76e80f0933f49c217",
    "results_per_page": 10
  }
}
```

## [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscription-summary/#sumario-de-assinaturas)Sumário de Assinaturas

O endpoint de Sumário de Assinaturas fornece uma visão geral do status atual de cada Assinatura, Smart Installment e Smart Recovery. Ele detalha a situação da última recorrência e fornece informações que permite realizar ações de retenção de clientes.

Os dados providos compreendem três tipos de cobrança recorrente disponibilizados pela Hotmart. Dada às suas especificidades, cada tipo deve ser analisado separadamente. O primeiro deles é a Assinatura, em que é cobrada dos clientes uma taxa recorrente pelo acesso a um produto em vez de uma cobrança única.

O segundo é o Smart Installments, que permite ao comprador dividir o valor total do produto em pagamentos mensais, especialmente em países onde o pagamento parcelado regular não é oferecido. Ao contrário de um Plano de Assinatura, o Smart Installments não permite que os clientes encerrem uma assinatura.

Por fim, o Smart Recovery é um recurso que cria automaticamente uma nova transação em formato de recorrência quando uma compra é negada devido ao saldo insuficiente do cartão de crédito do comprador, permitindo que seja realizada cobranças mensais para que a venda possa ser recuperada.

**É importante notar que os dados fornecidos por esse endpoint tem uma defasagem de até 24 horas**. Caso você necessite de informações sobre as suas assinaturas em tempo real, sugerimos que utilize o endpoint de [Obter Assinaturas](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscribers/) .

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscription-summary/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscription-summary/#query)Query

- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista.
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- product_id
    
    Mostra o ID (é um número de 7 dígitos) do seu produto de assinatura.
    
- subscriber_code
    
    Código alfanumérico que identifica uma Assinatura-Assinante. Um mesmo comprador pode ter múltiplos códigos de assinante
    
- accession_date
    
    Mostra a data de início da assinatura. Caso nenhum valor seja informado será considerada a data atual menos 30 dias. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_accession_date
    
    Data em que o assinante solicitou o cancelamento da assinatura. A data deve estar em milissegundos, a partir de 1970-01-01 00:00:00 UTC.
    
- date_next_charge
    
    Data de tentativa do próximo pagamento. No caso de assinaturas canceladas, indicará a última data de acesso do assinante ao produto e, portanto, nenhuma cobrança será efetuada após este período.  
    Exemplo: o assinante comprou um produto que é cobrado todo dia 10 do mês. Se no dia 20 deste mês o assinante decidiu cancelar a assinatura, a data mostrada neste campo será o dia 10 do mês subsequente.  
    Esse dado será retornado em milissegundos, contando a partir de 1970-01-01 00: 00: 00 UTC. Aqui será aplicado o filtro para assinaturas com data de tentativa do próximo pagamento a partir dessa data. Caso nenhum valor seja informado, será considerada a data atual. A data deve estar em milissegundos, à partir de 1970-01-01 00: 00: 00 UTC.
    

GET/payments/api/v1/subscriptions/summary

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/subscriptions/summary?accession_date=1682910000000&end_accession_date=1696374925000&max_results=500' \
	--header 'Content-Type: application/json' \
	--header 'Authorization: Bearer :access_token'
```

---

### Retorno

- items
    
    esconder parâmetros
    
    - subscriber_code
        
        Traz o código daquele assinante. Este campo é usado pelo sistema externo para identificar um assinante de uma assinatura. Um mesmo comprador terá 2 códigos de assinante `subscriber_code` diferentes se ele assinar dois produtos distintos.
        
    - subscription_id
        
        Mostra o número de identificação da assinatura na Hotmart.
        
    - status
        
        Mostra os status do momento em que aquela assinatura se encontra. Estes status podem ser:  
        `ACTIVE`, `INACTIVE`, `DELAYED`, `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_SELLER`, `CANCELLED_BY_ADMIN`, `STARTED` ou `OVERDUE`.
        
    - lifetime
        
        Informa o tempo em dias da assinatura, desde a _data de adesão_. Caso o status atual da assinatura seja `ACTIVE/DELAYED` será contabilizados os dias até a _data corrente_; caso o status seja `INACTIVE/STARTED` o valor de `lifetime` será _0_; por outro lado, caso o status da assinatura seja alguns dos cenários de cancelamento (`CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_SELLER` ou `CANCELLED_BY_ADMIN`) o perído considerado será até a _data do cancelamento_; no caso do status `OVERDUE` será considerada a _data do vencimento_ da assinatura.
        
    - accession_date
        
        Mostra a data inicial de liberação para acesso ao conteúdo da assinatura.
        
    - end_accession_date
        
        Data em que o assinante solicitou o cancelamento da assinatura. A data deve estar em milissegundos, a partir de 1970-01-01 00:00:00 UTC.
        
    - trial
        
        Indica se assinatura tem ou teve um período de teste. O valor 'true' significa que sim, 'false' que não.
        
    - plan
        
        Mostra os dados do plano.
        
        esconder parâmetros
        
        - name
            
            Informa o plano vigente na última recorrência da assinatura, já que o comprador pode mudar após a adesão.
            
        - recurrency_period
            
            É a duração das recorrências do Plano vigente na última recorrência da assinatura, já que o comprador pode trocar de plano após a adesão.
            
        
    - product
        
        Mostra os dados do produto.
        
        esconder parâmetros
        
        - id
            
            Mostra o ID do produto.
            
        - name
            
            Mostra o nome do produto de assinatura.
            
        
    - offer
        
        Mostra os dados da oferta.
        
        esconder parâmetros
        
        - code
            
            Informa a chave da oferta vigente na última recorrência da assinatura, já que o comprador pode trocar de plano/oferta após a adesão.
            
        
    - last_recurrency
        
        Informação sobre a última recorrência.
        
        esconder parâmetros
        
        - number
            
            Identificação do número da última recorrência de uma assinatura. Se o Status é `CANCELLED` ou `OVERDUE`, corresponde à recorrência final do seu tempo de vida. Se é `STARTED` ou `INACTIVE`, será a primeira recorrência. Caso a assinatura esteja vigente, ou seja, com o status `ACTIVE` ou `DELAYED`, corresponde à recorrência atual.
            
        - request_date
            
            Data em que se inicia a última recorrência de uma assinatura (período de utilização do serviço). Para as vigentes (Status de assinatura = `ACTIVE` ou `DELAYED), corresponde à primeira transação de cobrança da recorrência atual, para as demais, indica a da máxima recorrência existente no seu histórico. A data está no formato milissegundos a partir de 1970-01-01 00:00:00 UTC.
            
        - status
            
            Informa o status da última recorrência da assinatura. Estes status podem ser: `REFUNDED`,`CHARGEBACK`, `NOT_PAID`, `CLAIMED`,`PAID`.
            
        - transaction_number
            
            Quantidade de transações de cobrança existentes para a última recorrência da assinatura.
            
        - billing_type
            
            O tipo da cobrança indica se a venda realizada trata-se de uma _Assinatura_, um _Smart installment_ ou um _Smart Recovery_. Cada identificador de uma venda recorrente (`subscription_id`) somente pode estar associado a uma das 3 opções: `SUBSCRIPTION` nasce de oferta de produto de assinatura; `SMART RECOVERY` é criado a partir de uma venda de pagamento único que foi recusada por saldo insuficiente; `SMART INSTALLMENT` nasce de uma venda de pagamento único para permitir parcelamento de compras em países que não oferecem parcelamento nativo no cartão de crédito.
            
        
    - unpaid_recurrencies
        
        Lista as recorrências não pagas de uma assinatura
        
        esconder parâmetros
        
        - number
            
            Número da recorrência não paga
            
        - charge_date
            
            Data de cobrança da recorrência não paga. A data está no formato milissegundos a partir de 1970-01-01 00:00:00 UTC.
            
        
    - subscriber
        
        Mostra os dados do assinante.
        
        esconder parâmetros
        
        - name
            
            Mostra o nome do assinante.
            
        - id
            
            Id numérico único do usuário comprador na Hotmart.
            
        - email
            
            Mostra o email do assinante.
            
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.

Response

200 - Success

```json
{
  "items": [
    {
      "subscriber_code": "ABC12DEF",
      "subscription_id": 1223334,
      "status": "ACTIVE",
      "lifetime": 200,
      "accession_date": 1694113403000,
      "end_accession_date": 1694113503000,
      "trial": true,
      "plan": {
        "name": "Plan name",        
        "recurrency_period": 180
      },
      "product": {
        "name": "Product name",
        "id": 12345
      },
      "offer": {
        "code": "o1c97lta"
      },
      "last_recurrency": {
        "number": 2,
        "request_date": 1694113403000,
        "status": "NOT_PAID",
        "transaction_number": 1,
        "billing_type": "SMART_INSTALLMENT"
      },
      "unpaid_recurrencies": [
        {
          "number": 2,
          "charge_date": 1694113403000
        }
      ],
      "subscriber": {
        "name": "John",
        "id": 12345,
        "email": "teste@email.com"
      }
    }
  ],
  "page_info": {
    "results_per_page": 0,
    "next_page_token": "05b60506b659c1c6e728db93eada6271e3adcfb4edf507b679874458e31577b3",
    "prev_page_token": "cf1fg8bd082e2864069035c057eca0bac7eb5d604719c5a76e80f0933f49c217"
  }
}
```

## Transações de Assinatura

O endpoint de Transações de Assinaturas fornece um detalhamento de cada transação das Assinaturas, Smart Installments e Smart Recovery. Obtenha a recorrência e histórico de cada tipo de cobrança, incluindo detalhes de pagamento e previsão de liberação de pagamento.

Os dados providos compreendem três tipos de cobrança recorrente disponibilizados pela Hotmart. Dada às suas especificidades, cada tipo deve ser analisado separadamente. O primeiro deles é a Assinatura, em que é cobrada dos clientes uma taxa recorrente pelo acesso a um produto em vez de uma cobrança única.

O segundo é o Smart Installments, que permite ao comprador dividir o valor total do produto em pagamentos mensais, especialmente em países onde o pagamento parcelado regular não é oferecido. Ao contrário de um Plano de Assinatura, o Smart Installments não permite que os clientes encerrem uma assinatura.

Por fim, o Smart Recovery é um recurso que cria automaticamente uma nova transação em formato de recorrência quando uma compra é negada devido ao saldo insuficiente do cartão de crédito do comprador, permitindo que seja realizada cobranças mensais para que a venda possa ser recuperada.

**Importante:**

- **Os dados fornecidos por esse endpoint tem uma defasagem de até 24 horas.** Caso você necessite de informações sobre as suas assinaturas em tempo real, sugerimos que utilize o endpoint de [Obter Assinaturas](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscribers/) .
- Por padrão, a requisição retorna dados referentes **ao período dos últimos 30 dias**, exceto para o código da transação (`transaction`). Caso queira customizar a sua consulta, utilize os parâmetros `transaction_date` e `end_transaction_date`.

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscription-transactions/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscription-transactions/#query)Query

- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- product_id
    
    Identificador único (ID) do produto vendido (número de 7 dígitos).
    
- transaction
    
    Código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
    
- subscriber_name
    
    Nome do comprador envolvido na transação.
    
- subscriber_email
    
    Email do comprador envolvido na transação.
    
- billing_type
    
    O tipo da cobrança indica se o subscriber_code trata-se de `SUBSCRIPTION`, `SMART_INSTALLMENT` ou `SMART_RECOVERY`. É mutuamente exclusivo, ou seja, um mesmo `subscription_id` somente pode ter uma única característica dentre as opções.
    
- subscription_status
    
    Para o tipo de cobrança assinatura. Indica a situação atual da Assinatura. O Status pode ser:
    
    `STARTED` (Iniciada): o aluno gerou a cobrança da primeira recorrência da assinatura, mas o pagamento ainda não foi confirmado.  
    `INACTIVE` (Inativa): a primeira recorrência não teve pagamento confirmado/aprovado e está vencida.  
    `ACTIVE` (Ativa): o pagamento da última recorrência está em dia e a assinatura ainda está no período vigente. Se uma parcela anterior não foi paga, o acesso foi cortado, e o Assinante voltou a pagar uma parcela posterior, esse atraso é "perdoado" e normalmente não é cobrado pelo Produtor.  
    `DELAYED` (Atrasada): o cliente está com o pagamento da última recorrência atrasado e a assinatura ainda está no período vigente.
    
    Cancelada: a assinatura foi cancelada antes do vencimento. Na 1ª recorrência, sempre que é solicitado reembolso ou chargeback, a assinatura é cancelada.
    
    `CANCELLED_BY_ADMIN` (Cancelada pelo Administrador): o cancelamento da assinatura foi feito pela Equipe de Suporte Hotmart.  
    `CANCELLED_BY_CUSTOMER` (Cliente): o cancelamento da assinatura foi feito pelo Assinante.  
    `CANCELLED_BY_SELLER` (Vendedor): o cancelamento da assinatura feito pelo Produtor ou seu colaborador.  
    `OVERDUE` (Vencida): acabou o período de duração da assinatura. As recorrências cobradas neste período podem estar todas quitadas ou pode haver alguma em atraso. Após esse período, não é possível reativar o mesmo id de Assinatura, caso o Assinante deseje renovar, um novo deve ser criado.
    
    Para o tipo de cobrança Smart Installment / Smart Recovery. Indica a situação atual da compra Smart Installment / Smart Recovery. O Status pode ser:
    
    `STARTED` (Iniciada): o aluno gerou a cobrança da primeira recorrência da assinatura, mas o pagamento ainda não foi confirmado.  
    `INACTIVE` (Inativa): a primeira recorrência não teve pagamento confirmado/aprovado e está vencida.  
    `ACTIVE` (Ativa): todas as recorrências cobradas até o momento foram pagas pelo cliente.  
    `DELAYED` (Atrasada): o cliente deixou de pagar alguma recorrência. Diferentemente da assinatura, se a última recorrência estiver paga e outra anterior não paga, seu status será atrasado.  
    `CANCELLED_BY_ADMIN` (Cancelada pelo Administrador): compra cancelada pela Equipe de Suporte Hotmart.  
    `CANCELLED_BY_SELLER` (Vendedor): compra cancelada pelo Produtor ou seu colaborador.
    
- recurrency_status
    
    Descreve a situação atual do pagamento da recorrência de uma assinatura. Os valores possíveis são: `PAID`, `NOT_PAID`, `CLAIMED`, `REFUNDED` ou `CHARGEBACK`.
    
- purchase_status
    
    Descreve a situação de uma transação de compra.
    
- transaction_date
    
    Data inicial do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_transaction_date
    
    Data final do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- offer_code
    
    A chave de oferta é um identificador da assinatura. Isso pode mudar se o plano de assinatura mudar.
    
- purchase_payment_type
    
    Tipo de pagamento utilizado pela pessoa compradora para realizar a compra. Os valores possíveis para este campo são: `BILLET`, `CASH_PAYMENT`, `CREDIT_CARD`, `DIRECT_BANK_TRANSFER`, `DIRECT_DEBIT`, `FINANCED_BILLET`, `FINANCED_INSTALLMENT`, `GOOGLE_PAY`, `HOTCARD`, `HYBRID`, `MANUAL_TRANSFER`, `PAYPAL`, `PAYPAL_INTERNACIONAL`, `PICPAY`, `PIX`, `SAMSUNG_PAY` e `WALLET`.
    
- subscriber_code
    
    Identificador único do assinante, essencial para buscar transações específicas de um assinante.
    

GET/payments/api/v1/subscriptions/transactions

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/subscriptions/transactions?transaction_date=1262354400000&end_transaction_date=1735830000000&max_results=500' \
	--header 'Content-Type: application/json' \
	--header 'Authorization: Bearer :access_token'
```

---

### Retorno

- items
    
    esconder parâmetros
    
    - subscription_id
        
        Código único numérico que identifica uma assinatura.
        
    - last_update
        
        Data da última atualização da transação.
        
    - subscriber_code
        
        Código alfanumérico que identifica uma Assinatura-Assinante. Um mesmo comprador pode ter múltiplos códigos de assinante.
        
    - status
        
        Indica a situação atual da Assinatura.
        
    - billing_type
        
        O tipo da cobrança indica se o subscriber_code trata-se de `SUBSCRIPTION`, `SMART_INSTALLMENT` ou `SMART_RECOVERY`. É mutuamente exclusivo, ou seja, um mesmo `subscription_id` somente pode ter uma única característica dentre as opções.
        
    - adoption_date
        
        Data e horário em que o cliente solicita a adesão da assinatura. Todo `subscription_id` apresenta data de adesão, inclusive assinaturas com Status `STARTED` ou `INACTIVE`, que nunca tiveram pagamento de recorrência. É diferente da data de ativação, que informa quando a 1ª recorrência da assinatura se tornou ativa.
        
    - date_next_charge
        
        Data agendada para a próxima cobrança.
        
    - last_recurrency_start_date
        
        Data e horário em que se inicia a última recorrência de uma assinatura (período de utilização do serviço). Para as vigentes (Status de assinatura = `ACTIVE` ou `DELAYED`), corresponde à primeira transação de cobrança da recorrência atual, para as demais, indica a da máxima recorrência existente no seu histórico.
        
    - cancellation_date
        
        Data e horário em que foi cancelada a assinatura. Após cancelamento, ela pode ser reativada se ainda não estiver Vencida. Se for reativada, a data ficará nula. Na 1ª recorrência, sempre que é solicitado reembolso ou chargeback, a assinatura é cancelada.
        
    - max_cycles
        
        É a quantidade máxima de recorrências de um Produto-Plano definida pelo Produtor, sendo a data do vencimento o fim do período da última recorrência. Enquanto a Assinatura está vigente, a cobrança das recorrências acontece automaticamente a cada início de período. Após o vencimento, não é possível renovar a mesma Assinatura. Caso não seja definida uma quantidade máxima de recorrências, ela só deixa de ser vigente se for cancelada.
        
    - last_recurrency_number
        
        Identificação do Número da última recorrência de uma assinatura. Se o Status é `CANCELLED` ou `OVERDUE`, corresponde à recorrência final do seu tempo de vida. Se é `STARTED` ou `INACTIVE`, será a 1ª recorrência. Se é vigente (`ACTIVE` ou `DELAYED`), corresponde à recorrência atual.
        
    - has_unpaid_recurrency
        
        Informa se uma assinatura tem recorrências não pagas. Retorna `true` em todas as linhas da assinatura se tiver, se não, `false`, conforme regras abaixo. Atribui `true`, caso uma assinatura tenha qualquer recorrência com Status "NÃO PAGA". Os demais valores recebem `false`.
        
    - has_credit_card_change
        
        Indica que a cobrança foi suspensa devido a restrições na forma de pagamento utilizada.
        
    - is_paid_anticipation
        
        Indica se a assinatura possui ou não transação de antecipação paga, podendo assumir: `true` - Sim; `false` - Não.
        
    - is_paid_negotiation
        
        Indica se a assinatura possui ou não transações de negociação paga, podendo assumir: `true` - Sim; `false` - Não.
        
    - product
        
        esconder parâmetros
        
        - id
            
            Código do produto vendido na assinatura.
            
        - name
            
            Nome do produto vendido na assinatura.
            
        
    - trial_info
        
        esconder parâmetros
        
        - trial
            
            Informa se uma assinatura teve período de trial. Se sim, retorna `true`, se não, `false`.
            
        - trial_period
            
            Duração em dias do período de trial.
            
        - trial_end
            
            Quando existe período de trial na assinatura, indica a data do seu fim. Usado no cálculo da `last_recurrence_analysis`.
            
        
    - plan
        
        esconder parâmetros
        
        - name
            
            Nome da assinatura.
            
        - recurrency_period
            
            É a descrição da frequência de cobrança em dias (igual à `subscription_plan_recurrency_days` - 30, 360 etc) com uma cláusula adicional: se não houver plano de assinatura, recebe 30 como padrão.
            
        - recurrency_type
            
            É a descrição da frequência de faturamento (igual à `subscription_plan_recurrency_type` - mensal, anual etc) com uma cláusula adicional: se não houver plano de assinatura, recebe Mensal como padrão.
            
        - coupon_code
            
            Código de desconto do cupom. Preenchido em caso de recorrência de antecipação, `subscription_recurrency_transaction_type` = `ANTICIPATION`.
            
        - offer
            
            esconder parâmetros
            
            - key
                
                A chave de oferta é um identificador da assinatura. Isso pode mudar se o plano de assinatura mudar.
                
            - description
                
                Descrição da oferta de produto.
                
            - code
                
                O nome da oferta do produto para produtos de compra única; Para produtos de assinatura, é o código do cupom.
                
            
        
    - recurrency
        
        esconder parâmetros
        
        - status
            
            Descreve a situação atual do pagamento da recorrência de uma assinatura. Os valores possíveis são: `PAID`, `NOT_PAID`, `CLAIMED`, `REFUNDED`, `CHARGEBACK`.
            
        - number
            
            Número sequencial que identifica a recorrência de uma Assinatura. Ele é incrementado de acordo com a Periodicidade (Ex.: se Semestral, após 6 meses a recorrência 1 vira 2).
            
        - start_datetime
            
            Data e horário em que se inicia uma recorrência de uma assinatura (período de utilização do serviço). Corresponde à data de vencimento da recorrência, ou seja, a data da sua primeira transação de cobrança.
            
        - payment_delay_days
            
            Número de dias sem pagamento, calculado a partir da última ordem de transação emitida até o dia atual.
            
        - transaction_type
            
            Tipo de recorrência da assinatura, podendo assumir `AUTOMATIC`, `ANTICIPATION` ou `NEGOTIATION`.
            
        - number_list
            
            Lista de números de recorrência antecipada ou negociada separados por vírgulas.
            
        - transaction_sequence
            
            Com base na data-hora da transação, enumera as transações de uma mesma assinatura-recorrência, iniciando em 1 pela primeira.
            
        - is_current_purchase
            
            Indica a compra/transação atual da recorrência. Se a recorrência possui uma compra paga, então ela será indicada como 1. Caso contrário, a recorrência não tenha uma compra paga, a última compra gerada, purchase_order_date mais recente, será indicado como 1.
            
        - has_retry
            
            Informa se já foram realizadas retentativas automáticas para uma recorrência. Se sim, retorna `true`, se não, `false`. SOBRE RETENTATIVAS: Quando a 1ª transação da recorrência foi recusada e o tipo de pagamento usado foi `CREDIT_CARD`, `APPLE_PAY`, `GOOGLE_PAY` ou `PAYPAL`, podem ser realizadas até 4 retentativas automáticas.
            
        - scheduled_retry
            
            Informa a data e horário da próxima retentativa automática de cobrança de uma recorrência, caso esteja programada.
            
        
    - purchase
        
        esconder parâmetros
        
        - transaction
            
            Identificação alfanumérica de uma transação de compra.
            
        - order_date
            
            Data e horário da transação de compra.
            
        - approved_date
            
            Data e horário em que foi confirmado o pagamento da transação.
            
        - status
            
            Descreve a situação de uma transação de compra. Os valores possíveis são:
            
            `PARTIALLY_REFUNDED` (Parcialmente Reembolsado): O reembolso parcial foi liberado em nosso sistema e passou a ser processado pelo banco, além da operadora de cartão para recebimento dos valores pelo cliente. O valor reembolsado é diferente do valor da compra por acordo pelo tempo de uso do produto. Este processo não pode ser cancelado ou revertido.  
            `DELAYED` (Atrasado): se aplica a cobranças de assinatura a partir da 2ª recorrência, quando o pagamento não foi confirmado ou houve falha.  
            `APPROVED` (Aprovado): o pagamento foi realizado com sucesso.  
            `STARTED` (Iniciada): O processo de compra foi iniciado pelo cliente, mas o pagamento ainda não foi reconhecido por meio de pagamento escolhido pelo Comprador. Este status é frequente em produtos de assinatura ou em pagamentos feitos com cartão de débito.  
            `PRINTED_BILLET` (Boleto Impresso): quando a cobrança foi realizada com boleto, o Status informa que ele foi emitido e ainda não venceu.  
            `REFUNDED` (Reembolsado): o processo de reembolso foi finalizado e o produtor não pode recuperar o valor dessa transação. Na 1ª recorrência, sempre que é solicitado reembolso ou chargeback, a assinatura é cancelada.  
            `WAITING_PAYMENT` (Aguardando Pagto): aplica-se a uma cobrança do tipo cash payment (Pix, Picpay, Baloto etc.) que ainda não venceu. `PROTESTED` (Reclamado): é um estado de transição após a solicitação de reembolso. Após conclusão do processo, a transação pode ficar com Status Reembolsado ou voltar ao Aprovado, caso haja desistência.  
            `CANCELLED` (Cancelado): para assinaturas, aplica-se a uma cobrança de adesão (1ª recorrência) instantânea, como cartão de crédito, que teve falha. Nos outros tipos de cobrança, vale para todas as transações com falha.  
            `COMPLETE` (Completo): o pagamento foi aprovado e o prazo de garantia do produto terminou, portanto o comprador não pode mais pedir reembolso.  
            `CHARGEBACK` (Chargeback): o comprador solicita à operadora do cartão a devolução da compra. A Hotmart recebe uma notificação e move a compra para esse estado. Na 1ª recorrência, sempre que é solicitado reembolso ou chargeback, a assinatura é cancelada.  
            `EXPIRED` (Expirado): aplica-se a uma transação de adesão (1ª recorrência) que usa tipo de pagamento não instantâneo, como boleto e pix, cuja cobrança venceu sem ser paga.  
            `UNDER_ANALYSIS` (Em Análise): O processo de compra foi iniciado pelo cliente, mas ainda está sendo analisado pelo meio de pagamento escolhido pelo Comprador. Este status é frequente em pagamentos realizados via cartão de crédito ou PayPal.
            
        - payment
            
            esconder parâmetros
            
            - payment_type
                
                Forma de pagamento utilizada na transação - como cartão de crédito, boleto, pix, saldo Hotmart, entre outras.
                
            - credit_card_flag
                
                Bandeira do cartão informada no checkout.
                
            - refusal_message
                
                Descreve o motivo da recusa do pagamento (saldo insuficiente, transação recusada). Informação tratada para ser apresentada ao cliente.
                
                `INSUFFICIENT FUNDS`: Saldo insuficiente.  
                `TRANSACTION DECLINED`: Transação recusada.  
                `CARD ISSUER UNAVAILABLE`: Banco emissor indisponível.  
                `CARD HAS NOT BEEN UNBLOCKED BY THE CARDHOLDER`: Cartão não foi desbloqueado pelo portador.  
                `CARD DETAILS NOT PROVIDED`: Dados do cartão não fornecido.  
                `INVALID SECURITY CODE`: Código de segurança incorreto.  
                `INVALID CARD EXPIRY DATE`: Data de validade do cartão incorreta.  
                `INVALID CARD NUMBER`: Número do cartão inválido.  
                `INVALID CARD DATA`: Dados do cartão incorretos.  
                `INVALID AMOUNT`: Valor Inválido.  
                `INVALID CARD`: Cartão inválido.  
                `RESTRICTED CARD`: Existe algum tipo de restrição no cartão.  
                `ERROR NOT IDENTIFIED`: Erro não identificado.  
                `CARD EXPIRED`: Cartão encontra-se vencido.  
                `DEBIT CARD IS NOT ENABLED FOR THE OPERATION`: Cartão de débito não é habilitado para a operação.  
                `CARD DOES NOT SUPPORT INSTALLMENT PURCHASES`: O cartão utilizado não aceita parcelamento.  
                `INVALID NUMBER OF INSTALLMENTS`: Número de parcelas inválido.  
                `THIS SESSION HAS ALREADY BEEN STARTED`: Essa sessão já foi utilizada previamente.  
                `DUPLICATE TRANSACTION`: Compra duplicada.  
                `ERROR NOT IDENTIFIED`: Erro não identificado.
                
            - refund_chargeback_date
                
                Quando uma transação tiver Status Reembolsado ou Chargeback, este campo informará a data e horário em que aconteceu o reembolso/chargeback.
                
            - pix_expiration_date
                
                Data e horário de validade a partir do código pix gerado na compra.
                
            - billet_expiration_date
                
                Para uma transação com tipo de pagamento Boleto, informa a data e horário de vencimento da cobrança.
                
            - billet_reprint_code
                
                Para uma transação com tipo de pagamento Boleto, informa a URL do documento, para que possa ser consultado novamente.
                
            - billet_recovery_type
                
                Para uma transação de recuperação por Boleto, informa se a emissão foi automática ou manual (`AUTOMATIC`/`MANUAL`). Para cada HP só deve existir um registro de recuperação.
                
            
        - installment
            
            esconder parâmetros
            
            - installment_type
                
                Para transações com pagamento parcelado, informa se o tipo do parcelamento é Tradicional `CONVENTIONAL_INSTALLMENT`, Smart Installment `SMART_INSTALLMENT`, Smart Recovery `SMART_RECOVERY` ou À Vista `ONE_TIME_PAYMENT`.
                
            - installment_number
                
                Quando a periodicidade da assinatura é maior que mensal, o comprador pode optar por pagamento parcelado de cada recorrência. Nesses casos, o campo informa a quantidade de parcelas para cada recorrência.
                
            
        - price
            
            esconder parâmetros
            
            - currency
                
                Moeda em que foi feito o pagamento da adesão e será utilizada em toda a vigência da assinatura.
                
            - value
                
                Valor total cobrado ao comprador pela recorrência.
                
            - total_value
                
                Valor total da compra, incluindo possíveis taxas de parcelamento e impostos legais aplicados no país de compra.
                
            
        - commission
            
            esconder parâmetros
            
            - conversion_rate
                
                Taxa usada para converter valor na moeda da compra para a moeda da comissão.
                
            - currency
                
                Moeda selecionada para pagamento da comissão no momento da adesão. Pode haver mudança durante a vigência da assinatura. Nessa situação, haverá uma linha na tabela para cada moeda.
                
            - original_value
                
                Valor previsto para a comissão total da venda, independentemente de ter sido pago pelo comprador. Corresponde ao “Valor da compra” (`purchase_value`), convertido para a moeda de comissão selecionada pelo Creator.
                
            - original_paid_value
                
                Valor de compra (`purchase_value`) pago pelo comprador, convertido para a moeda de comissão selecionada pelo Creator. Para isso, considera a `commission_original_value` de uma transação com Status 'Aprovado' ou 'Completo'. Se a transação for atualizada com reembolso ou chargeback, o valor é zerado.
                
            - producer_value
                
                Informa o valor previsto de comissão do produtor a receber, independentemente de ter sido pago pelo comprador.
                
            - producer_paid_value
                
                Informa o valor real de comissão do produtor a receber, tomando como referência as transações que tiveram pagamento confirmado e não sofreram reembolso ou chargeback. Para isso, considera a `commission_original_value` de uma transação com Status Aprovado ou Completo. Se a transação for atualizada com reembolso ou chargeback, o valor é zerado. O campo independe da data de liberação para saque.
                
            
        
    - subscriber
        
        esconder parâmetros
        
        - id
            
            Id numérico único do usuário comprador na Hotmart.
            
        - name
            
            Nome do comprador na Hotmart.
            
        - email
            
            E-mail do comprador informado no momento da compra.
            
        - phone_ddd
            
            Código DDD do telefone do comprador informado no momento da compra.
            
        - phone
            
            Número do telefone do comprador informado no momento da compra.
            
        
    - producer
        
        esconder parâmetros
        
        - name
            
            Nome do produtor.
            
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.

Response

200 - Success

```json
{
  "items": [
    {
            "last_recurrency_start_date": 1694113403000,
            "has_unpaid_recurrency": false,
            "product": {
                "name": "Product A",
                "id": 1001
            },
            "subscriber": {
                "phone": "1234567890",
                "name": "Subscriber A",
                "id": 10001,
                "phone_ddd": "12",
                "email": "subscriberA@example.com"
            },
            "recurrency": {
                "number": 1,
                "scheduled_retry": 1534204800000,
                "number_list": "3, 4",
                "transaction_sequence": 1,
                "start_datetime": 1694113403000,
                "payment_delays_days": 0,
                "transaction_type": "RECURRING",
                "is_current_purchase": true,
                "has_retry": false,
                "status": "PAID"
            },
            "last_recurrency_number": 1,
            "trial_info": {
                "trial_end": 1696705403000,
                "trial_period": 30,
                "trial": true
            },
            "purchase": {
                "order_date": 1577890800000,
                "price": {
                    "total_value": 29.99,
                    "currency": "USD",
                    "value": 29.99
                },
                "installment": {
                    "installment_number": 1,
                    "installment_type": "MONTHLY"
                },
                "payment": {
                    "refusal_message": "INSUFFICIENT FUNDS",
                    "refund_chargeback_date": 1558051200000,
                    "payment_type": "CREDIT_CARD",
                    "billet_expiration_date": 1639008000000,
                    "billet_recovery_type": "MANUAL",
                    "pix_expiration_date": 1639008000000,
                    "billet_reprint_code": "https://www.boletobancario.com/boletofacil/charge/boleto.html?token=9986502:m:4d70d7725a589dcc2351b8f13fa3066ccd87fc191f2190723666c5de4ae4832e",
                    "credit_card_flag": "VISA"
                },
                "commission": {
                    "original_value": 29.99,
                    "producer_paid_value": 20.0,
                    "currency": "USD",
                    "original_paid_value": 29.99,
                    "conversion_rate": 1.0,
                    "producer_value": 20.0
                },
                "approved_date": 1577890800000,
                "transaction": "TXN000001",
                "status": "APPROVED"
            },
            "cancellation_date": 1536883200000,
            "is_paid_anticipation": false,
            "max_cycles": 12,
            "adoption_date": 1694113403000,
            "subscriber_code": "SUB000001",
            "date_next_charge": 1696705403000,
            "is_paid_negotiation": false,
            "last_update": 1577890800000,
            "billing_type": "SUBSCRIPTION",
            "producer": {
                "name": "Producer A"
            },
            "subscription_id": 1,
            "has_credit_card_change": false,
            "plan": {
                "offer": {
                    "code": "OFFER_CODE_A",
                    "description": "Offer A",
                    "key": "OFFER_KEY_A"
                },
                "recurrency_period": 30,
                "coupon_code": "COUPON001",
                "recurrency_type": "MONTHLY",
                "name": "Plan A"
            },
            "status": "ACTIVE"
        }
  ],
  "page_info": {
    "results_per_page": 1,
    "next_page_token": "05b60506b659c1c6e728db93eada6271e3adcfb4edf507b679874458e31577b3",
    "prev_page_token": "cf1fg8bd082e2864069035c057eca0bac7eb5d604719c5a76e80f0933f49c217"
  }
}
```

## Obter Compras de Assinantes

Este endpoint lista os pagamentos de recorrências vinculados a uma assinatura. Utilizado para listagem de compras e de uma assinatura sendo importante para realizações de métricas e operações sobre uma compra como, por exemplo reembolso.

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscription-purchases/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/get-subscription-purchases/#path)Path

- subscriber_codeobrigatório
    
    É o código exclusivo de um assinante.
    

get/payments/api/v1/subscriptions/:subscriber_code/purchases

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/subscriptions/:subscriber_code/purchases' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer :access_token'
```

---

### Retorno

- transaction
    
    Este campo mostra o código de referência da transação, ex: HP17715690036014
    
- approved_date
    
    Mostra o dia em que o pedido foi aprovado.
    
- payment_engine
    
    Mostra a plataforma de pagamento. Por exemplo, se foi feito usando HotPay ou HotPay Internacional.
    
- status
    
    Mostra o status de compra. Os valores possíveis para este campo são:
    
    `APPROVED`, `BLOCKED`, `CANCELLED`, `CHARGEBACK`, `COMPLETE`, `EXPIRED`, `NO_FUNDS`, `OVERDUE`, `PARTIALLY_REFUNDED`, `PRE_ORDER`, `PRINTED_BILLET`, `PROCESSING_TRANSACTION`, `PROTESTED`, `REFUNDED`, `STARTED`, `UNDER_ANALISYS` ou `WAITING_PAYMENT`.
    
    A descrição de cada status pode ser encontrado em nossa [página de suporte](https://atendimento.hotmart.com.br/hc/pt-br/articles/216441297-Quais-status-uma-transa%C3%A7%C3%A3o-pode-assumir-) .
    
- price
    
    Mostra os dados do preço.
    
    esconder parâmetros
    
    - value
        
        Mostra o valor da transação.
        
    - currency_code
        
        Mostra qual moeda foi usada, no padrão internacional de três letras. Por exemplo: BRL, USD, EUR, MXN, etc...
        
    
- payment_type
    
    Tipo de pagamento utilizado pela pessoa compradora para realizar a compra. Os valores possíveis para este campo são:  
    `BILLET`, `CASH_PAYMENT`, `CREDIT_CARD`, `DIRECT_BANK_TRANSFER`, `DIRECT_DEBIT`, `FINANCED_BILLET`, `FINANCED_INSTALLMENT`, `GOOGLE_PAY`, `HOTCARD`, `HYBRID`, `MANUAL_TRANSFER`, `PAYPAL`, `PAYPAL_INTERNACIONAL`, `PICPAY`, `PIX`, `SAMSUNG_PAY` e `WALLET`.
    
- payment_method
    
    Método de pagamento da compra. Os valores possíveis para este campo são:  
    `BACS_DIRECT_DEBIT`, `BALOTO`, `BANK_DEBIT`, `BILLET`, `CREDIT_CARD_AMERICAN_EXPRESS`, `CREDIT_CARD_AURA`, `CREDIT_CARD_DINERS`, `CREDIT_CARD_DISCOVER`, `CREDIT_CARD_ELO`, `CREDIT_CARD_HIPERCARD`, `CREDIT_CARD_MASTERCARD`, `CREDIT_CARD_VISA`, `CUPON_DE_PAGO`, `DIRECT_BANK_TRANSFER_ADYEN_SOFORT`, `FINANCED_BILLET`, `FINANCED_INSTALLMENT_ADYEN_ONEY`, `FINANCED_INSTALLMENT_ADYEN_ONEY_10X`, `FINANCED_INSTALLMENT_ADYEN_ONEY_12X`, `FINANCED_INSTALLMENT_ADYEN_ONEY_3X`, `FINANCED_INSTALLMENT_ADYEN_ONEY_4X`, `FINANCED_INSTALLMENT_ADYEN_ONEY_6X`, `GOOGLE_PAY`, `HOTMART`, `HYBRID`, `IN_APP_PURCHASE`, `MULTIBANCO`, `OXXO`, `PAGO_EFECTIVO`, `PAYPAL`, `PICPAY`, `PIX`, `SAMSUNG_PAY`, `SEPA_DIRECT_DEBIT`, `BANK_TRANSFER_BB`, `BANK_TRANSFER_BRADESCO`, `BANK_TRANSFER_ITAU` e `APPLE_PAY`.
    
- recurrency_number
    
    Mostra o número da recorrência correspondente.
    
- under_warranty
    
    Mostra se a transação está dentro do prazo de garantia.
    
- purchase_subscription
    
    Mostra se a compra é referente a um produto de assinatura.
    

Response

200 - Success

```json
[
  {
    "transaction": "HP12315823516751",
    "approved_date": 1583331578000,
    "payment_engine": "HotPay",
    "status": "APPROVED",
    "price": {
      "value": 108.0,
      "currency_code": "BRL"
    },
    "payment_type": "CREDIT_CARD",
    "payment_method": "VISA_CREDIT_CARD", 
    "recurrency_number": 1,
    "under_warranty": false,
    "purchase_subscription": true
  }
]
```

## Cancelar Assinatura

Este endpoint faz o cancelamento de uma assinatura, interrompe o ciclo de cobranças e notifica o cancelamento da assinatura para sub-sistemas como Club e Webhook.

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/cancel-subscription/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/cancel-subscription/#path)Path

- subscriber_codeobrigatório
    
    É o código exclusivo de um assinante.
    

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/cancel-subscription/#body)Body

- send_mail
    
    Indica se deve enviar email de notificação de cancelamento ao comprador. Ele manda email se você marcar como true, ou não manda se você marcar como false.
    

POST/payments/api/v1/subscriptions/:subscriber_code/cancel

cURL

```bash
curl --location --request POST 'https://developers.hotmart.com/payments/api/v1/subscriptions/:subscriber_code/cancel' \
--header 'Authorization: Bearer :access_token' \
--header 'Content-Type: application/json' \
--data-raw '{
    "send_mail": :send_mail
}'
```

---

### Retorno

- status
    
    Status atual da assinatura, que pode ser:
    
    `ACTIVE` ou `INACTIVE`
    
- subscriber_code
    
    Código exclusivo de um assinante, que pode inclusive não ser a mesma pessoa que fez a compra da assinatura.
    
- creation_date
    
    Data de criação da assinatura.
    
- current_recurrence
    
    Número da recorrência atual. Por exemplo, se você tem uma assinatura mensal, assim que você assina e paga a primeira recorrência, esta é a recorrência número 1. O valor deste atributo aumentará à medida que novas recorrências forem pagas com o passar do tempo.
    
- date_last_recurrence
    
    Data do último pagamento.
    
- date_next_charge
    
    Data de tentativa do próximo pagamento.
    
- due_day
    
    Dia em que as cobranças são feitas. Para assinaturas mensais ou anuais, significa o dia do mês. Para assinaturas semanais, significa o dia da semana sendo:
    
    `1-segunda`, `2-terça-feira`, `3-quarta-feira`, `4-quinta-feira`, `5-sexta-feira`, `6-sábado` ou `7-domingo`
    
- trial_period
    
    Quantidade de dias que a assinatura disponibiliza como período de teste. Após este período, a primeira cobrança será realizada.
    
- interval_type_between_charges
    
    Intervalo de tempo entre as cobranças de uma assinatura. Nos seguintes formatos:
    
    `DAY`, `WEEK`, `MONTH` ou `INVOICE`.
    
- interval_between_charges
    
    Número de cobranças de acordo com o tipo. Ex: se `interval_type_between_charges` for igual a `MONTH`, significa que ela é mensal e se `interval_between_charges` for igual a `3`, significa que a cobrança é trimestral.
    
- max_charge_cycles
    
    Quantidade de recorrências configuradas para o plano. Se o valor for igual a `0`, significa que não há limite de recorrências, ou seja, o(a) Produtor(a) configurou a opção "até o cliente cancelar".
    
- activation_date
    
    Data de ativação da assinatura.
    
- shopper
    
    Usuário responsável pelo pagamento da assinatura.
    
    esconder parâmetros
    
    - email
        
        Endereço de email do comprador.
        
    - phone
        
        Número de telefone do comprador.
    

Response

200 - Success

```json
{
  "status": "INACTIVE",
  "subscriber_code": "9W2LNSG2",
  "creation_date": "2020-07-20 17:57:42",
  "current_recurrence": 1,
  "date_last_recurrence": "2020-07-20 17:57:42",
  "date_next_charge": "2020-08-24 12:00:00",
  "due_day": 24,
  "trial_period": 26,
  "interval_type_between_charges": "MONTH",
  "interval_between_charges": 1,
  "max_charge_cycles": 13,
  "activation_date": "2020-07-20 17:57:44",
  "shopper": {
    "email": "shopper@email.com.br",
    "phone": "(31) 988888888"
  }
}
```

## Cancelar Lista de Assinaturas

Este endpoint faz o cancelamento de uma lista de assinaturas, interrompe o ciclo de suas cobranças e notifica o cancelamento para sub-sistemas como Club e Webhook.

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/cancel-subscriptions/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/cancel-subscriptions/#body)Body

- subscriber_codeobrigatório
    
    Lista de códigos exclusivos de assinantes (`subscriber_code`) cuja assinatura você deseja cancelar.
    
- send_mail
    
    Indica se será enviado um email notificando o cancelamento da assinatura aos compradores. Por padrão o valor desse atributo é `true`, fazendo com que o email seja enviado. Caso não deseje enviá-lo, passe o valor `false`.
    

POST/payments/api/v1/subscriptions/cancel

cURL

```bash
curl --location --request POST 'https://developers.hotmart.com/payments/api/v1/subscriptions/cancel' \
--header 'Authorization: Bearer :access_token' \
--header 'Content-Type: application/json' \
--data-raw '{
  "subscriber_code": [":subscriber_code"],
  "send_mail": :send_mail
}'
```

---

### Retorno

- success_subscriptions
    
    Lista de assinaturas que foram canceladas com sucesso.
    
    esconder parâmetros
    
    - status
        
        Status atual da assinatura, que pode ser:
        
        `ACTIVE` ou `INACTIVE`
        
    - subscriber_code
        
        Código exclusivo de um assinante, que pode inclusive não ser a mesma pessoa que fez a compra da assinatura.
        
    - creation_date
        
        Data de criação da assinatura.
        
    - current_recurrence
        
        Número da recorrência atual. Por exemplo, se você tem uma assinatura mensal, assim que você assina e paga a primeira recorrência, esta é a recorrência número 1. O valor deste atributo aumentará à medida que novas recorrências forem pagas com o passar do tempo.
        
    - date_last_recurrence
        
        Data do último pagamento.
        
    - date_next_charge
        
        Data de tentativa do próximo pagamento.
        
    - due_day
        
        Dia em que as cobranças são feitas. Para assinaturas mensais ou anuais, significa o dia do mês. Para assinaturas semanais, significa o dia da semana sendo:
        
        `1-segunda`, `2-terça-feira`, `3-quarta-feira`, `4-quinta-feira`, `5-sexta-feira`, `6-sábado` ou `7-domingo`
        
    - trial_period
        
        Quantidade de dias que a assinatura disponibiliza como período de teste. Após este período, a primeira cobrança será realizada.
        
    - interval_type_between_charges
        
        Intervalo de tempo entre as cobranças de uma assinatura. Nos seguintes formatos:
        
        `DAY`, `WEEK`, `MONTH` ou `INVOICE`.
        
    - interval_between_charges
        
        Número de cobranças de acordo com o tipo. Ex: se `interval_type_between_charges` for igual a `MONTH`, significa que ela é mensal e se `interval_between_charges` for igual a `3`, significa que a cobrança é trimestral.
        
    - max_charge_cycles
        
        Quantidade de recorrências configuradas para o plano. Se o valor for igual a `0`, significa que não há limite de recorrências, ou seja, o(a) Produtor(a) configurou a opção "até o cliente cancelar".
        
    - activation_date
        
        Data de ativação da assinatura.
        
    - shopper
        
        Usuário responsável pelo pagamento da assinatura.
        
        esconder parâmetros
        
        - email
            
            Endereço de email do comprador.
            
        - phone
            
            Número de telefone do comprador.
            
        
    
- fail_subscriptions
    
    Lista de assinaturas que não foram canceladas por algum motivo ou erro. Como por exemplo: código de assinante inválido ou assinatura que já está cancelada.
    
    esconder parâmetros
    
    - status
        
        Status atual da assinatura, que pode ser:
        
        `ACTIVE` ou `INACTIVE`
        
    - error
        
        Mostra se houve algum erro no processamento em uma lista de assinaturas. Por exemplo, se o(a) Produtor(a) configura um cancelamento em massa de suas assinaturas e um desses cancelamentos não é processado corretamente, é retornada uma mensagem de erro.
        
    - subscriber_code
        
        Código exclusivo de um assinante, que pode inclusive não ser a mesma pessoa que fez a compra da assinatura.
        
    - creation_date
        
        Data de criação da assinatura.
        
    - current_recurrence
        
        Número da recorrência atual. Por exemplo, se você tem uma assinatura mensal, assim que você assina e paga a primeira recorrência, esta é a recorrência número 1. O valor deste atributo aumentará à medida que novas recorrências forem pagas com o passar do tempo.
        
    - date_last_recurrence
        
        Data do último pagamento.
        
    - date_next_charge
        
        Data de tentativa do próximo pagamento.
        
    - due_day
        
        Dia em que as cobranças são feitas. Para assinaturas mensais ou anuais, significa o dia do mês. Para assinaturas semanais, significa o dia da semana sendo:
        
        `1-segunda`, `2-terça-feira`, `3-quarta-feira`, `4-quinta-feira`, `5-sexta-feira`, `6-sábado` ou `7-domingo`
        
    - trial_period
        
        Quantidade de dias que a assinatura disponibiliza como período de teste. Após este período, a primeira cobrança será realizada.
        
    - interval_type_between_charges
        
        Intervalo de tempo entre as cobranças de uma assinatura. Nos seguintes formatos:
        
        `DAY`, `WEEK`, `MONTH` ou `INVOICE`.
        
    - interval_between_charges
        
        Número de cobranças de acordo com o tipo. Ex: se `interval_type_between_charges` for igual a `MONTH`, significa que ela é mensal e se `interval_between_charges` for igual a `3`, significa que a cobrança é trimestral.
        
    - max_charge_cycles
        
        Quantidade de recorrências configuradas para o plano. Se o valor for igual a `0`, significa que não há limite de recorrências, ou seja, o(a) Produtor(a) configurou a opção "até o cliente cancelar".
        
    - activation_date
        
        Data de ativação da assinatura.
        
    - shopper
        
        Usuário responsável pelo pagamento da assinatura.
        
        esconder parâmetros
        
        - email
            
            Endereço de email do comprador.
            
        - phone
            
            Número de telefone do comprador.
    

Response

200 - Success

```json
{
  "success_subscriptions": [
    {
      "status": "INACTIVE",
      "subscriber_code": "9W2LNSG2",
      "creation_date": "2020-07-20 17:57:42",
      "current_recurrence": 1,
      "date_last_recurrence": "2020-07-20 17:57:42",
      "date_next_charge": "2020-08-24 12:00:00",
      "due_day": 24,
      "trial_period": 26,
      "interval_type_between_charges": "MONTH",
      "interval_between_charges": 1,
      "max_charge_cycles": 13,
      "activation_date": "2020-07-20 17:57:44",
      "shopper": {
        "email": "shopper@email.com.br",
        "phone": "(31) 988888888"
      }
    }
  ],
  "fail_subscriptions": [
    {
      "status": "INACTIVE",
      "error": "SUBSCRIPTION_ALREADY_CANCELED_OR_OVERDUE",
      "subscriber_code": "RGT90XMB",
      "creation_date": "2020-07-08 16:35:57",
      "interval_between_charges": 30,
      "shopper": {
        "email": "shopper2@email.com.br",
        "phone": "(31) 988888888"
      }
    }
  ]
}
```

## Reativar e Cobrar Assinatura

Este endpoint reativa uma [assinatura inativa](https://developers.hotmart.com/docs/pt-BR/v1/subscription/about-subscription/) , podendo escolher se uma nova cobrança será realizada após o processo.

**Importante!**

Para que uma assinatura seja reativada ou reativada e cobrada, é necessário que o(a) assinante aceite a reativação. Para isso, o(a) Produtor(a) deve enviar uma solicitação de reativação e aguardar o aceite do(a) assinante.

Como o assinante receberá a solicitação?

O(a) assinante receberá um email com um link, válido por três dias, para aceitar ou não a reativação da assinatura em questão.

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/reactivate-subscription/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/reactivate-subscription/#path)Path

- subscriber_codeobrigatório
    
    Código exclusivo de assinante cuja assinatura você deseja reativar.
    

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/reactivate-subscription/#body)Body

- charge
    
    Indica se deve realizar uma nova cobrança para os compradores ao reativar as assinaturas. Ele gera uma nova cobrança se você marcar como `true`, por padrão seu valor é `false`. A data de cobrança continuará a mesma de antes da assinatura ter sido desativada.
    

POST/payments/api/v1/subscriptions/:subscriber_code/reactivate

cURL

```bash
curl --location --request POST 'https://developers.hotmart.com/payments/api/v1/subscriptions/:subscriber_code/reactivate' \
  --header 'Authorization: Bearer :access_token' \
  --header 'Content-Type: application/json' \
  --data-raw '{
      "charge": :charge
  }'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/reactivate-subscription/#retorno)Retorno

- status
    
    Status atual da assinatura, que pode ser:
    
    `INACTIVE`
    
- subscriber_code
    
    Código exclusivo de um assinante, que pode inclusive não ser a mesma pessoa que fez a compra da assinatura.
    
- creation_date
    
    Data de criação da assinatura.
    
- interval_between_charges
    
    Ciclo de cobranças da assinatura no momento da adesão. Para cada valor, um ciclo de cobrança diferente:
    
    `7 (ciclo semanal)`, `30 (ciclo mensal)`, `60 (ciclo bimestral)`, `90 (ciclo trimestral)`, `180 (ciclo semestral)`, `360 (ciclo anual)`
    
- shopper
    
    Usuário responsável pelo pagamento da assinatura.
    
    esconder parâmetros
    
    - email
        
        Endereço de email do comprador.
        
    - phone
        
        Número de telefone do comprador.
        
    

Response

200 - Success

```json
{
  "status": "INACTIVE",
  "subscriber_code": "9W2LNSG2",
  "creation_date": "2020-07-20 17:57:42",
  "interval_between_charges": 30,
  "shopper": {
    "email": "shopper@email.com.br",
    "phone": "(31) 988888888"
  }
}
```

## Reativar e Cobrar Lista de Assinaturas

Este endpoint reativa uma lista de [assinaturas inativas](https://developers.hotmart.com/docs/pt-BR/v1/subscription/about-subscription/) , podendo escolher se uma nova cobrança será realizada após o processo.

**Importante!**

Para que uma assinatura seja reativada ou reativada e cobrada, é necessário que o(a) assinante aceite a reativação. Para isso, o(a) Produtor(a) deve enviar uma solicitação de reativação e aguardar o aceite do(a) assinante.

Como o assinante receberá a solicitação?

O(a) assinante receberá um email com um link, válido por três dias, para aceitar ou não a reativação da assinatura em questão.

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/reactivate-subscriptions/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/reactivate-subscriptions/#body)Body

- subscriber_codeobrigatório
    
    Lista de códigos exclusivos de assinantes (`subscriber_code`) cuja assinatura você deseja reativar.
    
- charge
    
    Indica se deve realizar uma nova cobrança para os compradores ao reativar as assinaturas. Ele gera uma nova cobrança se você marcar como `true`, por padrão seu valor é `false`. A data de cobrança continuará a mesma de antes da assinatura ter sido desativada.
    

POST/payments/api/v1/subscriptions/reactivate

cURL

```bash
curl --location --request POST 'https://developers.hotmart.com/payments/api/v1/subscriptions/reactivate' \
  --header 'Authorization: Bearer :access_token' \
  --header 'Content-Type: application/json' \
  --data-raw '{
      "subscriber_code": [:subscriber_code],
      "charge": :charge
  }'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/reactivate-subscriptions/#retorno)Retorno

- success_subscriptions
    
    Lista de assinaturas que foram reativadas com sucesso.
    
    esconder parâmetros
    
    - status
        
        Status atual da assinatura, que pode ser:
        
        `INACTIVE`
        
    - subscriber_code
        
        Código exclusivo de um assinante, que pode inclusive não ser a mesma pessoa que fez a compra da assinatura.
        
    - creation_date
        
        Data de criação da assinatura.
        
    - interval_between_charges
        
    
    Ciclo de cobranças da assinatura no momento da adesão. Para cada valor, um ciclo de cobrança diferente:
    
    `7 (ciclo semanal)`, `30 (ciclo mensal)`, `60 (ciclo bimestral)`, `90 (ciclo trimestral)`, `180 (ciclo semestral)`, `360 (ciclo anual)`
    
    - shopper
        
        Usuário responsável pelo pagamento da assinatura.
        
        esconder parâmetros
        
        - email
            
            Endereço de email do comprador.
            
        - phone
            
            Número de telefone do comprador.
            
        
    
- fail_subscriptions
    
    Lista de assinaturas que não foi possível reativar por algum motivo ou erro. Como por exemplo: código de assinante inválido ou assinatura que já está ativa.
    
    esconder parâmetros
    
    - status
        
        Status atual da assinatura, que pode ser:
        
        `INACTIVE`
        
    - error
        
        Mostra se houve algum erro no processamento em uma lista de assinaturas. Por exemplo, se o(a) Produtor(a) configura um cancelamento em massa de suas assinaturas e um desses cancelamentos não é processado corretamente, é retornada uma mensagem de erro.
        
    - subscriber_code
        
        Código exclusivo de um assinante, que pode inclusive não ser a mesma pessoa que fez a compra da assinatura.
        
    - creation_date
        
        Data de criação da assinatura.
        
    - interval_between_charges
        
    
    Ciclo de cobranças da assinatura no momento da adesão. Para cada valor, um ciclo de cobrança diferente:
    
    `7 (ciclo semanal)`, `30 (ciclo mensal)`, `60 (ciclo bimestral)`, `90 (ciclo trimestral)`, `180 (ciclo semestral)`, `360 (ciclo anual)`
    
    - shopper
        
        Usuário responsável pelo pagamento da assinatura.
        
        esconder parâmetros
        
        - email
            
            Endereço de email do comprador.
            
        - phone
            
            Número de telefone do comprador.
            
        
    

Response

200 - Success

```json
{
  "success_subscriptions": [
    {
      "status": "INACTIVE",
      "subscriber_code": "9W2LNSG2",
      "creation_date": "2020-07-20 17:57:42",
      "interval_between_charges": 30,
      "shopper": {
        "email": "subscriber@email.com",
        "phone": "(31) 988888888"
      }
    }
  ],
  "fail_subscriptions": [
    {
      "status": "ACTIVE",
      "error": "SUBSCRIPTION_ALREADY_ACTIVE",
      "subscriber_code": "RGT90XMB",
      "creation_date": "2020-07-08 16:35:57",
      "interval_between_charges": 30,
      "shopper": {
        "email": "subscriber2@email.com.",
        "phone": "(31) 988888888"
      }
    }
  ]
}
```

## Alterar dia de cobrança

Este endpoint altera o dia de cobrança de uma assinatura que está em vigência, modificando, portanto, as próximas datas de renovação da mesma e respeitando sempre a periodicidade do plano em que cada uma está inserida.

A alteração na data de cobrança é sempre aplicada para o **mês subsequente** da próxima parcela a ser gerada, ou seja, sempre após a cobrança que já estava programada ser processada. Por exemplo, sua assinatura mensal é renovada todo dia 10, mas no dia 11 de janeiro você resolveu alterar a data de vencimento para o dia 5. A próxima mensalidade ainda será no dia 10 de fevereiro e somente depois, no dia 5 de março.

Esta alteração somente está disponível para ser aplicada em assinaturas que possuem o status [Ativa](https://developers.hotmart.com/docs/pt-BR/v1/subscription/about-subscription/)  ou [Atrasada](https://developers.hotmart.com/docs/pt-BR/v1/subscription/about-subscription/)  e pode ser realizada quantas vezes o assinante desejar. Além disso, assinaturas que estejam em período de teste (trial) não poderão ter seu dia de cobrança alterado, uma vez que o primeiro pagamento ainda não foi realizado e, por isso, a assinatura não está em vigência.

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/change-due-day/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/change-due-day/#path)Path

- subscriber_codeobrigatório
    
    Código exclusivo de um assinante.
    

#### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/change-due-day/#body)Body

- due_dayobrigatório
    
    Novo dia de cobrança da assinatura, podendo ser definido entre os valores 1 e 31. Caso seja definido o valor 31 e o mês corrente só possua 30 dias, o dia de cobrança será 30. Valores fora dessa margem não serão aceitos, retornando erro.
    

PATCH/payments/api/v1/subscriptions/:subscriber_code

cURL

```bash
curl --location --request PATCH 'https://developers.hotmart.com/payments/api/v1/subscriptions/:subscriber_code' \
--header 'Authorization: Bearer :access_token' \
--header 'Content-Type: application/json' \
--data-raw '{
  "due_day": :due_day
}'
```

### [](https://developers.hotmart.com/docs/pt-BR/v1/subscription/change-due-day/#retorno)Retorno

Quando for bem sucedido, este endpoint retorna o código HTTP [200](https://developers.hotmart.com/docs/pt-BR/start/http-response-codes/)  com corpo da resposta **vazio**.

Response

400 - Trial Period

```json
{
  "error": "subscription_in_trial_period",
  "error_description": "The subscription due day cannot be changed during the trial period.",
  "error_uri": "https://developers.hotmart.com/docs/pt-BR/start/http-response-codes/"
}
```

# Vendas

Aqui você encontrará todas as informações relativas ao seu histórico de vendas.

## [](https://developers.hotmart.com/docs/pt-BR/v1/sales/about-sales/#introducao-vendas)Introdução Vendas

Aqui você terá acesso às informações detalhadas de todas as suas vendas realizadas na Hotmart. Assim você pode acompanhar diversas informações das suas vendas, desde o **status da venda** até os **valores de comissões dos participantes** da venda.

As opções de consultas são: histórico de vendas, informações sobre os participantes da venda, informações sobre as comissões da venda, detalhes dos valores da venda e valores de comissão sumarizados.

## Histórico de vendas

Esse endpoint exibe as informações das suas vendas realizadas na Hotmart. Utilizado para listagem de vendas e informações detalhadas sobre as mesmas.

Aqui exibimos as informações referente às vendas, caso seja necessário mais detalhes sobre as participantes, comissões e divisão dos valores deve utilizar um dos endpoints disponíveis na API.

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-history/#parametros-da-requisicao)Parâmetros da requisição

- Query
    
    Você precisa adicionar na query os filtros transaction e transaction_status para conseguir consultar todos os status que deseja.Se, por exemplo, na chamada desse endpoint não ser informado os filtros transaction ou transaction_status, retornaremos apenas os status “APPROVED” e “COMPLETE”.
- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista.
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- product_id
    
    Identificador único (ID) do produto vendido (número de 7 dígitos).
    
- start_date
    
    Data inicial do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_date
    
    Data final do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- sales_source
    
    Código SRC utilizado no link da página de pagamento do produto para identificar a origem.
    
    Exemplo: _pay.hotmart.com/B00000000T?**src=nomedacampanha**_
    
- transaction
    
    Código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
    
- buyer_name
    
    Nome da pessoa compradora.
    
- buyer_email
    
    E-mail da pessoa compradora. Você pode utilizar este dado para buscar compras de pessoas específicas.
    
- transaction_status
    
    Mostra o status de compra. Os valores possíveis para este campo são:
    
    `APPROVED`, `BLOCKED`, `CANCELLED`, `CHARGEBACK`, `COMPLETE`, `EXPIRED`, `NO_FUNDS`, `OVERDUE`, `PARTIALLY_REFUNDED`, `PRE_ORDER`, `PRINTED_BILLET`, `PROCESSING_TRANSACTION`, `PROTESTED`, `REFUNDED`, `STARTED`, `UNDER_ANALISYS` ou `WAITING_PAYMENT`.
    
    A descrição de cada status pode ser encontrado em nossa [página de suporte](https://atendimento.hotmart.com.br/hc/pt-br/articles/216441297-Quais-status-uma-transa%C3%A7%C3%A3o-pode-assumir-) .
    
- payment_type
    
    Tipo de pagamento utilizado pela pessoa compradora para realizar a compra. Os valores possíveis para este campo são:  
    `BILLET`, `CASH_PAYMENT`, `CREDIT_CARD`, `DIRECT_BANK_TRANSFER`, `DIRECT_DEBIT`, `FINANCED_BILLET`, `FINANCED_INSTALLMENT`, `GOOGLE_PAY`, `HOTCARD`, `HYBRID`, `MANUAL_TRANSFER`, `PAYPAL`, `PAYPAL_INTERNACIONAL`, `PICPAY`, `PIX`, `SAMSUNG_PAY` e `WALLET`.
    
- offer_code
    
    Código de oferta do produto vendido.
    
- commission_as
    
    Como o usuário da conta foi comissionado pela venda. Os valores possíveis para este campo são: `PRODUCER`, `COPRODUCER`, `AFFILIATE`
    

GET/payments/api/v1/sales/history

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/sales/history?transaction_status=APPROVED' \
	--header 'Content-Type: application/json' \
	--header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-history/#retorno)Retorno

- items
    
    esconder parâmetros
    
    - product
        
        Dados do produto.
        
        esconder parâmetros
        
        - name
            
            Nome do produto.
            
        - id
            
            Identificador único (ID) do produto vendido (número de 7 dígitos).
            
        
    - buyer
        
        Mostra os dados do comprador. As informações somente serão retornadas caso o comprador tenha disponibilizado os dados no ato da compra do produto. Os dados solicitados são definidos pelo Produtor nas configurações da Página de Pagamentos (Checkout).
        
        esconder parâmetros
        
        - name
            
            Nome do comprador.
            
        - ucode
            
            Identificador único do comprador.
            
        - email
            
            E-mail do comprador.
            
        
    - producer
        
        Traz as informações do produtor.
        
        esconder parâmetros
        
        - name
            
            Nome do produtor.
            
        - ucode
            
            Identificador único do produtor.
            
        
    - purchase
        
        Traz as informações da compra.
        
        esconder parâmetros
        
        - transaction
            
            Mostra o código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
            
        - order_date
            
            Data em que o pedido foi realizado em milissegundos a partir de 1970-01-01 00:00:00 UTC.
            
        - approved_date
            
            Data em que o pedido foi aprovado em milissegundos a partir de 1970-01-01 00:00:00 UTC.
            
        - status
            
            Mostra o status de compra. Os valores possíveis para este campo são:
            
            `APPROVED`, `BLOCKED`, `CANCELLED`, `CHARGEBACK`, `COMPLETE`, `EXPIRED`, `NO_FUNDS`, `OVERDUE`, `PARTIALLY_REFUNDED`, `PRE_ORDER`, `PRINTED_BILLET`, `PROCESSING_TRANSACTION`, `PROTESTED`, `REFUNDED`, `STARTED`, `UNDER_ANALISYS` ou `WAITING_PAYMENT`.
            
            A descrição de cada status pode ser encontrado em nossa [página de suporte](https://atendimento.hotmart.com.br/hc/pt-br/articles/216441297-Quais-status-uma-transa%C3%A7%C3%A3o-pode-assumir-) .
            
        - recurrency_number
            
            Número da recorrência correspondente para compras parceledas no cartão ou via Parcelamento Inteligente.
            
        - is_subscription
            
            Se o pedido é do tipo assinatura.
            
        - commission_asComo o usuário da conta foi comissionado pela venda. Os valores possíveis para este campo são: `PRODUCER`, `COPRODUCER`, `AFFILIATE`
            
        - price
            
            Detalhes referentes ao valor da compra.
            
            mostrar parâmetros
            
        - payment
            
            Informações sobre o pagamento.
            
            mostrar parâmetros
            
        - tracking
            
            Código de rastreamento que o afiliado cadastra pra saber a origem venda.
            
            mostrar parâmetros
            
        - warranty_expire_date
            
            Data de vencimento da garantia. É o período no qual o comprador pode solicitar o reembolso do pedido.
            
        - offer
            
            Informações sobre a oferta.
            
            mostrar parâmetros
            
        - hotmart_fee
            
            Informações sobre as tarifas cobradas pela Hotmart. Para saber mais sobre as tarifas da Hotmart, [acesse aqui](https://help.hotmart.com/pt-br/article/quais-sao-as-taxas-de-servico-cobradas-pela-hotmart-/208298448) 
            
            mostrar parâmetros
            
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - total_results
        
        Pode não ser retornado em todos os endpoints, mas nele estará a quantidade de itens que a lista inteira possui, desconsiderando a paginação.
        
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
  "items": [
    {
      "product": {
        "name": "Product06",
        "id": 2125812
      },
      "buyer": {
        "name": "Ian Victor Baptista",
        "ucode": "839F1A4F-43DC-F60F-13FE-6C8BD23F6781",
        "email": "ian@teste.com"
      },
      "producer": {
        "name": "Bárbara Sebastiana Cardoso",
        "ucode": "252A74C5-4A97-143A-9349-E45D871C6018"
      },
      "purchase": {
        "transaction": "HP12455690122399",
        "order_date": 1622948400000,
        "approved_date": 1622948400000,
        "status": "UNDER_ANALISYS",
        "recurrency_number": 2,
        "is_subscription": false,
        "commission_as": "PRODUCER",
        "price": {
          "value": 235.76,
          "currency_code": "USD"
        },
        "payment": {
          "method": "BILLET",
          "installments_number": 1,
          "type": "BILLET"
        },
        "tracking": {
          "source_sck": "HOTMART_PRODUCT_PAGE",
          "source": "HOTMART",
          "external_code": "FD256D24-401C-7C93-284C-C5E0181CD5DB"
        },
        "warranty_expire_date": 1625022000000,
        "offer": {
          "payment_mode": "INVOICE",
          "code": "k2pasun0"
        },
        "hotmart_fee": {
          "total": 36.75,
          "fixed": 0,
          "currency_code": "EUR",
          "base": 11.12,
          "percentage": 9.9
        }
      }
    }
  ],
  "page_info": {
    "total_results": 14,
    "next_page_token": "eyJyb3dzIjo1LCJwYWdlIjozfQ==",
    "prev_page_token": "eyJyb3dzIjo1LCJwYWdlIjoxfQ==",
    "results_per_page": 5
  }
}
```

## Sumário de Vendas

Esse endpoint exibe os valores de comissões totalizados por moeda.

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-summary/#parametros-da-requisicao)Parâmetros da requisição

- Query
    
    Você precisa adicionar na query os filtros transaction e transaction_status para conseguir consultar todos os status que deseja.Se, por exemplo, na chamada desse endpoint não ser informado os filtros transaction ou transaction_status, retornaremos apenas os status “APPROVED” e “COMPLETE”.
- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista.
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- product_id
    
    ID (número de 7 dígitos) do produto vendido.
    
- start_date
    
    Data inicial do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_date
    
    Data final do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- sales_source
    
    Código SRC utilizado no link da página de pagamento do produto para identificar a origem.
    
    Exemplo: _pay.hotmart.com/B00000000T?**src=nomedacampanha**_
    
- affiliate_name
    
    Nome da pessoa Afiliada responsável pela venda (quando a venda for realizada por uma pessoa Afiliada do seu produto).
    
- payment_type
    
    Tipo de pagamento utilizado pela pessoa compradora para realizar a compra. Os valores possíveis para este campo são:  
    `BILLET`, `CASH_PAYMENT`, `CREDIT_CARD`, `DIRECT_BANK_TRANSFER`, `DIRECT_DEBIT`, `FINANCED_BILLET`, `FINANCED_INSTALLMENT`, `GOOGLE_PAY`, `HOTCARD`, `HYBRID`, `MANUAL_TRANSFER`, `PAYPAL`, `PAYPAL_INTERNACIONAL`, `PICPAY`, `PIX`, `SAMSUNG_PAY` e `WALLET`.
    
- offer_code
    
    Código da oferta do produto vendido.
    
- transaction
    
    Código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
    
- transaction_status
    
    Mostra o status de compra. Os valores possíveis para este campo são:
    
    `APPROVED`, `BLOCKED`, `CANCELLED`, `CHARGEBACK`, `COMPLETE`, `EXPIRED`, `NO_FUNDS`, `OVERDUE`, `PARTIALLY_REFUNDED`, `PRE_ORDER`, `PRINTED_BILLET`, `PROCESSING_TRANSACTION`, `PROTESTED`, `REFUNDED`, `STARTED`, `UNDER_ANALISYS` ou `WAITING_PAYMENT`.
    
    A descrição de cada status pode ser encontrado em nossa [página de suporte](https://atendimento.hotmart.com.br/hc/pt-br/articles/216441297-Quais-status-uma-transa%C3%A7%C3%A3o-pode-assumir-) .
    

GET/payments/api/v1/sales/summary

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/sales/summary?product_id=1234567' \
	--header 'Content-Type: application/json' \
	--header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-summary/#retorno)Retorno

- items
    
    esconder parâmetros
    
    - total_items
        
        Quantidade de comissões totalizadas.
        
    - total_value
        
        Valor total das comissões por moeda.
        
        esconder parâmetros
        
        - currency_code
            
            Código da moeda.
            
        - value
            
            Valor total de comissões no período.
            
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - total_results
        
        Pode não ser retornado em todos os endpoints, mas nele estará a quantidade de itens que a lista inteira possui, desconsiderando a paginação.
        
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
  "items": [
    {
      "total_items": 2,
      "total_value": {
        "value": 3.7,
        "currency_code": "USD"
      }
    }
  ],
  "page_info": {
    "total_results": 1,
    "results_per_page": 1
  }
}
```

## Participantes de Vendas

Esse endpoint exibe as informações sobre os participantes das vendas. O participante pode ser o comprador, produtor, afiliado ou co-produtor que tenha participação na produção ou venda do produto.

Você encontrará informações como **nome**, **endereço**, **telefone**, entre outros dados do participante.

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-users/#parametros-da-requisicao)Parâmetros da requisição

- QueryVocê precisa adicionar na query os filtros transaction e transaction_status para conseguir consultar todos os status que deseja.Se, por exemplo, na chamada desse endpoint não ser informado os filtros transaction ou transaction_status, retornaremos apenas os status “APPROVED” e “COMPLETE”.
    
- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista.
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- product_id
    
    Identificador único (ID) do produto vendido (número de 7 dígitos).
    
- start_date
    
    Data inicial do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_date
    
    Data final do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- buyer_email
    
    E-mail da pessoa compradora. Você pode utilizar este dado para buscar compras de pessoas específicas.
    
- sales_source
    
    Código SRC utilizado no link da página de pagamento do produto para identificar a origem.
    
    Exemplo: _pay.hotmart.com/B00000000T?**src=nomedacampanha**_
    
- transaction
    
    Código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
    
- buyer_name
    
    Nome da pessoa compradora.
    
- affiliate_name
    
    Nome da pessoa Afiliada responsável pela venda (quando a venda for realizada por uma pessoa Afiliada do seu produto).
    
- commission_as
    
    Como o usuário da conta foi comissionado pela venda. Os valores possíveis para este campo são: `PRODUCER`, `COPRODUCER`, `AFFILIATE`
    
- transaction_status
    
    Mostra o status de compra. Os valores possíveis para este campo são:
    
    `APPROVED`, `BLOCKED`, `CANCELLED`, `CHARGEBACK`, `COMPLETE`, `EXPIRED`, `NO_FUNDS`, `OVERDUE`, `PARTIALLY_REFUNDED`, `PRE_ORDER`, `PRINTED_BILLET`, `PROCESSING_TRANSACTION`, `PROTESTED`, `REFUNDED`, `STARTED`, `UNDER_ANALISYS` ou `WAITING_PAYMENT`.
    
    A descrição de cada status pode ser encontrado em nossa [página de suporte](https://atendimento.hotmart.com.br/hc/pt-br/articles/216441297-Quais-status-uma-transa%C3%A7%C3%A3o-pode-assumir-) .
    

GET/payments/api/v1/sales/users

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/sales/users?product_id=123' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer :access_token''
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-users/#retorno)Retorno

- items
    
    esconder parâmetros
    
    - transaction
        
        Código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
        
    - product
        
        Dados do produto.
        
        esconder parâmetros
        
        - name
            
            Nome do produto.
            
        - id
            
            Identificador único (ID) do produto vendido (número de 7 dígitos).
            
        
    - users
        
        esconder parâmetros
        
        - role
            
            Tipo do participante da venda. Os valores possíveis para este campo são: `PRODUCER`, `BUYER`, `COPRODUCER`, `AFFILIATE`
            
        - user
            
            Dados do participante da venda.
            
            esconder parâmetros
            
            - ucode
                
                Identificador único do participante da venda.
                
            - locale
                
                Combinação do país e linguagem do participante da venda (obtido através do endereço IP do dispositivo utilizado).
                
            - name
                
                Nome do participante da venda.
                
            - trade_name
                
                Nome fantasia do participante da venda.
                
            - cellphone
                
                Celular do participante da venda. Caso seja uma venda internacional, onde o comprador é de um país fora do Brasil, o DDI do participante será enviado junto ao telefone. Essa regra do DDI acontece apenas para o participante “Buyer”.
                
            - phone
                
                Telefone do participante da venda. Caso seja uma venda internacional, onde o comprador é de um país fora do Brasil, o DDI do participante será enviado junto ao telefone. Essa regra do DDI acontece apenas para o participante “Buyer”.
                
            - email
                
                E-mail do participante da venda.
                
            - documents
                
                Documentos identificadores do participante da venda.
                
                esconder parâmetros
                
                - value
                    
                    Registro identificador do documento do participante da venda.
                    
                - type
                    
                    Tipo de documento do participante da venda (podendo ser `CPF`, `CNPJ`, `RG`, `DNI`, `CIF` ou `DOCUMENT`).
                    
                
            - address
                
                Endereço completo da pessoa participante da venda.
                
                esconder parâmetros
                
                - city
                    
                    Cidade do participante da venda.
                    
                - state
                    
                    Estado da residência do participante da venda.
                    
                - country
                    
                    País do participante da venda.
                    
                - zip_code
                    
                    Código postal do participante da venda.
                    
                - address
                    
                    Nome da rua do participante da venda.
                    
                - complement
                    
                    Complemento de endereço do participante da venda.
                    
                - neighborhood
                    
                    Bairro do participante da venda.
                    
                - number
                    
                    Número da residência do participante da venda.
                    
                
            
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - total_results
        
        Pode não ser retornado em todos os endpoints, mas nele estará a quantidade de itens que a lista inteira possui, desconsiderando a paginação.
        
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
  "items": [
    {
      "transaction": "HP10014546320130",
      "product": {
        "name": "Product 1",
        "id": 178598
      },
      "users": [
        {
          "role": "PRODUCER",
          "user": {
            "ucode": "c9e5e3f4-097e-11e4-be45-22000b409f8a",
            "locale": "FR",
            "name": "Producer Name",
            "trade_name": "Producer Trade Name",
            "cellphone": "1199999999",
            "phone": "6825565681",
            "email": "producerEmail@email.com",
            "documents": [
              {
                "value": "564654",
                "type": "DOCUMENT"
              },
              {
                "value": "68658197646",
                "type": "CPF"
              }
            ],
            "address": {
              "city": "Campo Grande",
              "state": "Campo Grande",
              "country": "Brasil",
              "zip_code": "1213454",
              "address": "Rua Carlos Fortunato Paiva",
              "complement": "",
              "neighborhood": "",
              "number": "123"
            }
          }
        }
      ]
    }
  ],
  "page_info": {
    "total_results": 55,
    "next_page_token": "eyJwYWdlIjoyLCJyb3dzIjozfQ==",
    "results_per_page": 1
  }
}
```

## Comissões de Vendas

Esse endpoint exibe as informações das comissões por participantes da venda. São exibidos os valores em moeda e porcentagem de comissão dos participantes.

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-commissions/#parametros-da-requisicao)Parâmetros da requisição

- Query
    
    Você precisa adicionar na query os filtros transaction e transaction_status para conseguir consultar todos os status que deseja.Se, por exemplo, na chamada desse endpoint não ser informado os filtros transaction ou transaction_status, retornaremos apenas os status “APPROVED” e “COMPLETE”.
- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista.
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- product_id
    
    Identificador único (ID) do produto vendido (número de 7 dígitos).
    
- start_date
    
    Data inicial do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_date
    
    Data final do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- transaction
    
    Código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
    
- commission_as
    
    Como o usuário da conta foi comissionado pela venda. Os valores possíveis para este campo são: `PRODUCER`, `COPRODUCER`, `AFFILIATE`
    
- transaction_status
    
    Mostra o status de compra. Os valores possíveis para este campo são:
    
    `APPROVED`, `BLOCKED`, `CANCELLED`, `CHARGEBACK`, `COMPLETE`, `EXPIRED`, `NO_FUNDS`, `OVERDUE`, `PARTIALLY_REFUNDED`, `PRE_ORDER`, `PRINTED_BILLET`, `PROCESSING_TRANSACTION`, `PROTESTED`, `REFUNDED`, `STARTED`, `UNDER_ANALISYS` ou `WAITING_PAYMENT`.
    
    A descrição de cada status pode ser encontrado em nossa [página de suporte](https://atendimento.hotmart.com.br/hc/pt-br/articles/216441297-Quais-status-uma-transa%C3%A7%C3%A3o-pode-assumir-) .
    

GET/payments/api/v1/sales/commissions

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/sales/commissions?product_id=123' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer :access_token''
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-commissions/#retorno)Retorno

- items
    
    esconder parâmetros
    
    - transaction
        
        Mostra o código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
        
    - product
        
        Dados do produto.
        
        esconder parâmetros
        
        - name
            
            Nome do produto.
            
        - id
            
            Identificador único (ID) do produto vendido (número de 7 dígitos).
            
        
    - exchange_rate_currency_payout
        
        Taxa de conversão utilizada para converter o valor de compra sem impostos no valor bruto da comissão (ainda sem divisão entre as partes envolvidas) em sua respectiva moeda. Quando não acontece conversão, o valor retornado nesse campo é 1.
        
    - commissions
        
        Dados referentes à comissão do participante da venda.
        
        esconder parâmetros
        
        - commission
            
            Traz informações sobre o valor da comissão.
            
            esconder parâmetros
            
            - currency_value
                
                Moeda utilizada para comissionamento, no padrão internacional de três letras. Por exemplo: `BRL`, `USD`, `EUR`, `MXN` e mais.
                
            - value
                
                Valor da comissão.
                
            
        - user
            
            Dados do participante da venda que receberá a comissão.
            
            esconder parâmetros
            
            - ucode
                
                Identificador único do participante da comissão.
                
            - name
                
                Nome do participante da comissão.
                
            
        - source
            
            Indica qual a fonte da comissão, podendo ser um dos seguintes valores: `PRODUCER`, `COPRODUCER`, `AFFILIATE` ou `ADDON`.
            
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - total_results
        
        Pode não ser retornado em todos os endpoints, mas nele estará a quantidade de itens que a lista inteira possui, desconsiderando a paginação.
        
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
  "items": [
    {
      "transaction": "HP12345678901234",
      "product": {
        "name": "Product Test",
        "id": 123456
      },
      "exchange_rate_currency_payout": 0.001334000000,
      "commissions": [
        {
          "commission": {
            "currency_value": "USD",
            "value": 95.00
          },
          "user": {
            "ucode": "1c2fbe3a-e4cb-56ec-b7e8-b9c0f1a234f4",
            "name": "Name User Producer Test"
          },
          "source": "PRODUCER"
        },
        {
          "commission": {
            "currency_value": "USD",
            "value": 4.35
          },
          "user": {
            "ucode": "1c2fbe3a-e4cb-56ec-b7e8-b9c0f1a234f5",
            "name": "Name User Coproducer Test"
          },
          "source": "COPRODUCER"
        },
        {
          "commission": {
            "currency_value": "USD",
            "value": 0.65
          },
          "user": {
            "ucode": "1c2fbe3a-e4cb-56ec-b7e8-b9c0f1a234f6",
            "name": "Name User Addon Test"
          },
          "source": "ADDON"
        }
      ]
    }
  ],
  "page_info": {
    "total_results": 10,
    "results_per_page": 10
  }
}
```

## Detalhamento de preços de vendas

Esse endpoint exibe o detalhamento dos valores da compra. Utilizado para listar os valores da compra, por exemplo: valor total da compra, valor base para comissão, valor dos impostos, valores de cupons de desconto, entre outros.

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-price-details/#parametros-da-requisicao)Parâmetros da requisição

- Query
    
    Você precisa adicionar na query os filtros transaction e transaction_status para conseguir consultar todos os status que deseja.Se, por exemplo, na chamada desse endpoint não ser informado os filtros transaction ou transaction_status, retornaremos apenas os status “APPROVED” e “COMPLETE”.
- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista.
    
    Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- product_id
    
    Identificador único (ID) do produto vendido (número de 7 dígitos).
    
- start_date
    
    Data inicial do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- end_date
    
    Data final do período para o filtro. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- transaction
    
    Código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
    
- transaction_status
    
    Status da transação. Os valores possíveis para este campo são:  
    `STARTED`, `COMPLETE`, `PRINTED_BILLET`, `WAITING_PAYMENT`, `APPROVED`, `UNDER_ANALISYS`, `CANCELLED`, `PROTESTED`, `REFUNDED`, `CHARGEBACK`, `BLOCKED`, `OVERDUE`, `EXPIRED`, `PARTIALLY_REFUNDED`
    
- payment_type
    
    Tipo de pagamento utilizado pela pessoa compradora para realizar a compra. Os valores possíveis para este campo são:  
    `BILLET`, `CASH_PAYMENT`, `CREDIT_CARD`, `DIRECT_BANK_TRANSFER`, `DIRECT_DEBIT`, `FINANCED_BILLET`, `FINANCED_INSTALLMENT`, `GOOGLE_PAY`, `HOTCARD`, `HYBRID`, `MANUAL_TRANSFER`, `PAYPAL`, `PAYPAL_INTERNACIONAL`, `PICPAY`, `PIX`, `SAMSUNG_PAY` e `WALLET`.
    

GET/payments/api/v1/sales/price/details

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/payments/api/v1/sales/price/details?transaction_status=CANCELLED&payment_type=CREDIT_CARD' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer :access_token''
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-price-details/#retorno)Retorno

- items
    
    esconder parâmetros
    
    - transaction
        
        Mostra o código único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.
        
    - product
        
        Dados do produto.
        
        esconder parâmetros
        
        - name
            
            Nome do produto.
            
        - id
            
            Identificador único (ID) do produto vendido (número de 7 dígitos).
            
        
    - base
        
        O valor base é utilizado para a divisão de comissionamento entre produtores, afiliados e coprodutores. Além disso, é dele retirado as taxas dos addons.
        
        esconder parâmetros
        
        - currency_code
            
            Moeda referente ao valor base, no padrão internacional de três letras. Por exemplo: `BRL`, `USD`, `EUR`, `MXN` e mais.
            
        - value
            
            Valor base do pedido.
            
        
    - total
        
        O preço total mostra a composição dos valores base, VAT e juros. O valor vat somente será cobrado caso a venda seja realizada em território europeu e mexicano.
        
        esconder parâmetros
        
        - currency_code
            
            Moeda referente ao valor total, no padrão internacional de três letras. Por exemplo: `BRL`, `USD`, `EUR`, `MXN` e mais.
            
        - value
            
            Valor total do pedido.
            
        
    - vat
        
        VAT (_Value Added Tax_) representa o imposto sobre o valor agregado do produto.
        
        esconder parâmetros
        
        - currency_code
            
            Moeda referente ao valor VAT, no padrão internacional de três letras. Por exemplo: `BRL`, `USD`, `EUR`, `MXN` e mais.
            
        - value
            
            Valor do imposto cobrado.
            
        
    - fee
        
        Determina o valor de juros que será cobrado em uma compra parcelada em `BRL` ou `MXN`. Este valor pode ser pago pelo produtor ou pelo comprador, dependendo da configuração de venda do produto.
        
        esconder parâmetros
        
        - currency_code
            
            Moeda referente aos juros, no padrão internacional de três letras. Por exemplo: `BRL`, `USD`, `EUR`, `MXN` e mais.
            
        - value
            
            Valor dos juros cobrados.
            
        
    - coupon
        
        Informações sobre cupom de desconto, caso tenha sido aplicado.
        
        esconder parâmetros
        
        - code
            
            Código identificador de um cupom.
            
        - value
            
            Porcentagem de desconto do cupom aplicado sobre o valor do produto. Seu valor está entre 0 e 1.
            
        
    - real_conversion_rate
        
        Taxa de conversão utilizada para converter o valor original da oferta no valor a ser pago pela pessoa compradora em sua moeda local.
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - total_results
        
        Pode não ser retornado em todos os endpoints, mas nele estará a quantidade de itens que a lista inteira possui, desconsiderando a paginação.
        
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
  "items": [
    {
      "transaction": "HP14916251567230",
      "product": {
        "id": 8547854,
        "name": "product1"
      },
      "base": {
        "value": 930,
        "currency_code": "MXN"
      },
      "total": {
        "value": 486.25,
        "currency_code": "MXN"
      },
      "vat": {
        "value": 193.25,
        "currency_code": "BRL"
      },
      "fee": {
        "value": 55,
        "currency_code": "USD"
      },
      "coupon": {
        "code": "coupon1",
        "value": 22.9
      },
      "real_conversion_rate": 708.75
    }
  ],
  "page_info": {
    "total_results": 14,
    "next_page_token": "eyJyb3dzIjoxMCwicGFnZSI6Mn0=",
    "results_per_page": 10
  }
}
```

## Reembolso de vendas

Esse endpoint permite solicitar o reembolso de uma venda. Para que isso ocorra, ela precisa cumprir com os seguintes critérios:

- Ter status de **Aprovada** ou **Completa**;
- Não ser venda de modo **trial** (período de teste);
- Não ser uma venda realizada com os modos de pagamentos **BACS** e **SEPA**, nesse caso, o reembolso deverá ser solicitado junto ao banco pelo comprador.

**Importante:**

- É necessário reembolsar o comprador de, no mínimo, 7 dias até 30 dias. Caso queira aumentar o prazo é possível estender até 60 dias. Independente do período configurado, é fundamental mostrar essa informação ao cliente antes da venda. Para saber mais sobre os prazos do comprador, [acesse aqui](https://help.hotmart.com/pt-BR/article/solicitar-reembolso/360061973392) .
- Caso a venda tenha afiliação envolvida, o reembolso pode ser solicitado em até 30 dias após a compra.

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-refund/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-refund/#path)Path

- transactionobrigatórioCódigo único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.

PUT/payments/api/v1/sales/:transaction_code/refund

cURL

```bash
curl --location --request PUT 'https://developers.hotmart.com/payments/api/v1/sales/:transaction_code/refund' \
    --header 'Authorization: Bearer :access_token' \
    --header 'Content-Type: application/json' \
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-refund/#retorno)Retorno

O retorno dessa rota é vazio. Considere apenas os códigos HTTP.

Response

200 - Success

```json
{}
```

## Gerar novo boleto

Utilize esse endpoint para gerar um novo boleto bancário para uma transação. O usuário autenticado deve ser o vendedor da transação.

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-billet/#request-parameters)Request parameters

#### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-billet/#path)Path

- transactionobrigatórioCódigo único de referência para um transação, por exemplo HP17715690036014. Uma transação acontece quando um pedido é efetuado.

PUT/payments/api/v1/sales/:transaction/billet

cURL

```bash
curl --location --request PUT 'https://developers.hotmart.com/payments/api/v1/sales/:transaction/billet' \
    --header 'Authorization: Bearer :access_token' \
    --header 'Content-Type: application/json' \
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-billet/#response)Response

- billet_urlURL do boleto bancário gerado.

Response

200 - Success

```json
{
    "billet_url": "https://checkoutshopper.adyen.com/checkoutshopper/utility/v1/boletobancario.pdf?data=BQABAQAq07..."
}
```

# Área de membros

É o local onde você cria seu curso, organiza e distribui seu conteúdo de forma estruturada e em diversos formatos de mídia para seus alunos.

## [](https://developers.hotmart.com/docs/pt-BR/v1/club/about-club/#o-que-e-a-area-de-membros)O que é a Área de Membros?

Também conhecida como Hotmart Club, a Área de Membros é uma solução gratuita criada para facilitar e potencializar o negócio de vários usuários da plataforma e, entre muitas vantagens, **entregar seus conteúdos de forma automática e inteligente**.

Além disso, a Área de Membros é ilimitada (você pode ter quantos membros desejar), preparada para ajudar a aumentar as suas vendas, garantindo qualidade e alta performance.

Com ela você cria seu curso, organiza e distribui seu conteúdo como quiser, podendo também interagir com seus alunos.

A organização da área de membros é feita em módulos e estes subdivididos em páginas. É possível disponibilizar módulos extra gratuitos ou pagos para seus alunos e, ainda, inserir conteúdos em diversos formatos de vídeo, apresentação, imagens entre outros. Nossos endpoints da área de membros possibilitam que você obtenha as informações dos módulos e páginas, além de dados de alunos e seus respectivos progressos.

## Obter Módulos

Este é o endpoint responsável por buscar o conteúdo criado pelo produtor dentro de uma Área de Membros. É possível obter os módulos principais e também os módulos extra que é o conteúdo adicional oferecido dentro da área de membros.

### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-modules-club/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-modules-club/#query)Query

- subdomainobrigatório
    
    Parâmetro que deverá ser enviado na requisição e irá indicar de qual Área de Membros os dados estão sendo requisitados. O valor será o nome do subdomínio definido na administração do Club.
    
- is_extra
    
    Parâmetro para indicar se os módulos extras devem ser retornados. O valor `true` significa que serão retornados os módulos extras, `false` que serão retornados apenas os módulos principais. Caso o parâmetro não seja informado, o valor o padrão será `false`.
    

GET/club/api/v1/modules

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/club/api/v1/modules?subdomain=my-subdomain&is_extra=false' \
	--header 'Content-Type: application/json' \
	--header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-modules-club/#retorno)Retorno

- module_id
    
    Identificador único relacionado ao módulo.
    
- name
    
    Nome do módulo definido pelo produtor dentro do Club.
    
- sequence
    
    Ordenação sequencial em que o módulo será exibido para os alunos.
    
- is_public
    
    Indica se o módulo é gratuito. Módulos gratuitos são disponibilizados para pessoas que ainda não compraram o seu curso. O valor `true` significa é gratuito, `false` que não.
    
- is_extra
    
    Indica se o módulo é extra. Módulos extras são módulos com conteúdos adicionais que podem ser oferecidos para os alunos, os módulos extra podem ser gratuitos ou podem ser cobrado dos usuários que desejam ter acesso ao conteúdo adicional. O valor `true` significa que é um módulo extra, `false` que não.
    
- is_extra_paid
    
    Indica se o módulo extra é um módulo pago ou se é um módulo gratuito. O valor `true` significa que é pago, `false` que é gratuito.
    
- classes
    
    Mostra as aulas do módulo.
    
- total_pages
    
    Indica a quantidade total de páginas relacionadas ao módulo.
    

Response

200 - Success

```json
[
  {
    "module_id": "2z7ramxejw",
    "name": "Hotmart Club - Module 1",
    "sequence": 1,
    "is_extra": false,
    "is_extra_paid": false,
    "is_public": false,
    "classes": [
      "qV7y1Jm7Jn"
    ],
    "total_pages": 2
  },
  {
    "module_id": "j14okvB4pL",
    "name": "Hotmart Club - Module 2",        
    "sequence": 2,
    "is_extra": false,
    "is_extra_paid": false,
    "is_public": true,
    "classes": [
      "qV7y1Jm7Jn"
    ],
    "total_pages": 4
  },
  {
    "module_id": "v94JMxYOgZ",
    "name": "Hotmart Club - Module 3",
    "sequence": 3,
    "is_extra": false,
    "is_extra_paid": false,
    "is_public": false,
    "classes": [
      "qV7y1Jm7Jn"
    ],
    "total_pages": 3
  },
  {
    "module_id": "d64l09Q4jW",  
    "name": "Hotmart Club - Module 4", 
    "sequence": 4,
    "is_extra": false,                     
    "is_extra_paid": false,
    "is_public": false,
    "classes": [
      "qV7y1Jm7Jn"
    ],
    "total_pages": 1
  },
  {
    "module_id": "DPeA5MoeWE", 
    "name": "Hotmart Club - Module Dripping",
    "sequence": 5,
    "is_extra": false,                       
    "is_extra_paid": false,
    "is_public": true,
    "classes": [
      "qV7y1Jm7Jn"
    ],
    "total_pages": 3
  }
]
```

## Obter Páginas

v2

Este é o endpoint que irá listar todas as páginas que foram criadas dentro de um determinado módulo na área de membros.

Cada uma das páginas tem um dos seguintes tipos: `CONTENT`, `ADVERTISEMENT`, `QUIZ` ou `WEBINAR`. Isso significa que:

|Tipo|Definição|
|---|---|
|CONTENT|É uma página de conteúdo.|
|ADVERTISEMENT|É uma página de anúncio.|
|QUIZ|É uma página de perguntas e respostas.|
|WEBINAR|É uma página de Webinário.|

O tipo de liberação da página pode variar entre `BY_DATE`, `BY_DAYS` ou `BY_QUIZ` de acordo com a estratégia aplicada.

|Status|Definição|
|---|---|
|BY_DATE|Indica que a página tem uma data fixa estabelecida pelo produtor para ser liberada aos alunos.|
|BY_DAYS|Indica que a página será publicada em X dias, onde X será o número de dias estabelecido pelo produtor.|
|BY_QUIZ|Indica que a página será liberada ao concluir um quiz escolhido pelo produtor.|

O único tipo de expiração suportado atualmente é somente o `BY_DAYS`:

|Status|Definição|
|---|---|
|BY_DAYS|Indica que a página será expirada X dias após a compra.|

### [](https://developers.hotmart.com/docs/pt-BR/v2/club/get-pages-club/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v2/club/get-pages-club/#query)Query

- product_idobrigatório
    
    Identificador único (ID) do produto.
    

#### [](https://developers.hotmart.com/docs/pt-BR/v2/club/get-pages-club/#path)Path

- module_idobrigatório
    
    Identificador único relacionado ao módulo, essa informação deve ser obtida através no endpoint [Obter módulos](https://developers.hotmart.com/docs/pt-BR/v1/club/get-modules-club) .
    

GET/club/api/v2/modules/{module_id}/pages

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/club/api/v2/modules/{module_id}/pages?product_id={product_id}' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v2/club/get-pages-club/#retorno)Retorno

- page_id
    
    Identificador único da página.
    
- name
    
    Nome da página definida pelo produtor dentro do Club.
    
- page_order
    
    Ordenação sequencial da página dentro do módulo.
    
- type
    
    Mostra o tipo da página. Estes tipos podem ser:  
    `CONTENT`, `ADVERTISEMENT`, `QUIZ` ou `WEBINAR`.
    
- published
    
    Indica se a página está publicada para os usuários. O valor `true` significa que sim, `false` que não.
    
- total_comments
    
    Total de comentários na página.
    
- rates_average
    
    Média de avaliações dos usuários na página.
    
- rates
    
    Média de avaliações detalhada.
    
    esconder parâmetros
    
    - rate
        
        Indicador das avaliações realizadas pelos alunos, sendo os valores possíveis: `1` Ruim; `2` Razoável; `3` Bom; `4` Muito bom; `5` Excelente.
        
    - total
        
        Quantidade total de avaliações para o indicador `rate`.
        
    
- has_media
    
    Indicador se a página possui mídias relacionadas. Quando for `true` a página possui mídia relacionada e se for `false` a página não possui qualquer conteúdo de mídia relacionado.
    
- driping_configs
    
    Lista de agendamentos (liberação e expiração) configurados para a página.
    
    esconder parâmetros
    
    - liberation
        
        Caso haja agendamento de liberação para a página, este campo irá exibir suas configurações.
        
        esconder parâmetros
        
        - type
            
            Indica qual o tipo de liberação da página. Estes tipos podem ser:  
            `BY_DAYS`, `BY_DATE` ou `BY_QUIZ`.
            
        - liberation_date
            
            Caso o tipo de liberação seja `BY_DATE`, esse campo indicará qual a data de liberação.
            
        - liberation_days
            
            Caso o tipo de liberação seja `BY_DAYS`, esse campo indicará a quantidade de dias após a compra em que a página será liberada.
            
        - page_id
            
            Caso o tipo de liberação seja `BY_QUIZ`, esse campo indicará o quiz que deve ser concluído para liberar a página.
            
        
    - expiration
        
        Caso haja agendamento de expiração para a página, este campo irá exibir suas configurações.
        
        esconder parâmetros
        
        - type
            
            Indica qual o tipo de expiração da página. Atualmente, apenas o tipo `BY_DAYS` será retornado.
            
        - duration_days
            
            Indica quantos dias após a compra em que a página será expirada.
            
        
    - classes
        
        Lista de turmas às quais serão aplicados os agendamentos configurados. Se a lista estiver vazia, significa que os agendamentos são aplicados para todas as turmas.
        
        esconder parâmetros
        
        - id
            
            Identificador único da turma.
            
        - name
            
            Nome da turma.
            
        - default_class
            
            Indica se é uma turma padrão.
            
        
    

Response

200 - Success

```json
[
    {
        "page_id": "RE4zW6m6el",
        "name": "Dripping 100 days",
        "type": "CONTENT",
        "page_order": 1,
        "total_comments": 0,
        "rates": [],
        "rates_average": 0.0,
        "published": true,
        "has_media": false,
        "dripping_configs": [
            {
                "liberation": {
                    "type": "BY_DAYS",
                    "liberation_days": 200
                },
                "expiration": {
                    "type": "BY_DAYS",
                    "duration_days": 120
                },
                "classes": []
            }
        ]
    },
    {
        "page_id": "B146nbrx4d",
        "name": "Dripping BY_DATE",
        "type": "CONTENT",
        "page_order": 2,
        "total_comments": 5,
        "rates": [
            {
                "rate": 3,
                "total": 1
            },
            {
                "rate": 5,
                "total": 1
            }
        ],
        "rates_average": 4.0,
        "published": true,
        "has_media": false,
        "dripping_configs": [
            {
                "liberation": {
                    "type": "BY_DATE",
                    "liberation_date": "2020-03-27T03:00:00Z"
                },
                "classes": [
                    {
                        "id": "0Z725jyeNm",
                        "name": "DEFAULT_CLASS",
                        "default_class": true
                    },
                    {
                        "id": "QLO0gbB7GM",
                        "name": "Advanced Class",
                        "default_class": false
                    }
                ]
            },
            {
                "liberation": {
                    "type": "BY_QUIZ",
                    "page_id": "Xm7YgJWD46"
                },
                "classes": [
                    {
                        "id": "Pk45vnqPel",
                        "name": "Bonus Class",
                        "default_class": false
                    }
                ]
            }
        ]
    },
    {
        "page_dd": "B146nbG34d",
        "name": "Offer product",
        "type": "ADVERTISEMENT",
        "page_order": 3,
        "total_comments": 0,
        "rates": [],
        "rates_average": 0.0,
        "published": true,
        "has_media": false,
        "dripping_configs": []
    }
]
```

## Obter Alunos

Este é o endpoint que irá retornar todos os alunos de uma Área de Membros. Podem ser alunos que realizaram uma compra, que foram importados ou que ingressaram pelo cadastro gratuito.

Os alunos ou usuários podem ter os seguintes papéis dentro da Área de Membros: `STUDENT`, `FREE_STUDENT`, `OWNER`, `ADMIN`, `CONTENT_EDITOR` ou `MODERATOR`. Isso significa:

|Papel|Definição|
|---|---|
|`STUDENT`|Estudante|
|`FREE_STUDENT`|Estudante gratuito|
|`OWNER`|Proprietário da Área de Membros.|
|`ADMIN`|Administrador da Área de Membros.|
|`CONTENT_EDITOR`|Editor de conteúdo.|
|`MODERATOR`|Moderador da Área de Membros.|

Para Acesso Plus, os alunos podem ter os seguintes status no atributo `plus_access` : `WITHOUT_PLUS_ACCESS`, `HOLDER`, `DEPENDENT`, `HOLDER_WITH_DEPENDENTS` ou `HOLDER_WITHOUT_DEPENDENTS`. Isso significa que:

|Status|Definição|
|---|---|
|`WITHOUT_PLUS_ACCESS`|O aluno não tem Acesso Plus.|
|`HOLDER`|O aluno é o titular do Acesso Plus.|
|`HOLDER_WITH_DEPENDENTS`|O aluno é o titular com dependentes.|
|`HOLDER_WITHOUT_DEPENDENTS`|O aluno é o titular sem dependentes.|
|`DEPENDENT`|O aluno é um dependente do titular.|

Os status do aluno podem ser: `ACTIVE`, `BLOCKED`, `BLOCKED_BY_OWNER` ou `OVERDUE`.

|Status|Definição|
|---|---|
|`ACTIVE`|Aluno ativo na Área de Membros.|
|`BLOCKED`|Aluno bloqueado na Área de Membros.|
|`BLOCKED_BY_OWNER`|Aluno bloqueado pelo produtor ou administrador do Área de Membros.|
|`OVERDUE`|Aluno com assinatura vencida.|

Os tipos do aluno retornados no atributo `type` podem ser: `BUYER`, `IMPORTED`, `FREE`, `OWNER` ou `GUEST`.

|Status|Definição|
|---|---|
|`BUYER`|Aluno que realizou a compra da Área de Membros.|
|`IMPORTED`|Aluno importado para a Área de Membros.|
|`FREE`|Aluno gratuito.|
|`OWNER`|Proprietário da Área de Membros.|
|`GUEST`|Convidado na Área de Membros.|

### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-users-club/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-users-club/#query)Query

- subdomainobrigatório
    
    Parâmetro que deverá ser enviado na requisição e irá indicar de qual Área de Membros os dados estão sendo requisitados. O valor será o nome do subdomínio definido na administração do Club.
    
- email
    
    Parâmetro que poderá ser enviado na requisição para solicitar os dados de um aluno específico pelo e-mail. O valor pode ser o e-mail completo ou parte dele.
    

GET/club/api/v1/users

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/club/api/v1/users?subdomain=my-subdomain' \
	--header 'Content-Type: application/json' \
	--header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-users-club/#retorno)Retorno

- items
    
    Lista de alunos da área de membros.
    
    esconder parâmetros
    
    - user_id
        
        Identificador único do aluno no Club.
        
    - name
        
        Nome do aluno.
        
    - email
        
        E-mail do aluno.
        
    - role
        
        Mostra o papel do aluno. Estes papéis podem ser:  
        `STUDENT`, `FREE_STUDENT`, `OWNER`, `ADMIN`, `CONTENT_EDITOR` ou `MODERATOR`
        
    - last_access_date
        
        Data do último acesso do aluno.
        
    - first_access_date
        
        Data do primeiro acesso do aluno.
        
    - locale
        
        Idioma no qual o usuário realizou a compra, ou idioma que foi utilizado para importar o usuário.
        
    - plus_access
        
        Mostra se o aluno tem o acesso plus. Estes tipos podem ser:  
        `WITHOUT_PLUS_ACCESS`, `HOLDER`, `DEPENDENT`, `HOLDER_WITH_DEPENDENTS` ou `HOLDER_WITHOUT_DEPENDENTS`.
        
    - progress
        
        Mostra o resumo do progresso do aluno.
        
        esconder parâmetros
        
        - completed_percentage
            
            Indica o percentual de páginas concluídas.
            
        - total
            
            Número total de páginas da Área de Membros.
            
        - completed
            
            Número total de páginas concluídas.
            
        
    - status
        
        Mostra se o atual status do aluno. Estes estatus podem ser:  
        `ACTIVE`, `BLOCKED`, `BLOCKED_BY_OWNER` ou `OVERDUE`.
        
    - purchase_date
        
        Data da compra.
        
    - access_count
        
        Número de acessos realizados na Área de Membros.
        
    - is_deletable
        
        Indica se o aluno poderá ou não ser bloqueado. O valor `true` significa que sim, `false` que não.
        
    - class_id
        
        Identificador da turma em que o aluno está associado.
        
    - type
        
        Mostra o tipo do aluno. Estes tipos podem ser:  
        `BUYER`, `IMPORTED`, `FREE`, `OWNER` ou `GUEST`.
        
    - engagement
        
        Engajamento do aluno dentro do curso. O engajamento é um índice que mede o quanto os seus usuários estão interagindo de forma geral com o seu produto. Cada usuário tem os seus pontos que determinam se o engajamento dele é :  
        `NONE`, `LOW`, `MEDIUM`, `HIGH` ou `VERY_HIGH`.
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - total_results
        
        Pode não ser retornado em todos os endpoints, mas nele estará a quantidade de itens que a lista inteira possui, desconsiderando a paginação.
        
    - next_page_token
        
        Contém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_token
        
        Contém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_page
        
        Contém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
  "items": [
    {
      "user_id": "n2OM623n46",
      "engagement": "NONE",
      "name": "Hotmart Example User One",
      "email": "user.one@hotmart.com",
      "last_access_date": 1546728645,
      "role": "FREE_STUDENT",
      "first_access_date": 1607054711,
      "locale": "pt_BR",
      "plus_access": "WITHOUT_PLUS_ACCESS",
      "progress": {
        "completed_percentage": 45,
        "total": 11,
        "completed": 5
      },
      "status": "ACTIVE",
      "access_count": 1,
      "is_deletable": true,
      "class_id": "qV7y1Jm7Jn",
      "type": "FREE"
    },
    {
      "user_id": "ZYOmWXlded",
      "engagement": "LOW",
      "name": "Hotmart Example User Two",
      "email": "user.two@hotmart.com",
      "last_access_date": 1819975825,
      "role": "STUDENT",
      "first_access_date": 1532627687,
      "locale": "pt_BR",
      "plus_access": "WITHOUT_PLUS_ACCESS",
      "progress": {
        "completed_percentage": 0,
        "total": 11,
        "completed": 0
      },
      "status": "ACTIVE",
      "purchase_date": 1616501263,
      "access_count": 2,
      "is_deletable": true,
      "class_id": "qV7y1Jm7Jn",
      "type": "BUYER"
    },
    {
      "user_id": "wx7WpWrQO2",
      "engagement": "MEDIUM",
      "name": "Hotmart Example User Three",
      "email": "user.three@hotmart.com",
      "last_access_date": 1278881901,
      "role": "STUDENT",
      "first_access_date": 1607054711,
      "locale": "pt_BR",
      "plus_access": "WITHOUT_PLUS_ACCESS",
      "progress": {
        "completed_percentage": 0,
        "total": 11,
        "completed": 0
      },
      "status": "BLOCKED",
      "purchase_date": 1616501263,
      "access_count": 1,
      "is_deletable": true,
      "class_id": "qV7y1Jm7Jn",
      "type": "IMPORTED"
    }
  ],
  "page_info": {
    "total_results": 111,
    "next_page_token": "eyJwYWdlIjoyLCJyb3dzIjoxMH0=",
    "prev_page_token": "eyJwYWdlIjoyLCJyb3dzIjoxMH0=",
    "results_per_page": 3
  }
}
```

## Obter o Progresso do Aluno

Este é o endpoint que irá retornar o progresso dos alunos no seu curso. Aqui você pode conferir quais páginas foram concluídas pelo aluno e quando, assim como as que ainda não foram concluídas.

### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-lessons-club/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-lessons-club/#query)Query

- subdomainobrigatório
    
    Parâmetro que deverá ser enviado na requisição e irá indicar de qual área de membros os dados estão sendo requisitados. O valor será o nome do subdomínio definido na administração do Club.
    

#### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-lessons-club/#path)Path

- user_idobrigatório
    
    Identificador único relacionado ao aluno, essa informação deve ser obtida através no endpoint [Obter alunos](https://developers.hotmart.com/docs/pt-BR/v1/club/get-users-club) .
    

GET/club/api/v1/users/{user_id}/lessons

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/club/api/v1/users/{user_id}/lessons?subdomain=my-subdomain' \
	--header 'Content-Type: application/json' \
	--header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/club/get-lessons-club/#retorno)Retorno

- lessons
    
    Lista de páginas que já foram concluídas pelo aluno.
    
    esconder parâmetros
    
    - page_id
        
        Identificador único da página.
        
    - page_name
        
        Nome da página definida pelo produtor dentro do Club.
        
    - module_name
        
        Nome do módulo definido pelo produtor no Club.
        
    - is_module_extra
        
        Indica se é um módulo extra. O valor `true` significa que sim, `false` que não.
        
    - is_completed
        
        Indica se a página já foi concluída pelo aluno. O valor `true` significa que sim, `false` que não.
        
    - completed_date
        
        Data em que a página foi concluída. Esse valor só será retornado caso o parâmetro `is_completed` seja `true`.
        
    

Response

200 - Success

```json
{
  "lessons": [
    {
      "page_id": "RMe1YEyeYx",
      "page_name": "Page 1 Module 1",
      "module_name": "Module 1",
      "is_module_extra": false,
      "is_completed": true,
      "completed_date": 1609984800000
    },
    {
      "page_id": "gmeLEpY7nJ",
      "page_name": "Page 2 Module 1",
      "module_name": "Module 1",
      "is_module_extra": false,
      "is_completed": true,
      "completed_date": 1609984800000
    },
    {
      "page_id": "0Z721zyeNm",
      "page_name": "Page 1 Module 3",
      "module_name": "Module 3",
      "is_module_extra": false,
      "is_completed": true,
      "completed_date": 1609984800000
    },
    {
      "page_id": "KR4jKkwea2",
      "page_name": "Page 3 Module 3",
      "module_name": "Module 3",
      "is_module_extra": false,
      "is_completed": true,
      "completed_date": 1609984800000
    },
    {
      "page_id": "qV7ypJGeJn",
      "page_name": "Conclusion",
      "module_name": "Module 4",
      "is_module_extra": false,
      "is_completed": true,
      "completed_date": 1609984800000
    },
    {
      "page_id": "Zy4bwy5eRw",
      "page_name": "Page 1 Module 2",
      "module_name": "Module 2",
      "is_module_extra": false,
      "is_completed": true,
      "completed_date": 1609984800000
    },
    {
      "page_id": "PBeZln8Ow5",
      "page_name": "Page 2 Module 2",
      "module_name": "Module 2",
      "is_module_extra": false,
      "is_completed": false
    },
    {
      "page_id": "xkOXXBXOWb",
      "page_name": "Page 3 Module 2",
      "module_name": "Module 2",
      "is_module_extra": false,
      "is_completed": false
    },
    {
      "page_id": "ny4PkVLOxV",
      "page_name": "Page 4 Module 2",
      "module_name": "Module 2",
      "is_module_extra": false,
      "is_completed": false
    },
    {
      "page_id": "EM7qz2NOxw",
      "page_name": "Module driping - BY_DATE",
      "module_name": "Module Dripping",
      "is_module_extra": false,
      "is_completed": false
    }
  ]
}
```

## Obter Produtos

O endpoint de listagem de produtos do creator na API da Hotmart retorna informações como identificador único do produto, nome, status, data de criação, formato, indicação de assinatura e período de garantia, dentre outros.

Esses dados podem ser utilizados para implementar soluções como dashboards para monitoramento de catálogos, integrações para automação de gerenciamento de produtos e ferramentas de análise para avaliar o desempenho de itens específicos. O endpoint é projetado para oferecer flexibilidade e eficiência na integração de sistemas externos.

### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-list/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-list/#query)Query

- max_resultsO número máximo de itens por página que podem ser retornados. O valor padrão para esse endpoint é de **50** items por página.
    
- page_tokenO cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista. Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- id
    
    Identificador único (ID) do produto vendido (número de 7 dígitos).
    
- status
    
    A situação (status) do produto. Os possíveis valores para este campo são: `DRAFT`, `ACTIVE`, `PAUSED`, `NOT_APPROVED`, `IN_REVIEW`, `DELETED`, `CHANGES_PENDING_ON_PRODUCT`.
    
- format
    
    O formato do produto criado. Os possíveis valores para este campo são: `EBOOK`, `SOFTWARE`, `MOBILE_APPS`, `VIDEOS`, `AUDIOS`, `TEMPLATES`, `IMAGES`, `ONLINE_COURSE`, `SERIAL_CODES`, `ETICKET`, `ONLINE_SERVICE`, `ONLINE_EVENT`, `BUNDLE`, `COMMUNITY`, `AGENT`.
    

GET/products/api/v1/products

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/products/api/v1/products' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-list/#retorno)Retorno

- items
    
    esconder parâmetros
    
    - id
        
        Identificador único (ID) do produto vendido (número de 7 dígitos).
        
    - name
        
        Nome do produto.
        
    - ucode
        
        Identificador único (ID) do produto vendido no formato de UUID (Universally Unique Identifier).
        
    - status
        
        A situação (status) do produto. Os possíveis valores para este campo são: `DRAFT`, `ACTIVE`, `PAUSED`, `NOT_APPROVED`, `IN_REVIEW`, `DELETED`, `CHANGES_PENDING_ON_PRODUCT`.
        
    - created_at
        
        Data de criação do produto em milissegundos a partir de 1970-01-01 00:00:00 UTC.
        
    - format
        
        O formato do produto criado. Os possíveis valores para este campo são: `EBOOK`, `SOFTWARE`, `MOBILE_APPS`, `VIDEOS`, `AUDIOS`, `TEMPLATES`, `IMAGES`, `ONLINE_COURSE`, `SERIAL_CODES`, `ETICKET`, `ONLINE_SERVICE`, `ONLINE_EVENT`, `BUNDLE`, `COMMUNITY`, `AGENT`.
        
    - is_subscription
        
        Indica se o produto é uma assinatura. Pagamentos parcelados como _Smart Installment_ e _Smart Recovery_ retornarão como falso. Para o _Combo_, a informação é baseada no método de cobrança escolhido (pagamento recorrente ou pagamento único).
        
    - warranty_period
        
        Período de garantia de compra padrão definido para o produto.
        
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - next_page_tokenContém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_tokenContém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_pageContém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.  
          
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
 "items": [
  {
    "id": 698441,
    "name": "Product A",
    "ucode": "f2b3be1f-313f-4a2d-b5b7-1c39d67dd3ee",
    "status": "DRAFT",
    "created_at": 1586459699000,
    "format": "EBOOK",
    "is_subscription": false,
    "warranty_period": 7
  },
  {
    "id": 1117869,
    "name": "Product B",
    "ucode": "26a97448-2ac2-458d-9e03-bcc01e82bdd8",
    "status": "DRAFT",
    "created_at": 1603816477000,
    "format": "ONLINE_COURSE",
    "is_subscription": true,
    "warranty_period": 15
  },
  {
   "id": 486869,
   "name": "Product C",
   "ucode": "6505e7ed-ff32-4d1a-8baa-62958d5c790a",
   "status": "CHANGES_PENDING_ON_PRODUCT",
   "created_at": 1569933453000,
   "format": "ETICKET",
   "is_subscription": false,
   "warranty_period": 7
  },
  {
    "id": 4319408,
    "name": "Product D",
    "ucode": "e211d636-dd19-4411-9397-ab3428e966a2",
    "status": "DRAFT",
    "created_at": 1721077570000,
    "format": "BUNDLE",
    "is_subscription": true,
    "warranty_period": 7
  }
 ],
 "page_info": {
  "next_page_token": "eyJyb3dzIjo1LCJwYWdlIjozfQ==",
  "prev_page_token": "eyJyb3dzIjo1LCJwYWdlIjoxfQ==",
  "results_per_page": 4
 }
}
```

## Obter Ofertas de Produto

O endpoint de obtenção de ofertas de produtos na API da Hotmart retorna informações detalhadas como código da oferta, nome, descrição, valor, moeda, modo de pagamento, indicação se a conversão de moeda está desativada, status de recuperação inteligente e se é a oferta principal do produto.

Esses dados podem ser utilizados para criar soluções de gestão de precificação, integração com plataformas de vendas e ferramentas de análise para monitoramento de desempenho das ofertas. O endpoint é desenvolvido para garantir flexibilidade e precisão na gestão e exposição das ofertas em sistemas externos.

### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-offers/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-offers/#path)Path

- ucodeIdentificador único (UUID) do produto.

#### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-offers/#query)Query

- max_resultsO número máximo de itens por página que podem ser retornados.
    
- page_tokenO cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista. Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    

GET/products/api/v1/products/:ucode/offers

cURL

```bash
curl --location 'https://developers.hotmart.com/products/api/v1/products/:ucode/offers' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-offers/#retorno)Retorno

- items
    
    esconder parâmetros
    
    - codeIdentificador único do código da oferta.
        
    - nameNome de exibição da oferta.
        
    - descriptionDescrição detalhada da oferta.
        
    - priceObjeto contendo informações de preço da oferta.
        
        esconder parâmetros
        
        - valueValor do preço da oferta.
            
        - currency_codeCódigo da moeda para os valores da oferta (ex: BRL, USD, EUR, MXN).
            
        
    - payment_modeModo de pagamento para a compra. Os possíveis valores para este campo são: `UNIQUE_PAYMENT`, `SUBSCRIPTION`, `MULTIPLE_PAYMENTS`, `PAY_IN_FULL`, `NOT_DEFINED`, `INVOICE`, `SMART_INSTALLMENT`, `BILLET_INSTALLMENT`, `FINANCED_BILLET`.
        
    - is_currency_conversion_enabledIndica se a conversão de moeda para vendas internacionais está habilitada.
        
    - is_smart_recovery_enabledIndica se a oferta tem recuperação inteligente habilitada.
        
    - is_main_offerIndica se esta é a oferta principal do produto.
        
    
- page_infoInformações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - next_page_tokenContém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_tokenContém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_pageContém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.  
          
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
 "items": [
  {
    "is_currency_conversion_enabled": true,
    "is_main_offer": true,
    "is_smart_recovery_enabled": false,
    "price": {
      "value": 10,
      "currency_code": "BRL"
    },
    "code": "02mhofjd",
    "description": "",
    "name": "",
    "payment_mode": "PAY_IN_FULL"
  }
 ],
 "page_info": {
   "next_page_token": "eyJwYWdlIjoyLCJzaXplIjoxOH0=",
   "prev_page_token": null,
   "results_per_page": 1
 }
}
```

## Obter Planos de Produto

O endpoint de obtenção de planos de assinatura de produtos na API da Hotmart retorna informações detalhadas como código do plano, nome, descrição, valor, periodicidade, moeda, modo de pagamento, período de trial, indicação se a recuperação de assinatura está ativada, e se a troca de planos está habilitada.

Esses dados podem ser utilizados para criar soluções de gestão de precificação, integração com plataformas de vendas e ferramentas de análise para monitoramento de desempenho dos planos. O endpoint é desenvolvido para garantir flexibilidade e precisão na gestão e exposição dos preços em sistemas externos.

### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-plans/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-plans/#path)Path

- ucodeIdentificador único (ID) do produto vendido no formato de UUID (Universally Unique Identifier).

#### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-plans/#query)Query

- max_resultsO número máximo de itens por página que podem ser retornados.
    
- page_tokenO cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista. Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    

GET/products/api/v1/products/:ucode/plans

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/products/api/v1/products/:ucode/plans' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/product/product-plans/#retorno)Retorno

- items
    
    esconder parâmetros
    
    - codeO código do plano é um identificador do plano de assinatura.
        
    - nameInforma o nome do plano de assinatura.
        
    - descriptionEste campo virá preenchido com o texto cadastrado na descrição do plano.
        
    - valueValor do plano.
        
    - periodicityDuração das recorrências do plano da assinatura. São eles: `SINGLE_INSTALLMENT`, `WEEKLY`, `MONTHLY`, `BIMONTHLY`, `QUARTERLY`, `ANNUAL`, `BIANNUAL`
        
    - max_installmentsQuantidade máxima de parcelas.
        
    - currency_codeMoeda referente aos valores das tarifas, no padrão internacional de três letras. Por exemplo: `BRL`, `USD`, `EUR`, `MXN` e mais.
        
    - payment_modeModo de pagamento da compra. Os valores possíveis para este campo são: `PAGAMENTO_UNICO`, `ASSINATURA`, `MULTIPLOS_PAGAMENTOS`, `PAGAMENTO_VISTA`, `NOT_DEFINED`, `INVOICE`, `SMART_INSTALLMENT`, `BILLET_INSTALLMENT`.
        
    - trial_periodPeríodo de trial em dias.
        
    - is_subscription_recovery_enabledIndica se a ferramenta de recuperação de assinatura está habilitada.
        
    - is_switch_plan_enabledIndica se a troca de plano está habilitada.
        
    
- page_infoInformações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - next_page_tokenContém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    - prev_page_tokenContém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_pageContém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.  
          
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    

Response

200 - Success

```json
{
 "items": [
  {
    "price": {
      "currency_code": "BRL",
      "value": 10
    },
    "payment_mode": "ASSINATURA",
    "is_subscription_recovery_enabled": false,
    "is_switch_plan_enabled": true,
    "description": "Plano básico mensal",
    "periodicity": "MONTHLY",
    "name": "Básico Mensal",
    "max_installments": 1,
    "code": "tz12qeev"
  },
  {
    "price": {
      "currency_code": "BRL",
      "value": 20
    },
    "payment_mode": "ASSINATURA",
    "is_subscription_recovery_enabled": false,
    "is_switch_plan_enabled": true,
    "description": "Plano padrão bimestral",
    "periodicity": "BIMONTHLY",
    "name": "Padrão Bimestral",
    "max_installments": 1,
    "code": "15nesfeb"
  },
  {
    "price": {
      "currency_code": "BRL",
      "value": 30
    },
    "payment_mode": "ASSINATURA",
    "is_subscription_recovery_enabled": false,
    "is_switch_plan_enabled": true,
    "description": "Plano premium trimestral",
    "periodicity": "QUARTERLY",
    "name": "Premium Trimestral",
    "max_installments": 1,
    "code": "smodok6s"
  },
  {
    "price": {
      "currency_code": "BRL",
      "value": 350
    },
    "payment_mode": "ASSINATURA",
    "is_subscription_recovery_enabled": false,
    "is_switch_plan_enabled": false,
    "description": "Plano avançado semestral",
    "periodicity": "BIANNUAL",
    "name": "Avançado Semestral",
    "max_installments": 3,
    "code": "x1n6kb1y"
  },
  {
    "price": {
      "currency_code": "BRL",
      "value": 600
    },
    "payment_mode": "ASSINATURA",
    "is_subscription_recovery_enabled": false,
    "is_switch_plan_enabled": false,
    "description": "Plano completo anual",
    "periodicity": "ANNUAL",
    "name": "Completo Anual",
    "max_installments": 1,
    "code": "vgpycfyl"
  },
  {
    "price": {
      "currency_code": "BRL",
      "value": 200
    },
    "payment_mode": "ASSINATURA",
    "is_subscription_recovery_enabled": false,
    "is_switch_plan_enabled": false,
    "description": "Plano teste mensal com trial",
    "periodicity": "MONTHLY",
    "name": "Plano com Trial",
    "max_installments": 1,
    "trial_period": 7,
    "code": "pr6yifbw"
  },
  {
    "price": {
      "currency_code": "EUR",
      "value": 45.99
    },
    "payment_mode": "ASSINATURA",
    "is_subscription_recovery_enabled": false,
    "is_switch_plan_enabled": false,
    "description": "Plano internacional anual",
    "periodicity": "ANNUAL",
    "name": "Internacional EUR",
    "max_installments": 4,
    "trial_period": 14,
    "code": "6xrozvay"
  }
 ],
 "page_info": {
   "results_per_page": 7
 }
}
```

# Cupons

Aqui você encontrará todas as informações relativas ao seu cupom de desconto.

## [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/about-coupon/#introducao-cupons)Introdução Cupons

Os cupons de desconto permitem criar ofertas promocionais e descontos para o mesmo produto. Você pode enviar o cupom para todos os seus clientes ou escolher qual base de clientes poderá utilizar o desconto.

Você também pode compartilhar o cupom com todos os seus Afiliados ou pode criar um cupom para um Afiliado específico. Neste documento, você pode encontrar os endpoints que permitem criar, listar e excluir um cupom.

Para consumir os nossos recursos, as solicitações devem ser autenticadas. [Clique aqui](https://developers.hotmart.com/docs/pt-BR/start/app-auth/)  para saber como gerar o token de acesso.

---

A API Hotmart possui pontos de extremidade que dão acesso a algumas dessas listas de elementos que, em alguns casos, podem se tornar muito grandes.

Imagine um terminal que retorne todas as vendas do ano anterior, por exemplo. Isso seria muito, certo? Com a melhoria da experiência em mente, usamos uma estrutura de paginação, usando a abordagem de paginação por cursor.

Use o parâmetro de consulta **page_token** para controlar a paginação.

Por exemplo, você faz uma solicitação que retorne 50 itens, mas o total de itens é 95. Adicionando o parâmetro **page_token** na consulta com o valor do atributo **next_page_token**, você terá acesso aos 45 restantes. Na próxima solicitação, alterando o **page_token** para o valor de **prev_page_token**, você terá novamente o acesso aos 50 itens anteriores.

Tanto o **next_page_token** quanto o **prev_page_token** podem ser encontrados no corpo de retorno das requisições.

## Criar Cupom

Este endpoint permite você criar cupons de forma dinâmica para sua estratégia de vendas. Para chamar este endpoint você deve informar para qual produto é o cupom, o código que ativa o desconto e o percentual válido. Você também pode incluir uma data de início e de fim, para quais códigos de oferta é aplicável e se é exclusivo para algum afiliado.

### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-post-coupon/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-post-coupon/#path)Path

- product_idobrigatório
    
    Identificador único (ID) do produto vendido (número de 7 dígitos).
    

#### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-post-coupon/#body)Body

- codeobrigatório
    
    Código do cupom (max length = 25)
    
- discountobrigatório
    
    Precisa ser maior que 0 e menor que 0.99 (0 < discount < 0.99)
    
- start_date
    
    Data que o cupom deve ser ativado. A data precisa ser em milissegundos, começando de 1970-01-01 00:00:00 UTC. A API selecionará o fuso horário do seu usuário para o formato da data.
    
- end_date
    
    Data que o cupom deve ser desativado. A data precisa ser em milissegundos, começando de 1970-01-01 00:00:00 UTC. A API selecionará o fuso horário do seu usuário para o formato da data.
    
- affiliate
    
    O ID específico do afiliado que você deseja compartilhar o cupom.
    
- offer_ids
    
    Os códigos de ofertas que você quer aplicar o cupom.
    

POST/products/api/v1/product/:product_id/coupon

cURL

```bash
curl --location --request POST 'https://developers.hotmart.com/products/api/v1/product/:product_id/coupon' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-post-coupon/#retorno)Retorno

#### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-post-coupon/#)

Response

200

```json
{
}
```

## Obter Cupom

Endpoint para obter as informações de um cupom específico do produto. Ao enviar uma solicitação para este endpoint, é necessário fornecer o identificador único do cupom desejado. O serviço então irá verificar se o cupom existe no sistema e, se sim, retornará suas informações, como o código de cupom, o valor do desconto, a data de expiração e outras informações relevantes.

### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-get-coupon/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-get-coupon/#path)Path

- product_idobrigatório
    
    Identificador único (ID) do produto vinculado ao cupom (número de 7 dígitos).
    

#### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-get-coupon/#query)Query

- code
    
    Texto que representa um operador como código de cupom.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista. Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o _query param_ **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    

GET/products/api/v1/coupon/product/:product_id

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/products/api/v1/coupon/product/:product_id?code=:code&page_token=:page_token' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-get-coupon/#retorno)Retorno

- items
    
    Coleção de itens do tipo objeto, como a lista de cupons por exemplo.
    
    esconder parâmetros
    
    - idIdentificador único do cupom.
    - start_dateData que o cupom começará a ser válido. Essa data está em milissegundos a partir de 1970-01-01 00:00:00 UTC.
    - statusStatus que indica se o cupom esta dentro do período de validade.
    - time_zone
    
    esconder parâmetros
    
    - description
        
        Descrição do fuso horário
        
    - id
        
        Região do fuso horário
        
    - name
        
        Nome da região
        
    - offset
        
        GMT (Tempo Médio de Greenwich)
        
    
    - activeInforma se o cupom esta ativo
    - coupon_codeCódigo do cupom
    - discountDesconto do cupom
    
- page_info
    
    Informações de paginação, com os possíveis dados abaixo:
    
    esconder parâmetros
    
    - prev_page_tokenContém uma referência para a página anterior da lista. Vale ressaltar que quando requisitamos a primeira página, no atributo **page_info** não virá o **prev_page_token**.
        
    - results_per_pageContém a quantidade de itens da página atual. Caso queira, você pode enviar um valor máximo de itens que deseja receber em cada página, como o query param **max_results**.
        
        Cada endpoint terá um **results_per_page** padrão e um valor máximo de itens que poderá ser retornado por página. Então se você passar um **max_results** maior do que o permitido, apenas o máximo será retornado para você.
        
    - next_page_tokenContém uma referência para a próxima página da lista. Vale ressaltar que quando requisitamos a última página, no atributo **page_info** não virá o **next_page_token**.
        
    

Response

200

```json
{
  "page_info": {
    "next_page_token": "05b60506b659c1c6e728db93eada6271e3adcfb4edf507b679874458e31577b3",
    "prev_page_token":  "cf1fg8bd082e2864069035c057eca0bac7eb5d604719c5a76e80f0933f49c217"
    "results_per_page": 20
  },
  "items": [
    {
      "coupon_code": "couponCode", 
      "active": true,
      "start_date": 16806975000,
      "discount": 0.1,
      "time_zone": {
        "offset": "-03:00",
        "description": "Fuso horário de Brasília",
        "id": "America/Sao_Paulo",
        "name": "AMERICA_SAO_PAULO"
      },
      "status": "valid",
      "id": 123456
    }
  ]
}
```

## Excluir Cupom

Endpoint usado para excluir um cupom específico do produto. Essa solicitação pode ser usada para remover cupons que não são mais válidos ou que foram criados erroneamente. Para enviar uma requisição de exclusão de cupom, é necessário fornecer o identificador único do cupom que se deseja excluir.

### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-delete-coupon/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/coupon/coupon-delete-coupon/#path)Path

- coupon_idobrigatório
    
    Identificador único (ID) do cupom.
    

DELETE/products/api/v1/coupon/:coupon_id

cURL

```bash
curl --location --request DELETE 'https://developers.hotmart.com/products/api/v1/coupon/:coupon_id' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer :access_token'
```

# Ingressos para eventos

Aqui você encontrará todas as informações relativas aos ingressos de eventos.

## [](https://developers.hotmart.com/docs/pt-BR/v1/tickets/about-tickets/#introducao)Introdução

Aqui você terá acesso às informações detalhadas dos ingressos vendidos e cortesias gratuitas geradas pela plataforma Hotmart. Assim você pode consultar as informações dos ingressos e dos seus respectivos compradores e participantes.

As opções de consultas são:

- Dados básicos de um determinado evento (nome, data, lotes de ingresso, etc)
- lista de ingressos adquiridos de um determinado evento
- lista de compradores de um determinado evento (pessoas que compraram os ingressos)
- lista de participantes de um determinado evento (pessoas que vão utilizar os ingressos)
- dados do comprador e participante de um determinado ingresso

Para cada uma das consultas, é possível filtrar por:

- lote do ingresso
- status do ingresso (vendidos, reservados, reembolsados, chargeback, convites e convites cancelados)
- tipo do ingresso (pago ou gratuito)
- status de check-in (pendente ou concluído)
- identificador único do ingresso (interno)
- código do ingresso (público - QR Code)

Para fazer as consultas, é necessário possuir o token de autenticação e o ID do produto (obrigatoriamente sendo no formato de Ingresso para Eventos).

- Token de autenticação
- ID do produto (produto no formato Ingresso para Eventos)

## Informações do Evento

Esse endpoint exibe as informações de um determinado evento e seus respectivos atributos.

### [](https://developers.hotmart.com/docs/pt-BR/v1/tickets/get-info-tickets/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/tickets/get-info-tickets/#path)Path

- event_idobrigatório
    
    ID do produto (produto no formato Ingresso para Eventos).
    

GET/events/api/v1/:event_id/info

cURL

```bash
curl --location 'https://developers.hotmart.com/events/api/v1/:event_id/info' \
--header 'Authorization: Bearer :access_token'
```

## Lista de ingressos e participantes

Esse endpoint exibe as informações de uma lista de ingresso de um determinado evento, seus respectivos compradores e participantes, que são as pessoas que vão de fato utilizar o ingresso para acessar o evento. Apenas ingressos com pagamento confirmado e convites gratuitos serão listados.

### [](https://developers.hotmart.com/docs/pt-BR/v1/tickets/get-participants-tickets/#parametros-da-requisicao)Parâmetros da requisição

#### [](https://developers.hotmart.com/docs/pt-BR/v1/tickets/get-participants-tickets/#path)Path

- event_idobrigatório
    
    ID do produto (produto no formato Ingresso para Eventos).
    

#### [](https://developers.hotmart.com/docs/pt-BR/v1/tickets/get-participants-tickets/#query)Query

- max_results
    
    O número máximo de itens por página que podem ser retornados.
    
- page_token
    
    O cursor usado na paginação. Ele é uma referência para a parte que você quer ir na lista. Por exemplo, você faz uma requisição que te retorna 50 itens, mas o total de itens é 95. Adicionando o query param **page_token** com o valor do atributo **next_page_token**, você irá acessar os 45 restantes. Numa próxima requisição, trocando o **page_token** pelo valor do **prev_page_token**, você irá acessar novamente os 50 itens anteriores.
    
- buyer_email
    
    Endereço de e-mail do comprador.
    
- participant_email
    
    Endereço de e-mail do participante.
    
- last_update
    
    Data da última atualização de dados do ingresso. A data deve estar em milissegundos, à partir de 1970-01-01 00:00:00 UTC.
    
- id_lot
    
    ID sequencial que representa o lote de origem ao qual um ingresso pertence, podendo também representar a categoria de um ingresso, conforme configurado pelo produtor do evento.
    
- ticket_status
    
    `SOLD`: Ingresso com pagamento confirmado.  
    `INVITE`: Convite enviado.  
    `INVITE_CANCELED`: Convite removido.  
    `REFUNDED`: Ingresso que sofreu reembolso e perdeu sua validade.  
    `CHARGEBACK`: Ingresso que sofreu chargeback.  
    `EXCLUDED`: Ingresso que foi excluído.  
    `AVAILABLE`: Ingresso disponível e que ainda não foi atribuído a algum participante.  
    `RESERVED`: Ingresso com pagamento pendente ou um convite gratuito atribuído a alguém.
    
- ticket_type
    
    Mostra o tipo do ingresso, que pode ser um convite gratuito ou um ingresso vendido: `PAID`, `FREE`, `ALL`.
    
- checkin_status
    
    Mostra o status de preenchimento dos dados de inscrição de um participante: `PENDING`, `PARTIAL`, `CONCLUDED`, `ALL`.
    
- id_eticket
    
    ID sequencial do ingresso que pode ser usado para controle interno.
    
- ticket_qr_code
    
    Código único do ingresso, que é gerado aleatoriamente, é representado pelo QR Code exibido no ingresso e pode ser usado para controle de entrada do participante no evento.
    

GET/events/api/v1/:event_id/participants

cURL

```bash
curl --location 'https://developers.hotmart.com/events/api/v1/:event_id/participants \
--header 'Authorization: Bearer :access_token'
```

---

### [](https://developers.hotmart.com/docs/pt-BR/v1/tickets/get-participants-tickets/#retorno)Retorno

- items
    
    Coleção de itens do tipo objeto.
    
    esconder parâmetros
    
    - buyer
        
        esconder parâmetros
        
        - ucode
            
            ID/ucode.
            
        - name
            
            Nome completo do comprador.
            
        - email
            
            Email do comprador.
            
        
    - participant
        
        esconder parâmetros
        
        - id
            
            ID do participante.
            
        - name
            
            Nome completo do participante.
            
        - email
            
            Email do participante.
            
        - document
            
            Documento (CPF, RG, ou outro documento) do participante.
            
        - phone
            
            Telefone do participante.
            
        
    - eticket
        
        esconder parâmetros
        
        - ticket_qr_code
            
            Código do ingresso (representado pelo QR Code).
            
        - current_update
            
            Data da última atualização.
            
        - checkin_status
            
            Status do check-in (pendente ou concluído).
            
        - is_blocked
            
            Status de bloqueio do ingresso (true ou false).
            
        - ticket_status
            
            Status do ticket.
            
        - ticket_type
            
            Tipo de ingresso (pago ou gratuito).
            
        - id
            
            ID do eticket.
            
        - checkin_url
            
            URL para check-in (link do ticket que o comprador recebe por email).
            
        
    - lot
        
        esconder parâmetros
        
        - id
            
            ID do lote do ingresso (usado também para definir a categoria do ingresso.
            
        - name
            
            Nome do lote (usado também para definir a categoria do ingresso).
            
        
    - product
        
        esconder parâmetros
        
        - id
            
            ID do produto.
            
        - name
            
            Nome do produto.
            
        
    

Response

200

```json
{
    "items": [
        {
            "participant": {
                "email": "teste+1@teste.com",
                "document": "68658197646",
                "id": 2190,
                "name": "Teste teste +1",
                "phone": 31999999999
            },
            "buyer": {
                "ucode": "ae9c122f-e7e1-4fc3-8ef7-d32ddb2bfa3a",
                "email": "teste+1@teste.com",
                "name": "Meu Teste",
            },
            "eticket": {
                "ticket_qr_code": "132591264870940362",
                "current_update": 1655906699333,
                "checkin_status": "CONCLUDED",
                "is_blocked": false,
                "ticket_status": "SOLD",
                "ticket_type": "PAID",
                "id": 6892768,
                "checkin_url": "https://sandbox-local.com/eticket/2e9c43a9-0aeb-48ed-9464-630f845c23af?invite=false"
            },
            "lot": {
                "id": 234900,
                "name": "Lote 1"
            },
            "product": {
                "id": 4744896,
                "name": "Product Name"
            }
        }
    ],
    "page_info": {
        "results_per_page": 1,
        "next_page_token": "eyJwYWdlIjoyLCJyb3dzIjoxfQ==",
        "total_results": 5
    }
}
```

# Webhooks

A ferramenta de notificações da Hotmart pode ser integrada a qualquer sistema para automatizar o controle de seus produtos.

Criar uma configuração

## [](https://developers.hotmart.com/docs/pt-BR/1.0.0/webhook/about-webhook/#usando-webhooks)Usando Webhooks

Usamos webhooks para notificar a sua estrutura sempre que um evento acontecer em seus produtos, como pagamento confirmado, contestação de cobrança e pagamento recorrente bem-sucedido. Você pode configurar esses e outros eventos que deseja receber. No link abaixo você poderá configurar e testar novos webhooks, além de consultar o histórico de eventos, que ficam armazenados por até 60 dias.

## Usando Webhooks

Usamos webhooks para notificar a sua estrutura sempre que um evento acontecer em seus produtos, como pagamento confirmado, contestação de cobrança e pagamento recorrente bem-sucedido. Você pode configurar esses e outros eventos que deseja receber. No link abaixo você poderá configurar e testar novos webhooks, além de consultar o histórico de eventos, que ficam armazenados por até 60 dias.

Para realizar a integração via webhooks, você precisa realizar 3 passos:

- Criar um endpoint ou local para receber as informações
- Configurar qual é o produto, os eventos e o endereço de recebimento
- Testar a integração

## Introdução

O Webhook usa o padrão de códigos de resposta HTTP para indicar o sucesso ou falha de cada requisição, exceto quando o motivo do erro com um serviço não pôde ser determinado, retornando o status `-1`.

No geral, um código de status pode ser rapidamente identificado por seu primeiro dígito:

**1xx**: Informativo  
**2xx**: Sucesso  
**3xx**: Redirecionamento  
**4xx**: Erro do cliente  
**5xx**: Erro de servidor

## [](https://developers.hotmart.com/docs/pt-BR/1.0.0/webhook/http-response-codes-webhook/#codigos-de-resposta-http)Códigos de resposta HTTP

Operações que resultam em um erro que ocorreu por conta do cliente (por exemplo: token de acesso inválido) vão retornar um código no intervalo `4xx` e indicam que a requisição está, de alguma forma, inválida. Se você receber um erro `4xx`, recomendamos que leia o nosso glossário de erros para ajudá-lo a solucionar o problema.

Os códigos de erros no intervalo `5xx` sugerem um problema no serviço cadastrado no momento da configuração do webhook. Em caso de dúvidas, procure a pessoa responsável pelo serviço em sua empresa.

|Status|Descrição|
|---|---|
|2XX|Tudo certo.|
|400|A requisição enviada está de alguma forma inválida.|
|500|Ocorreu algum erro interno não esperado e não foi possível completar a requisição.|

## [](https://developers.hotmart.com/docs/pt-BR/1.0.0/webhook/http-response-codes-webhook/#sugestoes-de-solucao)Sugestões de solução

Em caso de respostas de erro, confira algumas dicas do que você pode fazer para solucionar.

|Status|Descrição|
|---|---|
|400|Seu serviço identificou que algum parâmetro obrigatório não foi enviado ou é inválido.|
|401|O serviço está exigindo algum tipo de chave para autenticação. Verifique se seu serviço está validando o `hottok` ou se está exigindo algum outro tipo de chave.|
|404|A URL configurada no seu serviço não existe.|
|408|A conexão com o seu servidor foi estabelecida e o evento foi disparado, porém sua aplicação não retornou a resposta dentro do tempo esperado.|
|5XX|A conexão foi feita com seu serviço e o evento enviado, porém a aplicação não retornou uma resposta dentro do tempo esperado.|
|-1|A conexão foi feita com seu serviço e o evento enviado, porém a aplicação encerrou a conexão antes do tempo esperado sem informar o motivo do erro.|

## Evento de cancelamento de assinatura

2.0.0

Você vai receber **dados gerais sobre cancelamento**, como informações sobre o assinante, a data de cancelamento e mais. Assim, toda vez que uma pessoa cancelar a assinatura do seu produto, você receberá essas informações.

- Produtor(a)

É a pessoa com uma conta que possui ao menos um produto cadastrado na Hotmart.

|Parâmetro|Descrição|
|---|---|
|**hottok**string|Cada conta possui um token único. Ele é a principal garantia de que a requisição está sendo feita pela Hotmart, o que é uma questão de segurança para evitar fraudes e ataques. **Este campo será enviado com o nome `X-HOTMART-HOTTOK` no cabeçalho HTTP de todas as requisições e recomendamos validá-lo antes de tratar os dados recebidos.** Se precisar trocar esta chave, entre em contato com nosso suporte.|
|**id**string|Código único de identificação do evento recebido.|
|**creation_date**long|Data de criação do evento. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC.|
|**event**string|Nome do evento recebido, que neste caso será `SUBSCRIPTION_CANCELLATION`.|
|**version**string|Versão do evento recebido. Essa versão é escolhida no momento de criação de uma configuração no Webhook. Neste caso o valor será sempre `2.0.0`.|
|**data**object|Dados relacionados ao evento de cancelamento de assinatura.|
|data.**actual_recurrence_value**double|Valor pago pelo comprador na última recorrência processada.|
|data.**cancellation_date**long|Data de cancelamento da assinatura. Ela está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC.|
|data.**date_next_charge**long|Data de tentativa do próximo pagamento, caso essa assinatura seja reativada. Nenhuma cobrança será feita no período após o cancelamento, apenas se houver reativação. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC. Ela pode ser utilizada para finalizar o acesso do comprador a um produto de assinatura. Por exemplo, caso o cliente comprou um produto de assinatura que é cobrado todo dia 10 do mês. Dessa maneira, se no dia 20 desse mês o cliente decide cancelar a assinatura, o evento será enviado no dia 20, contudo, o cliente deveria ter acesso até o dia 10 do mês subsequente.|
|data.**product**object|Dados do produto de assinatura que foi cancelado.|
|data.product.**name**string|Nome do produto de assinatura que foi cancelado.|
|data.product.**id**integer|Código único de identificação do produto de assinatura que foi cancelado.|
|data.**subscriber**object|Dados do assinante.|
|data.subscriber.**code**string|Código exclusivo de um assinante. Este campo é usado pelo sistema externo para identificar um assinante de uma assinatura. Um mesmo comprador terá 2 subscribersCode diferentes se ele assinar dois produtos diferentes.|
|data.subscriber.**name**string|Nome completo do assinante.|
|data.subscriber.**email**string|E-mail do assinante.|
|data.subscriber.**phone**object|Telefones do assinante.|
|data.subscriber.phone.**dddPhone**string|DDD do telefone fixo do assinante.|
|data.subscriber.phone.**phone**string|Número do telefone fixo do assinante.|
|data.subscriber.phone.**dddCell**string|DDD do telefone celular do assinante.|
|data.subscriber.phone.**cell**string|Número do telefone celular do assinante.|
|data.**subscription**object|Dados da assinatura.|
|data.subscription.**id**integer|Código único de identificação da assinatura na Hotmart.|
|data.subscription.**plan**object|Dados do plano de assinatura.|
|data.subscription.plan.**name**string|Nome do plano de assinatura.|
|data.subscription.plan.**id**integer|Código único de identificação do plano de assinatura.|

```json
{
  "id": "0d7aa966-b887-4617-8c56-9e865bfc8ce4",
  "creation_date": 1632411406874,
  "event": "SUBSCRIPTION_CANCELLATION",
  "version": "2.0.0"
  "data": {
    "date_next_charge": 1580667200000,
    "product": {
      "name": "Product Name",
      "id": 3526906
    },
    "actual_recurrence_value": 50.10,
    "subscriber": {
      "code": "QO4THU04",
      "name": "Subscriber Name",
      "email": "subscriber@email.com",
      "phone": {
        "dddPhone": "31",
        "phone": "33334444",
        "dddCell": "31",
        "cell": "999999999"
      }
    },
    "subscription": {
      "id": 471681,
      "plan": {
        "name": "Plan Name",
        "id": 460805
      }
    },
    "cancellation_date": 1633410850832
  }
}
```

## Evento de troca de plano

2.0.0

Você vai receber **dados gerais sobre troca de planos**, como informações sobre o assinante, o plano e mais. Assim, toda vez que uma pessoa trocar o plano que ela usa do seu produto, você receberá essas informações.

- Produtor(a)
- Afiliado(a)

É a pessoa com uma conta que possui ao menos um produto cadastrado na Hotmart.

|Parâmetro|Descrição|
|---|---|
|**hottok**string|Cada conta possui um token único. Ele é a principal garantia de que a requisição está sendo feita pela Hotmart, o que é uma questão de segurança para evitar fraudes e ataques. **Este campo será enviado com o nome `X-HOTMART-HOTTOK` no cabeçalho HTTP de todas as requisições e recomendamos validá-lo antes de tratar os dados recebidos.** Se precisar trocar esta chave, entre em contato com nosso suporte.|
|**id**string|Código único de identificação do evento recebido.|
|**creation_date**long|Data de criação do evento. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC.|
|**event**string|Nome do evento recebido, que neste caso será `SWITCH_PLAN`.|
|**version**string|Versão do evento recebido. Essa versão é escolhida no momento de criação de uma configuração no Webhook. Neste caso o valor será sempre `2.0.0`.|
|**data**object|Dados relacionados ao evento de troca de plano.|
|**switch_plan_date**long|Data da troca do plano. Ela está no formato **unix timestamp UTC**.|
|subscription.product.**id**integer|Identificador único do produto da assinatura.|
|subscription.product.**name**string|Nome do produto de assinatura.|
|subscription.**subscriber_code**string|Código do assinante. Este campo é usado pelo sistema externo para identificar um assinante de uma assinatura. Um mesmo comprador terá dois `subscriber_code` diferentes se ele assinar dois produtos diferentes.|
|subscription.**date_next_charge**long|Data da proxima cobrança em milissegundos a partir de 1970-01-01 00:00:00 UTC.|
|subscription.user.**email**string|E-mail do assinante.|
|subscription.**status**string|Mostra os status do momento em que aquela assinatura se encontra. Estes status podem ser: _ACTIVE, INACTIVE, CANCELED_BY_CUSTOMER, CANCELED_BY_VENDOR, CANCELED_BY_ADMIN, OVERDUE, STARTED, EXPIRED_.|
|plans.**id**long|Identificador único do plano de assinatura.|
|plans.**name**string|Nome do plano de assinatura atual.|
|plans.offer.**key**string|Código da oferta que gerou a assinatura do plano atual.|
|plans.**current**boolean|Indica se é o plano atual da assinatura. Um valor `true` significa que sim e `false` que não é o plano atual.|

```json
{
    "id": "93069d0e-f35b-443e-9146-75b552321a7e",
    "creation_date": 1633003064000,
    "event": "SWITCH_PLAN",
    "version": "2.0.0",
    "data": {
        "switch_plan_date": 1629926054000,
        "subscription": {
            "subscriber_code": "AT3IV3RX",
            "status": "ACTIVE",
            "date_next_charge": 1736337600000,
            "product": {
                "id": 4116023,
                "name": "Product Name"
            },
            "user": {
                "email": "email@hotmart.com"
            }
        },
        "plans": [
            {
                "id": 707635,
                "name": "Plan Test 1",
                "offer": {
                    "key": "py01ycdp"
                },
                "current": true
            },
            {
                "id": 631288,
                "name": "Plan Test 2",
                "offer": {
                    "key": "2nyk0xc3"
                },
                "current": false
            }
        ]
    }
}
```

## Evento de abandono de carrinho

2.0.0

Você vai receber **dados gerais sobre abandono de carrinho** como informações sobre o possível comprador (lead), qual produto estava sendo adquirido e mais. Assim, toda vez que uma pessoa desistir de fazer uma compra na sua página de pagamento, você receberá essas informações.

O processo de envio começa quando uma pessoa preenche os dados na página de pagamento, como nome e/ou email. Este evento abrange tanto possíveis compradores quanto aqueles que esqueceram a página de pagamento aberta por muito tempo. **Esta verificação é feita a cada 30 minutos.**

- Produtor(a)

É a pessoa com uma conta que possui ao menos um produto cadastrado na Hotmart.

|Parâmetro|Descrição|
|---|---|
|**hottok**string|Cada conta possui um token único. Ele é a principal garantia de que a requisição está sendo feita pela Hotmart, o que é uma questão de segurança para evitar fraudes e ataques. **Este campo será enviado com o nome `X-HOTMART-HOTTOK` no cabeçalho HTTP de todas as requisições e recomendamos validá-lo antes de tratar os dados recebidos.** Se precisar trocar esta chave, entre em contato com nosso suporte.|
|**id**string|Código único de identificação do evento recebido.|
|**creation_date**long|Data de criação do evento. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC.|
|**event**string|Nome do evento recebido, que neste caso será `PURCHASE_OUT_OF_SHOPPING_CART`.|
|**version**string|Versão do evento recebido. Essa versão é escolhida no momento de criação de uma configuração no Webhook. Neste caso o valor será sempre `2.0.0`.|
|**data**object|Dados relacionados ao evento de abandono de carrinho.|
|data.**affiliate**boolean|Se a origem do lead(possível comprador) é de um afiliado, o valor é "true". O Valor é "false" caso não seja.|
|data.**product**object|Dados do produto que seria adquirido caso não houvesse o abandono de carrinho.|
|data.product.**id**integer|Identificador único do produto que seria adquirido caso não houvesse o abandono de carrinho.|
|data.product.**name**string|Nome do produto que seria adquirido caso não houvesse o abandono de carrinho.|
|data.**buyer**object|Dados do comprador. As informações somente serão retornadas caso o comprador tenha disponibilizado os dados no ato da compra do produto. Os dados solicitados são definidos pelo Produtor nas configurações da Página de Pagamentos (Checkout). Esta pessoa talvez seja somente quem pagaria pelo produto, mas não necessariamente seria a pessoa que usufruiria dele.|
|data.buyer.**name**string|Nome completo do lead (possível comprador).|
|data.buyer.**email**string|E-mail do lead (possível comprador).|
|data.buyer.**phone**string|Telefone do lead (possível comprador), incluindo o DDI.|
|data.**offer**object|Dados referentes à oferta da página de pagamento.|
|data.offer.**code**string|Identificador único da oferta principal da página de pagamento.|
|data.**checkout_country**object|Dados referentes ao país selecionado pelo lead (possível comprador) na página de pagamento.|
|data.checkout_country.**name**string|País selecionado pelo lead (possível comprador) na página de pagamento.|
|data.checkout_country.**iso**string|País selecionado pelo lead (possível comprador) na página de pagamento, no formato ISO 3166 Alpha-2.|
|||

```json
{
  "id": "0d7aa966-b887-4617-8c56-9e865bfc8ce4",
  "creation_date": 1632411406874,
  "event": "PURCHASE_OUT_OF_SHOPPING_CART",
  "version": "2.0.0",
  "data": {
    "affiliate": true,
    "product": {
      "id": 3526906,
      "name": "Product Name"
    },    
    "buyer": {
      "name": "Buyer name",
      "email": "buyer@email.com.br",
      "phone": "5531999999999"
    },
    "offer": {
      "code": "n82b9jqz"
    },
    "checkout_country": {
      "name": "Brasil",
      "iso": "BR"
    }
  }
}
```

## Eventos de pedidos

2.0.0

Você vai receber **dados gerais sobre compras**, como informações sobre o comprador, o pagamento e mais. Assim, toda vez que uma pessoa comprar seu produto, essas informações serão enviadas para você.

- Produtor(a)
- Coprodutor(a)
- Afiliado(a)

É a pessoa com uma conta que possui ao menos um produto cadastrado na Hotmart.

|Parâmetro|Descrição|
|---|---|
|**hottok**string|Cada conta possui um token único. Ele é a principal garantia de que a requisição está sendo feita pela Hotmart, o que é uma questão de segurança para evitar fraudes e ataques. **Este campo será enviado com o nome `X-HOTMART-HOTTOK` no cabeçalho HTTP de todas as requisições e recomendamos validá-lo antes de tratar os dados recebidos.** Se precisar trocar esta chave, entre em contato com nosso suporte.|
|**id**string|Código único de identificação do evento recebido.|
|**creation_date**long|Data de criação do evento. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC.|
|**event**string|Nome do evento recebido, que neste caso pode ser: `PURCHASE_CANCELED`, `PURCHASE_COMPLETE`, `PURCHASE_BILLET_PRINTED`, `PURCHASE_APPROVED`, `PURCHASE_PROTEST`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`, `PURCHASE_EXPIRED`, `PURCHASE_DELAYED`.|
|**version**string|Versão do evento recebido. Essa versão é escolhida no momento de criação de uma configuração no Webhook. Neste caso o valor será sempre `2.0.0`.|
|**data**object|Dados relacionados ao evento de venda.|
|**product**object|Dados do produto.|
|product.**id**integer|Identificador único do produto adquirido.|
|product.**ucode**string|Identificador único do produto adquirido. É o código que deve ser usado em seu sistema para identificar o produto.|
|product.**name**string|Nome do produto vendido. No caso de produtos hospedados no Hotmart Club, o nome do produto poderá equivaler ao nome da área de membros e divergir do nome cadastrado na conta Hotmart.|
|product.**has_co_production**boolean|Indica se produto adquirido possui coprodutor. **True** se sim e **False** se não.|
|product.**warranty_date**string|Data e hora de vencimento da garantia do produto adquirido, no formato YYYY-MM-DDThh:mm:ssTZD.|
|product.**support_email**string|E-mail de suporte do produto. Caso não tenha sido informado um e-mail personalizado, será obtido o e-mail padrão da conta.|
|product.**is_physical_product**boolean|Indica se um produto vendido é físico. **True** se for produto físico e **False** se não.|
|product.**content**object|Dados referentes ao conteúdo do combo.|
|product.content.**has_physical_products**boolean|Indica se possui produto físico nos produtos do combo. **True** se possui produto físico e **False** se não.|
|product.content.**products**array<object>|Lista dos produtos contidos no combo.|
|product.content.products.**id**long|Identificador interno do produto contido no combo.|
|product.content.products.**ucode**string|Identificador único do produto contido no combo. É o código que deve ser usado em seu sistema para identificar o produto.|
|product.content.products.**name**string|Nome do produto contido no combo.|
|product.content.products.**is_physical_product**boolean|Indica se um produto contido no combo é físico. **True** se for produto físico e **False** se não.|
|**affiliates**array<object>|Lista com os dados dos afiliados da venda.|
|affiliates.**affiliate_code**string|Identificador único do afiliado que indicou a venda.|
|affiliates.**name**string|Nome do afiliado que indicou a venda do produto.|
|**buyer**object|Mostra os dados do comprador. As informações somente serão retornadas caso o comprador tenha disponibilizado os dados no ato da compra do produto. Os dados solicitados são definidos pelo Produtor nas configurações da Página de Pagamentos (Checkout).|
|buyer.**email**string|E-mail do comprador.|
|buyer.**name**string|Nome completo do comprador.|
|buyer.**first_name**string|Primeiro nome do comprador.|
|buyer.**last_name**string|Último nome do comprador.|
|buyer.**checkout_phone**string|Número de telefone do comprador - Preenchido na página de pagamento. Caso seja uma venda internacional, onde o comprador é de um país fora do Brasil, o DDI do participante será enviado junto ao telefone.|
|buyer.**checkout_phone_code**string|Enviado apenas no caso de compradores brasileiros, informa o código de área (DDD).|
|buyer.**address**object|Informações de endereço do comprador são extraídas da “página de pagamento“ quando solicitadas. Se não forem solicitadas, serão obtidas do cadastro do comprador. Se o endereço ainda não estiver cadastrado, os campos correspondentes não serão enviados.|
|buyer.address.**country_iso**string|Código do país do comprador, em formato ISO 3166 Alpha-2.|
|buyer.address.**country**string|País do endereço do comprador.|
|buyer.address.**zipcode**string|CEP (codigo de endereçamento) do endereço do comprador.|
|buyer.address.**state**string|Estado do endereço do comprador.|
|buyer.address.**city**string|Cidade do endereço do comprador.|
|buyer.address.**neighborhood**string|Bairro do endereço do comprador.|
|buyer.address.**street**string|Rua do endereço do comprador.|
|buyer.address.**complement**string|Complemento do endereço do comprador.|
|buyer.address.**number**string|Número do endereço do comprador.|
|buyer.**document**string|Identificador do documento do comprador|
|buyer.**document_type**string|Tipo de documento do comprador, que varia de acordo com a sua nacionalidade e natureza jurídica, sendo `CPF` ou `CNPJ` para compradores brasileiros, `DNI` ou `CIF` para espanhóis e `DOCUMENT` para os demais países.|
|**producer**object|Dados do produtor.|
|producer.**name**string|Nome do produtor.|
|producer.**document**string|Número do documento do produtor.|
|producer.**legal_nature**string|Natureza jurídica do produtor, informado apenas no caso de produtores brasileiros. A informação será `Pessoa Física` ou `Pessoa Jurídica`.|
|**commissions**array<object>|Informações sobre a comissão do produtor e do Marketplace da Hotmart.|
|commissions.**value**double|Valor da comissão.|
|commissions.**currency_value**string|Moeda das comissões associadas à transação, representada no padrão internacional de três letras conforme o ISO 4217. Por exemplo: `BRL` para Real brasileiro, `USD` para Dólar americano.|
|commissions.**source**string|Indica qual a fonte da comissão, podendo ser um dos seguintes valores: **PRODUCER, COPRODUCER, AFFILIATE** ou **ADDON**.|
|commissions.**currency_conversion**object|Objeto referente à conversão de moeda da sua comissão.|
|commissions.currency_conversion.**converted_value**double|Valor da comissão convertida na moeda correspondente.|
|commissions.currency_conversion.**converted_to_currency**string|Moeda para qual a comissão foi convertida, no padrão internacional de três letras conforme o ISO 4217.|
|commissions.currency_conversion.**conversion_rate**double|Taxa aplicada na conversão da comissão.|
|**purchase**object|Dados da compra.|
|purchase.**approved_date**long|Data de liberação da compra em milissegundos a partir de 1970-01-01 00:00:00 UTC.|
|purchase.**full_price**object|Dados referentes ao valor total da compra pago pelo comprador.|
|purchase.full_price.**value**double|Valor total pago pelo comprador, incluindo taxas e juros.|
|purchase.full_price.**currency_value**string|Moeda do valor total pago pelo comprador, incluindo taxas e juros, representada no padrão internacional de três letras conforme o ISO 4217. Por exemplo: `BRL` para Real brasileiro, `USD` para Dólar americano.|
|purchase.**original_offer_price**object|Dados referentes ao valor da oferta principal do produto.|
|purchase.**recurrence_number**integer|Indica em qual número de recorrência a assinatura está|
|purchase.**subscription_anticipation_purchase**boolean|Indica se uma compra é de renovação antecipada. **True** se sim e **False** se não.|
|purchase.original_offer_price.**currency_value**string|Moeda referente aos valores das tarifas, no padrão internacional de três letras. Por exemplo: BRL, USD, EUR, MXN e mais.|
|purchase.original_offer_price.**value**double|Valor da oferta principal do produto.|
|purchase.**price**object|Dados referentes ao valor da oferta no momento da compra.|
|purchase.price.**value**double|Valor da oferta no momento da compra.|
|purchase.price.**currency_value**string|Moeda da oferta no momento da compra, representada no padrão internacional de três letras conforme o ISO 4217. Por exemplo: `BRL` para Real brasileiro, `USD` para Dólar americano.|
|purchase.**offer**object|Este campo virá preenchido com o texto cadastrado na descrição da oferta (para transações na modalidade de pagamento único) ou o texto cadastrado na descrição do plano (para transações na modalidade de pagamento recorrente). Se a oferta, ou plano não possuir uma descrição cadastrada, este campo não será retornado.|
|purchase.offer.**code**string|Identificador único da oferta que foi adquirida.|
|purchase.offer.**coupon_code**string|Código do cupom de desconto, caso tenha sido utilizado na compra.|
|purchase.offer.**name**string|Este campo virá preenchido com o texto cadastrado no nome da oferta (para transações na modalidade de pagamento único). Em casos de transações na modalidade de pagamento recorrente, o texto cadastrado no nome do plano virá preenchido no campo 'subscription.plan.name'. Se a oferta não possuir um nome cadastrado, este campo não será retornado.|
|purchase.offer.**description**string|Este campo virá preenchido com o texto cadastrado na descrição da oferta (para transações na modalidade de pagamento único) ou o texto cadastrado na descrição do plano (para transações na modalidade de pagamento recorrente). Se a oferta, ou plano não possuir uma descrição cadastrada, este campo não será retornado.|
|purchase.offer.**metadata**object|Objeto contendo pares chave-valor de metadados customizados configurados na oferta. Só será retornado se a oferta possuir metadados cadastrados. Disponível apenas para produtos de assinatura. Chaves são alfanuméricas (máx. 25 caracteres) e valores são strings (máx. 100 caracteres), com no máximo 10 entries por oferta.|
|purchase.**origin**object|Informações referentes à origem das suas vendas.|
|purchase.origin.**src**string|Código de UTM origem da página de vendas.|
|purchase.origin.**sck**string|Código UTM de origem da página de pagamento (checkout).|
|purchase.origin.**xcod**string|Código de UTM que pode ser personalizado para receber informações de origem da venda.|
|purchase.**checkout_country**object|Dados referentes ao país selecionado pelo comprador na página de pagamento.|
|purchase.checkout_country.**name**string|País selecionado pelo comprador na página de pagamento.|
|purchase.checkout_country.**iso**string|País selecionado pelo comprador na página de pagamento, no formato ISO 3166 Alpha-2.|
|purchase.**order_bump**object|Dados utilizados para identificar se uma compra faz parte de um Order Bump.|
|purchase.order_bump.**is_order_bump**boolean|Indica se a transação é um Order Bump. **True** se sim e **False** se não.|
|purchase.order_bump.**parent_purchase_transaction**string|Identificador da transação pai, caso seja uma transação de Order Bump. Esse é o identificador da transação principal que gerou todas as outras compras na página de pagamento. Quando este identificador for retornado vazio em uma compra com Order Bump `(purchase.order_bump.is_order_bump = true)`, a própria compra em questão é a pai. Para saber mais sobre Order Bump, veja nosso artigo na central de ajuda: [O que é e como configurar o Order Bump?](https://help.hotmart.com/pt-BR/article/o-que-e-e-como-configurar-o-order-bump-/360019967392)|
|purchase.**order_date**string|Data do pedido. Para compras recorrentes, este valor é referente a cada renovação.|
|purchase.**date_next_charge**long|Data da proxima cobrança em milissegundos a partir de 1970-01-01 00:00:00 UTC.|
|purchase.**status**string|Mostra o status de compra. Os valores possíveis para este campo são:  <br>`APPROVED`, `BLOCKED`, `CANCELLED`, `CHARGEBACK`, `COMPLETE`, `EXPIRED`, `NO_FUNDS`, `OVERDUE`, `PARTIALLY_REFUNDED`, `PRE_ORDER`, `PRINTED_BILLET`, `PROCESSING_TRANSACTION`, `DISPUTE`, `REFUNDED`, `STARTED`, `UNDER_ANALISYS` ou `WAITING_PAYMENT`.  <br>A descrição de cada status pode ser encontrado em nossa [página de suporte](https://atendimento.hotmart.com.br/hc/pt-br/articles/216441297-Quais-status-uma-transa%C3%A7%C3%A3o-pode-assumir-) .|
|purchase.**transaction**string|Código único de referência para um transação, por exemplo **HP17715690036014**. Uma transação acontece quando um pedido é efetuado. Um pedido pode ser um boleto gerado, uma compra aprovada, uma recorrência de compra e mais.|
|purchase.**payment**object|Dados do pagamento.|
|purchase.payment.**billet_barcode**string|Código de barra do boleto para o pagamento da compra (Só é enviado caso a compra seja do tipo boleto bancário).|
|purchase.payment.**billet_url**string|Link para reimprimir o boleto da compra (Só é enviado caso a compra seja do tipo boleto bancário).|
|purchase.payment.**installments_number**integer|Número total de parcelas, no caso de uma compra parcelada em **BRL, MXN** ou **COP**.|
|purchase.payment.**pix_code**string|Código do Pix para o pagamento da compra, também conhecido como **Pix copia e cola**. Enviado apenas quando a compra é por Pix.|
|purchase.payment.**pix_expiration_date**long|Data limite para o pagamento do Pix. O link e o QR code só irão funcionar para o pagamento até esta data de expiração.|
|purchase.payment.**pix_qrcode**string|Link para a visualização do QR code para o pagamento via Pix. Enviado apenas quando a compra é por Pix.|
|purchase.payment.**refusal_reason**string|Texto de recusa do pagamento pela operadora.|
|purchase.payment.**type**string|Tipo de pagamento utilizado pela pessoa compradora para realizar a compra. Os valores possíveis para este campo são: **`BILLET`, `CASH_PAYMENT`, `CREDIT_CARD`, `DIRECT_BANK_TRANSFER`, `DIRECT_DEBIT`, `FINANCED_BILLET`, `FINANCED_INSTALLMENT`, `GOOGLE_PAY`, `HOTCARD`, `HYBRID`, `MANUAL_TRANSFER`, `PAYPAL`, `PAYPAL_INTERNACIONAL`, `PICPAY`, `PIX`, `SAMSUNG_PAY` e `WALLET`.**|
|purchase.**invoice_by**string|Responsável pela emissão da Nota Fiscal. `HOTMART` se é a Hotmart ou `SELLER` se é o Produtor.|
|purchase.**is_funnel**boolean|Informa se a compra fez parte de alguma etapa de um Funil de Vendas Hotmart. **True** se sim e **False** se não. Para saber mais, acesse a nossa [Central de Ajuda](https://help.hotmart.com/pt-br/article/220402348/o-que-e-e-como-configurar-meu-funil-de-vendas-) .|
|purchase.**event_tickets**object|Informações referentes à venda de [ingressos para eventos](https://help.hotmart.com/pt-br/article/115003613592/ingressos-para-eventos-presenciais-tudo-o-que-voce-precisa-saber-para-cadastrar-e-configurar-seu-produto) .|
|purchase.event_tickets.**amount**integer|Detalha a quantidade de ingressos adquiridos na venda.|
|purchase.**business_model**string|Modelo fiscal pelo qual a Hotmart processou a transação e que determina quem é responsável por emitir a nota fiscal ao comprador. Possíveis valores: "R", "A" e "I", sendo R: A Hotmart emite a nota fiscal para o comprador; A: O produtor emite a nota fiscal ao comprador pela entidade legal da Hotmart no exterior; e I: O produtor emite a nota fiscal para o comprador pela entidade legal da Hotmart no Brasil. Para saber mais sobre os modelos fiscais, acesse a nossa [Central de Ajuda](https://help.hotmart.com/pt-br/article/27142347940749/vendas-globais-responsabilidades-fiscais-para-vendas-feitas-atraves-da-hotmart) .|
|purchase.**variants**object|Dados da variação do produto selecionada pelo comprador. Enviado apenas quando o produto possui variação configurada.|
|purchase.variants.**sku**string|Código SKU da variação do produto. Este campo é opcional e pode não ser enviado.|
|purchase.variants.**attributes**array<object>|Lista de atributos da variação selecionada pelo comprador (ex: tamanho, cor, sabor). Cada objeto contém name e value.|
|purchase.variants.attributes.**name**string|Nome do atributo da variação (ex: Tamanho, Cor, Sabor).|
|purchase.variants.attributes.**value**string|Valor do atributo da variação selecionado pelo comprador (ex: Médio, Azul, Chocolate).|
|**shipping**object|Dados de frete da compra. Contém informações sobre custo, prazo estimado de entrega, transportadora e serviço de fulfillment. Este campo é omitido do payload quando não há informações de frete disponíveis (ex. produto digital).|
|shipping.**cost**object|Objeto com o valor e a moeda do frete.|
|shipping.cost.**value**number|Valor total cobrado do cliente pelo envio. Quando o frete é grátis, o valor é `0`.|
|shipping.cost.**currency_value**string|Moeda do frete, representada no padrão internacional de três letras conforme o ISO 4217. Por exemplo: BRL para Real brasileiro, USD para Dólar americano.|
|shipping.**estimated_delivery_days**integer|Prazo estimado de entrega em dias. Representa a soma do tempo da transportadora e do tempo de manuseio exibido ao comprador.|
|shipping.**carrier**object|Objeto com dados da transportadora responsável pelo envio.|
|shipping.carrier.**name**string|Nome da transportadora (ex: CORREIOS).|
|shipping.carrier.**service**string|Serviço ou método de envio da transportadora (ex: SEDEX, PAC).|
|shipping.**fulfillment**object|Objeto com dados do serviço de fulfillment responsável pelo estoque e envio do produto.|
|shipping.fulfillment.**service**string|Nome do serviço de fulfillment que gerencia o estoque e envio do produto. O valor é `MANUAL` quando o produto NÃO é um produto sob demanda (print-on-demand). Para produtos sob demanda, o valor será o nome do serviço (ex: `UICLAP`, `MONTINK`).|
|purchase.**flexPayPlan**object|Dados do plano de pagamento High Ticket. Só aparece quando a compra é do tipo FlexPay (High Ticket). Estas informações permitem acompanhar alterações no estado do plano e consultar a situação de todas as cobranças.|
|purchase.flexPayPlan.**checkoutKey**string|Identificador do checkout responsável pela criação do plano.|
|purchase.flexPayPlan.**originFeature**string|Produto responsável pela criação do plano. Atualmente o valor possível é HIGH_TICKET.|
|purchase.flexPayPlan.**signupTransactionReference**string|Referência HotPay da compra de adesão (primeira transação do plano).|
|purchase.flexPayPlan.**enrollmentStatus**string|Status atual do plano. Valores possíveis: ACTIVE, ON_HOLD, CANCELLED, SETTLED.|
|purchase.flexPayPlan.**nextBillingDate**datetime|Data prevista para a próxima cobrança do plano. Pode ser nulo caso não existam novas cobranças.|
|purchase.flexPayPlan.**planCharges**array<object>|Lista contendo todas as cobranças pertencentes ao plano.|
|purchase.flexPayPlan.planCharges.**stepOrder**integer|Ordem do step dentro do plano.|
|purchase.flexPayPlan.planCharges.**stepLimit**integer|Quantidade total de cobranças previstas naquele step.|
|purchase.flexPayPlan.planCharges.**stepRecurrence**integer|Número sequencial da cobrança dentro do step.|
|purchase.flexPayPlan.planCharges.**status**string|Status atual da cobrança. Valores possíveis: SCHEDULED, PENDING, PAID, OVERDUE, CANCELLED.|
|purchase.flexPayPlan.planCharges.**currencyCodeTo**string|Código da moeda da cobrança (ISO 4217). Exemplo: BRL, USD.|
|purchase.flexPayPlan.planCharges.**value**decimal|Valor originalmente previsto para cobrança.|
|purchase.flexPayPlan.planCharges.**paidValue**decimal|Valor efetivamente pago. Pode ser diferente de value quando houver renegociação.|
|purchase.flexPayPlan.planCharges.**installments**integer|Quantidade de parcelas utilizadas naquela cobrança.|
|purchase.flexPayPlan.planCharges.**dueDate**datetime|Data de vencimento da cobrança.|
|purchase.flexPayPlan.planCharges.**lastTransaction**object|Informações da última tentativa de cobrança. Não enviado caso nenhuma tentativa tenha sido realizada.|
|purchase.flexPayPlan.planCharges.lastTransaction.**createdAt**datetime|Data e hora da última tentativa de cobrança.|
|purchase.flexPayPlan.planCharges.lastTransaction.**transaction**string|Referência HotPay da transação correspondente.|
|purchase.flexPayPlan.planCharges.lastTransaction.**paymentType**string|Método de pagamento utilizado. Valores possíveis: PIX, CREDIT_CARD, BILLET.|
|purchase.flexPayPlan.planCharges.lastTransaction.**isNegotiation**boolean|Indica se esta cobrança foi originada por uma renegociação.|
|**subscription**object|Dados da assinatura adquirida, caso a venda tenha sido de um produto de assinatura.|
|subscription.**status**string|Mostra os status do momento em que aquela assinatura se encontra. Estes status podem ser: **ACTIVE, INACTIVE, DELAYED, CANCELLED_BY_CUSTOMER, CANCELLED_BY_SELLER, CANCELLED_BY_ADMIN, STARTED** ou **OVERDUE**.|
|subscription.**plan**object|Dados do plano adquirido.|
|subscription.plan.**id**long|Identificador único do plano de assinatura.|
|subscription.plan.**name**string|Nome do plano adquirido. Enviado apenas em caso de venda de assinaturas.|
|subscription.**subscriber**object|Dados do assinante.|
|subscription.subscriber.**code**string|Código exclusivo de um assinante. Este campo é usado pelo sistema externo para identificar um assinante de uma assinatura. Um mesmo comprador terá 2 subscribersCode diferentes se ele assinar dois produtos diferentes.|

```json
{
  "id": "1234567890123456789",
  "creation_date": 12345678,
  "event": "PURCHASE_APPROVED",
  "version": "2.0.0",
  "data": {
    "product": {
      "id": 213344,
      "ucode": "2e9c43a9-0aeb-48ed-9464-630f845c23af",
      "name": "Product Name",
      "has_co_production": false,
      "warranty_date": "2017-12-27T00:00:00Z",
      "support_email": "support@email.com",
      "is_physical_product": false,
      "content": {
        "has_physical_products": true,
        "products": [
          {
            "id": 4774438,
            "ucode": "559fef42-3406-4d82-b775-d09bd33936b1",
            "name": "Product Name 1",
            "is_physical_product": false
          },
          {
            "id": 4999597,
            "ucode": "099e7644-b7d1-43d6-82a9-ec6be0118a4b",
            "name": "Physical product",
            "is_physical_product": true
          }
        ]
      }
    },
    "affiliates": [
      {
        "affiliate_code": "Q58388177J",
        "name": "Affiliate name"
      }
    ],
    "buyer": {
      "email": "buyer@email.com",
      "name": "Buyer Name",
      "first_name": "Buyer",
      "last_name": "Name",
      "checkout_phone": "999999999",
      "checkout_phone_code": "31",
      "document": "123456789",
      "document_type": "CPF",
      "address": {
        "zipcode": "30150101",
        "country": "Brasil",
        "number": "499",
        "address": "Avenida Assis Chateaubriand",
        "city": "Belo Horizonte",
        "state": "MG",
        "neighborhood": "Floresta",
        "complement": "a complement",
        "country_iso": "BR"
      },
    },
    "producer": {
      "name": "Producer Name",
      "legal_nature": "Pessoa Física",
      "document": "12345678965",
    },
    "commissions": [
      {
        "value": 0.65,
        "currency_value": "BRL",
        "source": "MARKETPLACE"
      },
      {
        "value": 3.10,
        "currency_value": "USD",
        "source": "PRODUCER",
        "currency_conversion": {
          "converted_value": 16.34,
          "converted_to_currency": "BRL",
          "conversion_rate": 5.271103
        }
      }
    ],
    "purchase": {
      "approved_date": 1231241434453,
      "full_price": {
        "value": 134.0,
        "currency_value": "BRL"
      },
      "original_offer_price": {
        "currency_value": "EUR",
        "value": 150.6
      },
      "price": {
        "value": 150.6,
        "currency_value": "BRL"
      },
      "offer": {
        "code": "n82b9jqz",
        "coupon_code": "ABCDE",
        "name": "Offer name",
        "description": "Offer description"
      },
      "recurrence_number": 1,
      "subscription_anticipation_purchase": false,
      "checkout_country": {
        "name": "Brasil",
        "iso": "BR"
      },
      "origin": {
        "xcod": "xcod_example"
      },
      "order_bump": {
        "is_order_bump": true,
        "parent_purchase_transaction": "HP02316330308193"
      },
      "order_date": "123243546",
      "date_next_charge": 1736337600000,
      "status": "STARTED",
      "transaction": "HP02316330308193",      
      "payment": {
        "billet_barcode": "03399.33335 33823.303087 19802.801027 2 87630000015000",
        "billet_url": "https://billet-link.com/bHP02316330308193",
        "installments_number": 2,
        "pix_code": "00020101021226780014br.gov.bcb.pix2556pix-h.juno.com.br/qr/v2/A0ACBEDA916F322FAB94E7DA5B29D0185204000053039865802BR5910EBANX Ltda6008CURITIBA62070503***6304E794",
        "pix_expiration_date": 1645271012000,
        "pix_qrcode": "https://sandbox-local-latam.ebanx.com/pix/checkout?hash=620e34e301fcbdead10d9187a699c4de9e50db35b92da0cd",
        "refusal_reason": "fail",
        "type": "PICPAY"
      },
      "is_funnel": false,
      "event_tickets": { 
        "amount": 2 
      },
      "business_model": "I",
      "variants": {
        "sku": "HTM_OTAROM-14",
        "attributes": [
          { "name": "Tamanho", "value": "Médio" },
          { "name": "Sabor", "value": "Chocolate" }
        ]
      }
    },
    "shipping": {
      "cost": {
        "value": 25.90,
        "currency_value": "BRL"
      },
      "estimated_delivery_days": 10,
      "carrier": {
        "name": "CORREIOS",
        "service": "SEDEX"
      },
      "fulfillment": {
        "service": "MANUAL"
      }
    },
    "flexPayPlan": {
      "checkoutKey": "wotrl10UTPS80qiK",
      "originFeature": "HIGH_TICKET",
      "signupTransactionReference": "HP02316330308193",
      "enrollmentStatus": "ACTIVE",
      "nextBillingDate": "2025-03-15T00:00:00",
      "planCharges": [
        {
          "stepOrder": 1,
          "stepLimit": 1,
          "stepRecurrence": 1,
          "status": "PAID",
          "currencyCodeTo": "BRL",
          "value": 10000.00,
          "paidValue": 10000.00,
          "installments": 1,
          "dueDate": "2025-02-15T00:00:00",
          "lastTransaction": {
            "createdAt": "2025-02-15T14:30:00",
            "transaction": "HP02316330308193",
            "paymentType": "CREDIT_CARD",
            "isNegotiation": false
          }
        },
        {
          "stepOrder": 2,
          "stepLimit": 1,
          "stepRecurrence": 1,
          "status": "SCHEDULED",
          "currencyCodeTo": "BRL",
          "value": 27223.38,
          "installments": 6,
          "dueDate": "2025-03-15T00:00:00"
        }
      ]
    },
    "subscription": {
      "status": "ACTIVE",
      "plan": {
        "id": 711459,
        "name": "plan name"
      },
      "subscriber": {
        "code": "12133421"
      }
    }
  }
}
```

## Evento de troca do dia de cobrança de assinatura

2.0.0

Você vai receber dados gerais sobre a troca do dia de cobrança de uma assinatura, como informações sobre o assinante, o plano de assinatura, as datas de cobrança (antiga, nova, próxima cobrança) e mais. Assim, toda vez que uma pessoa trocar o dia do mês que deseja ser cobrada pela assinatura, você receberá essas informações.

- Produtor(a)

É a pessoa com uma conta que possui ao menos um produto cadastrado na Hotmart.

|Parâmetro|Descrição|
|---|---|
|**hottok**string|Cada conta possui um token único. Ele é a principal garantia de que a requisição está sendo feita pela Hotmart, o que é uma questão de segurança para evitar fraudes e ataques. **Este campo vai ser enviado com o nome `X-HOTMART-HOTTOK` no cabeçalho HTTP de todas as requisições e recomendamos validá-lo antes de tratar os dados recebidos**. Se precisar trocar esta chave, entre em contato com nosso suporte.|
|**id**string|Código único de identificação do evento recebido.|
|**creation_date**long|Data de criação do evento. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC **(Unix Epoch)**.|
|**event**string|Nome do evento recebido, que neste caso vai ser `UPDATE_SUBSCRIPTION_CHARGE_DATE`.|
|**version**string|Versão do evento recebido. Essa versão é escolhida no momento de criação de uma configuração no Webhook. Neste caso o valor vai ser sempre 2.0.0.|
|**data**object|Dados relacionados ao evento de troca de data de cobrança de assinatura.|
|data.**subscriber**object|Dados relacionados ao assinante.|
|data.subscriber.**name**string|Nome completo do assinante.|
|data.subscriber.**email**string|E-mail do assinante.|
|data.subscriber.**code**string|Código exclusivo de um assinante. Este campo é usado pelo sistema externo para identificar um assinante de uma assinatura. Uma mesma pessoa compradora vai ter 2 códigos diferentes se ela assinar dois produtos diferentes.|
|data.**subscription**object|Dados relacionados à assinatura.|
|data.subscription.**product**object|Dados relacionados ao produto da assinatura.|
|data.subscription.product.**name**string|Nome do produto da assinatura.|
|data.subscription.product.**id**integer|Código único de identificação do produto da assinatura.|
|data.subscription.**old_charge_day**integer|Dia do mês em que a pessoa assinante era cobrada antes de realizar a alteração.|
|data.subscription.**new_charge_day**integer|Novo dia do mês em que a pessoa assinante vai ser cobrada após realizar a alteração.|
|data.subscription.**date_next_charge**string|Data de tentativa do próximo pagamento. No caso de assinaturas canceladas, vai indicar a última data de acesso do assinante ao produto e, portanto, nenhuma cobrança será efetuada após este período. **Exemplo**: o assinante comprou um produto que é cobrado todo dia 10 do mês. Se no dia 20 deste mês o assinante decidiu cancelar a assinatura, a data mostrada neste campo vai ser o dia 10 do mês subsequente. **Importante**: essa data já considera a alteração do dia de cobrança feita pela pessoa assinante, porém, em alguns casos, isso poderá valer somente no próximo ciclo de cobrança.|
|data.subscription.**status**string|Mostra o status em que aquela assinatura se encontra no momento em que foi feita a alteração do dia de cobrança. Estes status podem ser: `ACTIVE`, `INACTIVE`, `CANCELED_BY_CUSTOMER`, `CANCELED_BY_VENDOR`, `CANCELED_BY_ADMIN`, `OVERDUE`, `STARTED`, `EXPIRED`. A descrição de cada status pode ser encontrada em nossa [página de suporte](https://help.hotmart.com/pt-BR/article/quais-sao-os-diferentes-status-de-uma-assinatura-/360015852651) .|
|data.**plan**object|Dados relacionados ao plano da assinatura.|
|data.plan.**offer**object|Dados relacionados à oferta do plano da assinatura.|
|data.plan.offer.**code**string|Código único de identificação da oferta que gerou a assinatura.|
|data.plan.**name**string|Nome do plano de assinatura.|
|data.plan.**id**integer|Código único de identificação do plano de assinatura.|

```json
{
	"id": "bc91fa06-0bd3-4cf5-853a-1fbf4716a10b",
	"creation_date": 1663951146081,
	"event": "UPDATE_SUBSCRIPTION_CHARGE_DATE",
	"version": "2.0.0"
	"data": {
		"subscriber": {
			"name": "Bruno Souza",
			"email": "bruno.souza+br@hotmart.com",
			"code": "QG5LHFHP"
		},
		"subscription": {
			"product": {
				"name": "Assinatura Trapalhoes",
				"id": 4756866
			},
			"old_charge_day": 7,
			"new_charge_day": 6,
            "date_next_charge": "2022-09-01T12:00:00.000Z",
			"status": "ACTIVE"
		},
		"plan": {
			"offer": {
				"code": "gp2z4nti"
			},
			"name": "assinatura",
			"id": 827121
		}
	},
}
```

## Evento de primeiro acesso

Você vai receber uma notificação sobre **o primeiro acesso de um aluno a um curso**, com a identificação do produto e do aluno em questão.

- Produtor(a)

É a pessoa com uma conta que possui ao menos um produto cadastrado na Hotmart.

|Parâmetro|Descrição|
|---|---|
|**hottok**string|Cada conta possui um token único. Ele é a principal garantia de que a requisição está sendo feita pela Hotmart, o que é uma questão de segurança para evitar fraudes e ataques. **Este campo será enviado com o nome `X-HOTMART-HOTTOK` no cabeçalho HTTP de todas as requisições e recomendamos validá-lo antes de tratar os dados recebidos.** Se precisar trocar esta chave, entre em contato com nosso suporte.|
|**id**string|Código único de identificação do evento recebido.|
|**creation_date**long|Data de criação do evento. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC **(Unix Epoch)**.|
|**event**string|Nome do evento recebido, que neste caso vai ser `CLUB_FIRST_ACCESS`.|
|**version**string|Versão do evento recebido. Essa versão é escolhida no momento de criação de uma configuração no Webhook. Neste caso o valor vai ser sempre 2.0.0.|
|**data**object|Dados relacionados ao evento de primeiro acesso.|
|data.**product**object|Informações sobre o produto.|
|data.product.**id**integer|Identificador único do produto.|
|data.product.**name**string|Nome do produto.|
|data.**user**object|Informações sobre o aluno.|
|data.user.**name**string|Nome completo do aluno.|
|data.user.**email**string|E-mail do aluno.|

```json
{
  "id": "27b52d28-acf4-448a-bc5f-4ab4bc8dcb35",
  "creation_date": 1632411406874,
  "event": "CLUB_FIRST_ACCESS",
  "version": "2.0.0",
  "data": {
    "product": {
      "id": 3526906,
      "name": "Product Name"
    },
    "user": {
      "name": "Buyer Name",
      "email": "buyer@email.com"
    }
  }
}
```

## Evento de módulo completo

Você receberá uma notificação quando um aluno completar um módulo do curso, com a identificação de qual o módulo, o aluno e o curso em questão. Para alunos que consumirem via mobile, a notificação ocorrerá dependendo da versão do Hotmart App instalada no dispositivo.

- Produtor(a)

É a pessoa com uma conta que possui ao menos um produto cadastrado na Hotmart.

|Parâmetro|Descrição|
|---|---|
|**hottok**string|Cada conta possui um token único. Ele é a principal garantia de que a requisição está sendo feita pela Hotmart, o que é uma questão de segurança para evitar fraudes e ataques. **Este campo será enviado com o nome `X-HOTMART-HOTTOK` no cabeçalho HTTP de todas as requisições e recomendamos validá-lo antes de tratar os dados recebidos.** Se precisar trocar esta chave, entre em contato com nosso suporte.|
|**id**string|Código único de identificação do evento recebido.|
|**creation_date**long|Data de criação do evento. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC **(Unix Epoch)**.|
|**event**string|Nome do evento recebido, que neste caso vai ser `CLUB_MODULE_COMPLETED`.|
|**version**string|Versão do evento recebido. Essa versão é escolhida no momento de criação de uma configuração no Webhook. Neste caso o valor vai ser sempre 2.0.0.|
|**data**object|Dados relacionados ao evento de módulo completo.|
|data.**product**object|Informações sobre o produto.|
|data.product.**id**integer|Identificador único do produto.|
|data.product.**name**string|Nome do produto.|
|data.**user**object|Informações sobre o aluno.|
|data.user.**name**string|Nome completo do aluno.|
|data.user.**email**string|E-mail do aluno.|
|data.**module**object|Informações sobre o módulo.|
|data.module.**id**string|Identificador único do módulo.|
|data.module.**name**string|Nome mais atualizado do módulo.|

```json
{
  "id": "27b52d28-acf4-448a-bc5f-4ab4bc8dcb35",
  "creation_date": 1632411406874,
  "event": "CLUB_MODULE_COMPLETED",
  "version": "2.0.0",
  "data": {
    "product": {
	  "id": 3526906, 
      "name": "Product Name"
	},
	"user": {
	  "name": "User Name",
	  "email": "user@email.com"
	},
	"module": {
	  "id": "j14okvB4pL",
      "name": "Module Name"
	}
  }
}
```

## Evento de dado logístico

Você receberá dados completos sobre o **dado logístico de um pedido de produto físico**, incluindo informações de compra, itens, entrega, frete, serviço de fulfillment e cobrança. Esse evento é disparado quando uma compra aprovada de produto físico gera um dado logístico.

- Creator

É a pessoa com uma conta que possui ao menos um produto cadastrado na Hotmart.

|Parâmetro|Descrição|
|---|---|
|**hottok**string|Cada conta possui um token único. Ele é a principal garantia de que a requisição está sendo feita pela Hotmart, o que é uma questão de segurança para evitar fraudes e ataques. **Este campo será enviado com o nome `X-HOTMART-HOTTOK` no cabeçalho HTTP de todas as requisições e recomendamos validá-lo antes de tratar os dados recebidos.** Se precisar trocar esta chave, entre em contato com nosso suporte.|
|**id**string|Código único de identificação do evento recebido (UUID v4).|
|**creation_date**long|Data de criação do evento. Essa data está em milissegundos, contando a partir de 1970-01-01 00:00:00 UTC **(Unix Epoch)**.|
|**event**string|Nome do evento recebido, que neste caso vai ser `ORDER_FULFILLMENT`.|
|**version**string|Versão do evento recebido. Essa versão é escolhida no momento de criação de uma configuração no Webhook. Neste caso o valor vai ser sempre `2.0.0`.|
|**data**object|Dados relacionados ao evento de dado logístico.|
|data.**purchase**object|Informações da compra associada ao dado logístico.|
|data.purchase.**full_price**object|Valor total da compra pago pelo comprador.|
|data.purchase.full_price.**value**double|Valor total pago pelo comprador, incluindo taxas e juros.|
|data.purchase.full_price.**currency_value**string|Moeda do valor, representada no padrão internacional de três letras conforme o ISO 4217. Por exemplo: `BRL`, `USD`.|
|data.purchase.**price**object|Valor da oferta no momento da compra.|
|data.purchase.price.**value**double|Valor da oferta adquirida.|
|data.purchase.price.**currency_value**string|Moeda do valor da oferta, no padrão ISO 4217.|
|data.purchase.**approved_date**long|Data de aprovação da compra em milissegundos a partir de 1970-01-01 00:00:00 UTC.|
|data.purchase.**order_date**long|Data do pedido em milissegundos a partir de 1970-01-01 00:00:00 UTC.|
|data.purchase.**id**long|Identificador único da compra.|
|data.purchase.**transaction**string|Código de referência único da transação, por exemplo **HP17163000001234**.|
|data.purchase.**status**string|Status da compra. Neste evento o valor será `APPROVED`.|
|data.purchase.**shopper**object|Dados do comprador (pessoa que realizou a compra).|
|data.purchase.shopper.**country**string|País do comprador (ex: `Brasil`, `United States`).|
|data.purchase.shopper.**phone**string|Número de telefone do comprador.|
|data.purchase.shopper.**document**string|Documento de identificação do comprador (CPF, CNPJ ou equivalente).|
|data.purchase.shopper.**name**string|Nome completo do comprador.|
|data.purchase.shopper.**time_zone**string|Fuso horário do comprador (ex: `America/Sao_Paulo`).|
|data.purchase.shopper.**locale**string|Idioma/localidade do comprador (ex: `pt_BR`).|
|data.purchase.shopper.**ucode**string|Identificador único do comprador na plataforma Hotmart.|
|data.purchase.shopper.**email**string|E-mail do comprador.|
|data.purchase.shopper.**address**object|Endereço do comprador.|
|data.purchase.shopper.address.**address**string|Logradouro (rua, avenida, etc.).|
|data.purchase.shopper.address.**number**string|Número do endereço.|
|data.purchase.shopper.address.**complement**string|Complemento do endereço.|
|data.purchase.shopper.address.**neighborhood**string|Bairro.|
|data.purchase.shopper.address.**city**string|Cidade.|
|data.purchase.shopper.address.**state**string|Estado ou província.|
|data.purchase.shopper.address.**zip_code**string|CEP ou código postal.|
|data.purchase.shopper.address.**country**string|País (ex: `Brasil`, `United States`).|
|data.**line_items**array<object>|Lista de itens do pedido de fulfillment.|
|data.line_items.**offer**object|Dados da oferta do item.|
|data.line_items.offer.**price**object|Preço da oferta.|
|data.line_items.offer.price.**value**double|Valor da oferta.|
|data.line_items.offer.price.**currency_value**string|Moeda do valor, no padrão ISO 4217.|
|data.line_items.offer.**code**string|Código identificador da oferta.|
|data.line_items.**product**object|Dados do produto físico.|
|data.line_items.product.**id**long|Identificador único do produto.|
|data.line_items.product.**name**string|Nome do produto.|
|data.line_items.product.**seller**object|Dados do vendedor (produtor) do produto.|
|data.line_items.product.seller.**name**string|Nome do vendedor.|
|data.line_items.product.seller.**email**string|E-mail do vendedor.|
|data.line_items.product.seller.**ucode**string|Identificador único do vendedor na plataforma Hotmart.|
|data.line_items.product.seller.**locale**string|Idioma/localidade do vendedor.|
|data.line_items.product.**format**string|Formato do produto. Para produtos físicos o valor será `PHYSICAL`.|
|data.line_items.product.**support_email**string|E-mail de suporte do produto.|
|data.line_items.product.**ucode**string|Identificador único do produto na plataforma Hotmart.|
|data.line_items.**quantity**integer|Quantidade do item no pedido.|
|data.line_items.**variant**object|Dados da variação do produto selecionada pelo comprador.|
|data.line_items.variant.**name**string|Nome descritivo da variação (ex: `Tamanho M - Azul`).|
|data.line_items.variant.**id**string|Identificador único da variação.|
|data.line_items.variant.**attributes**array<object>|Lista de atributos da variação (ex: tamanho, cor).|
|data.line_items.variant.attributes.**name**string|Nome do atributo (ex: `Tamanho`, `Cor`).|
|data.line_items.variant.attributes.**value**string|Valor do atributo selecionado (ex: `M`, `Azul`).|
|data.line_items.variant.**sku**string|Código SKU da variação do produto.|
|data.line_items.**dimension**object|Dimensões físicas do produto para cálculo de frete.|
|data.line_items.dimension.**depth**double|Profundidade/comprimento do produto em centímetros.|
|data.line_items.dimension.**width**double|Largura do produto em centímetros.|
|data.line_items.dimension.**weight**double|Peso do produto em quilogramas.|
|data.line_items.dimension.**height**double|Altura do produto em centímetros.|
|data.**delivery**object|Informações de entrega do pedido.|
|data.delivery.**shipping_processing_time**integer|Tempo adicional de manuseio/preparação do pedido em dias, configurado pelo produtor.|
|data.delivery.**method_type**string|Tipo do método de entrega (ex: `SHIPPING`).|
|data.delivery.**delivery_time**integer|Prazo estimado de entrega em dias úteis.|
|data.delivery.**destination**object|Endereço de destino da entrega.|
|data.delivery.destination.**address**string|Logradouro (rua, avenida, etc.).|
|data.delivery.destination.**number**string|Número do endereço.|
|data.delivery.destination.**complement**string|Complemento do endereço.|
|data.delivery.destination.**neighborhood**string|Bairro.|
|data.delivery.destination.**city**string|Cidade.|
|data.delivery.destination.**state**string|Estado ou província.|
|data.delivery.destination.**zip_code**string|CEP ou código postal.|
|data.delivery.destination.**country**string|País (ex: `Brasil`, `United States`).|
|data.**shipping**object|Informações de frete do pedido.|
|data.shipping.**shipping_total_value**object|Valor total do frete cobrado do comprador.|
|data.shipping.shipping_total_value.**value**double|Valor do frete. Quando o frete é grátis, o valor é `0`.|
|data.shipping.shipping_total_value.**currency_value**string|Moeda do frete, no padrão ISO 4217.|
|data.shipping.**carrier**object|Dados da transportadora responsável pelo envio.|
|data.shipping.carrier.**name**string|Nome da transportadora (ex: `CORREIOS`).|
|data.shipping.carrier.**code**string|Código identificador da transportadora.|
|data.shipping.carrier.**provider**string|Parceiro responsável pela contratação do serviço logístico (ex: `Frenet`, `Correios`, `Melhor Envio`).|
|data.shipping.**shipping_logistics_time**integer|Tempo estimado de transporte pela transportadora em dias.|
|data.shipping.**carrier_options**object|Opções de serviço da transportadora.|
|data.shipping.carrier_options.**service**string|Nome do serviço de envio (ex: `SEDEX`, `PAC`).|
|data.shipping.carrier_options.**code**string|Código do serviço de envio (ex: `04014`).|
|data.shipping.**type**string|Tipo de envio. Valores possíveis: `FLAT_RATE`, `FREE_SHIPPING`, `FIXED_PRICE`.|
|data.shipping.**estimate_shipping_cost**object|Custo estimado do frete calculado pela transportadora.|
|data.shipping.estimate_shipping_cost.**value**double|Valor estimado do frete.|
|data.shipping.estimate_shipping_cost.**currency_value**string|Moeda do valor, no padrão ISO 4217.|
|data.shipping.**shipping_markup_price**object|Valor adicional de frete configurado pelo produtor (markup).|
|data.shipping.shipping_markup_price.**value**double|Valor do markup de frete.|
|data.shipping.shipping_markup_price.**currency_value**string|Moeda do valor, no padrão ISO 4217.|
|data.**fulfillment_service**object|Dados do serviço de fulfillment responsável pelo processamento do pedido.|
|data.fulfillment_service.**service_type**string|Tipo do serviço de fulfillment. O valor é `MANUAL` quando o produtor gerencia o envio. Quando o envio é gerenciado por um parceiro, o valor será `PARTNER`.|
|data.fulfillment_service.**service_name**string|Nome do serviço de fulfillment (ex: `UICLAP`, `MONTINK`). Este campo é preenchido apenas quando `service_type` é `PARTNER`.|
|data.**billing**object|Dados de cobrança (pessoa responsável pelo pagamento).|
|data.billing.**country**string|País (ex: `Brasil`, `United States`).|
|data.billing.**phone**string|Número de telefone.|
|data.billing.**document**string|Documento de identificação (CPF, CNPJ ou equivalente).|
|data.billing.**name**string|Nome completo.|
|data.billing.**time_zone**string|Fuso horário (ex: `America/Sao_Paulo`).|
|data.billing.**locale**string|Idioma/localidade (ex: `pt_BR`).|
|data.billing.**ucode**string|Identificador único na plataforma Hotmart.|
|data.billing.**email**string|E-mail.|
|data.billing.**address**object|Endereço de cobrança.|
|data.billing.address.**address**string|Logradouro (rua, avenida, etc.).|
|data.billing.address.**number**string|Número do endereço.|
|data.billing.address.**complement**string|Complemento do endereço.|
|data.billing.address.**neighborhood**string|Bairro.|
|data.billing.address.**city**string|Cidade.|
|data.billing.address.**state**string|Estado ou província.|
|data.billing.address.**zip_code**string|CEP ou código postal.|
|data.billing.address.**country**string|País (ex: `Brasil`, `United States`).|

```json
{
  "id": "27b52d28-acf4-448a-bc5f-4ab4bc8dcb35",
  "creation_date": 1716400000000,
  "event": "ORDER_FULFILLMENT",
  "version": "2.0.0",
  "data": {
    "purchase": {
      "full_price": {
        "value": 99.90,
        "currency_value": "BRL"
      },
      "price": {
        "value": 89.90,
        "currency_value": "BRL"
      },
      "approved_date": 1716300000000,
      "order_date": 1716200000000,
      "id": 12345678,
      "transaction": "HP17163000001234",
      "status": "APPROVED",
      "shopper": {
        "country": "Brasil",
        "phone": "31999999999",
        "document": "12345678900",
        "name": "João Silva",
        "time_zone": "America/Sao_Paulo",
        "locale": "pt_BR",
        "ucode": "USER_UCODE_123",
        "email": "joao@email.com",
        "address": {
          "address": "Rua Exemplo",
          "number": "100",
          "complement": "Apto 1",
          "neighborhood": "Centro",
          "city": "Belo Horizonte",
          "state": "MG",
          "zip_code": "30130000",
          "country": "Brasil"
        }
      }
    },
    "line_items": [
      {
        "offer": {
          "price": {
            "value": 89.90,
            "currency_value": "BRL"
          },
          "code": "offer_abc123"
        },
        "product": {
          "id": 9876543,
          "name": "Camiseta Premium",
          "seller": {
            "name": "Maria Produtora",
            "email": "maria@email.com",
            "ucode": "SELLER_UCODE_456",
            "locale": "pt_BR"
          },
          "format": "PHYSICAL",
          "support_email": "suporte@produto.com",
          "ucode": "PROD_UCODE_789"
        },
        "quantity": 2,
        "variant": {
          "name": "Tamanho M - Azul",
          "id": "var_001",
          "attributes": [
            {
              "name": "Tamanho",
              "value": "M"
            },
            {
              "name": "Cor",
              "value": "Azul"
            }
          ],
          "sku": "SKU-CAM-M-AZ"
        },
        "dimension": {
          "depth": 5.0,
          "width": 30.0,
          "weight": 0.3,
          "height": 2.0
        }
      }
    ],
    "delivery": {
      "shipping_processing_time": 2,
      "method_type": "SHIPPING",
      "delivery_time": 5,
      "destination": {
        "address": "Rua Destino",
        "number": "200",
        "complement": "",
        "neighborhood": "Savassi",
        "city": "Belo Horizonte",
        "state": "MG",
        "zip_code": "30140000",
        "country": "Brasil"
      }
    },
    "shipping": {
      "shipping_total_value": {
        "value": 15.90,
        "currency_value": "BRL"
      },
      "carrier": {
        "name": "CORREIOS",
        "code": "COR",
        "provider": "Frenet"
      },
      "shipping_logistics_time": 5,
      "carrier_options": {
        "service": "SEDEX",
        "code": "04014"
      },
      "type": "FLAT_RATE",
      "estimate_shipping_cost": {
        "value": 12.50,
        "currency_value": "BRL"
      },
      "shipping_markup_price": {
        "value": 3.40,
        "currency_value": "BRL"
      }
    },
    "fulfillment_service": {
      "service_type": "MANUAL"
    },
    "billing": {
      "country": "Brasil",
      "phone": "31999999999",
      "document": "12345678900",
      "name": "João Silva",
      "time_zone": "America/Sao_Paulo",
      "locale": "pt_BR",
      "ucode": "USER_UCODE_123",
      "email": "joao@email.com",
      "address": {
        "address": "Rua Cobrança",
        "number": "300",
        "complement": "",
        "neighborhood": "Funcionários",
        "city": "Belo Horizonte",
        "state": "MG",
        "zip_code": "30130001",
        "country": "Brasil"
      }
    }
  }
}
```

# Usuário

Consulte as informações de perfil do usuário autenticado.

## [](https://developers.hotmart.com/docs/pt-BR/v1/user/get-user-me/#obter-perfil-do-usuario)Obter perfil do usuário

O endpoint de informações de perfil do usuário autenticado na API da Hotmart retorna dados como: nome, email, telefone, endereço, fuso horário, moeda de comissão, entre outros.

### [](https://developers.hotmart.com/docs/pt-BR/v1/user/get-user-me/#parametros-da-requisicao)Parâmetros da requisição

Este endpoint não possui parâmetros de query ou body.

GET/user/api/v1/me

cURL

```bash
curl --location --request GET 'https://developers.hotmart.com/user/api/v1/me' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer :access_token'
```