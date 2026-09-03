# Contract: `/pessoas`

**Auth**: JWT válido (guard da 003) **+** permissão (guard da 004):
`GET` → `pessoa:ver`; `POST`/`PATCH` → `pessoa:editar`; `merge`/`desfazer` → `pessoa:merge`.
Sem rota `@Public()` / `@AutenticadoBasta()`. Toda escrita grava `clientes_audit` (só
_delta_ real).

## `GET /pessoas`

**Query**: `q?` (texto — casa `nome`, e-mail primário/secundário, telefone, documento com/
sem máscara), `pagina?` (1+), `tamanho?` (1–100, default 25), `incluirUnificadas?`
(`true|false`, default `false`).

**200**:
```json
{
  "itens": [
    {
      "id": "0192...-p1",
      "nome": "Maria Souza",
      "tipo": "FISICA",
      "emailPrimario": "maria@exemplo.com",
      "telefonePrimario": "+5511999990000",
      "documentos": ["12345678909"],
      "contaId": null,
      "unificada": false
    }
  ],
  "pagina": 1, "tamanho": 25, "total": 1
}
```

- `unificada: true` só aparece se `incluirUnificadas=true`; nesse caso inclui
  `unificadaEm` e `sobreviventeId`.
- Ordenação estável: `nome` asc, `id` asc como desempate.

## `GET /pessoas/{id}`

**200** (pessoa ativa):
```json
{
  "id": "0192...-p1",
  "nome": "Maria Souza",
  "tipo": "FISICA",
  "pseudonimizadaEm": null,
  "conta": { "id": "0192...-c1", "nome": "Família Souza", "tipo": "HOUSEHOLD" },
  "emails": [
    { "valor": "maria@exemplo.com", "primario": true,  "curado": true,  "rebaixadoEm": null },
    { "valor": "maria.antiga@exemplo.com", "primario": false, "curado": false, "rebaixadoEm": "2026-08-01T12:00:00Z" }
  ],
  "telefones": [ { "valor": "+5511999990000", "primario": true, "curado": false, "rebaixadoEm": null } ],
  "documentos": [ { "tipo": "CPF", "valor": "12345678909", "curado": false } ],
  "enderecos": [ { "logradouro": "Rua A", "numero": "10", "cidade": "São Paulo", "uf": "SP", "cep": "01000000", "pais": "BR", "curado": false } ],
  "origemRefs": [ { "plataformaOrigem": "GURU_PRD", "tipoRef": "guru_customer_id", "valorRef": "cus_123" } ],
  "merges": [
    { "id": "0192...-m1", "papel": "sobrevivente", "absorvidaId": "0192...-p9", "quando": "…", "estado": "ativo", "autor": "svc-…" }
  ]
}
```

**200 + `Content-Location`** (pessoa `merged`): corpo é o da **sobrevivente** + campo
`unificacao: { deId: "<id pedido>", em: "<timestamp>", mergeId: "…" }`. Nunca 404, nunca
dados órfãos.

**404**: `id` não existe (nem como absorvida).

## `POST /pessoas`

**Body** (`dto/pessoa.schema.ts`, zod):
```json
{
  "nome": "Maria Souza",
  "tipo": "FISICA",
  "emails": ["maria@exemplo.com"],
  "telefones": ["11999990000"],
  "documentos": ["123.456.789-09"],
  "enderecos": [ { "logradouro": "Rua A", "numero": "10", "cidade": "São Paulo", "uf": "SP" } ],
  "contaId": null
}
```
- `nome`: `trim` não-vazio, ≤ 160.
- exige **≥ 1** entre `emails[0]` / `telefones[0]` / `documentos[0]` (todos válidos após
  normalização).
- o 1º e-mail/telefone informado é o **primário** (e `curado: true` — foi ato manual).
- `contaId` presente → a `conta` precisa existir (**404** senão) e a `pessoa` entra nela.

**201**: corpo do `GET /pessoas/{id}`. → `clientes_audit` `pessoa`/`criado`, `null` →
`{ nome, tipo, emails, telefones, documentos }`.

**400**: `nome` vazio; nenhum contato/documento; documento com DV inválido; e-mail/telefone
que não normaliza.
**409**: um e-mail/telefone/documento já pertence a outra `pessoa` ativa → `{ "message":
"contato já pertence a outra pessoa", "campo": "email", "pessoaId": "0192...-p2" }`. Nada
persiste, **sem** fundir.

## `PATCH /pessoas/{id}`

