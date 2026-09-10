import type { ExecutorEtapaExterno } from '../../core/core.module';
import type { EtapaCtx, Executor, ResultadoEtapa } from '../domain';

/**
 * Adapta um `ExecutorEtapaExterno` (contrato do `core`, dados planos — spec 018)
 * para o `Executor` que o `WorkerService` já sabe rodar. Mantém `ingestao` e o
 * contexto a jusante (`financeiro`…) sem se importarem: o _wrapper_ é o único
 * lugar que conhece os dois lados, e ele mora aqui (no `ingestao`, que é dono do
 * `EtapaCtx`).
 *
 * Responsabilidades do wrapper:
 *  - montar `resultados` (o `resultado` Json de cada `evento_etapa` já concluída);
 *  - chamar `ext.executar(...)` com dados planos;
 *  - mapear `SaidaEtapaExterna` → `ResultadoEtapa`.
 */
export function criarWrapperExterno(ext: ExecutorEtapaExterno): Executor {
  return async (ctx: EtapaCtx): Promise<ResultadoEtapa> => {
    const linhas = await ctx.tx.eventoEtapa.findMany({
      where: { eventoOrigemId: ctx.eventoId },
      select: { etapa: true, resultado: true },
    });
    const resultados: Record<string, unknown> = {};
    for (const l of linhas) resultados[l.etapa] = l.resultado ?? undefined;

    const saida = await ext.executar({
      eventoId: ctx.eventoId,
      plataformaOrigem: ctx.plataformaOrigem ?? '',
      idOrigem: ctx.idOrigem ?? '',
      tipoOrigem: ctx.tipoOrigem,
      canonico: ctx.canonico,
      resultados,
    });

    return {
      status: saida.status,
      resultado: saida.resultado,
      erroDetalhe: saida.erroDetalhe,
      revisar: saida.revisar,
    };
  };
}
