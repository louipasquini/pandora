# Contract: engine de identidade (`resolverIdentidade` + `resolverOuCriar`)

Duas peças: uma **função pura** no `domain/` (sem I/O, testável sem banco) e um **serviço**
transacional no `application/` que a orquestra e escreve. `resolverOuCriar` é a **porta**
que a spec 018 vai consumir; **não** há endpoint HTTP para ela nesta spec.

## `resolverIdentidade(dados, candidatos)` — puro

```ts
type Criterio = 'documento' | 'cnpj' | 'email' | 'telefone';
type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA';

interface DadosIdentidade { nome?: string; documento?: string; email?: string; telefone?: string }
interface PessoaCandidata {
  id: string; documentos: string[]; cnpjs: string[]; emails: string[]; telefones: string[];
  mergedPara: string | null;
}
interface ResultadoIdentidade {
  pessoaId: string | null;
  criterio: Criterio | null;
  confianca: Confianca | null;
  candidatos: { id: string; criterios: Criterio[] }[];
}
```

**Algoritmo** (ordem **fixa**, versionada):

1. `chaves` = normaliza `dados` (`documento` → CPF|CNPJ por nº de dígitos + DV; `email` →
   `lowercase`+`trim`+forma; `telefone` → E.164). Chave inválida ⇒ ausente (não vira
   critério), registra `motivo` para log de quem chama.
2. Para `criterio` em `['documento','cnpj','email','telefone']`, se `chaves[criterio]`
   existe:
   - `matches` = candidatos cuja lista do critério contém a chave, **resolvendo
     `mergedPara`** até a raiz ativa, _dedupe_ por id.
   - `1` match → `return { pessoaId: match.id, criterio, confianca: CONF[criterio], candidatos: [match…] }`.
   - `≥ 2` matches → **descarta** o critério; acumula em `ambiguos`.
3. Sem retorno → `return { pessoaId: null, criterio: null, confianca: null, candidatos:
   dedupe(ambiguos) }`.

`CONF = { documento:'ALTA', cnpj:'ALTA', email:'MEDIA', telefone:'BAIXA' }`.

**Propriedades garantidas** (SC-001..003):
- Determinística: mesma entrada ⇒ mesma saída, sempre (sem `Date.now`, sem `Math.random`,
  sem ordem de `Set`).
- Sem efeito colateral: não escreve, não loga em banco, não muta `candidatos`.
- Ambiguidade **nunca** resolve: `≥ 2` no critério ⇒ segue; nunca escolhe um.
- Prioridade estrita: um match único em `documento` vence um match único em `telefone`.

## `resolverOuCriar(dados, opts)` — serviço

```ts
interface OpcoesResolver {
  criar: boolean;              // false = venda de afiliada (regra inviolável #8): nunca cria
  origem: { plataformaOrigem: PlataformaOrigem; refs: { tipoRef: string; valorRef: string }[] };
}
interface ResultadoResolverOuCriar {
  pessoaId: string | null;
  criada: boolean;
  candidatos: { id: string; criterios: Criterio[] }[];
  notas: number;               // nº de nota_reconciliacao geradas nesta chamada
}
```

**Passos** (1 transação Prisma):
1. `candidatos` = `pessoaRepository.candidatosPara(chaves)` (≤ 4 `findMany` indexados).
2. `r = resolverIdentidade(dados, candidatos)`.
3. `r.pessoaId != null`:
   a. `upsert` `pessoa_origem_ref` para cada `(origem.plataformaOrigem, tipoRef, valorRef)`
      (idempotente por `@@unique`).
   b. e-mail/telefone de `dados` ≠ primário atual:
      - primário **não `curado`** → rotaciona (novo `primario`, antigo `rebaixadoEm=now`).
      - primário **`curado`** → novo entra **secundário** + `nota_reconciliacao`
        (`origem: resolver_ou_criar`, `motivo: primario_curado`). `notas++`.
   c. `return { pessoaId: r.pessoaId, criada: false, candidatos: r.candidatos, notas }`.
4. `r.pessoaId == null` **e** `opts.criar`:
   - cria `pessoa` + contatos (1º de cada = primário, `curado:false` — veio de origem) +
     documentos + `pessoa_origem_ref`.
   - `return { pessoaId novo, criada: true, candidatos: r.candidatos, notas: 0 }`
     (`candidatos` não-vazio ⇒ havia ambiguidade; caller pode enfileirar merge humano).
5. `r.pessoaId == null` **e** `!opts.criar` → `return { pessoaId: null, criada: false,
   candidatos: r.candidatos, notas: 0 }`.

**Idempotência** (SC-004): repetir a chamada com os mesmos `dados`/`origem` não cria
`pessoa`, não duplica `pessoa_origem_ref` (`@@unique`), não rotaciona (o valor já é o
primário). Duas chamadas concorrentes: a unicidade das chaves normalizadas faz a 2ª
resolver para a `pessoa` da 1ª (colisão de `INSERT` → _retry_ como resolução).

## Consumo cross-context (spec 018)

`ClientesModule` `exports: [ResolverOuCriarService]` + os tipos. A regra ESLint
`import/no-restricted-paths` barra `financeiro` importar `clientes` diretamente — a **018**
decide entre (a) endpoint HTTP interno `POST /pessoas/resolver` (`@AutenticadoBasta`) ou
(b) exceção pontual de zona ESLint para a porta exportada. **Nada disso entra na 005.**

## Invariantes de teste

**Unit (sem banco)** — `resolver-identidade.spec.ts`:

| # | Cenário | Esperado |
|---|---|---|
| 1 | CPF único casa 1 pessoa; e-mail/telefone divergem | `criterio: 'documento'`, `confianca: 'ALTA'` |
| 2 | e-mail casa 2 pessoas; telefone casa 1 (3ª) | descarta e-mail; `criterio: 'telefone'` |
| 3 | documento único (pessoa X) + telefone único (pessoa Y) | resolve **X** (prioridade) |
| 4 | nada casa | `pessoaId: null`, `candidatos: []` |
| 5 | CPF com DV inválido + e-mail válido único | ignora documento; resolve por e-mail |
| 6 | roda 50× a mesma entrada | 50 resultados idênticos |
| 7 | chave casa pessoa `mergedPara: Z` | resolve **Z** (raiz ativa) |
| 8 | e-mail ambíguo, telefone ambíguo, nada mais | `pessoaId: null`, `candidatos` = todos, com `criterios` preenchido |

**e2e (Postgres real)** — `resolverOuCriar`:

| # | Cenário | Esperado |
|---|---|---|
| 9 | sem match, `criar:true` | cria `pessoa`; `pessoa_origem_ref` gravada; `criada:true` |
| 10 | mesmo documento, e-mail novo, primário não curado | mesma `pessoa`; e-mail novo primário; antigo `rebaixadoEm` |
| 11 | idem 10 mas primário `curado` | e-mail novo **secundário**; 1 `nota_reconciliacao`; `notas:1` |
| 12 | repetir 9 idêntico | no-op: 0 `pessoa` nova, 0 ref nova, 0 rotação |
| 13 | sem match, `criar:false` (afiliada) | `pessoaId: null`, `criada:false`, 0 escrita |
| 14 | e-mail ambíguo (2 pessoas), `criar:true` | cria `pessoa` nova; `candidatos.length === 2` |
