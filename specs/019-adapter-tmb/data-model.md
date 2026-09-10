# Data Model — Adaptadores de borda da TMB (spec 019)

## Entidades de banco

**Nenhuma.** 0 migração, 0 tabela, 0 enum, 0 coluna. O adapter só produz o contrato
`EventoCanonico` (do `core`, spec 006/018) e o alimenta na porta da etapa 0
(`RegistrarEventoService`, spec 006). `evento_origem` / `evento_etapa` / `transacao` já
existem e são escritos **só** pelo pipeline.

## Contratos de código (sem persistência)

### `ResultadoParseTmb` (`src/ingestao/adapters/tmb/tipos.ts`)

Saída **uniforme** dos 4 parsers.

```ts
export interface ResultadoParseTmb {
  /** presente sse o parse produziu um EventoCanonico válido (passou no eventoCanonicoSchema). */
  eventoCanonico?: EventoCanonico;
  /** String(pedido) quando identificável — usado para log e para a chave de dedup. */
  idOrigem?: string;
  /** rótulo da fonte; é a chave `fonte` do status-map. */
  tipoOrigem: 'tmb.webhook-vendas' | 'tmb.webhook-financeiro' | 'tmb.api' | 'tmb.csv';
  /** payload/linha cru — sempre repassado a RegistrarEventoService como payloadBruto. */
  payloadBruto: unknown;
  /** erros não-fatais de parse (campo faltando, valor não-numérico…). Nunca lança. */
  erros: string[];
}
```

Regra: se `erros` contém algo que impede montar identidade/estrutura mínima →
`eventoCanonico` fica `undefined` (o webhook/endpoint ainda registra o `payloadBruto`).

### `TmbApiClient` (`src/ingestao/adapters/tmb/tmb-api-client.port.ts`)

```ts
export const TMB_API_CLIENT = Symbol('TMB_API_CLIENT');

export interface TmbApiClient {
  listarPedidos(p: {
    dataInicio?: string;   // YYYY-MM-DD
    dataFinal?: string;
    produtoId?: number;
    pageNumber: number;    // 1-based
    pageSize: number;
  }): Promise<{ itens: unknown[]; temProximaPagina: boolean }>;
}
```

Impl real `TmbApiClientHttp` (`fetch` nativo, `Authorization: Bearer <TMB_API_KEY>`, base
`TMB_API_BASE_URL`). Lança `TmbApiIndisponivelError` se a env não estiver configurada — o
controller converte para **422**. Dublê nos testes.

## Mapa de campos: payload TMB → `EventoCanonico`

Campos **obrigatórios** do `EventoCanonico` (schema do `core`): `plataformaOrigem`,
`idOrigem`, `tipoOrigem`, `statusOrigem`, `ocorridoEm`. Todo o resto é opcional e só é
emitido quando a fonte carrega o dado.

### Fonte 1 — webhook Vendas (`tmb.webhook-vendas`)

| `EventoCanonico` | Origem (payload achatado) | Transformação |
| --- | --- | --- |
| `plataformaOrigem` | — | literal `TMB` |
| `idOrigem` | `pedido` | `String(pedido)`; ausente/0 → erro, sem `eventoCanonico` |
| `tipoOrigem` | — | literal `"tmb.webhook-vendas"` |
| `statusOrigem` | `status_pedido` | cru (string); ausente → `""` |
| `ocorridoEm` | `data_efetivado` \|\| `criado_em` | string crua (D-R10); ausente → `""` |
| `comprador.nome` | `cliente` | trim; `""` → omitido |
| `comprador.emails` | `email` | `[email]` se não-vazio |
| `comprador.telefones` | `telefones` + `telefone_ativo` | `telefonesDeString` (split `,;` espaço, dedup) |
| `comprador.documentos` | `documento` | `[soDigitos(documento)]` se ≥ 1 dígito |
| `comprador.endereco` | `endereco_logradouro/_numero/_complemento/_bairro/_cidade/_estado/_cep/_pais` | `enderecoDeTmb` (vazios → `undefined`; `uf` ← `endereco_estado`) |
| `valores.bruto` | `valor_principal` | `dinheiroDeValorTmb` → `{ valorInteiro, moeda:"BRL" }` |
| `valores.taxas` | `taxa_administracao` | `dinheiroDeValorTmb` (D-R8: tratado como valor absoluto) |
| `valores.liquido` | derivado | `bruto − taxas` só se `0 < resultado < bruto` |
| `oferta.nomeOrigem` | `titulo` \|\| `code` | trim; ambos vazios → `oferta` omitido |
| `assinatura` | — | **nunca** (TMB não tem recorrência) |
| `ehAfiliada` | — | **nunca** emitido → `classificar` assume não-afiliada |
| `referenciaExterna` | — | **nunca** (não há vínculo cross-plataforma na TMB) |
| `classificacao` | — | **nunca** (etapa 1/006 resolve) |

