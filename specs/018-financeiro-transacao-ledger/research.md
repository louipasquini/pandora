# Research — 018 · Ledger de transações do Financeiro

Decisões de projeto tomadas antes do `plan.md` (Princípio II — nenhuma marcada `⚠ clarify`;
tratadas como defaults documentados, mesmo padrão das specs 010/017).

## D-R1 — Como o `financeiro` pluga etapas no worker sem cruzar _bounded context_

**Problema.** O `WorkerService` (spec 006) vive em `src/ingestao/`. O executor real das
etapas 2–3 precisa de: (a) o tipo `EventoCanonico`, (b) `PortaIdentidade` (005), (c) Prisma,
(d) ler o resultado de `CLASSIFICAR`/`RESOLVER_PESSOA`. A regra ESLint `import/no-restricted-paths`
proíbe `src/financeiro/**` de importar `src/ingestao/**` e vice-versa.

**Alternativas consideradas.**

1. **`WorkerService.definirExecutor(...)` chamado por um wiring no `AppModule`.** O
   `AppModule` (raiz de composição) pode importar os dois contextos. Rejeitada como forma
   principal: os executores do `financeiro` ainda precisariam falar `EtapaCtx`/`Executor`
   (tipos de `ingestao/domain`) → violação ESLint no próprio `financeiro`.
2. **Mover `EtapaCtx`/`Executor`/`EventoCanonico` para `core` e um registro genérico.**
   ✅ Escolhida (ver D-R2). `EventoCanonico` já só depende de `@prisma/client` + `core.ehMoeda`
   — cabe no `core` sem ciclo. O contrato de executor externo fica minimalista (dados planos,
   sem `EtapaCtx`), e o _wrapper_ que adapta `EtapaCtx → entrada plana` mora no `ingestao`
   (que conhece `EtapaCtx`).
3. **Eventos de domínio / fila.** Descartada — over-engineering para um _monólito_ modular
   in-process; o pipeline da 006 já é síncrono e determinístico por design (gatilho
   `POST /processar`).

**Precedente.** É exatamente o padrão de `PortaIdentidade` (spec 008): interface + token no
`core`, adaptador no contexto dono, `@Global()` wiring module. A spec 013 já consolidou o
wiring de `clientes` num único `ClientesWiringModule`. `financeiro` ganha o análogo
`FinanceiroWiringModule`.

## D-R2 — Forma do contrato `core/pipeline/`

- **`EventoCanonico`** (schema `zod` + tipo) — **movido** de `ingestao/domain/evento-canonico.ts`
  para `core/pipeline/evento-canonico.ts`. `ingestao/domain/evento-canonico.ts` vira um
  re-export (`export * from '../../core/pipeline/evento-canonico'`) para não tocar os
  importadores (`worker.service.ts`, `registrar-evento.service.ts`, `classificar.ts`,
  `domain/index.ts`). `core.module.ts` re-exporta `eventoCanonicoSchema` + `EventoCanonico`.
- **`ExecutorEtapaExterno`** — interface `{ readonly etapa: string; executar(entrada:
  EntradaEtapaExterna): Promise<SaidaEtapaExterna> }`.
  - `EntradaEtapaExterna`: `{ eventoId, plataformaOrigem, idOrigem, tipoOrigem,
    canonico: EventoCanonico | null, resultados: Record<string, unknown> }` — `resultados`
    traz o `resultado` (Json) de cada etapa já concluída, por nome (`CLASSIFICAR`,
    `RESOLVER_PESSOA`).
  - `SaidaEtapaExterna`: `{ status: 'ok' | 'pulada' | 'erro'; resultado?: unknown;
    erroDetalhe?: string; revisar?: boolean }` — 1:1 com o `ResultadoEtapa` que o worker já
    entende.
- **`EXECUTORES_ETAPA_EXTERNOS`** — `Symbol` para injeção **multi**. `financeiro` registra 2
  entradas; specs 023–025 acrescentam as suas **sem** tocar o `WorkerService`.

**Mudança no `WorkerService` (mínima e prevista pela 006).** Construtor ganha
`@Optional() @Inject(EXECUTORES_ETAPA_EXTERNOS) externos: ExecutorEtapaExterno[] = []`.
Para cada externo, registra um `Executor` _wrapper_ que: (1) monta `resultados` lendo
`evento_etapa` via `ctx.tx`; (2) chama `externo.executar(...)`; (3) devolve `ResultadoEtapa`.
O _wrapper_ é registrado **depois** dos `EXECUTORES_NOOP` (sobrescreve). `worker.service.ts`
é o único arquivo de `ingestao` tocado; `plano-passada.ts`, `etapas.ts` e o schema
`evento_etapa` ficam intactos (SC-010 da 006).

## D-R3 — Chave e mutabilidade de `transacao`

- Chave natural: `@@unique([plataformaOrigem, idOrigem])`. **Sem `hash`** — `transacao` é a
  projeção normalizada (1 por venda de registro), não o evento cru (esse é `evento_origem`,
  dedup por `(plataforma, id_origem, hash)`). Re-sync/reprocessamento atualiza a mesma linha.
- Só o pipeline escreve. `criadoEm`/`atualizadoEm` padrão. Identidade
  (`plataformaOrigem`,`idOrigem`) nunca muda depois de criada.
