# Data Model — Adaptadores de borda da Guru (spec 021)

## Entidades de banco

**Nenhuma.** 0 migração, 0 tabela, 0 enum, 0 coluna. O adapter só produz o contrato
`EventoCanonico` (do `core`, spec 006/018) e o alimenta na porta da etapa 0
(`RegistrarEventoService`, spec 006). `evento_origem` / `evento_etapa` / `transacao` já
existem e são escritos **só** pelo pipeline.

## Contratos de código (sem persistência)

### `FonteGuru` / `ContaGuru` / `ResultadoParseGuru` (`src/ingestao/adapters/guru/tipos.ts`)

```ts
export type FonteGuru = 'guru.webhook' | 'guru.api' | 'guru.csv';
export type ContaGuru = 'GURU_PRD' | 'GURU_SVC';

export interface ResultadoParseGuru {
  /** presente sse o parse produziu um EventoCanonico válido (passou no eventoCanonicoSchema). */
  eventoCanonico?: EventoCanonico;
  /** String(transaction.id) quando identificável — log + chave de dedup. */
  idOrigem?: string;
  tipoOrigem: FonteGuru;
  /** payload/linha cru — repassado a RegistrarEventoService. No webhook, SEM `api_token`. */
  payloadBruto: unknown;
  /** erros não-fatais de parse. Nunca lança. */
  erros: string[];
}
```

### `GuruApiClient` (`src/ingestao/adapters/guru/guru-api-client.port.ts`)

```ts
export const GURU_API_CLIENT = Symbol('GURU_API_CLIENT');

export type CampoDataGuru = 'ordered_at' | 'confirmed_at' | 'cancelled_at';

export interface ParametrosListarTransacoes {
  conta: ContaGuru;
  dataInicio: string;   // YYYY-MM-DD -> <campoData>_ini
  dataFinal: string;    // YYYY-MM-DD -> <campoData>_end
  campoData: CampoDataGuru;
  cursor?: string;      // undefined na 1ª página; body.next_cursor nas seguintes
}

export interface PaginaTransacoes {
  itens: unknown[];
  /** body.next_cursor quando há mais páginas; undefined encerra a paginação. */
  proximoCursor?: string;
}

export interface GuruApiClient {
  listarTransacoes(p: ParametrosListarTransacoes): Promise<PaginaTransacoes>;
}

export class GuruApiIndisponivelError extends Error {
  constructor(conta: string) {
    super(`conta ${conta} sem API configurada`);
    this.name = 'GuruApiIndisponivelError';
  }
}
```

Impl real `GuruApiClientHttp` (`fetch` nativo, header `Authorization: Bearer
<GURU_<conta>_API_KEY>` + `Accept` + `User-Agent`, base `GURU_<conta>_API_BASE_URL` ??
`https://digitalmanager.guru/api/v2`). Lança `GuruApiIndisponivelError` se a chave da conta
não estiver configurada — o service converte para **422**. Dublê nos testes.

## Mapa de campos: payload Guru → `EventoCanonico`

Campos **obrigatórios** do `EventoCanonico` (schema do `core`): `plataformaOrigem`,
`idOrigem`, `tipoOrigem`, `statusOrigem`, `ocorridoEm`. Todo o resto é opcional e só é
emitido quando a fonte carrega o dado.

### Fonte 1 — webhook de Vendas (`guru.webhook`)

Entrada: objeto de transação Guru (ou array disso). `conta` vem do path
(`/webhooks/guru/prd` → `GURU_PRD`). `payloadBruto` = corpo **sem** `api_token`.

| `EventoCanonico` | Origem | Transformação |
| --- | --- | --- |
| `plataformaOrigem` | — | `conta` (param) |
| `idOrigem` | `t.id` | `String(t.id)`; ausente → erro, sem `eventoCanonico` |
| `tipoOrigem` | — | literal `"guru.webhook"` |
| `statusOrigem` | `t.status` | `String(t.status ?? "")` cru |
| `ocorridoEm` | `t.dates.confirmed_at` ?? `.ordered_at` ?? `.created_at` ?? `.updated_at` | string crua; ausente → `""` |
| `valores.bruto` | `t.payment.gross` | `dinheiroDeValorGuru(v, erros, "gross", moeda)` |
| `valores.liquido` | `t.payment.net` | idem |
| `valores.taxas` | `t.payment.tax.value` ?? (`gross − net`) | só se `0 < taxa < bruto` |
| `moeda` (dos 3) | `t.payment.currency` | `ehMoeda(c) ? c : "BRL"` (erro não-fatal se inválida) |
| `comprador.nome` | `t.contact.name` | `textoOuUndefined` |
| `comprador.emails` | `t.contact.email` | `[email]` se não-vazio |
| `comprador.documentos` | `t.contact.doc` | `[soDigitos(doc)]` se ≥ 1 dígito |
| `comprador.telefones` | `t.contact.phone_local_code` + `t.contact.phone_number` | `telefonesDeString(...)` |
| `comprador.endereco` | `t.contact.address*` | `enderecoDeGuru({...})` (logradouro/numero/complemento/bairro/cidade/uf/cep/pais) |
| `oferta.codigoOrigem` | `t.product.offer.id` ?? `t.items[0].offer.id` | `textoOuUndefined` |
| `oferta.nomeOrigem` | `t.product.offer.name` ?? `t.product.name` ?? `t.items[0].name` | `textoOuUndefined` |
| `oferta.quantidade` | `t.product.qty` | inteiro quando > 0 |
| `assinatura.ehRecorrencia` | `t.product.type === "plan"` && `t.subscription.id` | `true` (senão bloco omitido) |
| `assinatura.numeroCiclo` | `t.invoice.cycle` | inteiro quando > 0 |
| `ehAfiliada` | `t.type` | `true` sse `String(t.type) === "affiliate"`; senão indefinido |
| `referenciaExterna` | — | **nunca** (a Guru é a origem — G-02) |
| `classificacao` | — | **nunca** (etapa 1/006 resolve) |

