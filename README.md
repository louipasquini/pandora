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
    clientes/    pessoa + conta: identidade, dedup, merge (spec 005 — domain/ application/ infra/)
                 + campo personalizado de pessoa, exposto ao crm via porta de inversão de
                 dependência (spec 013)
    ingestao/    evento_origem + EventoCanonico + worker do pipeline canônico (spec 006 — domain/ application/ infra/);
                 adapters/tmb/ (parsers puros das 4 fontes + TmbApiClient) + tmb/ (webhooks públicos
                 /webhooks/tmb/* + /ingestao/tmb/{sincronizar,importar-csv}) — spec 019;
                 adapters/asaas/ (parsers puros das 3 fontes, por conta, + AsaasApiClient) + asaas/
                 (webhooks públicos por conta /webhooks/asaas/{prd,svc} +
                 /ingestao/asaas/{sincronizar,importar-csv}) — spec 020;
                 adapters/guru/ (parsers puros das 3 fontes, por conta, + GuruApiClient com
                 paginação por cursor) + guru/ (webhooks públicos por conta
                 /webhooks/guru/{prd,svc} — token api_token NO CORPO +
                 /ingestao/guru/{sincronizar,importar-csv}) — spec 021;
                 adapters/hotmart/ (parsers puros por conta, + HotmartApiClient com OAuth2
                 client_credentials + paginação por cursor; sales/history + sales/price/details
                 merge) + hotmart/ (/ingestao/hotmart/{sincronizar,importar-csv} +
                 /webhooks/hotmart/{prd,svc} — STUB desligado, HOTMART_WEBHOOK_ENABLED) — spec 022
    crm/         Administração do CRM (spec 007) + Lead: entidade compartilhada, scoring,
                 campos personalizados, conversão (spec 008) + Interação/Tag/Segmento:
                 timeline unificada, tag compartilhada, query salva (spec 009) + Pipeline/
                 Oportunidade: etapas, atribuição automática, SLA/esfriando derivados,
                 métricas (spec 010) + WhatsApp: canal, template, webhook autenticado por
                 HMAC, janela de 24h, envio, opt-out (spec 011) + Chat ao Vivo: fila,
                 endereçamento por carga, SLA de 1ª resposta e CSAT sempre derivados,
                 transferência, resposta automática fora do expediente (spec 012) + FAQ
                 versionada e Sugestão de IA — síncrona, sempre dentro de um atendimento,
                 nunca envia/grava sozinha (spec 013 — domain/ application/ infra/,
                 subpastas lead/ interacao/ tag/ segmento/ pipeline/ whatsapp/ atendimento/
                 faq/ sugestao-ia/) + Workflow: fluxo em blocos gatilho→condição→ação,
                 versionamento imutável, worker in-house sobre trilhas append-only do
                 próprio crm, biblioteca de modelos, simulação sem efeito colateral
                 (spec 014 — subpasta workflow/) + Disparos: envio em massa de WhatsApp por
                 segmento e/ou CSV, dedup + opt-out, worker in-house, teste A/B, quality
                 rating sob demanda (spec 015 — subpasta disparos/) + Tarefas: checklist,
                 cronômetro, comentários append-only, dependência sem ciclos, delegação,
                 pontos/ranking derivados, notificações in-app, ação CRIAR_TAREFA no
                 Workflow (spec 016 — subpasta tarefa/) + Dashboard: métricas derivadas por
                 query (catálogo fechado de painéis, benchmark período-a-período, funil,
                 ranking, qualidade de atendimento), metas com atingimento derivado +
                 alerta in-app, visões salvas, export CSV client-side (spec 017 — subpasta
                 dashboard/)
    financeiro/  transacao normalizada (1 por (plataforma_origem, id_origem)), pipeline
                 etapas 2–3 plugadas no worker da 006 (resolver pessoa via PortaIdentidade
                 da 005; upsert transação com status_map por fonte), leitura-só
                 GET /financeiro/transacoes[/:id] (spec 018 — subpasta transacoes/ no front)
    catalogo/    produto (auto-criado, código de 3 letras) + oferta (resolvida por
                 (tag AEN, plataforma) — decodificador puro + auto-criação; Hotmart só por
                 catálogo importado via CSV, nunca por tag) + oferta_catalogo (ticket, preço
                 de tabela, tempo de acesso, bônus, combo — 100% curado) + janela_lancamento
                 (turma efetiva por data, só CSV); pipeline etapa 5 (RESOLVER_OFERTA)
                 plugada via o mesmo ExecutorEtapaExterno da 018; curadoria
                 PUT /produtos/:codigo + POST/PATCH /ofertas; import
                 POST /catalogo/hotmart/importar-{produtos,ofertas,lancamentos} (spec 023 —
                 subpastas produtos/ ofertas/ no front)
    contratos/ marketing/ central/
                 um módulo vazio por contexto (domain/ application/ infra/)
    api/ admin/  módulos de borda (routers finos; sync/imports/curadoria)
  prisma/        schema.prisma (RBAC 004 + pessoa/conta 005 + evento_origem 006 + crm-admin
                 007 + lead 008 + interacao/tag/segmento 009 + pipeline/oportunidade 010 +
                 whatsapp 011 + atendimento 012 + faq/sugestao_ia/campo_personalizado_pessoa
                 013 + workflow 014 + disparos 015 + tarefa 016 + dashboard: meta_comercial
                 / dashboard_visao / crm_dashboard_audit 017 + transacao +
                 StatusTransacaoCanonico 018 + produto/oferta/oferta_origem_ref/
                 oferta_catalogo(+bonus/combo)/janela_lancamento/catalogo_audit 023) +
                 migrações + seed.ts
  test/          harness e2e contra Postgres real (schema isolado; migrate + seed por execução)

frontend/  Vite 6 + React 19 + Tailwind v4 + TanStack Query + React Router 7
  src/
    theme/       tokens.css — ponto único das cores da marca + Inter
    shell/       AppShell (header + nav filtrada por permissão + conteúdo roteável)
    app/         router + query client
    auth/        AuthProvider, apiFetch (401 + 403), RequirePermissao, usePermissoesEfetivas
    admin/       Administração — abas Perfis e Usuários (spec 004)
    pessoas/ contas/  lista, detalhe, criação e merge (spec 005) + campos personalizados
                 (espelha leads/, spec 013)
    eventos/     painel de eventos de ingestão — revisar/erro + reprocessar (spec 006)
    crm-admin/   CRM · Administração — abas Equipes / Expediente / Integrações (spec 007)
    leads/       CRM · Leads — lista, detalhe, score, campos personalizados, converter (spec 008)
    interacoes/  TimelineInteracoes + TagPicker — compartilhados por Pessoa e Lead (spec 009)
    segmentos/   CRM · Segmentos — lista, detalhe, membros derivados na leitura (spec 009)
    pipelines/   CRM · Pipelines — board Kanban (drag-and-drop nativo), administração de
                 pipeline/etapa/atribuição/campos personalizados (spec 010)
    whatsapp/    CRM · WhatsApp — conectar canal, sincronizar e ver templates (spec 011)
    atendimento/ CRM · Chat ao Vivo — fila com indicador de SLA, conversa (assumir/
                 responder/transferir/encerrar/CSAT), administração de SLA e mensagem
                 fora do expediente por equipe (spec 012) + painel de sugestão de IA
                 (spec 013)
    faq/         aba FAQ dentro de CRM · Administração — lista, criar/editar, histórico
                 de versões (spec 013)
    workflow/    CRM · Workflow — lista de fluxos, editor de gatilho/condições/ações,
                 simulação, histórico de execuções, biblioteca de modelos (spec 014)
    disparos/    CRM · Disparos — visão geral/histórico, construtor (canal, template[s],
                 segmento e/ou CSV, teste A/B, agendamento), detalhe com métricas, export e
                 quality rating sob demanda (spec 015)
    tarefas/     CRM · Tarefas — abas Minhas/Gerais/Todas, agenda, detalhe com checklist/
                 cronômetro/comentários/dependências/delegação, ranking de pontos (spec 016)
    dashboard/   CRM · Dashboard — seletor de período + filtros, painéis com comparação
                 período-a-período (gráficos SVG à mão), metas comerciais + alerta,
                 visões salvas, export CSV + Imprimir/PDF (spec 017)
    produtos/    Catálogo · Produtos — lista + curadoria de nome/assinatura (spec 023)
    ofertas/     Catálogo · Ofertas — lista + detalhe com curadoria de identidade e de
                 oferta_catalogo (ticket/tempo de acesso/bônus/combo), import dos 3 CSVs
                 do catálogo Hotmart (spec 023)
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
#    + spec 007: CRM_INTEGRACAO_CIFRA_KEY (base64 de 32 bytes — cifra do segredo de integração).
#    O .env.example já traz placeholders válidos.

# 3. Subir o Postgres de desenvolvimento (porta host 55432)
npm run db:up
#    sem Docker: aponte DATABASE_URL/TEST_DATABASE_URL para seu Postgres e crie os
#    bancos `pandora` e `pandora_test`

# 4. Aplicar as migrações e semear o RBAC (spec 004 — 1ª migração de negócio;
#    spec 005 acrescenta pessoa/conta na 2ª+3ª migração; spec 006 acrescenta
#    evento_origem/evento_etapa na 4ª; spec 007 acrescenta equipe/expediente/
#    integracao na 5ª; spec 008 acrescenta lead/campos-personalizados na 6ª;
#    spec 009 acrescenta interacao/tag/segmento na 7ª (e remove lead.tags);
#    spec 010 acrescenta pipeline/oportunidade na 8ª; spec 011 acrescenta
#    canal_whatsapp/template_whatsapp/mensagem_whatsapp/evento_webhook_whatsapp/
#    opt_out_whatsapp na 9ª; spec 012 acrescenta atendimento/
#    transferencia_atendimento/resposta_atendimento na 10ª; spec 013 acrescenta
#    faq_item/faq_item_versao/sugestao_ia/campo_personalizado_pessoa/valor_campo_pessoa
#    na 11ª; spec 014 acrescenta fluxo_automacao/fluxo_automacao_versao/execucao_fluxo/
#    fluxo_modelo/fluxo_cursor_fonte na 12ª; spec 015 acrescenta execucao_disparo/
#    disparo_contato_importado/mensagem_disparo na 13ª; spec 016 acrescenta tarefa/
#    tarefa_checklist_item/tarefa_cronometro_periodo/tarefa_nota/tarefa_dependencia/
#    tarefa_delegacao/crm_tarefa_audit na 14ª; spec 017 acrescenta meta_comercial/
#    dashboard_visao/crm_dashboard_audit na 15ª; spec 018 acrescenta transacao +
#    enum StatusTransacaoCanonico na 16ª (1ª migração do financeiro); spec 023 acrescenta
#    produto/oferta/oferta_origem_ref/oferta_catalogo(+bonus/combo)/janela_lancamento/
#    catalogo_audit na 17ª (1ª migração do catalogo) — todas sem seed de negócio, exceto
#    a 014, que semeia 3 fluxo_modelo de partida)
npm run db:migrate:deploy
npm run prisma:seed --workspace backend      # cria o perfil de sistema "Administrador" + a biblioteca de modelos de fluxo (idempotente)
#    em dev, `npm run db:migrate` já roda o seed no fim
#    os scripts prisma:* do backend (migrate/seed/reset) carregam o `.env` da raiz
#    sozinhos (`set -a && . ../.env`) — não precisa exportar DATABASE_URL na mão;
#    `npm run db:migrate:status` checa se há migração pendente sem aplicar nada

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

Constituição ratificada em 2026-09-01 (v1.1.0). **Fases 0 (Fundações) e 1 (CRM) concluídas —
Fase 2 (Financeiro) em andamento** (specs 018–023 entregues; próxima 024).

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
- ✅ **005 — pessoa-identidade-dedup**: 1º _bounded context_ de domínio com entidade de
  negócio (`clientes`; `CONTEXT_MODULES` segue 11). Domínio puro: `resolverIdentidade`
  (dedup por prioridade **documento → cnpj → email → telefone**; ambiguidade **descarta o
  critério**, nunca funde), `normalizar` (e-mail/telefone/documento), DV de CPF/CNPJ à mão.
  `resolverOuCriar` — serviço transacional idempotente, **porta** que a spec 018 consome
  (rotaciona contato não curado; curado em conflito → secundário + `nota_reconciliacao`).
  CRUD manual de `pessoa` (campo tocado vira `curado`; unicidade → 409 sem fundir; **sem
  `DELETE`** — exclusão = pseudonimização spec 047), `conta` (HOUSEHOLD|EMPRESA; **não**
  toca `contrato` — regra #3). `merge`/`desfazer` **reversível em qualquer ordem** (snapshot
  Json + proveniência por linha). 2ª+3ª migração Prisma (`pessoa` + tabelas filhas +
  `merge_*`/`nota_reconciliacao`/`clientes_audit` append-only; id de origem só em
  `pessoa_origem_ref`). Catálogo RBAC ganha `pessoa:{ver,editar,merge}` +
  `conta:{ver,editar,merge}`. Painel: itens **Pessoas**/**Contas**. 0 dep nova.
  Ver [`docs/005-pessoa-identidade-dedup.md`](docs/005-pessoa-identidade-dedup.md).
- ✅ **006 — evento-origem-worker**: 2º _bounded context_ de domínio (`ingestao`;
  `CONTEXT_MODULES` segue 11). Materializa o Princípio IV — event log imutável + projeções.
  Domínio puro: contrato **`EventoCanonico`** (schema `zod`) que os adapters 019–022 vão
  produzir; `hashEvento` (`sha256` canônico — dedup por `(plataforma_origem, id_origem,
  hash)`); `classificar` (enum **congelado** `Classificacao`; regras locais; o que depende de
  casar Asaas↔Guru → `DESCONHECIDO`+`revisar`; nunca um palpite — regra #15); registro
  `ETAPAS` **com dependências declaradas** + `planejarPassada` (puro). Etapas 2–6 são _no-op_
  `pulada` — specs 018/023/024/025 plugam a real via `WorkerService.definirExecutor(...)` sem
  tocar o worker. **Porta** `registrarEvento` (etapa 0, idempotente) + **worker** in-process
  (`setInterval`, 0 dep) que roda cada etapa em transação própria; retry até
  `INGESTAO_WORKER_MAX_TENTATIVAS` (3) → depois `erro` terminal; dependência não-`ok` →
  `bloqueada`. 4ª migração Prisma (`evento_origem`/`evento_etapa`/`ingestao_audit`
  append-only; `id_origem` nunca PK). 5 endpoints `/ingestao/eventos` (`evento:{ver,
  reprocessar,ingerir}`); **sem `/webhooks/*`**. Env `INGESTAO_WORKER_{ENABLED,INTERVALO_MS,
  MAX_TENTATIVAS,LOTE}` (desligado em teste). Painel: item **Eventos** (lista `revisar`/`erro`
  + detalhe com payload e linha do tempo das etapas + Reprocessar). 0 dep nova.
  Ver [`docs/006-evento-origem-worker.md`](docs/006-evento-origem-worker.md).
- ✅ **007 — crm-administracao**: 3º _bounded context_ de domínio (`crm`; `CONTEXT_MODULES`
  segue 11). Módulo de **Administração do CRM** (visão 8.11) — **sem reimplementar a 004**
  (só estende o catálogo com `crm_admin`). Domínio puro: **`estaEmExpediente`** (livre de
  locale — America/Sao_Paulo via `Intl` nativo, **0 dep**; feriado subtrai mesmo dentro da
  janela; **união** global ∪ equipe ativa — CL-01; recorrente casa `(mês,dia)` exato, 29/02
  não desloca — CL-04; sem janela → `false`); `cifra` (AES-256-GCM `node:crypto`); `api-key`
  (`crm_`+40hex **só-hash**, revelada 1×); `mascararSegredo`. **5ª migração Prisma**
  (`equipe` / `equipe_membro` com **índice único parcial** `WHERE saiu_em IS NULL` = ≤1
  vínculo ativo por par / `janela_atendimento` — `hora_fim>hora_inicio`, CL-02 / `feriado` /
  `integracao` — segredo **cifrado em repouso** ou só-hash, **nunca** volta em leitura;
  contrato de segurança verificado por `grep` nos testes / `crm_admin_audit` append-only, só
  delta, segredo como marcador). Chave `CRM_INTEGRACAO_CIFRA_KEY` (base64 32 bytes)
  **obrigatória em todo `NODE_ENV`**. Catálogo RBAC ganha
  `crm_admin:{ver,gerir_equipes,gerir_expediente,gerir_integracoes}` (`administrador` +
  credencial de serviço de graça, 0 migração de dados). ~22 endpoints `/crm/admin/**` +
  `GET /crm/admin/expediente`. Painel: item **CRM · Administração** (abas Equipes /
  Expediente / Integrações; máscara de segredo; _reveal_ 1×; indicador "no expediente
  agora?"). 0 dep nova, 1 migração (2 arquivos), +1 chave `.env`.
  Ver [`docs/007-crm-administracao.md`](docs/007-crm-administracao.md).
- ✅ **008 — crm-lead**: 1ª entidade **compartilhada** do projeto — uma única tabela `lead`
  para CRM **e** Marketing (visão 8.2.1), acesso por RBAC 004 (`lead:{criar,editar,
  ver_todos,ver_proprios}` já no catálogo desde a 004), não por fronteira. Mora no `crm`
  (`CONTEXT_MODULES` segue 11). **Lead scoring** derivado por `calcularScore` (função pura,
  livre de locale, tabela de pesos **congelada** `PESOS_SCORE_LEAD`; `score` é _cache_
  `[0,100]`, nunca `+= delta` — regra 8.2.2, nunca setável por `PATCH`); `recalcular-score`
  individual + lote, idempotentes. **Conversão Lead → `pessoa`** (`POST /crm/leads/:id/
  converter`, guard `lead:editar` + `pessoa:editar`) reusa a engine de identidade da **005**
  por **inversão de dependência** (CL-02): `core` ganha a interface `PortaIdentidade` + token
  `PORTA_IDENTIDADE`; `clientes` ganha um adaptador + módulo `@Global()`
  `IdentidadeWiringModule`; o `crm` **injeta a interface, nunca importa `src/clientes/**`**
  (ESLint + `grep` no e2e). CL-01: pós-conversão o lead é **arquivado + vinculado**
  (`status=CONVERTIDO` + `pessoa_id`, nada apagado/migrado); idempotente. **Campos
  personalizados** (CL-03 — esquema administrável): `campo_personalizado_lead` (definição,
  sob a permissão nova `crm_admin:gerir_campos_lead`) + `valor_campo_lead` (validado por
  tipo → 422); `PUT` = substituição total. **Escopo de visão**: rotas de leitura
  `@AutenticadoBasta()` + gate "OU" + filtro **no `where`** (`ver_proprios` = só
  `responsavel_id` = sujeito e não-nulo; fila não atribuída só p/ `ver_todos`; fora do
  escopo → 404). **Porta in-process** `RegistrarLeadService` (idempotente por
  `(origem, id_externo)` — id de origem **nunca** PK) para a spec 035; sem `/webhooks/*`,
  OAuth ou chamada externa. **Sem `DELETE` físico de lead** (só `DESCARTADO`). Auditoria
  `crm_lead_audit` (forma canônica do core, append-only, só delta real). **6ª migração
  Prisma** (`20260904122426_crm_lead` — `lead` / `campo_personalizado_lead` /
  `valor_campo_lead` / `crm_lead_audit`). Painel `frontend/src/leads/`: item **CRM · Leads**
  atrás de `lead:ver_todos` **ou** `lead:ver_proprios` (`requerPermissao`/`RequirePermissao`
  ganham `anyOf`), lista + filtros + coluna de score, detalhe com tags / campos
  personalizados / timeline de auditoria + **Converter em pessoa**. **0 dep nova, 1
  migração, nenhuma porta nova, nenhuma chave `.env` nova**, +1 permissão de catálogo.
  Ver [`docs/008-crm-lead.md`](docs/008-crm-lead.md).
- ✅ **009 — crm-interacao-timeline**: fecha o esboço 5.2‑E. **`interacao`** com âncora
  polimórfica `pessoa` XOR `lead` (`CHECK` no banco); timeline da pessoa = **união**, na
  leitura, das próprias com as de todo lead convertido nela (CL-01) — sem re-apontar
  nenhuma linha; leitura sem permissão nova (deriva de `pessoa:ver` ou do escopo `lead:ver_*`
  da 008). **Mutabilidade híbrida** (CL-05): só `tipo = NOTA` edita/remove
  (_soft-delete_, autor ou `interacao:gerir`); canal (`WHATSAPP|EMAIL|LIGACAO|TICKET|NPS`) é
  **append-only**. **`tag`** promovida a entidade de 1ª classe compartilhada
  lead\|pessoa\|interacao (CL-04) — migra `lead.tags` da 008 preservando o contrato REST
  (`POST`/`DELETE .../tags` mesma forma nas 3 âncoras); catálogo com _upsert_ por slug,
  admin sob `crm_admin:gerir_tags`. **`segmento`** — query salva declarativa (CL-03):
  `filtro` validado por esquema **fechado** por `alvo`; membros **sempre derivados** na
  leitura, combinando o filtro com o escopo de visão do sujeito — nunca amplia o que ele já
  vê. **Nenhum contrato novo no `core`** — as FKs de `interacao`/`tag_associacao` para
  `Pessoa` vivem só no `schema.prisma` compartilhado (mesmo precedente de
  `Lead.pessoaId`/`Lead.responsavelId`). **7ª migração Prisma**
  (`20260904150000_crm_interacao` — `interacao` / `tag` / `tag_associacao` / `segmento` /
  `crm_interacao_audit`; remove `lead.tags`). Catálogo RBAC ganha
  `interacao:{registrar,gerir}`, `segmento:{ver,gerir}`, `crm_admin:gerir_tags` (+5).
  Painel: `TimelineInteracoes`/`TagPicker` compartilhados (Pessoa e Lead) + **CRM ·
  Segmentos** (nova). **0 dep nova, 1 migração, 0 porta nova, 0 chave `.env` nova.**
  Ver [`docs/009-crm-interacao-timeline.md`](docs/009-crm-interacao-timeline.md).
- ✅ **010 — crm-pipeline**: pipeline de vendas de alto ticket (visão 8.7). **`pipeline`**
  (funil configurável, `modoAtribuicao MANUAL|RODIZIO|REGRA`) + **`etapa_pipeline`**
  (ordenada, `tipo ABERTA|GANHA|PERDIDA`, `slaHoras?`). **`oportunidade`** — mesma âncora
  polimórfica `pessoa` XOR `lead` da `interacao` (009); **1ª persistência de `Dinheiro` do
  core** no schema (`bigint` ×10000 + `moeda` `char(3)`). **`oportunidade_movimentacao`** —
  histórico de **1ª classe** (não o audit genérico): motivo obrigatório só ao **entrar** em
  etapa `PERDIDA`; mover para a etapa atual é no-op; reabrir não exige motivo. **Atribuição
  automática**: `RODIZIO` reusa `equipe`/`equipe_membro` da 007 (round robin
  **determinístico** via cursor persistido); `REGRA` — condições ordenadas com *fallback*.
  **SLA/"esfriando"** sempre **derivados** na leitura (nunca coluna), "esfriando" reusa a
  última `interacao` da 009 (busca em lote, sem N+1). Campos personalizados (mesmo padrão da
  008) + métricas por etapa/moeda (`groupBy`, nunca soma entre moedas). Porta
  `PortaObservacaoPagamentoCrm` (exportada, sem gatilho real — Financeiro ainda não existe).
  **8ª migração Prisma** (8 tabelas + 3 enums + `CHECK` de âncora XOR). Catálogo RBAC ganha
  `oportunidade:{criar,editar,mover,ver_todas,ver_proprias}` + `crm_admin:gerir_pipelines`
  (+6). ~26 endpoints. Painel: **CRM · Pipelines** — board Kanban com drag-and-drop **HTML5
  nativo** (0 dep nova), modal de motivo em etapa `PERDIDA`, painel de métricas;
  administração de pipeline/etapas/atribuição/campos atrás de `crm_admin:gerir_pipelines`.
  **0 dep nova, 1 migração, 0 porta nova, 0 chave `.env` nova.**
  Ver [`docs/010-crm-pipeline.md`](docs/010-crm-pipeline.md).
- ✅ **011 — crm-whatsapp-integracao**: conecta o WhatsApp Business (**Cloud API oficial da
  Meta** — decisão do dono do produto, não BSP) como canal de 1ª classe do CRM (visão
  8.5/8.12). **`canal_whatsapp`** (conexão — segredos cifrados com a mesma
  `CRM_INTEGRACAO_CIFRA_KEY` da 007), **`template_whatsapp`** (catálogo espelhado da Meta,
  sincronizado **só sob demanda** — Princípio VIII, nunca automático), **`mensagem_whatsapp`**
  (detalhe 1:1 de uma `interacao` tipo `WHATSAPP` já existente desde a 009 — mantém
  `interacao` agnóstica de canal), **`evento_webhook_whatsapp`** (evento cru imutável do
  webhook, dedupado por hash — **não** reaproveita `evento_origem`/`PlataformaOrigem` da
  `ingestao`, que é uma dimensão fechada das 7 contas financeiras) e **`opt_out_whatsapp`**
  (histórico de pedidos de não-contato, LGPD; retenção de conversas **indefinida** —
  pseudonimização só na exclusão da `pessoa`, decisão do dono do produto). Webhook de
  entrada (`/webhooks/whatsapp`, público) autenticado por **HMAC-SHA256** — não pelo
  `WebhookAuthenticator` da 003, que é escopado às 7 contas financeiras — resolve
  pessoa/lead pelo telefone (cria `Lead` novo se desconhecido) e registra via
  `RegistrarInteracaoService` (009, porta exportada especificamente para esta spec).
  **Janela de 24h** e "está em opt-out" são sempre **derivados** na leitura (Princípio V).
  Envio (livre dentro da janela, ou por template aprovado fora dela) é **síncrono** — sem
  fila (disparo em massa é escopo da 015). **9ª migração Prisma** (5 tabelas + 6 enums;
  nenhuma tabela de auditoria nova — canal/template/opt-out reaproveitam `crm_admin_audit`
  da 007). Catálogo RBAC ganha `whatsapp:{ver,enviar,gerir_optout}` +
  `crm_admin:gerir_whatsapp` (+4). ~14 endpoints autenticados + 2 públicos de webhook.
  Painel: **CRM · WhatsApp** — conectar canal (segredos só-escrita, nunca preenchidos de
  volta), templates por canal com badge de status e "sincronizar agora". **0 dep nova**
  (`fetch` nativo do Node 24 + `rawBody: true` nativo do Nest), **1 migração, 0 chave `.env`
  nova**. Ver [`docs/011-crm-whatsapp-integracao.md`](docs/011-crm-whatsapp-integracao.md).
- ✅ **012 — crm-chat-ao-vivo**: inbox de atendimento ao vivo (visão 8.5/8.12), construída
  **sobre** a timeline de `interacao` (009) e o canal WhatsApp já conectado (011) — não uma
  2ª tabela de mensagens. **`atendimento`** (fila, prioridade, atendente/equipe atual, SLA
  de 1ª resposta sempre **derivado**), **`transferencia_atendimento`**/
  **`resposta_atendimento`** (histórico de 1ª classe — quem respondeu, com/sem IA — não o
  audit genérico, mesmo racional de `oportunidade_movimentacao` da 010); mais
  `interacao.atendimentoId` (agrupa a timeline já existente sem duplicá-la) e
  `equipe.mensagemForaExpediente`/`slaPrimeiraRespostaMinutos`. **Endereçamento por carga/
  disponibilidade** (decisão do dono do produto, não aleatório/round robin): entre os
  membros ativos de uma equipe em expediente (reusa `estaEmExpediente` da 007), escolhe
  quem tem menos atendimentos em andamento **agora** — sempre derivado
  (`escolherAtendentePorCarga`, puro), nunca um contador persistido; SLA igualmente
  derivado, sem job de fundo (volume baixo — até ~10 conversas simultâneas, decisão do
  dono do produto, herdada pela 015). **CSAT reaproveita a `interacao` tipo `NPS`** já
  existente — nenhuma entidade nova; resposta automática fora do expediente reusa só
  `estaEmExpediente`, só canal WhatsApp, no máximo 1× por atendimento. **10ª migração
  Prisma** (3 tabelas + 3 enums + 2 colunas; nenhuma tabela de auditoria genérica nova).
  Catálogo RBAC ganha `atendimento:{ver_todos,ver_proprios,atender,transferir,encerrar}` +
  `crm_admin:gerir_atendimento` (+6). ~16 endpoints autenticados, 0 endpoint público novo.
  Painel: **CRM · Chat ao Vivo** — fila com indicador de SLA + conversa reaproveitando
  `TimelineInteracoes` (009) para o histórico completo; administração de SLA/mensagem fora
  do expediente por equipe. **0 dep nova**, **1 migração, 0 chave `.env` nova**. Ver
  [`docs/012-crm-chat-ao-vivo.md`](docs/012-crm-chat-ao-vivo.md).
- ✅ **013 — crm-faq-e-sugestao-ia**: base de FAQ versionada (`faq_item`/`faq_item_versao`,
  histórico append-only, snapshot completo por edição) **sem** vínculo com produto ou
  campanha nesta versão — nenhuma das duas entidades existe ainda neste ponto do roadmap.
  **`sugestao_ia`** — proposta não-autoritativa da IA, síncrona, sempre dentro de um
  atendimento (012) já existente, sobre uma `Interacao` de entrada já registrada; **nunca**
  envia mensagem nem grava campo sozinha (governança 10.6): `RESPOSTA` só marca a decisão
  (aceitar ≠ enviar); `CAMPO_PERSONALIZADO` já grava ao aceitar. IA identifica múltiplas
  perguntas numa mensagem; pedir de novo para a mesma mensagem substitui a pendente
  anterior. Sugestão de campo personalizado vale para `lead` (008) **e** `pessoa` já
  convertida — `clientes` ganha `campo_personalizado_pessoa`/`valor_campo_pessoa` (espelha
  a estrutura de lead), exposta ao `crm` por uma **2ª porta de inversão de dependência**
  (`PortaCampoPersonalizadoPessoa`, mesmo padrão de `PortaIdentidade`, 008;
  `identidade-wiring.module.ts` renomeado para `clientes-wiring.module.ts`/
  `ClientesWiringModule`). Provedor de IA = **API da Anthropic** via `fetch` nativo, atrás
  de uma porta própria que **nunca lança** — falha do provedor nunca bloqueia o
  atendimento; credencial reaproveita a tabela `integracao` já existente e ociosa desde a
  007 (**0 tabela nova de credencial, 0 chave `.env` nova**). **11ª migração Prisma** (5
  tabelas + 2 enums + 1 coluna). Catálogo RBAC ganha `crm_admin:gerir_faq` +
  `pessoa:gerir_campos_personalizados` (+2); gerar/decidir sugestão reaproveita
  `atendimento:atender`; campo personalizado verifica `lead:editar`/`pessoa:editar`
  **dinamicamente**. ~24 endpoints autenticados, 0 endpoint público novo. Painel: aba
  **FAQ** em CRM · Administração + painel de sugestões dentro da conversa do Chat ao Vivo.
  **0 dep nova**, **1 migração, 0 chave `.env` nova**. Ver
  [`docs/013-crm-faq-e-sugestao-ia.md`](docs/013-crm-faq-e-sugestao-ia.md).
- ✅ **014 — crm-workflow**: motor de automação (visão 8.8). **`fluxo_automacao`**
  (metadado estável) + **`fluxo_automacao_versao`** (snapshot imutável de gatilho +
  condições E/OU + ações; no máximo 1 `PUBLICADA` por fluxo, índice único parcial) +
  **`execucao_fluxo`** (histórico append-only, idempotente por `(fluxo_versao_id, fonte,
  fonte_registro_id)`) + **`fluxo_modelo`** (biblioteca de automações prontas, semeada via
  seed) + **`fluxo_cursor_fonte`** (cursor técnico do worker). Gatilhos internos (lead
  criado/mudou de estágio, oportunidade mudou de etapa, interação registrada, tag aplicada)
  detectados por um `WorkerScheduler` in-house (mesmo padrão da 006) sobre trilhas **já
  append-only do próprio `crm`** — nunca *polling* de outro contexto; um cursor novo nunca
  varre o histórico anterior à ativação (descoberto durante a implementação — só estabelece
  a linha de partida em "agora"). Ações reaproveitam **exatamente** os serviços já
  existentes das specs 008/009/010 (mover lead de estágio, aplicar/remover tag, registrar
  nota, mover oportunidade de etapa) — nenhum caminho de escrita paralelo, mesma trilha de
  auditoria de uma ação manual. Gatilho por evento externo ("pagamento aprovado",
  "inscrição em lançamento") fica só modelado — sem execução real, já que Financeiro/
  Catálogo não existem ainda (mesmo padrão de `PortaObservacaoPagamentoCrm`, 010).
  Simulação nunca escreve. **12ª migração Prisma** (5 tabelas + 4 enums). Catálogo RBAC
  ganha `crm_admin:gerir_workflow` (+1; leitura reaproveita `crm_admin:ver`). ~16 endpoints
  autenticados, 0 endpoint público novo. Painel: **CRM · Workflow** — lista de fluxos,
  editor de gatilho/condições/ações (formulário guiado, não um canvas de nós livres),
  simulação, histórico de execuções, biblioteca de modelos. **0 dep nova**, **1 migração**,
  **0 chave `.env` de segredo nova** (só 3 variáveis de config do worker). Ver
  [`docs/014-crm-workflow.md`](docs/014-crm-workflow.md).
- ✅ **015 — crm-disparos**: envio em massa de WhatsApp (visão 8.6), construído **sobre** a
  infraestrutura de canal/template/mensagem já existente da 011 e sobre `Segmento` da 009 —
  nenhuma tabela paralela. **`execucao_disparo`** (campanha — template[s], canal, segmento
  e/ou CSV, agendamento, status) + **`disparo_contato_importado`** (linhas de CSV aceitas,
  escolha de virar Lead feita na importação) + **`mensagem_disparo`** (1 linha por
  destinatário resolvido — enviado/entregue/lido/falhou/pulado, variante de teste A/B; FK
  opcional a `mensagem_whatsapp`, preenchida só após o envio de fato). Lista de
  destinatários (segmento ∪ CSV, deduplicada, opt-out excluído) é resolvida na criação para
  envio imediato, ou pelo worker no horário para envio agendado — sempre recalculando a
  composição do segmento nesse momento, nunca travada antes. Worker in-house (mesmo padrão
  `setInterval` da 006/014, volume assumido: até poucos milhares por disparo) processa em
  lotes pequenos — o próprio ritmo é o throttling. Envio reaproveita **exatamente** os 3
  pontos de integração já existentes da 011 (`GraphApiClient` → `RegistrarInteracaoService`
  → `MensagemWhatsappRepository`), numa orquestração própria (sem janela de 24h, sem
  exceção HTTP). Falha do provedor tenta de novo um número limitado de vezes antes de virar
  terminal; falha que não faz sentido reter (opt-out/telefone inválido/template não
  aprovado) já nasce terminal. Quality rating consultado **sob demanda** direto na Graph
  API (`GraphApiClient.consultarQualityRating`, 0 sincronização automática). Teste A/B
  divide 100% do público entre duas variantes, sem promoção automática de vencedora. CSV
  trafega como texto simples no corpo JSON (`FileReader` no navegador) — **0 dependência
  nova** de upload binário (`multer`). **13ª migração Prisma** (3 tabelas + 3 enums).
  Catálogo RBAC ganha `disparo:{criar,ver,cancelar}` (+3); quality rating reaproveita
  `crm_admin:ver` já existente. ~10 endpoints autenticados, 0 endpoint público novo. Painel:
  **CRM · Disparos** — visão geral/histórico + construtor (canal, template[s], segmento
  e/ou CSV com escolha de criar Lead, teste A/B, agendamento) + detalhe com métricas por
  status/variante, export e quality rating. **0 dep nova**, **1 migração**, **0 chave
  `.env` de segredo nova** (4 variáveis de config do worker). Ver
  [`docs/015-crm-disparos.md`](docs/015-crm-disparos.md).
- ✅ **016 — crm-tarefas**: gestor de tarefas do time, pessoal e geral (visão 8.10).
  **`tarefa`** — título, prazo, responsável opcional (`null` = "geral", D-07), três âncoras
  opcionais e independentes (`pessoa_id`/`lead_id`/`oportunidade_id`, D-01 — diferente de
  `interacao`/`oportunidade`, que exigem exatamente uma) — com **`tarefa_checklist_item`**
  (progresso sempre derivado), **`tarefa_cronometro_periodo`** (períodos start/stop, no
  máximo 1 aberto por tarefa via índice único parcial), **`tarefa_nota`** (comentário de
  acompanhamento **append-only**, distinto da `interacao.NOTA` editável da 009 — reserva já
  registrada na CL-02 daquela spec), **`tarefa_dependencia`** (sem ciclos — `detectarCiclo`
  puro via DFS roda antes do `INSERT`; dependência pendente bloqueia só a conclusão, 409)
  e **`tarefa_delegacao`** (histórico de 1ª classe, mesmo padrão de
  `oportunidade_movimentacao`/010). Pontos de gamificação (CL-01) e ranking **sempre
  derivados** (pesos congelados `PESOS_PONTOS_TAREFA` — base + bônus de prazo + bônus de
  checklist completo, mesmo padrão de `calcularScore`/008); notificações in-app (CL-02) via
  campo derivado `vencendoHoje`/`atrasada` (dia civil em America/Sao_Paulo, mesmo padrão de
  `estaEmExpediente`/007) + `GET /crm/tarefas/notificacoes`, sem envio externo. Geração
  automática (CL-03) só via ação nova **`CRIAR_TAREFA`** no catálogo fechado do Workflow
  (014) — reaproveita o motor de fluxo e o worker já existentes; idempotência (reprocessar
  não duplica) herdada de graça do guard já existente do `WorkerService`. Escopo de visão
  `tarefa:ver_todas`\|`ver_proprias` (D-08: `ver_proprias` inclui as tarefas **sem**
  responsável — a fila geral é de todo mundo). **14ª migração Prisma** (6 tabelas + 1 audit
  + enum `TarefaStatus`; índice único parcial + `CHECK` via SQL bruto). Catálogo RBAC ganha
  `tarefa:{criar,editar,ver_todas,ver_proprias,delegar}` (+5). ~21 endpoints autenticados,
  0 endpoint público novo. Painel: **CRM · Tarefas** — abas Minhas/Gerais/Todas, agenda por
  vencimento, detalhe com checklist/cronômetro/comentários/dependências/delegação, painel
  de ranking; `CRM · Workflow` ganha o formulário da ação Criar tarefa. **0 dep nova**, **1
  migração (2 arquivos)**, **0 chave `.env` nova**. Ver
  [`docs/016-crm-tarefas.md`](docs/016-crm-tarefas.md).
- ✅ **017 — crm-dashboard**: dashboard comercial e de atendimento (visão Parte 8) —
  **última fatia da Fase 1 (CRM)**. Métricas **100% derivadas por query** (Princípio V é o
  cerne — 0 tabela de rollup, 0 contador, 0 job). **Catálogo fechado de painéis no código**
  `PAINEIS_DASHBOARD` (mesmo modelo do catálogo RBAC/004 e de `ACAO_TIPOS`/014) — 6 painéis:
  visão geral, funil de conversão (reusa `agregarMetricas`/010, nunca soma moedas), ranking
  do comercial (por responsável — ganhas + valor por moeda + conversão + pontos de tarefa/
  016), qualidade de atendimento (tempo méd. 1ª resposta / % SLA / CSAT / taxa de resolução
  — reusa SLA·CSAT de 012), leads por origem, série temporal. Cada painel exige
  `dashboard:ver` + a permissão do recurso que expõe; sujeito só com `dashboard:ver` →
  página 200 restrita, nunca 403. Todo painel reusa o `escopoDe(req)` do `*ConsultaService`
  já existente — o dashboard **nunca amplia** o que o sujeito já vê. **Comparação
  período-a-período** (`resolverPeriodo` + `calcularDelta`, puros). **`meta_comercial`**
  (alvo numérico para uma métrica de um catálogo fechado, período MES/TRIMESTRE, escopo
  opcional equipe/responsável); atingimento (`realizado`/`percentual`/`status`) **sempre
  derivado** por `statusMeta(...)` puro — nunca coluna. **`GET /crm/dashboard/notificacoes`**
  — metas do sujeito em alerta, só in-app. **`dashboard_visao`** — recorte de leitura salvo
  (só o dono edita; compartilhada = read-only + clonável). Export **100% client-side, 0
  dep**: CSV via `Blob` + `window.print()`/`@media print`; gráficos em **SVG à mão**.
  **15ª migração Prisma** (`meta_comercial` + `dashboard_visao` + `crm_dashboard_audit` +
  enum `MetaComercialPeriodo`; só índices comuns). Catálogo RBAC ganha `dashboard:{ver,
  gerir_metas}` (+2). ~14 endpoints, 0 endpoint público novo. Painel: **CRM · Dashboard** —
  seletor de período + filtros, painéis com delta período-a-período, metas + alerta, visões
  salvas, Exportar CSV / Imprimir-PDF. **0 dep nova**, **1 migração**, **0 porta nova**,
  **0 chave `.env` nova**. Ver [`docs/017-crm-dashboard.md`](docs/017-crm-dashboard.md).
- ✅ **018 — financeiro-transacao-ledger** — 1ª fatia da **Fase 2 (Financeiro)**. `financeiro`
  (vazio desde a 001) vira dono de **`transacao`** — projeção normalizada de um evento
  financeiro, **1 linha por `(plataforma_origem, id_origem)`** (Regra Inviolável nº 1),
  valores como `Dinheiro` do `core` (4 pares `bigint ×10000 + char(3)`, sem `float`),
  `status_canonico`, `classificacao` e FKs opcionais (só `pessoa`/`evento_origem` com FK
  ativa). **Pluga as etapas 2–3 do pipeline da 006** sem tocar o `WorkerService`:
  `RESOLVER_PESSOA` (reusa a engine da 005 pela `PortaIdentidade`; `criar: false` sse
  `VENDA_AFILIADA`) e `UPSERT_TRANSACAO` (`ResultadoIngestao{transacao, foi_criada,
  campos_alterados}` em `evento_etapa.resultado` — nunca `_houve_mudanca` no ORM). Etapas
  4–6 seguem `pulada`. `EventoCanonico` **movido para `core/pipeline/`** + contrato
  `ExecutorEtapaExterno`; a plugagem é um **módulo de composição na raiz**
  (`src/pipeline-wiring.module.ts`). **Status sem adapter:** `financeiro/domain/status-map/`
  (`MAPAS_STATUS` vazio na 018 — specs 019–022 populam por fonte); bruto não catalogado →
  `DESCONHECIDO` + revisão (Regra nº 15). **16ª migração Prisma**
  (`20260910123742_financeiro_transacao`): `transacao` + enum `StatusTransacaoCanonico`;
  só índices comuns, **0 `CHECK`/índice parcial/tabela `_audit`**. Catálogo RBAC ganha
  `transacao:ver` (+1). **~2 endpoints de leitura** `/financeiro/transacoes[/:id]`, **0
  endpoint de escrita** (Princípio VIII), 0 público novo. Painel: **Financeiro · Transações**
  (lista + filtros + detalhe com valores por moeda + link p/ o evento de origem). **0 dep
  nova**, **1 migração**, **0 porta nova**, **0 chave `.env` nova**. `CONTEXT_MODULES` = 11.
  Ver [`docs/018-financeiro-transacao-ledger.md`](docs/018-financeiro-transacao-ledger.md).
- ✅ **019 — adapter-tmb** — 1ª das 4 specs de adaptadores da Fase 2. Borda de entrada da
  conta única **`TMB`**: 4 `parse*()` puros (webhook Vendas achatado / webhook Financeiro
  `[{dados}]` nível de parcela / API `GET /api/pedidos` paginada / CSV) → `EventoCanonico`,
  testados contra **fixtures reais sem tocar o banco** (Princípio III). Vive em
  `src/ingestao/adapters/tmb/`; **não importa `financeiro`** — o `status-map/tmb.ts` (bruto
  → `StatusTransacaoCanonico`, por fonte `tmb.webhook-vendas`/`-financeiro`/`.api`/`.csv`)
  mora no `financeiro` e é consumido lá pela etapa 3; `Object.assign(MAPAS_STATUS, { TMB })`.
  **2 webhooks públicos** `POST /webhooks/tmb/{vendas,financeiro}` (auth = `TMB_WEBHOOK_TOKEN`
  via `WebhookAuthenticator`; token errado → 401) + **2 endpoints** `POST /ingestao/tmb/{
  sincronizar,importar-csv}` sob `evento:ingerir` (já existente). Todos só chamam
  `RegistrarEventoService` (etapa 0) — **`worker.service.ts`/`etapas.ts`/`pipeline-wiring`
  sem diff, nenhuma etapa nova**. `TmbApiClient` atrás de interface (`fetch` nativo, 0 dep;
  dublê nos e2e); sem `TMB_API_*` → `/sincronizar` responde **422**. Decisões com o dono do
  produto (2026-09-10): D-01 chave natural `id_origem` = `pedido`; D-02 webhook Financeiro
  (nível de parcela) **colapsa no pedido, último evento vence** (cada parcela = um
  `evento_origem` imutável); D-03 escopo = parser + endpoints finos `/ingestao/tmb/*`.
  Melhoria colateral: `RE_ESTORNO` de `classificar.ts` (006) casa particípios pt-BR
  (`Estornado`/`Reembolsado`/…). TMB não tem assinatura/afiliada; moeda `BRL` na borda.
  **0 migração, 0 tabela, 0 dep nova, 0 chave `.env` nova, 0 porta nova, 0 permissão nova,
  0 frontend.** `CONTEXT_MODULES` = 11. Ver [`docs/019-adapter-tmb.md`](docs/019-adapter-tmb.md).
- ✅ **020 — adapter-asaas** — 2ª das 4 specs de adaptadores da Fase 2 (molde da 019). Borda
  de entrada das **duas contas Asaas** (`ASAAS_PRD`, `ASAAS_SVC`): 3 `parse*()` puros
  (webhook de cobrança `{ event, payment }` / API `GET /v3/payments` paginada `offset`/
  `limit`/`hasMore` / CSV), **recebendo a `conta` como parâmetro** (o payload nunca a
  determina), testados contra **fixtures reais sem tocar o banco**. Vive em
  `src/ingestao/adapters/asaas/`; **não importa `financeiro`** — o `status-map/asaas.ts`
  (`RECEIVED`/`CONFIRMED`/`OVERDUE`/`REFUNDED`/`CHARGEBACK_*`/`DELETED`→canônico,
  compartilhado entre PRD/SVC e entre `asaas.webhook`/`.api`/`.csv`) mora no `financeiro`;
  `Object.assign(MAPAS_STATUS, { ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS })`. **2 webhooks
  públicos por conta** `POST /webhooks/asaas/{prd,svc}` (auth = `ASAAS_<conta>_WEBHOOK_TOKEN`
  via `WebhookAuthenticator`, header `asaas-access-token`; token errado/da outra conta →
  401) + **2 endpoints** `POST /ingestao/asaas/{sincronizar,importar-csv}` sob
  `evento:ingerir` (`conta` obrigatória no corpo). Todos só chamam `RegistrarEventoService`
  (etapa 0) — **`worker.service.ts`/`etapas.ts`/`pipeline-wiring`/`classificar.ts` sem
  diff**. `AsaasApiClient` atrás de interface (`fetch` nativo, 0 dep; header `access_token`,
  NÃO Bearer; base default `https://api.asaas.com/v3`; dublê nos e2e); sem
  `ASAAS_<conta>_API_KEY` → `/sincronizar` responde **422**. Decisões com o dono do produto
  (2026-09-10): A-01 chave natural `id_origem` = `payment.id` (por conta — a
  `PlataformaOrigem` desambigua; N eventos de uma cobrança colapsam na mesma transação,
  último evento vence); A-02 `externalReference` → `referenciaExterna.idOrigem` **sem**
  `plataforma` (o vínculo Asaas↔Guru é da spec 024; `classificar` regra 2 não dispara sem
  `plataforma`); A-03 escopo = parser + endpoints finos `/ingestao/asaas/*`. Ajuste
  sintético (A-05): `payment.deleted === true` → `statusOrigem = "DELETED"` → `CANCELADO`.
  Asaas não tem afiliada; tem assinatura nativa (`subscription` → `RECORRENCIA`); moeda
  `BRL` na borda; **comprador só vem no CSV** (o `payment` traz só `cus_…`). **0 migração, 0
  tabela, 0 dep nova, 0 chave `.env` nova, 0 porta nova, 0 permissão nova, 0 frontend.**
  `CONTEXT_MODULES` = 11. Ver [`docs/020-adapter-asaas.md`](docs/020-adapter-asaas.md).
- ✅ **021 — adapter-guru** — 3ª das 4 specs de adaptadores da Fase 2 (molde da 019/020).
  Borda de entrada das **duas contas Guru** (`GURU_PRD`, `GURU_SVC`): 3 `parse*()` puros
  (webhook de Vendas — objeto de transação / API `GET /api/v2/transactions` **paginação por
  cursor**, janela ≤ 180 dias / CSV), **recebendo a `conta` como parâmetro**, testados
  contra **fixtures reais sem tocar o banco**. Vive em `src/ingestao/adapters/guru/`; **não
  importa `financeiro`** — o `status-map/guru.ts` (`approved`/`completed`→`PAGO`,
  `waiting_payment`/`pending`/`billet_printed`/`processing`/`analysis`/`charging`→`PENDENTE`,
  `delayed`/`in_recovery`→`EM_ATRASO`, `refunded`/`dispute`→`ESTORNADO`,
  `chargeback`→`CHARGEBACK`, `canceled`/`expired`→`CANCELADO`,
  `rejected`/`failed`/`blocked`→`RECUSADO`; ambíguos → revisão) mora no `financeiro`;
  `Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU })`. **2 webhooks públicos
  por conta** `POST /webhooks/guru/{prd,svc}` (auth = **campo `api_token` NO CORPO do JSON**
  — equivale ao Account Token, verificado pelo `WebhookAuthenticator`; diferente do header
  de TMB/Asaas; token errado/da outra conta → 401; `api_token` removido do `payload_bruto`
  — segredo) + **2 endpoints** `POST /ingestao/guru/{sincronizar,importar-csv}` sob
  `evento:ingerir` (`conta` obrigatória no corpo). Todos só chamam `RegistrarEventoService`
  (etapa 0) — **`worker.service.ts`/`etapas.ts`/`pipeline-wiring`/`classificar.ts`/`schema`
  sem diff**. `GuruApiClient` atrás de interface (`fetch` nativo, 0 dep; header
  `Authorization: Bearer`; base default `https://digitalmanager.guru/api/v2`; **cursor** —
  segue `next_cursor` enquanto `has_more_pages`; dublê nos e2e); sem `GURU_<conta>_API_KEY`
  → `/sincronizar` responde **422**; janela > 180 dias → **422** no DTO. Decisões com o dono
  do produto (2026-09-10): G-01 chave natural `id_origem` = `transaction.id` (UUID, por
  conta); G-02 o adapter Guru **NÃO emite `referenciaExterna`** (a Guru é a venda de
  registro — o vínculo Asaas↔Guru é da spec 024, que casa `asaas.externalReference` →
  `guru.transaction.id`); G-03 escopo = parser + endpoints finos `/ingestao/guru/*`. Oferta
  nativa (`product.offer.id`/`name`/`qty` → `oferta.*`); assinatura nativa (`product.type ===
  "plan"` + `subscription` preenchido → `assinatura`; `invoice.cycle` → `numeroCiclo`);
  **moeda exposta** (`payment.currency` ISO 4217 validado; ausente/inválida → `BRL`); papel
  de afiliada (`type === "affiliate"` → `VENDA_AFILIADA`); comprador rico do objeto
  `contact`. **0 migração, 0 tabela, 0 dep nova, 0 chave `.env` nova, 0 porta nova, 0
  permissão nova, 0 frontend.** `CONTEXT_MODULES` = 11. Ver
  [`docs/021-adapter-guru.md`](docs/021-adapter-guru.md).
- ✅ **022 — adapter-hotmart** — 4ª e **última** das 4 specs de adaptadores da Fase 2 (molde
  da 019/020/021). Borda de entrada das **duas contas Hotmart** (`HOTMART_PRD`,
  `HOTMART_SVC`): `parse*()` puros (API `GET /payments/api/v1/sales/history` **paginação por
  cursor** `page_info.next_page_token` / API `GET /payments/api/v1/sales/price/details` — **2ª
  chamada de rede**, merge por `transaction` / CSV / webhook `PURCHASE_*` **stub**),
  **recebendo a `conta` como parâmetro**, testados contra **fixtures reais sem tocar o
  banco**. Vive em `src/ingestao/adapters/hotmart/`; **não importa `financeiro`** — o
  `status-map/hotmart.ts` (`APPROVED`/`COMPLETE`→`PAGO`, `PRINTED_BILLET`/`WAITING_PAYMENT`/
  `UNDER_ANALISYS`/`PROCESSING_TRANSACTION`→`PENDENTE`, `OVERDUE`/`NO_FUNDS`→`EM_ATRASO`,
  `REFUNDED`/`PARTIALLY_REFUNDED`/`DISPUTE`→`ESTORNADO`, `CHARGEBACK`/`PROTESTED`→`CHARGEBACK`,
  `CANCELLED`/`EXPIRED`→`CANCELADO`, `BLOCKED`→`RECUSADO`; `STARTED`/`PRE_ORDER` → revisão)
  mora no `financeiro`; `Object.assign(MAPAS_STATUS, { HOTMART_PRD: HOTMART, HOTMART_SVC:
  HOTMART })`. **2 endpoints** `POST /ingestao/hotmart/{sincronizar,importar-csv}` sob
  `evento:ingerir` (`conta` obrigatória no corpo) + **2 webhooks públicos por conta**
  `POST /webhooks/hotmart/{prd,svc}` — **STUB** (a Hotmart não tem webhook na v1): flag
  `HOTMART_WEBHOOK_ENABLED` (default `false`) → **503** antes de autenticar; `=true` →
  autentica `hottok` (`HOTMART_<conta>_WEBHOOK_TOKEN` via `WebhookAuthenticator`, header
  `X-HOTMART-HOTTOK`|`Bearer`) → parseia (sem `hottok`) → registra `hotmart.webhook` → **200**.
  Todos só chamam `RegistrarEventoService` (etapa 0) — **`worker.service.ts`/`etapas.ts`/
  `pipeline-wiring`/`classificar.ts`/`schema` sem diff**. `HotmartApiClient` atrás de
  interface (`fetch` nativo, 0 dep): **OAuth2 `client_credentials`** — token Basic +
  `client_id`/`client_secret` → `access_token` **cacheado em memória por conta**; `GET
  {base}/sales/{history,price/details}` (`start_date`/`end_date` em epoch ms; `page_token`
  cursor); base default `https://developers.hotmart.com/payments/api/v1`; dublê nos e2e (2
  métodos); sem `HOTMART_<conta>_CLIENT_ID`/`_CLIENT_SECRET`/`_API_KEY` → `/sincronizar`
  responde **422**; janela > 365 dias → **422** no DTO. Decisões com o dono do produto
  (2026-09-10): H-01 credenciais OAuth = **4 chaves `.env` novas** `HOTMART_{PRD,SVC}_CLIENT_
  {ID,SECRET}` (`_API_KEY` guarda o token Basic; `_WEBHOOK_TOKEN` o `hottok`); H-02 `GET
  /sales/price/details` entra como **2ª chamada de rede** (merge por `transaction` — `vat`+
  `fee` refinam `valores.taxas`, `coupon`/`base` só no `payload_bruto`); H-03 escopo =
  parsers puros + endpoints finos `/ingestao/hotmart/*` + webhook **stub desligado**. Chave
  natural `id_origem` = `purchase.transaction` (`"HP…"`, por conta); `statusOrigem` =
  `purchase.status` cru; moeda sempre exposta (`price.currency_code`/`.currency_value`/coluna;
  inválida → `BRL`); papel de afiliada (`commission_as === "AFFILIATE"` → `VENDA_AFILIADA`);
  assinatura (`is_subscription` + `recurrency_number` → `RECORRENCIA` p/ ciclos > 1); **nunca
  emite `referenciaExterna`**; comprador rico só no webhook. `ocorridoEm` = `approved_date` ??
  `order_date` (epoch ms). **0 migração, 0 tabela, 0 dep nova, 0 porta nova de aplicação, 0
  permissão nova, 0 frontend.** Chaves `.env` novas: `HOTMART_{PRD,SVC}_CLIENT_{ID,SECRET}` +
  `HOTMART_WEBHOOK_ENABLED`. `CONTEXT_MODULES` = 11. Ver
  [`docs/022-adapter-hotmart.md`](docs/022-adapter-hotmart.md).
- ✅ **023 — catalogo-produto-oferta** — 4ª fatia da Fase 2 (Financeiro). `catalogo` deixa de
  ser vazio: dono de **`produto`** (auto-criado, código de 3 letras) e **`oferta`**
  (resolvida por `(tag AEN, plataforma)` — a mesma oferta comercial em 2 plataformas vira 2
  registros). Decodificador de tag **puro** (`PCS48XAV` → produto 3 + turma 2 + subproduto 1
  + modelo de cobrança 1 + modelo de transação 1 — os 3 códigos de 1 char ficam **crus**, sem
  tradução, já que o mapeamento de negócio não está documentado em lugar nenhum do projeto)
  + 2 localizadores genéricos (âncora exata / texto livre `#TAG`) — **5 contas** resolvem por
  tag com auto-criação; as **2 contas Hotmart** resolvem **só** por catálogo importado via
  CSV (`price_code` exato, decisão de negócio já confirmada — nunca auto-cria, nunca cai pra
  tag). Precedência **curado > derivado > null** por colunas distintas +
  `marcarEditado`/`aplicarSeNaoEditado` (Princípio VII). **Etapa 5 do pipeline
  (`RESOLVER_OFERTA`)** plugada via o mesmo `ExecutorEtapaExterno` do `core` que a 018 já
  criou — **nenhuma mudança em `WorkerService`/`etapas.ts`**. `oferta_catalogo` (ticket,
  preço de tabela, tempo de acesso, bônus, combo) é **100% curado** e **exclusivo por
  oferta** (decisão do dono do produto — nunca compartilhado entre ofertas irmãs de
  plataformas diferentes). **17ª migração Prisma** (1ª do `catalogo`): `produto`, `oferta`,
  `oferta_origem_ref`, `oferta_catalogo` (+ `oferta_catalogo_bonus`/`_combo_item`, tabelas de
  junção reais — nunca array), `janela_lancamento` (só CSV — Princípio VIII), `catalogo_audit`
  (forma canônica do core, append-only) + `FK transacao.oferta_id → oferta.id`
  (não-destrutiva, coluna já reservada desde a 018). Catálogo RBAC ganha
  `produto:{ver,editar}` + `oferta:{ver,criar,editar}`. **~8 endpoints**:
  `GET/PUT /produtos[/:codigo]`, `GET/POST/PATCH /ofertas[/:id]`,
  `POST /catalogo/hotmart/importar-{produtos,ofertas,lancamentos}` (3 dos 4 CSVs da v1 —
  `afiliados.csv` é escopo da spec 026). Painel: **Catálogo · Produtos** e
  **Catálogo · Ofertas** (lista + detalhe com curadoria de identidade e de
  `oferta_catalogo` + tela de import dos 3 CSVs). **0 dep nova**, 1 migração, `CONTEXT_MODULES`
  segue 11. 1 decisão real (escopo de `oferta_catalogo` entre plataformas, explicitamente
  sinalizada como não confirmada na própria visão) foi ao dono do produto em 2026-09-11; as
  demais resolvidas como defaults documentados. Ver
  [`docs/023-catalogo-produto-oferta.md`](docs/023-catalogo-produto-oferta.md).
- Próxima: **024 — vinculo-asaas-guru** (Fase 2 — Financeiro).

Ordem de construção acordada: **CRM → Financeiro → Marketing → Central de Clientes**
(precedidas pelas fatias transversais `core`, `clientes`, `ingestao`). Restam em aberto o
default do modelo de atribuição de Marketing e as decisões específicas de CRM (visão
Parte 8.12).
