# 024 — Vínculo Asaas↔Guru (pipeline etapa 4)

Quinta fatia da **Fase 2 — Financeiro**. Materializa a regra de negócio "Guru terceiriza
cobrança para a Asaas": uma venda pode existir como **2 eventos** — transação Guru (venda de
registro) + pagamento Asaas (cobrança) — e **só a Guru soma receita**. A etapa 4
(`RESOLVER_VINCULO`) do pipeline canônico (spec 006) deixa de ser _no-op_. Mora no _bounded
context_ **`financeiro`** (já dono de `transacao` desde a spec 018). Detalhe completo:
[`specs/024-vinculo-asaas-guru/`](../specs/024-vinculo-asaas-guru/).

## Decisões (CL-01/02/03)

024 não estava marcada `⚠ clarify` no ROADMAP, mas 3 decisões de fato ambíguas foram levadas
ao dono do produto em 2026-09-11, antes do `plan.md`:

- **CL-01 — Escopo do pareamento de conta.** O casamento Asaas→Guru é **restrito à conta
  pareada**: `ASAAS_PRD` só casa com `GURU_PRD`; `ASAAS_SVC` só com `GURU_SVC`. Nunca cruza
  PRD↔SVC — reflete a fronteira de conta já usada em todo o projeto. Implementado como mapa
  **fechado** (`financeiro/domain/vinculo/conta-pareada.ts`, `contaGuruParDe`/
  `contaAsaasParDe`), mesmo padrão de "estratégia por conta é dado, não `if`" de
  `ESTRATEGIA_RESOLUCAO_OFERTA` (catalogo/023) e `MAPAS_STATUS` (financeiro/018). Testado por
  varredura das 7 contas — as 5 que não são Asaas/Guru devolvem `null`.
- **CL-02 — Resolução nos "2 sentidos de chegada" sem worker novo.** A etapa 4 resolve **de
  forma síncrona e bidirecional**, dentro da mesma execução do `WorkerService`/
  `WorkerScheduler` de ingestão já existente (spec 006) — **0 processo novo, 0 variável
  `.env` de worker nova**:
  - Quando a transação **Asaas** (com `referenciaExterna.idOrigem`) passa pela etapa 4,
    procura a transação **Guru** correspondente já persistida na conta pareada. Achou →
    vincula agora.
  - Quando a transação **Guru** passa pela etapa 4, procura entre as transações **Asaas**
    pendentes da conta pareada e vincula as que encontrar — cobre o caso em que a Asaas
    chegou primeiro, sem exigir nenhuma ação manual.
  - Os 2 endpoints do ROADMAP (`POST /transacoes/{id}/tentar-vincular` e
    `.../tentar-vincular-pendentes`) reusam a **mesma** lógica de domínio
    (`TentarVincularService`) como retry manual — para depois de reprocessamento manual de
    dados históricos, migração (spec 031), ou qualquer caso em que a resolução automática
    não tenha rodado.
