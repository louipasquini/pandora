# Implementation Plan: Contratos · Aditivos · Fold (pipeline etapa 6)

**Branch**: `025-contratos-aditivos-fold` | **Date**: 2026-09-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/025-contratos-aditivos-fold/spec.md`

## Summary

Preenche o _bounded context_ `contratos` (vazio desde a spec 001) com sua 1ª entidade de
negócio: **`Contrato`** (único por `(pessoa, produto)`, perpétuo) e **`Aditivo`** (projeção
derivada de uma `transacao` aplicada ao contrato). Pluga a etapa 6 (`PROJETAR_CONTRATO`) do
pipeline canônico via `ExecutorEtapaExterno` do `core` + `src/pipeline-wiring.module.ts`
(mesmo padrão das specs 018/023/024, sem tocar `WorkerService`/`etapas.ts`). O núcleo é um
**fold puro e determinístico** (`contratos/domain/fold.ts`) sobre a lista de transações
qualificadas do contrato, recalculado do zero a cada nova transação — nunca incremental
(Princípio V). `status_canonico`/`acesso_liberado` são funções de leitura (nunca colunas
persistidas que dependam do tempo desde o último aditivo); um ajuste manual pontual
(`PATCH /contratos/{id}`) vence na leitura até a próxima transação qualificada chegar, quando
é automaticamente limpo (Regra Inviolável nº 13 — CL-01 do spec).

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 24 (NestJS 11, Prisma 6) — mesma stack de 018/023/024.
**Primary Dependencies**: nenhuma nova. Reusa `@prisma/client`, `zod` (DTO de query/patch),
`core` (`Dinheiro`, `parseInstante`/`agoraUtc`, `StatusContratoCanonico`/`contratoLiberaAcesso`,
`liberaAcesso`/`contaComoReceita`, `montarRegistroAuditoria`, `ExecutorEtapaExterno`).
**Storage**: PostgreSQL 16 via Prisma — 2 tabelas novas (`contrato`, `aditivo`) + 1 de
auditoria (`contrato_audit`) + 2 enums novos (`StatusContratoCanonico` espelhado no Prisma,
`AditivoRotulo`) + ativação da FK `transacao.contrato_id` (coluna já existe desde a 018).
**Testing**: Jest unitário (fold puro, 100% sem banco) + Jest e2e (Postgres real, schema
isolado por execução — `backend/test/setup-db.ts` já existente) + Vitest/RTL no frontend.
**Target Platform**: API HTTP interna (NestJS) + painel React (Vite).
**Project Type**: monorepo web (backend + frontend), já existente.
**Performance Goals**: sem meta nova — leitura paginada de `contrato` com filtro de status
computado em SQL (`CASE`), não em memória; fold roda dentro da transação da etapa 6 do worker,
mesma disciplina de custo das etapas 018/023/024 (uma transação Postgres por etapa).
**Constraints**: `contratos` está nas zonas do ESLint `import/no-restricted-paths` — não pode
importar `src/financeiro/**` nem `src/catalogo/**`; lê/escreve essas tabelas só via
`PrismaService` direto (precedente já estabelecido pela spec 023 em
`resolver-oferta-etapa.service.ts`). Nenhuma sincronização automática com API externa
(Princípio VIII, não aplicável aqui — não há API externa envolvida).
**Scale/Scope**: 2 entidades de negócio + 1 tabela de auditoria, 1 executor de etapa, ~3
endpoints (2 leitura + 1 PATCH), 1 migração, frontend (lista + detalhe com linha do tempo).

## Constitution Check

*Portão antes da Fase 0 (research). Releitura depois do design da Fase 1.*

| Princípio | Como esta spec cumpre |
| --- | --- |
| I. Modelar o domínio | `Contrato`/`Aditivo` com ID surrogate UUID v7 (`EntidadeId.novo()`); nenhum ID de origem se torna PK — a chave de negócio é `(pessoa_id, produto_id)`, ambos IDs surrogate já resolvidos por specs anteriores. |
| II. Clarificar antes de assumir | 4 decisões de fato documentadas no spec (`Clarifications`) antes deste plano; nenhum `NEEDS CLARIFICATION` pendente. |
| III. Bordas finas | Nenhuma regra de negócio conhece plataforma/origem — o fold só lê `classificacao`/`status_canonico`/valores/datas já canônicos da `transacao`. |
| IV. Ingestão como log + projeções | `Aditivo` é 100% projeção derivada, recalculada em transação própria a cada execução da etapa 6; nunca `commit()` de remendo; reprocessável a qualquer hora (FR-005). |
| V. Tudo agregado é derivado | `fim_acesso`/`ticket_total`/`valor_recebido` = `fold(transações)`, nunca incremento; `status_canonico`/`acesso_liberado` nem são persistidos — são funções de leitura. Dinheiro por `dict[moeda,valor]` (FR-007). |
| VI. Contextos delimitados | `contratos` não importa `financeiro`/`catalogo` (ESLint); lê/escreve as tabelas alheias só via Prisma direto, mesmo precedente da spec 023 (ver Complexity Tracking). |
| VII. Curadoria/derivação nunca se sobrescrevem | `tolerancia_atraso_dias`/`contrato_assinado` são colunas próprias, sem par derivado — nunca sobrescritas. O ajuste manual de status é a **exceção deliberada e já confirmada** pela Regra Inviolável nº 13 (CL-01) — documentada explicitamente para não ser confundida com o padrão geral. |
| VIII. Superfície de escrita mínima | Só 1 endpoint de escrita (`PATCH /contratos/{id}`, ajuste manual). `Contrato`/`Aditivo` nascem e mudam exclusivamente pelo pipeline — nenhum `POST`/`DELETE`. |

**Resultado**: PASS. Nenhuma violação; 1 item de Complexity Tracking (leitura/escrita
cross-schema via Prisma direto) documentado por já ter precedente aceito na spec 023.

## Project Structure

### Documentation (this feature)

```
specs/025-contratos-aditivos-fold/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── pipeline-executor.md
│   └── api.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
backend/src/contratos/
├── contratos.module.ts               # providers/controller; exporta ProjetarContratoEtapaService
├── domain/
│   ├── fold.ts (+ .spec.ts)          # fold puro: transações → {fimAcesso, ticketTotal, valorRecebido, aditivos[]}
│   ├── status-contrato.ts (+ .spec.ts) # deriva status/acessoLiberado na leitura (fimAcesso+tolerancia+ajuste+agora)
│   └── index.ts
├── application/
│   ├── projetar-contrato-etapa.service.ts (+ .spec.ts)  # ExecutorEtapaExterno da etapa 6
│   ├── contrato-query.service.ts (+ .spec.ts)           # GET /contratos[/:id]
│   ├── ajustar-contrato.service.ts (+ .spec.ts)         # PATCH /contratos/:id
│   └── index.ts
├── infra/
│   └── contrato.repository.ts        # Prisma: contrato/aditivo + leitura cross-context de transacao/oferta/oferta_catalogo
├── dto/
│   ├── listar-contratos.schema.ts
│   └── ajustar-contrato.schema.ts
└── contrato.controller.ts

backend/prisma/
├── schema.prisma       # + Contrato, Aditivo, ContratoAudit, enums StatusContratoCanonico/AditivoRotulo, FK transacao.contrato_id
└── migrations/<ts>_contratos_aditivo/

backend/src/pipeline-wiring.module.ts   # + import ContratosModule + ProjetarContratoEtapaService + definirExecutor

backend/src/auth/rbac/catalogo.ts       # + recurso `contrato`: ver, editar

frontend/src/contratos/
├── contratos-api.ts
├── ContratosListPage.tsx
├── ContratoDetailPage.tsx (linha do tempo de aditivos + ajuste manual)
└── *.test.tsx

frontend/src/app/router.tsx     # + rotas /contratos, /contratos/:id
frontend/src/shell/nav-items.ts # + item "Financeiro · Contratos"

docs/025-contratos-aditivos-fold.md
CLAUDE.md / README.md / ROADMAP.md     # atualizados ao final
```

**Structure Decision**: espelha exatamente o layout de `catalogo`/`financeiro` (domain puro sem
banco / application com o executor de etapa e os serviços de API / infra com o repositório
Prisma / dto com os schemas zod / um controller fino). Nenhuma estrutura nova introduzida.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada |
| --- | --- | --- |
| `contratos/infra/contrato.repository.ts` lê `transacao`/`oferta`/`oferta_catalogo` (tabelas "de" `financeiro`/`catalogo`) direto via `PrismaService`, e escreve `transacao.contrato_id` | O contrato de `ExecutorEtapaExterno` (spec 018) já é a única via de comunicação entre `ingestao` e o contexto a jusante — carrega só `resultados` (JSON) das etapas anteriores, nunca uma entidade rica. A ordem/tempo de acesso da oferta e os valores/status da transação são insumos indispensáveis do fold e não cabem inteiros no JSON de `resultados` sem duplicar campos já modelados como colunas Prisma. A spec 023 já abriu este precedente exato (`ResolverOfertaEtapaService` grava `transacao.oferta_id` direto) e o CLAUDE.md já documenta a leitura desta forma como aceitável: "a fronteira do Princípio VI é sobre import de módulo TypeScript, não sobre o schema". | Replicar toda a leitura via um novo contrato de inversão de dependência no `core` (padrão `PortaIdentidade`) foi considerado e rejeitado: adicionaria uma 3ª forma de acoplamento cross-contexto só para esta spec, quando a 1ª (via `resultados` do executor) já existe e a 2ª (leitura direta via Prisma) já tem precedente aceito e testado (spec 023). Duplicar tudo no JSON de `resultados` obrigaria `catalogo`/`financeiro` a "empacotarem" dados só para desempacotar aqui — mais código, 0 ganho de isolamento real (o Prisma Client já é compartilhado, como o `core`). |
