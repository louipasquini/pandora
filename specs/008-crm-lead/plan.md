# Implementation Plan: Lead do CRM — entidade compartilhada, campos personalizados, scoring e conversão em pessoa

**Branch**: `008-crm-lead` | **Date**: 2026-09-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-crm-lead/spec.md`

## Summary

Adicionar ao _bounded context_ **`crm`** (já preenchido pela 007) a **entidade `lead`** da
visão Parte 8.2.1 — a primeira entidade **compartilhada** do projeto (CRM + Marketing numa
única tabela, acesso por RBAC 004, não por fronteira arquitetural). 4 tabelas Prisma novas
(6ª migração de negócio), **+1 permissão** de catálogo (`crm_admin:gerir_campos_lead`),
**+1 contrato no `core`** (`PortaIdentidade` — inversão de dependência para a engine da
005), **0 dependência nova**, **nenhuma porta nova**, `CONTEXT_MODULES` segue **11**.

1. **Contrato no `core`** (`src/core/identidade/`):
   - `porta-identidade.ts` — interface **`PortaIdentidade`** (`resolverOuCriar(dados,
     opts) → { pessoaId, criada, ... }`) + token DI **`PORTA_IDENTIDADE`** (`InjectionToken`
     / `Symbol`). Só o contrato — zero lógica, zero import de `clientes`. Re-exportado no
     barrel `core.module.ts`. Isto materializa CL-02 (o `crm` injeta a interface, nunca o
     serviço concreto).
2. **Adaptador + wiring no `clientes`** (`src/clientes/`):
   - `infra/porta-identidade.adapter.ts` — classe `@Injectable()` que implementa
     `PortaIdentidade` delegando ao `ResolverOuCriarService` já existente (mapeia
     `documento` string → `{ tipo, valor }` com o detector de CPF/CNPJ da 005).
     `ResolverOuCriarService` **não muda**.
   - `identidade-wiring.module.ts` — módulo **`@Global()`** que importa `ClientesModule`
     (intra-contexto, permitido), provê `PortaIdentidadeAdapter` +
     `{ provide: PORTA_IDENTIDADE, useExisting: PortaIdentidadeAdapter }` e **exporta**
     `PORTA_IDENTIDADE`. `AppModule` o importa. Como é `@Global()`, o token fica injetável
     em qualquer módulo (inclusive `CrmModule`) **sem** import — nenhum arquivo de
     `src/crm/**` referencia `src/clientes/**`. É o mesmo padrão que a **spec 018** vai
     reusar para o pipeline do `financeiro`.
3. **Domínio puro** (`src/crm/domain/lead/`, testável sem banco):
   - `scoring.ts` — **`calcularScore(estado: EstadoScoreLead) → number`**: função pura,
     determinística, livre de locale. Insumos: completude de contato, `origem`/UTM presente,
     `estagio` (peso por posição no funil), idade do lead (`agoraUtc() - criadoEm`, faixas),
     nº e recência de eventos (interações/tags — materializados por quem chama). Tabela de
     **pesos congelada** em `PESOS_SCORE_LEAD` (const, versionada por PR). Score final é um
     inteiro clampeado a `[0, 100]`. Nunca `score += delta`.
   - `scoring.spec.ts` — dois estados iguais → mesmo score; completar contato → sobe;
     lead recém-criado sem eventos → score base determinístico (não 0 por acidente);
     N× seguidas → idêntico; matriz `TZ` (idade/recência não variam com `TZ` do processo).
   - `normalizar-lead.ts` — `nome` (trim, colapsa espaço), `origem` (slug), `tags`
     (`trim`+`lowercase`+espaço→`-`, dedupe, rejeita vazio). E-mail/telefone/documento
     **reusam** `normalizar` + DV de doc do `src/clientes/domain`? **Não** (fronteira) —
     `core` não expõe isso hoje. Decisão em research: **duplicar** a normalização de
     contato mínima em `crm/domain` (e-mail lowercase+trim; telefone E.164 `+55`; doc só
     dígitos + DV) OU promover ao `core`. Ver `research.md` §2.
   - `plano-conversao.ts` — `montarDadosIdentidade(lead) → DadosIdentidade` puro (mapeia
     campos do lead para o shape que a `PortaIdentidade` espera) + `podeConverter(lead) →
     { ok } | { erro }` (só `status = ATIVO`; `DESCARTADO` → 409; `CONVERTIDO` → no-op).
   - `tipos.ts` — enums `LeadEstagio`, `LeadStatus`, `CampoPersonalizadoTipo`; tipos
     `EstadoScoreLead`, `ResultadoConversao`.
4. **Persistência Prisma** (6ª migração — `prisma/migrations/<ts>_crm_lead/`): models
   `Lead`, `CampoPersonalizadoLead`, `ValorCampoLead`, `CrmLeadAudit` + enums
   `LeadEstagio`, `LeadStatus`, `CampoPersonalizadoTipo`. PK `String @id @db.Uuid` via
   `EntidadeId.novo()`; `@db.Timestamptz(6)` nos timestamps; `tags String[]`;
   `utm* String?`; FK `Lead.responsavelId → usuario.id` (`onDelete: Restrict`), FK
   `Lead.pessoaId → pessoa.id` (`onDelete: Restrict`, nullable),
   `ValorCampoLead.leadId → lead.id` (`onDelete: Cascade`),
   `ValorCampoLead.definicaoId → campo_personalizado_lead.id` (`onDelete: Restrict`).
   Uniques: `CampoPersonalizadoLead.chave` único; `@@unique([leadId, definicaoId])` em
   `ValorCampoLead`. Índices: `Lead(status, estagio)`, `Lead(responsavelId)`,
   `Lead(origem)`, `Lead(email)`, `Lead(telefone)`, `Lead(pessoaId)`. **Sem seed de
   negócio** (as definições de campo personalizado nascem vazias).
5. **Aplicação** (`src/crm/application/lead/`):
   - `crm-lead-audit.service.ts` — `registrar(delta)` na forma canônica
     `montarRegistroAuditoria` do core (`AJUSTE_MANUAL`), tabela `crm_lead_audit`,
     **append-only**, **só delta real** (`jsonIgual` → no-op). Simétrico ao
     `CrmAdminAuditService` da 007.
   - `lead.service.ts` — CRUD (`criar`, `atualizar`, `mudarEstagio`, `mudarStatus`,
     `atribuirResponsavel`, `addTag`/`removerTag`), cada escrita → recalcula score +
     audita. `criar` valida `nome` + (`email` | `telefone`); devolve `leadsSemelhantes`
     (query por email/telefone entre `status = ATIVO`). `responsavelId` inexistente →
     404/422. `score`/`pessoaId` no corpo → 422.
   - `lead-consulta.service.ts` — `listar(filtros, sujeito)` / `obter(id, sujeito)`:
     **aplica o escopo de visão no `where`** (CL: `lead:ver_todos` → tudo;
     `lead:ver_proprios` → `responsavelId = sujeito.id AND responsavelId IS NOT NULL`;
     credencial de serviço → `ver_todos`). Filtros (`estagio`, `status`, `origem`,
     `responsavelId`, `campo:<chave>`) **nunca** ampliam o escopo. `obter` fora do escopo →
     404.
   - `lead-score.service.ts` — `recalcular(id)` e `recalcularLote(cursor, tamanho)`:
     carrega o `EstadoScoreLead` do banco, chama `calcularScore`, grava só se mudou
     (idempotente), audita como `origem = AJUSTE_MANUAL` campo `score` com marcador
     `recalculo`. Lote paginado, cada página em transação própria, retomável por cursor.
   - `lead-conversao.service.ts` — `converter(id, sujeito)`: `podeConverter` →
     `montarDadosIdentidade` → injeta **`PORTA_IDENTIDADE`** do core e chama
     `resolverOuCriar(dados, { criar: true, origem: { plataformaOrigem: 'crm_lead', refs:
     [{ tipoRef: 'lead_id', valorRef: id }] } })` **dentro de uma transação**; grava
     `pessoaId` + `status = CONVERTIDO` no lead; audita `converter`. Já `CONVERTIDO` →
     no-op (mesmo `pessoaId`, sem auditoria). Exige `lead:editar` + `pessoa:editar` (o
     guard cobre `lead:editar`; `pessoa:editar` é checado no serviço via
     `SujeitoRbacService`/`permissoes-efetivas` — ver research §4).
   - `campo-personalizado.service.ts` — CRUD das **definições** (sob
     `crm_admin:gerir_campos_lead`): `criar` (valida `opcoes` sse `SELECAO`), `atualizar`
     (`rotulo`/`obrigatorio`/`ativo`/`opcoes`; `chave` imutável), `desativar` (`DELETE` de
     definição em uso → 409, sugere `ativo=false`). Definições auditam em
     **`crm_admin_audit`** (tabela da 007).
   - `valor-campo.service.ts` — `obter(leadId)` / `substituir(leadId, mapa)`:
     `PUT`-semântica de substituição total; valida cada chave contra a definição
     (inexistente/inativa → 422; tipo incompatível / fora de `opcoes` → 422; `obrigatorio`
     ausente → 422); `null` remove; audita o delta por chave em `crm_lead_audit`.
   - `registrar-lead.service.ts` — **porta in-process** `RegistrarLeadService`
     (`@Injectable()`, exportada do `CrmModule`): `registrar(entrada, chaveOrigem)`
     idempotente por `(origem, id_externo)` — reentrada devolve o lead existente. Audita
     como `AJUSTE_MANUAL` com autor = identificador da integração. **Sem endpoint HTTP** —
     a spec 035 injeta.
   - `index.ts` — barrel.
6. **HTTP** (`src/crm/`):
   - `lead.controller.ts` — prefixo `/crm/leads`:
     - Leitura — **`@AutenticadoBasta()`** (o `@RequerPermissao` é E; o gate "OU" de
       `lead:ver_todos` / `lead:ver_proprios` + o escopo ficam no `lead-consulta.service`
       numa passada só — research §4/§5): `GET /crm/leads`, `GET /crm/leads/:id`,
       `GET /crm/leads/:id/campos-personalizados`, `GET /crm/leads/:id/auditoria`
       (opcional, FR-041).
     - Escrita de lead — `@RequerPermissao('lead:criar')` / `@RequerPermissao('lead:editar')`:
       `POST /crm/leads`, `PATCH /crm/leads/:id`, `POST /crm/leads/:id/tags`,
       `DELETE /crm/leads/:id/tags`, `POST /crm/leads/:id/recalcular-score`,
       `POST /crm/leads/recalcular-score`, `PUT /crm/leads/:id/campos-personalizados`.
       Cada serviço de escrita revalida o escopo de visão antes de tocar um lead que o
       sujeito não enxerga (404).
     - Conversão — **`@RequerPermissao('lead:editar', 'pessoa:editar')`** (guard resolve o E):
       `POST /crm/leads/:id/converter`.
     - **Sem `DELETE /crm/leads/:id`** (FR-008).
   - `campo-personalizado.controller.ts` — prefixo `/crm/admin/campos-lead` (fica com a
     administração do CRM da 007), sob `crm_admin:gerir_campos_lead` (escrita) /
     `crm_admin:ver` (leitura): `GET`, `POST`, `PATCH :id`, `DELETE :id`.
   - `dto/` — schemas zod (`criar-lead`, `atualizar-lead`, `tag`, `listar-leads`,
     `recalcular-lote`, `campos-personalizados-valores`, `campo-personalizado-def`).
7. **RBAC** (`src/auth/rbac/catalogo.ts`): **+1 permissão** no recurso `crm_admin` (já
   existe desde a 007): `crm_admin:gerir_campos_lead` (rótulo pt-BR "Gerir campos
   personalizados de lead"). `catalogo.spec.ts` ganha a asserção. As 4 `lead:*` **não
   mudam**. `administrador` + credencial de serviço concedem de graça (special-case do
   `SujeitoRbacService`) — **0 migração de dados, 0 seed**.
8. **Módulo** (`src/crm/crm.module.ts`): estende o da 007 — `+ LeadController`,
   `+ CampoPersonalizadoController`, `+ providers` (repos + serviços de lead + audit).
   **Não** importa `ClientesModule` nem `IdentidadeWiringModule` — o `LeadConversaoService`
   injeta `@Inject(PORTA_IDENTIDADE)` (token do módulo `@Global()`).
   `exports: [RegistrarLeadService]` (porta para a 035). `onModuleInit` loga
   `crm.ready lead vocab registrado` (sem dados sensíveis). `CONTEXT_MODULES` **não muda**
   (segue 11). `AppModule` ganha `imports: [..., IdentidadeWiringModule]`.
9. **Infra** (`src/crm/infra/lead/`): `lead.repository.ts`, `campo-personalizado.repository.ts`,
   `valor-campo.repository.ts`, `crm-lead-audit.repository.ts` — finos, Prisma.
10. **Frontend** (`frontend/src/leads/`):
    - `nav-items.ts` — `+ { label: 'CRM · Leads', to: '/crm/leads', requerPermissao:
      ['lead:ver_todos', 'lead:ver_proprios'] }` (nav aceita lista OU — ver research §7).
    - `router.tsx` — rota `/crm/leads` sob `<RequirePermissao anyOf={['lead:ver_todos',
      'lead:ver_proprios']}>`.
    - `LeadsPage.tsx` — lista com filtros (estágio, status, origem, responsável) + busca;
      coluna de score. "Novo lead" só com `lead:criar`.
    - `LeadDetalhePage.tsx` — contato, UTMs, score, tags, campos personalizados, timeline
      de auditoria; **Converter em pessoa** só com `lead:editar` + `pessoa:editar` e lead
      `ATIVO`; após converter, mostra vínculo com a pessoa.
    - `leads-api.ts` — `apiFetch` tipado. `test/setup.ts` ganha default p/ `/crm/leads/*` +
      `lead:*` + `crm_admin:gerir_campos_lead` em `TODAS_PERMISSOES`.
    - `*.test.tsx` (vitest + Testing Library): nav some sem permissão; `ver_proprios` vê só
      os próprios; sem `lead:editar` sem botões de escrita; converter aparece só com as duas
      permissões; 403 → banner, sessão intacta.
    - (opcional) sub-aba **Campos de lead** no painel **CRM · Administração** da 007, atrás
      de `crm_admin:gerir_campos_lead`.

Abordagem: **0 dep nova**. O reuso da engine da 005 é por **inversão de dependência via
`core`** (CL-02) — nenhum import de `clientes` no `crm`, ESLint verde. Scoring é função
pura com tabela de pesos congelada (regra 8.2.2 — derivado, nunca contador). Campos
personalizados com **esquema administrável** (CL-03). Conversão **arquiva + vincula** o
lead (CL-01). Testes: unit sem banco (scoring exaustivo + matriz `TZ`; normalização;
plano de conversão); e2e Postgres real (migração; CRUD; escopo `ver_proprios` sem
vazamento; scoring idempotente; conversão reusa 005 e é idempotente; auditoria delta/no-op;
guard 401/403/200; catálogo +1; regressão 003–007; `/health` = 11). Ao fim:
`docs/008-crm-lead.md` + `CLAUDE.md`/`README.md`/`ROADMAP.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova.** NestJS 11, Prisma `^6` + `@prisma/client` (4 models novos, 3
  enums), `zod` 3 (DTOs). `EntidadeId`, `agoraUtc`, `parseInstante`,
  `montarRegistroAuditoria`, contrato de config tipado e **a nova `PortaIdentidade`** vêm do
  `core`. Engine de identidade real = `ResolverOuCriarService` da 005, consumida via token
  DI `PORTA_IDENTIDADE`.
- Frontend: **nenhuma nova.** React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch` central (003/004), `usePermissoesEfetivas` + `RequirePermissao` (004).

**Storage**: **PostgreSQL 16 via Prisma** — 6ª migração de negócio (após `_rbac`,
`_clientes`, `_clientes_primario_unico`, `_ingestao`, `_crm_admin`, `_crm_admin_membro_unico`).
4 tabelas: `lead`, `campo_personalizado_lead`, `valor_campo_lead`, `crm_lead_audit`.
`valor_campo_lead.valor` e os `valor_anterior`/`valor_novo` do audit como `Json`/texto.
Sem porta nova (mesmo `DATABASE_URL`/`TEST_DATABASE_URL`, Postgres dev host `55432`).

**Testing**:
- Backend unit (`jest`, sem banco):
  - `scoring.spec.ts` — (a) dois estados idênticos → mesmo inteiro; (b) sem contato →
    completar e-mail sobe o score; (c) lead novo sem eventos → score base fixo (>0);
    (d) 500× a mesma entrada → mesmo valor; (e) matriz `TZ` UTC/Sao_Paulo/Tokyo com "idade
    do lead" no cálculo → idêntico; (f) clamp `[0,100]`.
  - `normalizar-lead.spec.ts` — tags normalizadas/dedupe/vazia→erro; e-mail lowercase+trim;
    telefone E.164; documento só dígitos + DV inválido → erro.
  - `plano-conversao.spec.ts` — `podeConverter`: `ATIVO` ok, `DESCARTADO` erro,
    `CONVERTIDO` no-op; `montarDadosIdentidade` mapeia documento/e-mail/telefone.
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` já roda
  `migrate deploy` + `db seed`):
  - migração cria as 4 tabelas + enums; `db seed` não quebra; uniques presentes.
  - **CRUD**: `POST` cria `NOVO`/`ATIVO` + score calculado + 1 audit; `POST` sem contato →
    422; `POST` com e-mail já usado → cria + `leadsSemelhantes`; `PATCH` estágio+responsável
    → score recalculado + 1 audit com delta; `PATCH` no-op → 0 audit; `PATCH { score }` →
    422; `responsavelId` inexistente → 404/422; tag normalizada/sem duplicar.
  - **Escopo de visão**: sujeito só com `lead:ver_proprios` — `GET /crm/leads` traz só os
    dele; `GET /crm/leads/:idDeOutro` → 404; `?responsavelId=<outro>` → lista vazia; lead
    sem responsável → invisível. Sujeito com `lead:ver_todos` → vê tudo incl. fila não
    atribuída. Sem nenhuma das duas → 403 em todos os `GET`.
  - **Scoring**: `POST /crm/leads/:id/recalcular-score` 5× → score estável; lote 2× → 0
    diff na 2ª; score sempre inteiro `[0,100]`.
  - **Conversão**: `pessoa` com e-mail `x` + lead com e-mail `x` → `converter` aponta p/ a
    pessoa existente, 0 pessoa nova; lead com e-mail novo → pessoa nova; converter 2× → mesmo
    `pessoaId`, 0 contato duplicado, 0 audit novo; sujeito sem `pessoa:editar` → 403;
    lead `DESCARTADO` → 409; 1 `crm_lead_audit` de `converter` com delta `{status,pessoa_id}`.
    **`grep` de `import .*clientes` em `src/crm/**` = 0** (teste de lint/estrutura).
  - **Campos personalizados**: `POST /crm/admin/campos-lead` cria definição (`SELECAO` sem
    `opcoes` → 422); `PUT /crm/leads/:id/campos-personalizados` com chave desconhecida →
    422, tipo incompatível → 422, `obrigatorio` ausente → 422; substituição total (chave
    omitida some); `?campo:<chave>=<v>` filtra respeitando o escopo; delta auditado.
  - **Guard**: cada rota sem token → 401; token sem a permissão → 403 (corpo genérico 004);
    credencial de serviço → 2xx.
  - **Catálogo/efetivas**: `GET /admin/rbac/permissoes` inclui `crm_admin:gerir_campos_lead`;
    `GET /auth/permissoes-efetivas` da credencial de serviço a contém; as 4 `lead:*`
    inalteradas.
  - **Regressão**: `auth`/`rbac`/`clientes`/`ingestao`/`crm-admin`/`health`/`context-modules`
    (11) verdes; matriz `TZ` cobre `scoring.spec.ts`.
- Frontend (`vitest` + Testing Library, jsdom): nav esconde **CRM · Leads** sem permissão;
  rota direta sem permissão → "sem permissão" (não Login); lista monta do endpoint;
  `ver_proprios` mostra subconjunto; sem `lead:editar` sem controles de escrita; **Converter
  em pessoa** só com `lead:editar` + `pessoa:editar` e lead `ATIVO`; 403 → banner + sessão
  intacta.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (configuráveis,
spec 001). Dev Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta funcional. `calcularScore` é O(nº de eventos do lead) —
dezenas. `GET` de listas pagina (default 25, teto 100). `recalcular-score` em lote é
paginado por cursor, cada página em transação própria. A conversão faz 1 transação
(resolver identidade + gravar `pessoaId`).

**Constraints**:
- **Nenhuma porta nova** (3001/5174/55432 do próprio projeto; reusa
  `DATABASE_URL`/`TEST_DATABASE_URL`).
- **Contextos delimitados** (Princípio VI): `crm` importa só `core` (global) e `auth`
  (infra transversal). **Não** importa `clientes`. A engine da 005 chega pela interface
  `PortaIdentidade` do `core` + token DI `PORTA_IDENTIDADE`; `clientes` registra o
  adaptador. ESLint `import/no-restricted-paths` verde (teste faz `grep`).
- **Agregado derivado** (Princípio V / regra 8.2.2): `score` é `f(estado) → inteiro`,
  **nunca** `score += delta`. O valor na linha é _cache_, reconstruível idêntico. Tabela de
  pesos congelada no código.
- **Escopo de visão por permissão** (spec §US2): aplicado no `where` do repositório, não na
  serialização; filtros nunca ampliam; `obter` fora do escopo → 404.
- **Curadoria vs derivação** (Princípio VII): `score` (derivado) e os campos manuais do
  lead ficam em colunas distintas; `score` não é editável. Campos personalizados são
  entrada manual (sem caminho derivado concorrente).
- **Auditoria** (Padrão Transversal): toda escrita de lead → `crm_lead_audit` na forma
  `RegistroAuditoria` do core (`AJUSTE_MANUAL`, _append-only_, só delta real). Definições de
  campo personalizado → `crm_admin_audit` (tabela da 007). Painel consolidado = 053.
- **Livre de locale** (Padrão 002): `calcularScore` usa `agoraUtc()` / `parseInstante`; a
  "idade do lead" e a "recência" não leem `TZ` do processo. Matriz `TZ` na CI.
- **RBAC 004**: cada endpoint sob `@RequerPermissao`; leitura de lead → `lead:ver_todos` OU
  `lead:ver_proprios`; escrita → `lead:criar`/`lead:editar`; conversão exige também
  `pessoa:editar` (checado no serviço); definições → `crm_admin:gerir_campos_lead`.
  403 ≠ 401.
- **Superfície de escrita mínima** (Princípio VIII): os endpoints de escrita são CRUD de uma
  entidade de negócio que a visão Parte 8 pede explicitamente (lead, campos personalizados,
  scoring, conversão). **Nenhuma** sincronização automática com API externa; a porta
  `RegistrarLeadService` é in-process (035 injeta). Sem `DELETE` físico de lead.
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~28 arquivos novos no backend (`src/crm/{domain,application,infra,dto}/lead/**`,
`lead.controller.ts`, `campo-personalizado.controller.ts`, `crm.module.ts` estendido,
`src/core/identidade/porta-identidade.ts` + barrel,
`src/clientes/infra/porta-identidade.adapter.ts` + `src/clientes/identidade-wiring.module.ts`
(novo) + `src/app.module.ts` (import),
`prisma/migrations/<ts>_crm_lead/`, `test/crm-lead.e2e-spec.ts` + `test/support/crm-lead.ts`),
~7 no frontend (`src/leads/**` + testes), **0 dep nova**, **1 migração**, **~14 endpoints**
(4 leitura + ~10 escrita), ~6 arquivos tocados (`schema.prisma`,
`src/auth/rbac/catalogo.ts` + `.spec.ts`, `src/crm/crm.module.ts`,
`src/clientes/clientes.module.ts`, `frontend/src/app/router.tsx`,
`frontend/src/shell/nav-items.ts`, `frontend/src/test/setup.ts`), 1 doc novo, 3 docs
atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 4 tabelas nascem com **ID surrogate UUID v7** gerado na
      app (`EntidadeId.novo()`), decidido antes do schema (`data-model.md`). `lead` é
      entidade de negócio, não vem de plataforma — **não há `plataforma_origem` nem
      `*_origem_ref`** aqui (a origem do lead é `origem`/`utm_*` livres + a chave de
      integração da porta `RegistrarLeadService`, que é `(origem, id_externo)` e vive **fora
      da PK**). FK `lead.responsavel_id → usuario.id` (004) e `lead.pessoa_id → pessoa.id`
      (005) referenciam PKs UUID, nunca ids externos. Granularidade documentada: 1 `lead`
      por PK; `pessoa_id` 0..1; ≤1 `valor_campo_lead` por `(lead, definicao)`; `chave` de
      definição única.
- [x] **II. Clarificar antes de assumir**: 3 clarificações resolvidas com o dono do produto
      em 2026-09-04 (CL-01 arquivar+vincular na conversão; CL-02 `PortaIdentidade` no `core`;
      CL-03 esquema administrável de campos personalizados) — spec §Clarifications. **Zero
      `NEEDS CLARIFICATION`.** O que depende de outra spec (observador de transação paga →
      010/018; adapters de Marketing e UTMs de webhook → 035–036; timeline de interações →
      009; regras de scoring configuráveis → spec futura; merge de leads) está em
      §Out of Scope, não assumido. Padrões razoáveis (lead duplicado permitido + aviso;
      fila não atribuída só p/ `ver_todos`; `PUT` substituição total) documentados na spec.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não há ingestão de plataforma.
      `origem`/`utm_*` são texto livre de metadados de marketing, não `plataforma_origem`;
      nenhum código aqui conhece "Meta"/"Google"/"Mautic" nem traduz status. Os adapters de
      Marketing e o mapeamento de UTM são 035–036.
- [x] **IV. Log de eventos + projeções**: **N/A** — o Lead não é pipeline de ingestão.
      `calcularScore` é **função pura** (`f(estado) → inteiro`), reprocessável trivialmente;
      `recalcular-score` é idempotente. `crm_lead_audit` é _append-only_. Cada escrita é uma
      transação Prisma curta que também grava o audit — sem `commit()` de remendo. A porta
      `RegistrarLeadService` é idempotente por `(origem, id_externo)`.
- [x] **V. Agregados derivados**: o **único** agregado — `score` — é
      `f(atributos + eventos) → inteiro`, tabela de pesos congelada, **nunca**
      `estado += delta` (regra 8.2.2 explícita). O valor materializado é _cache_ de leitura,
      reconstruível idêntico (SC-001/SC-002). Sem dinheiro nesta spec (o `valor_estimado` de
      Oportunidade é a 010). `score` não é setável por `PATCH` (SC-010).
- [x] **VI. Contextos delimitados — observar, não escrever**: `crm` **não** importa
      `clientes` (ESLint `import/no-restricted-paths` + `grep` no e2e). A engine de
      identidade da 005 é consumida por **inversão de dependência**: o contrato
      (`PortaIdentidade` + `PORTA_IDENTIDADE`) vive no `core` (global, exceção à fronteira);
      `clientes` **implementa e provê** o adaptador; `crm` **injeta a interface**. A
      conversão **escreve `pessoa` através da porta da 005** (que é o ponto único de escrita
      derivada de `pessoa` — Princípio VII da 005), nunca direto na tabela. `crm` grava só o
      `pessoa_id` no seu próprio `lead`. A "conversão automática na 1ª venda" é gancho para a
      010 (que **observa** transação paga) — esta spec não antecipa o observador.
      `RegistrarLeadService` é exportada como porta para a 035 **consumir**, não para o `crm`
      chamar Marketing. `CONTEXT_MODULES` segue 11.
- [x] **VII. Curadoria vs derivação**: `score` (derivado) fica em coluna própria, **não
      editável** — toda tentativa de `PATCH` é 422 (SC-010); o recálculo audita com marcador
      `recalculo`, distinguível de edição manual. Os campos manuais do lead (contato,
      estágio, tags, campos personalizados) são entrada humana auditada; **não há caminho
      derivado concorrente** para eles. Nenhum vínculo aplicado é auto-revertido: a conversão
      preenche `pessoa_id` uma vez e é idempotente (converter de novo não muda nem reverte).
- [x] **VIII. Superfície de escrita mínima**: os ~10 endpoints de escrita cobrem **uma
      entidade de negócio central** que a visão Parte 8.2/8.7 pede (lead compartilhado,
      campos personalizados, lead scoring, transição Lead→Pessoa). Justificativa registrada:
      sem `POST /crm/leads` + `PATCH` + `converter` não há CRM de leads. **Sem `DELETE`
      físico de lead** (só `status = DESCARTADO`); `DELETE` de definição de campo em uso →
      409 (sugere `ativo=false`). **Nenhuma sincronização automática com API externa** — a
      porta `RegistrarLeadService` é in-process e passiva (035 injeta); nada aqui chama
      serviço externo. Cada escrita sob `@RequerPermissao` + auditada.
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 4 tabelas (`id String @id @db.Uuid`). Sem id de
        origem na PK; a chave de integração `(origem, id_externo)` é coluna comum.
      - **Dinheiro**: N/A (nenhum valor monetário nesta spec).
      - **Tempo**: `@db.Timestamptz(6)` em todos os timestamps via `agoraUtc()`.
        `calcularScore` usa `agoraUtc()`/`parseInstante` do core — livre de locale (matriz
        `TZ` na CI, como a 002).
      - **Status**: `lead.status` (`ATIVO|DESCARTADO|CONVERTIDO`) e `lead.estagio` (funil)
        são enums **do CRM**, não `StatusTransacaoCanonico`/`StatusContratoCanonico` (que
        são financeiros) — eixos separados, documentado na spec (Edge Cases). Desconhecido
        não se aplica (entrada validada por zod).
      - **Idempotência**: `converter` de lead já `CONVERTIDO` → no-op; `recalcular-score`
        N× → estável; `PATCH`/`PUT` sem delta → sem audit; `RegistrarLeadService` por
        `(origem, id_externo)`.
      - **Auditoria**: `criado_em`/`atualizado_em` em tudo; `crm_lead_audit` na forma
        `RegistroAuditoria` (core 002), `AJUSTE_MANUAL`, _append-only_, só delta real.
        Simétrico a `crm_admin_audit`/`clientes_audit`/`ingestao_audit`.
      - **Erros**: validação zod → 400/422; conflito → 409; sem permissão → 403; sem token
        → 401; recurso fora do escopo de visão → 404.
      - **Config/segredos**: **nenhuma chave nova** (a `PortaIdentidade` é código, não
        config). Sem `process.env` fora de `config/`/`core/`.
      - **Multi-conta**: N/A (nenhum `plataforma_origem` nesta spec).
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking vazio** — a spec fica
no mínimo para o que a visão Parte 8.2/8.7 pede: 4 tabelas, 1 função pura de scoring, 1
contrato de porta no `core` (para respeitar o Princípio VI **sem** duplicar a engine da
005), CRUD de lead + campos personalizados, 0 dep nova, sem chamada externa, sem antecipar
o observador de transação (010) nem os adapters de Marketing (035).

*Re-check pós-Phase 1: **PASS** — o design mantém `crm` sem importar contexto de domínio
(a `PortaIdentidade` vive no `core`; `clientes` provê o adaptador); `calcularScore` puro e
livre de locale (tabela de pesos em `contracts/scoring.md`); `score` nunca projetado como
editável; escopo de visão no `where` (`contracts/leads-crud.md`); `crm_lead_audit`
_append-only_; conversão escreve `pessoa` só pela porta da 005 e é idempotente
(`contracts/leads-conversao.md`); `CONTEXT_MODULES` em 11. Ver `data-model.md` e
`contracts/`.*

## Project Structure

### Documentation (this feature)

```text
specs/008-crm-lead/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões: (1) PortaIdentidade no core vs borda vs evento
│                        #   e por quê; (2) normalização de contato — duplicar no crm/domain
│                        #   vs promover ao core; (3) score: tabela de pesos congelada, faixas
│                        #   de idade/recência, clamp; (4) checagem de pessoa:editar no
│                        #   serviço de conversão (SujeitoRbacService); (5) escopo de visão
│                        #   no where — ver_proprios + fila não atribuída; (6) campos
│                        #   personalizados: 2 tabelas (def + valor) e validação por tipo;
│                        #   (7) nav/rota com "anyOf" de permissão no frontend
├── data-model.md        # Phase 1 — 4 models Prisma + 3 enums, invariantes, uniques, FKs,
│                        #   índices; EstadoScoreLead (entrada da função pura); projeção de
│                        #   leitura do lead; máquina de estados status/estagio
├── quickstart.md        # Phase 1 — env, prisma migrate, lint/typecheck, unit, e2e, fluxo
│                        #   manual (criar lead, mover estágio, recalcular score, criar
│                        #   definição de campo, PUT valores, converter em pessoa)
├── contracts/
│   ├── leads-crud.md              # POST/PATCH/GET/tags; filtros; escopo de visão; leadsSemelhantes
│   ├── scoring.md                 # calcularScore: assinatura, EstadoScoreLead, PESOS, casos
│   ├── leads-conversao.md         # POST /crm/leads/:id/converter; idempotência; erros; audit
│   ├── campos-personalizados.md   # defs (/crm/admin/campos-lead) + valores (PUT); validação
│   ├── porta-identidade.md        # PortaIdentidade + PORTA_IDENTIDADE no core; adapter na 005
│   ├── rbac-catalogo.md           # + crm_admin:gerir_campos_lead (as 4 lead:* inalteradas)
│   └── frontend-leads.md          # nav anyOf, rota RequirePermissao, lista/detalhe, converter
├── checklists/
│   └── requirements.md            # do /speckit-specify (CL-01..CL-03 resolvidos)
└── tasks.md             # Phase 2 — /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                 # + models Lead, CampoPersonalizadoLead, ValorCampoLead,
│   │                                 #   CrmLeadAudit + enums LeadEstagio, LeadStatus,
│   │                                 #   CampoPersonalizadoTipo
│   └── migrations/<ts>_crm_lead/
│       └── migration.sql             # NOVO — 4 tabelas + enums + índices + uniques
├── src/
│   ├── core/
│   │   ├── identidade/
│   │   │   └── porta-identidade.ts   # NOVO — interface PortaIdentidade + token PORTA_IDENTIDADE
│   │   └── core.module.ts            # + re-export da PortaIdentidade
│   ├── auth/rbac/
│   │   ├── catalogo.ts               # + crm_admin:gerir_campos_lead
│   │   └── catalogo.spec.ts          # + asserção da nova permissão
│   ├── app.module.ts                 # + imports: [IdentidadeWiringModule]
│   ├── clientes/
│   │   ├── identidade-wiring.module.ts         # NOVO — @Global(); provê+exporta PORTA_IDENTIDADE
│   │   └── infra/porta-identidade.adapter.ts   # NOVO — implementa PortaIdentidade → ResolverOuCriarService
│   └── crm/
│       ├── crm.module.ts             # estendido — + LeadController, CampoPersonalizadoController,
│       │                             #   providers de lead, exports: [RegistrarLeadService]
│       ├── lead.controller.ts        # /crm/leads/**
│       ├── campo-personalizado.controller.ts   # /crm/admin/campos-lead/**
│       ├── dto/
│       │   ├── criar-lead.schema.ts
│       │   ├── atualizar-lead.schema.ts
│       │   ├── tag.schema.ts
│       │   ├── listar-leads.schema.ts
│       │   ├── recalcular-lote.schema.ts
│       │   ├── campos-personalizados-valores.schema.ts
│       │   └── campo-personalizado-def.schema.ts
│       ├── domain/lead/
│       │   ├── scoring.ts            # calcularScore(estado) + PESOS_SCORE_LEAD
│       │   ├── scoring.spec.ts
│       │   ├── normalizar-lead.ts
│       │   ├── normalizar-lead.spec.ts
│       │   ├── plano-conversao.ts    # montarDadosIdentidade + podeConverter
│       │   ├── plano-conversao.spec.ts
│       │   ├── tipos.ts              # enums + EstadoScoreLead + ResultadoConversao
│       │   └── index.ts
│       ├── application/lead/
│       │   ├── lead.service.ts
│       │   ├── lead-consulta.service.ts       # escopo de visão no where
│       │   ├── lead-score.service.ts          # recalcular + recalcularLote
│       │   ├── lead-conversao.service.ts      # injeta PORTA_IDENTIDADE
│       │   ├── campo-personalizado.service.ts # defs (crm_admin:gerir_campos_lead)
│       │   ├── valor-campo.service.ts         # PUT substituição total + validação por tipo
│       │   ├── registrar-lead.service.ts      # porta in-process (035 injeta)
│       │   ├── crm-lead-audit.service.ts
│       │   └── index.ts
│       └── infra/lead/
│           ├── lead.repository.ts
│           ├── campo-personalizado.repository.ts
│           ├── valor-campo.repository.ts
│           ├── crm-lead-audit.repository.ts
│           └── index.ts
└── test/
    ├── crm-lead.e2e-spec.ts         # NOVO — CRUD, escopo ver_proprios, scoring idempotente,
    │                                 #   conversão reusa 005 + idempotente + sem import clientes,
    │                                 #   campos personalizados (validação), auditoria, guard,
    │                                 #   catálogo +1, regressão, /health = 11
    └── support/
        └── crm-lead.ts              # helpers: criar lead, mover estágio, criar definição,
                                      #   PUT valores, converter, ler auditoria

frontend/
└── src/
    ├── app/router.tsx                # + rota /crm/leads sob RequirePermissao anyOf
    ├── shell/nav-items.ts            # + { label: 'CRM · Leads', to: '/crm/leads',
    │                                 #     requerPermissao: ['lead:ver_todos','lead:ver_proprios'] }
    ├── test/setup.ts                 # fetch default p/ /crm/leads/*; lead:* + crm_admin:gerir_campos_lead
    └── leads/
        ├── LeadsPage.tsx             # lista + filtros + busca + coluna score
        ├── LeadDetalhePage.tsx       # contato, UTMs, score, tags, campos personalizados,
        │                             #   timeline de auditoria, Converter em pessoa
        ├── leads-api.ts              # apiFetch tipado
        └── *.test.tsx

docs/
└── 008-crm-lead.md                   # NOVO — entidade lead, escopo por permissão, scoring
                                      #   (regra + pesos), conversão (PortaIdentidade + CL-01),
                                      #   campos personalizados, porta RegistrarLeadService

CLAUDE.md  README.md  ROADMAP.md      # atualizados no fim da spec
```

**Structure Decision**: `crm` mantém a divisão **`domain/` (puro) · `application/`
(serviços/transações) · `infra/` (Prisma)** da 005/006/007, agora com um subdiretório
`lead/` em cada camada (a 007 usa a raiz de cada camada para a administração; `lead/`
isola a nova entidade). O **núcleo** (`calcularScore`, normalização, plano de conversão)
fica em `domain/lead/`, 100% testável sem banco (SC-008). O **contrato** `PortaIdentidade`
vive no `core/identidade/` (global — a única forma de o `crm` alcançar a engine da 005 sem
violar o Princípio VI); `clientes` ganha um adaptador de 1 arquivo. `CrmModule` estende o
da 007 (não é reescrito), exporta `RegistrarLeadService` e injeta `PORTA_IDENTIDADE`.
`CONTEXT_MODULES` fica em 11 e `context-modules.e2e-spec.ts` não muda. O catálogo da 004
cresce em **uma** permissão no recurso `crm_admin` da 007.

## Complexity Tracking

> Sem violações constitucionais. Um ponto merece nota (não é violação):
>
> | Item | Por que | Alternativa mais simples rejeitada porque |
> |------|---------|--------------------------------------------|
> | `PortaIdentidade` + token DI no `core` | O Princípio VI proíbe `crm` importar `clientes`, mas a conversão Lead→Pessoa **tem** de reusar a engine de identidade da 005 (regra inviolável: dedup é um serviço único e auditável). Inversão de dependência via `core` é o padrão limpo. | (a) `crm` importa `clientes` — viola o Princípio VI e a regra ESLint. (b) Orquestrar na borda `admin`/`api` — espalha a lógica de conversão para fora do dono (`crm`) e complica a transação. (c) Evento assíncrono — a conversão deixa de ser síncrona/transacional, o painel precisa de estado "convertendo", e a 005 teria de expor um consumidor de evento que ela não tem. O contrato no `core` é 1 arquivo de interface + 1 adaptador de 1 arquivo na 005. |
