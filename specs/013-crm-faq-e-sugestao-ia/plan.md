# Implementation Plan: CRM · FAQ e Sugestão de IA

**Branch**: `013-crm-faq-e-sugestao-ia` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-crm-faq-e-sugestao-ia/spec.md`

## Summary

Sétima fatia da Fase 1 (CRM), visão Parte 8.3/8.5/10.6. Adiciona uma base de FAQ versionada
(`faq_item` + `faq_item_versao`) e um mecanismo de sugestão de IA (`sugestao_ia`) que roda
**dentro** de um atendimento já existente (spec 012), nunca fora dele — nunca envia mensagem
nem grava campo sozinho (governança 10.6, etapa 1: sempre confirmação humana). Sem vínculo
com produto ou campanha nesta versão (CL-01 — nenhuma das duas entidades existe ainda neste
ponto do roadmap). Estende o bounded context `clientes` (spec 005) com
`campo_personalizado_pessoa`/`valor_campo_pessoa`, espelhando exatamente
`campo_personalizado_lead`/`valor_campo_lead` (spec 008), para que a sugestão de campo
personalizado tenha destino tanto em `lead` quanto em `pessoa` já convertida (CL-02). O
provedor de IA é a API da Anthropic (Claude), chamada HTTP direta atrás de uma porta própria
(`SugestaoIaClient`, mesmo padrão do `GraphApiClient` da 011); a credencial reaproveita a
tabela `integracao` já existente e ociosa desde a 007 (`tipo=CONEXAO_INTERNA`,
`alvo=EXTERNO`) — **0 tabela nova de credencial, 0 chave `.env` nova** (CL-03). Escrita em
`pessoa` a partir do `crm` (aceitar sugestão de campo personalizado) respeita o Princípio VI
por inversão de dependência: uma nova porta `PortaCampoPersonalizadoPessoa` no `core`,
implementada em `clientes/infra`, cablada pelo mesmo módulo `@Global()` que já expõe
`PortaIdentidade` (spec 008) — `crm` continua sem importar `src/clientes/**`.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24 LTS, nos dois workspaces.

**Primary Dependencies**:
- Backend: **nenhuma nova**. NestJS 11, Prisma `^6` + `@prisma/client` (5 models novos — 3 em
  `crm`, 2 em `clientes` —, 2 enums novos, +1 coluna em `RespostaAtendimento`). `EntidadeId`/
  `uuidv7()`, `agoraUtc()` do `core`. Reaproveita diretamente (mesmo bounded context `crm`):
  `AtendimentoConsultaService`/`exigirNoEscopo` (012 — escopo de leitura), `RespostaService`
  (012, editado — liga uma resposta enviada à sugestão que a originou),
  `InteracaoRepository` (009 — a mensagem de origem de toda sugestão é uma `Interacao` já
  registrada), `IntegracaoRepository`/`cifrar`/`decifrar`/`cifraIntegracaoKey` (007 — guarda
  a credencial da Anthropic na tabela `integracao` já existente, primeiro consumidor real
  dela), `CampoPersonalizadoLead`/`ValorCampoLead`/serviço de valor (008 — destino de campo
  personalizado quando o atendimento é de um `lead`). Nova porta no `core`
  (`PortaCampoPersonalizadoPessoa`) implementada em `clientes/infra` — mesmo padrão de
  inversão de dependência do `PortaIdentidade` (008); o módulo de wiring existente
  (`identidade-wiring.module.ts`) é renomeado para `ClientesWiringModule` e passa a expor as
  duas portas. **Nenhum SDK de IA novo** — chamada HTTP direta via `fetch` nativo do Node 24
  (mesmo padrão do `MetaGraphApiClient`, spec 011).
- Frontend: **nenhuma nova**. React 19, `react-router` 7, `@tanstack/react-query` 5,
  `apiFetch`, `usePermissoesEfetivas` + `RequirePermissao`.

**Storage**: **PostgreSQL 16 via Prisma** — 11ª migração de negócio (após `_rbac`,
`_clientes` ×2, `_ingestao`, `_crm_admin` ×2, `_crm_lead`, `_crm_interacao`, `_crm_pipeline`,
`_crm_whatsapp`, `_crm_atendimento`). 5 tabelas novas: `faq_item`, `faq_item_versao`,
`sugestao_ia` (bounded context `crm`), `campo_personalizado_pessoa`, `valor_campo_pessoa`
(bounded context `clientes`, espelhando `campo_personalizado_lead`/`valor_campo_lead` campo a
campo) + 2 enums (`SugestaoIaTipo`, `SugestaoIaStatus`). 1 `ALTER TABLE`:
`resposta_atendimento` ganha `sugestao_ia_id` (nullable, `@unique`, FK) — liga uma resposta
realmente enviada à sugestão que a originou (FR-012), sem reabrir o contrato de
append-only já validado pela 012. **Nenhuma credencial nova em tabela própria** — a chave da
API da Anthropic é uma linha em `integracao` (`tipo=CONEXAO_INTERNA`, `alvo=EXTERNO`,
`nome` convencionado), cifrada com a mesma `CRM_INTEGRACAO_CIFRA_KEY` da 007. `CHECK`
de exclusividade do alvo de `sugestao_ia` (`tipo='CAMPO_PERSONALIZADO'` → exatamente um de
`campo_personalizado_lead_id`/`campo_personalizado_pessoa_id`; `tipo='RESPOSTA'` → nenhum
dos dois) via SQL bruto na própria migração (mesmo padrão 007/009/010/012, Prisma não modela
`CHECK`).

**Testing**:
- Backend unit (`jest`, sem banco), `backend/src/crm/domain/sugestao-ia/`:
  - `prompt.spec.ts` — `montarPrompt(mensagem, faqAtiva, definicoesCampo)`: inclui só FAQ
    ativa; mensagem vazia/definições vazias não quebram a montagem; determinístico (mesma
    entrada → mesmo prompt, sem timestamp/aleatoriedade embutidos).
  - `parse-resposta.spec.ts` — `interpretarRespostaIa(bruto)`: JSON válido no formato
    esperado → lista tipada de sugestões; JSON malformado, campo faltando, tipo desconhecido,
    array vazio → `{ sugestoes: [], problema }` (nunca lança, nunca finge sucesso — FR-014);
    múltiplas perguntas no `bruto` → múltiplas sugestões `tipo: RESPOSTA` distintas.
  - `estado.spec.ts` — `podeDecidir(status)`/`podeAvaliarUtilidade(status)`: só `PENDENTE`
    decide; só `ACEITA`\|`REJEITADA` avalia utilidade; `SUBSTITUIDA` não decide nem avalia.
  - `backend/src/clientes/domain/` ganha só testes de integração via serviço (sem lógica
    pura nova — `campo_personalizado_pessoa` é CRUD espelhado de `campo_personalizado_lead`,
    já coberto por unit tests da 008 no mesmo formato).
- Backend e2e (`jest` e2e, Postgres real, schema isolado; `setup-db.ts`),
  `test/crm-faq-sugestao-ia.e2e-spec.ts`:
  - migração cria as 5 tabelas + 2 enums + a coluna nova em `resposta_atendimento`; `CHECK`
    de exclusividade do alvo recusa 0 ou 2 preenchidos com `tipo=CAMPO_PERSONALIZADO`, e
    recusa qualquer um preenchido com `tipo=RESPOSTA`.
  - **FAQ**: `POST /crm/admin/faq` cria; `PATCH` edita pergunta/resposta e gera uma
    `FaqItemVersao`; `GET /crm/admin/faq/:id/versoes` lista em ordem; `GET /crm/faq` só
    retorna itens `ativo=true`; sem `crm_admin:gerir_faq` → 403 na escrita; catálogo
    `@AutenticadoBasta()` acessível a qualquer sujeito autenticado.
  - **Geração de sugestão**: `POST /crm/atendimentos/:id/sugestoes` com um `SugestaoIaClient`
    dublê (0 chamada de rede real) devolvendo 2 sugestões de resposta + 1 de campo
    personalizado → cria 3 linhas `PENDENTE`; pedir de novo para a mesma `interacaoId`
    substitui (`SUBSTITUIDA`) as pendentes anteriores daquela mensagem (D-05); dublê que
    devolve erro/timeout → endpoint responde indicando ausência de sugestão, sem quebrar o
    atendimento (FR-014); `interacaoId` de outro atendimento ou `direcao=SAIDA` → 422.
  - **Decisão — resposta**: `POST .../sugestoes/:id/aceitar` marca `ACEITA` (não envia
    nada); `POST /crm/atendimentos/:id/responder` com `sugestaoId` da sugestão aceita marca
    `viaIa=true` automaticamente e grava `RespostaAtendimento.sugestaoIaId`; `sugestaoId` de
    uma sugestão ainda `PENDENTE`, já `REJEITADA` ou de outro atendimento → 409;
    `POST .../rejeitar` marca `REJEITADA`, sem nenhum outro efeito.
  - **Decisão — campo personalizado**: aceitar uma sugestão `CAMPO_PERSONALIZADO` cujo
    atendimento é de um `lead` grava em `valor_campo_lead` (reaproveita o serviço da 008);
    cujo atendimento é de uma `pessoa` grava em `valor_campo_pessoa` via a porta nova; corpo
    com `conteudoFinal` sobrescreve o valor antes de gravar; rejeitar não toca em nenhum
    cadastro; sem `lead:editar`/`pessoa:editar` (conforme a âncora) → 403 mesmo tendo
    `atendimento:atender`.
  - **Feedback**: `POST .../feedback` só aceita depois de decidida (`ACEITA`\|`REJEITADA`);
    em `PENDENTE`/`SUBSTITUIDA` → 409; grava `util` + quem/quando.
  - **`campo_personalizado_pessoa`**: `POST /clientes/admin/campos-personalizados` cria
    definição; `PUT /pessoas/:id/campos-personalizados` substitui valores (mesmo contrato de
    `PUT /crm/leads/:id/campos-personalizados` da 008); `GET /pessoas/:id/campos-
    personalizados` lista; chave duplicada → 409; sem `pessoa:gerir_campos_personalizados` →
    403 na escrita da definição.
  - **Guard/escopo**: `atendimento:atender` obrigatório para gerar/decidir/avaliar sugestão;
    leitura de sugestões pelo mesmo escopo `ver_todos`\|`ver_proprios` do atendimento (012);
    `crm_admin:gerir_faq` protege escrita de FAQ; `pessoa:gerir_campos_personalizados`
    protege definição de campo de pessoa; sem token → 401.
  - **Catálogo/efetivas**: `GET /admin/rbac/permissoes` inclui as 2 novas
    (`crm_admin:gerir_faq`, `pessoa:gerir_campos_personalizados`).
  - **Regressão**: suíte 003–012 + `/health` (11 contextos) verdes.
- Frontend (`vitest` + Testing Library, jsdom): editor de FAQ (lista + criar/editar +
  histórico de versões) em CRM · Administração; painel de sugestões dentro da conversa do
  Chat ao Vivo (012) — pedir sugestão, aceitar/rejeitar cada uma independentemente, campo de
  feedback pós-decisão, aceitar resposta pré-preenche o composer sem enviar sozinho, aceitar
  campo personalizado mostra o valor final editável antes de confirmar.

**Target Platform**: backend HTTP NestJS em `:3001`; painel Vite em `:5174`; Postgres dev em
`:55432`. Dev Linux; CI Linux (GitHub Actions). Chamada real à API da Anthropic acontece só
em produção/manual — testes e CI usam sempre o `SugestaoIaClient` dublê (0 chamada de rede
real, 0 custo, 0 flakiness por latência externa).

**Performance Goals**: sem meta nova além de SC-001 (sugestão em poucos segundos) — atendido
por construção: uma única chamada síncrona por pedido de sugestão, sobre no máximo dezenas de
itens de FAQ ativos (escala pequena, mesmo racional de volume da 012).

**Constraints**:
- **Uma porta nova no `core`**: `PortaCampoPersonalizadoPessoa` — única exceção declarada
  adicional ao Princípio VI, mesmo raciocínio e mesmo módulo de wiring da `PortaIdentidade`
  (008). Nenhuma outra porta nova.
- **Contextos delimitados** (Princípio VI): `crm` continua sem importar `clientes`; FKs de
  `SugestaoIa` para `Interacao`/`FaqItem`/`CampoPersonalizadoLead`/`Usuario` são só
  `schema.prisma` (mesmo precedente 008–012) — só a escrita em `pessoa` cruza a fronteira, e
  só por porta.
- **Log de eventos + projeções** (Princípio IV): não há evento cru externo nesta spec —
  `sugestao_ia` nasce de uma ação explícita do atendente sobre uma `Interacao` já registrada
  (que por sua vez já passou pela ingestão de eventos das specs 009/011/012, quando
  aplicável). A chamada à IA em si não é persistida como evento cru — é uma chamada síncrona
  de borda, com o **resultado interpretado** (nunca o texto bruto do provedor) persistido em
  `sugestao_ia`.
- **Agregados derivados** (Princípio V): nenhum agregado novo nesta spec além do que a 012 já
  deriva.
- **Governança de decisões automatizadas (10.6), etapa 1 — não-negociável**: nenhuma
  `sugestao_ia` grava dado ou envia mensagem sem uma ação humana explícita e separada —
  reforçado por `CHECK`/serviço, não só por convenção de UI (ver `contracts/sugestao-ia.md`).
- **Superfície de escrita mínima** (Princípio VIII): endpoints cobrem exatamente FAQ (CRUD +
  histórico) + ciclo de sugestão (gerar/aceitar/rejeitar/feedback) + campo personalizado de
  pessoa (mesmo contrato já existente para lead) — sem antecipar Workflow (014) nem Disparos
  (015). Nenhuma sincronização automática com a API da Anthropic — toda chamada é sob demanda,
  disparada por uma ação humana dentro de um atendimento.
- **RBAC 004**: cada endpoint autenticado sob `@RequerPermissao`/`@AutenticadoBasta`; **+2**
  permissões (`crm_admin:gerir_faq`, `pessoa:gerir_campos_personalizados`); decisão sobre
  campo personalizado de `pessoa` verifica `pessoa:editar` **dinamicamente** no serviço (não
  só via decorator — a mesma sugestão pode ter destino lead ou pessoa, resolvido em runtime),
  mesmo padrão já usado por `LeadConsultaService.exigirNoEscopo`; 403 ≠ 401.
- Regra ESLint (002): sem `process.env` fora de `config/`/`core/`.

**Scale/Scope**: ~26 arquivos novos no backend (`src/crm/{domain,application,infra,dto}/
{faq,sugestao-ia}/**`, `faq.controller.ts`, `sugestao-ia` endpoints dentro de
`atendimento.controller.ts`, `src/clientes/{application,infra,dto}/campo-personalizado-
pessoa.*`, `campo-personalizado-pessoa.controller.ts`, `src/core/campo-personalizado-pessoa/
porta-campo-personalizado-pessoa.ts`, `prisma/migrations/<ts>_crm_faq_sugestao_ia/`, `test/
crm-faq-sugestao-ia.e2e-spec.ts`), ~7 arquivos editados (`schema.prisma`,
`src/auth/rbac/catalogo.ts`, `crm.module.ts`, `clientes.module.ts`, `core/core.module.ts`,
`identidade-wiring.module.ts` → `clientes-wiring.module.ts`, `atendimento.controller.ts`/
`resposta.service.ts`/`atendimento.schema.ts` editados para o campo `sugestaoId`), ~8 no
frontend (`src/faq/**`, `src/atendimento/PainelSugestoes.tsx` + edição de
`ConversaAtendimento.tsx`, `src/clientes/CamposPersonalizadosPessoaTab.tsx` ou equivalente),
**0 dep nova**, **1 migração**, **~24 endpoints** (FAQ ~5, sugestão ~5, campo personalizado
de pessoa ~5, mais o `sugestaoId` opcional no endpoint de resposta já existente), **0
endpoint público novo**, **0 chave `.env` nova** (credencial via `integracao` já existente),
1 doc novo, 3 docs atualizados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.0).

- [x] **I. Domínio, não origem**: as 5 tabelas nascem com **ID surrogate UUID v7** gerado na
      app. Nenhum identificador de origem externa envolvido — a Anthropic não tem conceito de
      "id de origem" aqui (é uma chamada síncrona de request/response, não um evento com
      identidade própria a deduplicar).
- [x] **II. Clarificar antes de assumir**: as 3 decisões que bloqueavam esta spec (vínculo de
      FAQ com produto/campanha inexistentes; destino do campo personalizado sugerido;
      provedor de IA) foram resolvidas com o dono do produto **antes** da escrita do
      `spec.md` (2026-09-09) — CL-01/CL-02/CL-03. **Zero `NEEDS CLARIFICATION`** remanescente.
- [x] **III. Bordas finas, núcleo canônico**: **N/A direto** — não é um adaptador de ingestão
      financeira; nenhuma regra do `crm`/`clientes` conhece "Guru"/"Asaas"/etc. O
      `SugestaoIaClient` é a única borda externa desta spec, isolado atrás de uma interface
      (mesmo padrão do `GraphApiClient`, 011) — nenhuma regra de negócio depende do formato
      bruto da resposta da Anthropic; `interpretarRespostaIa` traduz na borda, uma vez.
- [x] **IV. Log de eventos + projeções**: nenhum evento cru novo. `sugestao_ia` é o resultado
      **interpretado** de uma chamada síncrona sobre uma `Interacao` já existente — não um
      evento a ser reprocessado depois. A escrita efetiva (envio de resposta, gravação de
      campo personalizado) sempre passa por um serviço já existente (`RespostaService`/
      `ValorCampoLeadService`) ou pela porta nova, nunca por `commit()` de remendo direto.
- [x] **V. Agregados derivados**: N/A direto — nenhum valor agregado nesta spec (sem
      dinheiro, sem contador). `podeDecidir`/`podeAvaliarUtilidade` são funções puras sobre o
      estado atual, não contadores.
- [x] **VI. Contextos delimitados — observar, não escrever**: `crm` continua **sem**
      importar `clientes`. A única escrita cruzando a fronteira (gravar valor de campo
      personalizado de `pessoa` a partir do `crm`) passa pela porta nova
      `PortaCampoPersonalizadoPessoa`, exportada por um módulo `@Global()` que vive **dentro**
      de `src/clientes/` — mesmo padrão já aprovado para `PortaIdentidade` (008). Nenhum
      import direto de `src/clientes/**` em `src/crm/**` (verificado pelo mesmo ESLint
      `import/no-restricted-paths` + `grep` no e2e da 008).
- [x] **VII. Curadoria vs derivação**: `faq_item.pergunta`/`resposta` são estado **curado**
      (edição humana, versionada); `sugestao_ia` é **saída não-autoritativa** — nunca se
      sobrescreve a si mesma, e sua decisão (`aceita`/`rejeitada`) nunca é auto-revertida
      (só uma nova sugestão pode `SUBSTITUIR` uma pendente da mesma mensagem — D-05; uma
      decisão já tomada é permanente e consultável).
- [x] **VIII. Superfície de escrita mínima**: ~24 endpoints cobrem exatamente FAQ +
      sugestão + campo personalizado de pessoa desta spec — Workflow (014) e Disparos (015)
      ficam de fora. **Nenhuma sincronização automática com API externa** — toda chamada à
      Anthropic é síncrona, sob demanda, disparada por uma ação humana (nunca um job/cron).
- [x] **Padrões Transversais**:
      - **IDs**: UUID v7 na app para as 5 tabelas.
      - **Dinheiro**: N/A (sem valor monetário nesta spec).
      - **Tempo**: `@db.Timestamptz(6)` em todos os timestamps novos.
      - **Status**: `SugestaoIaStatus` é um eixo próprio da sugestão, sem sobrepor
        `StatusTransacaoCanonico`/`StatusContratoCanonico` (Financeiro, ainda inexistente)
        nem `AtendimentoStatus` (012).
      - **Idempotência**: pedir uma nova sugestão para a mesma `interacaoId` é seguro —
        substitui (`SUBSTITUIDA`) qualquer pendente anterior da mesma mensagem em vez de
        acumular duplicatas (D-05); falha do provedor de IA nunca deixa o atendimento
        bloqueado (D-06, FR-014).
      - **Auditoria**: `faq_item_versao` é histórico de 1ª classe (mesmo raciocínio de
        `oportunidade_movimentacao`/`resposta_atendimento`); `sugestao_ia` já é, por
        natureza, um registro append-only de decisão (`decididoPorId`/`decididoEm`,
        `utilRegistradoPorId`/`utilRegistradoEm`) — sem precisar de `crm_admin_audit`.
      - **Erros**: validação zod → 422; sem permissão → 403; sem token → 401; FAQ/sugestão/
        campo personalizado inexistente ou fora de escopo → 404; decidir uma sugestão já
        decidida, ou `sugestaoId` inválido no `responder`, ou avaliar utilidade antes de
        decidir → 409.
      - **Config/segredos**: nenhuma chave `.env` nova — credencial da Anthropic é uma linha
        cifrada em `integracao` (007), mesma `CRM_INTEGRACAO_CIFRA_KEY`.
      - **Multi-conta**: N/A.
      - **Dependência nova**: nenhuma.

**Resultado do gate: PASS.** Nenhuma violação. **Complexity Tracking**: a única peça
"não-óbvia" é a 2ª porta de inversão de dependência do projeto
(`PortaCampoPersonalizadoPessoa`) — justificada em `research.md` D-R3, mesmo precedente e
mesmo módulo de wiring já aprovado para `PortaIdentidade` (008); não é uma violação da
constituição.

*Re-check pós-Phase 1: **PASS** — `data-model.md` confirma que `RespostaAtendimento` ganha só
uma coluna nullable (`sugestaoIaId`) sem alterar seu contrato append-only (012);
`contracts/sugestao-ia.md` confirma que nenhuma rota envia mensagem ou grava campo
personalizado sem uma ação humana explícita e separada; `CONTEXT_MODULES` segue 11.*

## Project Structure

### Documentation (this feature)

```text
specs/013-crm-faq-e-sugestao-ia/
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── faq.md
│   ├── sugestao-ia.md
│   └── campo-personalizado-pessoa.md
└── tasks.md                # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── crm/
│   │   ├── domain/
│   │   │   └── sugestao-ia/
│   │   │       ├── prompt.ts               # montarPrompt(...) pura
│   │   │       ├── parse-resposta.ts       # interpretarRespostaIa(...) pura
│   │   │       └── estado.ts               # podeDecidir/podeAvaliarUtilidade puras
│   │   ├── application/
│   │   │   ├── faq/
│   │   │   │   └── faq.service.ts          # CRUD + versionamento
│   │   │   ├── sugestao-ia/
│   │   │   │   ├── anthropic-sugestao-ia.client.ts  # SugestaoIaClient real (fetch)
│   │   │   │   ├── gerar-sugestao.service.ts
│   │   │   │   └── decidir-sugestao.service.ts      # aceitar/rejeitar/feedback
│   │   │   └── atendimento/resposta.service.ts      # editado — liga sugestaoId
│   │   ├── infra/
│   │   │   ├── faq/  (repos Prisma: faq_item, faq_item_versao)
│   │   │   └── sugestao-ia/  (repo Prisma: sugestao_ia)
│   │   ├── dto/
│   │   │   ├── faq/  (zod schemas)
│   │   │   └── sugestao-ia/  (zod schemas)
│   │   ├── faq.controller.ts                 # /crm/faq, /crm/admin/faq/**
│   │   ├── atendimento.controller.ts          # editado — /crm/atendimentos/:id/sugestoes/**
│   │   └── crm.module.ts                     # editado — registra os novos providers/controllers
│   ├── clientes/
│   │   ├── application/
│   │   │   └── campo-personalizado-pessoa.service.ts
│   │   ├── infra/
│   │   │   ├── campo-personalizado-pessoa.repository.ts
│   │   │   └── porta-campo-personalizado-pessoa.adapter.ts
│   │   ├── dto/campo-personalizado-pessoa.schema.ts
│   │   ├── campo-personalizado-pessoa.controller.ts
│   │   └── clientes.module.ts                # editado
│   ├── core/
│   │   └── campo-personalizado-pessoa/
│   │       └── porta-campo-personalizado-pessoa.ts   # interface + token DI
│   ├── clientes-wiring.module.ts             # renomeado de identidade-wiring.module.ts —
│   │                                          # passa a expor PORTA_IDENTIDADE (008) +
│   │                                          # PORTA_CAMPO_PERSONALIZADO_PESSOA (013)
│   └── auth/rbac/catalogo.ts                 # editado — +2 permissões
├── prisma/
│   ├── schema.prisma                         # editado — 5 models + 2 enums + 1 coluna
│   └── migrations/<ts>_crm_faq_sugestao_ia/migration.sql
└── test/
    └── crm-faq-sugestao-ia.e2e-spec.ts

frontend/
├── src/
│   ├── faq/
│   │   ├── FaqAdminPage.tsx        # lista + criar/editar + histórico de versões
│   │   └── *.test.tsx
│   ├── atendimento/
│   │   ├── PainelSugestoes.tsx     # novo — dentro da conversa (012)
│   │   └── ConversaAtendimento.tsx # editado — monta o painel + composer pré-preenchido
│   ├── clientes/ (ou pessoas/)
│   │   └── CamposPersonalizadosPessoaTab.tsx  # espelha a aba já existente em Leads (008)
│   ├── nav-items.ts                 # editado — item FAQ em CRM · Administração
│   └── router.tsx                   # editado — rotas /crm/admin/faq
```

**Structure Decision**: Web application (Option 2) — já em uso desde a 001. FAQ e sugestão de
IA ficam dentro do bounded context `crm` já existente (`backend/src/crm/`), novas pastas de
domínio `faq/`/`sugestao-ia/` ao lado de `atendimento`/`expediente`/`whatsapp`/`lead`/
`pipeline`/`interacao`; campo personalizado de pessoa fica dentro de `clientes`
(`backend/src/clientes/`), espelhando a estrutura de `lead` na 008 mas mais plana (mesmo
padrão já usado pelos outros arquivos de `clientes/`, que não têm subpastas por feature).

## Complexity Tracking

Nenhuma violação da constituição. Nenhuma entrada.
