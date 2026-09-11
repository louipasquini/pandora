# Implementation Plan: Catálogo — `produto` → `oferta` + resolução por tag AEN (pipeline etapa 5)

**Branch**: `023-catalogo-produto-oferta` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-catalogo-produto-oferta/spec.md`

## Summary

Quarta fatia da **Fase 2 — Financeiro**. O _bounded context_ `catalogo` (vazio desde a 001)
passa a ser dono de **`produto`** e **`oferta`** — "o que se vende" e "a forma de vender".
Pluga a **etapa 5** (`RESOLVER_OFERTA`) do pipeline canônico (006/018), reusando **exatamente**
o contrato `ExecutorEtapaExterno` do `core` e o `src/pipeline-wiring.module.ts` que a 018 já
criou — só adiciona o 3º executor, sem tocar `WorkerService`/`etapas.ts`.

Um decodificador puro de tag AEN (8 chars: produto 3 + turma 2 + subproduto 1 + modelo de
cobrança 1 + modelo de transação 1) resolve produto/oferta para as 5 contas não-Hotmart
(estratégia `TAG`, com auto-criação); as 2 contas Hotmart resolvem **só** por catálogo
importado via CSV (`price.code` exato, sem fallback, sem auto-criação — decisão de negócio já
resolvida na Parte 7 da visão). Precedência curado > derivado > null implementada por colunas
distintas + 2 helpers puros (`marcarEditado`/`aplicarSeNaoEditado`).

Curadoria: `PUT /produtos/{codigo}`, `POST /ofertas`, `PATCH /ofertas/{id}` (inclui
`oferta_catalogo` — ticket, preço de tabela, tempo de acesso, bônus, combo — 100% curado, sem
derivação). Import do catálogo Hotmart: `produtos.csv`, `ofertas.csv`, `lancamentos.csv`
(`afiliados.csv` é escopo da spec 026). Frontend: **Catálogo · Produtos** e **Catálogo ·
Ofertas** no padrão de `frontend/src/transacoes/`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11, Prisma `^6`, `zod` 3 (DTOs + validação de schema de
  CSV). Do `core`: `EntidadeId`/`uuidv7`, `Dinheiro`/`Moeda`, `parseInstante`, `agoraUtc`,
  `montarRegistroAuditoria`/`OrigemMudanca`, `ExecutorEtapaExterno`/`EntradaEtapaExterna`/
  `SaidaEtapaExterna` (018, reusado sem alteração), `PlataformaOrigem`. **Nenhum contrato
  novo no `core`** — diferente da 018, o ponto de extensão já existe.
- Frontend: **nenhuma nova**. React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch`, `usePermissoesEfetivas` + `RequirePermissao`.

**Storage**: **PostgreSQL 16 via Prisma** — **17ª migração de negócio**
(`<ts>_catalogo_produto_oferta`), a **1ª do `catalogo`**. 8 tabelas novas (`produto`,
`oferta`, `oferta_origem_ref`, `oferta_catalogo`, `oferta_catalogo_bonus`,
`oferta_catalogo_combo_item`, `janela_lancamento`, `catalogo_audit`) + `ALTER TABLE
transacao ADD CONSTRAINT` ligando `oferta_id` (coluna já existe desde a 018) a `oferta.id`
(não-destrutivo, mesmo padrão da 018 para `pessoa_id`). Índices únicos:
`produto.codigo`, `oferta_origem_ref(plataforma_origem, tipo_ref, valor_ref)`,
`oferta_catalogo.oferta_id`, `oferta_catalogo_combo_item(oferta_catalogo_id, produto_id)`.

