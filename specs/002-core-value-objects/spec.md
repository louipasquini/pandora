# Feature Specification: Value Objects e primitivas canônicas do `core`

**Feature Branch**: `002-core-value-objects`

**Created**: 2026-09-02

**Status**: Draft

**Input**: User description: "002 core-value-objects — Value Objects e primitivas canônicas do módulo `core` do backend, consumidas por todos os outros bounded contexts. Sem frontend, sem entidade de negócio nova exposta por API. Escopo: Dinheiro (×10000, sem float, moeda obrigatória), parser de tempo tolerante → instante UTC, enums de status canônico + funções puras `liberaAcesso`/`contaComoReceita`, base de auditoria (`criadoEm`/`atualizadoEm` + forma canônica de registro `_audit`), e consolidação do padrão de config tipada por zod como parte do `core`. TypeScript puro testável sem banco."

## Clarifications

### Session 2026-09-02

- Q: `Moeda` é um enum fechado (e quais membros) ou um código ISO 4217 validado como conjunto aberto? → A: **Código ISO 4217 alfabético (3 letras) validado contra a lista ISO** — conjunto aberto porém validado. Código não-ISO vindo de origem é erro/evento a revisar, nunca valor aceito. `moeda` nunca opcional.
- Q: Quais os valores canônicos de `StatusContratoCanonico` e quais deles liberam acesso? → A: **`ATIVO`, `EXPIRADO`, `CANCELADO`, `DESCONHECIDO`** (4 estados). Libera acesso: **só `ATIVO`**, com a janela de tolerância de atraso aplicada **na leitura** (derivada de data + config de contrato), não como estado próprio. `DESCONHECIDO` força revisão.
- Q: Política de arredondamento de `multiplicarPorEscalar` quando o resultado não é inteiro na escala ×10000? → A: **Proibir fator não inteiro.** `multiplicarPorEscalar` só aceita inteiro. Parcelamento/rateio é função dedicada com distribuição determinística de resto (FR-010) — o chamador nunca perde centavo por arredondamento implícito.
- Q: `liberaAcesso(EM_ATRASO)` no nível do enum puro retorna `true` ou `false`? → A: **`true`.** O `core` é permissivo: `liberaAcesso` é função pura do enum, sem estado temporal. A janela de tolerância é config por contrato (spec 025) e é o contexto `contratos` que **revoga** o acesso quando ela expira. `contaComoReceita(EM_ATRASO)` permanece `false`.
- Q: `parseInstante` do `core` reconhece formatos de planilha (`dd/mm/aaaa`, número serial de Excel) ou isso fica nos adapters de CSV? → A: **Só formatos de máquina não ambíguos no `core`**: ISO 8601 (com/sem fuso), ISO com espaço no lugar do `T`, epoch em segundos, epoch em milissegundos, objeto de data. `dd/mm/aaaa` e serial de Excel são responsabilidade de cada adapter de CSV (specs 019–022, 028), que normaliza para ISO antes de chamar o `core`. Formato não reconhecido → `null` + motivo.
- Q: O campo `origem` do registro canônico de auditoria é um enum fechado ou string livre? → A: **Enum fechado**: `CURADORIA`, `AJUSTE_MANUAL`, `MIGRACAO`. Valores novos exigem mudança deliberada no enum do `core` (mesmo tratamento de `PlataformaOrigem` e dos enums de status). A spec 053 filtra por esse conjunto estável.

## Visão geral

Segunda spec da **Fase 0** do [ROADMAP.md](../../ROADMAP.md). Não entrega regra de negócio,
entidade persistida nem endpoint: entrega as **primitivas canônicas** do contexto `core` que
**todos os outros 10 contextos** vão importar — dinheiro, tempo, status canônico, contrato de
auditoria e leitura de configuração tipada. É o cumprimento do "decididos uma vez, no início"
dos Padrões Técnicos Transversais da constituição (v1.1.0).

O "usuário" desta spec é a pessoa (ou agente) que vai implementar as fatias 003–056 e o
código que as compõe. O sucesso é medido por: nenhuma spec posterior precisa **redecidir**
como representar dinheiro, como normalizar um carimbo de tempo de origem, ou como perguntar
"esse status libera acesso?". Tudo isso já existe no `core`, é puro, e é testável sem banco.

A spec 001 já entregou `EntidadeId` (UUID v7) e o enum `PlataformaOrigem` no `core`. Esta
spec adiciona `Dinheiro`/`Moeda`, o parser de tempo, os enums de status canônico com suas
funções puras, o contrato de auditoria e a consolidação da camada de config.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Representar e operar dinheiro sem perder precisão nem somar moedas erradas (Priority: P1)

Quem implementa o ledger (018), os adapters (019–022), contratos (025) e os dashboards
financeiros (030) precisa de **um** tipo de dinheiro. Ele carrega valor e moeda juntos,
guarda o valor como inteiro em escala fixa (×10000, 4 casas decimais), recusa `float` por
construção, e **só** soma/subtrai entre a mesma moeda — qualquer tentativa de misturar BRL
com USD é um erro explícito, nunca um número silenciosamente errado.

