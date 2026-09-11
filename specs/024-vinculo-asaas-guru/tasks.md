# Tasks — 024 · Vínculo Asaas↔Guru (pipeline etapa 4)

Ordem dependência-primeiro. `[P]` = paralelizável com o(s) anterior(es). Cada tarefa fecha
verde (typecheck + lint + o teste da própria tarefa).

## Fase A — Domínio puro (`financeiro/domain/vinculo`, sem banco)

- **T001** [P] — `backend/src/financeiro/domain/vinculo/conta-pareada.ts`:
  `contaGuruParDe(plataforma: string): string | null`,
  `contaAsaasParDe(plataforma: string): string | null` (mapa fechado `ASAAS_PRD↔GURU_PRD`,
  `ASAAS_SVC↔GURU_SVC`, CL-01).
- **T002** [P] — `backend/src/financeiro/domain/vinculo/receita.ts`:
  `pagoDeFatoTransacao(statusCanonico: string, classificacao: string): boolean` = puro,
  `contaComoReceita(status) && classificacao !== 'COBRANCA_TERCEIRIZADA'` (CL-03).
- **T003** — `backend/src/financeiro/domain/vinculo/index.ts` (barrel).
- **T004** [P] — unit specs de T001/T002, incl. varredura das 7 contas em
  `conta-pareada.spec.ts` (as 5 não-Asaas/Guru → `null`).

## Fase B — Migração Prisma

- **T005** — `backend/prisma/schema.prisma`: `Transacao.referenciaExternaIdOrigem` (novo,
  `String? @map("referencia_externa_id_origem")`) + índice
  `@@index([plataformaOrigem, referenciaExternaIdOrigem])`; ativar
  `Transacao.transacaoVinculada` como `@relation` (self, `onDelete: SetNull`) sobre a coluna
  já existente `transacao_vinculada_id`; novo model `VinculoTransacao` (`id` UUID v7,
  `transacaoGuruId`/`transacaoAsaasId` `@unique` cada, `origemRef`, `resolvidoEm`
  `@db.Timestamptz(6)`, `criadoEm`) com 2 relations nomeadas (`"VinculoGuru"`/
  `"VinculoAsaas"`) para `Transacao`, `onDelete: Restrict` — ver `data-model.md`.
- **T006** — `npm run prisma:migrate:dev --workspace backend --name financeiro_vinculo`
  (revisar `migration.sql`: só `ADD COLUMN`/`CREATE TABLE`/`ADD CONSTRAINT`, nada
  destrutivo).

## Fase C — Aplicação (`financeiro/application` + `infra`)

- **T007** — `backend/src/financeiro/infra/vinculo.repository.ts`:
  `buscarTransacaoPorChave(plataforma, idOrigem)` (usa `transacao_chave_natural` já
  existente), `buscarAsaasPendentesPorReferencia(plataformaAsaas, idOrigemGuru)`,
  `buscarPendentes({pagina, tamanho})` (filtro derivado — `data-model.md`), `criarVinculo`
  (transação Prisma: `INSERT vinculo_transacao` + `UPDATE transacao` da Asaas —
  `transacaoVinculadaId` + `classificacao=COBRANCA_TERCEIRIZADA` — atômico; verifica
  primeiro se `transacaoGuruId`/`transacaoAsaasId` já têm vínculo → retorna o existente sem
  duplicar), `buscarVinculoPorTransacao(transacaoId)`.
- **T008** — `backend/src/financeiro/infra/transacao.repository.ts` (estender, spec 018):
  `DadosUpsertTransacao` ganha `referenciaExternaIdOrigem: string | null`; `upsert()`
  persiste o campo; `ListaFiltros` ganha `vinculoPendente?: boolean`; `where()` traduz para
  `plataformaOrigem IN (ASAAS_PRD, ASAAS_SVC) AND referenciaExternaIdOrigem IS NOT NULL AND
  transacaoVinculadaId IS NULL` (ou a negação); `pagoDeFato` passa a excluir
  `classificacao = COBRANCA_TERCEIRIZADA` além do `STATUS_PAGO_DE_FATO` já existente (usa
  T002).
