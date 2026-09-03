# Implementation Plan: evento_origem e worker de ingestão — event log canônico e pipeline em etapas

**Branch**: `006-evento-origem-worker` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-evento-origem-worker/spec.md`

## Summary

Preencher o _bounded context_ **`ingestao`** (vazio desde a 001) com o **backbone de
ingestão**: o event log imutável `evento_origem`, o contrato `EventoCanonico`, o registro
por etapa `evento_etapa` e o **worker in-process** que roda o pipeline canônico da visão
5.3 em **etapas ordenadas com dependências declaradas, commit próprio e idempotência**.
Nesta spec só as etapas **0 (REGISTRAR)** e **1 (CLASSIFICAR)** executam; **2–6 são _no-op_
plugáveis** que as specs 018/023/024/025 substituem sem tocar o worker. Sem porta nova, **0
dependência nova**, `CONTEXT_MODULES` segue **11**.

1. **Domínio puro** (`src/ingestao/domain/`, testável sem banco):
   - `evento-canonico.ts` — schema `zod` do contrato `EventoCanonico` + tipo inferido.
     Valores monetários por `Dinheiro`/`Moeda` do `core`; instantes por `parseInstante`.
   - `hash-evento.ts` — `hashEvento(payloadBruto) → string`: canonicaliza (chaves ordenadas,
     sem espaço irrelevante) e aplica SHA-256 (`node:crypto`). Puro, livre de _locale_.
   - `classificar.ts` — `classificar(canonico, tipoOrigem) → { classificacao, revisar,
     motivo? }`. Enum congelado `Classificacao`. Regras locais: `REEMBOLSO` por
     estorno/`tipo_origem`; `RECORRENCIA` por sinal de assinatura; `VENDA_AFILIADA` por
     `ehAfiliada`; `COBRANCA_TERCEIRIZADA` por `referenciaExterna` a outra plataforma; senão
     `VENDA_PROPRIA`. Sem `canonico` ou regra indecidível → `DESCONHECIDO` + `revisar`.
     Função pura, determinística.
   - `etapas.ts` — o **registro ordenado de etapas** com dependências declaradas:
     `REGISTRAR(0) → CLASSIFICAR(1) → RESOLVER_PESSOA(2) → UPSERT_TRANSACAO(3)`;
     `RESOLVER_VINCULO(4)`, `RESOLVER_OFERTA(5)`, `PROJETAR_CONTRATO(6)` dependem de `3`.
     Cada etapa: `nome`, `ordem`, `dependeDe[]`, `especDona` (nº da spec), `executar()`.
   - `plano-passada.ts` — puro: dado o estado das `evento_etapa` de um evento + o registro,
     decide para cada etapa `EXECUTAR | BLOQUEADA | PULAR | JA_OK | ESGOTADA` e o `status`
     final derivado do evento (`ok`/`revisar`/`erro`). Sem I/O.
2. **Persistência Prisma** (4ª migração de negócio — `prisma/migrations/<ts>_ingestao/`):
   `EventoOrigem`, `EventoEtapa`. PK `String @id @db.Uuid` via `EntidadeId.novo()`;
   `@db.Timestamptz(6)` em tudo; `payloadBruto`/`eventoCanonico`/`resultado` como `Json`;
   `@@unique([plataformaOrigem, idOrigem, hash])` em `EventoOrigem`;
   `@@unique([eventoOrigemId, etapa])` em `EventoEtapa`; índices por `plataformaOrigem`,
   `status`, `recebidoEm`. **Sem seed de negócio.**
3. **Aplicação** (`src/ingestao/application/`):
   - `registrar-evento.service.ts` — `registrarEvento(entrada) → { eventoId, criado }`:
     valida a entrada (zod), calcula `hash`, faz **upsert idempotente** pela chave única
     (reentrega → `criado: false` + incrementa `reentregas`), cria a `EventoEtapa`
     `REGISTRAR = ok` e as demais `pendente`. Commit próprio. É a **porta exportada**.
   - `worker.service.ts` — `processarPassada() → ResumoPassada`: seleciona eventos com
     trabalho elegível (`pendente`/`bloqueada`, ou `erro` com `tentativas < MAX`), trava
     linha a linha (`SELECT … FOR UPDATE SKIP LOCKED` via `$queryRaw` numa transação curta
     por evento), roda `plano-passada` e executa cada etapa em **transação própria**,
     gravando `EventoEtapa` + derivando `EventoOrigem.status`/`classificacao`. Idempotente.
   - `worker.scheduler.ts` — `setInterval` in-house (`OnModuleInit`/`OnModuleDestroy`),
     intervalo `INGESTAO_WORKER_INTERVALO_MS`, **desligado** se
     `INGESTAO_WORKER_ENABLED=false` (default em `NODE_ENV=test`). Reentrância protegida por
     _flag_ + o `SKIP LOCKED`. Erro na passada é logado, não derruba o processo.
   - `reprocessar-evento.service.ts` — devolve `EventoEtapa` não-`ok` a `pendente`, zera
     `tentativas`, evento → `pendente`; grava **1** `RegistroAuditoria` (core,
     `AJUSTE_MANUAL`) via a tabela `ingestao_audit` (mesma forma do `rbac_audit`/
     `clientes_audit`). `forcar` reprocessa a partir da etapa 1. 409 se `processando`.
   - `etapas-noop/` — `resolver-pessoa.noop.ts` … `projetar-contrato.noop.ts`: devolvem
     `{ status: 'pulada', resultado: { implementadaNa: 18 } }`. Registradas no `ETAPAS`.
   - `eventos.query.ts` — leitura paginada/filtrada para o painel.
4. **HTTP** (`src/ingestao/`):
   - `eventos.controller.ts` —
     `GET /ingestao/eventos` (`evento:ver`), `GET /ingestao/eventos/{id}` (`evento:ver`),
     `POST /ingestao/eventos` (`evento:ingerir`), `POST /ingestao/eventos/{id}/reprocessar`
     (`evento:reprocessar`), `POST /ingestao/eventos/processar` (`evento:reprocessar`).
     Zod DTOs em `dto/`. Nenhuma rota `@Public()`/`@AutenticadoBasta()`; **nenhuma**
     `/webhooks/*`.
5. **Config** (`src/config/env.schema.ts`): + `INGESTAO_WORKER_ENABLED`
   (`z.coerce.boolean`, default `true`, forçado `false` em test no `setup`),
   `INGESTAO_WORKER_INTERVALO_MS` (int, default `5000`), `INGESTAO_WORKER_MAX_TENTATIVAS`
   (int, default `3`), `INGESTAO_WORKER_LOTE` (int, default `50`). `core` re-exporta o
   contrato tipado (Padrão 002). `.env`/`.env.example`/`ci.yml` ganham as chaves.
6. **RBAC** (`src/auth/rbac/catalogo.ts`): + recurso `evento` — `evento:ver`,
   `evento:reprocessar`, `evento:ingerir` (rótulos pt-BR). `RbacRouteAudit` do boot já
   valida. `administrador` (special-case) e a credencial de serviço concedem de graça.
7. **Frontend** (`frontend/src/eventos/`): item de navegação **Eventos**
   (`requerPermissao: 'evento:ver'`); rota `/eventos` + `/eventos/:id` sob
   `<RequirePermissao>`; lista com filtros (conta/status/tipo/data) + paginação, _default_
   `status ∈ {revisar,erro}`; detalhe com `payload_bruto` formatado (container com rolagem)
   + linha do tempo das `evento_etapa`; botão **Reprocessar** só com `evento:reprocessar`.
   `apiFetch` já trata 401/403 (003/004) — nada novo.

Abordagem: **0 dependência nova** (backend e frontend). O worker é `setInterval` in-house
(como o rate limiter da 003 e a validação de doc da 005 — o projeto não adiciona dep para
o que cabe em ~30 linhas). Testes: unit sem banco (`hashEvento` determinístico/estável;
`classificar` — cada regra + `DESCONHECIDO`→`revisar` + determinismo; `plano-passada` —
`bloqueada` por dependência, `esgotada` por tentativas, `status` final derivado;
`EventoCanonico` zod aceita/rejeita); e2e Postgres real (migração; `registrarEvento`
idempotente + dedup em rajada; `processar` síncrono leva evento a `ok`/`revisar`; etapa
_fake_ que falha K× → retry até `MAX` → `erro` terminal; etapa _fake_ dependente →
`bloqueada`; reprocessar zera `tentativas` + grava 1 auditoria; guard 401/403/200;
regressão 003/004/005; `/health` = 11). Ao fim: `docs/006-evento-origem-worker.md` +
`CLAUDE.md`/`README.md`/`ROADMAP.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova.** NestJS 11, Prisma `^6.2.1` + `@prisma/client` (2 models
  novos), `zod` 3 (contrato `EventoCanonico` + DTOs), `@nestjs/config` 4. Hash via
  `node:crypto` (SHA-256). Agendamento via `setInterval` in-house (`@nestjs/schedule`
  **avaliado e rejeitado** — ver research: 1 dep + `ScheduleModule` global para o que são
  ~30 linhas; o projeto já rola _rate limit_ e validação de doc à mão). `EntidadeId`,
  `agoraUtc`, `parseInstante`, `PlataformaOrigem`, `Dinheiro`/`Moeda`,
  `montarRegistroAuditoria` vêm do `core`.
- Frontend: **nenhuma nova.** React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch` central (003/004).

**Storage**: **PostgreSQL 16 via Prisma** — 4ª migração de negócio (após `_rbac`,
`_clientes`, `_clientes_primario_unico`). 3 tabelas: `evento_origem`, `evento_etapa`,
`ingestao_audit`. `payload_bruto`/`evento_canonico`/`resultado`/`snapshot` de auditoria
como `Json`/`Jsonb`. Sem porta nova (mesmo `DATABASE_URL`/`TEST_DATABASE_URL`, Postgres dev
host `55432`).

**Testing**:
- Backend unit (`jest`, sem banco): `hash-evento.spec.ts` (mesma entrada → mesmo hash;
  ordem de chaves irrelevante; _locale_/`TZ` irrelevante; payload alterado → hash
  diferente), `classificar.spec.ts` (cada regra local; ausência de canônico → `DESCONHECIDO`
  + `revisar`; valor fora do enum → `DESCONHECIDO`; determinismo N×), `plano-passada.spec.ts`
  (dependência não-`ok` → `BLOQUEADA`; `tentativas == MAX` → `ESGOTADA`, não executa; todas
  `ok`/`pulada` → evento `ok`; alguma `erro` → evento `erro`; alguma `revisar` sem `erro` →
  `revisar`), `evento-canonico.spec.ts` (zod aceita mínimo válido; rejeita moeda ausente,
  instante lixo, `plataforma_origem` fora do enum).
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` já roda
  `migrate deploy` + `db seed`; `INGESTAO_WORKER_ENABLED=false` no `setup` — o e2e chama
  `processarPassada` pelo endpoint `/processar` ou pelo provider):
  - migração cria `evento_origem`/`evento_etapa`/`ingestao_audit`; `db seed` não quebra.
  - `POST /ingestao/eventos` (201 + `criado:true` + `REGISTRAR=ok`; reentrega idêntica →
    200 + `criado:false` + `reentregas` incrementado + payload original intacto; `id_origem`
    vazio → 422; `plataforma_origem` inválida → 422; payload não-JSON → 422).
  - dedup em rajada: 10 chamadas concorrentes com a mesma chave → 1 linha.
  - `POST /ingestao/eventos/processar` → evento com canônico válido chega a `ok`
    (`CLASSIFICAR=ok`, 2–6 `pulada`); sem canônico → `revisar` (`CLASSIFICAR` sinaliza).
  - etapa _fake_ registrada no teste: (a) falha 2× e passa na 3ª com `MAX=3` → `tentativas`
    1→2→3, termina `ok`; (b) falha sempre → após 3 passadas fica `erro` terminal, 4ª passada
    não a toca; (c) depende de outra `erro` → `bloqueada`, não executa; vira `pendente`
    quando a dependência fica `ok`.
  - falha isolada: 3 eventos, 1 com etapa _fake_ que falha → os outros 2 chegam a `ok`.
  - `POST /ingestao/eventos/{id}/reprocessar` → `EventoEtapa` não-`ok` voltam a `pendente`,
    `tentativas` zerado, evento `pendente`, **1** linha em `ingestao_audit` (quem/quando);
    `processando` → 409; id inexistente → 404; evento todo `ok` sem `forcar` → no-op.
  - idempotência: `processarPassada` 3× sobre backlog sem falha → estado idêntico, 0 etapa
    `ok` reexecutada.
  - guard: `GET /ingestao/eventos` sem token → 401; token de `Usuario` sem perfil → 403;
    credencial de serviço → 200. Nenhuma rota `/webhooks/*` existe (404).
  - **regressão**: `auth`/`rbac`/`clientes`/`health`/`context-modules` (ainda 11) verdes.
- Frontend (`vitest` + Testing Library, jsdom): lista Eventos (filtros, paginação, _default_
  `revisar`+`erro`), detalhe (payload formatado, linha do tempo de etapas com status/erro/
  tentativas), nav esconde **Eventos** sem `evento:ver`, rota direta sem permissão → tela
  "sem permissão" (não Login), 403 numa chamada → banner + sessão intacta, **Reprocessar**
  só com `evento:reprocessar`.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (configuráveis,
spec 001). Dev Windows + Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta funcional. Uma passada processa até `INGESTAO_WORKER_LOTE`
eventos (default 50) por invocação; a seleção usa índice em `status`/`recebidoEm`. Cada
etapa abre transação curta própria. `GET /ingestao/eventos` pagina (default 25, teto 100).
O volume histórico (reingest da 031) é absorvido em passadas sucessivas, não numa só.

**Constraints**:
- **Nenhuma porta nova** (`netstat`/`docker ps` confirmam 3001/5174/55432 do próprio
  projeto; nada novo é aberto; reusa `DATABASE_URL`/`TEST_DATABASE_URL`).
- **Evento cru imutável** (Princípio IV): `payload_bruto`/`hash`/`plataforma_origem`/
  `id_origem`/`recebido_em` nunca sofrem `UPDATE` na aplicação; só `status`/`erro_detalhe`/
  `classificacao`/`reentregas`/`atualizado_em` mudam.
- **Pipeline em etapas com commit próprio** (Princípio IV): cada etapa numa transação
  Prisma própria; **sem** `commit()` de remendo, **sem** estado mutável pendurado em objeto
  ORM. O resultado de cada etapa é a linha `evento_etapa` (explícito).
- **Idempotência** (Princípios IV/V): `registrarEvento` por chave única; worker só executa
  etapa `pendente`/`bloqueada`/`erro<MAX`; `status` do evento é **derivado** das
  `evento_etapa` (`f(etapas) → status`), nunca um contador.
- **Bordas finas** (Princípio III): nenhum código do worker conhece "Guru"/"Asaas"/etc.;
  `plataforma_origem` é valor do enum de 7 do `core`. `classificar` opera sobre
  `EventoCanonico` canônico, não sobre payload de plataforma. Adapters e `status_map` são
  as specs 019–022.
- **Auditoria** (Padrão Transversal): só o **reprocessamento manual** grava
  `RegistroAuditoria` (`ingestao_audit`, forma do `core`, `AJUSTE_MANUAL`, _append-only_).
  O worker registra em `evento_etapa` (log operacional, não `_audit`).
- **RBAC 004**: todo endpoint sob `@RequerPermissao`; 403 ≠ 401 (corpo genérico da 004).
- Regra ESLint `import/no-restricted-paths` (001): `ingestao` importa só `core` e `auth`
  (infra transversal). **Não** importa `financeiro`/`clientes`/`catalogo`/`contratos` — as
  etapas 2–6 _no-op_ não referenciam nenhuma entidade desses contextos (SC-012). O consumo
  futuro (018 pluga a etapa real) decide a forma na 018.
- Regra ESLint `no-restricted-syntax` (002): sem `process.env` fora de `config/`/`core/` —
  o worker lê as chaves via `ConfigService`/contrato do `core`.
- `evento_origem`/`evento_etapa` na parte imutável e `ingestao_audit` são _append-only_ (a
  aplicação nunca `DELETE`; `evento_etapa` só faz `UPDATE` das colunas de progresso).

**Scale/Scope**: ~24 arquivos novos no backend (`src/ingestao/{domain,application,infra}/**`,
`eventos.controller.ts`, `dto/**`, `ingestao.module.ts` reescrito,
`prisma/migrations/<ts>_ingestao/`, `test/ingestao.e2e-spec.ts` + `test/support/ingestao.ts`),
~8 no frontend (`src/eventos/**`, testes), **0 dep nova**, **1 migração**, **5 endpoints**
novos (2 leitura + 3 escrita: `POST /eventos`, `/reprocessar`, `/processar`), ~7 arquivos
tocados (`schema.prisma`, `src/config/env.schema.ts`, `src/core/config/*` re-export,
`src/auth/rbac/catalogo.ts` + `.spec.ts`, `frontend/src/app/router.tsx`,
`frontend/src/shell/nav-items.ts`, `frontend/src/test/setup.ts` — `fetch` default cobre
`/ingestao/eventos`), `.env`/`.env.example`/`ci.yml` (+4 chaves), 1 doc novo, 3 docs
atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: `evento_origem`/`evento_etapa`/`ingestao_audit` nascem com
      **ID surrogate UUID v7** gerado na app (`EntidadeId.novo()`), decidido antes do
      schema. `id_origem` é **coluna comum** (parte da chave natural de dedup
      `(plataforma_origem, id_origem, hash)`), **nunca** PK (SC-008) — a PK é sempre
      `@db.Uuid`. Não há `*_origem_ref` aqui porque `evento_origem` **é** o registro de
      origem; a resolução de entidades (que usa `*_origem_ref`) é das specs 018+.
      Granularidade documentada em `data-model.md`: 1 `evento_origem` por
      `(plataforma_origem, id_origem, hash)`; 1 `evento_etapa` por `(evento, etapa)`.
- [x] **II. Clarificar antes de assumir**: 5 clarificações resolvidas com o dono do produto
      em 2026-09-03 (CL-01 worker in-process + gatilho; CL-02 porta + HTTP; CL-03 taxonomia
      canônica com regras locais; CL-04 dependência declarada → `bloqueada`; CL-05 retry até
      `MAX`) — spec §Clarifications. Zero `NEEDS CLARIFICATION`. O que depende de contexto
      cross-transação (Asaas↔Guru, catálogo de afiliados, coerência `tipo_origem`) é
      **explicitamente** empurrado para 024/026 como `DESCONHECIDO` + `revisar` — não
      assumido. Adapters, `/webhooks/*` e etapas 2–6 reais → 018–025.
- [x] **III. Bordas finas, núcleo canônico**: o worker e `classificar` **não** conhecem
      plataforma — operam sobre `EventoCanonico`. `plataforma_origem` é valor do enum de 7
      do `core`. Nenhum adaptador nem `status_map` nesta spec (são 019–022); o contrato
      `EventoCanonico` é o **modelo canônico** para o qual esses adapters vão converter.
- [x] **IV. Log de eventos + projeções**: **é a spec que materializa o Princípio IV.**
      `evento_origem` imutável = fonte de verdade; `evento_etapa` = projeção reconstruível.
      Pipeline em **etapas ordenadas com dependência declarada**, cada uma **idempotente**,
      **transação própria**, **resultado explícito** (`evento_etapa`). Falha isolada (não
      bloqueia anteriores nem outros eventos; dependente vira `bloqueada`). `status` do
      evento é `f(etapas)`. **Sem** `commit()` de remendo, **sem** `_houve_mudanca` no ORM.
      Reprocessável a qualquer hora (`/reprocessar`, `/processar`).
- [x] **V. Agregados derivados**: `evento_origem.status` e `classificacao` são **derivados**
      das `evento_etapa` a cada passada — nunca `estado += delta`. `reentregas` é contador
      de fato, mas **não** um agregado de negócio (é telemetria de dedup, idempotente:
      reprocessar não o infla porque a 2ª entrega resolve pela linha existente). `Dinheiro`
      no `EventoCanonico` é `dict`-equivalente (`{ valorInteiro, moeda }`), nunca soma
      moedas — e nesta spec nem é somado (só transportado).
- [x] **VI. Contextos delimitados**: `IngestaoModule` passa a ser **módulo de contexto
      real** (já estava em `CONTEXT_MODULES` — segue 11; `context-modules.e2e-spec.ts` não
      muda). `ingestao` importa só `core` (global) e `auth` (infra transversal — decorator/
      `Permissao`); **não** importa `financeiro`/`clientes`/`catalogo`/`contratos`/`crm`/
      `marketing`/`central` (ESLint). As etapas 2–6 são _no-op_ **dentro** do `ingestao`;
      quando 018 plugar a real, o consumo de `clientes.resolverOuCriar`/`financeiro` será
      **observar/comandar via porta**, decidido na 018. CRM (014) e Marketing (035)
      **observam** `evento_origem` — leitura, nunca escrita.
- [x] **VII. Curadoria vs derivação**: N/A direto — não há campo curado nesta spec
      (`evento_origem` é 100% derivado da origem; correção humana é **reprocessar**, não
      editar o payload). O reprocessamento é auditado (`ingestao_audit`); um evento já
      aplicado **não** é auto-revertido — `/reprocessar` é ação explícita e a etapa de
      _upsert_ (018) que decidirá reconciliação. Nenhuma reversão silenciosa.
- [x] **VIII. Superfície de escrita mínima**: **5 endpoints novos** — 2 leitura
      (`GET /ingestao/eventos`, `GET /ingestao/eventos/{id}`) + 3 escrita
      (`POST /ingestao/eventos` = a porta de ingestão; `POST …/{id}/reprocessar`;
      `POST …/processar` = gatilho do worker). Justificativa registrada: a porta de
      ingestão é **o** ponto de entrada do sistema (sem ela não há dado); `reprocessar` e
      `processar` são operação, não CRUD de negócio. **Sem** `DELETE`, **sem** `PATCH` de
      evento (imutável), **sem** `/webhooks/*` (019–022), **sem** sincronização automática
      com API externa. Cada escrita sob `@RequerPermissao`.
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para `evento_origem`/`evento_etapa`/`ingestao_audit`
        (`id String @id @db.Uuid`). `id_origem` é coluna comum, nunca PK.
      - **Dinheiro**: `EventoCanonico` usa `{ valorInteiro: bigint, moeda }` do `core`
        (escala ×10000, sem float); nesta spec só transportado/validado, nunca somado.
      - **Tempo**: `@db.Timestamptz(6)` em tudo; `recebidoEm`/`executadoEm`/`criadoEm`/
        `atualizadoEm` via `agoraUtc()`; instantes do `EventoCanonico` por `parseInstante`
        (ISO/epoch/lixo→`null`+motivo).
      - **Status**: `evento_origem.status ∈ {pendente, ok, erro, revisar}` (exatamente o
        Padrão Transversal). Classificação desconhecida → `revisar` (nunca "chuta" —
        regra #15). A tradução de status **bruto** de plataforma → `StatusTransacaoCanonico`
        é dos adapters (019–022); aqui o `EventoCanonico` carrega o status de origem cru.
      - **Idempotência**: `registrarEvento` e cada etapa do worker são reprocessáveis sem
        duplicar efeito.
      - **Auditoria**: `criadoEm`/`atualizadoEm` em tudo; `ingestao_audit` na forma
        `RegistroAuditoria` (core 002), `AJUSTE_MANUAL`, _append-only_ — só reprocessamento
        manual. Painel consolidado = 053; operacional = 029.
      - **Erros de ingestão**: `evento_origem.status` + `erro_detalhe` + painel de
        `revisar`/`erro`. Nada some (SC-004).
      - **Multi-conta**: `evento_origem.plataformaOrigem` (enum 7) indexado; filtro do
        painel e da seleção do worker.
      - **LGPD / retenção**: `payload_bruto` retido integral; política = spec 055; PII do
        comprador → pseudonimização de `pessoa` (047), não aqui.
      - **Dependência nova**: nenhuma (`@nestjs/schedule` avaliado e rejeitado em research).

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking vazio** — a spec fica
no mínimo: 3 tabelas, 5 endpoints (todos justificados como entrada/operação, não CRUD),
worker in-house sem dep, etapas 2–6 _no-op_ (não antecipam trabalho de outra spec).

*Re-check pós-Phase 1: **PASS** — o design manteve `ingestao` sem importar contexto de
domínio (etapas 2–6 são _no-op_ locais), evento cru imutável com etapas em transação
própria, `status` derivado, `CONTEXT_MODULES` em 11, e `id_origem` como coluna comum (nunca
PK). Ver `data-model.md` e `contracts/`.*

## Project Structure

### Documentation (this feature)

```text
specs/006-evento-origem-worker/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões: worker in-house vs @nestjs/schedule;
│                        #   trava de concorrência (SKIP LOCKED); forma do hash;
│                        #   contrato EventoCanonico (campos obrigatórios vs opcionais);
│                        #   registro de etapas + dependências; retry até MAX;
│                        #   ingestao_audit próprio; endpoint /processar como gatilho e2e
├── data-model.md        # Phase 1 — 3 models Prisma, invariantes, unicidades, o registro
│                        #   ETAPAS + grafo de dependências, máquina de estado de
│                        #   evento_etapa e de evento_origem, o contrato EventoCanonico
├── quickstart.md        # Phase 1 — env, prisma migrate, lint/typecheck, unit, e2e, fluxo
│                        #   manual (ingerir, processar, ver revisar/erro, reprocessar)
├── contracts/
│   ├── ingestao-eventos.md      # GET/POST /ingestao/eventos, GET /{id}, /reprocessar, /processar
│   ├── evento-canonico.md       # o schema do contrato EventoCanonico (campos, tipos, validação)
│   ├── porta-registrar-evento.md# registrarEvento(...) — porta in-process p/ os adapters 019–022
│   ├── worker-e-etapas.md       # registro ETAPAS, dependências, plano-passada, retry, status derivado
│   ├── rbac-catalogo.md         # + recurso evento no catálogo da 004
│   └── frontend-eventos.md      # nav condicional, rota RequirePermissao, lista/detalhe, reprocessar
├── checklists/
│   └── requirements.md          # do /speckit-specify (todos ok; CL-01..CL-05 resolvidos)
└── tasks.md             # Phase 2 — /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma               # + models EventoOrigem, EventoEtapa, IngestaoAudit
│   │                               #   + enums EventoOrigemStatus, EventoEtapaStatus,
│   │                               #     EtapaIngestao, Classificacao
│   └── migrations/<ts>_ingestao/
│       └── migration.sql           # NOVO — cria as 3 tabelas + enums + índices/uniques
├── src/
│   ├── config/env.schema.ts        # + INGESTAO_WORKER_ENABLED / _INTERVALO_MS /
│   │                               #   _MAX_TENTATIVAS / _LOTE
│   ├── core/config/                 # re-export tipado das novas chaves (Padrão 002)
│   ├── auth/rbac/
│   │   ├── catalogo.ts             # + PERMISSOES: evento:{ver,reprocessar,ingerir}
│   │   └── catalogo.spec.ts        # + asserção do novo recurso
│   └── ingestao/
│       ├── ingestao.module.ts      # reescrito — controller, services, worker scheduler,
│       │                           #   ETAPAS registry; importa PrismaModule; exporta
│       │                           #   RegistrarEventoService (porta do contexto)
│       ├── eventos.controller.ts   # GET /ingestao/eventos, GET /{id}, POST (ingerir),
│       │                           #   POST /{id}/reprocessar, POST /processar
│       ├── dto/
│       │   ├── ingerir-evento.schema.ts   # zod: plataformaOrigem, tipoOrigem, idOrigem,
│       │   │                              #   payloadBruto, eventoCanonico?
│       │   ├── listar-eventos.schema.ts   # zod: filtros (conta/status/tipo/data) + página
│       │   └── reprocessar.schema.ts      # zod: { forcar?: boolean }
│       ├── domain/
│       │   ├── evento-canonico.ts         # zod schema + tipo EventoCanonico
│       │   ├── evento-canonico.spec.ts
│       │   ├── hash-evento.ts             # hashEvento(payloadBruto) — canonicaliza + SHA-256
│       │   ├── hash-evento.spec.ts
│       │   ├── classificar.ts             # classificar(canonico, tipoOrigem) — puro
│       │   ├── classificar.spec.ts
│       │   ├── etapas.ts                  # ETAPAS: ordem, dependeDe[], especDona, executar()
│       │   ├── plano-passada.ts           # decide EXECUTAR|BLOQUEADA|PULAR|JA_OK|ESGOTADA + status final
│       │   ├── plano-passada.spec.ts
│       │   └── tipos.ts                   # EntradaIngestao, ResultadoEtapa, ResumoPassada, enums
│       ├── application/
│       │   ├── registrar-evento.service.ts    # porta: registrarEvento(entrada) → {eventoId, criado}
│       │   ├── worker.service.ts              # processarPassada() — seleção + trava + executa etapas
│       │   ├── worker.scheduler.ts            # setInterval in-house (OnModuleInit/Destroy), env-gated
│       │   ├── reprocessar-evento.service.ts  # devolve etapas a pendente, zera tentativas, audita
│       │   ├── eventos.query.ts               # leitura paginada/filtrada p/ o painel
│       │   ├── ingestao-audit.service.ts      # registrar(delta) via montarRegistroAuditoria (core)
│       │   └── etapas-noop/
│       │       ├── resolver-pessoa.noop.ts    # → { status: 'pulada', resultado:{ implementadaNa: 18 } }
│       │       ├── upsert-transacao.noop.ts   #   (18)
│       │       ├── resolver-vinculo.noop.ts   #   (24)
│       │       ├── resolver-oferta.noop.ts    #   (23)
│       │       └── projetar-contrato.noop.ts  #   (25)
│       └── infra/
│           ├── evento.repository.ts           # Prisma: upsert por chave, seleção elegível + FOR UPDATE SKIP LOCKED,
│           │                                  #   update de etapa/status, query do painel
│           └── ingestao-audit.repository.ts   # insert append-only
└── test/
    ├── ingestao.e2e-spec.ts        # NOVO — ingestão idempotente, dedup, processar, retry/MAX,
    │                               #   bloqueada, reprocessar+auditoria, guard, regressão
    └── support/
        └── ingestao.ts             # helpers: ingerir evento via API/porta, registrar etapa fake,
        │                           #   rodar passada, montar EventoCanonico de fixture

frontend/
└── src/
    ├── app/router.tsx             # + rotas /eventos, /eventos/:id sob RequirePermissao
    ├── shell/nav-items.ts         # + { label: 'Eventos', to: '/eventos', requerPermissao: 'evento:ver' }
    ├── test/setup.ts              # fetch default responde /ingestao/eventos (lista vazia)
    └── eventos/
        ├── EventosListPage.tsx    # lista + filtros (conta/status/tipo/data) + paginação
        ├── EventoDetailPage.tsx   # metadados, payload_bruto formatado, linha do tempo de etapas
        ├── ReprocessarButton.tsx  # só com evento:reprocessar
        ├── eventos-api.ts         # apiFetch tipado para /ingestao/eventos/*
        └── *.test.tsx

docs/
└── 006-evento-origem-worker.md    # NOVO — evento_origem/evento_etapa, EventoCanonico,
                                   #   worker + etapas + dependências + retry, classificação,
                                   #   reprocessamento, painel

CLAUDE.md  README.md  ROADMAP.md   # atualizados no fim da spec
```

**Structure Decision**: `ingestao` adota a mesma divisão **`domain/` (puro) ·
`application/` (serviços/worker/transações) · `infra/` (Prisma)** que a 005 estreou e que
as pastas vazias da 001 já anteciparam. O **núcleo canônico** (contrato `EventoCanonico`,
`hashEvento`, `classificar`, registro `ETAPAS` + `plano-passada`) fica em `domain/`, 100%
testável sem banco (SC-009). `IngestaoModule` importa `PrismaModule` e `AuthModule` (tipos
de `Permissao` + decorator — `auth` é infra transversal) e **exporta**
`RegistrarEventoService` como a **porta pública** que os adapters das specs 019–022 vão
chamar. As etapas 2–6 vivem em `application/etapas-noop/` e são substituídas pelas specs
018/023/024/025 registrando outra implementação no `ETAPAS` — **sem** tocar
`worker.service.ts`. `CONTEXT_MODULES` fica em 11 e `context-modules.e2e-spec.ts` não muda.
O catálogo de permissões da 004 cresce em `src/auth/rbac/catalogo.ts`.

## Complexity Tracking

> Sem violações constitucionais. Nada a registrar — a spec fica no mínimo viável (3
> tabelas, 5 endpoints, 0 dep nova, etapas 2–6 como _no-op_ que não antecipam trabalho de
> outra spec).
