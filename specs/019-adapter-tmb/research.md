# Research — Adaptadores de borda da TMB (spec 019)

Fonte primária: `Documentação TMB.md` (webhook Vendas, webhook Financeiro, Etapas do
Checkout, TMB API). Contexto: `specs/006-*` (pipeline + porta `RegistrarEventoService`),
`specs/018-*` (`status-map` vazio + `EventoCanonico` no `core/pipeline/`), visão Apêndice A
(TMB) e Apêndice C (`ingestao/adapters/{tmb,…}`).

## D-R1 — As 4 fontes da TMB e o que cada uma carrega

| Fonte | Gatilho | Formato | Campo de status | Identidade | Observações |
| --- | --- | --- | --- | --- | --- |
| **webhook Vendas** | pedido **Efetivado** ou **Cancelado** | objeto JSON **achatado** | `status_pedido` | `pedido` (int) | `cliente` = nome string; `telefones` string; endereço em `endereco_*`; `valor_principal`/`valor_total`/`valor_entrada`/`taxa_administracao`; `utm_*`; `id_externo`. |
| **webhook Financeiro** | mudança de status de **parcela** | **array** `[{ "dados": {…} }]` | `status_pagamento` | `pedido_id` (int) + `parcela_id` | só `status` muda; traz `cliente`, `cliente_email`, `cliente_documento`, `parcela`, `vencimento_parcela`, `data_pagamento`, `repasse`. **Sem valores de venda.** |
| **API `GET /api/pedidos`** | pull sob demanda | objeto JSON por item, **paginado** (`pageNumber`/`pageSize`, default 7) | `status_pedido` | `pedido_id` (int) | "Consultar Pedidos **Efetivados**" — cancelamentos não vêm por aqui; filtro `data_inicio`/`data_final`/`produto_id`; auth `Authorization: Bearer <token>`; base `https://api.tmbeducacao.com.br`. |
| **CSV** | export manual / backfill | texto com cabeçalho | (coluna espelhando `status_pedido`) | coluna `pedido_id`/`pedido` | **Sem exemplo na doc** — formato é Assumption (colunas espelham webhook Vendas / API). |

**Decisão**: um `parse*()` puro por fonte, `tipoOrigem` distinto por fonte
(`tmb.webhook-vendas` / `tmb.webhook-financeiro` / `tmb.api` / `tmb.csv`), que é a chave
`fonte` do `status-map` (018 chama `mapearStatus(plataforma, tipoOrigem, bruto)`).

## D-R2 — Chave natural `id_origem` (resolvida com o dono do produto)

**`pedido` / `pedido_id`** (inteiro → string). Presente nas 3 fontes online e no CSV;
`id_externo` (referência de checkout externo) pode ser vazio em pedido criado no painel TMB,
então **não** serve de identidade. Consequência arquitetural: os 2 webhooks + a API + o CSV
de um mesmo pedido resolvem para `(TMB, "<pedido>")` — o `UPSERT_TRANSACAO` (018, upsert por
`@@unique(plataforma_origem, id_origem)`) garante **1 linha** (Regra Inviolável nº 1) sem
que o adapter precise saber disso. `id_externo` fica só no `payload_bruto` imutável (é o que
a spec 020 vai usar como ponte Asaas↔… se precisar; para a TMB não há vínculo).

## D-R3 — Webhook Financeiro é nível de parcela (resolvido com o dono do produto)

Um pedido em N parcelas gera N notificações; a única diferença semântica entre elas é
`status_pagamento`. **Decisão: colapsa para o pedido, último evento vence.**

- Cada `{dados}` do array vira **um `EventoCanonico`** próprio (`hash` distinto → `evento_origem`
  distinto e imutável — o histórico de todas as parcelas fica no ledger de eventos).
- `UPSERT_TRANSACAO` (018) já faz upsert por `(plataforma, id_origem)`: o `status_canonico`
  da transação passa a refletir o **último** evento que o worker processou.
- **Limitação documentada**: não existe (nesta fatia) um "estado da carteira de parcelas"
  no ledger — só o pedido. Um refino (inadimplência por parcela) é spec futura de cobranças;
  o dado bruto para reconstruí-lo já está persistido.
