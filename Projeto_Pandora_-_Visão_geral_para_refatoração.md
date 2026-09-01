> **Propósito deste documento.** Servir de _briefing_ único e autossuficiente para
> reconstruir o sistema do zero — com uma arquitetura mais limpa — junto de três frentes
> novas (**Marketing**, **CRM**, **Central de Clientes**). Um agente de IA (ou uma pessoa)
> deve conseguir, lendo só este arquivo, entender: o que o sistema faz, por que ele existe,
> quais regras de negócio são sagradas, quais "gambiarras" surgiram no caminho e o que as
> causou, e como estruturar a reconstrução para não repeti-las.
>
> Ele **descreve o domínio e o alvo**, não prescreve tabela por tabela — as decisões de
> schema final devem sair de um processo de spec (ver "Decisões em aberto", no fim).
>
> Contexto de origem: o sistema atual foi construído em 11 features incrementais
> (`specs/001` … `specs/011`) ao longo de ~2 meses, cada uma reagindo a um achado sobre
> dados reais. Isso gerou um produto que **funciona e está validado contra dados de
> produção**, mas cuja modelagem foi decidida reativamente (identidade de entidade mudou 3
> vezes, escala monetária mudou 1 vez, o motor de sincronização foi refeito 2 vezes).

---

# Financeiro
## Parte 1 — O que o sistema é

### 1.1 Contexto de negócio

A **Amor em Nutrir (AEN)** é uma empresa de educação/infoprodutos (cursos, mentorias,
comunidades) para nutricionistas. Ela vende os mesmos produtos por **4 plataformas de
pagamento/checkout diferentes**, cada uma com seu próprio modelo de dados:

| Plataforma | Papel | Contas reais | Autenticação | Atualização |
| --- | --- | --- | --- | --- |
| **TMB Educação** | Checkout/ERP educacional | 1 | Token estático | Webhook (Vendas + Financeiro) + API REST `GET /api/pedidos` |
| **Asaas** | Gateway de cobrança puro (boleto/pix/cartão) | 2 (PRD, SVC) | API key por conta | Webhook por conta + API `GET /payments` |
| **Guru** (Digital Manager Guru) | Checkout/plataforma de vendas | 2 (PRD, SVC) | Token por conta | Webhook por conta + API `GET /transactions` (janelas ≤180d, cursor) |
| **Hotmart** | Marketplace de infoproduto | 2 (PRD, SVC) | OAuth2 client_credentials | Sem webhook usado — só API `GET /sales/history` + `/sales/price/details` |

São **7 "contas de origem"** distintas (`PlataformaOrigem`): `TMB`, `Asaas PRD`,
`Asaas SVC`, `Guru PRD`, `Guru SVC`, `Hotmart PRD`, `Hotmart SVC`. Quase todo o sistema
identifica a conta específica, não só a plataforma. Há um agrupamento de 4 (`Plataforma`)
usado só em rotas administrativas.

**Particularidade central:** a Guru terceiriza boa parte da cobrança para a Asaas. Uma
única venda pode existir como **2 eventos** — uma transação Guru (a "venda de registro":
produto, oferta, cupom, assinatura) e um pagamento Asaas (a cobrança). Sem tratamento, isso
vira contagem dupla de receita.

**Particularidade 2:** na Hotmart, a AEN às vezes vende como **afiliada** de outro produtor
(não como produtora). Essas vendas entram "só para registro" — não geram catálogo, contrato
nem cliente novo.

### 1.2 Objetivo do sistema atual

Consolidar, **sem duplicidade**, num único PostgreSQL:

1. **Transações** (todo pagamento/venda/reembolso/chargeback das 7 contas).
2. **Clientes** (pessoa física/jurídica compradora, deduplicada entre plataformas).
3. **Catálogo** — Produto → Oferta (curado internamente, não reflete nas plataformas).
4. **Contratos** — o vínculo cliente↔produto com estado de acesso, valor e histórico.

E expor tudo por uma **API interna JWT** consumida por um **painel React** da equipe.
Não há usuários individuais: um único nível de acesso de serviço
(`SERVICE_CLIENT_ID`/`SERVICE_CLIENT_SECRET` → `POST /auth/token` → JWT).

### 1.3 Glossário do domínio

| Termo | Definição |
| --- | --- |
| **Transação** | Um evento financeiro de uma conta de origem (venda, parcela, reembolso, chargeback). Chave natural: `(plataforma_origem, id_transacao_origem)`. Imutável em identidade; campos podem ser atualizados por re-sync. |
| **Cliente** | Pessoa/empresa compradora. Deduplicada por documento (CPF) → CNPJ → e-mail normalizado → telefone. Guarda histórico de e-mails/telefones secundários (o mais recente é sempre o primário). |
| **Produto** | Produto "de verdade" do catálogo (ex.: "Programa Consultório Smart"). Identificado por um **código de 3 letras** (`PCS`, `NMX`, …). Auto-criado na 1ª transação que traga um código novo; nome e flag `assinatura` são curadoria manual. |
| **Oferta** | Uma forma de vender um Produto (turma X, plano mensal, order bump, combo…). Historicamente identificada por uma **tag de 8 caracteres** (`PCS48XAV`: produto 3 + turma 2 + subproduto 1 + modelo cobrança 1 + modelo transação 1). |
| **Tag de oferta** | String no início do nome da oferta, ex.: `[#PCS48XAV] ...`. Decodificada em `produto`/`turma`/`subproduto`/`modelo_cobranca`/`modelo_transacao`/`estrategia`/`vitalicio` por `src/services/oferta_tag.py`. |
| **Contrato** | Registro **único por `(cliente, produto)`**. Toda venda/renovação/renegociação/cancelamento/reembolso do mesmo cliente no mesmo produto é um **aditivo** ao mesmo contrato — nunca um contrato novo. Acumula `ticket_total`, recalcula `valor_recebido`, `status`, `acesso_liberado` e `fim_acesso` a cada aditivo. |
| **Aditivo** | Uma transação aplicada a um Contrato. `fim_acesso = max(fim_acesso vigente, data do aditivo) + tempo_acesso da Oferta`. |
| **Turma "evergreen"** (`X0`) | Placeholder para ofertas Hotmart vendidas continuamente sem turma fixa. A turma real da venda é resolvida pela **data** contra `JanelaLancamento`. |
| **Venda como afiliada** | Transação Hotmart cujo `produto_origem` bate com um `ProdutoAfiliado` curado. Nunca gera Oferta/Contrato/Cliente. Contabilizada à parte. |
| **Vínculo Asaas↔Guru** | FK self-referencial bidirecional (`id_transacao_vinculada`) entre o pagamento Asaas e a transação Guru da mesma venda. Só a Guru soma receita; a Asaas vinculada não resolve Oferta/Contrato próprios. |
| **`campos_editados_manualmente`** | Array de nomes de campos, em Produto/Oferta, que a curadoria manual "travou" contra sobrescrita pela ingestão automática. |
| **`status_bruto`** | Status como veio da origem (texto). Mapeado para `StatusContrato` (`Ativo`/`Em atraso`/`Cancelado`/`Inadimplente`/`Reembolsado`/`Inativo`) por `map_status`. |
| **"Pago de fato"** | Filtro **separado** do status de acesso: responde "esse dinheiro entrou mesmo?" (exclui pendente/aguardando/cancelado/reembolsado). Usado só em somas de dinheiro. |

---

## Parte 2 — Arquitetura atual (as-is)

### 2.1 Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 async + Alembic, Pydantic v2, PyJWT,
  httpx, APScheduler. PostgreSQL.
- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4, TanStack Query, React Router.
  Um único nível de acesso; login = credenciais de serviço da API.
- **Estrutura:** `src/{api,core,db,integrations,jobs,models,schemas,services}` + `tests/{unit,contract,integration}`. 34 migrações Alembic (`0001`…`0034`). ~329 testes.

### 2.2 Fluxo de ingestão (o coração do sistema)

`src/services/ingestion.py::ingerir_transacao(session, evento: TransacaoEvento)`:

```
Webhook / CSV / API de sync
        │
        ▼
 parse_evento[_csv] da integração  ──►  TransacaoEvento (dataclass normalizada)
        │
        ▼
 ingerir_transacao:
   1. Se Hotmart: buscar_produto_afiliado(produto_origem)
        ├─ afiliada?  → match_cliente (só busca, nunca cria)  → id_cliente pode ficar NULL
        └─ normal     → match_or_create_cliente  (dedup + rotação de e-mail/telefone)
   2. upsert Transacao por (plataforma_origem, id_transacao_origem)
      grava _houve_mudanca = era_nova OR session.is_modified(...)   [hack: ver 4.9]
   3. flush
   4. Vínculo Asaas↔Guru (nos 2 sentidos de chegada)
      → se houve tentativa de vínculo: session.commit() AQUI  [hack: ver 4.10]
   5. Se NÃO for pular_oferta_por_vinculo:
        Hotmart → resolver_oferta_hotmart_por_codigo (só busca no catálogo importado)
                  → copiar_identidade_oferta_para_transacao (herda produto/turma/etc.)
                  → se evergreen: resolver_turma_por_data (JanelaLancamento)
        outras  → resolver_ou_criar_oferta (por tag)  ||  resolver_oferta_por_nome (fallback)
        → aplicar_aditivo(transacao, oferta)   → cria/atualiza Contrato
```

`aplicar_aditivo` (`src/services/contratos.py`): get-or-create do Contrato por
`(id_cliente, id_produto)`; recalcula `fim_acesso`, acumula `ticket_total`, **recalcula do
zero** `valor_recebido` (soma das transações vinculadas que passam em
`esta_pago_efetivamente`), recalcula `status` via `map_status` + tolerância de atraso,
`acesso_liberado = (status == ATIVO)`, reatribui `turma` (só exibição).

### 2.3 Sincronização de histórico

**Toda consulta às APIs de origem é sob demanda**, pelo painel admin, com frase de
confirmação validada no backend (`POST /admin/sincronizar/{conta}` e `/sincronizar-tudo`).
Nada roda no startup nem em cron (feature 009 removeu 3 mecanismos automáticos).
`sincronizar_conta` (`src/services/sync_incremental.py`) caminha para trás a partir de
**hoje**, em janelas, e para assim que uma janela não traz novidade. Um `checkpoint` só é
usado como ponto de partida se a execução anterior foi **interrompida de verdade**.

**Import via CSV** (`POST /admin/importar-csv/{conta}`): cada integração tem
`parse_evento_csv(linha, plataforma) -> TransacaoEvento`; o resto do pipeline é idêntico.

Jobs automáticos que **restam**: `backup` (dump do banco) e `vinculo_pendente` (só casa
dados já no banco, não chama API externa).

### 2.4 Catálogo (curadoria)

- Produto/Oferta **auto-criados** na ingestão, com campos decodificados da tag.
- Curáveis pelo painel: `PUT /produtos/{codigo}`, `POST/PATCH /ofertas`, `PUT /ofertas/{codigo}`.
  Cada escrita manual chama `marcar_editado`; a ingestão usa `aplicar_se_nao_editado`.
- **Catálogo Hotmart** importado por 4 CSVs (`produtos.csv`, `ofertas.csv`,
  `lancamentos.csv`, `afiliados.csv`) via `POST /admin/catalogo-hotmart/*`. `ofertas.csv`
  define 1 Oferta por `hotmart_code`; a tag AEN vira `codigo_interno` (não-único).

### 2.5 Superfície de API

| Grupo | Rotas |
| --- | --- |
| Auth | `POST /auth/token` |
| Health | `GET /health` (7 contas: configurado / último evento / defasado / histórico / última tentativa) |
| Webhooks (públicos, validam token) | `POST /webhooks/tmb/{vendas,financeiro}`, `/webhooks/asaas/{prd,svc}`, `/webhooks/guru/{prd,svc}` |
| Transações | `GET /transacoes` (muitos filtros), `GET /transacoes/{id}`, `POST /transacoes/{id}/tentar-vincular`, `POST /transacoes/tentar-vincular-pendentes` |
| Clientes | `GET /clientes`, `GET /clientes/{id}` |
| Produtos | `GET /produtos`, `GET /produtos/{codigo}`, `PUT /produtos/{codigo}` |
| Ofertas | `GET /ofertas`, `GET /ofertas/{id}`, `POST /ofertas`, `PATCH /ofertas/{id}`, `PUT /ofertas/{codigo}` |
| Contratos | `GET /contratos` (busca por produto+turma), `GET /contratos/{id}`, `PATCH /contratos/{id}` (ajuste manual de status/acesso) |
| Dashboard | `GET /dashboard/metricas` (total recebido **por moeda**, qtd. contratos, total afiliada **por moeda**; filtro por produto/oferta) |
| Admin | `POST /admin/sincronizar[/{conta}\|-tudo]`, `POST /admin/importar-csv/{conta}`, `POST /admin/catalogo-hotmart/{produtos,ofertas,lancamentos,afiliados}` |