- **T009** — `backend/src/financeiro/application/tentar-vincular.service.ts`:
  `TentarVincularService.tentar(transacaoId)` — lê a transação, ramifica por papel
  (Asaas/Guru/não aplicável — lança `UnprocessableEntityException` no ramo "não aplicável"),
  chama `vinculo.repository` para resolver; `tentarPendentes()` — varre `buscarPendentes`
  em lotes e chama `tentar` para cada uma, agregando `{tentativas, resolvidos}`. Serviço
  único reusado pelo executor da etapa 4 (T010) **e** pelos 2 endpoints (T012).
- **T010** — `backend/src/financeiro/application/resolver-vinculo-etapa.service.ts`:
  `ResolverVinculoEtapaService implements ExecutorEtapaExterno` (`etapa = 'RESOLVER_VINCULO'`)
  — ver `contracts/pipeline-executor-vinculo.md`; ramo Asaas chama
  `TentarVincularService.tentar` sobre a própria `transacaoId`; ramo Guru busca pendentes da
  conta pareada via `vinculo.repository.buscarAsaasPendentesPorReferencia` e chama `tentar`
  para cada uma encontrada; qualquer outra plataforma → `{status: 'pulada'}`.
- **T011** — `backend/src/financeiro/application/index.ts` (barrel — export
  `TentarVincularService`, `ResolverVinculoEtapaService`).
- **T012** — `backend/src/financeiro/transacao.controller.ts` (estender): `POST
  /financeiro/transacoes/:id/tentar-vincular` (`@RequerPermissao('transacao:vincular')`) e
  `POST /financeiro/transacoes/tentar-vincular-pendentes` (mesma permissão) — ver
  `contracts/vinculo-http.md`; `GET /financeiro/transacoes` ganha o query param
  `vinculoPendente`; `GET /financeiro/transacoes/:id` ganha o campo `vinculo` no DTO de
  resposta (`TransacaoQueryService.detalhe`).
- **T013** — `backend/src/financeiro/dto/`: DTO/schema zod do query param `vinculoPendente`
  (booleano opcional) na listagem já existente — sem novo arquivo se o schema atual aceitar
  extensão simples.
- **T014** — `backend/src/financeiro/financeiro.module.ts`: registrar
  `VinculoRepository`/`TentarVincularService`/`ResolverVinculoEtapaService` como providers +
  exports (o `ResolverVinculoEtapaService` precisa ser exportado para o wiring da raiz).
- **T015** — `backend/src/pipeline-wiring.module.ts`: importar
  `ResolverVinculoEtapaService` do `FinanceiroModule`, injetar no construtor, incluir no
  laço `for (const svc of [...])` que chama `worker.definirExecutor(...)`; atualizar o log
  final para citar `RESOLVER_VINCULO (spec 024)`.

## Fase D — RBAC (spec 004, estendida)

- **T016** — `backend/src/auth/rbac/catalogo.ts`: adicionar `transacao:vincular` ao recurso
  `transacao` já existente (catálogo congelado — `assertCatalogoCoerente()` cobre).
- **T017** [P] — unit: `catalogo.spec.ts` cobre a nova permissão (mesmo padrão das specs
  anteriores).

## Fase E — Testes e2e (Postgres real)

- **T018** — e2e US1 (Guru primeiro): ingerir evento Guru → processar → ingerir evento Asaas
  com `referenciaExterna.idOrigem` igual ao `id_origem` da Guru → processar → assert
  `transacaoVinculadaId`, `classificacao=COBRANCA_TERCEIRIZADA`, `vinculo_transacao` criado,
  reprocessar o mesmo evento Asaas não duplica.
- **T019** — e2e US2 (Asaas primeiro): ingerir Asaas com referência externa apontando para
  `id_origem` inexistente → processar → assert pendente (sem vínculo, aparece em
  `vinculoPendente=true`) → ingerir e processar a Guru correspondente → assert vínculo
  resolvido sem chamar endpoint nenhum.
