# Implementation Plan: Timeline de Interações do CRM — histórico unificado, notas, tags e segmentos

**Branch**: `009-crm-interacao-timeline` | **Date**: 2026-09-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-crm-interacao-timeline/spec.md`

## Summary

Fecha o esboço 5.2‑E da visão dentro do _bounded context_ **`crm`** (já preenchido pelas
007/008): **`interacao`** (timeline unificada pessoa/lead), **`tag`** promovida a entidade
de 1ª classe (migrando `lead.tags: string[]` da 008), e **`segmento`** (query salva
declarativa, avaliada _on-read_). 5 tabelas Prisma novas + 1 coluna removida (7ª migração
de negócio), **+5 permissões** de catálogo, **0 dependência nova**, **nenhuma porta nova**,
`CONTEXT_MODULES` segue **11**. Nenhum contrato novo no `core` — as FKs que cruzam para
`Pessoa` seguem o precedente já estabelecido por `Lead.pessoaId`/`Lead.responsavelId`
(008/004): FK real no `schema.prisma` compartilhado, sem import de módulo TS.

1. **Domínio puro** (`src/crm/domain/interacao/`, `src/crm/domain/tag/`,
   `src/crm/domain/segmento/`, testável sem banco):
   - `ancora.ts` — `validarAncora({ pessoaId, leadId }) → { tipo: 'pessoa'|'lead', id }` puro;
     rejeita ambos ou nenhum.
   - `mutabilidade.ts` — `podeEditar(interacao, sujeito) → { ok } | { erro }` (CL-05: só
     `tipo = NOTA`, não removida, autor **ou** `interacao:gerir`).
   - `validar-campos-tipo.ts` — regra por `tipo`: `direcao` obrigatória em canal (exceto
     `NPS`, opcional), proibida em `NOTA`; `nota_nps` obrigatório 0–10 sse `NPS`.
   - `normalizar-tag.ts` — **reaproveita a mesma regra** de slug da 008
     (`trim`+`lowercase`+espaço interno→`-`), agora vivendo em `crm/domain/tag/` como fonte
     única — a normalização de tag da 008 passa a importar daqui (dedupe de lógica dentro do
     próprio `crm`, sem cruzar contexto).
   - `filtro-segmento.ts` — **`validarFiltro(alvo, filtro) → FiltroValidado`** (zod, esquema
     fechado por `alvo` — FR-021) + **`construirWhere(alvo, filtroValidado) →
     Prisma.LeadWhereInput | Prisma.PessoaWhereInput`** puro (monta o objeto de condição,
     não executa). Testável sem banco: entrada → shape do `where` esperado.
2. **Persistência Prisma** (7ª migração — `prisma/migrations/<ts>_crm_interacao/`): models
   `Interacao`, `Tag`, `TagAssociacao`, `Segmento`, `CrmInteracaoAudit` + enums
   `InteracaoTipo`, `InteracaoDirecao`, `SegmentoAlvo`; **altera** `Lead` removendo a coluna
   `tags`. `Interacao`: `pessoaId String? @db.Uuid`, `leadId String? @db.Uuid`, `CHECK`
   (`num_nonnulls(pessoa_id, lead_id) = 1`) via SQL bruto na migração (Prisma não modela
   `CHECK` — igual ao padrão já usado na 007 para `hora_fim > hora_inicio`, ver
   `research.md`). `TagAssociacao`: `leadId?`/`pessoaId?`/`interacaoId?` +
   `CHECK(num_nonnulls(...) = 1)` + 3 índices únicos parciais (`WHERE lead_id IS NOT NULL`
   etc.) — nenhuma tag duplicada na mesma âncora. `onDelete: Restrict` em toda FK para
   `usuario`/`pessoa`/`lead` (nunca cascata que apague histórico).
3. **Aplicação** (`src/crm/application/interacao/`, `.../tag/`, `.../segmento/`):
   - `crm-interacao-audit.service.ts` — simétrico ao `CrmLeadAuditService`/
     `CrmAdminAuditService`; `montarRegistroAuditoria`, só delta real.
   - `interacao.service.ts` — `criar` (valida âncora + campos por tipo + existência da
     âncora → 404), `editarNota`/`removerNota` (aplica `podeEditar`), `listarPorPessoa`
     (**UNION** `pessoa_id = :id` OR `lead_id IN (SELECT id FROM lead WHERE pessoa_id =
     :id)` — Prisma não expressa UNION nativamente entre 2 condições na mesma tabela
     facilmente com subquery de outra tabela: usa `OR: [{ pessoaId: id }, { lead: { pessoaId:
     id } }]`, que o Prisma traduz num único `SELECT` com `JOIN`/`OR` — sem N+1, ver
     `research.md` §1), `listarPorLead` (filtra `leadId = :id`, aplicando o escopo de visão
     do `LeadConsultaService` da 008 **por composição de serviço**, não por import de
     `clientes`).
   - `registrar-interacao.service.ts` — porta in-process `RegistrarInteracaoService`
     (idempotente por `(canalOrigem, idExterno)`), exportada do `CrmModule` para 011/012.
   - `tag.service.ts` — `resolverOuCriar(texto) → Tag` (upsert por slug), `associar(tag,
     ancora)`/`desassociar` (idempotente), `listarCatalogo()` (com contagem de uso por
     tipo de âncora), `criarExplicita`/`atualizar` (admin, `crm_admin:gerir_tags` →
     audita em `crm_admin_audit`, reusando `CrmAdminAuditService` da 007).
   - `segmento.service.ts` — CRUD (`segmento:gerir`, audita em `crm_interacao_audit`),
     `listarMembros(id, sujeito, paginacao)`: carrega `filtro`, chama `construirWhere`
     (domínio puro), executa contra `lead`/`pessoa` **combinando `AND`** com o `where` de
     escopo de visão (do `LeadConsultaService` para `alvo=LEAD`; `pessoa:ver` simples para
     `alvo=PESSOA` — sem escopo adicional na 005, é `ver`-tudo-ou-nada).
4. **HTTP** (`src/crm/`):
   - `interacao.controller.ts` — `POST /crm/interacoes` (`interacao:registrar`),
     `GET /crm/pessoas/:pessoaId/interacoes` (checagem via `pessoa:ver` — reusa o guard +
     validação de existência), `GET /crm/leads/:leadId/interacoes` (delega ao
     `LeadConsultaService.obter` para herdar o escopo — 404 se fora de escopo antes mesmo
     de listar), `GET /crm/interacoes/:id`, `PATCH`/`DELETE /crm/interacoes/:id`
     (`interacao:registrar` — a regra fina de autor vs `interacao:gerir` é checada **no
     serviço**, não só no guard), `POST`/`DELETE /crm/interacoes/:id/tags`.
   - `pessoa-tag.controller.ts` — `POST`/`DELETE /crm/pessoas/:id/tags` sob `pessoa:editar`
     (permissão já existente da 005 — nenhuma nova para isso).
   - `lead.controller.ts` (008, **editado**) — `POST`/`DELETE /crm/leads/:id/tags`
     passam a delegar ao `TagService` por baixo; contrato HTTP e permissão (`lead:editar`)
     **inalterados**; auditoria continua em `crm_lead_audit`.
   - `tag.controller.ts` — `GET /crm/tags` (`@AutenticadoBasta()`),
     `POST`/`PATCH /crm/admin/tags` (`crm_admin:gerir_tags`).
   - `segmento.controller.ts` — `POST`/`PATCH`/`DELETE /crm/segmentos` (`segmento:gerir`),
     `GET /crm/segmentos`, `GET /crm/segmentos/:id`, `GET /crm/segmentos/:id/membros`
     (`segmento:ver`).
   - `dto/` — schemas zod (`criar-interacao`, `editar-interacao`, `tag`, `criar-segmento`,
     `atualizar-segmento`, `filtro-segmento` por `alvo`).
5. **RBAC** (`src/auth/rbac/catalogo.ts`): **+5** — `interacao:registrar`,
   `interacao:gerir` (recurso novo `interacao`); `segmento:ver`, `segmento:gerir` (recurso
   novo `segmento`); `crm_admin:gerir_tags` (recurso `crm_admin`, 007). `pessoa:ver`/
   `pessoa:editar` (005) e `lead:ver_*`/`lead:editar` (008) **não mudam** — continuam
   controlando leitura/associação de tag por âncora.
6. **Módulo** (`src/crm/crm.module.ts`, editado): `+ InteracaoController`,
   `PessoaTagController`, `TagController`, `SegmentoController`, `+ providers`.
   `exports: [..., RegistrarInteracaoService]` (porta para 011/012, soma às exportações da
   008). Nenhum novo import de módulo — `crm` continua sem `ClientesModule`.
7. **Infra** (`.../infra/interacao/`, `.../infra/tag/`, `.../infra/segmento/`): repositórios
   finos Prisma, incluindo a query de `construirWhere` executada.
8. **Frontend**:
   - `frontend/src/pessoas/` e `frontend/src/leads/` ganham aba **Timeline** (componente
     compartilhado `frontend/src/interacoes/TimelineInteracoes.tsx` — composer + lista +
     editar/remover nota).
   - `frontend/src/segmentos/` — nova área: `SegmentosPage.tsx` (lista),
     `SegmentoDetalhePage.tsx` (membros), `segmentos-api.ts`.
   - Chip picker de tag compartilhado (`frontend/src/interacoes/TagPicker.tsx`) usado nas 3
     telas (pessoa/lead/interação).
   - `nav-items.ts` — `+ { label: 'CRM · Segmentos', to: '/crm/segmentos', requerPermissao:
     ['segmento:ver'] }`.

Abordagem: **0 dep nova**. Nenhum contrato novo no `core` — a fronteira do Princípio VI é
sobre import de módulo TS, e o `schema.prisma` já cruza contexto por FK desde a 004/008
(`Lead.responsavelId`, `Lead.pessoaId`). Timeline unida por `OR`/`JOIN` numa query só (sem
N+1). Mutabilidade fina por `tipo` (regra 8.2.2/CL-05 — canal é histórico real, não se
reescreve). `segmento` sempre deriva na leitura (regra 8.2.2). Migração de tag da 008
preserva contrato REST (SC-004). Testes: unit sem banco (âncora, mutabilidade, validação de
tipo, normalização de tag, `validarFiltro`/`construirWhere`); e2e Postgres real (migração;
timeline com UNION; mutabilidade por tipo; escopo por âncora; tag compartilhada +
regressão 008; segmento reflete estado atual; guard 401/403; catálogo +5; regressão
003–008; `/health` = 11). Ao fim: `docs/009-crm-interacao-timeline.md` +
`CLAUDE.md`/`README.md`/`ROADMAP.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova.** NestJS 11, Prisma `^6` + `@prisma/client` (5 models novos, 3
  enums novos), `zod` 3 (DTOs + `validarFiltro`). `EntidadeId`, `agoraUtc`,
  `montarRegistroAuditoria` vêm do `core`. `LeadConsultaService` (008) e
  `CrmAdminAuditService` (007) são reusados **por composição de serviço** dentro do próprio
  `crm` (mesmo módulo, sem cruzar contexto).