**Body** (todos opcionais, ≥ 1 presente):
```json
{
  "nome": "Maria S. Souza",
  "tipo": "FISICA",
  "adicionarEmails": ["novo@exemplo.com"],
  "removerEmails": ["maria.antiga@exemplo.com"],
  "emailPrimario": "novo@exemplo.com",
  "adicionarTelefones": [], "removerTelefones": [], "telefonePrimario": null,
  "adicionarDocumentos": [], "removerDocumentos": ["12345678909"],
  "enderecos": [ /* substitui o conjunto */ ]
}
```
- `id` inexistente → **404**; `id` de pessoa `merged` → **409** (`editar a sobrevivente`).
- todo campo tocado fica `curado: true`.
- `emailPrimario` deve existir (após aplicar `adicionarEmails`) → senão **400**; troca:
  antigo primário → `primario:false`, `rebaixadoEm: now`.
- adicionar contato/documento que já é de outra `pessoa` ativa → **409** (como no `POST`).
- remover o **último** contato **e** documento de uma pessoa → **400** (não deixa `pessoa`
  sem nenhuma âncora de identidade).
- cada eixo com mudança real → 1 `clientes_audit` `pessoa`/`editado` com `campo` do eixo e
  `valorAnterior`/`valorNovo`. No-op → sem registro.

**200**: corpo do `GET /pessoas/{id}`.

## `POST /pessoas/{sobreviventeId}/merge`

**Body**: `{ "absorvidaId": "0192...-p9" }`

- `sobreviventeId == absorvidaId` → **400**.
- qualquer das duas inexistente → **404**.
- qualquer das duas já `merged` → **409**.
- ok (transação):
  - grava `merge_pessoa` (`snapshot` das duas, `estado: ativo`, `autor` = `sub`).
  - e-mails/telefones/documentos/endereços/`origem_refs` da absorvida → `pessoaId =
    sobrevivente`, `origemMergeId = <mergeId>`; e-mails/telefones entram `primario:false`.
  - `absorvida.mergedPara = sobreviventeId`.
  - `clientes_audit` `pessoa`/`merge` (`{ absorvidaId }`).

**200**: corpo do `GET` da sobrevivente (já com a absorvida no array `merges`).

## `POST /pessoas/{sobreviventeId}/merge/{mergeId}/desfazer`

- `mergeId` não é da `sobrevivente` → **404**.
- `merge_pessoa.estado === 'desfeito'` → **409**.
- ok (transação, **qualquer ordem** — CL-03):
  - recria a `absorvida` do `snapshot` (mesmo `id`); se ela foi re-absorvida depois →
    recria `mergedPara` para o alvo atual + `nota_reconciliacao` `divergiu_pos_merge`.
  - linhas com `origemMergeId === mergeId` **inalteradas** → voltam para a absorvida
    (ou saem da sobrevivente conforme `snapshot`); **alteradas** (`curado` ou
    `origemMergeId` mudou) → ficam + `nota_reconciliacao`.
  - `primario` de contato da sobrevivente volta ao `snapshot` se não-`curado` e não mexido
    por merge posterior; senão nota.
  - `merge_pessoa.estado='desfeito'`, `desfeitoPor`/`desfeitoEm`.
  - `clientes_audit` `pessoa`/`merge_desfeito`.

**200**: `{ "sobrevivente": <GET>, "absorvida": <GET>, "notas": 0 }`.

## Invariantes de teste (e2e)

| # | Ação | Esperado |
|---|---|---|
| 1 | `POST /pessoas` válido só com nome + CPF | 201; primário do CPF; 1 `clientes_audit` `criado` |
| 2 | `POST` com CPF `111.111.111-11` (DV inválido) | 400; nada persiste |
| 3 | `POST` com e-mail já de outra pessoa ativa | 409 `{ pessoaId }`; sem fusão |
| 4 | `PATCH` define novo `emailPrimario` | 200; antigo `primario:false`+`rebaixadoEm`; novo `curado:true`; 1 audit |
| 5 | `PATCH` salvando o mesmo nome | 200; 0 `clientes_audit` |
| 6 | `PATCH` removendo a última âncora (todo contato+documento) | 400 |
| 7 | `DELETE /pessoas/{id}` | 404/405 (rota não existe) |
| 8 | `GET` da pessoa absorvida | 200 + corpo da sobrevivente + `unificacao` |
| 9 | merge A→B, merge A→C, desfazer o **de B** | 200; B recriada; merge de C `ativo`; linhas de C intactas |
| 10 | desfazer 2× o mesmo merge | 1º 200, 2º 409 |
| 11 | curar um contato movido, depois desfazer o merge | contato fica; 1 `nota_reconciliacao` `divergiu_pos_merge` |
| 12 | qualquer rota com `Usuario` sem a permissão | 403 (corpo genérico) |
| 13 | qualquer rota sem token | 401 |
