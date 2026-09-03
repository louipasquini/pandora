# 005 — pessoa e conta: identidade canônica, dedup e merge

Primeira **entidade de negócio de um contexto de domínio** do projeto: o `clientes` deixa
de ser um módulo vazio e passa a ser o **dono** de `pessoa` (ex-`Cliente` da v1) e `conta`
(household / empresa). Entrega a **engine de identidade/dedup** que o Financeiro (spec 018,
etapa "resolver pessoa" do pipeline) e o CRM vão consumir.

Spec, plano e contratos: [`specs/005-pessoa-identidade-dedup/`](../specs/005-pessoa-identidade-dedup/).

`CONTEXT_MODULES` segue com **11** — `clientes` já estava na lista (spec 001). 2ª e 3ª
migração de negócio (`20260903141931_clientes` + `20260903142000_clientes_primario_unico`).
**0 dependência nova** (backend e frontend).

---

## Domínio puro (`backend/src/clientes/domain/`, sem banco)

| Arquivo | O quê |
| --- | --- |
| `documento.ts` | DV de CPF/CNPJ à mão (0 dep). `classificarDocumento(bruto)` → `{tipo, digitos}` \| `null` (11 díg → CPF, 14 → CNPJ, DV validado; sequência repetida rejeitada). |
| `normalizar.ts` | `normalizarEmail` (`lowercase`+`trim`, **sem** heurística de provedor — `a+x@` ≠ `a@`), `normalizarTelefone` (E.164; assume `+55` na borda se 10–11 díg sem DDI; fora de 12–13 díg → descartado), `normalizarDocumento`. Cada função → `{valor}` \| `{descartada: motivo}`, **nunca lança**. `normalizarChaves(dados)` separa CPF de CNPJ. |
| `resolver-identidade.ts` | `resolverIdentidade(dados, candidatos)` → `{pessoaId, criterio, confianca, candidatos[]}`. **Pura e determinística**, sem I/O. Ordem fixa **documento → cnpj → email → telefone**; match único resolve (confiança `ALTA`/`ALTA`/`MEDIA`/`BAIXA`); match ≥2 **descarta o critério** (nunca escolhe, nunca funde); esgotado → `pessoaId: null` + candidatos. Segue `mergedPara` até a raiz ativa. |
| `merge-plano.ts` | `planoDeMerge()` (contatos movidos entram secundários) e `planoDeReversao(snapshot, linhas)` — plano de reversão a partir do _snapshot_ + linhas com proveniência deste merge. **`curado` que já existia no snapshot volta normalmente; só `curado` adquirido DEPOIS do merge prevalece e vira `Divergencia`** (Princípio VII). |

Regra de negócio inviolável **#10** (dedup por prioridade, ambiguidade descarta o critério)
vira código canônico aqui — uma regra, um lugar, para Financeiro e CRM.

## Aplicação (`backend/src/clientes/application/`)