- `status_financeiro` a **nível de pedido** (`Adimplente`/`Inadimplente`, que aparece no
  retorno da API e no webhook Vendas) **não** é um estado de transação — é resumo de
  carteira. **Não entra no `status-map`**; fica no `payload_bruto`.

Ordem de status canônico para `tmb.webhook-financeiro`: `Recebido → PAGO`,
`Aguardando pagamento → PENDENTE`, `Vencido → EM_ATRASO`, `Estornado → ESTORNADO`,
`DELETED → CANCELADO`. `Estornado` também casa o regex de estorno de `classificar` (006) →
`classificacao = REEMBOLSO` automaticamente (o adapter não classifica — D-10).

## D-R4 — Escopo CSV + API (resolvido com o dono do produto)

**Parser puro + endpoints finos em `/ingestao/tmb/*`.** A superfície `admin/` completa
(`/admin/importar-csv/{conta}`, `/admin/sincronizar`) da visão fica para a spec de
migração/admin — abrir o `AdminModule` de verdade agora seria prematuro (ele está vazio
desde a 001).

- `POST /ingestao/tmb/sincronizar` (autenticado, `evento:ingerir`): `{ dataInicio?,
  dataFinal?, produtoId?, pageSize? }` → pagina `GET /api/pedidos` via `TmbApiClient` →
  `parsePedidoApi` cada item → `RegistrarEventoService`. Commit por página. Sem
  `TMB_API_BASE_URL`/`TMB_API_KEY` → **422** (não 500).
- `POST /ingestao/tmb/importar-csv` (autenticado, `evento:ingerir`): `{ conteudo: string,
  fonte?: "tmb.csv" }` → quebra linhas → `parseCsv` → `RegistrarEventoService`. CSV como
  **texto no corpo JSON** — **0 dep de upload binário** (`multer` não está instalado; mesmo
  precedente da spec 015 que trafegou CSV como texto).

## D-R5 — `TmbApiClient` com `fetch` nativo (0 dep)

Interface + token DI (`TMB_API_CLIENT`), impl real com `fetch` do Node 24; **dublê nos
testes** (mesmo padrão de `GraphApiClient`/011, `SugestaoIaClient`/013). A impl:

```
GET {TMB_API_BASE_URL}/api/pedidos?pageNumber=N&pageSize=P[&data_inicio=&data_final=&produto_id=]
Authorization: Bearer {TMB_API_KEY}
```

Paginação: incrementa `pageNumber` a partir de 1 até a resposta vir vazia (ou
`< pageSize` itens). `pageSize` default **50** (a doc sugere 7 — subimos para reduzir
round-trips; a doc não define teto). Timeout via `AbortSignal.timeout(15_000)`. Resposta
não-2xx → `erro` na página, a sincronização segue com o que já registrou (US3 cenário 4).
A doc mostra o retorno como **um objeto** no exemplo, mas descreve "lista paginada" —
o client aceita `Array` ou `{ itens: [...] }` ou `{ data: [...] }` e normaliza (defensivo).

## D-R6 — Autenticação do webhook

`WebhookAuthenticator` da 003 (`autenticar('TMB', token)` — compara `TMB_WEBHOOK_TOKEN` em
tempo constante). A doc da TMB deixa o **nome do header** configurável ("Chave" + "Valor" na
tela). **Assumption**: header `x-tmb-webhook-token` (case-insensitive), com `authorization:
Bearer <token>` como _fallback_ aceito. Sem token / errado → **401** genérico, **nenhum**
`evento_origem`. Isto é separado do `JwtAuthGuard` (rota `@Public()` pelo prefixo
`/webhooks/`, 003). **Não** usa HMAC (a TMB não assina o corpo — diferente do WhatsApp/011).

## D-R7 — Resiliência do webhook (não perder evento, não entrar em loop)