**Restrição constitucional:** apenas 6 recursos têm _qualquer_ endpoint de escrita
(Produto, Oferta, Contrato, Transação [só retry de vínculo], Janela de Lançamento [só CSV],
Produto Afiliado [só CSV]). Tudo o mais é read-only por design.

### 2.6 Frontend

Páginas: Dashboard ("7 contas, 1 registro" — visualiza `GET /health`), Login, e
listas/detalhes de `transacoes`, `clientes`, `contratos`, `ofertas`, `produtos`,
`afiliados`. Identidade visual da marca (azul `#2E4E78`, coral `#EC5F6A`, menta `#68C0B2`,
Inter). Detalhe do Contrato tem uma "linha do tempo de aditivos".

---

## Parte 3 — Regras de negócio e invariantes que DEVEM sobreviver

Estas são as regras que o negócio confirmou explicitamente. A reconstrução pode mudar
_como_ elas são implementadas, mas não _o que_ elas dizem.

1. **Sem duplicidade.** Nenhuma transação, cliente ou contrato pode existir 2× por ter
   vindo de 2 plataformas. Chave de transação: `(plataforma_origem, id_transacao_origem)`.
2. **Uma venda que passa por Guru + Asaas conta 1×.** A Guru é a venda de registro; o
   pagamento Asaas vinculado não gera receita nem contrato próprios. Sem vínculo (venda
   Asaas avulsa), a Asaas resolve tudo normalmente.
3. **Contrato é único por `(cliente, produto)` e perpétuo.** Nunca se cria um 2º contrato
   para a mesma dupla. Renovar em outra turma = aditivo ao mesmo contrato.
4. **`fim_acesso` do aditivo** = `max(fim_acesso vigente, data do aditivo) + tempo_acesso`
   — nunca deixa um acesso recém-pago parecer vencido.
5. **Status de acesso ≠ status financeiro.** `PENDING` (Asaas) / `pending` (Guru) contam
   como **Ativo para acesso/tolerância** (decisão explícita do negócio), mas **não** contam
   como "pago de fato" para somas de dinheiro. São dois sistemas separados de propósito.
6. **Total recebido nunca soma moedas diferentes** nem mistura receita própria com receita
   de afiliada. Sempre `dict[moeda, valor]`, dois dicionários.
7. **Valor monetário é inteiro, escala × 10000** (4 casas decimais), em todo o sistema.
   Nunca float. Nunca centavos.
8. **Venda como afiliada** nunca gera Oferta, Contrato, turma nem Cliente novo. Vincula a
   um Cliente só se ele já existe por compra de produto próprio. É "só registro".
9. **Curadoria manual vence a ingestão automática.** Um campo marcado como editado
   manualmente nunca é sobrescrito por re-sync — mas uma **reimportação de catálogo** pode
   corrigi-lo (senão a 2ª rodada de curadoria via planilha travava para sempre).
10. **Dedup de cliente por prioridade:** documento → CNPJ → e-mail normalizado → telefone.
    Ambiguidade (2+ clientes no mesmo critério) = critério descartado, não escolhe um.
    E-mail/telefone: o mais recente vira primário, o antigo vai para `*_secundarios`.
11. **Nenhuma sincronização automática com API externa.** Só sob demanda, com confirmação.
    (Webhooks continuam sendo o caminho primário de atualização em tempo real.)
12. **Toda dúvida/inconsistência/erro achado no meio do caminho é levada ao usuário antes
    de codificar** (Princípio II da constituição — não-negociável).
13. **`acesso_liberado`, `status` e `valor_recebido` do Contrato são recalculados a cada
    aditivo**, mesmo sobrescrevendo um ajuste manual anterior (decisão do negócio).
14. **Reimportação nunca desfaz um vínculo de Contrato já aplicado** (não-reversão
    automática — vale para vínculo Asaas↔Guru, para afiliados e para reconciliação tardia:
    só **alerta**, nunca corrige sozinho).
15. **Status bruto não catalogado → `Inativo`** (força revisão manual, nunca "chuta" ativo).

---

## Parte 4 — Catálogo de gambiarras e suas causas-raiz

Cada item: **o que ficou torto**, **por que**, e **o que fazer diferente na reconstrução**.
Este é o principal insumo da refatoração.

### 4.1 Identidade de entidade decidida reativamente (3× para Oferta, 1× para Contrato)

- **O quê:** `Oferta` já teve como PK: `codigo` (tag de 8 chars) → `id` (hash SHA-256 de
  `codigo` ou de `nome+plataforma`) → e, para catálogo Hotmart, hash de `hotmart_code`. A
  tag virou `codigo_interno` **não-único**. Há uma `@property tag` que faz
  `codigo or codigo_interno`. `Contrato` mudou de `(cliente, turma)` para
  `(cliente, produto)`, com migração de dados que **mesclou** contratos duplicados no banco
  real (sobrevivente = aditivo mais recente, somando `ticket_total`, realocando FKs).
- **Causa-raiz:** a identidade foi derivada da _representação de origem_ (a tag, a turma) em
  vez de ser um conceito de negócio próprio. Quando o negócio esclareceu "contrato é por
  produto" e "oferta Hotmart é por hotmart_code", a PK teve que mudar com migração de dados.
- **Na reconstrução:** **toda entidade nasce com um ID surrogate opaco e estável**
  (UUID v7 ou similar), decidido antes da 1ª linha de código. Identificadores de origem
  (tag, `hotmart_code`, `offer.code`, `externalReference`) vão para uma **tabela de
  aliases/resolução** `origem_ref (entidade, tipo_ref, valor_ref, id_entidade)`,
  muitos-para-um, nunca como PK. Mudar a regra de resolução vira `INSERT`/`UPDATE` nessa
  tabela, não `ALTER TABLE`. Definir **antes**: "qual é a granularidade de negócio de
  Contrato / Oferta / Produto?" (ver Decisões em aberto).

### 4.2 Escala monetária mudou no meio (centavos → × 10000)

- **O quê:** quase tudo sempre foi × 10000, mas `Oferta.ticket`/`Contrato.ticket_total`
  ficaram em × 100 até a feature 010 (migração `0026` converteu).
- **Causa-raiz:** campo "digitado por humano via painel" foi tratado diferente de campo
  "extraído de API", sem uma regra escrita.
- **Na reconstrução:** **um único Value Object `Dinheiro { valor_inteiro, moeda }`**, escala
  fixa documentada (`× 10000`), usado em _todos_ os campos monetários, sem exceção.
  Conversão na borda (parser de cada integração e parser do painel). Proibido `float` para
  dinheiro em qualquer lugar. `moeda` nunca é opcional — default explícito `BRL` só na borda.

### 4.3 Formato inconsistente de `turma` entre dois caminhos de código

- **O quê:** a decodificação de tag gravava `"PCS48"` (produto+turma juntos); a curadoria
  via `ofertas.csv` gravava `"48"`. A exibição "Produto+Turma" duplicava o prefixo
  (`"PCSPCS48"`). Corrigido na origem + migração `0031`.
- **Causa-raiz:** dois caminhos escrevendo o mesmo campo com contratos implícitos
  diferentes, sem um ponto único de normalização.
- **Na reconstrução:** **um único normalizador por campo semântico**, com teste de
  propriedade "todo caminho de escrita produz o mesmo formato". `turma` guarda só o
  identificador da turma; "Produto + Turma" é **derivado na leitura** (`Produto.codigo + " " + turma`),
  nunca materializado.

### 4.4 `map_status` mistura vocabulário de API e de CSV no mesmo dicionário

- **O quê:** `_TMB_STATUS_MAP` tem `"aprovado"` (API), `"em dia"` (CSV, português),
  `"protestado"` (CSV) na mesma estrutura; `map_status` tenta valor exato, depois `.lower()`.
- **Causa-raiz:** o import via CSV (feature 009) trouxe um vocabulário novo e foi
  encaixado no mapa existente em vez de num adaptador próprio.
- **Na reconstrução:** **cada fonte (API de X, CSV de X) tem seu próprio adaptador**
  `status_origem -> StatusCanonico`, versionado e testado isoladamente. O núcleo só conhece
  o enum canônico. Status desconhecido → estado `REVISAR` explícito (não `Inativo`
  sobrecarregado).

### 4.5 Dois sistemas de status paralelos (`map_status` vs `esta_pago_efetivamente`)

- **O quê:** `status_mapping.py` responde "libera acesso?"; `status_financeiro.py` responde
  "entrou dinheiro?". Listas de status parcialmente sobrepostas, mantidas em 2 lugares.
- **Causa-raiz:** legítimo que sejam perguntas diferentes — mas a implementação duplicou o
  vocabulário de origem em vez de derivar as 2 respostas de **um** estado canônico.
- **Na reconstrução:** **um `StatusTransacaoCanonico`** rico (ex.: `PENDENTE`,
  `PAGO`, `EM_ATRASO`, `RECUSADO`, `ESTORNADO`, `CHARGEBACK`, `CANCELADO`, `DESCONHECIDO`).
  "Libera acesso?" e "conta como receita?" são **funções puras desse enum** (+ tolerância),
  cada uma numa linha. Vocabulário de origem aparece só nos adaptores de borda.

### 4.6 `nome_oferta` significa coisas diferentes por plataforma

- **O quê:** para Guru/TMB é (geralmente) a tag; para Hotmart é um código bruto
  (`offer.code` / "Código do preço"). Foi preciso adicionar `nome_oferta_resolvido`
  (`Oferta.nome_completo`) e uma coluna à parte só para a Hotmart.
- **Causa-raiz:** um campo com um nome, dois significados, dependendo da origem.
- **Na reconstrução:** separar em campos com semântica única:
  `codigo_oferta_origem` (chave de resolução, cru, nunca exibido),
  `rotulo_oferta_origem` (texto que a origem mandou, se houver),
  `oferta_id` (FK resolvida) e a exibição sempre vem de `Oferta` via a FK.

### 4.7 Pendência não resolvida: "Código do preço" da Hotmart ≠ `offer.code`

- **O quê:** só ~17% das vendas Hotmart batem com o catálogo por `offer.code`. Um fallback
  por `produto_origem` (id do produto → uma oferta daquele produto) levaria a ~88%, mas
  ficou **adiado** porque o `ofertas.csv` estava incompleto.
- **Na reconstrução:** decidir a **estratégia de resolução Hotmart** antes de importar
  catálogo: (a) resolver por `product_id` + janela de data como caminho primário, ou
  (b) exigir um catálogo completo de `price.code`. Ver Decisões em aberto.

### 4.8 Strings mágicas de placeholder (`"X0"`, `"00"`, `"X0"` evergreen)

- **O quê:** `TURMA_EVERGREEN = "X0"` (turma que não é turma), `estrategia = "Perpétuo" if turma == "00"`.
  Vivem num módulo sem deps só para evitar import circular.
- **Causa-raiz:** modelar "ausência de turma" como um valor sentinela de string em vez de
  um tipo.
- **Na reconstrução:** `turma` é **nullable** ou um enum `{ TURMA(n) | EVERGREEN | PERPETUO }`.
  "Evergreen" é uma propriedade da Oferta (`vendida_continuamente: bool`), não um valor de turma.

### 4.9 `_houve_mudanca` — atributo privado pendurado no objeto ORM

- **O quê:** `transacao._houve_mudanca = era_nova or session.is_modified(...)`, lido depois
  por `ingerir_transacao_isolado` para decidir parada antecipada do sync.
- **Causa-raiz:** o resultado da ingestão (mudou algo?) precisava atravessar 2 camadas e foi
  transportado como estado mutável no objeto de domínio.
- **Na reconstrução:** ingestão retorna um **resultado explícito**
  `ResultadoIngestao { transacao, foi_criada, campos_alterados: set[str] }`. O motor de sync
  consome esse objeto.

