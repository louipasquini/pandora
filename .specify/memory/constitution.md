<!--
SYNC IMPACT REPORT
==================
Versão: (template não versionado) → 1.0.0 → 1.1.0

1.0.0 → 1.1.0 (2026-09-01, MINOR): decisões da Parte 7 da visão resolvidas com o dono do
produto. Stack de referência trocada de Python/FastAPI para Node.js + TypeScript + NestJS +
Prisma (Postgres mantido). Adicionada "Ordem de construção" (CRM > Financeiro > Marketing >
Central de Clientes) na seção de Fluxo de Desenvolvimento. Nenhum princípio alterado.

1.0.0 (2026-09-01, MAJOR): ratificação inicial — primeira constituição concreta do projeto.

Princípios definidos (8):
  I.    Modelagem Orientada ao Domínio, Não à Origem
  II.   Clarificar Antes de Assumir (NÃO-NEGOCIÁVEL)
  III.  Bordas Finas, Núcleo Canônico
  IV.   Ingestão como Log de Eventos + Projeções
  V.    Agregados São Sempre Derivados
  VI.   Contextos Delimitados — Observar, Não Escrever
  VII.  Curadoria e Derivação Nunca se Sobrescrevem
  VIII. Superfície de Escrita Mínima

Seções adicionadas:
  - Padrões Técnicos Transversais
  - Regras de Negócio Invioláveis
  - Fluxo de Desenvolvimento e Portões de Qualidade
  - Governança

Seções removidas: nenhuma (placeholders do template substituídos por conteúdo concreto).

Templates e artefatos dependentes:
  ✅ .specify/templates/plan-template.md — "Constitution Check" preenchido com portões concretos
  ✅ .specify/templates/tasks-template.md — nota sobre tipos de tarefa derivados dos princípios
  ✅ .specify/templates/spec-template.md — revisado; já alinhado (NEEDS CLARIFICATION + Key Entities)
  ✅ CLAUDE.md — seção de contexto do projeto preenchida (fora dos marcadores SPECKIT)
  ✅ README.md — criado

TODOs pendentes: nenhum.
Decisões em aberto do produto (Parte 7 da visão): NÃO são resolvidas por esta constituição;
o Princípio II exige que sejam respondidas pelo dono do produto antes de codificar o schema
que cada uma toca.
-->

# Constituição do Projeto Pandora

O Pandora é a reconstrução do sistema de dados da **Amor em Nutrir (AEN)**: consolidação sem
duplicidade de transações, clientes, catálogo e contratos vindos de 7 contas de origem em 4
plataformas (TMB, Asaas, Guru, Hotmart), somada a três frentes novas — **Marketing**, **CRM**
e **Central de Clientes**. O sistema atual funciona e está validado contra produção, mas foi
modelado reativamente ao longo de 11 features. Esta constituição fixa os princípios que a
reconstrução **não pode violar**, para não repetir as gambiarras catalogadas na Parte 4 do
documento de visão (`Projeto_Pandora_-_Visão_geral_para_refatoração.md`).

## Core Principles

### I. Modelagem Orientada ao Domínio, Não à Origem

Entidades e identificadores são conceitos de negócio; representações de plataforma são
detalhes de borda.

- Toda entidade nasce com um **ID surrogate opaco e estável** (UUID v7 ou ULID), decidido
  **antes da primeira linha de código**. IDs de origem (tag de oferta, `hotmart_code`,
  `offer.code`, `externalReference`, `wa_id`) nunca são PK.
- Identificadores de origem vão para **tabelas de alias/resolução** (`*_origem_ref`:
  entidade, tipo_ref, valor_ref, id_entidade), muitos-para-um. Mudar a regra de resolução
  é `INSERT`/`UPDATE` nessas tabelas — nunca `ALTER TABLE`.
- A **granularidade de negócio** de Contrato, Oferta e Produto é decidida e documentada
  antes de modelar o schema (ver Decisões em Aberto da visão, itens 1–3).

**Racional:** a identidade de entidade mudou 3× para Oferta e 1× para Contrato porque foi
derivada da representação de origem. ID surrogate + tabela de alias torna a regra de
resolução um dado, não uma migração destrutiva.

### II. Clarificar Antes de Assumir (NÃO-NEGOCIÁVEL)