- Frontend: **nenhuma nova.** React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch` central (003/004), `usePermissoesEfetivas` + `RequirePermissao` (004).

**Storage**: **PostgreSQL 16 via Prisma** — 7ª migração de negócio (após `_rbac`,
`_clientes` ×2, `_ingestao`, `_crm_admin` ×2, `_crm_lead`). 5 tabelas novas: `interacao`,
`tag`, `tag_associacao`, `segmento`, `crm_interacao_audit`; **1 coluna removida**:
`lead.tags`. `CHECK` constraints via SQL bruto na própria migração (mesmo padrão da 007
para `janela_atendimento.hora_fim > hora_inicio`). Sem porta nova.

**Testing**:
- Backend unit (`jest`, sem banco):
  - `ancora.spec.ts` — pessoa xor lead; ambos → erro; nenhum → erro.
  - `mutabilidade.spec.ts` — `NOTA` própria editável; `NOTA` de outro sem `gerir` → erro;
    `NOTA` removida → erro; qualquer canal → sempre erro, mesmo com `gerir`.
  - `validar-campos-tipo.spec.ts` — `direcao` por tipo; `nota_nps` obrigatório/range só em
    `NPS`.
  - `normalizar-tag.spec.ts` — variações de caixa/espaço → mesmo slug; vazio → erro.
  - `filtro-segmento.spec.ts` — esquema fechado por `alvo` (chave estranha → erro; chave de
    `LEAD` em `PESSOA` → erro); `construirWhere` gera o shape esperado para cada campo
    (`estagio`, `tags`, `campoPersonalizado`, `criadoDe/Ate`) sem tocar banco.
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` já roda
  `migrate deploy` + `db seed`):
  - migração cria as 5 tabelas + enums, remove `lead.tags`; `CHECK`s recusam
    insert inválido (via SQL direto no teste).
  - **Timeline**: `POST` interação em pessoa e em lead; `GET` da pessoa traz as próprias +
    as do lead convertido nela (nenhuma duplicada); `POST` com as duas âncoras ou nenhuma →
    422; âncora inexistente → 404.
  - **Mutabilidade**: `PATCH`/`DELETE` em `NOTA` própria → sucede + audit; de outro autor
    sem `gerir` → 403; com `gerir` → sucede; em `NOTA` removida → 409; em qualquer canal →
    405/409 sempre, mesmo com `gerir`.
  - **Escopo**: `GET` de timeline de lead fora do escopo `ver_proprios` → 404; `GET` de
    timeline de pessoa sem `pessoa:ver` → 403; timeline da pessoa **inclui** interação de
    lead convertido mesmo sem `lead:ver_*` no sujeito (US3 cenário 3).
  - **Tag**: `POST` em lead cria/reaproveita; `POST` em pessoa com variação de
    caixa/espaço reaproveita a mesma tag (mesmo id); `DELETE` numa âncora não afeta a
    outra; associar 2× → idempotente, 0 duplicata; tag inativa → 422 ao associar por id/
    slug explícito; regressão do contrato REST de `/crm/leads/:id/tags` da 008 continua
    verde.
  - **Segmento**: `filtro` fora do esquema → 422; `.../membros` só traz quem casa **e**
    está no escopo de visão do sujeito; mudar um atributo do lead reflete na próxima
    leitura sem ação manual; `alvo=PESSOA` com campo de `LEAD` → 422.
  - **Guard**: cada rota nova sem token → 401; sem permissão → 403; credencial de serviço
    → 2xx em todas.
  - **Catálogo/efetivas**: `GET /admin/rbac/permissoes` inclui as 5 novas; `lead:*`/
    `pessoa:*` inalteradas.
  - **Regressão**: suíte 003–008 + `/health` (11 contextos) verdes; `grep` de
    `import .*clientes` em `src/crm/**` continua 0.
