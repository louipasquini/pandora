# Contract: `/contas`

**Auth**: JWT válido **+** `GET` → `conta:ver`; `POST`/`PATCH`/associar/desassociar →
`conta:editar`; `merge`/`desfazer` → `conta:merge`. Toda escrita grava `clientes_audit`.

> `conta` **não** referencia `contrato`. O Contrato segue `(pessoa, produto)`, perpétuo,
> imune a `conta` (regra de negócio inviolável #3). Nenhuma resposta aqui inclui dado
> financeiro.

## `GET /contas`

**Query**: `q?` (casa `nome`), `pagina?`, `tamanho?` (1–100, default 25),
`incluirUnificadas?` (default `false`).

**200**:
```json
{
  "itens": [
    { "id": "0192...-c1", "nome": "Família Souza", "tipo": "HOUSEHOLD", "totalPessoas": 3, "unificada": false }
  ],
  "pagina": 1, "tamanho": 25, "total": 1
}
```

## `GET /contas/{id}`

**200**:
```json
{
  "id": "0192...-c1",
  "nome": "Família Souza",
  "tipo": "HOUSEHOLD",
  "pessoas": [
    { "id": "0192...-p1", "nome": "Maria Souza" },
    { "id": "0192...-p2", "nome": "João Souza" }
  ],
  "merges": [ { "id": "0192...-mc1", "papel": "sobrevivente", "absorvidaId": "0192...-c9", "quando": "…", "estado": "ativo" } ]
}
```

**200 + `Content-Location`** (conta `merged`): corpo da sobrevivente + `unificacao: { deId,
em, mergeId }`. **404** se o `id` não existe.

## `POST /contas`

**Body**: `{ "tipo": "HOUSEHOLD", "nome": "Família Souza" }`
- `tipo` ∈ `HOUSEHOLD | EMPRESA`; `nome` `trim` não-vazio, ≤ 160.

**201**: corpo do `GET /contas/{id}` (sem pessoas). → `clientes_audit` `conta`/`criado`.

## `PATCH /contas/{id}`

**Body** (opcionais, ≥ 1): `{ "nome": "…", "tipo": "EMPRESA" }`
- `id` inexistente → **404**; `merged` → **409**.
- eixo com mudança → 1 `clientes_audit` `conta`/`editado`; no-op → nenhum.

**200**: corpo do `GET`.

## `POST /contas/{id}/pessoas`

**Body**: `{ "pessoaId": "0192...-p3" }`
- `conta` ou `pessoa` inexistente → **404**.
- `pessoa.contaId` já setado para **outra** `conta` → **409** `{ "message": "pessoa já está
  em outra conta", "contaId": "0192...-c2" }` (desassociar primeiro).
- `pessoa.contaId` já é esta `conta` → **200** idempotente (sem novo audit).
- ok → `pessoa.contaId = id`; `clientes_audit` `pessoa`/`conta_associada` `null` →
  `{ contaId }`.

**200**: corpo do `GET /contas/{id}`.

## `DELETE /contas/{id}/pessoas/{pessoaId}`

- vínculo inexistente (`pessoa.contaId !== id`) → **404**.
- ok → `pessoa.contaId = null`; `clientes_audit` `pessoa`/`conta_desassociada`
  `{ contaId }` → `null`.

**204** sem corpo.

## `POST /contas/{sobreviventeId}/merge`  +  `.../merge/{mergeId}/desfazer`

Mesma mecânica de `merge_pessoa` (ver `pessoas.md`), aplicada a `conta`:
- **merge**: `snapshot` das duas (nome, tipo, `membros: [pessoaId]`); as `pessoa`s da
  absorvida recebem `contaId = sobrevivente` com `origemMergeId = <mergeId>`; `absorvida.
  mergedPara = sobrevivente`; `clientes_audit` `conta`/`merge`.
- **desfazer** (qualquer ordem): recria a `conta` absorvida do `snapshot`; `pessoa`s com
  `origemMergeId === mergeId` **e** ainda em `contaId == sobrevivente` voltam para a
  absorvida; `pessoa`s adicionadas à sobrevivente **depois** do merge ficam; divergência →
  `nota_reconciliacao` (`entidade: conta`). `estado='desfeito'`.

Erros: `absorvida == sobrevivente` → 400; inexistente → 404; já `merged` / já `desfeito` →
409.

## Invariantes de teste (e2e)

| # | Ação | Esperado |
|---|---|---|
| 1 | `POST /contas` + associar 3 pessoas | 201 + 3×200; `GET` mostra 3 membros; 4 `clientes_audit` |
| 2 | associar `pessoa` que já está em outra `conta` | 409 `{ contaId }` |
| 3 | desassociar e re-associar | 204 então 200; `contaId` alterna; audits correspondentes |
| 4 | `merge_conta` C1←C2 (C2 com 2 pessoas) | 200; C1 fica com todas; C2 `mergedPara=C1` |
| 5 | adicionar pessoa a C1 depois do merge, depois desfazer | pessoa nova fica em C1; C2 recriada com só as originais |
| 6 | grep do diff/código por `contrato` no módulo `clientes` | 0 ocorrência efetiva (SC-012) |
| 7 | qualquer rota com `Usuario` sem `conta:*` | 403 |
