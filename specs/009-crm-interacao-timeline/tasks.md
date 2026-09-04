# Tasks: Timeline de Interações do CRM — histórico unificado, notas, tags e segmentos

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Branch**: `009-crm-interacao-timeline`

Convenção: `[P]` = paralelizável (arquivos diferentes, sem dependência entre si).

## Fase 1 — Schema e migração

- [x] T001 `backend/prisma/schema.prisma`: + enums `InteracaoTipo`, `InteracaoDirecao`,
      `SegmentoAlvo`; + models `Interacao`, `Tag`, `TagAssociacao`, `Segmento`,
      `CrmInteracaoAudit`; `Lead` perde o campo `tags`.
- [x] T002 Gerar a migração (`prisma migrate dev --name crm_interacao`) e editar o SQL
      gerado: acrescentar os 2 `CHECK`s (`interacao`, `tag_associacao`) e os 3 índices
      únicos parciais de `tag_associacao`; confirmar `ALTER TABLE lead DROP COLUMN tags`.
- [x] T003 Rodar a migração + regenerar `@prisma/client`; confirmar que o
      `test/setup-db.ts` aplica limpo num schema novo. Verificado na **CI do PR #8**
      (sandbox de desenvolvimento sem Docker/Postgres) — migração aplicada limpa contra
      Postgres real.

## Fase 2 — Domínio puro (sem banco) `[P]` entre arquivos diferentes

- [x] T004 [P] `backend/src/crm/domain/interacao/ancora.ts` + `.spec.ts` —
      `validarAncora({pessoaId,leadId})`.
- [x] T005 [P] `backend/src/crm/domain/interacao/mutabilidade.ts` + `.spec.ts` —
      `podeEditar(interacao, sujeito)`.
- [x] T006 [P] `backend/src/crm/domain/interacao/validar-campos-tipo.ts` + `.spec.ts` —
      regra de `direcao`/`notaNps` por `tipo`.
- [x] T007 [P] `backend/src/crm/domain/interacao/index.ts` — barrel.
- [x] T008 [P] `backend/src/crm/domain/tag/normalizar-tag.ts` + `.spec.ts` (move a regra que
      hoje vive embutida em `domain/lead/normalizar-lead.ts`).
- [x] T009 `backend/src/crm/domain/lead/normalizar-lead.ts` — passa a importar
      `normalizarTag` de `domain/tag/`; `normalizar-lead.spec.ts` continua verde.
- [x] T010 [P] `backend/src/crm/domain/tag/index.ts` — barrel.
- [x] T011 [P] `backend/src/crm/domain/segmento/filtro-segmento.ts` + `.spec.ts` —
      `validarFiltro`/`construirWhere` para `LEAD` e `PESSOA`.
- [x] T012 [P] `backend/src/crm/domain/segmento/index.ts` — barrel.

## Fase 3 — Persistência (infra)

- [x] T013 [P] `backend/src/crm/infra/interacao/interacao.repository.ts` — `criar`,
      `obterPorId`, `listarPorPessoa` (`OR`/`JOIN`), `listarPorLead`, `editarNota`,
      `removerNota`, `buscarPorChaveOrigem`.
- [x] T014 [P] `backend/src/crm/infra/tag/tag.repository.ts` — `resolverOuCriarPorTexto`,
      `listarCatalogo` (com contagem de uso), `criar`, `atualizar`.
- [x] T015 [P] `backend/src/crm/infra/tag/tag-associacao.repository.ts` — `associar`
      (idempotente), `desassociar`.
- [x] T016 [P] `backend/src/crm/infra/segmento/segmento.repository.ts` — CRUD +
      `listarMembros(segmento, whereEscopo, paginacao)`.
- [x] T017 [P] índices `backend/src/crm/infra/{interacao,tag,segmento}/index.ts`.

## Fase 4 — Aplicação (serviços + auditoria)

- [x] T018 `backend/src/crm/application/interacao/crm-interacao-audit.service.ts` —
      simétrico a `CrmLeadAuditService`.
- [x] T019 `backend/src/crm/application/interacao/interacao.service.ts` — `criar`,
      `editarNota`, `removerNota`, `listarPorPessoa` (com checagem `pessoa:ver` via
      `PermissionGuard`/serviço de pessoa), `listarPorLead` (via `LeadConsultaService.obter`
      primeiro), `obterPorId` (checa escopo pela âncora).
