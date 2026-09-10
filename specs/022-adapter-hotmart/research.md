# Research — Adaptadores de borda da Hotmart (spec 022)

Molde herdado das specs 019 (TMB), 020 (Asaas), 021 (Guru). Só o que é **específico da
Hotmart** ou uma decisão nova está aqui; o resto (parser puro devolve `ResultadoParse*`
uniforme, `montarResultado` valida com `eventoCanonicoSchema`, endpoints finos chamam só
`RegistrarEventoService`, CSV à mão sem dep, `status-map` em `financeiro/`) segue idêntico e
está documentado nas specs anteriores.

## D-R1 — OAuth2 `client_credentials` com cache de token em memória

A Hotmart é a única das 4 plataformas que não usa token estático. Fluxo:

```
POST https://api-sec-vlc.hotmart.com/security/oauth/token
     ?grant_type=client_credentials&client_id=<id>&client_secret=<secret>
Authorization: Basic <HOTMART_<conta>_API_KEY>      (token Basic entregue pelo painel)
→ 200 { "access_token": "...", "token_type": "bearer", "expires_in": 3600 }
```

`HotmartApiClientHttp` mantém `Map<ContaHotmart, { token: string; expiraEm: number }>`.
`garantirToken(conta)` renova quando `Date.now() >= expiraEm - 60_000`. O token nunca sai do
client — não vai para `payload_bruto`, log de evento nem resposta HTTP (H-14). Sem dep nova:
`fetch` nativo do Node 24 (padrão dos 3 clients anteriores).

**Rejeitado:** biblioteca OAuth (`simple-oauth2`, `openid-client`). O fluxo
`client_credentials` é 1 POST — não justifica dependência.

## D-R2 — Duas chamadas de rede, merge por `transaction` (H-02)

`sales/history` e `sales/price/details` são coleções paralelas filtradas pela **mesma**
janela. `HotmartSyncService`:

1. pagina `listarVendas` → lista de itens de venda (commit de eventos por página);
2. pagina `listarDetalhesPreco` → `Map<transaction, detalhePreco>`;
3. para cada venda, `parseVendaApi(item, conta, mapaDetalhe.get(item.purchase.transaction))`.

Ordem: detalhes de preço são paginados **primeiro** (montam o mapa), depois as vendas. Assim
cada venda já encontra seu detalhe. Detalhe órfão (sem venda) é ignorado; venda sem detalhe é
registrada só com `sales/history` (FR-013). `sales/price/details` acrescenta ao
`payload_bruto` sob a chave `price_details` e refina `valores.taxas` = `fee.value + vat.value`
(guarda `0 < taxa < bruto`, mesma moeda). `coupon` / `base` / `real_conversion_rate` não têm
slot canônico nesta fatia → só `payload_bruto` (precedente cupom/garantia da Guru/021).

## D-R3 — Webhook stub desligado por flag (H-03)

A política do dono do produto (visão Parte 7): "ativar o webhook da Hotmart, mas **não na
v1**". Esta spec entrega o esqueleto pronto:

- **`parseWebhookHotmart`** — parser **completo**, coberto por fixture nos testes unitários,
  independente do flag. Lê `{ id, event, version, creation_date, data: { product, buyer,
  purchase, subscription, affiliates, commissions } }` e mapeia de `data.*` para o mesmo
  `EventoCanonico` da FR-001. Fonte de status = `data.purchase.status` (não o `event`).
- **`HotmartWebhooksController`** — `POST /webhooks/hotmart/{prd,svc}`. **Guarda de flag no
  topo do handler**: `HOTMART_WEBHOOK_ENABLED !== true` → `503 { message: "webhook Hotmart
  não habilitado nesta versão" }`, **antes** de autenticar/parsear. `503` (não `501`/`404`)
  porque é a resposta que faz a Hotmart reagendar quando a feature ligar — mas em v1 nenhuma
  URL está registrada no painel da Hotmart, então não há tráfego real.
- Ligado (`HOTMART_WEBHOOK_ENABLED=true`): autentica `hottok` via `WebhookAuthenticator`
  (header `x-hotmart-hottok` | `authorization: Bearer`) → parseia (removendo `hottok` do
  corpo, defesa) → registra → `200`.

**Rejeitado:** não entregar o webhook (só a nota "feature futura"). O dono do produto pediu o
esqueleto explicitamente; o parser é barato e o custo de manter a rota desligada é 1 `if`.

## D-R4 — Chave natural, valores, datas

- **`id_origem` = `purchase.transaction`** (H-04). String tipo `"HP17715690036014"`,
  consistente nas 3 fontes. Por conta (a `PlataformaOrigem` desambigua).
