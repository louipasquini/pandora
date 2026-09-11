# Data Model: Contratos · Aditivos · Fold

## `Contrato`

| Campo | Tipo | Origem | Nota |
| --- | --- | --- | --- |
| `id` | UUID v7 | gerado | PK |
| `pessoaId` | UUID | FK `Pessoa` | `onDelete: Restrict` |
| `produtoId` | UUID | FK `Produto` | `onDelete: Restrict` |
| `fimAcesso` | `timestamptz?` | **derivado** (fold) | `null` = nunca teve aditivo que concedesse acesso |
| `ticketTotal` | `Json` (`Record<moeda,string>`) | **derivado** (fold) | soma de `valor_bruto` das vendas próprias/recorrências |
| `valorRecebido` | `Json` (`Record<moeda,string>`) | **derivado** (fold) | soma de `valor_líquido`/`bruto` onde `contaComoReceita()` |
| `toleranciaAtrasoDias` | `Int` (default 0) | **curado** | aplicada na leitura, nunca no fold |
| `contratoAssinado` | `Boolean` (default false) | **curado** | sem par derivado |
| `ajusteManualStatus` | `StatusContratoCanonico?` | **curado, temporário** | limpo pelo próximo fold (CL-01) |
| `ajusteManualEm` / `ajusteManualAutor` / `ajusteManualMotivo` | | **curado, temporário** | idem — limpos junto |
| `criadoEm` / `atualizadoEm` | `timestamptz` | auto | |

Constraint: `@@unique([pessoaId, produtoId], name: "contrato_pessoa_produto")` — Regra
Inviolável nº 3, garantida pelo banco (não só pela aplicação).

Campos **calculados na leitura, nunca persistidos**: `statusCanonico`, `acessoLiberado`
(`contratos/domain/status-contrato.ts`).

## `Aditivo`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id` | UUID v7 | PK |
| `contratoId` | UUID | FK `Contrato`, `onDelete: Cascade` |
| `transacaoId` | UUID, `@unique` | FK `Transacao`, `onDelete: Cascade` — 1:1 |
| `rotulo` | `AditivoRotulo` | `COMPRA_INICIAL\|RENOVACAO\|PRORROGACAO\|REEMBOLSO\|SEM_EFEITO` |
| `fimAcessoResultante` | `timestamptz?` | valor de `fimAcesso` do contrato **depois** de aplicar este aditivo, na ordem do fold |
| `precisaRevisao` / `motivoRevisao` | `Boolean` / `String?` | ex.: "tempo de acesso não cadastrado" |
| `criadoEm` / `atualizadoEm` | `timestamptz` | |

100% derivado/materializado — recalculado por completo a cada fold do contrato (upsert por
`transacaoId`, nunca acumula linha duplicada para a mesma transação).

## `ContratoAudit`

Forma canônica do `core` (`RegistroAuditoria`/`montarRegistroAuditoria`), mesma estrutura de
`crm_admin_audit`/`clientes_audit`/`rbac_audit` — append-only, 1 linha por campo
efetivamente alterado pelo `PATCH`.

## Enums Prisma novos

- `StatusContratoCanonico` — espelha o enum TS do `core` (`ATIVO`, `EXPIRADO`, `CANCELADO`,
  `DESCONHECIDO`); paridade travada por teste (mesmo padrão de `StatusTransacaoCanonico`/018).
  Usado só na coluna `ajusteManualStatus` (a coluna "viva" que representa o override).
- `AditivoRotulo` — `COMPRA_INICIAL`, `RENOVACAO`, `PRORROGACAO`, `REEMBOLSO`, `SEM_EFEITO`.

## Alterações em modelos existentes

- `Transacao.contratoId` (já existe, nullable, sem `@relation` desde a spec 018) ganha
  `@relation(fields: [contratoId], references: [id], onDelete: SetNull)` — mesmo tratamento
  que a spec 023 deu a `ofertaId` e a 024 deu a `transacaoVinculadaId`. Back-relation
  `Contrato.transacoes Transacao[]`.
- `Pessoa` ganha `contratos Contrato[]` (back-relation, sem novo campo).
- `Produto` ganha `contratos Contrato[]` (back-relation, sem novo campo).

## Fluxo do fold (puro, `contratos/domain/fold.ts`)

Entrada: lista de transações do contrato (id, classificacao, statusCanonico, valorBrutoInt+
Moeda, valorLiquidoInt+Moeda, ocorridoEm, tempoAcessoDias — já resolvido via `oferta_id` da
transação), ordenada por `ocorridoEm` (empate: `transacaoId`, para determinismo).

Para cada transação, na ordem:

1. `classificacao ∉ {VENDA_PROPRIA, RECORRENCIA, REEMBOLSO}` → não deveria chegar aqui
   (filtrado antes pelo executor); o fold ignora defensivamente.
2. `classificacao === REEMBOLSO` → `rotulo = REEMBOLSO`; não altera `fimAcesso`.
3. `!liberaAcesso(statusCanonico)` (ex.: `RECUSADO`/`CANCELADO`/`DESCONHECIDO` numa venda
   própria) → `rotulo = SEM_EFEITO`; não altera `fimAcesso`.
4. `tempoAcessoDias == null` → `rotulo = SEM_EFEITO`, `precisaRevisao = true`,
   `motivoRevisao = 'tempo de acesso não cadastrado na oferta'`; não altera `fimAcesso`.
5. Caso contrário (concede acesso e tempo conhecido):
   - `baseline = fimAcessoAtual` (estado corrente do fold, `null` se ainda não houve nenhum).
   - `rotulo = baseline == null ? COMPRA_INICIAL : (ocorridoEm > baseline ? RENOVACAO : PRORROGACAO)`.
   - `fimAcessoAtual = max(baseline ?? ocorridoEm, ocorridoEm) + tempoAcessoDias dias`.
6. Acumula `ticketTotal[moeda] += valorBruto` quando `classificacao ∈ {VENDA_PROPRIA, RECORRENCIA}`.
7. Acumula `valorRecebido[moeda] += (valorLiquido ?? valorBruto)` quando `contaComoReceita(statusCanonico)`.
8. Grava `fimAcessoResultante = fimAcessoAtual` (o valor corrente do fold, mesmo quando este
   aditivo específico não o alterou) para a linha do tempo mostrar a evolução completa.

Saída: `{ fimAcesso: fimAcessoAtual, ticketTotal, valorRecebido, aditivos: [...] }`. Função
pura, sem I/O, testável com fixtures simples — nenhuma dependência de banco.