- **CL-03 — Onde a regra de receita lê o vínculo.** Ao vincular, a etapa 4 reclassifica a
  transação Asaas para `classificacao = COBRANCA_TERCEIRIZADA` (valor já reservado no enum
  congelado desde a spec 006, com o comentário em `classificar.ts`: "cravar o vínculo
  Asaas↔Guru de fato é da spec 024"). A regra "só a Guru soma receita" vira uma **função de
  leitura pura** (`pagoDeFatoTransacao`) sobre `classificacao` — o filtro `pagoDeFato`
  (spec 018) passa a excluir `COBRANCA_TERCEIRIZADA` além dos status que já não contam.
  Nenhum efeito colateral de escrita em outro agregado (Princípio V).

## Domínio puro (`backend/src/financeiro/domain/vinculo/`, sem banco)

- `conta-pareada.ts` — `contaGuruParDe(plataforma): string | null`,
  `contaAsaasParDe(plataforma): string | null`. Devolvem `string` (não o enum) de propósito:
  quem chama repassa o valor tanto para o `PlataformaOrigem` do `core` quanto para o do
  `@prisma/client` — dois enums TS nominalmente distintos com os mesmos valores; manter a
  função livre desse acoplamento evita cast nos dois sentidos.
- `receita.ts` — `pagoDeFatoTransacao(statusCanonico, classificacao): boolean` =
  `contaComoReceita(status) && classificacao !== 'COBRANCA_TERCEIRIZADA'`.

## Pipeline etapa 4 (`RESOLVER_VINCULO`)

`ResolverVinculoEtapaService` implementa `ExecutorEtapaExterno` do `core` — contrato já
existente desde a spec 018, sem alteração. Registrado em `src/pipeline-wiring.module.ts`
junto dos executores das etapas 2/3/5 — **nenhuma mudança em
`WorkerService`/`etapas.ts`/`classificar.ts`**.

- Ramo **Asaas** (com `referenciaExterna.idOrigem`): resolve agora se achar a Guru pareada;
  senão fica pendente (`status: 'ok'`, **nunca** `erro`/`revisar` — pendente é estado válido,
  Regra Inviolável nº 15 corta para os dois lados: "nunca um palpite" também vale para não
  marcar erro onde não há erro).
- Ramo **Guru**: resolve as Asaas pendentes da conta pareada que apontam para ela.
- Qualquer outra plataforma (TMB/Hotmart): `status: 'pulada'`.

A lógica de domínio (`TentarVincularService.tentarComoAsaas`/`tentarComoGuru`/
`tentarPendentes`) é a **mesma** usada pelos 2 endpoints HTTP de retry — garante que o
comportamento automático e o manual nunca divirjam. `tentarComoAsaas` **nunca lança** para um
estado de negócio válido (sem referência externa, Guru ainda não existe, conflito) — só o
ponto de entrada `tentar(transacaoId)` lança `NotFoundException`/`UnprocessableEntityException`
para entrada inválida, e só o controller HTTP decide quando isso vira 404/422.

**Conflito de dado** (2 transações Asaas apontando para a mesma Guru): `VinculoRepository.
buscarVinculoPorGuru` detecta antes de criar; se a Guru já está vinculada a **outra** Asaas,
a nova marca `precisaRevisao` (motivo acumulado, nunca sobrescreve um motivo já gravado por
outra etapa — mesmo padrão de `ResolverOfertaEtapaService`/023) em vez de duplicar o vínculo.

## Migração Prisma (18ª — `20260911180358_financeiro_vinculo`)

- `transacao.referencia_externa_id_origem` (novo, `String?`) — cru, gravado por
  `UPSERT_TRANSACAO` (etapa 3, estendida nesta spec) independente de plataforma; a etapa 4 o
  consome sem depender de reconsultar o `EventoCanonico` original (mesmo raciocínio de
  `oferta_codigo_origem`/`oferta_nome_origem` da 018) — essencial para o retry manual
  (`tentar-vincular-pendentes`) operar só sobre dados já no banco, sem tocar `ingestao`.
  Índice `@@index([plataformaOrigem, referenciaExternaIdOrigem])`.
- `transacao.transacao_vinculada_id` — coluna nua reservada desde a spec 018; esta spec
  **ativa** a `@relation` (self, `onDelete: SetNull`).
- `VinculoTransacao` (nova) — `id` UUID v7, `transacaoGuruId`/`transacaoAsaasId`
  **`@unique` cada** (1 vínculo = 1 par, nos dois sentidos), `origemRef` (valor cru que
  casou — guardado mesmo que `transacao.referencia_externa_id_origem` já carregue o mesmo
  valor, para o registro ficar autocontido), `resolvidoEm` `@db.Timestamptz(6)`. **Imutável
  — sem `UPDATE`/`DELETE`** (Princípio VII; reversão/alerta é escopo da spec 027). 2
  relations nomeadas (`"VinculoGuru"`/`"VinculoAsaas"`) para `Transacao` — 1ª vez no projeto
  que 2 FKs de um model apontam para o mesmo model relacionado.

Migração **não-destrutiva**: só `ADD COLUMN`/`CREATE TABLE`/`ADD CONSTRAINT`.

## RBAC (spec 004 estendida)

**+1** permissão: `transacao:vincular` (recurso `transacao`, já existente desde a 018).
Leitura (vínculo no detalhe/filtro de pendentes) reusa `transacao:ver` — **0** permissão
nova de leitura. `administrador`/credencial de serviço concedem de graça, **0 migração de
dados**.

## Endpoints

Todos sob `/financeiro/transacoes` (controller já existente desde a 018).

- `POST /financeiro/transacoes/{id}/tentar-vincular` (`transacao:vincular`) — idempotente;
  `422 transacao_nao_terceirizada` se a Asaas não tem referência externa; `422
  plataforma_nao_aplicavel` fora de Asaas/Guru; `404` se a transação não existe; `200` no-op
  se já vinculada.
- `POST /financeiro/transacoes/tentar-vincular-pendentes` (`transacao:vincular`) — varre
  todas as Asaas pendentes, devolve `{tentativas, resolvidos}`; nunca erro por "nada
  pendente".
- `GET /financeiro/transacoes` — novo filtro `vinculoPendente` (booleano; estado **sempre
  derivado**: Asaas + `referenciaExternaIdOrigem` presente + `transacaoVinculadaId` nulo,
  nenhuma coluna de status extra — Princípio V).
- `GET /financeiro/transacoes/{id}` — novo campo `vinculo`
  (`{transacaoVinculadaId, origemRef, resolvidoEm}` ou `null`) + `vinculoPendente`.

Ver [`contracts/pipeline-executor-vinculo.md`](../specs/024-vinculo-asaas-guru/contracts/pipeline-executor-vinculo.md)
e [`contracts/vinculo-http.md`](../specs/024-vinculo-asaas-guru/contracts/vinculo-http.md).

## Frontend

`frontend/src/transacoes/` (spec 018 estendida, mesma subpasta):

- `TransacaoDetailPage.tsx` — seção "Vínculo Asaas↔Guru": link para a transação vinculada +
  timestamp de resolução quando existe; aviso "pendente de vínculo" + botão **Tentar
  vincular** (`TentarVincularButton.tsx`, atrás de `transacao:vincular`, mesmo padrão do
  `ReprocessarButton.tsx`/006) quando pendente. Nunca oferece desfazer um vínculo já
  resolvido (Princípio VII).
- `TransacoesListPage.tsx` — filtro "pendente de vínculo", badge correspondente na lista, e
  ação em lote **Tentar vincular pendentes** com contagem de resultado.

## Testes

- **928 unitários backend** (7 novos — `conta-pareada.spec.ts`, `receita.spec.ts`, domínio
  puro, sem banco).
- **441 e2e** (8 novos em `test/financeiro-vinculo.e2e-spec.ts`, Postgres real): US1 Guru
  primeiro → vínculo automático + `COBRANCA_TERCEIRIZADA` + reprocessar não duplica; US2
  Asaas primeiro → pendente → resolvido sozinho ao chegar a Guru, sem endpoint manual; US2b
  pareamento de conta nunca cruza PRD/SVC; US3 retry manual idempotente + sem par + `422`
  plataforma não aplicável + `404` inexistente + bulk; regra de receita exclui
  `COBRANCA_TERCEIRIZADA` de `pagoDeFato`; RBAC 403/200. `test/ingestao.e2e-spec.ts`
  (spec 006/018) teve 2 asserções atualizadas — `RESOLVER_VINCULO` agora roda de verdade em
  vez de `pulada` (mesmo padrão de regressão correta e documentada das specs 018/023
  anteriores, não uma quebra).
- **134 frontend** (4 novos em `TransacaoVinculo.test.tsx`): badge de pendente na lista,
  gate de permissão (sem `transacao:vincular` nenhum botão aparece), resolução via retry
  manual no detalhe, ação em lote na lista.

Validado também manualmente no navegador de ponta a ponta: evento Guru + evento Asaas com
referência externa → vínculo automático e reclassificação visíveis no painel; Asaas antes da
Guru → badge "vínculo pendente" + botão "Tentar vincular" mostrando "ainda sem par — continua
pendente"; transação já vinculada mostrando o link para a venda Guru e a nota "não conta como
receita própria — só a venda Guru soma".

## Fora de escopo (specs futuras)

- Reversão/alerta de um vínculo aplicado por engano — spec 027 (reconciliação e alertas).
- Endpoint de listagem dedicado para `vinculo_transacao` — o vínculo é exposto no detalhe da
  transação (Princípio VIII); a 027 pode agregar uma visão própria.