### 4.10 `commit()` no meio da ingestão para não perder o vínculo

- **O quê:** feature 008 descobriu que uma falha em `aplicar_aditivo` derrubava a sessão
  inteira e o vínculo Asaas↔Guru (já gravado) era descartado, porque `get_db_session` só
  commitava no fim da request. Solução: `commit()` explícito logo após o vínculo.
- **Causa-raiz:** pipeline de ingestão monolítico numa transação de banco, com etapas de
  confiabilidade e criticidade diferentes.
- **Na reconstrução:** **pipeline em etapas idempotentes e independentes**, cada uma com seu
  commit: (1) gravar evento cru; (2) upsert transação normalizada; (3) resolver vínculo;
  (4) resolver catálogo; (5) aplicar ao contrato. Uma etapa falha → as anteriores persistem
  → uma reprocessadora pega a etapa pendente. Ver 5.2 (event log).

### 4.11 `aplicar_aditivo` não é idempotente no caminho de webhook

- **O quê:** reenviar um webhook já processado **duplica** `ticket_total`/`ofertas_compradas`
  (bug pré-existente conhecido, sinalizado mas não corrigido). `ingerir_transacao_isolado`
  tem proteção; o caminho de webhook direto não.
- **Na reconstrução:** o aditivo é **derivado**, não incremental. `ticket_total` e
  `ofertas_compradas` são `SUM`/agregação sobre as transações vinculadas ao contrato
  (mesma lógica que `valor_recebido` já usa hoje) — reprocessar é inócuo por construção.

### 4.12 `id_cliente` virou nullable + limpeza retroativa de clientes

- **O quê:** vendas de afiliada não devem gerar Cliente; `Transacao.id_cliente` virou
  nullable (migração `0032`), e a mesma migração **apagou** clientes que só tinham venda de
  afiliada. `importar_afiliados_csv` repete essa limpeza a cada rodada.
- **Causa-raiz:** a detecção de "isto é venda de afiliada" foi adicionada _depois_ que o
  fluxo já criava Cliente incondicionalmente.
- **Na reconstrução:** **classificar o evento antes de qualquer efeito colateral.** Um
  evento tem um `tipo` (`VENDA_PROPRIA` | `VENDA_AFILIADA` | `COBRANCA_TERCEIRIZADA` …)
  decidido no início; cada tipo tem um handler que sabe exatamente o que criar.

### 4.13 Motor de sincronização refeito 2×

- **O quê:** feature 004 substituiu backfill único por "verificação de subida + varredura
  semanal + cron de reconciliação (3 mecanismos)". Feature 009 removeu **todos os 3** e fez
  tudo sob demanda, e ainda teve que consertar a semântica do checkpoint (resumir de
  checkpoint concluído perdia transação nova).
- **Causa-raiz:** "manter dados frescos" foi atacado com automação antes de o negócio
  decidir que **não quer** consultas automáticas de API (custo de requisição).
- **Na reconstrução:** decidir a **política de atualização** primeiro (ver Decisões). O
  design atual (webhook = primário; API = sob demanda, caminha de hoje para trás, para sem
  novidade) é bom — manter. O `checkpoint` só serve para retomar execução interrompida.

### 4.14 Detecção de encoding de CSV por heurística frágil

- **O quê:** a 1ª heurística (procurar `�` no texto decodificado) estava errada — TMB e Guru
  têm `�` genuíno no arquivo de origem. Corrigido para só cair em `cp1252` quando UTF-8
  lança exceção de verdade.
- **Na reconstrução:** import de CSV pede **encoding explícito** (ou detecta com uma lib
  dedicada tipo `charset-normalizer`), e valida o resultado contra um schema de colunas
  esperado antes de processar qualquer linha.

### 4.15 Outros pontos menores

- **`Contrato.ofertas_compradas`** (array denormalizado) **+** `Transacao.id_contrato` —
  histórico duplo mantido à mão. Na reconstrução: só a FK; a lista é uma _view_.
- **`codigos_hotmart` / `produtos_vinculados` / `bonus`** — arrays de string sem FK, difíceis
  de manter íntegros. Na reconstrução: tabelas de junção reais.
- **`Oferta` tem ~25 colunas** misturando identidade, decodificação de tag, curadoria e
  metadados de catálogo. Na reconstrução: separar `Oferta` (o quê se vende) de
  `OfertaCatalogo` (metadados curados: ticket, tempo_acesso, bônus, combo…).
- **`SyncEstado`** acumulou 8 campos de significado sutil (`ultima_tentativa_sucesso` vs
  `concluido_em` vs `sincronizado_ate` vs `checkpoint_em_andamento`). Na reconstrução:
  modelar como uma tabela de **execuções de sync** (`sync_run`: início, fim, resultado,
  janela coberta) + uma _view_ do estado atual.
- **`extrair_tag_oferta` vs `extrair_tag_de_texto_livre`** — duas funções quase iguais
  (ancorada vs não) porque a Asaas embute a tag no meio de `description`. OK manter, mas
  documentar como "1 decodificador, 2 localizadores".

---

## Parte 5 — Arquitetura-alvo da reconstrução

### 5.1 Princípios

1. **Modelar o domínio, não a origem.** Entidades e IDs são conceitos de negócio;
   representações de plataforma são detalhes de borda, resolvidos por tabelas de alias.
2. **Bordas finas, núcleo canônico.** Cada integração converte para/de um **modelo
   canônico** e só. Nenhuma regra de negócio conhece "Guru" ou "Asaas".
3. **Ingestão como log de eventos + projeções.** Evento cru imutável → projeções derivadas
   e reconstruíveis. Reprocessar é sempre seguro.
4. **Tudo que é agregado é derivado.** `ticket_total`, `valor_recebido`, `acesso_liberado`,
   estado de contrato: funções sobre os eventos, não contadores incrementais.
5. **Contextos delimitados** com contratos explícitos entre eles (eventos ou APIs
   internas), não um schema gigante compartilhado.
6. **Curadoria e ingestão nunca disputam um campo.** Campo curado e campo derivado são
   colunas/tabelas diferentes; a leitura decide a precedência.
7. **Escrever menos, derivar mais.** Manter a disciplina atual de superfície de escrita
   mínima.

### 5.2 Contextos delimitados (bounded contexts)

```
┌─────────────────┐   eventos de     ┌──────────────────┐
│  INGESTÃO       │  transação crus  │  FINANCEIRO       │
│  (adapters de   ├─────────────────►│  (ledger,        │
│   7 contas)     │                  │   reconciliação, │
└────────┬────────┘                  │   receita)       │
         │ evento normalizado                └────┬─────┘
         ▼                                        │
┌─────────────────┐      ┌──────────────────┐     │
│  CATÁLOGO       │◄─────┤  CONTRATOS/       │◄────┘
│  (Produto,      │ FK   │  ACESSO          │
│   Oferta,       │      │  (1 por          │
│   Lançamento)   │      │   cliente×produto)│
└─────────────────┘      └────────┬─────────┘
                                  │
┌───────────────────────────────────────────────────────┐
│  CLIENTE / CRM  (identidade, dedup, 360, pipeline)     │
└───────────────────────────────────────────────────────┘
                                  ▲
┌─────────────────┐               │
│  MARKETING      │───────────────┘  (leads, campanhas, atribuição)
└─────────────────┘

┌───────────────────────────────────────────────────────┐
│  CENTRAL DE CLIENTES  (read model / BFF: 360 + ações)  │
└───────────────────────────────────────────────────────┘
```

#### A. Ingestão

- **Responsabilidade:** falar com as 7 contas (webhook + API sob demanda + CSV) e produzir
  **um evento canônico** por fato, gravado imutável em `evento_origem`
  (`id`, `plataforma_origem`, `id_origem`, `tipo_origem`, `payload_bruto jsonb`,
  `recebido_em`, `hash`). Dedup por `(plataforma_origem, id_origem, hash)`.
- **Adapters:** `parse(payload|linha) -> EventoCanonico`. Um adapter por (plataforma × fonte).
  Testados contra fixtures reais. **Nunca** tocam o banco de negócio.
- **`EventoCanonico`** (dataclass): identidade da transação, dados do comprador,
  identificadores de oferta/produto de origem (crus), valores como `Dinheiro`, status de
  origem cru, timestamps, sinais de recorrência, e `classificacao` preliminar.
- **Projeção:** um _worker_ idempotente lê `evento_origem` pendentes e chama o pipeline
  (5.3). Falha numa etapa não bloqueia as outras nem os outros eventos.

#### B. Financeiro (ledger)

- **`transacao`** normalizada: 1 por `(plataforma_origem, id_origem)`. Campos financeiros +
  `status_canonico` + FK opcional para `oferta`, `contrato`, `cliente`, `transacao_vinculada`.
- **Vínculo Asaas↔Guru:** tabela `vinculo_transacao (id_guru, id_asaas, resolvido_em, origem_ref)`
  ou FK bidirecional — mas a **regra de receita** ("só a Guru soma") é uma função de leitura
  sobre o vínculo, não um efeito colateral de escrita.
- **Receita** é sempre uma **query** com filtro "pago de fato" + agrupamento por moeda +
  papel (própria/afiliada). Nunca um número materializado que pode divergir.
- **Reconciliação tardia** gera um registro em `alerta_reconciliacao` — nunca reverte nada.

#### C. Catálogo

- **`produto`** (id surrogate; `codigo` de 3 letras é um alias único; `nome`, `assinatura`
  curados).
- **`oferta`** (id surrogate; "o quê se vende": produto FK, turma nullable, subproduto,
  modelo de cobrança, flags). Aliases de origem (tag, `hotmart_code`, `offer.code`) em
  `oferta_origem_ref`.
- **`oferta_catalogo`** (1:1 opcional com `oferta`): `ticket: Dinheiro`, `preco_tabela: Dinheiro`
  (preço "cheio"/de referência, histórico e imutável por versão de oferta — necessário pra
  Central de Clientes calcular desconto/economia real, ver Parte 10.5.3), `tempo_acesso`,
  `bonus[]`, `combo`, `produtos_do_combo[]` (junção real), `lancamento`.
- **`janela_lancamento`** (produto, rótulo, início, fim) — resolve turma por data.
- **Precedência:** valor curado > valor decodificado da tag > null. Implementada na leitura
  (ou numa coluna `_curado` + coluna `_derivado`), nunca por sobrescrita destrutiva.

#### D. Contratos / Acesso

- **`contrato`**: 1 por `(cliente, produto)` (confirmar granularidade — ver Decisões).
  Campos **derivados** de `aditivo`s: `fim_acesso`, `status_canonico`, `acesso_liberado`,
  `ticket_total`, `valor_recebido`. Campos **curados**: `tolerancia_atraso`,
  `contrato_assinado`, ajuste manual de status (com marca de "ajustado manualmente em X").
- **`aditivo`** = projeção de `transacao` com FK para `contrato`. A "linha do tempo" do
  painel é `SELECT ... ORDER BY data`.
- Recalcular o contrato = rodar a função de fold sobre seus aditivos. Determinístico,
  idempotente, testável sem banco.

#### E. Cliente / CRM  _(inclui a frente nova)_

- **`pessoa`** (o antigo `Cliente`, renomeado): identidade + contatos + endereço +
  histórico de contatos secundários.
- **Identidade/dedup como serviço explícito e auditável:**
  `resolver_identidade(dados) -> { pessoa_id, confianca, criterio, candidatos[] }`.
  Merges geram registro em `merge_pessoa` (auditável, reversível).
- **CRM propriamente dito:**
  - `conta` (household / empresa) agrupando várias `pessoa`.
  - `interacao` (e-mail, call, ticket de suporte, WhatsApp, NPS) — timeline unificada.
  - `pipeline` / `oportunidade` (estágio, valor estimado, responsável, motivo de
    ganho/perda) — para vendas de alto ticket (mentorias, consultorias).
  - `tarefa` / `nota` ligadas a `pessoa`/`oportunidade`.
  - `tag` / `segmento` (dinâmico, por query salva).
- **Fonte de verdade de "quem é cliente":** deriva de Contratos + Transações (tem contrato
  ativo? já comprou? só lead?). Não duplicar esse estado — derivar.

#### F. Marketing  _(frente nova)_

- **`lead`** — pessoa em estágio pré-compra. Pode virar `pessoa`/`conta` na 1ª venda
  (mesma engine de identidade).
