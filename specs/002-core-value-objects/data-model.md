# Phase 1 — Data Model: Value Objects e primitivas canônicas do `core`

Esta spec **não introduz entidade de negócio, tabela nem migração**. O `schema.prisma`
permanece baseline. O que segue são as **primitivas de domínio** do `core`, seus campos e
invariantes. Todas puras e testáveis sem banco.

---

## `Moeda` — `backend/src/core/dinheiro/moeda.ts`

Código de moeda validado. Não é entidade — é um tipo restrito.

| Aspecto | Definição |
| --- | --- |
| Tipo | `type Moeda = string & { readonly __brand: 'Moeda' }` (branded string) |
| Domínio de valores | Código alfabético de 3 letras (`A–Z`) pertencente à constante `ISO_4217` (códigos ativos da ISO 4217, tabela A.1) |
| `ISO_4217` | `readonly string[]` congelado + `ISO_4217_SET: ReadonlySet<string>` derivado. Fonte: lista publicada ISO 4217 (ativos). Inclui BRL, USD, EUR, GBP, … |
| `ehMoeda(v: unknown): v is Moeda` | `true` sse `v` é string, 3 letras após `toUpperCase()`, e ∈ `ISO_4217_SET` |
| `assertMoeda(v: unknown): asserts v is Moeda` | normaliza p/ caixa alta; se inválido → `throw new RangeError('Moeda não é ISO 4217 válida: <v>')` |
| `criarMoeda(v: string): Moeda` | `assertMoeda` + retorna o valor normalizado |

**Invariantes**
- Sempre 3 letras maiúsculas.
- `moeda` nunca é opcional em `Dinheiro`.
- Código fora da ISO 4217 → erro na construção (nunca "aceita e segue").

---

## `Dinheiro` — `backend/src/core/dinheiro/dinheiro.ts`

Value Object imutável de quantia monetária. Igualdade por valor.

| Aspecto | Definição |
| --- | --- |
| Estado | `readonly valorInt: bigint` (escala ×10000), `readonly moeda: Moeda` |
| `Dinheiro.deDecimal(texto: string, moeda: string \| Moeda): Dinheiro` | `texto` casa `^-?\d+(\.\d+)?$` e fração ≤ 4 casas; `>4` casas → `RangeError` de precisão; fração _padded_ p/ 4 dígitos; sem `parseFloat` |
| `Dinheiro.deInteiroEscalado(valorInt: bigint \| number, moeda): Dinheiro` | `number` só se `Number.isInteger`, senão `TypeError` |
| `Dinheiro.zero(moeda): Dinheiro` | `valorInt = 0n` |
| `Dinheiro.deSerializado({ valorInt: string, moeda: string }): Dinheiro` | valida `valorInt` `^-?\d+$` → `BigInt`; `assertMoeda(moeda)` |
| `somar(o: Dinheiro): Dinheiro` | exige `moeda` igual, senão `Error('moedas diferentes: BRL vs USD')` |
| `subtrair(o: Dinheiro): Dinheiro` | idem |
| `negar(): Dinheiro` | `-valorInt` |
| `multiplicarPorEscalar(fator: bigint \| number): Dinheiro` | só inteiro; não inteiro / `NaN` / `Infinity` → `TypeError` |
| `equals(o: Dinheiro \| null \| undefined): boolean` | mesmo `valorInt` **e** mesma `moeda`; moedas diferentes ou `null`/`undefined` → `false` |
| `compararCom(o: Dinheiro): -1 \| 0 \| 1` | exige mesma moeda, senão `Error`; `null`/`undefined` → `TypeError` |
| `maiorQue` / `menorQue` / `maiorOuIgual` / `menorOuIgual` | derivados de `compararCom` |
| `ehZero()` / `ehNegativo()` / `ehPositivo()` | puros sobre `valorInt` |
| `toJSON(): { valorInt: string; moeda: string }` | `valorInt` = string decimal do inteiro |
| `paraPersistencia()` | alias explícito de `toJSON` para leitura em repositório |
| `toString(): string` | forma humana `"1234.5678 BRL"` (log/debug — não é persistência) |

**Invariantes**
- Nunca há `float`/`number` fracionário no caminho do valor.
- `somar`/`subtrair`/ordem só entre a mesma `moeda`; caso contrário erro que nomeia as duas.
- Imutável: toda operação retorna nova instância; operandos inalterados.
- `deSerializado(x.toJSON())` reproduz instância igual (round-trip), inclusive negativos,
  `zero` e valores `> 2^53`.
- Sem operação de conversão de moeda; sem `dividir`; sem "somar lista" (agregação é dos
  contextos de negócio — Princípio V).

---

