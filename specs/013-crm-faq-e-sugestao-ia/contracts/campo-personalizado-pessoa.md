# Contrato — Campo Personalizado de Pessoa

Base operacional: `/clientes/admin/campos-personalizados` (definição) + `/pessoas/:id/
campos-personalizados` (valores). Espelha exatamente o contrato já existente de
`/crm/admin/campos-lead` + `/crm/leads/:id/campos-personalizados` (spec 008) — mesmo
formato de corpo e resposta, mesma semântica de substituição total no `PUT`. Definição
(leitura e escrita) sob `pessoa:gerir_campos_personalizados` (permissão nova, mesmo padrão
de `crm_admin:gerir_campos_lead` — sem catálogo público separado, mesma disciplina da 008);
leitura de valores sob `pessoa:ver`; escrita de valores sob `pessoa:editar`.

## `GET /clientes/admin/campos-personalizados?ativo=`

Lista administrativa (`pessoa:gerir_campos_personalizados`) — todas por padrão,
`?ativo=true|false` filtra.

```json
[
  { "id": "...", "chave": "anos_experiencia", "rotulo": "Anos de experiência", "tipo": "NUMERO", "opcoes": [], "obrigatorio": false, "ativo": true, "criadoEm": "...", "atualizadoEm": "..." }
]
```

## `GET /clientes/admin/campos-personalizados/:id`

Detalhe de uma definição (`pessoa:gerir_campos_personalizados`).

## `POST /clientes/admin/campos-personalizados`

```json
{ "chave": "anos_experiencia", "rotulo": "Anos de experiência", "tipo": "NUMERO", "obrigatorio": false }
```

`chave` única, imutável após criada (mesma disciplina de `CampoPersonalizadoLead`, 008).
`chave` duplicada → 409.

## `PATCH /clientes/admin/campos-personalizados/:id`

```json
{ "rotulo": "...", "ativo": false }
```

`chave`/`tipo` não editáveis depois de criados (mesma disciplina da 008 — evita invalidar
valores já gravados).

## `DELETE /clientes/admin/campos-personalizados/:id`

Só permitido se a definição não tiver nenhum valor gravado (senão 409 — sugestão: `PATCH
{ ativo: false }`). Mesma disciplina de `CampoPersonalizadoLead`.

## `GET /pessoas/:id/campos-personalizados`

Mapa `chave → valor` (`pessoa:ver`):

```json
{ "anos_experiencia": "5" }
```

## `PUT /pessoas/:id/campos-personalizados`

Substituição **total** (mesmo contrato do `PUT /crm/leads/:id/campos-personalizados` da
008, `pessoa:editar`):

```json
{ "anos_experiencia": "5" }
```

Valor validado por `tipo` (mesmo `zod` refinado da 008: `NUMERO` deve parsear, `BOOLEANO`
`"true"|"false"`, `SELECAO` deve estar em `opcoes`, `DATA` `YYYY-MM-DD`). Chave desconhecida
→ 422 (`campo_desconhecido`); campo `obrigatorio` ausente/vazio → 422
(`campo_obrigatorio`); chave de definição ativa ausente do corpo → removida (substituição
total).

## Uso interno pela porta (spec 013, sem endpoint próprio)

`PortaCampoPersonalizadoPessoa.definirValor(pessoaId, definicaoId, valor, autor)` (injetada
em `crm` via o token `PORTA_CAMPO_PERSONALIZADO_PESSOA` do `core`) chama
`ValorCampoPessoaService.definirValor` — **1 valor de cada vez** (não uma substituição
total), usado só pelo fluxo de aceitar uma `SugestaoIa` (contracts/sugestao-ia.md). Nenhuma
rota HTTP nova para isso.

## Erros

Sem token → 401. Sem `pessoa:gerir_campos_personalizados` na definição, ou sem
`pessoa:editar` no `PUT` de valores, ou sem `pessoa:ver` no `GET` de valores → 403. `chave`
duplicada → 409; `DELETE` de definição em uso → 409. Definição/pessoa inexistente → 404.
Valor fora do tipo esperado, ou chave desconhecida/obrigatória ausente → 422.
