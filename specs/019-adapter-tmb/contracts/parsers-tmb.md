# Contract — Parsers puros da TMB

`src/ingestao/adapters/tmb/` — **funções puras** (sem NestJS, sem Prisma, sem `fetch`, sem
`Date.now()`/locale). Única dep além de utilitários locais: `core` (`Dinheiro.deDecimal`,
`eventoCanonicoSchema`, `PlataformaOrigem`).

## Assinaturas

```ts
export function parseWebhookVendas(payload: unknown): ResultadoParseTmb;
export function parseWebhookFinanceiro(payload: unknown): ResultadoParseTmb[];
export function parsePedidoApi(item: unknown): ResultadoParseTmb;
export function parseCsv(conteudo: string): ResultadoParseTmb[];
```

`ResultadoParseTmb` — ver `data-model.md`.

## Invariantes (valem para os 4)

1. **Nunca lançam.** Erro → entra em `erros[]`; se impede a identidade/estrutura mínima,
   `eventoCanonico` fica `undefined` (o `payloadBruto` ainda é repassado).
2. **`payloadBruto`** no resultado === entrada crua daquele fato (objeto/linha), para o
   `RegistrarEventoService` gravar imutável.
3. **Chaves desconhecidas no payload são ignoradas** (a doc da TMB pede isso). A validação
   `.strict()` é aplicada só na **saída** (`eventoCanonicoSchema.safeParse(montado)`); se
   falhar, `eventoCanonico` fica `undefined` + `erros: ["schema: <issue>"]`.
4. **`plataformaOrigem` = `TMB`** sempre. **`ehAfiliada`** nunca emitido. **`assinatura`**
   nunca emitida.
5. **Dinheiro**: só via `dinheiroDeValorTmb` → `{ valorInteiro: bigint ×10000, moeda: 'BRL' }`.
   Valor não-numérico/negativo/absurdo → campo omitido + `erros`. `float` nunca sai.
6. **Data**: string crua repassada em `ocorridoEm` (o parser **não** normaliza). `''` quando
   nenhuma fonte de data está presente.
7. **Determinismo**: mesma entrada → mesma saída, byte a byte (a ordem de `emails`/
   `telefones`/`documentos` é a ordem de aparição; telefones dedupados preservando a 1ª
   ocorrência).

## Helpers locais (`normalizar-tmb.ts`)

| Helper | Entrada | Saída |
| --- | --- | --- |
| `telefonesDeString(...partes: (string\|undefined)[])` | `"+5511999, 11888"`, `"11888"` | `["+5511999", "11888"]` (split `/[,;\s]+/`, trim, remove vazios, dedup 1ª ocorrência) |
| `soDigitos(s)` | `"123.456.789-00"` | `"12345678900"` (`""` se nenhum dígito) |
| `dinheiroDeValorTmb(v, moeda='BRL')` | `299.99` \| `"1.250,00"`? **não** — só ponto \| `5000` \| `1250.0000` | `{ valorInteiro, moeda }` \| `undefined` |
| `enderecoDeTmb(campos)` | `{ logradouro?, numero?, complemento?, bairro?, cidade?, uf?, cep?, pais? }` | objeto só com as chaves não-vazias, ou `undefined` se todas vazias |
| `textoOuUndefined(s)` | `"  "` / `""` / `null` | `undefined`; senão `s.trim()` |

`dinheiroDeValorTmb` detalhado (D-R8):
- `null`/`undefined`/`''` → `undefined`.
- `typeof v === 'number'`: `Number.isFinite(v) === false` → `undefined` + erro. Senão
  `String(v)`.
- string: casa `/^-?\d+(\.\d{1,4})?$/` → `Dinheiro.deDecimal(str, moeda)`; `> 4` casas →
  trunca por string para 4 casas e tenta de novo; notação científica / outro → `undefined`
  + erro.
- resultado `< 0` → `undefined` + erro (`"valor negativo"`).
- retorna `{ valorInteiro: d.valorInt, moeda }`.

## Cobertura de teste (fixtures reais, Princípio III)

| Fixture | Exercita |
| --- | --- |
| `webhook-vendas-efetivado.json` | caminho feliz Vendas; `status_pedido="Efetivado"`; comprador completo; `valor_principal`+`taxa_administracao` |
| `webhook-vendas-cancelado.json` | `status_pedido="Cancelado"`; `data_efetivado` nula → cai em `criado_em` |
| `webhook-financeiro-parcelas.json` | array de 3 parcelas do mesmo `pedido_id`; status distintos (`Aguardando pagamento`, `Recebido`, `Estornado`); **sem** `valores` |
| `api-pedidos-pagina.json` | 3 itens; nomes de campo da API (`pedido_id`, `pais`, `cep`); 1 item só com `valor_total` |
| `export-pedidos.csv` | cabeçalho com `;`; 1 linha com aspas; 1 linha sem `pedido_id`; BOM |

Cada parser tem também um teste "payload com chave inédita" (`{ ..., campo_novo_2027: 1 }`)
→ ignora, não lança.