## `ratear` / `ratearPorPesos` — `backend/src/core/dinheiro/ratear.ts`

| Função | Assinatura | Regra |
| --- | --- | --- |
| `ratear` | `(total: Dinheiro, n: number) => Dinheiro[]` | `n` inteiro `> 0`; `base = valorInt / n` (div. inteira `bigint`), `resto = valorInt % n`; as `abs(resto)` primeiras parcelas recebem `+sign(1)` unidade da escala |
| `ratearPorPesos` | `(total: Dinheiro, pesos: number[]) => Dinheiro[]` | `pesos` inteiros `≥ 0`, soma `> 0`; quota por `floor(total*peso/soma)`; resto distribuído pelas maiores frações residuais (Hamilton / maior-resto) |

**Invariante** (ambas): `resultado.reduce(somar) === total` **exatamente**; comprimento
`= n` / `= pesos.length`; todas as parcelas na mesma `moeda` do total.

---

## `parseInstante` — `backend/src/core/tempo/parse-instante.ts`

Parser de borda tolerante. **Nunca lança.**

| Aspecto | Definição |
| --- | --- |
| Assinatura | `parseInstante(entrada: unknown): { valor: Date \| null; motivo?: string }` |
| `Date` de entrada | válido → devolve o mesmo instante; `NaN` → `{ valor: null, motivo }` |
| `number` finito | epoch. `Math.abs(n) < 1e11` ⇒ segundos (`×1000`); senão milissegundos |
| string `^-?\d+$` | tratada como epoch numérico (regra acima) |
| string ISO 8601 com offset (`Z` / `±HH:MM`) | `new Date(iso)` se válido |
| string ISO 8601 sem offset (data, ou data+hora, `T` ou espaço) | anexa `Z` → UTC; `motivo = "sem fuso — assumido UTC"` |
| string vazia / branca / não reconhecida (`dd/mm/aaaa`, `mm/dd/aaaa`, texto) | `{ valor: null, motivo: "formato não reconhecido; normalize no adapter" }` |
| `null` / `undefined` / boolean / objeto | `{ valor: null, motivo }` |

**Invariantes**
- Resultado é sempre um instante absoluto (equivalente a `timestamptz` UTC) ou `null`.
- `motivo` presente **sempre** que `valor === null` **ou** houve suposição (naive→UTC).
- Determinístico e **independente de `TZ`/locale** da máquina (provado por matriz de `TZ` no
  CI — SC-004).
- Não reconhece formatos de planilha/locale de propósito (borda fina — FR-017).

## `agoraUtc` — `backend/src/core/tempo/agora.ts`

| Aspecto | Definição |
| --- | --- |
| Assinatura | `agoraUtc(): Date` |
| Comportamento | `new Date()` — ponto único p/ carimbar `criadoEm`/`atualizadoEm` e auditoria; _fakeável_ em teste |

---

## `StatusTransacaoCanonico` — `backend/src/core/status/status-transacao.ts`

| Aspecto | Definição |
| --- | --- |
| Valores | `PENDENTE`, `PAGO`, `EM_ATRASO`, `RECUSADO`, `CANCELADO`, `ESTORNADO`, `CHARGEBACK`, `DESCONHECIDO` (enum string) |
| `STATUS_TRANSACAO_CANONICO` | array congelado, ordem canônica acima |
| `liberaAcesso(s): boolean` | `switch` exaustivo (`default: never`). `PENDENTE`/`PAGO`/`EM_ATRASO` → `true`; resto → `false` |
| `contaComoReceita(s): boolean` | só `PAGO` → `true`; resto → `false` |

Tabela-verdade (fixada em FR-021):

| status | `liberaAcesso` | `contaComoReceita` |
| --- | --- | --- |
| `PAGO` | `true` | `true` |
| `PENDENTE` | `true` | `false` |
| `EM_ATRASO` | `true` | `false` |
| `RECUSADO` | `false` | `false` |
| `CANCELADO` | `false` | `false` |
| `ESTORNADO` | `false` | `false` |
| `CHARGEBACK` | `false` | `false` |
| `DESCONHECIDO` | `false` | `false` |

**Invariante**: `EM_ATRASO` libera acesso no `core` (permissivo); a revogação por tolerância
expirada é do contexto `contratos` (spec 025). `DESCONHECIDO` nunca é ativo.

## `StatusContratoCanonico` — `backend/src/core/status/status-contrato.ts`

| Aspecto | Definição |
| --- | --- |
| Valores | `ATIVO`, `EXPIRADO`, `CANCELADO`, `DESCONHECIDO` (enum string) |
| `STATUS_CONTRATO_CANONICO` | array congelado |
| `contratoLiberaAcesso(s): boolean` | só `ATIVO` → `true`; `EXPIRADO`/`CANCELADO`/`DESCONHECIDO` → `false` |

