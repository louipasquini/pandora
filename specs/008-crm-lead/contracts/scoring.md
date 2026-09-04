# Contract — `calcularScore` (domínio puro)

`src/crm/domain/lead/scoring.ts`. **Função pura, determinística, livre de locale.** Sem
banco, sem I/O. Testada exaustivamente sem Postgres (SC-001, SC-008).

```ts
export function calcularScore(estado: EstadoScoreLead): number; // inteiro em [0, 100]
```

## `EstadoScoreLead`

```ts
interface EstadoScoreLead {
  temEmail: boolean;
  temTelefone: boolean;
  temDocumento: boolean;
  temUtm: boolean;                 // qualquer utm_* não-vazio
  origem: string | null;
  estagio: 'NOVO' | 'CONTATO_FEITO' | 'QUALIFICADO' | 'NUTRICAO' | 'DESQUALIFICADO';
  criadoEm: string;               // ISO 8601; a "idade" é floor((agoraUtc() - criadoEm)/1d)
  qtdInteracoes: number;          // 0 nesta spec (interacao = spec 009)
  ultimaInteracaoEm: string | null;
  qtdTags: number;
}
```

O `agoraUtc()` é lido **dentro** de `calcularScore` (não injetado) — para teste, a matriz
`TZ` da CI garante o mesmo resultado; testes de "idade" usam `criadoEm` relativo a um
`agoraUtc` real com tolerância de faixa.

## `PESOS_SCORE_LEAD` (congelado — versionado por PR)

| Componente | Regra | Faixa |
|---|---|---|
| Completude de contato | `+12` se `temEmail`, `+8` se `temTelefone`, `+5` se `temDocumento` | 0..25 |
| Origem rastreável | `+10` se `temUtm`; senão `+4` se `origem != null` | 0..10 |
| Estágio | `NOVO 0` · `CONTATO_FEITO +10` · `QUALIFICADO +25` · `NUTRICAO +15` · `DESQUALIFICADO -20` | -20..25 |
| Engajamento | `min(qtdInteracoes, 5) * 4` + (`qtdTags >= 1 ? +5 : 0`) | 0..25 |
| Recência | `refData` = `ultimaInteracaoEm ?? criadoEm`; idade ≤3d `+15` · ≤14d `+8` · ≤30d `+3` · senão `0` | 0..15 |
| Decaimento | idade(`criadoEm`) > 30d **e** `qtdInteracoes == 0` → `-10` | -10..0 |

`score = clamp(Math.round(soma), 0, 100)`.

## Casos de teste obrigatórios

| # | Entrada | Esperado |
|---|---|---|
| 1 | dois `EstadoScoreLead` idênticos | mesmo inteiro |
| 2 | só `temEmail`, `origem`, `estagio=NOVO`, `criadoEm=agora`, sem eventos | `12 + 4 + 0 + 0 + 15 + 0 = 31` |
| 3 | caso 2 + `temTelefone` | `39` (sobe) |
| 4 | 500× a mesma entrada | 500 resultados iguais |
| 5 | `TZ=UTC` / `America/Sao_Paulo` / `Asia/Tokyo`, mesma entrada com `criadoEm` de 10 dias atrás | idêntico nos 3 |
| 6 | `estagio=DESQUALIFICADO`, sem contato, idade 60d, 0 interação | soma `-20 -10 ...` → `clamp` = `0` |
| 7 | tudo preenchido, `QUALIFICADO`, 5 interações, tag, interação hoje | soma > 100 → `clamp` = `100` |
| 8 | lead novo sem NADA além de `nome` (não deveria existir, mas a função aguenta) | inteiro ≥ 0, nunca `NaN`/`null` |

## Uso pelo serviço

`lead-score.service.recalcular(id)`:
1. carrega `lead` → monta `EstadoScoreLead` (`qtdInteracoes = 0` até a 009);
2. `novo = calcularScore(estado)`;
3. se `novo === lead.score` → **no-op** (0 auditoria);
4. senão grava `score = novo`, `score_atualizado_em = agoraUtc()` e **1** `crm_lead_audit`
   `motivo="recalculo"`, `campo="score"`, delta `[antigo, novo]`.

`recalcularLote(cursor?, tamanho=200)`: itera `lead` por `id` asc em páginas, cada página em
`$transaction`, aplica o passo acima. Idempotente — 2ª passada sem mudanças → 0 escrita.
Retomável pelo `cursor` (último `id` processado).