- [x] T020 `backend/src/crm/application/interacao/registrar-interacao.service.ts` — porta
      in-process `RegistrarInteracaoService`.
- [x] T021 `backend/src/crm/application/interacao/index.ts` — barrel.
- [x] T022 `backend/src/crm/application/tag/tag.service.ts` — `resolverOuCriar`,
      `associar`/`desassociar` por âncora (roteia auditoria: lead→`crm_lead_audit`,
      pessoa/interacao→`crm_interacao_audit`), `listarCatalogo`, `criarExplicita`,
      `atualizar` (audita em `crm_admin_audit`, reusa `CrmAdminAuditService` da 007).
- [x] T023 `backend/src/crm/application/tag/index.ts` — barrel.
- [x] T024 `backend/src/crm/application/segmento/segmento.service.ts` — CRUD (audita em
      `crm_interacao_audit`) + `listarMembros` (combina `construirWhere` com o `where` de
      escopo de `LeadConsultaService`/`pessoa:ver`).
- [x] T025 `backend/src/crm/application/segmento/index.ts` — barrel.
- [x] T026 Editar `backend/src/crm/application/lead/lead.service.ts` (e/ou o serviço que
      hoje trata `POST/DELETE tags` da 008) para delegar ao `TagService.associar`/
      `desassociar(ancora: 'lead', ...)` — mesma assinatura pública, auditoria continua em
      `crm_lead_audit`. `lead-consulta.service.ts` para de projetar `tags` da coluna e passa
      a montar a partir de `tag_associacao`.

## Fase 5 — HTTP (controllers + DTOs)

- [x] T027 [P] `backend/src/crm/dto/criar-interacao.schema.ts`,
      `editar-interacao.schema.ts` (zod).
- [x] T028 [P] `backend/src/crm/dto/tag.schema.ts`.
- [x] T029 [P] `backend/src/crm/dto/criar-segmento.schema.ts`,
      `atualizar-segmento.schema.ts`, `filtro-segmento.schema.ts`.
- [x] T030 `backend/src/crm/interacao.controller.ts` — `POST /crm/interacoes`,
      `GET /crm/pessoas/:pessoaId/interacoes`, `GET /crm/leads/:leadId/interacoes`,
      `GET /crm/interacoes/:id`, `PATCH`/`DELETE /crm/interacoes/:id`,
      `POST`/`DELETE /crm/interacoes/:id/tags`.
- [x] T031 `backend/src/crm/pessoa-tag.controller.ts` — `POST`/`DELETE
      /crm/pessoas/:id/tags` sob `pessoa:editar`.
- [x] T032 `backend/src/crm/tag.controller.ts` — `GET /crm/tags`,
      `POST`/`PATCH /crm/admin/tags`.
- [x] T033 `backend/src/crm/segmento.controller.ts` — `POST`/`PATCH`/`DELETE
      /crm/segmentos`, `GET /crm/segmentos`, `GET /crm/segmentos/:id`,
      `GET /crm/segmentos/:id/membros`.
- [x] T034 Editar `backend/src/crm/lead.controller.ts` — endpoints de tag delegam ao
      `TagService` (T026); contrato HTTP inalterado.

## Fase 6 — RBAC e módulo

- [x] T035 `backend/src/auth/rbac/catalogo.ts` — +5 permissões (`interacao:registrar`,
      `interacao:gerir`, `segmento:ver`, `segmento:gerir`, `crm_admin:gerir_tags`);
      `catalogo.spec.ts` ganha a asserção.
- [x] T036 `backend/src/crm/crm.module.ts` — registra os 4 controllers novos + providers;
      `exports: [..., RegistrarInteracaoService]`.

## Fase 7 — Testes de integração (e2e, Postgres real)

- [x] T037 `backend/test/support/crm-interacao.ts` — helpers (criar pessoa/lead/interação,
      registrar tag, criar segmento, ler auditoria).
