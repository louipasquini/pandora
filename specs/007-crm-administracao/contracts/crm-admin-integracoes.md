# Contract — Integrações (`/crm/admin/integracoes`)

Leitura → `crm_admin:ver`; escrita → `crm_admin:gerir_integracoes`.

## CONTRATO DE SEGURANÇA (invariável)

Nenhuma resposta, log ou registro de auditoria contém o segredo/chave em claro **nem** o
`segredo_cifrado`/`segredo_hash`. Toda leitura projeta apenas:

```jsonc
{ "segredoDefinido": true,          // segredo_cifrado != null || segredo_hash != null
  "segredoMascarado": "••••••1a2b"  // "••••••" + segredo_ultimos4 ; null se !segredoDefinido
}
```

O valor pleno aparece **exatamente uma vez**: na resposta de `POST` (quando gera API key) e
na de `POST …/rotacionar`. Nunca mais.

---

## `GET /crm/admin/integracoes` — `crm_admin:ver`

Query: `tipo?`, `alvo?`, `ativo?`, `pagina?`, `tamanho?`.
`200` → `{ itens: Integracao[], pagina, tamanho, total }`.

```jsonc
// Integracao (projeção de leitura)
{ "id":"…", "nome":"Webhook Guru PRD", "tipo":"WEBHOOK", "alvo":"EXTERNO",
  "config": { "url":"https://…" },
  "ativo": true, "ultimoUsoEm": null,
  "segredoDefinido": true, "segredoMascarado": "••••••9f3c",
  "criadoEm":"…", "atualizadoEm":"…" }
```

## `GET /crm/admin/integracoes/{id}` — `crm_admin:ver`
`200` → `Integracao`; `404` se não existe.

## `POST /crm/admin/integracoes` — `crm_admin:gerir_integracoes`

```jsonc
{ "nome":"Webhook Guru PRD", "tipo":"WEBHOOK", "alvo":"EXTERNO",
  "config": { "url":"https://…" }, "segredo":"s3cr3t-opcional" }
```

- `tipo = API_KEY` **sem** `segredo` → o sistema gera `crm_` + 40 hex, grava só
  `segredo_hash` + `segredo_ultimos4`. Resposta `201`:
  ```jsonc
  { "integracao": { …projeção… }, "apiKey": "crm_4f…e1", "aviso": "guarde agora — não será exibida de novo" }
  ```
- demais tipos com `segredo` → `cifrar(segredo, CRM_INTEGRACAO_CIFRA_KEY)` → `segredo_cifrado`
  + `segredo_ultimos4`. Resposta `201` → `{ "integracao": { …projeção… } }` (sem valor).
- `CONEXAO_INTERNA` sem `segredo` → `segredoDefinido:false`.
- `422` se `config` contém chave que parece segredo (`token`, `secret`, `apiKey`, `password`
  — checagem defensiva) ou `nome`/`tipo`/`alvo` inválidos.

Auditoria: `entidade:'integracao'`, `campo:'criado'`; se havia segredo, o delta inclui
`{ "segredo":"definido" }` (marcador, **nunca** o valor).

## `PATCH /crm/admin/integracoes/{id}` — `crm_admin:gerir_integracoes`

Parcial: `nome?`, `alvo?`, `config?`, `ativo?`, `segredo?`.
- **sem** `segredo` → segredo atual preservado; delta só dos campos tocados.
- **com** `segredo` → substitui (cifra) e conta como **rotação** para auditoria
  (`campo:'segredo_rotacionado'`, delta `{ "segredo":"rotacionado" }`).
`200` → `Integracao`. No-op (nenhum campo muda) → sem auditoria. `404` se não existe.

## `POST /crm/admin/integracoes/{id}/rotacionar` — `crm_admin:gerir_integracoes`

Sem corpo (ou `{ "segredo": "novo-valor" }` para definir manualmente em vez de gerar).
- `tipo = API_KEY` → gera nova `crm_…`, novo `segredo_hash` + `segredo_ultimos4`, **invalida
  a anterior**. `200` → `{ "integracao": {…}, "apiKey":"crm_…", "aviso":"…" }`.
- `WEBHOOK`/`EXTERNO` → gera/recebe novo segredo, re-cifra. `200` → `{ "integracao": {…} }`
  (sem valor a revelar se foi fornecido pelo chamador; se gerado pelo sistema, revela 1×).
- `CONEXAO_INTERNA` **sem** segredo definido → `409` `{ "erro":"sem_segredo_para_rotacionar" }`.
`404` se não existe.
Auditoria: `campo:'segredo_rotacionado'`, delta `{ "segredo":"rotacionado" }`.

## Regras transversais

- Sem `DELETE` — desativação é `PATCH { ativo:false }`.
- `ultimo_uso_em` **nunca** é escrito nesta spec (reservado 011/019–022/033).
- Nenhuma chamada HTTP externa, validação de token contra o alvo, nem OAuth.
