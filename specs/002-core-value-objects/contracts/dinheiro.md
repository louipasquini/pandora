# Contract: `Dinheiro` + `Moeda`

Fonte de verdade: `backend/src/core/dinheiro/{moeda,dinheiro,ratear}.ts`. API pública
consumida por todos os contextos via barrel `core.module.ts`. Puro, sem banco, sem `float`.

## `Moeda`

| Símbolo | Assinatura | Comportamento |
| --- | --- | --- |
| `Moeda` | `type Moeda = string & { readonly __brand: 'Moeda' }` | código ISO 4217 alfabético, 3 letras maiúsculas |
| `ISO_4217` | `readonly string[]` (congelado) | códigos alfabéticos ativos da ISO 4217 |
| `ehMoeda` | `(v: unknown) => v is Moeda` | `true` sse string de 3 letras (após `toUpperCase`) presente em `ISO_4217` |
| `assertMoeda` | `(v: unknown) => asserts v is Moeda` | normaliza p/ caixa alta; inválido → `RangeError('Moeda não é ISO 4217 válida: <v>')` |
| `criarMoeda` | `(v: string) => Moeda` | `assertMoeda` + retorna normalizado |

## `Dinheiro` — construção

| Fábrica | Assinatura | Regras / erros |
| --- | --- | --- |
| `deDecimal` | `(texto: string, moeda: string \| Moeda) => Dinheiro` | `texto` casa `^-?\d+(\.\d+)?$` **e** a fração tem ≤ 4 casas. `>4` casas decimais → `RangeError` de precisão. Formato inválido → `RangeError`. `moeda` inválida → `RangeError`. Sem `parseFloat`. |
| `deInteiroEscalado` | `(valorInt: bigint \| number, moeda: string \| Moeda) => Dinheiro` | `number` não inteiro → `TypeError`. `valorInt` já está na escala ×10000. |
| `zero` | `(moeda: string \| Moeda) => Dinheiro` | `valorInt = 0n` |
| `deSerializado` | `(x: { valorInt: string; moeda: string }) => Dinheiro` | `valorInt` casa `^-?\d+$` → `BigInt`, senão `RangeError`; `assertMoeda(x.moeda)` |

## `Dinheiro` — operações (todas retornam nova instância)

| Método | Assinatura | Erros |
| --- | --- | --- |
| `somar` | `(o: Dinheiro) => Dinheiro` | `moeda` diferente → `Error('moedas diferentes: <A> vs <B>')` |
| `subtrair` | `(o: Dinheiro) => Dinheiro` | idem |
| `negar` | `() => Dinheiro` | — |
| `multiplicarPorEscalar` | `(fator: bigint \| number) => Dinheiro` | fator não inteiro / `NaN` / `Infinity` → `TypeError` |
| `equals` | `(o: Dinheiro \| null \| undefined) => boolean` | nunca lança; moeda diferente ou nulo → `false` |
| `compararCom` | `(o: Dinheiro) => -1 \| 0 \| 1` | moeda diferente → `Error`; `null`/`undefined` → `TypeError` |
| `maiorQue` / `menorQue` / `maiorOuIgual` / `menorOuIgual` | `(o: Dinheiro) => boolean` | via `compararCom` |
| `ehZero` / `ehNegativo` / `ehPositivo` | `() => boolean` | — |

## `Dinheiro` — serialização

| Método | Saída |
| --- | --- |
| `toJSON()` | `{ valorInt: string; moeda: string }` — `valorInt` = string decimal do inteiro (ex.: `"12345678"`, `"-5000"`) |
| `paraPersistencia()` | alias de `toJSON()` |
| `toString()` | `"1234.5678 BRL"` (log/debug; **não** é a forma de persistência) |

**Round-trip**: `Dinheiro.deSerializado(d.toJSON())` ≡ `d` (por `equals`) para inteiros,
1–4 casas, negativos, `zero` e valores `> 2^53`.

## Rateio — `ratear.ts`

| Função | Assinatura | Garantia |
| --- | --- | --- |
| `ratear` | `(total: Dinheiro, n: number) => Dinheiro[]` | `n` inteiro `>0`, senão `RangeError`. `length === n`. Soma exata `=== total`. Resto (`abs(valorInt % n)`) somado 1-a-1 às primeiras parcelas. |
| `ratearPorPesos` | `(total: Dinheiro, pesos: number[]) => Dinheiro[]` | `pesos` inteiros `≥0`, soma `>0`, senão `RangeError`. `length === pesos.length`. Soma exata `=== total`. Maior-resto (Hamilton). |

Não existe `dividir` nem "somar lista" no `core` (agregação é `f(eventos)` nos contextos de
negócio — Princípio V).

## Testes de contrato (`*.spec.ts`, unit, sem banco)

- `moeda.spec.ts`: aceita `brl`/`BRL`/`Brl` → `"BRL"`; rejeita `"XXX"`, `"BR"`, `"REAIS"`,
  `123`, `null`.
- `dinheiro.spec.ts`: `deDecimal("1234.5678", "BRL").valorInt === 12345678n`;
  `"10.12345"` → `RangeError`; `"1,50"` → `RangeError`; `somar` mesma moeda ok e imutável;
  `somar` BRL+USD → `Error` citando `BRL` e `USD`; `equals` BRL vs USD → `false`;
  `compararCom` BRL vs USD → `Error`; `multiplicarPorEscalar(0.5)` → `TypeError`;
  `multiplicarPorEscalar(3)` ok; round-trip de serialização (5 casos incl. `> 2^53` e
  negativo); `zero("BRL").equals(zero("USD"))` → `false`.
- `ratear.spec.ts`: `ratear(deDecimal("10.0000","BRL"), 3)` → 3 parcelas somando exatamente
  `10.0000`; `ratearPorPesos(deDecimal("100.0000","BRL"), [1,1,1])` → soma exata;
  `ratear(x, 0)` → `RangeError`; rateio de valor negativo distribui resto corretamente.