- Frontend (`vitest` + Testing Library, jsdom): aba Timeline sem `interacao:registrar` →
  sem composer; editar/remover só quando `podeEditar` (autor ou `gerir`); **CRM ·
  Segmentos** só com `segmento:ver`; sem `segmento:gerir` sem "Novo segmento"; 403 → banner,
  sessão intacta.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (configuráveis,
spec 001). Dev Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta funcional. Timeline de pessoa é uma query com `OR`/`JOIN`
(sem N+1); paginada (default 25, teto 100). `segmento/.../membros` é uma query derivada por
requisição — sem lista materializada a manter sincronizada.

**Constraints**:
- **Nenhuma porta nova** (3001/5174/55432 do próprio projeto; reusa
  `DATABASE_URL`/`TEST_DATABASE_URL`).
- **Contextos delimitados** (Princípio VI): `crm` continua sem importar `clientes`. FKs de
  `interacao`/`tag_associacao` para `Pessoa` são só `schema.prisma` (mesmo precedente
  `Lead.pessoaId`/`Lead.responsavelId`) — **nenhum contrato novo no `core`** é necessário
  para esta spec (diferente da 008, que precisou de `PortaIdentidade` porque chamava um
  **serviço com lógica**; aqui é só leitura/FK, sem lógica de negócio de `clientes`
  envolvida). ESLint `import/no-restricted-paths` continua verde.
