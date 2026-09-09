import { useQuery } from '@tanstack/react-query';
import { tarefasApi } from './tarefas-api';

/** Ranking de pontos (spec 016, CL-01) — sempre derivado, nunca contador persistido. */
export function RankingPanel() {
  const ranking = useQuery({ queryKey: ['tarefas-ranking'], queryFn: () => tarefasApi.ranking() });

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-medium text-slate-700">Ranking de pontos</h2>
      <p className="mt-1 text-xs text-slate-400">
        Pontos por conclusão de tarefa, com bônus por prazo e checklist completo — mês corrente.
      </p>
      {ranking.isLoading && <p className="mt-3 text-sm text-slate-500">Carregando…</p>}
      {ranking.data && ranking.data.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">Ninguém concluiu tarefas ainda neste período.</p>
      )}
      {ranking.data && ranking.data.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1.5">
          {ranking.data.map((e, i) => (
            <li
              key={e.responsavelId}
              className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm"
            >
              <span className="text-slate-600">
                {i + 1}º · {e.responsavelId}
              </span>
              <span className="text-slate-800">
                <strong>{e.pontos}</strong> pts · {e.tarefasConcluidas} concluída(s)
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
