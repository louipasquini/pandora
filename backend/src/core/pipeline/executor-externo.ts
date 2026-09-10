import type { EventoCanonico } from './evento-canonico';

/**
 * Contrato de **inversão de dependência** (spec 018) que deixa um _bounded
 * context_ a jusante (`financeiro` na 018; `catalogo`/`vinculo`/`contratos` nas
 * 023–025) assumir uma etapa `pulada` do pipeline de ingestão (spec 006) **sem**
 * que `ingestao` e o contexto a jusante se importem (Princípio VI).
 *
 * Fluxo: o contexto a jusante implementa `ExecutorEtapaExterno` (dados planos,
 * sem `EtapaCtx` de `ingestao`). Um módulo de composição na raiz
 * (`src/pipeline-wiring.module.ts` — fora dos dirs de contexto, logo livre da
 * regra ESLint `import/no-restricted-paths`) envolve cada executor num
 * `Executor` via `criarWrapperExterno(...)` e o registra com
 * `WorkerService.definirExecutor(...)`. O worker nunca importa
 * `src/financeiro/**`; o `financeiro` nunca importa `src/ingestao/**`.
 */

/** Entrada de um executor externo — dados planos, sem `EtapaCtx` de `ingestao`. */
export interface EntradaEtapaExterna {
  eventoId: string;
  /** valor de `PlataformaOrigem`. */
  plataformaOrigem: string;
  idOrigem: string;
  tipoOrigem: string;
  canonico: EventoCanonico | null;
  /**
   * `resultado` (Json) de cada etapa já concluída, por nome de `EtapaIngestao`:
   * `{ CLASSIFICAR: {...}, RESOLVER_PESSOA: {...} }`. Vazio se nenhuma concluiu.
   */
  resultados: Record<string, unknown>;
}

/** Saída de um executor externo — 1:1 com o `ResultadoEtapa` que o worker entende. */
export interface SaidaEtapaExterna {
  status: 'ok' | 'pulada' | 'erro';
  /** vai para `evento_etapa.resultado`. */
  resultado?: unknown;
  erroDetalhe?: string;
  /** `true` → `evento_origem.status` derivado inclui `revisar` (ambiguidade de negócio). */
  revisar?: boolean;
}

export interface ExecutorEtapaExterno {
  /** valor de `EtapaIngestao` que este executor assume (ex.: `'RESOLVER_PESSOA'`). */
  readonly etapa: string;
  executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna>;
}
