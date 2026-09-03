# Phase 0 — Research: pessoa e conta — identidade, dedup e merge (spec 005)

As decisões de **produto** (CL-01 `conta` por completo, CL-02 CRUD manual completo, CL-03
merge reversível em qualquer ordem, CL-04 `CONTEXT_MODULES` = 11) já estão resolvidas com o
dono do produto e registradas em `spec.md §Clarifications`. Este documento registra as
decisões **técnicas** derivadas — nenhuma depende do dono do produto.

## D1 — Validação de CPF/CNPJ e normalização de telefone: à mão, sem dependência

**Decisão**: implementar em `src/clientes/domain/`:
- `documento.ts` — `validarCpf(digitos)` / `validarCnpj(digitos)` (regra de dígito
  verificador, ~40 linhas somadas), `classificarDocumento(bruto) → { tipo, digitos } |
  null` (11 dígitos → CPF, 14 → CNPJ, senão `null`).
- `normalizar.ts` — `normalizarEmail`, `normalizarTelefone`, `normalizarDocumento`. Cada
  uma devolve `{ valor } | { descartada: motivo }` — nunca lança.

**Racional**: `cpf-cnpj-validator` (2 deps transitivas) e `libphonenumber-js` (~145 kB) são
desproporcionais para o que a spec precisa: DV de CPF/CNPJ é aritmética fixa; a
normalização de telefone é "tira tudo que não é dígito, prefixa `+55` se vier sem DDI e
tiver 10–11 dígitos, senão descarta". A constituição manda **0 dependência nova sem
justificativa** e o Princípio III quer a borda fina e sob nosso controle. Se um dia a AEN
vender para fora do BR, trocamos `normalizarTelefone` por `libphonenumber` num ponto só.

**Alternativas rejeitadas**:
- `libphonenumber-js`: peso e superfície (metadados de 240 países) para um caso
  majoritariamente BR; a regra de dedup só precisa de uma chave estável, não de formatação
  perfeita.
- `cpf-cnpj-validator`: mesma regra que 40 linhas testáveis, com dep a mais e sem os
  `spec` de borda que queremos escrever.

## D2 — Normalização de e-mail: `lowercase` + `trim`, sem heurística por provedor

**Decisão**: `normalizarEmail(bruto)` = `bruto.trim().toLowerCase()` + validação de forma
mínima (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). **Não** remove `+tag`, **não** colapsa pontos do
_local part_, **não** trata Gmail de forma especial. `a+x@gmail.com` ≠ `a@gmail.com`.

**Racional**: a regra inviolável #10 diz "e-mail **normalizado**" sem definir provedor;
remover `+tag`/pontos é uma política de negócio (agressividade de dedup) que o dono do
produto **não** pediu. Fazer isso agora arriscaria fundir pessoas distintas que
compartilham um alias. É reversível: se quiserem, viram uma função `canonizarEmail` mais
agressiva, versionada, aplicada na resolução — sem migração (as colunas guardam o valor
normalizado atual; recomputar é rodar de novo).

## D3 — `resolverIdentidade`: função pura que recebe candidatos, não toca banco

**Decisão**: assinatura
`resolverIdentidade(dados: DadosIdentidade, candidatos: PessoaCandidata[]) →
ResultadoIdentidade`. Quem chama (o `ResolverOuCriarService` ou um teste) já carregou os
candidatos — a engine só aplica a regra. `PessoaCandidata` = `{ id, documentos: string[],
cnpjs: string[], emails: string[], telefones: string[], mergedPara: string | null }` (tudo
já normalizado).

**Algoritmo** (ordem fixa, versionada):
1. Para cada critério em `['documento', 'cnpj', 'email', 'telefone']`:
   - se `dados[criterio]` normaliza para uma chave válida:
     - `matches` = candidatos cuja lista do critério contém a chave (seguindo `mergedPara`
       → a sobrevivente; _dedupe_ por id resolvido).
     - `matches.length === 1` → `return { pessoaId, criterio, confianca: CONF[criterio],
       candidatos: matches }`.
     - `matches.length >= 2` → **descarta o critério** (segue o loop), acumula em
       `ambiguos`.
2. Fim do loop sem retorno → `return { pessoaId: null, criterio: null, confianca: null,
   candidatos: [...ambiguos e matches fracos, dedupe] }`.