- **Valores** (H-11): `bruto` = `purchase.price.value`; moeda = `price.currency_code`
  (API) / `price.currency_value` (webhook) / coluna (CSV) ?? `BRL`. `taxas` = `hotmart_fee.total`
  (API) ou `fee+vat` (detalhe de preço) sob guarda `0 < taxa < bruto` + mesma moeda; `liquido`
  = `bruto − taxas` sob a mesma guarda. `Dinheiro.deDecimal` (escala ×10000, sem `float`).
- **Datas** (H-13/H-19): `approved_date` ?? `order_date`, epoch ms → `String(...)`, sem
  `parseInstante` no parser (a etapa 3/018 aplica; o limiar `1e11` do `core` distingue s/ms).
  O DTO de `/sincronizar` recebe `YYYY-MM-DD` e o client converte para ms.

## D-R5 — `status-map` não normaliza (herdado)

`mapearStatus` (018) é **case-sensitive, sem `trim`, sem sinônimos**. O vocabulário exato vem
das fixtures. A Hotmart usa `SCREAMING_SNAKE_CASE` (`APPROVED`, `WAITING_PAYMENT`). Um export
CSV com rótulos pt-BR (`Aprovada`…) → adiciona-se a entrada literal, nunca `.toUpperCase()`.

## D-R10 — Vocabulário de status da Hotmart → `StatusTransacaoCanonico`

Fonte: doc oficial (`transaction_status` de `sales/history` + `purchase.status` do webhook +
[central de ajuda "Quais status uma transação pode assumir"]). `hotmart.webhook` ==
`hotmart.api` == `hotmart.csv` (o CSV espelha o enum da API — Assumption).

| bruto (Hotmart) | canônico | nota |
| --- | --- | --- |
| `APPROVED` | `PAGO` | pagamento confirmado |
| `COMPLETE` | `PAGO` | garantia expirada, compra concluída |
| `PRINTED_BILLET` | `PENDENTE` | boleto emitido, aguardando pagamento |
| `WAITING_PAYMENT` | `PENDENTE` | aguardando pagamento (pix/cartão) |
| `UNDER_ANALISYS` | `PENDENTE` | em análise antifraude (grafia da Hotmart, com "I") |
| `PROCESSING_TRANSACTION` | `PENDENTE` | processando |
| `OVERDUE` | `EM_ATRASO` | recorrência/assinatura vencida |
| `NO_FUNDS` | `EM_ATRASO` | sem saldo — tentativa de recobrança em curso |
| `REFUNDED` | `ESTORNADO` | reembolso total |
| `PARTIALLY_REFUNDED` | `ESTORNADO` | reembolso parcial (o `status_canonico` já barra a receita) |
| `DISPUTE` | `ESTORNADO` | disputa aberta (aparece em `purchase.status` do webhook) |
| `CHARGEBACK` | `CHARGEBACK` | chargeback |
| `PROTESTED` | `CHARGEBACK` | protesto — tratado como disputa de chargeback |
| `CANCELLED` | `CANCELADO` | cancelada |
| `EXPIRED` | `CANCELADO` | expirou sem pagamento |
| `BLOCKED` | `RECUSADO` | bloqueada (risco) |
| `STARTED` | — (fora do mapa) | carrinho iniciado, sem semântica financeira → `DESCONHECIDO`+revisão |
| `PRE_ORDER` | — (fora do mapa) | pré-venda → `DESCONHECIDO`+revisão até fixture real |

Cada linha "no mapa" tem fixture no `hotmart.spec.ts` (SC-015). `STARTED`/`PRE_ORDER` ficam
fora **de propósito** (precedente `AUTHORIZED` da Asaas / `trial` da Guru): `mapearStatus`
devolve `DESCONHECIDO` + `revisar` — nunca um palpite (Regra Inviolável nº 15).

## D-R11 — Portas / ambiente e2e

Nenhuma porta nova de aplicação. Os e2e desta spec sobem um Postgres isolado
`pandora-db-spec022` na porta **55439** (55432/55433/55435/55436/55438 estão em uso por
outras sessões — verificado com `ss -ltn` + `docker ps` em 2026-09-10).

## D-R12 — CSV à mão (herdado da 019/020/021)

Cópia estrutural de `parse-linha-csv.ts` da Guru: detecta `,` vs `;` no cabeçalho, tira BOM,
mini state-machine de aspas (`""` = aspa literal, sem quebra de linha dentro de aspas), mapa
de colunas com aliases inglês/pt-BR. 0 dep.
