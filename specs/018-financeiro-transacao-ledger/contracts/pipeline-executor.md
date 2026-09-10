# Contrato — executor externo de etapa do pipeline (`core/pipeline/`)

Inversão de dependência que permite ao `financeiro` (e depois `catalogo`/`vinculo`/
`contratos`) assumir uma etapa `pulada` do pipeline da 006 **sem** que `ingestao` e
`financeiro` se importem. Precedente: `PortaIdentidade` (spec 008).

## `EventoCanonico` (movido para `core/pipeline/evento-canonico.ts`)

Schema `zod` + tipo inalterados em relação à spec 006 (só mudou de lugar).
`ingestao/domain/evento-canonico.ts` passa a ser `export * from '.../core/pipeline/evento-canonico'`.
`core.module.ts` re-exporta `eventoCanonicoSchema` e o tipo `EventoCanonico`.

## `ExecutorEtapaExterno`

```ts
export interface EntradaEtapaExterna {
  eventoId: string;
  plataformaOrigem: string;   // PlataformaOrigem
  idOrigem: string;
  tipoOrigem: string;
  canonico: EventoCanonico | null;
  /** resultado (Json) de cada etapa já concluída, por nome: { CLASSIFICAR: {...}, RESOLVER_PESSOA: {...} } */
  resultados: Record<string, unknown>;
}

export interface SaidaEtapaExterna {
  status: 'ok' | 'pulada' | 'erro';
  resultado?: unknown;        // vai para evento_etapa.resultado
  erroDetalhe?: string;
  revisar?: boolean;          // true → evento_origem.status derivado = revisar
}

export interface ExecutorEtapaExterno {
  /** valor de EtapaIngestao que este executor assume (ex.: 'RESOLVER_PESSOA'). */
  readonly etapa: string;
  executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna>;
}

/** token DI multi. Cada contexto a jusante registra 1+ executor. */
export const EXECUTORES_ETAPA_EXTERNOS = Symbol('EXECUTORES_ETAPA_EXTERNOS');
```

## Registro (`financeiro`)

```ts
// src/financeiro/financeiro-wiring.module.ts  (@Global())
providers: [
  ResolverPessoaEtapaService,
  UpsertTransacaoEtapaService,
  { provide: EXECUTORES_ETAPA_EXTERNOS, useExisting: ResolverPessoaEtapaService, multi: true },
  { provide: EXECUTORES_ETAPA_EXTERNOS, useExisting: UpsertTransacaoEtapaService, multi: true },
],
exports: [EXECUTORES_ETAPA_EXTERNOS],
```

`AppModule` importa `FinanceiroWiringModule` (depois de `FinanceiroModule`), análogo a
`ClientesWiringModule`.

## Consumo (`ingestao/application/worker.service.ts`)

```ts
constructor(
  // ...,
  @Optional() @Inject(EXECUTORES_ETAPA_EXTERNOS) externos: ExecutorEtapaExterno[] = [],
) {
  // ... registro do CLASSIFICAR e dos EXECUTORES_NOOP ...
  for (const ext of externos) {
    this.executores.set(ext.etapa as EtapaIngestao, this.criarWrapper(ext));
  }
}
```

`criarWrapper(ext)` devolve um `Executor` que:

1. monta `resultados` lendo `ctx.tx.eventoEtapa.findMany({ where: { eventoOrigemId }, select: { etapa, resultado } })` das etapas `ok`;
2. chama `ext.executar({ eventoId, plataformaOrigem, idOrigem, tipoOrigem, canonico: ctx.canonico, resultados })`;
3. mapeia `SaidaEtapaExterna` → `ResultadoEtapa` (`status`, `resultado`, `erroDetalhe`, `revisar`).

`plataformaOrigem`/`idOrigem` não estão em `EtapaCtx` hoje → o `worker.service.ts` passa a
carregá-los no `ctx` a partir do `select` do evento (`plataformaOrigem`, `idOrigem` já são
colunas de `evento_origem`). Mudança aditiva no `select` + no tipo `EtapaCtx` (campo novo
opcional para não quebrar os _noop_).

## Etapa 2 — `RESOLVER_PESSOA` (`financeiro`)

- Lê `resultados.CLASSIFICAR.classificacao`.
- `criar = classificacao !== 'VENDA_AFILIADA'`.
- `dados = { nome, documento: comprador.documentos?.[0], email: comprador.emails?.[0], telefone: comprador.telefones?.[0] }`.
- `origem = { plataformaOrigem, refs: [...emails, ...telefones, ...documentos as tipoRef/valorRef] }`.
- chama `PORTA_IDENTIDADE.resolverOuCriar(dados, { criar, origem })`.
- devolve `{ status: 'ok', resultado: { pessoaId, criada } }`.
- sem `comprador` → `resolverOuCriar` com dados vazios: se `criar` → cria `pessoa` "(sem
  nome)"? **Não** — se não há nenhuma chave (email/tel/doc) e nenhum nome, devolve
  `{ pessoaId: null }` sem criar (evita lixo). Regra: só cria quando `criar && (tem chave OU
  tem nome não vazio)`.

## Etapa 3 — `UPSERT_TRANSACAO` (`financeiro`)

- Lê `resultados.CLASSIFICAR.classificacao` e `resultados.RESOLVER_PESSOA.pessoaId`.
- `status = mapearStatus(plataformaOrigem, tipoOrigem, canonico.statusOrigem)`.
- `ocorrido = parseInstante(canonico.ocorridoEm)` → `{ instante | null, motivo }`.
- monta `DadosTransacaoNormalizada` do `canonico`.
- `precisaRevisao = status.revisar || ocorrido.instante == null`.
- upsert por `(plataformaOrigem, idOrigem)`; calcula `campos_alterados` comparando com a
  linha anterior (se houver).
- devolve `{ status: 'ok', resultado: { transacaoId, foi_criada, campos_alterados },
  revisar: precisaRevisao }`.

Erro inesperado (ex.: violação de constraint não prevista) → o executor **lança**; o worker
já trata (`erro` + `tentativas++`, retry até `INGESTAO_WORKER_MAX_TENTATIVAS`).