- **Agregado derivado** (Princípio V / regra 8.2.2): membros de `segmento` são sempre
  `f(filtro, estado atual) → lista`, nunca uma tabela de associação persistida e
  reprocessada. `tag` associada é fato simples (não é métrica), por isso é uma linha real —
  não viola o princípio (não é uma contagem/soma incremental).
- **Mutabilidade fina** (CL-05): só `interacao.tipo = NOTA` aceita `PATCH`/`DELETE`; canal é
  append-only — corrige-se com nova interação, nunca reescrevendo histórico de contato real.
- **Escopo de visão por âncora**: timeline de `lead` herda o escopo `lead:ver_todos`/
  `ver_proprios` (008) via composição de serviço; timeline de `pessoa` exige `pessoa:ver`
  (005); nenhuma permissão nova de leitura de interação é criada (Princípio VIII).
- **Curadoria vs derivação** (Princípio VII): `tag`/`tag_associacao` são dado curado
  (atribuição manual); `segmento.filtro` é curado, mas os **membros** são sempre derivados —
  nunca uma coluna/tabela que possa divergir do filtro.
- **Auditoria** (Padrão Transversal): `crm_interacao_audit` nova cobre `interacao` + tag em
  pessoa/interação + `segmento`; tag em `lead` continua em `crm_lead_audit` (008); catálogo
  de tag (admin) vai para `crm_admin_audit` (007) — mesma forma canônica do core em todas.