Toda dúvida, inconsistência ou ambiguidade encontrada no meio do caminho é levada ao dono
do produto **antes de codificar**.

- Uma decisão em aberto (Parte 7 da visão, e as específicas de CRM/Marketing) é resolvida
  **antes** de escrever o schema ou o código que ela toca.
- Marcadores `NEEDS CLARIFICATION` em spec/plan **bloqueiam** o avanço para tasks e
  implementação daquela fatia.
- É proibido "chutar" um comportamento de negócio para destravar o trabalho. Chute de
  status vira estado `REVISAR` explícito, não um default silencioso.

**Racional:** o sistema atual acumulou dívida justamente onde o negócio foi assumido em vez
de perguntado (escala monetária, papel de afiliada, semântica de checkpoint).

### III. Bordas Finas, Núcleo Canônico

Cada integração converte para/de um **modelo canônico** e nada mais.

- Nenhuma regra de negócio conhece "Guru", "Asaas", "Hotmart" ou "TMB". Esses nomes só
  aparecem como valor do enum `plataforma_origem` e dentro dos adaptadores.
- **Um adaptador por (plataforma × fonte)** (`webhook`, `csv`, `api`), com assinatura
  `parse(payload|linha) -> EventoCanonico`. Adaptadores **nunca tocam o banco de negócio**
  e são testados contra fixtures reais.
- Vocabulário de status de origem é traduzido por adaptadores **versionados por fonte**
  (`status_map/{plataforma}/{fonte}`). O núcleo só conhece `StatusTransacaoCanonico` e
  `StatusContratoCanonico`. Status não mapeado → `REVISAR` (nunca `Inativo` sobrecarregado).

**Racional:** `map_status` misturou vocabulário de API e de CSV no mesmo dicionário;
`nome_oferta` teve dois significados por plataforma. Adaptador dedicado por fonte isola isso.

### IV. Ingestão como Log de Eventos + Projeções

O evento cru imutável é a fonte de verdade; tudo o mais é projeção reconstruível.

- Todo fato vira uma linha imutável em `evento_origem` (`payload_bruto jsonb`, `hash`,
  `recebido_em`, `status ∈ {pendente, ok, erro, revisar}`). Dedup por
  `(plataforma_origem, id_origem, hash)`. Nada é descartado silenciosamente — evento
  problemático é **persistido para retrabalho**, com log.
- O pipeline roda em **etapas idempotentes, independentes e com commit próprio**
  (registrar → classificar → resolver pessoa → upsert transação → resolver vínculo →
  resolver oferta → projetar no contrato). Falha numa etapa não bloqueia as anteriores nem
  os outros eventos; um worker retenta a etapa pendente.
- Cada etapa retorna um **resultado explícito** (ex.:
  `ResultadoIngestao{transacao, foi_criada, campos_alterados}`). É **proibido** carregar
  resultado de ingestão como atributo mutável pendurado no objeto ORM, e **proibido**
  `commit()` no meio do pipeline como remendo de confiabilidade.

**Racional:** o pipeline monolítico numa transação forçou `_houve_mudanca` no objeto ORM e
um `commit()` no meio para não perder o vínculo. Etapas idempotentes eliminam os dois.

### V. Agregados São Sempre Derivados

Todo valor agregado é uma função sobre eventos/estado, nunca um contador incremental.

- `ticket_total`, `valor_recebido`, `acesso_liberado`, `status` de contrato,
  `ofertas_compradas`, e **toda métrica** de Dashboard (Financeiro, CRM, Marketing) são
  `f(eventos) -> estado` — nunca `estado += delta`. Reprocessar é inócuo por construção.
- Recalcular um contrato = rodar a função de *fold* sobre seus aditivos: determinística,
  idempotente, testável sem banco.
- **Dinheiro nunca soma moedas diferentes** nem mistura receita própria com receita de
  afiliada. Resultado monetário agregado é sempre `dict[moeda, valor]`, dois dicionários
  (própria / afiliada).
- Receita é sempre uma **query** (filtro "pago de fato" + agrupamento por moeda + papel),
  nunca um número materializado que pode divergir.

**Racional:** `aplicar_aditivo` incremental duplicava `ticket_total` ao reprocessar um
webhook. Agregação sobre eventos é idempotente.

### VI. Contextos Delimitados — Observar, Não Escrever