`CONF = { documento: 'ALTA', cnpj: 'ALTA', email: 'MEDIA', telefone: 'BAIXA' }` — rótulo
ordinal (D8).

**Racional**: pureza = testabilidade sem banco (SC-001/SC-009) e determinismo (SC-001). A
engine não decide política de I/O (quantos candidatos carregar, em quantas queries) — isso
é do serviço, que a 018 poderá tunar.

## D4 — `resolverOuCriar`: serviço transacional, idempotente, é a porta para a 018

**Decisão**: `ResolverOuCriarService.resolverOuCriar(dados, { criar, origem })`:
1. Normaliza `dados`; monta as chaves de busca.
2. `pessoa.repository.candidatosPara(chaves)` — até 4 `findMany` indexados (documento, cnpj,
   email primário+secundário, telefone primário+secundário), união por id.
3. `resolverIdentidade(dados, candidatos)`.
4. **Resolveu** (`pessoaId != null`):
   - `upsert` de `pessoa_origem_ref` para cada `(origem.plataforma, tipoRef, valorRef)` de
     `dados` (idempotente via `@@unique`).
   - para e-mail/telefone de `dados` diferente do primário atual **e** primário **não
     `curado`**: rotaciona (novo `primario=true`, antigo `primario=false, rebaixadoEm=now`).
   - primário **`curado`** e valor divergente → insere o novo como **secundário** e grava
     `NotaReconciliacao { pessoaId, campo, valorCurado, valorDerivado, motivo:'primario_curado' }`.
5. **Não resolveu** e `criar === true`: cria `pessoa` + contatos + documentos + refs numa
   transação. Sob **ambiguidade** (havia `candidatos` mas nenhum único) cria mesmo assim e
   devolve `candidatos` no resultado (para revisão/merge humano — FR-025).