**Testing**:
- Backend unit (`jest`, sem banco), `backend/src/catalogo/domain/`:
  - `tag/decodificar-tag.spec.ts` — formato válido (numérica/evergreen `X0`/perpétuo `00`/
    desconhecida), formato inválido → `null`.
  - `tag/localizar-tag.spec.ts` — ancorada (match exato em `codigoOrigem`), texto livre
    (`#TAG` em `codigoOrigem` depois `nomeOrigem`), nada encontrado → `null`; regex não
    captura falso-positivo (ex. hashtag de 7 chars).
  - `resolucao/estrategia-por-plataforma.spec.ts` — varredura das 7 contas: exatamente
    `HOTMART_PRD`/`HOTMART_SVC` → `CATALOGO_HOTMART`, as outras 5 → `TAG`.
  - `precedencia.spec.ts` — `marcarEditado`/`aplicarSeNaoEditado`: idempotente, nunca
    sobrescreve campo já em `camposEditados`, aplica quando ausente.
  - `csv/schema-csv.spec.ts` — os 3 schemas de coluna (produtos/ofertas/lancamentos);
    coluna faltando → erro nomeado antes de processar qualquer linha; `ofertas.csv` sem
    `price_code` numa linha → linha rejeitada, arquivo segue.
  - `turma-efetiva.spec.ts` — resolve rótulo de turma por data contra janelas do produto;
    sem janela aplicável → `null`; 2 janelas sobrepostas → a de `inicio` mais recente.
- Backend e2e (`jest` e2e, Postgres real, schema isolado, container **isolado numa porta
  livre** — checar `docker ps` antes de escolher; 55432/33/34/35/36/38/39 já usadas pelas
  specs 001–022, próxima faixa livre a confirmar no research.md):
  - migração cria as 8 tabelas + `FK transacao.oferta_id → oferta.id`.
  - **US1**: evento Guru com `oferta.codigoOrigem = "PCS48XAV"` → `processar` → `produto`
    (`PCS`) + `oferta` (turma 48) + `oferta_origem_ref` criados; `transacao.ofertaId`
    preenchido. 2º evento mesma tag → 0 duplicata. Mesma tag em conta `HOTMART_PRD` (via
    catálogo, não tag) → 2º registro de `oferta` distinto. Asaas com tag em texto livre →
    resolve. TMB sem tag reconhecível → `oferta_id = null` + `precisaRevisao`.
  - **US2**: `PUT /produtos/PCS` define nome/assinatura + audita; nova venda da mesma tag
    não sobrescreve; `PATCH /ofertas/{id}` grava `oferta_catalogo` + bônus + combo
    transacionalmente; `produtoId` inexistente → 404.
  - **US3**: import dos 3 CSVs — válido cria/atualiza; coluna faltando → 422 atômico;
    `ofertas.csv` sem `price_code` numa linha → linha ignorada, resto processado; venda
    Hotmart sem match no catálogo → `oferta_id = null` + revisão, nunca cai pra tag;
    `lancamentos.csv` + consulta de turma efetiva por data.
  - **Idempotência/concorrência**: reprocessar evento já resolvido → 0 duplicata; 2
    `processar` concorrentes → 0 efeito duplicado (mutex já existe na 006).
  - **Guard**: rotas sem token → 401; sem `produto:ver`/`oferta:ver`/`*:editar`/`*:criar` →
    403; credencial de serviço → 2xx.
  - **Regressão**: suíte 003–022 + `/health` (11 contextos) verdes; etapas 4/6 seguem
    `pulada` (`RESOLVER_VINCULO` independe de `RESOLVER_OFERTA` — FR-019).
