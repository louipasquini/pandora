# Contrato — Parsers puros da Asaas (spec 020)

```ts
type FonteAsaas = 'asaas.webhook' | 'asaas.api' | 'asaas.csv';
type ContaAsaas = 'ASAAS_PRD' | 'ASAAS_SVC';

interface ResultadoParseAsaas {
  eventoCanonico?: EventoCanonico;   // sse passou no eventoCanonicoSchema do core
  idOrigem?: string;                 // String(payment.id)
  tipoOrigem: FonteAsaas;
  payloadBruto: unknown;             // sempre o fato cru
  erros: string[];                   // nunca lança
}

parseWebhookAsaas(payload: unknown, conta: ContaAsaas): ResultadoParseAsaas[]
parsePagamentoApi(item: unknown, conta: ContaAsaas): ResultadoParseAsaas
parseCsvAsaas(conteudo: string, conta: ContaAsaas): ResultadoParseAsaas[]
```

## Invariantes

- **Puros**: sem NestJS, sem Prisma, sem `fetch`, sem `Date.now()`/locale. Dependem só de
  `Dinheiro`/`Moeda`/`eventoCanonicoSchema`/`PlataformaOrigem` do `core` e de utilitários
  locais de string.
- **Nunca lançam.** Falha estrutural → `eventoCanonico` ausente + `erros` descritivo.
- **Campo desconhecido no payload → ignorado** (a doc da Asaas evolui o schema).
- `plataformaOrigem` = `conta` (param) — o payload **nunca** a determina.
- `idOrigem = String(payment.id)` (ou coluna `id`/`identificador` no CSV). Ausente → sem
  `eventoCanonico`.
- `statusOrigem = payment.deleted === true ? "DELETED" : String(payment.status ?? "")`.
- `ocorridoEm` (webhook/API) = `paymentDate ?? confirmedDate ?? clientPaymentDate ??
  dateCreated ?? ""`; (CSV) = `data_pagamento ?? data_criacao ?? vencimento ?? ""`. String
  crua — `parseInstante` é aplicado a jusante (018).
- `valores.bruto` = `payment.value`; `valores.liquido` = `payment.netValue`; `valores.taxas`
  = `bruto − liquido` só se `0 < resultado < bruto`. Tudo via `dinheiroDeValorAsaas` →
  `{ valorInteiro: bigint ×10000, moeda: "BRL" }`. `float` nunca sai.
- `assinatura = { ehRecorrencia: true }` sse `payment.subscription` string não-vazia; senão
  bloco omitido.
- `referenciaExterna = { idOrigem: payment.externalReference }` sse não-vazio — **nunca**
  emite `plataforma` (A-02; a spec 024 resolve o vínculo Asaas↔Guru).
- `oferta = { nomeOrigem: payment.description }` sse não-vazio; sem `codigoOrigem`.
- `comprador`: **omitido** no webhook/API (o `payment` não traz contato do cliente); montado
  das colunas `cliente`/`email`/`cpf_cnpj`/`telefone` no CSV.
- `ehAfiliada` / `classificacao` — **nunca** emitidos (etapa 1/006 resolve).
- A saída é validada com `eventoCanonicoSchema.safeParse` (`.strict()` — só sobre a saída do
  parser); falha de schema → `eventoCanonico` ausente + `erros`.

## Mapa de campos por fonte

Ver `data-model.md` (tabelas por fonte). Fonte 2 (API) reaproveita **exatamente** a montagem
da Fonte 1 (o objeto `payment` é idêntico), trocando `tipoOrigem`. Fonte 3 (CSV) mapeia
colunas (aliases inglês/pt-BR) para os mesmos nomes e monta comprador.