- **RBAC 004**: cada endpoint sob `@RequerPermissao`/`@AutenticadoBasta`; +5 permissões;
  403 ≠ 401.
- **Superfície de escrita mínima** (Princípio VIII): endpoints cobrem só o que a visão
  5.2‑E/8.3 pede (interação, nota, tag, segmento). Nenhuma sincronização automática externa
  — a porta `RegistrarInteracaoService` é in-process e passiva (011/012 injetam). `DELETE`
  físico só em `segmento` (sem histórico a preservar); `interacao` e `tag` usam
  _soft-delete_/`ativo`.
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~30 arquivos novos no backend
(`src/crm/{domain,application,infra,dto}/{interacao,tag,segmento}/**`,
`interacao.controller.ts`, `pessoa-tag.controller.ts`, `tag.controller.ts`,
`segmento.controller.ts`, `crm.module.ts` estendido,
`prisma/migrations/<ts>_crm_interacao/`, `test/crm-interacao.e2e-spec.ts` +
`test/support/crm-interacao.ts`), ~3 arquivos editados no backend
(`lead.controller.ts`/`lead-tag`-related service da 008 passam a delegar ao `TagService`,
`schema.prisma`, `src/auth/rbac/catalogo.ts`), ~9 no frontend
(`src/interacoes/**`, `src/segmentos/**` + testes, `nav-items.ts`, `router.tsx`), **0 dep
nova**, **1 migração**, **~24 endpoints** (9 leitura + ~15 escrita), 1 doc novo, 3 docs
atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 5 tabelas nascem com **ID surrogate UUID v7** gerado na
      app. Nenhuma vem de plataforma de origem — não há `plataforma_origem`/`*_origem_ref`
      aqui (a chave de integração da porta `RegistrarInteracaoService` é `(canal_origem,
      id_externo)`, coluna comum fora da PK, mesmo padrão de `lead.(origem, id_externo)` na
      008). FKs para `usuario`/`pessoa`/`lead` referenciam PKs UUID, nunca id externo.
      Granularidade documentada em `data-model.md`: 1 `interacao` por PK, âncora XOR; 1
      `tag` por slug; ≤1 `tag_associacao` por `(tag, âncora)`; 1 `segmento` por PK.
- [x] **II. Clarificar antes de assumir**: 5 clarificações resolvidas com o dono do produto
      em 2026-09-04 (CL-01 âncora polimórfica + UNION; CL-02 nota = tipo de interação; CL-03
      segmento como query salva on-read; CL-04 tag entidade de 1ª classe migrando a 008;
      CL-05 mutabilidade híbrida) — spec §Clarifications. **Zero `NEEDS CLARIFICATION`.** O
      que depende de outra spec (WhatsApp/chat real → 011/012; oportunidade → 010; tarefa/
      agenda → 016; FAQ/IA → 013; disparos com segmento → 015; builder visual de filtro;
      segmento de pessoa com Contrato) está em §Out of Scope.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não há ingestão de
      plataforma. `canal_origem`/`id_externo` são só a chave de idempotência da porta; nenhum
      código aqui conhece "Meta"/"WhatsApp Business API" (isso é 011).
