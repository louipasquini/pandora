# Phase 0 — Research: Value Objects e primitivas canônicas do `core`

Decisões de representação e algoritmo. Nenhum `NEEDS CLARIFICATION` de negócio permanece —
os 6 pontos que dependiam do dono do produto foram resolvidos em `/speckit-specify` e
`/speckit-clarify` (ver `spec.md` §Clarifications). O que segue são decisões **técnicas**.

---

## 1. Representação interna de `Dinheiro`

- **Decisão**: `readonly valorInt: bigint` em escala fixa ×10000 (4 casas decimais) +
  `readonly moeda: Moeda`. Imutável, igualdade por valor.
- **Rationale**: `number` perde precisão acima de 2^53 (≈ 900 mil unidades na escala ×10000 —
  perto demais de valores reais de faturamento agregado e de moedas de baixa denominação).
  `bigint` dá aritmética inteira exata nativa, sem lib. `string` obrigaria re-parse a cada
  operação. Escala ×10000 é decisão fechada da constituição.
- **Alternativas**: `decimal.js` / `dinero.js` (dependência extra, API própria, e `dinero.js`
  v2 usa `number` por padrão); coluna `numeric` do PG como única verdade (não serve para a
  camada de domínio pura, testável sem banco).

## 2. Construção de `Dinheiro` a partir de string decimal

- **Decisão**: `Dinheiro.deDecimal(texto: string, moeda)`. Regex canônica
  `^-?\d+(\.\d+)?$` seguido de verificação explícita de que a fração tem **≤ 4 casas**. Sem
  separador de milhar, ponto como separador decimal, sinal `-` opcional. Formato inválido →
  `RangeError`; fração com `>4` casas → `RangeError` de precisão (mensagem distinta).
  Conversão: separa parte inteira e fração, faz _pad_ da fração para 4 dígitos, monta
  `BigInt(sinal + intPart + fracPad)`.
- **Rationale**: determinístico, sem `parseFloat` (nunca passa por `float`). Rejeitar `>4`
  casas em vez de truncar/arredondar é a escolha "sem surpresa" alinhada à decisão de proibir
  arredondamento implícito (spec Q3 de `/speckit-specify`).
- **Alternativas**: aceitar vírgula decimal / milhar no `core` (rejeitado — isso é
  normalização de borda, cada adapter de CSV faz antes de chamar); truncar em 4 casas
  (rejeitado — perda silenciosa).
- **Também**: `Dinheiro.deInteiroEscalado(valorInt: bigint | number inteiro, moeda)` para
  quem já tem o inteiro (`number` só se `Number.isInteger`; senão `TypeError`).

## 3. `Moeda` — ISO 4217 validado, conjunto aberto

- **Decisão**: `type Moeda = string & { readonly __brand: 'Moeda' }` (branded). Validação em
  `assertMoeda(v): asserts v is Moeda` e `ehMoeda(v): v is Moeda`: `typeof v === 'string'`,
  3 letras `A–Z` após `toUpperCase()`, e pertence à constante `ISO_4217` (um
  `ReadonlySet<string>` com os códigos alfabéticos ativos da ISO 4217). Normaliza para caixa
  alta. Código fora da lista → `RangeError` nomeando o código.
- **Rationale**: "aberto porém validado" (decisão do dono do produto): não trava numa lista
  curta que a 1ª venda internacional quebraria, mas recusa lixo. Lista embarcada = zero
  dependência, zero I/O; atualizá-la é PR raro no `core`.
- **Fonte da lista**: códigos alfabéticos ativos da ISO 4217 (tabela A.1 publicada). ~180
  entradas. Guardada em `moeda.ts` como array `const` congelado + `Set` derivado. Inclui
  `BRL`, `USD`, `EUR`, `GBP` etc. Não inclui fundos/metais (`XAU`, `XDR`) por ora — se um
  adapter precisar, é adição pontual.
- **Alternativas**: pacote `currency-codes` / `iso-4217` (dependência para ~3 KB de dados
  triviais); enum fechado curto (rejeitado pelo dono do produto); `string` livre (rejeitado —
  moeda desconhecida tem de virar evento a revisar, como status).

## 4. Operações de `Dinheiro`

