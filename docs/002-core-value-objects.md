# 002 — Core Value Objects

Primitivas canônicas do contexto `core` (`backend/src/core/`), consumidas por **todos** os
outros bounded contexts. Sem banco, sem endpoint, sem entidade de negócio, sem frontend.
Materializa os Padrões Técnicos Transversais da constituição ("decididos uma vez, no
início"): dinheiro, tempo, status canônico, auditoria, config.

Spec, plano e contratos: [`specs/002-core-value-objects/`](../specs/002-core-value-objects/).

---

## Importação

Tudo é exportado pelo **barrel único** `backend/src/core/core.module.ts`. Os contextos
importam de lá, nunca de subpaths internos:

```ts
import { Dinheiro, parseInstante, StatusTransacaoCanonico, liberaAcesso } from '../core/core.module';
```

`CoreModule` continua `@Global()` e **sem providers** — as primitivas são funções/classes
puras, não serviços NestJS.

---

## 1. `Dinheiro` + `Moeda` — `core/dinheiro/`

Value Object imutável de quantia monetária. Valor interno **`bigint` em escala fixa ×10000**
(4 casas decimais). `float`/`number` fracionário é proibido em todo o caminho do valor.

### `Moeda`

Código **ISO 4217** alfabético de 3 letras (caixa alta), validado contra a lista embarcada
`ISO_4217`. Conjunto **aberto porém validado** — não travamos numa lista curta, mas um código
não-ISO é rejeitado (moeda desconhecida vira evento a revisar, nunca valor aceito). `moeda`
nunca é opcional.

| Símbolo | Uso |
| --- | --- |
| `ehMoeda(v)` | type guard |
| `assertMoeda(v)` | lança `RangeError` se inválido |
| `criarMoeda(v)` | valida e devolve normalizado p/ caixa alta |
| `ISO_4217` / `ISO_4217_SET` | lista congelada + índice O(1) |

### `Dinheiro`

```ts
Dinheiro.deDecimal('1234.5678', 'BRL')   // valorInt = 12345678n
Dinheiro.deInteiroEscalado(12345678n, 'BRL')
Dinheiro.zero('BRL')
Dinheiro.deSerializado({ valorInt: '12345678', moeda: 'BRL' })

a.somar(b) / a.subtrair(b) / a.negar()   // exigem a MESMA moeda, senão Error nomeando as duas
a.multiplicarPorEscalar(3)               // só fator INTEIRO; não inteiro/NaN/Infinity → TypeError
a.equals(b)                              // valor E moeda; nunca lança; nulo/moeda diferente → false
a.compararCom(b) / maiorQue / menorQue / maiorOuIgual / menorOuIgual  // ordem só na mesma moeda
a.ehZero() / a.ehNegativo() / a.ehPositivo()
a.toJSON() / a.paraPersistencia()        // { valorInt: string, moeda: string } — round-trip exato
a.toString()                            // "1234.5678 BRL" — log/debug, NÃO é persistência
```

- **Sem** conversão de moeda, **sem** `dividir`, **sem** "somar lista" — agregação é
  `f(eventos)` nos contextos de negócio (Princípio V).
- String decimal com mais de 4 casas → `RangeError` (nunca trunca nem arredonda em silêncio).

### `ratear` / `ratearPorPesos` — `core/dinheiro/ratear.ts`

A única via de "dividir dinheiro" no `core`. A soma das partes é **exatamente** igual ao
total; o resto é distribuído de forma determinística (maior-resto / Hamilton).

```ts
ratear(Dinheiro.deDecimal('10.0000', 'BRL'), 3)     // [33334n, 33333n, 33333n]
ratearPorPesos(total, [1, 1, 2])                    // proporção 25% / 25% / 50%; peso 0 não recebe
```

---

## 2. Tempo — `core/tempo/`

### `parseInstante(entrada): { valor: Date | null, motivo?: string }`

Parser de borda tolerante. **Nunca lança.** `valor` é sempre um instante absoluto
(equivalente a `timestamptz` UTC) ou `null`. `motivo` está presente sempre que `valor` é
`null` **ou** houve suposição.

| Entrada | Resultado |
| --- | --- |
| ISO 8601 com `Z` / offset | instante |
| ISO 8601 sem fuso (data, data+hora, `T` ou espaço) | instante **UTC** + `motivo` "sem fuso — assumido UTC" |
| `number` / string numérica | epoch — `\|n\| < 1e11` ⇒ **segundos**, senão **milissegundos** |
| `Date` válido | cópia do mesmo instante |
| `""`, `dd/mm/aaaa`, texto, `null`, `undefined`, boolean, objeto, serial de planilha textual | `null` + `motivo` |

**Livre de locale/timezone** da máquina — só usa `new Date(<ISO com Z/offset>)` e
`new Date(<epoch ms>)`. Provado por matriz de `TZ` no CI (job `timezone-matrix`).

Formatos de planilha/locale (`dd/mm/aaaa`, serial de Excel) → `null` + motivo **de
propósito**: normalizá-los é responsabilidade de cada adapter de CSV (specs 019–022, 028),
que converte para ISO antes de chamar o `core`. Limitação consciente: um **número puro**
(ex.: `45352`, que também é serial de Excel) é sempre interpretado como epoch.

### `agoraUtc(): Date`

Wrapper de `new Date()`. Ponto único para carimbar `criadoEm` / `atualizadoEm` e
`RegistroAuditoria.quando` — fakeável em teste (`jest.useFakeTimers()`).

---

## 3. Status canônico — `core/status/`

### `StatusTransacaoCanonico`

`PENDENTE`, `PAGO`, `EM_ATRASO`, `RECUSADO`, `CANCELADO`, `ESTORNADO`, `CHARGEBACK`,
`DESCONHECIDO`.

`liberaAcesso(s)` e `contaComoReceita(s)` são funções puras (`switch` exaustivo, o
compilador falha se um valor novo não for tratado):

| status | `liberaAcesso` | `contaComoReceita` |
| --- | --- | --- |
| `PAGO` | ✅ | ✅ |
| `PENDENTE` | ✅ | ❌ |
| `EM_ATRASO` | ✅ | ❌ |
| `RECUSADO` / `CANCELADO` / `ESTORNADO` / `CHARGEBACK` / `DESCONHECIDO` | ❌ | ❌ |

`liberaAcesso(EM_ATRASO) = true` é decisão fechada: o `core` é **permissivo** e não conhece
a janela de tolerância; a revogação após a tolerância expirar é do contexto `contratos`
(spec 025).

### `StatusContratoCanonico`

`ATIVO`, `EXPIRADO`, `CANCELADO`, `DESCONHECIDO`. `contratoLiberaAcesso(s)` → só `ATIVO`.
Renovação/prorrogação **não** são valores do enum (rótulo derivado do estado de acesso na
data — visão Parte 7).

### `paraStatusTransacaoCanonico(bruto): { status, revisar }`

Rede de segurança: valor exato do enum → `{ status, revisar: false }`; qualquer outra coisa
→ `{ status: DESCONHECIDO, revisar: true }`. **Não** faz `trim`/`lowercase`/sinônimos — o
mapa rico de vocabulário por plataforma é dos adapters (specs 019–022). Garante "nunca vira
status ativo por engano" (Regra Inviolável nº 15).

---

## 4. Base de auditoria — `core/auditoria/`

- **`EntidadeAuditavel`** — contrato para entidades futuras: `criadoEm` (nunca muda) e
  `atualizadoEm` (toda escrita atualiza), ambos `Date` UTC. `TIMESTAMPTZ_PRISMA` é um
  lembrete de convenção de schema.
- **`RegistroAuditoria`** — forma canônica de uma mudança curada / ajuste manual:
  `{ autor, quando, entidade, entidadeId, campo, valorAnterior, valorNovo, motivo, origem }`.
  `origem: OrigemMudanca` é **enum fechado** — `CURADORIA` | `AJUSTE_MANUAL` | `MIGRACAO`.
- **`montarRegistroAuditoria(dados)`** — função pura: `quando` default `agoraUtc()`; `motivo`
  vazio → `TypeError`; `origem` fora do enum → `TypeError`.

Esta spec entrega **só o contrato e o normalizador** — nenhuma tabela `_audit` de negócio
(essas são de cada spec dona; o painel consolidado é a spec 053, que consome este formato
sem redefini-lo).

---

## 5. Configuração tipada — `core/config/`

O `core` passa a ser o **dono do contrato** de configuração. A validação continua em
`backend/src/config/` (schema zod + `ConfigModule`, spec 001): `.env` da raiz →
`envSchema.parse` no boot → o processo **aborta** nomeando a variável ausente/malformada,
sem default silencioso para segredo ou string de conexão. Nenhuma chave nova de ambiente.

`core/config/index.ts` re-exporta:

| Export | Uso |
| --- | --- |
| `type AppConfig` | forma da config validada |
| `accountConfig(cfg, plataforma)` | fatia `{ apiBaseUrl?, apiKey?, webhookToken? }` de uma das 7 contas, ou `undefined` |
| `type LeitorConfig` | assinatura de `ConfigService<AppConfig, true>['get']` |

### Regra de fronteira

Nova regra ESLint (`no-restricted-syntax`) **barra `process.env`** em `backend/src/**`,
exceto `src/config/**`, `src/core/**` e `src/main.ts` (e `test/**`). Código de contexto lê
config só pelo contrato tipado — verificável: busca por `process.env` em módulo de contexto
retorna zero.

### Fluxo

```
.env (raiz)
  → NestConfigModule.forRoot({ validate: envSchema.parse })   // boot; falha cedo
  → ConfigService<AppConfig, true>  (injetável, global)
  → contexto injeta e lê sua fatia:
        cfg.get('DATABASE_URL', { infer: true })
        accountConfig(<AppConfig>, PlataformaOrigem.GURU_PRD)
```

---

## Decisões de trade-off (resumo — detalhe em `specs/002-core-value-objects/research.md`)

| Tema | Decisão | Por quê |
| --- | --- | --- |
| Valor de `Dinheiro` | `bigint` ×10000 | `number` estoura precisão > 2^53; `string` re-parseia a cada op; `bigint` é exato e nativo. `valorInt` vira string só na fronteira JSON. |
| `Moeda` | ISO 4217 validado (lista embarcada) | aberto (1ª venda internacional não quebra) porém validado (lixo vira revisão); zero dependência npm. |
| `multiplicarPorEscalar` | só fator inteiro | sem arredondamento implícito no `core`; frações vão para `ratear` com resto determinístico. |
| Rateio | maior-resto (Hamilton) | soma exata garantida; determinístico e testável. |
| `parseInstante` | resultado + `motivo`, nunca lança | nada some em silêncio (Princípio IV), mas data ruim não derruba a ingestão — o chamador marca `REVISAR`. |
| epoch s × ms | limiar `\|n\| < 1e11` | simples e determinístico; sem zona cinzenta em datas plausíveis. |
| Planilha/`dd/mm/aaaa` no `core` | `null` + motivo | borda fina: normalização de locale é do adapter de CSV. |
| `StatusContratoCanonico` | 4 estados; só `ATIVO` libera | tolerância é leitura do contexto `contratos`, não estado; rótulo renovação/prorrogação é derivado. |
| Config | não move `src/config/`; `core` re-exporta + regra ESLint | "propriedade pelo `core`" com risco zero de regressão no boot. |

---

## Validação

Ver [`specs/002-core-value-objects/quickstart.md`](../specs/002-core-value-objects/quickstart.md).
Resumo: `npm run lint && npm run typecheck && npm test` na raiz (backend + frontend) +
`npm run test:e2e -w backend` (sem regressão da 001) + a matriz de `TZ` (3×) do job
`timezone-matrix` da CI. Sem porta nova, sem serviço novo, sem migração.