- [x] T038 `backend/test/crm-interacao.e2e-spec.ts` — **verde na CI do PR #8** (Postgres
      real; 176/176 testes e2e passaram, incluindo regressão 003–008). Duas rodadas de CI
      encontraram e corrigiram 2 bugs reais que o sandbox de desenvolvimento (sem Docker)
      não pôde revelar: `autor_id`/`criado_por` recebendo o `sub` bruto do JWT (quebra com
      a credencial de serviço, que não é UUID de `Usuario`) e a faixa 0–10 de `notaNps`
      duplicada no DTO (mascarava o 422 semântico do domínio com um 400 estrutural). Cobre:
      migração; timeline unida sem
      duplicar; âncora inválida → 422; mutabilidade por tipo (matriz completa); escopo por
      âncora (lead `ver_proprios`, pessoa `pessoa:ver`, timeline da pessoa inclui lead
      convertido mesmo sem `lead:ver_*`); tag compartilhada + idempotência + regressão do
      contrato REST de `/crm/leads/:id/tags` da 008; segmento (filtro fora do esquema,
      membros respeitam escopo, reflete mudança sem ação manual); guard 401/403/2xx em toda
      rota nova; catálogo +5; regressão 003–008 + `/health` = 11; `grep` de `import
      .*clientes` em `src/crm/**` = 0.

## Fase 8 — Frontend

- [x] T039 [P] `frontend/src/interacoes/interacoes-api.ts` — `apiFetch` tipado.
- [x] T040 [P] `frontend/src/interacoes/TimelineInteracoes.tsx` — lista + composer + editar/
      remover nota condicionados a permissão.
- [x] T041 [P] `frontend/src/interacoes/TagPicker.tsx` — chip picker reusável.
- [x] T042 Editar `frontend/src/pessoas/PessoaDetalhePage.tsx` — + aba Timeline + `TagPicker`.
- [x] T043 Editar `frontend/src/leads/LeadDetalhePage.tsx` — + aba Timeline + `TagPicker`
      (troca o input de tag livre da 008 pelo picker compartilhado).
- [x] T044 [P] `frontend/src/segmentos/segmentos-api.ts`.
- [x] T045 [P] `frontend/src/segmentos/SegmentosPage.tsx` — lista.
- [x] T046 [P] `frontend/src/segmentos/SegmentoDetalhePage.tsx` — membros.
- [x] T047 `frontend/src/shell/nav-items.ts` — + **CRM · Segmentos** (`segmento:ver`).
- [x] T048 `frontend/src/app/router.tsx` — rota `/crm/segmentos` sob `RequirePermissao`.
- [x] T049 `frontend/src/test/setup.ts` — defaults para as novas rotas + novas permissões em
      `TODAS_PERMISSOES`.
- [x] T050 [P] `*.test.tsx` para T040/T041/T045/T046 (Testing Library): permissão
      condiciona composer/editar/remover/Novo segmento; 403 → banner, sessão intacta.

## Fase 9 — Qualidade e documentação

- [x] T051 `npm run lint && npm run typecheck && npm run build` — verde.
- [x] T052 `npm test` (unit backend + frontend) verdes localmente; `npm run test:e2e`
      verde na **CI do PR #8** (176/176, Postgres real — o sandbox de desenvolvimento não
      tinha Docker/Postgres para rodar isto localmente).
- [x] T053 `docs/009-crm-interacao-timeline.md` — novo (padrão dos docs 001–008).
- [x] T054 `CLAUDE.md` — seção Stack ganha o bloco condensado de 008+009; plano ativo
      (SPECKIT) aponta para 009 (a mais recente implementada); 008 arquivada em `<details>`.
- [x] T055 `README.md` — seção Status/estrutura ganha a 009.
- [x] T056 `ROADMAP.md` — marca 009 como `[x]` implementada e validada; atualiza "Próxima".
- [x] T057 Commit + PR (`009-crm-interacao-timeline` → `main`), mesma convenção das specs
      anteriores.

## Dependências entre fases

Fase 1 → 2/3 (schema precisa existir antes de repositórios; domínio puro não depende do
schema, mas os testes de repositório sim) → 4 (aplicação depende de domínio+infra) → 5
(controllers dependem de aplicação) → 6 (módulo registra os controllers; RBAC pode ser
paralelo a 2–5) → 7 (e2e depende de tudo montado) → 8 (frontend consome os endpoints da
fase 5) → 9 (fecha com lint/test/build/docs).
