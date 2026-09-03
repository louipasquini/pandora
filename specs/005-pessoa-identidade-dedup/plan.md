# Implementation Plan: pessoa e conta — identidade canônica, dedup e merge

**Branch**: `005-pessoa-identidade-dedup` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-pessoa-identidade-dedup/spec.md`

## Summary

Preencher o _bounded context_ `clientes` (vazio desde a 001) com a **primeira entidade de
negócio de um contexto de domínio** do projeto — `pessoa` — mais `conta` (household /
empresa), a **engine de identidade/dedup** e o **merge reversível**. Sem porta nova;
`CONTEXT_MODULES` segue em 11.

1. **Domínio puro** (`src/clientes/domain/`, testável sem banco):
   - `normalizar.ts` — e-mail (_lowercase_/_trim_), telefone (E.164, BR na borda),
     documento (só dígitos + validação de DV de CPF/CNPJ). Chave inválida → `null` + motivo.
   - `resolver-identidade.ts` — `resolverIdentidade(dados, candidatos) → { pessoaId,
     confianca, criterio, candidatos[] }`. Ordem fixa **documento → cnpj → email → telefone**;
     match único resolve; match múltiplo **descarta o critério**; nada → `null` + candidatos.
     Função pura, determinística, sem efeito colateral.
   - `merge-plano.ts` — cálculo puro do _plano de merge_ (que linhas movem, quais viram
     secundárias) e do _plano de reversão_ a partir do `snapshot` + estado atual, incluindo
     a detecção de **divergência** (item mudado por curadoria/merge posterior → nota de
     reconciliação, valor atual prevalece).
2. **Persistência Prisma** (2ª migração de negócio — `prisma/migrations/<ts>_clientes/`):
   `Pessoa`, `Conta`, `PessoaEmail`, `PessoaTelefone`, `PessoaDocumento`, `PessoaEndereco`,
   `PessoaOrigemRef`, `MergePessoa`, `MergeConta`, `NotaReconciliacao`. PK `String @id
   @db.Uuid` via `EntidadeId.novo()`; `criadoEm`/`atualizadoEm` `@db.Timestamptz(6)`;
   `PessoaOrigemRef` indexado/`@@unique` por `(plataformaOrigem, tipoRef, valorRef)`.
   Linhas de contato/documento/endereço/ref carregam `curado Boolean` e `origemMergeId`
   (proveniência, nullable). **Sem seed de negócio** (não há `pessoa`/`conta` de sistema).
3. **Aplicação** (`src/clientes/application/`):
   - `pessoa.service.ts` — CRUD manual (`POST`/`PATCH`), marca campo tocado `curado`,
     valida unicidade de contato/documento (409, sem fundir), audita via
     `montarRegistroAuditoria` (core) → tabela `clientes_audit`? **não** — reusa
     `RegistroAuditoria` gravado em `NotaReconciliacao`? **não**. Ver decisão em research:
     auditoria de `clientes` vai para uma tabela `clientes_audit` própria (mesma forma
     canônica do core, _append-only_), simétrica ao `rbac_audit` da 004.
   - `conta.service.ts` — CRUD, associar/desassociar `pessoa` (0..1 `conta`; 409 se já em
     outra), audita.
   - `resolver-ou-criar.service.ts` — `resolverOuCriar(dados, { criar, origem })`:
     carrega candidatos (repo) → `resolverIdentidade` → anexa refs + rotaciona contatos
     **não curados** (curado em conflito → secundário + `NotaReconciliacao`) **ou** cria
     `pessoa` nova. Idempotente por unicidade das chaves normalizadas. É o método que a
     spec **018** vai consumir (porta do contexto — ver research; não é endpoint nesta spec).
   - `merge.service.ts` — `merge`/`desfazer` para `pessoa` e `conta`: grava
     `MergePessoa`/`MergeConta` com `snapshot` (JSON do estado pré-merge das duas), move
     linhas com `origemMergeId`, marca absorvida `mergedPara`. `desfazer` aplica o plano de
     reversão (qualquer ordem — CL-03), recria a absorvida do `snapshot`, registra
     `NotaReconciliacao` onde há divergência.
4. **HTTP** (`src/clientes/`):
   - `pessoa.controller.ts` — `GET /pessoas` (`pessoa:ver`), `GET /pessoas/{id}`
     (`pessoa:ver`, resolve `mergedPara`), `POST /pessoas` (`pessoa:editar`),
     `PATCH /pessoas/{id}` (`pessoa:editar`), `POST /pessoas/{id}/merge` (`pessoa:merge`),
     `POST /pessoas/{id}/merge/{mergeId}/desfazer` (`pessoa:merge`).
   - `conta.controller.ts` — `GET /contas` (`conta:ver`), `GET /contas/{id}` (`conta:ver`),
     `POST /contas` (`conta:editar`), `PATCH /contas/{id}` (`conta:editar`),
     `POST /contas/{id}/pessoas` + `DELETE /contas/{id}/pessoas/{pessoaId}` (`conta:editar`),
     `POST /contas/{id}/merge` + `.../desfazer` (`conta:merge`).
   - Zod DTOs em `dto/`. Nenhuma rota `@Public()`/`@AutenticadoBasta()`.
5. **RBAC** (`src/auth/rbac/catalogo.ts` — o catálogo cresce por spec): + recursos `pessoa`
   (`pessoa:ver`, `pessoa:editar`, `pessoa:merge`) e `conta` (`conta:ver`, `conta:editar`,
   `conta:merge`). `RbacRouteAudit` no boot já valida que todo `@RequerPermissao` está no
   catálogo. `administrador` (special-case) e o `seed` passam a incluí-las de graça.
6. **Frontend** (`frontend/src/pessoas/` e `frontend/src/contas/`): itens de navegação
   **Pessoas** (`requerPermissao: 'pessoa:ver'`) e **Contas** (`'conta:ver'`); rotas sob
   `<RequirePermissao>`; lista com busca + paginação, detalhe com contatos
   primário/secundário + marca "curado", refs de origem, `conta`, linha do tempo de merges;
   formulários de criar/editar e ação **Unificar** só com a permissão de escrita. `apiFetch`
   já trata 403 (004) — nada novo.

Abordagem: **0 dependência nova** (backend e frontend). Testes: unit sem banco (normalização,
DV de CPF/CNPJ, `resolverIdentidade` — ordem/ambiguidade/determinismo, `merge-plano` —
plano de merge e de reversão com divergência); e2e Postgres real (migração; CRUD + curado;
`resolverOuCriar` idempotente + rotação + afiliada; merge/desfazer encadeado e fora de
ordem; `conta` CRUD + associação + merge; guard 401/403/200; regressão 003/004; `/health`
= 11). Ao fim: `docs/005-pessoa-identidade-dedup.md` + `CLAUDE.md`/`README.md`/`ROADMAP.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova.** NestJS 11, Prisma `^6.2.1` + `@prisma/client` (models novos),
  `zod` 3 (DTOs), `@nestjs/config` 4. Validação de CPF/CNPJ e normalização de telefone
  são **implementadas à mão** no `domain/` (regra de dígito verificador é ~30 linhas;
  E.164 mínimo não justifica `libphonenumber`, que é pesado — ver research). `EntidadeId`,
  `agoraUtc`, `parseInstante`, `PlataformaOrigem`, `montarRegistroAuditoria` vêm do `core`.