**Invariante**: renovação/prorrogação **não** são valores deste enum (rótulo derivado do
estado de acesso na data — visão Parte 7). Janela de tolerância aplicada na leitura pelo
contexto `contratos`, não aqui.

## `paraStatusTransacaoCanonico` — `backend/src/core/status/resolver-status.ts`

| Aspecto | Definição |
| --- | --- |
| Assinatura | `paraStatusTransacaoCanonico(bruto: unknown): { status: StatusTransacaoCanonico; revisar: boolean }` |
| Valor exato do enum | `{ status: bruto, revisar: false }` |
| Qualquer outra coisa (string desconhecida, `null`, `undefined`, número, objeto) | `{ status: DESCONHECIDO, revisar: true }` |

**Invariante**: não faz `trim`/`lowercase`/sinônimo (isso é do adapter versionado por fonte).
É só a rede de segurança "nunca vira ativo por engano" (FR-023).

---

## `EntidadeAuditavel` — `backend/src/core/auditoria/entidade-auditavel.ts`

Contrato reutilizável para entidades futuras (nenhuma nesta spec).

| Campo | Tipo | Semântica |
| --- | --- | --- |
| `criadoEm` | `Date` (UTC) | definido na criação; nunca muda |
| `atualizadoEm` | `Date` (UTC) | definido na criação (= `criadoEm`); toda escrita persistida atualiza |

Exporta também `TIMESTAMPTZ_PRISMA = '@db.Timestamptz'` como lembrete de convenção para os
schemas das specs seguintes (comentário/constante de doc, não código executável de schema).

## `RegistroAuditoria` — `backend/src/core/auditoria/registro-auditoria.ts`

Forma canônica de uma mudança curada / ajuste manual. **Sem tabela nesta spec.**

| Campo | Tipo | Notas |
| --- | --- | --- |
| `autor` | `string` | quem fez (id ou identificador de serviço) |
| `quando` | `Date` (UTC) | default `agoraUtc()` |
| `entidade` | `string` | nome lógico da entidade (ex.: `"produto"`) |
| `entidadeId` | `string` | id da instância afetada |
| `campo` | `string` | campo/coluna alterada |
| `valorAnterior` | `unknown` | serializável |
| `valorNovo` | `unknown` | serializável |
| `motivo` | `string` | texto livre obrigatório |
| `origem` | `OrigemMudanca` | enum fechado |

`OrigemMudanca` = `CURADORIA` \| `AJUSTE_MANUAL` \| `MIGRACAO` (enum string; valor novo =
mudança deliberada no `core`).

`montarRegistroAuditoria(dados: Omit<RegistroAuditoria, 'quando'> & { quando?: Date }):
RegistroAuditoria` — função pura; aplica `quando ?? agoraUtc()`; valida `motivo` não vazio e
`origem` no enum; devolve o registro normalizado. Consumível pela spec 053 sem redefinição.

---

## Contrato de configuração (`core` como dono) — `backend/src/core/config/index.ts`

Não é entidade. Re-export tipado do que já existe em `backend/src/config/`:

| Export | Origem | Uso pelos contextos |
| --- | --- | --- |
| `type AppConfig` | `../../config/env.schema` | forma da config validada |
| `accountConfig(cfg, plataforma)` | `../../config/env.schema` | fatia de uma conta de origem |
| `type LeitorConfig` | novo (alias) | assinatura de `ConfigService<AppConfig, true>['get']` |

**Invariantes** (preservados da 001, FR-032)
- `.env` na raiz; `envSchema.parse` roda no boot; obrigatória ausente/vazia → processo aborta
  nomeando a chave; sem default silencioso p/ segredo ou string de conexão.
- Nenhuma chave nova de ambiente nesta spec.
- `process.env` só em `src/config/**`, `src/core/**`, `src/main.ts`, `test/**` (regra ESLint
  nova).

---

## Impacto em arquivos existentes

| Arquivo | Mudança |
| --- | --- |
| `backend/src/core/core.module.ts` | + `export * from` das novas subpastas e de `./config` |
| `backend/eslint.config.mjs` | + regra `no-restricted-syntax` barrando `process.env` fora das zonas permitidas |
| `backend/src/config/env.schema.ts` / `config.module.ts` | **inalterados** (só re-exportados pelo `core`) |
| `schema.prisma` / migrations | **inalterados** |
| `docs/002-core-value-objects.md` | novo |
| `CLAUDE.md`, `README.md`, `ROADMAP.md` | atualizados (FR-036) |