| Situação | Resposta HTTP | `evento_origem` |
| --- | --- | --- |
| token inválido/ausente | **401** | não criado |
| parse OK + persistência OK | **202** `{ registrados: n }` | criado, `evento_canonico` preenchido |
| parse com erro (sem `pedido`, payload estranho) + persistência OK | **202** `{ registrados: n, ignorados: m }` | criado com `evento_canonico` **nulo** → `classificar` marca `revisar` |
| persistência falhou (`RegistrarEventoService` lançou) | **5xx** | — (a TMB reenvia; visão 5.3) |

A doc da TMB pede explicitamente: "não gerar exceções caso a TMB devolva novos atributos
não tratados" → o parser **ignora chaves desconhecidas** (nunca `.strict()` no payload
cru; o `eventoCanonicoSchema` do `core` valida a **saída** do parser, não a entrada).

## D-R8 — Mapa de valores monetários (D-04)

TMB não expõe moeda (100% BRL) nem método de pagamento nem vencimento (visão Apêndice A).

| Campo canônico | Origem TMB (Vendas/API) | Regra |
| --- | --- | --- |
| `valores.bruto` | `valor_principal` | ticket da venda, antes de juros de parcelamento |
| `valores.taxas` | `taxa_administracao` | o que a TMB retém |
| `valores.liquido` | — | `valor_principal − taxa_administracao` **só se ambos numéricos**; senão omitido |
| (nada) | `valor_total`, `valor_entrada`, `valor_parcela`, `repasse` | só `payload_bruto` |

`taxa_administracao` na doc aparece como `5.00` (parece **percentual**, não valor). **Risco
conhecido**: se for `%`, `valores.taxas` ficaria errado. Mitigação: o parser trata
`taxa_administracao` como **valor absoluto em BRL** (o nome e o tipo `double` sugerem valor);
se as fixtures reais mostrarem que é `%`, troca-se para `valor_principal * taxa/100` numa
linha — documentado como Assumption. `valores.liquido` só é emitido quando o resultado é
`> 0` e `< valores.bruto` (guarda de sanidade).

Conversão número → `Dinheiro`: `dinheiroDeValorTmb(v)`:
1. `null`/`undefined`/`''` → `undefined` (campo omitido).
2. `number` não-finito → `undefined` + erro.
3. `String(v)` → se casar `/^-?\d+(\.\d{1,4})?$/` → `Dinheiro.deDecimal(str, 'BRL')`.
4. `> 4` casas ou notação científica → arredonda para 4 casas via string (sem `parseFloat`)
   ou, se não der, `undefined` + erro.
5. Emite `{ valorInteiro: dinheiro.valorInt, moeda: 'BRL' }` (a forma que `eventoCanonicoSchema`
   aceita).

## D-R9 — Comprador achatado (webhook Vendas)

- `cliente`: nome (string única) → `comprador.nome`.
- `documento`: só dígitos → `comprador.documentos: [<digits>]` (o DV é validado só na etapa
  2/005; o adapter não valida).
- `email` → `comprador.emails: [<raw>]` (normalização de e-mail é da etapa 2).
- `telefones` (`"+5511..., +5511..."`) + `telefone_ativo` → `telefonesDeString` divide por
  `,`/`;`/espaço, tira vazios, dedup → `comprador.telefones: string[]`.
- `endereco_logradouro`/`_numero`/`_bairro`/`_cidade`/`_estado`(uf)/`_cep`/`_pais` +
  `endereco_complemento` → `comprador.endereco` (campos opcionais do `enderecoSchema` do
  `core`; strings vazias viram `undefined`).
- Webhook Financeiro: só `cliente` / `cliente_email` / `cliente_documento` → comprador
  parcial (sem endereço/telefone). Suficiente para a etapa 2 casar por e-mail/doc.

## D-R10 — `ocorridoEm` (D-09)

- Vendas/API: `data_efetivado` se presente e não-vazio; senão `criado_em`; senão `''`
  (→ `parseInstante` devolve `null` + motivo → `precisa_revisao` na etapa 3).
- Financeiro: `data_pagamento` se presente; senão `vencimento_parcela`; senão `''`.
- O parser **não** chama `parseInstante` (mantém-se livre de locale/tempo) — passa a string
  crua em `EventoCanonico.ocorridoEm`; a etapa 3 (018) aplica `parseInstante`. Formatos
  reais da TMB (`2025-04-23T14:32:19.601455-03:00`, `2025-04-23T14:32:46.752423` naïve) já
  são cobertos pelo parser de borda do `core` (spec 002).