- **Decisão**:
  - `somar(o)`, `subtrair(o)`: exigem `this.moeda === o.moeda`, senão `Error` nomeando as
    duas moedas. Aritmética `bigint`.
  - `negar()`: `-valorInt`.
  - `multiplicarPorEscalar(fator: bigint | number)`: aceita **só inteiro** (`bigint`, ou
    `number` com `Number.isInteger`). Não inteiro / `NaN` / `Infinity` → `TypeError`.
    Sem arredondamento — decisão do dono do produto.
  - Comparações: `equals(o)` = mesmo `valorInt` **e** mesma `moeda` (moedas diferentes →
    `false`, não erro). `compararCom(o)` / `maiorQue` / `menorQue` / `maiorOuIgual` /
    `menorOuIgual`: exigem mesma moeda, senão `Error`. `equals(null|undefined)` → `false`;
    `compararCom(null|undefined)` → `TypeError`.
  - `Dinheiro.zero(moeda)`: `valorInt = 0n`. `zero(BRL).equals(zero(USD))` → `false`.
  - `ehZero()`, `ehNegativo()`, `ehPositivo()` — conveniências puras.
- **Rationale**: espelha a tabela de FR-005/FR-006/FR-007/FR-009. Igualdade tolerante a moeda
  (retorna `false`) e ordem estrita (lança) é o padrão de bibliotecas de dinheiro maduras —
  comparar ordem entre moedas é sempre bug; testar igualdade entre moedas é uso legítimo
  (filtro).

## 5. Serialização de `Dinheiro`

- **Decisão**: `toJSON()` e `paraPersistencia()` → `{ valorInt: string, moeda: string }`
  (`valorInt` como **string decimal do inteiro**, ex.: `"12345678"` ou `"-5000"`).
  `Dinheiro.deSerializado({ valorInt, moeda })` reidrata (valida `valorInt` com
  `^-?\d+$` → `BigInt`, e `moeda` por `assertMoeda`). `toString()` → forma humana
  `"1234.5678 BRL"` (debug/log, não é a de persistência).
- **Rationale**: `bigint` não é serializável por `JSON.stringify` nativo; string decimal do
  inteiro é exata, ordenável e óbvia. A coluna física (numeric / bigint / composto) é decisão
  das specs 018/025 — o contrato aqui é só o formato de troca.
- **Round-trip** coberto por teste para: inteiros, 1–4 casas, negativos, `zero`, e um valor
  `> 2^53`.

## 6. `ratear` / `ratearPorPesos`

- **Decisão**:
  - `ratear(total: Dinheiro, n: number inteiro > 0): Dinheiro[]` — `base = valorInt / n`
    (divisão inteira `bigint`), `resto = valorInt % n`. As primeiras `|resto|` parcelas
    recebem `+sinal(1)` unidade da escala. Soma das parcelas === `total` exatamente.
  - `ratearPorPesos(total, pesos: number[] inteiros ≥ 0, soma > 0): Dinheiro[]` — quota
    proporcional por `floor`, resto distribuído pelas maiores frações residuais (maior-resto
    / Hamilton). Soma === `total`.
- **Rationale**: FR-010 exige soma exata e distribuição determinística. Maior-resto é o
  algoritmo padrão e é estável e testável. É a **única** via de "dividir dinheiro" no `core`
  (não há `dividir`).
- **Alternativas**: arredondar cada parcela e aceitar diferença de centavos (viola FR-010);
  jogar todo o resto na última parcela (determinístico, mas enviesa a última — maior-resto
  distribui melhor).

## 7. `parseInstante` — formatos aceitos e heurística epoch

