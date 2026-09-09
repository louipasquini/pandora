# Contrato — Campo Personalizado de Pessoa

Base operacional: `/clientes/admin/campos-personalizados` (definição) + `/pessoas/:id/
campos-personalizados` (valores). Espelha exatamente o contrato já existente de
`/crm/admin/campos-lead` + `/crm/leads/:id/campos-personalizados` (spec 008) — mesmo formato
de corpo, mesma semântica de substituição total no `PUT`. Leitura sob `pessoa:ver`; definição
sob `pessoa:gerir_campos_personalizados` (permissão nova); valores sob `pessoa:editar`.

## `GET /clientes/campos-personalizados`

Catálogo de definições **ativas** (`pessoa:ver`).

```json
{
  "itens": [
    { "id": "...", "chave": "anos_experiencia", "rotulo": "Anos de experiência", "tipo": "NUMERO", "opcoes": [], "obrigatorio": false }
  ]
}
```

## `GET /clientes/admin/campos-personalizados?ativo=`

Lista administrativa completa (`pessoa:gerir_campos_personalizados`).

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

## `GET /pessoas/:id/campos-personalizados`

```json
{ "itens": [{ "definicaoId": "...", "chave": "anos_experiencia", "valor": "5" }] }
```

## `PUT /pessoas/:id/campos-personalizados`

Substituição **total** (mesmo contrato do `PUT /crm/leads/:id/campos-personalizados` da 008):

```json
{ "valores": [{ "definicaoId": "...", "valor": "5" }] }
```

Valor validado por `tipo` (mesmo `zod` refinado da 008: `NUMERO` deve parsear, `BOOLEANO`
`"true"|"false"`, `SELECAO` deve estar em `opcoes`, `DATA` ISO 8601). Campo `obrigatorio`
ausente do corpo → 422.

## Uso interno pela porta (spec 013, sem endpoint próprio)

`PortaCampoPersonalizadoPessoa.definirValor(pessoaId, definicaoId, valor)` (injetada em
`crm` via o token `PORTA_CAMPO_PERSONALIZADO_PESSOA` do `core`) chama exatamente o mesmo
`CampoPersonalizadoPessoaService` usado pelo `PUT` acima — **1 valor de cada vez** (não uma
substituição total), usado só pelo fluxo de aceitar uma `SugestaoIa` (contracts/
sugestao-ia.md). Nenhuma rota HTTP nova para isso.

## Erros

Sem token → 401. Sem `pessoa:gerir_campos_personalizados` na definição, ou sem
`pessoa:editar` no `PUT` de valores → 403. `chave` duplicada → 409. Definição/pessoa
inexistente → 404. Valor fora do tipo esperado → 422.
