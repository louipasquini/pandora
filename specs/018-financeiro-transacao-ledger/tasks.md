# Tasks — 018 · Ledger de transações do Financeiro

Ordem dependência-primeiro. `[P]` = paralelizável com o(s) anterior(es). Cada tarefa fecha
verde (typecheck + lint + o teste da própria tarefa).

## Fase A — Contrato no `core`

- **T001** — `backend/src/core/pipeline/evento-canonico.ts`: mover o schema `zod` +
  `EventoCanonico` de `ingestao/domain/evento-canonico.ts` (conteúdo idêntico; imports
  `@prisma/client` + `ehMoeda` do `core` continuam válidos).
- **T002** — `backend/src/ingestao/domain/evento-canonico.ts`: substituir o conteúdo por
  `export * from '../../core/pipeline/evento-canonico';`. Rodar `tsc -b` do backend — os
  importadores (`worker.service.ts`, `registrar-evento.service.ts`, `classificar.ts`,
  `domain/index.ts`) devem continuar compilando sem mudança.
- **T003** — `backend/src/core/pipeline/executor-externo.ts`: `EntradaEtapaExterna`,
  `SaidaEtapaExterna`, `ExecutorEtapaExterno`, `EXECUTORES_ETAPA_EXTERNOS`
  (ver `contracts/pipeline-executor.md`).
- **T004** — `backend/src/core/core.module.ts`: re-exportar `eventoCanonicoSchema` +
  `EventoCanonico` + tudo de `executor-externo.ts` na seção "pipeline (018)".

## Fase B — Worker: consumir o contrato (`ingestao`, 1 arquivo)

- **T005** — `backend/src/ingestao/domain/tipos.ts`: `EtapaCtx` ganha
  `plataformaOrigem?: string` e `idOrigem?: string` (opcionais — os _noop_ não usam).
- **T006** — `backend/src/ingestao/application/executor-externo.wrapper.ts`:
  `criarWrapperExterno(ext: ExecutorEtapaExterno): Executor` — monta `resultados` lendo
  `ctx.tx.eventoEtapa.findMany`, chama `ext.executar(...)`, mapeia `SaidaEtapaExterna` →
  `ResultadoEtapa`.
- **T007** — `backend/src/ingestao/application/worker.service.ts`:
  - construtor: `@Optional() @Inject(EXECUTORES_ETAPA_EXTERNOS) externos: ExecutorEtapaExterno[] = []`;
    após os `EXECUTORES_NOOP`, `for (const ext of externos ?? []) this.executores.set(ext.etapa as EtapaIngestao, criarWrapperExterno(ext))`.
  - `processarEvento`: incluir `plataformaOrigem`, `idOrigem` no `select` do evento e no `ctx`.
- **T008** [P] — unit `worker.service` (regressão): teste que, sem nenhum externo
  registrado, o comportamento é idêntico à 006 (etapas 2–6 `pulada`).

## Fase C — Domínio puro do `financeiro`

- **T009** [P] — `backend/src/financeiro/domain/status-map/index.ts`: `MAPAS_STATUS` (`{}`) +
  `mapearStatus(plataforma, fonte, bruto): ResolucaoStatus` (ver `research.md` D-R5). +
  `status-map/README.md`.
- **T010** [P] — `backend/src/financeiro/domain/dados-transacao.ts`:
  `type DadosTransacaoNormalizada` + `extrairDados(canonico: EventoCanonico | null,
  classificacao, ocorridoEm: Date | null): DadosTransacaoNormalizada` (puro).
- **T011** [P] — `backend/src/financeiro/domain/diff-campos.ts`:
  `camposAlterados(anterior: DadosTransacaoNormalizada | null, novo): string[]` (puro;
  compara `Dinheiro` por `valorInt`+`moeda`, datas por `getTime`).
- **T012** [P] — `backend/src/financeiro/domain/deve-criar-pessoa.ts`:
  `deveCriarPessoa(classificacao: string): boolean` (`false` só p/ `VENDA_AFILIADA`).
- **T013** [P] — `backend/src/financeiro/domain/index.ts` (barrel).
- **T014** — unit specs de T009–T012 (`backend/src/financeiro/domain/*.spec.ts`), incl. a
  **paridade** enum Prisma × enum `core` em `status-map.spec.ts`.

## Fase D — Migração Prisma

- **T015** — `backend/prisma/schema.prisma`:
  - `enum StatusTransacaoCanonico { PENDENTE PAGO EM_ATRASO RECUSADO CANCELADO ESTORNADO CHARGEBACK DESCONHECIDO }`
  - `model Transacao { ... }` (ver `data-model.md`) — `@@map("transacao")`,
    `@@unique([plataformaOrigem, idOrigem], name: "transacao_chave_natural")`, 6 índices.
  - `Pessoa` += `transacoes Transacao[]`; `EventoOrigem` += `transacoes Transacao[]`.
- **T016** — `npm run prisma:migrate:dev --workspace backend --name financeiro_transacao`;
  conferir o `migration.sql` (create type + create table + indexes; sem `CHECK`).
- **T017** — `npx prisma generate` (implícito no migrate); `tsc -b` backend verde.

## Fase E — Aplicação do `financeiro`

- **T018** — `backend/src/financeiro/infra/transacao.repository.ts`:
  - `carregarAnterior(plataforma, idOrigem): DadosTransacaoNormalizada | null`
  - `upsert(chave, dados, { pessoaId, eventoOrigemId, statusCanonico, classificacao, ocorridoEm, precisaRevisao, motivoRevisao }): { transacaoId, foiCriada }`
  - `listar(filtros): { itens, total }` · `detalhe(id)`
