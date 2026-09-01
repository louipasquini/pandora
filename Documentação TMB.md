# Vendas

Webhook

Um webhook é um recurso que permite que você receba notificações automáticas em tempo real sempre que um evento específico ocorre em um sistema. No caso da **API Webhook de Vendas**, ele permite que você seja informado instantaneamente sobre alterações nos pedidos de parcelamento, bem como a **EFETIVAÇÃO** e o **CANCELAMENTO** do pedido.

Ao configurar o webhook, o sistema envia uma notificação para uma URL definida por você sempre que houver uma alteração de STATUS daquele pedido. Isso elimina a necessidade de verificar manualmente as atualizações, pois você recebe as informações em tempo real. Este documento fornece todas as informações necessárias para configurar o webhook e entender quais eventos serão notificados.

### Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/vendas#eventos)

A TMB notifica os seguintes eventos via Webhook para o campo **"status_pedido"**:

- **Efetivado:** Este evento é acionado quando o cliente efetua o pagamento do boleto de entrada.
    
- **Cancelado:** Este evento é acionado quando o cliente cancela o pedido após ter efetuado o pagamento do boleto de entrada.
    

### Exemplo de JSON a ser recebido em seu endpoint [POST][](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/vendas#exemplo-de-json-a-ser-recebido-em-seu-endpoint-post)

A notificação consiste em um POST contendo um JSON, conforme o modelo a seguir:

Payload

Exemplo

Copiar

```
{
    "produtor": string,
    "lancamento": string,
    "provedor_negociado": string,
    "pedido": int,
    "status_pedido": string,
    "cliente": string,
    "documento": string,
    "email": string,
    "score": null,
    "probabilidade_inadimplencia": null,
    "endereco_complemento": string,
    "valor_principal": double,
    "parcelas": int,
    "valor_entrada": double,
    "valor_parcela": double,
    "valor_total": double,
    "taxa_administracao": double,
    "criado_em": datetime,
    "data_efetivado": datetime,
    "vendedor": null,
    "titulo": string,
    "code": string,
    "endereco_completo": string,
    "telefones": string,
    "telefone_ativo": string,
    "lancamento_id": int,
    "id_externo": string,
    "risco_compartilhado_em": datetime,
    "avalista_nome": null,
    "avalista_telefone": null,
    "avalista_email": null,
    "avalista_documento": null,
    "avalista_score": null,
    "probabilidade_inadimplencia_avalista": null,
    "avalista_data_nascimento": null,
    "nascimento": datetime,
    "id": int,
    "contrato": null,
    "produtor_id": int,
    "observacoes": null,
    "status_financeiro": string,
    "status_cobranca": null,
    "status_juridico": null,
    "valor_entrada_sem_juros": double,
    "valor_parcela_sem_juros": double,
    "utm_source": string,
    "utm_medium": string,
    "utm_content": string,
    "utm_campaign": string,
    "melhor_dia_pagamento": int,
    "utm_last_source": string,
    "utm_last_medium": string,
    "utm_last_content": string,
    "utm_last_campaign": string,
    "endereco_pais": string,
    "endereco_cep": string,
    "endereco_estado": string,
    "endereco_cidade": string,
    "endereco_bairro": string,
    "endereco_logradouro": string,
    "endereco_numero": string,
    "endereco_complemento": string
}
```

### Configuração do webhook[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/vendas#configuracao-do-webhook)

A configuração do webhook deve ser realizada no detalhe do produto ou no menu Integrações, seguindo um dos caminhos abaixo:

1. Clicando no menu PRODUTOS ➡ Mais Opções do produto ➡ Integrações ➡ Webhook **Vendas**.
    
2. Clicando no menu PRODUTOS ➡ Integrações, seleciona o produto ➡ Webhook **Vendas**.
    

É necessário preencher os campos solicitados na configuração do Webhook, são eles:

- **URL:** O campo deve ser preenchido com a URL de destisno fornecida pelo produtor (endpoint).
    
- **Chave:** - Caso tenha
    
    O campo deve ser preenchido com o nome da chave de cabeçalho do endpoint, caso houver uma autenticação por token.
    
- **Valor:** - Caso tenha
    
    O campo deve ser preenchido com o token/segredo do endpoint, caso houver uma autenticação por token.
    
- **Status:** O campo dever selecionado para ativar a integração.
    

**É possivel cadastrar até 3 urls diferentes para configuração do webhook de VENDAS**

### Tela de Configuração:[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/vendas#tela-de-configuracao)

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252Fht2VG4VGbvw28tim93y6%252Ftela_config_web_vendas.PNG%3Falt%3Dmedia%26token%3D6fa0ba2b-c429-4372-b0ed-5b743bda7ab8&width=768&dpr=3&quality=100&sign=520cf79b&sv=2)

Os dados acima são fictícios.

### Acompanhando os Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/vendas#acompanhando-os-eventos)

