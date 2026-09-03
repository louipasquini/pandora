---
description: "Task list — spec 005 pessoa e conta (identidade, dedup, merge)"
---

# Tasks: pessoa e conta — identidade canônica, dedup e merge

**Input**: `specs/005-pessoa-identidade-dedup/` — plan.md, spec.md, research.md,
data-model.md, contracts/, quickstart.md

**Tests**: incluídos — a spec e a constituição exigem (SC-001..013; "testes contra Postgres
real" é disciplina de projeto). Domínio puro = `jest` sem banco; endpoints e
`resolverOuCriar` = `jest` e2e contra Postgres real (schema isolado, `test/setup-db.ts`).

**Organização**: por user story (US1..US6 da spec.md). Cada story é um incremento
testável de forma independente.

## Path Conventions

Monorepo web: `backend/src/`, `backend/test/`, `frontend/src/`. `clientes` adota
`domain/` (puro) · `application/` (serviços) · `infra/` (Prisma).

---

## Phase 1: Setup (infra compartilhada)

**Purpose**: schema, migração e esqueleto do módulo.

- [x] T001 Adicionar os models Prisma em `backend/prisma/schema.prisma`: `Pessoa`, `Conta`,
  `PessoaEmail`, `PessoaTelefone`, `PessoaDocumento`, `PessoaEndereco`, `PessoaOrigemRef`,
  `MergePessoa`, `MergeConta`, `NotaReconciliacao`, `ClientesAudit` + enums (`PessoaTipo`,
  `ContaTipo`, `DocumentoTipo`, `MergeEstado`, `NotaOrigem`) conforme `data-model.md` — PK
  `id String @id @db.Uuid`, `@db.Timestamptz(6)`, `@map` snake_case, `origemMergeId String?
  @db.Uuid` nas linhas movíveis, `curado Boolean @default(false)`.
- [x] T002 Gerar a migração: `npm run prisma:migrate:dev --workspace backend` →
  `backend/prisma/migrations/<ts>_clientes/migration.sql`. Adicionar à mão no SQL o índice
  único parcial `CREATE UNIQUE INDEX pessoa_ativa_id ON pessoa (id) WHERE merged_para IS
  NULL` e os `@@unique` (`pessoa_origem_ref (plataforma_origem, tipo_ref, valor_ref)`,
  `pessoa_documento (tipo, valor)`, `pessoa_email (pessoa_id, valor)`, `pessoa_telefone
  (pessoa_id, valor)`) + índices por `pessoa_id`, `conta_id`, `plataforma_origem`,
  `(entidade, entidade_id)` no audit/nota.
- [x] T003 [P] Criar barrels/pastas do contexto: `backend/src/clientes/domain/index.ts`,
  `backend/src/clientes/application/index.ts`, `backend/src/clientes/infra/index.ts` (só
  re-exports; preenchidos ao longo das fases).

---

## Phase 2: Foundational (pré-requisito bloqueante)

**Purpose**: catálogo RBAC, wiring do módulo, tipos e serviços transversais que TODAS as
stories usam. ⚠️ Nenhuma story começa antes disto.

- [x] T004 Estender o catálogo RBAC em `backend/src/auth/rbac/catalogo.ts`: adicionar
  `pessoa:{ver,editar,merge}` e `conta:{ver,editar,merge}` ao array `PERMISSOES` (rótulos
  de `contracts/rbac-catalogo.md`), mantendo a ordem e o `satisfies`.
- [x] T005 [P] Atualizar `backend/src/auth/rbac/catalogo.spec.ts`: asserção de que as 6
  novas permissões existem, ids únicos, `recurso` = prefixo do id.
- [x] T006 [P] `backend/src/clientes/domain/tipos.ts` — `Criterio`, `Confianca`,
  `DadosIdentidade`, `PessoaCandidata`, `ResultadoIdentidade`, `SnapshotPessoa`,
  `SnapshotConta`, `PlanoMerge`, `PlanoReversao` conforme `data-model.md`.
- [x] T007 `backend/src/clientes/application/clientes-audit.service.ts` —
  `registrar(entrada)` via `montarRegistroAuditoria` do core (`origem = AJUSTE_MANUAL`,
  `agoraUtc()`), `INSERT` append-only em `clientes_audit`; no-op (delta `null`) não grava.
  Espelha `RbacAuditService`.
- [x] T008 `backend/src/clientes/clientes.module.ts` — reescrever: `imports: [PrismaModule]`
  (+ `AuthModule` se preciso p/ tipos), `providers`/`controllers` (adicionados nas fases),
  `exports: [ResolverOuCriarService]` (porta p/ a 018). `OnModuleInit` loga
  `clientes.ready`. **Não** importa `contratos`/`financeiro`/`crm`.
- [x] T009 [P] `backend/src/clientes/infra/pessoa.repository.ts` (esqueleto) e
  `backend/src/clientes/infra/conta.repository.ts` (esqueleto) — `constructor(prisma)`,
  métodos declarados vazios (implementados por fase).
- [x] T010 [P] `backend/test/support/clientes.ts` — helpers e2e: `criarPessoaViaApi`,
  `criarContaViaApi`, `semearPessoa({ nome, cpf?, email?, telefone? })` (insert direto),
  `tokenSemPermissao()` (reusa `issueUserToken` da 004).

**Checkpoint**: `npm run typecheck --workspace backend` verde; app sobe (`RbacRouteAudit`
não aborta — catálogo tem `pessoa:*`/`conta:*`); `/health` ainda 11 contextos.

---

## Phase 3: User Story 1 — engine `resolverIdentidade` por prioridade, descarta ambíguo (P1) 🎯 MVP

**Goal**: função pura que aplica documento → cnpj → email → telefone; match único resolve;
match múltiplo descarta o critério; nada → `null` + candidatos. Determinística, sem I/O.

**Independent Test**: fixtures em memória; ver `contracts/engine-identidade.md` §Unit.

- [x] T011 [P] [US1] `backend/src/clientes/domain/documento.ts` — `validarCpf(digitos)`,
  `validarCnpj(digitos)` (dígito verificador), `classificarDocumento(bruto) → { tipo,
  digitos } | null` (11→CPF, 14→CNPJ, DV; senão `null`).
- [x] T012 [P] [US1] `backend/src/clientes/domain/documento.spec.ts` — CPF/CNPJ válidos,
  DV inválido, sequências repetidas (`111...`), com máscara, tamanhos errados.
- [x] T013 [P] [US1] `backend/src/clientes/domain/normalizar.ts` — `normalizarEmail`
  (`lowercase`+`trim`+forma; **sem** heurística de provedor), `normalizarTelefone` (só
  dígitos; `+55` se 10–11 díg sem DDI; senão descarta), `normalizarDocumento` (usa
  `documento.ts`). Cada uma → `{ valor } | { descartada: motivo }`, nunca lança.
- [x] T014 [P] [US1] `backend/src/clientes/domain/normalizar.spec.ts` — e-mail
  (case/trim/`+tag` mantido/malformado), telefone (com/sem DDI, formatado, lixo→descartada),
  documento (delega, máscara).
- [x] T015 [US1] `backend/src/clientes/domain/resolver-identidade.ts` —
  `resolverIdentidade(dados, candidatos)`: normaliza chaves, loop na ordem fixa, resolve
  `mergedPara` até raiz, match único → retorna com `confianca` de `CONF`, match ≥2 →
  descarta + acumula `ambiguos`, fim → `null` + `candidatos` dedupe. Pura.
- [x] T016 [US1] `backend/src/clientes/domain/resolver-identidade.spec.ts` — os 8 casos de
  `contracts/engine-identidade.md` §Unit (prioridade documento>telefone, e-mail ambíguo cai
  p/ telefone, DV inválido não vira critério, determinismo 50×, segue `mergedPara`,
  ambíguo-total → candidatos com `criterios`).
- [x] T017 [US1] Exportar `resolverIdentidade` + tipos no barrel
  `backend/src/clientes/domain/index.ts`.

**Checkpoint**: `npm test --workspace backend` verde para `domain/` — engine entregável e
testável sem banco (SC-001..003, SC-009).

---

## Phase 4: User Story 2 — `resolverOuCriar` cria/rotaciona, idempotente (P1)

**Goal**: serviço transacional sobre a engine — anexa refs, rotaciona contato não curado
(curado em conflito → secundário + nota), cria `pessoa` se não resolveu, `criar:false` →
`null`. Idempotente. É a porta que a 018 consome.

**Independent Test**: `contracts/engine-identidade.md` §e2e (casos 9–14).

- [x] T018 [US2] `backend/src/clientes/infra/pessoa.repository.ts` — `candidatosPara(chaves)`
  (≤4 `findMany` indexados por documento/cnpj/email/telefone incluindo secundários; união
  por id; monta `PessoaCandidata`), `upsertOrigemRef`, `rotacionarContato`,
  `inserirSecundario`, `criarPessoaCompleta(dados, origem)` (transação).
- [x] T019 [US2] `backend/src/clientes/application/nota-reconciliacao.service.ts` —
  `registrar({ entidade, entidadeId, origem, campo, valorCurado, valorDerivado, motivo })`
  append-only em `nota_reconciliacao`.
- [x] T020 [US2] `backend/src/clientes/application/resolver-ou-criar.service.ts` —
  `resolverOuCriar(dados, { criar, origem })` conforme `contracts/engine-identidade.md`
  §serviço (passos 1–5), 1 transação Prisma, retorna `{ pessoaId, criada, candidatos,
  notas }`. Registrado no `ClientesModule` e **exportado**.
- [x] T021 [US2] `backend/test/clientes.e2e-spec.ts` (bloco `resolverOuCriar`) — casos 9–14:
  cria + ref; rotaciona; idempotente 3×; primário curado → secundário + 1 nota; `criar:false`
  sem match → `null` 0 escrita; e-mail ambíguo `criar:true` → pessoa nova + 2 candidatos.
- [x] T022 [US2] Teste de concorrência: duas chamadas `resolverOuCriar` paralelas com o
  mesmo documento → 1 `pessoa`, sem `pessoa_origem_ref` duplicada (colisão de `@@unique`
  vira resolução).

**Checkpoint**: pipeline da 018 tem a porta pronta; SC-004 (idempotência) e SC-005 (curado
não sobrescrito + nota) verdes.

---

## Phase 5: User Story 3 — CRUD manual de `pessoa`, curadoria não sobrescrita (P2)

**Goal**: `POST`/`PATCH /pessoas` (nome, tipo, contatos, documentos, endereços), campo
tocado vira `curado`, unicidade → 409 sem fundir, sem `DELETE`. `GET` lista + detalhe.

**Independent Test**: `contracts/pessoas.md` — invariantes 1–8, 12, 13.

- [x] T023 [P] [US3] `backend/src/clientes/dto/pessoa.schema.ts` — zod: `criarPessoa`
  (`nome` ≤160, `tipo?`, `emails[]?`, `telefones[]?`, `documentos[]?`, `enderecos[]?`,
  `contaId?`; refine "≥1 âncora"), `patchPessoa` (adicionar/remover*, `emailPrimario?`,
  `telefonePrimario?`, `enderecos?`; refine "≥1 campo"), `mergeBody` (`absorvidaId`).
- [x] T024 [US3] `backend/src/clientes/infra/pessoa.repository.ts` (CRUD) —
  `listar({ q, pagina, tamanho, incluirUnificadas })` (busca casa nome/email primário+sec/
  telefone/documento com e sem máscara; ordenação estável), `detalhe(id)` (resolve
  `mergedPara` até raiz + `unificadaEm`), `donoDoContato(tipo, valor)` → `pessoaId | null`,
  `criar`, `aplicarPatch` (transação; seta `curado`; rebaixa primário antigo com
  `rebaixadoEm`).
- [x] T025 [US3] `backend/src/clientes/application/pessoa.service.ts` —
  `criar(dto, autor)` / `patch(id, dto, autor)`: normaliza+valida (400), checa unicidade de
  contato/documento (409 `{ pessoaId }`), impede remover a última âncora (400), grava
  `clientes_audit` por eixo com delta (no-op → nada), `verPorId` (409 se `merged` no
  `PATCH`; `GET` resolve).
- [x] T026 [US3] `backend/src/clientes/pessoa.controller.ts` — `GET /pessoas`
  (`@RequerPermissao('pessoa:ver')`), `GET /pessoas/:id` (idem; `Content-Location` +
  `unificacao` se `merged`), `POST /pessoas` (`'pessoa:editar'`), `PATCH /pessoas/:id`
  (idem). Zod pipe nos corpos. Registrar no `ClientesModule`.
- [x] T027 [US3] `backend/test/clientes.e2e-spec.ts` (bloco `pessoa CRUD`) — invariantes
  1–8 de `contracts/pessoas.md` (201+audit; 400 DV; 409 contato de outra; PATCH primário →
  curado+delta+rebaixado; no-op → 0 audit; remover última âncora → 400; sem `DELETE`;
  `GET` da absorvida → sobrevivente) + guard 12/13 (403 sem `pessoa:editar`, 401 sem token).

**Checkpoint**: equipe consegue criar e corrigir pessoas pelo backend; SC-006 (unicidade),
SC-010 (401/403) parciais.

---

## Phase 6: User Story 4 — Unificar (merge) `pessoa`, reversível em qualquer ordem (P2)

**Goal**: `POST /pessoas/{id}/merge` + `.../desfazer` — snapshot + proveniência por linha;
desfazer em qualquer ordem; conflito com curadoria/merge posterior → valor atual prevalece
+ `nota_reconciliacao`.

**Independent Test**: `contracts/pessoas.md` — invariantes 9–11.

- [x] T028 [P] [US4] `backend/src/clientes/domain/merge-plano.ts` — puro:
  `planoDeMerge(sobrevivente, absorvida)` → linhas a mover + quais viram secundárias;
  `planoDeReversao(snapshot, estadoAtual, mergeId)` → ações + lista de divergências
  (`campo`, `valorAtual`, `valorSnapshot`, `motivo`).
- [x] T029 [P] [US4] `backend/src/clientes/domain/merge-plano.spec.ts` — plano de merge
  (secundários, proveniência); reversão limpa; reversão com item `curado` depois → mantém +
  divergência; reversão fora de ordem (merge A, merge B, desfaz A) → só linhas de A.
- [x] T030 [US4] `backend/src/clientes/infra/pessoa.repository.ts` (merge) —
  `montarSnapshotPessoa(id)`, `moverLinhas(absorvidaId, sobreviventeId, mergeId)`,
  `marcarMerged(absorvidaId, sobreviventeId)`, `recriarDoSnapshot(snapshot, mergeId)`,
  `reverterLinhas(plano)`, `gravarMergePessoa` / `marcarMergeDesfeito`.
- [x] T031 [US4] `backend/src/clientes/application/merge.service.ts` —
  `mergePessoa(sobreviventeId, absorvidaId, autor)` (valida 400/404/409; transação;
  snapshot; move; `mergedPara`; `clientes_audit` `merge`), `desfazerMergePessoa(mergeId,
  autor)` (409 se desfeito; transação; `planoDeReversao`; recria absorvida; reverte só
  linhas com `origemMergeId===mergeId` inalteradas; divergência → `nota_reconciliacao`;
  `estado='desfeito'`; `clientes_audit` `merge_desfeito`).
- [x] T032 [US4] `backend/src/clientes/pessoa.controller.ts` (+rotas) —
  `POST /pessoas/:id/merge` e `POST /pessoas/:id/merge/:mergeId/desfazer`
  (`@RequerPermissao('pessoa:merge')`).
- [x] T033 [US4] `backend/test/clientes.e2e-spec.ts` (bloco `merge pessoa`) — invariantes
  9–11 + merge inválido (400/404/409), desfazer 2× → 409, `GET` absorvida resolve,
  snapshot presente, 1 `clientes_audit` por ação. Cobre SC-006 (merge encadeado + desfazer
  fora de ordem) e SC-005 (curado antes do desfazer → nota).

**Checkpoint**: SC-005/006 verdes; resíduo de ambiguidade tratável e reversível.

---

## Phase 7: User Story 5 — `conta` (household/empresa): CRUD, membros, merge reversível (P2)

**Goal**: `conta` com CRUD, associação/desassociação (0..1 por `pessoa`), `merge_conta`
reversível. **Não** toca `contrato`.

**Independent Test**: `contracts/contas.md` — invariantes 1–7.

- [x] T034 [P] [US5] `backend/src/clientes/dto/conta.schema.ts` — zod: `criarConta`
  (`tipo` enum, `nome` ≤160), `patchConta` (`nome?`, `tipo?`; ≥1), `associarPessoa`
  (`pessoaId`).
- [x] T035 [US5] `backend/src/clientes/infra/conta.repository.ts` —
  `listar({ q, pagina, tamanho, incluirUnificadas })` (+ `totalPessoas`), `detalhe(id)`
  (membros + merges; resolve `mergedPara`), `criar`, `patch`, `associar(contaId, pessoaId)`
  / `desassociar`, `montarSnapshotConta`, `moverMembros`, `recriarContaDoSnapshot`,
  `gravarMergeConta`/`marcarMergeContaDesfeito`.
- [x] T036 [US5] `backend/src/clientes/application/conta.service.ts` — CRUD + associação
  (409 `{ contaId }` se já em outra; 200 idempotente se mesma; `clientes_audit`
  `conta_associada`/`conta_desassociada`), delega merge/desfazer ao `merge.service`
  (`mergeConta` / `desfazerMergeConta`, mesma mecânica de reversão em qualquer ordem).
- [x] T037 [US5] `backend/src/clientes/conta.controller.ts` — `GET /contas`,
  `GET /contas/:id` (`'conta:ver'`), `POST`/`PATCH /contas/:id`,
  `POST /contas/:id/pessoas`, `DELETE /contas/:id/pessoas/:pessoaId` (`'conta:editar'`),
  `POST /contas/:id/merge` + `.../desfazer` (`'conta:merge'`). Registrar no `ClientesModule`.
- [x] T038 [US5] `backend/test/clientes.e2e-spec.ts` (bloco `conta`) — invariantes 1–7 de
  `contracts/contas.md` (CRUD + associar 3 + 409 já-em-outra + desassociar/re-associar +
  `merge_conta` + adicionar depois do merge + desfazer + 403 sem permissão).
- [x] T039 [US5] Teste SC-012 — `backend/test/clientes.e2e-spec.ts`: assert que
  `grep -R "contrato" backend/src/clientes` (fora de comentário) não retorna nada e que
  `ClientesModule` não importa `ContratosModule`.

**Checkpoint**: `conta` completa; regra inviolável #3 preservada (SC-012).

---

## Phase 8: User Story 6 — Painel: Pessoas e Contas (P3)

**Goal**: navegação + telas de lista/detalhe/edição atrás de `*:ver`/`*:editar`/`*:merge`,
reusando o gate de UI e o `apiFetch` da 004.

**Independent Test**: `contracts/frontend-pessoas-contas.md` — invariantes 1–7.

- [x] T040 [P] [US6] `frontend/src/shell/nav-items.ts` — + `{ label:'Pessoas',
  to:'/pessoas', requerPermissao:'pessoa:ver' }` e `{ label:'Contas', to:'/contas',
  requerPermissao:'conta:ver' }`.
- [x] T041 [P] [US6] `frontend/src/pessoas/pessoas-api.ts` e
  `frontend/src/contas/contas-api.ts` — chamadas `apiFetch` tipadas p/ os contratos.
- [x] T042 [US6] `frontend/src/app/router.tsx` — rotas `pessoas`, `pessoas/:id`, `contas`,
  `contas/:id` dentro do `AppShell`, cada uma sob `<RequirePermissao perm="…">`.
- [x] T043 [P] [US6] `frontend/src/pessoas/PessoasListPage.tsx` — busca (`q`), paginação,
  tabela; toggle "incluir unificadas"; botão **Nova pessoa** só com `usePodeUsar('pessoa:editar')`.
- [x] T044 [P] [US6] `frontend/src/pessoas/PessoaDetailPage.tsx` — identidade, contatos
  (primário destacado, secundário datado, badge **curado**), documentos, endereços,
  `origemRefs`, `conta` (link), linha do tempo de merges com **Desfazer** (`pessoa:merge`);
  pessoa `merged` → banner "unificada" + dados da sobrevivente.
- [x] T045 [P] [US6] `frontend/src/pessoas/PessoaForm.tsx` + `MergeDialog.tsx` — criar/
  editar (validação espelha o zod; 400/409 inline) e diálogo Unificar (`pessoa:merge`).
- [x] T046 [P] [US6] `frontend/src/contas/ContasListPage.tsx`,
  `frontend/src/contas/ContaDetailPage.tsx`, `frontend/src/contas/ContaForm.tsx` — lista,
  detalhe com membros + merges + **Desfazer**, formulário.
- [x] T047 [US6] `frontend/src/test/setup.ts` — `fetch` default responde `/pessoas` e
  `/contas` (lista vazia) além do `/auth/permissoes-efetivas` já existente.
- [x] T048 [P] [US6] Testes `frontend/src/pessoas/*.test.tsx` e `frontend/src/contas/*.test.tsx`
  — invariantes 1–7 de `contracts/frontend-pessoas-contas.md` (nav condicional, `SemPermissao`
  ≠ Login, primário/secundário/curado, 403 → banner + token intacto, `merged` → banner,
  `Desfazer` só com `pessoa:merge`, busca casa e-mail secundário).

**Checkpoint**: SC-011 (401/403 no painel), SC-013 (zero dado hardcoded) verdes.

---

## Phase 9: Polish & cross-cutting

- [x] T049 [P] Rodar a suíte de regressão e2e: `auth.e2e-spec.ts`, `rbac.e2e-spec.ts`,
  `health.e2e-spec.ts`, `context-modules.e2e-spec.ts` (ainda **11**) — verdes sem alteração
  (SC-011 backend).
- [x] T050 [P] Portões estáticos na raiz: `npm run lint`, `npm run typecheck`,
  `npm run build` — verde (`import/no-restricted-paths`: `clientes` só importa `core`/`auth`;
  `no-restricted-syntax`: sem `process.env`).
- [x] T051 [P] Escrever `docs/005-pessoa-identidade-dedup.md` — pessoa/conta, engine +
  normalização, `resolverOuCriar` (porta p/ 018), merge reversível (snapshot + proveniência),
  curadoria vs derivação + `nota_reconciliacao`, tabelas + índices, catálogo RBAC estendido,
  painel. Seguir o formato dos `docs/00X-*.md`.
- [x] T052 Atualizar `CLAUDE.md` — bloco novo em "Stack" para o contexto `clientes`
  (entidades, engine, `resolverOuCriar`, merge, catálogo RBAC +6, 2ª migração) e link do
  doc; confirmar que o bloco `<!-- SPECKIT -->` aponta a 005 (já feito no plan).
- [x] T053 [P] Atualizar `README.md` — nota da 2ª migração de negócio no "Como rodar"
  (nada além de `prisma migrate`), menção a `clientes`/`pessoa`/`conta` no mapa de contextos.
- [x] T054 [P] Atualizar `ROADMAP.md` — marcar `- [x] **005 — pessoa-identidade-dedup**`
  com o resumo do que entrou (data 2026-09-03), no padrão das specs 001–004.
- [x] T055 [P] Atualizar as memórias do agente: `pandora-roadmap-status.md` (005 → concluída;
  próxima = 006 evento-origem-worker) e `MEMORY.md` (linha do índice).
- [x] T056 Rodar `quickstart.md` §6 (fluxo manual) e conferir: menu mostra Pessoas/Contas;
  criar/editar/merge/desfazer; `select * from clientes_audit` = 1 por ação;
  `select * from nota_reconciliacao` conforme o roteiro; `select id from contrato` intocado.
- [x] T057 `netstat`/`docker ps` — confirmar nenhuma porta nova (3001/5174/55432 já do
  projeto); `GET /health` → 11 contextos.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → stories.
- **US1 (P1)** — sem dependência de outra story (domínio puro). MVP.
- **US2 (P1)** — depende de US1 (usa `resolverIdentidade`) e da Phase 2 (repo, audit, nota).
- **US3 (P2)** — depende da Phase 2; independente de US1/US2 no código (compartilha
  `pessoa.repository` e DTOs — T023/T024 podem ir em paralelo com US2 se T018 não colidir).
- **US4 (P2)** — depende de US3 (entidade `pessoa` com CRUD para criar os casos) e de
  `merge-plano` (T028, paralelo a US3).
- **US5 (P2)** — depende da Phase 2; `merge.service` (T031) antes de T036 (conta reusa a
  mecânica). Caso contrário independente de US3/US4.
- **US6 (P3)** — depende dos endpoints de US3/US4/US5 (consumo real), mas T040–T042
  (nav/rotas/api) podem começar cedo com mocks.
- **Phase 9** — depois de todas.

## Parallel Opportunities

- Phase 2: T005, T006, T009, T010 em paralelo (arquivos distintos).
- US1: T011+T012, T013+T014 em paralelo; T015 depois; T016 depois.
- US4: T028+T029 (domínio puro) em paralelo com a implementação de US3.
- US6: T043, T044, T045, T046, T048 em paralelo (componentes distintos).
- Phase 9: T049, T050, T051, T053, T054, T055 em paralelo.

## Implementation Strategy

- **MVP = US1** (engine pura): entrega a regra de dedup canônica, testável sem banco,
  pronta para a 018 — mesmo sem persistência é um incremento demonstrável (SC-001..003).
- **Incremento 2 = US1+US2**: `resolverOuCriar` com Postgres — a porta que a 018 chama.
- **Incremento 3 = +US3+US4+US5**: base administrável pela equipe (CRUD, merge, conta).
- **Incremento 4 = +US6**: painel.
- **Fecho = Phase 9**: docs, regressão, ROADMAP, memórias.

## Format validation

Todas as tasks: `- [ ] Txxx [P?] [USx?] descrição com caminho de arquivo`. Setup/
Foundational/Polish sem `[US]`; fases de story com `[US1]`..`[US6]`.