Cada contexto é dono das suas entidades; a comunicação entre contextos é por eventos ou
API interna, nunca por schema gigante compartilhado nem polling direto no banco alheio.

- Contextos: `ingestao`, `financeiro`, `catalogo`, `contratos`, `clientes`, `crm`,
  `marketing`, `central`, `core`.
- Um contexto a jusante **observa** eventos do contexto a montante:
  - "Negócio ganho" no Pipeline do CRM **nunca** cria, libera ou antecipa Contrato.
    Contrato nasce exclusivamente de transação paga; o CRM observa esse evento e pode
    marcar a oportunidade como ganha — nunca o contrário.
  - Marketing **observa** `EM_ATRASO` do Financeiro para disparar recuperação; nunca
    escreve status financeiro.
  - `preferencia_comunicacao` é dona da Central de Clientes; CRM/Marketing/Disparos só
    **leem e respeitam**.
- Ações da Central de Clientes viram **comando para o contexto dono** — nunca escrita
  direta no banco de outro contexto.
- `Lead` é exceção deliberada: entidade única compartilhada CRM↔Marketing, com acesso
  resolvido por RBAC, não por fronteira arquitetural.

**Racional:** um schema compartilhado gigante foi o que tornou cada mudança de regra uma
migração. Contratos explícitos entre contextos contêm o blast radius.

### VII. Curadoria e Derivação Nunca se Sobrescrevem

Campo curado por humano e campo derivado da ingestão são colunas/tabelas diferentes; a
leitura decide a precedência.

- Precedência na leitura: **valor curado > valor derivado da tag > null**. Nunca por
  sobrescrita destrutiva in-place.
- Curadoria manual vence o re-sync automático de um campo travado
  (`campos_editados_manualmente` como tabela/coluna separada, não flag in-place). Mas uma
  **reimportação de catálogo** pode corrigir esse campo (senão a 2ª rodada de curadoria
  via planilha trava para sempre).
- Reprocessamento, reimportação e reconciliação tardia **nunca desfazem** um vínculo já
  aplicado (Asaas↔Guru, afiliado, contrato) — só geram registro em `alerta_reconciliacao`.
- `Oferta` (o quê se vende) é separada de `OfertaCatalogo` (metadados curados: ticket,
  preço de tabela, tempo de acesso, bônus, combo).

**Racional:** dois caminhos de código escreviam o mesmo campo `turma` com formatos
diferentes; curadoria e ingestão disputavam a mesma coluna. Colunas separadas + precedência
na leitura resolvem sem migração.

### VIII. Superfície de Escrita Mínima

Escrever menos, derivar mais — manter a disciplina do sistema atual.

- Apenas um conjunto **explícito e pequeno** de recursos tem qualquer endpoint de escrita
  (hoje: Produto, Oferta, Contrato, Transação [só retry de vínculo], Janela de Lançamento
  [só CSV], Produto Afiliado [só CSV]). Todo o resto é read-only por design. Adicionar um
  recurso de escrita exige justificativa registrada.
- **Nenhuma sincronização automática com API externa.** Consulta a API de origem é 100%
  sob demanda, com frase de confirmação validada no backend. Webhooks continuam sendo o
  caminho primário de atualização em tempo real. `checkpoint` só serve para retomar
  execução interrompida de verdade.
- Ações da Central de Clientes expostas à aluna são poucas, auditadas, e viram comando
  (Princípio VI).

**Racional:** o motor de sincronização foi refeito 2× porque "manter dados frescos" foi
atacado com automação antes de o negócio decidir que **não quer** consultas automáticas de
API (custo de requisição).

## Padrões Técnicos Transversais

Decididos **uma vez, no início**, e aplicados em todo lugar (Parte 5.4 da visão):

- **IDs:** UUID v7 (ou ULID) para toda PK. IDs de origem só em tabelas `*_origem_ref`.
- **Dinheiro:** Value Object único `Dinheiro{valor_int, moeda}`, escala fixa **× 10000**
  (4 casas decimais). `float` para dinheiro é **proibido** em qualquer lugar. `moeda` nunca
  é opcional; default explícito `BRL` só na borda (parser de integração ou de painel).
  Somas só entre a mesma moeda.
