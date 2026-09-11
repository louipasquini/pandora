# Projeto Pandora — Contexto para agentes

> Este arquivo é contexto de trabalho para agentes de IA e pessoas. A fonte única e
> autossuficiente do escopo é [`Projeto_Pandora_-_Visão_geral_para_refatoração.md`](Projeto_Pandora_-_Visão_geral_para_refatoração.md).
> Os princípios de governança estão em [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
> A seção `SPECKIT` abaixo é gerada automaticamente — **não edite manualmente** e não
> coloque conteúdo dentro dela.

## Convenções de commit e PR

- **Sem coautoria de IA.** Commits e descrições de PR **não** levam trailer
  `Co-Authored-By: Claude …`, `Claude-Session-…`, nem linha `🤖 Generated with …`. O autor
  do commit é a pessoa. `.claude/settings.json` fixa `"includeCoAuthoredBy": false` para o
  repositório; agentes não devem reintroduzir essas linhas manualmente.
- Mensagens no formato Conventional Commits (`feat(contexto): …`, `fix(...)`, `docs(...)`,
  `test(...)`, `chore(...)`), em português, uma fatia por commit.

## O que é

Reconstrução, com arquitetura limpa, do sistema de dados da **Amor em Nutrir (AEN)** —
empresa de educação/infoprodutos para nutricionistas. Consolida, **sem duplicidade**, num
único PostgreSQL: transações, clientes, catálogo (Produto → Oferta) e contratos vindos de
**7 contas de origem** em **4 plataformas**. Expõe tudo por uma API interna JWT consumida
por um painel React da equipe. Três frentes novas entram nesta reconstrução: **Marketing**,
**CRM** e **Central de Clientes**.

O sistema atual (branch `main`, features `001`–`011`) funciona e está validado contra
produção, mas foi modelado reativamente. Esta reconstrução existe para não repetir as
gambiarras da Parte 4 do documento de visão.

## Contas de origem (dimensão de primeira classe)

7 `PlataformaOrigem`: `TMB`, `Asaas PRD`, `Asaas SVC`, `Guru PRD`, `Guru SVC`,
`Hotmart PRD`, `Hotmart SVC`. Quase toda query identifica a conta específica, não só a
plataforma.

| Plataforma | Papel | Atualização |
| --- | --- | --- |
| **TMB Educação** | Checkout/ERP educacional | Webhook (Vendas + Financeiro) + API `GET /api/pedidos` |
| **Asaas** | Gateway de cobrança puro | Webhook por conta + API `GET /payments` |
| **Guru** | Checkout/plataforma de vendas | Webhook por conta + API `GET /transactions` (janelas ≤180d, cursor) |
| **Hotmart** | Marketplace de infoproduto | Sem webhook — só API `GET /sales/history` + `/sales/price/details` (OAuth2) |

Particularidades que **não** podem virar contagem dupla ou entidade indevida:

- **Guru terceiriza cobrança para a Asaas.** Uma venda pode existir como 2 eventos (transação
  Guru = venda de registro; pagamento Asaas = cobrança). Só a Guru soma receita; a Asaas
  vinculada não resolve Oferta/Contrato próprios. Asaas avulsa resolve tudo normalmente.
- **Hotmart como afiliada.** Vendas em que a AEN é afiliada de outro produtor entram "só
  para registro" — nunca geram Oferta, Contrato, turma nem Cliente novo.

## Arquitetura-alvo

Contextos delimitados com contratos explícitos (eventos ou API interna), **não** um schema
gigante compartilhado:

```
ingestao   → adapters/{tmb,asaas,guru,hotmart}/{webhook,csv,api} + evento_origem + worker
financeiro → transacao, vinculo, receita (queries), reconciliacao
catalogo   → produto, oferta, oferta_catalogo, janela_lancamento, resolucao
contratos  → contrato, aditivo, fold (recálculo puro), acesso
clientes   → pessoa, conta, identidade (dedup), merge
crm        → interacao, oportunidade, pipeline, tarefa, nota, tag, lead, disparos, workflow, faq
marketing  → campanha, artefato, versao_campo (diff), lead, tratamento_cliente, atribuicao
central    → composição read-model (BFF) + comandos; portal da própria aluna (LGPD, preferências)
core       → dinheiro, tempo, ids, status_canonico, auditoria, config
api        → routers finos por contexto
admin      → sync sob demanda, imports CSV, curadoria
```

### Pipeline de ingestão canônico (substitui `ingerir_transacao`)

Cada etapa: **idempotente**, **commit próprio**, **reprocessável**, resultado explícito.

| # | Etapa | Se falhar |
| --- | --- | --- |
| 0 | Registrar evento cru em `evento_origem` (imutável) | 5xx no webhook; origem reenvia |
| 1 | Classificar `tipo` (venda própria / afiliada / cobrança terceirizada / reembolso …) | marca `REVISAR`, não bloqueia |
| 2 | Resolver pessoa (dedup) | `null` se afiliada e não existe; segue |
| 3 | Upsert transação normalizada + `campos_alterados` | loga, marca evento com erro |
| 4 | Resolver vínculo Asaas↔Guru | independente da 5 |
| 5 | Resolver oferta (`codigo_oferta_origem` + data) | independente da 6 |
| 6 | Projetar no contrato (`aditivo` + recálculo do `contrato`) | reprocessável a qualquer hora |

## Princípios (constituição v1.0.0 — resumo operacional)

1. **Modelar o domínio, não a origem.** ID surrogate opaco (UUID v7) em toda entidade,
   decidido antes de codificar. IDs de origem em tabelas `*_origem_ref`, nunca como PK.
2. **Clarificar antes de assumir (NÃO-NEGOCIÁVEL).** Toda dúvida vai ao dono do produto
   antes de codificar. `NEEDS CLARIFICATION` bloqueia o avanço.
3. **Bordas finas, núcleo canônico.** Nenhuma regra de negócio conhece "Guru"/"Asaas"/etc.
   Um adaptador por (plataforma × fonte), testado contra fixtures reais, sem tocar o banco.
4. **Ingestão como log de eventos + projeções.** Evento cru imutável é fonte de verdade;
   projeções reconstruíveis; sem estado mutável no ORM, sem `commit()` de remendo.
5. **Tudo que é agregado é derivado.** `f(eventos) -> estado`, nunca `estado += delta`.
   Dinheiro por `dict[moeda, valor]`; própria e afiliada separadas; nunca soma moedas.
6. **Contextos delimitados — observar, não escrever.** CRM observa transação paga para
   marcar oportunidade ganha; nunca cria Contrato. Central de Clientes emite comandos.
7. **Curadoria e derivação nunca se sobrescrevem.** Colunas/tabelas distintas; precedência
   na leitura (curado > tag > null). Vínculo aplicado nunca é auto-revertido — só alerta.
8. **Superfície de escrita mínima.** Poucos recursos com endpoint de escrita. Nenhuma
   sincronização automática com API externa — só sob demanda, com confirmação no backend.

### Padrões transversais (decididos 1× no início)

- **IDs:** UUID v7 / ULID em toda PK. IDs de origem só em `*_origem_ref`.
- **Dinheiro:** `Dinheiro{valor_int, moeda}`, escala **× 10000**. `float` proibido. `moeda`
  nunca opcional. Soma só entre a mesma moeda.
- **Tempo:** `timestamptz` em UTC. Parser de borda tolera ISO / epoch s / epoch ms / naive /
  lixo (→ `null` com log). Nunca naive.
- **Status:** `StatusTransacaoCanonico` (`PENDENTE`, `PAGO`, `EM_ATRASO`, `RECUSADO`,
  `CANCELADO`, `ESTORNADO`, `CHARGEBACK`, `DESCONHECIDO`) + `StatusContratoCanonico`.
  `libera_acesso()` e `conta_como_receita()` são funções puras do enum. Desconhecido →
  `REVISAR` (nunca `Inativo` sobrecarregado).
- **Idempotência:** toda escrita derivada é `f(eventos)`. Automação reprocessável sem
  duplicar efeito.
- **Auditoria:** `criado_em`/`atualizado_em` em tudo; tabelas `_audit` para mudanças
  curadas e ajustes manuais.
- **Erros de ingestão:** `evento_origem.status ∈ {pendente, ok, erro, revisar}` +
  `erro_detalhe`. Nada some silenciosamente.
- **LGPD:** exclusão de pessoa = **pseudonimização** de `pessoa`, mantendo `transacao` e
  agregados financeiros intactos.
- **Multi-conta:** `plataforma_origem` (enum de 7) em toda query e índice.

## Regras de negócio invioláveis

Ver Parte 3 da visão e a seção "Regras de Negócio Invioláveis" da constituição. As 15
regras confirmadas com o dono do produto — a reconstrução muda **como**, não **o quê**.
Destaques: sem duplicidade (chave `(plataforma_origem, id_transacao_origem)`); Guru+Asaas
conta 1×; Contrato único por `(cliente, produto)` e perpétuo;
`fim_acesso = max(fim vigente, data) + tempo_acesso`; status de acesso ≠ status financeiro;
dedup por documento → CNPJ → e-mail → telefone (ambiguidade descarta o critério);
recálculo do contrato a cada aditivo; reimportação nunca desfaz vínculo (só alerta).

## Glossário essencial

- **Transação:** evento financeiro de uma conta. Chave natural
  `(plataforma_origem, id_transacao_origem)`. Identidade imutável.
- **Cliente / `pessoa`:** comprador deduplicado por prioridade documento→CNPJ→e-mail→telefone.
- **Produto:** produto real do catálogo, código de 3 letras (`PCS`, `NMX`…). Auto-criado na
  1ª transação com código novo; `nome` e `assinatura` são curadoria manual.
- **Oferta:** forma de vender um Produto. Aliases de origem (tag de 8 chars, `hotmart_code`,
  `offer.code`) em tabela de resolução, nunca como PK.
- **Contrato:** único por `(cliente, produto)`. Toda venda/renovação/reembolso do mesmo
  cliente no mesmo produto é **aditivo** ao mesmo contrato.
- **Aditivo:** transação aplicada a um Contrato.
- **"Pago de fato":** filtro separado do status de acesso — "esse dinheiro entrou mesmo?"
  Usado só em somas de dinheiro.
- **Vínculo Asaas↔Guru:** liga o pagamento Asaas à transação Guru da mesma venda. Só a Guru
  soma receita.

## Decisões da Parte 7 (visão)

**Resolvidas em 2026-09-01:**

- **Contrato:** vínculo `(pessoa, produto)` — não muda para household. Toda compra do mesmo
  produto pela mesma pessoa é aditivo ao mesmo contrato. *Renovação* = comprou sem ter mais
  acesso (expirado); *prorrogação* = comprou com acesso ainda ativo. O rótulo é derivado do
  estado de acesso na data do aditivo; a fórmula de `fim_acesso` já cobre os dois casos.
- **Oferta:** ID surrogate; resolvida por `(tag AEN, plataforma)`. A mesma oferta comercial
  em 2 plataformas = 2 registros de `oferta` com a mesma tag AEN.
- **Resolução Hotmart:** catálogo completo de `price.code`, validado por schema antes de
  processar. Sem fallback por `product_id` + data. Sem match → oferta `null` + evento
  `REVISAR`.
- **Política de atualização:** webhook primário + API sob demanda mantidos. Webhook da
  Hotmart será ativado, mas **não na v1**.
- **Marketing (fontes):** Meta Ads, Google Ads, **Mautic**, landing pages.
- **Moeda:** nunca converter; registrar e somar por moeda separadamente. Sem moeda de
  relatório nem câmbio histórico.
- **Stack:** Node.js + TypeScript + NestJS + Prisma sobre PostgreSQL.
- **CRM:** 100% in-house, sem ferramenta externa; construção priorizada (ver Ordem de
  construção).
- (Anteriores) escopo de CRM completo; Central = portal da aluna; identidade/merge (dedup
  automático, auto-declarado = 100% humano); LGPD = pseudonimização.

**Ainda em aberto (resolver ANTES do schema que tocam — Princípio II):**

- Default do **modelo de atribuição** de Marketing (a tabela `atribuicao` já suporta vários
  modelos versionáveis).
- Decisões específicas de CRM (visão Parte 8.12): provedor de WhatsApp Business API;
  critério de endereçamento de chamado; escopo de `conta` (household) na v1; retenção e
  anonimização de conversas de WhatsApp; volume esperado de atendimento.

## Stack

- **Backend:** Node.js 24 + TypeScript + **NestJS 11** + **Prisma 6**, sobre **PostgreSQL 16**
  (decisão de 2026-09-01 — substitui o Python/FastAPI da v1; código e ~329 testes da v1
  não são reaproveitados). Um módulo NestJS por bounded context (`backend/src/<contexto>/`);
  lista canônica em `backend/src/app.context-modules.ts`. Config tipada por zod em
  `backend/src/config/env.schema.ts` (falha cedo, sem default silencioso); o `core` é o dono
  do contrato de config (re-export tipado) e uma regra ESLint barra `process.env` fora de
  `config/`/`core/`/`main.ts`. `core` expõe (barrel `core.module.ts`): `EntidadeId` (UUID
  v7) + `uuidv7()`, `PlataformaOrigem` (7 contas), **`Dinheiro`** (`bigint` valor interno,
  escala ×10000, sem float) + **`Moeda`** (código ISO 4217 validado) + `ratear`/
  `ratearPorPesos` (`multiplicarPorEscalar` só fator inteiro), **`parseInstante`** (parser
  de borda tolerante e livre de locale) + `agoraUtc()`, **`StatusTransacaoCanonico`** /
  **`StatusContratoCanonico`** + funções puras `liberaAcesso` / `contaComoReceita` /
  `contratoLiberaAcesso` + `paraStatusTransacaoCanonico` (rede de segurança), e a base de
  auditoria `EntidadeAuditavel` / `RegistroAuditoria` / `montarRegistroAuditoria` (contrato,
  sem tabela). Ver [`docs/002-core-value-objects.md`](docs/002-core-value-objects.md).
- **Auth (spec 003):** módulo de **infra transversal** `backend/src/auth/` (não é um 12º
  bounded context; `CONTEXT_MODULES` segue com 11). `POST /auth/token` troca
  `SERVICE_CLIENT_ID`/`SERVICE_CLIENT_SECRET` por um **JWT HS256** (`SERVICE_JWT_SECRET`,
  TTL `SERVICE_JWT_TTL` default 12 h / teto 24 h, _stateless_, sem refresh). `JwtAuthGuard`
  é `APP_GUARD` — API **fechada por padrão**, com allowlist explícita: `@Public()` em
  `/health` e `/auth/token` + prefixo `/webhooks/`; `NotFoundAuthFilter` faz caminho
  inexistente sem token → 401. `WebhookAuthenticator` (exportado) verifica
  `<PLATAFORMA>_WEBHOOK_TOKEN` por conta em tempo constante, separado do JWT. `SERVICE_*`
  agora **obrigatórias** no `env.schema` em todo `NODE_ENV`. Dep nova: `@nestjs/jwt`. Ver
  [`docs/003-auth-servico-jwt.md`](docs/003-auth-servico-jwt.md).
- **RBAC (spec 004):** dentro do `auth` (`backend/src/auth/rbac/`, ainda infra transversal;
  `CONTEXT_MODULES` = 11). **Catálogo de permissões no código** (`catalogo.ts`,
  `recurso:acao` congelado; `perfil:administrar` + `lead:{criar,editar,ver_todos,ver_proprios}`;
  `assertCatalogoCoerente()` aborta no boot). **1ª migração de negócio** do projeto:
  Prisma `usuario` / `perfil` / `perfil_permissao` / `usuario_perfil` / `rbac_audit`
  (PK UUID v7 na app, `@db.Timestamptz`); `prisma/seed.ts` idempotente cria o perfil de
  sistema `administrador` (dev/e2e/CI). **`PermissionGuard` é o 2º `APP_GUARD`** (depois do
  `JwtAuthGuard`): `@RequerPermissao(...)` (E) e `@AutenticadoBasta()`; rota autenticada
  **sem marcador → 403** (fechado por omissão, CL-03); 403 ≠ 401, corpo genérico.
  **Permissões efetivas resolvidas a cada requisição** (`SujeitoRbacService`, CL-02, sem
  _staleness_): credencial de serviço → `administrador` = catálogo inteiro (special-case,
  não depende do seed). Endpoints `/admin/rbac/*` (todos sob `perfil:administrar`):
  `GET permissoes`, `GET/POST/PATCH/DELETE perfis`, `GET/POST usuarios`,
  `GET/PUT usuarios/{id}/perfis`; `+ GET /auth/permissoes-efetivas` (`@AutenticadoBasta`).
  Toda escrita audita em `rbac_audit` via `montarRegistroAuditoria` do core (só _delta_
  real; append-only; 1ª tabela `_audit` do projeto, painel = spec 053). 0 dep nova.
  Ver [`docs/004-rbac.md`](docs/004-rbac.md).
- **clientes (spec 005):** 1º _bounded context_ de domínio com entidade de negócio
  (`CONTEXT_MODULES` segue 11). Divisão `domain/` (puro) · `application/` (serviços/
  transações) · `infra/` (Prisma). **Domínio puro** (`backend/src/clientes/domain/`, sem
  banco): `documento` (DV de CPF/CNPJ à mão, 0 dep), `normalizar` (e-mail `lowercase`+`trim`
  **sem** heurística de provedor; telefone E.164, `+55` na borda; documento só dígitos),
  `resolverIdentidade(dados, candidatos)` (pura, determinística; ordem fixa **documento →
  cnpj → email → telefone**; match único resolve; **ambíguo descarta o critério**; nada →
  `null`+candidatos; segue `mergedPara`), `merge-plano` (plano de merge + de reversão;
  `curado` pré-merge volta, `curado` pós-merge prevalece → `Divergencia`). **Aplicação**:
  `ResolverOuCriarService.resolverOuCriar` (transacional, idempotente — anexa
  `pessoa_origem_ref`, rotaciona contato não curado, curado em conflito → secundário +
  `nota_reconciliacao`; cria `pessoa` se não resolveu; `criar:false` p/ afiliada → `null`);
  é a **porta** exportada que a spec 018 consome (sem endpoint agora). `PessoaService`
  (CRUD manual; campo tocado vira `curado`; unicidade → 409 `{pessoaId}` sem fundir;
  remover última âncora → 400; **sem `DELETE`** — exclusão = pseudonimização spec 047),
  `ContaService` (CRUD + associar/desassociar; pessoa 0..1 conta), `MergeService`
  (`merge`/`desfazer` de pessoa e conta; `snapshot` Json + `origemMergeId` por linha;
  **reversível em qualquer ordem** — CL-03; divergência → valor atual prevalece +
  `nota_reconciliacao`), `ClientesAuditService` (forma canônica do core, `clientes_audit`
  append-only, só delta), `NotaReconciliacaoService`. **Prisma** (2ª+3ª migração de
  negócio, `20260903141931_clientes` + `..142000_clientes_primario_unico`): `pessoa`
  (`pseudonimizada_em?` reservado 047; `merged_para?`; `conta_id?`), `conta`
  (HOUSEHOLD|EMPRESA; **não** toca `contrato` — regra #3), `pessoa_{email,telefone,
  documento,endereco}` (`curado` + `origem_merge_id`; índice único parcial `WHERE primario`),
  `pessoa_origem_ref` (`@@unique(plataforma_origem,tipo_ref,valor_ref)` — id de origem
  nunca PK), `merge_pessoa`/`merge_conta`/`nota_reconciliacao`/`clientes_audit`
  (append-only). **RBAC 004 estendido**: catálogo ganha `pessoa:{ver,editar,merge}` +
  `conta:{ver,editar,merge}` (`administrador` + credencial de serviço concedem de graça,
  sem migração de dados). ~16 endpoints, **0 dep nova**, 2 migrações. Clarificações CL-01
  (`conta` completa), CL-02 (CRUD manual completo + `resolverOuCriar`), CL-03 (merge sempre
  reversível), CL-04 (`CONTEXT_MODULES` = 11) — dono do produto, 2026-09-03.
  Ver [`docs/005-pessoa-identidade-dedup.md`](docs/005-pessoa-identidade-dedup.md).
- **ingestao (spec 006):** 2º _bounded context_ de domínio com entidade de negócio
  (`CONTEXT_MODULES` segue 11). Materializa o Princípio IV. Divisão `domain/` · `application/`
  · `infra/`. **Domínio puro** (`backend/src/ingestao/domain/`, sem banco):
  `evento-canonico.ts` (schema `zod` do contrato **`EventoCanonico`** que os adapters 019–022
  vão produzir — núcleo obrigatório mínimo + opcionais transportados; `Dinheiro`/`Moeda` do
  core), `hash-evento.ts` (`sha256(canonicalizar(payloadBruto))` — determinístico, livre de
  locale), `classificar.ts` (`classificar(canonico, tipoOrigem)` puro; enum **congelado**
  `Classificacao` = `VENDA_PROPRIA|VENDA_AFILIADA|COBRANCA_TERCEIRIZADA|REEMBOLSO|RECORRENCIA|
  OUTRO|DESCONHECIDO`; regras locais — estorno→`REEMBOLSO`, `ehAfiliada`→`VENDA_AFILIADA`,
  assinatura→`RECORRENCIA`; o que depende de casar Asaas↔Guru → `DESCONHECIDO`+`revisar` p/
  024/026; **nunca** um palpite — regra #15), `etapas.ts` (registro **ordenado com
  dependências declaradas**: `REGISTRAR(0)→CLASSIFICAR(1)→RESOLVER_PESSOA(2)→
  UPSERT_TRANSACAO(3)`; `RESOLVER_VINCULO(4)`/`RESOLVER_OFERTA(5)`/`PROJETAR_CONTRATO(6)`
  dependem de 3), `plano-passada.ts` (puro: por etapa `EXECUTAR|BLOQUEADA|JA_OK|ESGOTADA` +
  `status` do evento derivado). **Etapas 2–6 = _no-op_ `pulada` `{implementadaNa: 18/23/24/25}`**
  — specs futuras trocam o executor via `WorkerService.definirExecutor(...)` sem tocar o
  worker. **Porta exportada** `RegistrarEventoService.registrarEvento(entrada) → {eventoId,
  criado}` (etapa 0: `hash` + upsert idempotente pela chave; reentrega → `criado:false` +
  `reentregas++`) — é o que os adapters 019–022 vão injetar. **`WorkerService.processarPassada()`**:
  seleciona elegíveis (`pendente` ou `erro`<`MAX`), mutex por evento, roda cada etapa em
  **transação própria**, grava `evento_etapa` + deriva `status`; idempotente; retry até
  `INGESTAO_WORKER_MAX_TENTATIVAS` (default 3) → depois `erro` **terminal** até reprocesso
  (CL-05); dependência não-`ok` → dependente `bloqueada` (CL-04). **`WorkerScheduler`** =
  `setInterval` in-house (0 dep — `@nestjs/schedule` rejeitado), env
  `INGESTAO_WORKER_{ENABLED,INTERVALO_MS,MAX_TENTATIVAS,LOTE}`, **desligado em teste**.
  Reprocessamento manual → **1** `ingestao_audit` (forma canônica do core, `AJUSTE_MANUAL`,
  append-only; o worker não audita — seu log é `evento_etapa`). **4ª migração Prisma**
  (`20260903171321_ingestao`): `evento_origem` (PK UUID v7; `plataforma_origem` enum 7,
  `id_origem` **coluna comum, nunca PK**, `payload_bruto`/`evento_canonico?` Json, `hash`,
  `reentregas`, `status ∈ {pendente,ok,erro,revisar}` **derivado**, `classificacao?`,
  `erro_detalhe?`; `@@unique(plataforma_origem,id_origem,hash)` = dedup, regra #1),
  `evento_etapa` (`@@unique(evento_origem_id,etapa)`; `status ∈ {pendente,processando,ok,erro,
  bloqueada,pulada}`, `resultado` Json, `tentativas`), `ingestao_audit`. **5 endpoints**
  (`/ingestao/eventos`): `POST` (`evento:ingerir`), `POST /processar` + `POST /{id}/reprocessar`
  (`evento:reprocessar`), `GET` + `GET /{id}` (`evento:ver`); **sem `/webhooks/*`** (019–022).
  **RBAC 004 estendido**: catálogo ganha `evento:{ver,reprocessar,ingerir}` (`administrador`
  + credencial de serviço concedem de graça). Frontend `frontend/src/eventos/`: item
  **Eventos** atrás de `evento:ver`, rota sob `RequirePermissao`, lista com filtros
  (conta/status/tipo, default `revisar`+`erro`) + detalhe com `payload_bruto` formatado e
  linha do tempo das 7 etapas + **Reprocessar** (`evento:reprocessar`); `apiFetch` já trata
  401/403. **0 dep nova**, 1 migração, 5 endpoints. Clarificações CL-01 (worker in-process +
  gatilho `POST /processar`), CL-02 (porta in-process + endpoint HTTP), CL-03 (taxonomia
  canônica com regras locais), CL-04 (dependência declarada → `bloqueada`), CL-05 (retry até
  `MAX`, depois terminal) — dono do produto, 2026-09-03. Ver
  [`docs/006-evento-origem-worker.md`](docs/006-evento-origem-worker.md).
- **crm (spec 007):** 3º _bounded context_ de domínio com entidade de negócio (`crm` deixa
  de ser vazio; `CONTEXT_MODULES` segue 11). Módulo de **Administração do CRM** (visão Parte
  8.11) — **sem reimplementar a 004** (perfis/permissões/usuários seguem lá; esta spec só
  **estende o catálogo** com o recurso `crm_admin`). Divisão `domain/` (puro) · `application/`
  · `infra/`. **Domínio puro** (`backend/src/crm/domain/`, sem banco): `expediente.ts` —
  **`estaEmExpediente(instante, {janelas, feriados, equipe?}) → boolean`** puro/determinístico/
  **livre de locale** (converte p/ America/Sao_Paulo via `Intl` nativo — **0 dep**, `timeZone`
  explícito, matriz `TZ` na CI); início inclusivo/fim exclusivo; feriado subtrai **mesmo
  dentro** da janela; recorrente casa `(mês,dia)` exato (29/02 não desloca — CL-04); **união**
  global ∪ equipe ativa (CL-01, nunca _override_); sem janela aplicável → `false`.
  `cifra.ts` (AES-256-GCM `node:crypto` — `cifrar`/`decifrar`, blob `base64(iv|tag|ct)`),
  `api-key.ts` (`gerarApiKey()` → `crm_`+40hex + SHA-256 **só-hash**; revelada 1×),
  `mascarar-segredo.ts` (`'••••••'+últimos4`; leitura nunca decifra). **5ª migração Prisma**
  (`20260903184256_crm_admin` + `..184300_crm_admin_membro_unico`): `equipe` (sem `DELETE`,
  só `ativo`), `equipe_membro` (FK `usuario` da 004; **índice único parcial**
  `(equipe_id,usuario_id) WHERE saiu_em IS NULL` = ≤1 vínculo ativo por par; remoção =
  `saiu_em`, nunca `DELETE`; usuário em N equipes), `janela_atendimento` (`equipe_id?` null=
  global; `dia_semana` 0–6; `hora_*` `Int` minutos locais; `hora_fim > hora_inicio` — CL-02,
  senão 422 `janela_invalida`; `DELETE` físico), `feriado` (`data @db.Date`; `recorrente_anual`;
  `DELETE` físico), `integracao` (`tipo API_KEY|WEBHOOK|CONEXAO_INTERNA`, `alvo FINANCEIRO|
  MARKETING|CENTRAL|EXTERNO`, `config` jsonb **sem segredo**, `ativo`, `ultimo_uso_em?`
  reservado 011/019–022; segredo **cifrado em repouso** OU `segredo_hash` + `segredo_ultimos4`
  claro p/ máscara; **sem `DELETE`**), `crm_admin_audit` (forma canônica do core,
  `AJUSTE_MANUAL`, **append-only**, só delta real; segredo entra como **marcador**
  `{segredo:'definido'|'rotacionado'}`, nunca valor). **Contrato de segurança** (teste e2e faz
  `grep` do valor = 0): leitura projeta só `segredoDefinido` + `segredoMascarado`; API key
  revelada 1× na criação/rotação; `rotacionar` de `CONEXAO_INTERNA` sem segredo → 409;
  `config` com chave `token`/`secret`/`apiKey`/`password` → 422. Chave de cifra
  **`CRM_INTEGRACAO_CIFRA_KEY`** (base64 32 bytes) **obrigatória em todo `NODE_ENV`** — boot
  aborta sem ela; `core` re-exporta `cifraIntegracaoKey(cfg)`. **RBAC 004 estendido**:
  catálogo ganha `crm_admin:{ver,gerir_equipes,gerir_expediente,gerir_integracoes}`
  (`administrador` + credencial de serviço de graça, **0 migração de dados/seed**).
  **~22 endpoints** `/crm/admin/**` (CRUD de config administrativa; leitura → `crm_admin:ver`,
  escrita → `gerir_*`) + `GET /crm/admin/expediente?instante=&equipeId=` (reusa a função pura;
  `instante` lixo → 400) + `GET /crm/admin/auditoria` (local; consolidado = 053). **Frontend**
  `frontend/src/crm-admin/`: item **CRM · Administração** atrás de `crm_admin:ver`, rota sob
  `RequirePermissao`, abas Equipes / Expediente / Integrações (controles de escrita só com
  `gerir_*`; máscara de segredo; _reveal_ 1× não-persistente; indicador "no expediente
  agora?"). **0 dep nova**, 1 migração (2 arquivos), +1 chave `.env`. Clarificações CL-01
  (união global+equipe), CL-02 (rejeitar janela que cruza meia-noite), CL-03 (escala por
  atendente fora de escopo — vai junto do 012), CL-04 (feriado 29/02 não desloca) — dono do
  produto, 2026-09-03. Ver [`docs/007-crm-administracao.md`](docs/007-crm-administracao.md).
- **crm (spec 008 — lead; spec 009 — interação/tag/segmento; spec 010 —
  pipeline/oportunidade):** 008 é a **1ª entidade compartilhada** do projeto (`lead` — CRM
  **e** Marketing, acesso por RBAC 004, não por fronteira; conversão Lead→Pessoa reusa a
  engine da 005 via **`PortaIdentidade`** no `core` — inversão de dependência, `crm` nunca
  importa `clientes`; scoring puro/derivado; campos personalizados com esquema
  administrável; **6ª migração**). 009 fecha o esboço 5.2‑E: `interacao` (âncora `pessoa`
  XOR `lead`, timeline unida na leitura sem re-apontar linha — CL-01; só `NOTA` edita/
  remove, canal é append-only — CL-05), `tag` (entidade de 1ª classe compartilhada
  lead\|pessoa\|interacao, migrando `lead.tags` da 008 sem quebrar o contrato REST — CL-04),
  `segmento` (query salva, membros sempre derivados na leitura — CL-03); **nenhum contrato
  novo no `core`** (FK direta no schema, mesmo precedente da 008); **7ª migração**; **+5
  permissões** RBAC. 010 entrega o pipeline de vendas (visão Parte 8.7): `pipeline`/
  `etapa_pipeline` (configurável, `tipo ABERTA|GANHA|PERDIDA`), `oportunidade` (mesma âncora
  polimórfica `pessoa` XOR `lead` — **1ª persistência de `Dinheiro` do core** no schema),
  `oportunidade_movimentacao` (histórico de 1ª classe, não o audit genérico — motivo
  obrigatório só ao entrar em etapa `PERDIDA`), atribuição automática (round robin
  determinístico reusando `equipe` da 007, ou regra simples, D-03), `slaEstourado`/
  `esfriando` **sempre derivados** (nunca coluna — reusa `interacao` da 009 p/ esfriando),
  campos personalizados e métricas por etapa/moeda; porta `PortaObservacaoPagamentoCrm`
  (D-02, regra 8.2.3 da visão — sem gatilho real, Financeiro ainda não existe); **8ª
  migração**; **+6 permissões** RBAC. Resumo completo de cada uma em
  [`docs/008-crm-lead.md`](docs/008-crm-lead.md),
  [`docs/009-crm-interacao-timeline.md`](docs/009-crm-interacao-timeline.md) e
  [`docs/010-crm-pipeline.md`](docs/010-crm-pipeline.md) (o histórico detalhado de plano/
  decisões vive arquivado na seção `SPECKIT` abaixo).
- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4 (config CSS-first, `@theme`),
  TanStack Query, React Router 7. Um único nível de acesso; login = credenciais de serviço
  (tela `/login` + `AuthProvider`/`useAuth` + `apiFetch` central que injeta `Authorization`
  e trata 401/403 em pontos únicos; token em `localStorage`). RBAC (spec 004): item de
  navegação **Administração** (abas Perfis/Usuários) atrás de `perfil:administrar`;
  `RequirePermissao` (`perm`/`anyOf`) + `usePermissoesEfetivas` (zero permissão
  _hardcoded_). Módulos por spec: **Pessoas**/**Contas** (005, `pessoa:ver`/`conta:ver`,
  merge+desfazer); **Eventos** (006, `evento:ver`, timeline de etapas + reprocessar);
  **CRM · Administração** (007, `crm_admin:ver`, abas Equipes/Expediente/Integrações);
  **CRM · Leads** (008, `lead:ver_todos`\|`ver_proprios`, score/campos personalizados/
  converter); **CRM · Segmentos** (009, `segmento:ver`, lista+detalhe+membros) +
  `TimelineInteracoes`/`TagPicker` compartilhados plugados em Pessoas e Leads; **CRM ·
  Pipelines** (010, `oportunidade:ver_todas`\|`ver_proprias`, board Kanban com
  drag-and-drop **HTML5 nativo** — 0 dep — + modal de motivo em etapa `PERDIDA`;
  administração de pipeline/etapa/atribuição/campos personalizados atrás de
  `crm_admin:gerir_pipelines`); **CRM · WhatsApp** (011, `crm_admin:ver`\|`whatsapp:ver`,
  conectar canal com segredos só-escrita + templates por canal com badge de status e
  "sincronizar agora" atrás de `crm_admin:gerir_whatsapp`); **CRM · Chat ao Vivo** (012,
  `atendimento:ver_todos`\|`ver_proprios`, fila com indicador de SLA + conversa
  reaproveitando `TimelineInteracoes` em modo leitura, assumir/responder/transferir/
  encerrar/CSAT condicionados à permissão; administração de SLA/mensagem fora do
  expediente por equipe atrás de `crm_admin:gerir_atendimento`); **CRM · Disparos** (015,
  `disparo:ver`, visão geral/histórico + construtor inline canal/template[s]/segmento
  e/ou CSV/teste A/B/agendamento atrás de `disparo:criar`, detalhe com métricas por
  status/variante, export e quality rating sob demanda); **CRM · Tarefas** (016,
  `tarefa:ver_todas`\|`ver_proprias`, abas Minhas/Gerais/Todas + agenda, detalhe com
  checklist/cronômetro/comentários/dependências/delegação atrás de `tarefa:editar`\|
  `tarefa:delegar`, ranking de pontos derivado; formulário da ação **Criar tarefa** dentro
  do editor de fluxo do Workflow); **CRM · Dashboard** (017, `dashboard:ver`, seletor de
  período + filtros equipe/responsável/pipeline, 6 painéis com comparação período-a-período
  — gráficos SVG à mão, 0 dep —, metas comerciais com atingimento derivado + CRUD atrás de
  `dashboard:gerir_metas`, badge de alerta de meta, visões salvas/compartilhadas/clonáveis,
  export CSV client-side e Imprimir/PDF via `@media print`). `vite.config.ts` lê o
  `.env` da raiz (`envDir: '..'`). Tokens da marca num ponto único:
  `frontend/src/theme/tokens.css`.
- **Monorepo:** npm workspaces (`backend`, `frontend`), Node 24. **Portas** (configuráveis,
  nenhuma fixa): backend `3001`, frontend `5174`, Postgres dev host `55432`. Scripts
  `backend` `prisma:migrate:{dev,deploy,status}`/`prisma:seed`/`prisma:reset` carregam o
  `.env` da raiz sozinhos (`set -a && . ../.env && set +a` antes do `prisma`) — não precisa
  exportar `DATABASE_URL` na mão para rodar o CLI do Prisma; atalhos na raiz:
  `npm run db:migrate` (dev + seed), `db:migrate:deploy`, `db:migrate:status`.
- **Testes:** unitários sem banco; e2e do backend contra Postgres real, schema isolado por
  execução (`backend/test/setup-db.ts` roda `prisma migrate deploy` + `prisma db seed`).
  CI: `.github/workflows/ci.yml`.
- **Identidade visual:** azul `#2E4E78`, coral `#EC5F6A`, menta `#68C0B2`, fonte Inter.
- Trocar qualquer peça exige emenda da constituição e o Princípio II.

## Ordem de construção

Prioridade do dono do produto: **CRM > Financeiro > Marketing > Central de Clientes**.
Antes do CRM entram as fatias transversais de que ele depende: `core` (dinheiro, tempo,
ids, status canônico), fundação de `clientes` (`pessoa`, identidade/dedup) e de `ingestao`
(`evento_origem`) — o Workflow do CRM consome `evento_origem` e o `lead` vira `pessoa` pela
engine de identidade.

## Fluxo de trabalho (Spec Kit)

`constitution` → `specify` → `clarify` → `plan` → `tasks` → `implement`. Cada feature em
`specs/<###-nome>/`. O `plan` tem um **Constitution Check** como portão. Testes rodam
contra Postgres real com dados de produção; adaptadores de borda contra fixtures reais.
Migração: re-ingerir payloads crus / CSVs das 7 contas para o novo `evento_origem` e deixar
as projeções se reconstruírem; congelar a v1 (read-only) no corte e comparar agregados-chave.

## Documentos de referência

- [`Projeto_Pandora_-_Visão_geral_para_refatoração.md`](Projeto_Pandora_-_Visão_geral_para_refatoração.md) — briefing único do escopo (Partes 1–10).
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — princípios de governança (v1.0.0).
- [`Documentação Asaas (LLM).md`](Documentação%20Asaas%20(LLM).md), [`Documentação Guru.md`](Documentação%20Guru.md), [`Documentação Hotmart.md`](Documentação%20Hotmart.md), [`Documentação TMB.md`](Documentação%20TMB.md) — referência das APIs de origem.

<!-- SPECKIT START -->
Plano ativo: [`specs/023-catalogo-produto-oferta/plan.md`](specs/023-catalogo-produto-oferta/plan.md)
(Fase 2 · spec 023 — **Catálogo · `produto` → `oferta`**: quarta fatia da Fase 2
(Financeiro). O _bounded context_ **`catalogo`** (vazio desde a 001) passa a ser dono de
**`produto`** ("o que se vende", auto-criado na 1ª transação com um código de 3 letras novo,
`nome`/`assinatura` curados) e **`oferta`** ("a forma de vender", resolvida por `(tag AEN,
plataforma)` — a mesma oferta comercial vendida em 2 plataformas vira **2 registros** que
compartilham a tag, decisão já confirmada com o dono do produto na Parte 7 da visão).
**Decodificador de tag puro** (`catalogo/domain/tag/`): `PCS48XAV` → produto (3) + turma
(2: `X0`→evergreen, `00`→perpétuo, numérica→turma nº, resto→desconhecida) + subproduto/
modelo de cobrança/modelo de transação (1 char cada, **armazenados crus, sem tradução** — o
mapeamento de negócio desses 3 códigos não está documentado em lugar nenhum do projeto,
`oferta_tag.py` da v1 não foi migrado; nunca um palpite, Regra Inviolável nº 15). **2
localizadores genéricos, platform-agnostic** (não 1 por plataforma): "ancorada"
(`EventoCanonico.oferta.codigoOrigem` casa o formato exato de 8 chars — cobre a Guru, que
configura a própria tag como ID da oferta no checkout) e "texto livre" (`#TAG` em
`codigoOrigem` depois `nomeOrigem` — cobre TMB/Asaas e a Guru quando o ID não é a tag).
**Estratégia por conta é dado, não `if`** (`ESTRATEGIA_RESOLUCAO_OFERTA:
Record<PlataformaOrigem, 'TAG'|'CATALOGO_HOTMART'>`, mesmo padrão do `MAPAS_STATUS` do
`financeiro`/018, testado por varredura de cobertura das 7 contas): as **5 contas
não-Hotmart** resolvem por tag **com auto-criação** de produto+oferta na 1ª venda de uma tag
nova; as **2 contas Hotmart** resolvem **só** por `oferta_origem_ref` (`price.code` exato,
catálogo importado via CSV) — **nunca** auto-cria, **nunca** cai para tag, mesmo que o texto
pareça conter uma (decisão de negócio já resolvida na Parte 7: "exigir catálogo completo de
`price.code`... sem match → oferta `null` + evento `REVISAR`"). **Pipeline etapa 5
(`RESOLVER_OFERTA`)** plugada reusando **sem alteração** o contrato `ExecutorEtapaExterno`
do `core` que a spec 018 já criou (`EntradaEtapaExterna`/`SaidaEtapaExterna`) + o
`src/pipeline-wiring.module.ts` (só ganha o 3º import, `CatalogoModule`) — **nenhuma
mudança em `WorkerService`/`etapas.ts`**; o executor lê só `entrada.canonico`/
`entrada.plataformaOrigem`/`entrada.resultados.UPSERT_TRANSACAO.transacaoId` (sem
reconsultar `transacao`) e grava `transacao.oferta_id` direto (coluna já reservada desde a
018) + acumula `motivoRevisao` sem sobrescrever o que a etapa 3 já tenha gravado.
**Precedência curado > derivado > null** (Princípio VII): colunas distintas por campo
curável de `produto`/`oferta` (`*Curado`/`*Derivado`) + `camposEditados: string[]` + 2
helpers puros `marcarEditado`/`aplicarSeNaoEditado` (`catalogo/domain/precedencia.ts`) —
nunca sobrescrita destrutiva de um pelo outro; a leitura projeta sempre o **valor efetivo**
(`catalogo/domain/projecao.ts`, `turmaEfetivaDeOferta` nunca mistura tipo curado com número
derivado). **`oferta_catalogo`** (ticket, preço de tabela, tempo de acesso, bônus, combo) é
**100% curado** — sem par derivado — e **exclusivo por oferta** (1:1 direto, nunca
compartilhado entre ofertas irmãs de plataformas diferentes; 1 decisão de fato ambígua,
sinalizada como não confirmada no próprio documento de visão, foi levada ao dono do produto
em 2026-09-11 e resolvida assim). `bonus`/`produtos_do_combo` como **tabelas de junção
reais**, nunca array-coluna. **`janela_lancamento`** resolve a "turma efetiva" só para
**exibição** por data — só populada via import de CSV, **sem endpoint de escrita dedicado**
(Princípio VIII). **Import do catálogo Hotmart**: 3 dos 4 CSVs da v1 (`produtos.csv`,
`ofertas.csv`, `lancamentos.csv` — `afiliados.csv` é escopo da spec 026), cada um com o
**schema de colunas validado por completo antes de processar qualquer linha** (arquivo
inválido → `422` atômico); `ofertas.csv` exige `price_code` **por linha** — linha sem ele é
só ignorada. **17ª migração Prisma** (1ª do `catalogo`): `produto`, `oferta`,
`oferta_origem_ref`, `oferta_catalogo` (+ `oferta_catalogo_bonus`/`_combo_item`),
`janela_lancamento`, `catalogo_audit` + enums `TurmaTipo`/`OfertaOrigemRefTipo` + `ALTER
TABLE transacao ADD CONSTRAINT` ligando `oferta_id` (coluna já existia desde a 018) a
`oferta.id` — não-destrutivo. **RBAC 004 estendido**: `+5` permissões —
`produto:{ver,editar}` + `oferta:{ver,criar,editar}`. **~8 endpoints**:
`GET/PUT /produtos[/{codigo}]`, `GET/POST/PATCH /ofertas[/{id}]` (sem
`PUT /ofertas/{codigo}` — simplificação documentada), `POST /catalogo/hotmart/importar-
{produtos,ofertas,lancamentos}` (reusa `oferta:editar`). **Frontend**
`frontend/src/{produtos,ofertas}/`: **Catálogo · Produtos** (`produto:ver`) e **Catálogo ·
Ofertas** (`oferta:ver`, curadoria de identidade e de `oferta_catalogo` atrás de
`oferta:editar` + tela de import dos 3 CSVs). **0 dep nova**, **1 migração**, **0 chave
`.env` nova**, **0 porta nova**. `CONTEXT_MODULES` segue **11**. 81 testes unitários backend
+ 23 e2e (24 suítes, Postgres real — `pandora-db` já existente nesta sessão, sem container
novo: US1 tag ancorada Guru → auto-cria produto+oferta + idempotência + mesma tag em
Hotmart via catálogo → 2ª oferta distinta + Asaas texto livre/turma perpétua + TMB sem tag
→ revisão + Hotmart sem `price_code` catalogado → revisão sem cair pra tag +
reprocessamento idempotente, US2 curadoria + audit + `oferta_catalogo`+bônus+combo +
400/404 em referência inválida, US3 import válido + schema inválido → 422 atômico + linha
sem `price_code` ignorada + `lancamentos.csv`+turma efetiva, concorrência, guard 401/403/2xx,
fronteira, catálogo RBAC, `/health` = 11) + 7 frontend (35 arquivos), todos verdes;
lint/typecheck/build limpos nos dois workspaces; validado também manualmente no navegador
de ponta a ponta. Regressão: `montarEventoCanonico` (helper de teste da spec 006) ganhou
uma tag AEN válida por padrão; 2 asserções da suíte e2e da 006 e 6 asserções
`precisaRevisao` nas suítes das specs 019–022 atualizadas de `false` para `true` — as
fixtures daquelas specs não carregam tag AEN decodificável nem catálogo Hotmart importado,
então a resolução de oferta agora ativada corretamente as marca para revisão (comportamento
novo e correto, não regressão). Corrigido também um vazamento pré-existente do `.env` de
desenvolvimento para o modo "test" do Vite/Vitest que já quebrava 22 suítes de frontend
antes desta spec (`.env.test` novo, sem segredo, versionado). Artefatos: `research.md`,
`data-model.md`, `contracts/` (3), `quickstart.md` na mesma pasta.)

<details><summary>Spec 022 — Adaptadores de borda da Hotmart (implementada, resumo arquivado)</summary>

Plano: [`specs/022-adapter-hotmart/plan.md`](specs/022-adapter-hotmart/plan.md)
(Fase 2 · spec 022 — **Adaptadores de borda da Hotmart**: 4ª e **última** das 4 specs de
adaptadores da Fase 2 (019 TMB ✅, 020 Asaas ✅, 021 Guru ✅, 022 Hotmart) — molde direto da
019/020/021. Materializa o **Princípio III** para as **duas contas Hotmart** `HOTMART_PRD` /
`HOTMART_SVC` (`PlataformaOrigem` do `core`): funções **puras** `parse*()` (API `GET
/payments/api/v1/sales/history` **paginação por cursor** `page_info.next_page_token` / API
`GET /payments/api/v1/sales/price/details` — **2ª chamada de rede**, merge por `transaction`
/ CSV de export / webhook `PURCHASE_*` **stub desligado**) transformam os payloads crus em
**`EventoCanonico`** do `core` — **recebendo a `conta` como parâmetro** (o payload da Hotmart
nunca a determina — vem do corpo do endpoint ou do path `/prd`\|`/svc`), testadas contra
**fixtures reais sem tocar o banco**. Vivem em **`src/ingestao/adapters/hotmart/`** (visão
Apêndice C); **não importam `financeiro`/`clientes`** — o
**`financeiro/domain/status-map/hotmart.ts`** (`APPROVED`/`COMPLETE`→`PAGO`,
`PRINTED_BILLET`/`WAITING_PAYMENT`/`UNDER_ANALISYS`/`PROCESSING_TRANSACTION`→`PENDENTE`,
`OVERDUE`/`NO_FUNDS`→`EM_ATRASO`, `REFUNDED`/`PARTIALLY_REFUNDED`/`DISPUTE`→`ESTORNADO`,
`CHARGEBACK`/`PROTESTED`→`CHARGEBACK`, `CANCELLED`/`EXPIRED`→`CANCELADO`, `BLOCKED`→`RECUSADO`;
`STARTED`/`PRE_ORDER` **fora do mapa de propósito** → `DESCONHECIDO`+revisão; **compartilhado**
entre PRD/SVC e entre as 3 fontes `hotmart.webhook`/`hotmart.api`/`hotmart.csv` — o CSV
espelha o enum da API, Assumption) mora no `financeiro` e é consumido lá pela etapa 3 da 018;
registrado via `Object.assign(MAPAS_STATUS, { HOTMART_PRD: HOTMART, HOTMART_SVC: HOTMART })`.
**Superfície HTTP fina**: **2 endpoints** `POST /ingestao/hotmart/{sincronizar,importar-csv}`
sob a permissão **já existente** `evento:ingerir` (`conta` **obrigatória** no corpo; CSV como
texto no corpo JSON, 0 dep de upload binário) + **2 webhooks públicos por conta**
`POST /webhooks/hotmart/{prd,svc}` — **STUB** (a Hotmart **não tem webhook na v1**): guarda
de flag `HOTMART_WEBHOOK_ENABLED` (default `false`) → **503** antes de autenticar/parsear;
`=true` → autentica `hottok` (`HOTMART_<conta>_WEBHOOK_TOKEN` via **`WebhookAuthenticator`**
da 003, header `X-HOTMART-HOTTOK`\|`Bearer`; token errado/ausente/**da outra conta** →
**401**, 0 evento) → parseia (removendo `hottok` do corpo — defesa) → registra
`hotmart.webhook` → **200**. O `parseWebhookHotmart` é **completo e testado** contra fixture
independente do flag. Todos são invólucros finos que só chamam
**`RegistrarEventoService.registrarEvento`** (a porta da etapa 0 que a 006 exportou "para os
adapters 019–022") — o worker faz classificar → resolver pessoa (018) → upsert transação
(018). **Nenhum `INSERT` direto, nenhuma etapa nova —
`worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts`/`classificar.ts`/`schema.prisma`
sem diff.** Payload/linha **sem `purchase.transaction`** → conta em `ignorados`, é logado, e
**não** é registrado; `200 { registrados: 0, ignorados: n }`. **`HotmartApiClient`** atrás de
interface + token DI (`HOTMART_API_CLIENT`), impl com **`fetch` nativo do Node 24** (0 dep —
padrão `TmbApiClient`/019, `AsaasApiClient`/020, `GuruApiClient`/021): **OAuth2
`client_credentials`** — `POST https://api-sec-vlc.hotmart.com/security/oauth/token` (header
`Authorization: Basic <HOTMART_<conta>_API_KEY>` + `grant_type` + `client_id` +
`client_secret` na query), `access_token` **cacheado em memória por conta** até `expires_in −
60s`; **2 métodos** `listarVendas`/`listarDetalhesPreco` paginam `GET
{base}/sales/{history,price/details}?start_date=<ms>&end_date=<ms>[&transaction_status=…]
[&page_token=…]` por cursor (`page_info.next_page_token`), header `Authorization: Bearer
<access_token>`, base `HOTMART_<conta>_API_BASE_URL` ??
`https://developers.hotmart.com/payments/api/v1`; **dublê nos e2e**
(`overrideProvider(HOTMART_API_CLIENT)`); sem
`HOTMART_<conta>_CLIENT_ID`/`_CLIENT_SECRET`/`_API_KEY` → `HotmartApiIndisponivelError(conta)`
→ `/sincronizar` responde **422** (não 500); janela > 365 dias → **422** no DTO
(`superRefine`, API não chamada — guarda contra o `502` de query lenta da Hotmart).
Controllers em `src/ingestao/hotmart/`; `WebhookAuthenticator` já vem do próprio
`IngestaoModule` (desde a 019). **Decisões com o dono do produto (2026-09-10)** — 022 não
está `⚠ clarify` no ROADMAP, mas as 3 decisões de fato ambíguas foram levadas ao dono:
**H-01** credenciais OAuth = **4 chaves `.env` novas dedicadas**
`HOTMART_{PRD,SVC}_CLIENT_{ID,SECRET}` (opcionais em todo `NODE_ENV`; `_API_KEY` guarda o
token **Basic** entregue pelo painel do dev; `_API_BASE_URL` a base da API de dados;
`_WEBHOOK_TOKEN` o `hottok` da conta — usado pelo webhook stub); **H-02** `GET
/sales/price/details` entra como **2ª chamada de rede** — `/sincronizar` pagina os dois
recursos na mesma janela e faz `merge` por `transaction` antes de registrar (`vat`+`fee`
refinam `valores.taxas` sob a guarda `0 < taxa < bruto` + mesma moeda; `coupon`/`base`/
`real_conversion_rate` sem slot canônico → só `payload_bruto` sob `price_details`; detalhe
faltando para uma venda **não** é erro; detalhe **órfão** é ignorado); **H-03** escopo =
parsers puros + endpoints finos `/ingestao/hotmart/*` + **webhook stub desligado** (parser
completo, rota em 503 até `HOTMART_WEBHOOK_ENABLED=true`; superfície `admin/` completa fica
p/ as specs 023/migração). Defaults documentados **H-04..H-20** no `spec.md` (§Clarifications)
— zero `NEEDS CLARIFICATION`. **Chave natural `id_origem` = `purchase.transaction`** (`"HP…"`,
consistente nas 3 fontes; **por conta** — só único dentro de `(<conta>, transaction)`, a
`PlataformaOrigem` desambigua; os N estados de uma compra `PRINTED_BILLET`→`APPROVED`→
`REFUNDED`… resolvem para `(<conta>, <transaction>)`, o `UPSERT_TRANSACAO` da 018 mantém 1
linha, último evento vence, Regra Inviolável nº 1 por construção; cada recorrência de
assinatura tem `transaction` própria). **`statusOrigem` = `purchase.status` cru** (o `event`
do webhook — `PURCHASE_APPROVED`… — fica só no `payload_bruto`; o parser do webhook lê
`data.purchase.status`, **não** o `event`). **Moeda sempre exposta**:
`purchase.price.currency_code` (API) / `.currency_value` (webhook) / coluna `moeda` (CSV),
ISO 4217 validado pelo `core`; ausente/inválida → `BRL` cravado (erro não-fatal em `erros`).
**Papel de afiliada**: `purchase.commission_as === "AFFILIATE"` → `ehAfiliada = true` →
`classificar` → `VENDA_AFILIADA` (Regra Inviolável nº 8); `PRODUCER`/`COPRODUCER` →
`VENDA_PROPRIA`. **Assinatura**: `purchase.is_subscription === true` → `assinatura.ehRecorrencia
= true`; `purchase.recurrency_number`/`recurrence_number` → `numeroCiclo` (> 1 →
`RECORRENCIA`). O adapter **nunca emite `referenciaExterna`** (a Hotmart processa a própria
cobrança — não terceiriza como a Guru→Asaas). **Comprador**: API `sales/history` só
`buyer.name` + `buyer.email`; webhook `data.buyer` rico (nome, e-mail, `document`,
`checkout_phone` + `checkout_phone_code`, `address.*`); CSV colunas de comprador.
`valores.bruto` = `purchase.price.value`; `valores.taxas` = `purchase.hotmart_fee.total` (ou
`fee+vat` do detalhe) só quando `0 < taxa < bruto` + mesma moeda; `valores.liquido` = `bruto
− taxas` sob a mesma guarda; `full_price`/`original_offer_price`/`commissions[]`/
`installments_number` só no `payload_bruto`. `ocorridoEm` = `purchase.approved_date` ??
`purchase.order_date` (**epoch ms** — string crua; a etapa 3/018 aplica `parseInstante` do
`core`, o limiar `1e11` distingue s/ms) / `data_aprovacao` ?? `data_pedido` ?? `data_criacao`
(CSV). O DTO de `/sincronizar` recebe `YYYY-MM-DD` (borda amigável) e o `HotmartApiClient`
converte para ms. Parser de CSV **à mão** (0 dep — cópia da 021). **Segredo nunca persiste**:
`client_secret`/Basic/`access_token` OAuth/`hottok` nunca entram em `payload_bruto`/log/
resposta (`grep` no e2e = 0). **0 migração, 0 tabela, 0 dependência nova, 0 porta nova de
aplicação, 0 permissão nova, 0 frontend** (eventos no painel **Eventos**/006, transações em
**Financeiro · Transações**/018 sem mudança). Chaves `.env` **novas**:
`HOTMART_{PRD,SVC}_CLIENT_{ID,SECRET}` (4, opcionais) + `HOTMART_WEBHOOK_ENABLED` (1, default
`false`). `CONTEXT_MODULES` segue **11** — o adapter é subdiretório do `ingestao`. 840 testes
unitários backend (+63 vs. a 021 — domínio puro: `normalizar-hotmart` (helpers + moeda
parametrizada + `taxasDe`/`somarDinheiro`), `parse-venda-api` contra fixture real de
`sales/history` + merge de `price/details` + afiliada + assinatura + estorno colapsado,
`parse-webhook` (stub, contra fixtures `PURCHASE_*` — comprador rico, sem `hottok`),
`parse-linha-csv`, `hotmart-api-client` com dublê de `fetch` (1 POST de OAuth reusado,
paginação por `page_token`, `transaction_status` repetido, 502), `status-map/hotmart` com
varredura de cobertura de vocabulário contra as fixtures) + 410 e2e (23 suítes, +16 —
Postgres real, container isolado **`pandora-db-spec022` na porta 55439**, já que
55432/55433/55435/55436/55438 estavam em uso por outras sessões: US1 sincronização com dublê
de 2 páginas de `sales/history` por cursor → transações `HOTMART_PRD` + `APPROVED`→`PAGO` +
`WAITING_PAYMENT`→`PENDENTE` + sem credenciais → 422 + `conta` inválida → 422 + janela > 365d
→ 422 (API não chamada), US2 `price/details` casado → `payload_bruto.price_details` + `ABC10`
+ venda sem detalhe sem erro + `commission_as: "AFFILIATE"` → `VENDA_AFILIADA` +
`is_subscription` + `recurrency_number: 3` → `RECORRENCIA` + `APPROVED`+`PARTIALLY_REFUNDED`
colapsa no `transaction` → 2 eventos, 1 transação `ESTORNADO`/`REEMBOLSO` + `STARTED` →
`DESCONHECIDO` + `precisa_revisao` + `evento_origem.status=revisar` + `CHARGEBACK` do mesmo
lote sem revisão, US3 import CSV 5 boas + 1 sem id → `{ novos: 5, ignoradas: 1 }` + 2º import
→ `novos: 0` + separador `;`, US4 webhook stub: flag desligado → 503 + 0 evento + 2ª
instância com `HOTMART_WEBHOOK_ENABLED=true` → 200 + 1 `evento_origem` `hotmart.webhook` sem
`hottok` + `processar` → `PAGO` + `hottok` errado → 401, SC-016 isolamento PRD/SVC → 2
transações, segredo (`grep` = 0), `grep` de fronteira, catálogo RBAC inalterado, `/health` =
11), todos verdes; lint/typecheck/build limpos no backend; frontend inalterado. Artefatos:
`research.md`, `data-model.md`, `contracts/` (4), `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 021 — Adaptadores de borda da Guru (implementada, resumo arquivado)</summary>

Plano: [`specs/021-adapter-guru/plan.md`](specs/021-adapter-guru/plan.md)
(Fase 2 · spec 021 — **Adaptadores de borda da Guru**: 3ª das 4 specs de adaptadores da
Fase 2 (019 TMB ✅, 020 Asaas ✅, 021 Guru, 022 Hotmart) — molde direto da 019/020.
Materializa o **Princípio III** para as **duas contas Guru** `GURU_PRD` / `GURU_SVC`
(`PlataformaOrigem` do `core`): 3 funções **puras** `parse*()` (webhook de Vendas — objeto
de transação `{ id, status, dates, payment, contact, product, subscription, type, api_token,
webhook_type }` / API `GET /api/v2/transactions` **paginação por cursor** — `next_cursor`
enquanto `has_more_pages`, janela obrigatória ≤ 180 dias / CSV de export) transformam os
payloads crus em **`EventoCanonico`** do `core` — **recebendo a `conta` como parâmetro** (o
payload da Guru nunca a determina — vem do path `/prd`\|`/svc` ou do corpo do endpoint),
testadas contra **fixtures reais sem tocar o banco**. Vivem em
**`src/ingestao/adapters/guru/`** (visão Apêndice C); **não importam
`financeiro`/`clientes`** — o **`financeiro/domain/status-map/guru.ts`** (vocabulário bruto →
`StatusTransacaoCanonico`: `approved`/`completed`→`PAGO`,
`waiting_payment`/`pending`/`billet_printed`/`processing`/`analysis`/`charging`→`PENDENTE`,
`delayed`/`in_recovery`→`EM_ATRASO`, `refunded`/`dispute`→`ESTORNADO`,
`chargeback`→`CHARGEBACK`, `canceled`/`expired`→`CANCELADO`,
`rejected`/`failed`/`blocked`→`RECUSADO`; `trial`/`started`/`abandoned`/`scheduled`/
`pending_transfer`/`transferred` **fora do mapa de propósito** → `DESCONHECIDO`+revisão;
**compartilhado** entre PRD/SVC e entre as 3 fontes `guru.webhook`/`guru.api`/`guru.csv` — o
CSV espelha o enum da API, Assumption) mora no `financeiro` e é consumido lá pela etapa 3 da
018; registrado via `Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU })` —
`mapearStatus` (018) é chamado com `plataforma = "GURU_PRD"`\|`"GURU_SVC"`, as duas apontam
para o mesmo objeto. **Superfície HTTP fina**: **2 webhooks públicos por conta**
`POST /webhooks/guru/{prd,svc}` (prefixo `/webhooks/` já é allowlist da 003; **auth real =
campo `api_token` NO CORPO do JSON** — equivale ao Account Token da conta, verificado em
tempo constante pelo **`WebhookAuthenticator`** da 003, **diferente do header de TMB/Asaas**;
token errado/ausente/**da outra conta** → **401**, 0 evento; **não** HMAC; o `api_token` é
**removido** do `payload_bruto` antes de registrar o evento — segredo, `grep` do valor no
`evento_origem` = 0) + **2 endpoints** `POST /ingestao/guru/{sincronizar,importar-csv}` sob
a permissão **já existente** `evento:ingerir` (`conta` **obrigatória** no corpo; CSV como
texto no corpo JSON, 0 dep de upload binário). Todos são invólucros finos que só chamam
**`RegistrarEventoService.registrarEvento`** (a porta da etapa 0 que a 006 exportou "para os
adapters 019–022") — o worker faz classificar → resolver pessoa (018) → upsert transação
(018). **Nenhum `INSERT` direto, nenhuma etapa nova —
`worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts`/`classificar.ts`/`schema.prisma`
sem diff.** Payload de webhook **sem `id` de transação** (webhook de
assinatura/contrato/eticket que a Guru manda para a mesma URL, ou lixo) → conta em
`ignorados`, é logado, e **não** é registrado; `200 { registrados: 0, ignorados: n }` — a
Guru espera 2xx e **suprime retentativas em 4xx** (`0/401/403/404/406/410/422/505/506/510/
511`), por isso erro de parse é **200**, nunca 4xx. **`GuruApiClient`** atrás de interface +
token DI (`GURU_API_CLIENT`), impl com **`fetch` nativo do Node 24** (0 dep — padrão
`TmbApiClient`/019, `AsaasApiClient`/020): header **`Authorization: Bearer <GURU_<conta>
_API_KEY>`** (Account Token) + `Accept` + `User-Agent`, base `GURU_<conta>_API_BASE_URL` ??
`https://digitalmanager.guru/api/v2`; **paginação por cursor** (segue `next_cursor` enquanto
`has_more_pages` é `1`/`true`), `<campoData>_ini`/`<campoData>_end` (`ordered_at` default);
**dublê nos e2e** (`overrideProvider(GURU_API_CLIENT)`); sem `GURU_<conta>_API_KEY` →
`GuruApiIndisponivelError(conta)` → `/sincronizar` responde **422** (não 500); janela >
180 dias → **422** no DTO (`superRefine`, API não chamada). Controllers em
`src/ingestao/guru/`; `WebhookAuthenticator` já vem do próprio `IngestaoModule` (desde a
019). **Decisões com o dono do produto (2026-09-10)** — 021 não está `⚠ clarify` no ROADMAP,
mas as 3 decisões de fato ambíguas foram levadas ao dono: **G-01** chave natural `id_origem`
= `transaction.id` (UUID, consistente nas 3 fontes; **por conta** — só único dentro de
`(<conta>, id)`, a `PlataformaOrigem` desambigua; os N webhooks de uma venda — aprovada →
reembolsada → chargeback… — resolvem para `(<conta>, <id>)`, o `UPSERT_TRANSACAO` da 018
mantém 1 linha, último evento vence, Regra Inviolável nº 1 por construção; ciclos de
assinatura têm `id` próprio); **G-02** o adapter Guru **NÃO emite `referenciaExterna`** — a
Guru é a **venda de registro** (Regra Inviolável nº 2 — "uma venda Guru+Asaas conta 1×; só a
Guru soma receita"); `payment.marketplace_id`/`payment.marketplace_name` (id da cobrança no
processador — pode ser a cobrança Asaas) ficam só no `payload_bruto`; nem toda venda Guru
terceiriza para a Asaas (cartão via mundipagg, pix nativo…), então deduzir a ponte no
adapter marcaria toda venda como `DESCONHECIDO`; a **spec 024** (`RESOLVER_VINCULO`, etapa
4) casa `asaas.payment.externalReference` → `guru.transaction.id` com contexto
cross-transação; **G-03** escopo = parser puro + endpoints finos `/ingestao/guru/*`
(superfície `admin/` completa fica p/ a spec de migração). Defaults documentados
**G-04..G-18** no `spec.md` (§Clarifications) — zero `NEEDS CLARIFICATION`. **`statusOrigem`
= `transaction.status` cru** (sem ajuste sintético — não há caso `deleted` como na Asaas);
`webhook_type` só no `payload_bruto`. **Oferta nativa**: `product.offer.id`/`name` /
`items[0].offer.id` → `oferta.codigoOrigem`/`nomeOrigem`, `product.qty` → `quantidade` (a
resolução `(tag AEN, plataforma)` é da spec 023); **cupom/garantia** (`payment.coupon.*`,
`dates.warranty_until`) sem slot canônico → só `payload_bruto`. **Assinatura nativa**:
`product.type === "plan"` **e** `subscription.id` presente → `assinatura.ehRecorrencia =
true`; `invoice.cycle` → `numeroCiclo`; `plan` com `subscription` vazio (1ª venda negada) →
sem bloco `assinatura`. **Moeda exposta** (diferente de TMB/Asaas): `payment.currency`
validado por `ehMoeda` do `core`; ausente/inválida → `BRL` cravado (erro não-fatal em
`erros`). **Papel de afiliada**: `type === "affiliate"` → `ehAfiliada = true` →
`classificar` → `VENDA_AFILIADA`; `producer`/`co_producer` → `VENDA_PROPRIA`. **Comprador
rico** do objeto `contact` (nome, e-mail, `doc` → documento, `phone_local_code` +
`phone_number` → telefones, `address*` → endereço). `valores.bruto` = `payment.gross`,
`valores.liquido` = `payment.net`, `valores.taxas` = `payment.tax.value` (ou `gross − net`)
só quando `0 < taxa < bruto`; `payment.total`/`discount_value`/`affiliate_value`/
`installments.*` só no `payload_bruto`. `ocorridoEm` = `dates.confirmed_at` ?? `.ordered_at`
?? `.created_at` ?? `.updated_at` (webhook/API) / `data_aprovacao` ?? `data_pedido` ??
`data_criacao` (CSV), string crua — a etapa 3 (018) aplica `parseInstante` do `core` (tolera
`"2023-09-19T09:19:04Z"`, date-only, epoch). Parser de CSV **à mão** (0 dep — cópia da 020:
detecta `,`/`;` no cabeçalho, tira BOM, mini state-machine de aspas; mapa de colunas com
aliases inglês/pt-BR). **0 migração, 0 tabela, 0 dependência nova, 0 chave `.env` nova**
(`GURU_PRD_*`/`GURU_SVC_*` já em `accountConfig` da 001/003), **0 porta nova, 0 permissão
nova, 0 frontend** (os eventos aparecem no painel **Eventos**/006, as transações em
**Financeiro · Transações**/018 sem mudança de frontend). `CONTEXT_MODULES` segue **11** — o
adapter é subdiretório do `ingestao`. 777 testes unitários backend (+66 vs. a 020 — domínio
puro: helpers de normalização + `moedaDeGuru`/`dinheiroDeValorGuru` com moeda parametrizada,
os 3 parsers contra fixtures reais, `GuruApiClient` com dublê de `fetch` e encadeamento por
cursor, `status-map/guru` com varredura de cobertura de vocabulário contra as fixtures) +
394 e2e (22 suítes, +18 — Postgres real, container isolado **`pandora-db-spec021` na porta
55438**, já que 55432/55433/55435/55436 estavam em uso por outras sessões: US1 webhook por
conta → transação + `payload_bruto` sem `api_token` + `waiting_payment`/`chargeback` + 401 +
webhook de assinatura ignorado, US2 `type: "affiliate"` → `VENDA_AFILIADA` + `invoice.cycle`
→ `RECORRENCIA` + plano negado sem `subscription` + `approved`+`refunded` colapsa no `id` →
1 transação `ESTORNADO`/`REEMBOLSO` + dedup por hash + `trial` → revisão, US3 sincronização
com dublê de 2 páginas encadeadas por cursor + `conta` fora do enum → 422 + janela > 180d →
422 (API não chamada) + sem chave → 422, US4 import CSV com comprador, SC-015 isolamento
PRD/SVC → 2 transações, `grep` de fronteira, catálogo RBAC inalterado, `/health` = 11),
todos verdes; lint/typecheck/build limpos no backend; frontend inalterado. Artefatos:
`research.md`, `data-model.md`, `contracts/` (4), `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 020 — Adaptadores de borda da Asaas (implementada, resumo arquivado)</summary>

Plano: [`specs/020-adapter-asaas/plan.md`](specs/020-adapter-asaas/plan.md)
(Fase 2 · spec 020 — **Adaptadores de borda da Asaas**: 2ª das 4 specs de adaptadores da
Fase 2 (019 TMB ✅, 020 Asaas, 021 Guru, 022 Hotmart) — molde direto da 019. Materializa o
**Princípio III** para as **duas contas Asaas** `ASAAS_PRD` / `ASAAS_SVC` (`PlataformaOrigem`
do `core`): 3 funções **puras** `parse*()` (webhook de cobrança `{ event, payment }`
`payment.status` / API `GET /v3/payments` paginada `offset`/`limit`/`hasMore` / CSV de
export) transformam os payloads crus em **`EventoCanonico`** do `core` — **recebendo a
`conta` como parâmetro** (diferente da 019: TMB é conta única; aqui o payload da Asaas
**nunca** determina a conta — ela vem do path `/prd`\|`/svc` ou do corpo do endpoint),
testadas contra **fixtures reais sem tocar o banco**. Vivem em
**`src/ingestao/adapters/asaas/`** (visão Apêndice C); **não importam `financeiro`/`clientes`**
— o **`financeiro/domain/status-map/asaas.ts`** (vocabulário bruto → `StatusTransacaoCanonico`:
`RECEIVED`/`CONFIRMED`/`RECEIVED_IN_CASH`/`DUNNING_RECEIVED`→`PAGO`,
`PENDING`/`AWAITING_RISK_ANALYSIS`→`PENDENTE`, `OVERDUE`/`DUNNING_REQUESTED`→`EM_ATRASO`,
`REFUNDED`/`REFUND_REQUESTED`/`REFUND_IN_PROGRESS`→`ESTORNADO`,
`CHARGEBACK_REQUESTED`/`CHARGEBACK_DISPUTE`/`AWAITING_CHARGEBACK_REVERSAL`→`CHARGEBACK`,
`DELETED`→`CANCELADO`; **compartilhado** entre PRD/SVC e entre as 3 fontes
`asaas.webhook`/`asaas.api`/`asaas.csv` — o CSV espelha o enum da API, Assumption) mora no
`financeiro` e é consumido lá pela etapa 3 da 018; registrado via
`Object.assign(MAPAS_STATUS, { ASAAS_PRD: ASAAS, ASAAS_SVC: ASAAS })` — `mapearStatus` (018)
é chamado com `plataforma = "ASAAS_PRD"`\|`"ASAAS_SVC"`, as duas apontam para o mesmo objeto.
**Superfície HTTP fina**: **2 webhooks públicos por conta**
`POST /webhooks/asaas/{prd,svc}` (prefixo `/webhooks/` já é allowlist da 003; auth real =
`ASAAS_PRD_WEBHOOK_TOKEN`/`ASAAS_SVC_WEBHOOK_TOKEN` verificado em tempo constante pelo
**`WebhookAuthenticator`** da 003, header `asaas-access-token` | `authorization: Bearer`;
token errado/ausente/**da outra conta** → **401**, 0 evento; **não** HMAC — a Asaas não
assina o corpo) + **2 endpoints** `POST /ingestao/asaas/{sincronizar,importar-csv}` sob a
permissão **já existente** `evento:ingerir` (`conta` **obrigatória** no corpo — o webhook a
tira do path; CSV como texto no corpo JSON, 0 dep de upload binário). Todos são invólucros
finos que só chamam **`RegistrarEventoService.registrarEvento`** (a porta da etapa 0 que a
006 exportou "para os adapters 019–022") — o worker faz classificar → resolver pessoa (018)
→ upsert transação (018). **Nenhum `INSERT` direto, nenhuma etapa nova —
`worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts`/`classificar.ts`/`schema.prisma`
sem diff.** Payload de webhook **sem `payment.id`** (evento `TRANSFER_*`/`SUBSCRIPTION_*` que
a Asaas manda para a mesma URL, ou lixo) → conta em `ignorados`, é logado, e **não** é
registrado (sem identidade não há dedup nem projeção); `200 { registrados: 0, ignorados: n }`
— a Asaas espera 2xx (a fila pausa após muitas falhas). **`AsaasApiClient`** atrás de
interface + token DI (`ASAAS_API_CLIENT`), impl com **`fetch` nativo do Node 24** (0 dep —
padrão `TmbApiClient`/019, `GraphApiClient`/011): header **`access_token: <ASAAS_<conta>
_API_KEY>`** (a Asaas usa esse header, **não** `Bearer`) + `User-Agent`, base
`ASAAS_<conta>_API_BASE_URL` ?? `https://api.asaas.com/v3` (sandbox é config); pagina
`offset`/`limit` (default/teto 100) enquanto `body.hasMore`, com
`dateCreated[ge]`/`dateCreated[le]`; **dublê nos e2e** (`overrideProvider(ASAAS_API_CLIENT)`);
sem `ASAAS_<conta>_API_KEY` → `AsaasApiIndisponivelError(conta)` → `/sincronizar` responde
**422** (não 500). Controllers em `src/ingestao/asaas/`; `WebhookAuthenticator` já vem do
próprio `IngestaoModule` (desde a 019). **Decisões com o dono do produto (2026-09-10)** —
020 não está `⚠ clarify` no ROADMAP, mas as 3 decisões de fato ambíguas foram levadas ao
dono: **A-01** chave natural `id_origem` = `payment.id` (`"pay_…"`, consistente nas 3
fontes; **por conta** — só único dentro de `(<conta>, payment.id)`, a `PlataformaOrigem`
desambigua; os N eventos de uma cobrança — created → confirmed → received → refunded… —
resolvem para `(<conta>, <payment.id>)`, o `UPSERT_TRANSACAO` da 018 mantém 1 linha e o
`status_canonico` reflete o último evento processado, Regra Inviolável nº 1 por construção);
**A-02** `payment.externalReference` → `EventoCanonico.referenciaExterna.idOrigem` **sem**
`plataforma` (o adapter transporta a ponte crua para a Guru; `classificar` regra 2 —
`ref.idOrigem && ref.plataforma && ref.plataforma !== conta` → `DESCONHECIDO`+`revisar` p/
024 — **não dispara** sem `ref.plataforma`, então a cobrança cai em `VENDA_PROPRIA` ou
`RECORRENCIA` se tiver `subscription`, **nunca** `DESCONHECIDO` por causa do
`externalReference`; cravar o vínculo Asaas↔Guru de fato e marcar a Asaas como não-receita é
da **spec 024**, etapa 4; cobrança avulsa sem `externalReference` resolve tudo
normalmente); **A-03** escopo = parser puro + endpoints finos `/ingestao/asaas/*` (superfície
`admin/` completa fica p/ a spec de migração). Defaults documentados **A-04..A-16** no
`spec.md` (§Clarifications) — zero `NEEDS CLARIFICATION`. **Ajuste sintético** (A-05):
`statusOrigem` = `payment.status` cru **exceto** quando `payment.deleted === true` (cobrança
removida — o `payment.status` fica congelado no valor anterior e não reflete a remoção) → o
adapter emite `"DELETED"` (conceito real da Asaas, determinístico — não um palpite);
`status-map` traduz `DELETED → CANCELADO`; `PAYMENT_RESTORED` volta ao `payment.status` real.
**Asaas não tem** papel de afiliada (`ehAfiliada` nunca emitido); **tem** assinatura nativa
(`payment.subscription` não-vazio → `assinatura.ehRecorrencia = true` → `classificar` →
`RECORRENCIA`); moeda não exposta → `BRL` cravado na borda (`Dinheiro.deDecimal` do `core`,
escala ×10000, sem `float`); **comprador não vem no `payment`** (só o id `cus_…`) — o
`comprador` do `EventoCanonico` fica vazio no webhook/API (`RESOLVER_PESSOA` da 018 tolera),
só o **CSV** monta comprador das colunas `cliente`/`email`/`cpf_cnpj`/`telefone`; enriquecer
via `GET /v3/customers/{id}` (2ª chamada de rede) fica p/ spec futura. `valores.bruto` =
`payment.value`, `valores.liquido` = `payment.netValue`, `valores.taxas` = `value − netValue`
só quando `0 < resultado < value`; `originalValue`/`interestValue`/`discount`/`refunds[]` só
no `payload_bruto`. `ocorridoEm` = `paymentDate`??`confirmedDate`??`clientPaymentDate`??
`dateCreated` (webhook/API) / `data_pagamento`??`data_criacao`??`vencimento` (CSV), string
crua — a etapa 3 (018) aplica `parseInstante` do `core` (tolera `"2024-05-10"` date-only,
`"2024-05-10 11:20:32"` com espaço, ISO c/ fuso). Parser de CSV **à mão** (0 dep — cópia da
019: detecta `,`/`;` no cabeçalho, tira BOM, mini state-machine de aspas; mapa de colunas
com aliases inglês/pt-BR). O `payload_bruto` do webhook é o **envelope inteiro**
`{ event, payment }` — eventos distintos do mesmo `payment.id` têm hashes distintos (N
`evento_origem`), reentrega do mesmo evento é dedup por hash. **0 migração, 0 tabela, 0
dependência nova, 0 chave `.env` nova** (`ASAAS_PRD_*`/`ASAAS_SVC_*` já em `accountConfig`
da 001/003), **0 porta nova, 0 permissão nova, 0 frontend** (os eventos aparecem no painel
**Eventos**/006, as transações em **Financeiro · Transações**/018 sem mudança de frontend).
`CONTEXT_MODULES` segue **11** — o adapter é subdiretório do `ingestao`. 711 testes
unitários backend (+55 vs. a 019 — domínio puro: helpers de normalização, os 3 parsers
contra fixtures reais, `AsaasApiClient` com dublê de `fetch`, `status-map/asaas` com
varredura de cobertura de vocabulário contra as fixtures) + 376 e2e (21 suítes, +16 —
Postgres real, container isolado **`pandora-db-spec020` na porta 55437**, já que
55432/55433/55435/55436 estavam em uso por outras sessões: US1 webhook por conta → transação
+ OVERDUE/DELETED + 401 + evento não-cobrança, US2 ponte Guru sem forçar revisão +
`PAYMENT_REFUNDED` colapsa no `payment.id` → 1 transação `ESTORNADO`/`REEMBOLSO` + dedup por
hash + status inédito → revisão, US3 sincronização com dublê de 2 páginas + `conta` fora do
enum → 422 + sem chave → 422, US4 import CSV com comprador, SC-015 isolamento PRD/SVC → 2
transações, `grep` de fronteira, catálogo RBAC inalterado, `/health` = 11), todos verdes;
lint/typecheck/build limpos no backend; frontend inalterado. Artefatos: `research.md`,
`data-model.md`, `contracts/` (4), `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 019 — Adaptadores de borda da TMB (implementada, resumo arquivado)</summary>

Plano: [`specs/019-adapter-tmb/plan.md`](specs/019-adapter-tmb/plan.md)
(Fase 2 · spec 019 — **Adaptadores de borda da TMB**: 1ª das 4 specs de adaptadores da Fase
2 (019 TMB, 020 Asaas, 021 Guru, 022 Hotmart). Materializa o **Princípio III** (bordas
finas, núcleo canônico) para a conta única **`TMB`**: 4 funções **puras** `parse*()`
(webhook Vendas achatado `status_pedido` / webhook Financeiro **array** `[{dados}]` nível de
parcela `status_pagamento` / API `GET /api/pedidos` paginada / CSV) transformam os payloads
crus em **`EventoCanonico`** do `core` — o contrato validado que o pipeline da 006/018 já
processa —, testadas contra **fixtures reais sem tocar o banco**. Vivem em
**`src/ingestao/adapters/tmb/`** (visão Apêndice C); **não importam `financeiro`** — o
**`financeiro/domain/status-map/tmb.ts`** (vocabulário bruto → `StatusTransacaoCanonico`,
por fonte `tmb.webhook-vendas`/`tmb.webhook-financeiro`/`tmb.api`/`tmb.csv`) mora no
`financeiro` (dono de `status_canonico`) e é consumido lá pela etapa 3 da 018;
registrado via `Object.assign(MAPAS_STATUS, { TMB })` — a 018 deixou `MAPAS_STATUS` vazio
"para as specs 019–022 popularem". **Superfície HTTP fina**: **2 webhooks públicos**
`POST /webhooks/tmb/{vendas,financeiro}` (o prefixo `/webhooks/` já é allowlist pública da
003 — `JwtAuthGuard`/`PermissionGuard` liberam por path; a auth real é o `TMB_WEBHOOK_TOKEN`
verificado em tempo constante pelo **`WebhookAuthenticator`** da 003, header
`x-tmb-webhook-token` | `authorization: Bearer`; token errado/ausente → **401**, 0 evento) +
**2 endpoints** `POST /ingestao/tmb/{sincronizar,importar-csv}` sob a permissão **já
existente** `evento:ingerir` (CSV como **texto no corpo JSON** — 0 dep de upload binário,
precedente da 015). Todos são invólucros finos que só chamam
**`RegistrarEventoService.registrarEvento`** (a porta da etapa 0 que a 006 exportou "para os
adapters 019–022 injetarem") — o worker da 006 faz classificar → resolver pessoa (018) →
upsert transação (018). **Nenhum `INSERT` direto, nenhum `commit()` de remendo, nenhuma
etapa nova no pipeline — `worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts` sem
diff.** **`TmbApiClient`** atrás de interface + token DI (`TMB_API_CLIENT`), impl com
**`fetch` nativo do Node 24** (0 dep — padrão `GraphApiClient`/011, `SugestaoIaClient`/013),
pagina `pageNumber`/`pageSize` (default 50) até esgotar; **dublê nos e2e**
(`overrideProvider`); sem `TMB_API_BASE_URL`/`TMB_API_KEY` → `TmbApiIndisponivelError` →
`/sincronizar` responde **422** (não 500). Controllers em `src/ingestao/tmb/`;
`WebhookAuthenticator` é providido pelo próprio `IngestaoModule` (stateless — evita importar
`AuthModule`, que registra `APP_GUARD`). **Decisões com o dono do produto (2026-09-10)** —
019 não está `⚠ clarify` no ROADMAP, mas as 3 decisões de fato ambíguas foram levadas ao
dono: **D-01** chave natural `id_origem` = `pedido`/`pedido_id` (inteiro→string, consistente
nas 4 fontes; `id_externo` — ref de checkout externo, pode ser vazio — só no `payload_bruto`;
os 2 webhooks + API + CSV de um pedido resolvem para `(TMB, "<pedido>")`, Regra Inviolável
nº 1 por construção); **D-02** webhook Financeiro (nível de parcela) **colapsa para o
pedido, último evento vence** (cada notificação de parcela vira um `EventoCanonico` próprio
com `hash` distinto → `evento_origem` imutável, histórico completo preservado; o
`UPSERT_TRANSACAO` da 018 já faz upsert por `(plataforma, id_origem)` e o `status_canonico`
reflete o último evento processado; refino "estado da carteira de parcelas" fica p/ spec
futura de cobranças; `status_financeiro` de pedido `Adimplente`/`Inadimplente` **não** é
status de transação — não entra no `status-map`); **D-03** escopo = parser puro + endpoints
finos `/ingestao/tmb/*` (a superfície `admin/` completa da visão fica p/ a spec de migração
— o `AdminModule` está vazio desde a 001). Defaults documentados **D-04..D-15** no `spec.md`
(§Clarifications) — zero `NEEDS CLARIFICATION`. **Melhoria colateral** (regra local, sem
adapter — não toca pipeline/worker/schema, FR-025): o `RE_ESTORNO` de `classificar.ts` (006)
foi ampliado de `estorno` para `estorn[oa]|reembols|refund|chargeback|charge_back|devolu[cç]`
para casar os particípios pt-BR (`Estornado`/`Estornada`/`Reembolsado`/`Devolução`) que a
TMB manda em `status_pagamento` — beneficia todos os adapters. **TMB não tem** conceito de
assinatura/recorrência (`assinatura` nunca preenchido) nem papel de afiliada (`ehAfiliada`
nunca emitido — `classificar` assume não-afiliada); moeda não exposta → `BRL` cravado na
borda (default explícito, `Dinheiro.deDecimal` do `core`, escala ×10000, sem `float`);
método de pagamento e vencimento não expostos → só no `payload_bruto`. `valores.bruto` =
`valor_principal`, `valores.taxas` = `taxa_administracao`, `valores.liquido` = derivado só
quando `0 < bruto−taxas < bruto` (webhook Financeiro **não emite `valores`** — FR-012,
evita que `camposAlterados` da 018 zere o valor da venda já gravado). `ocorridoEm` =
`data_efetivado`\|\|`criado_em` (Vendas/API) / `data_pagamento`\|\|`vencimento_parcela`
(Financeiro), string crua repassada — a etapa 3 (018) aplica `parseInstante` do `core`.
Parser de CSV **à mão** (0 dep — detecta separador `,`/`;` no cabeçalho, tira BOM, mini
state-machine de aspas). **0 migração, 0 tabela, 0 dependência nova, 0 chave `.env` nova**
(`TMB_API_BASE_URL`/`TMB_API_KEY`/`TMB_WEBHOOK_TOKEN` já em `accountConfig('TMB')` da 003),
**0 porta nova, 0 permissão nova, 0 frontend** (os eventos aparecem no painel **Eventos**/006,
as transações em **Financeiro · Transações**/018 sem mudança de frontend). `CONTEXT_MODULES`
segue **11** — o adapter é subdiretório do `ingestao`. 656 testes unitários backend (+47 vs.
a 018 — domínio puro: helpers de normalização, os 4 parsers contra fixtures reais,
`TmbApiClient` com dublê de `fetch`, `status-map/tmb` com varredura de cobertura de
vocabulário, +4 casos de particípio pt-BR em `classificar.spec.ts`) + 360 e2e (20 suítes,
+13 — Postgres real, container isolado **`pandora-db-spec019` na porta 55436**, já que
55432/55433/55435 estavam em uso por outras sessões: US1 webhook Vendas → transação + 401,
US2 webhook Financeiro colapsa no pedido + dedup por hash + status inédito → revisão, US3
sincronização com dublê de 2 páginas + 422 sem config, US4 import CSV, `grep` de fronteira,
catálogo RBAC inalterado, `/health` = 11), todos verdes; lint/typecheck/build limpos no
backend; frontend inalterado. Artefatos: `research.md`, `data-model.md`, `contracts/` (4),
`quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 018 — Financeiro · ledger de transações (implementada, resumo arquivado)</summary>

Plano: [`specs/018-financeiro-transacao-ledger/plan.md`](specs/018-financeiro-transacao-ledger/plan.md)
(Fase 2 · spec 018 — **Financeiro · ledger de transações**: primeira fatia da **Fase 2**
(Financeiro), visão Partes 1–6. O _bounded context_ **`financeiro`** (vazio desde a 001)
vira dono de **`transacao`** — a projeção normalizada de um evento financeiro, **1 linha por
`(plataforma_origem, id_origem)`** (Regra Inviolável nº 1), valores como `Dinheiro` do `core`
(4 pares `bigint ×10000 + char(3)`, `float` proibido), `status_canonico`, `classificacao` e
FKs opcionais — só `pessoa` + `evento_origem` com FK ativa; `oferta_id`/`contrato_id`/
`transacao_vinculada_id` são **colunas nuas, sem `@relation`** (specs 023/025/024 ligam via
`ALTER TABLE`, não destrutivo). **Pluga as etapas 2–3 do pipeline canônico da 006** (que
deixou o gancho — `especDona: 18` em `etapas.ts`, etapas 2–6 `pulada`) **sem tocar o
`WorkerService` além do ponto de extensão já previsto** (`definirExecutor`): `RESOLVER_PESSOA`
(reusa a engine de identidade/dedup da 005 pela **`PortaIdentidade`** do `core` — `crm`/
`financeiro` nunca importam `src/clientes/**`; `criar: false` sse `VENDA_AFILIADA` — Regra
Inviolável nº 8, nunca cria `pessoa`) e `UPSERT_TRANSACAO` (upsert pela chave natural,
devolve `ResultadoIngestao{transacao, foi_criada, campos_alterados}` gravado **só** em
`evento_etapa.resultado` — **nenhum `_houve_mudanca` no ORM, nenhum `commit()` de remendo**,
corrige as gambiarras 4.9/4.10 da v1). Etapas 4–6 seguem `pulada` (specs 024/023/025).
**Contrato compartilhado no `core`** (`core/pipeline/`): **`EventoCanonico` movido** de
`ingestao/domain` para cá (`ingestao/domain/evento-canonico.ts` vira re-export — 0
importador quebrado) + `ExecutorEtapaExterno` (`{ etapa, executar(entrada) }`, dados
planos, sem `EtapaCtx`). A plugagem é um **módulo de composição na raiz**
`src/pipeline-wiring.module.ts` (fora dos dirs de _bounded context_ — o único lugar
autorizado a importar de `ingestao` **e** `financeiro`, análogo ao `AppModule`; a regra
ESLint `import/no-restricted-paths` cobre só `src/<contexto>/`): no `onModuleInit` chama
`worker.definirExecutor(svc.etapa, criarWrapperExterno(svc))` — `criarWrapperExterno` (em
`ingestao/application/`) adapta `EtapaCtx` → `EntradaEtapaExterna` (monta `resultados`
lendo `evento_etapa`) e `SaidaEtapaExterna` → `ResultadoEtapa`. Specs 023–025 acrescentam
suas etapas aqui, **sem tocar o `WorkerService` de novo**. **NestJS 11 não tem
multi-provider** — a 1ª tentativa (token DI multi + `@Global() FinanceiroWiringModule`,
padrão `ClientesWiringModule`) foi trocada pelo wiring na raiz depois que `tsc` recusou
`multi: true` no `Provider`. **Status sem adapter** (D-05): `financeiro/domain/status-map/`
traz `MAPAS_STATUS` (por `plataforma × fonte`) — **vazio na 018**, populado pelos PRs das
specs 019–022 (`status-map/{tmb,asaas,guru,hotmart}.ts` + `status-map/README.md`);
`mapearStatus(plataforma, fonte, bruto)` tenta (1) valor canônico exato
(`paraStatusTransacaoCanonico` do `core` — sem `trim`/`lowercase`/sinônimo), (2) o mapa da
fonte; nada casou → `DESCONHECIDO` + `revisar` + `motivo` → `transacao.precisa_revisao =
true` + `evento_origem.status = revisar` (Regra nº 15 — nunca um palpite). Divergência
consciente da Apêndice C (que pôs `status_map` sob os adapters): `financeiro` é dono de
`status_canonico` e não pode importar `ingestao` — o adapter faz a extração crua, o
`financeiro` a tradução canônica. **Domínio puro** (`backend/src/financeiro/domain/`, sem
banco): `status-map` (+ paridade enum Prisma `StatusTransacaoCanonico` × enum TS do `core`
travada por teste), `dados-transacao.ts` (`extrairCanonicos(canonico) → DadosCanonicos` —
valores por moeda como `Dinheiro`, quantidade, recorrência, códigos crus de oferta;
ausência → `null`/`false`; + `SnapshotTransacao`), `diff-campos.ts` (`camposAlterados(
anterior, novo)` puro — `Dinheiro` por `valorInt`+`moeda`, `Date` por instante; criação →
campos preenchidos; nada mudou → `[]`), `deve-criar-pessoa.ts` (`false` só p/
`VENDA_AFILIADA`). **16ª migração Prisma** (`20260910123742_financeiro_transacao`, a 1ª do
`financeiro`): `transacao` (`@@unique([plataforma_origem, id_origem], name:
"transacao_chave_natural")`; 6 índices comuns) + enum `StatusTransacaoCanonico` (8
valores). **0 `CHECK`, 0 índice parcial, 0 tabela `_audit`** (não há escrita curada/
manual — o rastro é `evento_origem` imutável + `evento_etapa.resultado`; specs 024/025
introduzem `financeiro_audit`). Back-relations `Pessoa.transacoes`/`EventoOrigem.transacoes`
são só schema (precedente 008/009 — a fronteira do Princípio VI é sobre import de módulo
TS, não sobre o schema). **RBAC 004 estendido**: **+1** permissão (`transacao:ver`, recurso
novo `transacao`; `administrador`/credencial de serviço de graça, **0 migração de dados/
seed**). **~2 endpoints** de **leitura** `/financeiro/transacoes[/:id]` (filtros conta/
status canônico CSV/classificação CSV/`pagoDeFato` — derivado de
`STATUS_TRANSACAO_CANONICO.filter(contaComoReceita)`, nunca string hard-coded—/`pessoaId`/
`precisaRevisao`/período/`q`; paginação default 25 teto 100; valores serializados como
`{ valorInt: string, moeda }` — nunca `float`); **0 endpoint de escrita** (Princípio VIII —
`transacao` só é escrita pelo pipeline), **0 endpoint público novo**. Frontend
`frontend/src/transacoes/`: item **Financeiro · Transações** atrás de `transacao:ver`,
rotas `/financeiro/transacoes[/:id]` sob `<RequirePermissao>`; `TransacoesListPage`
(filtros + paginação + badge de status + `formatarDinheiro`), `TransacaoDetailPage`
(campos + valores por moeda + link "ver evento" → `/eventos/:id` e cliente →
`/pessoas/:id`); hooks TanStack Query inline, `apiFetch` já trata 401/403. **0 dep nova**
(backend e frontend), **1 migração**, **0 chave `.env` nova**, **0 porta nova**.
`CONTEXT_MODULES` segue **11**. Decisões D-01..D-08 resolvidas como defaults documentados
no `spec.md` (não marcada `⚠ clarify`), 2026-09-10. 609 testes unitários backend (20 novos,
domínio puro — sem banco) + 347 e2e (19 suítes, 22 novos, Postgres real — container
isolado `pandora-db-spec018` na porta 55435, já que 55432/55433/55434 estavam em uso por
outras sessões; suíte 003–018 completa) + 123 frontend (3 novos), todos verdes; lint/
typecheck/build limpos nos dois workspaces. 2 asserções da suíte e2e da 006 ajustadas
(RESOLVER_PESSOA/UPSERT_TRANSACAO agora reais; fixture `montarEventoCanonico` passou de
`statusOrigem: 'approved'` para `'PAGO'` — valor canônico que um adapter produziria).
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 017 — CRM · Dashboard (implementada, resumo arquivado)</summary>

Plano: [`specs/017-crm-dashboard/plan.md`](specs/017-crm-dashboard/plan.md)
(Fase 1 · spec 017 — **CRM · Dashboard**: décima-primeira e **última fatia da Fase 1 (CRM)**,
visão Parte 8 — dashboard comercial e de atendimento. Mora no _bounded context_ **`crm`**
(já não-vazio desde 007–016; `CONTEXT_MODULES` segue **11** — nenhum bounded context novo).
**Métricas 100% derivadas por query** (Princípio V é o cerne — **0 tabela de rollup, 0
contador persistido, 0 job**; a alternativa "tabela de métrica materializada" foi
considerada e rejeitada, D-09). Cobre **só dados do `crm`** (o Financeiro/018+ não existe):
`lead` (008), `oportunidade`/pipeline (010), `atendimento`/chat (012), `tarefa` (016),
`interacao` (009). **Catálogo fechado de painéis no código** `PAINEIS_DASHBOARD`
(`backend/src/crm/domain/dashboard/paineis.ts`, mesmo modelo do catálogo RBAC/004 e de
`ACAO_TIPOS`/014; `assertCatalogoPaineisCoerente()` aborta no boot do `CrmModule`) — 6
painéis: `visao_geral` (números + delta período-a-período), `funil_pipeline` (reusa
`agregarMetricas`/010, nunca soma moedas), `ranking_comercial` (por responsável — ganhas +
valor ganho por moeda + conversão + pontos de tarefa/016), `qualidade_atendimento` (tempo
méd. 1ª resposta / % SLA / CSAT / distribuição / taxa de resolução / por atendente / por
dia — reusa SLA·CSAT de 012), `leads_por_origem` (tabela), `serie_oportunidades` (série
temporal, bucket dia/semana/mês derivado da duração). Cada painel exige `dashboard:ver` +
(quando aplicável) uma permissão do recurso que expõe; sujeito só com `dashboard:ver` →
página 200 com painéis restritos, **nunca 403 na página inteira** (FR-006). **Escopo de
visão** de todo painel reusa o `escopoDe(req)` do `*ConsultaService` já existente
(`Oportunidade`/`Tarefa`/`Lead`/`Atendimento` — 010/016/008/012); o dashboard **nunca
amplia** o que o sujeito já vê (`PaineisService.resolverEscopos` tolera `Forbidden` → "não
enxerga nada" via `criadoEm < epoch`, não 500). **Comparação período-a-período** (benchmark
CL-04): `resolverPeriodo(de, ate)` (puro, `Date`/ISO simples — não o `parseInstante` de
borda; lixo → 400) devolve `{de, ate, anteriorDe, anteriorAte, duracaoDias, bucket}`;
`calcularDelta(valor, anterior)` → `{delta, deltaPercentual: anterior===0 ? null : …}`. **2
tabelas de escrita novas** (justificadas no gate VIII, análogas a `janela_atendimento`/
`feriado`/007): **`meta_comercial`** (alvo numérico para uma `metrica` de `METRICAS_META`
— catálogo fechado —, `periodo MES|TRIMESTRE` + `referencia @db.Date` normalizada,
escopo opcional `equipe_id`/`responsavel_id`, `alvo_int bigint` + `alvo_moeda char(3)?`
obrigatório sse a métrica é monetária; **`DELETE` físico** permitido, D-06); o atingimento
(`realizado`/`percentual`/`status ∈ {no_caminho,em_risco,batida,estourada}`/`noRitmo`) é
**sempre derivado** na leitura via `statusMeta(...)` puro sobre a mesma query da métrica
(CL-02, FR-011). **`dashboard_visao`** (recorte de leitura salvo — `nome`, `filtros`/
`paineis` jsonb validados por zod fechado, `dono_usuario_id`, `perfil_compartilhado_id?`;
só o dono edita/exclui, visão compartilhada = somente-leitura + clonável, D-07; credencial
de serviço não é `Usuario` real → 400 ao criar). **`GET /crm/dashboard/notificacoes`** —
metas do sujeito em risco/batidas/estouradas no período corrente, **só in-app** (mesmo
padrão de `NotificacaoService` de tarefa/016, CL-02 — sem worker, sem envio externo).
**Export 100% client-side, 0 dep** (CL-03/D-R9): painéis `tabela`/`ranking` aceitam
`?formato=csv` (`serializarCsv` puro no backend + `Blob` no frontend, mesmo padrão de
Disparos/015); "PDF" = `window.print()` + folha `@media print`. **Gráficos em SVG à mão**
(D-08 — funil = barras, série temporal = polyline; `@hello-pangea/dnd`/lib de chart
rejeitadas, mesmo precedente do Kanban HTML5 de 010). **15ª migração Prisma**
(`20260910113633_crm_dashboard`): `meta_comercial`, `dashboard_visao`, `crm_dashboard_audit`
(forma canônica do core, append-only, só delta real — 1 linha por campo, espelha
`crm_tarefa_audit`/016) + enum `MetaComercialPeriodo`; **só índices comuns**, nenhum `CHECK`/
índice parcial. **RBAC 004 estendido**: **+2** permissões (`dashboard:ver`,
`dashboard:gerir_metas`, recurso novo `dashboard`; `administrador`/credencial de serviço de
graça, **0 migração de dados/seed**). **~14 endpoints** `/crm/dashboard/**` (montar 1,
painel/catálogo 2, metas CRUD+listar 4, notificações 1, visões CRUD+clonar 5), **0 endpoint
público novo**. Frontend `frontend/src/dashboard/` — item **CRM · Dashboard** atrás de
`dashboard:ver` — `DashboardPage.tsx` (seletor de período default "últimos 30 dias" +
filtros equipe/responsável/pipeline + botão Imprimir/PDF + folha `@media print` inline),
`Paineis.tsx` (um renderer por formato — cartões com seta ▲/▼ do delta, funil SVG, tabela,
série SVG), `MetasPanel.tsx` (lista com barra de progresso + badge de status + CRUD atrás
de `dashboard:gerir_metas`), `NotificacoesMetaBadge.tsx` (`refetchInterval` 60s),
`exportar-csv.ts` (`Blob`). Hooks TanStack Query inline (padrão `whatsapp/WhatsappAdminPage.tsx`).
**0 dep nova** (backend e frontend), **1 migração**, **0 porta nova no `core`**, **0 chave
`.env` nova**. As 4 clarificações que definiam o escopo desta spec — alcance de
"configurável por perfil", metas dentro/fora, mecânica de export, escopo de dados /
profundidade de benchmark — foram resolvidas com o dono do produto **antes** da escrita do
`plan.md`, 2026-09-10 (spec.md, seção Clarifications). 589 testes unitários backend (44
novos, domínio puro — sem banco) + 325 e2e (18 novos, Postgres real — schema isolado num
container próprio na porta 55434, já que 55432/55433 estavam em uso por outras sessões;
suíte 003–017 completa) + 120 frontend (7 novos, 2 arquivos), todos verdes; lint/typecheck/
build limpos nos dois workspaces; validado também manualmente no navegador de ponta a ponta
(seed de leads/pipeline/oportunidade ganha/metas via API, abrir o dashboard, ver os 6
painéis com o delta período-a-período, o funil SVG com valor por moeda, a tabela de leads
por origem com "Exportar CSV", as 2 metas com atingimento derivado + status "Em risco" + o
badge "2 metas em alerta", e o formulário "Nova meta" inline).
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 016 — CRM · Tarefas (implementada, resumo arquivado)</summary>

Plano: [`specs/016-crm-tarefas/plan.md`](specs/016-crm-tarefas/plan.md)
(Fase 1 · spec 016 — **CRM · Tarefas**: décima fatia da Fase 1 (CRM), visão Parte 8.10 —
gestor de tarefas do time, pessoal e geral. Mora no _bounded context_ **`crm`** (já
não-vazio desde 007–015; `CONTEXT_MODULES` segue **11**). **`Tarefa`** — título, prazo,
responsável opcional (`null` = "geral", D-07), três âncoras opcionais e **independentes**
(`pessoaId`/`leadId`/`oportunidadeId`, D-01 — diferente de `interacao`/`oportunidade`, que
exigem exatamente uma; `leadId` existe especificamente para a ação `CRIAR_TAREFA` ancorar
em Lead) + **`TarefaChecklistItem`** (progresso `x/y` sempre derivado) +
**`TarefaCronometroPeriodo`** (períodos start/stop; índice único parcial
`(tarefa_id) WHERE fim IS NULL` = no máximo 1 aberto por tarefa) + **`TarefaNota`**
(comentário de acompanhamento **append-only** — distinto de `interacao.NOTA`, que é
editável; a spec 009/CL-02 já havia reservado essa separação: "tarefa/nota de fluxo de
trabalho... continuam reservadas para a spec 016") + **`TarefaDependencia`** (sem ciclos —
`detectarCiclo` puro via DFS roda antes do `INSERT`; dependência pendente bloqueia só a
conclusão, 409 com a lista de pendências) + **`TarefaDelegacao`** (histórico de 1ª classe,
mesmo precedente de `oportunidade_movimentacao`/010 — não é o audit genérico). Escopo de
visão `tarefa:ver_todas`\|`ver_proprias` (D-08: `ver_proprias` inclui as tarefas **sem**
responsável — a fila geral é de todo mundo, por definição; mesmo padrão "OU" + filtro no
`where` de `OportunidadeConsultaService`/010). Pontos de gamificação e ranking (CL-01,
resolvida com o dono do produto: pontos simples + ranking, sem badges/níveis) **sempre
derivados** — tabela de pesos congelada `PESOS_PONTOS_TAREFA` (base + bônus "concluída no
prazo" + bônus "checklist 100%"), mesmo padrão de `calcularScore`/008, nunca contador
persistido. Notificações (CL-02: só in-app — sem WhatsApp/e-mail, o projeto não tinha
infra de e-mail e o canal WhatsApp/011 fica reservado à conversa com a aluna) via campo
derivado `vencendoHoje`/`atrasada` (dia civil em America/Sao_Paulo via `Intl` nativo, mesmo
padrão de `estaEmExpediente`/007, **0 dependência nova**) + `GET /crm/tarefas/notificacoes`
(tarefas do próprio sujeito autenticado). Geração automática (CL-03: só via ação nova no
Workflow — o Pipeline/010 não ganhou uma 2ª via nativa) estende o catálogo fechado
`ACAO_TIPOS` da spec 014 com **`CRIAR_TAREFA`** (título/descrição/prazo relativo em dias/
responsável fixo opcional) — reaproveita **exatamente** o motor de fluxo e o
`WorkerScheduler` já existentes (condições E/OU, publicação/versionamento, worker);
`ExecutarAcaoService.executar()` ganha um 4º parâmetro `registroTipo` (repassado pelo
`WorkerService`, que já o calcula via `registroTipoDoGatilho`) para decidir `leadId` vs
`oportunidadeId`; a idempotência (reprocessar não duplica tarefa) vem **de graça** do guard
já existente do worker — `WorkerService.processarLinha` só chama `executar()` depois de
checar `execucoes.existe({fluxoVersaoId, fonte, fonteRegistroId})`, então nenhuma chave de
idempotência nova foi necessária dentro da própria ação; a simulação nunca chama
`executar()`, então `CRIAR_TAREFA` já nasce "simulável sem efeito colateral" sem mudança
adicional (D-03 da 014). Armadilha real pega **só na verificação manual no navegador**
(os e2e sempre autenticam como a credencial de serviço, que resolve para `ver_todas` e não
exercitava os caminhos): `sub` do JWT da credencial de serviço (`SERVICE_CLIENT_ID`, spec
003) não é o id de um `Usuario` real — passar isso direto para colunas FK
(`criadoPorId`/`autorId` de nota e delegação, e o filtro de
`NotificacaoService.minhasNotificacoes`) derrubava a chamada com 500 (Postgres rejeita a
string não-UUID); corrigido com `resolverUsuarioIdOuNulo` (mesmo padrão de
`resolverMovidoPor`, `mover-oportunidade.service.ts`/010) — resolve para `null` em vez de
quebrar; `TarefaConsultaService.escopoDe` não precisou do mesmo tratamento porque a
credencial de serviço sempre resolve para `ver_todas` antes de qualquer comparação de
`responsavelId` (mesmo precedente seguro já usado por `OportunidadeConsultaService`/
`LeadConsultaService`). **14ª migração Prisma** (`20260909190407_crm_tarefas` +
`..190442_crm_tarefas_constraints`): 6 tabelas + `crm_tarefa_audit` (forma canônica do
core, `AJUSTE_MANUAL`, append-only, só delta real — delegação **não** duplica aqui, é
`tarefa_delegacao`) + enum `TarefaStatus`; índice único parcial + `CHECK
(tarefa_id <> depende_de_id)` via SQL bruto (Prisma não modela nenhum dos dois). **RBAC 004
estendido**: **+5** permissões (`tarefa:{criar,editar,ver_todas,ver_proprias,delegar}`;
`administrador`/credencial de serviço de graça, **0 migração de dados**). **~21 endpoints**
`/crm/tarefas/**` + `GET /crm/pessoas/{id}/tarefas`, **0 endpoint público novo**. Frontend:
`frontend/src/tarefas/` — item **CRM · Tarefas** atrás de `tarefa:ver_todas`\|
`tarefa:ver_proprias` — `TarefasPage.tsx` (abas Minhas/Gerais/Todas — Todas só com
`ver_todas` —, filtro de status, criação inline com checklist; a aba Minhas detecta quando
o sujeito é a credencial de serviço e mostra todas as tarefas do escopo em vez de enviar um
filtro `responsavelId` malformado, com uma legenda explicando por quê),
`TarefaDetalhePage.tsx` (checklist interativo, cronômetro iniciar/parar com tempo total
derivado, comentários de acompanhamento, dependências com indicador de bloqueio, delegação
com histórico, transições de status como conjunto fechado), `RankingPanel.tsx` (pontos por
período), `NotificacoesBadge.tsx` (contagem vencendo/atrasada, `refetchInterval` 60s);
`frontend/src/workflow/FluxoDetalhePage.tsx` ganha o formulário da ação **Criar tarefa**
(título/prazo em dias/responsável). Hooks TanStack Query inline, mesmo padrão de
`whatsapp/WhatsappAdminPage.tsx`. **0 dep nova** (backend e frontend), **1 migração (2
arquivos)**, **0 porta nova no `core`**, **0 chave `.env` nova**. `CONTEXT_MODULES` segue
11. As 3 clarificações que definiam o escopo desta spec — profundidade da gamificação,
canal de notificação, mecanismo de geração automática — foram resolvidas com o dono do
produto **antes** da escrita do `plan.md`, 2026-09-09 (spec.md, seção Clarifications). 545
testes unitários backend (30 novos, domínio puro — sem banco) + 307 e2e (21 novos, Postgres
real, suíte 003–016 completa) + 113 frontend (7 novos, 2 arquivos), todos verdes;
lint/typecheck/build limpos nos dois workspaces; validado também manualmente no navegador
de ponta a ponta (criar tarefa com checklist pelo formulário, marcar item, cronômetro
iniciar/parar, comentar, concluir/reabrir, dependência bloqueando conclusão até a outra
tarefa concluir, delegação com histórico, fila geral visível à credencial de serviço,
ranking de pontos refletindo a conclusão, e a ação `CRIAR_TAREFA` publicada num fluxo do
Workflow gerando automaticamente uma tarefa — via o worker de fundo real, sem chamada
manual de `/processar` — ao criar um lead novo).
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 015 — CRM · Disparos (WhatsApp) (implementada, resumo arquivado)</summary>

Plano: [`specs/015-crm-disparos/plan.md`](specs/015-crm-disparos/plan.md)
(Fase 1 · spec 015 — **CRM · Disparos (WhatsApp)**: nona fatia da Fase 1 (CRM), visão Parte
8.6. Mora no _bounded context_ **`crm`** (já não-vazio desde 007–014), construído **sobre**
a infraestrutura de canal/template/mensagem já existente da spec 011
(`CanalWhatsapp`/`TemplateWhatsapp`/`MensagemWhatsapp`/`OptOutWhatsapp`, `GraphApiClient`) e
sobre `Segmento` da spec 009 — nenhuma tabela paralela. **`ExecucaoDisparo`** (campanha —
template[s], canal, segmento e/ou lista importada, agendamento, status) +
**`DisparoContatoImportado`** (linhas de CSV aceitas, com a escolha de virar Lead feita na
importação — FR-007a) + **`MensagemDisparo`** (1 linha por destinatário resolvido —
enviado/entregue/lido/falhou/pulado, variante de teste A/B; `mensagemWhatsappId` FK opcional
`@unique`, preenchida só depois que o envio de fato acontece — research.md D-R3:
destinatário pulado/pendente nunca gera interação, a timeline só registra o que realmente
saiu; status de entrega/leitura é lido por `JOIN` em `mensagem_whatsapp.status_entrega`,
nunca duplicado). Lista de destinatários (segmento ∪ CSV, deduplicada por telefone,
opt-out excluído) é resolvida **na criação** para envio imediato, ou **pelo worker no
horário** para envio agendado — a composição do **segmento** é sempre recalculada nesse
momento (FR-006), nunca travada antes; a resolução de membros **ignora o escopo de visão
por sujeito** (`ver_todos`/`ver_proprios` de Lead, spec 008) — autorização já foi resolvida
em `disparo:criar`, e o worker roda sem sujeito HTTP em curso (research.md D-R2). Worker
in-house (mesmo padrão `setInterval` de `ingestao`/006 e `workflow`/014; volume confirmado
com o dono do produto: **até poucos milhares por disparo**, revalidando a suposição herdada
da spec 012) — o próprio ritmo `intervalo × lote` **É** o throttling (FR-008, research.md
D-R4), sem fila/broker externo. **`EnviarMensagemDisparoService`** reaproveita
**exatamente** os 3 pontos de integração já existentes da 011 (`GraphApiClient.
enviarMensagem` → `RegistrarInteracaoService.registrar` → `MensagemWhatsappRepository.
criar`), numa orquestração própria — sem janela de 24h (disparo é sempre por template
aprovado) e sem lançar exceção HTTP (research.md D-R1: `EnvioWhatsappService` da 011 não é
reusado como está, é orientado a requisição HTTP síncrona). Falha do provedor tenta de novo
até `CRM_DISPAROS_WORKER_MAX_TENTATIVAS` vezes antes de virar `FALHOU` terminal (D-R5,
decisão do dono do produto); falha que não faz sentido reter (opt-out, telefone inválido,
template não aprovado) já nasce terminal, sem consumir tentativa. Quality rating —
`GraphApiClient.consultarQualityRating` (método novo na mesma interface da 011, não uma 2ª
borda, D-R7) — é **sempre sob demanda**, nenhuma sincronização automática (Princípio VIII).
Teste A/B (`atribuirVariante`, hash determinístico do telefone) divide 100% do público
configurado entre duas variantes e encerra — **sem** promoção automática de vencedora
(decisão do dono do produto). CSV trafega como **texto simples no corpo JSON** de `POST
/crm/disparos` (`FileReader.readAsText()` no navegador) — **0 dependência nova** de upload
binário (`multer`/`@types/multer` não instalados, research.md D-R6); a criação de um Lead a
partir de um contato de CSV novo é **opcional por importação** (`criarLead`, FR-007a),
reaproveitando `RegistrarLeadService` (008, `origem: 'csv-disparo'`, idempotente por
telefone). `preferencia_comunicacao` (dona: Central de Clientes, ainda não existe) **não é
lida** — disparo respeita só `opt_out_whatsapp`, já a fonte de verdade de consentimento
vigente; lacuna documentada nas Assumptions do spec, não assumida em silêncio. **13ª
migração Prisma** (`20260909171024_crm_disparos`): 3 tabelas + 3 enums
(`ExecucaoDisparoStatus`/`MensagemDisparoStatus`/`DisparoVariante`); `CHECK` do par
`templateBId`/`percentualVarianteB` via SQL bruto (Prisma não modela `CHECK`). **RBAC 004
estendido**: **+3** permissões (`disparo:{criar,ver,cancelar}`; `administrador`/credencial
de serviço de graça, **0 migração de dados**); quality rating reaproveita `crm_admin:ver`
já existente (011) — **0** permissão nova para essa parte. **~10 endpoints**
`/crm/disparos/**` (criar ~1, listar/detalhe/destinatários/export ~4, cancelar 1, processar
1) + `GET /crm/admin/whatsapp/canais/{id}/quality-rating`, **0 endpoint público novo**. **4
variáveis `.env` novas, sem segredo** (`CRM_DISPAROS_WORKER_{ENABLED,INTERVALO_MS,LOTE,
MAX_TENTATIVAS}`, mesmo padrão de `INGESTAO_WORKER_*`/`CRM_WORKFLOW_WORKER_*`) — **0 chave
`.env` de segredo nova**. Frontend: `frontend/src/disparos/` — item **CRM · Disparos**
atrás de `disparo:ver` — `DisparosPage.tsx` (visão geral/histórico com contagem por status
+ construtor inline: canal → templates aprovados daquele canal, segmento e/ou CSV com
toggle de criar Lead, teste A/B opcional, agendamento opcional; atrás de `disparo:criar`),
`DisparoDetalhePage.tsx` (métricas por status e por variante quando há A/B, lista de
destinatários com motivo, exportar CSV via `Blob` — sem link direto ao backend, cancelar
atrás de `disparo:cancelar`, consultar quality rating do canal). Hooks TanStack Query
inline, mesmo padrão de `whatsapp/WhatsappAdminPage.tsx`. **0 dep nova** (backend e
frontend), **1 migração**, **0 porta nova no `core`**. `CONTEXT_MODULES` segue 11. As 4
decisões que bloqueavam esta spec — volume esperado por disparo, escopo de criação de Lead
a partir de CSV, mecânica do teste A/B, retry de falha de envio — foram resolvidas com o
dono do produto **antes** da escrita do `plan.md`, 2026-09-09 (spec.md, seção
Clarifications). 515 testes unitários backend (16 novos, domínio puro — sem banco) + 286
e2e (14 novos, Postgres real, suíte 003–015 completa) + 106 frontend (4 novos), todos
verdes; lint/typecheck/build limpos nos dois workspaces; validado também manualmente no
navegador de ponta a ponta (conectar canal/template pela API, criar disparo pelo formulário
do painel apontando para um segmento real, ver o disparo concluído na lista e o detalhe com
export e quality rating).
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 014 — CRM · Workflow (Motor de Automação) (implementada, resumo arquivado)</summary>

Plano: [`specs/014-crm-workflow/plan.md`](specs/014-crm-workflow/plan.md)
(Fase 1 · spec 014 — **CRM · Workflow (Motor de Automação)**: oitava fatia da Fase 1 (CRM),
visão Parte 8.8. Mora no _bounded context_ **`crm`** (já não-vazio desde 007–013).
**`fluxo_automacao`** (metadado estável — nome/descrição) + **`fluxo_automacao_versao`**
(snapshot **imutável** de gatilho + condições E/OU + ações; no máximo **1** `PUBLICADA` por
fluxo — índice único parcial no migration.sql, D-01; editar sempre cria/atualiza um
`RASCUNHO` próprio, nunca a publicada) + **`execucao_fluxo`** (histórico append-only de
toda tentativa, idempotente por `(fluxo_versao_id, fonte, fonte_registro_id)` — reprocessar
nunca duplica efeito, D-06) + **`fluxo_modelo`** (biblioteca de automações prontas, CL-01
resolvida com o dono do produto: semeada via `prisma/seed.ts`, somente leitura, "usar como
base" clona para um fluxo novo em rascunho) + **`fluxo_cursor_fonte`** (estado técnico do
worker, 1 linha por fonte). Gatilhos internos (`LEAD_CRIADO`, `LEAD_ESTAGIO_MUDOU`,
`OPORTUNIDADE_ETAPA_MUDOU`, `INTERACAO_REGISTRADA`, `TAG_APLICADA`) são detectados por um
**`WorkerScheduler` in-house** (cópia estrutural do padrão da `ingestao`, spec 006 —
`setInterval`, mutex de passada única, endpoint `POST /crm/workflow/processar`
determinístico p/ e2e) sobre trilhas **já append-only do próprio `crm`**
(`crm_lead_audit`/`oportunidade_movimentacao`/`interacao`/`tag_associacao`) — nunca
*polling* de outro bounded context. Gatilho por evento externo (`EVENTO_EXTERNO` —
"pagamento aprovado", "inscrição em lançamento") fica **só modelado**, sem execução real
nesta versão — mesmo padrão de deferimento de `PortaObservacaoPagamentoCrm` (spec 010),
já que Financeiro (018+) e Catálogo (023+) não existem ainda (CL-02 resolvida com o dono do
produto). Descoberta **durante a implementação**: um cursor novo nunca varre o histórico
anterior à sua criação — a 1ª passada de cada fonte só estabelece a linha de partida em
"agora" (research.md D-R9); publicar um fluxo nunca reage retroativamente a leads/
interações/tags já existentes, só a eventos daqui pra frente. Catálogo fechado de **ações**
do MVP reaproveita **exatamente** os serviços já existentes — `MOVER_LEAD_ESTAGIO`
(`LeadRepository`+`CrmLeadAuditService`+`LeadScoreService`, 008), `APLICAR_TAG`/
`REMOVER_TAG` (`TagService.associar`/`desassociar`, 009, já idempotente), `REGISTRAR_NOTA`
(`RegistrarInteracaoService`, 009), `MOVER_OPORTUNIDADE_ETAPA` (`MovimentacaoRepository`+
`validarMovimento`, 010, incl. motivo obrigatório em etapa `PERDIDA`, validado já ao
publicar) — **nenhum caminho de escrita paralelo**, mesma trilha de auditoria de uma ação
manual equivalente (D-05), **nenhuma porta nova no `core`** (diferente de 008/013 — toda
entidade tocada por uma ação já vive dentro do próprio `crm`). Simulação (`POST
/crm/workflow/fluxos/:id/simular`) reaproveita o mesmo `ContextoRegistroService` do worker
para nunca divergir do que uma condição "vê" — mas **nunca escreve** (D-03). **12ª
migração Prisma** (`20260909140116_crm_workflow`): 5 tabelas + 4 enums
(`FluxoGatilhoTipo`/`FluxoVersaoStatus`/`FluxoRegistroTipo`/`FluxoExecucaoResultado`) +
1 índice único parcial via SQL bruto. **RBAC 004 estendido**: **+1** permissão
(`crm_admin:gerir_workflow`; leitura reaproveita `crm_admin:ver` já existente);
`administrador`/credencial de serviço de graça, **0 migração de dados**. **~16 endpoints**
autenticados (ciclo de vida do fluxo ~7, simulação 1, execuções 2, modelos 2, processar 1),
**0 endpoint público novo**. **3 variáveis `.env` novas, sem segredo**
(`CRM_WORKFLOW_WORKER_{ENABLED,INTERVALO_MS,LOTE}`, mesmo padrão de `INGESTAO_WORKER_*`) —
**0 chave `.env` de segredo nova**. Frontend: `frontend/src/workflow/` — item **CRM ·
Workflow** atrás de `crm_admin:ver` — `FluxosPage.tsx` (lista + criar), `FluxoDetalhePage.tsx`
(editor de gatilho/condições E-OU/ações — **formulário guiado, não um canvas de nós
livres**, research.md D-R1 — + Salvar rascunho/Publicar/Arquivar sob
`crm_admin:gerir_workflow` + aba Execuções), `SimulacaoPanel.tsx`, `ModelosPage.tsx`
(biblioteca + "usar como base"). Hooks TanStack Query inline, mesmo padrão de
`whatsapp/WhatsappAdminPage.tsx`. **0 dep nova** (backend e frontend), **1 migração**, **0
porta nova no `core`**. `CONTEXT_MODULES` segue 11. As 2 decisões que bloqueavam esta spec
— gatilho por evento externo sem Financeiro/Catálogo, formato da biblioteca de automações
prontas — foram resolvidas com o dono do produto **antes** da escrita do `spec.md`,
2026-09-09. 499 testes unitários backend (30 novos, domínio puro — sem banco) + 272 e2e (14
novos, Postgres real, suíte 003–014 completa) + 102 frontend (12 novos), todos verdes;
lint/typecheck/build limpos nos dois workspaces; validado também manualmente no navegador
de ponta a ponta (publicar → disparar o gatilho → tag aplicada pelo worker de fundo →
execução no histórico → clonar modelo).
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 013 — CRM · FAQ e Sugestão de IA (implementada, resumo arquivado)</summary>

Plano: [`specs/013-crm-faq-e-sugestao-ia/plan.md`](specs/013-crm-faq-e-sugestao-ia/plan.md)
(Fase 1 · spec 013 — **CRM · FAQ e Sugestão de IA**: sétima fatia da Fase 1 (CRM), visão
Parte 8.3/8.5/10.6. Mora no _bounded context_ **`crm`** (já não-vazio desde 007–012);
estende também **`clientes`** (005) com campo personalizado de `pessoa`. **`faq_item`**/
**`faq_item_versao`** — base de FAQ versionada (histórico append-only, snapshot completo
por edição, não *diff* — mesmo racional de `oportunidade_movimentacao`/
`resposta_atendimento` não serem o audit genérico) **sem** vínculo com produto ou campanha
nesta versão — nenhuma das duas entidades existe ainda neste ponto do roadmap (`produto`
nasce na spec 023, `campanha` na 032, ambas muito depois desta 013); `FaqItem` não guarda
"quem criou" (já fica na 1ª versão) e `FaqItemVersao.autor` é string livre, não FK — mesmo
padrão de `crm_admin_audit.autor`, já que administrar FAQ pode ser a credencial de serviço.
**`sugestao_ia`** — proposta **não-autoritativa** da IA, sempre síncrona e sempre dentro de
um `Atendimento` (012) já existente, sobre uma `Interacao` de entrada já registrada — nunca
uma varredura em massa ou proativa. Governança de decisões automatizadas (Parte 10.6,
etapa 1) reforçada na própria API: `tipo=RESPOSTA` — `aceitar` só marca a decisão, **nunca
envia** (o envio segue exigindo `POST /crm/atendimentos/:id/responder`, editado nesta spec
com um `sugestaoId` opcional que força `viaIa=true` e grava
`RespostaAtendimento.sugestaoIaId`, fechando o rastro de "quem respondeu, com/sem IA" já
modelado pela 012); `tipo=CAMPO_PERSONALIZADO` — `aceitar` **já grava** o valor no cadastro
na mesma chamada (assimetria intencional — a própria ação de aceitar É a confirmação
humana exigida pela governança nesse caso). IA identifica múltiplas perguntas numa
mensagem e propõe uma sugestão por pergunta; pedir de novo para a mesma mensagem
**substitui** (`status=SUBSTITUIDA`) a pendente anterior daquela mensagem, nunca acumula
duplicata. Feedback (útil/não útil) só depois de decidida (`ACEITA`\|`REJEITADA`).
Sugestão de campo personalizado vale tanto para `lead` (008, via `ValorCampoService.
definirValor`, novo método) quanto para `pessoa` já convertida — a maioria das conversas do
Chat ao Vivo — via a **2ª porta de inversão de dependência do projeto**
(`PortaCampoPersonalizadoPessoa` no `core`, mesmo padrão de `PortaIdentidade`, 008,
implementada por `PortaCampoPersonalizadoPessoaAdapter` em `clientes/infra/`; o módulo
`@Global()` `identidade-wiring.module.ts` foi **renomeado** para
`clientes-wiring.module.ts`/`ClientesWiringModule` e passou a expor as duas portas, em vez
de multiplicar módulos de wiring de 1 linha) — `crm` continua **sem importar
`src/clientes/**`**; `clientes` ganha `campo_personalizado_pessoa`/`valor_campo_pessoa`,
espelhando `campo_personalizado_lead`/`valor_campo_lead` (008) campo a campo, namespace de
`chave` independente (sem unificação automática lead↔pessoa). Decidir uma sugestão de
campo personalizado verifica **dinamicamente** `lead:editar`/`pessoa:editar` (conforme a
âncora, via `SujeitoRbacService`, não só decorator estático — a mesma rota HTTP atende os
dois casos). Provedor de IA = **API da Anthropic (Claude)**, chamada HTTP direta via
`fetch` nativo (0 SDK novo) atrás de uma porta própria (`SugestaoIaClient`, mesmo padrão de
`GraphApiClient`/011) que **nunca lança** — credencial ausente, falha de rede, resposta com
erro ou sem texto interpretável devolvem `{ok:false, motivo}`; falha do provedor nunca
bloqueia o atendimento (FR-014), tratada como "0 sugestões disponíveis". `interpretarRespostaIa`
(domínio puro) nunca confia no formato bruto do provedor — item inválido é descartado sem
derrubar os demais. Credencial reaproveita a tabela `integracao` já existente e **ociosa
desde a 007** (`tipo=CONEXAO_INTERNA` — o sistema chamando um serviço externo, não emitindo
uma chave —, `alvo=EXTERNO`, `nome` convencionado `sugestao-ia-anthropic`, modelo em
`config.modelo` sem segredo) — **0 tabela nova de credencial, 0 chave `.env` nova**, ela é
o primeiro consumidor real da tabela genérica que a 007 previu mas nunca usou. **11ª
migração Prisma** (`20260909120000_crm_faq_sugestao_ia`): 5 tabelas (`faq_item`,
`faq_item_versao`, `sugestao_ia` no `crm`; `campo_personalizado_pessoa`,
`valor_campo_pessoa` no `clientes`) + 2 enums (`SugestaoIaTipo`, `SugestaoIaStatus`) + 1
coluna (`resposta_atendimento.sugestao_ia_id`, nullable/`@unique`); `CHECK` de
exclusividade do alvo de `sugestao_ia` via SQL bruto (Prisma não modela `CHECK`, mesmo
padrão 007/009/010/012). **RBAC 004 estendido**: **+2** permissões
(`crm_admin:gerir_faq`, `pessoa:gerir_campos_personalizados`); gerar/decidir/avaliar
sugestão reaproveita `atendimento:atender` (nenhuma permissão nova só para isso);
`administrador`/credencial de serviço de graça, **0 migração de dados/seed**. **~24
endpoints** autenticados (FAQ ~6, sugestão ~5, campo personalizado de pessoa ~7, mais
`sugestaoId` opcional no `responder` já existente), **0 endpoint público novo**. Frontend:
`frontend/src/faq/` — nova aba **FAQ** dentro de **CRM · Administração** (007), atrás de
`crm_admin:ver`\|`crm_admin:gerir_faq` — lista + criar/editar + histórico de versões;
`frontend/src/atendimento/PainelSugestoes.tsx` — dentro da conversa do Chat ao Vivo
(`ConversaAtendimento.tsx`, 012) — escolhe a mensagem de entrada (da própria timeline do
atendimento, já carregada), pede sugestão, decide cada uma independentemente; aceitar
resposta pré-preenche o composer existente (nunca envia sozinho); aceitar campo
personalizado grava direto, desabilitado sem a permissão de editar conforme a âncora;
`frontend/src/pessoas/PessoaDetailPage.tsx` ganha a mesma seção "Campos personalizados"
que `LeadDetalhePage.tsx` já tinha (componente espelhado). Hooks TanStack Query inline —
mesmo padrão de `whatsapp/WhatsappAdminPage.tsx`. **0 dep nova** (backend e frontend —
testes de componente usam `fireEvent`, mesmo padrão de `pipelines/PipelinesPage.test.tsx`),
**1 migração**, **1 porta nova** (`PortaCampoPersonalizadoPessoa`), **0 chave `.env`
nova**. `CONTEXT_MODULES` segue 11. As 3 decisões que bloqueavam esta spec — vínculo de
FAQ com produto/campanha inexistentes, destino do campo personalizado sugerido, provedor
de IA — foram resolvidas com o dono do produto **antes** da escrita do `spec.md`,
2026-09-09. 469 testes unitários backend (16 novos, todos de domínio puro — sem banco) +
258 e2e (13 novos, Postgres real, suíte 003–013 completa) + 90 frontend (7 novos), todos
verdes; lint/typecheck/build limpos nos dois workspaces.
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.)