- **`campanha`** (canal, criativo, orçamento, janela) e **`fonte`** (UTM: source/medium/
  campaign/term/content).
- **`evento_marketing`** — captura de lead (formulário, isca digital), clique, abertura,
  webinar, presença em live. Idealmente também via o `evento_origem` genérico (mesma
  infra de ingestão: integrações com ferramenta de e-mail, Meta/Google Ads, landing pages).
- **Atribuição:** tabela `atribuicao (transacao_id, campanha_id, modelo, peso)` — calculada
  por um serviço (primeiro toque / último toque / linear), **derivada**, versionável.
- **Ligação com Financeiro:** a receita por campanha é um `JOIN` de `transacao` (pago de
  fato, por moeda) com `atribuicao`. CAC / ROAS / LTV por campanha viram queries.

#### G. Central de Clientes  _(frente nova — read model **e** portal do cliente)_

- **Não é um novo banco de dados.** É um **BFF / read model** que compõe, para uma
  `pessoa`/`conta`:
  - dados cadastrais + contatos (Cliente/CRM);
  - todos os contratos e estado de acesso (Contratos);
  - histórico de transações e receita total por moeda (Financeiro);
  - timeline de interações e tickets (CRM);
  - origem de marketing e campanhas (Marketing);
  - "próximas ações" (renovação próxima, inadimplência, garantia acabando).
- **Correção de escopo:** não é só uso interno da equipe. É a página que a **própria
  aluna acessa diretamente** — funciona como intranet/login da relação dela com a AEN:
  solicitação de exclusão LGPD, gestão de preferência de comunicação, ofertas
  personalizadas justificadas, histórico de contratos, e um painel de recomendações sobre
  o próprio negócio dela. Ver detalhamento completo na Parte 10.
- **Ações** que ela expõe (poucas, auditadas): abrir ticket, registrar interação, ajustar
  acesso manualmente, disparar cobrança, solicitar exclusão de dados, declarar vínculo
  histórico (CPF/CNPJ/e-mail adicional), editar preferência de comunicação — cada uma vira
  comando para o contexto dono (nunca escrita direta no banco de outro contexto).
- Implementável como _endpoints de composição_ (`GET /central/pessoa/{id}`) + _cache_
  materializado se performance exigir.

### 5.3 Pipeline de ingestão canônico (substitui `ingerir_transacao`)

Cada etapa: **idempotente**, **commit próprio**, **reprocessável**, resultado explícito.

| # | Etapa | Entrada | Saída | Se falhar |
| --- | --- | --- | --- | --- |
| 0 | **Registrar evento** | payload cru | `evento_origem` (imutável) | 5xx no webhook; origem reenvia |
| 1 | **Classificar** | `EventoCanonico` | `tipo` (venda própria / afiliada / cobrança terceirizada / reembolso / …) | marca `REVISAR`, não bloqueia |
| 2 | **Resolver pessoa** | dados do comprador + `tipo` | `pessoa_id` (ou `null` se afiliada e não existe) | usa `null`, segue |
| 3 | **Upsert transação** | `EventoCanonico` | `transacao` normalizada + `campos_alterados` | loga, marca evento com erro |
| 4 | **Resolver vínculo** | `transacao` (Asaas/Guru) | FK de vínculo | independente da 5 |
| 5 | **Resolver oferta** | `codigo_oferta_origem` + data | `oferta_id` (ou `null`) | independente da 6 |
| 6 | **Projetar no contrato** | `transacao` + `oferta` | `aditivo` + recálculo do `contrato` | reprocessável a qualquer hora |

Um evento com etapas 4–6 pendentes é retentável por um worker sem tocar as etapas 0–3.

### 5.4 Cross-cutting (decidir 1× no início, aplicar em todo lugar)

- **IDs:** UUID v7 (ou ULID) para toda PK. IDs de origem só em tabelas `*_origem_ref`.
- **Dinheiro:** `Dinheiro{valor_int, moeda}`, escala `× 10000`, nunca float, moeda sempre
  presente. Somas só entre a mesma moeda.
- **Tempo:** tudo `timestamptz` em UTC. Parser de borda tolera ISO / epoch s / epoch ms /
  sem timezone / lixo (→ null com log). Nunca naive.
- **Status:** `StatusTransacaoCanonico` (enum rico) + `StatusContratoCanonico`. Adaptadores
  de origem versionados (`status_map/{plataforma}/{fonte}.py`). Desconhecido → `REVISAR`.
- **Idempotência:** toda escrita derivada é `f(eventos) -> estado`, não `estado += delta`.
- **Auditoria:** `criado_em`/`atualizado_em` em tudo; tabelas `_audit` (ou `pgaudit` /
  triggers) para mudanças curadas e ajustes manuais.
- **Erros de ingestão:** `evento_origem.status ∈ {pendente, ok, erro, revisar}` +
  `erro_detalhe`. Um painel lista os `revisar`/`erro`. Nada é descartado silenciosamente
  (hoje `ingerir_transacao_isolado` engole exceção com log — manter o log, mas persistir o
  evento problemático para retrabalho).
- **Config/segredos:** `.env` por conta (como hoje). Nunca hard-coded. Webhook valida token.
- **Multi-conta:** `plataforma_origem` (enum de 7) é dimensão de primeira classe em toda
  query e índice.

### 5.5 O que **manter** do sistema atual (funciona bem)

- Superfície de escrita mínima e explícita (6 recursos) — ótima disciplina.
- Webhook como caminho primário; API só sob demanda com confirmação no backend.
- Dedup de cliente por prioridade documento→CNPJ→email→telefone, com histórico de
  secundários e tratamento de ambiguidade.
- Separação "status de acesso" vs "pago de fato" (mas derivar ambos de 1 enum — 4.5).
- `campos_editados_manualmente` como conceito (mas como coluna/tabela separada, não
  sobrescrita in-place — 4.15).
- Fórmula do aditivo (`max(fim vigente, data) + tempo_acesso`).
- Frontend: identidade visual, "7 contas 1 registro", linha do tempo de aditivos.
- Testes contra Postgres real com dados de produção.
- Processo speckit (constitution → specify → clarify → plan → tasks → implement) e o
  Princípio II ("clarificar antes de assumir").

---

## Parte 6 — Estratégia de migração / coexistência

1. **Não migrar dado direto de tabela p/ tabela.** O ativo real é o histórico de
   transações. Se possível, **re-ingerir** a partir dos payloads crus / exportações CSV
   das 7 contas para dentro do novo `evento_origem`, e deixar as projeções se reconstruírem.
   Isso valida o novo pipeline contra 100% do volume real de uma vez.
2. Se re-ingestão total não for viável: exportar `transacoes` + `clientes` atuais como
   "eventos legados" (`tipo_origem = 'migracao_v1'`) e alimentá-los pelo mesmo pipeline.
3. **Congelar** o sistema v1 (só leitura) durante o corte; rodar v2 em paralelo e comparar
   agregados-chave (receita por conta/mês/moeda, nº de contratos ativos, nº de clientes) —
   têm que bater ou a diferença tem que ser explicável.
4. Catálogo curado (Produto/Oferta, `campos_editados_manualmente`, CSVs Hotmart) **é**
   dado a migrar de verdade — exportar e reimportar pelos endpoints de curadoria da v2.
5. Frontend: pode ser reaproveitado incrementalmente (é desacoplado, consome API JWT).

---

## Parte 7 — Decisões em aberto (resolver ANTES de codificar)

Estas precisam de resposta do dono do produto (Princípio II). Sem elas, a reconstrução
repete os erros da Parte 4.

> **Status em 2026-09-01:** itens 1–4, 6 (parcial), 9 e 11 resolvidos nesta rodada, somados
> aos 5, 7, 8 e 10 já resolvidos antes. Resta em aberto: o **default do modelo de atribuição**
> de Marketing (item 6) e as decisões específicas de CRM da Parte 8.12 (provedor de WhatsApp
> API, critério de endereçamento de chamado, escopo de `conta`, retenção de conversas,
> volume esperado).

