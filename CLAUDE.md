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
- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4 (config CSS-first, `@theme`),
  TanStack Query, React Router 7. Um único nível de acesso; login = credenciais de serviço.
  Tokens da marca num ponto único: `frontend/src/theme/tokens.css`.
- **Monorepo:** npm workspaces (`backend`, `frontend`), Node 24. **Portas** (configuráveis,
  nenhuma fixa): backend `3001`, frontend `5174`, Postgres dev host `55432`.
- **Testes:** unitários sem banco; e2e do backend contra Postgres real, schema isolado por
  execução (`backend/test/setup-db.ts`). CI: `.github/workflows/ci.yml`.
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
Plano ativo: [`specs/002-core-value-objects/plan.md`](specs/002-core-value-objects/plan.md)
(Fase 0 · spec 002 — primitivas canônicas do `core`, sem banco/endpoint/frontend:
`Dinheiro` `bigint` ×10000 + `Moeda` ISO 4217 validado; `parseInstante` de borda tolerante
livre de locale + `agoraUtc`; enums `StatusTransacaoCanonico`/`StatusContratoCanonico` com
funções puras `liberaAcesso`/`contaComoReceita`/`contratoLiberaAcesso` + rede de segurança
`paraStatusTransacaoCanonico`; contrato `EntidadeAuditavel` + `RegistroAuditoria`;
consolidação da config tipada no `core` + regra ESLint `no-process-env`). Artefatos:
`research.md`, `data-model.md`, `contracts/`, `quickstart.md` na mesma pasta.
<!-- SPECKIT END -->
