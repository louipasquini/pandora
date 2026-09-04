import { useQuery } from '@tanstack/react-query';
import { formatarDinheiro, pipelinesApi } from './pipelines-api';

/** Painel de métricas derivadas do pipeline (spec 010, US6/D-04). */
export function MetricasPanel({ pipelineId }: { pipelineId: string }) {
  const metricas = useQuery({
    queryKey: ['pipeline-metricas', pipelineId],
    queryFn: () => pipelinesApi.metricas(pipelineId),
  });

  if (metricas.isLoading) return <p className="text-sm text-slate-500">Carregando métricas…</p>;
  if (metricas.isError || !metricas.data) {
    return <p className="text-sm text-brand-coral">Não foi possível carregar as métricas.</p>;
  }

  const { porEtapa, taxaConversao } = metricas.data;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-sm text-slate-600">
        Taxa de conversão:{' '}
        <span className="font-semibold text-slate-800">
          {taxaConversao === null ? '—' : `${(taxaConversao * 100).toFixed(1)}%`}
        </span>
      </p>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-400">
            <th className="pb-1">Etapa</th>
            <th className="pb-1">Qtd.</th>
            <th className="pb-1">Valor</th>
            <th className="pb-1">Tempo médio</th>
          </tr>
        </thead>
        <tbody>
          {porEtapa.map((e) => (
            <tr key={e.etapaId} className="border-t border-slate-100">
              <td className="py-1.5">{e.nome}</td>
              <td className="py-1.5">{e.quantidade}</td>
              <td className="py-1.5">
                {e.valorEstimado.length === 0
                  ? '—'
                  : e.valorEstimado.map((v) => formatarDinheiro(v)).join(' + ')}
              </td>
              <td className="py-1.5">
                {e.tempoMedioHoras === null ? '—' : `${e.tempoMedioHoras.toFixed(1)}h`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
