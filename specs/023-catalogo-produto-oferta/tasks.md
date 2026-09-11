# Tasks — 023 · Catálogo (`produto` → `oferta`)

Ordem dependência-primeiro. `[P]` = paralelizável com o(s) anterior(es). Cada tarefa fecha
verde (typecheck + lint + o teste da própria tarefa).

## Fase A — Domínio puro (`catalogo/domain`, sem banco)

- **T001** [P] — `backend/src/catalogo/domain/tag/decodificar-tag.ts`:
  `decodificarTag(tag: string): TagDecodificada | null` (formato `^[A-Z]{3}[A-Z0-9]{5}$`;
  turma `X0`→EVERGREEN, `00`→PERPETUO, `\d{2}`→NUMERO, senão DESCONHECIDO).
- **T002** [P] — `backend/src/catalogo/domain/tag/localizar-tag.ts`:
  `localizarTag({codigoOrigem?, nomeOrigem?}): string | null` (âncora exata em
  `codigoOrigem`; senão `#([A-Z]{3}[A-Z0-9]{5})` em `codigoOrigem` depois `nomeOrigem`).
- **T003** [P] — `backend/src/catalogo/domain/resolucao/estrategia-por-plataforma.ts`:
  `ESTRATEGIA_RESOLUCAO_OFERTA: Record<PlataformaOrigem, 'TAG'|'CATALOGO_HOTMART'>`.
- **T004** [P] — `backend/src/catalogo/domain/precedencia.ts`: `marcarEditado(campos, nome)`,
  `aplicarSeNaoEditado(campos, nome, aplicar: () => void)`.
- **T005** [P] — `backend/src/catalogo/domain/turma-efetiva.ts`:
  `turmaEfetiva(data: Date, janelas: {rotulo, inicio, fim}[]): string | null`.
- **T006** [P] — `backend/src/catalogo/domain/csv/schema-produtos.ts`,
  `schema-ofertas.ts`, `schema-lancamentos.ts` (zod, colunas esperadas + aliases —
  `data-model.md`) + `parse-csv.ts` (parser à mão, separador `,`/`;`, BOM, aspas — cópia do
  padrão 019-022) + `validar-schema-colunas.ts` (compara cabeçalho contra o schema antes de
  processar qualquer linha, D-12).
- **T007** — `backend/src/catalogo/domain/index.ts` (barrel).
- **T008** — unit specs de T001–T006 (`*.spec.ts`), incl. varredura de cobertura das 7 contas
  em `estrategia-por-plataforma.spec.ts`.

## Fase B — Migração Prisma

- **T009** — `backend/prisma/schema.prisma`: enums `TurmaTipo`, `OfertaOrigemRefTipo`;
  models `Produto`, `Oferta`, `OfertaOrigemRef`, `OfertaCatalogo`, `OfertaCatalogoBonus`,
  `OfertaCatalogoComboItem`, `JanelaLancamento`, `CatalogoAudit` (ver `data-model.md`);
  `Transacao.oferta` como relation ativa (`onDelete: SetNull`).
- **T010** — `npm run prisma:migrate:dev --workspace backend --name catalogo_produto_oferta`
  (gera `migration.sql`; revisar o `ALTER TABLE transacao ADD CONSTRAINT` gerado — precisa
  ser não-destrutivo, sem `DROP`/`NOT NULL` novo).
- **T011** [P] — unit: paridade `TurmaTipo`/`OfertaOrigemRefTipo` do Prisma × tipos TS do
  domínio (mesmo padrão de `status-map.spec.ts`/018).

## Fase C — Aplicação (`catalogo/application` + `infra`)

- **T012** — `backend/src/catalogo/infra/produto.repository.ts`: `buscarPorCodigo`,
  `upsertPorCodigo` (cria com campos derivados nulos se novo; se existir, aplica
  `aplicarSeNaoEditado` por campo), `listar` (busca+paginação).
- **T013** — `backend/src/catalogo/infra/oferta.repository.ts`: `buscarPorOrigemRef`,
  `criarComOrigemRef` (transação: produto se novo + oferta + origem_ref), `buscarPorId`,
  `atualizar` (curadoria + upsert de `oferta_catalogo`/bônus/combo transacional), `listar`.
- **T014** — `backend/src/catalogo/infra/janela-lancamento.repository.ts`: `upsert`,
  `listarPorProduto`.
- **T015** — `backend/src/catalogo/application/catalogo-audit.service.ts`: wrapper de
  `montarRegistroAuditoria` (core) para gravar `catalogo_audit`, comparando campo a campo
  (só grava o que mudou de fato).
- **T016** — `backend/src/catalogo/application/resolver-oferta-etapa.service.ts`:
  `ExecutorEtapaExterno` (ver `contracts/pipeline-executor-oferta.md`) — usa T001-T003 +
  T012/T013 + `UPDATE transacao.oferta_id` via `PrismaService` direto (fora do repo de
  oferta, já que é uma tabela de outro contexto — só a coluna já reservada).