- **T019** — `backend/src/financeiro/application/resolver-pessoa-etapa.service.ts`
  (`implements ExecutorEtapaExterno`, `etapa = 'RESOLVER_PESSOA'`): injeta
  `@Inject(PORTA_IDENTIDADE)`; lê `entrada.resultados.CLASSIFICAR.classificacao`; monta
  `dados`/`origem`; `criar = deveCriarPessoa(classificacao)`; short-circuit p/ `pessoaId:
  null` quando `criar && sem chave && sem nome`; devolve `{ status:'ok', resultado:{ pessoaId, criada } }`.
- **T020** — `backend/src/financeiro/application/upsert-transacao-etapa.service.ts`
  (`implements ExecutorEtapaExterno`, `etapa = 'UPSERT_TRANSACAO'`): injeta o repo;
  `classificacao` de `resultados.CLASSIFICAR`; `pessoaId` de `resultados.RESOLVER_PESSOA`;
  `status = mapearStatus(...)`; `ocorrido = parseInstante(canonico.ocorridoEm)`;
  `dados = extrairDados(...)`; `anterior = repo.carregarAnterior(...)`;
  `campos = camposAlterados(anterior, dados)`; `repo.upsert(...)`; devolve
  `{ status:'ok', resultado:{ transacaoId, foi_criada, campos_alterados: campos }, revisar: precisaRevisao }`.
- **T021** — `backend/src/financeiro/dto/listar-transacoes.schema.ts` (zod: paginação,
  enums CSV, bools, datas ISO, `q`).
- **T022** — `backend/src/financeiro/application/transacao-query.service.ts`:
  `listar(dto)` (deriva `pagoDeFato` de `STATUS_TRANSACAO_CANONICO.filter(contaComoReceita)`),
  `detalhe(id)` (404 se não existe; serializa `Dinheiro` como `{ valorInt, moeda }`; inclui
  `pessoa {id, nome}`).
- **T023** — `backend/src/financeiro/transacao.controller.ts`:
  `@Controller('financeiro/transacoes')`, `@RequerPermissao('transacao:ver')` nas 2 rotas.
- **T024** — `backend/src/financeiro/financeiro.module.ts` (reescrito): providers
  (repo, query, 2 executores), controller `TransacaoController`. **Não** exporta os
  executores (isso é do wiring).
- **T025** — `backend/src/financeiro/financeiro-wiring.module.ts` (`@Global()`): importa
  `FinanceiroModule`; providers `{ provide: EXECUTORES_ETAPA_EXTERNOS, useExisting:
  ResolverPessoaEtapaService, multi: true }` + idem `UpsertTransacaoEtapaService`; exporta
  `EXECUTORES_ETAPA_EXTERNOS`.
- **T026** — `backend/src/app.module.ts`: importar `FinanceiroWiringModule` (após
  `FinanceiroModule`, junto de `ClientesWiringModule`).

## Fase F — RBAC

- **T027** — `backend/src/auth/rbac/catalogo.ts`: `+ { id: 'transacao:ver', recurso:
  'transacao', rotulo: 'Ver o ledger de transações do Financeiro' }`.

## Fase G — e2e backend

- **T028** — `backend/test/support/financeiro.ts`: helper `montarEventoCanonico(over)`,
  `ingerirEProcessar(app, token, evento)`, `getTransacoes(app, token, qs)`.
- **T029** — `backend/test/financeiro-transacao.e2e-spec.ts`: US1–US4 + idempotência +
  concorrência + guard 401/403 + catálogo/efetivas + etapas 4–6 `pulada` + `grep` de
  fronteira (`src/financeiro` sem `from '.../ingestao'`/`.../clientes'`;
  `src/ingestao` sem `.../financeiro'`).
- **T030** — rodar a suíte 003–018 completa contra o Postgres isolado (`55434`); verde.

## Fase H — Frontend

- **T031** [P] — `frontend/src/transacoes/transacoes-api.ts` (tipos + `apiFetch`,
  `CONTAS`, `STATUS_CANONICOS`).
- **T032** — `frontend/src/transacoes/TransacoesListPage.tsx` (filtros conta/status/
  classificação/pagoDeFato/revisão/período + `q` + paginação; hooks TanStack Query inline).
- **T033** — `frontend/src/transacoes/TransacaoDetailPage.tsx` (campos + valores por moeda +
  link `/eventos/:eventoOrigemId` + `pessoa` → `/pessoas/:id`).
- **T034** — `frontend/src/shell/nav-items.ts`: `{ label: 'Financeiro · Transações', to:
  '/financeiro/transacoes', requerPermissao: 'transacao:ver' }` (antes do placeholder
  `Financeiro`).
- **T035** — `frontend/src/app/router.tsx`: rotas `/financeiro/transacoes` e
  `/financeiro/transacoes/:id` sob `<RequirePermissao perm="transacao:ver">`.
- **T036** [P] — `TransacoesListPage.test.tsx` + `TransacaoDetailPage.test.tsx`.

## Fase I — Qualidade + docs

- **T037** — `npm run lint && npm run typecheck && npm run build` nos 2 workspaces; verde.
- **T038** — `npm run test --workspace frontend` (+ regressão) verde.
- **T039** — `docs/018-financeiro-transacao-ledger.md` (novo).
- **T040** — atualizar `CLAUDE.md` (bloco fora do SPECKIT: stack `financeiro`), `README.md`
  (se citar contextos/rotas), `ROADMAP.md` (marcar `[x] 018` com o resumo).
- **T041** — commit na branch `018-financeiro-transacao-ledger` + PR.
