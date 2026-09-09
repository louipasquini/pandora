# Contrato — Sugestão de IA

Base operacional: `/crm/atendimentos/:id/sugestoes`. Toda rota exige que `:id` esteja no
escopo de visão do sujeito (`AtendimentoConsultaService.exigirNoEscopo`, mesmo padrão da
012). Gerar/decidir/avaliar exige `atendimento:atender` (mesma permissão já usada para
responder/assumir); aceitar uma sugestão `CAMPO_PERSONALIZADO` exige **também**, dinamicamente
(verificado no serviço, não só por decorator — a âncora do atendimento decide qual), `lead:
editar` ou `pessoa:editar` conforme o atendimento seja de um `lead` ou de uma `pessoa`.

## `POST /crm/atendimentos/:id/sugestoes`

```json
{ "interacaoId": "..." }
```

`interacaoId` deve ser uma `Interacao` **de entrada** (`direcao=ENTRADA`) pertencente a este
atendimento — senão 422. Chama `SugestaoIaClient` uma vez; D-05: qualquer `SugestaoIa`
`PENDENTE` já existente para a mesma `interacaoId` vira `SUBSTITUIDA` antes de inserir as
novas. Falha do provedor (rede, timeout, resposta não interpretável) → **200 com lista vazia**
(nunca 5xx que travaria a UI — FR-014), com um `aviso` textual.

```json
{
  "itens": [
    {
      "id": "...",
      "tipo": "RESPOSTA",
      "perguntaDetectada": "Posso parcelar em quantas vezes?",
      "faqItemId": "...",
      "conteudoSugerido": "Em até 12x no cartão.",
      "status": "PENDENTE"
    },
    {
      "id": "...",
      "tipo": "CAMPO_PERSONALIZADO",
      "campoPersonalizadoLeadId": "...",
      "campoPersonalizadoPessoaId": null,
      "conteudoSugerido": "5 anos",
      "status": "PENDENTE"
    }
  ],
  "aviso": null
}
```

## `GET /crm/atendimentos/:id/sugestoes?interacaoId=`

Lista as sugestões do atendimento (todas, incluindo `SUBSTITUIDA`/decididas — histórico
completo, FR-016); `?interacaoId=` filtra por mensagem de origem.

## `POST /crm/atendimentos/:id/sugestoes/:sugestaoId/aceitar`

```json
{ "conteudoFinal": "Em até 10x no cartão, sem juros." }
```

`conteudoFinal` opcional — se omitido, usa `conteudoSugerido` como decidido. Exige
`status=PENDENTE`, senão 409 (`sugestao_ja_decidida`).

- **`tipo=RESPOSTA`**: só marca `status=ACEITA` + `decididoPorId`/`decididoEm` +
  `conteudoFinal`. **Não envia nada.** O envio de fato é uma chamada separada a
  `POST /crm/atendimentos/:id/responder` — ver abaixo.
- **`tipo=CAMPO_PERSONALIZADO`**: marca `status=ACEITA` **e**, na mesma operação, grava
  `conteudoFinal` no cadastro: `ValorCampoLeadService.definirValor(...)` se o atendimento é
  de um `lead`, ou `PortaCampoPersonalizadoPessoa.definirValor(...)` se é de uma `pessoa`.
  Falta de `lead:editar`/`pessoa:editar` (conforme a âncora) → 403, mesmo com
  `atendimento:atender`.

## `POST /crm/atendimentos/:id/sugestoes/:sugestaoId/rejeitar`

Marca `status=REJEITADA` + `decididoPorId`/`decididoEm`. Sem corpo. Nenhum efeito em nenhum
cadastro nem mensagem, em nenhum dos dois `tipo`. Exige `status=PENDENTE`, senão 409.

## `POST /crm/atendimentos/:id/sugestoes/:sugestaoId/feedback`

```json
{ "util": false }
```

Só depois de decidida (`ACEITA`\|`REJEITADA`) — `PENDENTE`/`SUBSTITUIDA` → 409
(`sugestao_ainda_nao_decidida`). Idempotente (reenviar o mesmo valor não gera erro, apenas
atualiza `utilRegistradoEm`).

## `POST /crm/atendimentos/:id/responder` (spec 012, editado nesta spec)

Corpo ganha um campo novo, opcional:

```json
{ "conteudo": "Em até 10x no cartão, sem juros.", "sugestaoId": "..." }
```

Quando `sugestaoId` presente: deve apontar para uma `SugestaoIa` deste mesmo atendimento com
`status=ACEITA` e `tipo=RESPOSTA` — senão 409 (`sugestao_invalida_para_resposta`). Nesse
caso, `viaIa` é forçado para `true` (independente do valor enviado) e a
`RespostaAtendimento` criada grava `sugestaoIaId`. Sem `sugestaoId`, comportamento idêntico
ao já existente na 012 (resposta manual, `viaIa` conforme enviado, default `false`).

## Erros

Sem token → 401. Sem `atendimento:atender` → 403. Sem `lead:editar`/`pessoa:editar` ao
aceitar campo personalizado → 403. Atendimento/sugestão fora de escopo ou inexistente → 404.
`interacaoId` inválido (não é de entrada, não pertence ao atendimento) → 422. Decidir uma
sugestão já decidida, avaliar utilidade antes de decidir, ou `sugestaoId` inválido no
`responder` → 409.