- **T017** — `backend/src/catalogo/application/produto.service.ts`: `curar(codigo, dto)`
  (upsert + audit).
- **T018** — `backend/src/catalogo/application/oferta.service.ts`: `criar(dto)`,
  `curar(id, dto)` (inclui `oferta_catalogo`), `listar`, `buscarPorId`.
- **T019** — `backend/src/catalogo/application/importar-catalogo-hotmart.service.ts`:
  `importarProdutos(csv)`, `importarOfertas(csv, conta)`, `importarLancamentos(csv)` (ver
  `contracts/import-csv-hotmart.md`).
- **T020** — `backend/src/catalogo/application/index.ts` (barrel).
- **T021** — unit: `resolver-oferta-etapa.service.spec.ts` (mock de repos, sem banco) —
  cobre `TAG` auto-cria, `CATALOGO_HOTMART` sem match → revisar, idempotência de chamada
  dupla.

## Fase D — HTTP + RBAC + wiring

- **T022** — `backend/src/auth/rbac/catalogo.ts`: `+produto:{ver,editar}`,
  `+oferta:{ver,editar,criar}` (recurso `produto`, `oferta`).
- **T023** — `backend/src/catalogo/dto/*.schema.ts` (zod): `curar-produto`, `criar-oferta`,
  `curar-oferta`, `importar-csv`.
- **T024** — `backend/src/catalogo/produto.controller.ts`:
  `GET /produtos`, `GET /produtos/:codigo`, `PUT /produtos/:codigo`.
- **T025** — `backend/src/catalogo/oferta.controller.ts`:
  `GET /ofertas`, `GET /ofertas/:id`, `POST /ofertas`, `PATCH /ofertas/:id`.
- **T026** — `backend/src/catalogo/catalogo-hotmart-import.controller.ts`:
  `POST /catalogo/hotmart/importar-{produtos,ofertas,lancamentos}`.
- **T027** — `backend/src/catalogo/catalogo.module.ts`: providers + controllers,
  `exports: [ResolverOfertaEtapaService]`.
- **T028** — `backend/src/pipeline-wiring.module.ts`: `imports += CatalogoModule`; injeta
  `ResolverOfertaEtapaService`; registra o 3º executor no loop existente.

## Fase E — e2e (Postgres real, `pandora-db` existente — sem container novo, R6)

- **T029** — `backend/test/support/catalogo.ts`: helper `montarEventoComOferta({...})` +
  `registrarEProcessar(...)`.
- **T030** — `backend/test/catalogo.e2e-spec.ts`:
  - migração cria as 8 tabelas + FK `transacao.oferta_id`.
  - US1 (auto-resolução): Guru tag ancorada; 2ª venda mesma tag idempotente; mesma tag em
    Hotmart gera 2ª `oferta`; Asaas texto livre; TMB sem tag → revisão.
  - US2 (curadoria): `PUT /produtos/:codigo` + audit; curado sobrevive a novo evento;
    `PATCH /ofertas/:id` com catálogo+bônus+combo; 404 em produtoId inexistente.
  - US3 (CSV Hotmart): import válido; schema inválido → 422 atômico; linha sem
    `price_code` ignorada; venda Hotmart sem match → revisão; `lancamentos.csv` + turma
    efetiva por data.
  - idempotência/concorrência de reprocessamento.
  - guard 401/403/2xx por permissão.
  - regressão: suíte completa 003–022 + `/health` (11 contextos); etapas 4/6 seguem
    `pulada`.

## Fase F — Frontend

- **T031** [P] — `frontend/src/produtos/produtos-api.ts` + `ProdutosListPage.tsx` (+ test)
  + `ProdutoDetailPage.tsx` (curadoria nome/assinatura) (+ test).
- **T032** [P] — `frontend/src/ofertas/ofertas-api.ts` + `OfertasListPage.tsx` (+ test) +
  `OfertaDetailPage.tsx` (curadoria + catálogo + bônus/combo) (+ test) +
  `ImportCatalogoHotmartPage.tsx` (3 uploads) (+ test).
- **T033** — `frontend/src/shell/nav-items.ts` + `frontend/src/app/router.tsx`: itens
  **Catálogo · Produtos** (`produto:ver`) e **Catálogo · Ofertas** (`oferta:ver`).

## Fase G — Docs (obrigatório antes de fechar a spec)

- **T034** — `docs/023-catalogo-produto-oferta.md` (novo).
- **T035** — `CLAUDE.md`: bullet de Stack para a spec 023 + mover "Plano ativo" para a spec
  024 (ou o próximo item não iniciado do ROADMAP).
- **T036** — `README.md`: seção de módulos/contextos, se aplicável.
- **T037** — `ROADMAP.md`: marcar `023` como `[x]` com o resumo padrão.