- **`ResolverOuCriarService.resolverOuCriar(dados, { criar, origem })`** — a **porta** que a
  spec 018 vai consumir (`ClientesModule` a exporta). Numa transação: carrega candidatos →
  `resolverIdentidade` → se resolveu, faz `upsert` de `pessoa_origem_ref` (idempotente) e
  **rotaciona** e-mail/telefone **não curados** (novo primário, antigo → secundário datado);
  se o primário é **curado** e diverge, o novo entra como **secundário** + `nota_reconciliacao`
  (`motivo: primario_curado`) e o curado permanece. Se não resolveu e `criar:true`, **cria**
  a `pessoa` (mesmo sob ambiguidade — nunca funde os ambíguos; devolve os candidatos). Se
  `criar:false` (venda de afiliada — regra #8) → `pessoaId: null`. Idempotente: repetir a
  mesma chamada não cria/duplica/rotaciona nada.
- **`PessoaService`** — CRUD manual. `POST /pessoas` exige nome + ≥1 âncora
  (e-mail/telefone/documento válidos); o 1º de cada tipo vira primário **`curado`**. `PATCH`
  adiciona/remove contatos e documentos, define primário explícito; **campo tocado vira
  `curado`**. Unicidade de contato/documento entre pessoas ativas → **409 `{pessoaId}`**
  (nunca funde). Remover a última âncora → **400**. **Sem `DELETE`** (exclusão =
  pseudonimização, spec 047). Cada eixo com mudança real → 1 `clientes_audit`; no-op → nada.
- **`ContaService`** — CRUD de `conta`, associar/desassociar `pessoa` (0..1 por pessoa; já
  em outra → 409 `{contaId}`).
- **`MergeService`** — `mergePessoa`/`mergeConta` + `desfazer`. Grava `merge_pessoa` /
  `merge_conta` com `snapshot` (estado pré-merge das **duas** entidades) e marca cada linha
  movida com `origemMergeId` (proveniência). **Desfazer é reversível em qualquer ordem
  (CL-03)**: reverte só as linhas com a proveniência daquele merge, recria a absorvida do
  _snapshot_, e onde uma edição curada / merge posterior divergiu, o valor atual **prevalece**
  + `nota_reconciliacao` (`motivo: divergiu_pos_merge`). Merge inválido → 400 (auto-merge) /
  404 (inexistente) / 409 (já `merged` ou já desfeito).
- **`ClientesAuditService`** — forma canônica `RegistroAuditoria` do core (`origem =
  AJUSTE_MANUAL`), _append-only_ em `clientes_audit`, só **delta real**. Simétrico ao
  `rbac_audit` da 004.
- **`NotaReconciliacaoService`** — `nota_reconciliacao` _append-only_, **separada** da
  auditoria (leitores: 027 / 053).

## Infra (`backend/src/clientes/infra/`)

`PessoaRepository` / `ContaRepository` — acesso Prisma: `candidatosPara(chaves)` (≤4
`findMany` indexados), `donoDoContato`/`donoDoDocumento`, CRUD, `montarSnapshot`, e as
operações de rotação/merge. Sem regra de negócio.

---

## Persistência (Prisma)

| Tabela | Nota |
| --- | --- |
| `pessoa` | PK UUID v7 na app; `tipo` (`FISICA`/`JURIDICA`/`DESCONHECIDO`), `nome`, `conta_id?`, `merged_para?` (auto-relação), **`pseudonimizada_em?`** (reservado spec 047 — sempre `null` aqui). |
| `conta` | `tipo` (`HOUSEHOLD`/`EMPRESA`), `nome`, `merged_para?`. **Não** referencia `contrato` — o Contrato segue `(pessoa, produto)`, imune a `conta` (regra inviolável #3). |
| `pessoa_email` / `pessoa_telefone` | `valor` normalizado, `primario`, **`curado`**, `rebaixado_em?`, `origem_merge_id?`. `@@unique([pessoa_id, valor])` + índice único **parcial** `WHERE primario` (no máx 1 primário/pessoa, no banco). |
| `pessoa_documento` | `tipo` (`CPF`/`CNPJ`), `valor` só-dígitos, `curado`, `origem_merge_id?`. `@@unique([tipo, valor])` global. |
| `pessoa_endereco` | endereço postal; `curado`, `origem_merge_id?`. |
| `pessoa_origem_ref` | `plataforma_origem` (enum 7 do core), `tipo_ref`, `valor_ref`. `@@unique([plataforma_origem, tipo_ref, valor_ref])` — **id de origem nunca é PK** (Princípio I). |
| `merge_pessoa` / `merge_conta` | `sobrevivente_id`, `absorvida_id`, `autor`, `quando`, `snapshot Json`, `estado` (`ATIVO`/`DESFEITO`), `desfeito_por?`/`desfeito_em?`. **Append-only** (só `estado` muda). |
| `nota_reconciliacao` | `entidade`, `entidade_id`, `origem` (`resolver_ou_criar`/`merge_desfeito`), `campo`, `valor_curado?`/`valor_derivado?`, `motivo`. Append-only. |
| `clientes_audit` | forma canônica do core, append-only. Índice `(entidade, entidade_id)`. |

O `test/setup-db.ts` (e o CI) já rodam `prisma migrate deploy` + `prisma db seed` — as
migrações novas entram sozinhas; **não há seed de dados de negócio** (não existe `pessoa`
nem `conta` de sistema).

---

## RBAC (catálogo da 004 estendido)

`backend/src/auth/rbac/catalogo.ts` ganha o recurso `pessoa` (`pessoa:ver`, `pessoa:editar`,
`pessoa:merge`) e `conta` (`conta:ver`, `conta:editar`, `conta:merge`). O `administrador`
de sistema e a credencial de serviço concedem as 6 automaticamente (special-case por id +
`prisma/seed.ts` sincroniza) — **sem migração de dados**.

| Rota | Permissão |
| --- | --- |
| `GET /pessoas`, `GET /pessoas/{id}` | `pessoa:ver` |
| `POST /pessoas`, `PATCH /pessoas/{id}` | `pessoa:editar` |
| `POST /pessoas/{id}/merge`, `.../desfazer` | `pessoa:merge` |
| `GET /contas`, `GET /contas/{id}` | `conta:ver` |
| `POST/PATCH /contas`, `POST/DELETE /contas/{id}/pessoas` | `conta:editar` |
| `POST /contas/{id}/merge`, `.../desfazer` | `conta:merge` |

Nenhuma rota `@Public()` nem `@AutenticadoBasta()`. 401 (sem token) e 403 (autenticado sem
permissão) seguem distintos, com o corpo genérico da 004. `resolverOuCriar` **não** é
endpoint — é serviço; o consumo cross-context pela spec 018 (endpoint interno ou exceção de
zona ESLint) é decisão da 018.

---

## Frontend

Itens de navegação **Pessoas** (`pessoa:ver`) e **Contas** (`conta:ver`) — o `AppShell` já
filtra por `usePermissoesEfetivas()`. Rotas sob `<RequirePermissao>` (sem a permissão →
`SemPermissao`, nunca `/login`). `apiFetch` central já trata 401 e 403 (banner, sem
deslogar) desde a 004 — **nada novo no cliente HTTP**.

- `src/pessoas/` — `PessoasListPage` (busca nome/e-mail/telefone/documento + paginação +
  toggle "incluir unificadas"), `PessoaDetailPage` (contatos com primário destacado,
  secundário datado, badge **curado**; documentos; conta; refs de origem; linha do tempo de
  merges com **Desfazer**; banner de unificação), `PessoaForm` (criar), `MergeDialog`
  (unificar). Controles de escrita só com `pessoa:editar` / `pessoa:merge`.
- `src/contas/` — `ContasListPage`, `ContaDetailPage` (membros + associar/desassociar +
  merges + Desfazer), `ContaForm`. Escrita só com `conta:editar` / `conta:merge`.

---

## Testes

- **Unit backend (sem banco)**: `domain/documento.spec` (DV CPF/CNPJ), `domain/normalizar.spec`,
  `domain/resolver-identidade.spec` (ordem, ambiguidade descarta critério, determinismo N×,
  segue `mergedPara`), `domain/merge-plano.spec` (plano de merge + reversão limpa / com
  divergência / fora de ordem). 240 unit verdes (era 227 na 004).
- **e2e backend (Postgres real)**: `test/clientes.e2e-spec.ts` — CRUD + curado + unicidade +
  âncora; `resolverOuCriar` (cria + refs, rotação, idempotência 3×, curado → secundário +
  nota, afiliada → `null`, ambíguo → cria + candidatos); merge/desfazer encadeado e **fora
  de ordem**, desfazer 2× → 409, curado pós-merge → nota; `conta` CRUD + associação + merge;
  guard 401/403/200; **SC-012** (grep: `src/clientes` não cita `contrato`); regressão 003/004
  verde; `/health` = 11. 86 e2e verdes (era 59 na 004).
- **Frontend**: `pessoas/PessoasListPage.test.tsx`, `contas/ContasListPage.test.tsx` — nav
  condicional, controles de escrita gated, primário/secundário/curado, banner de unificação,
  403 não desloga. 40 verdes (era 31).

---

## Portas

Nenhuma nova. Backend `3001`, frontend `5174`, Postgres dev `55432` (spec 001), reusando
`DATABASE_URL` / `TEST_DATABASE_URL`.