**Why this priority**: a Regra de Negócio Inviolável nº 6 e nº 7 (nunca somar moedas
diferentes, valor sempre inteiro ×10000) e o Princípio V (agregados derivados) dependem
disto. Sem o tipo, cada adapter reinventa a representação e a dívida da v1 (escala monetária
assumida) volta.

**Independent Test**: em testes unitários sem banco, construir `Dinheiro` a partir de string
decimal e de inteiro escalado, exercitar todas as operações e comparações, e confirmar que
somar moedas diferentes lança erro, que a serialização faz _round-trip_ exato, e que não há
`float` em nenhum caminho do valor.

**Acceptance Scenarios**:

1. **Given** a string `"1234.5678"` e a moeda `BRL`, **When** se constrói um `Dinheiro`,
   **Then** o valor interno é o inteiro `12345678` (escala ×10000) e a moeda é `BRL`.
2. **Given** um `Dinheiro` de `10,0000 BRL` e outro de `2,5000 BRL`, **When** se somam,
   **Then** o resultado é `12,5000 BRL` e os operandos originais permanecem inalterados
   (imutabilidade).
3. **Given** um `Dinheiro` em `BRL` e um em `USD`, **When** se tenta somar, subtrair ou
   comparar por ordem, **Then** a operação lança um erro que nomeia as duas moedas
   envolvidas — nunca retorna um número.
4. **Given** a string decimal `"10.12345"` (5 casas), **When** se constrói `Dinheiro`,
   **Then** rejeita com erro de precisão explícito — nunca trunca nem arredonda em silêncio.
5. **Given** um `Dinheiro` qualquer, **When** ele é serializado para persistência/JSON e
   desserializado de volta, **Then** o objeto reconstruído é igual ao original (valor e
   moeda), inclusive para valores negativos e para `zero`.
6. **Given** um valor que excede o alcance seguro de um número de ponto flutuante,
   **When** ele é representado como `Dinheiro`, **Then** nenhuma precisão é perdida (o valor
   interno é um inteiro de precisão arbitrária, não um `number`).

---

### User Story 2 - Normalizar qualquer carimbo de tempo de origem para um instante UTC confiável (Priority: P1)

Cada plataforma manda data num formato diferente (ISO com e sem timezone, epoch em segundos,
epoch em milissegundos, e ocasionalmente lixo). Quem escreve um adapter chama **um** parser
de borda do `core`, recebe de volta um instante UTC **ou** um `null` com o motivo registrado,
e nunca precisa lidar com um `Date` sem timezone. Formatos de planilha/locale (`dd/mm/aaaa`,
serial de Excel) o adapter de CSV normaliza para ISO antes de chamar — o parser do `core` é
livre de locale de propósito.

