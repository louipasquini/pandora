# Contrato — Campos personalizados e métricas

## `POST /crm/admin/campos-oportunidade`

Guard: `crm_admin:gerir_pipelines`. Body: `{ chave, rotulo, tipo: TEXTO|NUMERO|BOOLEANO|DATA|SELECAO, opcoes?, obrigatorio? }`.
`tipo: SELECAO` sem `opcoes` (≥1 item) → 422. `chave` duplicada → 409.

## `GET /crm/admin/campos-oportunidade` / `PATCH /crm/admin/campos-oportunidade/{id}`

Mesmo guard. `PATCH` não aceita mudar `chave` nem `tipo` (imutáveis após criação — mesma
regra da 008); `ativo=false` desativa sem apagar valores já gravados.

## `PUT /crm/oportunidades/{id}/campos-personalizados`

Guard: `oportunidade:editar` + escopo de visão. Body: `{ valores: { [chave]: valor } }` —
**substituição total** (mesmo contrato da 008: chave omitida remove o valor existente).
Validação por `tipo` (`NUMERO` não numérico, `SELECAO` fora de `opcoes`, `obrigatorio` sem
valor) → 422. Auditado em `crm_pipeline_audit`.

## `GET /crm/pipelines/{id}/metricas`

Guard: mesmo escopo de leitura de oportunidade (`ver_todas`\|`ver_proprias` — `ver_proprias`
agrega só as oportunidades do próprio responsável, FR-022).

Resposta (ver forma completa em `data-model.md` §Estado de leitura):
```json
{
  "porEtapa": [
    { "etapaId": "uuid", "nome": "Diagnóstico", "tipo": "ABERTA", "quantidade": 4,
      "valorEstimado": [{ "valorInt": "20000000", "moeda": "BRL" }],
      "tempoMedioHoras": 18.5 }
  ],
  "taxaConversao": 0.42
}
```

Regras: soma **por moeda** (nunca combina); `tempoMedioHoras` só para etapas `ABERTA`
(`null` se nenhuma oportunidade nela); `taxaConversao = ganhas / (ganhas + perdidas)`,
`null` se denominador `0`. Sempre recalculado — nenhum contador persistido (Princípio V).
Pipeline sem nenhuma oportunidade → `porEtapa` com todas as etapas zeradas,
`taxaConversao: null`.