A API de Webhook da TMB - Tem Mais no Boleto oferece a capacidade de acompanhar o log de eventos enviados para o seu endpoint, facilitando a identificação e resolução de problemas.

Cada vez que um evento é acionado, um registro correspondente é gerado no log de eventos. Este registro incluirá detalhes como a data e hora do envio, o status da entrega (sucesso ou erro), e informações específicas sobre o evento notificado.

Abaixo da configuração do webhook, você pode abrir a aba "Histórico de interações" e visualizar esses logs.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FBgCqrrFht1S00mNaD50j%252Ftela_log_web_vendas.PNG%3Falt%3Dmedia%26token%3Df47bcf78-d0c8-4ee0-ae23-0723baec3a03&width=768&dpr=3&quality=100&sign=f4be1cd&sv=2)

Os dados acima são fictícios.

No detalhe do evento, representado pelos três pontos, oferecemos a funcionalidade de reenvio do evento, permitindo-lhe assegurar a entrega com facilidade. Além disso, você tem a opção de acessar detalhes mais aprofundados, incluindo o payload enviado e o conteúdo recebido como retorno.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252F7asv7Rsh8NEnHixyVcsk%252Ftela_log_detalhes_web_vendas.PNG%3Falt%3Dmedia%26token%3D474c51dd-7e4f-4149-9057-335ccfcf0974&width=768&dpr=3&quality=100&sign=bd4dbbe3&sv=2)

Os dados acima são fictícios.

Com a introdução de novos produtos e funcionalidades no sistema da TMB, é possível que novos atributos sejam incluídos no Webhook. Certifique-se de que seu código esteja preparado para não gerar exceções caso a TMB devolva novos atributos não tratados pela sua aplicação, pois isso poderá causar interrupção na fila de sincronização.

Recomendamos que monitore periodicamente o log de eventos para garantir que todas as notificações estejam sendo processadas conforme esperado. Em caso de eventos com status de erro, verifique os detalhes fornecidos no log para solucionar qualquer problema relacionado à entrega.

# Financeiro

Webhook

Um webhook é um recurso que permite que você receba notificações automáticas em tempo real sempre que um evento específico ocorre em um sistema. No caso da **API Webhook Financeiro**, ele permite que você seja informado instantaneamente sobre alterações de status financeiro das parcelas.

Ao configurar o webhook, o sistema envia uma notificação para uma URL definida por você sempre que houver uma alteração de STATUS daquele pedido. Isso elimina a necessidade de verificar manualmente as atualizações, pois você recebe as informações em tempo real. Este documento fornece todas as informações necessárias para configurar o webhook e entender quais eventos serão notificados.

### Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/financeiro#eventos)

A TMB - Tem Mais no Boleto notifica os seguintes eventos via Webhook para o campo **"status_pagamento"**:

- **Aguardando pagamento:** Indica que a parcela está aguardando pagamento.
    
- **Recebido:** Indica que a parcela foi paga.
    
- **Vencido:** Indica que a parcela está vencida há mais de 30 dias.
    
- **DELETED:** Indica que a parcela foi deletada devido a uma renegociação ou cancelamento.
    
- **Estornado:** Indica que a parcela foi estornada devido a um cancelamento.
    

### Exemplo de JSON a ser recebido em seu endpoint [POST][](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/financeiro#exemplo-de-json-a-ser-recebido-em-seu-endpoint-post)

A notificação consiste em um POST contendo um JSON, conforme o modelo a seguir:

Payload

Exemplo

Copiar

```
[
    {
        "dados": {
            "pedido_id": int,
            "cliente_documento": string,
            "id_externo": string,
            "produto":string,
            "parcela": int,
            "vencimento_parcela": datetime,
            "data_pagamento": datetime,
            "status_pagamento": string,
            "parcela_id": string,
            "repasse": double,
            "modalidade_contrato": string,
            "cliente": string,
            "cliente_email": string,
            "lancamento_id": int,
            "valor_parcela_sem_juros": double
        }
    }
]
```

As parcelas têm seu status atualizado a cada evento, portanto, é importante tratar os dados adequadamente para evitar duplicações incorretas.

Lembrando que a notificação de parcelas vencidas ocorre apenas após 30 dias do vencimento, quando o cliente é considerado inadimplente. Durante esse período, a cobrança da parcela já está em andamento.

### Configuração do webhook[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/financeiro#configuracao-do-webhook)

A configuração do webhook deve ser realizada no detalhe do produto ou no menu Integrações, seguindo um dos caminhos abaixo:

1. Clicando no menu Produtos > Mais Opções do produto > Integrações > Webhook **Financeiro**.
    
2. Clicando no menu Configurações > Integrações, seleciona o produto > Webhook **Financeiro**.
    

É necessário preencher os campos solicitados na configuração do Webhook, são eles:

- **URL:** O campo deve ser preenchido com a URL de destisno fornecida pelo produtor (endpoint).
    
