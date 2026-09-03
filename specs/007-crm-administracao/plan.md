# Implementation Plan: Administração do CRM — equipes, expediente/feriados, integrações e auditoria

**Branch**: `007-crm-administracao` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-crm-administracao/spec.md`

## Summary

Preencher o _bounded context_ **`crm`** (vazio desde a 001) com o **módulo de Administração
do CRM** da visão Parte 8.11, **sem reimplementar** nada da 004 (perfis/permissões/usuários
seguem lá). Quatro subdomínios, 1 migração Prisma (5ª de negócio), **0 dependência nova**,
nenhuma porta nova, `CONTEXT_MODULES` segue **11**.

1. **Domínio puro** (`src/crm/domain/`, testável sem banco):
   - `expediente.ts` — **`estaEmExpediente(instante, { janelas, feriados, equipe? }) →
     boolean`**. Converte `instante` para hora local **America/Sao_Paulo** com a API nativa
     `Intl.DateTimeFormat` (`timeZone: 'America/Sao_Paulo'`, `hourCycle: 'h23'`) — **0 dep**,
     livre do `TZ` do processo. Extrai `dia_semana` (0–6), `hh:mm` e `data` locais. Retorna
     `true` sse `hh:mm` cai em **alguma** janela ativa aplicável (`inicio <= t < fim`) **e**
     a `data` local **não** casa nenhum feriado aplicável. "Aplicável" = globais (`equipeId
     = null`) **∪** os da `equipe` informada, se ela estiver ativa (CL-01). Feriado
     recorrente casa por `(mês, dia)` exato (29/02 não desloca — CL-04). Sem janela
     aplicável → `false` (CL: nunca "aberto por omissão"). Função pura, determinística.
   - `expediente.spec.ts` — dentro/fora de janela, domingo sem janela, feriado fixo e
     recorrente (global e por equipe), borda `inicio`/`fim` (`>=`/`<`), união global+equipe,
     equipe inativa ignorada, 29/02, determinismo N×.
   - `mascarar-segredo.ts` — `mascararSegredo(valor) → '••••••' + últimos 4` (ou `null` se
     não há segredo). Puro.
   - `api-key.ts` — `gerarApiKey() → { valor: 'crm_' + 40 hex, hash }` (SHA-256 hex via
     `node:crypto`) e `hashSegredo(valor)`. Puro/determinístico no hash.
   - `cifra.ts` — `cifrar(texto, chave) / decifrar(blob, chave)` com **AES-256-GCM**
     (`node:crypto`, IV aleatório de 12 bytes, _authTag_; blob = `base64(iv|tag|ct)`).
     `decifrar` nunca é chamado por endpoint (o segredo cifrado só é lido por 011/019–022
     no futuro), mas fica no domínio para teste round-trip.
   - `tipos.ts` — enums `EquipeTipo`, `PapelEquipe`, `IntegracaoTipo`, `IntegracaoAlvo`,
     `DiaSemana`; tipos `JanelaAplicavel`, `FeriadoAplicavel`, `ResultadoExpediente`.
2. **Persistência Prisma** (5ª migração — `prisma/migrations/<ts>_crm_admin/`): models
   `Equipe`, `EquipeMembro`, `JanelaAtendimento`, `Feriado`, `Integracao`, `CrmAdminAudit`
   + enums acima. PK `String @id @db.Uuid` via `EntidadeId.novo()`; `@db.Timestamptz(6)` em
   `criado_em`/`atualizado_em`/`entrou_em`/`saiu_em`/`ultimo_uso_em`; `config` `Json`;
   `dia_semana` `Int` (0–6); `hora_inicio`/`hora_fim` como `Int` **minutos desde 00:00**
   (0–1439, comparação trivial, sem tipo `time`); `feriado.data` `@db.Date`. FK
   `EquipeMembro.usuarioId → usuario.id` (`onDelete: Restrict`). Uniques:
   `@@unique([equipeId, usuarioId])` **parcial `WHERE saiu_em IS NULL`** (um vínculo ativo
   por par — via `migration.sql` cru, como o índice parcial da 005). **Sem seed de negócio.**
3. **Aplicação** (`src/crm/application/`):
   - `crm-admin-audit.service.ts` — `registrar(delta)` na forma canônica
     `montarRegistroAuditoria` do core (`AJUSTE_MANUAL`), tabela `crm_admin_audit`,
     **append-only**, **só delta real** (`jsonIgual` → no-op). Simétrico ao
     `ClientesAuditService`/`IngestaoAuditService`. Recebe já-mascarado/marcador para
     segredo — **nunca** o valor.
   - `equipe.service.ts` — CRUD de `equipe`; `adicionarMembro` (409 se já há vínculo ativo
     do par; 404/422 se `usuarioId` não existe em `usuario`), `trocarPapel`,
     `removerMembro` (preenche `saiu_em`; idempotente se já saiu → no-op sem auditoria).
     `desativar` = `ativo = false`. Cada escrita → audit.
   - `expediente.service.ts` — CRUD de `janela_atendimento` (rejeita `hora_fim <=
     hora_inicio` → 422 — CL-02; `DELETE` físico) e `feriado`; `consultar(instante,
     equipeId?)` carrega janelas/feriados aplicáveis do banco e chama
     `estaEmExpediente` do domínio. Cada escrita → audit.
   - `integracao.service.ts` — `criar` (para `API_KEY` sem `segredo` → `gerarApiKey()`,
     guarda `segredoHash`, devolve `apiKey` **na resposta de criação**; demais tipos →
     `cifrar(segredo, chave)` em `segredoCifrado`), `listar`/`obter` (projeta
     `segredoDefinido` + `segredoMascarado`, **nunca** o valor — FR-024), `atualizar`
     (campos não-segredo; `segredo` no corpo conta como rotação), `rotacionar` (novo valor
     revelado 1×; 409/422 se o tipo não comporta segredo — FR-028), `ativar/desativar`.
     `ultimoUsoEm` nunca é escrito aqui (reservado 011/019–022). Cada escrita → audit
     (delta com **marcador** de segredo, nunca valor — FR-033).
   - `index.ts` — barrel dos serviços.
4. **HTTP** (`src/crm/`):
   - `crm-admin.controller.ts` — prefixo `/crm/admin`. Classe **não** leva
     `@RequerPermissao` de classe (subdomínios têm permissões diferentes); cada rota declara
     a sua:
     - Equipes (`crm_admin:ver` leitura / `crm_admin:gerir_equipes` escrita):
       `GET equipes`, `GET equipes/:id`, `POST equipes`, `PATCH equipes/:id`,
       `POST equipes/:id/membros`, `PATCH equipes/:id/membros/:usuarioId`,
       `DELETE equipes/:id/membros/:usuarioId`.
     - Expediente (`crm_admin:ver` / `crm_admin:gerir_expediente`):
       `GET janelas-atendimento`, `POST`, `PATCH :id`, `DELETE :id`;
       `GET feriados`, `POST`, `PATCH :id`, `DELETE :id`;
       `GET expediente?instante=&equipeId=` (`crm_admin:ver`).
     - Integrações (`crm_admin:ver` / `crm_admin:gerir_integracoes`):
       `GET integracoes`, `GET integracoes/:id`, `POST`, `PATCH :id`,
       `POST integracoes/:id/rotacionar`.
     - (Opcional, FR-035) `GET crm/admin/auditoria?entidade=&entidadeId=` (`crm_admin:ver`)
       — leitura simples do `crm_admin_audit` local; o painel consolidado é a 053.
   - `dto/` — schemas zod por payload (`equipe`, `membro`, `janela`, `feriado`,
     `integracao`, `listar-*`, `consultar-expediente`). `instante` via `parseInstante` do
     core (lixo → 400).
5. **Config** (`src/config/env.schema.ts`): **+1 chave** —
   `CRM_INTEGRACAO_CIFRA_KEY` (`z.string()` base64 de **32 bytes** → 44 chars; validada e
   decodificada no schema; **obrigatória em todo `NODE_ENV`** — sem default silencioso,
   FR-043). `.env`/`.env.example`/`ci.yml`/`test/setup-db.ts` ganham uma fixture. `core`
   re-exporta a chave tipada (Padrão 002 — `src/core/config/index.ts`).
6. **RBAC** (`src/auth/rbac/catalogo.ts`): **+1 recurso `crm_admin`** — `crm_admin:ver`,
   `crm_admin:gerir_equipes`, `crm_admin:gerir_expediente`, `crm_admin:gerir_integracoes`
   (rótulos pt-BR). `catalogo.spec.ts` + o teste de `agruparPorRecurso` ganham a asserção.
   `assertCatalogoCoerente()` e o `RbacRouteAudit` do boot já validam. `administrador`
   (special-case do `SujeitoRbacService`) e a credencial de serviço concedem de graça — **0
   migração de dados, 0 novo seed** (FR-037).
7. **Módulo** (`src/crm/crm.module.ts`): reescrito — `controllers: [CrmAdminController]`,
   `providers` (repos + serviços + audit), importa `PrismaModule` e `AuthModule` (tipos de
   `Permissao` + guard — `auth` é infra transversal). **Não exporta** porta ainda (010/012
   consomem via HTTP/porta a definir nessas specs). `onModuleInit` loga
   `crm.ready crm_admin permissoes=4 …` (sem dados sensíveis — FR-044). `CONTEXT_MODULES`
   **não muda** (o `crm` já estava lá); `context-modules.e2e-spec.ts` e `/health` seguem 11.
8. **Infra** (`src/crm/infra/`): `*.repository.ts` finos por agregado (Prisma), incluindo o
   índice único parcial de `equipe_membro` aplicado no `migration.sql`.
9. **Frontend** (`frontend/src/crm-admin/`):
   - `nav-items.ts` — **+** `{ label: 'CRM · Administração', to: '/crm/admin',
     requerPermissao: 'crm_admin:ver' }` (o placeholder `{ label: 'CRM', soon: true }`
     continua para 008+).
   - `router.tsx` — rota `/crm/admin` sob `<RequirePermissao perm="crm_admin:ver">`.
   - `CrmAdminPage.tsx` — _shell_ com 3 abas (`?tab=equipes|expediente|integracoes`).
   - `EquipesTab.tsx` / `ExpedienteTab.tsx` / `IntegracoesTab.tsx` — listas + formulários;
     controles de escrita só com a permissão `gerir_*` correspondente
     (`usePermissoesEfetivas`). Expediente tem o indicador "no expediente agora?"
     (`GET /crm/admin/expediente`). Integrações mostra **máscara**; criação/rotação exibe o
     valor pleno **uma vez** num `<aside>` que não persiste ao recarregar.
   - `crm-admin-api.ts` — `apiFetch` tipado. `test/setup.ts` ganha _default_ para
     `/crm/admin/*` + `crm_admin:*` em `TODAS_PERMISSOES`.
   - `*.test.tsx` (vitest + Testing Library).

Abordagem: **0 dep nova**. Fuso via `Intl` nativo (o Node 24 traz ICU completo — mesma
aposta "sem lib" do `setInterval` da 006 e da validação de doc da 005). Cifra via
`node:crypto` AES-256-GCM. Testes: unit sem banco (expediente exaustivo + matriz `TZ` na
CI; máscara; round-trip da cifra; geração/hash de API key); e2e Postgres real (migração;
CRUD dos 4 subdomínios; **nenhum** segredo em `GET`/audit/log — `grep` do valor; API key
revelada 1× só; `estaEmExpediente` via endpoint bate com o unit; 2º vínculo ativo → 409;
guard 401/403/200; catálogo cresce; regressão 003–006; `/health` = 11). Ao fim:
`docs/007-crm-administracao.md` + `CLAUDE.md`/`README.md`/`ROADMAP.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova.** NestJS 11, Prisma `^6` + `@prisma/client` (6 models novos, 5
  enums), `zod` 3 (DTOs). Fuso horário via `Intl.DateTimeFormat` nativo (ICU do Node 24 —
  **`date-fns-tz`/`luxon` avaliados e rejeitados** em research: 1 dep para o que o `Intl`
  resolve). Cifra e hash via `node:crypto` (AES-256-GCM, SHA-256). `EntidadeId`, `agoraUtc`,
  `parseInstante`, `montarRegistroAuditoria`, contrato de config tipado vêm do `core`.
- Frontend: **nenhuma nova.** React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch` central (003/004).

**Storage**: **PostgreSQL 16 via Prisma** — 5ª migração de negócio (após `_rbac`,
`_clientes`, `_clientes_primario_unico`, `_ingestao`). 6 tabelas: `equipe`, `equipe_membro`,
`janela_atendimento`, `feriado`, `integracao`, `crm_admin_audit`. `integracao.config` e os
`valor_anterior`/`valor_novo` do audit como `Json`. Segredo em `segredo_cifrado` (texto
base64 do AES-GCM) **ou** `segredo_hash` (SHA-256 hex, para API key interna). Sem porta nova
(mesmo `DATABASE_URL`/`TEST_DATABASE_URL`, Postgres dev host `55432`).

**Testing**:
- Backend unit (`jest`, sem banco):
  - `expediente.spec.ts` — (a) quarta 14:00 dentro de seg–sex 09:00–18:00 → `true`;
    (b) domingo 14:00 → `false`; (c) feriado fixo no dia útil dentro da janela → `false`;
    (d) feriado `recorrente_anual` 25/12 cadastrado em 2026 → `false` em 2027/2030;
    (e) borda: 09:00:00 → `true`, 18:00:00 → `false`; (f) união: janela global seg–sex +
    janela da equipe no sábado → sábado da equipe `true`, sábado sem equipe `false`;
    (g) equipe **inativa** → janelas dela ignoradas; (h) 29/02 recorrente → `false` só em
    ano bissexto; (i) zero janela aplicável → `false`; (j) determinismo: 500× mesma entrada
    → mesmo veredito.
  - `mascarar-segredo.spec.ts`, `api-key.spec.ts` (formato `crm_` + comprimento + hash
    estável + colisão improvável), `cifra.spec.ts` (round-trip; _authTag_ inválido →
    erro; IV distinto por chamada).
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts` já roda
  `migrate deploy` + `db seed`; fixture de `CRM_INTEGRACAO_CIFRA_KEY`):
  - migração cria as 6 tabelas + enums; `db seed` não quebra; índice único parcial de
    `equipe_membro` presente.
  - **Equipes**: `POST` cria `ativo`; `POST …/membros` cria vínculo; **2º vínculo ativo do
    mesmo par → 409**; `usuarioId` inexistente → 404/422; `DELETE …/membros` preenche
    `saiu_em`, some da lista ativa, aparece no histórico; `DELETE` de novo → no-op sem
    auditoria; `PATCH { ativo:false }` some das listas padrão; membro em N equipes.
  - **Expediente**: `POST janela` com `hora_fim <= hora_inicio` → 422; CRUD ok;
    `GET expediente?instante=<ISO de quarta 14:00 BRT>` → `{ emExpediente:true }`;
    mesmo horário com feriado cadastrado → `false`; `instante` lixo → 400; união
    global+equipe conferida ponta a ponta.
  - **Integrações**: `POST WEBHOOK { segredo:'s3cr3t' }` → resposta tem `segredoMascarado`,
    não `s3cr3t`; `GET` lista/detalhe idem; `POST { tipo:'API_KEY' }` sem segredo → resposta
    de criação traz `apiKey: 'crm_…'` **1×**, `GET` seguinte não; `POST …/rotacionar` →
    novo valor 1×, hash antigo não casa mais; `PATCH { nome }` preserva segredo;
    `rotacionar` de `CONEXAO_INTERNA` sem segredo → 409/422. **`grep` do segredo em toda
    resposta + em `crm_admin_audit` + nos logs capturados = 0**.
  - **Auditoria**: cada escrita → 1 `crm_admin_audit` com autor (sub do JWT / credencial de
    serviço), `quando`, `entidade`, `entidadeId`, `campo`, `delta`, `origem = AJUSTE_MANUAL`;
    `PATCH` no-op → 0 registro; criação/rotação de segredo → registro presente **sem** valor.
  - **Guard**: cada rota sem token → 401; token de `Usuario` sem perfil → 403; credencial
    de serviço → 2xx. Corpo do 403 é o genérico da 004.
  - **Catálogo/efetivas**: `GET /admin/rbac/permissoes` inclui o recurso `crm_admin` com 4
    permissões; `GET /auth/permissoes-efetivas` da credencial de serviço as contém.
  - **Regressão**: `auth`/`rbac`/`clientes`/`ingestao`/`health`/`context-modules` (11)
    verdes; matriz `TZ` (UTC/Sao_Paulo/Tokyo) no job da CI cobre `expediente.spec.ts`.
- Frontend (`vitest` + Testing Library, jsdom): nav esconde **CRM · Administração** sem
  `crm_admin:ver`; rota direta sem permissão → "sem permissão" (não Login); 3 abas montam
  dos endpoints; sem `gerir_*` a aba é read-only (sem botões de escrita); Integrações mostra
  só máscara, e o valor pleno some ao remontar; indicador "no expediente agora?" chama o
  endpoint; 403 numa chamada → banner + sessão intacta.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174` (configuráveis,
spec 001). Dev Windows + Linux; CI Linux (GitHub Actions).

**Performance Goals**: sem meta funcional. `estaEmExpediente` é O(nº de janelas + nº de
feriados) — dezenas, não milhares. `GET` de listas pagina (default 25, teto 100). O
`GET /crm/admin/expediente` faz 2 `SELECT` indexados (`janela_atendimento`/`feriado` por
`equipe_id`) + a função pura.

**Constraints**:
- **Nenhuma porta nova** (`netstat`/`docker ps` confirmam 3001/5174/55432 do próprio
  projeto; reusa `DATABASE_URL`/`TEST_DATABASE_URL`).
- **Segredo nunca exposto** (spec §US2, FR-023/024/033): leitura projeta só
  `segredoDefinido`+`segredoMascarado`; o `crm_admin_audit` recebe **marcador**, nunca o
  valor; API key interna é **só-hash** (irreversível); segredo de webhook/externo é
  **AES-256-GCM** com chave de `.env`. `decifrar` não tem caminho de endpoint nesta spec.
- **Auditoria** (Padrão Transversal): toda escrita administrativa → `crm_admin_audit` na
  forma `RegistroAuditoria` do core (`AJUSTE_MANUAL`, _append-only_), **só delta real**.
  Painel consolidado = 053.
- **Livre de locale** (Padrão 002): `estaEmExpediente` fixa `timeZone: 'America/Sao_Paulo'`
  no `Intl` — não lê `TZ` do processo. Matriz de fuso na CI.
- **RBAC 004**: cada endpoint sob `@RequerPermissao`; leitura → `crm_admin:ver`, escrita →
  `gerir_*`; 403 ≠ 401 (corpo genérico da 004). Nenhuma rota `@Public()`/`@AutenticadoBasta`.
- **Sem chamada externa** (Princípio VIII, spec §Out of Scope): nada de _OAuth dance_,
  validação de token contra o alvo, webhook de recebimento. Só cadastro/curadoria.
- **Contextos delimitados** (Princípio VI): `crm` importa só `core` (global) e `auth` (infra
  transversal — guard/`Permissao`). **Não** importa `clientes`/`financeiro`/`ingestao`/etc.
  A relação com `usuario` é FK no schema Prisma compartilhado (mesmo padrão da 004 para as
  tabelas de RBAC), **não** import de código do `auth`/`clientes`.
- Regra ESLint `no-restricted-syntax` (002): sem `process.env` fora de `config/`/`core/` —
  a chave de cifra entra via `ConfigService`/contrato do `core`.
- `crm_admin_audit` é _append-only_; `equipe_membro` nunca é `DELETE` físico (só `saiu_em`);
  `janela_atendimento`/`feriado` **podem** ser `DELETE` físico (config, sem histórico —
  a mudança fica no `crm_admin_audit`).

**Scale/Scope**: ~30 arquivos novos no backend (`src/crm/{domain,application,infra,dto}/**`,
`crm-admin.controller.ts`, `crm.module.ts` reescrito, `prisma/migrations/<ts>_crm_admin/`,
`test/crm-admin.e2e-spec.ts` + `test/support/crm-admin.ts`), ~9 no frontend
(`src/crm-admin/**` + testes), **0 dep nova**, **1 migração**, **~22 endpoints** (7 leitura
+ ~15 escrita, todos CRUD de config administrativa — justificados abaixo), ~7 arquivos
tocados (`schema.prisma`, `src/config/env.schema.ts`, `src/core/config/index.ts`,
`src/auth/rbac/catalogo.ts` + `.spec.ts`, `frontend/src/app/router.tsx`,
`frontend/src/shell/nav-items.ts`, `frontend/src/test/setup.ts`),
`.env`/`.env.example`/`ci.yml`/`test/setup-db.ts` (+1 chave), 1 doc novo, 3 docs
atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 6 tabelas nascem com **ID surrogate UUID v7** gerado na
      app (`EntidadeId.novo()`), decidido antes do schema (`data-model.md`). **Nenhum id de
      origem** envolvido — `equipe`/`janela`/`feriado`/`integracao` são entidades internas
      do CRM, não vêm de plataforma; não há `*_origem_ref` nem `plataforma_origem` aqui. A
      FK `equipe_membro.usuario_id` referencia a PK UUID de `usuario` (004), nunca um id
      externo. Granularidade documentada: 1 `equipe` por PK; ≤1 `equipe_membro` **ativo** por
      `(equipe, usuario)`; `janela`/`feriado` por PK, escopo por `equipe_id` nullable;
      1 `integracao` por PK.
- [x] **II. Clarificar antes de assumir**: 4 clarificações resolvidas com o dono do produto
      em 2026-09-03 (CL-01 união global+equipe; CL-02 rejeitar janela que cruza meia-noite;
      CL-03 escala por atendente fora de escopo; CL-04 feriado 29/02 não desloca) —
      spec §Clarifications. **Zero `NEEDS CLARIFICATION`.** O que depende de outra spec
      (atribuição automática → 010/012; provedor WhatsApp e uso real do expediente →
      011/012/014; consumo de `integracao` por adapters → 019–022/033) está em §Out of Scope,
      não assumido.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não há ingestão de plataforma
      nesta spec. `integracao` é um **cadastro** (nome/tipo/alvo/config/segredo); nenhum
      código aqui conhece "Guru"/"Asaas"/etc. nem traduz status. `alvo` é um enum interno
      (`FINANCEIRO|MARKETING|CENTRAL|EXTERNO`), não `plataforma_origem`. Os adapters e o
      `status_map` seguem sendo 019–022.
- [x] **IV. Log de eventos + projeções**: **N/A** — a Administração do CRM não é pipeline de
      ingestão. `estaEmExpediente` é **função pura** (`f(config, instante) → bool`), sem
      estado mutável, reprocessável trivialmente. `crm_admin_audit` é _append-only_. Nenhum
      `commit()` de remendo; cada escrita é uma transação Prisma curta que também grava o
      audit.
- [x] **V. Agregados derivados**: **nenhum agregado** nesta spec. Não há contador, soma nem
      valor monetário (o `valor_estimado` de Oportunidade é a spec 010). `estaEmExpediente`
      é derivação pura da config; nunca `estado += delta`.
- [x] **VI. Contextos delimitados — observar, não escrever**: `CrmModule` passa a ser
      **módulo de contexto real** (já estava em `CONTEXT_MODULES` — segue 11). Importa só
      `core` (global) e `auth` (infra transversal — guard/decorator/`Permissao`); **não**
      importa nenhum contexto de domínio (ESLint `import/no-restricted-paths`). A relação com
      `usuario` (004) é **FK no schema Prisma compartilhado** — mesmo padrão que a 004 usa
      internamente, e sem acoplar código. 010/012/014 vão **consumir** `equipe`/
      `estaEmExpediente` — quando chegarem, decidem a forma (porta/HTTP); esta spec não
      antecipa export.
- [x] **VII. Curadoria vs derivação**: **N/A** — não há campo com dois caminhos de escrita
      (derivado + curado). Tudo aqui é entrada manual do administrador; o `crm_admin_audit`
      registra quem/quando/delta. Nenhum vínculo aplicado é auto-revertido (não há vínculo
      de reconciliação nesta spec).
- [x] **VIII. Superfície de escrita mínima**: os ~15 endpoints de escrita são **CRUD de
      configuração administrativa** — exatamente o que a visão Parte 8.11 pede ("gestão de
      times/squads", "gestão de integrações", "configuração de horários e feriados").
      Justificativa registrada: é um **painel de administração**, não recurso de negócio
      derivável; sem esses `POST`/`PATCH` não há como configurar o CRM. **Sem** `DELETE` de
      `equipe`/`integracao` (só `ativo=false`); **sem** `DELETE` de membro (só `saiu_em`);
      `DELETE` físico só de `janela`/`feriado` (config sem histórico). **Nenhuma
      sincronização automática com API externa** — nada nesta spec chama serviço externo
      (Princípio VIII e §Out of Scope). Cada escrita sob `@RequerPermissao` + auditada.
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 6 tabelas (`id String @id @db.Uuid`). Sem id de
        origem.
      - **Dinheiro**: N/A (nenhum valor monetário nesta spec).
      - **Tempo**: `@db.Timestamptz(6)` em `criado_em`/`atualizado_em`/`entrou_em`/
        `saiu_em`/`ultimo_uso_em` via `agoraUtc()`; `feriado.data` é `@db.Date` (data-
        calendário local, sem hora); `hora_inicio`/`hora_fim` são `Int` minutos locais.
        `estaEmExpediente` e o endpoint usam `parseInstante` do core e `Intl` com
        `timeZone` fixo — **livre de locale** (matriz `TZ` na CI, como a 002).
      - **Status**: N/A (`StatusTransacaoCanonico`/`StatusContratoCanonico` não se aplicam;
        `equipe.ativo`/`integracao.ativo` são flags booleanas simples).
      - **Idempotência**: `removerMembro` de quem já saiu → no-op; `PATCH` sem delta → sem
        audit; `estaEmExpediente` é pura.
      - **Auditoria**: `criado_em`/`atualizado_em` em tudo; `crm_admin_audit` na forma
        `RegistroAuditoria` (core 002), `AJUSTE_MANUAL`, _append-only_, só delta real, nunca
        segredo. Simétrico a `rbac_audit`/`clientes_audit`/`ingestao_audit`.
      - **Erros**: validação zod → 400/422; conflito → 409; sem permissão → 403; sem token
        → 401.
      - **Config/segredos**: `.env` — nova chave `CRM_INTEGRACAO_CIFRA_KEY` **obrigatória**
        em todo `NODE_ENV`, validada por zod, sem default; boot aborta se ausente/curta.
        Segredo de integração cifrado em repouso; API key só-hash.
      - **Multi-conta**: N/A (nenhum `plataforma_origem` nesta spec; `integracao.alvo` é
        enum interno).
      - **Dependência nova**: nenhuma (`date-fns-tz`/`luxon` avaliados e rejeitados em
        research — `Intl` nativo basta).

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking vazio** — a spec fica
no mínimo para o que a visão 8.11 pede: 6 tabelas, CRUD de config, 1 função pura, 0 dep
nova, sem chamada externa, sem antecipar trabalho de 010/012/014.

*Re-check pós-Phase 1: **PASS** — o design manteve `crm` sem importar contexto de domínio;
`estaEmExpediente` puro e livre de locale (`Intl` fixo); segredo nunca projetado em leitura
nem em audit (contrato em `contracts/integracoes.md`); `crm_admin_audit` _append-only_;
`CONTEXT_MODULES` em 11. Ver `data-model.md` e `contracts/`.*

## Project Structure

### Documentation (this feature)

```text
specs/007-crm-administracao/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões: Intl nativo vs date-fns-tz/luxon; hora como
│                        #   Int-minutos vs @db.Time; união vs override (CL-01) e por quê;
│                        #   AES-256-GCM p/ segredo + SHA-256 p/ API key; índice único
│                        #   parcial de equipe_membro; auditoria própria do crm; forma do
│                        #   endpoint /expediente; rejeitar janela que cruza meia-noite
├── data-model.md        # Phase 1 — 6 models Prisma, enums, invariantes, uniques (incl.
│                        #   parcial), a função estaEmExpediente (regra + pseudocódigo),
│                        #   projeção de leitura de `integracao` (o que NUNCA sai)
├── quickstart.md        # Phase 1 — env (incl. CRM_INTEGRACAO_CIFRA_KEY), prisma migrate,
│                        #   lint/typecheck, unit, e2e, fluxo manual (criar equipe+membro,
│                        #   janela+feriado, consultar expediente, criar/rotacionar
│                        #   integração e confirmar máscara)
├── contracts/
│   ├── crm-admin-equipes.md      # GET/POST/PATCH equipes, membros (add/troca-papel/remove)
│   ├── crm-admin-expediente.md   # CRUD janelas-atendimento + feriados; GET /expediente
│   ├── crm-admin-integracoes.md  # GET/POST/PATCH + /rotacionar; projeção de leitura (máscara)
│   ├── estaEmExpediente.md       # assinatura, regras (CL-01..CL-04), tabela de casos
│   ├── rbac-catalogo.md          # + recurso crm_admin (4 permissões) no catálogo da 004
│   └── frontend-crm-admin.md     # nav condicional, rota RequirePermissao, 3 abas, reveal 1×
├── checklists/
│   └── requirements.md           # do /speckit-specify (16/16; CL-01..CL-04 resolvidos)
└── tasks.md             # Phase 2 — /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                 # + models Equipe, EquipeMembro, JanelaAtendimento,
│   │                                 #   Feriado, Integracao, CrmAdminAudit
│   │                                 #   + enums EquipeTipo, PapelEquipe, IntegracaoTipo,
│   │                                 #     IntegracaoAlvo
│   └── migrations/<ts>_crm_admin/
│       └── migration.sql             # NOVO — 6 tabelas + enums + índices; índice único
│                                     #   PARCIAL de equipe_membro (WHERE saiu_em IS NULL)
├── src/
│   ├── config/env.schema.ts          # + CRM_INTEGRACAO_CIFRA_KEY (base64 32 bytes, obrig.)
│   ├── core/config/index.ts          # + re-export tipado da nova chave (Padrão 002)
│   ├── auth/rbac/
│   │   ├── catalogo.ts               # + recurso crm_admin: 4 permissões
│   │   └── catalogo.spec.ts          # + asserção do novo recurso + agruparPorRecurso
│   └── crm/
│       ├── crm.module.ts             # reescrito — CrmAdminController, providers, onModuleInit
│       ├── crm-admin.controller.ts   # /crm/admin/** — equipes, expediente, integracoes, auditoria?
│       ├── dto/
│       │   ├── equipe.schema.ts
│       │   ├── membro.schema.ts
│       │   ├── janela.schema.ts
│       │   ├── feriado.schema.ts
│       │   ├── integracao.schema.ts
│       │   └── consultar-expediente.schema.ts
│       ├── domain/
│       │   ├── expediente.ts             # estaEmExpediente(instante, {janelas,feriados,equipe?})
│       │   ├── expediente.spec.ts
│       │   ├── mascarar-segredo.ts
│       │   ├── mascarar-segredo.spec.ts
│       │   ├── api-key.ts               # gerarApiKey(), hashSegredo()
│       │   ├── api-key.spec.ts
│       │   ├── cifra.ts                 # cifrar/decifrar AES-256-GCM (node:crypto)
│       │   ├── cifra.spec.ts
│       │   ├── tipos.ts                 # enums + tipos de apoio
│       │   └── index.ts
│       ├── application/
│       │   ├── equipe.service.ts
│       │   ├── expediente.service.ts    # CRUD janelas/feriados + consultar(instante,equipeId?)
│       │   ├── integracao.service.ts    # criar/listar/obter/atualizar/rotacionar (projeção mascarada)
│       │   ├── crm-admin-audit.service.ts
│       │   └── index.ts
│       └── infra/
│           ├── equipe.repository.ts
│           ├── expediente.repository.ts
│           ├── integracao.repository.ts
│           ├── crm-admin-audit.repository.ts
│           └── index.ts
└── test/
    ├── crm-admin.e2e-spec.ts         # NOVO — CRUD dos 4 subdomínios, segredo nunca vaza,
    │                                 #   API key 1×, expediente via endpoint, 2º vínculo → 409,
    │                                 #   auditoria (delta/no-op/sem segredo), guard, regressão
    └── support/
        └── crm-admin.ts              # helpers: criar equipe/membro/janela/feriado/integracao,
                                      #   montar instante BRT, ler auditoria

frontend/
└── src/
    ├── app/router.tsx                # + rota /crm/admin sob RequirePermissao
    ├── shell/nav-items.ts            # + { label: 'CRM · Administração', to: '/crm/admin',
    │                                 #     requerPermissao: 'crm_admin:ver' }
    ├── test/setup.ts                 # fetch default p/ /crm/admin/*; crm_admin:* em TODAS_PERMISSOES
    └── crm-admin/
        ├── CrmAdminPage.tsx          # shell de abas (?tab=equipes|expediente|integracoes)
        ├── EquipesTab.tsx
        ├── ExpedienteTab.tsx         # + indicador "no expediente agora?"
        ├── IntegracoesTab.tsx        # máscara; reveal 1× em <aside> não-persistente
        ├── crm-admin-api.ts          # apiFetch tipado
        └── *.test.tsx

docs/
└── 007-crm-administracao.md          # NOVO — equipes/membros, expediente (regra + CL),
                                      #   integrações (segurança do segredo), auditoria, painel

CLAUDE.md  README.md  ROADMAP.md      # atualizados no fim da spec
```

**Structure Decision**: `crm` adota a mesma divisão **`domain/` (puro) · `application/`
(serviços/transações) · `infra/` (Prisma)** que a 005/006 estrearam e que as pastas vazias
da 001 já anteciparam. O **núcleo** (`estaEmExpediente`, máscara, cifra, geração de API key)
fica em `domain/`, 100% testável sem banco (SC-008). `CrmModule` importa `PrismaModule` e
`AuthModule` (guard + `Permissao` — `auth` é infra transversal) e **não exporta porta**
ainda — 010/012/014 decidem a forma de consumo quando chegarem. `CONTEXT_MODULES` fica em 11
e `context-modules.e2e-spec.ts` não muda. O catálogo de permissões da 004 cresce em
`src/auth/rbac/catalogo.ts` com o recurso `crm_admin`.

## Complexity Tracking

> Sem violações constitucionais. Nada a registrar — a spec entrega exatamente o que a visão
> Parte 8.11 pede (times/squads, integrações, horários/feriados, auditoria administrativa),
> no mínimo: 6 tabelas, CRUD de config, 1 função pura, 0 dep nova, 0 chamada externa, sem
> antecipar a atribuição automática (010/012) nem o uso do expediente (012/014).