6. **Não resolveu** e `criar === false` (afiliada — regra inviolável #8): `return
   { pessoaId: null, candidatos, criada: false }`.

**Idempotência**: todas as escritas passam por `@@unique` (`pessoa_origem_ref`,
`pessoa_email.valor`+`pessoaId`, `pessoa_documento` global). Repetir a mesma chamada com os
mesmos `dados`/`origem` não cria nem rotaciona nada (o valor já é o primário).

**Consumo pela 018 (cross-context)**: `ClientesModule` **exporta** `ResolverOuCriarService`
e os tipos. A regra ESLint `import/no-restricted-paths` **barra** `financeiro` importar de
`clientes`. A forma do consumo — (a) endpoint HTTP interno `POST /pessoas/resolver`
`@AutenticadoBasta`, ou (b) uma exceção pontual de zona ESLint para a **porta** exportada —
é decisão **da spec 018**, quando ela existir. A 005 só garante que a porta existe e é
testável. **Não** criamos o endpoint agora (Princípio VIII — superfície mínima; nada o
consome ainda).

## D5 — Merge: `snapshot` JSON + proveniência por linha; reversível em qualquer ordem

**Decisão**: `MergePessoa` (e `MergeConta`) guardam:
- `sobreviventeId`, `absorvidaId`, `autor`, `quando`, `estado ∈ {ativo, desfeito}`,
  `desfeitoPor`/`desfeitoEm` nullable.
- `snapshot Json` — estado **pré-merge das duas** entidades: para `pessoa`, as listas de
  e-mails/telefones (valor, `primario`, `curado`, `rebaixadoEm`), documentos, endereços,
  refs de origem, `contaId`; para `conta`, os `pessoaId` membros + nome/tipo.

Cada linha movível (`pessoa_email`, `pessoa_telefone`, `pessoa_documento`,
`pessoa_endereco`, `pessoa_origem_ref`; e `pessoa.contaId` no caso de `merge_conta`) ganha
`origemMergeId String? @db.Uuid` — setado com o id do merge que a moveu para a
sobrevivente.

**merge** (transação):
1. valida (`absorvida != sobrevivente`; ambas existem; nenhuma `merged`) → 400/404/409.
2. grava `snapshot`.
3. move as linhas da absorvida para `sobreviventeId`, `origemMergeId = <novo id>`;
   e-mails/telefones movidos entram `primario=false` (secundários).
4. `absorvida.mergedPara = sobreviventeId`.
5. `clientes_audit` (`campo='merge'`, delta = ids).

**desfazer** (transação, **qualquer ordem** — CL-03):
1. `merge.estado === 'desfeito'` → 409.
2. recria a absorvida do `snapshot` (mesmo `id`). Se o `id` ainda existe como `merged` para
   este merge → só limpa `mergedPara`. Se foi re-absorvida por outro merge depois → recria
   `mergedPara` apontando para o alvo atual da cadeia + `NotaReconciliacao`.
3. para cada linha com `origemMergeId === mergeId`:
   - se **inalterada** desde o merge (comparar com `snapshot`) → devolve para a absorvida
     (ou remove da sobrevivente conforme o `snapshot`), limpa `origemMergeId`.
   - se **alterada** por curadoria (`curado=true`) ou por merge posterior
     (`origemMergeId != mergeId` agora) → **deixa como está** + `NotaReconciliacao
     { campo, valorAtual, valorSnapshot, motivo:'divergiu_pos_merge' }`.
4. restaura `primario` de e-mail/telefone da sobrevivente ao `snapshot` **se** o primário
   atual não é `curado` e não veio de merge posterior; senão nota.
5. `merge.estado = 'desfeito'`, `desfeitoPor/Em`.
6. `clientes_audit` (`campo='merge_desfeito'`).

**Racional**: proveniência por linha é o que torna "desfazer o merge do meio" possível sem
desmontar os posteriores — reverte-se só o subconjunto marcado. O `snapshot` cobre o que
foi **removido**/rebaixado (não dá para inferir do estado atual). "Valor atual prevalece +
nota" é a tradução do Princípio VII ("curadoria e derivação nunca se sobrescrevem";
"vínculo aplicado nunca é auto-revertido — só alerta") para o caso de reversão manual.

**Alternativa rejeitada**: _event-sourcing_ de `pessoa` (reconstruir por replay). Seria a
solução "correta" mas é enorme para a v1 — a 005 não tem `evento_origem` (spec 006) nem
pipeline (018). `snapshot` + proveniência resolve o requisito com 2 colunas e uma tabela.

## D6 — Auditoria de `clientes`: tabela `clientes_audit` própria, simétrica ao `rbac_audit`

**Decisão**: `ClientesAuditService.registrar(entrada)` usa `montarRegistroAuditoria` do
`core` (spec 002, `origem = AJUSTE_MANUAL`) e insere em `clientes_audit` (`id` UUID v7,
`autor`, `quando`, `entidade ∈ {pessoa, conta}`, `entidadeId`, `campo`, `valorAnterior
Json?`, `valorNovo Json?`, `motivo`, `origem`, `criadoEm`). _Append-only_. Cobre:
criação/edição manual de `pessoa`/`conta`, associar/desassociar `pessoa`↔`conta`, merge,
desfazer. **No-op** (sem delta real) → não grava (mesma regra da 004).

**Racional**: espelha exatamente o `rbac_audit` da 004 — mesma forma canônica, mesma
disciplina _append-only_, mesmo "só delta". Uma tabela `_audit` **por contexto** mantém o
Princípio VI (cada contexto dono do seu rastro) até a spec 053 consolidar o painel. `_audit`
genérica compartilhada seria schema cross-context — o que a constituição evita.

`NotaReconciliacao` é **separada** de `clientes_audit`: auditoria = "quem mudou o quê de
propósito"; nota de reconciliação = "a automação encontrou um conflito com curadoria e
recuou". Semânticas e leitores diferentes (a 027/053 leem a nota; a 053 lê o audit).

## D7 — `conta` não referencia `contrato`; `ClientesModule` não importa `contratos`

**Decisão**: nenhuma tabela desta migração tem FK para `contrato`; `ClientesModule` não
importa `ContratosModule` nem nada de `src/contratos/` (ESLint garante). O teste e2e faz
`grep` do diff por `contrato` e falha se aparecer fora de comentário (SC-012).

**Racional**: regra de negócio inviolável #3 — Contrato é `(pessoa, produto)`, perpétuo,
**imune** a `conta`. A visão (Parte 7, item 1) resolveu isso explicitamente em 2026-09-01:
household **não** muda a granularidade de Contrato. `conta` é agrupamento de CRM/Central.

## D8 — `confianca` é rótulo ordinal, não score numérico

**Decisão**: `type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA'`, derivada do critério que
resolveu (`documento`/`cnpj` → `ALTA`, `email` → `MEDIA`, `telefone` → `BAIXA`).

**Racional**: a spec (Assumptions) e o uso previsto (pipeline decide "resolver vs. mandar
para `REVISAR`") só precisam de um ordinal. Um score calibrado (0–1) exigiria dados de
verdade e validação — é _out of scope_ e viraria número mágico. Se a 018 quiser um limiar,
mapeia o ordinal.

## D9 — Chaves e unicidades no schema

**Decisão**:
- `pessoa_email` / `pessoa_telefone`: `@@unique([pessoaId, valor])` (a mesma pessoa não
  lista o mesmo contato 2×) **e** `@@unique([valor])` parcial? → **não** parcial (Prisma
  não suporta bem); em vez disso `valor` tem `@@unique` global **apenas** enquanto
  `mergedPara IS NULL` — implementado como índice único parcial no SQL da migração
  (`CREATE UNIQUE INDEX ... WHERE merged_para IS NULL` na `pessoa`, e para contatos um
  índice `WHERE pessoa_id IN (pessoas ativas)` é caro — então a unicidade global de contato
  é **checada na aplicação** (`pessoa.repository.donoDoContato(valor)`), retornando 409).
  A unicidade **por pessoa** é no banco.
- `pessoa_documento`: `@@unique([tipo, valor])` **global** no banco (um CPF aponta uma
  pessoa; no merge, o documento da absorvida move e o índice tolera porque a absorvida
  perde as linhas). Colisão em `POST`/`PATCH` → 409.
- `pessoa_origem_ref`: `@@unique([plataformaOrigem, tipoRef, valorRef])` global no banco +
  índice por `plataformaOrigem`.
- `conta`: sem unicidade de nome (households homônimos são plausíveis).

**Racional**: pôr no banco o que o banco faz bem (unicidade determinística por chave
composta) e na aplicação o que exige política (contato "pertence a outra pessoa ativa" →
mensagem apontando a pessoa). Índice único parcial `WHERE merged_para IS NULL` na `pessoa`
evita que duas pessoas ativas colidam por engano em invariantes futuras.

## D10 — Frontend: telas em `src/pessoas/` e `src/contas/`, zero permissão hardcoded

**Decisão**: seguir o padrão da 004 — `nav-items.ts` ganha os itens com `requerPermissao`;
`AppShell` já filtra por `usePermissoesEfetivas()`; rotas novas embrulhadas em
`<RequirePermissao perm="pessoa:ver">` / `"conta:ver"`. `pessoas-api.ts`/`contas-api.ts`
usam o `apiFetch` central (já trata 401 e 403 — nada novo no cliente HTTP). Controles de
escrita renderizam condicionados a `usePodeUsar('pessoa:editar'|'pessoa:merge'|...)`.

**Racional**: a 004 já entregou todo o encanamento de gate de UI. Esta spec só **usa**.

## Resumo das decisões

| # | Decisão | Alternativa rejeitada |
|---|---------|----------------------|
| D1 | DV de CPF/CNPJ + E.164 mínimo à mão em `domain/` | `libphonenumber-js`, `cpf-cnpj-validator` (peso/superfície) |
| D2 | e-mail normalizado = `lowercase`+`trim`, sem heurística de provedor | remover `+tag`/pontos (política não pedida, risco de fusão) |
| D3 | `resolverIdentidade` puro, recebe candidatos | engine que consulta o banco (não testável sem DB) |
| D4 | `resolverOuCriar` serviço idempotente; porta p/ 018; sem endpoint agora | endpoint interno já nesta spec (nada consome) |
| D5 | merge: `snapshot` JSON + `origemMergeId` por linha; reversível em qualquer ordem | event-sourcing de `pessoa` (enorme p/ v1); LIFO (dono recusou) |
| D6 | `clientes_audit` própria (forma canônica do core) + `nota_reconciliacao` separada | `_audit` genérica cross-context |
| D7 | `conta` não referencia `contrato`; sem import de `contratos` | qualquer vínculo `conta`↔`contrato` (viola regra #3) |
| D8 | `confianca` ordinal `ALTA/MEDIA/BAIXA` | score numérico calibrado (out of scope) |
| D9 | unicidade por chave composta no banco; "dono do contato" checado na app | tudo no banco (índice parcial complexo) ou tudo na app (corridas) |
| D10 | telas em `src/pessoas`/`src/contas`, reusa gate de UI da 004 | — |
