# 025 — Contratos · Aditivos · Fold (pipeline etapa 6)

Sexta fatia da **Fase 2 — Financeiro** e a **1ª entidade de negócio** do _bounded context_
**`contratos`** (vazio desde a spec 001). Materializa a Regra Inviolável nº 3 ("Contrato é
único por `(cliente, produto)` e perpétuo") e fecha as 6 etapas do pipeline canônico da visão
5.3. Detalhe completo: [`specs/025-contratos-aditivos-fold/`](../specs/025-contratos-aditivos-fold/).

## Decisões (CL-01/02/03/04)

025 não estava marcada `⚠ clarify` no ROADMAP; 4 decisões de fato ambíguas foram resolvidas
como defaults documentados diretamente no `spec.md`, 2026-09-11:

- **CL-01 — Precedência do ajuste manual vs. Regra Inviolável nº 13.** O padrão geral "curado
  > derivado" das specs 007/023 (o campo curado nunca é sobrescrito) **não** vale aqui — a
  visão (Parte 3, regra 13) já confirmou o oposto: "`acesso_liberado`, `status` e
  `valor_recebido` são recalculados a cada aditivo, **mesmo sobrescrevendo um ajuste manual
  anterior**". O `PATCH` é um **override temporário**: vence na leitura enquanto nenhum
  aditivo novo chega, mas é **limpo automaticamente** (`ajusteManualStatus/Em/Autor/Motivo`
  → `null`) na próxima vez que a etapa 6 recalcular o fold do contrato — a marca de auditoria
  fica para sempre em `contrato_audit`, só o campo vivo é limpo.
  `tolerancia_atraso_dias`/`contrato_assinado` são diferentes: **não têm par derivado**, o
  fold nunca os toca, então nunca são "sobrescritos".
- **CL-02 — Quais transações geram aditivo.** Só `classificacao ∈ {VENDA_PROPRIA,
  RECORRENCIA, REEMBOLSO}`. `VENDA_AFILIADA` nunca gera Contrato (Regra nº 8);
  `COBRANCA_TERCEIRIZADA` (reclassificada pela etapa 4/024) também não — a venda Guru
  correspondente já é o aditivo de registro. Uma transação qualificada mas com `pessoa_id`/
  `oferta_id` ainda não resolvidos não cria/atualiza o contrato ainda, **sem acrescentar um
  motivo de revisão novo** — descoberto durante a implementação que a etapa 2
  (`ResolverPessoaEtapaService`) já trata `pessoa_id: null` sem nenhum dado de identidade
  como resultado válido e não-revisável ("não cria '(sem nome)' só porque a venda é
  própria"); a etapa 5 já se marca sozinha quando não resolve oferta. Esta etapa só observa
  a consequência — reprocessável a qualquer hora (Princípio IV).
- **CL-03 — Rótulo do aditivo: 3 valores, não 2.** A visão (Parte 7, item 1) só nomeia
  "renovação" (tinha acesso, expirou) e "prorrogação" (ainda ativo). Esta spec acrescenta
  `COMPRA_INICIAL` para o caso degenerado que a regra não precisou nomear (1ª compra, nunca
  teve acesso antes) — extensão pragmática, sem contradizer a regra confirmada.
- **CL-04 — `ticket_total` vs. `valor_recebido`.** `ticket_total[moeda]` soma `valor_bruto`
  de todo aditivo `VENDA_PROPRIA`/`RECORRENCIA` (histórico, não afetado por reembolso
  posterior). `valor_recebido[moeda]` soma `valor_líquido`/bruto só onde `contaComoReceita()`
  do `core` é verdadeiro (hoje só `PAGO`) — como `transacao` é upsertada por chave natural
  (Regra nº 1), um reembolso muda o `status_canonico` da **mesma** linha, que já falha
  `contaComoReceita()`; o fold recalculando do zero já exclui o valor automaticamente.

## Domínio puro (`backend/src/contratos/domain/`, sem banco)

- **`fold.ts`** — `foldContrato(transacoes: TransacaoParaFold[]): ResultadoFold`. Ordena por
  `ocorridoEm` (empate: `transacaoId`, determinístico); para cada transação decide o rótulo
  do aditivo e, se aplicável, estende `fimAcesso = max(baseline ?? data, data) +
  tempoAcessoDias`; acumula `ticketTotal`/`valorRecebido` por moeda (`Record<moeda, bigint>`).
  Puro, sem I/O, sem dependência de tempo — recalcula tudo do zero a cada chamada
  (Princípio V), nunca aplica delta.
- **`status-contrato.ts`** — `statusDoContrato({fimAcesso, toleranciaAtrasoDias,
  ajusteManual, agora}): {statusCanonico, acessoLiberado, viaAjusteManual}`. `status_canonico`/
  `acesso_liberado` **não são colunas** — são calculados em toda leitura a partir de
  `fim_acesso` + tolerância + relógio, exceto quando um ajuste manual vigente vence (CL-01).
  Um contrato cujo `fim_acesso` já passou, sem nenhum aditivo novo, mostra `EXPIRADO` na
  próxima consulta — o estado nunca fica "congelado" no valor de quando o último aditivo
  chegou.

## Pipeline etapa 6 (`PROJETAR_CONTRATO`)

`ProjetarContratoEtapaService` implementa `ExecutorEtapaExterno` do `core` (contrato já
existente desde a spec 018). Registrado em `src/pipeline-wiring.module.ts` junto dos
executores das etapas 2/3/4/5 — **nenhuma mudança em `WorkerService`/`etapas.ts`**.

1. Lê a `transacao` (`classificacao`, `pessoaId`, `ofertaId`, ...) via `PrismaService`
   direto — `contratos` não pode importar `financeiro`/`catalogo` (ESLint
   `import/no-restricted-paths`, contexto já listado desde a spec 001); a leitura/escrita
   cross-schema via Prisma tem o mesmo precedente já aceito pela spec 023
   (`ResolverOfertaEtapaService` grava `transacao.oferta_id` do mesmo jeito) — a fronteira
   do Princípio VI é sobre import de módulo TypeScript, não sobre o schema Prisma.
2. `classificacao` fora de `{VENDA_PROPRIA, RECORRENCIA, REEMBOLSO}` → `status: 'pulada'`.
3. `pessoaId`/`ofertaId` ausentes → `status: 'ok'`, `revisar: false`, `contratoId: null` +
   motivo (CL-02 — sem duplicar sinal de revisão já dado por outra etapa).
4. `getOrCreateContrato(pessoaId, produtoId)` — get-or-create com fallback de corrida
   (`P2002`, mesmo padrão de `VinculoRepository.criarVinculo`/024).
5. Liga `transacao.contrato_id` (se ainda não ligado — nunca muda depois).
6. Recarrega **todas** as transações do contrato (fresco, inclui a atual), roda `foldContrato`,
   faz `upsert` de cada `Aditivo` (por `transacaoId`, 1:1) e grava `fim_acesso`/
   `ticket_total`/`valor_recebido` — limpando **incondicionalmente** o ajuste manual de status
   (CL-01, Regra Inviolável nº 13).

Idempotente: reprocessar a mesma transação produz o mesmo `Aditivo` e o mesmo estado do
contrato (fold puro sobre o mesmo conjunto de transações).

## Migração Prisma (19ª — `20260911192337_contratos_aditivo_fold`)

- `Contrato` — `id` UUID v7, `pessoaId`/`produtoId` (`@@unique` — Regra nº 3), `fimAcesso`
  (derivado), `ticketTotal`/`valorRecebido` (`Json`, `Record<moeda, valorInt-string>`, nunca
  soma moedas), `toleranciaAtrasoDias`/`contratoAssinado` (curados, sem par derivado),
  `ajusteManualStatus`/`Em`/`Autor`/`Motivo` (override temporário, CL-01).
- `Aditivo` — `id` UUID v7, `contratoId`, `transacaoId` (**`@unique`**, 1:1),
  `rotulo` (`AditivoRotulo`), `fimAcessoResultante` (snapshot do fold naquele ponto da linha
  do tempo), `precisaRevisao`/`motivoRevisao`.
- `ContratoAudit` — forma canônica do core (`RegistroAuditoria`), `origem = AJUSTE_MANUAL`,
  append-only.
- Enums novos: `StatusContratoCanonico` (espelha o enum TS do `core`, paridade travada por
  teste, mesmo padrão de `StatusTransacaoCanonico`/018) e `AditivoRotulo`.
- `transacao.contrato_id` — coluna nua reservada desde a spec 018; esta spec **ativa** a
  `@relation` (`onDelete: SetNull`). Back-relations `Pessoa.contratos`/`Produto.contratos`.

Migração **não-destrutiva**: só `ADD COLUMN`/`CREATE TABLE`/`ADD CONSTRAINT`.

## RBAC (spec 004 estendida)

**+2** permissões: `contrato:ver` (leitura), `contrato:editar` (único `PATCH`).
`administrador`/credencial de serviço concedem de graça, **0 migração de dados/seed**.

## Endpoints

- `GET /contratos` (`contrato:ver`) — filtros `produtoCodigo`/`pessoaId`/`turma`/`status`
  (paginação). O filtro `status` é computado **em SQL** (`CASE`, `Prisma.sql`
  parametrizado) — mesma lógica de `statusDoContrato`, paridade coberta por teste — para
  paginar sem carregar tudo em memória (sem tabela de rollup nova, Princípio VIII).
- `GET /contratos/{id}` (`contrato:ver`) — contrato + linha do tempo de aditivos (rótulo,
  data, valor bruto, status da transação de origem, `precisaRevisao`/`motivoRevisao`).
- `PATCH /contratos/{id}` (`contrato:editar`) — **único endpoint de escrita** do contexto
  (Princípio VIII); `motivo` **sempre** obrigatório (`400` sem ele, ou sem nenhum dos 3
  campos de dado); cada campo alterado grava 1 linha em `contrato_audit`.

Ver [`contracts/pipeline-executor.md`](../specs/025-contratos-aditivos-fold/contracts/pipeline-executor.md)
e [`contracts/api.md`](../specs/025-contratos-aditivos-fold/contracts/api.md).

## Frontend

`frontend/src/contratos/` (nova subpasta): item **Financeiro · Contratos** atrás de
`contrato:ver`.

- `ContratosListPage.tsx` — filtros produto/turma/pessoa/status, badge de status, paginação.
- `ContratoDetailPage.tsx` — campos derivados (fim de acesso, ticket total, valor recebido)
  e curados (tolerância, contrato assinado, ajuste manual vigente com autor/data/motivo);
  linha do tempo de aditivos; formulário de ajuste manual atrás de `contrato:editar`
  (limpa após salvar, mostra erro se a API rejeitar).

## Testes

- **944 unitários backend** (16 novos — `fold.spec.ts` + `status-contrato.spec.ts`, domínio
  puro, sem banco: compra inicial/renovação/prorrogação/reembolso/sem-efeito, múltiplas
  moedas, determinismo, tolerância de atraso, ajuste manual vencendo o `fimAcesso`).
- **456 e2e** (15 novos em `test/contratos.e2e-spec.ts`, Postgres real): US1 status derivado
  pelo relógio (ativo/expirado sem nenhum aditivo novo) + reprocesso bem-sucedido depois de
  curar `tempo_acesso` tardiamente; US2 prorrogação/renovação mantendo 1 único contrato +
  reembolso reclassificando a mesma transação upsertada e saindo de `valor_recebido` sem
  apagar o aditivo (`rotulo: REEMBOLSO`); US3 `PATCH` sem `motivo` → 400, override limpo
  automaticamente pelo próximo aditivo com a auditoria permanecendo, curados sem par
  derivado; edge cases (oferta não resolvida, venda como afiliada, filtros de `GET
  /contratos`, RBAC 401/403, `/health` = 11 contextos).
- **Regressão honesta e documentada** nas suítes das specs 006/018/019–024 (mesmo padrão já
  visto nas specs 018/023): `PROJETAR_CONTRATO` deixou de ser `pulada`/no-op — 2 asserções
  de `ingestao.e2e-spec.ts` atualizadas para refletir a etapa real (evento sem `comprador`
  → `pessoa_id: null` → `ok` sem criar contrato, sem revisão nova). E um ajuste de
  infraestrutura de teste: 6 arquivos e2e (`catalogo`, `tmb`/`asaas`/`guru`/`hotmart`-adapter)
  tiveram o `afterEach` corrigido para apagar `contrato` **antes** de `pessoa`/`produto` — a
  FK `Restrict` nova (`contrato_pessoa_id_fkey`/`contrato_produto_id_fkey`) passou a
  bloquear a ordem de limpeza antiga, já que essas suítes também criam vendas própria que
  agora geram contrato de verdade.
- **139 frontend** (5 novos em `ContratosListPage.test.tsx`): lista com status/valor,
  filtro de status, linha do tempo no detalhe, formulário de ajuste manual atrás/sem
  `contrato:editar`.

Validado também manualmente no navegador de ponta a ponta: venda nova com produto/tag
inéditos → aditivo nasce em revisão por falta de `tempo_acesso` cadastrado (`GET
/ingestao/eventos/{id}` mostra `PROJETAR_CONTRATO` com `motivoRevisao`) → curadoria via
`PATCH /ofertas/{id}` (`catalogo.tempoAcessoDias`) + `POST /ingestao/eventos/{id}/
reprocessar` (`forcar: true`) + `POST /ingestao/eventos/processar` → contrato aparece na
lista como `ATIVO`, detalhe mostra `fim_acesso` correto e 1 aditivo `COMPRA_INICIAL`; ajuste
manual `CANCELADO` com motivo salvo e refletido imediatamente na leitura (autor, data,
motivo) — dados de demonstração removidos do banco de dev ao final da verificação.

## Fora de escopo (specs futuras)

- Reversão automática de um ajuste manual ou de um aditivo aplicado por engano — Princípio
  VII/Regra nº 14, "reimportação nunca desfaz" — segue valendo (spec 027, reconciliação).
- Painel consolidado de auditoria cross-contexto (spec 053) — `contrato_audit` hoje só é
  gravado, sem endpoint de leitura dedicado nesta spec.
- Recálculo em lote/manual de todos os contratos de uma vez (ex.: depois de uma migração de
  dados históricos) — o pipeline já cobre "reprocessável a qualquer hora" por evento; um
  comando de recálculo em massa fica para a spec de migração (031) se necessário.