</details>

<details><summary>Spec 012 — CRM · Chat ao Vivo (implementada, resumo arquivado)</summary>

Plano: [`specs/012-crm-chat-ao-vivo/plan.md`](specs/012-crm-chat-ao-vivo/plan.md)
(Fase 1 · spec 012 — **CRM · Chat ao Vivo**: inbox de atendimento ao vivo (visão Parte
8.5/8.12), construída **sobre** a timeline de `interacao` unificada (009) e o canal
WhatsApp já conectado (011) — não uma 2ª tabela de mensagens. Mora no _bounded context_
**`crm`** (já não-vazio desde 007/008/009/010/011; `CONTEXT_MODULES` segue **11**).
**`atendimento`** (a conversa/caso — fila, prioridade, atendente/equipe atual, SLA de 1ª
resposta **sempre derivado**, elegibilidade de CSAT; âncora polimórfica `pessoa` XOR
`lead`, mesma disciplina de `interacao`/`oportunidade`). **`transferencia_atendimento`**/
**`resposta_atendimento`** — histórico **append-only de 1ª classe** (quem transferiu para
quem e por quê; quem respondeu e se foi assistido por IA) — **não** `crm_admin_audit`,
mesmo racional de `oportunidade_movimentacao` (010) não ser o audit genérico. Duas colunas
novas em tabelas já existentes: `interacao.atendimentoId` (nullable — agrupa a timeline já
existente sob um atendimento, sem duplicá-la nem alterar o contrato de mutabilidade da 009)
e `equipe.mensagemForaExpediente`/`slaPrimeiraRespostaMinutos` (config por equipe
`ATENDIMENTO`). **Endereçamento por carga/disponibilidade** (decisão do dono do produto,
2026-09-04 — nunca aleatório, nunca round robin puro): entre os membros ativos de uma
equipe `tipo = ATENDIMENTO` em expediente (reusa **`estaEmExpediente`** da 007, sem 2º
conceito), `escolherAtendentePorCarga` (pura) escolhe quem tem menos atendimentos
`EM_ATENDIMENTO` **agora** — sempre um `COUNT` ao vivo, nunca um contador persistido;
empate por menor `usuarioId` (desempate determinístico, não round robin). **SLA de 1ª
resposta** (`calcularSlaAtendimento`, pura) igualmente recalculado em toda leitura — o
padrão `WorkerScheduler` da 006 foi deliberadamente **rejeitado** aqui, dado o volume baixo
(decisão do dono do produto: até ~10 conversas simultâneas — sem fila/broker, índices
comuns bastam; suposição herdada pela 015). **CSAT reaproveita a `interacao` tipo `NPS`**
já existente desde a 009 — nenhuma entidade nova; captura manual (`POST .../csat`) ou
automática (o webhook do WhatsApp, editado, reconhece uma resposta numérica 0–10 logo após
o encerramento de um atendimento elegível e grava como `NPS` em vez de mensagem comum).
**Resposta automática fora do expediente** reusa só `estaEmExpediente`, texto configurável
por equipe, só canal WhatsApp, no máximo 1× por atendimento, **nunca** conta como a 1ª
resposta humana para efeito de SLA. Responder um atendimento de canal WhatsApp continua
saindo pelo **`EnvioWhatsappService`/`GraphApiClient`** já existentes (011, mesma validação
de janela de 24h/template — nenhuma regra nova); `RegistrarInteracaoService` (009) segue
sendo a porta usada tanto pelo canal manual quanto pelo webhook. **10ª migração Prisma**
(`20260904180825_crm_atendimento`): 3 tabelas + 3 enums + 2 colunas; 1 `CHECK` de âncora
XOR via SQL bruto (Prisma não modela `CHECK`). **RBAC 004 estendido**: **+6** permissões —
`atendimento:{ver_todos,ver_proprios,atender,transferir,encerrar}` +
`crm_admin:gerir_atendimento`; `administrador`/credencial de serviço de graça, **0
migração de dados/seed**. **~16 endpoints** autenticados (`/crm/atendimentos/**` — fila/
assumir/responder/transferir/encerrar/csat/timeline; `/crm/admin/atendimento/equipes/:id`
— SLA/mensagem fora do expediente), **0 endpoint público novo** (reaproveita o webhook já
existente da 011, agora também abrindo/reaproveitando `atendimento` e detectando CSAT).
**Frontend** `frontend/src/atendimento/`: **CRM · Chat ao Vivo**
(`AtendimentoInboxPage.tsx`, atrás de `atendimento:ver_todos`\|`atendimento:ver_proprios`)
— fila com indicador de SLA (`FilaAtendimento.tsx`) + conversa
(`ConversaAtendimento.tsx`: assumir/responder/transferir/encerrar/CSAT condicionados à
permissão, reaproveita `TimelineInteracoes` da 009 em modo leitura para o histórico
completo da pessoa/lead — o composer de resposta é próprio, passa por
`POST /crm/atendimentos/:id/responder`, não pela porta genérica de `interacao`);
`TransferirModal.tsx`; `AtendimentoAdminPage.tsx` (SLA/mensagem fora do expediente por
equipe, atrás de `crm_admin:gerir_atendimento`). Hooks TanStack Query **inline** nos
componentes, mesmo padrão de `whatsapp/WhatsappAdminPage.tsx` (011). **0 dep nova**
(backend e frontend — testes de componente usam `fireEvent`, mesmo padrão de
`pipelines/PipelinesPage.test.tsx`, não `@testing-library/user-event`), **1 migração**,
**nenhuma porta nova**, **nenhuma chave `.env` nova**. `CONTEXT_MODULES` segue 11. As 2
decisões que bloqueavam esta spec no ROADMAP (⚠ clarify) — endereçamento por carga/
disponibilidade e volume esperado baixo — foram resolvidas com o dono do produto **antes**
da escrita do `spec.md`, 2026-09-04. 454 testes unitários backend (31 novos, todos de
domínio puro — sem banco) + 245 e2e (23 novos, Postgres real, suíte 003–012 completa) + 83
frontend (7 novos), todos verdes; lint/typecheck/build limpos nos dois workspaces.
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.

</details>

<details><summary>Spec 011 — CRM · Integração com WhatsApp (implementada, resumo arquivado)</summary>

Plano: [`specs/011-crm-whatsapp-integracao/plan.md`](specs/011-crm-whatsapp-integracao/plan.md)
(Fase 1 · spec 011 — **CRM · Integração com WhatsApp**: conecta o WhatsApp Business — **Cloud
API oficial da Meta**, decisão do dono do produto 2026-09-04, não BSP — como canal de 1ª
classe do CRM (visão Parte 8.5/8.12). Mora no _bounded context_ **`crm`** (já não-vazio desde
007/008/009/010; `CONTEXT_MODULES` segue **11**). **`canal_whatsapp`** (conexão — número,
`wabaId`, `phoneNumberId`; 3 segredos — access token, app secret, webhook verify token —
cifrados com a **mesma** `CRM_INTEGRACAO_CIFRA_KEY` já obrigatória desde a 007, reusando
`cifrar`/`mascararSegredo`/`ultimos4De`; **0 chave `.env` nova**). **`template_whatsapp`**
(catálogo espelhado da Meta — nome, categoria, corpo, `statusAprovacao`; sincronizado **só
sob demanda**, `POST .../templates/sincronizar` — Princípio VIII é explícito: "nenhuma
sincronização automática com API externa", **nunca** um job periódico). **`mensagem_whatsapp`**
— detalhe **1:1** de uma `interacao` (009) tipo `WHATSAPP` já existente desde aquela spec
(`wa_message_id`, `statusEntrega`, `templateId?`, `tipoConteudo`, `midiaIdExterno?`) — mantém
`interacao` agnóstica de canal, mesmo racional de `oportunidade_movimentacao` (010) não ser o
audit genérico. **`evento_webhook_whatsapp`** — evento cru **imutável** do webhook, dedupado
por `hash` do payload; **não** reaproveita `evento_origem`/`PlataformaOrigem` da `ingestao`
(006) — essa é uma dimensão **fechada** das 7 contas financeiras de origem, e o pipeline de 7
etapas daquela spec (classificar venda, resolver vínculo Asaas↔Guru, resolver oferta) não se
aplica a uma mensagem (Princípio I, ver `research.md`). **`opt_out_whatsapp`** — histórico de
pedidos de não-contato (LGPD): cada ciclo optar/reverter é uma **nova linha** (nunca `UPDATE`
que apague o pedido original); bloqueia só envios **iniciados pela empresa**, nunca o
recebimento. **Retenção de conversas indefinida** — pseudonimização só na exclusão da `pessoa`
(spec 047), decisão do dono do produto, sem TTL automático nesta spec. **Webhook de entrada**
(`GET`/`POST /webhooks/whatsapp`, público — as **primeiras** rotas `/webhooks/*` do projeto,
cobertas pelo prefixo já reservado desde a 003) autenticado por **HMAC-SHA256**
(`X-Hub-Signature-256` sobre o corpo bruto via `rawBody: true` nativo do `NestFactory.create`
— 0 dep nova) — **não** pelo `WebhookAuthenticator` da 003, que é tipado para
`PlataformaOrigem` e reservado às specs 019–022; função pura própria em
`crm/domain/whatsapp/assinatura.ts`. Canal resolvido por `metadata.phone_number_id` do
próprio payload (fiel ao modelo real da Meta — 1 callback URL por App, N números). Resolve
pessoa/lead pelo telefone normalizado (`normalizarTelefone`, reusada de `crm/domain/lead` da
008) ou cria `Lead` novo (`origem: 'whatsapp'`, via `RegistrarLeadService` da 008 — idempotente
por `(origem, telefone)`) e registra via **`RegistrarInteracaoService`** (009 — porta
exportada **especificamente** para esta spec e para a 012 injetarem), dedupado por
`(canalOrigem: "whatsapp:<canalId>", idExterno: <wamid>)`. **Janela de 24h** —
`estaDentroDaJanela24h(ultimaMensagemRecebidaEm, agora)` **sempre derivada** (Princípio V,
nunca coluna). **Envio** (`POST /crm/whatsapp/mensagens`, livre dentro da janela ou por
template `APROVADO` fora dela) é **síncrono** — sem fila (disparo em massa é escopo da 015);
chama a Graph API via **`fetch` nativo do Node 24** atrás da interface `GraphApiClient`
(0 dep nova, dublê nos testes). **Nenhuma tabela de auditoria nova** — canal/template/opt-out
reaproveitam `crm_admin_audit` (007), perfil de baixo volume igual a `equipe`/`integracao`.
**9ª migração Prisma** (`20260904165949_crm_whatsapp`): 5 tabelas + 6 enums + 1 índice único
parcial (`mensagem_whatsapp.wa_message_id`) via SQL bruto. **RBAC 004 estendido**: **+4**
permissões — `whatsapp:{ver,enviar,gerir_optout}` + `crm_admin:gerir_whatsapp`;
`administrador`/credencial de serviço de graça, **0 migração de dados/seed**. **~14
endpoints** autenticados (`/crm/admin/whatsapp/**` — canal/templates/eventos;
`/crm/whatsapp/**` — janela/mensagens/optout) **+ 2 públicos** de webhook. **Frontend**
`frontend/src/whatsapp/`: **CRM · WhatsApp** (`WhatsappAdminPage.tsx`, atrás de
`crm_admin:ver`\|`whatsapp:ver`) — conectar canal (campos de segredo só-escrita, nunca
preenchidos de volta), lista de canais com segredo mascarado, templates por canal com badge
de status e "sincronizar agora" (`crm_admin:gerir_whatsapp`); hooks TanStack Query **inline**
no componente, mesmo padrão de `crm-admin/IntegracoesTab.tsx` (007) — sem arquivo de hooks à
parte. Indicador de janela de 24h e ação de opt-out **dentro de uma conversa** foram
**adiados deliberadamente para a spec 012** (Chat ao Vivo) — não existe hoje nenhuma tela de
conversa para hospedá-los, e o ROADMAP já escopa o frontend desta spec como só "configuração
de canal e templates"; os endpoints de backend já existem e estão testados. **0 dep nova**
(backend e frontend), **1 migração**, **nenhuma porta nova**, **nenhuma chave `.env` nova**.
`CONTEXT_MODULES` segue 11. As 2 decisões que bloqueavam esta spec no ROADMAP (⚠ clarify) —
provedor WhatsApp e retenção/anonimização — foram resolvidas com o dono do produto **antes**
da escrita do `spec.md`, 2026-09-04. 423 testes unitários backend (32 novos, todos de domínio
puro — sem banco) + 222 e2e (23 novos, Postgres real, suíte 003–011 completa) + 76 frontend
(4 novos), todos verdes; lint/typecheck/build limpos nos dois workspaces.
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.

</details>

<details><summary>Spec 010 — Pipeline de Vendas do CRM (implementada, resumo arquivado)</summary>

Plano: [`specs/010-crm-pipeline/plan.md`](specs/010-crm-pipeline/plan.md)
(Fase 1 · spec 010 — **Pipeline de Vendas do CRM**: pipelines de vendas configuráveis
(visão Parte 8.7) — `pipeline`/`etapa_pipeline` (etapas ordenadas, `tipo ABERTA|GANHA|
PERDIDA`, `slaHoras?`), `oportunidade` (âncora polimórfica `pessoa` XOR `lead`, mesma
disciplina da `interacao` da 009 — D-01; **1ª persistência de `Dinheiro` do core** no
schema, `valor_estimado_int bigint` ×10000 + `valor_estimado_moeda char(3)`),
`oportunidade_movimentacao` (histórico de **1ª classe**, não o audit genérico — motivo
obrigatório só ao **entrar** em etapa `PERDIDA`; mover para a etapa atual é no-op; reabrir
`GANHA`/`PERDIDA` para `ABERTA` não exige motivo). Mora no _bounded context_ **`crm`** (já
não-vazio desde a 007/008/009; `CONTEXT_MODULES` segue **11**). **Atribuição automática**
(D-03): `pipeline.modoAtribuicao MANUAL|RODIZIO|REGRA` (+ `atribuicaoFallback`); `RODIZIO`
reusa `equipe`/`equipe_membro` da 007 — round robin **determinístico** via cursor
`pipeline.ultimoAtribuidoUsuarioId` persistido (`domain/pipeline/atribuicao.ts`, puro); sem
membro ativo → nasce sem responsável, **nunca erro**; `REGRA` — lista ordenada de condições
simples (`ORIGEM`, `VALOR_ESTIMADO_MINIMO`) com *fallback* opcional; `responsavelId`
explícito sempre vence. **SLA e "esfriando" — sempre derivados** (Princípio V, nunca
coluna): `slaEstourado`/`esfriando` calculados em toda leitura; "esfriando" reusa a
`interacao` da 009 (última `ocorridoEm` da âncora, busca em **lote** — sem N+1) em vez de
duplicar como coluna denormalizada. **Campos personalizados de oportunidade** — mesmo
padrão da 008. **Métricas** (`GET /crm/pipelines/{id}/metricas`) — funil por etapa, valor
por etapa **por moeda** (nunca soma entre moedas), tempo médio na etapa, taxa de conversão —
sempre recalculado, `groupBy` Prisma, nunca contador persistido. **Porta
`PortaObservacaoPagamentoCrm`** (D-02, regra 8.2.3 da visão) — exportada do `CrmModule`,
entrega só o **efeito** (mover oportunidade `ABERTA` para a 1ª etapa `GANHA` do pipeline,
idempotente); o Financeiro (specs 018–030) **ainda não existe**, então **sem gatilho real**
nesta spec — nunca cria/edita/lê Contrato; testada isoladamente (injeção direta do
provider, sem endpoint HTTP). **Nenhum contrato novo no `core`** (mesmo precedente da
009 — FK direta no `schema.prisma` para `Pessoa`/`Lead`, fronteira do Princípio VI é sobre
import de módulo TS, não sobre o schema). **RBAC 004 estendido**: **+6** permissões —
`oportunidade:{criar,editar,mover,ver_todas,ver_proprias}` (mesmo padrão `ver_todos`/
`ver_proprios` da 008) + `crm_admin:gerir_pipelines` (recurso `crm_admin` da 007);
`administrador`/credencial de serviço de graça, **0 migração de dados/seed**. **8ª migração
Prisma** (`20260904154451_crm_pipeline`): `pipeline`, `etapa_pipeline`, `oportunidade`,
`oportunidade_movimentacao`, `regra_atribuicao_pipeline`,
`campo_personalizado_oportunidade`, `valor_campo_oportunidade`, `crm_pipeline_audit` (forma
canônica do core, append-only, só delta real — **não** recebe mudança de etapa, que é
`oportunidade_movimentacao`) + enums `EtapaPipelineTipo`/`ModoAtribuicao`/
`RegraAtribuicaoCampo`; 1 `CHECK` de âncora XOR via SQL bruto (Prisma não modela `CHECK`).
**~26 endpoints** novos `/crm/pipelines/**`, `/crm/oportunidades/**`,
`/crm/{pessoas,leads}/:id/oportunidades`, `/crm/admin/campos-oportunidade/**`. **Frontend**:
`frontend/src/pipelines/` — **CRM · Pipelines** (board Kanban, colunas por etapa,
drag-and-drop **HTML5 nativo** — `@hello-pangea/dnd` avaliada e rejeitada, ver
`research.md`, 0 dep nova —, `MoverMotivoModal` ao soltar em etapa `PERDIDA`,
`MetricasPanel`); `PipelineAdminPage` (etapas/atribuição/campos personalizados) atrás de
`crm_admin:gerir_pipelines`. **0 dep nova**, **1 migração**, **nenhuma porta nova**,
**nenhuma chave `.env` nova**. `CONTEXT_MODULES` segue 11. Decisões D-01..D-06 resolvidas
como defaults documentados na própria spec (não marcada `⚠ clarify` no ROADMAP, diferente
de 011/012) — spec §Clarifications, 2026-09-04. 391 testes unitários backend + 199 e2e
(Postgres real, ambiente isolado — container próprio na porta 55433, já que 3001/5174/55432
estavam em uso por outra sessão neste ambiente) + 72 frontend, todos verdes; lint/typecheck/
build limpos nos dois workspaces. Um bug real pego pelo e2e e corrigido: `REGRA.ORIGEM`
não resolvia a `origem` do lead (`OportunidadeService` passava `origem: null` fixo) —
corrigido com `OportunidadeRepository.origemDoLead`.
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.

</details>

<details><summary>Spec 009 — Timeline de Interações do CRM (implementada, resumo arquivado)</summary>

Plano: [`specs/009-crm-interacao-timeline/plan.md`](specs/009-crm-interacao-timeline/plan.md)
(Fase 1 · spec 009 — **Timeline de Interações do CRM**: fecha o esboço 5.2‑E que ainda
faltava — `interacao` (timeline unificada), `tag` (categorização compartilhada) e
`segmento` (lista dinâmica por query salva). Mora no _bounded context_ **`crm`** (já
não-vazio desde a 007/008; `CONTEXT_MODULES` segue **11**). **`interacao`** — âncora
**polimórfica** `pessoa_id` **XOR** `lead_id` (exatamente um, `CHECK` no banco + validação
de borda `validarAncora` — CL-01); `tipo` (`WHATSAPP|EMAIL|LIGACAO|TICKET|NOTA|NPS`),
`direcao` (obrigatória p/ tipos de canal exceto `NPS`, proibida em `NOTA`), `conteudo`,
`nota_nps` (0–10, só `NPS`), `autor_id?`, `canal_origem?`/`id_externo?` (idempotência de
integração). **Timeline unificada de uma `pessoa`** = interações ancoradas nela **∪**
interações de todo `lead` cujo `pessoa_id` aponta para ela — resolvida numa **única query**
(`OR`/`JOIN` Prisma, sem N+1) a cada leitura; nenhuma linha é copiada/re-apontada na
conversão de lead (008). Leitura **sem permissão nova**: por pessoa exige `pessoa:ver`
(005); por lead segue o escopo `lead:ver_todos`/`ver_proprios` da 008
(`LeadConsultaService.exigirNoEscopo`, reusado por composição de serviço dentro do próprio
`crm` — **não** por import de `clientes`). **Mutabilidade híbrida** (**CL-02**/CL-05): nota
interna é `tipo = NOTA` dentro de `interacao` (não uma tabela própria) e é a **única**
editável/removível (_soft-delete_ — `removido_em`), pelo autor (`interacao:registrar`) ou
por quem tem `interacao:gerir`; qualquer canal é **append-only** (reforçado por `CHECK
("tipo" = 'NOTA' OR ("editado_em" IS NULL AND "removido_em" IS NULL))` no banco) — 405/409
em qualquer tentativa. **`tag`** promovida a entidade de 1ª classe compartilhada
lead\|pessoa\|interacao (**CL-04**): `tag` (`slug` único, `rotulo`, `cor?`, `ativo`) +
`tag_associacao` (uma de `lead_id`\|`pessoa_id`\|`interacao_id` — `CHECK` + 3 índices únicos
parciais); associar por texto faz _upsert_ por slug (idempotente, FR-016). **Migra o
`lead.tags: String[]` da spec 008** — a coluna é removida (sem _backfill_: sem dado de
produção nesta fase do projeto) e o `LeadService` passa a delegar ao `TagService`
compartilhado, **preservando o contrato REST** (`POST`/`DELETE /crm/leads/:id/tags`
idênticos, auditando como antes em `crm_lead_audit`); as novas `POST`/`DELETE
/crm/{pessoas,interacoes}/:id/tags` usam o mesmo formato de corpo (`{tag}`, sem `:slug` no
path), auditando em `crm_interacao_audit`. Catálogo (`GET /crm/tags`, sem PII,
`@AutenticadoBasta()`) com contagem de uso por âncora; admin (renomear/cor/ativar) sob
**permissão nova** `crm_admin:gerir_tags` (recurso `crm_admin` da 007), auditado em
`crm_admin_audit`. **`segmento`** — query salva declarativa (**CL-03**): `alvo`
(`LEAD`\|`PESSOA`) + `filtro` jsonb validado contra um esquema **fechado por `alvo`**
(`validarFiltro`/`construirWhere` em `domain/segmento/filtro-segmento.ts`, puros, sem
banco); `GET /crm/segmentos/:id/membros` combina o `where` do filtro com o `where` de
escopo de visão do sujeito (`LeadConsultaService.escopoDe` p/ `LEAD`; `pessoa:ver` p/
`PESSOA`) — **nunca** amplia o que o sujeito já vê; membros **sempre derivados** na
leitura, nunca materializados (regra 8.2.2). **Nenhum contrato novo no `core`** (diferente
da 008): as FKs de `interacao`/`tag_associacao` para `Pessoa` vivem só no `schema.prisma`
compartilhado — mesmo precedente de `Lead.pessoaId`/`Lead.responsavelId` (008/004); a
fronteira do Princípio VI é sobre import de módulo TypeScript, não sobre o schema. **RBAC
004 estendido**: **+5** permissões — `interacao:{registrar,gerir}` (recurso novo
`interacao`), `segmento:{ver,gerir}` (recurso novo `segmento`), `crm_admin:gerir_tags`
(recurso `crm_admin`); `administrador`/credencial de serviço de graça, **0 migração de
dados/seed**. **7ª migração Prisma** (`20260904150000_crm_interacao`): `interacao`, `tag`,
`tag_associacao`, `segmento`, `crm_interacao_audit` (forma canônica do core, append-only,
só delta real) + enums `InteracaoTipo`/`InteracaoDirecao`/`SegmentoAlvo`; `ALTER TABLE lead
DROP COLUMN tags`; 2 `CHECK`s + 4 índices únicos parciais via SQL bruto (Prisma não modela
`CHECK`/índice parcial). **Porta in-process** `RegistrarInteracaoService` (idempotente por
`(canal_origem, id_externo)`, exportada do `CrmModule`) para as specs 011/012 injetarem;
**sem** `/webhooks/*` aqui. **~19 endpoints** novos `/crm/interacoes/**`,
`/crm/{pessoas,leads}/:id/interacoes`, `/crm/{pessoas,interacoes}/:id/tags`, `/crm/tags`,
`/crm/admin/tags/**`, `/crm/segmentos/**`. **Frontend**: `frontend/src/interacoes/`
(`TimelineInteracoes` — composer + lista + editar/remover nota condicionado a
autor/`interacao:gerir`; `TagPicker` — chip picker compartilhado), plugados em
`PessoaDetailPage` e `LeadDetalhePage` (troca o input de tag livre da 008 pelo picker
compartilhado); `frontend/src/segmentos/` (nova — **CRM · Segmentos**, atrás de
`segmento:ver`: lista + criar + detalhe com filtro salvo e membros paginados). **0 dep
nova**, **1 migração**, **nenhuma porta nova**, **nenhuma chave `.env` nova**.
`CONTEXT_MODULES` segue 11. Clarificações CL-01 (âncora polimórfica + timeline unida na
leitura), CL-02 (nota = `tipo` de interação, não tabela própria), CL-03 (segmento como
query salva _on-read_), CL-04 (tag entidade de 1ª classe, migrando a 008), CL-05
(mutabilidade híbrida — só `NOTA` edita/remove) — resolvidas com o dono do produto em
2026-09-04. 362 testes unitários backend + 66 frontend verdes (typecheck/lint/build limpos
nos dois workspaces); migração Prisma e suíte e2e escritas e type-checadas, mas **não
executadas** por falta de acesso a Postgres/Docker no ambiente da sessão que as gerou —
rodar antes do merge: `npm run db:up && npm run prisma:migrate:dev --workspace backend &&
npm run test:e2e`.
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.

</details>

<details><summary>Spec 008 — Lead do CRM (implementada, resumo arquivado)</summary>

Plano: [`specs/008-crm-lead/plan.md`](specs/008-crm-lead/plan.md)
(Fase 1 · spec 008 — **Lead do CRM**: a 1ª entidade **compartilhada** do projeto — uma
única tabela `lead` para CRM **e** Marketing (visão Parte 8.2.1), acesso resolvido por
**RBAC 004** (`lead:{criar,editar,ver_todos,ver_proprios}` já no catálogo desde a 004),
não por fronteira arquitetural. Mora no _bounded context_ **`crm`** (já não-vazio desde a
007; `CONTEXT_MODULES` segue **11**). Campos: contato (`nome` obrigatório + `email`|`telefone`
obrigatório, `documento?` com DV), `origem`/`id_externo` + UTM (`utm_source/medium/campaign/
term/content`), `estagio` (enum de funil `NOVO|CONTATO_FEITO|QUALIFICADO|NUTRICAO|
DESQUALIFICADO`), `status` (`ATIVO|DESCARTADO|CONVERTIDO`), `responsavel_id?` (FK `usuario`
da 004), `tags[]` (spec 009 promove a `tag`/`tag_associacao` compartilhados — a coluna
`String[]` foi removida). **Lead scoring** — `calcularScore(EstadoScoreLead) → Int [0,100]` em
`src/crm/domain/lead/scoring.ts`: função **pura, determinística, livre de locale**
(`agoraUtc()`/matriz `TZ` na CI), tabela de pesos **congelada** `PESOS_SCORE_LEAD`
(completude de contato, origem rastreável, estágio, engajamento, recência, decaímento por
idade); `score` é **derivado**/_cache_, nunca `score += delta` (regra 8.2.2), nunca
setável por `PATCH` (422); `POST /crm/leads/:id/recalcular-score` + lote, idempotentes.
**Conversão Lead → `pessoa`** (`POST /crm/leads/:id/converter`, `@RequerPermissao('lead:editar',
'pessoa:editar')`) reusa a engine de identidade/dedup da **spec 005** por **inversão de
dependência** (CL-02): o `core` ganha `src/core/identidade/porta-identidade.ts` (interface
**`PortaIdentidade`** + token **`PORTA_IDENTIDADE`**, só contrato); `clientes` ganha
`infra/porta-identidade.adapter.ts` + um módulo **`@Global()`** `identidade-wiring.module.ts`
que provê/exporta o token; o `crm` **injeta a interface, nunca importa `src/clientes/**`**
(ESLint `import/no-restricted-paths` + `grep` no e2e). **CL-01**: pós-conversão a linha de
`lead` é **arquivada + vinculada** (`status = CONVERTIDO` + `pessoa_id`, some das listas
padrão, nada apagado/migrado). Conversão síncrona, transacional, idempotente (2× → mesmo
`pessoa_id`, 0 contato duplicado). **Campos personalizados** (**CL-03** — esquema
administrável): `campo_personalizado_lead` (definição — `chave` slug único imutável,
`rotulo`, `tipo TEXTO|NUMERO|BOOLEANO|DATA|SELECAO`, `opcoes?`, `obrigatorio`, `ativo`) sob
a permissão **nova** `crm_admin:gerir_campos_lead` (recurso `crm_admin` da 007; +1 no
catálogo, `administrador`/credencial de serviço de graça, **0 migração de dados/seed**) +
`valor_campo_lead` (`@@unique(lead_id, definicao_id)`, `valor` validado por tipo → 422);
`PUT /crm/leads/:id/campos-personalizados` = **substituição total**. **Escopo de visão**:
rotas de leitura `@AutenticadoBasta()` + gate "OU" (`lead:ver_todos` | `lead:ver_proprios`)
+ filtro **no `where`** do `lead-consulta.service` (nunca na serialização; filtros não
ampliam; fora do escopo → 404); `ver_proprios` = só `responsavel_id` = sujeito **e**
não-nulo (fila não atribuída só p/ `ver_todos`); credencial de serviço cai em `ver_todos`.
**Porta in-process** `RegistrarLeadService` (exportada do `CrmModule`, idempotente por
`(origem, id_externo)` via índice único parcial — `id_externo` **nunca** PK) para a **spec
035** injetar; **sem** `/webhooks/*`, OAuth ou chamada externa aqui. Lead duplicado por
e-mail/telefone é **permitido** (`POST` devolve `leadsSemelhantes: [...]`; dedup real na
conversão). **Sem `DELETE` físico de lead** (só `status = DESCARTADO`). Auditoria:
`crm_lead_audit` na forma canônica do core (`montarRegistroAuditoria`, `AJUSTE_MANUAL`,
**append-only**, só delta real — `PATCH` no-op → 0 linha); definições de campo auditam em
`crm_admin_audit` (tabela da 007). **6ª migração Prisma** (`20260904122426_crm_lead`): `lead`,
`campo_personalizado_lead`, `valor_campo_lead`, `crm_lead_audit` + enums `LeadEstagio`/
`LeadStatus`/`CampoPersonalizadoTipo`; PK UUID v7 na app, `@db.Timestamptz`. **~14
endpoints** `/crm/leads/**` + `/crm/admin/campos-lead/**`. **Frontend** `frontend/src/leads/`:
item **CRM · Leads** atrás de `lead:ver_todos` **ou** `lead:ver_proprios`
(`requerPermissao`/`RequirePermissao` ganham `anyOf`), rota sob `RequirePermissao`, lista
com filtros (estágio/status/origem/responsável) + busca + coluna de score, detalhe com
score/tags/campos personalizados/timeline de auditoria + **Converter em pessoa** (só com
`lead:editar` + `pessoa:editar` e lead `ATIVO`); `apiFetch` já trata 401/403. **0 dep
nova**, **1 migração**, **nenhuma porta nova**, **nenhuma chave `.env` nova**.
`CONTEXT_MODULES` segue 11. Clarificações CL-01 (arquivar+vincular), CL-02 (`PortaIdentidade`
no `core`), CL-03 (esquema administrável de campos personalizados) — resolvidas com o dono
do produto em 2026-09-04.
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.

</details>

<details><summary>Spec 007 — Administração do CRM (implementada, resumo arquivado)</summary>

Plano: [`specs/007-crm-administracao/plan.md`](specs/007-crm-administracao/plan.md)
(Fase 1 · spec 007 — Administração do CRM: primeira fatia do CRM e primeira entidade de
negócio do _bounded context_ **`crm`** (vazio desde a 001; `CONTEXT_MODULES` segue **11**).
Escopo da visão Parte 8.11, **sem reimplementar a 004** (perfis/permissões/usuários seguem
lá — esta spec só **estende o catálogo** com o recurso `crm_admin`). Quatro subdomínios:
**(1) Times/squads** — `equipe` (`nome`, `descricao`, `tipo COMERCIAL|ATENDIMENTO|CS`,
`ativo`) + `equipe_membro` (FK `usuario` da 004, `papel LIDER|MEMBRO`, `entrou_em`/
`saiu_em`; índice único **parcial** `WHERE saiu_em IS NULL` = ≤1 vínculo ativo por par;
histórico de reentrada permitido; um usuário em N equipes). Só CRUD — atribuição automática
é 010/012. **(2) Expediente** — `janela_atendimento` (`dia_semana` 0–6, `hora_inicio`/
`hora_fim` como `Int` minutos locais, `equipe_id?` nullable = global, `ativo`; rejeita
`hora_fim <= hora_inicio` — CL-02, sem cruzar meia-noite) + `feriado` (`data @db.Date`,
`descricao`, `recorrente_anual` casa por `(mês,dia)` exato; 29/02 não desloca — CL-04;
`equipe_id?` nullable). Função **pura** `estaEmExpediente(instante, {janelas, feriados,
equipe?})` em `src/crm/domain/expediente.ts` — converte para America/Sao_Paulo via `Intl`
nativo (**0 dep**, livre de locale, matriz `TZ` na CI), início inclusivo/fim exclusivo,
feriado subtrai mesmo dentro da janela, **união** global+equipe (CL-01), equipe inativa
ignorada, sem janela aplicável → `false`. `GET /crm/admin/expediente?instante=&equipeId=`
reusa a função. **(3) Integrações** — `integracao` (`nome`, `tipo API_KEY|WEBHOOK|
CONEXAO_INTERNA`, `alvo FINANCEIRO|MARKETING|CENTRAL|EXTERNO`, `config` jsonb **sem
segredo**, `ativo`, `ultimo_uso_em` reservado p/ 011/019–022). Segredo **cifrado em
repouso** (AES-256-GCM `node:crypto`, chave `CRM_INTEGRACAO_CIFRA_KEY` do `.env`,
obrigatória) **ou** só-hash (SHA-256) para API key interna gerada (`crm_` + 40 hex, valor
pleno revelado **1×** na criação/rotação). Leitura projeta só `segredoDefinido` +
`segredoMascarado` (via `segredo_ultimos4` em claro) — valor **nunca** volta em `GET`, log
ou auditoria. `POST /rotacionar`; sem OAuth/chamada externa (011/019–022/033 consomem).
**(4) Auditoria** — `crm_admin_audit` na forma canônica do core (`montarRegistroAuditoria`,
`AJUSTE_MANUAL`), **append-only**, **só delta real** (`PATCH` no-op → 0 linha); segredo
entra como marcador (`{segredo:'definido'|'rotacionado'}`), nunca valor. **RBAC 004
estendido**: catálogo (`src/auth/rbac/catalogo.ts`) ganha o recurso `crm_admin` —
`crm_admin:{ver,gerir_equipes,gerir_expediente,gerir_integracoes}` (`administrador` +
credencial de serviço concedem de graça, **0 migração de dados, 0 seed**). **5ª migração
Prisma** (`<ts>_crm_admin`): `equipe`, `equipe_membro`, `janela_atendimento`, `feriado`,
`integracao`, `crm_admin_audit` + enums `EquipeTipo`/`PapelEquipe`/`IntegracaoTipo`/
`IntegracaoAlvo`; PK UUID v7 na app, `@db.Timestamptz`. **~22 endpoints** `/crm/admin/**`
(CRUD de config administrativa — justificado como painel, não recurso de negócio; sem
`DELETE` de `equipe`/`integracao` (só `ativo=false`), sem `DELETE` de membro (só `saiu_em`),
`DELETE` físico só de `janela`/`feriado`); leitura → `crm_admin:ver`, escrita → `gerir_*`;
403 ≠ 401. **Frontend** `frontend/src/crm-admin/`: item **CRM · Administração** atrás de
`crm_admin:ver`, rota sob `RequirePermissao`, abas Equipes / Expediente / Integrações
(controles de escrita só com `gerir_*`; máscara de segredo; _reveal_ 1× não-persistente;
indicador "no expediente agora?"). **0 dep nova** (`date-fns-tz`/`luxon` avaliados e
rejeitados — `Intl` basta), **1 migração**, **+1 chave `.env`**. `CONTEXT_MODULES` segue
11. Clarificações CL-01 (união global+equipe), CL-02 (rejeitar janela que cruza meia-noite),
CL-03 (escala por atendente fora de escopo — vai junto do 012), CL-04 (feriado 29/02 não
desloca) — resolvidas com o dono do produto em 2026-09-03.
Artefatos: `research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.

</details>
<!-- SPECKIT END -->