- **Decisão**: `parseInstante(entrada: unknown): { valor: Date | null; motivo?: string }`.
  Nunca lança. Ordem de tentativa:
  1. `entrada instanceof Date` → se `isNaN(getTime())` → `null` + motivo; senão devolve
     (já é instante absoluto).
  2. `typeof entrada === 'number'` (finito) → epoch. **Escala**: `Math.abs(n) < 1e11` ⇒
     **segundos** (`n * 1000`); senão **milissegundos**. `1e11 s` ≈ ano 5138; `1e11 ms` ≈
     1973-03 — qualquer data de negócio (1973…) em ms fica ≥ `1e11`, e em s fica `< 1e11`.
     Sem zona cinzenta plausível.
  3. `typeof entrada === 'string'`:
     - vazia / só espaços → `null` + motivo.
     - casa `^-?\d+$` → trata como epoch numérico (regra do passo 2).
     - ISO 8601 com `T` ou espaço separando data e hora, com offset (`Z` / `±HH:MM`):
       `new Date(iso)`; se válido, devolve.
     - ISO 8601 **sem** offset (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM[:SS[.fff]]`, idem com espaço):
       anexa `Z` e faz `new Date(...)` ⇒ interpretado como **UTC**; `motivo` registra
       "sem fuso — assumido UTC".
     - qualquer outra coisa (`dd/mm/aaaa`, `mm/dd/aaaa`, serial de Excel `"45352"` já cai em
       `^-?\d+$` e vira epoch? → **não**: ver nota) → `null` + motivo
       "formato não reconhecido; normalize no adapter".
  - **Nota serial de Excel**: `"45352"` casa `^-?\d+$` e, pela regra de epoch, `< 1e11` ⇒
    seria "1970-01-01 + 45352 s". Isso é **aceitável** porque o `core` não pode advinhar que
    o número é serial de Excel; a spec (FR-013/Edge Cases) põe a normalização de serial no
    adapter de CSV, que **não** deve repassar o número cru. Documentado como limitação
    consciente: número puro sempre é epoch no `core`.
- **Rationale**: cobre 100% dos formatos "de máquina" que as APIs das 4 plataformas emitem
  (ISO e epoch), mais o objeto `Date`. Locale-free: nunca usa `Date.parse` de formato
  ambíguo, nunca depende de `TZ`. `motivo` presente sempre que houve suposição (naive→UTC) ou
  falha — Princípio IV (nada some em silêncio).
- **Alternativas**: `dayjs`/`luxon` com parsing tolerante (dependência + risco de aceitar
  formato ambíguo por engano); aceitar `dd/mm/aaaa` no `core` (rejeitado no `/speckit-clarify`
  — é responsabilidade da borda).

## 8. `agoraUtc()`

- **Decisão**: `agoraUtc(): Date` = `new Date()` (um `Date` já é um instante absoluto em UTC
  internamente). Existe como **ponto único** para carimbar `criadoEm`/`atualizadoEm` e
  `RegistroAuditoria.quando`, e para poder ser _fakeado_ em teste (Jest fake timers) sem
  espalhar `new Date()` pelo código.
- **Rationale**: mesma motivação do `uuidv7()` wrapper da 001 — centralizar a fonte.

## 9. Enums de status

- **Decisão**: seguir o padrão de `PlataformaOrigem` (001): `enum` de string + array
  congelado + (quando útil) `Record` de rótulo.
  - `StatusTransacaoCanonico`: `PENDENTE`, `PAGO`, `EM_ATRASO`, `RECUSADO`, `CANCELADO`,
    `ESTORNADO`, `CHARGEBACK`, `DESCONHECIDO`.
  - `StatusContratoCanonico`: `ATIVO`, `EXPIRADO`, `CANCELADO`, `DESCONHECIDO`.
  - `liberaAcesso(s)` / `contaComoReceita(s)`: `switch` exaustivo (com
    `noFallthroughCasesInSwitch` do tsconfig garantindo cobertura) implementando a
    tabela-verdade fixada em FR-021. `EM_ATRASO` → `liberaAcesso = true` (core permissivo).
  - `contratoLiberaAcesso(s)`: só `ATIVO` → `true`.
- **Rationale**: `switch` exaustivo + `never` no `default` faz o compilador falhar se um valor
  novo do enum não for tratado — trava a favor da corretude.

## 10. `paraStatusTransacaoCanonico` (rede de segurança)

- **Decisão**: `paraStatusTransacaoCanonico(bruto: unknown): { status: StatusTransacaoCanonico;
  revisar: boolean }`. Se `bruto` já é um valor **exato** do enum → `{ status: bruto,
  revisar: false }`. Qualquer outra coisa (string desconhecida, `null`, `undefined`, número,
  objeto) → `{ status: DESCONHECIDO, revisar: true }`. **Não** faz `trim`/`lowercase`/
  sinônimos — isso é do adapter versionado por fonte (specs 019–022).
- **Rationale**: FR-023 — o `core` é só a rede de segurança "nunca vira ativo por engano".
  Retornar um objeto (não lançar) deixa o chamador decidir o encaminhamento a `REVISAR`.

## 11. Consolidação de config

- **Decisão**: **não mover** `backend/src/config/` (schema zod + `ConfigModule`). Em vez
  disso:
  - `backend/src/core/config/index.ts` re-exporta `AppConfig`, `accountConfig` e um tipo
    `LeitorConfig` (assinatura de `ConfigService<AppConfig, true>.get`) para os contextos
    importarem "do `core`".
  - Nova regra ESLint `no-restricted-syntax` barrando `process.env.*` em `src/**` exceto
    `src/config/**`, `src/core/**`, `src/main.ts` e `test/**`.
  - `docs/002` documenta o fluxo: `.env` (raiz) → `envSchema.parse` no boot (`config.module`)
    → `ConfigService<AppConfig, true>` injetado → contexto lê sua fatia (ex.:
    `accountConfig(cfg, PlataformaOrigem.GURU_PRD)`).
- **Rationale**: FR-032 pede "refatoração para dentro do `core` + documentação, sem
  redesenho e sem regressão". Mover o arquivo agora quebraria o `envFilePath` relativo
  (`../../../.env`) e os testes da 001 sem ganho real. Re-export + regra de lint + doc
  entregam a "propriedade pelo `core`" com risco zero.
- **Alternativas**: mover fisicamente `config/` para `core/config/` (churn + ajuste de path
  do `.env` + risco de regressão no boot, contra FR-032); criar um `CoreConfigService`
  wrapper (superfície nova sem necessidade).

## 12. Empacotamento / exports

- **Decisão**: `core.module.ts` cresce como **único barrel**: adiciona
  `export * from './dinheiro/...'`, `./tempo/...`, `./status/...`, `./auditoria/...`,
  `./config'`. Contextos fazem `import { Dinheiro, parseInstante, StatusTransacaoCanonico }
  from '<alias-ou-path>/core/core.module'`. Nenhum provider novo no `CoreModule` (as
  primitivas são funções/classes puras, não serviços NestJS).
- **Rationale**: mantém a regra da 001 ("importe `core` pelo barrel, não por subpath") e
  evita `@Injectable` desnecessário. `CoreModule` continua `@Global()` e sem `providers`.
- **Alternativas**: expor cada primitiva como provider injetável (peso de DI sem benefício —
  são puras); múltiplos barrels por tema (mais pontos de entrada para os contextos
  conhecerem).

## 13. Testes e independência de locale

- **Decisão**: Jest unit, 1 `*.spec.ts` por arquivo de fonte. Para `parseInstante` e
  `agoraUtc`, o `describe` roda a mesma matriz sob 3 `process.env.TZ` (`UTC`,
  `America/Sao_Paulo`, `Asia/Tokyo`) — setando `process.env.TZ` e forçando
  `(Date as any).prototype` a re-resolver não é confiável no mesmo processo; então o teste
  usa `jest.isolateModules` + set de `TZ` **antes** de `require`, ou um script de CI que roda
  a suíte 3× com `TZ` diferente. Decisão: **matriz no CI** (`ci.yml` roda
  `TZ=... npm test -w backend` 3×) + asserts que não dependem de `TZ` no dia a dia local.
- **Rationale**: `TZ` só é lido pelo runtime na inicialização do processo; a forma robusta é
  processo separado. SC-004/SC-010 exigem a prova.
- **Alternativas**: `@date-fns/tz` / mock de `Intl` (dependência; e o parser nem usa `Intl`).

---

## Resumo das decisões

| # | Tema | Decisão |
| --- | --- | --- |
| 1 | Valor de `Dinheiro` | `bigint` ×10000, imutável |
| 2 | String decimal | regex `^-?\d+(\.\d+)?$` + checagem ≤ 4 casas; `>4` casas → `RangeError` de precisão |
| 3 | `Moeda` | branded string, `ISO_4217` `Set` embarcado, normaliza p/ caixa alta |
| 4 | Operações | soma/subtração/ordem só mesma moeda (erro); `equals` cross-moeda → `false`; `multiplicarPorEscalar` só inteiro |
| 5 | Serialização | `{ valorInt: string, moeda: string }`, round-trip exato |
| 6 | Rateio | `ratear`/`ratearPorPesos` por maior-resto; soma exata |
| 7 | `parseInstante` | ISO (c/ e s/ fuso, s/ fuso→UTC+motivo), epoch s/ms (limiar `1e11`), `Date`; resto → `null`+motivo; livre de locale |
| 8 | `agoraUtc()` | wrapper de `new Date()` como ponto único |
| 9 | Status | enums string + `switch` exaustivo; tabela-verdade de FR-021; `EM_ATRASO`→acesso `true` |
| 10 | Rede de segurança de status | `paraStatusTransacaoCanonico` → `{status, revisar}`, sem normalização de sinônimo |
| 11 | Config | não move `src/config/`; `core` re-exporta contrato + regra ESLint `no-process-env` + doc |
| 12 | Exports | `core.module.ts` como único barrel; sem provider novo |
| 13 | Testes locale | matriz de `TZ` (3×) no CI |