- **Chave:** - Caso tenha
    
    O campo deve ser preenchido com o nome da chave de cabeçalho do endpoint, caso houver uma autenticação por token.
    
- **Valor:** - Caso tenha
    
    O campo deve ser preenchido com o token/segredo do endpoint, caso houver uma autenticação por token.
    
- **Status:** O campo dever selecionado para ativar a integração.
    

### Tela de Configuração:[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/financeiro#tela-de-configuracao)

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FX9pxIZHuECgCYFGRcHts%252Ftela_config_web_financeiro.PNG%3Falt%3Dmedia%26token%3D168f0723-6057-4c96-a908-1a3fdd497a77&width=768&dpr=3&quality=100&sign=85507949&sv=2)

Os dados acima são fictícios.

### Acompanhando os Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/financeiro#acompanhando-os-eventos)

A API de Webhook da TMB - Tem Mais no Boleto oferece a capacidade de acompanhar o log de eventos enviados para o seu endpoint, facilitando a identificação e resolução de problemas.

Cada vez que um evento é acionado, um registro correspondente é gerado no log de eventos. Este registro incluirá detalhes como a data e hora do envio, o status da entrega (sucesso ou erro), e informações específicas sobre o evento notificado.

Abaixo da configuração do webhook, você pode abrir a aba "Histórico de interações" e visualizar esses logs.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252Fk378T48uyjx6lvBRmOZc%252Ftela_log_web_vendas.PNG%3Falt%3Dmedia%26token%3De1da4f98-6161-4bd5-b0a0-d75f4185f25c&width=768&dpr=3&quality=100&sign=f299adb0&sv=2)

Os dados acima são fictícios.

No detalhe do evento, representado pelos três pontos, oferecemos a funcionalidade de reenvio do evento, permitindo-lhe assegurar a entrega com facilidade. Além disso, você tem a opção de acessar detalhes mais aprofundados, incluindo o payload enviado e o conteúdo recebido como retorno.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252Fods2AG48p5oqpU5XWB36%252Ftela_log_detalhes_web_financeiro.PNG%3Falt%3Dmedia%26token%3D72b18f3b-e560-444b-962e-2344dc8d50c1&width=768&dpr=3&quality=100&sign=e3365d4d&sv=2)

Os dados acima são fictícios.

# Etapas do Checkout

Webhook

Um webhook é um recurso que permite que você receba notificações automáticas em tempo real sempre que um evento específico ocorre em um sistema. No caso da **API Webhook Etapas do Checkou,** permite que você seja informado instantaneamente sobre alterações de status do Checkout.

Ao configurar o webhook, o sistema envia uma notificação para uma URL definida por você sempre que houver uma alteração de STATUS daquele pedido. Isso elimina a necessidade de verificar manualmente as atualizações, pois você recebe as informações em tempo real. Este documento fornece todas as informações necessárias para configurar o webhook e entender quais eventos serão notificados.

### Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/etapas-do-checkout#eventos)

A TMB - Tem Mais no Boleto notifica os seguintes eventos via Webhook para o campo **"status_checkout"**:

- **Seleção das Parcelas:** Etapa em que o cliente deve selecionar a quantidade de parcelas desejada e a melhor data de vencimento.
    
- **Token:** Etapa em que o cliente recebe o código de verificação via WhatsApp e/ou SMS e deve inserir.
    
- **Prova de Vida:** Etapa em que o cliente passa pela validação dos dados, como data de nascimento e nome da mãe.
    
- **Inicio da Documentação:** Etapa com os próximos passos da inscrição.
    
- **Anexo do Documento:** Etapa em que o cliente deve inserir um documento com foto, caso tenha essa etapa configurada.
    
- **Anexo de Selfie:** Etapa em que o cliente deve inserir a selfie, caso tenha essa etapa configurada.
    
- **Anexo do Comprovante de Endereço:** Etapa em que o cliente deve inserir um comprovante de endereço, caso tenha essa etapa configurada.
    
- **Aguardando Assinatura:** Etapa em que o cliente recebe o link do contrato para assinatura digital.
    
- **Aguardando Pagamento:** Etapa em que o cliente recebe o boleto de entrada para realizar o pagamento.
    

### Exemplo de JSON a ser recebido em seu endpoint [POST][](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/etapas-do-checkout#exemplo-de-json-a-ser-recebido-em-seu-endpoint-post)

A notificação consiste em um POST contendo um JSON, conforme o modelo a seguir:

Payload

Exemplo

Copiar

