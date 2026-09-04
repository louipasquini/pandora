# Contrato — Timeline de interações

## `POST /crm/interacoes`

Guard: `@RequerPermissao('interacao:registrar')`.

Body:
```json
{
  "pessoaId": "uuid | omitido",
  "leadId": "uuid | omitido",
  "tipo": "WHATSAPP|EMAIL|LIGACAO|TICKET|NOTA|NPS",
  "direcao": "ENTRADA|SAIDA | omitido",
  "conteudo": "string",
  "notaNps": "0..10 | omitido",
  "ocorridoEm": "ISO datetime | omitido (default agora)",
  "canalOrigem": "string | omitido",
  "idExterno": "string | omitido"
}
```

Regras (422 se violadas): exatamente um de `pessoaId`/`leadId`; `direcao` obrigatória para
`WHATSAPP|EMAIL|LIGACAO|TICKET`, opcional em `NPS`, proibida em `NOTA`; `notaNps`
obrigatório 0–10 sse `tipo=NPS`. Âncora inexistente → 404.

Resposta `201`: a interação criada, `autorId` = sujeito do JWT (ou `null` se a chamada for
via porta de integração sem usuário — nunca via este endpoint HTTP, que sempre tem sujeito).

## `GET /crm/pessoas/{pessoaId}/interacoes`

Guard: `pessoa:ver`. Confirma que a pessoa existe (404 se não). Retorna a **união** (CL-01):
interações com `pessoaId = :id` **e** interações de todo `lead` com `lead.pessoaId = :id`,
ordenadas por `ocorridoEm desc`, paginadas (`?page=&pageSize=`, `?tipo=`, `?desde=&ate=`).
Notas com `removidoEm` preenchido ficam de fora por padrão.

## `GET /crm/leads/{leadId}/interacoes`

Guard: `@AutenticadoBasta()` — o escopo real é resolvido chamando
`LeadConsultaService.obter(leadId, sujeito)` primeiro (mesma regra 404/403 da spec 008);
só então lista `interacao` com `leadId = :id`. Mesmos filtros/paginação do endpoint de
pessoa.

## `GET /crm/interacoes/{id}`

Aplica a mesma checagem de escopo da âncora da interação (pessoa ou lead) antes de devolver
o corpo; fora do escopo → 404.

## Regra de fronteira (SC-001, SC-003)

- Nenhuma linha de `interacao` é copiada ou re-apontada quando um lead converte — a união é
  sempre resolvida na leitura.
- A timeline da pessoa inclui interações de leads convertidos nela **mesmo que o sujeito não
  tenha `lead:ver_todos`/`lead:ver_proprios`** — a permissão que vale ali é `pessoa:ver`
  (US3 cenário 3). O inverso não vale: acessar o **lead diretamente**
  (`GET /crm/leads/{leadId}/interacoes`) sempre passa pelo escopo de `lead:ver_*`.