- [x] **IV. Log de eventos + projeções**: **N/A** — não é pipeline de ingestão.
      `RegistrarInteracaoService` é idempotente por `(canal_origem, id_externo)`.
      `crm_interacao_audit` é _append-only_. `segmento/.../membros` é sempre recalculado —
      reprocessável trivialmente, sem estado "preso" (SC-006).
- [x] **V. Agregados derivados**: membros de `segmento` são **sempre** `f(filtro, estado
      atual) → lista`, nunca persistidos/incrementados (SC-006). `tag_associacao` é fato
      curado (uma linha = uma associação real), não uma métrica agregada — não conflita com
      o princípio.
- [x] **VI. Contextos delimitados — observar, não escrever**: `crm` continua **sem** importar
      `clientes` (ESLint + `grep`, SC-010). Diferente da 008, esta spec **não precisa** de
      porta nova no `core` — `interacao`/`tag_associacao` só têm uma **coluna FK** para
      `Pessoa` no `schema.prisma` compartilhado (mesmo precedente já em produção desde a
      004/008: `Lead.responsavelId`, `Lead.pessoaId`), sem chamar nenhum serviço de
      `clientes`. `LeadConsultaService`/`CrmAdminAuditService` são reusados **dentro do
      próprio módulo `crm`** (mesmo bounded context, sem violação). `CONTEXT_MODULES`
      segue 11.
- [x] **VII. Curadoria vs derivação**: `tag`/`tag_associacao` (curado) e `segmento.filtro`
      (curado) vivem em colunas próprias; os **membros** de um segmento nunca são
      persistidos — sempre recalculados na leitura, então não há risco de "curadoria
      sobrescrita por derivação" ou vice-versa. Interações de canal são append-only —
      nenhum vínculo de contato real é auto-revertido; só a `NOTA` (dado interno, não
      histórico de contato com a aluna) aceita edição, sempre auditada.
- [x] **VIII. Superfície de escrita mínima**: ~15 endpoints de escrita cobrem exatamente o
      que a visão 5.2‑E/8.3 pede (interação, nota, tag, segmento) — sem antecipar disparo
      (015), pipeline (010) ou WhatsApp real (011). **Nenhuma** sincronização automática
      externa — a porta `RegistrarInteracaoService` é in-process e passiva. `DELETE` físico
      só em `segmento` (sem histórico a preservar); `interacao`/`tag` usam _soft-delete_/
      `ativo`. Cada escrita sob `@RequerPermissao` + auditada.
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 5 tabelas.
      - **Dinheiro**: N/A (nenhum valor monetário nesta spec).
      - **Tempo**: `@db.Timestamptz(6)` em todos os timestamps; `ocorrido_em`/`editado_em`/
        `removido_em` via `agoraUtc()`.
      - **Status**: N/A financeiro — `interacao.tipo`/`direcao` e `segmento.alvo` são enums
        do CRM, eixo separado dos status canônicos.
      - **Idempotência**: `RegistrarInteracaoService` por `(canal_origem, id_externo)`;
        associar tag repetida → no-op; `segmento/.../membros` recalcula sempre igual para o
        mesmo estado.
      - **Auditoria**: `crm_interacao_audit` nova (forma `RegistroAuditoria` do core,
        `AJUSTE_MANUAL`, _append-only_, só delta real); tag em lead → `crm_lead_audit`
        (008); catálogo de tag/segmento → `crm_admin_audit` (007) para tag,
        `crm_interacao_audit` para segmento — ver FR-027.
      - **Erros**: validação zod → 422; conflito (editar removida, editar canal) → 409;
        método não permitido em canal → 405; sem permissão → 403; sem token → 401; fora do
        escopo → 404.
      - **Config/segredos**: nenhuma chave nova.
      - **Multi-conta**: N/A.
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking**: um ponto de design
notável (não violação) — `CHECK` de exclusividade de âncora via SQL bruto na migração, ver
abaixo.

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma os 3 `CHECK`s (interação,
tag_associacao ×1 covering 3 colunas) e os índices únicos parciais; `contracts/` confirma
que nenhum endpoint de leitura ganha permissão nova (deriva da âncora); `filtro-segmento.ts`
puro e testável sem banco; `CONTEXT_MODULES` em 11.*

