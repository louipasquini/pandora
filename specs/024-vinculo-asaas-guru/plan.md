# Implementation Plan: Vínculo Asaas↔Guru (pipeline etapa 4)

**Branch**: `024-vinculo-asaas-guru` | **Date**: 2026-09-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/024-vinculo-asaas-guru/spec.md`

## Summary

Pluga a etapa 4 (`RESOLVER_VINCULO`) do pipeline canônico, reservada desde a spec 006. Casa
uma transação Asaas terceirizada (`EventoCanonico.referenciaExterna.idOrigem`, transportado
pela spec 020) com a transação Guru correspondente (chave natural `id_origem`, conta pareada
PRD↔PRD/SVC↔SVC — CL-01), **nos 2 sentidos de chegada** (CL-02): quando a Asaas chega, procura
a Guru já persistida; quando a Guru chega, procura Asaas pendentes esperando por ela — tudo
dentro da mesma execução do `WorkerService` de ingestão já existente (spec 006), sem processo
novo. Ao resolver, grava `transacao.transacao_vinculada_id`, reclassifica a transação Asaas
para `COBRANCA_TERCEIRIZADA` (CL-03) e cria 1 registro imutável `vinculo_transacao`. A regra
"só a Guru soma receita" vira uma função de leitura pura que exclui `COBRANCA_TERCEIRIZADA` do
filtro `pagoDeFato` já existente (spec 018). Dois endpoints (`/tentar-vincular`,
`/tentar-vincular-pendentes`) reusam a mesma lógica de domínio como retry manual. Mora no
_bounded context_ **`financeiro`** (já dono de `transacao` desde a 018) — segue o mesmo padrão
de inversão de dependência das specs 018/023 (`ExecutorEtapaExterno` do `core` +
`src/pipeline-wiring.module.ts`), sem tocar `WorkerService`/`etapas.ts`/`classificar.ts`.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 24 (mesma stack do resto do backend).

**Primary Dependencies**: NestJS 11, Prisma 6, zod (schemas já existentes) — **0 dependência
nova**.

**Storage**: PostgreSQL 16 via Prisma — 1 migração nova (`vinculo_transacao` + 2 colunas em
`transacao` + FK de `transacao_vinculada_id`).

**Testing**: Jest (unit, domínio puro sem banco) + e2e contra Postgres real (padrão do
projeto, schema isolado por execução).

**Target Platform**: Linux server (mesmo deploy do resto do backend).

**Project Type**: Web application (backend NestJS + frontend React) — monorepo já existente.

**Performance Goals**: sem meta nova além do já estabelecido (etapa roda dentro do mesmo lote
do worker de ingestão, `INGESTAO_WORKER_LOTE` já existente).

**Constraints**: nenhuma escrita síncrona a API externa (Princípio VIII); vínculo resolvido
nunca é revertido automaticamente (Princípio VII).

**Scale/Scope**: 1 bounded context (`financeiro`, já não-vazio), 1 migração, ~2 permissões
RBAC novas, 2 endpoints novos + 1 filtro em endpoint existente + 1 campo novo no detalhe já
existente, sem frontend novo (estende `TransacaoDetailPage`/`TransacoesListPage` da 018).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Domínio, não origem**: `vinculo_transacao` tem ID surrogate UUID v7; nenhuma coluna
      de origem vira PK — `origemRef` é só o valor cru que casou, guardado para auditoria, não
      identidade. Granularidade: 1 vínculo = 1 par (transação Guru, transação Asaas) —
      decidida (CL-01: pareamento por conta) e documentada no spec.
- [x] **II. Clarificar antes de assumir**: CL-01/CL-02/CL-03 resolvidas com o dono do produto
      em 2026-09-11, antes deste plano (ver spec.md §Clarifications). Nenhum
      `NEEDS CLARIFICATION` aberto.
- [x] **III. Bordas finas**: o executor da etapa 4 não conhece formato de payload de
      plataforma nenhuma — só lê `EventoCanonico.referenciaExterna` (já normalizado pelos
      adapters 020/021) e a tabela `transacao` (já normalizada pela 018). Nenhum `if
      plataforma === 'ASAAS_PRD'` com lógica de parsing — só filtra por `PlataformaOrigem`
      (enum de domínio) para restringir a conta pareada.
- [x] **IV. Log de eventos + projeções**: a etapa 4 roda dentro do worker existente (transação
      própria por etapa, já garantido pelo `WorkerService` da 006); `vinculo_transacao` é uma
      projeção derivada do estado de `transacao`, nunca escrita fora do pipeline/dos 2
      endpoints que reusam a mesma lógica de domínio (sem 2ª via de escrita).
- [x] **V. Agregados derivados**: a regra de receita ("só a Guru soma") é 100% derivada na
      leitura (`classificacao != COBRANCA_TERCEIRIZADA` combinado ao status já existente) —
      **nenhum contador incremental, nenhuma coluna "conta como receita" nova**. Dinheiro não é
      tocado por esta spec (a transação Asaas mantém seu próprio `valorBruto`/`valorLiquido`
      já persistidos pela 018 — só deixa de contar no agregado de receita).
- [x] **VI. Contextos delimitados**: `financeiro` continua dono exclusivo de `transacao`;
      `ingestao` nunca importa `financeiro` (wiring na raiz, mesmo padrão 018/023).
- [x] **VII. Curadoria vs derivação**: vínculo resolvido automaticamente nunca é auto-revertido
      — nem pelo pipeline, nem pelos endpoints de retry (idempotentes, no-op se já vinculado).
      Reversão manual/alerta fica para a spec 027 — fora de escopo aqui.
- [x] **VIII. Superfície de escrita mínima**: 2 endpoints novos, ambos justificados pelo
      ROADMAP (retry manual, sem eles um vínculo perdido por ordem de chegada fora do comum
      ficaria preso para sempre sem via de correção); nenhuma chamada a API externa em nenhum
      dos dois — só reprocessamento de dados já no banco.
- [x] **Padrões Transversais**: `transacao_vinculada_id`/`vinculo_transacao` usam UUID v7;
      `resolvidoEm` é `timestamptz` UTC (`agoraUtc()` do core); `plataforma_origem` (via a
      transação ligada) segue dimensão de 1ª classe; nenhuma auditoria de curadoria manual
      nova é necessária além do próprio `vinculo_transacao` (que já é o registro imutável do
      "quando"/"quê" — não há edição humana de vínculo nesta spec, então não há uma tabela
      `_audit` separada; ver Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/024-vinculo-asaas-guru/
├── plan.md              # este arquivo
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── pipeline-executor-vinculo.md
│   └── vinculo-http.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                         # + vinculo_transacao, + 2 campos em Transacao
│   └── migrations/<ts>_financeiro_vinculo/
└── src/
    ├── financeiro/
    │   ├── domain/
    │   │   ├── vinculo/
    │   │   │   ├── conta-pareada.ts           # ASAAS_PRD↔GURU_PRD, ASAAS_SVC↔GURU_SVC (puro)
    │   │   │   ├── conta-pareada.spec.ts
    │   │   │   └── receita.ts                 # pagoDeFato(status, classificacao) — puro
    │   │   └── receita.spec.ts
    │   ├── application/
    │   │   ├── resolver-vinculo-etapa.service.ts   # ExecutorEtapaExterno, etapa 4
    │   │   ├── tentar-vincular.service.ts          # lógica reusada pelos 2 endpoints
    │   │   └── index.ts                            # + exports novos
    │   ├── infra/
    │   │   ├── vinculo.repository.ts
    │   │   └── transacao.repository.ts             # + referenciaExternaIdOrigem no upsert/filtros
    │   ├── transacao.controller.ts                 # + 2 rotas de vínculo
    │   └── financeiro.module.ts                    # + providers novos
    └── pipeline-wiring.module.ts                    # + import ResolverVinculoEtapaService

frontend/
└── src/
    └── transacoes/
        ├── TransacaoDetailPage.tsx    # + seção de vínculo + botão "Tentar vincular"
        └── TransacoesListPage.tsx     # + filtro "pendente de vínculo"
```

**Structure Decision**: Web application (backend NestJS 11 + frontend React 19, monorepo
`backend`/`frontend` já existente). Toda a lógica nova mora dentro do _bounded context_
`financeiro` (já dono de `transacao` desde a 018) — nenhum bounded context novo,
`CONTEXT_MODULES` segue 11. Único arquivo fora de `src/<contexto>/` tocado é
`src/pipeline-wiring.module.ts` (módulo de composição na raiz, mesmo precedente das specs
018/023).

## Complexity Tracking

> Nenhuma violação do Constitution Check acima — seção vazia por design.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
