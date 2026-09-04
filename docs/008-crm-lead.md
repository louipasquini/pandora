# 008 — Lead do CRM: entidade compartilhada, scoring, campos personalizados e conversão

Segunda fatia da **Fase 1 (CRM)** e a **primeira entidade compartilhada** do projeto: o
**`lead`**. Diferente do padrão dos demais contextos (cada um dono das suas entidades), o
Lead vive numa **única tabela** consumida por CRM **e** Marketing; quem pode criar, editar
e ver Lead é decidido por **permissão de acesso (RBAC 004)**, não por fronteira
arquitetural (visão Parte 8.2.1). A tabela mora no _bounded context_ **`crm`**.

Spec, plano e contratos: [`specs/008-crm-lead/`](../specs/008-crm-lead/).

`CONTEXT_MODULES` segue com **11**. **6ª migração de negócio** (`20260904122426_crm_lead`).
**0 dependência nova** (backend e frontend). **Nenhuma variável de ambiente nova.**
**Nenhuma porta nova.** **+1 permissão** de catálogo (`crm_admin:gerir_campos_lead`).

---

## Reuso da engine de identidade da 005 sem violar o Princípio VI (CL-02)

O `crm` **não pode importar `src/clientes/**`** (regra ESLint `import/no-restricted-paths`),
mas a conversão Lead → Pessoa **tem** de reusar a engine de identidade/dedup da spec 005
(`ResolverOuCriarService`) — a dedup é um serviço único e auditável, jamais reimplementado.

Solução — **inversão de dependência via `core`**:

| Camada | Arquivo | Papel |
| --- | --- | --- |
| `core` | `src/core/identidade/porta-identidade.ts` | **só o contrato**: interface `PortaIdentidade` (`resolverOuCriar(dados, opts)`) + token DI `PORTA_IDENTIDADE` (`Symbol`). Zero lógica, zero import de `clientes`. Re-exportado no barrel do `core`. |
| `clientes` | `src/clientes/infra/porta-identidade.adapter.ts` | `PortaIdentidadeAdapter implements PortaIdentidade` — delega ao `ResolverOuCriarService` (que **não muda**). |
| `clientes` | `src/clientes/identidade-wiring.module.ts` | módulo **`@Global()`** que provê `{ provide: PORTA_IDENTIDADE, useExisting: PortaIdentidadeAdapter }` e o **exporta**. Importado pelo `AppModule`. Por ser global, o token fica injetável em qualquer módulo **sem import**. |
| `crm` | `LeadConversaoService` | injeta `@Inject(PORTA_IDENTIDADE)` — a interface do `core`, nunca o serviço concreto. |