```
{
    "produtor": string,
    "lancamento": string,
    "provedor_negociado": string,
    "pedido": int,
    "status_pedido": string,
    "fase_checkout": string,
    "cliente": string,
    "documento": string,
    "email": string,
    "score": null,
    "probabilidade_inadimplencia": null,
    "endereco_complemento": string,
    "valor_principal": double,
    "parcelas": int,
    "valor_entrada": double,
    "valor_parcela": double,
    "valor_total": double,
    "taxa_administracao": double,
    "criado_em": datetime,
    "data_efetivado": null,
    "vendedor": null,
    "titulo": string,
    "code": string,
    "endereco_completo": string,
    "telefones": string,
    "telefone_ativo": string,
    "lancamento_id": int,
    "id_externo": string,
    "risco_compartilhado_em": datetime,
    "avalista_nome": null,
    "avalista_telefone": null,
    "avalista_email": null,
    "avalista_documento": null,
    "avalista_score": null,
    "probabilidade_inadimplencia_avalista": null,
    "avalista_data_nascimento": null,
    "nascimento": datetime,
    "id": int,
    "contrato": null,
    "produtor_id": int,
    "observacoes": null,
    "status_financeiro": null,
    "status_cobranca": null,
    "status_juridico": null,
    "utm_source": string,
    "utm_medium": string,
    "utm_content": string,
    "utm_campaign": string,
    "melhor_dia_pagamento": int,
    "url_boleto_entrada": string
}
```

### [](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/etapas-do-checkout#undefined-1)

### Configuração do webhook[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/etapas-do-checkout#configuracao-do-webhook)

A configuração do webhook deve ser realizada no detalhe do produto ou no menu Integrações, seguindo um dos caminhos abaixo:

1. Clicando no menu Produtos > Mais Opções do produto > Integrações > Webhook **Etapas do Checkout.**
    
2. Clicando no menu Configurações > Integrações, seleciona o produto > Webhook **Etapas do Checkout**.
    

É necessário preencher os campos solicitados na configuração do Webhook, são eles:

- **Eventos:** O campo deve ser selecionado de acordo com as etapas que deseja receber.
    
- **URL:** O campo deve ser preenchido com a URL de destisno fornecida pelo produtor (endpoint).
    
- **Chave:** - Caso tenha
    
    O campo deve ser preenchido com o nome da chave de cabeçalho do endpoint, caso houver uma autenticação por token.
    
- **Valor:** - Caso tenha
    
    O campo deve ser preenchido com o token/segredo do endpoint, caso houver uma autenticação por token.
    
- **Status:** O campo dever selecionado para ativar a integração.
    

### Tela de Configuração:[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/etapas-do-checkout#tela-de-configuracao)

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FyJeP73Z4ZP5H9GkENx6u%252Ftela_config_web_checkout.PNG%3Falt%3Dmedia%26token%3D6f3d0d3b-7f37-41f7-8d31-ef3aaac7decd&width=768&dpr=3&quality=100&sign=c8f3022b&sv=2)

Os dados acima são fictícios.

### Acompanhando os Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/etapas-do-checkout#acompanhando-os-eventos)

A API de Webhook da TMB - Tem Mais no Boleto oferece a capacidade de acompanhar o log de eventos enviados para o seu endpoint, facilitando a identificação e resolução de problemas.

Cada vez que um evento é acionado, um registro correspondente é gerado no log de eventos. Este registro incluirá detalhes como a data e hora do envio, o status da entrega (sucesso ou erro), e informações específicas sobre o evento notificado.

Abaixo da configuração do webhook, você pode abrir a aba "Histórico de interações" e visualizar esses logs.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252Fk378T48uyjx6lvBRmOZc%252Ftela_log_web_vendas.PNG%3Falt%3Dmedia%26token%3De1da4f98-6161-4bd5-b0a0-d75f4185f25c&width=768&dpr=3&quality=100&sign=f299adb0&sv=2)

Os dados acima são fictícios.

No detalhe do evento, representado pelos três pontos, oferecemos a funcionalidade de reenvio do evento, permitindo-lhe assegurar a entrega com facilidade. Além disso, você tem a opção de acessar detalhes mais aprofundados, incluindo o payload enviado e o conteúdo recebido como retorno.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FJFycz55qSbCBbYdFnCAZ%252FScreenshot_4.png%3Falt%3Dmedia%26token%3D248af304-3d6e-4e3d-9c34-a2ef8cd19419&width=768&dpr=3&quality=100&sign=95e16e9&sv=2)

Os dados acima são fictícios.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FQj0moqawhvE2G0Wp6GYd%252FScreenshot_5.png%3Falt%3Dmedia%26token%3Dee380ff5-4235-45c7-a168-001d998df588&width=768&dpr=3&quality=100&sign=7f61a1aa&sv=2)

Os dados acima são fictícios.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FC0hUIOREmUKvb8SoQaf1%252FScreenshot_6.png%3Falt%3Dmedia%26token%3Df8b4fc3b-fa7b-4040-abd2-d9dc26671df4&width=768&dpr=3&quality=100&sign=4542f925&sv=2)

Os dados acima são fictícios.
# Notazz