## Project Structure

### Documentation (this feature)

```text
specs/009-crm-interacao-timeline/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões: (1) timeline unida por OR/JOIN Prisma sem N+1;
│                        #   (2) CHECK de exclusividade de âncora via SQL bruto na migração
│                        #   (mesmo padrão da 007 para hora_fim>hora_inicio); (3) por que
│                        #   nenhuma porta nova no core (FK direta vs 008); (4) normalização
│                        #   de tag centralizada em crm/domain/tag e a 008 passa a importar
│                        #   dali; (5) segmento: esquema fechado por alvo e construirWhere
│                        #   puro; (6) escopo de leitura de timeline por composição de
│                        #   serviço (LeadConsultaService) em vez de nova permissão
├── data-model.md        # Phase 1 — 5 models Prisma + 3 enums, CHECKs, índices únicos
│                        #   parciais, invariantes; shape de FiltroSegmento por alvo
├── quickstart.md        # Phase 1 — env, prisma migrate, lint/typecheck, unit, e2e, fluxo
│                        #   manual (registrar interação, editar nota, tag compartilhada,
│                        #   criar segmento, ver membros)
├── contracts/
│   ├── interacoes-timeline.md     # POST/GET por âncora; UNION da pessoa; escopo
│   ├── interacoes-mutabilidade.md # PATCH/DELETE só em NOTA; autor vs interacao:gerir
│   ├── tags.md                    # catálogo compartilhado; upsert por slug; migração 008
│   ├── segmentos.md                # filtro por alvo; construirWhere; membros on-read
│   └── rbac-catalogo.md            # +5 permissões
├── checklists/
│   └── requirements.md            # do /speckit-specify (CL-01..CL-05 resolvidos)
└── tasks.md             # Phase 2 — tasks.md (gerado a seguir)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                 # + models Interacao, Tag, TagAssociacao, Segmento,
│   │                                 #   CrmInteracaoAudit + enums InteracaoTipo,
│   │                                 #   InteracaoDirecao, SegmentoAlvo; Lead perde `tags`
│   └── migrations/<ts>_crm_interacao/
│       └── migration.sql             # NOVO — 5 tabelas + enums + CHECKs + índices +
│                                     #   ALTER TABLE lead DROP COLUMN tags
├── src/
│   ├── auth/rbac/
│   │   ├── catalogo.ts               # +5 permissões
│   │   └── catalogo.spec.ts
│   └── crm/
│       ├── crm.module.ts             # estendido — + controllers/providers novos,
│       │                             #   exports: [..., RegistrarInteracaoService]
│       ├── interacao.controller.ts   # /crm/interacoes/**, /crm/pessoas/:id/interacoes,
│       │                             #   /crm/leads/:id/interacoes
│       ├── pessoa-tag.controller.ts  # /crm/pessoas/:id/tags
│       ├── tag.controller.ts         # /crm/tags, /crm/admin/tags/**
│       ├── segmento.controller.ts    # /crm/segmentos/**
│       ├── lead.controller.ts        # EDITADO — tags delegam ao TagService
│       ├── dto/
│       │   ├── criar-interacao.schema.ts
│       │   ├── editar-interacao.schema.ts
│       │   ├── tag.schema.ts
│       │   ├── criar-segmento.schema.ts
│       │   ├── atualizar-segmento.schema.ts
│       │   └── filtro-segmento.schema.ts
│       ├── domain/
│       │   ├── interacao/
│       │   │   ├── ancora.ts + .spec.ts
│       │   │   ├── mutabilidade.ts + .spec.ts
│       │   │   ├── validar-campos-tipo.ts + .spec.ts
│       │   │   └── index.ts
│       │   ├── tag/
│       │   │   ├── normalizar-tag.ts + .spec.ts
│       │   │   └── index.ts
│       │   └── segmento/
│       │       ├── filtro-segmento.ts + .spec.ts
│       │       └── index.ts
│       ├── application/
│       │   ├── interacao/
│       │   │   ├── interacao.service.ts
│       │   │   ├── registrar-interacao.service.ts
│       │   │   ├── crm-interacao-audit.service.ts
│       │   │   └── index.ts
│       │   ├── tag/
│       │   │   ├── tag.service.ts
│       │   │   └── index.ts
│       │   └── segmento/
│       │       ├── segmento.service.ts
│       │       └── index.ts
│       └── infra/
│           ├── interacao/interacao.repository.ts + index.ts
│           ├── tag/tag.repository.ts + tag-associacao.repository.ts + index.ts
│           └── segmento/segmento.repository.ts + index.ts
└── test/
    ├── crm-interacao.e2e-spec.ts    # NOVO — timeline unida, mutabilidade, escopo, tag
    │                                 #   compartilhada + regressão 008, segmento, guard,
    │                                 #   catálogo +5, regressão 003–008, /health=11
    └── support/crm-interacao.ts     # helpers

frontend/
└── src/
    ├── app/router.tsx                # + rota /crm/segmentos sob RequirePermissao
    ├── shell/nav-items.ts            # + CRM · Segmentos (segmento:ver)
    ├── interacoes/
    │   ├── TimelineInteracoes.tsx    # componente compartilhado (pessoa e lead)
    │   ├── TagPicker.tsx             # componente compartilhado
    │   ├── interacoes-api.ts
    │   └── *.test.tsx
    ├── segmentos/
    │   ├── SegmentosPage.tsx
    │   ├── SegmentoDetalhePage.tsx
    │   ├── segmentos-api.ts
    │   └── *.test.tsx
    ├── pessoas/PessoaDetalhePage.tsx # EDITADO — + aba Timeline + TagPicker
    └── leads/LeadDetalhePage.tsx     # EDITADO — + aba Timeline + TagPicker

docs/
└── 009-crm-interacao-timeline.md     # NOVO — interacao/tag/segmento, âncora+UNION,
                                      #   mutabilidade por tipo, migração de tag da 008

CLAUDE.md  README.md  ROADMAP.md      # atualizados no fim da spec
```

