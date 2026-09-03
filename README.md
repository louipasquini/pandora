# Projeto Pandora

Sistema de dados da **Amor em Nutrir (AEN)** — empresa de educação e infoprodutos para
nutricionistas. O Pandora consolida, **sem duplicidade**, num único PostgreSQL, tudo o que
acontece nas vendas da AEN, e serve esses dados para o time por uma API interna e um painel.

Este repositório é a **reconstrução** do sistema (v2). A v1 foi construída em 11 features
incrementais, funciona e está validada contra produção, mas foi modelada reativamente. A v2
reparte o domínio em contextos delimitados e fixa as regras que não podem mudar.

## O problema que ele resolve

A AEN vende os mesmos produtos por **4 plataformas de checkout/pagamento** — TMB Educação,
Asaas, Guru e Hotmart — divididas em **7 contas de origem** (`TMB`, `Asaas PRD/SVC`,
`Guru PRD/SVC`, `Hotmart PRD/SVC`), cada uma com seu modelo de dados. Uma única venda pode
aparecer em duas plataformas (a Guru terceiriza cobrança para a Asaas) e algumas vendas
Hotmart são feitas como afiliada de terceiros. Sem tratamento, isso vira contagem dupla de
receita e clientes/contratos fantasma.

O Pandora normaliza tudo para um modelo canônico e mantém quatro visões consistentes:

1. **Transações** — todo pagamento, venda, reembolso e chargeback das 7 contas.
2. **Clientes** — pessoa física/jurídica compradora, deduplicada entre plataformas.
3. **Catálogo** — Produto → Oferta, curado internamente.
4. **Contratos** — o vínculo cliente↔produto com estado de acesso, valor e histórico.

## Frentes do projeto

| Frente | O que faz |
| --- | --- |
| **Financeiro** | Ingestão das 7 contas, ledger canônico, reconciliação, receita por moeda. Base já existente, sendo reconstruída. |
| **CRM** | WhatsApp (chat + disparos), pipeline de vendas de alto ticket, automações (Workflow), FAQ com apoio de IA, dashboard comercial. |
| **Marketing** | "Git do marketing": lançamentos e perpétuo versionados de forma imutável, diff visual campo a campo, notificação ao Slack na publicação. |
| **Central de Clientes** | Read model (BFF) **e** portal que a própria aluna acessa: LGPD, preferências de comunicação, histórico de contratos e economia, recomendações. |

> **Ordem de construção acordada:** CRM → Financeiro → Marketing → Central de Clientes.

## Princípios de arquitetura

