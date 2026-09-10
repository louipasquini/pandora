# 018 — Financeiro · ledger de transações (`transacao` + pipeline etapas 2–3)

Primeira fatia da **Fase 2 — Financeiro** (visão Partes 1–6). O _bounded context_
`financeiro` — vazio desde a spec 001 — passa a ser dono de **`transacao`**: a projeção
normalizada de um evento financeiro, **1 linha por `(plataforma_origem, id_origem)`**
(Regra Inviolável nº 1), com valores como `Dinheiro` do `core`, `status_canonico`,
`classificacao` e FKs opcionais para pessoa/oferta/contrato/transação-vinculada.

A spec 006 montou o pipeline canônico (visão 5.3) como etapas idempotentes com dependências
declaradas e deixou o gancho para as etapas 2–6 (`especDona` em `etapas.ts`: `RESOLVER_PESSOA`
→ 18, `UPSERT_TRANSACAO` → 18). Esta spec **pluga as etapas 2 e 3 reais sem tocar o worker
além do ponto de extensão previsto**. Etapas 4–6 seguem `pulada` (specs 024/023/025).

Spec, plano, pesquisa, modelo de dados e contratos:
[`specs/018-financeiro-transacao-ledger/`](../specs/018-financeiro-transacao-ledger/).

`CONTEXT_MODULES` segue com **11** — `financeiro` já estava na lista (spec 001). **16ª
migração de negócio** (`20260910123742_financeiro_transacao`), a 1ª do `financeiro`.
**0 dependência nova** (backend e frontend). **0 chave `.env` nova.** **+1 permissão** de
catálogo (`transacao:ver`, recurso novo `transacao`; `administrador`/credencial de serviço
de graça, 0 migração de dados/seed). **~2 endpoints** de leitura sob `/financeiro/transacoes`,
**0 endpoint de escrita** (Princípio VIII — `transacao` só é escrita pelo pipeline), **0
endpoint público novo**.

---

## Decisões de projeto (D-01..D-08, defaults documentados)

018 não está marcada `⚠ clarify` no ROADMAP — mesmo tratamento das specs 010/017. As
decisões foram resolvidas como defaults documentados no `spec.md` (§Clarifications) e
`research.md`. **Zero `NEEDS CLARIFICATION`.**

- **D-01 — escopo:** só as etapas 2 (`RESOLVER_PESSOA`) e 3 (`UPSERT_TRANSACAO`). A 1
  (`CLASSIFICAR`) já é real desde a 006; 4–6 seguem `pulada`.
- **D-02 — plugagem sem cruzar _bounded context_:** contrato `ExecutorEtapaExterno` no
  `core` (`core/pipeline/`) + um **módulo de composição na raiz** (`src/pipeline-wiring.module.ts`)
  que registra os executores via `WorkerService.definirExecutor(...)`. `src/pipeline-wiring.module.ts`
  fica **fora dos dirs de contexto**, então é o único lugar autorizado a importar de
  `ingestao` **e** `financeiro` (a regra ESLint `import/no-restricted-paths` cobre só
  `src/<contexto>/`). É o análogo do `AppModule` para o pipeline. `WorkerService` **não
  mudou** (o `definirExecutor` já era o ponto de extensão da 006).
- **D-03 — `EventoCanonico` mora no `core`:** movido de `ingestao/domain/evento-canonico.ts`
  para `core/pipeline/evento-canonico.ts` (`ingestao/domain` re-exporta — 0 importador
  quebrado). É contrato compartilhado `ingestao` ↔ `financeiro`.
- **D-04 — `campos_alterados`:** retornado no resultado da etapa 3 (`ResultadoIngestao{transacao,
  foi_criada, campos_alterados}`) e persistido **só** em `evento_etapa.resultado` (Json).
  **Não** vira coluna mutável em `transacao` — corrige a gambiarra 4.9/4.10 da v1
  (`_houve_mudanca` no ORM + `commit()` de remendo).
- **D-05 — status sem adapter:** `financeiro/domain/status-map/` traz o registro
  `MAPAS_STATUS` (por `plataforma × fonte`) — **vazio nesta spec**, populado pelos PRs das
  specs 019–022. `mapearStatus` tenta (1) valor canônico exato (`paraStatusTransacaoCanonico`
  do `core`), (2) o mapa da fonte; nada casou → `DESCONHECIDO` + `revisar` + `motivo`.
  Divergência consciente da Apêndice C (que sugeriu `status_map` sob os adapters):
  `financeiro` é dono de `status_canonico` e **não pode importar `ingestao`** — o adapter
  faz a extração crua, o `financeiro` a tradução canônica.