**Structure Decision**: mantém a divisão **`domain/` (puro) · `application/`
(serviços/transações) · `infra/` (Prisma)** já usada por lead/administração (007/008), com
subpastas `interacao/`, `tag/`, `segmento/` em cada camada. `LeadConsultaService` (008) e
`CrmAdminAuditService` (007) são **injetados e reusados** dentro do `CrmModule` — mesmo
bounded context, sem cruzar fronteira. O catálogo da 004 cresce em **cinco** permissões (2
recursos novos + 1 no `crm_admin`).

## Complexity Tracking

> Sem violações constitucionais. Um ponto de design merece nota (não é violação):
>
> | Item | Por que | Alternativa mais simples rejeitada porque |
> |------|---------|--------------------------------------------|
> | `CHECK` de exclusividade de âncora via SQL bruto na migração (`interacao`: pessoa xor lead; `tag_associacao`: lead xor pessoa xor interação) | Prisma não modela `CHECK constraint` no schema — precisa de SQL bruto anexado à migração gerada (mesmo padrão já usado na 007 para `janela_atendimento.hora_fim > hora_inicio`). Garante a invariante **no banco**, não só na validação da aplicação, protegendo contra escrita direta ou bug futuro. | (a) Confiar só na validação da aplicação — um `INSERT` fora do caminho do serviço (migração manual, script) poderia violar a invariante sem o banco recusar. (b) Duas tabelas separadas (`interacao_pessoa`/`interacao_lead`) — duplica todo o resto do modelo (tipo, conteúdo, auditoria) só para evitar o `CHECK`; pior que o custo de uma migração com SQL bruto, que já é prática estabelecida no projeto. |