Detalhe completo em [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

1. **Modelar o domínio, não a origem.** ID surrogate opaco (UUID v7) em toda entidade;
   identificadores de plataforma vão para tabelas de alias, nunca como chave primária.
2. **Clarificar antes de assumir (não-negociável).** Toda dúvida de negócio vai ao dono do
   produto antes de virar código.
3. **Bordas finas, núcleo canônico.** Cada integração converte para/de um modelo canônico;
   nenhuma regra de negócio conhece "Guru" ou "Asaas".
4. **Ingestão como log de eventos + projeções.** O evento cru imutável é a fonte de verdade;
   tudo o mais é derivado e reconstruível. Reprocessar é sempre seguro.
5. **Tudo que é agregado é derivado.** Receita, valor recebido, estado de contrato e toda
   métrica são funções sobre eventos, nunca contadores incrementais.
6. **Contextos delimitados.** Comunicação por eventos ou API interna; um contexto observa o
   outro, nunca escreve no banco dele.
7. **Curadoria e derivação nunca se sobrescrevem.** Campo curado e campo derivado são
   colunas diferentes; a leitura decide a precedência.
8. **Superfície de escrita mínima.** Poucos recursos aceitam escrita; nenhuma sincronização
   automática com API externa — só sob demanda, com confirmação.

### Padrões transversais

- **Dinheiro:** inteiro com escala × 10000, sempre com moeda; `float` proibido; nunca soma
  moedas diferentes.
- **Tempo:** `timestamptz` em UTC em todo lugar.
- **Status:** um enum canônico rico; "libera acesso?" e "conta como receita?" são funções
  puras dele; status desconhecido vai para fila de revisão.
- **LGPD:** exclusão de pessoa é pseudonimização — os agregados financeiros permanecem
  íntegros sem reter PII.

## Stack

- **Backend:** Node.js · TypeScript · NestJS · Prisma · PostgreSQL
- **Frontend:** React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query · React Router
- **Auth:** um único nível de acesso de serviço (`POST /auth/token` → JWT)

O backend da v1 era Python/FastAPI; a v2 migra para Node.js/TypeScript (TS ponta a ponta com
o frontend; os módulos do NestJS mapeiam os contextos). O código e os testes da v1 não são
reaproveitados — a validação vem da re-ingestão do histórico real das 7 contas.

## Estrutura do repositório

Monorepo **npm workspaces** (`backend`, `frontend`), Node 24, um `package-lock.json` na raiz.

```
package.json            workspaces + scripts agregados (lint, typecheck, build, test)
docker-compose.yml      Postgres 16 de desenvolvimento (host :55432)
.env.example            todas as variáveis (runtime, banco, auth, 7 contas de origem)
.github/workflows/ci.yml  install → lint → typecheck → build → test (unit + e2e c/ Postgres real)

backend/   NestJS 11 + Prisma 6 — um módulo por bounded context
  src/
    core/        primitivas canônicas (barrel: core.module.ts)
      ids/         EntidadeId (UUID v7), uuidv7()
      dinheiro/    Dinheiro (bigint ×10000), Moeda (ISO 4217), ratear/ratearPorPesos
      tempo/       parseInstante (borda tolerante, livre de locale), agoraUtc
      status/      StatusTransacaoCanonico/StatusContratoCanonico + liberaAcesso/contaComoReceita
      auditoria/   EntidadeAuditavel, RegistroAuditoria + montarRegistroAuditoria
      config/      contrato tipado de config (re-export de config/env.schema)
      plataforma-origem.enum.ts   as 7 contas
    config/      env.schema.ts (zod) — config tipada e validada no boot
    prisma/      PrismaService / PrismaModule
    health/      GET /health (composição + banco)
    ingestao/ financeiro/ catalogo/ contratos/ clientes/ crm/ marketing/ central/
                 um módulo vazio por contexto (domain/ application/ infra/)
    api/ admin/  módulos de borda (routers finos; sync/imports/curadoria)
  prisma/        schema.prisma (RBAC: usuario/perfil/... — spec 004) + migrações + seed.ts
  test/          harness e2e contra Postgres real (schema isolado; migrate + seed por execução)

frontend/  Vite 6 + React 19 + Tailwind v4 + TanStack Query + React Router 7
  src/
    theme/       tokens.css — ponto único das cores da marca + Inter
    shell/       AppShell (header + nav filtrada por permissão + conteúdo roteável)
    app/         router + query client
    auth/        AuthProvider, apiFetch (401 + 403), RequirePermissao, usePermissoesEfetivas
    admin/       Administração — abas Perfis e Usuários (spec 004)
    pages/       telas (login + placeholders)

docs/          documentação por spec (ver docs/001-bootstrap-projeto.md)
specs/         uma pasta por feature: spec.md, plan.md, tasks.md, contracts/
.specify/      constituição, templates e workflow do Spec Kit
```

## Como rodar

Pré-requisitos: **Node.js 24** (`nvm use` — há `.nvmrc`), **Docker + Docker Compose**
(ou um PostgreSQL 16 acessível), `git`.

```bash
# 1. Instalar (raiz — npm workspaces instala backend e frontend)
npm ci        # ou: npm install
#    Ambiente que bloqueia postinstall? rode `npm approve-scripts --all` e reinstale.

# 2. Configuração
cp .env.example .env
#    edite só se for usar um Postgres próprio (troque DATABASE_URL / TEST_DATABASE_URL)
#    OBRIGATÓRIAS desde a spec 003 (o boot aborta se faltarem, em qualquer NODE_ENV):
#    SERVICE_JWT_SECRET (≥32), SERVICE_CLIENT_ID, SERVICE_CLIENT_SECRET (≥16).
#    O .env.example já traz placeholders válidos.

# 3. Subir o Postgres de desenvolvimento (porta host 55432)
npm run db:up
#    sem Docker: aponte DATABASE_URL/TEST_DATABASE_URL para seu Postgres e crie os
#    bancos `pandora` e `pandora_test`

# 4. Aplicar as migrações e semear o RBAC (spec 004 — 1ª migração de negócio)
npm run prisma:migrate:deploy --workspace backend
npm run prisma:seed --workspace backend      # cria o perfil de sistema "Administrador" (idempotente)
#    em dev, `npm run prisma:migrate:dev --workspace backend` já roda o seed no fim

# 5. Subir backend (porta 3001) e frontend (porta 5174) — dois terminais
npm run start:dev --workspace backend
npm run dev --workspace frontend

# 6. Verificar
curl http://localhost:3001/health          # {"status":"ok","db":"up","contexts":[... 11 ...]}
#    abrir http://localhost:5174            # cai em /login — entre com SERVICE_CLIENT_ID/SECRET
#    token de serviço fora do painel:
curl -sX POST http://localhost:3001/auth/token \
  -H 'content-type: application/json' \
  -d '{"client_id":"pandora-panel","client_secret":"<SERVICE_CLIENT_SECRET>"}'
#    → {"access_token":"<jwt>","token_type":"Bearer","expires_in":43200}
#    use em Authorization: Bearer <jwt> nas rotas protegidas
#    RBAC (spec 004): a API nega por omissão — toda rota autenticada precisa de
#    @RequerPermissao(...) ou @AutenticadoBasta(); a credencial de serviço resolve
#    para o perfil "Administrador" (todas as permissões). Painel: menu "Administração".

# 7. Qualidade e testes
npm run lint && npm run typecheck && npm run build
npm test                                    # unitários (backend + frontend)
npm run test:e2e                             # e2e do backend contra Postgres real
```

Portas (todas configuráveis por `.env`, nenhuma fixa): backend `PORT=3001`, frontend
`VITE_PORT=5174`, Postgres dev host `55432`. Detalhe e mapa contexto→módulo em
[`docs/001-bootstrap-projeto.md`](docs/001-bootstrap-projeto.md).

## Fluxo de desenvolvimento

O projeto segue o processo **Spec Kit**:

```
constitution  →  specify  →  clarify  →  plan  →  tasks  →  implement
```

Cada feature vive em `specs/<###-nome>/`. O `plan` inclui um **Constitution Check** como
portão de qualidade. Nenhuma feature avança para `tasks` com uma decisão de negócio em
aberto.

## Estratégia de migração

Não se migra dado tabela a tabela. O ativo real é o histórico de transações: re-ingere-se a
partir dos payloads crus e das exportações CSV das 7 contas para o novo `evento_origem`, e
as projeções se reconstroem — validando o pipeline novo contra 100% do volume real de uma
vez. A v1 é congelada (somente leitura) durante o corte, e os agregados-chave (receita por
conta/mês/moeda, contratos ativos, clientes) têm que bater. Só o catálogo curado é migrado
de verdade, pelos endpoints de curadoria da v2.

## Documentação

- [`Projeto_Pandora_-_Visão_geral_para_refatoração.md`](Projeto_Pandora_-_Visão_geral_para_refatoração.md)
  — briefing único e autossuficiente do escopo (Partes 1–10).
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — princípios de
  governança (v1.0.0).
- [`CLAUDE.md`](CLAUDE.md) — contexto de trabalho para agentes de IA.
- `Documentação {Asaas,Guru,Hotmart,TMB}.md` — referência das APIs de origem.

## Status

Constituição ratificada em 2026-09-01 (v1.1.0). **Fase 0 (Fundações) em andamento.**

- ✅ **001 — bootstrap-projeto**: esqueleto do monorepo entregue e validado (backend NestJS
  com os 11 bounded contexts, Prisma + Postgres, config zod por conta, harness de teste
  contra Postgres real com isolamento por schema, CI no GitHub Actions, frontend Vite +
  React 19 + Tailwind v4 com o shell da marca). Ver [`ROADMAP.md`](ROADMAP.md) e
  [`docs/001-bootstrap-projeto.md`](docs/001-bootstrap-projeto.md).
- ✅ **002 — core-value-objects**: primitivas canônicas do `core` (sem banco/endpoint/
  frontend) — `Dinheiro` (`bigint` ×10000) + `Moeda` (ISO 4217 validado) + `ratear`;
  `parseInstante` de borda tolerante e livre de locale + `agoraUtc`; enums de status
  canônico + funções puras `liberaAcesso`/`contaComoReceita`/`contratoLiberaAcesso` + rede
  de segurança `paraStatusTransacaoCanonico`; contrato `EntidadeAuditavel` +
  `RegistroAuditoria`; config tipada consolidada no `core` + regra ESLint `no-process-env`.
  113 testes unitários; matriz de `TZ` na CI. Ver
  [`docs/002-core-value-objects.md`](docs/002-core-value-objects.md).
- ✅ **003 — auth-servico-jwt**: autenticação de serviço da API interna. `POST /auth/token`
  (credenciais de serviço → JWT HS256 _stateless_, TTL 12 h / teto 24 h, sem refresh);
  `JwtAuthGuard` global — API fechada por padrão, allowlist `@Public()` (`/health`,
  `/auth/token`) + prefixo `/webhooks/`; `WebhookAuthenticator` (token de webhook por conta,
  separado do JWT). `SERVICE_*` promovidas a obrigatórias no `env.schema`. Painel: tela
  `/login`, `AuthProvider`/`useAuth`, `apiFetch` central (injeta `Authorization`, trata 401
  num ponto único), token em `localStorage`. Dep nova `@nestjs/jwt`; 0 migração. Ver
  [`docs/003-auth-servico-jwt.md`](docs/003-auth-servico-jwt.md).
- ✅ **004 — rbac**: matriz de autorização única por cima do JWT da 003. Catálogo de
  permissões no código (`recurso:acao`); **1ª migração de negócio** — Prisma `usuario` /
  `perfil` / `perfil_permissao` / `usuario_perfil` / `rbac_audit` + `prisma/seed.ts`
  idempotente (perfil de sistema `Administrador`). `PermissionGuard` como 2º `APP_GUARD`:
  `@RequerPermissao(...)` / `@AutenticadoBasta()`, **nega por omissão** (403 ≠ 401).
  Permissões efetivas resolvidas a cada requisição (JWT segue fino). Endpoints
  `/admin/rbac/*` (perfis + usuários, sob `perfil:administrar`) — toda escrita audita em
  `rbac_audit` (append-only, só _delta_ real; painel = 053). Painel: menu **Administração**
  (abas Perfis/Usuários) atrás de `perfil:administrar`; `apiFetch` trata 403 num ponto
  único. 0 dep nova. Ver [`docs/004-rbac.md`](docs/004-rbac.md).
- ⏭️ Próxima: **005 — pessoa-identidade-dedup**.

Ordem de construção acordada: **CRM → Financeiro → Marketing → Central de Clientes**
(precedidas pelas fatias transversais `core`, `clientes`, `ingestao`). Restam em aberto o
default do modelo de atribuição de Marketing e as decisões específicas de CRM (visão
Parte 8.12).