`api_token`, `webhook_type`, `payment.marketplace_id`, `payment.marketplace_name`,
`payment.coupon`, `payment.installments`, `payment.total`, `payment.discount_value`,
`payment.affiliate_value`, `dates.warranty_until`, `affiliations`, `source.*`,
`infrastructure.*` → **só `payload_bruto`** (e `api_token` nem lá).

### Fonte 2 — API `GET /api/v2/transactions` (`guru.api`)

O objeto de `data[]` tem a **mesma forma** do de webhook (menos `api_token`/`webhook_type`)
→ reaproveita **exatamente** a montagem da Fonte 1, só troca `tipoOrigem` para `"guru.api"`.
`conta` vem do DTO.

### Fonte 3 — CSV (`guru.csv`)

`parseCsvGuru(conteudo, conta)` detecta separador, lê cabeçalho, mapeia colunas e monta o
`EventoCanonico`.

| `EventoCanonico` | Coluna CSV (aliases) | Transformação |
| --- | --- | --- |
| `idOrigem` | `id` \| `transacao` \| `codigo` \| `codigo_transacao` | sem valor → erro por linha |
| `tipoOrigem` | — | `"guru.csv"` |
| `statusOrigem` | `status` \| `situacao` | cru (enum da API — Assumption) |
| `ocorridoEm` | `data_aprovacao` \| `data_pedido` \| `data_criacao` | string crua |
| `moeda` | `moeda` \| `currency` | `ehMoeda` ? : `"BRL"` |
| `valores.bruto` | `valor_bruto` \| `valor` \| `valor_venda` | `dinheiroDeValorGuru` |
| `valores.liquido` | `valor_liquido` \| `liquido` | idem |
| `valores.taxas` | `taxa` \| `taxas` (ou derivado) | guarda de sanidade |
| `oferta.codigoOrigem` | `codigo_oferta` \| `oferta_id` | `textoOuUndefined` |
| `oferta.nomeOrigem` | `oferta` \| `produto` \| `nome_produto` | `textoOuUndefined` |
| `assinatura.ehRecorrencia` | `assinatura` \| `subscription` \| `tipo_produto` == `plan` | `true` sse não-vazio / `"plan"` |
| `assinatura.numeroCiclo` | `ciclo` \| `cycle` | inteiro > 0 |
| `ehAfiliada` | `tipo` \| `type` | `true` sse `"affiliate"` |
| `comprador.nome` | `nome` \| `cliente` \| `comprador` | `textoOuUndefined` |
| `comprador.emails` | `email` \| `e-mail` | `[email]` se não-vazio |
| `comprador.documentos` | `documento` \| `cpf_cnpj` \| `cpf` \| `cnpj` | `[soDigitos(..)]` |
| `comprador.telefones` | `telefone` \| `celular` \| `phone` | `telefonesDeString(..)` |

## Vocabulário de status — `src/financeiro/domain/status-map/guru.ts`

```ts
import { StatusTransacaoCanonico as S } from '../../../core/core.module';

const VOCABULARIO: Record<string, S> = {
  approved: S.PAGO,
  completed: S.PAGO,
  waiting_payment: S.PENDENTE,
  pending: S.PENDENTE,
  billet_printed: S.PENDENTE,
  processing: S.PENDENTE,
  analysis: S.PENDENTE,
  charging: S.PENDENTE,
  delayed: S.EM_ATRASO,
  in_recovery: S.EM_ATRASO,
  refunded: S.ESTORNADO,
  dispute: S.ESTORNADO,
  chargeback: S.CHARGEBACK,
  canceled: S.CANCELADO,
  expired: S.CANCELADO,
  rejected: S.RECUSADO,
  failed: S.RECUSADO,
  blocked: S.RECUSADO,
};

export const GURU: Record<string, Record<string, S>> = {
  'guru.webhook': VOCABULARIO,
  'guru.api': VOCABULARIO,
  'guru.csv': VOCABULARIO, // espelha o enum da API — Assumption
};
```

Registro em `status-map/index.ts`:
`Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU })`.

- `mapearStatus` (018) é chamado com `plataforma = entrada.plataformaOrigem` (`"GURU_PRD"` /
  `"GURU_SVC"`) e `fonte = tipoOrigem` — as duas contas mapeiam para o mesmo objeto.
- Chaves **case-sensitive**, **sem `trim`**. `RECUSADO` já existe no enum
  `StatusTransacaoCanonico` do `core` (Apêndice B).
- Qualquer bruto fora do mapa → `mapearStatus` devolve `DESCONHECIDO` + `revisar` + motivo.

## Índices / constraints

Nenhum. Dedup = `evento_origem @@unique(plataforma_origem, id_origem, hash)` (006); identidade
da transação = `transacao @@unique(plataforma_origem, id_origem)` (018) — ambas já existem.

## Retenção / LGPD

O `payload_bruto` da Guru contém PII (`contact.*` — nome, documento, e-mail, telefone,
endereço). Fica no `evento_origem` imutável — a pseudonimização (spec 047) opera sobre
`pessoa`, não sobre o evento cru. O **`api_token`** (segredo) é removido antes de persistir
(G-14). As **fixtures** do repositório usam dados fictícios.
