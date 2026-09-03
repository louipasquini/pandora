# Contract — `estaEmExpediente` (função pura do domínio)

`src/crm/domain/expediente.ts` — sem I/O, sem banco, sem `Date.now()` implícito, livre do
`TZ` do processo. Consumida por `ExpedienteService.consultar` (endpoint) e, no futuro, por
012 (Chat) e 014 (Workflow).

## Assinatura

```ts
interface JanelaAplic  { equipeId: string | null; diaSemana: number; inicioMin: number; fimMin: number; ativo: boolean }
interface FeriadoAplic { equipeId: string | null; mes: number; dia: number; ano: number | null; recorrenteAnual: boolean }
interface OpcoesExpediente { janelas: JanelaAplic[]; feriados: FeriadoAplic[]; equipe?: { id: string; ativo: boolean } | null }

function estaEmExpediente(instante: Date, opcoes: OpcoesExpediente): boolean
```

`inicioMin`/`fimMin` = minutos locais desde 00:00 (0–1440). `mes` 1–12, `dia` 1–31,
`diaSemana` 0–6 (0 = domingo).

## Regras

| # | Regra | CL |
|---|---|---|
| R1 | Converte `instante` → hora local **America/Sao_Paulo** via `Intl.DateTimeFormat(... timeZone:'America/Sao_Paulo', hourCycle:'h23' ...).formatToParts` | — |
| R2 | `aplicavel(x)` = `x.equipeId === null` **OU** (`opcoes.equipe?.ativo === true` **E** `x.equipeId === opcoes.equipe.id`) | CL-01 |
| R3 | Se algum `feriado` aplicável casa a data local → **`false`** (mesmo dentro de janela) | — |
| R4 | `recorrenteAnual` casa quando `mes === mesLocal && dia === diaLocal` (ignora `ano`) | CL-04 |
| R5 | Não-recorrente casa quando `mes/dia/ano` == local | — |
| R6 | 29/02 recorrente só casa em ano local bissexto — não desloca p/ 28/02 | CL-04 |
| R7 | Sem feriado bloqueando: `true` sse existe `janela` aplicável, `ativo`, `diaSemana === dowLocal`, `inicioMin <= tLocalMin < fimMin` | — |
| R8 | Início **inclusivo**, fim **exclusivo** | — |
| R9 | Zero janela aplicável → `false` (nunca "aberto por omissão") | — |
| R10 | Equipe **inativa** (`opcoes.equipe.ativo !== true`) → só entradas globais valem | CL-01 |
| R11 | Determinística: mesma entrada → mesmo resultado, sempre; nenhum efeito colateral | — |

## Tabela de casos (fixtures do `expediente.spec.ts`)

Janela global seg–sex `09:00–18:00` salvo indicação.

| instante (America/Sao_Paulo) | extra | esperado |
|---|---|---|
| qua 2026-09-09 14:00 | — | `true` |
| qua 2026-09-09 09:00:00 | — | `true` (início inclusivo) |
| qua 2026-09-09 18:00:00 | — | `false` (fim exclusivo) |
| dom 2026-09-13 14:00 | — | `false` (sem janela no domingo) |
| qua 2026-10-14 14:00 | feriado não-recorrente 2026-10-14 (global) | `false` |
| sex 2027-12-25 10:00 | feriado recorrente 25/12 cadastrado em 2026 | `false` |
| sáb 2026-09-12 10:00 | + janela da **equipe E** sáb `08:00–12:00`, E ativa, consulta com `equipe:E` | `true` |
| sáb 2026-09-12 10:00 | mesma janela da equipe E, **consulta sem equipe** | `false` |
| sáb 2026-09-12 10:00 | janela da equipe E, **E inativa** | `false` |
| qua 2028-02-29 14:00 | feriado recorrente 29/02 | `false` |
| qua 2027-02-28 14:00 | feriado recorrente 29/02 (ano não bissexto) | `true` (não desloca) |
| qua 2026-09-09 14:00 | **nenhuma** janela cadastrada | `false` |
| qualquer, `TZ=UTC` vs `TZ=Asia/Tokyo` | mesma entrada | resultado idêntico |
