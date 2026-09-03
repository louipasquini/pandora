---
description: "Task list — spec 007 crm-administracao (Administração do CRM)"
---

# Tasks: Administração do CRM — equipes, expediente/feriados, integrações e auditoria

**Input**: `specs/007-crm-administracao/` — plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md

**Tests**: incluídos — spec + constituição exigem (SC-001..013; "testes contra Postgres
real" é disciplina de projeto). Domínio puro = `jest` sem banco; serviços/endpoints = `jest`
e2e contra Postgres real (schema isolado, `test/setup-db.ts`); frontend = `vitest`.

**Organização**: por user story (US1..US5 da spec.md). Cada story é um incremento testável
de forma independente.

## Path Conventions

Monorepo web: `backend/src/`, `backend/test/`, `frontend/src/`. `crm` adota `domain/` (puro)
· `application/` (serviços/transações) · `infra/` (Prisma), como a 005/006.

---

## Phase 1: Setup (infra compartilhada)

**Purpose**: schema, migração, chave de config e esqueleto do módulo.

- [x] T001 Adicionar os models Prisma em `backend/prisma/schema.prisma`: `Equipe`,
  `EquipeMembro`, `JanelaAtendimento`, `Feriado`, `Integracao`, `CrmAdminAudit` + enums
  `EquipeTipo`, `PapelEquipe`, `IntegracaoTipo`, `IntegracaoAlvo` conforme `data-model.md`
  — PK `id String @id @db.Uuid`, `@db.Timestamptz(6)` em datas, `@map`/`@@map` snake_case,
  `Integracao.config` + `CrmAdminAudit.valorAnterior/valorNovo` como `Json`,
  `Integracao.segredoUltimos4 String?`, FK `EquipeMembro.usuarioId` → `Usuario` (`onDelete:
  Restrict`, **sem** relação inversa nomeada em `Usuario`), FK `equipeId` nas 3 tabelas
  filhas (`onDelete: Restrict`, `equipeId` nullable em `JanelaAtendimento`/`Feriado`).
- [x] T002 Gerar a migração: `npm run prisma:migrate:dev --workspace backend` →
  `backend/prisma/migrations/<ts>_crm_admin/migration.sql`. Editar o SQL para acrescentar o
  **índice único parcial** `CREATE UNIQUE INDEX equipe_membro_ativo_unico ON equipe_membro
  (equipe_id, usuario_id) WHERE saiu_em IS NULL;` e conferir os índices de `data-model.md`
  (`equipe_membro (usuario_id)`, `equipe_membro (equipe_id, saiu_em)`, `janela_atendimento
  (equipe_id, dia_semana, ativo)`, `feriado (equipe_id)`, `integracao (tipo)` / `(alvo)` /
  `(ativo)`, `crm_admin_audit (entidade, entidade_id)`).
- [x] T003 [P] Config: em `backend/src/config/env.schema.ts` adicionar
  `CRM_INTEGRACAO_CIFRA_KEY` — `z.string().refine(v => { try { return
  Buffer.from(v,'base64').length === 32 } catch { return false } }, 'base64 de 32 bytes')`,
  **obrigatória em todo `NODE_ENV`** (sem `.default`, sem `.optional`). Re-exportar a chave
  tipada em `backend/src/core/config/index.ts` (Padrão 002). Acrescentar uma fixture fixa
  (32 bytes base64) a `.env`, `.env.example`, ao bloco `env:` de
  `.github/workflows/ci.yml` e a `backend/test/setup-db.ts` (ou ao `env` do jest e2e).
- [x] T004 [P] Criar os barrels do contexto: `backend/src/crm/domain/index.ts`,
  `backend/src/crm/application/index.ts`, `backend/src/crm/infra/index.ts` (re-exports;
  preenchidos ao longo das fases).

---

## Phase 2: Foundational (pré-requisito bloqueante)

**Purpose**: catálogo RBAC, tipos, auditoria, cifra/hash, _wiring_ do módulo e helpers de
teste que TODAS as stories usam. ⚠️ Nenhuma story começa antes disto.

- [x] T005 Estender o catálogo RBAC em `backend/src/auth/rbac/catalogo.ts`: adicionar
  `crm_admin:ver`, `crm_admin:gerir_equipes`, `crm_admin:gerir_expediente`,
  `crm_admin:gerir_integracoes` ao array `PERMISSOES` (rótulos de `contracts/rbac-catalogo.md`),
  mantendo a ordem e o `satisfies`.
- [x] T006 [P] Atualizar `backend/src/auth/rbac/catalogo.spec.ts`: asserção de que o recurso
  `crm_admin` existe com as 4 ações, ids únicos, `recurso` = prefixo do id, e que
  `agruparPorRecurso()` devolve o grupo `crm_admin` com 4 permissões na ordem do catálogo.
- [x] T007 [P] `backend/src/crm/domain/tipos.ts` — enums de apoio (`DiaSemana` 0–6) e tipos
  `JanelaAplic`, `FeriadoAplic`, `OpcoesExpediente`, `ResultadoExpediente`, `EntradaAuditoria`
  (`entidade`, `entidadeId`, `campo`, `valorAnterior`, `valorNovo`, `motivo`), re-export dos
  enums do `@prisma/client` (`EquipeTipo`, `PapelEquipe`, `IntegracaoTipo`, `IntegracaoAlvo`).
- [x] T008 [P] `backend/src/crm/domain/cifra.ts` + `backend/src/crm/domain/cifra.spec.ts` —
  `cifrar(texto, chaveBuf): string` (AES-256-GCM via `node:crypto`, IV `randomBytes(12)`,
  saída `base64(iv|authTag|ciphertext)`) e `decifrar(blob, chaveBuf): string`. Testes:
  round-trip; authTag adulterado → lança; dois `cifrar` do mesmo texto → blobs distintos
  (IV aleatório).
- [x] T009 [P] `backend/src/crm/domain/api-key.ts` + `.spec.ts` —
  `gerarApiKey(): { valor: string; hash: string }` (`'crm_' + randomBytes(20).toString('hex')`,
  `hash = sha256hex(valor)`), `hashSegredo(valor): string`. Testes: prefixo `crm_`,
  comprimento estável, `hashSegredo` determinístico, 1000 chaves sem colisão.
- [x] T010 [P] `backend/src/crm/domain/mascarar-segredo.ts` + `.spec.ts` —
  `mascararSegredo(ultimos4: string | null): string | null` → `null` se entrada `null`,
  senão `'••••••' + ultimos4`. `ultimos4De(valor: string): string` (últimos 4 chars).
- [x] T011 [P] `backend/src/crm/application/crm-admin-audit.service.ts` +
  `backend/src/crm/infra/crm-admin-audit.repository.ts` — `registrar(entrada)` via
  `montarRegistroAuditoria` do core (`origem = AJUSTE_MANUAL`, `agoraUtc()`), `INSERT`
  append-only em `crm_admin_audit`; **só delta real** (`jsonIgual(anterior, novo)` → no-op,
  retorna `false`); espelha `ClientesAuditService`/`IngestaoAuditService`. **Nunca** recebe
  valor de segredo — o chamador passa marcador (`{ segredo: 'definido' | 'rotacionado' }`).
- [x] T012 [P] `backend/src/crm/infra/{equipe,expediente,integracao}.repository.ts`
  (esqueleto) — `constructor(prisma)`, métodos declarados (implementados por fase). Barrel
  `infra/index.ts` re-exporta os 4 repos.
- [x] T013 `backend/src/crm/crm.module.ts` — reescrever: `imports: [PrismaModule, AuthModule]`
  (AuthModule só p/ o guard/`Permissao` — infra transversal), `controllers:
  [CrmAdminController]` (adicionado nas fases), `providers` (repos + serviços + audit).
  **Não** exporta porta. `OnModuleInit` loga uma vez `crm.ready crm_admin permissoes=4
  (crm_admin:ver, …)` (sem dados sensíveis). **Não** importa `clientes`/`financeiro`/
  `ingestao`/`catalogo`/`contratos`/`marketing`/`central`.
- [x] T014 [P] `backend/test/support/crm-admin.ts` — helpers e2e: `criarEquipe(app, over?)`,
  `adicionarMembro(app, equipeId, usuarioId, papel?)`, `criarJanela(app, over?)`,
  `criarFeriado(app, over?)`, `criarIntegracao(app, over?)`, `consultarExpediente(app,
  { instante?, equipeId? })`, `lerAuditoria(prisma, { entidade, entidadeId })`,
  `instanteBRT(iso)` (monta um `Date` a partir de horário local America/Sao_Paulo),
  `tokenSemPermissao()` (reusa `issueUserToken` da 004), `criarUsuario(prisma)` (via helper
  da 004).

**Checkpoint**: `npm run typecheck --workspace backend` verde; app sobe (`RbacRouteAudit`
não aborta — catálogo tem `crm_admin:*`); `/health` ainda 11 contextos; boot aborta sem
`CRM_INTEGRACAO_CIFRA_KEY`.

---

## Phase 3: User Story 1 — Configurar expediente e consultar se um instante está no expediente (P1) 🎯 MVP

**Goal**: a função pura `estaEmExpediente` (livre de locale, América/Sao_Paulo via `Intl`),
o CRUD de `janela_atendimento` (rejeita janela que cruza meia-noite) e de `feriado`, e o
`GET /crm/admin/expediente` que reusa a função.

**Independent Test**: `contracts/estaEmExpediente.md` (tabela de casos) +
`contracts/crm-admin-expediente.md`.

- [x] T015 [P] [US1] `backend/src/crm/domain/expediente.ts` — `estaEmExpediente(instante:
  Date, opcoes: OpcoesExpediente): boolean` conforme `contracts/estaEmExpediente.md` (R1–R11):
  `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23', year,
  month, day, weekday, hour, minute }).formatToParts`; `aplicavel(x)` = global ∪ equipe
  ativa (CL-01); feriado aplicável (recorrente por `(mês,dia)` exato — CL-04; não-recorrente
  por `mês/dia/ano`) → `false`; senão `some(janela ativa aplicável, `diaSemana`,
  `inicioMin <= t < fimMin`)`; sem janela → `false`. Pura, sem I/O.
- [x] T016 [P] [US1] `backend/src/crm/domain/expediente.spec.ts` — toda a tabela de
  `contracts/estaEmExpediente.md`: dentro/fora; borda 09:00 (`true`) / 18:00 (`false`);
  domingo sem janela; feriado fixo e recorrente (global e por equipe); união global+equipe;
  equipe inativa → só globais; 29/02 recorrente (`false` só em ano bissexto, não desloca);
  zero janela → `false`; determinismo 500×; resultado idêntico com `process.env.TZ` alterado
  dentro do teste (`UTC` vs `Asia/Tokyo`).
- [x] T017 [P] [US1] `backend/src/crm/dto/janela.schema.ts` + `feriado.schema.ts` +
  `consultar-expediente.schema.ts` (zod) — `janela`: `diaSemana` 0–6, `horaInicio`/`horaFim`
  `"HH:MM"` → helper `hhmmParaMin`/`minParaHhmm`, `equipeId?` uuid, `ativo?`; recusa
  `horaFim <= horaInicio` no `superRefine` (→ 422 `janela_invalida`). `feriado`: `data`
  `YYYY-MM-DD`, `descricao` 1–200, `recorrenteAnual` bool, `equipeId?`.
  `consultar-expediente`: `instante?` (string, passada a `parseInstante` do core → 400 se
  `null`), `equipeId?` uuid.
- [x] T018 [US1] `backend/src/crm/infra/expediente.repository.ts` — `criarJanela`,
  `atualizarJanela`, `removerJanela` (delete físico), `listarJanelas({ equipeId?,
  incluirGlobais, ativo? })`; idem `feriado`; `carregarAplicaveis(equipeId?)` →
  `{ janelas: JanelaAplic[], feriados: FeriadoAplic[], equipe: { id, ativo } | null }`
  (janelas/feriados WHERE `equipe_id IS NULL OR equipe_id = :equipeId`; `equipe` por id).
- [x] T019 [US1] `backend/src/crm/application/expediente.service.ts` — CRUD de janela/feriado
  (cada escrita → `CrmAdminAuditService.registrar`; `PATCH` no-op → sem audit; `equipeId`
  inexistente → 404); `consultar(instante: Date, equipeId?)` = `carregarAplicaveis` +
  `estaEmExpediente` → `{ emExpediente, instante: instante.toISOString(), equipeId }`.
- [x] T020 [US1] `backend/src/crm/crm-admin.controller.ts` (novo) — rotas de expediente:
  `GET/POST/PATCH/DELETE /crm/admin/janelas-atendimento`, idem `/feriados`
  (`@RequerPermissao('crm_admin:ver')` nas leituras, `'crm_admin:gerir_expediente'` nas
  escritas), `GET /crm/admin/expediente` (`'crm_admin:ver'`). Zod pipe nos corpos/queries.
  Registrar o controller + `ExpedienteService` + repo no `CrmModule`.
- [x] T021 [US1] `backend/test/crm-admin.e2e-spec.ts` (bloco `expediente`) — migração cria
  as tabelas; `POST janela` `18:00–09:00` → 422 `janela_invalida`; CRUD de janela/feriado
  ok + 1 `crm_admin_audit` por escrita, `PATCH` no-op → 0; `GET
  /crm/admin/expediente?instante=<quarta 14:00 BRT ISO>` → `emExpediente:true`; mesma
  consulta com feriado nesse dia → `false`; `instante` lixo → 400; união global + janela de
  equipe conferida ponta a ponta; `DELETE` de janela some do `GET`; sem token → 401; token
  sem permissão → 403.

**Checkpoint**: SC-001, SC-002, SC-003 verdes; `estaEmExpediente` pronta para 012/014
consumirem; matriz `TZ` da CI cobre o domínio.

---

## Phase 4: User Story 2 — Cadastrar integrações sem nunca expor o segredo (P1)

**Goal**: CRUD de `integracao` com segredo cifrado em repouso / API key só-hash, projeção de
leitura que só devolve `segredoDefinido` + `segredoMascarado`, `reveal` único na criação/
rotação, e auditoria com marcador (nunca o valor).

**Independent Test**: `contracts/crm-admin-integracoes.md` (CONTRATO DE SEGURANÇA).

- [x] T022 [P] [US2] `backend/src/crm/dto/integracao.schema.ts` (zod) — `criar`
  (`nome` 1–120, `tipo`, `alvo`, `config` objeto, `segredo?` string), `atualizar` (parcial +
  `segredo?`), `rotacionar` (`{ segredo?: string }`), `listar` (`tipo?`, `alvo?`, `ativo?`,
  `pagina?`, `tamanho?` teto 100). `superRefine` recusa `config` com chave suspeita
  (`token|secret|apikey|password`, case-insensitive) → 422.
- [x] T023 [US2] `backend/src/crm/infra/integracao.repository.ts` — `criar`, `atualizar`,
  `obter`, `listar(filtros)` (paginado), `setSegredo(id, { segredoCifrado?, segredoHash?,
  segredoUltimos4 })`. **Nenhum** método devolve `segredoCifrado`/`segredoHash` para fora do
  serviço.
- [x] T024 [US2] `backend/src/crm/application/integracao.service.ts` —
  - `projetar(row)` → `{ …metadados, config, ativo, ultimoUsoEm, segredoDefinido:
    (segredoCifrado||segredoHash)!=null, segredoMascarado: mascararSegredo(segredoUltimos4) }`
    (o valor pleno / cifrado / hash **nunca** sai).
  - `criar(dto, sujeito)`: `API_KEY` sem `segredo` → `gerarApiKey()` → grava `segredoHash` +
    `segredoUltimos4`; resposta inclui `apiKey` + `aviso`. Demais tipos com `segredo` →
    `cifrar(segredo, chave)` → `segredoCifrado` + `segredoUltimos4`. `CONEXAO_INTERNA` sem
    segredo → ok. Audita `campo:'criado'` (+ `{ segredo:'definido' }` se havia).
  - `atualizar(id, dto, sujeito)`: sem `segredo` → preserva; com `segredo` → substitui +
    audita `campo:'segredo_rotacionado'`. No-op → sem audit. 404 se não existe.
  - `rotacionar(id, dto, sujeito)`: gera/recebe novo segredo conforme `tipo`; `API_KEY`/
    gerado → revela 1×; `CONEXAO_INTERNA` sem segredo → 409 `sem_segredo_para_rotacionar`.
    Audita `campo:'segredo_rotacionado'` (`{ segredo:'rotacionado' }`).
  - `ativar/desativar` via `atualizar`.
- [x] T025 [US2] `backend/src/crm/crm-admin.controller.ts` (+ rotas) —
  `GET /crm/admin/integracoes` + `GET /:id` (`crm_admin:ver`), `POST` + `PATCH /:id` +
  `POST /:id/rotacionar` (`crm_admin:gerir_integracoes`). Registrar `IntegracaoService` +
  repo no `CrmModule`.
- [x] T026 [US2] `backend/test/crm-admin.e2e-spec.ts` (bloco `integracoes`) — `POST WEBHOOK
  { segredo:'s3cr3t' }` → resposta traz `segredoMascarado` (`••••••cr3t`), **não** `s3cr3t`;
  `GET` lista/detalhe idem; `POST { tipo:'API_KEY' }` sem segredo → resposta de criação traz
  `apiKey:'crm_…'` **1×**, `GET` seguinte **não** traz; `POST …/rotacionar` → novo valor 1×,
  `hashSegredo(antigo)` não bate mais; `PATCH { nome }` preserva segredo; `rotacionar` de
  `CONEXAO_INTERNA` sem segredo → 409; `config` com chave `token` → 422. **Asserção-chave**:
  varrer TODA resposta JSON + todas as linhas de `crm_admin_audit` + os logs capturados no
  teste e afirmar **0** ocorrência do valor do segredo/`apiKey`. Guard 401/403/2xx.

**Checkpoint**: SC-004, SC-005 verdes; nenhum segredo vaza por leitura, log ou auditoria.

---

## Phase 5: User Story 3 — Gerir equipes/squads do comercial e seus membros (P2)

**Goal**: CRUD de `equipe`, gestão de `equipe_membro` (≤1 vínculo ativo por par via índice
parcial; histórico preservado; usuário em N equipes), desativação sem apagar.

**Independent Test**: `contracts/crm-admin-equipes.md`.

- [x] T027 [P] [US3] `backend/src/crm/dto/equipe.schema.ts` + `membro.schema.ts` (zod) —
  `equipe`: `criar` (`nome` 1–120, `descricao?` ≤500, `tipo`), `atualizar` (parcial +
  `ativo?`), `listar` (`ativo?`, `tipo?`, `usuarioId?`, `pagina?`, `tamanho?`). `membro`:
  `adicionar` (`usuarioId` uuid, `papel`), `trocarPapel` (`papel`).
- [x] T028 [US3] `backend/src/crm/infra/equipe.repository.ts` — `criar`, `atualizar`,
  `obter`, `listar(filtros)` (com `totalMembrosAtivos`; `usuarioId` filtra por vínculo
  ativo), `membrosAtivos(equipeId)`, `historicoMembros(equipeId)`, `adicionarMembro`
  (captura `P2002` do índice parcial → sinaliza conflito), `vinculoAtivo(equipeId,
  usuarioId)`, `trocarPapel`, `marcarSaida(vinculoId)`, `usuarioExiste(usuarioId)`.
- [x] T029 [US3] `backend/src/crm/application/equipe.service.ts` — CRUD de equipe (sem
  `DELETE`; `PATCH { ativo:false }` → `campo:'desativado'`); `adicionarMembro` (404 equipe;
  422 `usuarioId` inexistente; 409 `vinculo_ativo_existente` se `P2002`; reentrada após
  saída → novo registro); `trocarPapel` (404 se sem vínculo ativo; papel igual → no-op sem
  audit); `removerMembro` (marca `saiu_em`; já sem vínculo ativo → 204 no-op sem audit).
  Cada escrita efetiva → `CrmAdminAuditService`.
- [x] T030 [US3] `backend/src/crm/crm-admin.controller.ts` (+ rotas) —
  `GET /crm/admin/equipes` + `GET /:id` (`crm_admin:ver`);
  `POST` + `PATCH /:id` + `POST /:id/membros` + `PATCH /:id/membros/:usuarioId` +
  `DELETE /:id/membros/:usuarioId` (`crm_admin:gerir_equipes`). Registrar `EquipeService` +
  repo no `CrmModule`.
- [x] T031 [US3] `backend/test/crm-admin.e2e-spec.ts` (bloco `equipes`) — `POST` cria
  `ativo:true`; `POST …/membros` cria vínculo; **2º vínculo ativo do mesmo par → 409**;
  `usuarioId` inexistente → 422; `DELETE …/membros` preenche `saiu_em`, some da lista ativa,
  fica no `historicoMembros`; `DELETE` de novo → 204 sem novo `crm_admin_audit`; reentrada
  após saída → 201 (novo id); `PATCH { ativo:false }` some das listas padrão; um usuário em
  3 equipes ao mesmo tempo (`GET /crm/admin/equipes?usuarioId=`); cada escrita → 1
  `crm_admin_audit`, `PATCH` no-op → 0; guard 401/403/2xx.

**Checkpoint**: SC-010 verde; a base de equipes/membros existe para 010/012 se apoiarem.

---

## Phase 6: User Story 4 — Toda escrita administrativa fica auditada, sem vazar segredo (P2)

**Goal**: garantir a cobertura de auditoria em TODAS as escritas das US1–US3 (delta real,
no-op sem linha, autor correto, `origem = AJUSTE_MANUAL`, segredo só marcador) e expor o
`GET /crm/admin/auditoria` local (opcional — FR-035).

**Independent Test**: `spec.md` US4 + `data-model.md` §`crm_admin_audit`.

- [x] T032 [US4] `backend/src/crm/application/eventos-auditoria.query.ts` (ou método no
  audit service) — `listar({ entidade?, entidadeId?, pagina?, tamanho? })` sobre
  `crm_admin_audit`, ordem `quando desc, id desc`, **sem** nunca projetar segredo (a coluna
  já não tem).
- [x] T033 [US4] `backend/src/crm/crm-admin.controller.ts` (+ rota) —
  `GET /crm/admin/auditoria` (`@RequerPermissao('crm_admin:ver')`), query validada por zod.
- [x] T034 [US4] `backend/test/crm-admin.e2e-spec.ts` (bloco `auditoria`) — para **cada**
  entidade (`equipe`, `equipe_membro`, `janela_atendimento`, `feriado`, `integracao`): uma
  escrita bem-sucedida → **1** `crm_admin_audit` com `autor` = sub do JWT (e credencial de
  serviço quando é o caso), `quando` `timestamptz`, `campo`, `delta`, `origem =
  'AJUSTE_MANUAL'`; um `PATCH` com corpo igual ao estado → **0** registro; criação/rotação
  de segredo → registro com `valorNovo` contendo `{ segredo: 'definido' | 'rotacionado' }` e
  **nenhum** caractere do valor real; `GET /crm/admin/auditoria?entidade=integracao&entidadeId=…`
  devolve os registros na ordem certa; nenhuma rota permite `UPDATE`/`DELETE` de
  `crm_admin_audit`.

**Checkpoint**: SC-006 verde; a trilha administrativa está completa e limpa de segredo.

---

## Phase 7: User Story 5 — Painel CRM · Administração (P3)

**Goal**: item de nav condicional, rota sob `RequirePermissao`, 3 abas (Equipes /
Expediente / Integrações) consumindo só os endpoints, com controles de escrita por
permissão, máscara de segredo + `reveal` único não-persistente, e indicador "no expediente
agora?".

**Independent Test**: `contracts/frontend-crm-admin.md`.

- [x] T035 [P] [US5] `frontend/src/shell/nav-items.ts` (+ `{ label: 'CRM · Administração',
  to: '/crm/admin', requerPermissao: 'crm_admin:ver' }`, mantendo o placeholder `{ label:
  'CRM', soon: true }`) e `frontend/src/app/router.tsx` (rota `/crm/admin` dentro do
  `AppShell`, sob `<RequirePermissao perm="crm_admin:ver"><CrmAdminPage/></RequirePermissao>`).
- [x] T036 [P] [US5] `frontend/src/crm-admin/crm-admin-api.ts` — `apiFetch` tipado para
  `/crm/admin/{equipes,janelas-atendimento,feriados,integracoes,expediente,auditoria}` +
  tipos de resposta dos `contracts/`.
- [x] T037 [P] [US5] `frontend/src/crm-admin/CrmAdminPage.tsx` — shell de abas via
  `?tab=equipes|expediente|integracoes` (default `equipes`); `usePermissoesEfetivas` para
  decidir os controles de escrita por aba.
- [x] T038 [P] [US5] `frontend/src/crm-admin/EquipesTab.tsx` — lista (filtros
  `ativo`/`tipo`, paginação), painel de membros (ativos + histórico), forms de criação/
  edição e add/remover membro (só com `crm_admin:gerir_equipes`); 409 de vínculo → aviso
  inline.
- [x] T039 [P] [US5] `frontend/src/crm-admin/ExpedienteTab.tsx` — grade de janelas + lista
  de feriados (filtro por equipe + globais), forms (`"HH:MM"`, 422 → erro no campo
  `horaFim`), **indicador "no expediente agora?"** (`GET /crm/admin/expediente?equipeId=`),
  campo opcional "testar instante". Escrita só com `crm_admin:gerir_expediente`.
- [x] T040 [P] [US5] `frontend/src/crm-admin/IntegracoesTab.tsx` — lista (só
  `segredoMascarado`), form de criação (editor de JSON simples para `config`), `reveal`
  único da `apiKey`/segredo num `<aside role="alert">` com "copiar" que **não** persiste ao
  recarregar; `rotacionar`; 409 de `CONEXAO_INTERNA` → aviso inline. Escrita só com
  `crm_admin:gerir_integracoes`.
- [x] T041 [US5] `frontend/src/test/setup.ts` (+ `fetch` default p/ `/crm/admin/*` — listas
  vazias + `crm_admin:*` em `TODAS_PERMISSOES`) e `frontend/src/crm-admin/*.test.tsx` — nav
  esconde **CRM · Administração** sem `crm_admin:ver`; rota direta sem permissão →
  `SemPermissao` (≠ Login); 3 abas montam dos endpoints; sem `gerir_*` a aba é read-only
  (sem botões de escrita); Integrações só mostra máscara e o valor pleno some ao remontar o
  componente; indicador de expediente chama o endpoint; 403 numa chamada → banner + sessão
  intacta.

**Checkpoint**: SC-012 verde; a Administração do CRM é usável pelo time sem `curl`.

---

## Phase 8: Polish & cross-cutting

- [x] T042 [P] Regressão e2e: `auth.e2e-spec.ts`, `rbac.e2e-spec.ts`, `clientes.e2e-spec.ts`,
  `ingestao.e2e-spec.ts`, `health.e2e-spec.ts`, `context-modules.e2e-spec.ts` (ainda **11**)
  — verdes sem alteração (SC-009).
- [x] T043 [P] Portões estáticos na raiz: `npm run lint`, `npm run typecheck`,
  `npm run build` — verde (`import/no-restricted-paths`: `crm` só importa `core`/`auth`;
  `no-restricted-syntax`: sem `process.env` fora de `config/`/`core/`).
- [x] T044 [P] Escrever `docs/007-crm-administracao.md` — equipes/membros (índice parcial,
  histórico), expediente (regra de `estaEmExpediente` + CL-01..CL-04 + `Intl` sem lib),
  integrações (cifra AES-256-GCM, API key só-hash, contrato de segurança da leitura,
  `reveal` único), auditoria (`crm_admin_audit`, marcador de segredo), catálogo RBAC
  `crm_admin:*`, 5ª migração, painel. Seguir o formato dos `docs/00X-*.md`.
- [x] T045 Atualizar `CLAUDE.md` — bloco novo em "Stack" para o contexto `crm` (entidades,
  `estaEmExpediente`, segurança do segredo, catálogo `crm_admin:*`, 5ª migração, chave
  `CRM_INTEGRACAO_CIFRA_KEY`) + link do doc. O bloco `<!-- SPECKIT -->` já aponta a 007
  (feito no plan).
- [x] T046 [P] Atualizar `README.md` — nota da 5ª migração de negócio no "Como rodar" (só
  `prisma migrate`); menção a `crm`/Administração no mapa de contextos; a chave
  `CRM_INTEGRACAO_CIFRA_KEY` (obrigatória) na tabela de env.
- [x] T047 [P] Atualizar `ROADMAP.md` — marcar `- [x] **007 — crm-administracao**` com o
  resumo do que entrou (data 2026-09-03), no padrão das specs 001–006.
- [x] T048 [P] Atualizar as memórias do agente:
  `C:\Users\Amore\.claude\projects\C--Users-Amore-Codes-projeto-pandora\memory\pandora-roadmap-status.md`
  (007 → concluída; próxima = 008 crm-lead) e `MEMORY.md` (linha do índice).
- [x] T049 Rodar `quickstart.md` §"Fluxo manual" e conferir: criar equipe + membro; janela
  seg–sex 09:00–18:00 + feriado; `GET /crm/admin/expediente` reflete; criar `API_KEY`,
  copiar o valor revelado, recarregar e confirmar que só a máscara permanece;
  `select * from crm_admin_audit` = 1 por ação, sem segredo.
- [x] T050 `netstat`/`docker ps` — confirmar nenhuma porta nova (3001/5174/55432 já do
  projeto); `GET /health` → 11 contextos.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → stories.
- **US1 (P1)** — depende só da Phase 2. MVP (`estaEmExpediente` + CRUD de expediente).
- **US2 (P1)** — depende da Phase 2 (cifra/hash/máscara/audit já em T008–T011). Independente
  de US1 — arquivos e rotas distintos.
- **US3 (P2)** — depende da Phase 2. Independente de US1/US2.
- **US4 (P2)** — depende de US1+US2+US3 (precisa de escritas nas 5 entidades para asserir a
  cobertura). O `GET /crm/admin/auditoria` (T032/T033) é pequeno e pode ir cedo.
- **US5 (P3)** — depende de US1+US2+US3 (consome os endpoints); os componentes (T035–T040)
  podem começar com mocks assim que os `contracts/` estão fixos.
- **Phase 8** — depois de todas.

## Parallel Opportunities

- Phase 1: T003, T004 em paralelo. Phase 2: T006–T012, T014 em paralelo (arquivos
  distintos); T013 depois de T005/T011/T012.
- US1: T015+T016 (domínio) e T017 em paralelo; T018 → T019 → T020 → T021 em série.
- US2: T022 solo; T023 → T024 → T025 → T026 em série.
- US3: T027 solo; T028 → T029 → T030 → T031 em série.
- US4: T032 → T033 em série; T034 depois.
- US5: T035, T036, T037, T038, T039, T040 em paralelo; T041 no fim.
- Phase 8: T042, T043, T044, T046, T047, T048 em paralelo.

## Implementation Strategy

- **MVP = US1** (`estaEmExpediente` + CRUD de janela/feriado + `GET /crm/admin/expediente`):
  a peça que 012 (Chat) e 014 (Workflow) vão consumir como código (SC-001..003).
- **Incremento 2 = +US2**: cadastro de integrações seguro — o que 011/019–022/033 vão
  consumir (SC-004/005).
- **Incremento 3 = +US3**: equipes/squads e membros — base para a atribuição de 010/012
  (SC-010).
- **Incremento 4 = +US4**: prova da cobertura de auditoria e o `GET` local (SC-006).
- **Incremento 5 = +US5**: painel de 3 abas (SC-012).
- **Fecho = Phase 8**: docs, regressão, ROADMAP, memórias, quickstart, portas.

## Format validation

Todas as tasks: `- [ ] Txxx [P?] [USx?] descrição com caminho de arquivo`. Setup/
Foundational/Polish sem `[US]`; fases de story com `[US1]`..`[US5]`.
