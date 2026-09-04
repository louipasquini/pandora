# Contract — Campos personalizados de lead (esquema administrável — CL-03)

Duas superfícies: **definições** (administração) e **valores** (por lead).

## Definições — `/crm/admin/campos-lead`

Vive junto da Administração do CRM (007). Escrita → `@RequerPermissao('crm_admin:gerir_campos_lead')`;
leitura → `@RequerPermissao('crm_admin:ver')` (ou `crm_admin:gerir_campos_lead`).

### `POST /crm/admin/campos-lead`
```jsonc
{ "chave": "nicho", "rotulo": "Nicho de atuação", "tipo": "SELECAO",
  "opcoes": ["esportiva", "clinica", "materno-infantil"], "obrigatorio": false }
```
- `chave` `^[a-z][a-z0-9_]{1,39}$`, única → 409 se repetida.
- `tipo = SELECAO` **exige** `opcoes` não-vazio; qualquer outro tipo com `opcoes` → **422**.
- `201` devolve a definição com `id`, `ativo: true`. Auditoria: **`crm_admin_audit`**.

### `PATCH /crm/admin/campos-lead/:id`
Edita `rotulo`, `obrigatorio`, `ativo`, `opcoes` (só `SELECAO`). **`chave` e `tipo` são
imutáveis** → 422 se enviados. No-op → 0 auditoria.

### `DELETE /crm/admin/campos-lead/:id`
- definição **com** `valor_campo_lead` → **409** `{ "erro": "campo_em_uso",
  "sugestao": "PATCH ativo=false" }`.
- sem uso → `204` (físico). Auditoria: `crm_admin_audit`.

### `GET /crm/admin/campos-lead`
Lista todas (query `ativo`). Sem paginação (dezenas, no máximo).

## Valores — `/crm/leads/:id/campos-personalizados`

### `GET` — `@AutenticadoBasta()` (respeita escopo de visão do lead)
`200`: `{ "nicho": "clinica", "lista_email": "5k-10k" }` (só chaves com valor).

### `PUT` — `@RequerPermissao('lead:editar')` — **substituição total**
Body: `{ [chave]: valor | null }`. Passos:
1. carrega definições **ativas**;
2. chave não é definição ativa → **422** `{ "erro": "campo_desconhecido", "chave": "..." }`;
3. valor incompatível com `tipo` (ou fora de `opcoes`) → **422**
   `{ "erro": "valor_invalido", "chave": "...", "tipo": "NUMERO" }`;
4. definição `obrigatorio` **ativa** ausente do corpo ou com `null` → **422**
   `{ "erro": "campo_obrigatorio", "chave": "..." }`;
5. diff contra o estado atual → `upsert` das mudadas, `delete` das omitidas/`null`;
6. **1** `crm_lead_audit` `motivo="campos_personalizados"`, delta por chave
   (`{ "campos.nicho": ["esportiva", "clinica"] }`); no-op → **0**.

`200`: o mapa final (igual ao `GET`).

### Validação por tipo (resumo — detalhe em `data-model.md`)
| `tipo` | aceita | rejeita → 422 |
|---|---|---|
| `TEXTO` | string não-vazia | `""` só-espaço (equivale a remover) |
| `NUMERO` | `"12.5"`, `"0"`, `"-3"` | `"abc"`, `"NaN"`, `""` |
| `BOOLEANO` | `"true"`, `"false"` | `"1"`, `"sim"` |
| `DATA` | `"2026-09-04"` | `"04/09/2026"`, `"2026-13-40"` |
| `SELECAO` | opção ∈ `opcoes` | qualquer outra |

## Busca por campo personalizado

`GET /crm/leads?campo:nicho=clinica` — junta `valor_campo_lead` (por `chave` da definição) e
filtra; **respeita** o escopo de visão (US2). Combina com `AND` a outros filtros.
