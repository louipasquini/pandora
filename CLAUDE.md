# Projeto Pandora — Contexto para agentes

> Este arquivo é contexto de trabalho para agentes de IA e pessoas. A fonte única e
> autossuficiente do escopo é [`Projeto_Pandora_-_Visão_geral_para_refatoração.md`](Projeto_Pandora_-_Visão_geral_para_refatoração.md).
> Os princípios de governança estão em [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
> A seção `SPECKIT` abaixo é gerada automaticamente — **não edite manualmente** e não
> coloque conteúdo dentro dela.

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
- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4 (config CSS-first, `@theme`),
  TanStack Query, React Router 7. Um único nível de acesso; login = credenciais de serviço
  (tela `/login` + `AuthProvider`/`useAuth` + `apiFetch` central que injeta `Authorization`
  e trata 401 num ponto único; token em `localStorage`). RBAC (spec 004): item de navegação
  **Administração** (abas Perfis/Usuários) atrás de `perfil:administrar`; `RequirePermissao`
  + `usePermissoesEfetivas` (consome `/auth/permissoes-efetivas`, zero permissão
  _hardcoded_); `apiFetch` trata **403** num ponto único (banner, **não** desloga).
  Spec 005: itens **Pessoas** (`pessoa:ver`) e **Contas** (`conta:ver`) —
  `frontend/src/{pessoas,contas}/` (lista+busca+paginação, detalhe com primário/secundário/
  `curado`, refs de origem, linha do tempo de merges + Desfazer; formulários e Unificar só
  com `*:editar`/`*:merge`). `vite.config.ts` lê o `.env` da raiz (`envDir: '..'`). Tokens
  da marca num ponto único: `frontend/src/theme/tokens.css`.
- **Monorepo:** npm workspaces (`backend`, `frontend`), Node 24. **Portas** (configuráveis,
  nenhuma fixa): backend `3001`, frontend `5174`, Postgres dev host `55432`.
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
Plano ativo: [`specs/007-crm-administracao/plan.md`](specs/007-crm-administracao/plan.md)
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
<!-- SPECKIT END -->