**Why this priority**: o Padrão Transversal de Tempo ("tudo `timestamptz` em UTC; nunca
naive") e o Princípio IV ("nada é descartado silenciosamente") dependem deste parser. A
spec 021 (adapter Guru) já cita explicitamente "parser tolerante da 002".

**Independent Test**: alimentar o parser com uma bateria de entradas reais de cada formato
(e de lixo) em teste unitário e confirmar a classificação: cada entrada válida vira o
instante UTC correto; cada entrada inválida vira `null` com um motivo legível; nenhuma
entrada produz um instante em fuso local ou sem fuso.

**Acceptance Scenarios**:

1. **Given** `"2026-03-01T12:00:00Z"`, **When** parseado, **Then** resulta no instante UTC
   correspondente, sem ambiguidade.
2. **Given** `"2026-03-01T09:00:00-03:00"`, **When** parseado, **Then** resulta no mesmo
   instante que `"2026-03-01T12:00:00Z"` (o offset é aplicado, não ignorado).
3. **Given** `"2026-03-01T12:00:00"` (sem timezone), **When** parseado, **Then** é
   interpretado como UTC, o resultado é um instante válido, e o motivo/aviso registra que a
   ausência de fuso foi assumida como UTC.
4. **Given** o número `1772539200` (epoch em segundos) e o número `1772539200000` (epoch em
   milissegundos), **When** cada um é parseado, **Then** ambos resultam no **mesmo** instante
   UTC, pela heurística de escala documentada em FR-014.
5. **Given** `""`, `"n/a"`, `"0000-00-00"`, `null` ou `undefined`, **When** parseado,
   **Then** o resultado é `null` **com** um motivo não vazio, e nada é lançado.
6. **Given** um formato de planilha como `"01/03/2026"` ou `"01/03/2026 09:30"`, **When**
   parseado pelo `core`, **Then** retorna `null` com motivo ("formato de planilha; normalize
   no adapter") — o `core` não adivinha ordem dd/mm vs mm/dd. O adapter de CSV converte para
   ISO antes de chamar.

---

### User Story 3 - Decidir "libera acesso?" e "conta como receita?" a partir de um status canônico único (Priority: P1)

Nenhum lugar do sistema pergunta a uma plataforma "esse pedido está pago?". O adapter traduz
o vocabulário de origem para um enum canônico; a partir daí, "isso libera acesso ao curso?" e
"isso conta como dinheiro que entrou?" são **funções puras de uma linha** sobre o enum. Um
status que o adapter não conseguiu mapear vira `DESCONHECIDO` e força revisão — nunca é
tratado como ativo.

**Why this priority**: Regras Invioláveis nº 5 (status de acesso ≠ status financeiro, ambos
derivados de **um** enum) e nº 15 (status não catalogado → `REVISAR`). Princípio III (o
núcleo só conhece status canônico).

**Independent Test**: para cada valor do enum, verificar em teste unitário o retorno de
`liberaAcesso` e de `contaComoReceita`; confirmar que `DESCONHECIDO` retorna `false` nas
duas e que existe um caminho explícito de "marcar para revisão".

**Acceptance Scenarios**:

1. **Given** o status canônico `PAGO`, **When** se pergunta `contaComoReceita`, **Then**
   retorna `true`; **When** se pergunta `liberaAcesso`, **Then** retorna `true`.
2. **Given** o status canônico `PENDENTE` ou `EM_ATRASO`, **When** se pergunta
   `liberaAcesso`, **Then** retorna `true` (o `core` é permissivo; a revogação por tolerância
   expirada é do contexto `contratos`); **When** se pergunta `contaComoReceita`, **Then**
   retorna `false` ("não é pago de fato").
3. **Given** os status `ESTORNADO`, `CHARGEBACK`, `RECUSADO`, `CANCELADO`, **When** se
   perguntam as duas funções, **Then** ambas retornam `false`.
4. **Given** uma string bruta de origem que nenhum mapa de status cobre, **When** ela passa
   pela resolução canônica, **Then** o resultado é `DESCONHECIDO`, as duas funções retornam
   `false`, e há um sinal explícito de "encaminhar para revisão" (não um valor padrão
   silencioso).
5. **Given** o enum `StatusContratoCanonico`, **When** se pergunta o equivalente de
   "contrato dá acesso agora?", **Then** a resposta é uma função pura do enum (+ tolerância),
   independente de qualquer consulta a plataforma.

---

### User Story 4 - Herdar carimbo de auditoria e a forma canônica de registrar mudança curada (Priority: P2)

Quem for modelar qualquer entidade futura (pessoa, transação, oferta, contrato…) herda de um
lugar só o par `criadoEm`/`atualizadoEm` em `timestamptz`, e — quando a entidade tiver campos
curados por humano ou ajuste manual — registra a mudança numa **forma canônica** (quem, quando,
o quê, valor anterior, valor novo, motivo, origem). Esta spec entrega o **contrato e o
utilitário**; as tabelas `_audit` de negócio são de cada spec dona (e o painel consolidado é a
053).

**Why this priority**: o Padrão Transversal de Auditoria ("`criado_em`/`atualizado_em` em
tudo; mudanças curadas em `_audit` com quem e quando") precisa de forma única desde já, mas
nenhuma entidade de negócio existe ainda para persistir — por isso P2.

**Independent Test**: confirmar que existe um contrato de "entidade auditável" reutilizável e
uma função pura que, dada uma mudança (entidade, campo, valor anterior, valor novo, autor,
motivo, origem), produz o registro canônico normalizado, testável sem banco.

**Acceptance Scenarios**:

1. **Given** o contrato de entidade auditável, **When** uma nova entidade de negócio futura o
   adota, **Then** ela ganha `criadoEm` e `atualizadoEm` como `timestamptz` UTC, com
   semântica documentada (criação define os dois; toda escrita atualiza `atualizadoEm`).
2. **Given** uma mudança curada (ex.: `nome` de produto de `"X"` para `"Y"`, por `autor`,
   motivo `"correção"`, `origem = CURADORIA`), **When** ela passa pela função de registro,
   **Then** produz um registro canônico com todos esses campos preenchidos e um carimbo de
   tempo UTC.
3. **Given** a forma canônica do registro de auditoria, **When** a spec 053 for construir o
   painel global, **Then** ela consegue consumir esse formato sem redefini-lo.

---

### User Story 5 - Ler configuração tipada por contexto, com falha cedo (Priority: P2)

A spec 001 já validou o `.env` por um schema zod no boot. Esta spec **consolida** esse padrão
como parte do `core`: um ponto único que valida todo o ambiente uma vez, expõe a config já
tipada e agrupada (runtime, banco, auth, 7 contas de origem), e documenta como cada módulo de
contexto consome só o pedaço que lhe diz respeito — sem reler `process.env` espalhado.

**Why this priority**: o Padrão Transversal de Config/segredos ("`.env` por conta, nunca
hard-coded, falha cedo") já foi iniciado na 001; aqui ele vira contrato estável do `core`
para as specs seguintes. P2 porque não bloqueia dinheiro/tempo/status.

**Independent Test**: confirmar que a config é validada num só lugar no boot, que uma variável
obrigatória ausente ou malformada causa falha imediata nomeando a variável, e que um módulo
de contexto obtém sua fatia de config por um acesso tipado, não por `process.env` cru.

**Acceptance Scenarios**:

1. **Given** um ambiente completo e válido, **When** a aplicação inicia, **Then** a config é
   validada uma vez e fica disponível já tipada para todos os contextos.
2. **Given** uma variável obrigatória ausente ou com formato inválido, **When** a aplicação
   inicia, **Then** ela falha imediatamente com mensagem que nomeia a variável — sem default
   silencioso para segredo ou string de conexão (idêntico ao comportamento da 001).
3. **Given** um módulo de contexto qualquer, **When** ele precisa de um valor de config,
   **Then** o obtém por um acesso tipado à camada do `core`, e uma busca por `process.env`
   fora dessa camada retorna zero ocorrências em código de contexto.

---

### Edge Cases

**Dinheiro**

- String decimal com separador de milhar ou vírgula decimal (`"1.234,56"`, `"1,234.56"`):
  comportamento determinístico e documentado (aceita um formato canônico; o resto é erro).
- Mais casas decimais que a escala (`"10.123456"`): erro de precisão explícito (FR-003) —
  sem truncar nem arredondar em silêncio.
- Valor negativo (`-50,0000 BRL`): suportado em toda operação e na serialização.
- `zero(moeda)`: `zero` ainda carrega moeda; `zero BRL` ≠ `zero USD` para comparação de
  igualdade estrita de moeda, mas ambos são "sem valor".
- `multiplicarPorEscalar` por `0` e por inteiro negativo: definidos. Por fator **não
  inteiro**, `NaN` ou `Infinity`: erro explícito (sem arredondamento implícito).
- Divisão / rateio (ex.: parcelar um total em N, ratear atribuição por pesos): via `ratear`/
  `ratearPorPesos` (FR-010) — a soma das partes fecha exatamente com o total, resto
  distribuído de forma determinística.
- Comparar `Dinheiro` com `null`/`undefined`: erro explícito, não `false` silencioso.
- Construir a partir de um `number` de ponto flutuante: proibido pela API (o tipo de entrada
  não aceita `float` para o valor; só string decimal ou inteiro escalado).

**Tempo**

- Epoch `0` e epoch negativo (datas anteriores a 1970): parseados normalmente como instantes
  válidos, não como lixo.
- Ambiguidade segundos × milissegundos em valores próximos do limiar: regra de escala fixa e
  documentada (FR-014), não adivinhação.
- Ano fora de faixa plausível (ano `0`, ano `> 9999`, `"9999-12-31"`): decisão documentada —
  aceita como instante ou rejeita com motivo, mas determinístico.
- String ISO com milissegundos e/ou `Z` minúsculo, e com espaço no lugar do `T`
  (`"2026-03-01 12:00:00"`): tolerada como ISO.
- Data em formato de planilha (número serial do Excel `"45352"`, `dd/mm/aaaa`): sempre
  `null` + motivo no `core` — normalização é do adapter de CSV. Serial de Excel nunca é
  interpretado como epoch.
- Entrada já sendo um objeto de data válido: normalizada para UTC e devolvida; objeto de data
  inválido → `null` com motivo.
- Locale/timezone da máquina que roda o parser **não** pode influenciar o resultado.

**Status**

- String bruta com caixa/acentuação/espaços variados (`" Pago "`, `"APROVADO"`, `"paid"`):
  o mapeamento é responsabilidade do adapter (versão por fonte); o `core` só recebe o enum já
  canônico. O que o `core` garante: valor fora do enum → `DESCONHECIDO`.
- `DESCONHECIDO` nunca é igualado a `PENDENTE` nem a `CANCELADO` — é seu próprio estado, que
  força revisão.
- `null`/`undefined` como status: erro explícito ou `DESCONHECIDO` com sinal de revisão —
  nunca `PAGO`.

**Config**

- Variável presente porém vazia (`""`): tratada como ausente (falha cedo), não como valor
  válido.
- Variável obrigatória só para um subconjunto de contas: a validação diz qual conta e qual
  chave faltou.
- Reler config em runtime após o boot: a fonte da verdade é o objeto validado no boot, não
  `process.env`.

## Requirements *(mandatory)*

### Functional Requirements

#### Dinheiro e Moeda

- **FR-001**: O `core` MUST expor um Value Object `Dinheiro` **imutável** que carrega, juntos
  e sempre, um valor e uma `Moeda`. Toda operação retorna uma nova instância; nenhuma muta o
  operando.
- **FR-002**: O valor interno de `Dinheiro` MUST ser um **inteiro em escala fixa ×10000**
  (4 casas decimais), representado por um tipo inteiro de precisão arbitrária (`bigint`),
  nunca por ponto flutuante. `float`/`number` fracionário MUST ser proibido em qualquer
  ponto do caminho do valor.
- **FR-003**: `Dinheiro` MUST poder ser construído a partir de (a) uma **string decimal**
  canônica (ponto como separador decimal, sem separador de milhar, sinal opcional,
  **no máximo 4 casas decimais**) e (b) um **inteiro já escalado** (`bigint`/inteiro) +
  moeda. String com mais de 4 casas decimais MUST ser rejeitada com erro de precisão — nunca
  truncada nem arredondada silenciosamente. A API de construção MUST NOT aceitar um `number`
  de ponto flutuante como valor.
- **FR-004**: `Moeda` MUST ser um **código ISO 4217 alfabético de 3 letras**, validado
  contra a lista ISO 4217 no ponto de construção — conjunto aberto porém validado. `moeda`
  NUNCA é opcional em `Dinheiro`. Um código que não seja ISO 4217 válido MUST ser rejeitado
  com erro explícito (a origem que mandou moeda desconhecida vira evento a revisar, nunca
  valor aceito). A normalização MUST ser para caixa alta.
- **FR-005**: `Dinheiro` MUST oferecer `somar`, `subtrair` e `negar`. `somar`/`subtrair`
  MUST lançar um erro que nomeia as duas moedas quando os operandos têm moedas diferentes.
- **FR-006**: `Dinheiro` MUST oferecer comparações: igualdade (valor **e** moeda) e ordem
  (`maiorQue`/`menorQue`/`maiorOuIgual`/`menorOuIgual`). Comparação de ordem entre moedas
  diferentes MUST lançar erro. Comparação com `null`/`undefined` MUST lançar erro.
- **FR-007**: O `core` MUST oferecer `Dinheiro.zero(moeda)` — uma instância de valor `0` que
  ainda carrega moeda. `zero(BRL)` MUST NOT ser igual a `zero(USD)`.
- **FR-008**: `Dinheiro` MUST ter uma serialização **estável e reversível** para persistência
  e para JSON (forma sugerida: `{ valorInt: string, moeda: string }`, com `valorInt` como
  string para não perder precisão em JSON). Desserializar a serialização MUST reproduzir uma
  instância igual à original, inclusive para valores negativos e `zero`.
- **FR-009**: `Dinheiro` MUST oferecer `multiplicarPorEscalar(fator)` que aceita **somente
  fator inteiro**. Fator não inteiro MUST ser rejeitado com erro explícito — não há
  arredondamento implícito no `core`. `NaN`/`Infinity` também são erro. (Descontos
  percentuais e rateios que precisem de fração usam `ratear`, FR-010.)
- **FR-010**: O `core` MUST oferecer `ratear(total, n)` (e/ou `ratearPorPesos(total, pesos)`)
  que divide um `Dinheiro` em N partes cuja **soma é exatamente igual ao total original** —
  o resto (em unidades da escala ×10000) é distribuído de forma **determinística e
  documentada** (ex.: as primeiras `resto` partes recebem +1 unidade). Nenhuma unidade é
  perdida nem criada. Esta é a única via de "dividir dinheiro" no `core`.
- **FR-011**: `Dinheiro` MUST NOT oferecer nenhuma operação de **conversão de moeda** nem de
  soma entre moedas. Agregados monetários são sempre por moeda separada (Regra Inviolável
  nº 6); esta spec entrega só o tipo escalar, não o agregador.

#### Tempo

- **FR-012**: O `core` MUST expor um parser de borda `parseInstante(entrada)` que retorna um
  resultado explícito contendo **um instante UTC** (`valor`) **ou** `null`, e — sempre que o
  valor for `null` **ou** tiver exigido uma suposição — um **motivo** legível. O parser
  MUST NOT lançar exceção para entrada malformada.
- **FR-013**: `parseInstante` MUST aceitar **exatamente** estes formatos: ISO 8601 com
  offset ou `Z`; ISO 8601 **sem** timezone (interpretado como UTC, com motivo registrando a
  suposição); ISO 8601 com espaço no lugar do `T` (`"2026-03-01 12:00:00"`); epoch em
  segundos; epoch em milissegundos; um objeto de data já válido. MUST devolver `null` +
  motivo para string vazia, `null`, `undefined`, e qualquer texto fora desses formatos —
  **incluindo** `dd/mm/aaaa`, `mm/dd/aaaa` e número serial de planilha. Formatos de planilha
  e locale-específicos são normalizados para ISO por cada adapter de CSV (specs 019–022,
  028) **antes** de chamar o `core`; o parser do `core` é deliberadamente livre de locale.
- **FR-014**: A distinção **epoch em segundos × epoch em milissegundos** MUST usar uma regra
  de escala fixa e documentada (ex.: limiar por ordem de grandeza), não uma adivinhação
  dependente de contexto. A mesma data em segundos e em milissegundos MUST produzir o mesmo
  instante.
- **FR-015**: O resultado de `parseInstante` MUST ser **sempre** um instante com fuso
  (equivalente a `timestamptz` em UTC). O `core` MUST NOT expor nenhum caminho que produza
  ou aceite um `Date` naive/local para persistência.
- **FR-016**: O comportamento de `parseInstante` MUST ser **independente do timezone e do
  locale** da máquina que executa o código (resultado idêntico em qualquer servidor/CI).
- **FR-017**: Formatos de planilha e locale-específicos (`dd/mm/aaaa`, `mm/dd/aaaa`, número
  serial de planilha) MUST resultar em `null` + motivo no `core` — não há adivinhação de
  ordem `mm/dd` vs `dd/mm`. A normalização desses formatos para ISO é responsabilidade do
  adapter de CSV que conhece a convenção da fonte (specs 019–022, 028).
- **FR-018**: O `core` MUST oferecer um helper para carimbar "agora" como instante UTC, para
  uso por `criadoEm`/`atualizadoEm` e por registros de auditoria.

#### Status canônico

- **FR-019**: O `core` MUST expor `StatusTransacaoCanonico` com exatamente os valores:
  `PENDENTE`, `PAGO`, `EM_ATRASO`, `RECUSADO`, `CANCELADO`, `ESTORNADO`, `CHARGEBACK`,
  `DESCONHECIDO`.
- **FR-020**: O `core` MUST expor `StatusContratoCanonico` com exatamente os valores:
  `ATIVO`, `EXPIRADO`, `CANCELADO`, `DESCONHECIDO`. O rótulo renovação/prorrogação continua
  **derivado** do estado de acesso na data do aditivo (visão Parte 7), não é um valor deste
  enum. A janela de tolerância de atraso **não** é um estado próprio: é aplicada na leitura,
  a partir da data de fim de acesso + configuração de tolerância do contrato (spec 025).
- **FR-021**: O `core` MUST expor `liberaAcesso(status)` e `contaComoReceita(status)` como
  **funções puras** (sem I/O, sem data/hora, sem consulta externa) sobre
  `StatusTransacaoCanonico`. Tabela-verdade completa:
  | status | `liberaAcesso` | `contaComoReceita` |
  | --- | --- | --- |
  | `PAGO` | `true` | `true` |
  | `PENDENTE` | `true` | `false` |
  | `EM_ATRASO` | `true` | `false` |
  | `RECUSADO` | `false` | `false` |
  | `CANCELADO` | `false` | `false` |
  | `ESTORNADO` | `false` | `false` |
  | `CHARGEBACK` | `false` | `false` |
  | `DESCONHECIDO` | `false` | `false` |
  `liberaAcesso(EM_ATRASO) = true` é decisão fechada: o `core` é permissivo e **não**
  conhece a janela de tolerância; quem revoga o acesso após a tolerância expirar é o
  contexto `contratos` (spec 025).
- **FR-022**: O `core` MUST oferecer uma função pura de "libera acesso agora?" para
  `StatusContratoCanonico`: **só `ATIVO` retorna `true`**; `EXPIRADO`, `CANCELADO` e
  `DESCONHECIDO` retornam `false`. A aplicação da janela de tolerância sobre um contrato
  `EXPIRADO` recente é responsabilidade da leitura no contexto `contratos` (spec 025), não
  desta função.
- **FR-023**: O `core` MUST oferecer uma resolução `paraStatusCanonico(valorBruto)` que,
  para qualquer valor fora do enum (inclusive `null`/`undefined`/string desconhecida),
  retorna `DESCONHECIDO` **e** um sinal explícito de "encaminhar para revisão" — nunca um
  status ativo. (O mapeamento rico de vocabulário por plataforma é dos adapters, specs
  019–022; aqui é só a rede de segurança.)
- **FR-024**: `DESCONHECIDO` MUST ser um estado próprio, distinto de `PENDENTE` e de
  `CANCELADO` em qualquer comparação.

#### Base de auditoria

- **FR-025**: O `core` MUST definir um **contrato reutilizável de entidade auditável** que
  padroniza `criadoEm` e `atualizadoEm` como instantes UTC (`timestamptz`), com semântica
  documentada: a criação define ambos; toda alteração persistida atualiza `atualizadoEm`.
- **FR-026**: O `core` MUST definir a **forma canônica de um registro de mudança curada /
  ajuste manual** com, no mínimo: quem (autor), quando (instante UTC), entidade e campo
  afetados, valor anterior, valor novo, motivo, e `origem` da mudança. `origem` MUST ser um
  **enum fechado** com exatamente `CURADORIA`, `AJUSTE_MANUAL`, `MIGRACAO` (valores novos =
  mudança deliberada no enum do `core`). MUST haver uma função pura que produz esse registro
  normalizado a partir desses dados, testável sem banco.
- **FR-027**: Esta spec MUST NOT criar tabelas `_audit` de entidades de negócio nem o painel
  de auditoria — só o contrato e o utilitário. As tabelas são de cada spec dona; o painel
  consolidado é a spec 053. A spec MUST registrar isso explicitamente.
- **FR-028**: A forma canônica de auditoria MUST ser consumível pela spec 053 sem
  redefinição (campos e tipos estáveis).

#### Configuração tipada (consolidação)

- **FR-029**: O `core` MUST ser o dono do padrão de configuração: um ponto único que valida
  **todo** o ambiente uma vez no boot (schema zod, como já feito na 001), expõe a config já
  tipada e agrupada (runtime, banco, auth de serviço, 7 contas de origem), e **falha
  imediatamente** nomeando a variável ausente/malformada — sem default silencioso para
  segredo ou string de conexão.
- **FR-030**: Variável presente porém **vazia** MUST ser tratada como ausente (falha cedo).
- **FR-031**: Cada módulo de contexto MUST obter config por um **acesso tipado** à camada do
  `core`; ler `process.env` diretamente fora dessa camada MUST NOT ocorrer em código de
  contexto (verificável por busca).
- **FR-032**: A consolidação MUST preservar o comportamento e as chaves já definidos na 001
  (nenhuma regressão no `.env.example` nem na validação de boot); é refatoração para dentro
  do `core` + documentação, não redesenho.

#### Empacotamento, testes e documentação

- **FR-033**: Todas as primitivas desta spec MUST viver no contexto `core`
  (`backend/src/core/`) e ser importáveis pelos demais contextos sem que o `core` importe
  nada deles (a regra de `import/no-restricted-paths` da 001 continua válida).
- **FR-034**: Todas as primitivas MUST ser **puras e testáveis sem banco**. A spec MUST
  entregar testes unitários cobrindo os casos de borda listados (dinheiro: precisão, moedas
  mistas, negativos, serialização _round-trip_; tempo: cada formato + lixo + independência de
  locale; status: cada valor do enum + desconhecido; auditoria: registro normalizado;
  config: falha cedo).
- **FR-035**: `npm run lint`, `npm run typecheck`, `npm run build` e `npm test` MUST passar
  no repositório após esta spec, sem regressão nos testes da 001.
- **FR-036**: Ao final da spec, MUST ser atualizados: `docs/002-core-value-objects.md` (novo,
  descrevendo cada primitiva, sua API pública, exemplos de uso e as decisões de trade-off);
  `CLAUDE.md` (seção de stack/`core` e "Plano ativo" / próximo passo); `README.md` (bloco de
  estrutura do `core` e o "Status"); `ROADMAP.md` (marcar `002` como implementada e validada,
  ajustar "Próxima").
- **FR-037**: Nenhuma porta nova é introduzida por esta spec; se qualquer script/harness
  precisar de porta, MUST reutilizar as já configuráveis da 001 (backend `3001`, Postgres dev
  `55432`) e MUST NOT fixar uma porta que já esteja em uso no ambiente.

### Key Entities

Esta spec não cria entidade de negócio persistida. Os "objetos" que ela introduz são
primitivas de domínio do `core`:

- **`Dinheiro`**: Value Object imutável `{ valorInt: bigint (escala ×10000), moeda: Moeda }`.
  Operações: `somar`, `subtrair`, `negar`, `multiplicarPorEscalar` (só fator inteiro),
  `ratear`/`ratearPorPesos`, comparações, `zero`, serialização reversível. Invariante: nunca
  soma/compara ordem entre moedas diferentes; nunca usa `float`; nunca arredonda implícito.
- **`Moeda`**: código ISO 4217 alfabético de 3 letras (caixa alta), validado contra a lista
  ISO no ponto de construção — conjunto aberto porém validado. Sempre obrigatória.
- **`ResultadoParseInstante`**: `{ valor: Date(UTC) | null, motivo?: string }` — saída
  explícita do parser de tempo de borda. Nunca um `Date` naive.
- **`StatusTransacaoCanonico`**: enum de 8 valores (FR-019). Fonte única para
  `liberaAcesso` e `contaComoReceita` (funções puras).
- **`StatusContratoCanonico`**: enum de 4 estados (`ATIVO`, `EXPIRADO`, `CANCELADO`,
  `DESCONHECIDO`) + função pura "libera acesso agora?" (só `ATIVO` → `true`).
- **Contrato de entidade auditável**: mixin/interface que padroniza `criadoEm`/`atualizadoEm`
  (UTC) para futuras entidades.
- **`RegistroAuditoria` (forma canônica)**: `{ autor, quando (UTC), entidade, campo,
  valorAnterior, valorNovo, motivo, origem }`, onde `origem ∈ { CURADORIA, AJUSTE_MANUAL,
  MIGRACAO }` (enum fechado) + função pura que o normaliza. Sem tabela nesta spec.
- **Camada de configuração do `core`**: leitura única, validada e tipada do ambiente,
  agrupada por área e por conta de origem; falha cedo; consumida por acesso tipado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% de uma bateria de valores monetários (inteiros, decimais de 1–4 casas,
  negativos, `zero`, e um valor acima do alcance seguro de ponto flutuante) sobrevive a
  serializar → desserializar com igualdade exata de valor e moeda.
- **SC-002**: Toda tentativa de `somar`/`subtrair`/comparar por ordem `Dinheiro` de moedas
  diferentes resulta em erro nomeando as duas moedas — em 100% dos casos testados; nenhum
  caminho retorna um número.
- **SC-003**: Uma busca por uso de `float`/número fracionário no caminho do valor de
  `Dinheiro` retorna zero ocorrências.
- **SC-004**: Uma bateria de carimbos de tempo cobrindo ISO com/sem fuso, epoch s, epoch ms,
  objeto de data, e ≥ 5 formas de lixo é classificada corretamente em 100% dos casos
  (instante UTC certo para os válidos; `null` + motivo não vazio para os inválidos), e o
  resultado é idêntico rodando sob 3 timezones de máquina diferentes.
- **SC-005**: A mesma data fornecida como epoch em segundos e como epoch em milissegundos
  produz exatamente o mesmo instante em 100% dos casos testados.
- **SC-006**: Para cada um dos 8 valores de `StatusTransacaoCanonico`, `liberaAcesso` e
  `contaComoReceita` têm resultado definido e coberto por teste; `DESCONHECIDO` retorna
  `false` nas duas e aciona o sinal de revisão.
- **SC-007**: Um valor de status fora do enum (incl. `null`/`undefined`/string
  desconhecida) resulta em `DESCONHECIDO` + sinal de revisão em 100% dos casos — nunca em um
  status ativo.
- **SC-008**: Iniciar o backend sem uma variável obrigatória (ou com ela vazia) resulta, em
  100% dos casos, em falha imediata nomeando a variável — igual ao critério SC-006 da 001,
  sem regressão.
- **SC-009**: Uma busca por `process.env` em código de módulo de contexto (fora da camada de
  config do `core`) retorna zero ocorrências.
- **SC-010**: `lint`, `typecheck`, `build` e a suíte de testes (001 + 002) passam de forma
  determinística em 3 execuções consecutivas após a spec.
- **SC-011**: Ao fim da spec, `CLAUDE.md`, `README.md`, `ROADMAP.md` e
  `docs/002-core-value-objects.md` refletem o estado "002 implementada e validada"; o
  checkbox 002 do ROADMAP está marcado.

## Assumptions

- **Escala monetária ×10000 (4 casas) é decisão fechada** da constituição (Padrões
  Transversais) e desta spec não se reabre. `bigint` é o tipo do valor interno para não ter
  teto de precisão.
- **Serialização de `Dinheiro` usa `valorInt` como string** na fronteira JSON/persistência
  para não passar por `number` (perda de precisão acima de 2^53). A coluna física de dinheiro
  no Postgres (numeric/bigint/composto) é decisão das specs que criam tabelas (018, 025), não
  desta.
- **`Date` do runtime é aceitável como portador de "instante UTC"** desde que nunca tratado
  como naive/local; se um tipo próprio (`Instante`) se mostrar necessário, é ajuste interno
  do `core` sem mudar o contrato.
- **Naive (sem fuso) → assume UTC com motivo registrado**, conforme a descrição da feature.
  Um override por adapter (quando a fonte tem fuso conhecido, ex.: BRT) pode vir nas specs de
  adapter; não entra aqui.
- **A lista de códigos ISO 4217 é embarcada no `core`** (constante versionada) — sem
  chamada de rede. Atualização da lista é mudança de código no `core`, rara.
- **`liberaAcesso(EM_ATRASO) = true` no `core` (permissivo).** A janela de tolerância é
  configuração de contrato (spec 025); é o contexto `contratos` que revoga o acesso quando
  ela expira. O `core` não tem estado temporal.
- **Formato exato da tabela `_audit`** (colunas, índices, particionamento) é da spec 053;
  aqui só a forma canônica em TypeScript e a função normalizadora.
- **A consolidação de config é refatoração + documentação**, mantendo 100% das chaves e do
  comportamento da 001. Nenhuma variável nova de ambiente é exigida por esta spec.
- **Sem frontend, sem endpoint, sem entidade Prisma de negócio, sem adapter.** Qualquer um
  desses que vaze para esta spec deve ser recusado e remetido à spec dona.
- **Locale/timezone de CI e de máquinas de dev pode variar**; por isso a exigência explícita
  de independência de locale no parser.

## Constraints & Tradeoffs

- **`bigint` para o valor, não `number` nem `string`.** `number` estoura precisão acima de
  2^53 (≈ 900 mil reais com escala ×10000 já é seguro, mas somas de agregados e valores em
  moedas de baixa denominação passam do limite); `string` obrigaria parsing em toda operação.
  `bigint` dá aritmética exata nativa. Custo: `bigint` não serializa direto em JSON — daí
  `valorInt` como string na fronteira (FR-008).
- **Parser de tempo retorna resultado + motivo, não lança.** Princípio IV: nada some
  silenciosamente, mas um carimbo ruim num payload não pode derrubar a ingestão do evento.
  O chamador decide (marcar `REVISAR`, usar `null`, etc.). Custo: todo chamador tem de tratar
  o `null`.
- **Distinção epoch s/ms por limiar de ordem de grandeza.** Simples e determinístico; a
  janela cinzenta (valores que caberiam nos dois) está fora de qualquer data plausível do
  negócio (≈ 1973 em ms vs ≈ ano 5138 em s). Alternativa rejeitada: exigir que a origem
  declare a unidade — os CSVs históricos não declaram.
- **`Moeda` = ISO 4217 validado, nunca string livre.** Conjunto aberto (não trava numa
  lista curta que a 1ª venda internacional quebraria) porém validado (código não-ISO vira
  evento a revisar, não valor aceito) — coerente com o tratamento de status. Custo: embarcar
  a lista de códigos ISO 4217 no `core` e mantê-la. Alternativa rejeitada: enum fechado
  curto (mexeria no `core` a cada moeda nova).
- **Funções de status são puras e sem tolerância temporal embutida.** "Está em atraso há
  quanto tempo" é estado derivado no contexto `contratos`, não no `core`. O `core` só
  responde à pergunta booleana sobre o enum.
- **Escopo é primitiva, não agregação.** `Dinheiro` não soma listas nem agrupa por moeda;
  isso é `f(eventos)` nas specs de ledger/contrato/dashboard (Princípio V). Recusar qualquer
  "helper de total" nesta spec.

## Dependencies

- Depende da **spec 001** (contexto `core` já existe com `EntidadeId` e `PlataformaOrigem`;
  config zod no boot; regra de import entre contextos; harness de teste).
- Depende da **constituição v1.1.0** (Padrões Transversais: dinheiro ×10000, tempo UTC,
  status canônico, auditoria, config).
- **Habilita**: 003 (auth usa config do `core`), 005 (`pessoa` usa auditoria), 006
  (`evento_origem` usa tempo + status), toda a Fase 2 — em especial 018 (ledger: `Dinheiro`
  + status), 019–022 (adapters: parser de tempo + status canônico), 025 (contratos: fold com
  `Dinheiro` + `StatusContratoCanonico`), 030 (dashboard: agregação por moeda) — e o registro
  de auditoria consumido pela 053.