- **D-06 — venda como afiliada:** `RESOLVER_PESSOA` chama
  `PortaIdentidade.resolverOuCriar(dados, {criar: false})` sse `classificacao =
  VENDA_AFILIADA` (Regra Inviolável nº 8) — nunca cria `pessoa`; `UPSERT_TRANSACAO` grava
  `pessoa_id = null` + `eh_afiliada = true`, sem oferta/contrato.
- **D-07 — sem superfície de escrita:** só `GET /financeiro/transacoes[/:id]`. O retry de
  vínculo é da spec 024; o ajuste manual de contrato é da 025.
- **D-08 — sem tabela de auditoria:** não há escrita curada/manual em `transacao` nesta
  fatia; o rastro é o `evento_origem` imutável + `evento_etapa.resultado`. Specs 024/025
  introduzem `financeiro_audit` quando aparecer a escrita manual.

## Contrato no `core` (`backend/src/core/pipeline/`)

| Arquivo | O quê |
| --- | --- |
| `evento-canonico.ts` | `eventoCanonicoSchema` (`zod`) + tipo `EventoCanonico` — **movido** da 006, conteúdo idêntico. |
| `executor-externo.ts` | `EntradaEtapaExterna` (`{ eventoId, plataformaOrigem, idOrigem, tipoOrigem, canonico, resultados }`), `SaidaEtapaExterna` (`{ status, resultado?, erroDetalhe?, revisar? }`), `ExecutorEtapaExterno` (`{ etapa, executar(entrada) }`). Sem token DI — a registração é por `definirExecutor` no wiring da raiz. |

`core.module.ts` re-exporta os dois. `ingestao/domain/evento-canonico.ts` vira
`export * from '../../core/pipeline/evento-canonico'`.

## Domínio puro do `financeiro` (`backend/src/financeiro/domain/`, sem banco)

| Arquivo | O quê |
| --- | --- |
| `status-map/index.ts` | `MAPAS_STATUS` (`{}` na 018) + `mapearStatus(plataforma, fonte, bruto) → { status, revisar, motivo? }`. Não faz `trim`/`lowercase`/sinônimos — isso é dado dos adapters, versionado por fonte (`status-map/README.md`). |
| `dados-transacao.ts` | `extrairCanonicos(canonico) → DadosCanonicos` — valores por moeda (`Dinheiro`), quantidade, recorrência, códigos crus de oferta. Ausência → `null`/`false`. `SnapshotTransacao` = estado completo comparável. |
| `diff-campos.ts` | `camposAlterados(anterior, novo) → string[]` puro. `Dinheiro` compara `valorInt`+`moeda`; `Date` compara instante. Sem anterior (criação) → campos preenchidos; nada mudou → `[]`. |
| `deve-criar-pessoa.ts` | `deveCriarPessoa(classificacao) → boolean` — `false` **só** para `VENDA_AFILIADA` (permissivo: um evento ambíguo que é venda própria não pode ficar sem cliente). |

## Aplicação (`backend/src/financeiro/application/`)

- **`ResolverPessoaEtapaService`** (`implements ExecutorEtapaExterno`, `etapa =
  'RESOLVER_PESSOA'`) — lê `resultados.CLASSIFICAR.classificacao`; `criar =
  deveCriarPessoa(...)`; monta `dados` (nome/1º e-mail/1º telefone/1º documento) e `origem`
  (`{ tipoRef: 'transacao', valorRef: idOrigem }`); chama `PORTA_IDENTIDADE.resolverOuCriar`.
  Sem chave **e** sem nome → `pessoaId: null` sem chamar a engine (não cria "(sem nome)").
  Resultado `{ pessoaId, criada }`.
- **`UpsertTransacaoEtapaService`** (`etapa = 'UPSERT_TRANSACAO'`) — `classificacao` de
  `CLASSIFICAR`, `pessoaId` de `RESOLVER_PESSOA`; `status = mapearStatus(...)`;
  `ocorrido = parseInstante(canonico.ocorridoEm)` (lixo → `null` + revisão);
  `dados = extrairCanonicos(...)`; `anterior = repo.carregarAnterior(...)`;
  `campos = camposAlterados(anterior, dados)`; `repo.upsert(...)`. Resultado
  `{ transacaoId, foi_criada, campos_alterados }` + `revisar` quando `DESCONHECIDO` ou data
  não parseável. Erro inesperado → lança (o worker retenta até
  `INGESTAO_WORKER_MAX_TENTATIVAS`).