- **T020** — e2e US2b (pareamento de conta, CL-01): Asaas `ASAAS_PRD` com referência para um
  `id_origem` que só existe como `GURU_SVC` (conta errada) → processar → assert **continua
  pendente** (nunca casa cross-conta); depois materializar a mesma `id_origem` também em
  `GURU_PRD` → processar → assert vínculo resolvido com a `GURU_PRD`, não a `GURU_SVC`.
- **T021** — e2e US3 (retry manual): semear Asaas pendente + Guru pareada direto no banco de
  teste (sem passar pelo pipeline) → `POST /tentar-vincular` → `200` resolvido; chamar de
  novo → `200` no-op idempotente (mesmo vínculo, sem duplicar); `POST
  /tentar-vincular-pendentes` com N pendentes/M resolvíveis → `{tentativas: N, resolvidos:
  M}`; transação TMB/Hotmart → `422`; transação inexistente → `404`.
- **T022** — e2e regra de receita: com o vínculo do T018 resolvido, `GET
  /financeiro/transacoes?pagoDeFato=true&plataformaOrigem=ASAAS_PRD` **não** inclui a
  transação vinculada; a Guru correspondente continua incluída em
  `pagoDeFato=true&plataformaOrigem=GURU_PRD`.
- **T023** — e2e RBAC: sujeito sem `transacao:vincular` → `403` nos 2 endpoints de escrita;
  `transacao:ver` sozinho não basta.
- **T024** [P] — e2e de fronteira: `grep` confirma que `financeiro` não importa
  `src/ingestao/**` e `ingestao` não importa `src/financeiro/**` (mesmo padrão das specs
  018/023); `/health` segue com as 11 contas de `CONTEXT_MODULES` (nenhum bounded context
  novo).

## Fase F — Frontend (`frontend/src/transacoes`, spec 018 estendida)

- **T025** — `frontend/src/transacoes/hooks` (ou hook inline no componente, mesmo padrão
  018): mutation `tentarVincular(id)` e `tentarVincularPendentes()`, query param
  `vinculoPendente` na listagem.
- **T026** — `TransacaoDetailPage.tsx`: seção "Vínculo" — mostra link para a transação
  vinculada + `resolvidoEm` quando existe; quando a transação é Asaas com referência externa
  e ainda pendente, mostra estado "pendente de vínculo" + botão **Tentar vincular**
  (`transacao:vincular`); quando já vinculada, botão desabilitado/oculto (Princípio VII —
  nunca oferece desfazer).
- **T027** — `TransacoesListPage.tsx`: filtro "pendente de vínculo" (checkbox/select) +
  ação em lote **Tentar vincular pendentes** (`transacao:vincular`) com contagem de
  resultado.
- **T028** [P] — testes de componente (`fireEvent`, mesmo padrão de `pipelines/
  PipelinesPage.test.tsx`) para T026/T027.

## Fase G — Qualidade e documentação

- **T029** — `npm run lint && npm run typecheck && npm run build` nos 2 workspaces.
- **T030** — validar manualmente no navegador (quickstart.md, cenários 1–4).
- **T031** — atualizar `CLAUDE.md`, `README.md`, `ROADMAP.md` (marcar 024 `[x]`) e criar
  `docs/024-vinculo-asaas-guru.md`.

## Dependências entre fases

`A → B → C → {D em paralelo com C a partir de T016} → E (depende de C+D) → F (depende de C)
→ G (depende de tudo)`. Dentro de C, T007→T008 podem correr em paralelo com T009 (Asaas
etapa/testes), mas T010 depende de T007+T009; T015 depende de T010+T014.

## MVP mínimo

US1 (T001–T011, T015, T018) já entrega o efeito principal (Guru primeiro vincula
automaticamente) sem os endpoints de retry — mas como US1/US2 compartilham quase todo o
código de domínio/aplicação, não há ganho real em fatiar o MVP abaixo do escopo completo
desta spec.
