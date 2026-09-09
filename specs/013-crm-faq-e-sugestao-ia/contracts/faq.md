# Contrato — FAQ

Base operacional: `/crm/faq` (leitura ampla) + `/crm/admin/faq` (administração). Catálogo de
leitura `@AutenticadoBasta()` (sem PII, útil pra qualquer atendente durante uma conversa —
mesmo padrão do catálogo de `tag`, spec 009); leitura administrativa (itens inativos +
histórico) sob `crm_admin:ver`; escrita sob `crm_admin:gerir_faq` (permissão nova).

## `GET /crm/faq`

Catálogo de itens **ativos**, para uso do atendente/IA durante uma conversa.

```json
{ "itens": [{ "id": "...", "pergunta": "...", "resposta": "..." }] }
```

## `GET /crm/admin/faq?ativo=`

Lista administrativa — todos os itens por padrão; `?ativo=true|false` filtra.

```json
{
  "itens": [
    {
      "id": "...",
      "pergunta": "...",
      "resposta": "...",
      "ativo": true,
      "criadoEm": "...",
      "atualizadoEm": "..."
    }
  ]
}
```

## `GET /crm/admin/faq/:id/versoes`

Histórico completo, mais recente primeiro.

```json
{
  "itens": [
    { "id": "...", "pergunta": "...", "resposta": "...", "autor": "...", "criadoEm": "..." }
  ]
}
```

## `POST /crm/admin/faq`

```json
{ "pergunta": "Qual o prazo de acesso ao curso?", "resposta": "12 meses a partir da compra." }
```

Cria o item (`ativo: true` por padrão) **e** a 1ª linha de `faq_item_versao`. 201.

## `PATCH /crm/admin/faq/:id`

```json
{ "pergunta": "...", "resposta": "...", "ativo": false }
```

Todos os campos opcionais; `pergunta`/`resposta` só disparam uma nova `faq_item_versao`
quando o valor realmente muda (edição vazia/idêntica não polui o histórico). `ativo` não gera
versão — é um estado do item, não do conteúdo. 404 se o item não existir.

## Erros

- Sem token → 401. Sem `crm_admin:gerir_faq` na escrita, ou sem `crm_admin:ver` na leitura
  administrativa → 403. `pergunta`/`resposta` vazia → 422. Item inexistente → 404.
