# Contrato — Mutabilidade de interação (CL-05)

## `PATCH /crm/interacoes/{id}`

Guard: `@RequerPermissao('interacao:registrar')` no endpoint; a regra fina roda **no
serviço** via `podeEditar(interacao, sujeito)`:

| Condição | Resultado |
| --- | --- |
| `tipo != NOTA` | 405/409 — nunca editável, mesmo com `interacao:gerir` |
| `tipo = NOTA`, `removidoEm != null` | 409 — já removida |
| `tipo = NOTA`, sujeito = `autorId`, tem `interacao:registrar` | permitido |
| `tipo = NOTA`, sujeito ≠ `autorId`, tem `interacao:gerir` | permitido |
| `tipo = NOTA`, sujeito ≠ `autorId`, sem `interacao:gerir` | 403 |

Body: `{ "conteudo": "string" }` (único campo editável). Sucesso: `editadoEm` preenchido,
`1` `crm_interacao_audit` com _delta_ `{ conteudo: [anterior, novo] }`.

## `DELETE /crm/interacoes/{id}`

Mesma matriz de `podeEditar`. Sucesso: `removidoEm` preenchido (_soft-delete_ — a linha
permanece), `1` `crm_interacao_audit`. A timeline padrão (`GET`) exclui notas removidas;
`?incluirRemovidas=true` (sob `interacao:gerir`) as inclui.

## Por que não é permissão só de "dono"

`interacao:gerir` existe para suporte/gestão corrigir ou remover uma nota indevida de outro
atendente sem precisar login compartilhado — auditado com o autor real da ação (quem chamou
o `PATCH`/`DELETE`), não o autor original da nota (que fica preservado no `_delta_` anterior
e no campo `autorId` da linha, que **não muda**).