A Notazz permite que você receba notificações dos eventos de compra para gerar a Nota Fiscal dentro da ferramenta Notazz. Este documento fornece informações detalhadas sobre como configurar e usar o plug-in, bem como os eventos que você pode esperar receber.

### Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/notazz#eventos)

A TMB - Tem Mais no Boleto notifica os eventos de pedido Efetivado.

- **Efetivado:** Este evento é acionado quando o cliente efetua o pagamento do boleto de entrada.
    

### Exemplo de JSON a ser recebido no endpoint Notazz [POST][](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/notazz#exemplo-de-json-a-ser-recebido-no-endpoint-notazz-post)

A notificação consiste em um POST contendo um JSON, conforme o modelo a seguir:

Payload

Exemplo

Copiar

```
{
    "METHOD": string,
    "DESTINATION_NAME": string,
    "DESTINATION_TAXID": string,
    "DESTINATION_TAXTYPE": string,
    "DESTINATION_STREET": string,
    "DESTINATION_NUMBER": string,
    "DESTINATION_COMPLEMENT": null,
    "DESTINATION_DISTRICT": string,
    "DESTINATION_CITY": string,
    "DESTINATION_UF": string,
    "DESTINATION_ZIPCODE": string,
    "DESTINATION_PHONE": string,
    "DESTINATION_EMAIL": string,
    "DOCUMENT_BASEVALUE": int,
    "DOCUMENT_DESCRIPTION": string
}
```

### Configuração do Plug-In[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/notazz#configuracao-do-plug-in)

A configuração do plug-in deve ser realizada no detalhe do produto ou no menu Integrações, seguindo um dos caminhos abaixo:

1. Clicando no menu Produtos > Mais Opções do produto > Integrações > **Notazz.**
    
2. Clicando no menu Configurações > Integrações, seleciona o produto > **Notazz.**
    

É necessário preencher os campos solicitados na configuração do Webhook, são eles:

- **API KEY:** O campo deve ser preenchido com a API de destino fornecida pelo Notazz.
    
- **Período:**
    
    O campo deve ser selecionado de acordo com o período que deseja receber os eventos.
    
- **Serviço:**
    
    O campo deve ser selecionado de acordo com o serviço de nota fiscal que deseja gerar
    
- **Status:** O campo dever selecionado para ativar a integração.
    

### Tela de Configuração:[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/notazz#tela-de-configuracao)

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252Fg8ceTibnzd1L1MrCVWXm%252Fimagem%2520%2817%29.png%3Falt%3Dmedia%26token%3Db6432388-6c54-4948-9897-3b5adb076d35&width=768&dpr=3&quality=100&sign=c48fe26e&sv=2)

Os dados acima são fictícios.

### Acompanhando os Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/notazz#acompanhando-os-eventos)

A API da TMB - Tem Mais no Boleto oferece a capacidade de acompanhar o log de eventos enviados para o seu endpoint, facilitando a identificação e resolução de problemas.

Cada vez que um evento é acionado, um registro correspondente é gerado no log de eventos. Este registro incluirá detalhes como a data e hora do envio, o status da entrega (sucesso, erro ou agendado), e informações específicas sobre o evento notificado.

O status da entrega como AGENDADO refere-se aos eventos que serão enviados caso a opção PERÍODO seja após o período da garantia.

Abaixo da configuração do plug-in, você pode abrir a aba "Histórico de interações" e visualizar esses logs.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252Fk378T48uyjx6lvBRmOZc%252Ftela_log_web_vendas.PNG%3Falt%3Dmedia%26token%3De1da4f98-6161-4bd5-b0a0-d75f4185f25c&width=768&dpr=3&quality=100&sign=f299adb0&sv=2)

Os dados acima são fictícios.

No detalhe do evento, representado pelos três pontos, oferecemos a funcionalidade de reenvio do evento, permitindo-lhe assegurar a entrega com facilidade. Além disso, você tem a opção de acessar detalhes mais aprofundados, incluindo o payload enviado e o conteúdo recebido como retorno.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FGSaWwxChac9V9NUFABPN%252Ftela_log_detalhes_web_notazz.PNG%3Falt%3Dmedia%26token%3D5643c1ce-c3cb-4933-a8ca-5d57ec2a80aa&width=768&dpr=3&quality=100&sign=9d394aaf&sv=2)

Os dados acima são fictícios.

# Spedy

A SPEDY permite que você receba notificações dos eventos de compra para gerar a Nota Fiscal dentro da ferramenta Spedy. Este documento fornece informações detalhadas sobre como configurar e usar o plug-in, bem como os eventos que você pode esperar receber.

### Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/spedy#eventos)

A TMB - Tem Mais no Boleto notifica os eventos de pedido Efetivado.

- **Efetivado:** Este evento é acionado quando o cliente efetua o pagamento do boleto de entrada.
    

### Exemplo de JSON a ser recebido no endpoint Spedy [POST][](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/spedy#exemplo-de-json-a-ser-recebido-no-endpoint-spedy-post)