- Frontend: **nenhuma nova.** React 19, `react-router` 7, `@tanstack/react-query` 5,
  `fetch` nativo, `apiFetch` central (003/004).

**Storage**: **PostgreSQL 16 via Prisma** — 2ª migração de negócio. ~10 tabelas
(`pessoa`, `conta`, `pessoa_email`, `pessoa_telefone`, `pessoa_documento`,
`pessoa_endereco`, `pessoa_origem_ref`, `merge_pessoa`, `merge_conta`,
`nota_reconciliacao`, `clientes_audit`). `snapshot` de merge como `Json`. Sem `citext` —
chaves normalizadas ficam em colunas `*_normalizado`/`valor` com `@@unique`. Sem porta nova
(mesmo `DATABASE_URL`/`TEST_DATABASE_URL`, Postgres dev host `55432`).

**Testing**:
- Backend unit (`jest`, sem banco):
  - `normalizar.spec.ts` — e-mail (case/trim/`+tag` mantido), telefone (com/sem DDI, lixo →
    `null`), documento (máscara, DV válido/inválido, CPF vs CNPJ).
  - `resolver-identidade.spec.ts` — resolve por documento; e-mail ambíguo → cai p/ telefone;
    ordem documento>telefone; nada → `null`+candidatos; DV inválido não vira critério;
    determinismo (roda N×, compara); segue `mergedPara`.
  - `merge-plano.spec.ts` — plano de merge (secundários, proveniência); plano de reversão
    limpo; reversão com item curado depois → mantém atual + nota; reversão fora de ordem
    (merge A, merge B, desfaz A) → só linhas de A.
  - `calcular-delta` de auditoria (reusa padrão da 004).
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` já roda
  `migrate deploy` + `db seed`):
  - migração cria as ~11 tabelas; `db seed` não quebra (não há seed de `clientes`).
  - `POST /pessoas` (201 + auditoria; 400 DV inválido; 409 contato de outra pessoa);
    `PATCH` (define primário → curado + delta; 409 unicidade); sem `DELETE` (404/405).
  - `resolverOuCriar` (via provider no teste, não endpoint): cria + refs; 2ª chamada
    rotaciona; 3ª idêntica → no-op; primário curado → novo vira secundário + nota;
    `criar:false` sem match → `null` (afiliada).
  - `POST /pessoas/{id}/merge` (secundários, `mergedPara`, `merge_pessoa` + snapshot +
    auditoria); `GET` da absorvida resolve p/ sobrevivente; merge encadeado + `desfazer` do
    **primeiro** → recria absorvida, 2º merge íntegro; desfazer 2× → 409; item curado antes
    do desfazer → nota de reconciliação; merge inválido → 400/404/409.
  - `conta`: CRUD; associar (409 se já em outra); `merge_conta` + `desfazer`; nenhum
    `contrato` referenciado (SC-012 — grep no diff).
  - guard: `GET /pessoas` sem token → 401; token de `Usuario` sem perfil → 403; credencial
    de serviço → 200.
  - **regressão**: `auth.e2e-spec.ts`, `rbac.e2e-spec.ts`, `health.e2e-spec.ts`,
    `context-modules.e2e-spec.ts` (ainda 11) verdes sem alteração.
- Frontend (`vitest` + Testing Library, jsdom): lista Pessoas (busca, paginação), detalhe
  (primário destacado, secundário datado, "curado", refs, `conta`, merges), nav esconde
  **Pessoas**/**Contas** sem a permissão, rota direta sem permissão → tela "sem permissão"
  (não Login), 403 numa chamada → banner, sessão intacta, controles de escrita só com
  `*:editar`/`*:merge`.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (configuráveis,
spec 001). Dev Windows + Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta funcional. `resolverIdentidade` é O(candidatos) em memória;
o repo carrega candidatos por até 4 queries indexadas (documento, cnpj, e-mail, telefone).
`GET /pessoas` pagina (default 25, teto 100). Merge/desfazer numa transação Prisma.

**Constraints**:
- **Nenhuma porta nova** (`netstat` confirmado: 3001/5174/55432 são do próprio projeto;
  nada novo é aberto; reusa `DATABASE_URL`/`TEST_DATABASE_URL`).
- **Sem `DELETE` de `pessoa`** — exclusão é pseudonimização (spec 047) sobre
  `pseudonimizadaEm` (coluna reservada, sempre `null` aqui).
- **`conta` não toca `contrato`** — `ClientesModule` não importa `contratos`; nenhuma
  migração referencia `contrato` (SC-012). Contrato segue `(pessoa, produto)` — regra
  inviolável #3.
- **Curadoria > derivação** (Princípio VII): coluna `curado` por linha de contato/documento;
  `resolverOuCriar` e `desfazer` **nunca** sobrescrevem `curado` — geram `NotaReconciliacao`.
- **IDs de origem nunca PK** (Princípio I): só em `pessoa_origem_ref`
  (`plataformaOrigem` + `tipoRef` + `valorRef`), `@@unique`.
- **403 ≠ 401** — corpo genérico da 004; guard de permissão da 004 sem alteração.
- Regra ESLint `import/no-restricted-paths` (001): `clientes` só importa de `core` e de
  `auth` (infra transversal — como a 004 faz). **Não** importa `contratos`/`financeiro`/
  `crm`. A consumo de `resolverOuCriar` por `financeiro` (018) é decidido na 018 (porta
  HTTP interna ou exceção de zona) — **fora do escopo da 005**.
- Regra ESLint `no-restricted-syntax` (002): sem `process.env` fora de `config/`/`core/` —
  `clientes` lê o que precisar via `ConfigService`/contrato do `core` (não precisa de chave
  nova).
- `clientes_audit`, `merge_pessoa`, `merge_conta`, `nota_reconciliacao` são _append-only_
  (a aplicação nunca faz `UPDATE`/`DELETE` neles; `merge_*` só troca a coluna `estado`).

**Scale/Scope**: ~30 arquivos novos no backend (`src/clientes/{domain,application,infra}/**`,
`pessoa.controller.ts`, `conta.controller.ts`, `dto/**`, `clientes.module.ts` reescrito,
`prisma/migrations/<ts>_clientes/`, `test/clientes.e2e-spec.ts` + fixtures), ~12 no frontend
(`src/pessoas/**`, `src/contas/**`, testes), **0 dep nova**, **1 migração**, **~16
endpoints** novos (`pessoa`: 6, `conta`: ~8 — ver Princípio VIII no gate), ~7 arquivos
tocados (`schema.prisma`, `src/auth/rbac/catalogo.ts`, `src/auth/rbac/catalogo.spec.ts`,
`frontend/src/app/router.tsx`, `frontend/src/shell/nav-items.ts`, `frontend/src/test/
setup.ts` — `fetch` default cobre `/pessoas`), 1 doc novo, 3 docs atualizados. **Sem**
mudança em `ci.yml` (o passo de seed da 004 já cobre; migração nova entra pelo
`migrate deploy`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: `pessoa` e `conta` nascem com **ID surrogate UUID v7**
      gerado na app (`EntidadeId.novo()`), decidido antes do schema. **Todo** identificador
      de origem do comprador vai para `pessoa_origem_ref` (`plataformaOrigem`, `tipoRef`,
      `valorRef`), muitos-para-um, `@@unique` — **nunca** PK (SC-008). Granularidade
      documentada: `pessoa` = identidade do comprador; `conta` = agrupamento household/
      empresa que **não** altera o Contrato `(pessoa, produto)` (regra inviolável #3;
      SC-012). Ver `data-model.md`.
- [x] **II. Clarificar antes de assumir**: 4 clarificações resolvidas com o dono do produto
      em 2026-09-03 (CL-01 `conta` por completo, CL-02 CRUD manual completo, CL-03 merge
      sempre reversível, CL-04 `CONTEXT_MODULES` = 11) — spec §Clarifications. Zero
      `NEEDS CLARIFICATION`. Semântica de household no CRM/Central, pseudonimização,
      pipeline de ingestão e "quem é cliente" **explicitamente** empurrados para
      010/044/047/018/025 — não assumidos.
- [x] **III. Bordas finas, núcleo canônico**: `resolverIdentidade` e a normalização são
      **puras** e não conhecem plataforma. `pessoa_origem_ref.plataformaOrigem` é o **único**
      lugar onde nome de conta aparece — como valor do enum de 7 do `core`, dado, não
      código. Nenhum adaptador aqui (é a spec 019–022); a engine recebe `dados` já
      canônicos de quem chama.
- [x] **IV. Log de eventos + projeções**: N/A direto — `evento_origem` é a spec 006 e o
      pipeline é a 018. `resolverOuCriar` é **idempotente** (repetir não duplica — chaves
      normalizadas `@@unique`), pronto para ser chamado por etapa de pipeline reprocessável.
      `merge_*`/`clientes_audit`/`nota_reconciliacao` são _append-only_. Cada _endpoint_
      abre sua própria transação Prisma — sem `commit()` de remendo, sem estado mutável
      pendurado em objeto ORM.
- [x] **V. Agregados derivados**: nenhum contador. As **permissões efetivas** (004) seguem
      derivadas por requisição. O **rótulo** renovação/prorrogação e "quem é cliente" são
      do Financeiro (018/025) — não materializados aqui. `confianca` é rótulo derivado do
      critério, calculado a cada resolução. Sem dinheiro nesta spec.
- [x] **VI. Contextos delimitados**: `ClientesModule` passa a ser um **módulo de contexto
      real** (já estava em `CONTEXT_MODULES` — segue 11; `context-modules.e2e-spec.ts` não
      muda). `clientes` **não** importa `contratos`/`financeiro`/`crm`/`marketing`/`central`
      (ESLint). Importa só `core` e `auth` (infra transversal, como a 004). Consumo por
      contexto a jusante (018 chama `resolverOuCriar`) é **observar/comandar via porta** —
      a forma concreta (endpoint interno vs. exceção de zona ESLint) é decidida **na 018**,
      não aqui. Nenhuma escrita em banco de outro contexto.
- [x] **VII. Curadoria vs derivação**: coluna `curado Boolean` por linha de contato/
      documento — camada distinta do valor derivado. `resolverOuCriar` e `desfazer`
      **nunca** sobrescrevem `curado`: em conflito, o valor curado **prevalece** e uma
      `NotaReconciliacao` (tabela própria, _append-only_) é gravada — nunca reversão
      silenciosa (alinhado ao "vínculo aplicado só alerta"). `merge`/`desfazer` deixam
      rastro completo (`snapshot` + proveniência por linha).
- [x] **VIII. Superfície de escrita mínima**: **~16 _endpoints_ novos** — `pessoa`: 2
      leitura + 4 escrita (`POST`, `PATCH`, `merge`, `desfazer`); `conta`: 2 leitura + 6
      escrita (`POST`, `PATCH`, associar, desassociar, `merge`, `desfazer`). **Sem**
      `DELETE`. **Nenhuma sincronização automática com API externa.** Justificativa
      registrada: CL-01/CL-02 (dono do produto, 2026-09-03) pediram `conta` modelada por
      completo e CRUD manual de `pessoa` — é o **menor** conjunto que cobre US3–US5 (criar,
      corrigir, agrupar, unificar/reverter) sem `DELETE` nem edição de `conta` além de
      nome/tipo/membros. Cada escrita é auditada e sob `@RequerPermissao`. Anotado no gate;
      **entrada em Complexity Tracking** abaixo (escopo ampliado por decisão explícita do
      dono do produto — não é violação de princípio, mas é mais do que o mínimo teórico).
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para `pessoa`/`conta`/`merge_*`/`nota_reconciliacao`/
        `clientes_audit` (`id String @id @db.Uuid`). `pessoa_email`/`_telefone`/`_documento`/
        `_endereco`/`_origem_ref` também com PK UUID v7 própria (são entidades filhas, não
        junções puras). IDs de origem só em `pessoa_origem_ref`.
      - **Tempo**: `@db.Timestamptz(6)` em tudo; `criadoEm`/`atualizadoEm`; `rebaixadoEm`,
        `quando` (auditoria/merge) via `agoraUtc()` do core; `parseInstante` para instantes
        vindos de `dados` externos.
      - **Auditoria**: `clientes_audit` na forma `RegistroAuditoria` (core 002),
        `origem = AJUSTE_MANUAL`, _append-only_ — simétrico ao `rbac_audit`. Cobre criação/
        edição manual, associação a `conta`, merge e desfazer. Painel consolidado = 053.
      - **LGPD**: `pessoa.pseudonimizadaEm` (nullable, reservado) — nenhum fluxo de
        exclusão nesta spec (spec 047).
      - **Multi-conta**: `pessoa_origem_ref.plataformaOrigem` (enum 7) indexado.
      - **Status / Dinheiro / evento_origem**: não tocados (N/A).
      - **Dependência nova**: nenhuma (validação de CPF/CNPJ e E.164 mínimo à mão —
        `libphonenumber`/`cpf-cnpj-validator` avaliados e rejeitados em research por peso/
        superfície desproporcional).

**Resultado do gate: PASS.** Uma entrada em Complexity Tracking: o escopo (`conta`
completa + CRUD manual completo + merge reversível em qualquer ordem) é maior que o mínimo
teórico, mas é **decisão explícita e registrada do dono do produto** (CL-01/CL-02/CL-03),
cada peça é auditada e sob permissão, e nada disso viola um princípio.

*Re-check pós-Phase 1: **PASS** — o design manteve `clientes` sem importar contexto de
domínio, não tocou `contrato`, não criou 2º event log, manteve `CONTEXT_MODULES` em 11, e
pôs toda chave de origem em `pessoa_origem_ref`. Ver `data-model.md` e `contracts/`.*

## Project Structure

### Documentation (this feature)

```text
specs/005-pessoa-identidade-dedup/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões: validação de doc/telefone à mão vs lib;
│                        #   normalização de e-mail (sem heurística de provedor); estrutura
│                        #   do snapshot de merge + reversão em qualquer ordem; auditoria
│                        #   `clientes_audit` própria vs genérica; porta p/ a 018; `conta`
│                        #   sem tocar `contrato`; `confianca` ordinal
├── data-model.md        # Phase 1 — ~11 models Prisma, invariantes, unicidades, o
│                        #   contrato de `resolverIdentidade`, forma do `snapshot`, regras
│                        #   de validação, (nenhuma máquina de estado além de merge ativo/desfeito)
├── quickstart.md        # Phase 1 — env, prisma migrate, lint/typecheck, unit, e2e, fluxo
│                        #   manual (criar pessoa, resolver, merge, desfazer, conta, 403)
├── contracts/
│   ├── pessoas.md                 # GET/POST/PATCH /pessoas, GET /pessoas/{id}, merge, desfazer
│   ├── contas.md                  # GET/POST/PATCH /contas, associar/desassociar, merge, desfazer
│   ├── engine-identidade.md       # resolverIdentidade (puro) + resolverOuCriar (serviço, porta p/ 018)
│   ├── rbac-catalogo.md           # + recursos pessoa/conta no catálogo da 004
│   └── frontend-pessoas-contas.md # nav condicional, rotas RequirePermissao, telas, 403
├── checklists/
│   └── requirements.md            # do /speckit-specify (todos ok)
└── tasks.md             # Phase 2 — /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma               # + models Pessoa, Conta, PessoaEmail, PessoaTelefone,
│   │                               #   PessoaDocumento, PessoaEndereco, PessoaOrigemRef,
│   │                               #   MergePessoa, MergeConta, NotaReconciliacao, ClientesAudit
│   └── migrations/<ts>_clientes/
│       └── migration.sql           # NOVO — cria as tabelas + índices/uniques
└── src/
    ├── auth/rbac/
    │   ├── catalogo.ts             # + PERMISSOES: pessoa:{ver,editar,merge}, conta:{ver,editar,merge}
    │   └── catalogo.spec.ts        # + asserção dos novos recursos
    └── clientes/
        ├── clientes.module.ts      # reescrito — controllers, services, repos; importa PrismaModule;
        │                           #   exporta ResolverOuCriarService + tipos (porta do contexto)
        ├── pessoa.controller.ts    # GET/POST/PATCH /pessoas, GET /{id}, merge, desfazer
        ├── conta.controller.ts     # GET/POST/PATCH /contas, pessoas (assoc/desassoc), merge, desfazer
        ├── dto/
        │   ├── pessoa.schema.ts    # zod: criar (nome + >=1 contato/doc), patch, merge body
        │   └── conta.schema.ts     # zod: criar (tipo, nome), patch, associar
        ├── domain/
        │   ├── normalizar.ts             # e-mail / telefone (E.164, BR na borda) / documento + DV
        │   ├── normalizar.spec.ts
        │   ├── documento.ts              # validação de DV de CPF e CNPJ (puro)
        │   ├── documento.spec.ts
        │   ├── resolver-identidade.ts    # resolverIdentidade(dados, candidatos) — puro
        │   ├── resolver-identidade.spec.ts
        │   ├── merge-plano.ts            # plano de merge + plano de reversão + detecção de divergência
        │   ├── merge-plano.spec.ts
        │   └── tipos.ts                  # DadosIdentidade, ResultadoIdentidade, Criterio, Confianca, Snapshot
        ├── application/
        │   ├── pessoa.service.ts         # CRUD manual, curado, unicidade, auditoria
        │   ├── conta.service.ts          # CRUD, associação, merge (via merge.service), auditoria
        │   ├── resolver-ou-criar.service.ts  # resolverOuCriar(dados,{criar,origem}) — idempotente
        │   ├── merge.service.ts          # merge/desfazer p/ pessoa e conta (snapshot, proveniência, reconciliação)
        │   ├── clientes-audit.service.ts # registrar(delta) via montarRegistroAuditoria + insert append-only
        │   └── *.spec.ts                 # (unit onde puro; o resto na e2e)
        └── infra/
            ├── pessoa.repository.ts      # Prisma: candidatos por critério, detalhe, CRUD, unicidades
            └── conta.repository.ts       # Prisma: CRUD, membros, merge rows
    └── test/
        ├── clientes.e2e-spec.ts    # NOVO — CRUD, resolverOuCriar, merge/desfazer, conta, guard, regressão
        └── support/
            └── clientes.ts         # helpers: criar pessoa/conta via API, seed de fixtures de dedup

frontend/
└── src/
    ├── app/router.tsx             # + rotas /pessoas, /pessoas/:id, /contas, /contas/:id sob RequirePermissao
    ├── shell/nav-items.ts         # + { label: 'Pessoas', to: '/pessoas', requerPermissao: 'pessoa:ver' }
    │                              #   + { label: 'Contas', to: '/contas', requerPermissao: 'conta:ver' }
    ├── pessoas/
    │   ├── PessoasListPage.tsx    # lista + busca + paginação
    │   ├── PessoaDetailPage.tsx   # identidade, contatos (primário/secundário/curado), refs, conta, merges
    │   ├── PessoaForm.tsx         # criar/editar (só com pessoa:editar)
    │   ├── MergeDialog.tsx        # unificar (só com pessoa:merge) + desfazer
    │   ├── pessoas-api.ts         # apiFetch tipado para /pessoas/*
    │   └── *.test.tsx
    └── contas/
        ├── ContasListPage.tsx
        ├── ContaDetailPage.tsx    # membros + merges
        ├── ContaForm.tsx
        ├── contas-api.ts
        └── *.test.tsx

docs/
└── 005-pessoa-identidade-dedup.md   # NOVO — pessoa/conta, engine, normalização, merge
                                     #   reversível, curadoria vs derivação, tabelas, painel

CLAUDE.md  README.md  ROADMAP.md      # atualizados no fim da spec
```

**Structure Decision**: `clientes` adota a divisão **`domain/` (puro) · `application/`
(serviços/transações) · `infra/` (Prisma)** que as pastas vazias da 001 já anteciparam —
a primeira vez que um contexto de domínio ganha corpo. O **núcleo canônico** (engine de
identidade, normalização, planos de merge/reversão) fica em `domain/`, 100% testável sem
banco (SC-009). `ClientesModule` importa `PrismaModule` e `AuthModule` (para os tipos de
`Permissao` e o decorator — `auth` é infra transversal, não contexto) e **exporta**
`ResolverOuCriarService` + os tipos de identidade como a **porta pública** que a spec 018
vai consumir (a forma exata do consumo cross-context — endpoint interno ou exceção de zona
ESLint — é decisão da 018). `CONTEXT_MODULES` fica em 11 e `context-modules.e2e-spec.ts`
não muda. O catálogo de permissões da 004 cresce em `src/auth/rbac/catalogo.ts` (é o
mecanismo previsto: "cada spec que adiciona um recurso adiciona suas permissões").

## Complexity Tracking

| Violação / desvio | Por que é necessário | Alternativa mais simples rejeitada porque |
|---|---|---|
| **Escopo ampliado**: `conta` modelada por completo (entidade + CRUD + associação + `merge_conta` reversível) **nesta** spec, em vez de só um FK nullable reservado | Decisão explícita do dono do produto (CL-01, 2026-09-03): CRM (010) e Central (044) dependem do agrupamento e ele quis a modelagem fechada agora, não fatiada | "FK nullable + tabela mínima" foi oferecida e **recusada** pelo dono do produto; adiar totalmente também foi recusado |
| **CRUD manual completo de `pessoa`** (`POST` + `PATCH` de identidade/contatos/documentos/endereços) em vez de só leitura + `resolverOuCriar` | Decisão explícita do dono do produto (CL-02): a base precisa ser povoada e **corrigida** pela equipe antes de o pipeline da 018 existir | "Só leitura + merge" foi oferecida e **recusada**; sem `PATCH` a equipe não corrige um e-mail errado até a 018 |
| **Merge reversível em qualquer ordem** (proveniência por linha + `snapshot` + notas de reconciliação) em vez de LIFO com trava | Decisão explícita do dono do produto (CL-03) | "LIFO com trava" (mais simples de implementar e raciocinar) foi oferecida e **recusada**; "mão única" também |
| **~16 endpoints novos** (Princípio VIII) | Consequência direta dos três itens acima; é o menor conjunto que os cobre (sem `DELETE`, sem editar `conta` além de nome/tipo/membros) | Menos endpoints exigiria abrir mão de CRUD manual ou de `conta`, que o dono do produto pediu |