- **`TransacaoQueryService`** — `listar(dto)` (deriva `pagoDeFato` de
  `STATUS_TRANSACAO_CANONICO.filter(contaComoReceita)` — nunca string hard-coded),
  `detalhe(id)` (404; serializa `Dinheiro` como `{ valorInt: string, moeda }`; inclui
  `pessoa {id, nome}`).
- **`TransacaoRepository`** — `carregarAnterior` (reidrata `Dinheiro`), `upsert` (create ou
  update pela chave natural; captura `P2002` numa corrida e cai para update), `listar`
  (ordena `ocorrido_em desc NULLS LAST`, `AND` para compor `statusCanonico` + `pagoDeFato`),
  `detalhe`.

## Wiring (`backend/src/pipeline-wiring.module.ts`)

Módulo na **raiz** de `src/` (fora dos dirs de contexto). Importa `IngestaoModule` (para
`WorkerService`) e `FinanceiroModule` (para os 2 executores). `onModuleInit` chama
`worker.definirExecutor(svc.etapa, criarWrapperExterno(svc))` para `RESOLVER_PESSOA` e
`UPSERT_TRANSACAO`. `criarWrapperExterno` (em `ingestao/application/`) adapta `EtapaCtx` →
`EntradaEtapaExterna` (monta `resultados` lendo `evento_etapa`), chama o executor externo e
mapeia `SaidaEtapaExterna` → `ResultadoEtapa`. **`AppModule`** importa `PipelineWiringModule`.
Specs 023–025 acrescentam suas etapas aqui, sem tocar o `WorkerService`.

## HTTP (`backend/src/financeiro/transacao.controller.ts`)

| Método | Rota | Permissão | Notas |
| --- | --- | --- | --- |
| `GET` | `/financeiro/transacoes` | `transacao:ver` | paginado (default 25, teto 100); filtros `plataformaOrigem`, `statusCanonico` (CSV), `classificacao` (CSV), `pagoDeFato`, `pessoaId`, `precisaRevisao`, `ocorridoDe`/`ocorridoAte`, `q` (`id_origem`); query malformada → 400 |
| `GET` | `/financeiro/transacoes/{id}` | `transacao:ver` | todos os campos; valores `{ valorInt, moeda }`; `pessoa {id, nome}`; `eventoOrigemId`; 404 se não existe |

401 (sem token) ≠ 403 (autenticado sem permissão), corpo genérico da 004. **Nenhuma** rota
`@Public`/`@AutenticadoBasta`; **nenhuma** rota de escrita.

## Persistência (`prisma/migrations/20260910123742_financeiro_transacao/`)

- **enum `StatusTransacaoCanonico`** (banco) — 8 valores, espelha o enum TS do `core`
  (paridade travada por `status-map.spec.ts`).
- **`transacao`** — PK UUID v7; `plataforma_origem` (enum 7, indexado), `id_origem` (texto,
  **nunca PK**), `tipo_origem`, `status_origem` (cru), `status_canonico`, `classificacao`,
  `ocorrido_em?` (via `parseInstante`), `pessoa_id?` (FK → `pessoa`, `SetNull`),
  `oferta_id?`/`contrato_id?`/`transacao_vinculada_id?` (**colunas nuas, sem FK** — specs
  023/025/024 ligam), 4 pares `(bigint valor_*_int, char(3) valor_*_moeda)` para bruto/
  líquido/taxas/reembolso, `quantidade?`, `eh_afiliada`, `eh_recorrencia`/`assinatura_ciclo?`/
  `numero_ciclo?`, `oferta_codigo_origem?`/`oferta_nome_origem?` (crus, para a 023),
  `precisa_revisao`/`motivo_revisao?`, `evento_origem_id?` (FK → `evento_origem`, `SetNull`).
  `@@unique([plataforma_origem, id_origem], name: "transacao_chave_natural")` — Regra
  Inviolável nº 1. 6 índices comuns; **0 `CHECK`, 0 índice parcial, 0 tabela `_audit`**.
- Back-relations `Pessoa.transacoes` / `EventoOrigem.transacoes` são só schema (precedente
  008/009 — a fronteira do Princípio VI é sobre import de módulo TS, não sobre o schema).