- **Tempo:** tudo `timestamptz` em UTC. Parser de borda tolera ISO / epoch s / epoch ms /
  sem timezone / lixo (→ `null` com log). Nunca `datetime` naive.
- **Status:** `StatusTransacaoCanonico` (enum rico: `PENDENTE`, `PAGO`, `EM_ATRASO`,
  `RECUSADO`, `CANCELADO`, `ESTORNADO`, `CHARGEBACK`, `DESCONHECIDO`) e
  `StatusContratoCanonico`. "Libera acesso?" e "conta como receita?" são **funções puras**
  desse enum (+ tolerância), cada uma numa linha. Adaptadores de origem versionados por
  fonte. Desconhecido → fila de `REVISÃO`.
- **Idempotência:** toda escrita derivada é `f(eventos) -> estado`. Toda ação de automação
  (Workflow) é reprocessável sem duplicar efeito.
- **Auditoria:** `criado_em` / `atualizado_em` em tudo. Mudanças curadas e ajustes manuais
  registrados em tabela `_audit` (ou trigger/`pgaudit`), com "quem" e "quando".
- **Erros de ingestão:** `evento_origem.status ∈ {pendente, ok, erro, revisar}` +
  `erro_detalhe`. Um painel lista `revisar`/`erro`. Nada sumido silenciosamente.
- **LGPD:** exclusão de pessoa = **pseudonimização** de `pessoa` (dados de identificação
  removidos/ofuscados), mantendo `transacao` e agregados financeiros intactos.
- **Config/segredos:** `.env` por conta. Nunca hard-coded. Webhook valida token.
- **Multi-conta:** `plataforma_origem` (enum de 7) é dimensão de primeira classe em toda
  query e índice.

## Regras de Negócio Invioláveis

A reconstrução pode mudar **como** estas regras são implementadas, mas não **o que** elas
dizem. Fonte: Parte 3 do documento de visão (confirmadas com o dono do produto).

1. **Sem duplicidade.** Chave de transação: `(plataforma_origem, id_transacao_origem)`.
   Nenhuma transação, cliente ou contrato existe 2× por ter vindo de 2 plataformas.
2. **Venda Guru + Asaas conta 1×.** A Guru é a venda de registro; o pagamento Asaas
   vinculado não gera receita nem contrato próprios. Asaas avulsa resolve tudo normalmente.
3. **Contrato é único por `(pessoa, produto)` e perpétuo.** Toda compra do mesmo produto
   pela mesma pessoa é aditivo ao mesmo contrato, nunca um contrato novo — *renovação* se o
   acesso estava expirado na data do aditivo, *prorrogação* se ainda ativo (rótulo derivado
   do estado de acesso, não um campo próprio).
4. **`fim_acesso` do aditivo** = `max(fim_acesso vigente, data do aditivo) + tempo_acesso`.
5. **Status de acesso ≠ status financeiro.** `PENDENTE` conta como Ativo para
   acesso/tolerância, mas **não** como "pago de fato". São dois sistemas separados de
   propósito — ambos derivados de **um** enum canônico.
6. **Total recebido nunca soma moedas diferentes** nem mistura receita própria com
   afiliada. Sempre `dict[moeda, valor]`, dois dicionários.
7. **Valor monetário é inteiro, escala × 10000.** Nunca float, nunca centavos.
8. **Venda como afiliada** nunca gera Oferta, Contrato, turma nem Cliente novo. Vincula a
   Cliente só se ele já existe por compra de produto próprio. É "só registro".
9. **Curadoria manual vence a ingestão automática** — mas reimportação de catálogo pode
   corrigir o campo curado.
10. **Dedup de cliente por prioridade:** documento → CNPJ → e-mail normalizado → telefone.
    Ambiguidade (2+ candidatos no mesmo critério) descarta o critério, não escolhe um.
    E-mail/telefone: o mais recente vira primário, o antigo vai para `*_secundarios`.
11. **Nenhuma sincronização automática com API externa.** Só sob demanda, com confirmação.
    Webhooks seguem como caminho primário em tempo real.
12. **Toda dúvida/inconsistência é levada ao usuário antes de codificar** (Princípio II).
13. **`acesso_liberado`, `status` e `valor_recebido` do Contrato são recalculados a cada
    aditivo**, mesmo sobrescrevendo um ajuste manual anterior (decisão do negócio).