A notificação consiste em um POST contendo um JSON, conforme o modelo a seguir:

Payload

Exemplo

Copiar

```
{
    "transactionId": int, //ID do pedido
    "customer": {
        "name": string, //Nome do cliente
        "federalTaxNumber": string, //Documento do cliente
        "email": string, //E-mail do cliente
      //Dados de endereço do cliente:
        "address": {
            "street": string,
            "district": string,
            "postalCode": string,
            "number": string,
            "additionalInformation": null,
            "city": {
                "name": string,
                "state": string
            }
        }
    },
    "amount": double, //valor do ticket
    "date": string, //data de efetivação
    "status": string, //fixo
    "paymentMethod": string, //fixo
    "autoIssueMode": string, //fixo
    "profileType": string, //fixo
    "items": [
        {
            "quantity": int, //fixo
            "price": double, //valor do ticket
            "amount": double, //valor do ticket
            "product": {
                "name": string, //nome do produto
                "code": int, //id do produto
                "price": double //valor do ticket
            }
        }
    ]
}
```

### Configuração do Plug-In[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/spedy#configuracao-do-plug-in)

A configuração do plug-in deve ser realizada no detalhe do produto ou no menu Integrações, seguindo um dos caminhos abaixo:

1. Clicando no menu Produtos > Mais Opções do produto > Integrações > **Spedy.**
    
2. Clicando no menu Configurações > Integrações, seleciona o produto > **Spedy.**
    

É necessário preencher os campos solicitados na configuração do plug-in, são eles:

- **API KEY:** O campo deve ser preenchido com a API de destino fornecida pela Spedy.
    
- **Status:** O campo dever selecionado para ativar a integração.
    

### Tela de Configuração:[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/spedy#tela-de-configuracao)

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FXCqq4lLGoYpzbcmWdIaP%252Fspedy.png%3Falt%3Dmedia%26token%3D0e47d77c-9acf-41cf-a1a0-6ca21e4daa01&width=768&dpr=3&quality=100&sign=cc581a54&sv=2)

### Acompanhando os Eventos[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/spedy#acompanhando-os-eventos)

A API da TMB - Tem Mias no Boleto oferece a capacidade de acompanhar o log de eventos enviados para o seu endpoint, facilitando a identificação e resolução de problemas.

Cada vez que um evento é acionado, um registro correspondente é gerado no log de eventos. Este registro incluirá detalhes como a data e hora do envio, o status da entrega (sucesso ou erro), e informações específicas sobre o evento notificado.

Abaixo da configuração do plug-in, você pode abrir a aba "Histórico de interações" e visualizar esses logs.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252Fk378T48uyjx6lvBRmOZc%252Ftela_log_web_vendas.PNG%3Falt%3Dmedia%26token%3De1da4f98-6161-4bd5-b0a0-d75f4185f25c&width=768&dpr=3&quality=100&sign=f299adb0&sv=2)

Os dados acima são fictícios.

No detalhe do evento, representado pelos três pontos, oferecemos a funcionalidade de reenvio do evento, permitindo-lhe assegurar a entrega com facilidade. Além disso, você tem a opção de acessar detalhes mais aprofundados, incluindo o payload enviado e o conteúdo recebido como retorno.

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FYvuyAaXmMmYcggpQQRF3%252Fspedy1.PNG%3Falt%3Dmedia%26token%3D134fb0f2-d221-4a28-ab68-5b609039ea1b&width=768&dpr=3&quality=100&sign=966e6771&sv=2)

Os dados acima são fictícios.

# TMB API

Esta documentação descreve como utilizar a API REST da TMB para gerenciar produtos e ofertas. A autenticação é realizada via Bearer Token, fornecido por meio de solicitação, após o cadastro do produto e assinatura do contrato.

## Autenticação[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#autenticacao)

Todos os endpoints requerem autenticação Bearer Token:

Copiar

```
Authorization: Bearer {seu_token}
```

### Base URL[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#base-url)

Copiar

```
https://api.tmbeducacao.com.br
```

## Endpoints[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#endpoints)

### Consultar Pedidos Efetivados[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#consultar-pedidos-efetivados)

#### **GET** **api/pedidos**[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#get-api-pedidos)

Retorna a lista paginada de pedidos realizados para um determinado produto, podendo ser filtrada por intervalo de datas.

#### Detalhes dos Filtros[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#detalhes-dos-filtros)

- produto_id
    
    - **Tipo:** `integer`
        
    - **Obrigatoriedade:** Não
        
    - **Descrição:** O ID do Produto.
        
    - **Exemplo:** 123
        
    
- data_inicio
    
    - **Tipo:** `datetime`
        
    - **Obrigatoriedade:** Não
        
    - **Descrição:** Data inicial do filtro.
        
    - **Exemplo:** 2025-05-31
        
    