## RBAC (spec 004 estendida)

Catálogo (`src/auth/rbac/catalogo.ts`) ganha o recurso **`transacao`**: `transacao:ver`.
`administrador` (seed) + credencial de serviço (special-case) concedem de graça — **0
migração de dados / 0 seed**. `GET /admin/rbac/permissoes` e `GET /auth/permissoes-efetivas`
passam a listar/conceder.

## Frontend (`frontend/src/transacoes/`)

Item de navegação **Financeiro · Transações** atrás de `transacao:ver`; rotas
`/financeiro/transacoes` e `/financeiro/transacoes/:id` sob `<RequirePermissao>`.
`TransacoesListPage` — filtros (conta / status canônico / `q` / "pago de fato" / "precisa
revisão") + paginação, badge de status, `formatarDinheiro` (só exibição — escala ×10000).
`TransacaoDetailPage` — todos os campos, valores por moeda, link "ver evento" →
`/eventos/:eventoOrigemId` (spec 006) e cliente → `/pessoas/:id`. Hooks TanStack Query
inline; `apiFetch` já trata 401/403.

## O que fica para specs futuras

- **Adapters de plataforma (019–022)** — produzem o `EventoCanonico` real por webhook/API/
  CSV e populam `financeiro/domain/status-map/{tmb,asaas,guru,hotmart}.ts`.
- **`vinculo_transacao` + retry** (024) — liga `transacao_vinculada_id`, regra "só a Guru
  soma" como função de leitura.
- **`oferta` / `oferta_origem_ref`** (023) — resolve `oferta_id` a partir de
  `oferta_codigo_origem` + data.
- **`contrato` / `aditivo` / fold + query de receita** (025) — projeta a transação no
  contrato; receita agregada por moeda/papel.
- **`financeiro_audit`** — quando aparecer a escrita manual (024/025).

## Verificação

- **Backend unit** (sem banco, `src/financeiro/domain/*.spec.ts`): `mapearStatus` (exato /
  mapa vazio / não-lowercase / paridade enum Prisma × core), `extrairCanonicos` (valores
  por moeda / recorrência / oferta / null), `camposAlterados` (criação / no-op / `Dinheiro`
  por moeda / `Date` por instante), `deveCriarPessoa`. **20 testes novos.**
- **Backend e2e** (Postgres real, worker desligado — passadas por `POST
  /ingestao/eventos/processar`): US1 (venda própria → 1 transação normalizada; 2º evento →
  `campos_alterados`; sem comprador → `pessoaId` null), US2 (mesmo e-mail em 2 contas → 1
  pessoa; afiliada desconhecida → `null` + count inalterado; afiliada existente → liga),
  US3 (filtros `pagoDeFato`/`statusCanonico`/`precisaRevisao`/conta; paginação + teto 100;
  detalhe + 404), US4 (`aprovado_x` → `DESCONHECIDO` + revisão + `evento_origem = revisar`;
  `PAGO` exato → sem revisão; data lixo → `ocorrido_em` null + revisão), idempotência
  (reprocessar → 0 duplicata, `campos_alterados: []`), concorrência (2 passadas → 1
  transação), guard 401/403, catálogo/efetivas, `grep` de fronteira. **22 testes novos.**
- **Ingestão e2e** (regressão): 2 asserções ajustadas — RESOLVER_PESSOA + UPSERT_TRANSACAO
  agora são reais (não `pulada`/`implementadaNa: 18`); 4–6 seguem `pulada`. O fixture
  `montarEventoCanonico` passou de `statusOrigem: 'approved'` para `'PAGO'` (valor canônico
  — um adapter traduziria o bruto).
- **Frontend** (`vitest`): lista renderiza + formata valor; filtro de status muda a query;
  detalhe mostra valores por moeda + link para o evento. **3 testes novos.**
- **Regressão**: 609 unit backend + 347 e2e (19 suítes, 003–018) + 123 frontend, todos
  verdes; lint/typecheck/build limpos nos dois workspaces; `/health` segue com **11**
  contextos.
- **Portas**: nenhuma nova (backend `3001`, frontend `5174`, Postgres dev `55432`). Os e2e
  desta spec rodaram contra um Postgres isolado próprio (container `pandora-db-spec018`,
  porta `55435` — 55432/55433/55434 ocupadas por outras sessões).