`utm_*`, `valor_total`, `valor_entrada`, `valor_parcela`, `id_externo`, `nascimento`,
`melhor_dia_pagamento`, avalista, `status_financeiro` → **só `payload_bruto`**.

### Fonte 2 — webhook Financeiro (`tmb.webhook-financeiro`)

Entrada: `[{ dados: {...} }, …]` (ou objeto único `{dados}` / achatado — tolerado). **1
`ResultadoParseTmb` por item.**

| `EventoCanonico` | Origem (`dados`) | Transformação |
| --- | --- | --- |
| `idOrigem` | `pedido_id` | `String(pedido_id)`; ausente → erro |
| `tipoOrigem` | — | `"tmb.webhook-financeiro"` |
| `statusOrigem` | `status_pagamento` | cru |
| `ocorridoEm` | `data_pagamento` \|\| `vencimento_parcela` | string crua |
| `comprador.nome` | `cliente` | trim |
| `comprador.emails` | `cliente_email` | `[…]` se não-vazio |
| `comprador.documentos` | `cliente_documento` | `[soDigitos(…)]` |
| `valores.*` | — | **NÃO EMITIDO** (FR-012 — evita `camposAlterados` zerar valor da venda) |
| `oferta.nomeOrigem` | `produto` | trim; vazio → omitido |

`parcela`, `parcela_id`, `repasse`, `modalidade_contrato`, `lancamento_id`,
`valor_parcela_sem_juros` → só `payload_bruto`.

### Fonte 3 — API `GET /api/pedidos` (`tmb.api`)

Igual à Fonte 1 nos campos de comprador/valores, com os nomes da API:

| `EventoCanonico` | Origem (item da API) |
| --- | --- |
| `idOrigem` | `pedido_id` |
| `tipoOrigem` | `"tmb.api"` |
| `statusOrigem` | `status_pedido` |
| `ocorridoEm` | `data_efetivado` \|\| `criado_em` |
| `comprador.telefones` | `telefone` (singular na API) → `telefonesDeString` |
| `comprador.endereco` | `endereco_logradouro/_numero/_bairro/_cidade/_estado`, `cep`, `pais` |
| `valores.bruto` | `valor_principal` (ou `valor_total` se `valor_principal` ausente — a API às vezes só traz `valor_total`; Assumption, ajustar por fixture) |
| `valores.taxas` | `taxa_administracao` |

### Fonte 4 — CSV (`tmb.csv`)

`parseCsv(conteudo)` detecta separador, lê cabeçalho, mapeia colunas para os nomes da Fonte
1/3 e reaproveita a mesma montagem. Coluna de pedido: aceita `pedido_id` **ou** `pedido`.
Sem coluna de pedido no cabeçalho → **todas** as linhas em `erros` (um por linha) + resposta
não-500.

## Vocabulário de status — `src/financeiro/domain/status-map/tmb.ts`

```ts
import { StatusTransacaoCanonico as S } from '../../../core/core.module';

export const TMB: Record<string, Record<string, S>> = {
  'tmb.webhook-vendas': {
    Efetivado: S.PAGO,
    Cancelado: S.CANCELADO,
  },
  'tmb.api': {
    Efetivado: S.PAGO,
    Cancelado: S.CANCELADO,
  },
  'tmb.webhook-financeiro': {
    Recebido: S.PAGO,
    'Aguardando pagamento': S.PENDENTE,
    Vencido: S.EM_ATRASO,
    Estornado: S.ESTORNADO,
    DELETED: S.CANCELADO,
  },
  'tmb.csv': {
    Efetivado: S.PAGO,
    Cancelado: S.CANCELADO,
    // vocabulário de export real a confirmar por fixture (pt-BR: "Adimplente" NÃO é status de transação)
  },
};
```

Registro em `status-map/index.ts`: `Object.assign(MAPAS_STATUS, { TMB })`.

- Chaves **case-sensitive** e **sem `trim`** — `mapearStatus` (018) não normaliza; o
  vocabulário exato vem da fixture real. Se a TMB mandar `"efetivado"` minúsculo numa
  fixture, adiciona-se a entrada minúscula (não se implementa `.toLowerCase()` — Regra nº
  15 / gambiarra 4.4).
- `status_financeiro` (`Adimplente`/`Inadimplente`) **não entra** (não é status de transação).
- Qualquer bruto fora do mapa → `mapearStatus` devolve `DESCONHECIDO` + `revisar` + motivo
  (comportamento da 018; esta spec só popula o mapa e o cobre com fixtures).

## Índices / constraints

Nenhum. A dedup é `evento_origem @@unique(plataforma_origem, id_origem, hash)` (006) e a
identidade da transação é `transacao @@unique(plataforma_origem, id_origem)` (018) — ambas
já existem.

## Retenção / LGPD

O `payload_bruto` da TMB contém PII (nome, documento, e-mail, telefone, endereço,
nascimento). Fica no `evento_origem` imutável — a pseudonimização (spec 047) opera sobre
`pessoa`, não sobre o evento cru (mesma política da 006/011). As **fixtures** do repositório
usam dados fictícios.