14. **Reimportação nunca desfaz um vínculo de Contrato já aplicado** — só alerta.
15. **Status bruto não catalogado → `REVISAR`** (força revisão manual, nunca "chuta" ativo).

Regra de merge de identidade auto-declarado pela aluna (Central de Clientes): **sempre
revisão 100% humana**, nunca sugestão de IA, por risco de fraude. Governança de qualquer
outra saída de IA em produção: validação individual → revisão coletiva de padrão →
generalização opcional (nunca aplicação automática direta).

## Fluxo de Desenvolvimento e Portões de Qualidade

- **Processo Spec Kit obrigatório:** `constitution` → `specify` → `clarify` → `plan` →
  `tasks` → `implement`. Cada feature vive em `specs/<###-nome>/`. Nenhuma feature entra em
  `plan` com `NEEDS CLARIFICATION` aberto que dependa de decisão do dono do produto.
- **Constitution Check** é portão no `plan`: o plano declara explicitamente como respeita
  os Princípios I–VIII e os Padrões Transversais, ou registra a violação em Complexity
  Tracking com alternativa mais simples rejeitada e justificada.
- **Testes contra Postgres real** (não só mocks), com dados de produção, seguem sendo a
  disciplina de teste da v1. Adaptadores de borda testados contra fixtures reais de cada
  plataforma. Os testes Python da v1 não são portados — são reescritos na stack nova.
- **Estratégia de migração:** não migrar dado tabela-a-tabela. Re-ingerir a partir dos
  payloads crus / exportações CSV das 7 contas para o novo `evento_origem` e deixar as
  projeções se reconstruírem. Congelar a v1 (read-only) no corte e comparar agregados-chave
  (receita por conta/mês/moeda, contratos ativos, clientes) — têm que bater ou a diferença
  tem que ser explicável. Catálogo curado é o único dado migrado de verdade, pelos
  endpoints de curadoria da v2.
- **Stack:** backend em **Node.js + TypeScript + NestJS + Prisma** sobre **PostgreSQL**
  (decisão resolvida em 2026-09-01, visão Parte 7 item 11 — substitui o Python/FastAPI da
  v1; código e testes da v1 não são reaproveitados). Frontend em React 19 + TypeScript +
  Vite + Tailwind v4. Os módulos do NestJS mapeiam os contextos delimitados (Princípio VI).
  Trocar qualquer peça exige emenda desta constituição e o Princípio II.
- **Ordem de construção:** CRM → Financeiro → Marketing → Central de Clientes (prioridade do
  dono do produto). As fatias transversais de `core` (dinheiro, tempo, ids, status canônico)
  e as fundações de `clientes` (`pessoa`, identidade/dedup) e `ingestao` (`evento_origem`)
  precedem o CRM porque ele depende delas (o Workflow consome `evento_origem`; o `lead` vira
  `pessoa` pela engine de identidade).

## Governança

- Esta constituição **supersede** qualquer outra prática ou convenção. Em conflito entre
  esta constituição e um plano, spec ou código, a constituição vence.
- **Emendas** exigem: (1) proposta escrita com racional e impacto, (2) aprovação do dono do
  produto, (3) atualização sincronizada dos templates dependentes
  (`plan-template.md`, `spec-template.md`, `tasks-template.md`), do `CLAUDE.md` e do
  `README.md` na mesma mudança, e (4) Sync Impact Report no topo deste arquivo.
- **Versionamento semântico** desta constituição:
  - **MAJOR:** remoção ou redefinição incompatível de princípio ou de regra de governança.
  - **MINOR:** novo princípio/seção ou expansão material de orientação.
  - **PATCH:** esclarecimento, correção de texto, refinamento não-semântico.
- **Revisão de conformidade:** todo PR e todo `plan` verificam aderência aos Princípios
  I–VIII. Complexidade não justificada é bloqueio de revisão.
- **Decisões em Aberto** (Parte 7 da visão e as específicas de CRM/Marketing) não são
  cláusulas desta constituição; são pré-requisitos de spec, governados pelo Princípio II.
- Orientação de desenvolvimento em runtime: ver `CLAUDE.md` e o `plan.md` da feature ativa.

**Version**: 1.1.0 | **Ratified**: 2026-09-01 | **Last Amended**: 2026-09-01
