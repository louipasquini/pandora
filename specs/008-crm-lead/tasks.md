---
description: "Task list — spec 008 crm-lead (Lead do CRM)"
---

# Tasks: Lead do CRM — entidade compartilhada, campos personalizados, scoring e conversão em pessoa

**Input**: `specs/008-crm-lead/` — plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md

**Tests**: incluídos — spec + constituição exigem (SC-001..013; "testes contra Postgres
real" é disciplina de projeto). Domínio puro = `jest` sem banco; serviços/endpoints =
`jest` e2e contra Postgres real (schema isolado, `test/setup-db.ts`); frontend = `vitest`.

**Organização**: por user story (US1..US6 da spec.md). Cada story é um incremento testável
de forma independente.

## Path Conventions

Monorepo web: `backend/src/`, `backend/test/`, `frontend/src/`. `crm` mantém `domain/`
(puro) · `application/` (serviços/transações) · `infra/` (Prisma) da 005/006/007; a nova
entidade fica em subpasta `lead/` de cada camada.

---

## Phase 1: Setup (schema + migração + esqueleto)

**Purpose**: persistência e barrels — pré-requisito de tudo.

- [x] T001 Adicionar os models Prisma em `backend/prisma/schema.prisma`: `Lead`,
  `CampoPersonalizadoLead`, `ValorCampoLead`, `CrmLeadAudit` + enums `LeadEstagio`,
  `LeadStatus`, `CampoPersonalizadoTipo` conforme `data-model.md` — PK `id String @id
  @db.Uuid`, `@db.Timestamptz(6)` em datas, `@map`/`@@map` snake_case, `Lead.tags String[]
  @default([])`, `Lead.utmSource/utmMedium/utmCampaign/utmTerm/utmContent String?`,
  `Lead.score Int @default(0)` + `Lead.scoreAtualizadoEm DateTime? @db.Timestamptz(6)`,
  FK `Lead.responsavelId` → `Usuario` (`onDelete: Restrict`, **sem** relação inversa
  nomeada), FK `Lead.pessoaId` → `Pessoa` (`onDelete: Restrict`, nullable, **sem** inversa),
  `ValorCampoLead.leadId` → `Lead` (`onDelete: Cascade`), `ValorCampoLead.definicaoId` →
  `CampoPersonalizadoLead` (`onDelete: Restrict`), `CampoPersonalizadoLead.chave String
  @unique`, `CampoPersonalizadoLead.opcoes String[] @default([])`,
  `ValorCampoLead @@unique([leadId, definicaoId])`, `CrmLeadAudit` idêntico a `CrmAdminAudit`
  (007) com `valorAnterior/valorNovo Json?`.
- [x] T002 Gerar a migração: `npm run prisma:migrate:dev --workspace backend` →
  `backend/prisma/migrations/<ts>_crm_lead/migration.sql`. Editar o SQL para acrescentar o
  **índice único parcial** `CREATE UNIQUE INDEX lead_origem_id_externo_key ON lead (origem,
  id_externo) WHERE id_externo IS NOT NULL;` e conferir os índices de `data-model.md`
  (`lead (status, estagio)`, `lead (responsavel_id)`, `lead (origem)`, `lead (email)`,
  `lead (telefone)`, `lead (pessoa_id)`, `valor_campo_lead (definicao_id)`,
  `crm_lead_audit (entidade, entidade_id)`).
- [x] T003 [P] `npm run prisma:generate --workspace backend` e conferir o client tipado
  (`Lead`, `CampoPersonalizadoLead`, `ValorCampoLead`, `CrmLeadAudit`).
- [x] T004 [P] Criar os barrels da entidade: `backend/src/crm/domain/lead/index.ts`,
  `backend/src/crm/application/lead/index.ts`, `backend/src/crm/infra/lead/index.ts`
  (re-exports; preenchidos ao longo das fases).

---

## Phase 2: Foundational (pré-requisito bloqueante — ⚠️ nenhuma story começa antes)

**Purpose**: `PortaIdentidade` no `core`, adaptador + wiring `@Global()` no `clientes`,
catálogo RBAC (+1), tipos/enums do domínio, serviço de auditoria, _wiring_ do `CrmModule`,
helpers de teste comuns a todas as stories.

- [x] T005 [P] Criar `backend/src/core/identidade/porta-identidade.ts` conforme
  `contracts/porta-identidade.md`: interface `PortaIdentidade` + tipos
  (`DadosIdentidadeLead`, `OrigemIdentidade`, `OpcoesPortaIdentidade`,
  `ResultadoPortaIdentidade`) + `export const PORTA_IDENTIDADE = Symbol('PORTA_IDENTIDADE')`.
  Zero import de `clientes`, zero lógica. Re-exportar no barrel
  `backend/src/core/core.module.ts` (`// --- identidade (008) ---`).
- [x] T006 [P] Criar `backend/src/clientes/infra/porta-identidade.adapter.ts`: classe
  `@Injectable() PortaIdentidadeAdapter implements PortaIdentidade` que injeta
  `ResolverOuCriarService` e delega, mapeando `DadosIdentidadeLead` → `DadosIdentidade`
  (005) — inclusive `documento` string → `{ tipo, valor }` reusando o detector de CPF/CNPJ
  de `backend/src/clientes/domain`. Devolve `{ pessoaId, criada }`.
- [x] T007 Criar `backend/src/clientes/identidade-wiring.module.ts`: `@Global() @Module`
  que `imports: [ClientesModule]`, `providers: [PortaIdentidadeAdapter, { provide:
  PORTA_IDENTIDADE, useExisting: PortaIdentidadeAdapter }]`, `exports: [PORTA_IDENTIDADE]`.
  Registrar em `backend/src/app.module.ts` (`imports: [..., IdentidadeWiringModule]`).
- [x] T008 [P] Teste unit `backend/src/clientes/infra/porta-identidade.adapter.spec.ts`:
  `documento` string CPF/CNPJ → objeto certo; `origem` repassada íntegra; `criar:false`
  propagado; resultado `{ pessoaId, criada }` mapeado do `ResultadoResolverOuCriar`.
- [x] T009 [P] RBAC: em `backend/src/auth/rbac/catalogo.ts` adicionar **1** entrada ao
  recurso `crm_admin` — `{ id: 'crm_admin:gerir_campos_lead', recurso: 'crm_admin', rotulo:
  'Gerir campos personalizados de lead' }` (as 4 `lead:*` **não mudam**). Atualizar
  `backend/src/auth/rbac/catalogo.spec.ts` (contém o id; grupo `crm_admin` = 5; `lead:*`
  intactas).
- [x] T010 [P] Criar `backend/src/crm/domain/lead/tipos.ts`: re-export dos enums do client
  (`LeadEstagio`, `LeadStatus`, `CampoPersonalizadoTipo`) + tipos `EstadoScoreLead`
  (`data-model.md`), `ResultadoConversao`, `CriarLeadEntrada`, `ChaveOrigemLead`.
- [x] T011 [P] Criar `backend/src/crm/application/lead/crm-lead-audit.service.ts`:
  `registrar(entrada)` na forma canônica `montarRegistroAuditoria` do core
  (`OrigemMudanca.AJUSTE_MANUAL`), grava em `crm_lead_audit`, **append-only**, **só delta
  real** (`jsonIgual` → no-op). Simétrico ao `CrmAdminAuditService` da 007. +
  `backend/src/crm/infra/lead/crm-lead-audit.repository.ts`.
- [x] T012 Estender `backend/src/crm/crm.module.ts`: registrar (nas próximas fases) os
  controllers/serviços de lead; **não** importar `ClientesModule`/`IdentidadeWiringModule`.
  `exports: [RegistrarLeadService]` (adicionado na Phase 8). `onModuleInit` loga
  `crm.ready lead vocab registrado` (sem dados sensíveis). Conferir que `CONTEXT_MODULES`
  **não muda** (segue 11) e `context-modules.e2e-spec.ts` passa.
- [x] T013 [P] Helpers de teste `backend/test/support/crm-lead.ts`: `criarLead(app, dados?,
  token?)`, `patchLead`, `addTag`, `criarDefinicaoCampo`, `putValoresCampo`,
  `converterLead`, `lerAuditoriaLead`, `tokenComPermissoes([...])` (reusa o suporte de RBAC
  já existente), `criarUsuario`/`criarPessoa` (reusa helpers das 004/005).

**Checkpoint**: `npm run lint` (0 import de `clientes` em `src/crm`), `npm run typecheck`,
`npm run build` verdes; boot sobe com o token `PORTA_IDENTIDADE` resolvível.

---

## Phase 3: User Story 1 — Registrar e trabalhar um lead pré-compra (P1) 🎯 MVP

**Goal**: CRUD do lead (contato + UTM + estágio/status/responsável/tags), com auditoria de
delta real e recálculo de score no lugar certo.

**Independent test**: `POST /crm/leads` cria `NOVO`/`ATIVO` + 1 audit; `PATCH` muda
estágio/responsável + 1 audit com delta; `PATCH` no-op → 0 audit; tag normalizada sem
duplicar; `responsavelId` inexistente → 404/422; `PATCH { score }` → 422.

- [x] T014 [P] [US1] `backend/src/crm/domain/lead/normalizar-lead.ts`: `normalizarNome`,
  `normalizarOrigem` (slug ≤60), `normalizarTag` (`trim`+`lowercase`+espaço→`-`; vazio →
  erro), `normalizarContato` (e-mail `lowercase`+`trim`+formato; telefone E.164 `+55`;
  documento só dígitos + DV de CPF/CNPJ — duplicação mínima, research §2).
- [x] T015 [P] [US1] `backend/src/crm/domain/lead/normalizar-lead.spec.ts`: tags
  (normaliza/dedupe/vazia→erro), e-mail, telefone E.164, documento DV inválido→erro.
- [x] T016 [P] [US1] DTOs zod em `backend/src/crm/dto/`: `criar-lead.schema.ts` (nome
  obrigatório; `email`|`telefone` obrigatório; `documento?`, `origem?`, `utm*?`, `estagio?`,
  `responsavelId?`, `tags?`; **rejeita** `score`/`pessoaId`/`status:CONVERTIDO`),
  `atualizar-lead.schema.ts` (todos opcionais; `status` só `ATIVO|DESCARTADO`; rejeita
  `score`/`pessoaId`/`convertidoEm`), `tag.schema.ts`.
- [x] T017 [US1] `backend/src/crm/infra/lead/lead.repository.ts`: `criar`, `atualizar`,
  `porId`, `buscarSemelhantes(email?, telefone?)` (leads `ATIVO` com mesmo contato),
  `usuarioExiste(id)` (checa `usuario`). Prisma fino.
- [x] T018 [US1] `backend/src/crm/application/lead/lead.service.ts`: `criar` (valida
  contato mínimo; `responsavelId` inexistente → 404/422; devolve `leadsSemelhantes`;
  recalcula score inline — usa `calcularScore` da Phase 5, importado já; até lá, score=0 e
  ajusta na Phase 5), `atualizar`/`mudarEstagio`/`mudarStatus`/`atribuirResponsavel`
  (`CONVERTIDO` imutável por CRUD → 409), `addTag`/`removerTag`. Cada escrita → 1
  `crm_lead_audit` com `motivo` adequado; no-op → 0. `score`/`pessoaId` no corpo → 422.
- [x] T019 [US1] `backend/src/crm/lead.controller.ts` (parcial): `POST /crm/leads`
  (`@RequerPermissao('lead:criar')`), `PATCH /crm/leads/:id`, `POST`/`DELETE
  /crm/leads/:id/tags` (`@RequerPermissao('lead:editar')`), `GET /crm/leads/:id`
  (`@AutenticadoBasta()` — escopo pleno chega na US2; por ora devolve o lead + `campos`
  vazios). Registrar no `CrmModule`. **Sem** `DELETE /crm/leads/:id`.
- [x] T020 [US1] e2e em `backend/test/crm-lead.e2e-spec.ts` (bloco US1): migração aplica;
  `POST` cria `NOVO`/`ATIVO` + 1 audit (delta = campos); `POST` sem contato → 422; `POST`
  e-mail já usado → cria + `leadsSemelhantes`; `PATCH` estágio+responsável → 1 audit com
  delta; `PATCH` no-op → 0 audit; `PATCH { score }` → 422; tag `"  Webinar-Out "` →
  `webinar-out`, duplicada → no-op, vazia → 422; `responsavelId` inexistente → 404/422.

**Checkpoint**: US1 e2e verde isolada; `/health` = 11; regressão 003–007 verde.

---

## Phase 4: User Story 2 — Ver só os leads certos conforme a permissão (P1)

**Goal**: escopo de visão (`lead:ver_todos` vs `lead:ver_proprios`) aplicado no `where`,
mais lista com filtros e busca.

**Independent test**: sujeito só `ver_proprios` → `GET /crm/leads` só os dele;
`GET /crm/leads/:idDeOutro` → 404; `?responsavelId=<outro>` → vazio; lead sem responsável →
invisível; sem nenhuma das duas → 403.

- [x] T021 [P] [US2] `backend/src/crm/dto/listar-leads.schema.ts`: `estagio?`, `status?`
  (default exclui `CONVERTIDO`), `origem?`, `responsavelId?`, `q?`, `campo:<chave>?`
  (parsing de chaves `campo:*`), `page?`, `pageSize?` (≤100, default 25), `ordenarPor?`
  (`score|criadoEm`, default `score` desc).
- [x] T022 [US2] `backend/src/crm/application/lead/lead-consulta.service.ts`: recebe o
  `Request`; `SujeitoRbacService.permissoesDe(req)` → gate OU (`lead:ver_todos` |
  `lead:ver_proprios`; senão `ForbiddenException`); monta `where` base
  (`ver_todos`→sem filtro; `ver_proprios`→`responsavelId = sujeito.usuarioId AND
  responsavelId != null`); aplica filtros/busca/`campo:*` com `AND` (nunca ampliando);
  `listar(filtros, req)` paginado, `obter(id, req)` → 404 se fora do `where`.
- [x] T023 [US2] Ligar no `lead.controller.ts`: `GET /crm/leads` e `GET /crm/leads/:id`
  passam pelo `lead-consulta.service`; os serviços de escrita da US1 revalidam o escopo
  antes de tocar um lead que o sujeito não enxerga (404). Rotas de leitura =
  `@AutenticadoBasta()`.
- [x] T024 [US2] e2e (bloco US2): 3 leads (responsáveis `U`, `V`, sem responsável);
  token `ver_proprios` de `U` → lista = só os de `U`; `GET :idDeV` → 404; `?responsavelId=V`
  → vazio; lead sem responsável → ausente; token `ver_todos` → vê os 3 (incl. fila não
  atribuída); token sem `lead:*` → 403 em `GET /crm/leads` e `GET /crm/leads/:id`;
  credencial de serviço → vê tudo (cai em `ver_todos`).

**Checkpoint**: US1 + US2 e2e verdes; SC-003 (0 vazamento) coberto.

---

## Phase 5: User Story 3 — Score automático, determinístico e recalculável (P2)

**Goal**: `calcularScore` puro + endpoints de recálculo idempotentes.

**Independent test**: dois estados iguais → mesmo score; completar contato → sobe;
recálculo 5× → estável; lote 2× → 0 diff na 2ª; `score` sempre `[0,100]`; matriz `TZ`.

- [x] T025 [P] [US3] `backend/src/crm/domain/lead/scoring.ts`: `calcularScore(estado:
  EstadoScoreLead) → number` + `PESOS_SCORE_LEAD` (const congelada) conforme
  `contracts/scoring.md`. Usa `agoraUtc()`/`parseInstante` do core; `clamp(round(soma), 0,
  100)`.
- [x] T026 [P] [US3] `backend/src/crm/domain/lead/scoring.spec.ts`: tabela de casos de
  `contracts/scoring.md` (1–8: determinismo, base=31, completar sobe, 500×, clamp 0 e 100,
  nunca `NaN`); marcar o arquivo para a matriz `TZ` da CI (UTC/Sao_Paulo/Tokyo).
- [x] T027 [US3] `backend/src/crm/application/lead/lead-score.service.ts`: `montarEstado(lead)`
  (`qtdInteracoes = 0` até a 009), `recalcular(id)` (no-op se igual; senão grava `score` +
  `scoreAtualizadoEm` + 1 `crm_lead_audit` `motivo="recalculo"`), `recalcularLote(cursor?,
  tamanho=200)` (páginas por `id` asc, cada uma em `$transaction`, idempotente, retomável).
- [x] T028 [US3] Fechar o `lead.service.ts` (US1): após qualquer escrita que mude insumo
  de score (contato, `estagio`, tag) chamar `lead-score.recalcular` na mesma transação.
- [x] T029 [US3] `lead.controller.ts`: `POST /crm/leads/:id/recalcular-score` e
  `POST /crm/leads/recalcular-score` (lote) — `@RequerPermissao('lead:editar')`;
  `backend/src/crm/dto/recalcular-lote.schema.ts` (`cursor?`, `tamanho?`).
- [x] T030 [US3] e2e (bloco US3): `recalcular-score` 5× → score estável; lote 2× → 0 diff
  na 2ª; `PATCH` que completa e-mail → score sobe e há 1 audit `recalculo` (não `editar` do
  score); `score` sempre inteiro `[0,100]`; `PATCH { score: 999 }` → 422.

**Checkpoint**: SC-001/SC-002/SC-010 cobertos; matriz `TZ` verde.

---

## Phase 6: User Story 4 — Converter o lead em pessoa reusando a engine da 005 (P2)

**Goal**: `POST /crm/leads/:id/converter` via `PortaIdentidade`, idempotente, sem importar
`clientes`.

**Independent test**: e-mail casa `pessoa` → vincula à existente, 0 pessoa nova; e-mail
novo → pessoa nova; converter 2× → mesmo `pessoaId`, 0 contato duplicado, 0 audit novo;
sem `pessoa:editar` → 403; `DESCARTADO` → 409; `grep` de import `clientes` em `src/crm` = 0.

- [x] T031 [P] [US4] `backend/src/crm/domain/lead/plano-conversao.ts`: `podeConverter(lead)
  → { ok } | { erro: 'lead_descartado' | 'ja_convertido' }` (`ATIVO` ok; `DESCARTADO` →
  409; `CONVERTIDO` → no-op) + `montarDadosIdentidade(lead) → DadosIdentidadeLead`.
- [x] T032 [P] [US4] `backend/src/crm/domain/lead/plano-conversao.spec.ts`: os 3 estados de
  `podeConverter`; `montarDadosIdentidade` mapeia documento/e-mail/telefone/nome.
- [x] T033 [US4] `backend/src/crm/application/lead/lead-conversao.service.ts`: injeta
  `@Inject(PORTA_IDENTIDADE) porta: PortaIdentidade`; `converter(id, req)`:
  `podeConverter` → `$transaction`( `porta.resolverOuCriar(montarDadosIdentidade(lead), {
  criar: true, origem: { plataformaOrigem: 'crm_lead', refs: [{ tipoRef: 'lead_id',
  valorRef: id }] } })` → grava `pessoaId`, `status = CONVERTIDO`, `convertidoEm` → 1
  `crm_lead_audit` `motivo="converter"` delta `{ status, pessoa_id }`); já `CONVERTIDO` →
  no-op (mesmo `pessoaId`, 0 audit). Respeita o escopo de visão (404 fora do escopo).
- [x] T034 [US4] `lead.controller.ts`: `POST /crm/leads/:id/converter` —
  `@RequerPermissao('lead:editar', 'pessoa:editar')` (guard resolve o E). Resposta
  `{ leadId, pessoaId, criouPessoa, status }`.
- [x] T035 [US4] e2e (bloco US4): `pessoa` com e-mail `x` + lead e-mail `x` → converter
  aponta p/ existente, 0 pessoa nova; lead e-mail novo → pessoa nova (`criouPessoa:true`);
  converter 2× → mesmo `pessoaId`, 0 contato duplicado (checar `pessoa_email`/`pessoa_*`),
  0 audit novo; sujeito com `lead:editar` sem `pessoa:editar` → 403, lead segue `ATIVO`;
  lead `DESCARTADO` → 409; 1 `crm_lead_audit` `converter`.
- [x] T036 [US4] Teste de fronteira: `backend/test/crm-lead.e2e-spec.ts` (ou um
  `*.structure.spec.ts`) faz `grep -R "from '.*clientes" backend/src/crm` → **0**; e
  `npm run lint` (regra `import/no-restricted-paths`) verde. Documentar em SC-005.

**Checkpoint**: SC-004/SC-005 cobertos; conversão idempotente e sem acoplamento.

---

## Phase 7: User Story 5 — Campos personalizados por lead (P3)

**Goal**: definições administráveis + valores validados por tipo, `PUT` = substituição
total.

**Independent test**: `POST /crm/admin/campos-lead` (SELECAO sem `opcoes` → 422; chave
repetida → 409); `PUT` valores — chave desconhecida/tipo incompatível/`obrigatorio` ausente
→ 422; substituição total; delta auditado; `DELETE` de definição em uso → 409;
`?campo:<chave>=` filtra respeitando o escopo.

- [x] T037 [P] [US5] DTOs zod: `backend/src/crm/dto/campo-personalizado-def.schema.ts`
  (`chave` `^[a-z][a-z0-9_]{1,39}$`; `tipo`; `opcoes` não-vazio **sse** `SELECAO`;
  `obrigatorio`; no `PATCH` `chave`/`tipo` proibidos),
  `backend/src/crm/dto/campos-personalizados-valores.schema.ts` (objeto `chave→valor|null`).
- [x] T038 [P] [US5] `backend/src/crm/domain/lead/validar-valor-campo.ts` (puro):
  `validarValor(tipo, opcoes, valor) → { ok, valorCanonico } | { erro }` para `TEXTO`
  (trim; vazio→remove), `NUMERO` (`Number.isFinite`), `BOOLEANO`, `DATA` (`YYYY-MM-DD`),
  `SELECAO` (∈ `opcoes`). + `.spec.ts` com a tabela de `contracts/campos-personalizados.md`.
- [x] T039 [US5] Infra: `backend/src/crm/infra/lead/campo-personalizado.repository.ts`
  (CRUD def + `emUso(id)`), `backend/src/crm/infra/lead/valor-campo.repository.ts`
  (`porLead`, `upsertMuitos`, `deletarMuitos`).
- [x] T040 [US5] `backend/src/crm/application/lead/campo-personalizado.service.ts`: CRUD das
  definições; `DELETE` de definição em uso → 409 (`{ erro:'campo_em_uso',
  sugestao:'PATCH ativo=false' }`); mudança de definição → 1 registro em **`crm_admin_audit`**
  (reusa `CrmAdminAuditService` da 007).
- [x] T041 [US5] `backend/src/crm/application/lead/valor-campo.service.ts`:
  `obter(leadId, req)` (respeita escopo), `substituir(leadId, mapa, req)` — carrega
  definições ativas; chave desconhecida/inativa → 422; `validarValor` → 422; `obrigatorio`
  ativa ausente/`null` → 422; diff → upsert/delete; 1 `crm_lead_audit`
  `motivo="campos_personalizados"` delta por chave; no-op → 0.
- [x] T042 [US5] `backend/src/crm/campo-personalizado.controller.ts`: prefixo
  `/crm/admin/campos-lead` — `GET`/`POST`/`PATCH :id`/`DELETE :id`
  (`@RequerPermissao('crm_admin:gerir_campos_lead')`; `GET` aceita também `crm_admin:ver`).
  No `lead.controller.ts`: `GET`/`PUT /crm/leads/:id/campos-personalizados`
  (`@AutenticadoBasta()` / `@RequerPermissao('lead:editar')`). Registrar no `CrmModule`.
- [x] T043 [US5] `lead-consulta.service`: suporte a `?campo:<chave>=<valor>` (join
  `valor_campo_lead` por `chave` da definição), com `AND` e respeitando o escopo.
- [x] T044 [US5] e2e (bloco US5): criar definição `nicho` `SELECAO` (+ 422 sem `opcoes`,
  409 chave repetida); `PUT` valores — chave desconhecida → 422, valor fora de `opcoes` →
  422, definição `obrigatorio` ausente → 422; substituição total (chave omitida some);
  delta em `crm_lead_audit`; `PATCH` def `{ ativo:false }` audita em `crm_admin_audit`;
  `DELETE` def com valores → 409; `GET /crm/leads?campo:nicho=clinica` respeita `ver_proprios`.

**Checkpoint**: CL-03 entregue; validação por tipo coberta.

---

## Phase 8: User Story 6 — Painel CRM · Leads (P3) + porta `RegistrarLeadService`

**Goal**: frontend de lista/detalhe/conversão + a porta in-process para a spec 035.

**Independent test (frontend)**: nav some sem permissão; `ver_proprios` mostra subconjunto;
sem `lead:editar` sem controles; **Converter** só com `lead:editar` + `pessoa:editar` e
`ATIVO`; 403 → banner, sessão intacta.

- [x] T045 [P] [US6] `backend/src/crm/application/lead/registrar-lead.service.ts`:
  `@Injectable()` `RegistrarLeadService.registrar(entrada, { origem, idExterno })` —
  idempotente por `(origem, id_externo)` (índice único parcial); reentrada → lead existente
  `{ leadId, criado:false }`; audita `AJUSTE_MANUAL` autor = `origem`. Exportar no
  `CrmModule` (`exports: [RegistrarLeadService]`).
- [x] T046 [P] [US6] e2e (bloco US6-backend): `registrar` cria; reentrada com a mesma
  `(origem, idExterno)` → mesmo `leadId`, `criado:false`; sem endpoint HTTP.
- [x] T047 [P] [US6] Frontend: estender `frontend/src/auth/RequirePermissao.tsx` com prop
  `anyOf?: string[]` (`perms.some(p => permissoes.has(p))`) e
  `frontend/src/shell/nav-items.ts` para aceitar `requerPermissao: string | string[]` (OU).
- [x] T048 [US6] `frontend/src/shell/nav-items.ts`: `+ { label: 'CRM · Leads', to:
  '/crm/leads', requerPermissao: ['lead:ver_todos','lead:ver_proprios'] }`.
  `frontend/src/app/router.tsx`: rotas `/crm/leads` e `/crm/leads/:id` sob
  `<RequirePermissao anyOf={['lead:ver_todos','lead:ver_proprios']} />`.
- [x] T049 [P] [US6] `frontend/src/leads/leads-api.ts`: `apiFetch` tipado (listar/obter/
  criar/patch/tags/recalcular/converter/campos). `frontend/src/test/setup.ts`: defaults de
  `fetch` p/ `/crm/leads/*` e `/crm/admin/campos-lead*`; adicionar `lead:criar`,
  `lead:editar`, `lead:ver_todos`, `lead:ver_proprios`, `crm_admin:gerir_campos_lead` a
  `TODAS_PERMISSOES`.
- [x] T050 [US6] `frontend/src/leads/LeadsPage.tsx`: lista (nome, contato, origem, estágio,
  status, **score**, responsável), filtros (estágio/status/origem/responsável) + busca `q`,
  paginação, ordenação por score; **Novo lead** só com `lead:criar` (form: nome +
  e-mail|telefone + opcionais; aviso `leadsSemelhantes`).
- [x] T051 [US6] `frontend/src/leads/LeadDetalhePage.tsx`: contato/UTM/score (+ **Recalcular**
  com `lead:editar`), tags (add/remover), campos personalizados (form gerado das
  definições; `PUT` com `lead:editar`), timeline de auditoria; ações estágio/status/
  responsável; **Converter em pessoa** só com `lead:editar` + `pessoa:editar` e `ATIVO`;
  pós-conversão mostra vínculo + `CONVERTIDO`; `DESCARTADO` → "Reativar".
- [x] T052 [P] [US6] Testes `frontend/src/leads/*.test.tsx` (vitest + Testing Library):
  tabela de `contracts/frontend-leads.md` (nav ausente sem permissão; rota → `<SemPermissao>`;
  `ver_proprios` monta; sem `lead:editar` sem controles; **Converter** condicionado às 2
  permissões; 403 → banner + token intacto).
- [~] T053 [US6] (opcional) sub-aba **Campos de lead** no painel **CRM · Administração** da
  007 — **adiada**. Os endpoints `/crm/admin/campos-lead` estão prontos e testados; o
  editor de **valores** por lead já está no detalhe do lead. A UI de gestão das
  **definições** entra numa spec de polimento do CRM (013/017/053) ou por `curl` até lá.

**Checkpoint**: painel funcional consumindo só a API; SC-013 coberto.

---

## Phase 9: Polish & cross-cutting

- [x] T054 [P] Rodar a suíte inteira: `npm run test` (unit) + `npm run test:e2e` (backend)
  + `npm run test --workspace frontend`. Regressão 003–007 verde; `/health`
  `contexts.length === 11`; matriz `TZ` do `scoring.spec.ts` verde na CI.
- [x] T055 [P] `GET /crm/leads/:id/auditoria` (opcional, FR-041) — leitura paginada de
  `crm_lead_audit` daquele lead, `@AutenticadoBasta()` + escopo. Só se sobrar escopo; senão
  remeter à 053.
- [x] T056 [P] Conferir `contracts/` vs implementação (rotas, códigos HTTP, shapes de
  resposta) e `quickstart.md` (Definition of Done) — ajustar divergências.
- [x] T057 Criar `docs/008-crm-lead.md`: entidade `lead` (campos, enums), escopo por
  permissão, scoring (regra + `PESOS_SCORE_LEAD`), `PortaIdentidade` + wiring `@Global()`
  (CL-02) e o padrão para a 018, conversão arquivar+vincular (CL-01), campos personalizados
  (CL-03), porta `RegistrarLeadService`, nota "promover `normalizar`/DV ao `core` no
  futuro" (research §2).
- [x] T058 Atualizar `CLAUDE.md` (bloco SPECKIT já aponta para o plano — conferir o resumo
  da spec no corpo, seção "Stack", como fizeram 005–007), `README.md` (lista de specs
  implementadas) e `ROADMAP.md` (marcar `- [x] 008 — crm-lead` com o resumo no padrão das
  001–007).
- [x] T059 Verificação final anti-regressão de segredos/fronteira: `grep -R "clientes"
  backend/src/crm --include='*.ts'` só comentários; catálogo `lead:*` byte-idêntico ao da
  007 (`git diff` mostra só `+crm_admin:gerir_campos_lead`); `package.json` (backend +
  frontend) sem dependência nova; `prisma/migrations` com exatamente 1 pasta nova.

---

## Dependencies

- **Phase 1 → Phase 2 → (Phase 3 = US1)**: bloqueiam tudo.
- **US2 (Phase 4)** depende de US1 (precisa do `lead` e do controller).
- **US3 (Phase 5)** depende de US1 (recalcula em cima do CRUD); ajusta o `lead.service` da
  US1 (T028).
- **US4 (Phase 6)** depende de US1 (lead existente) + Phase 2 (T005–T008, a `PortaIdentidade`).
- **US5 (Phase 7)** depende de US1 (lead) + Phase 2 (T009, permissão); usa `CrmAdminAuditService`
  da 007.
- **US6 (Phase 8)** depende de US1–US5 (consome os endpoints); a porta `RegistrarLeadService`
  (T045) depende só da Phase 1/2.
- **Phase 9** depende de todas.

Ordem de entrega recomendada: **US1 → US2** (MVP P1 completo) → US3 → US4 → US5 → US6 →
Polish.

## Parallel opportunities

- Phase 2: T005, T006, T008, T009, T010, T011, T013 em paralelo (arquivos distintos);
  T007 depois de T006; T012 depois de T010/T011.
- US1: T014/T015/T016 em paralelo; T017→T018→T019→T020 em série.
- US3: T025/T026 em paralelo; T027→T028→T029→T030 em série.
- US4: T031/T032 em paralelo; T033→T034→T035→T036 em série.
- US5: T037/T038 em paralelo; T039→T040/T041→T042→T043→T044.
- US6: T045/T046/T047/T049/T052 em paralelo com o resto; T048 depois de T047;
  T050/T051 depois de T049.
- Phase 9: T054/T055/T056 em paralelo; T057→T058→T059 em série no fim.

## Implementation strategy

**MVP = US1 + US2** (P1): um CRM de leads utilizável por API — criar, trabalhar o funil,
tags, e cada pessoa do comercial vendo só a sua carteira, tudo auditado. Entregável e
testável sem US3–US6.

Incrementos seguintes, cada um independquível e testável isolado: **US3** (score derivado),
**US4** (conversão reusando a 005 sem acoplar contexto — a peça arquitetural), **US5**
(campos personalizados administráveis), **US6** (painel + porta para Marketing).

**Total: 59 tarefas** — Setup 4 · Foundational 9 · US1 7 · US2 4 · US3 6 · US4 6 · US5 8 ·
US6 9 · Polish 6.
