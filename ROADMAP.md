# Roadmap de Specs — Projeto Pandora

Checklist de **todas as specs** necessárias para entregar o escopo inteiro (backend Node.js +
NestJS + Prisma e frontend React), da fundação à Central de Clientes.

## Como ler

- Cada item é **uma spec** — uma pasta `specs/NNN-nome/` que percorre o ciclo completo do
  Spec Kit: `specify → clarify → plan → tasks → implement`. Marcar o checkbox = spec
  **implementada e validada** (não só planejada).
- **Ordem de fases** segue a prioridade do dono do produto:
  **Fundações → CRM → Financeiro → Migração → Marketing → Central de Clientes → Polimento.**
- Dentro de cada fase, specs sem dependência entre si podem correr em paralelo.
- `⚠ clarify` marca uma decisão que **precisa ser respondida no `clarify`** antes do `plan`
  (Princípio II da constituição).
- Toda spec entrega **backend + frontend** da sua fatia, salvo onde indicado "sem frontend".
- Referências: escopo em [`Projeto_Pandora_-_Visão_geral_para_refatoração.md`](Projeto_Pandora_-_Visão_geral_para_refatoração.md),
  princípios em [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

---

## Fase 0 — Fundações transversais

Precedem tudo. Nenhuma feature de produto começa antes desta fase fechar.

- [x] **001 — bootstrap-projeto** — ✅ implementada e validada (2026-09-01)
  Monorepo npm workspaces, scaffold NestJS 11 (módulo por bounded context: `ingestao`,
  `financeiro`, `catalogo`, `contratos`, `clientes`, `crm`, `marketing`, `central`, `core`,
  `api`, `admin`), Prisma 6 + PostgreSQL 16, config zod por `.env` por conta (7 contas), CI
  no GitHub Actions, lint/format, harness de teste contra Postgres real (schema isolado por
  execução). Frontend: scaffold Vite 6 + React 19 + TS + Tailwind v4 (CSS-first) + TanStack
  Query + React Router 7, tokens da marca (azul `#2E4E78`, coral `#EC5F6A`, menta `#68C0B2`,
  Inter) num ponto único, shell de layout. `core` já entrega `EntidadeId` (UUID v7) +
  `PlataformaOrigem`. Portas: backend 3001, frontend 5174, Postgres dev 55432. Detalhe:
  [`specs/001-bootstrap-projeto/`](specs/001-bootstrap-projeto/) e
  [`docs/001-bootstrap-projeto.md`](docs/001-bootstrap-projeto.md).

- [x] **002 — core-value-objects** — ✅ implementada e validada (2026-09-03)
  Primitivas canônicas do `core` (sem banco, sem endpoint, sem frontend). `Dinheiro`
  (`bigint` valor interno, escala ×10000, sem float, `moeda` obrigatória, soma/ordem só
  entre a mesma moeda) + `Moeda` = **código ISO 4217 validado** (conjunto aberto porém
  validado) + `ratear`/`ratearPorPesos` (maior-resto, soma exata); `multiplicarPorEscalar`
  só aceita fator inteiro. Tempo: `parseInstante` de borda (ISO c/ e s/ fuso → UTC + motivo,
  epoch s/ms por limiar `1e11`, `Date`; lixo → `null` + motivo; **livre de locale**, matriz
  de `TZ` na CI) + `agoraUtc()`. Status: enums `StatusTransacaoCanonico` (8) e
  `StatusContratoCanonico` (`ATIVO`/`EXPIRADO`/`CANCELADO`/`DESCONHECIDO`) + funções puras
  `liberaAcesso` (`EM_ATRASO`→`true`, core permissivo) / `contaComoReceita` /
  `contratoLiberaAcesso`, e rede de segurança `paraStatusTransacaoCanonico` → `DESCONHECIDO`
  + revisar. Auditoria: contrato `EntidadeAuditavel` + forma canônica `RegistroAuditoria`
  (`origem` enum fechado `CURADORIA`/`AJUSTE_MANUAL`/`MIGRACAO`) + `montarRegistroAuditoria`
  — sem tabela. Config: `core` re-exporta o contrato tipado; regra ESLint barra
  `process.env` fora de `config/`/`core/`/`main.ts`. 113 testes unitários verdes. Detalhe:
  [`specs/002-core-value-objects/`](specs/002-core-value-objects/) e
  [`docs/002-core-value-objects.md`](docs/002-core-value-objects.md).

- [x] **003 — auth-servico-jwt** — ✅ implementada e validada (2026-09-03)
  Módulo de **infra transversal** `backend/src/auth/` (não é um 12º bounded context;
  `CONTEXT_MODULES` segue com 11). `POST /auth/token` troca `SERVICE_CLIENT_ID`/
  `SERVICE_CLIENT_SECRET` (comparação em tempo constante) por um **JWT HS256** assinado com
  `SERVICE_JWT_SECRET` — _stateless_, sem persistência, sem refresh; TTL `SERVICE_JWT_TTL`
  (default `12h`, **teto rígido 24 h**, convertido para segundos no `env.schema`); 400
  (malformado) / 401 genérico (credencial) / 429 (_rate limit_ leve in-house por IP).
  `JwtAuthGuard` como `APP_GUARD` — **API fechada por padrão**; allowlist explícita:
  `@Public()` em `/health` e `/auth/token` + prefixo `/webhooks/` (`PUBLIC_PATH_PREFIXES`);
  `NotFoundAuthFilter` faz caminho inexistente sem token válido → 401 (não 404). Header
  `Bearer` _case-insensitive_, header repetido → 401, _clock skew_ 60 s, `alg` travado em
  HS256. `WebhookAuthenticator` (exportado do `AuthModule`) — verifica
  `<PLATAFORMA>_WEBHOOK_TOKEN` por conta em tempo constante, **separado** do JWT; conta sem
  token → recusado; sem rota `/webhooks/*` ainda. `SERVICE_JWT_SECRET`/`SERVICE_CLIENT_ID`/
  `SERVICE_CLIENT_SECRET` **promovidas a obrigatórias** no `env.schema` em todo `NODE_ENV`
  (CI + harness e2e passam fixtures); `+ CORS_ORIGIN`, `RATE_LIMIT_*`, `VITE_API_BASE_URL`.
  Frontend: tela `/login` (fora do `AppShell`), `AuthProvider` + `useAuth`
  (`src/auth/auth-context.ts`), token em `localStorage` (`pandora.token`, _fallback_ em
  memória), `decode-jwt` (logout proativo por `exp`), `apiFetch` central (injeta
  `Authorization`; 401 ≠ `/auth/token` → limpa token + reconduz ao Login **uma vez**),
  `RequireAuth`, botão "Sair". `vite.config.ts` lê o `.env` da raiz (`envDir: '..'`). +1 dep
  backend (`@nestjs/jwt`), 0 dep frontend, 0 migração, 1 endpoint. Decisões CL-01 (TTL 12 h)
  e CL-02 (`localStorage`) resolvidas com o dono do produto em 2026-09-03. 167 testes
  unitários backend + 22 frontend + 29 e2e verdes. Detalhe:
  [`specs/003-auth-servico-jwt/`](specs/003-auth-servico-jwt/) e
  [`docs/003-auth-servico-jwt.md`](docs/003-auth-servico-jwt.md).

- [x] **004 — rbac** — ✅ implementada e validada (2026-09-03)
  Matriz de autorização **única** por cima do JWT da 003 (`auth` segue infra transversal;
  `CONTEXT_MODULES` = 11). **Catálogo de permissões no código** (`recurso:acao` congelado:
  `perfil:administrar` + `lead:{criar,editar,ver_todos,ver_proprios}`; `assertCatalogoCoerente()`
  aborta no boot). **1ª migração de negócio** do projeto: Prisma `usuario` / `perfil` /
  `perfil_permissao` / `usuario_perfil` / `rbac_audit` (PK UUID v7 na app, `@db.Timestamptz`);
  `prisma/seed.ts` idempotente cria o perfil de sistema `administrador` (dev/e2e/CI).
  **`PermissionGuard` = 2º `APP_GUARD`** (depois do `JwtAuthGuard`): `@RequerPermissao(...)`
  (E) + `@AutenticadoBasta()`; rota autenticada **sem marcador → 403** (fechado por omissão,
  CL-03); 403 ≠ 401, corpo genérico. **Permissões efetivas resolvidas a cada requisição**
  (`SujeitoRbacService`, CL-02, sem _staleness_; JWT segue fino): credencial de serviço →
  `administrador` = catálogo inteiro (special-case, não depende do seed). Endpoints
  `/admin/rbac/*` (todos sob `perfil:administrar`): `GET permissoes`,
  `GET/POST/PATCH/DELETE perfis`, `GET/POST usuarios`, `GET/PUT usuarios/{id}/perfis`;
  `+ GET /auth/permissoes-efetivas` (`@AutenticadoBasta`). Toda escrita audita em
  `rbac_audit` via `montarRegistroAuditoria` do core — só _delta_ real, append-only (1ª
  tabela `_audit` do projeto; painel = 053). Frontend: item **Administração** (abas
  Perfis/Usuários) atrás de `perfil:administrar`; `RequirePermissao` + `usePermissoesEfetivas`
  (zero permissão _hardcoded_); `apiFetch` trata **403** num ponto único (banner, não
  desloga). **0 dep nova**, 1 migração, 10 endpoints (5 de escrita). Decisões CL-01
  (Postgres+Prisma), CL-02 (resolução por requisição), CL-03 (negar por padrão) + criação
  de `usuario` (`POST`+`GET`) + abas do painel — resolvidas com o dono do produto em
  2026-09-03. 201 testes unitários backend + 31 frontend + 59 e2e verdes. Detalhe:
  [`specs/004-rbac/`](specs/004-rbac/) e [`docs/004-rbac.md`](docs/004-rbac.md).

- [x] **005 — pessoa-identidade-dedup** — ✅ implementada e validada (2026-09-03)
  1ª entidade de negócio de um contexto de domínio (`clientes` deixa de ser módulo vazio;
  `CONTEXT_MODULES` segue 11). **Domínio puro** (`backend/src/clientes/domain/`, sem banco):
  `documento` (DV de CPF/CNPJ à mão, 0 dep), `normalizar` (e-mail `lowercase`+`trim` **sem**
  heurística de provedor; telefone E.164, `+55` na borda; documento só dígitos),
  `resolverIdentidade(dados, candidatos) → {pessoaId, criterio, confianca, candidatos[]}`
  (pura/determinística; ordem fixa **documento → cnpj → email → telefone**; match único
  resolve; **ambíguo descarta o critério**; nada → `null`+candidatos; segue `mergedPara`),
  `merge-plano` (plano de merge + de reversão; `curado` pré-merge volta, `curado` pós-merge
  prevalece → `Divergencia`). **`resolverOuCriar`** (serviço transacional, idempotente;
  anexa `pessoa_origem_ref`, rotaciona contato não curado, curado em conflito → secundário +
  `nota_reconciliacao`; cria `pessoa` se não resolveu; `criar:false` p/ afiliada → `null`)
  — **porta** exportada que a 018 vai consumir (sem endpoint agora). **CRUD manual completo**
  (CL-02): `GET /pessoas` (busca nome/e-mail/telefone/doc), `GET /pessoas/{id}`,
  `POST`/`PATCH` (`pessoa:editar`; campo tocado vira `curado`; 409 `{pessoaId}` sem fundir;
  remover última âncora → 400), `POST /pessoas/{id}/merge` + `.../desfazer` (`pessoa:merge`,
  **reversível em qualquer ordem** — CL-03: `snapshot` Json + `origemMergeId` por linha);
  **sem `DELETE`** (exclusão = pseudonimização, spec 047). `conta` (CL-01, modelada por
  completo): `GET` (`conta:ver`), `POST`/`PATCH`/associar/desassociar (`conta:editar`),
  `merge`/`desfazer` (`conta:merge`) — HOUSEHOLD|EMPRESA, **não** toca `contrato` (regra #3).
  **2ª+3ª migração Prisma** (`20260903141931_clientes` + `..142000_clientes_primario_unico`):
  `pessoa` (`pseudonimizada_em?` reservado 047; `merged_para?`; `conta_id?`), `conta`,
  `pessoa_{email,telefone,documento,endereco}` (`curado` + `origem_merge_id`; índice único
  parcial `WHERE primario`), `pessoa_origem_ref` (`@@unique` — id de origem nunca PK),
  `merge_pessoa`/`merge_conta`/`nota_reconciliacao`/`clientes_audit` (append-only, forma
  canônica do core). **RBAC 004 estendido**: catálogo ganha `pessoa:{ver,editar,merge}` +
  `conta:{ver,editar,merge}` (`administrador` + credencial de serviço concedem de graça,
  sem migração de dados). Frontend: itens **Pessoas**/**Contas** atrás de `*:ver`, rotas sob
  `RequirePermissao`, telas de lista/detalhe/criação + Unificar; `apiFetch` já trata 401/403.
  **0 dep nova**, 2 migrações, ~16 endpoints. 240 unit backend + 40 frontend + 86 e2e verdes.
  Clarificações CL-01/CL-02/CL-03/CL-04 resolvidas com o dono do produto em 2026-09-03.
  Detalhe: [`specs/005-pessoa-identidade-dedup/`](specs/005-pessoa-identidade-dedup/) e
  [`docs/005-pessoa-identidade-dedup.md`](docs/005-pessoa-identidade-dedup.md).

- [x] **006 — evento-origem-worker** — ✅ implementada e validada (2026-09-03)
  2º _bounded context_ de domínio com entidade de negócio (`ingestao` deixa de ser vazio;
  `CONTEXT_MODULES` segue 11). Materializa o Princípio IV. **Domínio puro**
  (`backend/src/ingestao/domain/`, sem banco): `evento-canonico.ts` (schema `zod` do contrato
  **`EventoCanonico`** que os adapters 019–022 vão produzir), `hash-evento.ts`
  (`sha256(canonicalizar(payload))` — determinístico, livre de locale; dedup), `classificar.ts`
  (enum **congelado** `Classificacao`; regras locais — estorno→`REEMBOLSO`, `ehAfiliada`→
  `VENDA_AFILIADA`, assinatura→`RECORRENCIA`; o que depende de casar Asaas↔Guru →
  `DESCONHECIDO`+`revisar` p/ 024/026; nunca um palpite — regra #15), `etapas.ts` (registro
  **ordenado com dependências declaradas**), `plano-passada.ts` (puro:
  `EXECUTAR|BLOQUEADA|JA_OK|ESGOTADA` + `status` do evento derivado). **Etapas 2–6 = _no-op_
  `pulada`** — specs 018/023/024/025 trocam o executor via `WorkerService.definirExecutor(...)`
  sem tocar o worker. **Porta exportada** `RegistrarEventoService.registrarEvento` (etapa 0:
  `hash` + upsert idempotente pela chave; reentrega → `criado:false` + `reentregas++`).
  **`WorkerService.processarPassada()`**: seleciona elegíveis, mutex por evento, cada etapa
  em **transação própria**, idempotente; retry até `INGESTAO_WORKER_MAX_TENTATIVAS` (3) →
  depois `erro` terminal até reprocesso (CL-05); dependência não-`ok` → dependente
  `bloqueada` (CL-04). **`WorkerScheduler`** = `setInterval` in-house (0 dep), env
  `INGESTAO_WORKER_{ENABLED,INTERVALO_MS,MAX_TENTATIVAS,LOTE}`, desligado em teste.
  Reprocessamento manual → 1 `ingestao_audit` (forma canônica do core, append-only; o worker
  não audita). **4ª migração Prisma** (`20260903171321_ingestao`): `evento_origem`
  (`@@unique(plataforma_origem,id_origem,hash)` = dedup; `status` **derivado**; `id_origem`
  nunca PK), `evento_etapa` (`@@unique(evento_origem_id,etapa)`), `ingestao_audit`. **5
  endpoints** (`/ingestao/eventos`): `POST` (`evento:ingerir`), `POST /processar` +
  `POST /{id}/reprocessar` (`evento:reprocessar`), `GET` + `GET /{id}` (`evento:ver`); **sem
  `/webhooks/*`** (019–022). **RBAC 004 estendido**: `evento:{ver,reprocessar,ingerir}`.
  Frontend: item **Eventos** atrás de `evento:ver`, lista com filtros (default `revisar`+
  `erro`) + detalhe com `payload_bruto` e linha do tempo das 7 etapas + **Reprocessar**.
  **0 dep nova**, 1 migração, 5 endpoints. 270 unit backend + 44 frontend + 113 e2e verdes.
  Clarificações CL-01..CL-05 resolvidas com o dono do produto em 2026-09-03. Detalhe:
  [`specs/006-evento-origem-worker/`](specs/006-evento-origem-worker/) e
  [`docs/006-evento-origem-worker.md`](docs/006-evento-origem-worker.md).

---

## Fase 1 — CRM (prioridade 1)

100% in-house. Escopo completo (Parte 8). Cada spec consome o contrato de eventos da 006;
o Financeiro preenche esses eventos de verdade na fase 2.

- [x] **007 — crm-administracao** — ✅ implementada e validada (2026-09-03)
  3º _bounded context_ de domínio (`crm` deixa de ser vazio; `CONTEXT_MODULES` segue 11).
  Módulo de Administração do CRM (visão Parte 8.11) **sem reimplementar a 004** (perfis/
  permissões/usuários seguem lá — só estende o catálogo com o recurso `crm_admin`). **Domínio
  puro** (`backend/src/crm/domain/`): **`estaEmExpediente(instante, {janelas, feriados,
  equipe?}) → boolean`** — pura, determinística, **livre de locale** (converte p/
  America/Sao_Paulo via `Intl` nativo, **0 dep**, matriz `TZ` na CI); início inclusivo/fim
  exclusivo; feriado subtrai **mesmo dentro** da janela; recorrente casa `(mês,dia)` exato
  (29/02 não desloca — CL-04); **união** global ∪ equipe ativa (CL-01, nunca _override_); sem
  janela aplicável → `false`. `cifra.ts` (AES-256-GCM `node:crypto`), `api-key.ts` (`crm_`+40
  hex **só-hash**, revelada 1×), `mascarar-segredo.ts`. **5ª migração Prisma**
  (`20260903184256_crm_admin` + `..184300_crm_admin_membro_unico`): `equipe` (sem `DELETE`,
  só `ativo`), `equipe_membro` (FK `usuario` da 004; **índice único parcial**
  `(equipe_id,usuario_id) WHERE saiu_em IS NULL` = ≤1 vínculo ativo por par; remoção =
  `saiu_em`; usuário em N equipes), `janela_atendimento` (`equipe_id?` null=global,
  `dia_semana` 0–6, `hora_*` `Int` minutos locais; `hora_fim>hora_inicio` — CL-02, senão 422
  `janela_invalida`; `DELETE` físico), `feriado` (`data @db.Date`, `recorrente_anual`;
  `DELETE` físico), `integracao` (`tipo API_KEY|WEBHOOK|CONEXAO_INTERNA`, `alvo FINANCEIRO|
  MARKETING|CENTRAL|EXTERNO`, `config` jsonb **sem segredo**, `ativo`, `ultimo_uso_em?`
  reservado 011/019–022; segredo **cifrado em repouso** OU `segredo_hash`+`segredo_ultimos4`;
  **sem `DELETE`**), `crm_admin_audit` (forma canônica do core, `AJUSTE_MANUAL`,
  **append-only**, só delta real; segredo como marcador `{segredo:'definido'|'rotacionado'}`).
  **Contrato de segurança** (teste e2e faz `grep` do valor = 0): leitura projeta só
  `segredoDefinido`+`segredoMascarado`; API key revelada 1× na criação/rotação; `rotacionar`
  de `CONEXAO_INTERNA` sem segredo → 409; `config` com chave `token`/`secret`/`apiKey`/
  `password` → 422. Chave **`CRM_INTEGRACAO_CIFRA_KEY`** (base64 32 bytes) **obrigatória em
  todo `NODE_ENV`** (boot aborta sem ela); `core` re-exporta `cifraIntegracaoKey(cfg)`.
  **RBAC 004 estendido**: `crm_admin:{ver,gerir_equipes,gerir_expediente,gerir_integracoes}`
  (`administrador` + credencial de serviço de graça, **0 migração de dados/seed**).
  **~22 endpoints** `/crm/admin/**` (leitura → `crm_admin:ver`, escrita → `gerir_*`) +
  `GET /crm/admin/expediente?instante=&equipeId=` (reusa a função pura; lixo → 400) +
  `GET /crm/admin/auditoria` (local; consolidado = 053). **Frontend** `frontend/src/crm-admin/`:
  item **CRM · Administração** atrás de `crm_admin:ver`, rota sob `RequirePermissao`, abas
  Equipes / Expediente / Integrações (escrita só com `gerir_*`; máscara de segredo; _reveal_
  1× não-persistente; indicador "no expediente agora?"). **0 dep nova**, 1 migração (2
  arquivos), +1 chave `.env`. 296 unit backend + 50 frontend + 133 e2e verdes. Clarificações
  CL-01 (união global+equipe), CL-02 (rejeitar janela que cruza meia-noite), CL-03 (escala
  por atendente fora de escopo), CL-04 (feriado 29/02 não desloca) — dono do produto,
  2026-09-03. Detalhe: [`specs/007-crm-administracao/`](specs/007-crm-administracao/) e
  [`docs/007-crm-administracao.md`](docs/007-crm-administracao.md).

- [ ] **008 — crm-lead**
  Entidade `lead` compartilhada (acesso via RBAC), campos personalizados das alunas,
  lead scoring automático. Transição Lead → `pessoa` na 1ª venda pela engine da 005.
  ⚠ clarify: registro de Lead é arquivado/linkado ou os dados migram fisicamente?
  Frontend: lista/detalhe de leads.

- [ ] **009 — crm-interacao-timeline**
  `interacao` (WhatsApp, nota, ligação, ticket, NPS) — timeline unificada por `pessoa`/
  `lead`. Notas internas, tags/categorização, `tag`/`segmento` (por query salva).
  Frontend: timeline unificada.

- [ ] **010 — crm-pipeline**
  `pipeline` / `oportunidade` (etapas configuráveis, `valor_estimado: Dinheiro`,
  responsável, motivo de ganho/perda). Presença em múltiplos pipelines, atribuição
  automática (round robin / regra), SLA por etapa + alerta de estouro, histórico/auditoria
  de mudança de etapa, alerta de lead esfriando. **Observa** status de pagamento do
  Financeiro (evento), nunca escreve; "ganho" nunca cria/antecipa Contrato.
  Frontend: board Kanban.

- [ ] **011 — crm-whatsapp-integracao**
  Provedor WhatsApp Business API, conexão, `template_whatsapp` (nome Meta, categoria,
  corpo, `status_aprovacao`), janela de atendimento de 24h, webhook de recebimento →
  `interacao` + `evento_origem`, gestão de opt-out/descadastro (LGPD).
  ⚠ clarify: Cloud API oficial da Meta ou via BSP (Twilio, Take Blip, Zenvia, 360dialog)?
  Frontend: configuração de canal e templates.

- [ ] **012 — crm-chat-ao-vivo**
  Fila de atendimento com priorização, endereçamento a atendente, transferência de conversa
  com contexto preservado, CSAT pós-atendimento, resposta automática fora do expediente,
  SLA de 1ª resposta + alerta, log de auditoria (quem respondeu, com/sem IA).
  ⚠ clarify: endereçamento aleatório puro ou por carga/disponibilidade?
  Frontend: inbox de atendimento.

- [ ] **013 — crm-faq-e-sugestao-ia**
  `faq_item` (produto FK nullable OU campanha FK nullable — exatamente um), FAQ por produto
  (persiste) e por lançamento (condições exclusivas), versionamento (quem/quando).
  `sugestao_ia` (resposta sugerida, campo personalizado sugerido — nunca envia/grava
  sozinha; ciclo de governança de 3 etapas da Parte 10.6). IA identifica múltiplas
  perguntas numa mensagem; gera campos personalizados (reaproveita projeto Noctua).
  Feedback loop (útil / não útil). Frontend: editor de FAQ + painel de sugestões.

- [ ] **014 — crm-workflow**
  `fluxo_automacao` (versão, gatilho, blocos jsonb, `publicado_em`) + `execucao_fluxo`
  (`trigger_evento`, status, `log_passos`). Blocos gatilho → condição → ação, condições
  compostas E/OU, biblioteca de automações prontas, ambiente de teste/simulação antes de
  publicar, versionamento imutável (editar = nova versão), triggers por eventos externos
  (pagamento aprovado, inscrição em lançamento) via projeção de `evento_origem` — nunca
  polling. Idempotente (reprocessar não duplica envio). Frontend: editor visual de fluxo.

- [ ] **015 — crm-disparos**
  `execucao_disparo` (template FK, segmento/lista, `agendado_para`, status) +
  `mensagem_enviada` (status de entrega). Segmentação minuciosa (filtro na plataforma ou
  import CSV), agendamento, throttling p/ preservar quality rating, quality rating visível,
  testes A/B, dedup de contatos antes do envio, respeito automático a opt-out +
  `preferencia_comunicacao`, export de resultados, log de erros. Frontend: construtor de
  disparo + visão geral.

- [ ] **016 — crm-tarefas**
  `tarefa` / `nota` ligadas a `pessoa` / `oportunidade`. Checklists, agenda, cronômetro por
  tarefa, gamificação, notificações/lembretes, delegação/reatribuição, dependência entre
  tarefas, geração automática a partir de eventos de Pipeline/Workflow.
  Frontend: gestor de tarefas (pessoal e geral).

- [ ] **017 — crm-dashboard**
  Métricas **derivadas por query** (nunca contador): gráficos, benchmarks, correlação,
  rank por integrante do comercial, filtro por data/período, dashboards configuráveis por
  perfil, export PDF/Excel, alertas de meta, funil de conversão visual, métricas de
  qualidade de atendimento (tempo médio de resposta, CSAT, taxa de resolução).
  Frontend: dashboards.

---

## Fase 2 — Financeiro (prioridade 2)

Reconstrução do núcleo já existente (Partes 1–6). O pipeline canônico de ingestão (5.3) é
montado aqui, etapa por etapa.

- [ ] **018 — financeiro-transacao-ledger**
  `transacao` normalizada (1 por `(plataforma_origem, id_origem)`), campos financeiros como
  `Dinheiro` + `status_canonico` + FKs opcionais (oferta, contrato, cliente,
  `transacao_vinculada`). Pipeline etapas 1–3: classificar `tipo`
  (`VENDA_PROPRIA` | `VENDA_AFILIADA` | `COBRANCA_TERCEIRIZADA` | `REEMBOLSO` | …) antes de
  qualquer efeito colateral; resolver pessoa (usa 005); upsert transação retornando
  `ResultadoIngestao{transacao, foi_criada, campos_alterados}`. `GET /transacoes` (muitos
  filtros), `GET /transacoes/{id}`. Frontend: lista/detalhe de transações.

- [ ] **019 — adapter-tmb**
  Adapters TMB: webhook Vendas (payload achatado) + webhook Financeiro (nível de parcela,
  só `status_financeiro`), API `GET /api/pedidos`, CSV. `parse(payload|linha) →
  EventoCanonico`. `status_map/tmb/{api,csv}` versionados. Fixtures reais. Webhooks
  públicos `POST /webhooks/tmb/{vendas,financeiro}`. Sem frontend.

- [ ] **020 — adapter-asaas**
  Adapters Asaas (contas PRD e SVC): webhook por conta, API `GET /payments`, CSV.
  `externalReference` como ponte para a Guru. `status_map/asaas/{api,csv}`. Webhooks
  `POST /webhooks/asaas/{prd,svc}`. Sem frontend.

- [ ] **021 — adapter-guru**
  Adapters Guru (contas PRD e SVC): webhook por conta, API `GET /transactions` (janelas
  ≤180d, cursor), CSV. Datas em formatos variados (parser tolerante da 002). Oferta, cupom,
  garantia, assinatura nativos. `status_map/guru/{api,csv}`. Webhooks
  `POST /webhooks/guru/{prd,svc}`. Sem frontend.

- [ ] **022 — adapter-hotmart**
  Adapters Hotmart (contas PRD e SVC): OAuth2 client_credentials, API `GET /sales/history`
  + `GET /sales/price/details`, CSV. `is_subscription` no payload. Sem webhook na v1
  (adapter `hotmart/webhook` previsto para feature futura). `status_map/hotmart/api`.
  Sem frontend.

- [ ] **023 — catalogo-produto-oferta**
  `produto` (id surrogate, `codigo` de 3 letras = alias único, `nome`/`assinatura`
  curados). `oferta` (id surrogate; produto FK, turma nullable/enum
  `{TURMA(n) | EVERGREEN | PERPETUO}`, subproduto, modelo de cobrança, flags).
  `oferta_origem_ref` (resolução por `(tag AEN, plataforma)`, `hotmart_code`, `offer.code`).
  `oferta_catalogo` 1:1 opcional (`ticket`, `preco_tabela`, `tempo_acesso`, `bonus[]`,
  `combo`, `produtos_do_combo[]` junção real, `lancamento`). `janela_lancamento` (resolve
  turma por data). Decodificador de tag (1 decodificador, 2 localizadores: ancorado /
  texto livre Asaas). Precedência **curado > derivado da tag > null** (colunas/tabela
  separadas, `marcar_editado` / `aplicar_se_nao_editado`). Pipeline etapa 5 (resolver
  oferta). Curadoria: `PUT /produtos/{codigo}`, `POST/PATCH /ofertas`,
  `PUT /ofertas/{codigo}`. Import catálogo Hotmart (4 CSVs; **`price.code` completo**,
  validado contra schema de colunas antes de processar). Frontend: telas de Produtos e
  Ofertas + curadoria.

- [ ] **024 — vinculo-asaas-guru**
  `vinculo_transacao (id_guru, id_asaas, resolvido_em, origem_ref)`. Pipeline etapa 4
  (nos 2 sentidos de chegada). Regra de receita ("só a Guru soma") como **função de
  leitura** sobre o vínculo, nunca efeito colateral de escrita. Job `vinculo_pendente`
  (casa dados já no banco, sem API). `POST /transacoes/{id}/tentar-vincular`,
  `POST /transacoes/tentar-vincular-pendentes`. Frontend: ação de retry no detalhe da
  transação.

- [ ] **025 — contratos-aditivos-fold**
  `contrato` 1 por `(pessoa, produto)`, perpétuo. Campos **derivados** por fold sobre
  `aditivo`s (`fim_acesso`, `status_canonico`, `acesso_liberado`, `ticket_total`,
  `valor_recebido` — todos `f(eventos)`, nunca incremental). Campos **curados**
  (`tolerancia_atraso`, `contrato_assinado`, ajuste manual com marca de "ajustado em X").
  `fim_acesso = max(fim vigente, data do aditivo) + tempo_acesso`. Rótulo
  renovação/prorrogação derivado do estado de acesso na data. Recálculo determinístico e
  idempotente, testável sem banco. Pipeline etapa 6. `GET /contratos` (busca produto +
  turma), `GET /contratos/{id}`, `PATCH /contratos/{id}` (ajuste manual). Frontend:
  lista/detalhe de contrato + linha do tempo de aditivos.

- [ ] **026 — vendas-como-afiliada**
  `ProdutoAfiliado` curado (import CSV). Classificação `VENDA_AFILIADA` na etapa 1 (antes
  de qualquer efeito colateral): nunca gera Oferta/Contrato/turma/Cliente; `id_cliente`
  nullable; vincula a `pessoa` só se já existe por compra de produto próprio.
  Contabilização à parte, `dict[moeda, valor]` separado. `GET /afiliados`. Frontend: lista
  de afiliados.

- [ ] **027 — reconciliacao-e-alertas**
  `alerta_reconciliacao` — reconciliação tardia, vínculo Asaas↔Guru e afiliados **nunca
  revertem** dado já aplicado, só alertam. Frontend: painel de alertas de reconciliação.

- [ ] **028 — sync-sob-demanda-e-imports**
  `sincronizar_conta`: caminha de hoje para trás em janelas, para sem novidade.
  `sync_run` (início, fim, resultado, janela coberta) + view do estado atual; `checkpoint`
  só retoma execução interrompida. `POST /admin/sincronizar/{conta}` e `/sincronizar-tudo`
  com frase de confirmação validada no backend. `POST /admin/importar-csv/{conta}`
  (encoding explícito ou `charset-normalizer`; valida schema de colunas antes de qualquer
  linha). `POST /admin/catalogo-hotmart/{produtos,ofertas,lancamentos,afiliados}`. Job
  `backup` (dump do banco). Frontend: painel Admin de sync e import.

- [ ] **029 — health-e-observabilidade-ingestao**
  `GET /health` (7 contas: configurado / último evento / defasado / histórico / última
  tentativa). Consolida o painel de eventos `revisar`/`erro` da 006. Frontend: Dashboard
  "7 contas, 1 registro".

- [ ] **030 — financeiro-dashboard-metricas**
  `GET /dashboard/metricas`: total recebido **por moeda**, qtd. de contratos, total de
  afiliada **por moeda**, filtro por produto/oferta. Receita sempre query (pago de fato +
  agrupamento por moeda + papel próprio/afiliada). Nunca soma nem converte moedas.
  Frontend: dashboard financeiro.

---

## Fase 3 — Migração / corte v1 → v2

- [ ] **031 — migracao-reingest-e-corte**
  Re-ingestão dos payloads crus / exportações CSV das 7 contas para `evento_origem`
  (`tipo_origem` real ou `migracao_v1`); projeções se reconstroem. Export do catálogo
  curado da v1 → reimport pelos endpoints de curadoria da v2. Congelar a v1 (read-only).
  Comparar agregados-chave (receita por conta/mês/moeda, contratos ativos, clientes) —
  têm que bater ou a diferença tem que ser explicável. Runbook de corte. Sem frontend novo.

---

## Fase 4 — Marketing (prioridade 3)

"Git do marketing" (Parte 9): versionamento imutável, diff visual, notificação ao Slack.

- [ ] **032 — marketing-campanha-e-versionamento**
  `campanha` (nome/código, tipo `lancamento | perpetuo | evento`, `data_inicio`,
  `data_fim`; isolada — sem FK para outra campanha). `artefato` (campanha FK, tipo,
  dados atuais, `status: rascunho | publicado`). `versao_campo` imutável
  (`artefato`, campo ou célula, `valor_anterior`, `valor_novo`, autor, `criado_em`).
  UI de diff textual (nível palavra/caractere, vermelho/verde) para campos de texto;
  "de X para Y" para número/data. Autoria e timestamp obrigatórios. RBAC único (004).
  Frontend: editor de artefato com histórico e diff.

- [ ] **033 — marketing-notificacao-slack**
  `notificacao_slack` (artefato FK, canal, `enviado_em`, gatilho `"publicado"`) — dispara
  **só** na transição rascunho → publicado, nunca a cada edição. Integração Slack.
  Frontend: configuração de canais por campanha.

- [ ] **034 — marketing-planejamento-cronograma**
  Fases (Antecipação, Aquecimento, Captação, Vendas, Renovação…) com data no ar, data
  limite interna, marco e status por fase — cada fase é um `artefato` versionado. Geração
  automática de tarefas a partir de eventos do cronograma. Frontend: cronograma visual.

- [ ] **035 — marketing-coleta-de-leads**
  Leads/seguidores por dia, CPL pago vs geral, evolução dentro da janela de captação.
  Alimenta `lead` (entidade compartilhada da 008). Integrações **Meta Ads, Google Ads,
  Mautic, landing pages** via `evento_marketing` (mesma infra da 006). Frontend: painel de
  captação.

- [ ] **036 — marketing-atribuicao**
  `atribuicao (transacao_id, campanha_id, modelo, peso)` — serviço **derivado** e
  versionável. Receita por campanha = JOIN `transacao` (pago de fato, por moeda) ×
  `atribuicao`. CAC / ROAS / LTV por campanha como queries.
  ⚠ clarify: modelo de atribuição default (primeiro toque / último toque / linear /
  multi-toque). Frontend: relatórios de atribuição.

- [ ] **037 — marketing-tratamento-de-clientes**
  `tratamento_cliente` (segmento, critério de entrada **derivado** do estado real em
  Financeiro/Contratos, copy/fluxo associado). Segmentos: recém-conhecido, onboarding
  pós-compra, cliente de Produto X, cliente de Produto Y, ex-cliente, inadimplente. Liga
  ao Workflow de Marketing e reusa `tag`/`segmento` do CRM (mesma entidade). Frontend:
  editor de segmentos e réguas.

- [ ] **038 — marketing-workflow**
  Motor de automação de Marketing (mesmos princípios da 014: versionado, testável antes de
  publicar, consome `evento_origem` — nunca polling): dispara e-mail/disparo por data
  agendada, por entrada em segmento (`tratamento_cliente`) ou por evento externo (transação
  paga / em atraso). Reaproveita o motor de envio da 015. Frontend: editor de fluxo.

- [ ] **039 — marketing-emails**
  Sequência de e-mails por fase/momento; cada e-mail é um `artefato` versionado (diff de
  assunto/corpo). Métricas de abertura/clique/cancelamento por variante (double/single
  opt-in). Integração com Mautic. Frontend: editor de e-mails + métricas.

- [ ] **040 — marketing-criativos-paginas-popups**
  `artefato` tipos: **criativo** (peça por formato feed/story, responsável, fase, status de
  copy/arte, CPL por criativo); **pagina** (versiona o conteúdo da landing / obrigado /
  vendas, não só a URL); **popup** (copy de onboarding/checkout, data início/fim). Todos
  versionados com diff. Frontend: telas de criativos, páginas e pop-ups.

- [ ] **041 — marketing-ofertas-e-renovacao**
  Planejamento de oferta no Marketing que **gera/atualiza** o `oferta_catalogo` do
  Financeiro (uma fonte de verdade, não duas). Tabela de renovação por status de acesso
  (vitalício / ativo / inativo) com preço por lote/semana, reusando `oferta_catalogo`.
  Frontend: planejamento de ofertas e renovação.

- [ ] **042 — marketing-planilha-livre**
  `planilha_livre` (artefato FK, template `contatos | tabela_generica | grafico | custom`,
  `colunas jsonb`, `linhas jsonb`); cada célula alterada gera `versao_campo`. Cobre abas
  hoje soltas (PCS Passo 2, MOL06, Parede 10k, Contatos Palestrantes, Atividades
  Congresso). Frontend: editor de planilha com histórico por célula.

- [ ] **043 — marketing-dashboard-metas-mapeamentos**
  Dashboard (vendas totais, novas alunas, renovação, faturamento, cancelamentos — sempre
  derivado). Metas: comparação histórica entre campanhas (investimento, leads captados/
  pagos, CPL, conversão, vendas, faturamento) como query sobre `campanha` + métricas do
  Financeiro. Mapeamentos: **view read-only** de `interacao` (CRM) filtrada por `campanha`.
  Também: Tarefas escopadas a campanha (herda da 016) e Escalas do time de Marketing.
  Gestão da campanha: **Duplicar** (copia artefatos como rascunho independente) e
  **Limpar escopo** (arquiva rascunho atual e abre novo; nunca apaga publicado; exige
  digitar o nome da campanha + permissão elevada de RBAC). Frontend: dashboards + ações de
  campanha.

---

## Fase 5 — Central de Clientes (prioridade 4)

BFF read model **e** portal que a própria aluna acessa (Parte 10). Nunca é dona de dado
financeiro/comercial/identidade — compõe e explica; ações viram comando ao contexto dono.

- [ ] **044 — central-bff-360**
  Endpoints de composição `GET /central/pessoa/{id}`: cadastrais + contatos, contratos +
  estado de acesso, histórico de transações + receita por moeda, timeline de interações/
  tickets, origem de marketing, "próximas ações" (renovação próxima, inadimplência,
  garantia acabando). Cache materializado se a performance exigir. Frontend: visão 360
  interna (suporte, comercial, CS, marketing — acesso por RBAC).

- [ ] **045 — central-portal-da-aluna**
  Autenticação da própria aluna (distinta do JWT de serviço interno), onboarding, shell do
  portal, navegação das áreas abaixo.
  ⚠ clarify: método de login da aluna (e-mail + magic link? senha? SSO?) — não detalhado
  na visão. Frontend: shell do portal + login da aluna.

- [ ] **046 — central-preferencias-de-comunicacao**
  `preferencia_comunicacao` (pessoa FK, canal `email | whatsapp`, tipo `transacional |
  suporte | novidade_curso | novidade_produto | marketing_geral`, status `inscrito |
  descadastrado | bloqueado_permanente`). Central é **dona**; CRM/Marketing/Disparos só
  leem e respeitam. Aviso ao desmarcar lista; **bloqueio permanente** + alerta em tentativa
  futura de reinscrição (exige contato com suporte para liberar). Frontend: central de
  assinaturas da aluna.

- [ ] **047 — central-lgpd-exclusao**
  `solicitacao_exclusao` (pessoa FK, `dados_afetados jsonb`, status `solicitada |
  em_processamento | concluida`, `solicitado_em`, `executado_em`). Fluxo: lista o que
  existe hoje → explica como será apagado e tratado dali em diante → avisa que é
  irreversível → confirmação → executado pelo contexto dono de cada dado. Mecânica =
  **pseudonimização** de `pessoa` (mantém `transacao` e agregados financeiros intactos).
  Frontend: fluxo de solicitação de exclusão.

- [ ] **048 — central-historico-de-contratos-e-economia**
  Lista de contratos da aluna: data de início, termos de uso assinados (link ao
  documento), status financeiro (quitado/inadimplente + quanto falta + link de pagamento),
  resumo de benefícios (juros evitados, desconto sobre `preco_tabela`, valor de bônus
  recebidos), mecânica de incentivo à quitação ("0% de economia" vs "10% de economia"
  explícito), encerramento + possibilidade de renovação/extensão. Tudo **derivado** do
  Contrato no Financeiro. Frontend: histórico + painel de economia.

- [ ] **049 — central-pre-checkout-ofertas-justificadas**
  Funil de pré-checkout: melhores preços disponíveis para a aluna, sempre com a
  **justificativa explícita** de elegibilidade. Composição read-only de `tratamento_cliente`
  (Marketing, 037) + `oferta_catalogo` (Financeiro, 023). A Central não decide a oferta,
  só explica a decisão. Frontend: página de pré-checkout.

- [ ] **050 — central-vinculos-autodeclarados**
  `vinculo_autodeclarado` (pessoa FK, `tipo_documento: cpf | cnpj | email`, valor,
  justificativa, status `pendente | aprovado | rejeitado`, `revisado_por`, `revisado_em`).
  Formulário (apoio de IA no preenchimento é permitido), mas a aprovação é **sempre 100%
  humana** — nunca sugestão de IA (regra 10.2.3, risco de fraude). Se aprovado, aciona
  `merge_pessoa` (005). Frontend: declaração pela aluna + fila de revisão interna.

- [ ] **051 — central-jornada-e-marcos**
  `marco_jornada` (pessoa FK, contrato FK nullable, tipo `recorde | testemunho |
  marco_pessoal`, descrição, data, origem `manual | slack_import`, `curado_por`). Curadoria
  manual (CS/marketing); IA só como rascunho, seguindo o ciclo de governança de 3 etapas.
  Import de compilado de agradecimentos do Slack. Frontend: timeline curada da aluna.

- [ ] **052 — central-recomendacoes-e-dashboard-motivacional**
  `recomendacao` (pessoa FK, tipo, descrição, `criterio_gerador`, `criado_em`, status
  `ativa | resolvida | dispensada`) — sempre **derivada** de query sobre Financeiro/CRM,
  nunca hardcoded. Regras de apresentação: comparação favorável → mensagem festiva;
  comparação desfavorável → **nunca a estatística nua**, vira `Recomendação` acionável com
  comparações concretas; todo widget com potencial de melhoria tem indicador (ícone) →
  hover mostra resumo, clique leva à aba de `Recomendação` filtrada; recorde batido com
  contexto comparativo. Frontend: dashboard motivacional.

---

## Fase 6 — Polimento e cross-cutting final

- [ ] **053 — auditoria-e-observabilidade-global**
  Logs estruturados em todos os contextos; tabelas `_audit` (ou triggers) cobrindo **toda**
  mudança curada e ajuste manual, com "quem" e "quando"; painel de auditoria; alertas
  operacionais. Frontend: painel de auditoria.

- [ ] **054 — governanca-de-ia-transversal**
  Implementação transversal do ciclo de 3 etapas (validação individual → revisão coletiva
  de padrão → generalização opcional) para toda saída de IA em produção: registro de
  sugestões, status, feedback, promoção a regra. Exceção: vínculo auto-declarado (050)
  nunca usa IA na etapa 1. Frontend: painel de governança de sugestões.

- [ ] **055 — hardening-seguranca-e-lgpd**
  Revisão de segurança (`/security-review`), rate limiting, revisão da validação de token
  de webhook, política de retenção de `payload_bruto`, revisão final de LGPD ponta a ponta
  (pseudonimização, opt-out, `preferencia_comunicacao`). Sem frontend novo.

- [ ] **056 — frontend-shell-e-navegacao-unificada**
  Navegação entre os 4 módulos, menu por permissão RBAC, identidade visual consolidada,
  estados de loading/erro padronizados, acessibilidade. (Evolui incrementalmente desde a
  001; esta spec fecha as pontas.)

---

## Decisões que ainda bloqueiam specs (Princípio II)

| Spec | Decisão pendente |
| --- | --- |
| 008 | Lead → `pessoa`: arquivar/linkar registro ou migrar dados fisicamente? |
| 011 | WhatsApp: Cloud API oficial da Meta ou via BSP? |
| 012 | Endereçamento de chamado: aleatório ou por carga/disponibilidade? |
| 036 | Modelo de atribuição default de Marketing. |
| 045 | Método de login da aluna no portal da Central. |
| — | Escopo de `conta` (household) na v1 (afeta 005, 010, 044) — visão Parte 8.12. |
| — | Retenção/anonimização de conversas de WhatsApp (afeta 011, 047, 055). |
| — | Volume esperado de atendimento simultâneo (dimensiona 012 e 015). |

## Resumo por fase

| Fase | Specs | Foco |
| --- | --- | --- |
| 0 — Fundações | 001–006 | Stack, core, auth, RBAC, pessoa/dedup, event log |
| 1 — CRM | 007–017 | Prioridade 1 do dono do produto |
| 2 — Financeiro | 018–030 | Ledger canônico + 4 plataformas + catálogo + contratos |
| 3 — Migração | 031 | Corte v1 → v2 por re-ingestão |
| 4 — Marketing | 032–043 | "Git do marketing" + automação + atribuição |
| 5 — Central de Clientes | 044–052 | BFF 360 + portal da aluna |
| 6 — Polimento | 053–056 | Auditoria, governança de IA, segurança, shell |

**Total: 56 specs.** A numeração é sequencial; ao criar cada pasta use
`speckit-specify` com o número e o nome indicados.