## D-R11 — Parser de CSV à mão (0 dep)

- Detecta separador: conta `,` vs `;` na **linha de cabeçalho**; o maior vence; empate → `,`.
- Suporta aspas duplas com escape `""` e separador dentro de aspas (mini state machine por
  linha; sem multilinha dentro de aspas na v1 — Assumption, exports da TMB não têm campo com
  `\n`).
- Tira BOM (`﻿`) do início do conteúdo.
- Mapa de colunas → nomes canônicos (aceita `pedido_id` **ou** `pedido`; `status_pedido`;
  `cliente`; `documento`; `email`; `valor_principal`; `taxa_administracao`; `criado_em`;
  `data_efetivado`; `endereco_*`; `utm_*`). Coluna ausente → campo omitido.
- Linha vazia → pulada (sem erro). Linha sem valor na coluna de pedido → `ResultadoParseTmb`
  com `erros: ["linha N: sem identificador de pedido"]` e `eventoCanonico` ausente.
- `parseCsv(conteudo) → ResultadoParseTmb[]` (1 por linha de dado); o service registra as
  que têm `eventoCanonico` e soma as demais em `ignoradas`.

## D-R12 — Onde os arquivos moram (Princípio VI)

- `src/ingestao/adapters/tmb/**` — parsers puros + `TmbApiClient` + fixtures. Importa `core`
  e utilitários locais. **Proibido** importar `financeiro`/`clientes` (ESLint já cobre
  `ingestao → financeiro/clientes`; `grep` no e2e reforça a subpasta).
- `src/ingestao/tmb/**` — controllers finos + services de sync/import. Importam
  `RegistrarEventoService` (mesmo módulo), `WebhookAuthenticator` (`auth`, infra
  transversal, permitido — mesmo precedente de `eventos.controller.ts` importar
  `RequerPermissao`), os parsers de `../adapters/tmb`, o `TmbApiClient`.
- `src/financeiro/domain/status-map/tmb.ts` — só `import { StatusTransacaoCanonico } from
  '../../../core/core.module'`. **Proibido** importar `ingestao`.
- `ingestao.module.ts` — registra os 2 controllers, os 2 services, e o provider
  `{ provide: TMB_API_CLIENT, useClass: TmbApiClientHttp }` (dublê o substitui no e2e).

## Alternativas consideradas e rejeitadas

| Alternativa | Rejeitada porque |
| --- | --- |
| Parser de CSV com `csv-parse`/`papaparse` | +1 dep para 1 formato simples e sob nosso controle (export interno). O parser à mão é ~60 linhas e testável contra fixture. Mesmo princípio da 015. |
| `id_origem = id_externo` | Pode ser vazio em pedido do painel; quebra identidade. (Dono do produto escolheu `pedido`.) |
| Webhook Financeiro cria transação de parcela (`id_origem = parcela_id`) | Infla a contagem de transações vs. as outras plataformas e contraria "a chave é o pedido". (Dono do produto escolheu colapsar.) |
| `status-map` sob `src/ingestao/adapters/tmb/` (Apêndice C) | `financeiro` é dono de `status_canonico` e **não pode importar `ingestao`** (Princípio VI). A 018 já resolveu isso: mapa vive em `financeiro/domain/status-map/`, adapter só produz `statusOrigem` cru. |
| Endpoints sob `/admin/*` já nesta spec | `AdminModule` está vazio desde a 001; abri-lo com 1 recurso é prematuro. Fica para a spec de migração. (Dono do produto escolheu `/ingestao/tmb/*`.) |
| `parse*()` chamando `parseInstante`/normalizando datas | Acopla o parser a tempo/locale. O `EventoCanonico` transporta a string crua; a etapa 3 (018) já normaliza com o parser de borda do `core`. |
| Sincronização automática por `setInterval` (como o worker da 006) | Princípio VIII: "nenhuma sincronização automática com API externa — só sob demanda, com confirmação no backend". `POST /ingestao/tmb/sincronizar` manual. |