- data_final
    
    - **Tipo:** `datetime`
        
    - **Obrigatoriedade:** Não
        
    - **Descrição:** Data final do filtro.
        
    - **Exemplo:** 2025-05-31
        
    
- pageNumber
    
    - **Tipo:** `integer`
        
    - **Obrigatoriedade:** Não
        
    - **Descrição:** Número da página (default = 1).
        
    - **Exemplo:** 1
        
    
- pageSize
    
    - **Tipo:** `integer`
        
    - **Obrigatoriedade:** Não
        
    - **Descrição:** Tamanho da página (default = 7).
        
    - **Exemplo:** 7
        
    

**Exemplo de Requisição**

Copiar

```
GET api/pedidos?produto_id=123&pageNumber=1&pageSize=7&data_inicio=2026-03-01&data_final=2026-03-06 HTTPS/1.1
Host: api.tmbeducacao.com.br
Authorization: Bearer {seu_token}
```

**cURL**

Copiar

```
curl -X GET https://api.tmbeducacao.com.br/api/pedidos?produto_id=123&pageNumber=1&pageSize=7&data_inicio=2026-03-01&data_final=2026-03-06 \
-H "Authorization: Bearer {seu_token}
```

#### Exemplo de Retorno[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#exemplo-de-retorno)

Copiar

```
{
"produtor": "Produtor 1",
"lancamento": "Produto Dois",
"pedido_id": 1234,
"status_pedido": "Efetivado",
"cliente": "Fulano de Tal",
"documento": "1234567890",
"email": "fulano@tmbeducacao.com",
"valor_total": 5000,
"parcelas": 3,
"valor_entrada": 1250.0000,
"valor_parcela": 1250.0000,
"taxa_administracao": 5.00,
"criado_em": "2025-04-23T14:32:19.601455-03:00",
"data_efetivado": "2025-04-23T14:32:46.752423",
"endereco_completo": "Rua Platina, 1021 - São Paulo/SP CEP:03308-010 BR",
"telefone": "+5511999999999",
"produto_id": 123,
"nascimento": "1994-01-01T00:00:00",
"produtor_id": 1,
"status_financeiro": "Adimplente",
"utm_source": null,
"utm_medium": null,
"utm_content": null,
"utm_campaign": null,
"melhor_dia_pagamento": 20,
"utm_last_source": null,
"utm_last_medium": null,
"utm_last_content": null,
"utm_last_campaign": null,
"pais": "BR",
"cep": "03308-010",
"endereco_estado": "SP",
"endereco_cidade": "São Paulo",
"endereco_bairro": "Vila Azevedo",
"endereco_logradouro": "Rua Platina",
"endereco_numero": "12345",
"endereco_complemento": null
}
```

### Detalhe de Pedidos Efetivados[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#detalhe-de-pedidos-efetivados)

#### **GET** **api/pedidos/DetalhePedidoEfetivado**[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#get-api-pedidos-detalhepedidoefetivado)

Retorna detalhes completos de um pedido previamente efetivado.

**Exemplo de Requisição**

Copiar

```
GET api/pedidos/DetalhePedidoEfetivado?pedido_id=123 HTTPS/1.1
Host: api.tmbeducacao.com.br
Authorization: Bearer {seu_token}
```

**cURL**

Copiar

```
curl -X GET https://api.tmbeducacao.com.br/api/DetalhePedidoEfetivado?pedido_id=123 \
-H "Authorization: Bearer {seu_token}
```

### Consultar Produtos Cadastrados[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#consultar-produtos-cadastrados)

#### **GET** **api/produtos**[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#get-api-produtos)