1. **Granularidade de Contrato.** ~~Hoje é `(cliente, produto)`. Isso está certo para o
   negócio, ou deveria ser `(conta/household, produto)` agora que CRM introduz `conta`?
   Renovação em turma diferente continua sendo o mesmo contrato?~~ **Resolvido (2026-09-01):**
   Contrato é o vínculo `(pessoa, produto)` — **não** muda para `(conta/household, produto)`.
   Toda compra do mesmo produto pela mesma pessoa é aditivo ao mesmo contrato (nunca um novo),
   classificada pelo estado de acesso na data do aditivo:
   - **Renovação:** a pessoa já teve acesso ao produto e **não tem mais** (acesso expirado).
   - **Prorrogação:** compra do mesmo produto enquanto o acesso **ainda está ativo**.
   O rótulo renovação/prorrogação é **derivado** do estado de acesso vigente na data do
   aditivo; a fórmula `fim_acesso = max(fim_acesso vigente, data do aditivo) + tempo_acesso`
   (Parte 3, regra #4) já cobre os dois casos sem ramificação.
2. **Granularidade de Oferta.** ~~É por `hotmart_code`? Por tag AEN? Por "turma de um
   produto"? O que acontece quando a mesma oferta real é vendida em 2 plataformas?~~
   **Resolvido (2026-09-01):** Oferta tem **ID surrogate opaco** como identidade (Princípio I).
   A **tag AEN** é a chave de busca/resolução (alias em `oferta_origem_ref`), combinada com a
   **`plataforma_origem`** — resolução por `(tag AEN, plataforma)`. A mesma oferta comercial
   vendida em 2 plataformas vira **2 registros de `oferta`** que compartilham a tag AEN mas se
   distinguem pela plataforma. (Confirmar no schema se `oferta_catalogo` — ticket, preço de
   tabela, bônus — é compartilhado entre as duas ou também por plataforma.)
3. **Resolução de oferta Hotmart.** ~~Caminho primário = `product_id` + janela de data
   (cobre ~88%), ou exigir catálogo completo de `price.code`? (ver 4.7)~~
   **Resolvido (2026-09-01):** exigir **catálogo completo de `price.code`**. A resolução de
   oferta Hotmart depende de um `ofertas.csv` completo e validado contra o schema de colunas
   esperado antes de processar qualquer linha; **não** há fallback por `product_id` + janela
   de data como caminho primário. Venda Hotmart sem `price.code` no catálogo → oferta fica
   `null` e o evento vai para a fila de `REVISAR` (Princípio II — nunca chuta).
4. **Política de atualização.** ~~Confirmar: webhook primário + API 100% sob demanda continua?
   Vale a pena reativar webhook da Hotmart (hoje só API)?~~ **Resolvido (2026-09-01):**
   mantém-se webhook como caminho primário + API 100% sob demanda com confirmação no backend
   (Princípio VIII). O **webhook da Hotmart será ativado**, mas **não na v1** — o adapter
   `hotmart/webhook` fica previsto na arquitetura e entra numa feature futura; até lá a
   Hotmart segue só por API sob demanda.
5. **Escopo de CRM na v1 da reconstrução.** ~~Mínimo viável = `interacao` + `tag` + `nota`?
   Ou já entra `pipeline`/`oportunidade`?~~ **Resolvido:** entra completo (`pipeline`/
   `oportunidade`, disparos, automação) — ver Parte 8. ~~Em aberto: há ferramenta externa de
   CRM/suporte a integrar (RD Station, HubSpot, Intercom, Zendesk…) ou é 100% built in-house?~~
   **Resolvido (2026-09-01):** CRM é **100% construído in-house**, sem ferramenta externa de
   CRM/suporte. Além disso, a **construção do CRM é priorizada** sobre os demais escopos —
   ordem de prioridade: **CRM > Financeiro > Marketing > Central de Clientes**.
6. **Escopo de Marketing.** ~~Quais fontes reais existem hoje (Meta Ads, Google Ads,
   ActiveCampaign/RD, landing pages)? Modelo de atribuição desejado?~~
   **Resolvido parcialmente (2026-09-01):** fontes reais = **Meta Ads, Google Ads, Mautic**
   (automação de marketing open-source, no lugar de ActiveCampaign/RD) e **landing pages**.
   O `evento_marketing` genérico (Parte 5.2‑F) integra essas 4 fontes. **Em aberto:** o
   default do modelo de atribuição (primeiro toque / último toque / linear / multi-toque) —
   a tabela `atribuicao` já suporta múltiplos modelos versionáveis; falta escolher o padrão.
7. **Central de Clientes.** ~~É só visualização 360, ou também executa ações...~~
   **Resolvido:** é portal auto-atendimento da própria aluna (não só uso interno), com
   ações auditadas — ver Parte 10. Uso interno **resolvido**: suporte, comercial, CS e
   marketing, com permissão granular via RBAC (Parte 8.2.1, 10.7).
8. **Identidade de pessoa.** ~~Merge automático ou sempre confirmação humana?~~ **Resolvido:**
   merge **automático/interno** usa o mesmo critério de dedup já definido no Financeiro
   (Parte 3, regra #10; Parte 5.2‑E, `resolver_identidade`) — identificador idêntico
   (documento → CNPJ → e-mail normalizado → telefone/WhatsApp), com ambiguidade descartando
   o critério em vez de escolher um candidato (mesma regra, não uma política nova). Só o
   merge **auto-declarado pela aluna** foge desse caminho automático e exige revisão 100%
   humana (regra Parte 10.2.3/10.6) — critério de risco (auto-relato de terceiro é mais
   suscetível a fraude do que identificador batendo igual nos dados de origem).
9. **Moeda.** ~~Quais moedas reais aparecem além de BRL? Precisa de conversão para uma moeda
   de relatório (com taxa de câmbio histórica) ou nunca se converte?~~
   **Resolvido (2026-09-01):** **nunca converter.** Cada moeda é registrada e somada
   separadamente (`dict[moeda, valor]`, Parte 3, regra #6) — não há moeda de relatório nem
   tabela de câmbio histórica. Relatórios que cruzam moedas mostram os valores lado a lado
   por moeda, nunca um total consolidado.
10. **Retenção de payload cru / PII / LGPD.** ~~Guardar `payload_bruto` para sempre é
    aceitável? Precisa de anonimização/expurgo? Como apagar uma pessoa mantendo os agregados
    financeiros?~~ **Resolvido:** pseudonimização de `pessoa` (remove/ofusca dados de
    identificação), mantendo `transacao` e agregados financeiros intactos — Financeiro
    preserva receita/contratos/histórico agregado sem reter PII da pessoa excluída. Fluxo de
    solicitação pela própria aluna definido na Parte 10.5.1; esta é a mecânica técnica de
    execução (substitui os itens 10 e 11 originais).
11. **Stack da reconstrução.** ~~Manter Python/FastAPI/SQLAlchemy/Postgres (recomendado —
    time já conhece, testes já existem)? Ou é oportunidade de trocar algo?~~
    **Resolvido (2026-09-01):** trocar para **Node.js + TypeScript + NestJS + Prisma**, sobre
    **PostgreSQL** (mantido). Racional do dono do produto: TypeScript ponta a ponta com o
    frontend facilita a manipulação futura; os módulos/DI do NestJS mapeiam bem os bounded
    contexts (Parte 5.2). O código e os ~329 testes Python da v1 **não são reaproveitados** —
    a validação da v2 vem da re-ingestão dos payloads crus / CSVs das 7 contas (Parte 6) e da
    comparação de agregados-chave contra a v1 congelada.

---

## Apêndice A — Matriz de campos por plataforma

Ver [`docs/mapeamento-campos-transacoes.md`](mapeamento-campos-transacoes.md) (parcialmente
desatualizada para TMB/Hotmart — as versões corretas estão em
`specs/004-sync-incremental/` e `specs/002-hotmart-integration/`). Resumo do que **não** é
nativo e precisa ser modelado como derivado/nullable:

- **Asaas:** não tem conceito de oferta/cupom/garantia (gateway puro). Cliente, parcelas e
  método vêm só de chamadas extras. `externalReference` = ponte para a Guru.
- **TMB:** sem conceito de assinatura; método de pagamento não exposto; data de vencimento
  não retornada. Webhook de Vendas tem payload **achatado** (`cliente` = nome em string).
  Webhook Financeiro é nível de parcela e só atualiza `status_financeiro`.
- **Guru:** mais rico (oferta, cupom, garantia, assinatura nativos). Datas em formatos
  variados (ISO, epoch, sem tz, placeholder não-parseável). Terceiriza cobrança p/ Asaas.
- **Hotmart:** sem webhook usado; OAuth2. `is_subscription` vem no payload de
  `/sales/history`. "Código do preço" ≠ `offer.code` (ver 4.7). Papel de afiliada.

## Apêndice B — Enum de status canônico sugerido

```
StatusTransacaoCanonico:
  PENDENTE          # aguardando pagamento (boleto/pix emitido) — LIBERA acesso, NÃO é receita
  PAGO             # confirmado/recebido — libera acesso E é receita
  EM_ATRASO        # vencido sem pagamento — não libera (salvo tolerância), não é receita
  RECUSADO         # cartão negado / falha — não libera, não é receita
  CANCELADO        # cancelado antes de pagar — idem
  ESTORNADO        # reembolso — remove acesso, estorna receita
  CHARGEBACK       # contestação — idem estorno + alerta
  DESCONHECIDO     # status de origem não mapeado — vai para fila de REVISÃO

# Funções puras derivadas:
libera_acesso(status, dias_atraso, tolerancia) -> bool
conta_como_receita(status) -> bool          # (o atual "pago de fato")
```

## Apêndice C — Árvore de contextos → módulos (sugestão)

```
src/
  ingestao/      adapters/{tmb,asaas,guru,hotmart}/  (webhook, csv, api)  + evento_origem + worker
  financeiro/    transacao, vinculo, receita (queries), reconciliacao
  catalogo/      produto, oferta, oferta_catalogo, janela_lancamento, resolucao
  contratos/     contrato, aditivo, fold (recalculo puro), acesso
  clientes/      pessoa, conta, identidade (dedup), merge
  crm/           interacao, oportunidade, pipeline, tarefa, nota, tag
  marketing/     lead, campanha, fonte, evento_marketing, atribuicao
  central/       composicao read-model + comandos
  core/          dinheiro, tempo, ids, status_canonico, auditoria, config
  api/           routers finos por contexto
  admin/         sync sob demanda, imports CSV, curadoria
```

---

_Última atualização: 2026-09-01. Baseado no estado do repositório na branch `main`
(`91cfa6d`), features `001`–`011` implementadas. Ver `CLAUDE.md` para o histórico
detalhado de cada feature e `.specify/memory/constitution.md` para os princípios de
governança._

---

# Parte 8 — CRM (frente nova)

## 8.1 Contexto de negócio

O CRM concentra a comunicação com as alunas via WhatsApp, a gestão comercial (pipeline de
vendas de alto ticket — mentorias, consultorias), automações de relacionamento e a visão
gerencial do time comercial. Não é um contexto isolado: ele é a superfície de trabalho
diária do time comercial e de atendimento, e depende de dados que nascem em outros
contextos (Financeiro, Marketing) para fazer sentido (ex.: um lead "esfriando" ou uma
oportunidade "ganha" só têm significado completo quando cruzados com status real de
pagamento).

Estende o bounded context **E. Cliente/CRM** já esboçado na Parte 5.2 — as entidades
`pessoa`, `interacao`, `pipeline`/`oportunidade`, `tarefa`/`nota`, `tag`/`segmento`
definidas ali são a base de dados deste CRM. Esta parte detalha as áreas funcionais,
adiciona as entidades que faltavam no esboço original (disparos, automação, FAQ/IA) e
resolve parte das perguntas deixadas na Parte 7, item 5.

## 8.2 Regras confirmadas (decisões já tomadas com o dono do produto)

1. **`Lead` é uma entidade única, sem "dono" de bounded context fixo.** Diferente do padrão
   dos demais contextos (cada um dono de suas entidades), o Lead é compartilhado entre CRM e
   Marketing. Quem pode criar/editar/visualizar Lead é resolvido por **permissão de acesso**
   (RBAC), não por fronteira arquitetural. Isso significa: uma única tabela `lead` (não uma
   por contexto), com política de permissão configurável no módulo Administração (8.8).
   Precisamos, ainda assim, decidir a **transição** Lead → `pessoa` (mesma engine de
   identidade/dedup do Financeiro, Parte 5.2‑E) no momento da 1ª venda.
2. **O CRM segue integralmente a mesma disciplina arquitetural do Financeiro** (Parte 5.1 e
   5.4), sem exceção:
   - IDs surrogate opacos (UUID v7) em toda entidade nova; identificadores externos (ex.:
     `wa_id` do WhatsApp) vão para tabela de alias, nunca como PK.
   - Todo valor monetário (ex.: `valor_estimado` de uma Oportunidade, ticket de disparo
     pago) usa o mesmo Value Object `Dinheiro{valor_int, moeda}`, escala ×10000. Proibido
     float.
   - **Toda métrica do Dashboard (8.6) é derivada — uma query sobre estado/eventos, nunca um
     contador incremental persistido.** Mesmo racional do item 4.11 do Financeiro: contador
     incremental diverge sob reprocessamento; agregação sobre eventos é idempotente por
     construção.
   - Idempotência: ações de automação (Workflow, 8.5) devem poder ser reprocessadas sem
     duplicar efeito (reenviar um disparo processado não pode duplicar envio).
3. **"Negócio ganho/perdido" no Pipeline é só estado do processo comercial — não tem efeito
   automático sobre Contrato/acesso.** Contrato nasce exclusivamente de transação paga
   (Parte 3, regra #13 do Financeiro). Marcar uma oportunidade como "ganha" no CRM **não**
   cria, libera nem antecipa Contrato. O vínculo correto é o inverso: quando uma transação
   paga chega e resolve num Contrato, o CRM **observa** esse evento (via `EventoCanonico` /
   projeção, não polling) e pode, por regra de Workflow, marcar a oportunidade correspondente
   como ganha automaticamente — nunca o caminho contrário.

## 8.3 Glossário adicional do CRM

| Termo | Definição |
| --- | --- |
| **Lead** | Pessoa em estágio pré-compra. Entidade compartilhada (ver 8.2.1). Vira `pessoa` na 1ª venda, pela mesma engine de identidade do Financeiro. |
| **Oportunidade** | Ocorrência de venda em potencial dentro de um `pipeline`. Tem estágio, `valor_estimado: Dinheiro`, responsável, motivo de ganho/perda. Não confundir com Contrato (Financeiro) — ver 8.2.3. |
| **Interação** | Registro de contato com uma `pessoa`/`lead` (mensagem de WhatsApp, nota, ligação). Timeline unificada, já prevista em 5.2‑E. |
| **Disparo** | Envio em massa de mensagens de WhatsApp para uma lista/segmento. Gera 1 `execucao_disparo` + N `mensagem_enviada`. |
| **Template** | Modelo de mensagem aprovado pela Meta, reutilizável em Chat ou Disparo. |
| **Janela de atendimento** | Janela de 24h da API do WhatsApp em que é permitido responder livremente (fora dela, só com template aprovado). |
| **Fluxo de automação** | Sequência de blocos (gatilho → condição → ação) do Workflow. Versão publicada é imutável; editar gera nova versão. |
| **FAQ item** | Par pergunta/resposta, escopado por produto e opcionalmente por lançamento (com condições exclusivas). |
| **Sugestão de IA** | Saída não-persistente e não-autoritativa da IA (resposta sugerida, campo personalizado sugerido) — sempre passa por confirmação humana antes de virar dado ou mensagem enviada. Segue o ciclo de governança de 3 etapas formalizado na Parte 10.6. |

## 8.4 Modelo de dados — extensão do bounded context CRM (5.2‑E)

Entidades já esboçadas na Parte 5.2‑E (`pessoa`, `conta`, `interacao`, `pipeline`,
`oportunidade`, `tarefa`, `nota`, `tag`) permanecem. Este escopo adiciona:

```
lead                    (compartilhada com Marketing; vira `pessoa` na conversão)
faq_item                (produto FK nullable, campanha FK nullable — ver definição
                          completa e regra de exclusividade por lançamento na Parte 9.4)
sugestao_ia             (origem: mensagem_id, tipo: resposta|campo_personalizado, aceita: bool)
template_whatsapp       (nome Meta, categoria, corpo, status_aprovacao)
execucao_disparo        (template FK, segmento/lista, agendado_para, status)
mensagem_enviada        (execucao_disparo FK opcional [null se veio do Chat], interacao FK, status_entrega)
fluxo_automacao         (versão, gatilho, blocos jsonb, publicado_em)
execucao_fluxo          (fluxo FK, trigger_evento, status, log_passos)
```

`conta` (household/empresa) — **decisão em aberto** (8.9): mantém no modelo mas pode ficar
fora do MVP se a base for majoritariamente pessoa física.

## 8.5 Chat ao Vivo (WhatsApp)

**Objetivo:** atendimento em tempo real com as alunas via WhatsApp, com apoio de IA.

**FAQ e IA**
- FAQ por produto; FAQ direcionada por lançamento (condições exclusivas)
- IA busca resposta na FAQ ao selecionar a pergunta da aluna e sugere forma de responder
  (`sugestao_ia`, nunca envia sozinha — precisa de confirmação humana)
- IA identifica múltiplas perguntas numa mensagem e propõe respostas separadas
- IA gera campos personalizados a partir da mensagem selecionada (reaproveitamento do
  projeto Noctua) — grava como `sugestao_ia`, não escreve direto no cadastro
- Versionamento da FAQ (histórico de alterações, quem editou, quando)
- Feedback loop: atendente marca se a sugestão da IA foi útil

**Gestão do atendimento**
- Negócio ganho/perdido, com motivo (ver regra 8.2.3 — não afeta Contrato)
- Endereçamento a um integrante do time quando um chamado é aberto — critério a definir
  (8.9): aleatório puro ou por carga/disponibilidade
- Fila de atendimento com priorização; transferência de conversa com contexto preservado
- Notas internas na conversa; tags/categorização
- Avaliação pós-atendimento (CSAT)
- Horário de atendimento configurável, com resposta automática fora do expediente
- SLA de primeira resposta, com alerta de estouro

**Templates e compliance**
- Criação de templates pela Meta; alerta de janela de atendimento aberta/fechada
- Gestão de opt-out/descadastro (obrigatório por LGPD)

**Observabilidade**
- Log de erros robusto e claro
- Log de auditoria: quem respondeu o quê, quando, com ou sem apoio da IA

## 8.6 Disparos (WhatsApp)

**Objetivo:** disparos em massa segmentados, por importação de CSV ou filtro na plataforma.

- Filtragem minuciosa para segmentação; geração de templates da Meta
- Log de erros robusto; export de resultados; visualização geral dos disparos
- Agendamento de disparos; throttling para preservar qualidade do número junto à Meta
- Verificação de quality rating visível no painel
- Testes A/B de mensagens; deduplicação automática de contatos antes do envio
- Respeito automático à lista de opt-out (integrado ao 8.5)

## 8.7 Pipeline

**Objetivo:** pipelines claros, automatizados, com fluxo inteligente.

- Criação de pipelines independentes; organização clara (etapas configuráveis)
- Visualização de presença em múltiplos pipelines simultâneos
- Export de métricas e fluxo dos leads
- Geração de leads e contatos (respeitando 8.2.1 — entidade `lead` compartilhada)
- Campos personalizados das alunas
- Alerta de leads esfriando
- Lead scoring automático; atribuição automática (round robin ou por regra)
- SLA por etapa, com alerta de estouro
- Histórico/auditoria de mudanças de etapa (quem moveu, quando, de onde para onde)
- Oportunidade observa (não escreve) status de pagamento vindo do Financeiro
- Leads podem nascer de eventos de campanha vindos de Marketing

## 8.8 Workflow

**Objetivo:** automações e fluxos em blocos customizáveis, fáceis de configurar.

- Disparos reativos e programados
- Mudança de posição do lead no pipeline por contexto/reação
- Biblioteca de automações prontas (templates de fluxo)
- Condições compostas (E/OU); ambiente de teste/simulação antes de publicar
- Versionamento de fluxos (publicar gera nova versão imutável, nunca edita em produção)
- Triggers por eventos externos (ex.: pagamento aprovado no Financeiro, inscrição em
  lançamento) — consumidos como projeção do `evento_origem` canônico (5.2‑A), nunca por
  polling direto no banco do Financeiro

## 8.9 Dashboard

**Objetivo:** visualização de todas as funções e resultados, com filtros por produto,
lançamento e movimentação de pipeline. Toda métrica aqui é **derivada** (regra 8.2.2).

- Gráficos; benchmarks; correlação; rank por integrante do comercial
- Filtragem por data/período; dashboards configuráveis por usuário/perfil
- Exportação de relatórios (PDF/Excel)
- Alertas automáticos ao atingir/não atingir metas
- Funil de conversão visual
- Métricas de qualidade de atendimento (tempo médio de resposta, CSAT, taxa de resolução)

## 8.10 Tarefas

**Objetivo:** gerenciador de tarefas do time, pessoal e geral (criado pelo administrador).

- Checklists; agenda; cronômetro por tarefa; gamificação; dashboard de resultados
- Notificações e lembretes
- Delegação e reatribuição; dependência entre tarefas
- Geração automática de tarefas a partir de eventos do Pipeline/Workflow

## 8.11 Administração

**Objetivo:** controle geral pelo administrador — direcionamento e realocação de tarefas,
e ponto único de **gestão de acesso** (referenciado na regra 8.2.1 para a entidade Lead).

- Perfis de acesso e permissões granulares (RBAC) — inclui a regra de quem cria/edita/vê
  `lead`, prevista em 8.2.1
- Log de auditoria de ações administrativas
- Gestão de times/squads dentro do comercial
- Gestão de integrações (API keys, webhooks, conexões com Financeiro/Marketing/Central do
  Cliente)
- Configuração de horários de atendimento e feriados

## 8.12 Decisões em aberto específicas do CRM

1. **Transição Lead → Pessoa.** No momento da 1ª venda, o Lead vira `pessoa` pela mesma
   engine de identidade do Financeiro (Parte 5.2‑E). Precisa decidir: o registro de Lead é
   arquivado/linkado, ou os dados migram fisicamente?
2. **Provedor de WhatsApp Business API.** Cloud API oficial da Meta direto, ou via BSP
   (Twilio, Take Blip, Zenvia, 360dialog…)? Isso muda custo, fluxo de aprovação de template
   e limites de throughput dos Disparos.
3. **Critério de endereçamento de chamado (8.5).** Aleatório puro ou por
   carga/disponibilidade do atendente?
4. **Escopo de `conta` (household/empresa) na v1.** Entra desde já ou fica para depois,
   dado que a base é majoritariamente pessoa física?
5. **Retenção e anonimização de conversas de WhatsApp (LGPD).** Aplicar a mesma política
   pendente de definição para `payload_bruto` no Financeiro (Parte 7, itens 10 e 11)?
   Conversa de WhatsApp tem PII (nome, às vezes CPF, telefone).
6. **Central de Clientes só lê `interacao`/`tarefa`/`nota` do CRM (read model puro,
   Parte 5.2‑G), nunca escreve histórico de atendimento por conta própria — confirmar.**
7. **Ferramenta externa de CRM/suporte.** Alguma integração com RD Station, HubSpot,
   Intercom, Zendesk, ou é 100% built in-house? (herdado da Parte 7, item 5)
8. **Volume esperado** de mensagens/atendimentos simultâneos e número de atendentes, para
   dimensionar fila de atendimento e infraestrutura de disparo.

---

# Parte 9 — Marketing (frente nova)

## 9.1 Contexto de negócio

Marketing controla a estratégia e execução de **lançamentos** (campanhas com início/fim,
ex.: `PCS49 — Agosto de Ouro 2026`) e do **perpétuo** (vendas contínuas fora de janela de
lançamento). Hoje isso vive numa planilha por lançamento, com ~26 abas, recriada (copiada)
a cada campanha — o que perde histórico, força comparação manual entre lançamentos (a aba
`Analise de metas` existe só pra isso) e não avisa ninguém quando algo muda.

**Pedido central do dono do produto:** o Marketing do Pandora funciona como um **"git do
marketing"** — toda alteração feita por qualquer time é: (1) versionada de forma imutável,
(2) comparável campo a campo contra a versão anterior com diff visual (vermelho = removido,
verde = adicionado), e (3) notificada automaticamente às outras equipes via Slack. O
objetivo declarado é conseguir ver **como a campanha se moldou ao longo do tempo**, tanto
para lançamentos quanto para perpétuo.

Isso não é um contexto solto — reaproveita o mesmo princípio que já rege o resto do sistema
(Parte 5.1, item 3: "ingestão como log de eventos + projeções", e a disciplina de auditoria
da Parte 5.4). A diferença é que aqui quem gera o "evento" é uma pessoa editando um campo no
painel, não um webhook externo.

## 9.2 Regras confirmadas

1. **Granularidade do diff é textual, não só "o campo mudou".** Cada alteração salva
   `valor_anterior` e `valor_novo` **lado a lado, por campo**, não um payload genérico por
   versão. A UI de comparação roda um diff de texto (nível palavra/caractere) entre os dois
   valores e renderiza: trecho removido em vermelho (riscado) na versão antiga, trecho
   adicionado em verde na versão nova — mesmo padrão visual de um diff de código
   (ex.: GitHub PR). Vale pra qualquer campo de texto (copy de e-mail, FAQ, briefing de
   criativo, cronograma); campos numéricos/data mostram simplesmente "de X para Y".
2. **Nada é sobrescrito.** Toda escrita gera uma nova `versao_campo`; a versão anterior
   nunca é apagada nem editada. "Estado atual" é sempre a versão mais recente — mesmo
   princípio de "tudo que é agregado é derivado" da Parte 5.1.
3. **Autoria e timestamp obrigatórios em toda versão** — não dá pra ter "diff sem saber
   quem mudou", que é o objetivo declarado (rastrear como a campanha se moldou e por quem).
4. **Cada campanha nasce isolada.** Um lançamento (`PCS49`) não herda dados de um
   perpétuo/template comum — começa do zero, sem `campanha.baseada_em`. Comparar
   lançamentos entre si (ex.: `Analise de metas`) continua possível porque é uma query
   sobre o histórico de várias campanhas independentes, não porque compartilham dado vivo.
5. **Notificação ao Slack dispara só quando o artefato é marcado como concluído/publicado**
   — não a cada edição. Isso implica um estado `rascunho` → `publicado` por artefato (ou
   por versão): o histórico de `versao_campo` continua registrando toda alteração
   granular, mas o evento que sai para o Slack é filtrado pelo momento de publicação.
6. **RBAC único.** A mesma lógica de permissões definida na Administração do CRM
   (Parte 8.2.1, 8.11) controla quem edita o quê também no Marketing — não há um sistema de
   permissão separado por contexto.
7. **"Limpar escopo" nunca é um `DELETE` de verdade.** Reconcilia o pedido de "resetar uma
   campanha pra começar do zero" com a regra 9.2.2 (nada é sobrescrito): limpar só pode
   afetar artefatos em `rascunho` — versões já `publicado` são imutáveis e permanecem no
   histórico para sempre. O reset **arquiva** (não apaga) o rascunho atual e abre um novo,
   registrado como sua própria `versao_campo` (quem limpou, quando). Ação exige confirmação
   explícita (ex.: digitar o nome da campanha) e permissão elevada de RBAC — fácil de fazer
   de propósito, difícil de fazer sem querer.

## 9.3 Glossário

| Termo | Definição |
| --- | --- |
| **Campanha** | Uma instância de lançamento (`PCS49`), o perpétuo (contínuo, sem data de fim), ou um **evento** (ex.: Congresso AEN anual). Agrupa todos os artefatos versionados daquele período. |
| **Artefato** | Qualquer unidade versionável dentro de uma campanha: um e-mail, um disparo, um item de FAQ, uma fase do cronograma, uma oferta, um criativo, um pop-up, uma planilha livre. |
| **Versão de campo** | Registro imutável `{artefato, campo, valor_anterior, valor_novo, autor, criado_em}`. É a unidade mínima do "commit". |
| **Diff** | Renderização visual (vermelho/verde) da comparação entre duas versões de um mesmo campo ou artefato. |
| **Tratamento de cliente** | Regra de comunicação por segmento de lead (ex.: "conheceu agora", "já tem Produto X", "já tem Produto Y") — define qual copy/fluxo cada segmento recebe. Ver 9.4 e 9.7. |
| **Workflow de Marketing** | Automação que reage a eventos (data do cronograma, mudança de status de transação vinda do Financeiro, entrada de lead) e dispara ação (e-mail, disparo, notificação). |
| **FAQ por produto** | Item de FAQ ligado a um Produto (Financeiro), persiste entre lançamentos — a mesma entidade `faq_item` compartilhada com o CRM (Parte 8.4). |
| **FAQ por lançamento** | Item de FAQ ligado a uma `campanha` específica, com condições exclusivas daquele lançamento. Não é herdado por lançamentos futuros (regra 9.2.4) — nasce do zero a cada campanha, salvo uso do recurso de duplicação (9.8.3). |
| **Planilha livre** | Artefato tipo tabela dentro de uma campanha, com colunas configuráveis (template de contatos, tabela genérica, gráfico, ou 100% customizada), para necessidades operacionais que não têm um formato fixo previsto no sistema. |

## 9.4 Modelo de dados

```
campanha            (nome/código, tipo: lancamento|perpetuo|evento, data_inicio, data_fim)
                      -- isolada por construção; sem FK para outra campanha (regra 9.2.4)
artefato             (campanha FK, tipo: email|disparo|criativo|oferta|faq_item|
                      fase_cronograma|popup|pagina|planilha_livre, dados atuais,
                      status: rascunho|publicado)
faq_item             (produto FK nullable, campanha FK nullable — exatamente um dos dois
                      preenchido: FAQ por produto persiste entre lançamentos, FAQ por
                      lançamento é exclusiva daquela campanha, ver glossário)
planilha_livre       (artefato FK, template: contatos|tabela_generica|grafico|custom,
                      colunas jsonb, linhas jsonb)
versao_campo         (artefato FK, campo — ou célula, no caso de planilha_livre —,
                      valor_anterior, valor_novo, autor, criado_em)
notificacao_slack    (artefato FK, canal, enviado_em, gatilho: "publicado")
                      -- disparada só na transição rascunho → publicado (regra 9.2.5)
lead                 (mesma entidade compartilhada definida na Parte 8.2.1 — Marketing
                      cria/edita conforme permissão RBAC única, regra 9.2.6)
tratamento_cliente   (segmento, critério de entrada, copy/fluxo associado — liga a
                      Workflow de Marketing e a `tag`/`segmento` do CRM, Parte 5.2‑E)
```

**Pontos de integração — não duplicar dado que já existe em outro contexto:**
- **Oferta** (preço, janela, parcelamento): Marketing **propõe/planeja** aqui, mas o dado
  curado que efetivamente resolve transações é o `oferta_catalogo` do Financeiro
  (Parte 5.2‑C). Publicar uma oferta no Marketing deveria gerar/atualizar o registro
  correspondente lá — uma fonte de verdade, não duas.
- **Recuperação de venda / inadimplência** (`Dados Rec. Venda`, `Inadimplentes` na planilha
  atual): não é dado próprio do Marketing. É um `EventoCanonico`/status de transação
  (`EM_ATRASO`) que já existe no Financeiro — Marketing **observa** esse evento e dispara
  campanha de recuperação (Workflow), mesmo padrão "observa, não escreve" da regra 8.2.3.
- **Log de atendimento** (`Mapeamento de Suporte` na planilha atual): é `interacao`/ticket,
  já modelado no CRM (Parte 8.5) e exposto pela Central de Clientes (5.2‑G). Não deveria
  virar uma aba própria do Marketing.
- **Escala do time de SAC** (parte da aba `Escala`): pertence à Administração do CRM
  (Parte 8.11), não ao Marketing — a escala do time de Marketing propriamente dito, sim.
- **Liberação manual de acesso** (`Liberação de desafios`): é ajuste manual de Contrato, já
  com regra e endpoint definidos no Financeiro (Parte 3, regra #13). Não deveria ser lista
  solta.

## 9.5 Áreas funcionais

**Dashboard** — vendas totais, novas alunas, renovação, faturamento, cancelamentos; métricas
sempre derivadas por query (mesmo princípio do Dashboard do CRM, 8.9), nunca contador
persistido, para poder recalcular corretamente ao comparar campanhas antigas.

**Coleta de leads** — leads/seguidores por dia, CPL pago vs geral, evolução dentro da janela
de captação. Alimenta `lead` (entidade compartilhada, 8.2.1).

**Planejamento** — cronograma de fases (ex.: Antecipação, Aquecimento, Captação, Vendas,
Renovação), com data no ar, data limite interna, marco e status por fase. Cada fase é um
`artefato` versionado — dá pra ver exatamente quando uma data de fase mudou e por quem.

**Tarefas** — equivalente ao Tarefas do CRM (8.10), mas escopado a uma campanha; herda
delegação, dependência entre tarefas e geração automática a partir de eventos do cronograma.

**Tratamento de clientes** — regras de comunicação por segmento (recém-conhecido, já tem
Produto X, já tem Produto Y, inadimplente, vitalício etc.). Cada segmento define qual
copy/oferta/fluxo o lead recebe. Liga diretamente ao Workflow (dispara a régua certa por
segmento) e ao `tag`/`segmento` já previsto no CRM — mesma entidade, não duplicar.

**Workflow** — motor de automação de Marketing: dispara e-mail/disparo por data agendada,
por entrada em segmento (`tratamento_cliente`), ou por evento externo (transação paga,
transação em atraso, vindos do Financeiro). Mesmos princípios do Workflow do CRM (8.8):
versionado, testável antes de publicar, consumindo `evento_origem` canônico — nunca
polling direto no banco de outro contexto.

**E-mails** — sequência de e-mails por fase/momento, com métricas de abertura/clique/
cancelamento por variante (double/single). Cada e-mail é um `artefato`; o diff mostra
exatamente o que mudou no assunto/corpo entre uma versão e outra da campanha.

**Disparos** — disparos de WhatsApp em nível de campanha (individual, grupo, canal), por
fase, com copy e status. Distinto do Disparos do CRM (8.6, que é operacional/segmentado por
contato) — aqui é o planejamento da régua da campanha; a execução real pode reaproveitar o
mesmo motor de envio do CRM.

**Criativos** — peça por formato (feed/story), responsável, fase, status de copy/arte,
métrica de CPL por criativo. Também versionado: dá pra ver a evolução de uma peça entre
rascunho e aprovação.

**Páginas** — landing pages de captura, página de obrigado, página de vendas — hoje é só uma
lista de links; propor versionar o conteúdo da página (não só a URL), já que copy de página
muda bastante entre lançamentos.

**Renovação** — tabela de ofertas por status de acesso (vitalício/ativo/inativo), com preço
por lote/semana. Reaproveita `oferta_catalogo` do Financeiro (ver 9.4) para não duplicar
preço/janela em dois lugares.

**Escalas** — escala de trabalho do time de Marketing durante semana de lançamento (a parte
de SAC vai para Administração do CRM, ver 9.4).

**Metas** — comparação histórica entre campanhas (investimento, leads captados/pagos, CPL,
conversão, vendas, faturamento). Com o versionamento de 9.2, esse comparativo deixa de ser
manual (hoje é uma tabela preenchida à mão) e vira uma query sobre `campanha` + métricas
derivadas do Financeiro.

**FAQ** — dois escopos, como já declarado no CRM (Parte 8): **FAQ por produto** (persiste
entre lançamentos, mesma entidade compartilhada com o CRM) e **FAQ por lançamento**
(individual e exclusiva de cada campanha — nasce do zero a cada lançamento, sem herdar
respostas do lançamento anterior, salvo duplicação manual via 9.8.3).

**Pop-up** — copy de pop-ups de onboarding/checkout, com data de início/fim. Versionado
como qualquer outro artefato de copy.

**Eventos** — tipo de campanha (`campanha.tipo = evento`), para lançamentos como o Congresso
AEN anual. Reaproveita toda a estrutura de campanha (Planejamento, Tarefas, Workflow), e usa
Planilha Livre (abaixo) com template de contatos para o que hoje são as abas
`Contatos Palestrantes` e `Atividades Congresso`.

**Planilha livre** — dentro de qualquer campanha (lançamento, perpétuo ou evento), permite
criar uma tabela com colunas configuráveis — template de contatos, tabela genérica, gráfico,
ou 100% customizada — para operação que não tem formato fixo previsto no sistema. Cobre o
caso de abas hoje soltas na planilha (ex.: `PCS Passo 2`, `MOL06`, `Parede 10k`) sem exigir
uma feature dedicada para cada uma. Cada célula alterada também gera `versao_campo` — mesma
disciplina de diff do resto do Marketing, aplicada em nível de célula.

**Mapeamentos** — controle de quem respondeu mensagens de suporte **sobre aquele
lançamento** especificamente. Não é dado próprio do Marketing: é uma **view somente-leitura**
filtrando `interacao` (CRM, Parte 8.4) pela `campanha` em questão — mesmo padrão de
"observa, não escreve" já usado para inadimplência (9.4). Se a interação em si precisar ser
registrada, é feita no Chat ao Vivo do CRM; aqui só se compõe o recorte por lançamento.

**Gestão da campanha** — duas ações administrativas sobre uma `campanha`:
- **Duplicar:** cria uma nova campanha copiando artefatos de uma anterior como ponto de
  partida (rascunho independente — sem vínculo vivo, respeitando a regra 9.2.4 de
  isolamento). Útil pra não recomeçar FAQ, escala e criativos-base do zero a cada vez.
- **Limpar escopo:** reseta o rascunho atual de uma campanha para começar do zero. Sujeito à
  regra 9.2.7 — nunca apaga versão já publicada, exige confirmação explícita e permissão
  elevada de RBAC.

## 9.6 O que fica fora do escopo de Marketing (mover para outro contexto, ou não modelar)

- `Mapeamento de Suporte` → CRM / Central de Clientes (interação/ticket)
- `Inadimplentes`, `Dados Rec. Venda` → Financeiro observa; Marketing só reage via Workflow
- `Liberação de desafios` → Financeiro (ajuste manual de Contrato)
- Escala do SAC (dentro da aba `Escala`) → Administração do CRM
- `Histórico Hotmart` → fora de escopo por decisão do dono do produto (redundante com a
  sincronização Hotmart que o Financeiro já faz, Parte 1.1)

## 9.7 Tratamento de clientes — detalhamento

Como você descreveu, essa área define **quem recebe o quê** por estágio de relacionamento.
Proposta de segmentos mínimos (a validar):

| Segmento | Critério de entrada | Exemplo de tratamento |
| --- | --- | --- |
| Recém-conhecido | Lead sem nenhuma compra | Régua de aquecimento/educação |
| **Cliente novo — pós-compra (Onboarding)** | Contrato recém-criado (transação paga, evento vindo do Financeiro) | Régua de boas-vindas: cadência e copy próprias por produto |
| Cliente de Produto X | Tem contrato ativo em X | Oferta de upsell/crossell específica |
| Cliente de Produto Y | Tem contrato ativo em Y | Régua diferente, sem repetir oferta de X |
| Ex-cliente / acesso expirado | Contrato inativo | Régua de reativação |
| Inadimplente | Transação em atraso (Financeiro) | Régua de recuperação, sem oferta nova |

Cada linha desta tabela é, na prática, uma regra de `tratamento_cliente` que aciona um fluxo
no Workflow — e o critério de entrada, sempre que possível, é **derivado** do estado real em
Financeiro/Contratos, nunca uma marcação manual solta.

**Onboarding não é uma entidade nova** — é exatamente esse mecanismo (`tratamento_cliente` +
Workflow) aplicado ao segmento "pós-compra". O gatilho é o evento de Contrato criado
(Financeiro); disparos, cadência e copy de cada etapa da jornada de boas-vindas são
configurados como qualquer outro fluxo do Workflow (Parte 9.5), versionados e testáveis
antes de publicar, do mesmo jeito que qualquer régua de recuperação ou upsell.

## 9.8 Decisões em aberto específicas do Marketing

Todas as decisões levantadas foram resolvidas — incorporadas nas regras 9.2.4–9.2.7 e nas
áreas Eventos, FAQ, Planilha Livre, Mapeamentos e Gestão da campanha (9.5/9.7). `PCS Passo 2`,
`MOL06` e `Parede 10k` ficam cobertas pelo mecanismo genérico de Planilha Livre; avise se
alguma delas precisar de um template além de contatos/tabela genérica/gráfico.

Nenhum item pendente por enquanto — o desenho de Marketing deve ficar mais detalhado só
quando entrarmos na modelagem de schema de verdade (Parte 7 do documento, "Decisões em
aberto" gerais do sistema).

---

# Parte 10 — Central de Clientes (frente nova)

## 10.1 Contexto de negócio

A Central de Clientes é, ao mesmo tempo, um **read model** (BFF que compõe dado de todos os
outros contextos) e o **portal que a própria aluna acessa diretamente** — não é uma
ferramenta de uso só interno (corrige o framing original da Parte 5.2‑G). Funciona como uma
"intranet da relação dela com a AEN": de lá ela solicita exclusão de dados (LGPD), entende
por que tem acesso a determinado preço, revisa o histórico completo de contratos, gerencia
suas preferências de comunicação e recebe recomendações sobre o próprio negócio.

Regra geral de toda esta parte: a Central de Clientes **nunca é dona de dado financeiro,
comercial ou de identidade** — ela compõe e explica o que já existe em Financeiro/CRM/
Marketing, e as poucas ações que expõe viram comando para o contexto dono (mesmo padrão já
usado em todo o documento).

## 10.2 Regras confirmadas

1. **Renomeação de "Oportunidade".** O conceito de "oportunidade de melhoria no negócio da
   aluna" (distinto da `Oportunidade` de venda do Pipeline, Parte 8.3) chama-se
   **`Recomendação`** neste documento — evita colisão de nome entre CRM e Central de
   Clientes.
2. **"Painel do Ultra" é fora de escopo.** É um produto separado (dashboard de gestão do
   consultório dentro do Smart Ultra), não faz parte do backend Pandora. Só o **princípio de
   design** (10.6.4) vale para os dois produtos — a implementação do painel do Ultra em si
   não é modelada aqui.
3. **Vínculo histórico auto-declarado nunca passa por sugestão de IA.** Diferente da regra
   geral de Sugestão de IA (CRM, Parte 8), quando é a própria aluna quem declara um CPF/CNPJ/
   e-mail adicional, a validação é **sempre 100% humana** — sem IA sugerindo aprovação, por
   causa do risco de fraude (gerar vínculo falso pra ganhar desconto). Ver exceção explícita
   em 10.6.

## 10.3 Glossário

| Termo | Definição |
| --- | --- |
| **Solicitação de exclusão** | Pedido LGPD da aluna para apagar seus dados. Mostra o que existe, como será apagado, como será tratado dali em diante, e avisa que é irreversível antes de confirmar. |
| **Preferência de comunicação** | Consentimento granular por canal (e-mail/WhatsApp) e tipo (transacional, suporte, novidade de curso, novidade de produto/marketing). Dona: Central de Clientes. CRM/Marketing/Disparos só **leem e respeitam**, nunca escrevem. |
| **Bloqueio permanente** | Nível mais forte de opt-out: a aluna pede pra nunca mais ser adicionada a nenhuma lista com aquele telefone/e-mail. Tentativa futura de reinscrição gera alerta e exige contato com suporte pra liberar. |
| **Vínculo autodeclarado** | Registro de outro CPF/CNPJ/e-mail que a aluna afirma ser dela, usado para consolidar seu histórico completo. Sempre revisado por humano (regra 10.2.3), nunca automático. |
| **Marco da jornada** | Item curado da timeline da aluna: recorde batido, testemunho (ex.: compilado de agradecimentos no Slack), marco pessoal relatado por ela. Curadoria manual, não gerado automaticamente. |
| **Recomendação** | Insight/nudge sobre o próprio negócio da aluna, derivado de comparação com histórico ou benchmark (ex.: "seu investimento em tráfego caiu vs ano passado"). Nunca é venda — não confundir com `Oportunidade` do CRM (Parte 8.3). |
| **Preço de tabela** | Preço "cheio"/de referência de uma oferta, histórico e imutável — usado para calcular desconto/economia real mostrado à aluna. Campo `oferta_catalogo.preco_tabela` (Parte 5.2‑C). |

## 10.4 Modelo de dados

```
solicitacao_exclusao   (pessoa FK, dados_afetados jsonb, status: solicitada|em_processamento|
                         concluida, solicitado_em, executado_em)
preferencia_comunicacao (pessoa FK, canal: email|whatsapp, tipo: transacional|suporte|
                         novidade_curso|novidade_produto|marketing_geral,
                         status: inscrito|descadastrado|bloqueado_permanente, atualizado_em)
vinculo_autodeclarado   (pessoa FK, tipo_documento: cpf|cnpj|email, valor, justificativa,
                         status: pendente|aprovado|rejeitado, revisado_por, revisado_em)
                         -- sempre revisão humana, nunca sugestão de IA (regra 10.2.3)
marco_jornada           (pessoa FK, contrato FK nullable, tipo: recorde|testemunho|
                         marco_pessoal, descricao, data, origem: manual|slack_import,
                         curado_por)
recomendacao            (pessoa FK, tipo, descricao, criterio_gerador, criado_em,
                         status: ativa|resolvida|dispensada)
                         -- sempre derivada de query sobre Financeiro/CRM, nunca hardcoded
```

Nenhuma dessas tabelas duplica dado financeiro/comercial: `pessoa`, `contrato`, `transacao`,
`oferta_catalogo` continuam sendo lidos por referência dos outros contextos.

## 10.5 Áreas funcionais

### 10.5.1 LGPD e exclusão de dados

Fluxo: aluna solicita exclusão → página lista exatamente quais dados existem hoje → explica
como serão apagados e como serão tratados dali em diante → avisa que a ação é irreversível →
confirmação → `solicitacao_exclusao` registrada e executada pelo contexto dono de cada dado
(Financeiro executa sobre `payload_bruto`/`pessoa`, CRM sobre `interacao`, etc.).
**Mecânica técnica de execução (pseudonimização vs exclusão física) ainda em aberto** — ver
Parte 7, itens 10 e 11.

### 10.5.2 Pré-checkout / ofertas justificadas

Mesma página funciona como **funil de pré-checkout**: antes de comprar, a aluna passa por
aqui e vê os melhores preços disponíveis pra ela, sempre com a **justificativa explícita**
de por que ela tem acesso àquela condição (critério de elegibilidade). Isso é uma composição
de leitura sobre `tratamento_cliente` (Marketing, Parte 9.7) e `oferta_catalogo` (Financeiro)
— a Central de Clientes não decide a oferta, só explica a decisão já tomada por esses
contextos.

### 10.5.3 Histórico de contratos e economia

Lista de contratos da aluna, cada um mostrando:
- Data de início, termos de uso assinados (link ao documento), status financeiro
  (quitado/inadimplente + quanto falta + link de pagamento).
- **Resumo de benefícios financeiros**: juros evitados (períodos de venda sem juros),
  desconto sobre `preco_tabela` (10.3), valor de bônus recebidos.
- **Mecânica de incentivo à quitação**: se a aluna quitar um contrato em atraso, mostra
  claramente o desconto que ela desbloqueia em uma nova compra — "0% de economia" vs "10% de
  economia", de forma explícita.
- Se o contrato foi encerrado: quando, e se existe possibilidade de renovação/extensão —
  tudo **derivado** do estado real do Contrato no Financeiro, nunca um campo próprio.

### 10.5.4 Jornada e marcos

Timeline por aluna com recordes batidos, testemunhos (ex.: compilado de agradecimentos do
Slack num período) e marcos pessoais. É **curadoria manual** (time de CS/marketing
compõe o resumo), não geração automática — pode usar IA como rascunho, mas segue o ciclo de
governança de 3 etapas (10.6) antes de publicar.

### 10.5.5 Vínculos históricos auto-declarados

Botão "declarar outro contrato/CPF/e-mail" → formulário (pode ter apoio de IA para
acelerar o preenchimento) → aluna informa outro documento e justificativa (ex.: "esse CNPJ
era da empresa do meu marido, que fechou") → vira `vinculo_autodeclarado` pendente →
**sempre revisado por humano**, nunca aprovado automaticamente por IA (regra 10.2.3) → se
aprovado, aciona `merge_pessoa` (Financeiro, Parte 5.2‑E) formalmente.

### 10.5.6 Preferências de comunicação

Autoatendimento tipo "central de assinaturas": aluna liga/desliga cada tipo de e-mail
(transacional, suporte, novidade de curso, novidade de produto/marketing) e sua inscrição em
listas de WhatsApp. Regras específicas:
- Ao desmarcar uma lista, mostra aviso: "você está saindo dessa lista agora; se você se
  inscrever de novo no futuro, esse telefone volta a ser adicionado."
- Opção de **bloqueio permanente**: "nunca mais adicionar esse número a nenhuma lista." Se
  alguém tentar reinscrevê-la depois, o sistema alerta que o número está bloqueado e que é
  preciso contatar o suporte para liberar.
- CRM/Marketing/Disparos **leem** `preferencia_comunicacao` antes de qualquer envio — nunca
  escrevem nela diretamente (mesmo padrão "observa, não escreve" já usado em todo o
  documento).

### 10.5.7 Dashboard motivacional / Recomendações

Regras de apresentação de dado, aplicáveis a qualquer painel da Central de Clientes:
- **Comparação de período favorável → mensagem festiva.** Ex.: já em março bateu o
  faturamento equivalente a 4 meses do ano anterior → mostra a comparação de forma
  celebrativa.
- **Comparação desfavorável → nunca mostra a estatística nua.** Em vez de "você faturou 20%
  do ano passado quando deveria ter faturado 30%", mostra uma `Recomendação` acionável:
  "você tem oportunidades de melhoria baseadas no seu histórico — quer marcar uma revisão?"
  seguida de comparações concretas e específicas (ex.: "ano passado você vendeu o produto X,
  esse ano ainda não ofereceu", "seu investimento em tráfego caiu de R$1000 para R$200").
  A mensagem festiva simplesmente **não aparece** nesse caso — não é uma versão "suavizada"
  dela.
- **Todo widget de dashboard com potencial de melhoria tem um indicador (ícone de
  interrogação/estrela)** — hover mostra resumo, clique leva à aba de `Recomendação`
  filtrada naquele tema.
- **Recorde batido é destacado com contexto comparativo** (ex.: "acima da média de X% dos
  clientes", "entre os melhores resultados do seu grupo neste período" — sem nome de
  programa fixo, já que "Olimpíada" era só um modo de falar, não um programa formal).
- Este comportamento é **derivado por query** (comparação de período, benchmark), nunca um
  texto hardcoded — consistente com a regra de "tudo agregado é derivado" (Parte 5.1).

## 10.6 Governança de decisões automatizadas (cross-cutting)

Formaliza o que já era regra solta na Sugestão de IA do CRM (Parte 8.3) — vale para toda
saída de IA usada em produção em qualquer contexto do sistema:

1. **Validação individual.** Antes de aplicar a um caso específico, um colaborador humano
   confere a sugestão da IA ("prova dos noves") — nunca aplicação automática direta.
2. **Revisão coletiva de padrão.** Se o caso parecer recorrente (não isolado), é discutido em
   reunião com pelo menos mais 2 pessoas para confirmar se é de fato um padrão.
3. **Generalização opcional do fluxo.** Se confirmado como padrão, a regra/automação é
   aplicada a outros casos semelhantes já existentes na base, aprimorando o fluxo para todo
   mundo — não só para o caso que originou a análise.

**Exceção explícita (regra 10.2.3):** vínculo histórico auto-declarado (10.5.5) nunca usa
sugestão de IA na etapa 1 — a revisão já nasce 100% humana, por causa do risco de fraude
financeira.

## 10.7 Decisões resolvidas

1. **Mecânica técnica de exclusão LGPD (10.5.1) — resolvido: pseudonimização.** `pessoa` é
   pseudonimizada (dados de identificação removidos/ofuscados), mantendo `transacao` e
   agregados financeiros intactos — Financeiro continua íntegro (receita, contratos,
   histórico agregado) sem reter PII da pessoa excluída. Atualiza também a Parte 7,
   itens 10-11, que ficam **resolvidos** por esta definição.
2. **"Olimpíada" não é um programa formal — resolvido: era só um modo de dizer.** Removida a
   referência específica de 10.5.7; o exemplo de destaque de recorde vira genérico
   ("ranking interno de resultado", sem nome de programa fixo).
3. **Quem usa a Central de Clientes internamente — resolvido:** suporte, comercial, CS e
   marketing, todos por padrão. Nível de permissão de cada um é definido pela mesma matriz
   de RBAC da Administração do CRM (Parte 8.2.1, 8.11) — não é uma regra de acesso própria
   da Central de Clientes.