- Frontend (`vitest` + Testing Library, jsdom): lista de produtos com busca por código/nome;
  formulário de curadoria de produto; lista de ofertas com filtro por produto/plataforma;
  detalhe de oferta com edição de catálogo (ticket/tempo de acesso/bônus); import de CSV
  (3 inputs de arquivo, mostra `{importadas, rejeitadas}` por arquivo); nav/rotas atrás das
  permissões corretas.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` — **não subir
servidor extra** (portas já em uso por este projeto). e2e contra Postgres isolado em porta
livre (checar containers ativos antes — ver research.md).

**Performance Goals**: sem meta nova. Resolução de oferta por evento é O(1) queries indexadas
(`oferta_origem_ref` por `@@unique`); import de CSV processa em streaming linha-a-linha (sem
carregar arquivos grandes inteiros em memória além do necessário para a validação de schema).

**Constraints**:
- **Nenhuma porta nova de serviço** (3001/5174); container e2e numa porta Postgres livre.
- **Fronteira de contexto** (Princípio VI): `src/catalogo` importa **só** `core`. Não importa
  `ingestao`/`financeiro`/`clientes`. `ingestao`/`financeiro` não importam `catalogo`. O
  `pipeline-wiring.module.ts` (raiz) é o único lugar que importa os três.
- **Bordas finas** (Princípio III): o decodificador de tag e a estratégia por plataforma são
  **dados** (`ESTRATEGIA_RESOLUCAO_OFERTA: Record<PlataformaOrigem, ...>`), não `if`
  espalhado — mesmo padrão do `MAPAS_STATUS` do `financeiro`.
- **Log de eventos + projeções** (Princípio IV): o executor de `RESOLVER_OFERTA` roda numa
  transação própria por evento (worker já garante), idempotente, resultado explícito
  (`{ofertaId, criada, motivoRevisao}` em `evento_etapa.resultado`).
- **Agregados derivados** (Princípio V): "turma efetiva" é sempre uma consulta contra
  `janela_lancamento`, nunca gravada em `transacao`/`oferta`.
- **Curadoria vs derivação** (Princípio VII): colunas `*Curada`/`*Derivada` distintas +
  `camposEditados`; `oferta_catalogo` é 100% curado (sem par derivado — D-08).
- **Superfície de escrita mínima** (Princípio VIII): 4 endpoints de escrita
  (`PUT /produtos/{codigo}`, `POST /ofertas`, `PATCH /ofertas/{id}`, `POST
  /catalogo/hotmart/importar-{produtos,ofertas,lancamentos}`) + leitura
  (`GET /produtos[/{codigo}]`, `GET /ofertas[/{id}]`). Nenhuma sincronização automática com
  API externa (Hotmart só por CSV manual, como já é hoje).
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~30 arquivos novos no backend (`catalogo/{domain,application,infra,dto}/**`,
2 controllers, `catalogo.module.ts` reescrito, `prisma/migrations/<ts>_catalogo_produto_oferta/`,
`test/catalogo.e2e-spec.ts` + `test/support/catalogo.ts`), ~4 editados (`schema.prisma`,
`src/auth/rbac/catalogo.ts`, `src/pipeline-wiring.module.ts`, `src/app.module.ts` se
necessário), ~10 no frontend (`src/produtos/**`, `src/ofertas/**` + testes,
`shell/nav-items.ts`, `app/router.tsx`). **0 dep nova**, **1 migração**, **~8 endpoints**,
1 doc novo, 3 docs atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: `produto`/`oferta` nascem com **ID surrogate UUID v7** na
      app. `codigo` de `produto` é alias único (não PK de sentido de negócio externo — é
      gerado/confirmado pelo próprio sistema a partir do prefixo da tag, não um ID de
      plataforma). `oferta_origem_ref.valor_ref` (tag crua / `price_code` cru) é **coluna
      comum, nunca PK** — mesmo padrão de `pessoa_origem_ref`/`evento_origem.id_origem`.
- [x] **II. Clarificar antes de assumir**: 023 não está `⚠ clarify`. 1 decisão real (CL-01,
      explicitamente sinalizada como não confirmada na própria visão) foi ao dono do produto.
      13 decisões de projeto (D-01..D-13) resolvidas como defaults documentados, todas
      apoiadas em citações diretas do documento de visão. **Zero `NEEDS CLARIFICATION`.**
- [x] **III. Bordas finas, núcleo canônico**: nenhuma regra de `catalogo` conhece nomes de
      plataforma dentro de `if`s — `ESTRATEGIA_RESOLUCAO_OFERTA` é uma tabela (dado) indexada
      pelo enum `PlataformaOrigem`, testada por varredura de cobertura das 7 contas (mesmo
      padrão do `MAPAS_STATUS`/018).
- [x] **IV. Log de eventos + projeções**: a etapa `RESOLVER_OFERTA` só lê `EventoCanonico` (já
      imutável) e o resultado da etapa `UPSERT_TRANSACAO`; grava resultado explícito, sem
      estado mutável em memória entre chamadas.
- [x] **V. Agregados derivados**: "turma efetiva" e o **valor efetivo de leitura** de cada
      campo curável (`curado ?? derivado ?? null`) são funções puras de leitura — nunca
      colunas materializadas que podem divergir.
- [x] **VI. Contextos delimitados — observar, não escrever**: `catalogo` só escreve nas
      próprias tabelas + a coluna já-reservada `transacao.oferta_id` (via `UPDATE` direto no
      executor da etapa — mesmo mecanismo que a 018 fez pra `pessoa_id`, não uma FK ativa de
      `catalogo` sobre `financeiro`, já que a coluna já pertence ao schema de `transacao`
      desde a 018). Não lê nem escreve `pessoa`/`contrato`/`vinculo`.
- [x] **VII. Curadoria vs derivação**: colunas distintas por campo curável de
      `produto`/`oferta` (nunca a mesma coluna sobrescrita); `camposEditados` implementa
      "trava contra sobrescrita automática" (equivalente ao `campos_editados_manualmente` da
      v1, mas sem a gambiarra 4.6/4.8 de string sentinela). `oferta_catalogo` nunca é tocado
      pela ingestão (só curadoria) — não há "auto-revert" possível porque não há escrita
      automática nesse recurso.
- [x] **VIII. Superfície de escrita mínima**: 4 endpoints de escrita, todos de curadoria ou
      import manual (nunca sincronização automática). `janela_lancamento` **sem** endpoint de
      escrita dedicado — só populada pelo import de `lancamentos.csv` (D-10).
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 7 tabelas de entidade.
      - **Dinheiro**: `oferta_catalogo.ticket`/`precoTabela` como par `(bigint ×10000,
        char(3))`; nunca `float`.
      - **Tempo**: `janela_lancamento.inicio`/`fim` como `@db.Date` (datas civis, não
        instantes — mesmo padrão de `feriado.data`/007); demais timestamps
        `@db.Timestamptz(6)` UTC.
      - **Status**: N/A nesta fatia (não introduz novo enum de status; `precisaRevisao` já
        existe em `transacao` desde a 018, só é setado por esta etapa quando aplicável).
      - **Idempotência**: `@@unique` em `produto.codigo` e
        `oferta_origem_ref(plataforma_origem, tipo_ref, valor_ref)`; reprocessar evento →
        0 duplicata; reimportar CSV → upsert por `price_code`/código, nunca duplica.
      - **Auditoria**: `criado_em`/`atualizado_em` em todas as 7 tabelas de entidade;
        `catalogo_audit` (forma canônica do core) cobre toda escrita de curadoria.
      - **Erros de ingestão**: `RESOLVER_OFERTA` sem match (estratégia `CATALOGO_HOTMART`)
        ou tag não localizada (estratégia `TAG`) → `revisar: true` no `SaidaEtapaExterna`,
        motivo explícito; nunca lança exceção que derrube o worker.
      - **Config/segredos**: nenhuma chave `.env` nova.
      - **Multi-conta**: `oferta_origem_ref.plataforma_origem` (enum 7) em toda resolução.
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.**

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma FKs opcionais/índices únicos sem
ciclo; `contracts/pipeline-executor-oferta.md` confirma que `RESOLVER_OFERTA` só implementa o
contrato já existente do `core` (nenhuma mudança no `WorkerService`); `contracts/catalogo-http.md`
confirma a superfície mínima de escrita; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/023-catalogo-produto-oferta/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── catalogo-http.md
│   ├── pipeline-executor-oferta.md
│   └── import-csv-hotmart.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── catalogo/
│   │   ├── domain/
│   │   │   ├── tag/
│   │   │   │   ├── decodificar-tag.ts        # string(8) -> TagDecodificada | null (puro)
│   │   │   │   └── localizar-tag.ts          # {codigoOrigem?, nomeOrigem?} -> string | null
│   │   │   ├── resolucao/
│   │   │   │   └── estrategia-por-plataforma.ts  # Record<PlataformaOrigem, 'TAG'|'CATALOGO_HOTMART'>
│   │   │   ├── precedencia.ts                # marcarEditado / aplicarSeNaoEditado (puro)
│   │   │   ├── turma-efetiva.ts              # resolve rótulo por data (puro, recebe janelas)
│   │   │   ├── csv/
│   │   │   │   ├── schema-produtos.ts        # zod — colunas esperadas
│   │   │   │   ├── schema-ofertas.ts
│   │   │   │   ├── schema-lancamentos.ts
│   │   │   │   └── parse-csv.ts              # parser à mão (0 dep, cópia do padrão 019-022)
│   │   │   └── index.ts
│   │   ├── application/
│   │   │   ├── resolver-oferta-etapa.service.ts   # ExecutorEtapaExterno p/ RESOLVER_OFERTA
│   │   │   ├── produto.service.ts                 # curadoria de produto
│   │   │   ├── oferta.service.ts                  # criação/curadoria de oferta + catálogo
│   │   │   ├── importar-catalogo-hotmart.service.ts
│   │   │   ├── catalogo-audit.service.ts
│   │   │   └── index.ts
│   │   ├── infra/
│   │   │   ├── produto.repository.ts
│   │   │   ├── oferta.repository.ts
│   │   │   └── janela-lancamento.repository.ts
│   │   ├── dto/
│   │   │   ├── curar-produto.schema.ts
│   │   │   ├── criar-oferta.schema.ts
│   │   │   └── curar-oferta.schema.ts
│   │   ├── produto.controller.ts
│   │   ├── oferta.controller.ts
│   │   ├── catalogo-hotmart-import.controller.ts
│   │   └── catalogo.module.ts             # reescrito — providers + controllers + export do executor
│   ├── pipeline-wiring.module.ts          # editado — importa CatalogoModule, registra 3º executor
│   ├── auth/rbac/catalogo.ts              # editado — +produto:{ver,editar} +oferta:{ver,editar,criar}
│   └── app.module.ts                      # editado, se necessário (CatalogoModule já listado)
├── prisma/
│   ├── schema.prisma                      # editado — 8 models novos + FK transacao.oferta_id
│   └── migrations/<ts>_catalogo_produto_oferta/migration.sql
└── test/
    ├── catalogo.e2e-spec.ts
    └── support/catalogo.ts                # helper: monta EventoCanonico com tag + ingere + processa

frontend/
├── src/
│   ├── produtos/
│   │   ├── produtos-api.ts
│   │   ├── ProdutosListPage.tsx
│   │   ├── ProdutosListPage.test.tsx
│   │   ├── ProdutoDetailPage.tsx          # curadoria nome/assinatura
│   │   └── ProdutoDetailPage.test.tsx
│   ├── ofertas/
│   │   ├── ofertas-api.ts
│   │   ├── OfertasListPage.tsx
│   │   ├── OfertasListPage.test.tsx
│   │   ├── OfertaDetailPage.tsx           # curadoria + oferta_catalogo + bônus/combo
│   │   ├── OfertaDetailPage.test.tsx
│   │   ├── ImportCatalogoHotmartPage.tsx  # 3 uploads de CSV
│   │   └── ImportCatalogoHotmartPage.test.tsx
│   ├── shell/nav-items.ts                 # editado — Catálogo · Produtos / Ofertas
│   └── app/router.tsx                     # editado — rotas novas
```

**Structure Decision**: Web application (Option 2), já em uso desde a 001. Novo _bounded
context_ preenchido em `backend/src/catalogo/` com a mesma divisão
`domain/`·`application/`·`infra/`·`dto/` das specs 005/006/010/018. `pipeline-wiring.module.ts`
ganha o 3º import (`CatalogoModule`) sem mudar sua forma. Frontend ganha `src/produtos/` e
`src/ofertas/` como módulos de tela, espelhando `src/transacoes/`.

## Complexity Tracking

| Ponto fora do trivial | Por que é necessário | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| `RESOLVER_OFERTA` faz `UPDATE` direto em `transacao.oferta_id` a partir do `catalogo` | A coluna já existe em `transacao` (reservada desde a 018) e é o único jeito de a etapa 5 gravar seu resultado sem inverter a direção de dependência (`financeiro` não pode importar `catalogo`). Mesmo padrão exato que a 018 usou pra `pessoa_id` a partir de `financeiro`. | Uma FK/relação Prisma ativa `Oferta -> Transacao` dentro do model `Oferta` exigiria `catalogo` "conhecer" a tabela de `financeiro` como dona — inverteria a fronteira; um evento assíncrono adicional seria over-engineering para uma escrita síncrona já coberta pela transação da própria etapa. |
| Estratégia de resolução condicionada à plataforma (`TAG` vs `CATALOGO_HOTMART`) | Decisão de negócio já resolvida (visão, Parte 7 #3) — Hotmart não pode nunca auto-criar por tag. Sem essa tabela, o código teria um `if` de plataforma escondido dentro da lógica de resolução. | Tratar todas as plataformas igual (todas por tag, ou todas por catálogo) violaria a decisão de negócio já confirmada com o dono do produto — Hotmart sem `price.code` catalogado precisa cair em revisão, nunca resolver por adivinhação de tag. |