`grep -R "clientes" backend/src/crm --include='*.ts'` → só comentários (0 `import`). ESLint
verde. **Este é o padrão que a spec 018** (pipeline do `financeiro`, etapa "resolver
pessoa") **vai herdar.**

> Nota: `pessoa_origem_ref.plataforma_origem` é o enum das 7 contas — um lead do CRM não é
> uma "conta de origem", então a conversão chama `resolverOuCriar` com `origem.refs: []`.
> O vínculo reverso vive em `lead.pessoa_id`.

---

## Domínio puro (`backend/src/crm/domain/lead/`, sem banco)

| Arquivo | O quê |
| --- | --- |
| `scoring.ts` | **`calcularScore(estado: EstadoScoreLead) → number`** — pura, determinística, **livre de _locale_** (idade/recência medidas em UTC via `agoraUtc()`). Soma de componentes (completude de contato, origem rastreável, estágio no funil, engajamento, recência, decaimento por idade sem engajamento) com tabela de pesos **congelada** `PESOS_SCORE_LEAD` (ajuste = PR revisável); `clamp(round(soma), 0, 100)`. **Nunca `score += delta`** (regra 8.2.2 da visão) — o valor materializado em `lead.score` é só _cache_ de leitura, reconstruível idêntico. |
| `normalizar-lead.ts` | normalização de borda (nome, origem-slug, e-mail `lowercase`+`trim`, telefone E.164 com `+55` na borda, documento só dígitos + **DV de CPF/CNPJ**, tags `lowercase`+espaço→`-`+dedupe). **Duplicação mínima e deliberada** da 005 (research §2 — o `core` ainda não expõe `normalizar`/DV; promover é um refactor transversal para spec futura). A fonte de verdade da dedup segue sendo a 005 na conversão. |
| `plano-conversao.ts` | `podeConverter(lead)` (só `ATIVO`; `DESCARTADO`→409; `CONVERTIDO`→no-op) + `montarDadosIdentidade(lead)` (mapeia a linha para o shape da `PortaIdentidade`). |
| `validar-valor-campo.ts` | `validarValorCampo(tipo, opcoes, valor)` (serialização canônica por tipo — `TEXTO`/`NUMERO`/`BOOLEANO`/`DATA`/`SELECAO`; vazio de `TEXTO` = remover) + `validarDefinicao` (`SELECAO` exige `opcoes`; demais tipos rejeitam `opcoes`). |
| `tipos.ts` | enums re-exportados do `@prisma/client` + `EstadoScoreLead`, `ResultadoConversao`, `CriarLeadEntrada`, `ChaveOrigemLead`, `EntradaAuditoriaLead`. |

Testes unitários (sem banco): `scoring.spec.ts` (determinismo 500×, base = 31, completar
sobe, clamp 0 e 100, matriz `TZ`), `normalizar-lead.spec.ts`, `plano-conversao.spec.ts`,
`validar-valor-campo.spec.ts`, e `clientes/infra/porta-identidade.adapter.spec.ts`.

---

## Persistência (Prisma — 6ª migração de negócio)

`20260904122426_crm_lead` — 4 tabelas + 3 enums (`LeadEstagio`, `LeadStatus`,
`CampoPersonalizadoTipo`):

- **`lead`** — `nome` obrigatório; `email`/`telefone`/`documento` opcionais (normalizados);
  `origem` + `id_externo` (id de origem **nunca PK**) + `utm_*`; `estagio` (funil
  pré-pipeline), `status` (`ATIVO|DESCARTADO|CONVERTIDO`); `responsavel_id` FK → `usuario`
  (004, `onDelete: Restrict`); `tags String[]`; `score Int` (**derivado**, _cache_,
  `[0,100]`) + `score_atualizado_em`; `pessoa_id` FK → `pessoa` (005) + `convertido_em`
  (preenchidos só na conversão). Índices: `(status, estagio)`, `(responsavel_id)`,
  `(origem)`, `(email)`, `(telefone)`, `(pessoa_id)` + **único parcial**
  `(origem, id_externo) WHERE id_externo IS NOT NULL` (idempotência da porta).
- **`campo_personalizado_lead`** (definição — CL-03) — `chave` slug único **imutável**,
  `rotulo`, `tipo`, `opcoes String[]` (não-vazio **sse** `SELECAO`), `obrigatorio`, `ativo`.
- **`valor_campo_lead`** — `(lead_id, definicao_id, valor)`, `@@unique(lead_id,
  definicao_id)`; `lead_id` `onDelete: Cascade`, `definicao_id` `onDelete: Restrict`.
- **`crm_lead_audit`** — forma canônica `RegistroAuditoria` do core (`AJUSTE_MANUAL`),
  **append-only**, **só delta real** (`PATCH`/`PUT` no-op → 0 linha). Estrutura idêntica a
  `crm_admin_audit`/`clientes_audit`/`ingestao_audit`. Definições de campo personalizado
  auditam em **`crm_admin_audit`** (tabela da 007), não aqui.

Sem seed de negócio.

---

## Aplicação (`backend/src/crm/application/lead/`)

- **`LeadConsultaService`** — o **escopo de visão** (US2): rotas de leitura são
  `@AutenticadoBasta()`; este serviço resolve `SujeitoRbacService.permissoesDe(req)` e monta
  o `where` do Prisma numa passada — `lead:ver_todos` → tudo; só `lead:ver_proprios` →
  `responsavelId = sujeito` (fila não atribuída invisível); nenhuma das duas →
  `ForbiddenException`. Filtros do query-string (`estagio`, `status`, `origem`,
  `responsavelId`, `q`, `campo:<chave>`) entram com **`AND`** — **nunca ampliam**. `obter`
  fora do escopo → **404**.
- **`LeadService`** — CRUD (`criar`, `atualizar`, `mudarEstagio/Status/Responsável`,
  `addTag`/`removerTag`). `criar` exige `nome` + (`email` | `telefone`) → **422** senão;
  devolve `leadsSemelhantes: [<ids>]` (leads `ATIVO` com mesmo contato) como aviso não
  bloqueante — **lead duplicado é permitido** (a dedup real é na conversão). `score`/
  `pessoaId` no corpo → **400** (o zod `.strict()` rejeita). Cada escrita → **1**
  `crm_lead_audit` com delta real (no-op → 0) + recálculo de score quando um insumo mudou.
- **`LeadScoreService`** — `recalcular` (idempotente — não escreve nem audita se o valor não
  muda; audita como `motivo: 'recalculo'`, distinguível de edição manual) e `recalcularLote`
  (paginado por `id` asc, retomável por cursor, idempotente).
- **`LeadConversaoService`** — `POST /crm/leads/:id/converter`: `podeConverter` →
  `resolverOuCriar` pela `PortaIdentidade` → grava `pessoa_id` + `status = CONVERTIDO` +
  `convertido_em` → 1 audit `converter`. **Idempotente**: lead já `CONVERTIDO` devolve o
  mesmo `pessoaId`, sem tocar `pessoa`, sem audit novo. **CL-01: arquiva + vincula** — a
  linha de `lead` permanece, some do filtro padrão (`status != CONVERTIDO`), nada apagado
  nem migrado.
- **`CampoPersonalizadoService`** — CRUD das **definições** sob
  `crm_admin:gerir_campos_lead`; `chave`/`tipo` imutáveis; `DELETE` de definição em uso →
  **409** (sugere `ativo=false`); auditado em `crm_admin_audit`.
- **`ValorCampoService`** — `PUT /crm/leads/:id/campos-personalizados` = **substituição
  total**: chave desconhecida/inativa → 422; tipo incompatível / fora de `opcoes` → 422;
  `obrigatorio` ausente → 422; chave omitida ou `null` → removida; delta por chave em
  `crm_lead_audit`.
- **`RegistrarLeadService`** — **porta in-process exportada do `CrmModule`** para a spec 035
  injetar. Idempotente por `(origem, id_externo)`. **Sem endpoint HTTP, sem webhook, sem
  chamada externa** nesta spec.

---

## HTTP (`/crm/leads/**` + `/crm/admin/campos-lead/**`)

| Rota | Marcador |
| --- | --- |
| `GET /crm/leads`, `GET /crm/leads/:id`, `.../campos-personalizados` (GET), `.../auditoria` | `@AutenticadoBasta()` + gate OU no serviço |
| `POST /crm/leads` | `lead:criar` |
| `PATCH /crm/leads/:id`, `.../tags` (POST/DELETE), `.../recalcular-score`, `recalcular-score` (lote), `.../campos-personalizados` (PUT) | `lead:editar` |
| `POST /crm/leads/:id/converter` | `lead:editar` **e** `pessoa:editar` (E, resolvido pelo `PermissionGuard`) |
| `GET/POST/PATCH/DELETE /crm/admin/campos-lead/**` | `crm_admin:gerir_campos_lead` |

**Sem `DELETE /crm/leads/:id`** — um lead sai de jogo por `status = DESCARTADO`
(pseudonimização por LGPD é a spec 047, via a `pessoa` vinculada). 401 ≠ 403 ≠ 404 (fora do
escopo de visão).

---

## RBAC (spec 004 estendida)

O catálogo (`src/auth/rbac/catalogo.ts`) ganha **1** permissão no recurso `crm_admin` da
007: **`crm_admin:gerir_campos_lead`**. As 4 `lead:{criar,editar,ver_todos,ver_proprios}`
**já existiam** desde a 004 e **não mudam**. O perfil `administrador` e a credencial de
serviço a concedem de graça (special-case do `SujeitoRbacService` + seed idempotente) —
**0 migração de dados, 0 seed novo**.

---

## Frontend (`frontend/src/leads/`)

- `shell/nav-items.ts` / `auth/RequirePermissao.tsx` ganham suporte a **"OU" de permissão**
  (`requerPermissao: string | string[]`; `<RequirePermissao anyOf={[...]}>`).
- Item **CRM · Leads** atrás de `lead:ver_todos` **ou** `lead:ver_proprios`.
- `LeadsPage` — lista com filtros (estágio/status/origem) + busca + coluna de **score**;
  "Novo lead" só com `lead:criar` (aviso de `leadsSemelhantes`).
- `LeadDetalhePage` — contato, UTM, score (+ **Recalcular** com `lead:editar`), tags,
  **campos personalizados** (form gerado das definições), timeline de auditoria, e
  **Converter em pessoa** só com `lead:editar` + `pessoa:editar` e lead `ATIVO`.
- 403 → banner no ponto único do `apiFetch`, **sem** deslogar (403 ≠ 401).

A UI de **gestão das definições** de campo personalizado (CRUD de `campo_personalizado_lead`
num painel) ficou adiada — os endpoints estão prontos e testados; entra numa spec de
polimento do CRM.

---

## Clarificações (com o dono do produto, 2026-09-04)

- **CL-01** — pós-conversão a linha de `lead` é **arquivada + vinculada** (`status =
  CONVERTIDO` + `pessoa_id`), **não** migrada fisicamente. Some das listas operacionais,
  permanece para histórico e atribuição de Marketing.
- **CL-02** — o `crm` consome a engine da 005 por **inversão de dependência**: interface
  `PortaIdentidade` + token `PORTA_IDENTIDADE` no `core`, adaptador + wiring `@Global()` na
  005. Conversão síncrona e transacional.
- **CL-03** — campos personalizados com **esquema administrável** (tabela de definições +
  tabela de valores validados por tipo), não `jsonb` livre.

---

## Contagem

**0 dep nova** · **1 migração** (`20260904122426_crm_lead`) · **~14 endpoints** ·
**+1 permissão** de catálogo · **0 porta nova** · **0 `.env` nova**. Backend: **+23 testes
unitários** (319 no total) e **+18 e2e** (`crm-lead.e2e-spec.ts`; regressão 003–007 verde,
`/health` = 11). Frontend: **+6 testes** (56 no total).
