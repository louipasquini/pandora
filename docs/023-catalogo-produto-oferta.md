# 023 — Catálogo · `produto` → `oferta` (resolução por tag AEN, pipeline etapa 5)

Quarta fatia da **Fase 2 — Financeiro**. O _bounded context_ `catalogo` (vazio desde a spec
001) passa a ser dono de **`produto`** ("o que se vende") e **`oferta`** ("a forma de
vender"), e a etapa 5 (`RESOLVER_OFERTA`) do pipeline canônico (spec 006) deixa de ser
_no-op_. Detalhe completo: [`specs/023-catalogo-produto-oferta/`](../specs/023-catalogo-produto-oferta/).

## Decisões (CL-01 + D-01..D-13)

- **CL-01 — `oferta_catalogo` exclusivo por oferta.** O documento de visão sinalizava
  explicitamente como não confirmado se `oferta_catalogo` (ticket, preço de tabela, tempo de
  acesso, bônus) devia ser compartilhado entre as 2 ofertas de plataformas diferentes que
  compartilham a mesma tag AEN. **Resolvido com o dono do produto em 2026-09-11**: "Por
  oferta (1:1 direto)" — cada `oferta` tem seu próprio `oferta_catalogo`, curado
  separadamente, mesmo quando o ticket/tempo de acesso coincidem entre plataformas.
- **D-01 — Tag AEN decodificada, mas 3 códigos ficam crus.** `PCS48XAV` = produto (3) +
  turma (2) + subproduto (1) + modelo de cobrança (1) + modelo de transação (1). O
  mapeamento caractere→significado dos 3 últimos códigos não está documentado em lugar
  nenhum do projeto (o `src/services/oferta_tag.py` da v1 não foi migrado) — ficam
  armazenados **crus**, sem tradução (Regra Inviolável nº 15, nunca um palpite). A turma (2
  chars) tem semântica conhecida pela análise da v1: `"X0"` → evergreen, `"00"` → perpétuo,
  numérica → nº de turma.
- **D-02/D-03 — 2 localizadores genéricos + estratégia por conta.** "Ancorada" (o
  `codigoOrigem` do `EventoCanonico.oferta` casa o formato exato de 8 chars) e "texto livre"
  (`#TAG` em `codigoOrigem` depois `nomeOrigem`) são estratégias **platform-agnostic**
  aplicadas às 5 contas não-Hotmart (`TAG`). As 2 contas Hotmart usam **só** catálogo
  importado (`CATALOGO_HOTMART`) — `ESTRATEGIA_RESOLUCAO_OFERTA` é uma tabela indexada por
  `PlataformaOrigem`, testada por varredura de cobertura das 7 contas (mesmo padrão do
  `MAPAS_STATUS` do `financeiro`).
- **D-04 — Etapa 5 pluga no pipeline via o contrato já existente.** Reusa **sem alteração**
  `ExecutorEtapaExterno`/`EntradaEtapaExterna`/`SaidaEtapaExterna` do `core` (criado pela
  018) e o `src/pipeline-wiring.module.ts` (só ganha o 3º import). **Nenhuma mudança em
  `WorkerService`/`etapas.ts`.**
- **D-05/D-06 — Auto-criação.** `produto` auto-cria em qualquer estratégia (1ª venda com um
  `codigoProduto` novo). `oferta` só auto-cria na estratégia `TAG`; a estratégia
  `CATALOGO_HOTMART` **nunca** auto-cria — sem match no catálogo importado, `oferta_id =
  null` + `transacao.precisaRevisao = true` (decisão de negócio já confirmada na Parte 7 da
  visão).
- **D-07 — Precedência curado > derivado > null.** Colunas distintas por campo curável
  (`*Curado`/`*Derivado`) + `camposEditados: string[]` + 2 helpers puros
  `marcarEditado`/`aplicarSeNaoEditado` (`catalogo/domain/precedencia.ts`).
- **D-08/D-09 — `oferta_catalogo` 100% curado, sem par derivado.** `bonus`/
  `produtos_do_combo` como tabelas de junção reais (`oferta_catalogo_bonus`/
  `oferta_catalogo_combo_item`), nunca array-coluna.
- **D-10/D-11/D-12 — Import do catálogo Hotmart.** `janela_lancamento` só via CSV
  (`lancamentos.csv`, sem endpoint de escrita dedicado — Princípio VIII). Escopo de 3 dos 4
  CSVs da v1 (`afiliados.csv` é da spec 026). Schema de colunas validado **por completo**
  antes de processar qualquer linha; `ofertas.csv` sem `price_code` numa linha só ignora
  aquela linha (FR-015).
- **D-13 — Superfície de escrita mínima de oferta.** `POST /ofertas` (criação manual, caso
  raro) + `PATCH /ofertas/:id` (curadoria por id surrogate) — sem `PUT /ofertas/:codigo` (a
  tag pode se repetir entre plataformas; o painel busca por produto/tag e edita pelo `id`).

## Domínio puro (`backend/src/catalogo/domain/`, sem banco)

- `tag/decodificar-tag.ts` — `decodificarTag(tag): TagDecodificada | null`.
- `tag/localizar-tag.ts` — `localizarTag({codigoOrigem?, nomeOrigem?}): string | null`.
- `resolucao/estrategia-por-plataforma.ts` — `ESTRATEGIA_RESOLUCAO_OFERTA` + `estrategiaDe`.
- `precedencia.ts` — `marcarEditado`/`aplicarSeNaoEditado`/`valorEfetivo`.
- `projecao.ts` — `projetarProduto`/`projetarOferta`/`turmaEfetivaDeOferta` (valor efetivo de
  leitura, Princípio V).
- `turma-efetiva.ts` — `turmaEfetiva(data, janelas)` (só exibição).
- `csv/` — `parse-csv.ts` (parser à mão, 0 dep, cópia do padrão 019–022),
  `schema-colunas.ts` (`validarSchemaColunas`), `schema-{produtos,ofertas,lancamentos}.ts`.

## Aplicação (`backend/src/catalogo/application/`)

- `resolver-oferta-etapa.service.ts` — `ExecutorEtapaExterno` da etapa `RESOLVER_OFERTA`;
  lê só `entrada.canonico`/`entrada.plataformaOrigem`/`entrada.resultados`, grava
  `transacao.oferta_id` via `PrismaService` direto (coluna já reservada desde a 018) e
  acumula `motivoRevisao` sem sobrescrever o que a etapa 3 já tenha gravado.
- `produto.service.ts` / `oferta.service.ts` — curadoria + projeção de resposta HTTP
  (serializa `Dinheiro` como `{valorInt: string, moeda}`).
- `importar-catalogo-hotmart.service.ts` — os 3 imports de CSV.
- `catalogo-audit.service.ts` — forma canônica do core (`montarRegistroAuditoria`),
  append-only, mesmo padrão de `CrmAdminAuditService`/`ClientesAuditService`.

## Wiring (`backend/src/pipeline-wiring.module.ts`)

`imports: [IngestaoModule, FinanceiroModule, CatalogoModule]`; o `onModuleInit` registra os 3
executores (`RESOLVER_PESSOA`, `UPSERT_TRANSACAO`, `RESOLVER_OFERTA`) via
`worker.definirExecutor(...)` + `criarWrapperExterno(...)` (reusado sem alteração).

## HTTP

- `GET/PUT /produtos[/:codigo]` — `produto:{ver,editar}`.
- `GET/POST/PATCH /ofertas[/:id]` — `oferta:{ver,criar,editar}`.
- `POST /catalogo/hotmart/importar-{produtos,ofertas,lancamentos}` — `oferta:editar`.

Ver [`specs/023-catalogo-produto-oferta/contracts/`](../specs/023-catalogo-produto-oferta/contracts/)
para o contrato completo (`catalogo-http.md`, `pipeline-executor-oferta.md`,
`import-csv-hotmart.md`).

## Persistência (`prisma/migrations/20260911164430_catalogo_produto_oferta/`)

**17ª migração de negócio** (1ª do `catalogo`): `produto`, `oferta`, `oferta_origem_ref`
(`@@unique(plataforma_origem, tipo_ref, valor_ref)` — alias, nunca PK), `oferta_catalogo`
(`@unique` em `oferta_id` — 1:1), `oferta_catalogo_bonus`, `oferta_catalogo_combo_item`,
`janela_lancamento`, `catalogo_audit` + enums `TurmaTipo`/`OfertaOrigemRefTipo` + `ALTER
TABLE transacao ADD CONSTRAINT` ligando `oferta_id` (coluna já existia desde a 018) a
`oferta.id` — não-destrutivo.

## RBAC (spec 004 estendida)

`+5` permissões: `produto:{ver,editar}`, `oferta:{ver,criar,editar}`. `administrador` +
credencial de serviço concedem de graça, 0 migração de dados.

## Frontend (`frontend/src/produtos/`, `frontend/src/ofertas/`)

- **Catálogo · Produtos** (`produto:ver`) — lista com busca + detalhe com curadoria de
  nome/assinatura + lista de ofertas do produto.
- **Catálogo · Ofertas** (`oferta:ver`) — lista com filtro por produto/plataforma + detalhe
  com curadoria de identidade (turma/subproduto/modelo de cobrança/modelo de transação) e de
  `oferta_catalogo` (ticket, tempo de acesso, bônus, combo) atrás de `oferta:editar` + tela
  de import dos 3 CSVs do catálogo Hotmart atrás de `oferta:editar`.

## O que fica para specs futuras

- **`vinculo_transacao` + retry** (024) — etapa 4, independente desta (ambas dependem só de
  `UPSERT_TRANSACAO`).
- **`contrato` / `aditivo` / fold** (025) — etapa 6, consome `transacao.oferta_id` +
  `oferta_catalogo.tempoAcessoDias` resolvidos por esta spec.
- **`ProdutoAfiliado` / `afiliados.csv`** (026) — 4º CSV do catálogo Hotmart, fora do escopo
  desta spec.
- Um rótulo humano para os 3 códigos crus de subproduto/modelo de cobrança/modelo de
  transação, se o time decidir que vale a pena mapear.

## Verificação

- **Backend unit** (sem banco, `src/catalogo/domain/*.spec.ts`): decodificação de tag
  (turma numérica/evergreen/perpétua/desconhecida, formato inválido), localização (âncora,
  texto livre, prioridade, falso-positivo), estratégia por plataforma (varredura das 7
  contas), precedência (`marcarEditado`/`aplicarSeNaoEditado` idempotentes), projeção (valor
  efetivo nunca mistura curado/derivado), turma efetiva por data (com sobreposição), schema
  de CSV (coluna obrigatória/opcional, aliases, `price.code`). **81 testes novos.**
- **Backend e2e** (Postgres real, `pandora-db` existente — sem container novo, único
  ambiente ativo nesta sessão): migração cria as 8 tabelas + FK; US1 (tag ancorada Guru →
  auto-cria produto+oferta; idempotência; mesma tag em Hotmart via catálogo → 2ª oferta
  distinta; Asaas texto livre + turma perpétua; TMB sem tag → revisão; Hotmart sem
  `price_code` catalogado → revisão, nunca cai pra tag; reprocessamento idempotente); US2
  (curadoria de produto + audit; curado sobrevive a nova venda; `oferta_catalogo` + bônus +
  combo; 400/404 em referência inválida); US3 (import válido; schema inválido → 422 atômico;
  linha sem `price_code` ignorada; `lancamentos.csv` + turma efetiva); concorrência; guard
  401/403/2xx; fronteira; `/health` com 11 contextos. **23 testes novos.**
- **Regressão (006/019–022)**: `montarEventoCanonico` (helper de teste da 006) ganhou uma
  tag AEN válida por padrão — sem ela, todo teste "feliz" da mecânica do worker cairia em
  `revisar` só por falta de oferta identificável, o que não é o que aqueles testes queriam
  exercitar. 2 asserções da suíte e2e da 006 atualizadas (`RESOLVER_OFERTA` agora real, não
  `pulada`). 6 asserções `precisaRevisao` nas suítes das specs 019–022 atualizadas de
  `false` para `true` — as fixtures daquelas specs não carregam uma tag AEN decodificável
  (e nenhuma delas importou catálogo Hotmart), então a resolução de oferta agora ativada
  corretamente as marca para revisão (Regra Inviolável nº 15) — comportamento novo e
  correto, não uma regressão.
- **Frontend** (`vitest`): lista de produtos + curadoria condicionada a `produto:editar`;
  lista de ofertas com turma efetiva + indicador "sem catálogo"; detalhe de oferta com
  aliases de origem + curadoria condicionada a `oferta:editar`; import de CSV com resultado
  exibido. **7 testes novos.**
- **Regressão**: 921 unit backend + 433 e2e (24 suítes, 003–023) + 130 frontend (35
  arquivos), todos verdes; lint/typecheck/build limpos nos dois workspaces; `/health` segue
  com **11** contextos. Verificado também manualmente no navegador de ponta a ponta (login,
  evento real → produto/oferta auto-criados via tag, curadoria de produto e de
  `oferta_catalogo` com ticket/tempo de acesso/bônus, tela de import do catálogo Hotmart).
- **Ambiente**: corrigido um vazamento pré-existente do `.env` de desenvolvimento
  (`VITE_API_BASE_URL` numa porta customizada) para o modo "test" do Vite/Vitest, que
  quebrava 22 suítes de frontend já antes desta spec — `.env.test` (sem segredo, versionado)
  fixa a URL só para testes.
- **Portas**: nenhuma nova. Backend `3004`/frontend `5174` (portas já configuradas nesta
  sessão) durante a verificação manual; e2e contra o Postgres de desenvolvimento existente
  (`pandora-db`, `55432`), schema isolado por execução — nenhum container novo (única sessão
  ativa neste ambiente).
