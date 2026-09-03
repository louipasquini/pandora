# Contract: tempo (`parseInstante`, `agoraUtc`)

Fonte de verdade: `backend/src/core/tempo/{parse-instante,agora}.ts`. Puro, sem banco,
**livre de locale/timezone** da máquina.

## `parseInstante`

```
parseInstante(entrada: unknown): { valor: Date | null; motivo?: string }
```

**Nunca lança.** Retorna um instante absoluto (equivalente a `timestamptz` UTC) **ou**
`null`. `motivo` presente sempre que `valor === null` **ou** houve suposição.

| Entrada | Resultado |
| --- | --- |
| `Date` válido | `{ valor: <mesmo instante> }` |
| `Date` inválido (`NaN`) | `{ valor: null, motivo: 'Date inválido' }` |
| `number` finito, `abs < 1e11` | epoch em **segundos** → `{ valor: new Date(n*1000) }` |
| `number` finito, `abs >= 1e11` | epoch em **milissegundos** → `{ valor: new Date(n) }` |
| `number` `NaN` / `Infinity` | `{ valor: null, motivo }` |
| string `^-?\d+$` | tratada como `number` epoch (regra acima) |
| string ISO 8601 com `Z` ou `±HH:MM` | `{ valor: new Date(iso) }` se válido |
| string ISO 8601 **sem** fuso (`YYYY-MM-DD`, `...THH:MM[:SS[.fff]]`, espaço no lugar do `T`) | `{ valor: <iso+"Z">, motivo: 'sem fuso — assumido UTC' }` |
| `""` / só espaços | `{ valor: null, motivo: 'vazio' }` |
| `dd/mm/aaaa`, `mm/dd/aaaa`, texto, serial de planilha textual não numérico | `{ valor: null, motivo: 'formato não reconhecido; normalize no adapter' }` |
| `null` / `undefined` / boolean / objeto | `{ valor: null, motivo }` |

**Limitação consciente**: um número puro (ex.: `45352`, que também é um serial de Excel) é
sempre interpretado como epoch. Normalizar serial de planilha é responsabilidade do adapter
de CSV — ele não deve repassar o número cru (FR-013 / FR-017).

**Independência de locale**: a mesma matriz de entradas produz resultado idêntico sob
`TZ=UTC`, `TZ=America/Sao_Paulo`, `TZ=Asia/Tokyo` (verificado no CI — SC-004).

## `agoraUtc`

```
agoraUtc(): Date
```

Wrapper de `new Date()`. Ponto único para carimbar `criadoEm` / `atualizadoEm` e
`RegistroAuditoria.quando`. _Fakeável_ com Jest fake timers.

## Testes de contrato (`*.spec.ts`, unit, sem banco)

- `parse-instante.spec.ts`:
  - `"2026-03-01T12:00:00Z"` e `"2026-03-01T09:00:00-03:00"` → **mesmo** instante.
  - `"2026-03-01T12:00:00"` → instante válido + `motivo` de fuso assumido.
  - `1772539200` e `1772539200000` → mesmo instante.
  - `""`, `"n/a"`, `"0000-00-00"`, `null`, `undefined`, `true`, `{}` → `valor: null` + `motivo` não vazio.
  - `"01/03/2026"` → `valor: null` + `motivo` de formato.
  - `new Date("nope")` → `valor: null`.
  - matriz repetida sob 3 valores de `TZ` (script de CI) — resultados idênticos.
- `agora.spec.ts`: com fake timers em `2026-01-01T00:00:00Z`, `agoraUtc().toISOString()` bate.