- `pessoa_id` — FK real `onDelete: SetNull` (a pseudonimização LGPD da 047 mantém a transação).
- `oferta_id`/`contrato_id`/`transacao_vinculada_id` — `String? @db.Uuid` **sem `@relation`**.
  Justificativa: `oferta` (023) e `contrato` (025) ainda não existem; adicionar a coluna
  agora e a FK depois é `ALTER TABLE ADD CONSTRAINT` (não destrutivo). `transacao_vinculada_id`
  poderia ser self-relation já, mas a semântica ("só a Guru soma") é toda da 024 — deixar
  como coluna nua evita sugerir um comportamento que não existe.

## D-R4 — `campos_alterados` como resultado, não como coluna

A v1 pendurou `_houve_mudanca` no objeto ORM (gambiarra 4.9) e fez `commit()` no meio do
pipeline (4.10). Aqui: o executor calcula o _diff_ (campo a campo, valores normalizados),
devolve em `SaidaEtapaExterna.resultado` e o worker grava em `evento_etapa.resultado` (Json)
— que já é onde todo resultado de etapa vive. `transacao` **não** ganha coluna de "última
mudança". Consultar "o que mudou na última aplicação" = ler `evento_etapa` do evento mais
recente daquela transação (o painel de transação linka o `evento_origem_id`; o painel de
evento já mostra `resultado` por etapa desde a 006).

## D-R5 — Status canônico sem adapter

`financeiro/domain/status-map/index.ts`:

```ts
export const MAPAS_STATUS: Record<string, Record<string, Record<string, StatusTransacaoCanonico>>> = {};
// vazio na 018 — specs 019–022 adicionam status-map/{tmb,asaas,guru,hotmart}.ts

export function mapearStatus(plataforma, fonte, bruto): ResolucaoStatus {
  const exato = paraStatusTransacaoCanonico(bruto);        // core — valor canônico exato?
  if (!exato.revisar) return exato;
  const mapa = MAPAS_STATUS[plataforma]?.[fonte];
  const hit = mapa && typeof bruto === 'string' ? mapa[bruto] : undefined;
  if (hit) return { status: hit, revisar: false };
  return { status: DESCONHECIDO, revisar: true, motivo: `status bruto não catalogado: ${...}` };
}
```

`fonte` sai de `tipoOrigem` do `EventoCanonico` (ex.: `"guru.webhook"`, `"tmb.csv"`) — o
adapter é quem define esse rótulo. Enquanto não há adapter, `fonte` é o `tipoOrigem` livre e
o mapa não casa → `DESCONHECIDO`. Isso é o esperado (Assumptions da spec).

Divergência consciente da **Apêndice C** (que colocou `status_map/{plataforma}/{fonte}` sob
`ingestao/adapters/`): `financeiro` é dono de `status_canonico` e não pode importar
`ingestao`. O adapter continua dono da **extração crua** (produz `EventoCanonico.statusOrigem`
+ `tipoOrigem`); o `financeiro` é dono da **tradução canônica**. Os PRs das specs 019–022
editam `financeiro/domain/status-map/*` — arquivos pequenos, versionados, testáveis sem banco.

## D-R6 — Enum Prisma `StatusTransacaoCanonico`

O `core` já tem o enum **TypeScript** `StatusTransacaoCanonico` (8 valores) e as funções
puras `liberaAcesso`/`contaComoReceita`. O schema Prisma ganha um enum **de banco** homônimo
com os mesmos 8 valores (`PENDENTE`…`DESCONHECIDO`). A coluna `transacao.status_canonico`
usa o enum de banco; o código reidrata para o enum do `core` (mesmos literais — cast seguro,
igual ao que `worker.service.ts` já faz com `Classificacao`). Um teste unitário trava a
paridade dos dois conjuntos de valores (mesmo padrão da matriz `TZ` na CI).

## D-R7 — `GET /financeiro/transacoes` — filtros e "pago de fato"

- `pagoDeFato=true` → `where.statusCanonico IN (status onde contaComoReceita(s) === true)` —
  hoje só `PAGO`. Deriva do `core`, não hard-coded no SQL (uma lista computada de
  `STATUS_TRANSACAO_CANONICO.filter(contaComoReceita)`).
- Ordenação `ocorrido_em desc NULLS LAST` — Prisma: `orderBy: [{ ocorridoEm: { sort: 'desc',
  nulls: 'last' } }, { criadoEm: 'desc' }]`.
- Sem `payload_bruto`/`evento_canonico` na lista (só no detalhe do **evento**, via link).
- `q` busca `id_origem` (contains, case-insensitive) — não busca comprador (isso é o painel
  de Pessoas).

## D-R8 — Frontend

Módulo `frontend/src/transacoes/` espelhando `frontend/src/eventos/`:
`transacoes-api.ts` (tipos + `apiFetch`), `TransacoesListPage.tsx` (filtros + paginação),
`TransacaoDetailPage.tsx` (campos + valores por moeda + link "ver evento de origem" →
`/eventos/:eventoOrigemId`). Hooks TanStack Query **inline** (padrão desde a 011). Item de
nav **Financeiro · Transações** atrás de `transacao:ver`; rotas `/financeiro/transacoes` e
`/financeiro/transacoes/:id` sob `<RequirePermissao perm="transacao:ver">`. **0 dep nova.**

## D-R9 — Portas

Nenhuma porta nova de runtime. Backend `3001` / frontend `5174` / Postgres dev `55432`
seguem. Os e2e desta spec sobem um Postgres isolado num container próprio numa **porta
livre** (55432/55433 já em uso por outras sessões; 55434+ livre) — mesmo procedimento das
specs 010/013/017. `TEST_DATABASE_URL` apontada para ele **só na execução dos testes** (via
env do comando), sem editar o `.env` versionado.