Retorna a lista de todos os produtos cadastrados através da plataforma da [TMB](https://produtor.tmbeducacao.com.br/).

**Exemplo de Requisição**

Copiar

```
GET api/produtos HTTPS/1.1
Host: api.tmbeducacao.com.br
Authorization: Bearer {seu_token}
```

**cURL**

Copiar

```
curl -X GET https://api.tmbeducacao.com.br/api/produtos \
-H "Authorization: Bearer {seu_token}
```

**Retorno**

A requisição à API de produtos retornará uma lista com os seguintes atributos para cada produto:

Copiar

```
[
    {
        "produto_id": 1,
        "produto_nome": "Produto 1",
        "descricao": "Descrição 1",
        "valor_total": "R$ 1.000,00",
        "ativo": true
    },
    {
        "produto_id": 2,
        "produto_nome": "Produto 2",
        "descricao": "Descrição 2",
        "valor_total": "R$ 2.000,00",
        "ativo": false
    }
]
```

- `produto_id`: Identificador único do produto.
    
- `produto_nome`: Nome do produto.
    
- `descricao`: Descrição do produto.
    
- `valor_total`: Ticket médio do produto.
    
- `ativo`: Indica se o produto está ativo (`true` ou `false`).
    

### Cadastrar uma Oferta[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#cadastrar-uma-oferta)

**POST** **api/ofertas**

Cadastra uma nova oferta para um produto.

#### Detalhes dos Parâmetros[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#detalhes-dos-parametros)

- **titulo**
    
    - **Tipo:** `string`
        
    - **Obrigatoriedade:** Sim
        
    - **Descrição:** O título da oferta.
        
    - **Exemplo:** `"Promoção Inverno"`
        
    
- **produto_id**
    
    - **Tipo:** `integer`
        
    - **Obrigatoriedade:** Sim
        
    - **Descrição:** Identificador único do produto.
        
    - **Exemplo:** `123`
        
    
- **valor_principal**
    
    - **Tipo:** `float`
        
    - **Obrigatoriedade:** Sim
        
    - **Descrição:** Valor do Ticket.
        
    - **Exemplo:** `299.99`
        
    
- **valor_boleto_entrada**
    
    - **Tipo:** `float`
        
    - **Obrigatoriedade:** Não
        
    - **Descrição:** Valor customizado do boleto de entrada.
        
    - **Exemplo:** `50.00`
        
    
- **vencimento_boleto_entrada**
    
    - **Tipo:** `string`
        
    - **Obrigatoriedade:** Não
        
    - **Descrição:** Data customizado do vencimento do boleto de entrada (formato YYYY-MM-DD).
        
    - **Regra:** A data personalizada do boleto deve ser pelo menos 3 dias após a data atual e no máximo 60 dias a partir da data atual.
        
    - **Exemplo:** `"2025-01-30"`
        
    
- **qtd_parcelas**
    
    - **Tipo:** `string`
        
    - **Obrigatoriedade:** Sim
        
    - **Descrição:** Quantidade de parcelas disponível no financiamento(sujeito a validação de ticket e quantidade de parcelas).
        
    

**Exemplo de Requisição**

Copiar

```
POST api/ofertas HTTP/1.1
Host: api.tmbeducacao.com.br
Authorization: Bearer {seu_token}
Content-Type: application/json

{
  "titulo": "string",
  "produto_id": 0,
  "valor_principal": 0,
  "valor_boleto_entrada": 0,
  "vencimento_boleto_entrada": "2025-01-30",
  "qtd_parcelas": "string"
}
```

**cURL**

Copiar

```
curl -X POST https://api.tmbeducacao.com.br/api/ofertas \
-H "Authorization: Bearer {seu_token}" \
-H "Content-Type: application/json" \
-d '{
  "titulo": "Promoção Inverno",
  "produto_id": 123,
  "valor_principal": 299.99,
  "valor_boleto_entrada": 50.00,
  "vencimento_boleto_entrada": "2025-01-30",
  "qtd_parcelas": "12"
}'
```

**Exemplo de Retorno**

Ao cadastrar uma oferta, o endpoint `/ofertas` retorna uma resposta com o status da operação e o link da oferta recém-criada. A URL pode ser extraída do seguinte campo no payload retornado:

Copiar

```
{
    "status": "Oferta criada com sucesso",
    "url": "https://pay.tmbeducacao.com.br/tmb/ZBP57850W4"
}
```

Use o campo `"url"` para acessar o link da oferta.

### Listar Ofertas[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#listar-ofertas)

**GET** **api/oferta?produto_id={id}**

Retorna a lista de todas as ofertas cadastradas.

**Exemplo de Requisição**

Copiar

```
GET api/oferta?produto_id=123 HTTP/1.1
Host: api.tmbeducacao.com.br
Authorization: Bearer {seu_token}
```

**Exemplo de Retorno**

Copiar

```
[
    {
        "titulo": "Sua Oferta 1",
        "url": "https://pay.tmbeducacao.com.br/infoprodutor/xxx12"
    },
    {
        "titulo": "Sua Oferta 2",
        "url": "https://pay.tmbeducacao.com.br/infoprodutor/xxx13"
    }
  
]
```

---

#### TOKEN DE ACESSO NO PORTAL DO PRODUTOR[](https://info.tmbeducacao.com.br/portal-do-produtor/central-de-ajuda/produto/integracoes/tmb-api#token-de-acesso-no-portal-do-produtor)

> 1. Acesse o portal do produtor ➡ Produtos ➡ TMB API
>     
> 2. Nesta tela você vai encontrar: ✅ **Token de acesso** – com ele, você poderá **revogar**, **gerar um novo token** ou **copiar** sempre que precisar.
>     

![](https://info.tmbeducacao.com.br/portal-do-produtor/~gitbook/image?url=https%3A%2F%2F167782336-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FOBjx2QqKLovDNr4bCq0n%252Fuploads%252FrmLS8RO6PRn3kYZPU3qv%252Fimage.png%3Falt%3Dmedia%26token%3Da43d2595-c9c8-40cb-b39b-88ccdb35e715&width=768&dpr=3&quality=100&sign=876cd1d7&sv=2)