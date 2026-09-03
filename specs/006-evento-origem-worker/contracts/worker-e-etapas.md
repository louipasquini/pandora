# Contract — Worker, registro de etapas e `plano-passada`

## `WorkerService.processarPassada()`

```ts
type ResumoPassada = {
  selecionados: number;
  ok: number; revisar: number; erro: number; bloqueadas: number;
  duracaoMs: number;
};

processarPassada(): Promise<ResumoPassada>;
```

**Algoritmo (uma passada)**
1. Seleciona até `INGESTAO_WORKER_LOTE` (default 50) `EventoOrigem` com trabalho elegível:
   possui `EventoEtapa` em `pendente` **ou** `bloqueada` **ou** (`erro` com `tentativas <
   INGESTAO_WORKER_MAX_TENTATIVAS`). Ordem `recebidoEm asc, id asc`. `SELECT … FOR UPDATE
   SKIP LOCKED` (via `$queryRaw`) para reservar sem contenção.
2. Para cada evento (transação por evento):
   - carrega o `Map<EtapaIngestao, EventoEtapa>` do evento;
   - `planejarPassada(mapa, MAX)` → `acoes` + `statusEvento` (função pura, ver abaixo);
   - executa, **em ordem de `ETAPAS`**, cada etapa marcada `EXECUTAR`:
     - `status = processando` (sub-transação), chama `etapa.executar(ctx)`;
     - sucesso → `status = ok`, `resultado`, `executadoEm`;
     - `pulada` (retorno explícito da _no-op_) → `status = pulada`, `resultado`;
     - lançou → `status = erro`, `erroDetalhe`, `tentativas += 1`, `executadoEm`;
     - a etapa **não** faz rollback das anteriores; o loop segue para a próxima etapa
       `EXECUTAR` cuja dependência ainda esteja satisfeita (se a dependência acabou de
       falhar, a dependente será `BLOQUEADA` nesta ou na próxima passada).
   - recomputa `statusEvento` e grava em `EventoOrigem.status` (+ `classificacao`/
     `erroDetalhe` quando a etapa 1 os produziu).
3. Acumula o `ResumoPassada`.

Reentrância: um _flag_ no `scheduler` impede dois _ticks_ sobrepostos no mesmo processo; o
`SKIP LOCKED` cobre múltiplos processos. Erro não tratado numa passada é **logado**, não
derruba o processo.

**Idempotência**: etapas `ok`/`pulada` nunca reexecutam (SC-003). Rodar `processarPassada`
N vezes sobre um backlog sem falhas → estado idêntico.

---

## `WorkerScheduler` (`application/worker.scheduler.ts`)

- `OnModuleInit`: se `INGESTAO_WORKER_ENABLED` (default `true`, forçado `false` quando
  `NODE_ENV=test`), agenda `setInterval(processarPassadaGuardada, INGESTAO_WORKER_INTERVALO_MS)`
  (default 5000).
- `processarPassadaGuardada`: se já rodando, retorna; senão marca _flag_, `await
  processarPassada()`, limpa _flag_; `try/catch` loga e segue.
- `OnModuleDestroy`: `clearInterval`.
- **0 dependência** (`@nestjs/schedule` rejeitado — ver `research.md` D1).

---

## Registro `ETAPAS` (`domain/etapas.ts`)

```ts
type EtapaDef = {
  nome: EtapaIngestao;
  ordem: number;                 // 0..6
  dependeDe: EtapaIngestao[];
  especDona: number;             // nº da spec que a implementa de verdade
  executar(ctx: EtapaCtx): Promise<ResultadoEtapa>;   // ctx: { evento, canonico, prisma, logger }
};
```

| nome | ordem | dependeDe | especDona | impl. nesta spec |
|---|---|---|---|---|
| `REGISTRAR` | 0 | `[]` | 006 | feita na porta (não roda no worker) |
| `CLASSIFICAR` | 1 | `[REGISTRAR]` | 006 | **real** — `classificar()` |
| `RESOLVER_PESSOA` | 2 | `[CLASSIFICAR]` | 018 | `noop → pulada {implementadaNa:18}` |
| `UPSERT_TRANSACAO` | 3 | `[RESOLVER_PESSOA]` | 018 | `noop → pulada {18}` |
| `RESOLVER_VINCULO` | 4 | `[UPSERT_TRANSACAO]` | 024 | `noop → pulada {24}` |
| `RESOLVER_OFERTA` | 5 | `[UPSERT_TRANSACAO]` | 023 | `noop → pulada {23}` |
| `PROJETAR_CONTRATO` | 6 | `[UPSERT_TRANSACAO]` | 025 | `noop → pulada {25}` |

Uma spec futura substitui o item do array pela implementação real (mesma `nome`/`ordem`/
`dependeDe`), **sem** tocar `worker.service.ts` nem `plano-passada.ts` (US5 / SC-012).

---

## `planejarPassada` (`domain/plano-passada.ts`) — puro

```ts
type AcaoEtapa = 'EXECUTAR' | 'BLOQUEADA' | 'JA_OK' | 'ESGOTADA';

planejarPassada(
  etapasDoEvento: Map<EtapaIngestao, { status: EventoEtapaStatus; tentativas: number }>,
  max: number,
): { acoes: Map<EtapaIngestao, AcaoEtapa>; statusEvento: EventoOrigemStatus };
```

Regras (por etapa, na ordem de `ETAPAS`):
- `ok` ou `pulada` → `JA_OK`.
- `erro` com `tentativas >= max` → `ESGOTADA`.
- alguma `dependeDe` **não** em `{ok, pulada}` → `BLOQUEADA`.
- senão (`pendente` | `bloqueada` | `erro` com `tentativas < max`, deps ok) → `EXECUTAR`.

`statusEvento`:
- `erro` se existe `ESGOTADA`, ou `erro` (com tentativas < max ainda conta como "vai
  retentar" → evento fica `pendente` enquanto houver `EXECUTAR`; só vira `erro` quando não
  há mais `EXECUTAR` e sobra `ESGOTADA`/`BLOQUEADA`-por-erro);
- `revisar` se alguma etapa produziu ambiguidade (etapa 1 `revisar`) e não há `erro`;
- `ok` se todas `JA_OK`;
- `pendente` caso ainda haja `EXECUTAR`.

Testes: `plano-passada.spec.ts` cobre `BLOQUEADA` por dependência, `ESGOTADA` por tentativas,
`ok`/`revisar`/`erro` finais, e determinismo.
